# Electron-Builder 打包 Windows NSIS Installer 完整指南

> 收集日期：2026-03-10
> 適用版本：electron-builder ^24.x, electron-vite ^2.x, Electron ^28+

---

## 目錄

1. [專案結構與 package.json scripts](#1-專案結構與-packagejson-scripts)
2. [electron-builder.yml 完整配置](#2-electron-builderyml-完整配置)
3. [appId 與 productName 設定](#3-appid-與-productname-設定)
4. [圖示規格要求](#4-圖示規格要求)
5. [NSIS 安裝器自訂選項](#5-nsis-安裝器自訂選項)
6. [開機自動啟動（Auto-start）](#6-開機自動啟動auto-start)
7. [未簽章時的 SmartScreen 警告行為](#7-未簽章時的-smartscreen-警告行為)
8. [Native Module 打包處理](#8-native-module-打包處理)
9. [Portable vs NSIS Installer 選擇](#9-portable-vs-nsis-installer-選擇)
10. [測試打包結果](#10-測試打包結果)

---

## 1. 專案結構與 package.json scripts

### electron-vite 專案結構

```
my-app/
├── src/
│   ├── main/           # Electron main process
│   ├── preload/        # Preload scripts
│   └── renderer/       # Frontend (React/Vue/等)
├── build/              # electron-builder 資源目錄（預設）
│   ├── icon.ico        # Windows 圖示
│   ├── icon.icns       # macOS 圖示
│   └── icon.png        # 通用圖示 (256x256+)
├── out/                # electron-vite build 輸出（預設）
├── dist/               # electron-builder 打包輸出
├── electron.vite.config.ts
├── electron-builder.yml
└── package.json
```

### package.json scripts 標準配置

```json
{
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "build:win": "npm run build && electron-builder --win",
    "build:mac": "npm run build && electron-builder --mac",
    "build:linux": "npm run build && electron-builder --linux",
    "build:win:dir": "npm run build && electron-builder --win --dir",
    "postinstall": "electron-builder install-app-deps"
  }
}
```

**重點說明：**
- `electron-vite build` 先將程式碼打包至 `out/` 目錄
- `electron-builder` 再將 `out/` 的結果包裝成安裝檔
- `--dir` 旗標只產生未壓縮目錄（用於測試，不產生安裝檔）
- `postinstall` 中的 `install-app-deps` 負責 rebuild native modules

---

## 2. electron-builder.yml 完整配置

### 最小可用配置（MVP）

```yaml
appId: com.yourcompany.yourapp
productName: Your App Name

directories:
  output: dist
  buildResources: build

files:
  - out/**/*
  - package.json

asar: true

win:
  target:
    - target: nsis
      arch:
        - x64
  icon: build/icon.ico

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: Your App Name
```

### 完整進階配置

```yaml
appId: com.yourcompany.yourapp
productName: Your App Name

directories:
  output: dist/${version}
  buildResources: build

files:
  - out/**/*
  - package.json
  - "!**/*.map"
  - "!node_modules/**/*"

asar: true
asarUnpack:
  # native modules 必須 unpack，否則無法載入
  - "node_modules/bonjour-service/**/*"
  - "**/*.node"

compression: normal   # store | normal | maximum

win:
  target:
    - target: nsis
      arch:
        - x64
    - target: portable
      arch:
        - x64
  icon: build/icon.ico
  # 不做 code signing 時，省略 signtoolOptions
  artifactName: "${productName}-Setup-${version}.${ext}"

nsis:
  # 安裝模式
  oneClick: false                          # false = 引導式安裝（可選路徑）
  perMachine: false                        # false = 僅安裝給當前使用者
  allowElevation: true                     # 允許 UAC 提升權限
  allowToChangeInstallationDirectory: true # 允許使用者修改安裝路徑

  # 捷徑
  createDesktopShortcut: true              # true | "always"（重裝也重建）
  createStartMenuShortcut: true
  menuCategory: false                      # true = 用公司名建子目錄
  shortcutName: Your App Name

  # 安裝完畢後自動啟動
  runAfterFinish: true

  # 圖示（選填，預設用 win.icon）
  # installerIcon: build/installerIcon.ico
  # uninstallerIcon: build/uninstallerIcon.ico

  # 解除安裝時清除 AppData（謹慎使用）
  deleteAppDataOnUninstall: false

  # 授權協議（選填）
  # license: build/license.txt

  # 語言
  language: 1028                           # 1028 = 繁體中文，1033 = 英文（美國）
  unicode: true

  artifactName: "${productName}-Setup-${version}.${ext}"

# macOS（若需跨平台）
mac:
  target: dmg
  icon: build/icon.icns

# Linux（若需跨平台）
linux:
  target: AppImage
  icon: build/icons
```

---

## 3. appId 與 productName 設定

### 規則

| 欄位 | 用途 | 格式 | 範例 |
|------|------|------|------|
| `appId` | Windows 應用程式 User Model ID、NSIS GUID 基礎 | 反向網域格式（reverse domain） | `com.acme.auto-backup` |
| `productName` | 安裝顯示名稱、捷徑名稱、控制台名稱 | 可含空白與特殊字元 | `Auto Backup Mobile Data` |

### 注意事項

- `appId` 預設為 `com.electron.${name}`（`name` 來自 package.json），**強烈建議明確設定**
- `appId` 一旦發布後不應更改，否則 Windows 視為不同應用程式，舊版無法被覆蓋安裝
- `productName` 在 package.json 的 `productName` 欄位也可設定，`electron-builder.yml` 中的設定優先

```json
// package.json
{
  "name": "auto-backup-mobile-data",
  "version": "1.0.0",
  "productName": "Auto Backup Mobile Data",
  "main": "./out/main/index.js"
}
```

---

## 4. 圖示規格要求

### Windows（icon.ico）

- **格式**：`.ico`（首選）或 `.png`
- **最低尺寸**：256×256 像素
- **建議**：ICO 檔案內嵌多個尺寸（16, 32, 48, 64, 128, 256），以確保各場景顯示清晰
- **放置位置**：`build/icon.ico`（electron-builder 預設路徑）

```yaml
win:
  icon: build/icon.ico
```

### 製作工具

```bash
# 使用 ImageMagick 從 PNG 轉換為多尺寸 ICO
convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico

# 或使用 electron-icon-maker（npm 套件）
npm install -g electron-icon-maker
electron-icon-maker --input=icon.png --output=./build
```

### 各平台圖示對照表

| 平台 | 格式 | 最低尺寸 | 建議放置位置 |
|------|------|----------|-------------|
| Windows | `.ico` | 256×256 | `build/icon.ico` |
| macOS | `.icns` 或 `.icon` | 512×512 | `build/icon.icns` |
| Linux | `.png` | 256×256 | `build/icons/256x256.png` |

---

## 5. NSIS 安裝器自訂選項

### 安裝模式比較

| 模式 | `oneClick` | `perMachine` | 使用者體驗 |
|------|-----------|-------------|-----------|
| 一鍵安裝（預設） | `true` | `false` | 無畫面，直接安裝到 AppData |
| 一鍵全機安裝 | `true` | `true` | 無畫面，需 UAC，安裝到 Program Files |
| 引導式安裝 | `false` | `false` | 有畫面，可選安裝目錄（預設 AppData） |
| 引導式全機安裝 | `false` | `true` | 有畫面，需 UAC，Program Files |

**MVP 建議**：`oneClick: false` + `allowToChangeInstallationDirectory: true`，讓使用者有完整控制。

### 自訂 NSIS 腳本（進階）

若需要超出內建選項的客製化，可建立 `build/installer.nsh`：

```nsis
; build/installer.nsh
; 在安裝前執行自訂邏輯

!macro customInstall
  ; 範例：建立額外的登錄檔項目
  WriteRegStr HKCU "Software\YourApp" "InstallPath" "$INSTDIR"
!macroend

!macro customUnInstall
  ; 解除安裝時清理登錄檔
  DeleteRegKey HKCU "Software\YourApp"
!macroend
```

然後在 `electron-builder.yml` 中指定：

```yaml
nsis:
  include: build/installer.nsh
```

### 完整 NsisOptions 快速參考

```yaml
nsis:
  oneClick: false
  perMachine: false
  allowElevation: true
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true          # true | false | "always"
  createStartMenuShortcut: true
  menuCategory: false                  # false | true（用公司名）| "自訂分類名"
  shortcutName: "My App"
  runAfterFinish: true
  deleteAppDataOnUninstall: false
  language: 1033                       # 英文；1028 = 繁中
  unicode: true
  warningsAsErrors: true
  uninstallDisplayName: "${productName} ${version}"
```

---

## 6. 開機自動啟動（Auto-start）

### Electron API：app.setLoginItemSettings

在 Electron main process 中呼叫：

```typescript
// src/main/index.ts
import { app } from 'electron'

// 設定開機自動啟動
function setAutoStart(enable: boolean): void {
  if (process.platform === 'win32') {
    app.setLoginItemSettings({
      openAtLogin: enable,
      // Windows 必須明確指定 path，避免重複登錄
      path: process.execPath,
      args: [
        '--processStart', `"${app.getPath('exe')}"`,
      ],
      // name 對應 Windows Registry 中的值名稱
      // 預設使用 AppUserModelId
    })
  } else if (process.platform === 'darwin') {
    app.setLoginItemSettings({
      openAtLogin: enable,
    })
  }
}

// 讀取當前狀態
function getAutoStartStatus(): boolean {
  if (process.platform === 'win32') {
    const settings = app.getLoginItemSettings({
      path: process.execPath,
    })
    return settings.openAtLogin
  }
  return app.getLoginItemSettings().openAtLogin
}

// 在 app ready 後初始化
app.whenReady().then(() => {
  // 範例：首次啟動時預設開啟 auto-start
  const isFirstLaunch = !app.getLoginItemSettings().openAtLogin
  if (isFirstLaunch) {
    setAutoStart(true)
  }
})
```

### Windows Registry 行為

`setLoginItemSettings` 在 Windows 上操作的是：
- `HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run`（per-user）

```typescript
// Windows 特有：取得所有 launch items
const settings = app.getLoginItemSettings({ path: process.execPath })
console.log(settings.launchItems)
// [{ name: 'AppName', path: '...', args: [], scope: 'user', enabled: true }]
```

### 注意事項

- 在 APPX（Windows Store）打包版本中，`setLoginItemSettings` **無法正常運作**（已知限制）
- 開發環境（`electron .`）與打包後的 `exe` 路徑不同，需區分處理
- 建議在 Tray 選單或設定介面提供 Auto-start 的開關

```typescript
// 安全的寫法：開發環境跳過
function setAutoStart(enable: boolean): void {
  if (process.env.NODE_ENV === 'development') {
    console.log('[AutoStart] Skipped in development mode')
    return
  }
  app.setLoginItemSettings({ openAtLogin: enable, path: process.execPath })
}
```

---

## 7. 未簽章時的 SmartScreen 警告行為

### 使用者看到的畫面

執行未簽章的 `.exe` 安裝檔時，Windows SmartScreen 會顯示：

```
Windows 已保護您的電腦
Microsoft Defender SmartScreen 防止了一個無法辨識的應用程式啟動。
執行此應用程式可能會使您的電腦面臨風險。

[更多資訊]   [不執行]
```

點擊「**更多資訊**」後：

```
應用程式：YourApp-Setup-1.0.0.exe
發行者：未知

[執行]   [不執行]
```

### MVP 開發階段的可接受行為

對於**內部測試**或**可信任的使用者群體**，未簽章是可接受的：

1. 使用者點擊「更多資訊」
2. 再點擊「仍要執行」（Run anyway）
3. 安裝正常繼續

**繞過方式（給最終使用者的說明）：**
- 右鍵點擊 `.exe` → 內容 → 安全性區段 → 勾選「解除封鎖」→ 確定

### 簽章選項（生產環境）

| 方案 | 費用 | SmartScreen 信任 |
|------|------|-----------------|
| 不簽章（MVP） | 免費 | 顯示警告，需手動略過 |
| OV 憑證 | USD ~100-300/年 | 顯示發行者名稱，仍需累積信譽 |
| EV 憑證 | USD ~300-500/年 | 立即信任，無 SmartScreen 警告 |
| Azure Trusted Signing | 月費方案 | 立即信任，微軟雲端方案 |

### electron-builder 中停用 code signing

```yaml
# electron-builder.yml
win:
  # 完全不設定 signtoolOptions 即可跳過簽章
  target: nsis
```

或使用環境變數：

```bash
# 跳過簽章
CSC_LINK="" electron-builder --win
# 或
ELECTRON_BUILDER_SKIP_SIGNING=true electron-builder --win
```

---

## 8. Native Module 打包處理

### 問題根源

Native Node.js modules（`.node` 檔案，例如 `bonjour-service`）使用 C++ 編譯，與特定版本的 Node.js ABI 綁定。Electron 使用自己的 Node.js，因此必須針對 Electron 版本重新編譯。

### 方法一：postinstall 自動 rebuild（推薦）

```json
// package.json
{
  "scripts": {
    "postinstall": "electron-builder install-app-deps"
  }
}
```

這會在每次 `npm install` 後，自動將 native modules rebuild 為 Electron 所需的版本。

### 方法二：手動使用 @electron/rebuild

```bash
npm install --save-dev @electron/rebuild

# 重建所有 native modules
./node_modules/.bin/electron-rebuild

# 指定 Electron 版本
./node_modules/.bin/electron-rebuild --version 28.0.0
```

### asar 打包注意事項

Native `.node` 檔案**不能放在 asar 歸檔內**，必須解包：

```yaml
# electron-builder.yml
asar: true
asarUnpack:
  # 解包 native modules
  - "**/*.node"
  - "node_modules/bonjour-service/**/*"
  - "node_modules/your-native-module/**/*"
```

### extraFiles / extraResources 使用場景

若 native binary 不是 npm 套件（例如獨立的 `.exe` 或 `.dll`）：

```yaml
# electron-builder.yml
extraFiles:
  # 將整個目錄複製到安裝根目錄
  - from: vendor/mdns
    to: resources/mdns
    filter:
      - "*.exe"
      - "*.dll"

extraResources:
  # 複製到 resources/ 目錄（在程式碼中用 process.resourcesPath 存取）
  - from: assets/config
    to: config
    filter: "**/*"
```

在程式碼中存取 extraResources：

```typescript
import path from 'path'

const resourcesPath = process.resourcesPath
const configPath = path.join(resourcesPath, 'config', 'default.json')
```

### bonjour-service 具體配置

```yaml
# electron-builder.yml
asar: true
asarUnpack:
  - "node_modules/bonjour-service/**/*"

# 若 bonjour-service 依賴 multicast-dns，也需要一起解包
  - "node_modules/multicast-dns/**/*"
```

```json
// package.json
{
  "dependencies": {
    "bonjour-service": "^1.2.1"
  },
  "scripts": {
    "postinstall": "electron-builder install-app-deps"
  }
}
```

---

## 9. Portable vs NSIS Installer 選擇

### 比較表

| 特性 | NSIS Installer | Portable |
|------|---------------|---------|
| 需要安裝 | 是 | 否 |
| 建立捷徑 | 是（可控制） | 否 |
| 出現在控制台 | 是（可解除安裝） | 否 |
| Auto-start | 可正常設定 | 可能有路徑問題 |
| 檔案格式 | `.exe`（安裝檔） | `.exe`（單一執行檔） |
| 適合場景 | 一般使用者、正式發布 | 測試、企業內部工具 |
| SmartScreen | 觸發 | 觸發 |

### 同時建置兩種格式

```yaml
# electron-builder.yml
win:
  target:
    - target: nsis
      arch: [x64]
    - target: portable
      arch: [x64]

nsis:
  artifactName: "${productName}-Setup-${version}.${ext}"

portable:
  artifactName: "${productName}-Portable-${version}.${ext}"
```

**注意**：兩種格式都是 `.exe`，必須設定不同的 `artifactName`，否則會互相覆蓋。

### MVP 建議

**開發 MVP 優先選 NSIS**（`oneClick: false`）：
- 使用者熟悉安裝流程
- Auto-start 功能正常運作
- 日後轉換 code signing 更容易

---

## 10. 測試打包結果

### 方法一：--dir 快速測試（推薦）

```bash
# 只產生未壓縮目錄，不建立安裝檔（速度最快）
npm run build && electron-builder --win --dir
```

產出位置：`dist/win-unpacked/`

```bash
# 直接執行測試
dist/win-unpacked/YourApp.exe
```

### 方法二：完整打包後安裝測試

```bash
# 完整打包
npm run build:win

# 產出：dist/YourApp-Setup-1.0.0.exe
# 雙擊安裝，確認：
# 1. 安裝流程正常
# 2. 捷徑建立正確
# 3. 控制台顯示正確版本
# 4. 解除安裝正常
```

### 方法三：使用虛擬機（推薦用於 SmartScreen 測試）

```bash
# 在 macOS/Linux 上建置 Windows 版本
electron-builder --win --x64

# 將 dist/ 中的安裝檔複製到 Windows VM 測試
```

### 驗證清單

```
打包後測試清單：
□ dist/win-unpacked/ 可直接執行
□ 安裝檔可正常安裝（引導式流程）
□ 安裝路徑選擇正常
□ 桌面捷徑建立
□ 開始選單捷徑建立
□ SmartScreen 警告出現（預期行為，未簽章）
□ 點擊「更多資訊」→「仍要執行」可正常繼續
□ Auto-start 設定後重開機驗證
□ Tray icon 正常顯示
□ 解除安裝後捷徑消失
□ bonjour-service 等 native module 正常運作
```

### 常見問題排查

```bash
# 查看詳細建置日誌
DEBUG=electron-builder electron-builder --win

# 確認 native modules 版本
./node_modules/.bin/electron-rebuild --version $(cat node_modules/electron/dist/version)

# 確認 asarUnpack 是否生效
# 在 dist/win-unpacked/resources/ 中應看到未打包的 .node 檔案
ls dist/win-unpacked/resources/app.asar.unpacked/
```

---

## 附錄：完整 electron-builder.yml 範本

```yaml
# electron-builder.yml（完整 MVP 配置）
appId: com.yourcompany.auto-backup-mobile-data
productName: Auto Backup Mobile Data

directories:
  output: dist
  buildResources: build

files:
  - out/**/*
  - package.json
  - "!**/*.map"

asar: true
asarUnpack:
  - "**/*.node"
  - "node_modules/bonjour-service/**/*"

compression: normal

win:
  target:
    - target: nsis
      arch:
        - x64
  icon: build/icon.ico
  artifactName: "${productName}-Setup-${version}.${ext}"

nsis:
  oneClick: false
  perMachine: false
  allowElevation: true
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  menuCategory: false
  shortcutName: Auto Backup Mobile Data
  runAfterFinish: true
  deleteAppDataOnUninstall: false
  unicode: true
  language: 1033

# 未設定 signtoolOptions = 不簽章（MVP 可接受）
```

---

## 來源

- [NSIS - electron-builder 官方文件](https://www.electron.build/nsis.html)
- [NsisOptions Interface](https://www.electron.build/electron-builder.interface.nsisoptions)
- [Any Windows Target - electron-builder](https://www.electron.build/win.html)
- [Icons - electron-builder](https://www.electron.build/icons.html)
- [Application Contents - electron-builder](https://www.electron.build/contents.html)
- [Common Configuration - electron-builder](https://www.electron.build/configuration.html)
- [electron-builder | Electron Vite](https://electron-vite.github.io/build/electron-builder)
- [Getting Started | electron-vite](https://electron-vite.org/guide/)
- [Native Node Modules | Electron](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)
- [app API | Electron (setLoginItemSettings)](https://www.electronjs.org/docs/latest/api/app)
- [How to Sign a Windows App with Electron Builder](https://securityboulevard.com/2025/12/how-to-sign-a-windows-app-with-electron-builder/)
- [SmartScreen issues - electron-builder GitHub](https://github.com/electron-userland/electron-builder/issues/628)
- [How to Bypass SmartScreen Warning](https://medium.com/@techworldthink/how-to-bypass-the-windows-defender-smartscreen-prevented-an-unrecognized-app-from-starting-85ae0d717de4)
