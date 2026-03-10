# Electron 視窗與 Dock/Taskbar 行為：macOS vs Windows 差異

> 研究日期：2026-03-10
> 適用版本：Electron 28+

---

## 目錄

1. [平台差異總覽](#1-平台差異總覽)
2. [macOS `app.dock.hide()` / `app.dock.show()`](#2-macos-appdockhide--appdockshow)
3. [視窗關閉行為差異：macOS vs Windows](#3-視窗關閉行為差異macos-vs-windows)
4. [macOS「視窗關閉後 App 仍在背景運行」模式](#4-macos視窗關閉後-app-仍在背景運行模式)
5. [`app.on('activate')` 在 macOS 的用途](#5-apponactivate-在-macos-的用途)
6. [`app.on('window-all-closed')` 的標準處理方式](#6-apponwindow-all-closed-的標準處理方式)
7. [跨平台「隱藏到 Tray」邏輯實作](#7-跨平台隱藏到-tray-邏輯實作)
8. [macOS Spaces / Mission Control 對 Electron 視窗的影響](#8-macos-spaces--mission-control-對-electron-視窗的影響)
9. [已知限制與 Gotchas](#9-已知限制與-gotchas)
10. [來源連結](#10-來源連結)

---

## 1. 平台差異總覽

| 行為 | macOS | Windows / Linux |
|------|-------|-----------------|
| 關閉最後一個視窗 | App 繼續在背景運行（Dock 仍可見） | App 結束（預設） |
| 關閉視窗快捷鍵 | `Cmd+W`（僅關閉視窗，不退出 App） | Alt+F4 / 點 X（通常結束 App） |
| 強制退出 App | `Cmd+Q` | 關閉最後一個視窗 |
| 系統通知區域位置 | 頂部 Menu Bar（右側） | 右下角 Taskbar（System Tray） |
| Dock/Taskbar API | `app.dock.*`（僅 macOS 可用） | 不適用（Windows 無對應 Electron API） |
| App Switcher | `Cmd+Tab` | `Alt+Tab` |
| 視窗停留所有工作區 | `setVisibleOnAllWorkspaces(true)` | 無效果（此 API 在 Windows 無作用） |

---

## 2. macOS `app.dock.hide()` / `app.dock.show()`

### 2.1 API 說明

`app.dock` 屬性**僅在 macOS** 上存在，用於控制應用程式在 Dock 中的行為。

```typescript
// 型別定義（macOS 限定）
app.dock?.hide()    // 隱藏 Dock 圖示
app.dock?.show()    // 顯示 Dock 圖示（非同步，回傳 Promise<void>）
app.dock?.isVisible() // 確認目前是否可見（boolean）
```

### 2.2 Dock Class 完整方法

| 方法 | 說明 |
|------|------|
| `dock.hide()` | 隱藏 Dock 圖示 |
| `dock.show()` | 顯示 Dock 圖示（回傳 `Promise<void>`） |
| `dock.isVisible()` | 回傳 Dock 圖示目前是否可見 |
| `dock.bounce([type])` | 讓 Dock 圖示彈跳，`type` 可為 `'critical'` 或 `'informational'` |
| `dock.cancelBounce(id)` | 取消彈跳動畫 |
| `dock.setBadge(text)` | 設定 Dock 圖示上的 badge 文字 |
| `dock.getBadge()` | 取得目前 badge 文字 |
| `dock.setMenu(menu)` | 設定 Dock 右鍵選單 |
| `dock.getMenu()` | 取得目前 Dock 選單 |
| `dock.setIcon(image)` | 設定 Dock 圖示圖片 |
| `dock.downloadFinished(filePath)` | 讓 Downloads 資料夾的 Stack 彈跳（適合下載完成提示） |

### 2.3 使用時機

**適合使用 `dock.hide()` 的情境：**
- 純 Tray 應用程式（如 Dropbox、Skitch）：只需 Menu Bar icon，不需要 Dock 圖示
- 當所有視窗關閉時，讓應用程式「消失」到背景
- 系統工具類 App，使用者不需要透過 Dock 互動

**適合使用 `dock.show()` 的情境：**
- 使用者開啟視窗時重新顯示 Dock 圖示
- 從「純 Tray 模式」切換回「一般模式」時

### 2.4 典型 Tray 應用程式 Dock 控制

```typescript
import { app, BrowserWindow, Tray, Menu } from 'electron'
import path from 'path'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

function createTray(): void {
  tray = new Tray(path.join(__dirname, 'icon.png'))

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '顯示視窗',
      click: () => {
        mainWindow?.show()
        // 顯示視窗時恢復 Dock 圖示（macOS）
        app.dock?.show()
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.quit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)
  tray.setToolTip('My App')
}

app.on('window-all-closed', () => {
  // macOS：隱藏 Dock 圖示，讓 App 以 Tray 模式在背景運行
  if (process.platform === 'darwin') {
    app.dock?.hide()
  } else {
    // Windows/Linux：直接退出
    app.quit()
  }
})
```

---

## 3. 視窗關閉行為差異：macOS vs Windows

### 3.1 核心差異

**macOS 慣例：**
- 點擊紅色關閉按鈕（或 `Cmd+W`）：**只關閉視窗**，App 本身繼續在 Dock 運行
- `Cmd+Q`：退出整個 App
- 使用者預期 App 仍可從 Dock 恢復

**Windows 慣例：**
- 點擊視窗 X 按鈕：**關閉視窗 + 退出 App**（尤其是最後一個視窗）
- 使用者預期關閉視窗等於結束程式

### 3.2 `close` 事件的觸發情境

```typescript
mainWindow.on('close', (event) => {
  // 此事件在以下情境觸發：
  // macOS: 點擊紅色關閉按鈕、Cmd+W
  // Windows: 點擊 X 按鈕
  // 兩者: app.quit() 被呼叫時
})
```

### 3.3 如何區分「關閉視窗」與「退出 App」（macOS）

利用 `before-quit` 事件設定 flag：

```typescript
let isQuitting = false

// 當使用者按 Cmd+Q 或程式碼呼叫 app.quit() 時觸發
app.on('before-quit', () => {
  isQuitting = true
})

mainWindow.on('close', (event) => {
  if (!isQuitting && process.platform === 'darwin') {
    // macOS 上點擊紅色按鈕：只隱藏視窗
    event.preventDefault()
    mainWindow?.hide()
  }
  // isQuitting = true 時：允許真正關閉（Cmd+Q 觸發）
})
```

> **重要限制**：目前無法透過 Electron 公開 API 區分「使用者從 Dock 右鍵選擇退出」與「Cmd+Q」——macOS 系統層級不提供此區分（Electron issue #24371，已關閉為 not planned）。

---

## 4. macOS「視窗關閉後 App 仍在背景運行」模式

這是 macOS 的標準 UX 模式，許多應用程式（如 Slack、Discord、VS Code）都採用此模式。

### 4.1 完整實作模式

```typescript
import { app, BrowserWindow } from 'electron'

let mainWindow: BrowserWindow | null = null
let isQuitting = false

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  mainWindow.loadFile('index.html')

  // 視窗關閉事件
  mainWindow.on('close', (event) => {
    if (!isQuitting && process.platform === 'darwin') {
      // macOS：隱藏視窗而非關閉，符合 macOS UX 慣例
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// 設定退出旗標
app.on('before-quit', () => {
  isQuitting = true
})

// window-all-closed：macOS 不退出 App
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// activate：點擊 Dock 圖示時，若無視窗則重新建立
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  } else {
    mainWindow?.show()
  }
})

app.whenReady().then(createWindow)
```

---

## 5. `app.on('activate')` 在 macOS 的用途

### 5.1 觸發時機

`activate` 事件在以下情況觸發（**macOS 限定**）：
- 應用程式首次啟動
- 嘗試重新啟動已在運行的應用程式
- **點擊 Dock 圖示**（最常見的使用場景）

### 5.2 `activate` vs `did-become-active` 差異

| 事件 | 觸發時機 |
|------|---------|
| `activate` | Dock 圖示點擊、應用程式啟動 |
| `did-become-active` | 每次 App 變成前景（包含 `Cmd+Tab` App Switcher 切換） |

### 5.3 標準用法

```typescript
app.on('activate', (_event, hasVisibleWindows: boolean) => {
  if (!hasVisibleWindows) {
    // 沒有可見視窗時（例如使用者之前用 Cmd+W 關閉了視窗）
    // 重新顯示或建立視窗
    if (mainWindow) {
      mainWindow.show()
    } else {
      createWindow()
    }
  }
})
```

> `hasVisibleWindows` 參數（boolean）可直接判斷是否有可見視窗，避免不必要的視窗建立。

---

## 6. `app.on('window-all-closed')` 的標準處理方式

### 6.1 macOS 標準處理

```typescript
app.on('window-all-closed', () => {
  // macOS：不退出 App——符合 macOS UX 慣例
  // App 會繼續在 Dock 運行，使用者可從 Dock 重新開啟
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
```

### 6.2 進階：搭配 Dock 隱藏

```typescript
app.on('window-all-closed', () => {
  if (process.platform === 'darwin') {
    // 選項 A：保持 Dock 圖示（標準做法，如 VS Code、Slack）
    // 不做任何事，讓 App 在 Dock 繼續顯示

    // 選項 B：隱藏 Dock 圖示（純 Tray 應用程式做法）
    // app.dock?.hide()
  } else {
    app.quit()
  }
})
```

### 6.3 事件注意事項

- 若使用者按 `Cmd+Q` 或程式碼呼叫 `app.quit()`：`window-all-closed` **不會**觸發，直接觸發 `will-quit`
- 若**未訂閱** `window-all-closed` 事件：預設行為是在所有視窗關閉後退出 App（跨平台一致）
- 訂閱此事件後，開發者自行控制是否退出

---

## 7. 跨平台「隱藏到 Tray」邏輯實作

### 7.1 isQuitting 旗標的跨平台版本

以下為完整的跨平台 Tray 應用程式實作：

```typescript
import { app, BrowserWindow, Tray, Menu, nativeImage } from 'electron'
import path from 'path'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false  // 跨平台 isQuitting 旗標

// ==============================
// 建立主視窗
// ==============================
function createWindow(): void {
  if (mainWindow) {
    mainWindow.show()
    return
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false, // 先不顯示，等載入完成後再顯示
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.loadFile('index.html')

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // ==============================
  // 視窗關閉行為（跨平台核心邏輯）
  // ==============================
  mainWindow.on('close', (event) => {
    if (isQuitting) {
      // 正在退出：允許視窗真正關閉
      return
    }

    if (process.platform === 'darwin') {
      // macOS：隱藏視窗，符合 macOS UX 慣例
      event.preventDefault()
      mainWindow?.hide()
      // 可選：同時隱藏 Dock 圖示（若為純 Tray 應用）
      // app.dock?.hide()
    } else {
      // Windows / Linux：隱藏視窗到 Tray（不退出）
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ==============================
// 建立 Tray
// ==============================
function createTray(): void {
  // macOS 使用 Template Image（會自動適應深色/淺色模式）
  // Windows 使用 ICO 格式可得到最佳效果
  const iconPath = process.platform === 'darwin'
    ? path.join(__dirname, 'assets', 'trayIconTemplate.png')
    : path.join(__dirname, 'assets', 'trayIcon.ico')

  tray = new Tray(iconPath)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '顯示視窗',
      click: () => {
        showWindow()
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

  tray.setToolTip('My App')
  tray.setContextMenu(contextMenu)

  // macOS：點擊 Tray 圖示切換視窗顯示/隱藏
  // Windows：雙擊 Tray 圖示顯示視窗（單擊通常顯示選單）
  tray.on('click', () => {
    if (process.platform !== 'darwin') return
    toggleWindow()
  })

  tray.on('double-click', () => {
    if (process.platform === 'darwin') return // macOS 由 click 處理
    showWindow()
  })
}

function showWindow(): void {
  if (!mainWindow) {
    createWindow()
    return
  }
  mainWindow.show()
  mainWindow.focus()
  // macOS：顯示視窗時恢復 Dock 圖示（若之前有隱藏）
  if (process.platform === 'darwin') {
    app.dock?.show()
  }
}

function toggleWindow(): void {
  if (mainWindow?.isVisible()) {
    mainWindow.hide()
  } else {
    showWindow()
  }
}

// ==============================
// App 生命週期
// ==============================

// 設定退出旗標（Cmd+Q 或 app.quit() 觸發）
app.on('before-quit', () => {
  isQuitting = true
})

// window-all-closed：macOS 不退出 App
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
  // macOS：什麼都不做，App 繼續在背景/Tray 運行
})

// macOS：點擊 Dock 圖示重新顯示視窗
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  } else {
    showWindow()
  }
})

app.whenReady().then(() => {
  createWindow()
  createTray()
})
```

### 7.2 平台差異對照表（Tray 行為）

| 功能 | macOS | Windows |
|------|-------|---------|
| Tray 位置 | 頂部 Menu Bar | 右下角 System Tray |
| 圖示格式 | Template PNG（@2x 支援） | ICO（建議） |
| 單擊 Tray 圖示 | 顯示/隱藏視窗 | 顯示右鍵選單（或無動作） |
| 雙擊 Tray 圖示 | 不適用（`setIgnoreDoubleClickEvents`） | 顯示視窗 |
| `setTitle()` | 支援（顯示文字在圖示旁） | 不支援 |
| `displayBalloon()` | 不支援 | 支援（Windows 通知氣泡） |
| `mouse-up` / `mouse-down` | 支援 | 不支援 |
| `middle-click` | 不支援 | 支援 |

### 7.3 防止 Tray 被垃圾回收

```typescript
// 錯誤：tray 為局部變數，函式結束後可能被 GC
function createTray() {
  const tray = new Tray(iconPath) // 會消失！
}

// 正確：宣告為模組層級變數
let tray: Tray | null = null

function createTray() {
  tray = new Tray(iconPath) // 持久存活
}
```

---

## 8. macOS Spaces / Mission Control 對 Electron 視窗的影響

### 8.1 相關 API

#### `setVisibleOnAllWorkspaces(visible, options?)`

讓視窗在所有 macOS Spaces（工作區）中都可見：

```typescript
// 讓視窗出現在所有 Spaces
mainWindow.setVisibleOnAllWorkspaces(true, {
  visibleOnFullScreen: true,  // 即使在全螢幕 App 上也顯示
  skipTransformProcessType: false, // 設為 true 可避免短暫隱藏（進階用途）
})

// 確認目前狀態
console.log(mainWindow.isVisibleOnAllWorkspaces()) // boolean
```

> **注意**：`setVisibleOnAllWorkspaces()` 在 Windows 上**無效果**，API 呼叫會被忽略。

#### `setHiddenInMissionControl(hidden)` / `isHiddenInMissionControl()`

控制視窗是否在 Mission Control 中隱藏（Electron 23+ / PR #36092，2022 年合併）：

```typescript
// 建立時設定
const helperWindow = new BrowserWindow({
  hiddenInMissionControl: true, // 在 Mission Control 中不顯示
})

// 執行時切換
helperWindow.setHiddenInMissionControl(true)
console.log(helperWindow.isHiddenInMissionControl()) // true
```

**適合隱藏於 Mission Control 的視窗類型：**
- 全螢幕覆蓋層（overlay）
- 小型輔助視窗（helper windows）
- 對話框（dialogs）

### 8.2 NSWindowCollectionBehavior 對應

Electron 的這些 API 底層對應 macOS 的 `NSWindowCollectionBehavior`：

| Electron API | 對應 NSWindowCollectionBehavior |
|-------------|--------------------------------|
| `setVisibleOnAllWorkspaces(true)` | `.canJoinAllSpaces` |
| `setHiddenInMissionControl(true)` | `.transient`（浮動於 Spaces，在 Mission Control 中隱藏） |
| `setAlwaysOnTop(true)` | `.stationary` 相關 |

### 8.3 已知問題

**白色閃爍（White Flicker）：**
在 Electron v5.0.0+ 有回報在 Mission Control 轉場和工作區切換時出現白色閃爍（issue #17942）。

**`setVisibleOnAllWorkspaces` 與 `window.show()` 的衝突：**
呼叫 `setVisibleOnAllWorkspaces(true)` 後，`window.show()` 仍可能切換到視窗最初建立的桌面，而非停留在目前桌面。需要手動移動視窗一次才能解決。

**`skipTransformProcessType` 的影響：**
呼叫 `setVisibleOnAllWorkspaces()` 預設會短暫隱藏視窗和 Dock（進行 process type 轉換）。若 App 已是 `UIElementApplication` 類型，可傳入 `skipTransformProcessType: true` 跳過此步驟。

---

## 9. 已知限制與 Gotchas

### 9.1 `app.dock.hide()` 的副作用

| 副作用 | 說明 |
|--------|------|
| 從 `Cmd+Tab` App Switcher 消失 | macOS 系統層級限制，無法繞過（issue #6283） |
| `app.dock.hide()` 與 `app.hide()` 無法同時使用 | 兩者衝突，會造成無法預期的行為（issue #16093） |
| Tray Tooltip 可能無法顯示 | 當 Dock 圖示隱藏時，Tray icon tooltip 有時不顯示（issue #3599） |
| Badge 設定失效 | `dock.hide()` 後再 `dock.show()` 可能造成 badge 無視覺效果（issue #12529） |

### 9.2 無法區分 Dock 退出 vs Cmd+Q

從 Dock 右鍵選單選擇「退出」與按 `Cmd+Q` 都會觸發相同的事件序列，macOS 系統不提供區分方式（Electron issue #24371，已關閉為 not planned）。

### 9.3 `app.on('before-quit')` 的觸發條件

```
Cmd+Q 觸發的事件序列：
before-quit → (close 事件 for each window) → will-quit → quit

直接呼叫 app.quit() 的事件序列：
before-quit → (close 事件 for each window) → will-quit → quit

注意：若 Cmd+Q 觸發，window-all-closed 不會觸發！
```

### 9.4 Windows 特有注意事項

- Windows 系統關機/重啟/使用者登出時，`before-quit`、`will-quit`、`quit` 事件**不會**觸發
- Tray 圖示在 Windows 上持續顯示在 Taskbar，macOS 則顯示在 Menu Bar
- Windows 的 `displayBalloon()` 可顯示氣泡通知，macOS 需使用 `Notification` API

---

## 10. 來源連結

### 官方文件
- [Electron Dock Class API](https://www.electronjs.org/docs/latest/api/dock) - Dock 完整 API 文件
- [Electron macOS Dock Tutorial](https://www.electronjs.org/docs/latest/tutorial/macos-dock) - macOS Dock 使用教學
- [Electron App API](https://www.electronjs.org/docs/latest/api/app) - `window-all-closed`、`activate`、`before-quit` 等事件說明
- [Electron BrowserWindow API](https://www.electronjs.org/docs/latest/api/browser-window) - 視窗控制方法
- [Electron BaseWindow API](https://www.electronjs.org/docs/latest/api/base-window) - `setVisibleOnAllWorkspaces`、`setHiddenInMissionControl`
- [Electron Tray API](https://www.electronjs.org/docs/latest/api/tray) - Tray 完整 API（含平台差異）

### GitHub Issues / PRs
- [feat: Add BrowserWindow option to hide window in Mission Control (PR #36092)](https://github.com/electron/electron/pull/36092) - `hiddenInMissionControl` 功能介紹
- [Hiding dock icon prevents app from appearing in app switcher (#6283)](https://github.com/electron/electron/issues/6283) - Dock 隱藏的副作用
- [macOS: ability to determine when app is being quit from Dock icon (#24371)](https://github.com/electron/electron/issues/24371) - 無法區分 Dock 退出 vs Cmd+Q 的限制
- [How to distinguish between page closing and dock exit in macOS (#25680)](https://github.com/electron/electron/issues/25680) - 視窗關閉 vs App 退出區分方案
- [app.dock.hide() and app.hide() cannot be used together (#16093)](https://github.com/electron/electron/issues/16093) - 兩個 API 的衝突問題
- [setVisibleOnAllWorkspaces known issues (#36364)](https://github.com/electron/electron/issues/36364) - `setAlwaysOnTop` 與 `setVisibleOnAllWorkspaces` 的問題

### 社群資源
- [3 Things Web Developers Should Know When Building Electron Apps](https://t4t5.com/3-things-web-developers-should-know-when-building-electron-apps/) - macOS vs Windows 行為差異概述
- [How to deal with Electron.js's Tray on Windows (Medium)](https://medium.com/@onuraltuntasbusiness_99398/how-to-deal-with-electronjss-tray-on-windows-f9e5ac8b4c63) - Windows Tray 處理技巧
- [Apple NSWindowCollectionBehavior Documentation](https://developer.apple.com/documentation/appkit/nswindow/collectionbehavior-swift.struct) - 底層 macOS API 參考
