# Electron Notification API：macOS vs Windows 差異研究

> 建立日期：2026-03-10
> 資料來源：Electron 官方文件、GitHub Issues、技術部落格

---

## 目錄

1. [API 基礎架構](#1-api-基礎架構)
2. [Windows 專用設定](#2-windows-專用設定)
3. [macOS 專用設定](#3-macos-專用設定)
4. [通知點擊事件可靠性](#4-通知點擊事件可靠性)
5. [macOS 通知權限請求](#5-macos-通知權限請求)
6. [Tray-only App 的通知行為](#6-tray-only-app-的通知行為)
7. [通知中心 UX 差異](#7-通知中心-ux-差異)
8. [跨平台統一實作模式](#8-跨平台統一實作模式)
9. [process.platform === 'darwin' 時應跳過的設定](#9-processplatform--darwin-時應跳過的設定)
10. [快速對照表](#10-快速對照表)

---

## 1. API 基礎架構

Electron 的 `Notification` 類別在 **main process** 使用，呼叫 OS 原生通知 API。Renderer process 則可使用 Web 標準的 `new Notification()`（但功能受限）。

### 主要流程

```typescript
// main process（推薦）
import { Notification } from 'electron'

const notification = new Notification({
  title: '備份完成',
  body: '已成功備份 42 個檔案',
})
notification.show()
```

### 跨平台共用屬性

| 屬性 | 說明 |
|------|------|
| `title` | 通知標題 |
| `body` | 通知內文 |
| `icon` | 圖示（路徑或 NativeImage） |
| `silent` | 是否靜音 |

### 跨平台共用事件

| 事件 | 說明 |
|------|------|
| `show` | 通知顯示時觸發 |
| `click` | 使用者點擊通知時觸發 |
| `close` | 通知關閉時觸發（Windows 含 reason） |
| `reply` | 使用者提交 inline reply 時觸發（macOS / Windows） |
| `action` | 使用者點擊 action button 時觸發（macOS / Windows） |

---

## 2. Windows 專用設定

### 2.1 AppUserModelId（必要）

Windows 通知要求 App 具有 **AppUserModelID**，以便將通知對應至 Start Menu 捷徑。

**開發階段設定：**

```typescript
// main.ts — 開發環境使用 execPath 作為 ID
if (process.platform === 'win32') {
  app.setAppUserModelId(process.execPath)
}
```

**生產環境：**
使用 Squirrel installer 時，Electron 會自動呼叫 `setAppUserModelId`。使用其他 installer（如 NSIS）需手動設定正確的 App ID：

```typescript
if (process.platform === 'win32') {
  app.setAppUserModelId('com.yourcompany.yourapp')
}
```

> 若未設定 AppUserModelId，通知欄位可能顯示 `process.execPath` 路徑而非 App 名稱。

### 2.2 ToastXml（進階自訂）

Windows 支援使用 **Toast XML** 定義完整的通知內容，可超越基本屬性限制（支援圖片、按鈕、輸入欄位等）。

```typescript
const toastXml = `
<toast>
  <visual>
    <binding template="ToastGeneric">
      <text>備份完成</text>
      <text>已成功備份 42 個檔案</text>
    </binding>
  </visual>
  <actions>
    <action content="查看詳情" activationType="protocol" arguments="myapp://open-backup-log"/>
    <action content="關閉" activationType="system" arguments="dismiss"/>
  </actions>
</toast>
`

if (process.platform === 'win32') {
  const notification = new Notification({ toastXml })
  notification.show()
}
```

> `toastXml` 屬性會**覆蓋**所有其他屬性（title、body、icon 等）。XML schema 參考：[Microsoft Toast Content](https://learn.microsoft.com/en-us/windows/apps/design/shell/tiles-and-notifications/adaptive-interactive-toasts)

### 2.3 Windows Action Center 行為

- 通知在 **Action Center** 中持久保存，直到使用者手動清除
- `close` 事件包含 `reason` 參數：
  - `'userCanceled'`：使用者主動關閉
  - `'applicationHidden'`：App 收回通知
  - `'timedOut'`：通知自動逾時
- 呼叫 `notification.close()` 後，再次觸發的 `close` 事件**不會**重新發送

### 2.4 Action Button 啟動方式

Windows 的 action button 點擊只支援 **protocol-based** 啟動：

```typescript
// 1. 註冊自訂 protocol
app.setAsDefaultProtocolClient('myapp')

// 2. 監聽 open-url 事件（macOS）或 second-instance（Windows）
app.on('open-url', (event, url) => {
  // 解析 url 並執行對應操作
})

// Windows 需要 single instance lock
const gotLock = app.requestSingleInstanceLock()
app.on('second-instance', (event, commandLine) => {
  const url = commandLine.find(arg => arg.startsWith('myapp://'))
  // 處理 protocol URL
})
```

### 2.5 Windows 專用套件（可選）

若需要更進階的 Windows 通知功能：

- [`electron-windows-notifications`](https://github.com/felixrieseberg/electron-windows-notifications) — 完整 WinRT 通知支援
- [`electron-windows-interactive-notifications`](https://github.com/felixrieseberg/electron-windows-interactive-notifications) — 支援 COM component 互動式通知

---

## 3. macOS 專用設定

### 3.1 macOS 專用屬性

| 屬性 | 型別 | 說明 |
|------|------|------|
| `subtitle` | string | 副標題（顯示於標題下方） |
| `hasReply` | boolean | 啟用 inline reply 欄位 |
| `replyPlaceholder` | string | Reply 欄位的提示文字 |
| `sound` | string | 播放的音效名稱 |
| `actions` | NotificationAction[] | Action buttons |
| `closeButtonText` | string | 自訂關閉按鈕文字 |

```typescript
if (process.platform === 'darwin') {
  const notification = new Notification({
    title: '備份完成',
    subtitle: 'iPhone 14 Pro',
    body: '已成功備份 42 個檔案',
    sound: 'Glass',
    hasReply: false,
    actions: [
      { type: 'button', text: '查看詳情' }
    ],
  })
  notification.show()
}
```

### 3.2 macOS Action Button 要求

macOS 的 `actions` 屬性要求 `Info.plist` 設定：

```xml
<!-- Info.plist -->
<key>NSUserNotificationAlertStyle</key>
<string>alert</string>
```

- **Banner**：臨時出現，數秒後消失，不需要使用者互動
- **Alert**：持續顯示，直到使用者點擊（需 `NSUserNotificationAlertStyle = alert`）
- Electron 預設產生 Banner，需設定 `NSUserNotificationAlertStyle` 才能使 Action Button 正常運作

### 3.3 macOS 音效路徑

```
YourApp.app/Contents/Resources/  （App bundle 內）
~/Library/Sounds/
/Library/Sounds/
/System/Library/Sounds/          （系統音效）
```

---

## 4. 通知點擊事件可靠性

### 4.1 macOS 的垃圾回收問題（重要）

**問題：** macOS 上，若通知物件沒有被持久保留（留在記憶體），JavaScript GC 會回收該物件，導致：

- 大約 **1 分鐘後**，點擊通知中心的通知不會觸發 `click` 事件
- App 僅會被帶到前景，沒有任何回調

> 這是已知 bug（[issue #12690](https://github.com/electron/electron/issues/12690)），根本原因是 Electron 端的 notification 物件被 GC 回收。

**解決方案：持久保存通知物件引用**

```typescript
// notification-manager.ts
let activeNotifications: Notification[] = []

export function showNotification(
  options: Electron.NotificationConstructorOptions,
  onClick?: () => void
): void {
  const notification = new Notification(options)

  // 加入陣列防止 GC
  activeNotifications.push(notification)

  notification.on('click', () => {
    onClick?.()
    removeNotification(notification)
  })

  notification.on('close', () => {
    removeNotification(notification)
  })

  notification.show()
}

function removeNotification(target: Notification): void {
  activeNotifications = activeNotifications.filter(n => n !== target)
}
```

> **注意：** `close` 和 `click` 事件並不保證每次關閉通知都會觸發，建議加入定時清理機制防止記憶體洩漏。

### 4.2 Windows click 事件行為

- Windows 的 `click` 事件觸發相對穩定
- Action Center 中的通知持續存在，點擊後才觸發 click
- 使用 `toastXml` 搭配 protocol activation 時，事件透過 `second-instance` 或 `open-url` 接收，而非 `click`

### 4.3 平台差異摘要

| 問題 | macOS | Windows |
|------|-------|---------|
| GC 導致 click 失效 | **是（嚴重問題）** | 無 |
| 通知閒置後 click 不觸發 | 約 1 分鐘後失效 | 不受影響 |
| 需要持久保存物件引用 | **必須** | 不需要 |
| Action button 啟動機制 | 直接回調 | Protocol URL 解析 |

---

## 5. macOS 通知權限請求

### 5.1 macOS 通知權限機制

macOS 通知**不需要**明確的程式碼呼叫來請求權限，系統在 App **第一次呼叫 `notification.show()`** 時自動彈出權限詢問對話框。

然而，需要在 `Info.plist` 設定通知相關 key：

```xml
<!-- electron-builder 的 extendInfo 或直接寫入 Info.plist -->
<key>NSUserNotificationAlertStyle</key>
<string>alert</string>
```

### 5.2 檢查通知權限狀態

Electron 沒有內建 API 直接查詢 macOS 通知權限狀態。常見替代方案：

**方案 A：使用 `macos-notification-state` 套件**

```typescript
// 注意：此套件在某些版本的 Electron 可能有相容性問題
import { getNotificationState } from 'macos-notification-state'

const state = getNotificationState()
// state: 'Granted' | 'Denied' | 'NotDetermined' | 'DND'
```

**方案 B：直接送出通知，偵測 `failed` 事件**

```typescript
const notification = new Notification({ title: 'Test', body: '' })
notification.on('failed', (error) => {
  // 通知無法顯示，可能是權限被拒
  console.error('Notification failed:', error)
})
notification.show()
```

**方案 C：引導使用者至系統偏好設定**

```typescript
import { shell } from 'electron'

function openNotificationSettings(): void {
  shell.openExternal(
    'x-apple.systempreferences:com.apple.preference.notifications'
  )
}
```

> **限制：** 若使用者拒絕通知權限後，無法透過程式再次彈出權限對話框，只能引導使用者手動至系統設定更改。

### 5.3 Notification.permission 的陷阱

在 renderer process 使用 `Notification.permission` API 時，macOS 上始終回傳 `'granted'`（[issue #11221](https://github.com/electron/electron/issues/11221)），不反映真實的系統權限狀態。因此**不應依賴** renderer 的 `Notification.permission` 判斷 macOS 通知可用性。

### 5.4 Windows 通知狀態查詢

```typescript
// Windows 可使用 windows-notification-state
import { getWindowsNotificationState } from 'windows-notification-state'

const state = getWindowsNotificationState()
```

---

## 6. Tray-only App 的通知行為

### 6.1 macOS LSUIElement（隱藏 Dock 圖示）

設定 `LSUIElement = YES` 讓 App 以 **Agent App** 模式運行（不出現在 Dock 和 Force Quit 視窗）：

```xml
<!-- Info.plist -->
<key>LSUIElement</key>
<true/>
```

或透過 Electron 動態設定：

```typescript
// 隱藏 Dock 圖示（macOS）
if (process.platform === 'darwin') {
  app.dock.hide()
}
```

### 6.2 macOS Tray-only App 通知可用性

- **結論：通知仍然可以正常顯示**
- App 不在 Dock 不影響通知系統
- 通知透過 Notification Center 機制運作，與 Dock 無關
- 使用者仍可在系統偏好設定中管理該 App 的通知權限

### 6.3 Windows Tray-only App 通知

- Windows 的 Tray App（System Tray）通知行為與 macOS 相同
- 通知顯示在 Action Center 中，不受 Tray 狀態影響
- **額外要求：** `AppUserModelId` 必須設定，否則通知無法正確關聯至 App

### 6.4 平台差異

| 特性 | macOS | Windows |
|------|-------|---------|
| 隱藏主視窗/Dock | `app.dock.hide()` | 只建立 Tray，不建立 BrowserWindow |
| 通知是否受影響 | 不受影響 | 不受影響 |
| 通知關聯 App 的方式 | App bundle ID | AppUserModelId |

---

## 7. 通知中心 UX 差異

### 7.1 macOS Notification Center

| 特性 | 說明 |
|------|------|
| 通知持久性 | 預設 Banner 模式：短暫顯示後消失；Alert 模式：持續顯示直到互動 |
| 通知中心保存 | Banner 型通知顯示完後不保留；Alert 可保留在通知中心 |
| 最大字元數 | 通知 body **256 bytes**，超過會被截斷 |
| Action Button | 需設定 `NSUserNotificationAlertStyle = alert` |
| Reply | 支援 `hasReply: true` 進行 inline 回覆 |
| 關閉行為 | 點擊通知中心「X」或滑出即關閉 |

### 7.2 Windows Action Center

| 特性 | 說明 |
|------|------|
| 通知持久性 | 通知**持續保存**在 Action Center，直到使用者清除 |
| 最大字元數 | Windows 10 無明顯限制（舊版 Windows 8 限制 250 字元） |
| Action Button | 透過 `toastXml` 定義，Protocol 啟動 |
| Reply | 透過 `toastXml` 的 `input` 元素支援 |
| 關閉行為 | Action Center 開啟後，通知列表清除並觸發 `close` 事件 |
| `close` reason | 包含 `userCanceled` / `applicationHidden` / `timedOut` |

### 7.3 主要 UX 差異

```
macOS:
  [通知出現] → [短暫顯示] → [消失]（Banner）
  [通知出現] → [停留] → [使用者互動/滑走]（Alert）
  點擊通知 → click 事件 → App 帶至前景

Windows:
  [通知出現] → [短暫顯示] → [收入 Action Center]
  [使用者開啟 Action Center] → [看到通知] → [點擊] → click 事件 / Protocol
  開啟 Action Center 後 → 所有通知標記為已讀並清除（close 事件觸發）
```

---

## 8. 跨平台統一實作模式

### 8.1 推薦：Platform Branch 模式

適合通知邏輯差異較大時（如 Windows 需要 ToastXml）：

```typescript
// src/main/notification/notification-service.ts
import { Notification } from 'electron'

interface NotificationOptions {
  title: string
  body: string
  onClick?: () => void
}

// 持久保存通知物件（防止 macOS GC 問題）
let activeNotifications: Notification[] = []

function removeNotification(n: Notification): void {
  activeNotifications = activeNotifications.filter(item => item !== n)
}

function showMacOSNotification(options: NotificationOptions): void {
  const notification = new Notification({
    title: options.title,
    subtitle: '',   // macOS 專屬
    body: options.body,
    sound: 'default',
  })

  // macOS 必須持久保存以防 GC 回收
  activeNotifications.push(notification)

  notification.on('click', () => {
    options.onClick?.()
    removeNotification(notification)
  })

  notification.on('close', () => {
    removeNotification(notification)
  })

  notification.show()
}

function showWindowsNotification(options: NotificationOptions): void {
  const notification = new Notification({
    title: options.title,
    body: options.body,
    // Windows 可選使用 toastXml 進行進階客製
    timeoutType: 'default',
  })

  notification.on('click', () => {
    options.onClick?.()
  })

  notification.show()
}

export function showNotification(options: NotificationOptions): void {
  if (process.platform === 'darwin') {
    showMacOSNotification(options)
  } else if (process.platform === 'win32') {
    showWindowsNotification(options)
  } else {
    // Linux fallback
    const notification = new Notification({
      title: options.title,
      body: options.body,
    })
    notification.on('click', () => options.onClick?.())
    notification.show()
  }
}
```

### 8.2 共用 Code 模式（簡化版）

適合通知邏輯差異較小的情境：

```typescript
// src/main/notification/notification-manager.ts
import { Notification, app } from 'electron'

// Windows 初始化（必須在 app.ready 之後）
export function initNotifications(): void {
  if (process.platform === 'win32') {
    // 開發環境
    if (!app.isPackaged) {
      app.setAppUserModelId(process.execPath)
    }
    // 生產環境由 installer 自動設定，或手動設定：
    // app.setAppUserModelId('com.yourcompany.yourapp')
  }
}

// 通用通知函式（macOS 垃圾回收修復已內建）
const notificationStore = new Set<Notification>()

export function notify(
  title: string,
  body: string,
  onClick?: () => void
): void {
  const options: Electron.NotificationConstructorOptions = {
    title,
    body,
    // macOS 專屬屬性（其他平台忽略）
    ...(process.platform === 'darwin' && {
      sound: 'Glass',
    }),
    // Windows 專屬屬性（其他平台忽略）
    ...(process.platform === 'win32' && {
      timeoutType: 'default' as const,
    }),
  }

  const notification = new Notification(options)

  // macOS 必須持久保存（防 GC）；Windows/Linux 也沒有壞處
  notificationStore.add(notification)

  notification.on('click', () => {
    onClick?.()
    notificationStore.delete(notification)
  })

  notification.on('close', () => {
    notificationStore.delete(notification)
  })

  notification.show()
}
```

### 8.3 動態平台模組模式

```typescript
// src/main/notification/index.ts
type NotificationModule = {
  init: () => void
  show: (title: string, body: string, onClick?: () => void) => void
}

function loadPlatformModule(): NotificationModule {
  switch (process.platform) {
    case 'darwin':
      return require('./macos-notifications')
    case 'win32':
      return require('./windows-notifications')
    default:
      return require('./linux-notifications')
  }
}

export const notificationModule = loadPlatformModule()
```

---

## 9. process.platform === 'darwin' 時應跳過的設定

在 macOS 上**必須跳過**的 Windows 專用設定：

```typescript
// app.setAppUserModelId — 僅 Windows 有效
if (process.platform === 'win32') {
  app.setAppUserModelId('com.yourcompany.yourapp')
}
// 錯誤：在 macOS 呼叫此函式可能造成 TypeError（macOS 無此 API）

// toastXml — 僅 Windows 支援
const notificationOptions: Electron.NotificationConstructorOptions = {
  title: 'Title',
  body: 'Body',
  // 不要在 macOS 設定 toastXml
  ...(process.platform === 'win32' && {
    toastXml: '<toast>...</toast>',
  }),
}

// timeoutType — macOS 不支援（Linux 支援）
const options: Electron.NotificationConstructorOptions = {
  title: 'Title',
  body: 'Body',
  ...(process.platform !== 'darwin' && {
    timeoutType: 'default' as const,
  }),
}

// close event reason — macOS 的 close 事件無 reason 參數
notification.on('close', (event, details) => {
  if (process.platform === 'win32') {
    // Windows：details.reason 為 'userCanceled' | 'applicationHidden' | 'timedOut'
    console.log('Close reason:', details?.reason)
  }
  // macOS：不存在 details.reason，直接處理即可
})

// failed event — 僅 Windows 有此事件
if (process.platform === 'win32') {
  notification.on('failed', (event, error) => {
    console.error('Notification failed:', error)
  })
}
```

### 在 macOS 上**可使用**但 Windows 上無效的設定：

```typescript
// subtitle — 僅 macOS
if (process.platform === 'darwin') {
  options.subtitle = '副標題'
}

// hasReply / replyPlaceholder — 僅 macOS
if (process.platform === 'darwin') {
  options.hasReply = true
  options.replyPlaceholder = '輸入回覆...'
}

// closeButtonText — 僅 macOS
if (process.platform === 'darwin') {
  options.closeButtonText = '關閉'
}

// app.dock — 僅 macOS
if (process.platform === 'darwin') {
  app.dock.hide()  // 隱藏 Dock 圖示
  app.dock.show()  // 顯示 Dock 圖示
}
```

---

## 10. 快速對照表

| 功能 | macOS | Windows | 備註 |
|------|-------|---------|------|
| AppUserModelId | 不需要 | **必要** | 開發環境用 `process.execPath` |
| ToastXml | 不支援 | 支援 | Windows 進階通知 |
| 通知大小限制 | 256 bytes body | Windows 10 無限制 | 舊版 Windows 8 限 250 字 |
| `subtitle` | 支援 | 不支援 | macOS 專屬 |
| `hasReply` | 支援 | 不支援 | macOS 專屬 |
| `timeoutType` | 不支援 | 支援 | Windows/Linux |
| `sound` 自訂 | 支援 | 不支援 | macOS 指定音效名稱 |
| `actions` | 支援 | 有限支援 | macOS 原生；Windows 需 ToastXml |
| `NSUserNotificationAlertStyle` | 需設定 | 不適用 | 啟用 Alert / Action Button |
| click 事件可靠性 | **有 GC 問題** | 穩定 | macOS 需持久保存物件 |
| `close` reason | 無 | 有 | `userCanceled` 等 |
| `failed` 事件 | 無 | 有 | Windows 專屬 |
| Tray-only 通知 | 可正常顯示 | 可正常顯示 | 不受 Dock/Tray 影響 |
| 通知中心持久性 | Banner 型短暫、Alert 型持久 | Action Center 持久 | 使用者行為差異大 |
| 通知權限 API | 無內建 API | 無內建 API | 需第三方套件 |
| `Notification.permission` | 始終回傳 `granted` | 行為不一致 | **不可依賴** |

---

## 來源

- [Electron Notifications Tutorial（官方文件）](https://www.electronjs.org/docs/latest/tutorial/notifications)
- [Electron Notification API Reference](https://www.electronjs.org/docs/latest/api/notification)
- [How to fix Electron notifications not working on macOS after some time（2025）](https://blog.bloomca.me/2025/02/22/electron-mac-notifications.html)
- [macOS click event not triggered from notification center after ~1min（GitHub #12690）](https://github.com/electron/electron/issues/12690)
- [Notification.permission always shows "granted" on macOS（GitHub #11221）](https://github.com/electron/electron/issues/11221)
- [Support Alert type notifications on macOS（GitHub #30589）](https://github.com/electron/electron/issues/30589)
- [Notification Center behaviour question on OS X & Windows 10（GitHub #4907）](https://github.com/electron/electron/issues/4907)
- [How to get system notification status on macOS and Windows（GitHub #45570）](https://github.com/electron/electron/issues/45570)
- [Native Windows Notifications with Action Buttons for Electron（sipgate.de）](https://www.sipgate.de/blog/how-to-create-native-notifications-with-action-buttons-on-windows-for-your-electron-app)
- [electron-windows-notifications（npm）](https://www.npmjs.com/package/electron-windows-notifications)
- [LSUIElement – Apple Developer Documentation](https://developer.apple.com/library/archive/documentation/General/Reference/InfoPlistKeyReference/Articles/LaunchServicesKeys.html)
- [Electron systemPreferences API](https://www.electronjs.org/docs/latest/api/system-preferences)
