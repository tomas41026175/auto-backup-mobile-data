# 同類工具技術分析

> 研究日期：2026-03-11
> 資料來源期間：2024-2025
> 用途：為 auto-backup-mobile-data 專案提供技術選型參考

## 目錄

- [1. iOS 裝置通訊協定基礎](#1-ios-裝置通訊協定基礎)
- [2. 商業工具分析](#2-商業工具分析)
- [3. macOS 原生方案](#3-macos-原生方案)
- [4. iTunes 備份格式](#4-itunes-備份格式)
- [5. 開源替代方案](#5-開源替代方案)
- [6. iOS 沙箱限制與繞過機制](#6-ios-沙箱限制與繞過機制)
- [7. Apple 近年對第三方工具的態度變化](#7-apple-近年對第三方工具的態度變化)
- [8. 社群評價摘要](#8-社群評價摘要)
- [9. 技術選型比較表](#9-技術選型比較表)
- [10. 來源連結](#10-來源連結)

---

## 1. iOS 裝置通訊協定基礎

所有第三方 iOS 管理工具（無論商業或開源）都依賴相同的底層協定棧：

### 1.1 協定層級架構

```
┌─────────────────────────────────────┐
│         應用層 (Services)            │
│  AFC / mobilebackup2 / house_arrest │
│  installation_proxy / springboard   │
│  notification_proxy / syslog_relay  │
├─────────────────────────────────────┤
│        會話層 (Lockdown)             │
│  裝置配對 / TLS 加密 / 服務啟動      │
├─────────────────────────────────────┤
│        傳輸層 (usbmuxd)             │
│  USB 多工 / TCP 轉發                │
├─────────────────────────────────────┤
│        實體層 (USB / Wi-Fi)          │
│  Lightning / USB-C / Bonjour        │
└─────────────────────────────────────┘
```

### 1.2 核心元件說明

| 元件 | 功能 | 備註 |
|------|------|------|
| **usbmuxd** | USB 多工守護程式，透過 port 62078 管理 iOS-USB 通訊 | macOS 內建，Linux 需額外安裝 |
| **lockdownd** | 裝置配對、TLS 會話建立、服務啟動閘道 | 配對記錄存於 `/var/db/lockdown`（macOS） |
| **AFC** (Apple File Conduit) | 檔案存取服務，僅限 `/var/mobile/Media` 目錄 | iTunes 用於存取媒體檔案 |
| **AFC2** | 完整檔案系統存取（需越獄安裝） | 存取 `/` 根目錄 |
| **house_arrest** | 在特定 App 沙箱內執行 AFC 伺服器 | iTunes File Sharing 功能基礎 |
| **mobilebackup2** | iOS 備份/還原服務 | idevicebackup2 與所有備份工具的核心 |

### 1.3 iOS 17+ 重大變更：CoreDevice 與 RemoteXPC

iOS 17.0 起，Apple 引入 **CoreDevice 框架**，帶來根本性架構變動：

- **開發者服務必須透過 tunnel 存取**：不再使用傳統 Developer Disk Image
- **RemoteXPC 協定**：取代部分傳統 lockdown 服務通訊
- **SRP-3072 驗證**：遠端配對採用 6 位 PIN + SRP-3072 認證
- **ChaCha20-Poly1305 加密**：安全通道加密
- **QUIC/TCP tunnel**：iOS 17.0-17.3.1 僅 macOS/Windows 支援 Wi-Fi tunnel；iOS 17.4+ 全平台支援 lockdown tunnel
- **CodeDeviceProxy**：iOS 17.4 新增的 lockdown service，簡化部分驅動步驟

**影響範圍**：開發者工具（截圖、偵錯、位置模擬）受影響最大；**備份/還原、AFC、裝置資訊等核心功能不受影響**。

---

## 2. 商業工具分析

### 2.1 iMazing

| 項目 | 詳情 |
|------|------|
| **開發商** | DigiDNA（瑞士） |
| **平台** | macOS（10.12 Sierra ~ 26 Tahoe，含 Apple Silicon 原生）、Windows（Vista ~ 11） |
| **iOS 支援** | iOS 1.0 ~ iOS 18+（含 iOS 26 預覽） |
| **連線方式** | USB（30-pin / Lightning / USB-C）+ Wi-Fi（首次 USB 配對後） |
| **加密** | AES-256 備份加密、TLS 1.2/1.3 傳輸加密 |
| **架構** | 自有 C++ 核心引擎，依賴 Apple Mobile Device 驅動（Windows 需 iTunes 元件）|

#### 技術特性

- **Time Machine 風格備份**：增量備份、排程備份、可選備份路徑（NAS/外接硬碟）
- **加密備份擴展**：啟用加密後可備份 Keychain、健康資料、Safari 歷史、通話記錄
- **CLI 支援**：iMazing CLI 可程式化操作，支援 `--partial-backup` 加速擷取
- **MDM 整合**：支援裝置監管、設定檔部署、MDM 註冊
- **部分備份**（2025 新增）：可針對特定資料類型進行快速備份

#### 定價模式（2025 變動）

| 時期 | 模式 | 價格 |
|------|------|------|
| 2025 年 6 月前 | 永久授權 + 訂閱並行 | 永久授權 $39.99/裝置 |
| 2025 年 6 月後 | **僅訂閱制** | 無限裝置年費 $64.99/年 |

> iMazing 2 將在 iOS 26（預計 2025 年 9 月）後停止維護。

### 2.2 AnyTrans

| 項目 | 詳情 |
|------|------|
| **開發商** | iMobie |
| **平台** | macOS、Windows |
| **定位** | 個人用戶檔案傳輸與備份 |

#### 與 iMazing 差異

| 特性 | AnyTrans | iMazing |
|------|----------|---------|
| Wi-Fi 連線 | 需持續 USB 連線 | 首次 USB 後可 Wi-Fi |
| 增量備份 | 支援 | 支援 |
| 企業功能 | 無 | MDM、裝置監管、批量管理 |
| 加密等級 | 標準 | AES-256 + 進階 Keychain 備份 |
| 定價 | 年費 $39.99 / 買斷 $59.99 / 家庭 $79.99 | 僅訂閱 $64.99/年 |
| 目標用戶 | 個人快速傳輸 | IT 團隊、進階用戶 |

### 2.3 3uTools

| 項目 | 詳情 |
|------|------|
| **開發商** | 中國團隊（3u.com） |
| **平台** | 原為 Windows 專屬，2024 年 4 月推出 macOS 版（v3.11） |
| **定價** | 免費 |
| **功能** | 全備份/選擇性備份、App 管理、刷機、系統維護 |

#### 技術與安全疑慮

- **閉源軟體**：技術架構未公開
- **隱私風險**：社群討論指出可能上傳用戶資料至伺服器
- **越獄整合**：歷史上與越獄社群深度整合，提供 AFC2 安裝等功能
- **資料來源不透明**：App 安裝源可能包含修改版應用

---

## 3. macOS 原生方案（Finder）

### 3.1 備份原理

自 macOS Catalina（10.15）起，iTunes 功能拆分至 Finder：

- **備份觸發**：透過 Finder 側邊欄選擇裝置 → 手動點擊「立即備份」
- **備份引擎**：底層使用與 iTunes 相同的 `mobilebackup2` 服務
- **備份位置**：`~/Library/Application Support/MobileSync/Backup/{UDID}`
- **加密選項**：可啟用本地加密備份（AES-256）

### 3.2 程式化操作限制

| 方式 | 可行性 | 說明 |
|------|--------|------|
| AppleScript | 極度受限 | Finder 的 iOS 裝置管理介面**沒有 AppleScript 字典**，無法透過 AppleScript 觸發備份 |
| Automator | 不可行 | 同上，無可腳本化的介面 |
| CLI（`cfgutil`） | 有限 | Apple Configurator 附帶的 CLI，但功能有限 |
| `defaults` 命令 | 不可行 | 備份設定不透過 `defaults` 管理 |

**結論**：macOS 原生 Finder 備份**無法可靠地程式化自動化**，這是第三方工具存在的核心原因之一。

---

## 4. iTunes 備份格式

### 4.1 檔案結構

```
~/Library/Application Support/MobileSync/Backup/
└── {UDID}/                          # 以裝置 UDID 命名
    ├── Info.plist                    # 裝置資訊（機型、IMEI、名稱）
    ├── Manifest.plist               # 應用資料與備份狀態（binary plist）
    ├── Manifest.db                  # SQLite 資料庫（iOS 10+，取代 Manifest.mbdb）
    ├── Manifest.mbdb                # 二進位檔案記錄（iOS 10 前）
    ├── Status.plist                 # 備份完成狀態
    └── {SHA1-hash}/                 # 以 SHA-1 雜湊命名的備份檔案
        └── ...                      # 實際備份資料
```

### 4.2 檔案命名規則

備份檔案以 SHA-1 雜湊重新命名：

```
SHA1("HomeDomain-Library/SMS/sms.db")
= 3d0d7e5fb2ce288813306e4d4636395e047a3d28
```

格式：`SHA1("{Domain}-{RelativePath}")`

### 4.3 備份 Domain 分類

| Domain | 內容 |
|--------|------|
| `HomeDomain` | 使用者資料（簡訊、通話記錄、Safari 書籤） |
| `CameraRollDomain` | 照片與影片 |
| `AppDomain` | 第三方 App 資料 |
| `DatabaseDomain` | 通訊錄、行事曆等資料庫 |
| `MediaDomain` | 媒體檔案 |
| `KeychainDomain` | 密碼與憑證（僅加密備份） |
| `SystemPreferencesDomain` | 系統設定 |
| `WirelessDomain` | Wi-Fi 設定 |

### 4.4 Manifest.mbdb 格式（iOS 10 前）

- 6 位元組標頭：`mbdb\5\0`
- 記錄欄位：Domain、Path、LinkTarget、DataHash（SHA-1）、Mode、inode、uid、gid、timestamps、file length、protection class
- 大端序（Big-endian）數值、UTF-8 字串

### 4.5 加密機制

| 層級 | 技術 |
|------|------|
| 資料加密 | AES-256 CBC |
| 金鑰衍生 | PBKDF2-SHA256（10,000,000 輪）→ PBKDF2-SHA1（10,000 輪） |
| 金鑰管理 | 備份時建立新的 Backup Keybag，資料以新金鑰重新加密 |
| 解密需求 | 使用者設定的備份密碼 + 已知的檔案相對路徑（或透過 Manifest.db 查詢） |

### 4.6 程式化讀取

| 工具 | 語言 | 功能 |
|------|------|------|
| [iphone_backup_decrypt](https://github.com/jsharkey13/iphone_backup_decrypt) | Python | 解密加密備份、提取特定檔案 |
| `idevicebackup2` | C（libimobiledevice） | 建立/還原備份 |
| pymobiledevice3 `backup2` | Python | 完整備份/還原操作 |
| Manifest.db 直接查詢 | SQL | 透過 SQLite 瀏覽 Files 資料表定位檔案 |

---

## 5. 開源替代方案

### 5.1 libimobiledevice 生態系統

| 專案 | 語言 | 說明 |
|------|------|------|
| **libimobiledevice** | C | 核心協定庫，實作所有 iOS 原生服務通訊 |
| **usbmuxd** | C | USB 多工守護程式 |
| **idevicebackup2** | C | 備份/還原 CLI 工具 |
| **ifuse** | C | 透過 FUSE 掛載 iOS 檔案系統 |
| **ideviceinstaller** | C | App 安裝/移除 |
| **libusbmuxd** | C | usbmuxd 客戶端程式庫 |

#### iOS 17/18 相容性現況（2025）

| 功能 | 狀態 |
|------|------|
| 裝置配對/取消配對 | 正常 |
| AFC 檔案存取 | 正常 |
| 備份/還原 | 正常 |
| 裝置資訊查詢 | 正常 |
| house_arrest | 正常 |
| SpringBoard 服務 | 正常 |
| Developer Disk Image 掛載 | **不可用**（iOS 17+） |
| 截圖（idevicescreenshot） | **不可用**（iOS 17+） |
| 位置模擬 | **不可用**（iOS 17+） |
| Wi-Fi 裝置偵測 | **部分機型失敗** |

**主要阻礙**：Apple 的個人化 Developer Disk Image 與 RemoteXPC 協定未被實作。官方無明確時程表，社群建議轉向 pymobiledevice3。

### 5.2 pymobiledevice3（最活躍的替代方案）

| 項目 | 詳情 |
|------|------|
| **GitHub** | [doronz88/pymobiledevice3](https://github.com/doronz88/pymobiledevice3) |
| **語言** | 純 Python 3（無原生依賴） |
| **Python 版本** | >= 3.9（測試至 3.14） |
| **平台** | Linux、Windows、macOS |
| **授權** | GPL-3.0 |

#### 五層架構

```
┌──────────────────────────────────────┐
│  Layer 1: CLI 介面（__main__.py）     │
├──────────────────────────────────────┤
│  Layer 2: 服務抽象層                  │
│  LockdownServiceProvider 介面        │
├──────────────────────────────────────┤
│  Layer 3: 協定實作層                  │
│  Async I/O、usbmux、tunneling        │
├──────────────────────────────────────┤
│  Layer 4: 裝置服務層                  │
│  lockdownd 認證、專門服務存取          │
├──────────────────────────────────────┤
│  Layer 5: iOS 17+ 遠端基礎設施       │
│  tunneld、QUIC/TCP、TUN/TAP          │
└──────────────────────────────────────┘
```

#### 支援服務清單

| 類別 | 功能 |
|------|------|
| 裝置連線 | USB（usbmux）、TCP、Wi-Fi、RemoteXPC（iOS 17+） |
| 備份 | `backup2` 完整備份/還原 |
| 檔案存取 | AFC 媒體目錄、App 容器、crash reports |
| App 管理 | 安裝、移除、查詢 |
| 系統監控 | syslog、oslog、KDebug/strace、PCAP |
| 開發者工具 | DTX/DVT instruments、process control、截圖、位置模擬 |
| Web 偵錯 | WebInspector、JavaScript shell、Chrome DevTools Protocol |
| 設定檔管理 | 設定檔安裝/移除、監管管理 |
| 韌體操作 | IPSW 還原、Recovery Mode、DFU、TSS 簽章 |
| Tunneling | TCP port forwarding、TUN/TAP IPv6（iOS 17+ CoreDevice） |
| SpringBoard | 圖標管理、桌布、截圖、無障礙稽核 |
| 啟用 | iCloud 啟用/停用 |

#### iOS 17+ 支援

- **完整支援** CoreDevice 與 RemoteXPC 協定
- iOS 17.0-17.3.1：macOS/Windows 支援 Wi-Fi/QUIC tunnel
- iOS 17.4+：全平台透過 lockdown tunnel 支援
- 自動 fallback：遇到 `InvalidServiceError` 時自動嘗試 tunnel 連線

**優勢**：純 Python 實作、跨平台、iOS 17+ 完整支援、社群最活躍

### 5.3 go-ios

| 項目 | 詳情 |
|------|------|
| **GitHub** | [danielpaulus/go-ios](https://github.com/danielpaulus/go-ios) |
| **語言** | Go |
| **授權** | MIT |
| **活躍度** | 持續維護（2025 年仍有 issue 活動） |

#### 支援功能

| 功能 | 狀態 |
|------|------|
| 裝置列表/資訊 | 支援 |
| App 安裝/移除/列表 | 支援 |
| XCUITest 執行 | 核心功能 |
| 截圖 | 支援 |
| Crash Reports | 支援 |
| 網路封包擷取（PCAP） | 支援 |
| 裝置監管（Supervision） | 支援 |
| iOS 17+ Tunnel | 支援（HTTP-API） |
| **備份/還原** | **不支援**（非設計目標） |
| REST API | 實驗性支援 |

**定位**：專注於 CI/CD 自動化測試場景，編譯為靜態單一二進位檔，適合 DevOps 部署。**不適合備份用途**。

### 5.4 Node.js 生態系統

npm 上沒有名為 `idevice.js` 的套件，但存在多個相關專案：

| 套件 | 說明 | 狀態 |
|------|------|------|
| **[libijs](https://github.com/mceSystems/libijs)** | 純 JS 實作 usbmux/lockdown/AFC，支援 mobilebackup2 | 早期 PoC，未達生產品質（13 commits, 47 stars） |
| **[appium-ios-device](https://www.npmjs.com/package/appium-ios-device)** | Node.js 重寫 libimobiledevice，Appium 專案使用 | 活躍維護，但專注測試自動化 |
| **[ios-device-lib](https://www.npmjs.com/package/ios-device-lib)** | C++ 核心 + Node.js 封裝，NativeScript 專案 | Promise API，穩定但功能有限 |
| **[node-idevice](https://www.npmjs.com/package/node-idevice)** | 封裝 ideviceinstaller | 僅 App 安裝功能 |
| **[idevicekit](https://www.npmjs.com/package/idevicekit)** | libimobiledevice wrapper | 裝置列表、套件管理、截圖 |

**libijs 技術細節**：

- 實作協定：usbmux（完整）、lockdownd（配對/會話/服務啟動）、AFC（進階多工）
- 可存取服務：diagnostics_relay、installation_proxy、mobilebackup2、notification_proxy、springboardservices、syslog_relay
- 支援備份/還原操作
- 單一 usbmuxd 連線維護即時裝置清單
- AFC 封包編號追蹤實現多工同時請求

**結論**：Node.js 生態無成熟的 iOS 備份方案，libijs 最接近但未達生產品質。

---

## 6. iOS 沙箱限制與繞過機制

### 6.1 合法存取路徑（無需越獄）

所有合法第三方工具都透過以下機制存取 iOS 資料：

```
┌─────────────────────────────────────────────┐
│  使用者授權：「信任此電腦」對話框              │
│  ↓                                           │
│  usbmuxd 建立 USB 通道                       │
│  ↓                                           │
│  lockdownd 配對（TLS 憑證交換）               │
│  ↓                                           │
│  啟動特定服務                                 │
│  ├── AFC → /var/mobile/Media（媒體檔案）      │
│  ├── house_arrest → App 沙箱目錄              │
│  ├── mobilebackup2 → 完整備份                │
│  └── installation_proxy → App 管理            │
└─────────────────────────────────────────────┘
```

### 6.2 各服務存取範圍

| 服務 | 存取範圍 | 需要越獄 |
|------|----------|----------|
| AFC | `/var/mobile/Media`（照片、音樂、影片） | 否 |
| house_arrest | 特定 App 的 Documents/Library 目錄 | 否 |
| mobilebackup2 | 裝置完整備份（依 Domain 分類） | 否 |
| AFC2 | 完整檔案系統 `/`（root access） | **是** |

### 6.3 商業工具的「額外能力」本質

iMazing、AnyTrans 等工具並未「繞過」iOS 沙箱，而是：

1. **善用 mobilebackup2**：透過備份機制取得所有備份 Domain 的資料
2. **解析備份格式**：讀取 Manifest.db、解密加密備份，將檔案以人類可讀方式呈現
3. **house_arrest 整合**：存取支援 File Sharing 的 App 沙箱
4. **加密備份優勢**：啟用加密時可備份 Keychain、健康資料等額外內容

---

## 7. Apple 近年對第三方工具的態度變化

### 7.1 iOS 16（2022）

- **Lockdown Mode**：極端安全模式，停用部分 API（IndexedDB、File API 等）
- 備份功能不受 Lockdown Mode 影響

### 7.2 iOS 17（2023）

- **CoreDevice 框架**：開發者服務改為 tunnel 存取
- **Developer Disk Image 個人化**：每台裝置需個別簽署
- **RemoteXPC 協定**：新的裝置通訊協定
- **備份影響**：mobilebackup2 等核心備份服務**不受影響**
- **開發工具影響**：截圖、偵錯、位置模擬需要新協定支援

### 7.3 iOS 18（2024）

- **隱私宣告（Privacy Manifest）**：2024 年 5 月起，所有 App 必須宣告使用的 API 理由
- **Required Reason APIs**：特定 API 需在隱私清單中說明使用目的
- 備份相關 API 未受限制

### 7.4 iOS 26.1（2025，重大利好）

- **第三方背景照片備份**：Apple 開放 `PHBackgroundResourceUploadExtension`，允許第三方 App 在背景自動備份照片
- 使用 PhotoKit 框架，正式支援的背景上傳擴展
- **意義**：Apple 首次主動為第三方備份工具開放背景資料存取通道

### 7.5 趨勢總結

| 面向 | 趨勢 |
|------|------|
| 備份核心功能 | **穩定不變**，mobilebackup2/AFC 持續可用 |
| 開發者工具 | **收緊**，需要新協定（CoreDevice/RemoteXPC） |
| App 層級存取 | **逐步開放**（iOS 26.1 背景照片備份） |
| 隱私要求 | **持續加強**（Privacy Manifest、Required Reason APIs） |
| 配對安全性 | **加強**（SRP-3072、PIN 認證） |

---

## 8. 社群評價摘要

> 注意：Reddit（r/ios、r/jailbreak）因爬蟲限制無法直接存取，以下整理自 GitHub Issues、論壇、評測網站。

### 8.1 iMazing

- **正面**：功能最完整、企業級支援、Wi-Fi 備份、CLI 可程式化
- **負面**：2025 年轉為純訂閱制引發不滿、價格偏高
- **技術評價**：被認為是業界標準（industry standard），9to5Mac 推薦

### 8.2 libimobiledevice

- **正面**：開源、跨平台、Linux 唯一選擇
- **負面**：官方穩定版自 2020 年無新發布、iOS 17+ 開發者功能不可用
- **建議**：使用 git 版本而非穩定版以獲得最新 iOS 相容性

### 8.3 pymobiledevice3

- **正面**：2024-2025 最活躍的開源方案、iOS 17+ 完整支援、純 Python 易整合
- **負面**：GPL-3.0 授權限制商業使用
- **技術評價**：被 Frida、MVT（Mobile Verification Toolkit）等知名安全工具採用

### 8.4 3uTools

- **正面**：免費、功能豐富、越獄整合
- **負面**：隱私疑慮嚴重、中國開發背景引發信任問題、閉源
- **建議**：注重隱私的用戶應避免使用

---

## 9. 技術選型比較表

### 9.1 總覽

| 特性 | iMazing | AnyTrans | 3uTools | libimobiledevice | pymobiledevice3 | go-ios | libijs |
|------|---------|----------|---------|------------------|-----------------|--------|--------|
| 開源 | 否 | 否 | 否 | 是（LGPL） | 是（GPL-3） | 是（MIT） | 是 |
| 備份支援 | 完整 | 完整 | 完整 | 完整 | 完整 | 無 | PoC |
| macOS | 原生 | 支援 | 2024+ | 支援 | 支援 | 支援 | 支援 |
| Windows | 支援 | 支援 | 原生 | 支援 | 支援 | 支援 | 支援 |
| Linux | 否 | 否 | 否 | 支援 | 支援 | 支援 | 支援 |
| iOS 17+ | 完整 | 完整 | 完整 | 部分 | 完整 | 完整 | 未知 |
| Wi-Fi | 支援 | 受限 | 受限 | 支援 | 支援 | 支援 | 否 |
| CLI | 支援 | 否 | 否 | 完整 | 完整 | 完整 | 有限 |
| 程式化整合 | CLI | 否 | 否 | C API | Python API | Go API | JS API |
| 價格 | $64.99/年 | $39.99/年 | 免費 | 免費 | 免費 | 免費 | 免費 |
| 活躍維護 | 是 | 是 | 是 | 低 | **最高** | 是 | 低 |

### 9.2 專案適用性評估

對於 auto-backup-mobile-data 專案：

| 方案 | 適用性 | 理由 |
|------|--------|------|
| **pymobiledevice3** | 最佳 | 純 Python、備份完整支援、iOS 17+ 相容、活躍維護、可程式化 |
| **libimobiledevice** | 良好 | C API 成熟穩定、備份功能不受 iOS 17 影響，但維護緩慢 |
| **iMazing CLI** | 可選 | 功能最完整但需付費訂閱，適合商業方案 |
| **go-ios** | 不適用 | 不支援備份功能 |
| **libijs** | 不建議 | 未達生產品質 |

---

## 10. 來源連結

### 官方文件與技術規格

- [iMazing Tech Specs](https://imazing.com/tech-specs)
- [iMazing Backup Options Guide](https://imazing.com/guides/backup-options-in-imazing)
- [iMazing Licensing Policy](https://imazing.com/licensing-policy)
- [iMazing 3.4 Release Notes](https://imazing.com/blog/imazing-3-4-new-features-refined-interface-and-pro-tools-enhancements-new-apple-software-iphone-17-support)
- [libimobiledevice Official Site](https://libimobiledevice.org/)
- [iTunes Backup - The iPhone Wiki](https://www.theiphonewiki.com/wiki/ITunes_Backup)
- [AFC - The Apple Wiki](https://theapplewiki.com/wiki/AFC)
- [Apple Lockdown Mode](https://support.apple.com/en-us/105120)
- [Apple Encrypted Backups](https://support.apple.com/en-us/108353)

### 開源專案

- [pymobiledevice3 GitHub](https://github.com/doronz88/pymobiledevice3)
- [pymobiledevice3 Protocol Layers Doc](https://github.com/doronz88/pymobiledevice3/blob/master/misc/understanding_idevice_protocol_layers.md)
- [pymobiledevice3 DeepWiki](https://deepwiki.com/doronz88/pymobiledevice3)
- [go-ios GitHub](https://github.com/danielpaulus/go-ios)
- [libimobiledevice GitHub](https://github.com/libimobiledevice/libimobiledevice)
- [idevicebackup2 Source](https://github.com/libimobiledevice/libimobiledevice/blob/master/tools/idevicebackup2.c)
- [libijs GitHub](https://github.com/mceSystems/libijs)
- [appium-ios-device npm](https://www.npmjs.com/package/appium-ios-device)
- [ios-device-lib npm](https://www.npmjs.com/package/ios-device-lib)
- [iphone_backup_decrypt](https://github.com/jsharkey13/iphone_backup_decrypt)

### iOS 17+ 技術變更

- [libimobiledevice iOS 17 Status Issue](https://github.com/libimobiledevice/libimobiledevice/issues/1490)
- [Frida iOS 17 Support - NowSecure](https://www.nowsecure.com/blog/2024/08/14/the-road-to-frida-ios-17-support-and-beyond/)
- [CoreDevice Debugging - Hex-Rays](https://docs.hex-rays.com/user-guide/debugger/debugger-tutorials/ios_debugging_coredevice)
- [pymobiledevice3 RemoteXPC Doc](https://github.com/doronz88/pymobiledevice3/blob/master/misc/RemoteXPC.md)

### iOS 鑑識與安全

- [Apple Forensic - HackMag](https://hackmag.com/security/apple-forensic)
- [MVT libimobiledevice Backup Guide](https://docs.mvt.re/en/latest/ios/backup/libimobiledevice/)
- [Decrypting iPhone Backups - Medium](https://medium.com/taptuit/breaking-into-encrypted-iphone-backups-4dacc39403f0)

### 評測與比較

- [iMazing vs AnyTrans - Setapp](https://setapp.com/app-reviews/anytrans-vs-imazing)
- [iMazing vs AnyTrans - TheSweetBits](https://thesweetbits.com/imazing-vs-anytrans/)
- [3uTools Review - SoftwareVS](https://softwarevs.com/3utools-review/)
- [9to5Mac iMazing Review](https://9to5mac.com/2025/06/10/imazing-delivers-powerful-capabilities-for-managing-apple-devices-and-their-data-sponsored/)
- [iMazing Review - Foliovision](https://foliovision.com/2023/10/imazing-ios-saviour)

### Apple 政策變更

- [Apple iOS 26.1 Third-Party Photo Backup - Neowin](https://www.neowin.net/news/apple-quietly-opens-up-background-photo-backups-to-third-party-apps-with-ios-261/)
- [iOS 17 Security Features - TechCrunch](https://techcrunch.com/2023/09/18/ios-17-includes-these-new-security-and-privacy-features/)
- [Apple 2024 API Requirements](https://www.koombea.com/blog/apples-new-api-declaration-requirements-for-ios-apps/)
