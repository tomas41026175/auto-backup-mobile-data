# Electron System Tray：macOS 與 Windows 差異完整指南

## 概述

Electron 的 System Tray 在 macOS 與 Windows 上有顯著差異，涵蓋圖示格式、事件行為、選單互動方式及 App 可見度控制。本文整理官方文件與社群實踐，提供跨平台實作的完整參考。

**參考來源：**
- [Electron Tray API](https://www.electronjs.org/docs/latest/api/tray)
- [Electron nativeImage API](https://www.electronjs.org/docs/latest/api/native-image)
- [Electron Dock API](https://www.electronjs.org/docs/latest/api/dock)
- [Electron BrowserWindow API](https://www.electronjs.org/docs/latest/api/browser-window)
- [Tray Menu Tutorial](https://www.electronjs.org/docs/latest/tutorial/tray)

---

## 1. Tray Icon 格式規格

### 1.1 macOS：Template Image（黑白 + Alpha）

macOS 的 Tray icon 必須使用 **Template Image**，這是 macOS 系統專屬的 icon 機制，讓系統依照 menu bar 背景（淺色/深色）自動調整顯示。

#### 規格要求

| 屬性 | 規格 |
|------|------|
| 色彩組成 | **黑色 + Alpha 通道**（不含彩色） |
| 檔名規則 | 必須以 `Template` 結尾，例如 `iconTemplate.png` |
| 標準尺寸 | 16×16 (72dpi) |
| Retina 尺寸 | 32×32 (144dpi)，檔名加 `@2x`，例如 `iconTemplate@2x.png` |
| 平台支援 | macOS 專屬，其他平台無效 |

#### 尺寸對應

```
iconTemplate.png      → 16×16 px, 72dpi  (標準螢幕)
iconTemplate@2x.png   → 32×32 px, 144dpi (Retina / HiDPI)
```

> **重要**：`@2x` 圖片必須是 144dpi，否則 Retina 螢幕上會顯示模糊。

#### 為什麼必須是黑白

Template Image 的設計目標是讓 macOS **自動反色**：
- 淺色 menu bar → 圖示顯示為深色（黑色）
- 深色 menu bar (Dark Mode) → 圖示自動反白

若使用彩色圖示，Dark Mode 下可能不反色，造成圖示不可見（與深色背景融合）。

#### 實作方式

```typescript
import { Tray, nativeImage } from 'electron'
import path from 'path'

function createMacOSTray(): Tray {
  // 方法一：依照 macOS 命名慣例（推薦）
  // 檔名結尾為 Template，系統自動識別
  const iconPath = path.join(__dirname, 'assets', 'iconTemplate.png')
  const tray = new Tray(iconPath)

  // 方法二：透過 setTemplateImage() 標記
  const icon = nativeImage.createFromPath(
    path.join(__dirname, 'assets', 'icon.png')
  )
  icon.setTemplateImage(true)
  const tray2 = new Tray(icon)

  // 確認是否為 template image
  console.log(icon.isTemplateImage()) // true

  return tray
}
```

### 1.2 Windows：ICO 格式

Windows 的 Tray icon 使用 **ICO 格式**，一個 ICO 檔案可內嵌多種尺寸，系統依 DPI 自動選用適合的版本。

#### 規格要求

| 屬性 | 規格 |
|------|------|
| 格式 | `.ico`（推薦）或 `.png` |
| 內嵌尺寸 | 16, 20, 24, 32, 40, 48, 64, 256 px |
| Tray 使用尺寸 | 通常 16×16 或 32×32 |
| DPI 縮放 | ICO 內嵌多尺寸，系統自動選用 |
| 色彩模式 | 彩色（含 Alpha） |

> 官方文件：「It is recommended to use ICO icons to get best visual effects.」

#### Windows Dark Mode 與圖示

Windows 的 Dark Mode 處理方式不同於 macOS——不使用 Template Image，而是系統對 Notification Area 圖示進行簡單反色。因此建議：
- 使用白色圖示（深色背景良好對比）
- 或提供 light/dark 兩個版本，透過 `nativeTheme` 事件切換

```typescript
import { nativeTheme } from 'electron'

nativeTheme.on('updated', () => {
  const iconPath = nativeTheme.shouldUseDarkColors
    ? path.join(__dirname, 'assets', 'icon-dark.ico')
    : path.join(__dirname, 'assets', 'icon-light.ico')
  tray.setImage(iconPath)
})
```

---

## 2. 根據 process.platform 載入不同格式

### 基本跨平台載入模式

```typescript
import { app, Tray } from 'electron'
import path from 'path'

function getTrayIconPath(): string {
  const assetsDir = path.join(__dirname, 'assets')

  switch (process.platform) {
    case 'darwin':
      // macOS：使用 Template Image（黑白 PNG）
      return path.join(assetsDir, 'iconTemplate.png')

    case 'win32':
      // Windows：使用 ICO 格式
      return path.join(assetsDir, 'icon.ico')

    default:
      // Linux：使用 PNG（StatusNotifierItem 或 GtkStatusIcon）
      return path.join(assetsDir, 'icon.png')
  }
}

let tray: Tray | null = null

app.whenReady().then(() => {
  tray = new Tray(getTrayIconPath())
  tray.setToolTip('My Application')
})
```

### 進階：Windows GUID 設定

Windows 上若 executable 已代碼簽署，可傳入 GUID 讓 Tray icon 在重啟後維持位置：

```typescript
import { Tray } from 'electron'
import path from 'path'

function createTray(): Tray {
  const iconPath = getTrayIconPath()

  if (process.platform === 'win32') {
    // GUID 必須為 UUID 格式，每個 Tray icon 使用獨立 GUID
    return new Tray(iconPath, '6d2c4f4c-e934-4ab9-bd4c-c9a1b6d8e3f7')
  }

  return new Tray(iconPath)
}
```

---

## 3. 隱藏 App 圖示：Dock（macOS）vs Taskbar（Windows）

### 3.1 macOS：app.dock.hide()

macOS 有 Dock（下方的應用程式列），純 Tray app 需要隱藏 Dock icon：

```typescript
import { app } from 'electron'

// macOS 專屬 API
if (process.platform === 'darwin') {
  app.dock.hide()    // 隱藏 Dock icon
  // app.dock.show() // 重新顯示
  // app.dock.isVisible() // 確認狀態
}
```

**Dock API 可用方法（macOS 限定）：**

| 方法 | 說明 |
|------|------|
| `app.dock.hide()` | 隱藏 Dock icon |
| `app.dock.show()` | 顯示 Dock icon（回傳 Promise） |
| `app.dock.isVisible()` | 回傳是否可見（boolean） |
| `app.dock.bounce()` | Dock icon 彈跳通知 |
| `app.dock.setBadge(text)` | 設定 Badge 文字 |
| `app.dock.setMenu(menu)` | 設定右鍵選單 |

> **注意**：`app.dock` 屬性僅在 macOS 存在，使用前必須確認 platform。

### 3.2 Windows：setSkipTaskbar()

Windows 對應 Dock 的是 Taskbar（底部工作列）。隱藏方式是對 `BrowserWindow` 呼叫 `setSkipTaskbar()`：

```typescript
import { BrowserWindow } from 'electron'

const win = new BrowserWindow({
  width: 800,
  height: 600,
  // 也可在建立時透過 show: false 避免初始顯示
  show: false,
})

if (process.platform === 'win32') {
  win.setSkipTaskbar(true)   // 不顯示在 Taskbar
  // win.setSkipTaskbar(false) // 恢復顯示
}
```

**平台支援：**
- macOS：支援（但通常不需要，使用 `app.dock.hide()` 更合適）
- Windows：完整支援
- Linux：呼叫無效

### 3.3 跨平台完整模式

```typescript
import { app, BrowserWindow, Tray, Menu } from 'electron'
import path from 'path'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    show: false, // 初始隱藏，等 Tray 建立後再決定是否顯示
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  win.loadFile('index.html')
  return win
}

function setupTrayOnlyMode(win: BrowserWindow): void {
  // macOS：隱藏 Dock icon
  if (process.platform === 'darwin') {
    app.dock.hide()
  }

  // Windows：不顯示在 Taskbar
  if (process.platform === 'win32') {
    win.setSkipTaskbar(true)
  }
}

app.whenReady().then(() => {
  mainWindow = createWindow()
  tray = new Tray(getTrayIconPath())

  setupTrayOnlyMode(mainWindow)

  // 防止 window-all-closed 自動退出
  app.on('window-all-closed', (e: Event) => {
    e.preventDefault() // 不退出 app，繼續在 tray 執行
  })
})
```

---

## 4. Tray 事件差異：click vs double-click

### 4.1 平台預設行為差異

| 平台 | 左鍵單擊 | 左鍵雙擊 | 右鍵 |
|------|---------|---------|------|
| macOS | `click` 事件 | `double-click` 事件 | 通常顯示選單 |
| Windows | `click` 事件 | `double-click` 事件 | 顯示 context menu |
| Linux | `click`（StatusNotifierItem 規格未強制定義觸發動作） | — | — |

> macOS 使用者習慣：**左鍵單擊** → 顯示選單或切換視窗
> Windows 使用者習慣：**左鍵雙擊** → 開啟主視窗，**右鍵** → 顯示選單

### 4.2 macOS 的關鍵限制：setContextMenu 會阻擋 click 事件

這是最重要的跨平台差異之一：

> **在 macOS 上，若使用 `tray.setContextMenu()` 設定選單，`click`、`double-click`、`right-click` 事件將不會被觸發。**

這是 macOS 系統層級的限制，不是 Electron 的 bug。

```typescript
// 問題示範：macOS 上 click 事件不會觸發
tray.setContextMenu(contextMenu) // 設定後...
tray.on('click', () => {
  // macOS 上：永遠不會執行到這裡！
  mainWindow?.show()
})
```

### 4.3 解決方案：使用 popUpContextMenu()

不使用 `setContextMenu()`，改在事件處理器中手動呼叫 `popUpContextMenu()`：

```typescript
// 解決方案：不使用 setContextMenu，改用 popUpContextMenu
const contextMenu = Menu.buildFromTemplate([
  { label: '顯示主視窗', click: () => mainWindow?.show() },
  { type: 'separator' },
  { label: '退出', click: () => app.quit() },
])

// macOS：左鍵單擊 → 顯示/隱藏視窗
tray.on('click', () => {
  if (mainWindow?.isVisible()) {
    mainWindow.hide()
  } else {
    mainWindow?.show()
  }
})

// macOS：右鍵 → 顯示選單（不影響 click 事件）
tray.on('right-click', () => {
  tray.popUpContextMenu(contextMenu)
})
```

### 4.4 完整跨平台事件處理

```typescript
function setupTrayEvents(tray: Tray, win: BrowserWindow): void {
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '顯示主視窗',
      click: () => {
        win.show()
        // macOS：重新顯示 Dock icon（可選）
        if (process.platform === 'darwin') {
          app.dock.show()
        }
      },
    },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ])

  if (process.platform === 'darwin') {
    // macOS：不使用 setContextMenu（會阻擋 click 事件）
    // 左鍵單擊 → 切換視窗
    tray.on('click', () => {
      if (win.isVisible()) {
        win.hide()
        app.dock.hide()
      } else {
        win.show()
        app.dock.show()
      }
    })

    // 右鍵 → 手動顯示選單
    tray.on('right-click', () => {
      tray.popUpContextMenu(contextMenu)
    })
  } else if (process.platform === 'win32') {
    // Windows：雙擊 → 開啟主視窗（符合使用者習慣）
    tray.on('double-click', () => {
      win.show()
      win.setSkipTaskbar(false)
    })

    // Windows：右鍵選單可直接用 setContextMenu
    tray.setContextMenu(contextMenu)
  } else {
    // Linux：使用保守模式，setContextMenu 最相容
    tray.setContextMenu(contextMenu)
  }
}
```

---

## 5. macOS Context Menu 的行為差異

### 5.1 macOS 選單限制

macOS Tray 選單有額外限制（Windows 無此限制）：

> **「The `enabled` and `visibility` properties are not available for top-level menu items in the tray on macOS.」**

即 macOS Tray 頂層 MenuItem 的 `enabled` 和 `visible` 屬性無效。

```typescript
// Windows 可用，macOS 頂層項目無效
const menu = Menu.buildFromTemplate([
  {
    label: '狀態',
    enabled: false,  // macOS 頂層無效
    visible: true,   // macOS 頂層無效
  },
  {
    label: '子選單',
    submenu: [
      { label: '項目 A', enabled: false }, // 子選單層級有效
    ],
  },
])
```

### 5.2 macOS 選單更新

macOS 的 Tray 選單在 `setContextMenu()` 後不支援動態更新 MenuItem 屬性（需重新呼叫 `setContextMenu()`）。Linux 也有此限制，Windows 通常沒問題。

---

## 6. 其他平台差異整理

### 6.1 macOS 專屬功能

| 功能 | API | 說明 |
|------|-----|------|
| Status bar 標題 | `tray.setTitle(text)` | 圖示旁顯示文字（macOS 限定） |
| Drag & Drop | `drop`, `drop-files`, `drop-text` | 拖放事件 |
| Pressed image | `tray.setPressedImage(image)` | 按下時顯示不同圖示 |

### 6.2 Windows 專屬功能

| 功能 | API | 說明 |
|------|-----|------|
| Balloon 通知 | `tray.displayBalloon(options)` | 系統托盤氣球提示 |
| Middle click | `middle-click` 事件 | 滑鼠中鍵點擊 |
| GUID 持久化 | `new Tray(icon, guid)` | 維持 Tray icon 位置 |
| Balloon 事件 | `balloon-show`, `balloon-click`, `balloon-closed` | 氣球通知生命週期 |

---

## 7. 完整跨平台 Tray 實作範例

### 7.1 資源目錄結構

```
src/
  assets/
    iconTemplate.png      ← macOS（黑白 16×16）
    iconTemplate@2x.png   ← macOS Retina（黑白 32×32, 144dpi）
    icon.ico              ← Windows（內嵌多尺寸 ICO）
    icon.png              ← Linux（PNG）
```

### 7.2 完整實作

```typescript
// src/main/tray.ts
import { app, Tray, Menu, BrowserWindow, nativeTheme } from 'electron'
import path from 'path'

const ASSETS_DIR = path.join(__dirname, '..', 'assets')

function getTrayIconPath(): string {
  switch (process.platform) {
    case 'darwin':
      return path.join(ASSETS_DIR, 'iconTemplate.png')
    case 'win32':
      return path.join(ASSETS_DIR, 'icon.ico')
    default:
      return path.join(ASSETS_DIR, 'icon.png')
  }
}

function buildContextMenu(win: BrowserWindow): Menu {
  return Menu.buildFromTemplate([
    {
      label: '顯示主視窗',
      click: () => showMainWindow(win),
    },
    { type: 'separator' },
    {
      label: '關於',
      click: () => {
        // 顯示關於視窗
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
}

function showMainWindow(win: BrowserWindow): void {
  win.show()
  win.focus()

  if (process.platform === 'darwin') {
    app.dock.show()
    win.setSkipTaskbar(false)
  } else if (process.platform === 'win32') {
    win.setSkipTaskbar(false)
  }
}

function hideMainWindow(win: BrowserWindow): void {
  win.hide()

  if (process.platform === 'darwin') {
    app.dock.hide()
  } else if (process.platform === 'win32') {
    win.setSkipTaskbar(true)
  }
}

export function createTray(win: BrowserWindow): Tray {
  const tray = new Tray(getTrayIconPath())
  tray.setToolTip('Auto Backup')

  const contextMenu = buildContextMenu(win)

  if (process.platform === 'darwin') {
    // macOS：不使用 setContextMenu（避免阻擋 click 事件）
    tray.on('click', () => {
      if (win.isVisible()) {
        hideMainWindow(win)
      } else {
        showMainWindow(win)
      }
    })

    tray.on('right-click', () => {
      tray.popUpContextMenu(contextMenu)
    })
  } else if (process.platform === 'win32') {
    // Windows：雙擊開啟主視窗
    tray.on('double-click', () => {
      showMainWindow(win)
    })

    // Windows：右鍵選單
    tray.setContextMenu(contextMenu)

    // Windows Dark Mode 動態切換圖示（可選）
    nativeTheme.on('updated', () => {
      const newIconPath = getTrayIconPath() // 若有 light/dark 變體可在此切換
      tray.setImage(newIconPath)
    })
  } else {
    // Linux：保守模式
    tray.setContextMenu(contextMenu)
  }

  return tray
}
```

### 7.3 main.ts 整合

```typescript
// src/main/index.ts
import { app, BrowserWindow } from 'electron'
import { createTray } from './tray'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  win.loadFile('index.html')

  // 關閉視窗時最小化到 Tray（不退出）
  win.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault()
      hideMainWindow(win)
    }
  })

  return win
}

app.whenReady().then(() => {
  mainWindow = createWindow()
  tray = createTray(mainWindow)

  // macOS：初始隱藏 Dock（純 Tray app 模式）
  if (process.platform === 'darwin') {
    app.dock.hide()
  }

  // 防止所有視窗關閉時退出 app
  app.on('window-all-closed', (e: Event) => {
    e.preventDefault()
  })
})

app.on('before-quit', () => {
  app.isQuitting = true
})
```

---

## 8. 跨平台實作最佳模式總結

### 8.1 決策樹

```
建立 Tray
├── 圖示格式
│   ├── macOS → Template PNG（黑白 + Alpha，檔名 xxxTemplate.png）
│   ├── Windows → ICO（內嵌多尺寸）
│   └── Linux → PNG
│
├── 隱藏 App 圖示
│   ├── macOS → app.dock.hide()
│   ├── Windows → win.setSkipTaskbar(true)
│   └── Linux → 無需處理（通常無 Dock 概念）
│
└── 事件處理
    ├── macOS → 不用 setContextMenu()，用 popUpContextMenu() + 'right-click'
    ├── Windows → 可用 setContextMenu()，雙擊開啟視窗
    └── Linux → 只用 setContextMenu()（最相容）
```

### 8.2 關鍵注意事項

| 項目 | macOS | Windows |
|------|-------|---------|
| Icon 格式 | Template PNG（黑白） | ICO（多尺寸內嵌） |
| Dark Mode | 系統自動處理（Template Image） | 手動偵測 `nativeTheme` 切換 |
| 隱藏 App | `app.dock.hide()` | `win.setSkipTaskbar(true)` |
| 左鍵單擊 | `click` 事件有效 | `click` 事件有效 |
| 左鍵雙擊 | `double-click` 事件 | `double-click` 開啟視窗（使用者習慣） |
| Context Menu | **避免** `setContextMenu()`（阻擋 click） | 可安全使用 `setContextMenu()` |
| 右鍵選單 | 用 `popUpContextMenu()` | `setContextMenu()` 自動處理 |
| 頂層 MenuItem | `enabled`/`visible` 無效 | 完整支援 |
| 專屬功能 | `setTitle()`, Drag & Drop | Balloon 通知, GUID |

### 8.3 避免的常見錯誤

1. **macOS 上使用 `setContextMenu()` 後監聽 `click` 事件** → click 事件永遠不觸發
2. **macOS 圖示使用彩色 PNG 不加 Template** → Dark Mode 下圖示不可見
3. **沒有依照 `@2x` 命名** → Retina 螢幕圖示模糊
4. **在非 macOS 環境呼叫 `app.dock`** → Runtime 錯誤（屬性不存在）
5. **Windows 只用 `click` 事件（不處理雙擊）** → 不符合 Windows 使用者習慣

---

*收集日期：2026-03-10*
*Electron 版本參考：v33+（Latest Stable）*
