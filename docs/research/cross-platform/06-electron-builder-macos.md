# electron-builder macOS 打包研究（DMG / PKG）

> 收集日期：2026-03-10
> 適用版本：electron-builder v25+、Electron v30+、macOS 14 Sonoma / 15 Sequoia

---

## 目錄

1. [electron-builder.yml macOS + DMG 完整配置範例](#1-electron-builderyml-macos--dmg-完整配置範例)
2. [Code Signing 必要性與 Gatekeeper 行為](#2-code-signing-必要性與-gatekeeper-行為)
3. [Apple Silicon vs Intel：universal binary 設定](#3-apple-silicon-vs-intel-universal-binary-設定)
4. [macOS Entitlements 設定](#4-macos-entitlements-設定)
5. [Hardened Runtime 對 Electron App 的影響](#5-hardened-runtime-對-electron-app-的影響)
6. [macOS Notarization 基本流程](#6-macos-notarization-基本流程)
7. [DMG 視覺自訂](#7-dmg-視覺自訂)
8. [PKG vs DMG 選擇建議](#8-pkg-vs-dmg-選擇建議)
9. [來源連結](#9-來源連結)

---

## 1. electron-builder.yml macOS + DMG 完整配置範例

```yaml
appId: "com.example.auto-backup"
productName: "Auto Backup"

mac:
  category: "public.app-category.utilities"
  icon: "build/icon.icns"
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: "build/entitlements.mac.plist"
  entitlementsInherit: "build/entitlements.mac.plist"
  target:
    - target: dmg
      arch:
        - universal   # arm64 + x64 同一檔案
    - target: zip
      arch:
        - universal

dmg:
  title: "${productName} ${version}"
  icon: "build/dmg-icon.icns"     # 掛載後顯示的磁碟圖示，null 則使用系統預設
  background: "build/background.png"   # 540x380px；Retina 用 background@2x.png
  backgroundColor: "#f0f0f0"      # 無背景圖時的 fallback 色
  iconSize: 80
  iconTextSize: 12
  format: "UDZO"                  # 壓縮格式；ULFO 最小但需 macOS 10.11+
  window:
    x: 400
    y: 300
    width: 540
    height: 380
  contents:
    - x: 130       # App 圖示位置（中心點，1x 比例）
      y: 190
      type: file
    - x: 410       # /Applications 捷徑位置
      y: 190
      type: link
      path: /Applications

# 僅在需要 PKG 格式時加入
# pkg:
#   allowAnywhere: true
#   allowCurrentUserHome: false
#   isRelocatable: false
#   license: "LICENSE"

afterSign: "scripts/notarize.js"  # notarization hook（需簽名流程時啟用）
```

### 關鍵 mac 選項說明

| 選項 | 預設值 | 說明 |
|------|--------|------|
| `hardenedRuntime` | `true` | 啟用強化執行時期保護，notarization 必要條件 |
| `gatekeeperAssess` | `false` | 讓 osx-sign 驗證簽名，通常關閉以避免 CI 問題 |
| `entitlements` | — | 主 process 的 entitlements plist 路徑 |
| `entitlementsInherit` | — | Helper processes 繼承的 entitlements |
| `identity` | 自動偵測 | 指定簽名憑證名稱；`null` 跳過；`-` ad-hoc 簽名 |
| `forceCodeSigning` | `false` | `true` 時若未簽名則 build 失敗 |
| `type` | `distribution` | 簽名類型：`distribution`（App Store）或 `development` |

---

## 2. Code Signing 必要性與 Gatekeeper 行為

### 未簽名 App 的 Gatekeeper 行為

| macOS 版本 | 未簽名 App 預設行為 |
|------------|---------------------|
| macOS 10.14 Mojave 以前 | 顯示警告，可直接 Control+Click → Open 繞過 |
| macOS 10.15 Catalina～13 Ventura | 直接封鎖；需到「隱私與安全性」手動放行 |
| macOS 14 Sonoma | 同上，每次下載後需重新放行 |
| macOS 15 Sequoia | 更嚴格：移除舊版 Control-Click 直接 Open 的快捷方式；需透過「系統設定 → 隱私與安全性」點選放行並輸入管理員密碼 |

macOS 15.1 更進一步限制未簽名 App 的執行能力。

### 使用者繞過方式（未簽名 App）

**方法 1：系統設定放行（Sequoia 推薦方式）**
1. 嘗試開啟 App，出現封鎖提示
2. 前往「系統設定 → 隱私與安全性 → 安全性」
3. 找到被封鎖的 App，點選「仍要開啟」
4. 輸入管理員密碼確認

**方法 2：移除 Quarantine 屬性（開發者工具）**
```bash
xattr -d com.apple.quarantine /path/to/App.app
```

**方法 3：暫時關閉 Gatekeeper（不建議一般用戶）**
```bash
sudo spctl --master-disable
# ... 安裝後重新啟用
sudo spctl --master-enable
```

### 建議

- MVP 內部測試：可接受未簽名，提供使用者繞過說明
- 公開發佈：必須簽名 + notarization，否則 macOS Sequoia 用戶體驗極差

---

## 3. Apple Silicon vs Intel：universal binary 設定

### 架構選項

```yaml
mac:
  target:
    - target: dmg
      arch:
        - universal   # 推薦：單一檔案同時支援 arm64 + x64
        # 或分別指定：
        # - arm64
        # - x64
```

### Universal Binary 運作原理

`@electron/universal` 套件將 x64 和 arm64 兩個 Electron app 合併為一個 Universal Binary：
- 若使用 ASAR archive，可設定 `mergeASARs: true` 合併以減少檔案大小
- Native modules（.node 檔案）需為各架構編譯版本，透過 `singleArchFiles` 或 `x64ArchFiles` 設定例外

```yaml
mac:
  mergeASARs: true
  # 僅存在於 x64 的二進位（不合併）
  x64ArchFiles: "native_modules/**/x64/**"
```

### 架構選擇建議

| 情境 | 建議 |
|------|------|
| 公開發佈（涵蓋所有 Mac） | `universal` |
| 僅支援 Apple Silicon 機器 | `arm64` |
| CI 快速 build（測試用） | 各自 `arm64`、`x64` 分別 build |
| 檔案大小敏感 | 分開 `arm64` + `x64` 兩個 DMG |

### ARM / Universal Build 的簽名注意事項

ARM 和 universal builds 預設只會收到 **ad-hoc 簽名**（不需要 Apple Developer 帳號）。要正式分發必須使用 Developer ID Application 憑證。

---

## 4. macOS Entitlements 設定

### 基本 entitlements.mac.plist（Electron app 最低需求）

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <!-- Electron 必要：允許 JIT 編譯 -->
  <key>com.apple.security.cs.allow-jit</key>
  <true/>

  <!-- Electron 必要：允許未簽名可執行記憶體 -->
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>

  <!-- 若有載入第三方 native modules 或 Electron 內部 framework -->
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>

  <!-- 網路相關：允許建立對外 TCP/IP 連線（client） -->
  <key>com.apple.security.network.client</key>
  <true/>

  <!-- 網路相關：允許接受傳入連線（server，如需本地 server） -->
  <!-- <key>com.apple.security.network.server</key>
  <true/> -->
</dict>
</plist>
```

### Entitlement 詳細說明

| Entitlement | 必要性 | 說明 |
|-------------|--------|------|
| `cs.allow-jit` | **必要** | Electron V8 引擎需要 JIT 編譯 |
| `cs.allow-unsigned-executable-memory` | **必要** | V8 需要可寫且可執行的記憶體 |
| `cs.disable-library-validation` | **建議加入** | 允許載入非同一開發者簽名的 framework（如 Electron 內部元件） |
| `network.client` | 視需求 | 允許 App 發起網路連線（HTTP、TCP 等） |
| `network.server` | 視需求 | 允許 App 接受傳入連線（本地 server） |

### App Sandbox（沙盒）注意事項

若啟用 App Sandbox（`com.apple.security.app-sandbox`），需為每個功能添加對應 entitlement，且與 hardened runtime 的衝突需特別處理。**一般非 App Store 發佈不需要啟用 sandbox**。

---

## 5. Hardened Runtime 對 Electron App 的影響

### 什麼是 Hardened Runtime

Hardened Runtime 是 Apple 在 macOS 10.14 引入的安全機制，限制 App 的執行能力，防止某些類型的程式碼注入攻擊。**Notarization 必須啟用 Hardened Runtime**。

### 對 Electron 的影響

啟用 `hardenedRuntime: true` 後，以下功能預設被限制，需透過 entitlement 明確申請：

| 限制項目 | Entitlement 解除方式 |
|---------|---------------------|
| JIT 編譯（V8 引擎必要） | `com.apple.security.cs.allow-jit` |
| 可執行記憶體分配 | `com.apple.security.cs.allow-unsigned-executable-memory` |
| 載入未簽名的 dylib | `com.apple.security.cs.disable-library-validation` |
| 相機存取 | `com.apple.security.device.camera` |
| 麥克風存取 | `com.apple.security.device.microphone` |
| 位置資訊 | `com.apple.security.personal-information.location` |

### 常見問題：App 在 Hardened Runtime 下崩潰

最常見原因是缺少 `cs.disable-library-validation`，導致無法載入 Electron 內部 framework（由不同憑證簽名）。

```xml
<!-- 加入此 entitlement 解決崩潰問題 -->
<key>com.apple.security.cs.disable-library-validation</key>
<true/>
```

### 配置建議

```yaml
# electron-builder.yml
mac:
  hardenedRuntime: true       # 必須開啟以通過 notarization
  gatekeeperAssess: false     # 避免 CI 環境中 Gatekeeper 評估失敗
  entitlements: "build/entitlements.mac.plist"
  entitlementsInherit: "build/entitlements.mac.plist"
```

---

## 6. macOS Notarization 基本流程

### Notarization 是否必要？

| 情境 | 是否需要 Notarization |
|------|----------------------|
| 內部測試 / 少數受信任用戶 | 否（提供繞過說明即可） |
| 公開下載分發 | **是**（macOS Sequoia 幾乎無法繞過） |
| Mac App Store 分發 | 否（App Store 審核流程替代） |
| MVP 驗證階段 | 視情況（若僅限開發者自測則否） |

> 自 macOS 10.14.5 起，新開發者發佈的 App 必須完成 notarization 才能讓一般用戶順利執行。

### 前置條件

1. Apple Developer Program 會員資格（US$99/年）
2. Developer ID Application 憑證（非 Mac App Store 用）
3. Apple ID 的 app-specific password（從 appleid.apple.com 產生）

### Notarization 流程

```
[Build App] → [Code Sign with hardenedRuntime] → [Notarize .app] → [Staple ticket] → [Package into DMG]
```

**重要**：先 notarize `.app`，再打包進 DMG。DMG 本身不需要 notarize（也不建議 sign DMG，會與 notarization 衝突）。

### afterSign Hook 實作

**scripts/notarize.js**：

```javascript
const { notarize } = require("@electron/notarize");
const { build } = require("../package.json");

const notarizeMacos = async (context) => {
  const { electronPlatformName, appOutDir } = context;

  // 僅 macOS 執行
  if (electronPlatformName !== "darwin") return;

  // 僅 CI 環境執行（本地開發跳過）
  if (process.env.CI !== "true") {
    console.warn("Skipping notarization: not running in CI");
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  console.log(`Notarizing ${appPath}...`);

  await notarize({
    tool: "notarytool",          // 新版 API（xcrun notarytool）
    appBundleId: build.appId,
    appPath,
    teamId: process.env.TEAM_ID,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    verbose: true,
  });

  console.log("Notarization completed.");
};

exports.default = notarizeMacos;
```

**electron-builder.yml 掛接**：

```yaml
afterSign: "scripts/notarize.js"
```

### 所需環境變數

```bash
APPLE_ID=your@email.com
APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx  # appleid.apple.com 產生
TEAM_ID=XXXXXXXXXX                                 # Apple Developer Team ID
```

### 不做 Notarization 時的替代方案（MVP 階段）

1. **Ad-hoc 簽名** + 提供 `xattr -d com.apple.quarantine` 指令給用戶
2. **跳過簽名** + 說明文件（僅限內部測試場景）
3. 優先完成 Windows 版本，macOS 後期補齊簽名流程

---

## 7. DMG 視覺自訂

### 背景圖規格

| 規格 | 建議值 |
|------|--------|
| 標準解析度（1x）| `540 × 380 px`（PNG 或 TIFF） |
| Retina 解析度（2x）| `1080 × 760 px`，命名 `background@2x.png` |
| 格式 | PNG（透明支援）或 TIFF（同時包含 1x + 2x） |
| 放置路徑 | `build/background.png`（預設）或透過 `dmg.background` 指定 |

### 完整視覺配置範例

```yaml
dmg:
  title: "${productName} ${version}"
  background: "build/background.png"
  backgroundColor: "#f8f8f8"    # 無背景圖時的 fallback
  icon: "build/dmg-icon.icns"  # 掛載後的磁碟圖示
  iconSize: 100                 # 圖示大小（px），預設 80
  iconTextSize: 13              # 圖示標籤字體大小，預設 12
  format: "UDZO"                # 推薦 UDZO（ZIP 壓縮），或 ULFO（更小但需 10.11+）

  window:                       # DMG 視窗設定
    x: 400                      # 視窗左上角 x 座標
    y: 300                      # 視窗左上角 y 座標（Finder 座標系：由下而上）
    width: 540
    height: 380

  contents:                     # 圖示位置（中心點座標，1x 比例）
    - x: 130                    # App 圖示
      y: 190
      type: file
      # path 留空 → 自動使用打包的 .app
    - x: 410                    # /Applications 捷徑
      y: 190
      type: link
      path: /Applications
```

### 圖示座標系注意事項

- `contents` 中的 `x`、`y` 是**圖示中心點**的座標（不含標籤）
- 座標以 **1x 比例**計算，即使在 Retina 顯示器上
- `window.y` 使用 Finder 座標系（**由下往上**），數值越大表示越靠上

### 常用佈局範例

```yaml
# 左 App → 右 Applications 的標準佈局（540x380 視窗）
contents:
  - x: 130   # 左側 1/4 處
    y: 190   # 垂直置中
    type: file
  - x: 410   # 右側 3/4 處
    y: 190
    type: link
    path: /Applications
```

### DMG 授權協議

```yaml
# 多語系授權協議（放在 build/ 目錄下）
# build/license_en.txt
# build/license_zh.txt
# build/licenseButtons_zh.json
```

---

## 8. PKG vs DMG 選擇建議

### 格式比較

| 特性 | DMG | PKG |
|------|-----|-----|
| 使用者體驗 | 拖拉到 Applications | 標準安裝精靈 |
| 安裝位置控制 | 用戶自選 | 可強制指定 |
| 版本升級管理 | 不支援 | 支援（`overwriteAction`） |
| 需要管理員密碼 | 否（安裝到 /Applications） | 通常需要 |
| Notarization 穩定性 | 高 | 有已知問題（部分 electron-builder 版本）|
| Auto-update 支援 | 是（Squirrel.Mac） | 否 |
| 適用場景 | 一般公開發佈 | 企業部署、系統層級安裝 |
| Mac App Store | 否（用 mas target） | 否（用 mas target） |

### PKG 的主要配置選項

```yaml
pkg:
  allowAnywhere: true           # 可安裝到任意 volume
  allowCurrentUserHome: true    # 可安裝到使用者 Home 目錄
  allowRootDirectory: true      # 可安裝到根目錄
  isRelocatable: false          # 安裝後是否可移動
  isVersionChecked: true        # 若已有更新版本則阻止安裝
  overwriteAction: upgrade      # upgrade（覆蓋）或 update（保留未修改）
  license: "LICENSE"            # EULA 路徑（txt/rtf/html）
  welcome: "build/welcome.html" # 歡迎頁
  conclusion: "build/conclusion.html"  # 結尾頁
  scripts: "build/pkg-scripts"  # 自訂安裝腳本目錄
```

### 建議

**選 DMG（絕大多數情境）**：
- 一般公開發佈首選
- 支援 Squirrel.Mac auto-update
- 用戶熟悉的拖拉安裝體驗
- Notarization 流程更穩定

**選 PKG（特定需求）**：
- 需要在特定目錄安裝（如 `/usr/local/bin` 的 CLI 工具）
- 企業 MDM 部署（如 Jamf、Mosyle）
- 需要執行 pre/post-install 腳本
- 需要強制安裝位置，避免使用者移動 App

**MVP 建議**：使用 `dmg`，待功能穩定後再評估是否需要 `pkg`。

---

## 9. 來源連結

- [DMG - electron-builder 官方文件](https://www.electron.build/dmg.html)
- [DmgOptions Interface - electron-builder](https://www.electron.build/electron-builder.Interface.DmgOptions.html)
- [Any macOS Target - electron-builder](https://www.electron.build/mac.html)
- [MacOS Code Signing - electron-builder](https://www.electron.build/code-signing-mac.html)
- [PKG - electron-builder 官方文件](https://www.electron.build/pkg.html)
- [Code Signing | Electron 官方文件](https://www.electronjs.org/docs/latest/tutorial/code-signing)
- [Apple Silicon Support | Electron Blog](https://www.electronjs.org/blog/apple-silicon)
- [@electron/universal - npm](https://www.npmjs.com/package/@electron/universal)
- [How to Code Signing an Electron.js App for macOS - Security Boulevard](https://securityboulevard.com/2025/12/how-to-code-signing-an-electron-js-app-for-macos/)
- [How to code-sign and notarize an Electron app for macOS | BigBinary Blog](https://www.bigbinary.com/blog/code-sign-notorize-mac-desktop-app)
- [Notarizing your Electron application | Kilian Valkhof](https://kilianvalkhof.com/2019/electron/notarizing-your-electron-application/)
- [Notarizing your Electron application | Philo Hermans](https://philo.dev/blog/notarizing-your-electron-application)
- [macOS Sequoia: Bypassing Gatekeeper - TechBloat](https://www.techbloat.com/macos-sequoia-bypassing-gatekeeper-to-install-unsigned-apps.html)
- [macOS Sequoia removes Control-click Gatekeeper bypass - iDownloadBlog](https://www.idownloadblog.com/2024/08/07/apple-macos-sequoia-gatekeeper-change-install-unsigned-apps-mac/)
- [Safely open apps on your Mac - Apple Support](https://support.apple.com/en-us/102445)
- [Gatekeeper and runtime protection in macOS - Apple Support](https://support.apple.com/guide/security/gatekeeper-and-runtime-protection-sec5599b66df/web)
- [Notarization works for .dmg not .pkg - electron-builder issue #5103](https://github.com/electron-userland/electron-builder/issues/5103)
- [Creating an Electron DMG Installer with Custom Background - Useful Menubar Apps](https://usefulmenubarapps.com/tutorials/creating-an-electron-dmg-installer-background-image)
