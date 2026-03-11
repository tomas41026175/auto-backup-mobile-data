# iPhone 備份與檔案存取協定 — 技術研究

> 調查日期：2026-03-11
> 資料來源年份：2024-2025（含部分 2026 更新）

---

## 1. AFC（Apple File Conduit）協定

### 原理

AFC 是 Apple 在 iOS 裝置上運行的檔案傳輸服務，由 `/usr/libexec/afcd` 負責處理。通訊架構為五層設計：

```
應用層（AFC / Backup / Screenshot 等服務）
  ↓
lockdownd（認證、配對、SSL、服務調度）
  ↓
libusbmuxd（USB / 網路多工）
  ↓
usbmuxd daemon（連線管理）
  ↓
USB / TCP（實體傳輸）
```

### 運作流程

1. 客戶端透過 usbmuxd 連接裝置
2. 與 lockdownd（固定 port `0xf27e`）進行握手：QueryType → 配對驗證 → StartSession → SSL 協商
3. 透過 `StartService("com.apple.afc")` 取得動態 port
4. 直接連接至 AFC 服務 port，使用 plist 序列化格式通訊

### USB 依賴性

- AFC 底層依賴 **usbmuxd** daemon，原生設計為 USB 通訊
- iOS 7+ 支援 WiFi Sync 模式，但需先透過 USB 完成配對
- 開源 usbmuxd 的 WiFi 支援不完整（詳見第 8 節）

### 存取限制（Jailing）

| 模式 | 存取範圍 | 需要越獄 |
|------|---------|---------|
| AFC（標準） | `/private/var/mobile/Media` 目錄（DCIM、iTunes_Control 等） | 否 |
| AFC2 | 完整檔案系統（`/`） | 是 |

- 標準 AFC 可直接存取 **DCIM 資料夾**（Camera Roll 照片）
- iOS 8 起，服務清單從 `Services.plist` 改為 hardcode 在 lockdownd 中
- 照片路徑：`/private/var/mobile/Media/DCIM/`

### macOS 上的支援

- macOS 內建 Apple 私有 usbmuxd（`/var/run/usbmuxd`），Photos.app 和 Image Capture 皆透過此通訊
- 第三方工具可透過 libimobiledevice 使用 AFC 協定
- ImageCaptureCore framework（macOS 10.6+）提供原生 API 存取 USB 連接的 iPhone 照片

### 來源

- [AFC - The Apple Wiki](https://theapplewiki.com/wiki/AFC)
- [libimobiledevice DeepWiki](https://deepwiki.com/libimobiledevice/libimobiledevice)

---

## 2. libimobiledevice

### 概述

跨平台開源 C 語言函式庫，無需 Apple 私有函式庫即可與 iOS 裝置原生通訊。**不需越獄**。

### macOS 安裝

```bash
# Homebrew（推薦）
brew install libimobiledevice

# MacPorts
sudo port install libimobiledevice

# 從原始碼編譯（取得最新 iOS 支援）
git clone https://github.com/libimobiledevice/libimobiledevice.git
cd libimobiledevice && ./autogen.sh && make && sudo make install
```

### 命令列工具清單（19 個）

| 工具 | 功能 |
|------|------|
| `idevice_id` | 列出已連接裝置的 UDID |
| `ideviceinfo` | 取得裝置詳細資訊（型號、iOS 版本等） |
| `idevicename` | 取得/設定裝置名稱 |
| `idevicedate` | 取得/設定裝置日期 |
| `idevicepair` | 管理裝置配對（pair / unpair / validate） |
| `idevicebackup` | 裝置備份（舊版協定） |
| `idevicebackup2` | 裝置備份/還原（新版協定，iOS 4+） |
| `idevicecrashreport` | 擷取裝置 crash report |
| `idevicediagnostics` | 裝置診斷（重啟、關機、sleep） |
| `idevicesyslog` | 即時串流裝置系統日誌 |
| `idevicenotificationproxy` | 監聽裝置通知 |
| `idevicedebugserverproxy` | debug server 代理 |
| `idevicedebug` | 應用程式除錯 |
| `ideviceenterrecovery` | 進入 recovery 模式 |
| `ideviceimagemounter` | 掛載開發者 disk image |
| `idevicesetlocation` | 模擬 GPS 位置 |
| `idevicescreenshot` | 擷取螢幕截圖 |
| `ideviceprovision` | 管理 provisioning profile |
| `idevicebtlogger` | 擷取 Bluetooth HCI 日誌 |
| `afcclient` | AFC 檔案系統操作（瀏覽、上傳、下載） |

### 可存取的檔案類型

| 類型 | 存取方式 | 說明 |
|------|---------|------|
| 照片（DCIM） | AFC 標準服務 | 可讀取 Camera Roll，但寫入的照片不被 Camera Roll 索引 |
| App 文件 | AFC + House Arrest | 存取 App sandbox 中的 Documents 資料夾 |
| 備份資料 | idevicebackup2 | 完整裝置備份（含照片、通訊錄、訊息等） |
| 系統日誌 | syslog_relay | 即時系統日誌串流 |
| Crash Reports | crashreport 服務 | 裝置 crash 報告 |
| 裝置資訊 | lockdownd | 型號、序號、iOS 版本等 |

### 2024-2025 維護狀況

| 元件 | 最新版本 | 發布日期 |
|------|---------|---------|
| libimobiledevice | 1.4.0 | 2025-10 |
| libplist | 2.7.0 | 2025-05 |
| libimobiledevice-glue | 1.3.2 | 2025-06 |
| libusbmuxd | 2.1.1 | 2025-06 |
| libtatsu | 1.0.5 | 2025-06 |
| ideviceinstaller | 1.2.0 | 2025-10 |
| ifuse | 1.2.0 | 2025-10 |
| libirecovery | 1.3.1 | 2025-10 |
| usbmuxd | 1.1.1 | — |

**結論：專案活躍維護中**，GitHub 1,896+ commits、7,800+ stars、1,500+ forks。

### 來源

- [libimobiledevice 官網](https://libimobiledevice.org/)
- [GitHub libimobiledevice](https://github.com/libimobiledevice/libimobiledevice)
- [Homebrew Formula](https://formulae.brew.sh/formula/libimobiledevice)

---

## 3. MTP（Media Transfer Protocol）

### iOS 支援狀況

**iOS 不支援 MTP。**

- Apple 從未在 iOS 中實作 MTP 協定
- iOS SDK 不提供 MSC / MTP 相關 API
- iOS sandbox 限制使得即使透過 USB adapter 也無法使用 MTP 存取外部檔案系統
- iPhone 透過 USB 連接時使用 **PTP（Picture Transfer Protocol）** 傳輸照片，而非 MTP

### 與 Android 的差異

| 特性 | iOS | Android |
|------|-----|---------|
| 檔案傳輸協定 | AFC / PTP | MTP（自 2011 起） |
| USB 外部存取 | 僅照片（PTP） + AFC | 完整檔案系統（MTP） |
| 第三方工具支援 | 需 libimobiledevice | 原生 MTP 支援 |

### 來源

- [Apple Developer Forums - MTP support](https://developer.apple.com/forums/thread/670718)
- [Apple Developer Forums - iOS MSC/MTP](https://developer.apple.com/forums/thread/73155)

---

## 4. ifuse / idevice* 工具

### ifuse

ifuse 透過 FUSE 將 iOS 裝置檔案系統掛載為本地目錄。

```bash
# 安裝
brew install ifuse

# 掛載整個 Media 目錄
ifuse /mnt/iphone

# 掛載特定 App 的 Documents 資料夾
ifuse --documents com.example.app /mnt/app-docs

# 掛載 App 的 sandbox 根目錄
ifuse --container com.example.app /mnt/app-root

# 卸載
fusermount -u /mnt/iphone  # Linux
umount /mnt/iphone          # macOS
```

**macOS 注意事項**：macOS 需要安裝 macFUSE（原 OSXFUSE），但 macOS 12+ 對 kernel extension 有更嚴格的限制，macFUSE 安裝可能需要額外步驟。

### afcclient（libimobiledevice 1.4.0 新增）

```bash
# 列出檔案
afcclient ls /DCIM

# 下載檔案
afcclient get /DCIM/100APPLE/IMG_0001.HEIC ./

# 上傳檔案
afcclient put ./file.txt /Documents/
```

### 來源

- [GitHub ifuse](https://github.com/libimobiledevice/ifuse)
- [libimobiledevice DeepWiki - File and Image Tools](https://deepwiki.com/libimobiledevice/libimobiledevice/4.4-file-and-image-tools)

---

## 5. 無越獄 + 無 USB（純 WiFi LAN）讀取 iPhone 照片 — 技術評估

### 結論：**極度困難，幾乎不可行**

### 方案評估

| 方案 | 可行性 | 說明 |
|------|--------|------|
| AFC over WiFi（libimobiledevice） | 部分可行 | 需先 USB 配對一次；開源 usbmuxd WiFi 支援不完整 |
| iCloud Photos API | 可行但需帳號 | 需 Apple ID 登入，走雲端而非 LAN |
| AirDrop | 不可行 | 需手動操作，無程式化 API |
| SMB/NFS/WebDAV | 不可行 | iOS 不原生暴露這些服務 |
| mDNS 自動發現 + 自訂協定 | 需 App 配合 | 需在 iPhone 上安裝自訂 App 作為 server |
| Apple「檔案」App 分享 | 有限 | 僅支援特定雲端服務，非 LAN 直連 |
| PTP/IP（Picture Transfer Protocol over IP） | 不可行 | iOS 不支援 PTP/IP server 模式 |

### 關鍵限制

1. **iOS sandbox**：iOS App 無法在背景持續運行檔案服務
2. **無 mDNS 服務暴露**：iOS 不會在 LAN 上暴露任何檔案存取服務
3. **Photos Library 架構**：Apple 明確指出 Photos Library 不支援網路存取，網路存取可能損壞資料庫
4. **WiFi Sync 需先 USB 配對**：即使使用 WiFi Sync，首次配對仍需 USB 連接

### 最務實的替代方案

1. **USB 配對一次 + WiFi Sync**：透過 libimobiledevice 首次 USB 配對後，後續可嘗試 WiFi 存取（但穩定性有限）
2. **USB 直連 + AFC/PTP**：最可靠的方案，透過 USB 直接讀取 DCIM
3. **iCloud API**：走雲端同步，但不是純 LAN 方案
4. **自訂 iOS App**：開發一個在 iPhone 上運行的 server App，但受限於 iOS 背景執行限制

### 來源

- [Apple Community - Photo sharing over local network](https://discussions.apple.com/thread/6984872)
- [libimobiledevice WiFi Sync Issue #919](https://github.com/libimobiledevice/libimobiledevice/issues/919)

---

## 6. Apple Photos Framework / PhotoKit / ImageCaptureCore

### PhotoKit（iOS / macOS）

- **用途**：存取裝置**本地** Photos Library
- **限制**：PhotoKit 存取的是 Mac 本機的 Photos.app 資料庫，**無法透過 USB 直接存取 iPhone 上的照片**
- **跨裝置同步**：僅透過 iCloud Cloud Identifiers（需 iCloud 帳號）
- **平台**：iOS、iPadOS、macOS、tvOS

### ImageCaptureCore（macOS）— 最相關的 API

ImageCaptureCore 是 macOS 上**唯一可透過 USB 程式化存取 iPhone 照片**的官方 framework。

```
ICDeviceBrowser → 偵測連接的裝置
  ↓
ICCameraDevice → 代表相機裝置（含 iPhone）
  ↓
ICCameraItem / ICCameraFile → 個別照片/影片
  ↓
requestDownloadFile() → 下載到本地
```

| 特性 | 說明 |
|------|------|
| 支援平台 | macOS 10.6+（iPhone 支援需 iOS 版本配合） |
| 存取方式 | USB（PTP 協定） |
| 可讀取內容 | 照片、影片（Camera Roll） |
| 寫入支援 | 無（唯讀） |
| WiFi 支援 | 無 |
| 語言 | Objective-C / Swift |
| Node.js 可用性 | 無原生 binding，需透過 native addon 橋接 |

### 來源

- [PhotoKit - Apple Developer](https://developer.apple.com/documentation/photokit)
- [ImageCaptureCore - Apple Developer](https://developer.apple.com/documentation/imagecapturecore)

---

## 7. iTunes WiFi Sync 協定

### 協定概述

iTunes WiFi Sync 允許在同一 LAN 上透過 WiFi 進行裝置同步，使用與 USB 相同的 lockdownd / usbmuxd 協定棧。

### 技術細節

| 特性 | 說明 |
|------|------|
| 發現機制 | mDNS / Bonjour |
| 傳輸協定 | 與 USB 相同（lockdownd → AFC / backup 等） |
| 先決條件 | 必須先透過 USB 完成首次配對並啟用 WiFi Sync |
| 認證 | 使用 USB 配對時建立的 pair record（RSA 2048-bit 憑證） |

### 配對流程

1. **傳統配對（所有 iOS 版本）**：RSA 2048-bit 金鑰對 → 三層 X.509 憑證（Root CA、Host、Device）→ SHA-256 簽名
2. **無線配對（iOS 7+）**：SRP6a 協定（3072-bit）→ HKDF-SHA512 金鑰推導 → ChaCha20-Poly1305 加密 → Ed25519 簽名

### 公開文件化的 API

**沒有官方公開 API。** Apple 未提供任何 WiFi Sync 的官方 API 文件。

### 開源實作狀態

| 工具 | WiFi Sync 支援 | 備註 |
|------|---------------|------|
| libimobiledevice + 官方 usbmuxd | 有限 | 無法列舉 WiFi 裝置（`idevice_id -n` 常失敗） |
| usbmuxd2（jkcoxson） | 實驗性 | Linux only，使用 avahi-client（mDNS），最後更新 2022 |
| Apple 私有 usbmuxd（macOS 內建） | 完整 | 但無公開 API |

### 來源

- [libimobiledevice Issue #720 - iTunes WiFi Sync](https://github.com/libimobiledevice/libimobiledevice/issues/720)
- [libimobiledevice Issue #919 - WiFi Sync](https://github.com/libimobiledevice/libimobiledevice/issues/919)
- [usbmuxd2 GitHub](https://github.com/jkcoxson/usbmuxd2)

---

## 8. Node.js / npm 可用套件

### 套件比較

| 套件 | 最新版本 | 最後更新 | 實作方式 | 主要功能 | 推薦度 |
|------|---------|---------|---------|---------|--------|
| **appium-ios-device** | 3.1.10 | 2026-02 | 純 JS（libimobiledevice 重寫） | AFC、Syslog、安裝管理、WebInspector | 高 |
| **node-ios-device** | 1.13.0 | 2026-02 | Native addon | 列出裝置、安裝 App、port relay | 中 |
| **libijs** | — | 不活躍 | 純 JS（proof of concept） | AFC、lockdownd、backup、syslog | 低 |
| **libimobiledevice**（npm） | 0.2.7 | 7 年前 | 包裝 CLI | 基礎裝置操作 | 低 |
| **idevicekit** | 0.3.3 | 5 年前 | CLI wrapper | 裝置資訊、App 管理 | 低 |
| **ios-device-lib** | — | — | Native | NativeScript 專用 | 低 |

### 推薦方案

#### 方案 A：appium-ios-device（最完整的純 JS 實作）

```bash
npm install appium-ios-device
```

支援的服務：
- AFC（檔案存取）
- Installation Proxy（App 管理）
- Syslog（系統日誌）
- House Arrest（App sandbox 存取）
- Notification Proxy
- Image Mounter
- Simulate Location
- Web Inspector
- Instrument Service
- MC Install

**注意**：設計為 Appium 測試框架的一部分，部分功能僅在 macOS + Xcode 環境下完整運作。

#### 方案 B：libijs（純 JS，概念驗證）

```bash
npm install libijs
```

```javascript
const libijs = require("libijs");

// 取得裝置資訊
const lockdownClient = yield libijs.lockdownd.getClient(device);
const productType = yield lockdownClient.getValue(null, "ProductType");

// AFC 檔案操作（支援串流）
const remoteFile = yield afcClient.openFileAsReadableStream("/DCIM/100APPLE/IMG_0001.HEIC");
```

**優勢**：AFC 實作支援多工請求（同一連線上多個並行請求），效能優於 libimobiledevice CLI。
**劣勢**：明確標示為「not ready for production」，13 commits，不活躍。

#### 方案 C：CLI Wrapper（最穩定）

```bash
# 安裝系統級 libimobiledevice
brew install libimobiledevice

# Node.js 中透過 child_process 呼叫
```

```javascript
const { execSync } = require("child_process");

// 列出裝置
const devices = execSync("idevice_id -l").toString().trim().split("\n");

// 取得裝置資訊
const info = execSync(`ideviceinfo -u ${udid}`).toString();

// 使用 afcclient 列出照片
const files = execSync("afcclient ls /DCIM/").toString();
```

**優勢**：最穩定，使用成熟的 C 實作。
**劣勢**：需系統安裝 libimobiledevice，效能受 process spawn 影響。

### 來源

- [appium-ios-device npm](https://www.npmjs.com/package/appium-ios-device)
- [node-ios-device npm](https://www.npmjs.com/package/node-ios-device)
- [libijs GitHub](https://github.com/mceSystems/libijs)

---

## 9. iOS 16 / 17 / 18 相關限制與變化

### iOS 16

- 加入 **Lockdown Mode**：啟用時完全禁用 USB 資料存取（僅允許充電）
- 開發者模式需手動啟用才能掛載 developer disk image

### iOS 17

- 新增 **Developer Disk Image → Personalized DDI** 機制：開發者映像需針對特定裝置個人化
- 此變更影響 `ideviceimagemounter` 工具，libimobiledevice 需更新以支援新格式
- Xcode 16 或更新版本為必要建置工具

### iOS 18

- **USB Restricted Mode 強化**：鎖定超過 1 小時後自動禁用 USB 資料存取（僅允許充電）
- **Inactivity Reboot**（iOS 18.1）：裝置鎖定 72 小時未解鎖自動重啟，重啟後進入 BFU（Before First Unlock）狀態，所有資料加密，USB 工具無法存取
- **CVE-2025-24200**：USB Restricted Mode 被發現可透過輔助功能（assistivetouchd）繞過，已在 iOS 18.3.1 修補
- **App 提交要求**：必須使用 Xcode 16+ 和對應 SDK 建置

### 對自動備份的影響

| 限制 | 影響 | 因應策略 |
|------|------|---------|
| USB Restricted Mode（1hr） | USB 連接前裝置必須解鎖 | 需使用者互動解鎖，或在 1hr 內連接 |
| Inactivity Reboot（72hr） | 長時間未用的裝置無法存取 | 定期使用裝置，或在 72hr 內完成備份 |
| Lockdown Mode | 完全禁止 USB 資料 | 確認使用者未啟用 Lockdown Mode |
| Trust Dialog | 首次連接需使用者在裝置上確認信任 | 需使用者一次性操作 |

### 來源

- [USB Restricted Mode Guide](https://www.trio.so/blog/usb-restricted-mode)
- [iOS 18 Inactivity Reboot - Magnet Forensics](https://www.magnetforensics.com/blog/understanding-the-security-impacts-of-ios-18s-inactivity-reboot/)
- [CVE-2025-24200 Analysis - Quarkslab](https://blog.quarkslab.com/first-analysis-of-apples-usb-restricted-mode-bypass-cve-2025-24200.html)

---

## 10. 綜合技術建議

### 存取 iPhone 照片的最佳方案排序

| 排名 | 方案 | 可靠性 | 需求 |
|------|------|--------|------|
| 1 | USB + libimobiledevice（AFC） | 最高 | USB 連線、首次 Trust 確認 |
| 2 | USB + ImageCaptureCore（macOS） | 高 | USB 連線、macOS 原生 API |
| 3 | USB + idevicebackup2（完整備份） | 高 | USB 連線、較長備份時間 |
| 4 | WiFi Sync（首次 USB 配對後） | 低 | USB 首次配對、開源支援不完整 |
| 5 | iCloud API | 中 | Apple ID、網路連線、非 LAN |
| 6 | 自訂 iOS App（WiFi Server） | 中 | App 開發、背景執行限制 |

### 針對 Node.js 開發的建議

- **生產環境**：使用 libimobiledevice CLI wrapper（`child_process`），穩定性最高
- **需要深度整合**：評估 appium-ios-device，但注意其設計初衷為測試框架
- **純 JS 實作需求**：libijs 有潛力但不成熟，可作為參考架構但不建議生產使用
- **macOS 限定**：可考慮透過 native addon 橋接 ImageCaptureCore framework
