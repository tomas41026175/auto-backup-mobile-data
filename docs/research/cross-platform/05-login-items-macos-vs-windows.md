# Electron Login Items：macOS vs Windows 深度研究

**研究日期**: 2026-03-10
**Electron 版本參考**: v34+
**目的**: 跨平台開機自啟動實作的技術差異與統一模式

---

## 目錄

1. [macOS 實作原理](#1-macos-實作原理)
2. [Windows 實作原理](#2-windows-實作原理)
3. [macOS 14+ SMAppService 新限制](#3-macos-14-smappservice-新限制)
4. [macOS Sandbox 下的限制](#4-macos-sandbox-下的限制)
5. [開發環境行為差異](#5-開發環境行為差異)
6. [getLoginItemSettings 回傳值差異](#6-getloginitemsettings-回傳值差異)
7. [跨平台統一實作模式](#7-跨平台統一實作模式)
8. [已知問題與 Bug 紀錄](#8-已知問題與-bug-紀錄)
9. [來源連結](#9-來源連結)

---

## 1. macOS 實作原理

### 1.1 歷史演進

| macOS 版本 | 使用 API | 狀態 |
|------------|----------|------|
| 10.11 以前 | `LSSharedFileListCreate` | 已廢棄 |
| 10.12 ~ 12 | `SMLoginItemSetEnabled` | 已廢棄 |
| 13 (Ventura) + | `SMAppService` | 現行標準 |

### 1.2 macOS 13 以前：LaunchAgent plist 機制

在 macOS Ventura 之前，Electron 使用 `SMLoginItemSetEnabled` API，其底層透過 LaunchAgent plist 實現。

**傳統 plist 位置（已廢棄）：**
- 使用者層級：`~/Library/LaunchAgents/`
- 系統層級：`/Library/LaunchAgents/`

**傳統 LaunchAgent plist 範例：**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.yourcompany.yourapp</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Applications/YourApp.app/Contents/MacOS/YourApp</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
```

### 1.3 macOS 13+：SMAppService 機制

Apple 在 macOS Ventura (13) 引入 `SMAppService`，將 plist 移入 app bundle 內部。

**新架構 plist 位置（bundle 內）：**
- Launch Agent：`YourApp.app/Contents/Library/LaunchAgents/`
- Launch Daemon：`YourApp.app/Contents/Library/LaunchDaemons/`
- Login Item Service：`YourApp.app/Contents/Library/LoginItems/`

**bundle 內的 plist 範例（agentService 類型）：**
```xml
<dict>
    <key>Label</key>
    <string>com.yourcompany.yourapp.agent</string>

    <key>BundleProgram</key>
    <string>Contents/Resources/YourAppHelper</string>

    <key>MachServices</key>
    <dict>
        <key>com.yourcompany.yourapp.agent.service</key>
        <true/>
    </dict>
</dict>
```

> `BundleProgram` 使用相對路徑（相對於 app bundle 根目錄），取代舊有絕對路徑。

### 1.4 Electron API 在 macOS 的調用

```typescript
import { app } from 'electron'

// macOS 12 以下（或 mainAppService 類型）
app.setLoginItemSettings({
  openAtLogin: true
})

// macOS 13+：指定 agentService 類型
app.setLoginItemSettings({
  openAtLogin: true,
  type: 'agentService',           // macOS 13+ only
  serviceName: 'com.yourcompany.yourapp.agent'  // 非 mainAppService 時必填
})
```

**type 參數可選值（macOS 13+ only）：**
| 值 | 說明 | 需要的 plist 位置 |
|----|------|-------------------|
| `mainAppService` | 主應用程式（預設） | 不需額外 plist |
| `agentService` | Launch Agent | `Contents/Library/LaunchAgents` |
| `daemonService` | Launch Daemon | `Contents/Library/LaunchDaemons` |
| `loginItemService` | Login Item | `Contents/Library/LoginItems` |

---

## 2. Windows 實作原理

### 2.1 Registry 機制

Windows 使用兩個 Registry 路徑實現開機自啟動：

**主要啟動項目位置：**
```
HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run
```

**啟動審核控制位置：**
```
HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run
```

### 2.2 二重 Registry 控制邏輯

Windows 10 起，啟動項目必須通過兩個 Registry 的雙重確認：

| `StartupApproved\Run` 中的 binary 值 | 實際效果 |
|--------------------------------------|---------|
| 不存在 | 啟用 |
| `02 00 00 00 00 00 00 00 00 00 00 00` | 啟用 |
| 任何其他值 | **停用** |

這意味著 `Run` 有值不代表程式真的會執行，還需要檢查 `StartupApproved\Run`。

### 2.3 Electron API 在 Windows 的調用

```typescript
import { app } from 'electron'
import path from 'node:path'

// 基本用法
app.setLoginItemSettings({
  openAtLogin: true
})

// 搭配 Squirrel updater（需要指向 stub launcher）
const appFolder = path.dirname(process.execPath)
const ourExeName = path.basename(process.execPath)
const stubLauncher = path.resolve(appFolder, '..', ourExeName)

app.setLoginItemSettings({
  openAtLogin: true,
  path: stubLauncher,  // Windows only：指定執行路徑
  args: [],            // Windows only：命令列參數
  enabled: true,       // Windows only：控制 StartupApproved 狀態
  name: 'YourApp'      // Windows only：Registry value 名稱（預設為 AppUserModelId）
})
```

**Windows 專屬參數說明：**
| 參數 | 說明 | 預設值 |
|------|------|--------|
| `path` | 執行檔路徑 | `process.execPath` |
| `args` | 命令列參數陣列 | `[]` |
| `enabled` | 是否出現在工作管理員/設定中 | `true` |
| `name` | Registry value 名稱 | App 的 AppUserModelId |

### 2.4 Windows Store (APPX) 的限制

當 app 以 APPX 格式發布時，`setLoginItemSettings` 的行為完全不同：

- API 呼叫永遠回傳 `true`（不會報錯）
- 實際寫入的是虛擬化 Registry，**不是**系統真實的 Registry
- 其他應用程式無法讀取這些虛擬化的 Registry 項目
- 需改用 AppX Manifest 的啟動聲明，或 UWP 背景工作機制

---

## 3. macOS 14+ SMAppService 新限制

### 3.1 Ventura (13) 起的重大變更

macOS Ventura 引入了顯著的 Login Items 管理變革：

1. **使用者可見性增強**：安裝 Launch Agent 或 Daemon 時，macOS 會透過通知中心通知使用者
2. **統一管理介面**：所有背景項目集中在「系統設定 > 一般 > 登入項目」
3. **Bundle 綁定**：plist 必須存在於 app bundle 內部，不再散布於系統目錄
4. **Code Signing 強制**：整個 app bundle（含 agent 和 plist）必須一起簽署

### 3.2 SMAppService 狀態值

`app.getLoginItemSettings()` 的 `status` 欄位（macOS only）：

| 值 | 意義 |
|----|------|
| `not-registered` | 尚未註冊或嘗試重新註冊 |
| `enabled` | 已成功註冊，可以執行 |
| `requires-approval` | 已註冊但需使用者在系統設定中核准 |
| `not-found` | 找不到對應的服務 |

### 3.3 Electron 對 SMAppService 的支援狀況

根據研究，Electron 已在 macOS 13+ 整合 SMAppService：
- PR #37244 修正了底層 API 實作問題
- `type` 參數（`mainAppService`, `agentService` 等）直接對應 SMAppService 的服務類型
- `openAsHidden` 在 macOS 13+ 已廢棄，不再有效

### 3.4 使用者審核流程（macOS 13+）

```
開發者呼叫 setLoginItemSettings({ openAtLogin: true })
    ↓
SMAppService.register() 被呼叫
    ↓
系統通知使用者（Notification Center）
    ↓
使用者需在「系統設定 > 一般 > 登入項目」確認
    ↓
狀態從 requires-approval → enabled
```

一旦使用者核准，後續的取消再重新註冊不需要再次核准。

---

## 4. macOS Sandbox 下的限制

### 4.1 App Sandbox 影響

| 情境 | setLoginItemSettings 行為 |
|------|--------------------------|
| 非 Sandbox（一般發布） | 正常運作 |
| App Sandbox（MAS 要求） | 受限，需額外設定 |
| Mac App Store (MAS) | 歷史上有問題，PR #37244 後修復 |

### 4.2 MAS Sandbox 的具體限制

Mac App Store 的 app 必須在 App Sandbox 中執行：
- 標準的 `setLoginItemSettings` 在舊版 Electron 中無法正確運作
- 需要透過 `loginItemService` 類型，搭配嵌入在 bundle 中的 Login Item helper
- helper 必須是獨立的 bundle，放在 `Contents/Library/LoginItems/`

### 4.3 Sandbox Entitlements 設定

```xml
<!-- 需要在 entitlements.mac.plist 中加入 -->
<key>com.apple.security.application-groups</key>
<array>
    <string>your.app.group.identifier</string>
</array>
```

---

## 5. 開發環境行為差異

### 5.1 macOS 開發環境問題

**未簽署的開發版 app 行為：**
- `setLoginItemSettings` 在 **未簽署** 的 app 上可能無法正確運作
- Electron maintainer 明確指出：「Login item settings 在 app 未正確打包、簽署和公證時可能行為異常」
- `app.getLoginItemSettings()` 可能回傳不準確的狀態

**驗證流程（GitHub Issue #45672 的建議）：**
```typescript
// 確認 app 是否已打包
if (app.isPackaged) {
  app.setLoginItemSettings({ openAtLogin: true })
} else {
  // 開發環境：可能需要略過或模擬
  console.log('[DEV] Login item settings skipped in development mode')
}
```

### 5.2 Windows 開發環境

Windows 開發環境下，`setLoginItemSettings` 通常可以正常運作：
- Registry 項目會被實際寫入
- 不需要 Code Signing（不像 macOS）
- 但 `process.execPath` 指向 `electron.exe`，重新安裝後路徑可能改變

**Windows 開發 vs 生產的路徑差異：**
```typescript
import { app } from 'electron'

const execPath = app.isPackaged
  ? process.execPath                    // 生產：實際的 .exe 路徑
  : `"${process.execPath}" "${app.getAppPath()}"` // 開發：需包含 app 路徑

app.setLoginItemSettings({
  openAtLogin: true,
  path: app.isPackaged ? process.execPath : process.execPath,
  args: app.isPackaged ? [] : [app.getAppPath()]
})
```

### 5.3 平台行為對比表

| 情境 | macOS（未簽署開發） | macOS（已簽署生產） | Windows（開發） | Windows（生產） |
|------|--------------------|--------------------|-----------------|-----------------|
| API 是否可用 | 部分可用，行為不穩定 | 完全可用 | 完全可用 | 完全可用 |
| 需要 Code Signing | 是（建議） | 是（必要） | 否 | 否（建議） |
| 使用者審核 | macOS 13+ 需要 | macOS 13+ 需要 | 否 | 否 |
| 效果立即生效 | 視情況 | 是 | 是 | 是 |

---

## 6. getLoginItemSettings 回傳值差異

### 6.1 完整回傳值對比

```typescript
// macOS 回傳值結構
interface MacOSLoginItemSettings {
  openAtLogin: boolean          // 共用
  status: 'not-registered'      // macOS only（13+）
         | 'enabled'
         | 'requires-approval'
         | 'not-found'
  wasOpenedAtLogin: boolean     // macOS only
  wasOpenedAsHidden: boolean    // macOS only（deprecated）
  openAsHidden: boolean         // macOS only（deprecated）
  restoreState: boolean         // macOS only（deprecated）
}

// Windows 回傳值結構
interface WindowsLoginItemSettings {
  openAtLogin: boolean          // 共用
  executableWillLaunchAtLogin: boolean  // Windows only
  launchItems: Array<{          // Windows only
    name: string                // Registry value 名稱
    path: string                // 執行檔路徑
    args: string[]              // 命令列參數
    scope: 'user' | 'machine'  // 登錄範圍
    enabled: boolean            // 是否在工作管理員中啟用
  }>
}
```

### 6.2 關鍵差異說明

**`openAtLogin` vs `executableWillLaunchAtLogin`（Windows）：**
- `openAtLogin`：是否設定了啟動，但若 `StartupApproved` Registry 停用，仍可能不啟動
- `executableWillLaunchAtLogin`：考慮 `StartupApproved` 狀態後的實際結果（更可靠）

**macOS `status` 欄位的重要性：**
```typescript
const settings = app.getLoginItemSettings()

if (process.platform === 'darwin') {
  switch (settings.status) {
    case 'enabled':
      // 確認已啟用
      break
    case 'requires-approval':
      // 需要引導使用者到系統設定核准
      showApprovalGuideDialog()
      break
    case 'not-registered':
    case 'not-found':
      // 需要重新設定
      break
  }
}
```

### 6.3 `getLoginItemSettings` 需傳入相同參數

若呼叫 `setLoginItemSettings` 時使用了 `path`、`args` 或 `type`，則 `getLoginItemSettings` 必須傳入相同參數才能取得正確結果：

```typescript
// 設定時
app.setLoginItemSettings({
  openAtLogin: true,
  path: customPath,
  args: ['--hidden']
})

// 查詢時必須傳入相同的 path 和 args
const settings = app.getLoginItemSettings({
  path: customPath,
  args: ['--hidden']
})

console.log(settings.openAtLogin) // 才能拿到正確值
```

---

## 7. 跨平台統一實作模式

### 7.1 基礎跨平台實作

```typescript
import { app } from 'electron'
import path from 'node:path'

/**
 * 取得當前平台的啟動設定
 */
function getAutoLaunchStatus(): boolean {
  if (process.platform === 'win32') {
    const settings = app.getLoginItemSettings()
    // 使用 executableWillLaunchAtLogin 更準確（考慮 StartupApproved）
    return settings.executableWillLaunchAtLogin ?? settings.openAtLogin
  }

  if (process.platform === 'darwin') {
    const settings = app.getLoginItemSettings()
    // macOS 13+ 用 status 判斷，較舊版本用 openAtLogin
    if (settings.status !== undefined) {
      return settings.status === 'enabled'
    }
    return settings.openAtLogin
  }

  return false
}

/**
 * 設定開機自啟動
 */
function setAutoLaunch(enable: boolean): void {
  if (!app.isPackaged) {
    console.warn('[AutoLaunch] Skipping in development mode - app is not packaged')
    return
  }

  if (process.platform === 'win32') {
    setAutoLaunchWindows(enable)
  } else if (process.platform === 'darwin') {
    setAutoLaunchMacOS(enable)
  }
}

function setAutoLaunchWindows(enable: boolean): void {
  const settings: Electron.Settings = {
    openAtLogin: enable,
    enabled: enable
  }

  // Squirrel-based 安裝器需要指向 stub launcher
  // 若使用 electron-builder NSIS 則直接用 process.execPath
  app.setLoginItemSettings(settings)
}

function setAutoLaunchMacOS(enable: boolean): void {
  const settings: Electron.Settings = {
    openAtLogin: enable
  }

  // macOS 13+ 可指定 type，預設 mainAppService 適用大多數情況
  app.setLoginItemSettings(settings)
}
```

### 7.2 完整的跨平台 AutoLaunch 服務

```typescript
import { app } from 'electron'

export interface AutoLaunchStatus {
  isEnabled: boolean
  requiresApproval: boolean   // macOS 13+ only
  platform: NodeJS.Platform
}

export class AutoLaunchService {
  /**
   * 查詢開機自啟動狀態
   */
  static getStatus(): AutoLaunchStatus {
    const platform = process.platform

    if (platform === 'darwin') {
      const settings = app.getLoginItemSettings()

      if (settings.status !== undefined) {
        // macOS 13+
        return {
          isEnabled: settings.status === 'enabled',
          requiresApproval: settings.status === 'requires-approval',
          platform
        }
      }

      // macOS 12 以下
      return {
        isEnabled: settings.openAtLogin,
        requiresApproval: false,
        platform
      }
    }

    if (platform === 'win32') {
      const settings = app.getLoginItemSettings()
      return {
        isEnabled: settings.executableWillLaunchAtLogin ?? settings.openAtLogin,
        requiresApproval: false,
        platform
      }
    }

    return { isEnabled: false, requiresApproval: false, platform }
  }

  /**
   * 啟用開機自啟動
   */
  static enable(): void {
    if (!app.isPackaged) {
      console.warn('[AutoLaunch] Not packaged, skipping')
      return
    }

    app.setLoginItemSettings({ openAtLogin: true })
  }

  /**
   * 停用開機自啟動
   */
  static disable(): void {
    if (!app.isPackaged) {
      return
    }

    app.setLoginItemSettings({ openAtLogin: false })
  }

  /**
   * 檢查是否以開機自啟動方式開啟（macOS only）
   */
  static wasOpenedAtLogin(): boolean {
    if (process.platform === 'darwin') {
      return app.getLoginItemSettings().wasOpenedAtLogin ?? false
    }
    return false
  }
}
```

### 7.3 隱藏視窗啟動模式

```typescript
import { BrowserWindow, app } from 'electron'

app.on('ready', () => {
  const mainWindow = new BrowserWindow({ show: false })

  // 判斷是否以開機自啟動方式開啟
  const openedAtLogin = app.getLoginItemSettings().wasOpenedAtLogin

  if (openedAtLogin) {
    // 開機自啟動時最小化到系統匣，不顯示視窗
    mainWindow.loadFile('index.html').then(() => {
      // 不呼叫 mainWindow.show()，讓 app 在後台運行
    })
  } else {
    // 正常啟動時顯示視窗
    mainWindow.loadFile('index.html').then(() => {
      mainWindow.show()
    })
  }
})
```

### 7.4 MAS / APPX Store 的替代方案

```typescript
/**
 * 判斷當前是否在 Store 環境中，需要不同的處理方式
 */
function isStoreEnvironment(): boolean {
  if (process.platform === 'darwin') {
    // MAS build 通常有特定的 bundle ID 或環境標記
    return process.mas === true
  }

  if (process.platform === 'win32') {
    // Windows Store (APPX) 環境檢測
    return process.windowsStore === true
  }

  return false
}

function setAutoLaunchSafe(enable: boolean): void {
  if (isStoreEnvironment()) {
    console.warn(
      '[AutoLaunch] Store environment detected. ' +
      'Registry-based/SMAppService login items may not work correctly. ' +
      'Consider using Store-specific APIs or manifest declarations.'
    )
  }

  app.setLoginItemSettings({ openAtLogin: enable })
}
```

### 7.5 node-auto-launch 替代套件

對於需要更廣泛 Linux 支援或需要 fallback 的情況：

```typescript
// 注意：node-auto-launch 不支援 MAS，且使用已廢棄的 AppleScript 方法
// 建議優先使用原生 Electron API
import AutoLaunch from 'auto-launch'

const autoLauncher = new AutoLaunch({
  name: 'YourApp',
  path: '/Applications/YourApp.app'  // macOS 需要指定完整路徑
})

// 啟用
await autoLauncher.enable()

// 查詢
const isEnabled = await autoLauncher.isEnabled()
```

> **警告**: `auto-launch` 套件在 macOS 使用 AppleScript，不相容於 Mac App Store 審核要求，且相依於已廢棄的 API。建議優先使用 Electron 原生 `app.setLoginItemSettings`。

---

## 8. 已知問題與 Bug 紀錄

### 8.1 macOS 相關問題

| Issue | 描述 | 狀態 |
|-------|------|------|
| [#10880](https://github.com/electron/electron/issues/10880) | `openAtLogin: false` 在 High Sierra 無法移除登入項目（LSSharedFileListCreate 廢棄導致） | 已修復（PR #15010） |
| [#13417](https://github.com/electron/electron/issues/13417) | `setLoginItemSettings` 在 macOS Mojave 不工作 | 已修復（PR #15010，改用原生實作） |
| [#37228](https://github.com/electron/electron/issues/37228) | `openAsHidden` 在 Ventura 不生效 | 已知限制，Ventura+ 已廢棄此參數 |
| [#37560](https://github.com/electron/electron/issues/37560) | MAS build 中 `setLoginItemSettings` 不工作 | 已修復（PR #37244） |
| [#45672](https://github.com/electron/electron/issues/45672) | macOS 15 上 `openAtLogin: true` 不生效 | 已關閉（需正確打包、簽署和公證） |

### 8.2 Windows 相關問題

| Issue | 描述 | 狀態 |
|-------|------|------|
| [#12491](https://github.com/electron/electron/issues/12491) | Windows Startup 出現重複項目 | 歷史問題 |
| [#14152](https://github.com/electron/electron/issues/14152) | `setLoginItemSettings` 在 Windows 不傳入 start args | 歷史問題 |
| [#20122](https://github.com/electron/electron/issues/20122) | `getLoginItemSettings` 回傳值與 OS 設定不同步（未考慮 StartupApproved Registry） | 已修復（PR #24494, #26515） |
| [#42016](https://github.com/electron/electron/issues/42016) | APPX 發布後 `openAtLogin: true` 不工作（虛擬化 Registry 限制） | 設計限制 |

### 8.3 重要注意事項

1. **macOS Code Signing 是必要條件**：在 macOS 上，`setLoginItemSettings` 在未簽署的 app 上行為不可靠，生產環境必須完整簽署 + 公證。

2. **Windows 雙 Registry 同步**：讀取時必須同時考慮 `Run` 和 `StartupApproved\Run` 兩個位置，`executableWillLaunchAtLogin` 已整合此邏輯（Electron v11+）。

3. **getLoginItemSettings 參數一致性**：若設定時使用了自訂 `path`/`args`（Windows）或 `type`（macOS），查詢時必須傳入相同參數。

4. **macOS 13+ 使用者核准**：即使 API 呼叫成功，使用者仍可能需要在系統設定中手動核准，`status: 'requires-approval'` 需要 UI 引導。

---

## 9. 來源連結

### 官方文件
- [Electron app API 官方文件](https://www.electronjs.org/docs/latest/api/app) - setLoginItemSettings / getLoginItemSettings 完整 API 參考
- [Apple SMAppService 文件](https://developer.apple.com/documentation/servicemanagement/smappservice)

### macOS Login Items 深度資料
- [SMAppService API 深度解析 - theevilbit blog](https://theevilbit.github.io/posts/smappservice/)
- [macOS Ventura 的 Login Items 管理變革 - Kandji Blog](https://the-sequence.com/macos-ventura-login-background-items)
- [Ventura 如何改變 Login Items - The Eclectic Light Company](https://eclecticlight.co/2023/02/16/how-ventura-is-changing-login-and-background-items/)
- [Modern Launch Agent on macOS - GitHub Gist](https://gist.github.com/Matejkob/f8b1f6a7606f30777552372bab36c338)
- [macOS Ventura Login Items 管理 - Robert Hammen](https://hammen.medium.com/managing-login-items-for-macos-ventura-e78d627f88b6)
- [使用 SMAppService 啟動 Launch Agent - Teajmin](https://medium.com/@teajmin/how-to-use-smappservice-to-launch-a-launchd-agent-2023-f663e4c3a9d4)

### Electron GitHub Issues
- [Issue #10880 - openAtLogin: false 不工作](https://github.com/electron/electron/issues/10880)
- [Issue #12491 - Windows 重複 Startup 項目](https://github.com/electron/electron/issues/12491)
- [Issue #13417 - macOS Mojave setLoginItemSettings 失效](https://github.com/electron/electron/issues/13417)
- [Issue #20122 - Windows LoginItemSettings 與 OS 不同步](https://github.com/electron/electron/issues/20122)
- [Issue #37228 - Ventura openAsHidden 不生效](https://github.com/electron/electron/issues/37228)
- [Issue #37560 - MAS build 中 setLoginItemSettings 失效](https://github.com/electron/electron/issues/37560)
- [Issue #42016 - APPX 發布後 openAtLogin 不工作](https://github.com/electron/electron/issues/42016)
- [Issue #45672 - macOS 15 openAtLogin 不生效](https://github.com/electron/electron/issues/45672)
- [Issue #7312 - MAS LoginItem API 支援](https://github.com/electron/electron/issues/7312)

### 實作參考
- [node-auto-launch npm package](https://www.npmjs.com/package/auto-launch)
- [node-auto-launch GitHub](https://github.com/Teamwork/node-auto-launch)
- [Windows Task Scheduler 替代方案 - neekey's blog](https://neekey.net/2023/09/02/automating-startup-of-an-electron-app-on-windows-machines-using-task-scheduler/)
- [存取 Windows Registry - Medium](https://medium.com/adroit-group/accessing-windows-registry-in-electron-or-node-js-2bf5de82f4fe)
