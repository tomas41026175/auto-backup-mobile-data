# electron-builder 打包技術研究

> 調查日期：2026-03-11
> 資料來源：electron-builder 官方文件、GitHub Issues、社群文章（2024-2025）

---

## 1. electron-builder 版本演進（v25 → v26+）

### 1.1 目前最新版本

- **最新穩定版**：v26.8.x（2026 年 3 月）
- **npm 週下載量**：約 1,189,000+

### 1.2 v26 重大 Breaking Changes

#### node-module-collector 遷移（v26.0.4）

v26.0.4 將 Node.js 模組收集邏輯從 Go-based `app-builder-bin` 遷移至純 JavaScript 實作。

**遷移目的**：
- 更好地控制模組收集邏輯
- 支援更多套件管理器
- 移除 pnpm hoisting 的 workaround

**已知問題**：
- **npm 假設**：即使使用 Yarn，`node-module-collector` 仍假設 npm 已安裝且在 PATH 中
- **Windows 副檔名問題**：假設 pnpm/npm/yarn 有 `.cmd` 副檔名，但 Volta、Proto 等版本管理器使用 `.exe` shim
- **Missing peer dependencies**：Yarn collector 遇到缺失的 peer dependency 時會 crash（`TypeError: The "path" argument must be of type string. Received undefined`）

**修復**：PR [#8845](https://github.com/electron-userland/electron-builder/pull/8845) 修正了 peer dependency 收集問題。

**降級方案**：遇到問題可降級至 v26.0.3（仍使用 Go-based 邏輯）。

#### 打包速度變化

v26 相較 v22 有[速度差異的報告](https://github.com/electron-userland/electron-builder/issues/9094)，部分使用者回報打包時間增加。

### 1.3 升級建議

```bash
# 安裝最新穩定版
npm install --save-dev electron-builder@latest

# 若遇到 node-module-collector 問題，指定版本
npm install --save-dev electron-builder@26.0.3
```

**來源**：
- [GitHub Issue #8842 - builds broken since v26.0.4](https://github.com/electron-userland/electron-builder/issues/8842)
- [GitHub Issue #9020 - v26.0.12 breaks build](https://github.com/electron-userland/electron-builder/issues/9020)
- [electron-builder CHANGELOG](https://github.com/electron-userland/electron-builder/blob/master/CHANGELOG.md)

---

## 2. macOS DMG 打包

### 2.1 無簽名（identity: null）打包

#### 設定方式

**方法一：package.json / electron-builder config**

```json
{
  "build": {
    "mac": {
      "identity": null
    }
  }
}
```

**方法二：CLI 參數**

```bash
electron-builder build --mac -c.mac.identity=null
```

**方法三：環境變數**

```bash
export CSC_IDENTITY_AUTO_DISCOVERY=false
electron-builder build --mac
```

#### 預設簽名行為

| 架構 | 有開發者憑證 | 無開發者憑證 |
|------|------------|------------|
| ARM64 / Universal | 使用 Keychain 憑證 | 自動套用 ad-hoc 簽名 |
| x64 (Intel) | 使用 Keychain 憑證 | 不簽名 |

> **ad-hoc 簽名**（`identity: "-"`）：ARM/Universal build 的預設行為，允許本機執行但無法通過 Gatekeeper。

**來源**：[macOS Code Signing - electron-builder](https://www.electron.build/code-signing-mac.html)

### 2.2 arm64 vs Universal Binary

#### arm64 專用 Build

```bash
# 僅 ARM64
electron-builder build --mac --arm64
```

#### Universal Binary（同時包含 x64 + arm64）

```bash
# Universal（需要分別 build 再合併）
electron-builder build --mac --universal
```

**Universal 原理**：使用 `@electron/universal` 套件將 x64 和 arm64 兩個獨立 app 合併為單一 Universal binary。

#### ASAR 合併最佳化

```json
{
  "build": {
    "mac": {
      "target": [
        { "target": "dmg", "arch": ["universal"] }
      ],
      "mergeASARs": true,
      "singleArchFiles": "node_modules/some-native-module/**",
      "x64ArchFiles": "node_modules/x64-only-module/**"
    }
  }
}
```

| 選項 | 預設值 | 說明 |
|------|-------|------|
| `mergeASARs` | `true` | 合併不同架構的 ASAR 以減少 bundle 大小 |
| `singleArchFiles` | - | minimatch pattern，只允許在一個架構的 ASAR 中出現 |
| `x64ArchFiles` | - | 已用 lipo 合併的檔案，避免重複合併 |

**來源**：
- [@electron/universal](https://github.com/electron/universal)
- [macOS Target - electron-builder](https://www.electron.build/mac.html)

### 2.3 extendInfo（Info.plist 擴展）

`extendInfo` 用於擴展或覆寫 macOS 的 `Info.plist` 內容。

#### 方式一：直接物件（推薦）

```json
{
  "build": {
    "mac": {
      "extendInfo": {
        "NSMicrophoneUsageDescription": "需要麥克風權限以進行語音輸入",
        "NSCameraUsageDescription": "需要相機權限以進行視訊通話",
        "LSMinimumSystemVersion": "11.0",
        "CFBundleDocumentTypes": [
          {
            "CFBundleTypeName": "My Document",
            "CFBundleTypeRole": "Editor",
            "LSItemContentTypes": ["com.example.myapp.document"]
          }
        ]
      }
    }
  }
}
```

#### 方式二：外部 plist 檔案

```json
{
  "build": {
    "mac": {
      "extendInfo": "build/extend-info.plist"
    }
  }
}
```

> **注意**：`extendInfo` 中的條目會**覆寫**基礎 Info.plist 的同名條目。

**來源**：[GitHub Issue #3732](https://github.com/electron-userland/electron-builder/issues/3732)

### 2.4 afterSign、afterPack Hooks

#### Hook 執行順序

```
beforePack → afterExtract → afterPack → afterSign → afterAllArtifactBuild
```

#### afterPack

在打包完成後、建立安裝檔和簽名**之前**執行。

```javascript
// build/afterPack.js
exports.default = async function (context) {
  // context.appOutDir - 打包輸出目錄
  // context.packager - 打包器實例
  // context.electronPlatformName - 平台名稱
  // context.arch - 架構（Arch enum）

  // 常見用途：修改打包後的檔案、注入額外資源
  const fs = require('fs')
  const path = require('path')
  const configPath = path.join(context.appOutDir, 'config.json')
  fs.writeFileSync(configPath, JSON.stringify({ env: 'production' }))
}
```

```json
{
  "build": {
    "afterPack": "./build/afterPack.js"
  }
}
```

#### afterSign

在打包和簽名完成後、建立安裝檔**之前**執行。

```javascript
// build/afterSign.js
const { notarize } = require('@electron/notarize')

exports.default = async function (context) {
  const { electronPlatformName, appOutDir } = context
  if (electronPlatformName !== 'darwin') return

  const appName = context.packager.appInfo.productFilename
  await notarize({
    appBundleId: 'com.example.myapp',
    appPath: `${appOutDir}/${appName}.app`,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_ID_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  })
}
```

#### 其他重要 Hooks

| Hook | 時機 | 典型用途 |
|------|------|---------|
| `beforePack` | 打包前 | 清理、前置處理 |
| `afterExtract` | Electron binary 解壓後 | 修改 Electron 原始檔案 |
| `afterAllArtifactBuild` | 所有產物建置完成 | 產生 checksum、上傳額外檔案 |
| `beforeBuild` | 依賴安裝/rebuild 前 | 自訂依賴安裝邏輯（回傳 `false` 跳過） |
| `onNodeModuleFile` | 每個 node_module 檔案 | 篩選要包含的模組檔案 |

> **已知限制**：`beforePack` 和 `afterPack` 在 Universal build 時**不會**對合併後的 universal app 觸發，只會在個別 x64/arm64 build 時觸發。

**來源**：[Build Hooks - electron-builder](https://www.electron.build/hooks.html)

### 2.5 DMG 視窗外觀自訂

#### 完整 DMG 設定範例

```json
{
  "build": {
    "dmg": {
      "background": "build/dmg-background.png",
      "backgroundColor": "#ffffff",
      "icon": "build/volume-icon.icns",
      "iconSize": 100,
      "iconTextSize": 14,
      "title": "${productName} ${version}",
      "window": {
        "x": 400,
        "y": 400,
        "width": 540,
        "height": 380
      },
      "contents": [
        { "x": 130, "y": 220 },
        { "x": 410, "y": 220, "type": "link", "path": "/Applications" }
      ],
      "format": "UDZO",
      "sign": false,
      "internetEnabled": false
    }
  }
}
```

#### DMG 設定說明

| 選項 | 預設值 | 說明 |
|------|-------|------|
| `background` | `build/background.tiff` 或 `.png` | 背景圖，建議 540x380px（支援 `@2x` Retina） |
| `backgroundColor` | `#ffffff` | 無背景圖時的背景色（CSS 色碼） |
| `icon` | `build/icon.icns` | 掛載時的 Volume 圖示 |
| `iconSize` | `80` | DMG 內所有圖示大小 |
| `iconTextSize` | `12` | 圖示下方文字大小 |
| `window` | - | 視窗位置與大小（y 座標從螢幕底部算起） |
| `contents` | - | 圖示位置陣列（x, y 為圖示中心點，不含 label） |
| `format` | `UDZO` | 壓縮格式：UDZO/UDRW/UDRO/UDCO/UDBZ/ULFO |
| `sign` | `false` | 是否簽名 DMG（不建議與 notarize 同時使用） |

#### 背景圖製作要點

- 標準解析度：540 x 380 px
- Retina：提供 `background@2x.png`（1080 x 760 px）
- 格式：PNG 或 TIFF
- 放置於 `build/` 目錄

**來源**：[DMG - electron-builder](https://www.electron.build/dmg.html)

---

## 3. 資源嵌入與 Native Addon

### 3.1 extraResources 設定

將額外檔案複製到 app 的 resources 目錄（macOS: `Contents/Resources`，Windows/Linux: `resources`）。

```json
{
  "build": {
    "extraResources": [
      {
        "from": "assets/binaries/${os}",
        "to": "binaries",
        "filter": ["**/*"]
      },
      "assets/config/**"
    ]
  }
}
```

**執行時存取 extraResources**：

```javascript
const path = require('path')

// 開發環境
const devPath = path.join(__dirname, '../assets/binaries')

// 打包後環境
const prodPath = path.join(process.resourcesPath, 'binaries')

const resourcePath = app.isPackaged ? prodPath : devPath
```

### 3.2 Native Addon（.node 檔案）打包注意事項

#### 自動偵測與解包

electron-builder **自動偵測**需要解包的 native module，通常不需手動設定 `asarUnpack`。

#### 手動指定解包（當自動偵測失敗時）

```json
{
  "build": {
    "asarUnpack": [
      "node_modules/better-sqlite3/**",
      "node_modules/sharp/**",
      "**/*.node"
    ]
  }
}
```

#### 存取解包的 Native Module

```javascript
const path = require('path')

// asar 打包後，native module 會在 app.asar.unpacked 目錄
const unpackedDir = path.resolve(__dirname, '..', 'app.asar.unpacked')
const nativeModule = require(
  path.join(unpackedDir, 'node_modules', 'better-sqlite3')
)
```

### 3.3 Native Module Rebuild

#### electron-builder 內建 rebuild

```json
{
  "build": {
    "npmRebuild": true,
    "nativeRebuilder": "sequential",
    "nodeGypRebuild": false
  }
}
```

| 選項 | 預設值 | 說明 |
|------|-------|------|
| `npmRebuild` | `true` | 打包前自動 rebuild native dependencies |
| `nativeRebuilder` | `sequential` | rebuild 模式：`legacy` / `sequential` / `parallel` |
| `nodeGypRebuild` | `false` | 是否執行 `node-gyp rebuild` |

#### @electron/rebuild 獨立使用

```bash
# 安裝
npm install --save-dev @electron/rebuild

# 執行 rebuild
npx electron-rebuild

# 或加入 package.json scripts
```

```json
{
  "scripts": {
    "postinstall": "electron-rebuild",
    "rebuild": "electron-rebuild -f -w better-sqlite3"
  }
}
```

> **注意**：`@electron/rebuild` 需要 Node v22.12.0+。

**來源**：
- [Native Node Modules - Electron](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)
- [@electron/rebuild](https://github.com/electron/rebuild)

---

## 4. Auto-Update（electron-updater）

### 4.1 無簽名 App 的 Auto-Update 限制

| 平台 | 無簽名可否 Auto-Update | 說明 |
|------|----------------------|------|
| **macOS** | **不可** | Squirrel.Mac 要求 app 必須簽名 |
| **Windows** | **有限制** | 可運作但會觸發 SmartScreen 警告，code signature validation 會失敗 |
| **Linux** | **可** | AppImage 格式不強制簽名 |

> **結論**：macOS 上必須簽名才能使用 auto-update，這是 Squirrel.Mac 框架的硬性要求，無 workaround。

### 4.2 GitHub Releases 作為更新源

#### package.json 設定

```json
{
  "build": {
    "publish": {
      "provider": "github",
      "owner": "your-username",
      "repo": "your-repo"
    }
  }
}
```

#### 主程序程式碼

```typescript
import { autoUpdater } from 'electron-updater'
import log from 'electron-log'

// 設定 logger
autoUpdater.logger = log
log.transports.file.level = 'debug'

// 檢查更新
autoUpdater.checkForUpdatesAndNotify()

// 事件監聽
autoUpdater.on('update-available', (info) => {
  log.info('有可用更新:', info.version)
})

autoUpdater.on('download-progress', (progress) => {
  log.info(`下載進度: ${progress.percent.toFixed(1)}%`)
})

autoUpdater.on('update-downloaded', (info) => {
  // 提示使用者重啟安裝
  autoUpdater.quitAndInstall()
})
```

#### 私有 Repository

```json
{
  "build": {
    "publish": {
      "provider": "github",
      "owner": "your-username",
      "repo": "your-private-repo",
      "private": true,
      "token": "${GH_TOKEN}"
    }
  }
}
```

> **注意**：GitHub API 限制約 5000 requests/hour，每次更新檢查使用多個 request，私有 repo 僅適合少量使用者場景。

#### 發布流程

```bash
# Build 並發布到 GitHub Releases
electron-builder build --publish always

# 或只 build，稍後手動上傳
electron-builder build --publish never
```

### 4.3 差異更新（Differential Update / Blockmap）

#### 運作原理

1. 打包時 electron-builder 自動產生 `.blockmap` 檔案
2. 更新時，updater 下載新舊兩個 blockmap
3. 比對兩個 blockmap，找出變更的 block
4. 僅下載變更的 block（通常 < 1MB）

#### 設定

```json
{
  "build": {
    "publish": {
      "provider": "github"
    },
    "win": {
      "target": "nsis"
    }
  }
}
```

差異更新**預設啟用**，electron-builder 會自動產生 `.blockmap` 檔案。

#### 停用差異更新

若需停用（例如遇到 checksum 問題）：

```typescript
autoUpdater.disableDifferentialDownload = true
```

#### 已知問題

- 即使設定 `differentialPackage: false`，electron-builder 仍可能嘗試下載 blockmap
- Windows 上偶有 checksum 錯誤的回報
- 私有 GitHub repo 的差異更新需額外設定 token

**來源**：
- [Auto Update - electron-builder](https://www.electron.build/auto-update.html)
- [GitHub Issue #2912](https://github.com/electron-userland/electron-builder/issues/2912)

---

## 5. Windows NSIS Installer

### 5.1 安裝模式設定

#### 單使用者安裝（Per-User，預設）

```json
{
  "build": {
    "nsis": {
      "oneClick": true,
      "perMachine": false
    }
  }
}
```

- 安裝至 `%LOCALAPPDATA%\Programs\{app-name}`
- 不需要管理員權限
- 僅目前使用者可用

#### 所有使用者安裝（Per-Machine）

```json
{
  "build": {
    "nsis": {
      "oneClick": false,
      "perMachine": true,
      "allowElevation": true,
      "allowToChangeInstallationDirectory": true
    }
  }
}
```

- 安裝至 `C:\Program Files\{app-name}`
- 需要管理員權限（UAC 提升）
- 所有使用者可用

#### 讓使用者選擇

```json
{
  "build": {
    "nsis": {
      "oneClick": false,
      "perMachine": false,
      "allowElevation": true,
      "selectPerMachineByDefault": false
    }
  }
}
```

### 5.2 完整 NSIS 設定參考

```json
{
  "build": {
    "nsis": {
      "oneClick": false,
      "perMachine": false,
      "allowElevation": true,
      "allowToChangeInstallationDirectory": true,
      "selectPerMachineByDefault": false,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true,
      "runAfterFinish": true,
      "deleteAppDataOnUninstall": false,
      "displayLanguageSelector": false,
      "include": "build/installer.nsh",
      "installerIcon": "build/installerIcon.ico",
      "uninstallerIcon": "build/uninstallerIcon.ico",
      "installerHeaderIcon": "build/installerHeaderIcon.ico",
      "license": "LICENSE"
    }
  }
}
```

| 選項 | 預設值 | 說明 |
|------|-------|------|
| `oneClick` | `true` | 一鍵安裝（無安裝精靈） |
| `perMachine` | `false` | 安裝給所有使用者 |
| `allowElevation` | `true` | 允許 UAC 權限提升 |
| `allowToChangeInstallationDirectory` | `false` | 允許變更安裝路徑 |
| `selectPerMachineByDefault` | `false` | 預設選擇「所有使用者」 |
| `createDesktopShortcut` | `true` | 建立桌面捷徑 |
| `deleteAppDataOnUninstall` | `false` | 解除安裝時刪除 AppData |
| `displayLanguageSelector` | `false` | 顯示語言選擇 |
| `include` | `build/installer.nsh` | 自訂 NSIS include 腳本 |

> **已知問題**：Windows 10 上的 per-machine 安裝有時表現為 per-user（與 UAC 設定有關）。

**來源**：[NSIS - electron-builder](https://www.electron.build/nsis.html)

---

## 6. Electron Forge vs electron-builder（2024-2025 比較）

### 6.1 哲學差異

| 面向 | Electron Forge | electron-builder |
|------|---------------|-----------------|
| **設計理念** | 整合 Electron 官方第一方工具 | 自建完整解決方案，替換部分官方工具 |
| **核心模組** | 使用 `@electron/packager` 等官方模組 | 自有實作，減少外部依賴 |
| **維護者** | Electron 核心團隊 + 社群 | 社群維護 |
| **新功能跟進** | 第一時間支援（ASAR integrity、Universal build） | 需另行實作 |

### 6.2 功能比較

| 功能 | Electron Forge | electron-builder |
|------|---------------|-----------------|
| Auto-update | 需搭配 `@electron/update` | 內建 `electron-updater` |
| 安裝格式 | Squirrel、DMG、deb、rpm | NSIS、DMG、AppImage、deb、rpm、snap |
| Code Signing | 支援 | 支援 |
| 自訂 Build 流程 | Plugin 架構 | Hook 架構 |
| 學習曲線 | 中等 | 低（設定導向） |
| 文件完整度 | 良好 | 良好 |

### 6.3 數據比較（2025）

| 指標 | Electron Forge | electron-builder |
|------|---------------|-----------------|
| npm 週下載量 | ~1,775 | ~1,189,000+ |
| GitHub Stars | ~6,995 | ~14,462 |
| 社群生態 | 成長中 | 成熟穩定 |

### 6.4 選擇建議

**選 Electron Forge 的情況**：
- 新專案，想跟隨 Electron 官方最佳實踐
- 需要第一時間使用 Electron 新功能
- 使用 Electron 官方推薦的工具鏈

**選 electron-builder 的情況**：
- 需要 NSIS installer（Windows 自訂安裝精靈）
- 需要豐富的打包格式支援
- 既有專案已使用 electron-builder
- 需要內建 auto-update 解決方案
- 社群資源和問題解答較多

**來源**：
- [Why Electron Forge?](https://www.electronforge.io/core-concepts/why-electron-forge)
- [npm trends 比較](https://npmtrends.com/electron-builder-vs-electron-forge)

---

## 7. 打包常見問題

### 7.1 ASAR 打包後 __dirname 路徑問題

#### 問題描述

打包後 `__dirname` 指向 `app.asar` 內部的虛擬路徑，而非實際檔案系統路徑。

```
// 開發時
__dirname → /path/to/project/src

// 打包後
__dirname → /path/to/app/Contents/Resources/app.asar/src
```

#### 解決方案

```javascript
const path = require('path')
const { app } = require('electron')

// 方案一：使用 app.isPackaged 判斷
const getResourcePath = (filename) => {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, filename)
  }
  return path.join(__dirname, '..', 'assets', filename)
}

// 方案二：使用 extraResources 搭配 process.resourcesPath
// 將需要實際存取的檔案放在 extraResources
// 打包後透過 process.resourcesPath 存取
```

### 7.2 Native Module 找不到

#### 常見錯誤

```
Error: Cannot find module '/path/to/app.asar/node_modules/better-sqlite3/...'
Error: Module did not self-register
```

#### 解決方案

**步驟一：確保 asarUnpack 設定正確**

```json
{
  "build": {
    "asarUnpack": ["**/*.node", "node_modules/better-sqlite3/**"]
  }
}
```

**步驟二：確認 rebuild 正常執行**

```bash
# 清理並重新 rebuild
rm -rf node_modules
npm install
npx electron-rebuild
```

**步驟三：檢查架構匹配**

```bash
# 確認 native module 架構
file node_modules/better-sqlite3/build/Release/better_sqlite3.node
# 應顯示正確的架構（arm64 或 x86_64）
```

### 7.3 Windows delay-load hook

Windows 上 Electron 4.x+ 的 native module 必須啟用 delay-load hook：

```python
# binding.gyp
{
  "targets": [{
    "target_name": "my_native_module",
    "conditions": [
      ["OS=='win'", {
        "msvs_settings": {
          "VCLinkerTool": {
            "DelayLoadDLLs": ["node.exe"]
          }
        }
      }]
    ],
    "variables": {
      "win_delay_load_hook": "true"
    }
  }]
}
```

---

## 8. 多平台 Cross-Compile

### 8.1 平台支援矩陣

| 建置主機 | macOS | Windows | Linux |
|---------|-------|---------|-------|
| **macOS** | 原生支援 | 支援（需 Wine，不含 AppX） | 支援 |
| **Windows** | 不支援 | 原生支援 | 有限支援 |
| **Linux** | 不支援 | 支援（需 Wine 2.0+） | 原生支援 |

### 8.2 在 macOS 上 Build Windows Installer

```bash
# 安裝 Wine
brew install --cask wine-stable

# Build Windows NSIS installer
electron-builder build --win --x64

# 同時 Build 多平台
electron-builder build -mwl
```

**限制**：
- **macOS code signing** 只能在 macOS 上執行
- **AppX**（Windows Store）不能在 macOS 上 build
- **Squirrel.Windows** 需要額外安裝 Mono 4.2+
- **Native dependencies** 若無 prebuild binary，只能在目標平台 compile

### 8.3 Docker 建置環境

```bash
# Linux + Windows targets
docker run --rm -it \
  -v ${PWD}:/project \
  -v ~/.cache/electron:/root/.cache/electron \
  electronuserland/builder:wine \
  /bin/bash -c "cd /project && npm install && electron-builder -wl"
```

可用的 Docker image：

| Image | 用途 |
|-------|------|
| `electronuserland/builder` | Linux targets |
| `electronuserland/builder:wine` | Windows + Linux targets |
| `electronuserland/builder:wine-mono` | Windows (Squirrel) + Linux |

### 8.4 CI/CD 建議

| CI 服務 | 建議用途 |
|--------|---------|
| GitHub Actions | macOS + Windows + Linux（推薦） |
| Travis CI | macOS + Linux |
| AppVeyor | Windows（需要 AppX 或無 prebuild 的 native deps 時） |

#### GitHub Actions 範例

```yaml
name: Build & Release
on:
  push:
    tags: ['v*']

jobs:
  build:
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npx electron-builder build --publish always
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**來源**：[Multi Platform Build - electron-builder](https://www.electron.build/multi-platform-build.html)

---

## 9. 完整 electron-builder 設定範例

以下為一個涵蓋主要功能的完整設定範例：

```json
{
  "build": {
    "appId": "com.example.myapp",
    "productName": "My App",
    "directories": {
      "output": "release"
    },
    "files": [
      "dist/**/*",
      "!**/*.map"
    ],
    "extraResources": [
      {
        "from": "assets/binaries/${os}/${arch}",
        "to": "binaries",
        "filter": ["**/*"]
      }
    ],
    "asarUnpack": [
      "**/*.node",
      "node_modules/better-sqlite3/**"
    ],
    "mac": {
      "identity": null,
      "category": "public.app-category.utilities",
      "target": [
        { "target": "dmg", "arch": ["arm64"] }
      ],
      "extendInfo": {
        "LSMinimumSystemVersion": "11.0"
      },
      "hardenedRuntime": true,
      "darkModeSupport": true
    },
    "dmg": {
      "background": "build/dmg-background.png",
      "iconSize": 100,
      "contents": [
        { "x": 130, "y": 220 },
        { "x": 410, "y": 220, "type": "link", "path": "/Applications" }
      ]
    },
    "win": {
      "target": "nsis",
      "icon": "build/icon.ico"
    },
    "nsis": {
      "oneClick": false,
      "perMachine": false,
      "allowElevation": true,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true
    },
    "linux": {
      "target": ["AppImage"],
      "category": "Utility"
    },
    "publish": {
      "provider": "github",
      "owner": "your-username",
      "repo": "your-repo"
    },
    "afterPack": "./build/afterPack.js",
    "afterSign": "./build/afterSign.js",
    "npmRebuild": true,
    "nativeRebuilder": "sequential"
  }
}
```

---

## 參考資料

### 官方文件
- [electron-builder 官方網站](https://www.electron.build/index.html)
- [macOS 設定](https://www.electron.build/mac.html)
- [DMG 設定](https://www.electron.build/dmg.html)
- [NSIS 設定](https://www.electron.build/nsis.html)
- [Build Hooks](https://www.electron.build/hooks.html)
- [Auto Update](https://www.electron.build/auto-update.html)
- [Code Signing (macOS)](https://www.electron.build/code-signing-mac.html)
- [Multi Platform Build](https://www.electron.build/multi-platform-build.html)
- [Common Configuration](https://www.electron.build/configuration.html)
- [CLI](https://www.electron.build/cli.html)

### Electron 官方
- [Native Node Modules](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)
- [Code Signing](https://www.electronjs.org/docs/latest/tutorial/code-signing)
- [@electron/universal](https://github.com/electron/universal)
- [@electron/rebuild](https://github.com/electron/rebuild)

### GitHub Issues（問題追蹤）
- [v26.0.4 builds broken - #8842](https://github.com/electron-userland/electron-builder/issues/8842)
- [v26.0.12 breaks build - #9020](https://github.com/electron-userland/electron-builder/issues/9020)
- [Packaging speed v22 vs v26 - #9094](https://github.com/electron-userland/electron-builder/issues/9094)
- [Universal build hooks issue - #6815](https://github.com/electron-userland/electron-builder/issues/6815)

### 社群文章
- [Why Electron Forge?](https://www.electronforge.io/core-concepts/why-electron-forge)
- [npm trends: electron-builder vs electron-forge](https://npmtrends.com/electron-builder-vs-electron-forge)
- [Implementing Auto-Updates in Electron](https://blog.nishikanta.in/implementing-auto-updates-in-electron-with-electron-updater)
