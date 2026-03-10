# Electron System Tray 在 Windows 的最佳實踐

> 整理日期：2026-03-10
> 適用版本：Electron 28+（資訊以官方文件為主）

---

## 目錄

1. [Tray Icon 建立方式](#1-tray-icon-建立方式)
2. [圖示規格與 nativeImage](#2-圖示規格與-nativeimage)
3. [右鍵選單（contextMenu）建立](#3-右鍵選單contextmenu建立)
4. [雙擊 Tray Icon 顯示/隱藏視窗](#4-雙擊-tray-icon-顯示隱藏視窗)
5. [視窗關閉時隱藏到 Tray 而非退出](#5-視窗關閉時隱藏到-tray-而非退出)
6. [app.setAppUserModelId 對 Tray 和通知的影響](#6-appsetappusermodelid-對-tray-和通知的影響)
7. [app.dock 在 Windows 的差異](#7-appdock-在-windows-的差異)
8. [Tray Tooltip 設定](#8-tray-tooltip-設定)
9. [動態更新 Tray Icon 狀態](#9-動態更新-tray-icon-狀態)
10. [「退出」選單項目的正確實作](#10-退出選單項目的正確實作)
11. [已知的 Windows Tray 問題與解法](#11-已知的-windows-tray-問題與解法)
12. [完整範例整合](#12-完整範例整合)

---

## 1. Tray Icon 建立方式

### 基本建立

Tray 物件必須在 **主程序（main process）** 中建立，使用 `Tray` class 的建構子，傳入 `NativeImage` 實例或圖示檔案路徑：

```javascript
const { app, Tray } = require('electron')

// 宣告在模組層級，避免垃圾回收導致圖示消失
let tray = null

app.whenReady().then(() => {
  tray = new Tray('/path/to/icon.ico')
  tray.setToolTip('Auto Backup')
})
```

> **關鍵**：`tray` 必須宣告在模組層級（全域變數），不可在函式內部宣告。若僅在函式內宣告，Node.js 的垃圾回收機制會在事件迴圈閒置時回收該物件，導致圖示在數十秒至數分鐘後消失。

### 使用 GUID（Windows 持久位置）

Windows 支援可選的 GUID 參數，讓圖示在應用程式重新啟動後保持在通知區域的相同位置：

```javascript
const { Tray } = require('electron')

// GUID 格式：UUID 字串，通常與應用程式簽章或 exe 路徑關聯
tray = new Tray('/path/to/icon.ico', '6d8cb4d1-2a6f-4a0c-8b7e-3c4d5e6f7a8b')
```

---

## 2. 圖示規格與 nativeImage

### Windows ICO 格式（推薦）

官方文件明確指出：**「建議使用 ICO 圖示以獲得最佳視覺效果。」**

ICO 檔案可包含多種解析度，Microsoft 建議包含以下尺寸以支援各種 DPI 設定：

| 用途 | 尺寸 | DPI 縮放 |
|------|------|----------|
| 小圖示 | 16×16 | 100% |
| 小圖示 | 20×20 | 125% |
| 小圖示 | 24×24 | 150% |
| 小圖示 | 32×32 | 200% |
| 大圖示 | 32×32 | 100% |
| 大圖示 | 40×40 | 125% |
| 大圖示 | 48×48 | 150% |
| 大圖示 | 64×64 | 200% |
| 特大圖示 | 256×256 | — |

### 使用 nativeImage 建立圖示

```javascript
const { nativeImage, Tray } = require('electron')
const path = require('path')

// 方法一：直接傳入檔案路徑（推薦，最簡單）
tray = new Tray(path.join(__dirname, 'assets/icon.ico'))

// 方法二：透過 nativeImage.createFromPath
const trayIcon = nativeImage.createFromPath(
  path.join(__dirname, 'assets/icon.ico')
)
tray = new Tray(trayIcon)
```

### 重要限制：跨程序傳遞 nativeImage

nativeImage 物件在 IPC（進程間通訊）傳遞時序列化有問題，因此：

- **不可**從 renderer 程序透過 `remote` 模組傳遞 nativeImage 給主程序
- **應將**圖示路徑（字串）或 dataURL 傳遞給主程序，在主程序中建立 nativeImage

```javascript
// renderer 程序（錯誤做法 - 不要這樣）
// const img = nativeImage.createFromDataURL(canvas.toDataURL())
// tray.setImage(img) // 跨 IPC 傳遞會失敗

// renderer 程序（正確做法）
// 透過 IPC 傳送 dataURL 字串
ipcRenderer.send('update-tray-icon', canvas.toDataURL())

// 主程序
ipcMain.on('update-tray-icon', (event, dataURL) => {
  const img = nativeImage.createFromDataURL(dataURL)
  tray.setImage(img)
})
```

---

## 3. 右鍵選單（contextMenu）建立

### MenuItem 類型

Electron 支援以下 `type` 值：

| 類型 | 說明 |
|------|------|
| `normal` | 一般選單項目（預設） |
| `separator` | 分隔線 |
| `checkbox` | 可勾選項目 |
| `radio` | 單選項目 |
| `submenu` | 子選單（需搭配 `submenu` 屬性） |

### 完整 contextMenu 建立範例

```javascript
const { app, Menu, Tray, BrowserWindow } = require('electron')

function buildContextMenu(mainWindow) {
  return Menu.buildFromTemplate([
    // 標題項目（不可點擊）
    {
      label: 'Auto Backup',
      enabled: false,
    },
    { type: 'separator' },

    // 顯示/隱藏視窗
    {
      label: '顯示主視窗',
      type: 'normal',
      click: () => {
        if (mainWindow.isVisible()) {
          mainWindow.focus()
        } else {
          mainWindow.show()
        }
      },
    },
    { type: 'separator' },

    // 備份狀態（checkbox 範例）
    {
      label: '自動備份',
      type: 'checkbox',
      checked: true,
      click: (menuItem) => {
        // menuItem.checked 反映當前狀態
        console.log('自動備份：', menuItem.checked)
      },
    },
    { type: 'separator' },

    // 子選單範例
    {
      label: '備份設定',
      submenu: [
        { label: '立即備份', click: () => { /* 觸發備份 */ } },
        { label: '備份歷史', click: () => { /* 開啟記錄 */ } },
      ],
    },
    { type: 'separator' },

    // 退出（使用 app.quit 而非 win.close）
    {
      label: '退出',
      type: 'normal',
      click: () => app.quit(),
    },
  ])
}

// 設定選單
tray.setContextMenu(buildContextMenu(mainWindow))
```

### 動態更新選單項目

**Windows 和 macOS 上的靜態選單限制**：選單開啟後不會即時更新，必須呼叫 `tray.setContextMenu()` 重新設定整個選單才能看到變化：

```javascript
function updateTrayMenu(status) {
  const contextMenu = buildContextMenu(status)
  tray.setContextMenu(contextMenu)
}

// 備份狀態改變時更新選單
backupService.on('status-change', (status) => {
  updateTrayMenu(status)
})
```

---

## 4. 雙擊 Tray Icon 顯示/隱藏視窗

Windows 上 Tray 支援 `double-click` 事件，這是 Windows 用戶的常見期望行為：

```javascript
// 雙擊：顯示/隱藏視窗（Windows 推薦行為）
tray.on('double-click', () => {
  if (mainWindow.isVisible()) {
    mainWindow.hide()
  } else {
    mainWindow.show()
    mainWindow.focus()
  }
})

// 單擊：也可設定為顯示視窗（視需求而定）
tray.on('click', () => {
  if (mainWindow.isVisible()) {
    mainWindow.focus()
  } else {
    mainWindow.show()
  }
})
```

> **注意**：`isVisible()` 在視窗被遮擋（occluded）時仍回傳 `true`，只有明確呼叫 `win.hide()` 才會回傳 `false`。這與「使用者是否能看到視窗」不同，需注意。

---

## 5. 視窗關閉時隱藏到 Tray 而非退出

### 核心實作模式

```javascript
const { app, BrowserWindow, Tray, Menu } = require('electron')
const path = require('path')

let mainWindow = null
let tray = null
let isQuitting = false  // 旗標：區分「真正退出」與「隱藏到 Tray」

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,  // 初始不顯示，避免閃爍
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  mainWindow.loadFile('index.html')

  // 視窗就緒後再顯示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // 攔截關閉事件：隱藏到 Tray 而非真正關閉
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()  // 阻止視窗關閉
      mainWindow.hide()        // 隱藏到系統匣

      // 可選：隱藏時從工作列移除（僅在 Tray 模式）
      mainWindow.setSkipTaskbar(true)
    }
    // isQuitting === true 時，不呼叫 event.preventDefault()，允許真正關閉
  })
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'assets/icon.ico'))

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '顯示主視窗',
      click: () => {
        mainWindow.show()
        mainWindow.setSkipTaskbar(false)  // 重新顯示在工作列
        mainWindow.focus()
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true  // 設定旗標，允許真正退出
        app.quit()
      },
    },
  ])

  tray.setToolTip('Auto Backup')
  tray.setContextMenu(contextMenu)

  // 雙擊顯示/隱藏
  tray.on('double-click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

app.whenReady().then(() => {
  createWindow()
  createTray()
})

// 關鍵：空的 window-all-closed 監聽器，防止所有視窗關閉時 app 自動退出
// Windows 和 Linux 預設行為是所有視窗關閉時退出 app
app.on('window-all-closed', () => {
  // 不呼叫 app.quit()，讓 app 繼續在背景執行（Tray 模式）
})
```

### `event.preventDefault()` 的作用

`win.on('close', event => event.preventDefault())` 會阻止 BrowserWindow 的關閉流程，使視窗保持存在（僅隱藏）。若沒有這個防護，呼叫 `win.close()` 後視窗會被銷毀，後續就無法再 `show()`。

---

## 6. app.setAppUserModelId 對 Tray 和通知的影響

### 必要性

Windows 通知系統（Toast Notifications）需要 AppUserModelID 才能正確識別應用程式來源。若未設定，通知可能無法顯示，或顯示時會附上 exe 路徑而非應用程式名稱。

### 設定方式

```javascript
// main.js 最頂部，app.whenReady() 之前
// 開發環境：使用 process.execPath
app.setAppUserModelId(process.execPath)

// 正式環境：使用正式 app ID（通常與 package.json name 一致）
// app.setAppUserModelId('com.yourcompany.autobackup')
```

**執行時機**：必須在 `app.whenReady()` **之前**呼叫，最好放在 main.js 最頂部。

### 對 Tray Balloon 的影響

Tray 的 `displayBalloon()` 方法（Windows 專屬）顯示的泡泡通知也依賴 AppUserModelID 正確識別應用程式：

```javascript
// Windows 專屬：Balloon 通知
tray.displayBalloon({
  title: 'Auto Backup',
  content: '備份完成！',
  iconType: 'info',   // 'none' | 'info' | 'warning' | 'error' | 'custom'
  noSound: false,
})
```

### Squirrel.Windows 自動處理

使用 Squirrel.Windows（透過 electron-winstaller 或 electron-builder）打包時，Electron 會自動偵測並呼叫 `app.setAppUserModelId()`，開發者無需手動設定（但開發階段仍需手動設定）。

### 額外需求（完整 Toast 通知）

Windows 10 Toast 通知還需要：
1. 開始選單捷徑（含 AppUserModelID）
2. Toast Activator CLSID

若需要完整 Toast 支援，可考慮 [electron-windows-notifications](https://github.com/felixrieseberg/electron-windows-notifications) 套件。

---

## 7. app.dock 在 Windows 的差異

### 核心差異

| 平台 | 相當功能 | API |
|------|----------|-----|
| macOS | Dock | `app.dock` |
| Windows | 工作列（Taskbar） | `BrowserWindow.setThumbarButtons()` 等 |
| Linux | Dock（部分 DE） | 無統一 API |

**`app.dock` 在 Windows 上完全不存在**，若在 Windows 環境呼叫 `app.dock` 會拋出錯誤或回傳 `undefined`。跨平台程式碼必須做平台判斷：

```javascript
// 正確的跨平台寫法
if (process.platform === 'darwin') {
  app.dock.hide()   // 隱藏 macOS Dock 圖示
}

// Windows 沒有 dock，用 setSkipTaskbar 控制工作列
if (process.platform === 'win32') {
  mainWindow.setSkipTaskbar(true)  // 從工作列隱藏
}
```

### Windows 工作列自訂功能

Windows 提供與 Dock 不同但對等的工作列功能：

```javascript
// 縮圖工具列按鈕（最多 7 個）
mainWindow.setThumbarButtons([
  {
    tooltip: '備份',
    icon: nativeImage.createFromPath('assets/backup.ico'),
    click: () => { /* 觸發備份 */ },
  },
  {
    tooltip: '暫停',
    icon: nativeImage.createFromPath('assets/pause.ico'),
    flags: ['disabled'],
  },
])

// 工作列按鈕覆蓋圖示（顯示狀態）
mainWindow.setOverlayIcon(
  nativeImage.createFromPath('assets/badge.ico'),
  '備份中'  // 無障礙說明文字
)

// JumpList（右鍵工作列圖示選單）
app.setUserTasks([
  {
    program: process.execPath,
    arguments: '--new-backup',
    iconPath: process.execPath,
    iconIndex: 0,
    title: '立即備份',
    description: '開始新的備份作業',
  },
])
```

---

## 8. Tray Tooltip 設定

Tooltip 是滑鼠懸停在 Tray Icon 上時顯示的提示文字：

```javascript
// 基本設定
tray.setToolTip('Auto Backup')

// 動態更新 tooltip 顯示狀態資訊
function updateTooltip(status) {
  const tooltips = {
    idle:     'Auto Backup - 閒置',
    running:  'Auto Backup - 備份中...',
    error:    'Auto Backup - 發生錯誤',
    complete: 'Auto Backup - 上次備份：剛才',
  }
  tray.setToolTip(tooltips[status] || 'Auto Backup')
}
```

> **Windows 限制**：Windows 對 tooltip 文字長度有限制（約 63 個半形字元），超過會被截斷。建議保持簡潔。

---

## 9. 動態更新 Tray Icon 狀態

### 備份狀態圖示切換

```javascript
const path = require('path')
const { nativeImage } = require('electron')

// 預先載入所有狀態圖示（避免動態切換時的延遲）
const ICONS = {
  idle:     path.join(__dirname, 'assets/tray-idle.ico'),
  running:  path.join(__dirname, 'assets/tray-running.ico'),
  error:    path.join(__dirname, 'assets/tray-error.ico'),
  complete: path.join(__dirname, 'assets/tray-complete.ico'),
}

function setTrayStatus(status) {
  // 更新圖示
  tray.setImage(ICONS[status] || ICONS.idle)

  // 同步更新 tooltip
  const tooltips = {
    idle:     'Auto Backup - 就緒',
    running:  'Auto Backup - 備份中...',
    error:    'Auto Backup - 錯誤，點擊查看',
    complete: 'Auto Backup - 備份完成',
  }
  tray.setToolTip(tooltips[status] || 'Auto Backup')

  // 同步重建選單（反映最新狀態）
  tray.setContextMenu(buildContextMenu(status))
}

// 使用範例
backupService.on('start',    () => setTrayStatus('running'))
backupService.on('complete', () => setTrayStatus('complete'))
backupService.on('error',    () => setTrayStatus('error'))
backupService.on('idle',     () => setTrayStatus('idle'))
```

### 動畫圖示（模擬進度）

```javascript
let animationTimer = null
let animationFrame = 0
const ANIMATION_ICONS = [
  'assets/tray-spin-0.ico',
  'assets/tray-spin-1.ico',
  'assets/tray-spin-2.ico',
  'assets/tray-spin-3.ico',
]

function startIconAnimation() {
  stopIconAnimation()
  animationTimer = setInterval(() => {
    animationFrame = (animationFrame + 1) % ANIMATION_ICONS.length
    tray.setImage(ANIMATION_ICONS[animationFrame])
  }, 500)
}

function stopIconAnimation() {
  if (animationTimer) {
    clearInterval(animationTimer)
    animationTimer = null
    animationFrame = 0
  }
}
```

---

## 10. 「退出」選單項目的正確實作

### `app.quit()` vs `win.close()` 的差異

| 方法 | 行為 |
|------|------|
| `win.close()` | 觸發視窗的 `close` 事件，若有 `event.preventDefault()` 則只是隱藏 |
| `app.quit()` | 觸發 `before-quit` → 嘗試關閉所有視窗 → `will-quit` → 真正退出 |

### 正確的退出實作

```javascript
// 選單中的退出按鈕：必須使用 app.quit()
const contextMenu = Menu.buildFromTemplate([
  // ...其他項目...
  {
    label: '退出 Auto Backup',
    click: () => {
      isQuitting = true  // 設定旗標，讓 close 事件不攔截
      app.quit()         // 觸發完整的退出流程
    },
  },
])

// 若選單中錯誤地使用 win.close()：
// 當 close 事件有 event.preventDefault() 時，視窗只會隱藏，app 不會退出
// 這是 Bug，不是預期行為

// 正確處理 close 事件（搭配 isQuitting 旗標）
mainWindow.on('close', (event) => {
  if (!isQuitting) {
    event.preventDefault()
    mainWindow.hide()
  }
  // isQuitting === true 時不攔截，允許 app.quit() 的退出流程繼續
})

// 確保 before-quit 時設定旗標（處理系統關機等情況）
app.on('before-quit', () => {
  isQuitting = true
})
```

---

## 11. 已知的 Windows Tray 問題與解法

### 問題一：Tray 圖示因垃圾回收消失

**症狀**：圖示在啟動數十秒後自動消失。

**原因**：`tray` 變數宣告在函式內部，被 GC 回收。

**解法**：
```javascript
// 錯誤：在函式內宣告（會被 GC）
app.whenReady().then(() => {
  const tray = new Tray('icon.ico')  // ❌ 函式結束後被回收
})

// 正確：在模組層級宣告
let tray = null  // ✅ 全域參考，不會被 GC
app.whenReady().then(() => {
  tray = new Tray('icon.ico')
})
```

### 問題二：首次右鍵出現 Windows 原生選單

**症狀**：首次右鍵點擊 Tray 圖示時，Windows 系統的原生選單（如「工具列設定」）出現並覆蓋自訂選單。

**已知狀態**：此問題在 Electron GitHub Issue #10449 中被回報，已於 2018 年標記為 COMPLETED，但具體修復細節不明。

**建議做法**：
```javascript
// 使用 popUpContextMenu 替代 setContextMenu，手動控制選單觸發
tray.on('right-click', () => {
  tray.popUpContextMenu(contextMenu)
})
```

### 問題三：全螢幕應用存在時右鍵選單不顯示

**症狀**：當有全螢幕應用程式在焦點時，右鍵 Tray 圖示選單不出現。

**原因**：Windows 系統行為，全螢幕應用阻擋通知區域互動。

**目前無法完全解決**，屬於 OS 層級限制（Issue #12760）。

### 問題四：多螢幕系統選單位置異常

**症狀**：在多螢幕且第二螢幕啟用工作列時，右鍵選單位置錯誤或不顯示。

**解法**：停用第二螢幕的工作列，或使用 `popUpContextMenu()` 並指定位置：
```javascript
tray.on('right-click', (event, bounds) => {
  tray.popUpContextMenu(contextMenu, { x: bounds.x, y: bounds.y })
})
```

### 問題五：nativeImage 透過 IPC 傳遞失敗

**症狀**：從 renderer 程序使用 `remote.tray.setImage(nativeImage)` 失敗。

**原因**：nativeImage 物件無法正確序列化過 IPC。

**解法**：在主程序中處理所有圖示更新，傳送路徑字串或 dataURL 而非 nativeImage 物件（見第 2 節）。

### 問題六：show() 後圖示重回工作列

**症狀**：呼叫 `setSkipTaskbar(true)` 後，再呼叫 `win.show()` 時視窗重回工作列。

**解法**：每次 `show()` 後重新呼叫 `setSkipTaskbar(true)`：
```javascript
function showMainWindow() {
  mainWindow.show()
  mainWindow.focus()
  // 若不希望顯示在工作列，需重新設定
  // mainWindow.setSkipTaskbar(true)
}
```

### 問題七：balloon 通知音效設定無效

**症狀**：`displayBalloon({ noSound: false })` 仍無聲音，或 `noSound: true` 仍有聲音。

**原因**：此行為受 Windows 系統通知設定影響，Electron 無法完全控制（Issue #5844）。

---

## 12. 完整範例整合

以下是結合所有最佳實踐的完整 main.js 範例：

```javascript
const { app, BrowserWindow, Tray, Menu, nativeImage } = require('electron')
const path = require('path')

// 必須在 whenReady 之前設定 AppUserModelId
app.setAppUserModelId(
  process.env.NODE_ENV === 'development'
    ? process.execPath
    : 'com.yourcompany.autobackup'
)

// 模組層級變數（防止 GC）
let mainWindow = null
let tray = null
let isQuitting = false
let currentStatus = 'idle'

// 圖示路徑
const ICONS = {
  idle:    path.join(__dirname, 'assets/tray-idle.ico'),
  running: path.join(__dirname, 'assets/tray-running.ico'),
  error:   path.join(__dirname, 'assets/tray-error.ico'),
}

function buildContextMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'Auto Backup',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: currentStatus === 'running' ? '備份中...' : '顯示主視窗',
      enabled: currentStatus !== 'running',
      click: () => {
        mainWindow.show()
        mainWindow.setSkipTaskbar(false)
        mainWindow.focus()
      },
    },
    { type: 'separator' },
    {
      label: '立即備份',
      enabled: currentStatus === 'idle',
      click: () => {
        // 觸發備份邏輯
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ])
}

function setTrayStatus(status) {
  currentStatus = status
  tray.setImage(ICONS[status] || ICONS.idle)
  tray.setToolTip(
    status === 'running' ? 'Auto Backup - 備份中...' :
    status === 'error'   ? 'Auto Backup - 發生錯誤' :
    'Auto Backup'
  )
  tray.setContextMenu(buildContextMenu())
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  mainWindow.loadFile('index.html')

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // 關閉時隱藏到 Tray
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow.hide()
      mainWindow.setSkipTaskbar(true)
    }
  })
}

function createTray() {
  tray = new Tray(ICONS.idle)
  tray.setToolTip('Auto Backup')
  tray.setContextMenu(buildContextMenu())

  // 雙擊顯示/隱藏（Windows 標準行為）
  tray.on('double-click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide()
      mainWindow.setSkipTaskbar(true)
    } else {
      mainWindow.show()
      mainWindow.setSkipTaskbar(false)
      mainWindow.focus()
    }
  })
}

app.whenReady().then(() => {
  createMainWindow()
  createTray()
})

// 防止所有視窗關閉時 app 自動退出（Windows/Linux 預設行為）
app.on('window-all-closed', () => {
  // 刻意留空：讓 app 繼續在 Tray 模式執行
})

// 確保 before-quit 時設定旗標（處理系統關機）
app.on('before-quit', () => {
  isQuitting = true
})
```

---

## 來源連結

- [Electron 官方：Tray Tutorial](https://www.electronjs.org/docs/latest/tutorial/tray)
- [Electron 官方：Tray API](https://www.electronjs.org/docs/latest/api/tray)
- [Electron 官方：nativeImage API](https://www.electronjs.org/docs/latest/api/native-image)
- [Electron 官方：Notifications Tutorial](https://www.electronjs.org/docs/latest/tutorial/notifications)
- [Electron 官方：Windows Taskbar Customization](https://www.electronjs.org/docs/latest/tutorial/windows-taskbar)
- [Electron 官方：macOS Dock](https://www.electronjs.org/docs/latest/tutorial/macos-dock)
- [Menus in Electron apps (bloomca.me, 2025)](https://blog.bloomca.me/2025/07/20/menus-in-electron.html)
- [How To Minimize Electron App To System Tray (CodeSpeedy)](https://www.codespeedy.com/how-to-minimize-electron-app-to-system-tray/)
- [Minimize Electron.js Window to System Tray (prosperasoft.com)](https://prosperasoft.com/blog/full-stack/frontend/electronjs/system-tray-electron/)
- [Electron Issues: Tray setImage nativeImage on Windows (#13601)](https://github.com/electron/electron/issues/13601)
- [Electron Issues: Windows taskbar context menu on first right-click (#10449)](https://github.com/electron/electron/issues/10449)
- [Electron Issues: Context menu fullscreen (#12760)](https://github.com/electron/electron/issues/12760)
- [Electron Issues: Tray balloon noSound (#5844)](https://github.com/electron/electron/issues/5844)
- [Electron Issues: Tray garbage collection fix (#33040)](https://github.com/electron/electron/pull/33040)
- [Proper Windows Notifications on Electron (DEV Community)](https://dev.to/randomengy/proper-windows-notifications-on-electron-38jo)
