# macOS 系統整合深度技術研究

> 研究日期：2026-03-11
> 適用版本：macOS Sonoma 14 / Sequoia 15、Electron 28-35
> 資料來源：Apple 官方文件、Electron 官方文件、社群技術分析

---

## 目錄

1. [Local Network Permission（LAN 存取權限）](#1-local-network-permissionlan-存取權限)
2. [Bonjour 服務宣告（NSBonjourServices）](#2-bonjour-服務宣告nsbonjourservices)
3. [macOS Tray（NSStatusItem）](#3-macos-traynssstatusitem)
4. [macOS 通知系統](#4-macos-通知系統)
5. [Login Items（開機啟動）](#5-login-items開機啟動)
6. [LaunchAgent 自動啟動](#6-launchagent-自動啟動)
7. [macOS Dock 整合](#7-macos-dock-整合)
8. [自訂 URL Scheme（Deep Link）](#8-自訂-url-schemedeep-link)
9. [Hardened Runtime 與 Entitlements](#9-hardened-runtime-與-entitlements)
10. [macOS Sonoma / Sequoia 新限制](#10-macos-sonoma--sequoia-新限制)
11. [USB 裝置存取](#11-usb-裝置存取)

---

## 1. Local Network Permission（LAN 存取權限）

### 1.1 背景

iOS 14 引入的 Local Network Privacy 機制，在 **macOS Sequoia（15）** 中正式移植到桌面平台。任何 app 或 launch agent 嘗試存取區域網路裝置時，系統會彈出授權提示。

### 1.2 Info.plist 設定

```xml
<key>NSLocalNetworkUsageDescription</key>
<string>需要存取區域網路以發現並備份 iPhone 裝置</string>

<key>NSBonjourServices</key>
<array>
  <string>_apple-mobdev2._tcp</string>
  <string>_afc._tcp</string>
</array>
```

- `NSLocalNetworkUsageDescription`：使用者看到的授權說明文字
- `NSBonjourServices`：必須宣告要發現的 Bonjour 服務類型（含底線前綴與 `._tcp` 後綴）

### 1.3 macOS vs iOS 差異

| 特性 | iOS | macOS Sequoia |
|------|-----|---------------|
| 權限機制 | TCC（Transparency, Consent, Control） | **非 TCC**，使用 Network Extension packet filter |
| 重置方式 | `tccutil reset` 可用 | `tccutil` 無效，需建立新使用者帳號測試 |
| 例外 | 無 | Launch Daemon（root）免檢查；Terminal.app 免檢查 |
| `/Applications` 外的 app | N/A | 跳過檢查（安全漏洞） |

### 1.4 Electron App 的特殊問題

- Electron Builder 產生的 Mach-O binary 使用相同 UUID，即使 bundle ID 不同，macOS 會將不同 Electron app 的權限混淆（[electron-builder#9158](https://github.com/electron-userland/electron-builder/issues/9158)）
- 修改 app 的 target name 後，即使之前已授權，會被**靜默拒絕**存取
- macOS 15.2+ 出現已授權 app 被重新要求授權的問題

### 1.5 觸發條件

以下 API 呼叫會觸發 Local Network 權限提示：

- `NSProcessInfo.hostName`（即使只是讀取主機名）
- `NSHost` 相關 API
- mDNS / Bonjour 服務瀏覽
- 列印面板（Print panel）自動發現印表機
- 任何嘗試連接區域網路 IP 的操作

### 1.6 對本專案的影響

備份 iPhone 需要 LAN 發現功能，必須：
1. 在 `Info.plist` 正確宣告 `NSLocalNetworkUsageDescription` 和 `NSBonjourServices`
2. 處理使用者拒絕授權的 fallback 流程
3. 注意 Electron Builder 的 UUID 碰撞問題

**來源**：
- [Apple TN3179: Understanding Local Network Privacy](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)
- [Local Network Privacy on Sequoia - Michael Tsai](https://mjtsai.com/blog/2024/10/02/local-network-privacy-on-sequoia/)
- [Eclectic Light: How local network privacy could affect you](https://eclecticlight.co/2026/01/14/how-local-network-privacy-could-affect-you/)

---

## 2. Bonjour 服務宣告（NSBonjourServices）

### 2.1 服務類型格式

```
_<service-name>._tcp
_<service-name>._udp
```

底線為必要字元。常見用於 iPhone 發現的服務類型：

| 服務類型 | 用途 |
|---------|------|
| `_apple-mobdev2._tcp` | Apple Mobile Device（iTunes/Finder 同步） |
| `_afc._tcp` | Apple File Conduit（檔案存取） |
| `_apple-pairable._tcp` | Apple 配對服務 |
| `_daap._tcp` | Digital Audio Access Protocol |
| `_airplay._tcp` | AirPlay 串流 |

### 2.2 Info.plist 宣告

```xml
<key>NSBonjourServices</key>
<array>
  <string>_apple-mobdev2._tcp</string>
  <string>_afc._tcp</string>
  <string>_apple-pairable._tcp</string>
</array>
```

### 2.3 iOS 14+ 限制

- 若要發現**所有** Bonjour 服務（不限定類型），需申請 `com.apple.developer.networking.multicast` entitlement
- 一般 app 只需列出需要的服務類型即可
- macOS 目前不強制要求此 entitlement，但建議宣告以確保相容性

### 2.4 Node.js 實作

在 Electron 中可使用以下方式瀏覽 Bonjour 服務：

```typescript
// 使用 bonjour-service（純 JS 實作）
import Bonjour from 'bonjour-service';

const bonjour = new Bonjour();
bonjour.find({ type: 'apple-mobdev2' }, (service) => {
  console.log('Found iPhone:', service.name, service.addresses);
});
```

**來源**：
- [Apple Bonjour Documentation](https://developer.apple.com/documentation/foundation/bonjour)
- [Apple Developer Forums - Bonjour Discovery](https://developer.apple.com/forums/thread/653316)

---

## 3. macOS Tray（NSStatusItem）

### 3.1 Template Image 規範

| 屬性 | 規格 |
|------|------|
| 尺寸 | 16x16 px（@1x）、32x32 px（@2x） |
| DPI | 72 dpi（@1x）、144 dpi（@2x） |
| 色彩 | 僅使用**黑色 + Alpha 通道**（template image） |
| 格式 | PNG（支援透明度） |
| 命名 | 必須以 `Template` 結尾：`iconTemplate.png`、`iconTemplate@2x.png` |

### 3.2 Electron 實作

```typescript
import { Tray, nativeImage, Menu } from 'electron';

// Template image 自動適配 Dark/Light Mode
const icon = nativeImage.createFromPath(
  path.join(__dirname, 'assets', 'trayIconTemplate.png')
);

const tray = new Tray(icon);
tray.setToolTip('Auto Backup');

// 設定右鍵選單
const contextMenu = Menu.buildFromTemplate([
  { label: '開啟主視窗', click: () => mainWindow.show() },
  { label: '立即備份', click: () => startBackup() },
  { type: 'separator' },
  { label: '結束', click: () => app.quit() },
]);
tray.setContextMenu(contextMenu);
```

### 3.3 最佳實踐

- **Template Image 命名**：檔名必須以 `Template` 結尾（如 `iconTemplate.png`），Electron 會自動辨識並在 Dark/Light Mode 切換顏色
- **@2x 圖片**：`iconTemplate@2x.png` 必須與 `iconTemplate.png` 放在同一目錄，macOS 自動選擇適當解析度
- **動態 Icon 更新**：使用 `tray.setImage(newIcon)` 切換狀態圖示（如同步中、已完成、錯誤）
- **位置記憶**：Electron 支援 `autosaveName`（macOS NSStatusItem 功能），讓 Tray icon 在重啟後保持使用者排列的位置（[electron#47838](https://github.com/electron/electron/pull/47838)）
- **防止 GC 回收**：Tray 變數必須保持在全域作用域，避免被 JavaScript GC 回收導致 icon 消失

### 3.4 動態 Icon 更新模式

```typescript
// 備份狀態對應不同 icon
const TRAY_ICONS = {
  idle: 'trayIconTemplate.png',
  syncing: 'trayIconSyncTemplate.png',
  error: 'trayIconErrorTemplate.png',
  done: 'trayIconDoneTemplate.png',
} as const;

function updateTrayIcon(status: keyof typeof TRAY_ICONS): void {
  const iconPath = path.join(__dirname, 'assets', TRAY_ICONS[status]);
  const icon = nativeImage.createFromPath(iconPath);
  tray.setImage(icon);
}
```

**來源**：
- [Electron Tray API](https://www.electronjs.org/docs/latest/api/tray)
- [Electron nativeImage API](https://www.electronjs.org/docs/latest/api/native-image)
- [NSStatusItem - Apple Developer](https://developer.apple.com/documentation/appkit/nsstatusitem)

---

## 4. macOS 通知系統

### 4.1 API 演進

| API | 版本 | 狀態 |
|-----|------|------|
| `NSUserNotification` | macOS 10.8-10.14 | **已棄用**（macOS 11 移除） |
| `UNUserNotificationCenter` | macOS 10.14+ | 現行標準 |

Electron 內部自動選擇適當的原生 API。

### 4.2 Electron Notification API

```typescript
import { Notification } from 'electron';

const notification = new Notification({
  title: '備份完成',
  subtitle: 'iPhone 14 Pro',       // macOS 專屬
  body: '已備份 1,234 張照片',
  hasReply: true,                   // macOS 專屬：內嵌回覆欄
  replyPlaceholder: '輸入備註...', // 回覆欄提示文字
  sound: 'default',                 // 系統預設音效
  actions: [                        // 操作按鈕
    { type: 'button', text: '檢視' },
  ],
  closeButtonText: '稍後',          // macOS 專屬
});

notification.on('reply', (event, reply) => {
  console.log('使用者回覆:', reply);
});

notification.on('action', (event, index) => {
  console.log('使用者點擊動作:', index);
});

notification.show();
```

### 4.3 限制與注意事項

| 限制 | 說明 |
|------|------|
| 大小限制 | 通知內容最大 256 bytes，超出會被截斷 |
| Action 按鈕 | 需在 Info.plist 設定 `NSUserNotificationAlertStyle` 為 `alert` |
| 無簽名 App | 通知可能不顯示或僅顯示為 banner（非 alert） |
| 音效檔案 | 自訂音效需放在 `YourApp.app/Contents/Resources/` |
| 音效來源 | 系統音效位於 `~/Library/Sounds`、`/Library/Sounds`、`/System/Library/Sounds` |

### 4.4 Info.plist 設定

```xml
<!-- 啟用 Alert 樣式（可顯示操作按鈕） -->
<key>NSUserNotificationAlertStyle</key>
<string>alert</string>
```

在 electron-builder 中設定：

```json
{
  "mac": {
    "extendInfo": {
      "NSUserNotificationAlertStyle": "alert"
    }
  }
}
```

### 4.5 無簽名 App 的行為

- 通知**可以顯示**，但預設為 banner 樣式（短暫出現後自動消失）
- `alert` 樣式（帶操作按鈕、會停留在通知中心）可能無法生效
- macOS 可能將無簽名 app 的通知靜默降級
- 建議使用 `macos-notification-state` 模組預先檢查通知是否可顯示

**來源**：
- [Electron Notification API](https://www.electronjs.org/docs/latest/api/notification)
- [Electron Notifications Tutorial](https://www.electronjs.org/docs/latest/tutorial/notifications)
- [electron#30589 - Alert type notifications](https://github.com/electron/electron/issues/30589)

---

## 5. Login Items（開機啟動）

### 5.1 API 演進

| API | 版本 | 狀態 |
|-----|------|------|
| `SMLoginItemSetEnabled` | macOS 10.6-12 | **已棄用** |
| `SMAppService` | macOS 13+（Ventura） | 現行標準 |

### 5.2 SMAppService 服務類型

| 類型 | 說明 | 用途 |
|------|------|------|
| `mainAppService` | 主 App 開機啟動 | 最常用，使用者登入後啟動 app |
| `agentService` | Background Agent | 背景服務，需對應 LaunchAgent plist |
| `daemonService` | Root Daemon | 特權背景服務，需對應 LaunchDaemon plist |
| `loginItemService` | Login Item 服務 | 傳統 Login Item 相容模式 |

### 5.3 Status 狀態值

| 狀態 | 說明 |
|------|------|
| `not-registered` | 未註冊 |
| `enabled` | 已啟用，將在登入時啟動 |
| `requires-approval` | 已註冊但需使用者到系統設定中核准 |
| `not-found` | 找不到對應服務 |

### 5.4 Electron 實作

```typescript
import { app } from 'electron';

// 設定開機啟動（macOS 13+ 使用 SMAppService）
app.setLoginItemSettings({
  openAtLogin: true,
  type: 'mainAppService', // macOS 13+ 專屬
});

// 查詢狀態
const loginSettings = app.getLoginItemSettings({
  type: 'mainAppService',
});
console.log('登入啟動狀態:', loginSettings.status);
// => 'enabled' | 'not-registered' | 'requires-approval' | 'not-found'
```

### 5.5 已棄用的參數（macOS 13+）

以下參數在 macOS 13+ 不再生效：

- `openAsHidden`：已棄用
- `wasOpenedAsHidden`：已棄用
- `restoreState`：已棄用

### 5.6 無簽名 App 的限制

- macOS 13+ 的 SMAppService **要求 app 有有效簽名**
- 無簽名 app 使用 `setLoginItemSettings` 可能回傳 `requires-approval` 狀態
- 使用者需手動在「系統設定 > 一般 > 登入項目」中核准
- 替代方案：使用 LaunchAgent plist 設定自動啟動（見第 6 節）

**來源**：
- [Electron app API - setLoginItemSettings](https://www.electronjs.org/docs/latest/api/app)
- [SMAppService - theevilbit blog](https://theevilbit.github.io/posts/smappservice/)
- [Apple: Add launch at login setting](https://nilcoalescing.com/blog/LaunchAtLoginSetting/)

---

## 6. LaunchAgent 自動啟動

### 6.1 與 Login Items 的差異

| 特性 | Login Items | LaunchAgent |
|------|------------|-------------|
| 設計目的 | 使用者便利（啟動常用 app） | 自動化 / 背景處理 |
| 可見性 | 啟動可見的 GUI app | 通常為背景服務，不顯示 UI |
| 管理方式 | 系統設定 GUI | plist 檔案（需手動或程式管理） |
| 崩潰重啟 | 不支援 | 支援（`KeepAlive` key） |
| 執行時機 | 使用者登入後 | 使用者登入後（或依條件觸發） |
| 簽名要求 | macOS 13+ 需要 | 不強制要求 |

### 6.2 LaunchAgent plist 範例

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.autobackup.agent</string>

  <key>ProgramArguments</key>
  <array>
    <string>/Applications/AutoBackup.app/Contents/MacOS/AutoBackup</string>
    <string>--background</string>
  </array>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>/tmp/autobackup.stdout.log</string>

  <key>StandardErrorPath</key>
  <string>/tmp/autobackup.stderr.log</string>
</dict>
</plist>
```

### 6.3 plist 存放位置

| 路徑 | 載入時機 | 執行身分 |
|------|---------|---------|
| `~/Library/LaunchAgents/` | 該使用者登入時 | 該使用者 |
| `/Library/LaunchAgents/` | 任何使用者登入時 | 登入的使用者 |
| `/Library/LaunchDaemons/` | 系統啟動時 | root |

### 6.4 Electron App 中的實作策略

```typescript
import { writeFileSync, existsSync, unlinkSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const PLIST_PATH = join(
  homedir(),
  'Library',
  'LaunchAgents',
  'com.autobackup.agent.plist'
);

function installLaunchAgent(appPath: string): void {
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.autobackup.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>${appPath}</string>
    <string>--background</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <false/>
</dict>
</plist>`;
  writeFileSync(PLIST_PATH, plist);
}

function uninstallLaunchAgent(): void {
  if (existsSync(PLIST_PATH)) {
    unlinkSync(PLIST_PATH);
  }
}
```

### 6.5 對本專案的建議

- **MVP 階段**：使用 Electron `setLoginItemSettings`（簡單，但需簽名）
- **無簽名情況**：使用 LaunchAgent plist 作為 fallback
- **LaunchAgent 優勢**：支援崩潰重啟（`KeepAlive`）、不需 app 簽名

**來源**：
- [LaunchAgents vs Login Items - Eclectic Light](https://eclecticlight.co/2018/05/22/running-at-startup-when-to-use-a-login-item-or-a-launchagent-launchdaemon/)
- [Understanding macOS LaunchAgents and Login Items](https://medium.com/@durgaviswanadh/understanding-macos-launchagents-and-login-items-a-clear-practical-guide-5c0e39e3a6b3)
- [launchd Tutorial](https://www.launchd.info/)

---

## 7. macOS Dock 整合

### 7.1 Dock API（Electron）

```typescript
import { app, Menu } from 'electron';

// 隱藏 Dock icon（Tray-only 模式）
app.dock.hide();

// 顯示 Dock icon
app.dock.show();

// 設定 Badge（數字或文字）
app.dock.setBadge('3');  // 顯示 "3"
app.dock.setBadge('');   // 清除 badge

// 取得當前 Badge
const badge = app.dock.getBadge();

// 設定 Dock 右鍵選單
const dockMenu = Menu.buildFromTemplate([
  { label: '立即備份', click: () => startBackup() },
  { label: '檢視備份紀錄', click: () => showHistory() },
]);
app.dock.setMenu(dockMenu);
```

### 7.2 注意事項

- `dock.setMenu()` 必須在 `app.whenReady()` 之後呼叫
- `dock.setBadge()` 需要 app 有通知權限才能正確顯示
- **已知問題**：`dock.hide()` → `dock.show()` 後，`setBadge()` 可能不生效（[electron#12529](https://github.com/electron/electron/issues/12529)）
- Tray-only app 應在啟動時呼叫 `app.dock.hide()`，或在 `Info.plist` 設定 `LSUIElement` 為 `true`

### 7.3 LSUIElement 設定

```xml
<!-- 啟動時不顯示 Dock icon（純 Tray app） -->
<key>LSUIElement</key>
<true/>
```

在 electron-builder 中：

```json
{
  "mac": {
    "extendInfo": {
      "LSUIElement": true
    }
  }
}
```

**來源**：
- [Electron Dock API](https://www.electronjs.org/docs/latest/api/dock)
- [Electron macOS Dock Tutorial](https://www.electronjs.org/docs/latest/tutorial/macos-dock)

---

## 8. 自訂 URL Scheme（Deep Link）

### 8.1 macOS 限制

- 只能註冊在 `Info.plist` 中已宣告的 protocol
- `Info.plist` **無法在執行時修改**，必須在打包時設定
- 開發模式下（未打包）無法使用 `setAsDefaultProtocolClient`

### 8.2 Info.plist 設定

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>autobackup</string>
    </array>
    <key>CFBundleURLName</key>
    <string>com.autobackup.app</string>
  </dict>
</array>
```

### 8.3 Electron 實作

```typescript
import { app } from 'electron';

// 註冊 protocol handler
if (process.defaultApp) {
  // 開發模式需傳入 execPath
  app.setAsDefaultProtocolClient('autobackup', process.execPath, [
    path.resolve(process.argv[1]),
  ]);
} else {
  app.setAsDefaultProtocolClient('autobackup');
}

// macOS：處理 URL 開啟事件
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
  // url 格式：autobackup://action?param=value
});
```

### 8.4 electron-builder 設定

```json
{
  "mac": {
    "protocols": [
      {
        "name": "Auto Backup Protocol",
        "schemes": ["autobackup"]
      }
    ]
  }
}
```

### 8.5 驗證

可在 macOS 終端機驗證 protocol 註冊狀態：

```bash
# 查詢已註冊的 protocol handler
defaults read ~/Library/Preferences/com.apple.LaunchServices.plist
```

**來源**：
- [Electron Deep Links Tutorial](https://www.electronjs.org/docs/latest/tutorial/launch-app-from-url-in-another-app)
- [Building deep-links in Electron - BigBinary](https://www.bigbinary.com/blog/deep-link-electron-app)

---

## 9. Hardened Runtime 與 Entitlements

### 9.1 概述

Hardened Runtime 保護 app 免受惡意程式碼注入、DLL 攻擊和記憶體竄改。macOS 10.15+ 要求啟用 Hardened Runtime 才能通過 notarization。

### 9.2 Electron App 必要的 Entitlements

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <!-- 必要：允許未簽名的可執行記憶體（V8 JIT） -->
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>

  <!-- 必要：允許 JIT 編譯（V8 引擎需要） -->
  <key>com.apple.security.cs.allow-jit</key>
  <true/>

  <!-- 建議：允許載入外部動態連結庫 -->
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>

  <!-- 若需存取攝影機 -->
  <key>com.apple.security.device.camera</key>
  <true/>

  <!-- 若需存取 USB 裝置 -->
  <key>com.apple.security.device.usb</key>
  <true/>
</dict>
</plist>
```

### 9.3 無簽名 App 的功能限制

| 功能 | 已簽名 + Notarized | 無簽名 |
|------|-------------------|--------|
| 正常啟動 | 正常 | 需使用者手動允許（右鍵 > 打開） |
| Gatekeeper | 通過 | macOS Sequoia 需到「系統設定」手動允許 |
| Hardened Runtime | 啟用 | 無法啟用 |
| Notification Alert 樣式 | 完整支援 | 可能降級為 banner |
| Login Items（SMAppService） | 完整支援 | 可能需使用者手動核准 |
| App Store 分發 | 可以 | 不可以 |
| 自動更新 | Sparkle 等工具正常 | 需自行處理 |

### 9.4 macOS Sequoia Gatekeeper 變更

- **移除右鍵繞過**：macOS Sequoia 不再允許透過 Finder 右鍵「打開」繞過 Gatekeeper
- **新流程**：使用者必須前往「系統設定 > 隱私與安全性」手動允許
- **`spctl --master-disable` 已失效**：無法透過命令列停用安全評估

**來源**：
- [Notarizing Electron Application - Kilian Valkhof](https://kilianvalkhof.com/2019/electron/notarizing-your-electron-application/)
- [Publishing Mac Desktop App Outside App Store - DoltHub](https://www.dolthub.com/blog/2024-10-22-how-to-publish-a-mac-desktop-app-outside-the-app-store/)
- [macOS Sequoia Security - SentinelOne](https://www.sentinelone.com/blog/macos-sequoia-whats-new-in-privacy-and-security-for-enterprise/)

---

## 10. macOS Sonoma / Sequoia 新限制

### 10.1 macOS Sonoma（14）- 2023

- 引入獨立的 Passwords app（基於 iCloud Keychain）
- Widget 支援互動操作
- 無重大安全 API 變更

### 10.2 macOS Sequoia（15）- 2024

#### 隱私與安全重大變更

| 變更 | 影響 |
|------|------|
| Local Network Privacy | 所有 app / launch agent 存取 LAN 需授權（見第 1 節） |
| Screen Recording 月度提示 | 螢幕錄製 app 每月需重新授權 |
| Gatekeeper 強化 | 無法透過右鍵繞過，需到系統設定手動允許 |
| `spctl --master-disable` 移除 | 無法命令列停用 Gatekeeper |
| Wi-Fi MAC 位址輪換 | 每兩週自動輪換（影響裝置識別） |
| `periodic` 機制移除 | `/usr/sbin/periodic` 不再運作 |
| Keychain Access 移動 | 從 `/System/Applications/Utilities/` 移至 `/System/Library/CoreServices/Applications/` |

#### 對本專案的影響

1. **LAN 發現**：必須處理 Local Network Privacy 授權流程
2. **裝置識別**：Wi-Fi MAC 輪換影響基於 MAC 的裝置識別（應改用其他識別方式）
3. **未簽名 app**：Gatekeeper 更嚴格，MVP 階段需提供明確的安裝說明

### 10.3 macOS Sequoia 15.2-15.4 已知問題

- 已授權 app 被重新要求 Local Network 授權
- 列印面板觸發不必要的 Local Network 提示
- Local Network 權限設定在 UI 與實際行為之間不一致

**來源**：
- [macOS Sequoia Privacy and Security - SentinelOne](https://www.sentinelone.com/blog/macos-sequoia-whats-new-in-privacy-and-security-for-enterprise/)
- [Local Network Privacy on Sequoia - Michael Tsai](https://mjtsai.com/blog/2024/10/02/local-network-privacy-on-sequoia/)
- [macOS Sequoia Excessive Permission Prompts - TidBITS](https://tidbits.com/2024/08/12/macos-15-sequoias-excessive-permissions-prompts-will-hurt-security/)

---

## 11. USB 裝置存取

### 11.1 存取方式比較

| 方式 | 說明 | 適用場景 |
|------|------|---------|
| WebUSB API | Chromium 內建，透過 `navigator.usb` | 簡單 USB 通訊 |
| node-usb | Node.js native addon（libusb 綁定） | 完整 USB 控制 |
| node-hid | USB HID 裝置存取 | HID 裝置（鍵盤、搖桿等） |
| usb-detection | USB 裝置插拔偵測 | 裝置熱插拔監聽 |

### 11.2 底層架構：IOKit Framework

macOS 的 USB 存取透過 IOKit framework 實現。Node.js 的 `node-usb` 封裝了 `libusb`，而 `libusb` 在 macOS 上透過 IOKit 與 USB 裝置通訊。

```
Electron Main Process
    ↓
node-usb (NAPI addon)
    ↓
libusb (C library)
    ↓
IOKit.framework (macOS kernel)
    ↓
USB Hardware
```

### 11.3 WebUSB API（Electron 內建）

```typescript
// 在 Renderer Process 中
const device = await navigator.usb.requestDevice({
  filters: [{ vendorId: 0x05AC }], // Apple vendor ID
});

// 在 Main Process 中設定權限
session.defaultSession.setDevicePermissionHandler((details) => {
  if (details.deviceType === 'usb') {
    return details.device.vendorId === 0x05AC; // 只允許 Apple 裝置
  }
  return false;
});

session.defaultSession.setUSBProtectedClassesHandler((details) => {
  // 允許存取受保護的 USB class
  return [];
});
```

### 11.4 node-usb（Native Addon）

```typescript
import { usb } from 'usb';

// 列出所有 USB 裝置
const devices = usb.getDeviceList();
const appleDevices = devices.filter(
  (d) => d.deviceDescriptor.idVendor === 0x05AC
);

// 偵測裝置插拔
usb.on('attach', (device) => {
  if (device.deviceDescriptor.idVendor === 0x05AC) {
    console.log('iPhone 已連接');
  }
});

usb.on('detach', (device) => {
  console.log('USB 裝置已移除');
});
```

### 11.5 Electron 整合注意事項

| 注意事項 | 說明 |
|---------|------|
| electron-rebuild | Native addon 需用 `electron-rebuild` 重新編譯 |
| prebuild | `node-usb` 和 `node-hid` 提供預編譯二進位檔（NAPI） |
| electron-builder | 打包時確保不重複編譯已有 prebuild 的模組 |
| Hardened Runtime | 若啟用，需加入 `com.apple.security.device.usb` entitlement |
| macOS 權限 | USB 存取目前不需額外的 TCC 權限 |

### 11.6 對本專案的建議

- **iPhone 偵測**：使用 `usb-detection` 或 `node-usb` 偵測 Apple 裝置插拔
- **Apple Vendor ID**：`0x05AC`
- **iPhone Product ID 範圍**：`0x12A0` - `0x12AF`（因型號而異）
- **備份通訊**：iPhone 備份主要透過 `usbmuxd` 協議而非直接 USB I/O

**來源**：
- [Electron Device Access Tutorial](https://www.electronjs.org/docs/latest/tutorial/devices)
- [node-usb GitHub](https://github.com/node-usb/node-usb)
- [node-hid GitHub](https://github.com/node-hid/node-hid)
- [usb-detection npm](https://www.npmjs.com/package/usb-detection)

---

## 附錄：本專案 Info.plist 完整配置參考

以下為本專案（Auto Backup Mobile Data）可能需要的 Info.plist 額外設定：

```xml
<!-- Local Network -->
<key>NSLocalNetworkUsageDescription</key>
<string>需要存取區域網路以發現並備份 iPhone 裝置</string>

<key>NSBonjourServices</key>
<array>
  <string>_apple-mobdev2._tcp</string>
  <string>_afc._tcp</string>
</array>

<!-- Notification Style -->
<key>NSUserNotificationAlertStyle</key>
<string>alert</string>

<!-- Tray-only (no Dock icon) -->
<key>LSUIElement</key>
<true/>

<!-- URL Scheme -->
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>autobackup</string>
    </array>
    <key>CFBundleURLName</key>
    <string>com.autobackup.app</string>
  </dict>
</array>
```

electron-builder 對應設定：

```json
{
  "mac": {
    "extendInfo": {
      "NSLocalNetworkUsageDescription": "需要存取區域網路以發現並備份 iPhone 裝置",
      "NSBonjourServices": [
        "_apple-mobdev2._tcp",
        "_afc._tcp"
      ],
      "NSUserNotificationAlertStyle": "alert",
      "LSUIElement": true
    },
    "protocols": [
      {
        "name": "Auto Backup Protocol",
        "schemes": ["autobackup"]
      }
    ],
    "entitlements": "build/entitlements.mac.plist",
    "entitlementsInherit": "build/entitlements.mac.plist"
  }
}
```
