# Electron Windows 原生系統通知（Notification API）研究報告

> 研究日期：2026-03-10
> 適用版本：Electron 28+、Windows 10/11

---

## 目錄

1. [Notification API 基礎用法](#1-notification-api-基礎用法)
2. [Windows AppUserModelID 設定](#2-windows-appusermodelid-設定)
3. [通知點擊事件與開啟主視窗](#3-通知點擊事件與開啟主視窗)
4. [Windows 10/11 限制與注意事項](#4-windows-1011-限制與注意事項)
5. [通知圖示設定](#5-通知圖示設定)
6. [行動按鈕（Actions）Windows 支援狀況](#6-行動按鈕actions-windows-支援狀況)
7. [toastXml 進階用法](#7-toastxml-進階用法)
8. [通知不顯示的常見原因與除錯](#8-通知不顯示的常見原因與除錯)
9. [防重複通知策略（每次上線只發一次）](#9-防重複通知策略每次上線只發一次)
10. [第三方套件 vs 原生 Notification](#10-第三方套件-vs-原生-notification)
11. [推薦方案選擇](#11-推薦方案選擇)
12. [來源參考](#12-來源參考)

---

## 1. Notification API 基礎用法

Electron 提供兩種發送通知的方式，分別適用於不同的 process。

### 1.1 Main Process（使用 Electron Notification 模組）

```javascript
// main.js
const { Notification } = require('electron')

function showNotification(title, body) {
  const notification = new Notification({
    title,
    body,
    icon: '/path/to/icon.png', // 可選
  })

  notification.on('click', () => {
    console.log('通知被點擊')
  })

  notification.show() // 必須明確呼叫 show()，否則不會顯示
}
```

> **重要**：Main Process 使用 `Notification` 模組時，**必須呼叫 `.show()`**，否則通知不會出現。

### 1.2 Renderer Process（使用 Web Notification API）

```javascript
// renderer.js（在 BrowserWindow 的頁面內執行）
const NOTIFICATION_TITLE = '備份完成'
const NOTIFICATION_BODY = '您的手機資料已成功備份'

const notification = new window.Notification(NOTIFICATION_TITLE, {
  body: NOTIFICATION_BODY,
  icon: '/path/to/icon.png',
})

notification.onclick = () => {
  console.log('通知被點擊')
}
```

> Renderer Process 使用標準 Web API，**不需要呼叫 `.show()`**。

### 1.3 支援 `Notification.isSupported()`

```javascript
// 發送前先確認平台是否支援
if (Notification.isSupported()) {
  new Notification({ title: 'Hello' }).show()
}
```

---

## 2. Windows AppUserModelID 設定

Windows 通知系統需要應用程式有有效的 **Application User Model ID（AUMID）**，才能正確顯示通知並關聯到開始功能表捷徑。

### 2.1 為什麼需要 AppUserModelID

- Windows 透過 AUMID 識別通知來自哪個應用程式
- 沒有正確的 AUMID，通知可能根本不顯示
- 生產環境由 Squirrel.Windows 安裝程式自動設定，**開發環境需手動設定**

### 2.2 開發環境設定

```javascript
// main.js - app 'ready' 事件之前或之中設定
const { app } = require('electron')

// 開發環境：使用 electron.exe 本身的路徑
if (process.env.NODE_ENV === 'development') {
  app.setAppUserModelId(process.execPath)
}

// 生產環境：使用與 electron-builder appId 一致的值
// app.setAppUserModelId('com.yourcompany.yourapp')
```

### 2.3 與 electron-builder 整合

```json
// package.json - electron-builder 設定
{
  "build": {
    "appId": "com.yourcompany.auto-backup",
    "productName": "AutoBackup"
  }
}
```

```javascript
// main.js - 根據打包狀態自動切換
const isDev = !app.isPackaged

if (isDev) {
  app.setAppUserModelId(process.execPath)
} else {
  // electron-builder with Squirrel 會自動設定，但也可明確指定
  app.setAppUserModelId('com.yourcompany.auto-backup')
}
```

### 2.4 AUMID 格式

Squirrel 安裝的應用程式，AUMID 格式為：
```
com.squirrel.<makerConfigName>.<packageName>
```

例如：`com.squirrel.AutoBackup.AutoBackup`

---

## 3. 通知點擊事件與開啟主視窗

### 3.1 Main Process 方式（推薦）

```javascript
// main.js
const { app, BrowserWindow, Notification } = require('electron')

let mainWindow = null

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({ /* ...options */ })
})

function showNotificationAndHandleClick(title, body) {
  const notification = new Notification({ title, body })

  notification.on('click', () => {
    if (mainWindow) {
      // 如果視窗被最小化，先還原
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      // 如果視窗被隱藏（系統匣），先顯示
      if (!mainWindow.isVisible()) {
        mainWindow.show()
      }
      // 將視窗帶到前景
      mainWindow.focus()
    }
  })

  notification.show()
}
```

### 3.2 Windows 前景視窗問題與修正

Windows 有一個已知 bug：從通知啟動時，`AllowSetForegroundWindow` 可能無法正常運作，導致視窗無法成功搶到焦點。

**已知解法：切換 alwaysOnTop**

```javascript
notification.on('click', () => {
  if (mainWindow) {
    mainWindow.show()
    // Windows workaround：短暫設定 always-on-top 以確保視窗出現在前景
    mainWindow.setAlwaysOnTop(true)
    mainWindow.focus()
    mainWindow.setAlwaysOnTop(false)
  }
})
```

**另一個已知解法：發送虛擬按鍵（適用 Protocol 啟動方式）**

```javascript
// 在 requestSingleInstanceLock() 之前呼叫
import { sendDummyKeystroke } from 'windows-dummy-keystroke'
sendDummyKeystroke()
```

### 3.3 Renderer Process 方式

```javascript
// renderer.js
const notification = new window.Notification('備份完成', {
  body: '點擊查看詳細資訊',
})

notification.onclick = () => {
  // 透過 IPC 通知 main process 顯示視窗
  window.electronAPI.showMainWindow()
}
```

```javascript
// main.js - IPC handler
const { ipcMain, BrowserWindow } = require('electron')

ipcMain.on('show-main-window', () => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    win.show()
    win.focus()
  }
})
```

### 3.4 保存通知參照（防止 GC）

```javascript
// 重要：必須保存通知物件的參照，避免被垃圾回收
// 一旦被 GC，click 等事件將無法觸發

const activeNotifications = new Set()

function showNotification(title, body) {
  const notification = new Notification({ title, body })

  notification.on('click', () => {
    handleNotificationClick()
    activeNotifications.delete(notification)
  })

  notification.on('close', () => {
    activeNotifications.delete(notification)
  })

  activeNotifications.add(notification) // 保存參照
  notification.show()
}
```

---

## 4. Windows 10/11 限制與注意事項

### 4.1 通知中心（Action Center）限制

| 限制項目 | 說明 |
|---------|------|
| 通知歷史關閉後 | 使用者若關閉通知歷史，應用程式通知可能被完全封鎖 |
| 靜默模式 / 勿擾 | Windows 焦點輔助（Focus Assist）可能讓通知靜默消失 |
| 無 AUMID | 沒有正確 AppUserModelID 時，通知不顯示 |
| 開始功能表捷徑 | 通知需要應用程式在開始功能表有捷徑（含 AUMID） |

### 4.2 `windows-notification-state` 預先檢查

```javascript
// 可使用此套件提前判斷通知是否會被系統拋棄
const { getNotificationState, NotificationState } =
  require('windows-notification-state')

const state = getNotificationState()
if (state === NotificationState.QUNS_BUSY) {
  // 使用者正在全螢幕，通知會被靜默
  console.log('通知將被靜默，稍後再試')
}
```

### 4.3 Dismissal 事件限制

- Action Center 中手動關閉通知**不會觸發** `close`/`dismiss` 回呼
- 無法可靠地跨裝置同步「已讀」狀態
- `dismissed` 事件只在通知直接被用戶在彈出時關閉才可靠觸發

### 4.4 Actions（行動按鈕）

- 原生 Electron `actions` 屬性**在 Windows 上不支援**
- Windows 需要改用 `toastXml` 或第三方套件（見第 6、7 節）

---

## 5. 通知圖示設定

### 5.1 Main Process Notification

```javascript
const path = require('path')
const { app, Notification } = require('electron')

const notification = new Notification({
  title: '備份完成',
  body: '手機資料已同步',
  // 使用絕對路徑
  icon: path.join(__dirname, 'assets', 'icon.png'),
})

notification.show()
```

### 5.2 toastXml 中的圖示（需 file:/// 前綴）

```javascript
const iconPath = path.join(app.getAppPath(), 'resources', 'icon.png')
  .replace('app.asar', 'app.asar.unpacked') // asar 打包時需要解包

const toastXml = `
<toast>
  <visual>
    <binding template="ToastGeneric">
      <text>備份完成</text>
      <text>手機資料已同步</text>
      <image placement="appLogoOverride" src="file:///${iconPath.replace(/\\/g, '/')}" />
    </binding>
  </visual>
</toast>
`
```

### 5.3 圖示格式建議

- 格式：PNG（推薦）
- 尺寸：256×256 px（Windows Toast 通知顯示區域）
- 通知列圖示（小圖示）：由 AUMID 關聯的應用程式捷徑圖示決定

---

## 6. 行動按鈕（Actions）Windows 支援狀況

### 6.1 原生 Electron Actions API

```javascript
// macOS 支援，Windows 不支援
const notification = new Notification({
  title: '備份完成',
  actions: [
    { type: 'button', text: '查看檔案' },
    { type: 'button', text: '關閉' },
  ],
})

notification.on('action', (event, index) => {
  if (index === 0) openFiles()
})
```

**結論：`actions` 在 Windows 上完全無效**，必須使用 `toastXml` 或第三方套件。

### 6.2 Windows 上行動按鈕的正確做法

Windows 只支援 **Protocol 啟動類型（`activationType="protocol"`）**。

```javascript
// 使用 toastXml + protocol activation
const toastXml = `
<toast activationType="protocol" launch="myapp://clicked">
  <visual>
    <binding template="ToastGeneric">
      <text>備份完成</text>
      <text>手機資料已同步至電腦</text>
    </binding>
  </visual>
  <actions>
    <action
      content="查看備份"
      activationType="protocol"
      arguments="myapp://open-backup" />
    <action
      content="開啟設定"
      activationType="protocol"
      arguments="myapp://open-settings" />
  </actions>
</toast>
`
```

> **注意**：使用 `system` 或 `foreground` activationType 將導致按鈕點擊無效果。

---

## 7. toastXml 進階用法

### 7.1 設定 Protocol 並接收點擊

```javascript
// main.js
const { app, BrowserWindow } = require('electron')

// 1. 向 Windows 登錄自訂 Protocol
app.setAsDefaultProtocolClient('myapp')

// 2. 確保單一實例
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, commandLine) => {
    // Windows 透過 second-instance 傳遞 protocol URL
    const url = commandLine.find((arg) => arg.startsWith('myapp://'))
    if (url) handleProtocolUrl(url)

    // 將視窗帶到前景
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      win.setAlwaysOnTop(true)
      win.show()
      win.focus()
      win.setAlwaysOnTop(false)
    }
  })
}

function handleProtocolUrl(url) {
  // url = 'myapp://open-backup' 或 'myapp://open-settings'
  const action = url.replace('myapp://', '')
  console.log('通知動作:', action)
  // 根據 action 執行對應邏輯
}
```

### 7.2 使用 powertoast 生成 toastXml

[powertoast](https://github.com/xan105/node-powertoast) 是一個不依賴 native addon 的輕量工具，可以生成 toastXml 字串。

```javascript
import { toXmlString } from 'powertoast'
import { Notification } from 'electron'

const xmlString = toXmlString({
  title: '備份完成',
  message: '您的手機資料已成功備份',
  icon: `file:///C:/path/to/icon.png`,
  button: [
    { text: '查看備份', activation: 'myapp://open-backup' },
    { text: '關閉' },
  ],
})

const notification = new Notification({ toastXml: xmlString })
notification.show()
```

### 7.3 通知標籤與撤回

```javascript
// electron-windows-notifications 套件支援 tag/group 管理
const toast = new ToastNotification(xmlDocument)
toast.tag = 'backup-complete'
toast.group = 'backup'
notifier.show(toast)

// 撤回通知（從通知中心移除）
ToastNotificationManager.history.remove(
  'backup-complete',
  'backup',
  'com.yourcompany.auto-backup'
)
```

---

## 8. 通知不顯示的常見原因與除錯

### 8.1 常見原因一覽

| 原因 | 症狀 | 解法 |
|------|------|------|
| 未設定 AppUserModelID | 開發環境無通知 | `app.setAppUserModelId(process.execPath)` |
| 未呼叫 `.show()` | Main Process 無通知 | 確保呼叫 `notification.show()` |
| 通知被 GC 回收 | 事件不觸發 | 保存通知物件參照至 Set/Map |
| Windows 勿擾模式 | 通知靜默消失 | 使用 `windows-notification-state` 預查 |
| toastXml 格式錯誤 | 通知不顯示 | 逐步簡化 XML 除錯 |
| asar 內的二進位 | node-notifier 失敗 | 將 vendor/ 目錄設定為 unpacked |
| 無開始功能表捷徑 | 生產環境無通知 | 確保安裝程式建立捷徑含 AUMID |

### 8.2 開發環境快速修正清單

```javascript
// main.js - 開發環境通知除錯設定
const { app, Notification } = require('electron')

app.whenReady().then(() => {
  // 1. 設定 AppUserModelID（開發環境必做）
  if (!app.isPackaged) {
    app.setAppUserModelId(process.execPath)
  }

  // 2. 確認通知功能是否支援
  console.log('Notification supported:', Notification.isSupported())

  // 3. 測試通知
  const testNotif = new Notification({
    title: '測試通知',
    body: '如果您看到這則通知，表示設定正確',
  })
  testNotif.show()
})
```

### 8.3 開發環境替代方案

如果 `process.execPath` 方式仍無效：

1. 在 Explorer 中找到 `node_modules\electron\dist\electron.exe`
2. 右鍵 → 「釘選到開始功能表」
3. 呼叫 `app.setAppUserModelId(process.execPath)`

### 8.4 toastXml 除錯技巧

- 從最簡單的 XML 開始，逐步加入元素
- 確保所有 attribute 值已正確 XML 跳脫（特殊字元）
- 圖片路徑必須使用 `file:///` 前綴
- asar 打包時圖片路徑需替換 `app.asar` → `app.asar.unpacked`

---

## 9. 防重複通知策略（每次上線只發一次）

針對「每次裝置連線只發一次通知」的需求，結合 debounce 與 session 狀態追蹤。

### 9.1 基礎 Session 追蹤

```javascript
// notification-manager.ts
const notifiedDevices = new Set<string>()

export function notifyDeviceConnected(deviceId: string, deviceName: string): void {
  if (notifiedDevices.has(deviceId)) {
    return // 本次 session 已通知過，跳過
  }

  notifiedDevices.add(deviceId)
  sendNotification(`裝置已連線`, `${deviceName} 已連接`)
}

// 裝置斷線時重設，允許下次連線再通知
export function resetDeviceNotification(deviceId: string): void {
  notifiedDevices.delete(deviceId)
}
```

### 9.2 結合 Debounce（防止快速重連觸發多次）

```javascript
// notification-manager.ts
import { Notification } from 'electron'

type DeviceId = string

const notifiedDevices = new Set<DeviceId>()
const pendingNotifications = new Map<DeviceId, ReturnType<typeof setTimeout>>()
const activeNotifications = new Set<Notification>()

function sendNotification(title: string, body: string): void {
  const notification = new Notification({ title, body })

  notification.on('click', handleNotificationClick)
  notification.on('close', () => activeNotifications.delete(notification))

  activeNotifications.add(notification) // 防止 GC
  notification.show()
}

export function notifyDeviceConnectedDebounced(
  deviceId: DeviceId,
  deviceName: string,
  debounceMs = 2000
): void {
  // 清除同一裝置的待處理通知（重連場景）
  const existing = pendingNotifications.get(deviceId)
  if (existing) clearTimeout(existing)

  const timer = setTimeout(() => {
    pendingNotifications.delete(deviceId)

    // Session 去重：本次已通知過就跳過
    if (notifiedDevices.has(deviceId)) return

    notifiedDevices.add(deviceId)
    sendNotification('裝置已連線', `${deviceName} 已連接，準備備份`)
  }, debounceMs)

  pendingNotifications.set(deviceId, timer)
}

export function onDeviceDisconnected(deviceId: DeviceId): void {
  // 取消待處理的通知（短暫斷線不通知）
  const pending = pendingNotifications.get(deviceId)
  if (pending) {
    clearTimeout(pending)
    pendingNotifications.delete(deviceId)
  }
  // 重設 session 狀態，允許真正重連後再次通知
  notifiedDevices.delete(deviceId)
}
```

### 9.3 完整流程說明

```
裝置連線事件
    ↓
notifyDeviceConnectedDebounced(deviceId, name, 2000ms)
    ↓
等待 2000ms（防止快速重連觸發多次）
    ├─ 若 2000ms 內又斷線 → 取消通知，重設狀態
    └─ 若 2000ms 後仍連線
           ↓
        已在 notifiedDevices 中？
           ├─ 是 → 跳過（本次 session 已通知）
           └─ 否 → 發送通知 + 加入 notifiedDevices
```

---

## 10. 第三方套件 vs 原生 Notification

### 10.1 功能比較表

| 功能 | Electron 原生 | node-notifier | electron-windows-notifications | powertoast |
|------|:---:|:---:|:---:|:---:|
| 跨平台 | ✅ | ✅ | ❌ 僅 Windows | ❌ 僅 Windows |
| Windows Toast | ✅ 基礎 | ✅（balloon/toast） | ✅ 完整 WinRT | ✅ |
| 行動按鈕（Windows） | ❌ | ❌ | ✅ | ✅ |
| toastXml 支援 | ✅（v13+） | ❌ | ✅ | ✅（生成器）|
| Click 事件 | ✅ | ✅ | ✅ activated | ✅ |
| 不需 native addon | ✅ | ⚠️ 需 vendor binary | ❌ 需 NodeRT | ✅ 預設 PowerShell |
| asar 相容 | ✅ | ❌ 需 unpack | ⚠️ 需 rebuild | ✅ |
| 維護狀態（2025） | 積極維護 | 穩定但少更新 | 低活躍 | 積極維護 |
| Weekly Downloads | N/A | 5.4M+ | 67 | 較低 |

### 10.2 node-notifier 特別注意事項

```javascript
// electron-builder 設定：必須將 vendor 目錄解包
{
  "build": {
    "asarUnpack": ["node_modules/node-notifier/vendor/**"]
  }
}
```

若未設定，在 asar 打包後 `node-notifier` 會因無法執行 binary 而失敗。

### 10.3 electron-windows-notifications 用法

```javascript
const { ToastNotification } = require('electron-windows-notifications')

const notification = new ToastNotification({
  appId: 'com.yourcompany.auto-backup',
  template: `<toast>
    <visual>
      <binding template="ToastText02">
        <text id="1">%s</text>
        <text id="2">%s</text>
      </binding>
    </visual>
  </toast>`,
  strings: ['備份完成', '手機資料已同步'],
})

notification.on('activated', () => {
  console.log('用戶點擊了通知')
})

notification.on('dismissed', () => {
  console.log('通知被關閉')
})

notification.show()
```

> **注意**：從 Electron v14 起，NodeRT 模組必須在 **main process** 中 require，不可在 renderer process 使用。

---

## 11. 推薦方案選擇

### 針對本專案（auto-backup-mobile-data）的建議

**推薦：Electron 原生 Notification + toastXml（Windows 專用路徑）**

理由：
1. 本專案為純 Windows 應用（auto-backup-mobile-data spec 指定 Windows MVP）
2. 原生 Notification API 維護良好，不需額外 native addon
3. `toastXml` 支援自訂外觀與按鈕，且從 Electron v13+ 起穩定
4. 不需處理 asar unpack 問題
5. `powertoast` 可作為輔助工具生成 toastXml 字串，降低 XML 手寫複雜度

**架構建議**

```
src/main/
├── notifications/
│   ├── notification-manager.ts   # 通知生命週期管理（去重、debounce）
│   ├── toast-builder.ts          # toastXml 生成（可選用 powertoast）
│   └── protocol-handler.ts       # myapp:// protocol 事件處理
```

**決策樹**

```
需要行動按鈕？
├─ 否 → 使用 Electron 原生 new Notification({ title, body })
└─ 是 → 使用 toastXml + protocol activation
           ├─ 手寫 XML → 注意跳脫字元與路徑格式
           └─ 使用 powertoast 生成 → toXmlString() 傳入 Notification
```

---

## 12. 來源參考

- [Electron 官方 Notifications 教學](https://www.electronjs.org/docs/latest/tutorial/notifications)
- [DEV Community: Proper Windows Notifications on Electron](https://dev.to/randomengy/proper-windows-notifications-on-electron-38jo)
- [sipgate Blog: Native Windows Notifications with Action Buttons](https://www.sipgate.de/blog/how-to-create-native-notifications-with-action-buttons-on-windows-for-your-electron-app)
- [Microsoft ISE Blog: Showing Native Windows Notifications from Electron Using NodeRT](https://devblogs.microsoft.com/ise/showing-native-windows-notifications-from-electron-using-nodert/)
- [GitHub: felixrieseberg/electron-windows-notifications](https://github.com/felixrieseberg/electron-windows-notifications)
- [GitHub: felixrieseberg/electron-windows-interactive-notifications](https://github.com/felixrieseberg/electron-windows-interactive-notifications)
- [GitHub: xan105/node-powertoast](https://github.com/xan105/node-powertoast)
- [GitHub Issue #41164: Update Notifications Tutorial Notes for Windows](https://github.com/electron/electron/issues/41164)
- [GitHub Issue #39367: Notifications with toastXml don't show on Windows](https://github.com/electron/electron/issues/39367)
- [npmtrends: electron-notify vs electron-windows-notifications vs node-notifier](https://npmtrends.com/electron-notify-vs-electron-windows-notifications-vs-node-notifier-vs-node-notifier-cli)
- [blog.bloomca.me: Electron Notifications (2025)](https://blog.bloomca.me/2025/07/20/electron-notifications.html)
- [GitHub: mikaelbr/node-notifier](https://github.com/mikaelbr/node-notifier)
