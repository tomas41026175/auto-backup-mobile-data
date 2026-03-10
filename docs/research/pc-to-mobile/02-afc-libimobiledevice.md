# PC ↔ iPhone 雙向同步：AFC 協定與 libimobiledevice 研究

## 概述

本文檔整理了 **AFC（Apple File Connection）協定** 與 **libimobiledevice** 開源專案的技術細節，用於實現 PC 到 iPhone 的有線檔案同步方案。

---

## 1. AFC 協定原理

### 1.1 基本概念

**AFC** 是 Apple File Conduit 的縮寫，是每部 iPhone/iPod 上運行的服務，由 `/usr/libexec/afcd` 執行，負責與主機交換檔案。

- **主要用途**：iTunes 使用 AFC 與設備交換檔案
- **傳輸層**：運行於 **usbmux 協定**（自定義 USB 多路復用協定）
- **服務端口**：lockdownd 端口 **62078**

**來源**：[AFC - The iPhone Wiki](https://www.theiphonewiki.com/wiki/AFC)、[AFC - The Apple Wiki](https://theapplewiki.com/wiki/AFC)

### 1.2 目錄存取權限

#### 標準 AFC（AFC）
```
可存取目錄：/private/var/mobile/Media
包含內容：
  - DCIM/              # 照片和影片
  - Downloads/         # 下載檔案
  - Books/             # 電子書
  - Recordings/        # 語音備忘錄
  - PhotoData/         # 相機膠卷資料
```

**限制**：jailed 到非 OS 分割區，無法存取系統檔案和應用程式 App 資料。

#### AFC2（擴展版本）
```
可存取目錄：整個檔案系統（/)
限制：需要設備 jailbreak（越獄），Apple 在現代 iOS 中已禁用
```

**注意**：iOS 8+ 後，服務列表硬編碼於 lockdownd，AFC2 需使用 Mobile Substrate 鉤子才能啟用（僅在越獄環境）。

**來源**：[AFC - The iPhone Wiki](https://www.theiphonewiki.com/wiki/AFC)

---

## 2. USB 連接架構

### 2.1 通信棧層次結構

```
應用層
  ↓
AFC 客戶端（客戶端代碼）
  ↓
lockdownd（認證與服務管理）
  ↓
usbmuxd（USB 多路復用 & 虛擬 TCP）
  ↓
USB 物理層
```

### 2.2 usbmuxd（USB Multiplexer Daemon）

#### 功能
- 在主機端監聽 Unix Domain Socket（macOS/Linux）：`/var/run/usbmuxd`
- 在設備端監聽 USB 連接，建立虛擬 TCP 連接
- 將主機請求轉發到設備指定端口，實現「偽 TCP」通信

#### 連接序列
```
1. 客戶端連接到 /var/run/usbmuxd
2. 發送 Hello 封包（type=3）
3. 服務器返回確認（type=1）
4. 接收設備資訊（type=4）
5. 發送 TCP 連接請求（type=2）帶設備 ID 和目標端口
6. 服務器返回連接狀態（成功/拒絕）
7. 數據直接流向設備 TCP 端口
```

#### 訊息格式
```
小端序（Little Endian）
+-------+----------+----------+-----+
| 長度  | 保留欄位 | 訊息類型 | 標籤|
| 4字節 |  4字節   |  4字節   |4字節|
+-------+----------+----------+-----+
```

**來源**：[Usbmux - The iPhone Wiki](https://www.theiphonewiki.com/wiki/Usbmux)、[Understanding usbmux and the iOS lockdown service](https://jon-gabilondo-angulo-7635.medium.com/understanding-usbmux-and-the-ios-lockdown-service-7f2a1dfd07ae)

### 2.3 lockdownd（鎖定服務守護進程）

#### 功能
- 提供 iOS 系統資訊和服務存取
- 進行配對驗證（pairing validation）
- 憑證交換（certificate exchange）
- 會話管理（session management）

#### 技術細節
- **監聽端口**：62078
- **協議格式**：XML plist 格式封包
- **訊息前綴**：32 位大端序（Big Endian）大小指示符
- **權限**：以 root 身份運行
- **連接方式**：通過 usbmuxd 代理訪問

**來源**：[Understanding usbmux and the iOS lockdown service](https://jon-gabilondo-angulo-7635.medium.com/understanding-usbmux-and-the-ios-lockdown-service-7f2a1dfd07ae)

---

## 3. libimobiledevice 專案

### 3.1 項目概況

| 項目 | 詳情 |
|------|------|
| **名稱** | libimobiledevice |
| **類型** | 開源跨平台 C 庫 |
| **官網** | [libimobiledevice.org](https://libimobiledevice.org/) |
| **GitHub** | [libimobiledevice/libimobiledevice](https://github.com/libimobiledevice/libimobiledevice) |
| **授權** | LGPL-2.1（主要）、GPL-2.0/LGPL-3.0（部分工具） |
| **最新版本** | **v1.4.0**（2025年10月10日發佈） |
| **活躍度** | 1,896 個 commits、72 個貢獻者、7.8k GitHub stars |

### 3.2 核心功能

libimobiledevice 提供獨立於 Apple 官方工具的 iOS 協定實現：

- **設備資訊**：取得設備資訊、管理設定
- **應用管理**：安裝、卸載、查詢應用
- **備份還原**：完整設備備份和還原
- **檔案存取**：通過 AFC 協定存取設備檔案
- **調試支持**：應用調試連接（debugging）
- **診斷**：獲取崩潰日誌和診斷資訊

### 3.3 主要命令行工具

```bash
ideviceinfo          # 獲取設備資訊
ideviceinstaller     # 管理應用（安裝/卸載）
afcclient            # AFC 檔案系統交互（關鍵！）
ideviceactivation    # 設備激活
idevicecrashreport   # 崩潰日誌提取
idevicebackup2       # 設備備份
```

**特別關注**：`afcclient` 是命令行工具，可直接與 AFC 服務互動。

**來源**：[libimobiledevice.org](https://libimobiledevice.org/)、[GitHub - libimobiledevice](https://github.com/libimobiledevice/libimobiledevice)

### 3.4 最新進展（v1.4.0）

2025年10月發佈的 v1.4.0 包含：
- **MbedTLS 支持**：增強安全性
- **反向代理實現**：網絡功能擴展
- **無線配對**：WiFi 連接支持
- **iOS 17+ 支持**：個性化開發磁盤掛載
- **新調試工具**：增強開發者體驗

---

## 4. AFC API 詳解

### 4.1 核心數據類型

```c
typedef int16_t afc_error_t;              // 錯誤碼
typedef void* afc_client_t;               // AFC 客戶端句柄
typedef uint32_t afc_file_mode_t;         // 檔案開啟模式
typedef uint32_t afc_link_type_t;         // 連結類型（硬連結/軟連結）
typedef uint32_t afc_lock_op_t;           // 檔案鎖定操作
```

### 4.2 錯誤代碼（afc_error_t）

| 代碼 | 常量名 | 含義 |
|------|--------|------|
| 0 | AFC_E_SUCCESS | 成功 |
| 1 | AFC_E_UNKNOWN_ERROR | 未知錯誤 |
| 2 | AFC_E_OP_HEADER_INVALID | 操作頭無效 |
| 3 | AFC_E_NO_RESOURCES | 資源不足 |
| 4 | AFC_E_READ_ERROR | 讀取錯誤 |
| 5 | AFC_E_WRITE_ERROR | 寫入錯誤 |
| 7 | AFC_E_INVALID_ARG | 無效參數 |
| 8 | AFC_E_OBJECT_NOT_FOUND | 物件未找到 |
| 9 | AFC_E_OBJECT_IS_DIR | 物件是目錄 |
| 10 | AFC_E_PERM_DENIED | 權限被拒 |
| 11 | AFC_E_SERVICE_NOT_CONNECTED | 服務未連接 |
| 15 | AFC_E_OP_NOT_SUPPORTED | 操作不支持 |
| 16 | AFC_E_OBJECT_EXISTS | 物件已存在 |
| 18 | AFC_E_NO_SPACE_LEFT | 無剩餘空間 |

**完整清單**：[afc.h File Reference - libimobiledevice](https://docs.libimobiledevice.org/libimobiledevice/latest/afc_8h.html)

### 4.3 主要 API 函式

#### 連接管理
```c
afc_error_t afc_client_new(idevice_t device, lockdownd_service_descriptor_t service,
                           afc_client_t *client);
// 建立 AFC 服務連接

afc_error_t afc_client_start_service(idevice_t device, afc_client_t *client,
                                      const char *label);
// 自動啟動並連接到 AFC 服務

afc_error_t afc_client_free(afc_client_t client);
// 斷開連接並釋放資源
```

#### 檔案操作
```c
afc_error_t afc_file_open(afc_client_t client, const char *filename,
                          afc_file_mode_t file_mode, uint64_t *handle);
// 打開檔案，返回檔案句柄

afc_error_t afc_file_read(afc_client_t client, uint64_t handle,
                          char *buf, uint32_t length, uint32_t *bytes_read);
// 讀取檔案數據

afc_error_t afc_file_write(afc_client_t client, uint64_t handle,
                           const char *buf, uint32_t length, uint32_t *bytes_written);
// 寫入檔案數據

afc_error_t afc_file_close(afc_client_t client, uint64_t handle);
// 關閉檔案

afc_error_t afc_file_seek(afc_client_t client, uint64_t handle,
                          int64_t offset, int whence);
// 設置檔案位置指針

afc_error_t afc_file_tell(afc_client_t client, uint64_t handle, uint64_t *position);
// 獲取當前檔案位置
```

#### 目錄操作
```c
afc_error_t afc_read_directory(afc_client_t client, const char *path,
                               char ***directory_information);
// 列出目錄內容（返回目錄資訊陣列）

afc_error_t afc_make_directory(afc_client_t client, const char *path);
// 創建目錄

afc_error_t afc_remove_path(afc_client_t client, const char *path);
// 刪除檔案或目錄

afc_error_t afc_rename_path(afc_client_t client, const char *from, const char *to);
// 重命名檔案或目錄

afc_error_t afc_make_link(afc_client_t client, afc_link_type_t link_type,
                          const char *target, const char *linkname);
// 創建符號連結或硬連結
```

#### 檔案資訊
```c
afc_error_t afc_get_device_info(afc_client_t client, char ***device_information);
// 獲取設備資訊（字典格式）

afc_error_t afc_get_device_info_key(afc_client_t client, const char *key,
                                     char **value);
// 獲取特定設備屬性

afc_error_t afc_get_file_info(afc_client_t client, const char *path,
                              char ***file_information);
// 獲取檔案元數據（大小、修改時間等）

afc_error_t afc_get_file_info_plist(afc_client_t client, const char *path,
                                     plist_t *info);
// 以 plist 格式獲取檔案資訊（新增）
```

#### 實用工具
```c
afc_error_t afc_truncate(afc_client_t client, const char *path, uint64_t newsize);
// 直接截斷檔案大小

afc_error_t afc_set_file_time(afc_client_t client, const char *path, uint64_t mtime);
// 設置修改時間戳

void afc_dictionary_free(char **dictionary);
// 釋放目錄或檔案資訊記憶體
```

**完整文檔**：[afc.h File Reference - libimobiledevice 1.3.0](https://docs.libimobiledevice.org/libimobiledevice/latest/afc_8h.html)

---

## 5. Windows 支持情況

### 5.1 官方支持狀態

| 平台 | 狀態 | 備註 |
|------|------|------|
| **Linux** | ✅ 完全支持 | 原生支持 |
| **macOS** | ✅ 完全支持 | 原生支持 |
| **Windows** | ⚠️ 部分支持 | usbmuxd 受限 |
| **Android** | ✅ 支持 | 可編譯 |
| **ARM** | ✅ 支持 | 嵌入式系統 |

### 5.2 Windows 構建流程

#### 推薦方法：MSYS2

```bash
# 1. 安裝 MSYS2 MinGW 64-bit shell

# 2. 安裝依賴
pacman -S base-devel git mingw-w64-x86_64-gcc make libtool autoconf automake-wrapper pkg-config

# 3. 使用官方構建脚本（推薦）
mkdir -p limd-build
cd limd-build
curl -Ls -o limd-build-msys2.sh https://is.gd/limdmsys2
bash ./limd-build-msys2.sh
```

#### 預構建包

```bash
# MSYS2 已提供預構建包，可直接安裝
pacman -S mingw-w64-x86_64-libimobiledevice mingw-w64-x86_64-libusbmuxd
```

### 5.3 Windows 限制

**關鍵限制**：usbmuxd **不完全支持 Windows**

```
原因：
- iTunes for Windows 提供 Apple Mobile Device Support
- libimobiledevice 依賴此服務進行 USB 通信
- usbmuxd 在 Windows 上無法完全實現虛擬 TCP 層
- 替代方案：使用 Apple 官方的 MobileDeviceSupport
```

### 5.4 社群 Windows 二進制

由於官方 Windows 二進制版本有限，社群提供了預編譯版本：
- [iFred09/libimobiledevice-windows](https://github.com/iFred09/libimobiledevice-windows)
- [jrjr/libimobiledevice-windows](https://github.com/jrjr/libimobiledevice-windows)
- [libimobiledevice-win32/imobiledevice-net](https://github.com/libimobiledevice-win32/imobiledevice-net)（已於 2024年1月18日歸檔）

**來源**：[libimobiledevice Windows Support](https://libimobiledevice.org/)、[MSYS2 Packages](https://packages.msys2.org/packages/mingw-w64-x86_64-libimobiledevice)

---

## 6. Node.js 套件生態

### 6.1 可用 npm 套件概覽

| 套件名稱 | GitHub | npm | 狀態 | 用途 |
|---------|--------|-----|------|------|
| **libimobiledevice** | - | [npm](https://www.npmjs.com/package/libimobiledevice) | ✅ | Electron 應用 bindings |
| **node-idevice** | - | [npm](https://www.npmjs.com/package/node-idevice) | ✅ | 應用安裝 |
| **idevicekit** | [GitHub](https://github.com/thebeet/idevicekit) | [npm](https://www.npmjs.com/package/idevicekit) | ✅ | 設備管理工具 |
| **appium-ios-device** | [GitHub](https://github.com/appium/appium-ios-device) | [npm](https://www.npmjs.com/package/appium-ios-device) | ✅ Production | libimobiledevice Node.js 重寫 |
| **libijs** | [GitHub](https://github.com/mceSystems/libijs) | [npm](https://www.npmjs.com/package/libijs) | ⚠️ PoC | 純 JavaScript 實現 |
| **@mcesystems/apple-kit** | [GitHub](https://github.com/mceSystems/apple-kit) | [npm](https://www.npmjs.com/package/@mcesystems/apple-kit) | ✅ | iOS 設備管理工具包 |

### 6.2 核心套件詳解

#### **appium-ios-device**（推薦用於生產環境）

```bash
npm install appium-ios-device
```

- **特點**：libimobiledevice 的 Node.js 完整重寫
- **API 設計**：直接通過 usbmuxd 與設備通信
- **生產就緒**：已在 Appium 框架中大規模使用
- **功能**：應用安裝/卸載、端口轉發、設備屬性存取、AFC 文件操作

#### **libijs**（早期實驗版本）

```bash
npm install libijs
```

- **特點**：純 JavaScript 實現 usbmuxd 客戶端
- **狀態**：概念驗證（PoC），**不建議生產環境使用**
- **優勢**：無 C 語言依賴，跨平台兼容
- **功能**：AFC 實現具有並行請求支持（數據包編號跟蹤）

#### **idevicekit**

```bash
npm install idevicekit
# 依賴：Node.js >= 6.0, libimobiledevice & ideviceinstaller
```

- **功能**：獲取連接設備列表、查詢設備上的套件
- **簡單易用**：快速集成設備檢測

#### **@mcesystems/apple-kit**

```bash
npm install @mcesystems/apple-kit
```

- **特點**：基於命令行工具封裝
- **功能**：應用安裝/卸載、端口轉發、激活、設備屬性存取

**來源**：[npm search: libimobiledevice](https://www.npmjs.com/search?q=libimobiledevice)、[GitHub - appium/appium-ios-device](https://github.com/appium/appium-ios-device)、[GitHub - mceSystems/libijs](https://github.com/mceSystems/libijs)

### 6.3 與 AFC 相關的實現

```javascript
// 使用 appium-ios-device 的 AFC 文件操作示例
const { getConnectedDevices } = require('appium-ios-device');

const devices = await getConnectedDevices();
// AFC 操作通過底層 usbmuxd 連接
```

---

## 7. iOS 安全限制

### 7.1 USB Restricted Mode（iOS 12+）

#### 概念
從 iOS 12 開始，Apple 引入 USB Restricted Mode 安全功能，限制未授權的 USB 數據存取。

#### 激活條件
- 設備保持 **鎖定 1 小時**以上
- 未在此期間解鎖

#### 對 AFC 的影響

| 狀態 | AFC 存取 | 說明 |
|------|----------|------|
| 設備已解鎖 | ✅ 允許 | 無限制 |
| 鎖定 < 1小時 | ✅ 允許 | 信任配件仍可存取 |
| 鎖定 > 1小時 | ❌ 被阻止 | 需解鎖設備 |
| 新配件 | ❌ 被阻止 | 需解鎖授權 |

#### 信任配件例外
- 之前連接過的授信配件可在 **30 天內** 持續存取
- 30 天後需重新授權（解鎖設備）
- 存儲配件 **必須** 始終解鎖使用

#### 安全目的
防止物理盜竊者通過 USB 端口提取數據，即使他們掌握了設備也無法繞過 Face ID/Touch ID + USB Restricted Mode 的組合。

### 7.2 iOS 16+ 的協定相容性

**重要發現**：搜索結果未找到 iOS 16/17/18 中對 AFC 協定本身的新限制。

- AFC 仍可在標準使用場景中工作
- USB Restricted Mode 是 **應用層限制**，而非協定層限制
- 設備必須解鎖才能存取 AFC 服務

**來源**：[What is USB Restricted Mode on iPhone](https://www.certosoftware.com/insights/what-is-usb-restricted-mode-on-iphone/)、[Allow USB and other accessories to connect to your iPhone or iPad - Apple Support](https://support.apple.com/en-us/111806)

---

## 8. 商業工具分析

### 8.1 iMazing、AnyTrans 與 libimobiledevice

#### 搜索結果發現

針對「iMazing、AnyTrans 是否基於 libimobiledevice」的問題，**公開資料中未找到明確確認**。

#### 可能性分析

| 工具 | 開發商 | 官方文檔披露 | 推測 |
|------|--------|-----------|------|
| **iMazing** | DigiDNA | 未披露 | 可能自主實現或基於 libimobiledevice 修改版本 |
| **AnyTrans** | iMobie | 未披露 | 同上 |

#### 可確認的替代方案

這些工具通常實現以下功能：
- **AFCclient**：文件系統存取
- **HouseArrest**：應用數據沙盒存取
- **Mobile Device Support**：與 iTunes 相同的協定棧

**來源**：[2025 iMazing vs iExplorer vs AnyTrans Comparison](https://www.aiseesoft.com/resource/imazing-vs-iexplorer-vs-anytrans.html)

---

## 9. 協定層次總結

### 完整的 PC → iPhone 通信棧

```
┌─────────────────────────────────────────────────────────────┐
│                    應用層（我們的代碼）                       │
├─────────────────────────────────────────────────────────────┤
│              libimobiledevice（C 語言 / Node.js）            │
├─────────────────────────────────────────────────────────────┤
│                        AFC 協定                              │
│                  (afc_file_open/read/write)                 │
├─────────────────────────────────────────────────────────────┤
│                      lockdownd（認證）                       │
│                    port 62078 (XML plist)                   │
├─────────────────────────────────────────────────────────────┤
│                   usbmuxd（虛擬 TCP 多路）                    │
│            (小端序頭+消息類型+標籤+載荷)                      │
├─────────────────────────────────────────────────────────────┤
│                      USB 物理傳輸層                          │
│                  (Lightning / USB-C)                         │
└─────────────────────────────────────────────────────────────┘
```

### 存取限制矩陣

```
設備狀態        AFC 存取   AFC 目錄        備註
─────────────────────────────────────────────────
已解鎖          ✅        /var/mobile/    標準 AFC
                                 Media

鎖定 < 1hr      ✅        /var/mobile/    信任配件例外
                                 Media

鎖定 > 1hr      ❌        N/A             USB Restricted 啟動

已越獄          ✅        /（整個系統）   AFC2（需重新編譯）

USB 受限模式    ❌        N/A             需用戶解鎖
激活
```

---

## 10. 實現建議

### 10.1 技術棧選擇

#### **Option A：C 語言（全棧性能最佳）**
```bash
依賴：libimobiledevice v1.4.0
平台：macOS ✅ / Linux ✅ / Windows ⚠️ （usbmuxd 受限）
```

#### **Option B：Node.js（最佳開發體驗）**
```bash
依賴：appium-ios-device（生產就緒）
平台：跨平台 ✅
缺點：性能相對 C 庫稍低
```

### 10.2 Windows 實現策略

**問題**：usbmuxd 在 Windows 上不完全支持

**解決方案**：
1. **使用 iTunes 提供的 Apple Mobile Device Support**
2. **依賴社群預構建的 libimobiledevice Windows 版本**
3. **考慮 Electron + Node.js 方案跨平台**

### 10.3 AFC 存取要點

- ✅ 可存取：Photos（DCIM）、Downloads、Music、Books
- ❌ 不可存取：App 沙盒內容、系統文件、App 源代碼
- ⚠️ 需解鎖：USB Restricted Mode 啟動時

---

## 參考資源

### 官方文檔
- [libimobiledevice 官網](https://libimobiledevice.org/)
- [libimobiledevice GitHub](https://github.com/libimobiledevice/libimobiledevice)
- [AFC API 文檔](https://docs.libimobiledevice.org/libimobiledevice/latest/afc_8h.html)

### 協定規範
- [AFC - The iPhone Wiki](https://www.theiphonewiki.com/wiki/AFC)
- [Usbmux - The iPhone Wiki](https://www.theiphonewiki.com/wiki/Usbmux)
- [AFC - The Apple Wiki](https://theapplewiki.com/wiki/AFC)

### Node.js 套件
- [appium-ios-device (npm)](https://www.npmjs.com/package/appium-ios-device)
- [libijs (npm)](https://www.npmjs.com/package/libijs)
- [idevicekit (npm)](https://www.npmjs.com/package/idevicekit)

### 安全與限制
- [USB Restricted Mode - Certo Software](https://www.certosoftware.com/insights/what-is-usb-restricted-mode-on-iphone/)
- [Apple Support - USB Accessory Controls](https://support.apple.com/en-us/111806)

### 社群實現
- [pymobiledevice (Python)](https://github.com/iOSForensics/pymobiledevice)
- [libijs (Pure JavaScript)](https://github.com/mceSystems/libijs)

---

**文檔版本**：1.0
**最後更新**：2025年3月
**信息來源**：libimobiledevice 官方文檔、GitHub、iPhone Wiki、Apple Support
**可信度**：基於官方文檔和社群共識資料
