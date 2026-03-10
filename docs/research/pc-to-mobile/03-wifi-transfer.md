# PC ↔ iPhone WiFi 雙向檔案同步方案研究

**日期**: 2026-03-10
**狀態**: 完成
**版本**: 1.0

---

## 目錄

1. [概述](#概述)
2. [WebDAV 方案](#webdav-方案)
3. [HTTP Server 方案](#http-server-方案)
4. [Bonjour/mDNS 服務發現](#bonjourmdns-服務發現)
5. [AirDrop 協定分析](#airdrop-協定分析)
6. [開源 WiFi 傳輸工具](#開源-wifi-傳輸工具)
7. [iOS 後臺執行限制](#ios-後臺執行限制)
8. [綜合評估與建議](#綜合評估與建議)

---

## 概述

本文檔總結了 PC 到 iPhone 雙向檔案同步的 WiFi 無線傳輸方案。通過 2024-2025 年的最新資料，涵蓋了從協定層面、應用層面到技術實作的全面分析。

### 方案對比速覽

| 方案 | 優點 | 缺點 | 適用場景 |
|------|------|------|---------|
| **WebDAV** | 標準協定、跨平台 | iOS 需第三方 app | 檔案管理、雙向同步 |
| **HTTP Server** | 簡單實作、直觀 | 僅推送、需設定 | PC→iPhone 單向傳輸 |
| **Bonjour/mDNS** | 自動發現、零設定 | 同網段限制 | 設備探測、服務發現 |
| **AirDrop 相容** | 無需 WiFi、近距離 | 協定受限、難程式化 | 點對點快速傳輸 |
| **開源工具** | 功能完整、自主性高 | 維護考量、相容性 | 整合方案、自建基礎設施 |

---

## WebDAV 方案

### iOS 原生支援狀況

**結論**：iOS 不原生支援 WebDAV server，只支援透過第三方 app 連接 WebDAV 伺服器。

#### iOS 檔案 App 限制

- iOS 內建「檔案」app 不支援 WebDAV 連接
- iCloud 相關應用（Pages、Numbers、Keynote）有限的 WebDAV 支援
- 所有 WebDAV 功能都依賴第三方應用

### 第三方 App 方案

#### 1. **Documents by Readdle** ⭐ 推薦

**特點**：
- 提供內建 WebDAV server 功能
- 可在 Control Center 啟動 WebDAV Server
- 支援 iOS-to-iOS 與 iOS-to-Mac/PC 傳輸

**使用流程**：

**在 iPhone 上啟動伺服器**：
1. 開啟 Documents app → Control Center
2. 點擊 **Start WebDAV Server**
3. 設定用戶名與密碼
4. 記錄顯示的 IP 地址

**從 PC 連接**：
- **Windows 10/11**：檔案總管 → 「對應網路磁碟機」→ 輸入 `http://[IP]:port`
- **macOS**：Finder → Go → Connect to Server → `http://[IP]`
- **Linux**：`sudo mount -t davfs http://[IP] /mnt/point`

**iOS-to-iOS 傳輸**：
1. 接收端：Documents → Plus → Add Cloud Connection → WebDAV Server
2. 選擇發送端裝置或手動輸入 IP
3. 輸入認證資訊
4. 瀏覽並下載檔案

**來源**：[Documents Knowledge Base - WebDAV Transfer](https://support.readdle.com/documents/transfer-share-your-files/transfer-files-to-another-ios-device-with-webdav)

#### 2. **FileBrowser Professional** ⭐ 推薦

**特點**：
- 完整的 WebDAV server 實作
- 支援跨平台設備發現
- 整合進 iOS Files app

**伺服器設定**：
- 主畫面設定 → 啟用 WebDAV server
- 設定用戶名、密碼與共享位置
- 預設埠號通常為 20002

**連接方式**：
- **macOS**：`http://192.168.1.12:20002/`
- **Windows**：`\\192.168.1.12@20002\DavWWWRoot`
- **iOS 裝置**：自動掃描發現，「Add Location」工作流

**來源**：[FileBrowser - WebDAV Server](https://www.stratospherix.com/products/filebrowser/home/webdavserver/)

#### 3. 其他 WebDAV 應用

| App | 功能 | 備註 |
|-----|------|------|
| **WebDAV Manager** | 簡化的 WebDAV 客户端 | App Store 持續更新，支援 MP4 |
| **WebDAV Navigator** | 輕量級 WebDAV 瀏覽器 | 支援下載與郵件轉發 |
| **WebDAVPro** | Files App 擴展 | 在 Files App 中直接使用 WebDAV |

**來源**：
- [WebDAV Manager - App Store](https://apps.apple.com/us/app/webdav-manager/id1596487405)
- [WebDAV Navigator](https://seanashton.net/webdav/)
- [WebDAVPro](https://webdavpro.com/site/)

### WebDAV 技術評估

**優點**：
- ✅ 標準化協定，文件完整
- ✅ 支援檔案的完整 CRUD 操作（讀寫刪除）
- ✅ 支援雙向同步
- ✅ 多平台應用支援豐富

**缺點**：
- ❌ iOS 需依賴第三方 app（無原生支援）
- ❌ 需要手動設定伺服器 IP 地址
- ❌ 認證資訊需分別設定
- ❌ 需確保兩端都在同一 WiFi 網路

**安全考量**：
- 建議在可信任的本機 WiFi 網路上使用
- WebDAV 支援 HTTPS，但 iPhone apps 通常使用 HTTP（需評估風險）
- 建議使用強密碼以防本機網路入侵

---

## HTTP Server 方案

### 可行性評估

**結論**：可行，但只適用 **PC → iPhone 單向推送**，不適合雙向同步。

### 實作原理

iPhone app 作為 HTTP server，PC 用 HTTP PUT 或 POST 上傳檔案：

```
PC (HTTP Client) ──── HTTP PUT/POST ───→ iPhone (HTTP Server)
```

### 推薦應用

#### 1. **Air Transfer** ⭐

**特點**：
- 輕量級 HTTP server
- 簡潔的 web UI

**使用流程**：
1. iPhone 開啟 Air Transfer app
2. 記錄顯示的 IP 地址與埠號
3. PC 開啟瀏覽器，輸入 `http://[IP]:port`
4. 從 web UI 上傳檔案

**來源**：[Air Transfer - App Store](https://apps.apple.com/us/app/air-transfer-file-transfer-from-to-pc-thru-wifi/id521595136)

#### 2. **File Transfer App**

**特點**：
- 支援檔案上傳與下載
- 可下載為 ZIP 歸檔
- 無需在 PC 端安裝軟體

**工作流**：
- iPhone 端：app 自動提供 web 服務
- PC 端：任何瀏覽器訪問指定 URL
- 支援拖拽上傳、多檔案上傳

**來源**：[File Transfer App - App Store](https://apps.apple.com/us/app/file-transfer-app/id1233997232)

#### 3. **Simple Server: HTTP Server**

**特點**：
- 可自訂共享資料夾
- 支援本機網路瀏覽

**使用方式**：
- 在 iPhone 上選擇要分享的資料夾
- PC 瀏覽器存取即可
- 支援線上檔案管理

**來源**：[Simple Server - App Store](https://apps.apple.com/us/app/simple-server-http-server/id6443893597)

### HTTP PUT 實作細節

#### 在 iPhone 上實作 HTTP server

使用 Swift 的簡化示例：

```swift
import Foundation
import GCDWebServer

let webServer = GCDWebServer()

// 設定 PUT 請求處理
webServer.addHandler(forMethod: "PUT", pathRegex: "/upload/.*", request: GCDWebServerRequest.self) { request in
    let filePath = /* 決定儲存位置 */
    try? request.rawBody?.write(toFile: filePath, options: .atomic)
    return GCDWebServerResponse(statusCode: 200)
}

// 啟動伺服器
try? webServer.start(withPort: 8080, bonjourName: "MyDevice")
```

#### PC 端 cURL 上傳範例

```bash
curl -X PUT --data-binary @"file.pdf" http://[iPhone-IP]:8080/upload/file.pdf
```

或使用 PowerShell：

```powershell
$file = "C:\path\to\file.pdf"
$url = "http://[iPhone-IP]:8080/upload/file.pdf"
Invoke-WebRequest -Uri $url -Method Put -InFile $file
```

### HTTP Server 技術評估

**優點**：
- ✅ 實作簡單，開發週期短
- ✅ 無需複雜協定，基於標準 HTTP
- ✅ PC 端無需安裝任何軟體
- ✅ 跨平台 PC 端支援（Windows、Mac、Linux）

**缺點**：
- ❌ 單向傳輸（iPhone 不易拉取 PC 檔案）
- ❌ 無內建認證機制（需自行實作）
- ❌ 無 SSL/TLS 加密（除非額外配置）
- ❌ 無檔案系統瀏覽能力（需自行實作 web UI）
- ❌ iPhone app 需持續運行在前景（見[後臺執行限制](#ios-後臺執行限制)）

**安全風險**：
- HTTP 傳輸未加密，不建議在公開 WiFi 使用
- 需實作簡單認證防止未授權訪問

---

## Bonjour/mDNS 服務發現

### 角色與價值

Bonjour（Apple 的 mDNS 實作）在 WiFi 傳輸中主要作用是 **自動設備發現**，消除手動設定 IP 地址的複雜性。

### 工作原理

```
設備 A (iPhone)                  設備 B (PC)
   │                               │
   ├─ 在 mDNS 上廣播                │
   │  "_webdav._tcp.local"         │
   │  (hostname.local)             │
   │                               │
   └─────────────────────────────→ PC 自動發現
                                   並顯示在可用列表中
```

### iOS 與 PC 平台支援

#### iOS 原生支援
- ✅ iOS 內建 Bonjour/mDNS 支援
- ✅ 自動廣播 Bonjour 服務
- ✅ 透過 `NetServiceBrowser` API 發現服務

#### macOS 支援
- ✅ 完整 Bonjour 支援
- ✅ Finder 自動顯示 Bonjour 設備

#### Windows 支援
- ⚠️ 需要安裝 Bonjour 服務（Apple Bonjour Print Services）
- ⚠️ 預設不內建，可靠性一般

#### Linux 支援
- ✅ 透過 `avahi-daemon` 完整支援
- ✅ 與 Bonjour 相容

### 實作指引

#### iOS 廣播 mDNS 服務

```swift
import Network

let bonjourService = NetService(
    domain: "local.",
    type: "_http._tcp.",
    name: "MyFileServer",
    port: 8080
)

bonjourService.publish()
```

#### iOS 發現 mDNS 服務

```swift
let browser = NetServiceBrowser()
browser.searchForServices(ofType: "_webdav._tcp.", inDomain: "local.")

// 在委託方法中收到回調
func netServiceBrowser(_ browser: NetServiceBrowser,
                      didFind service: NetService,
                      moreComing: Bool) {
    // 使用 service.addresses 得到 IP 地址
    print("Found: \(service.name) at \(service.addresses)")
}
```

#### PC 端發現 mDNS（Windows + Bonjour）

```powershell
# 需要安裝 Apple Bonjour
Get-Service mDnsResponder
```

### Bonjour 限制與考量

**網路限制**：
- mDNS 流量限制在單一網路段（LAN）
- 不跨 VLAN，除非設定 mDNS 反射閘道
- 適合家庭 WiFi，企業網路可能受限

**可靠性**：
- iOS 與 Mac 相容性好
- Windows 需額外安裝 Bonjour 服務
- 某些 WiFi 網路可能阻止 mDNS 流量

**來源**：
- [Bonjour - Apple Developer](https://developer.apple.com/bonjour/)
- [Understanding mDNS and Apple Bonjour](https://bytes.twotrees.com/understanding-mdns-and-apple-bonjour-a-guide-for-k-12-schools-and-smbs/)
- [Discovery DNS-SD Browser App](https://apps.apple.com/us/app/discovery-dns-sd-browser/id305441017)

### 建議應用場景

- ✅ 自動發現設備清單，改善用戶體驗
- ✅ 結合 WebDAV 或 HTTP server 自動填入 IP
- ⚠️ 在 Windows 網路上需謹慎測試

---

## AirDrop 協定分析

### 協定可程式化性

**結論**：AirDrop 本身協定受到專利與加密保護，不易程式化，但開源社群已有研究與實作。

### Apple 的 AirDrop 技術棧

AirDrop 使用分層架構：

```
應用層 (AirDrop UI)
     ↓
HTTP/TCP 層 (檔案傳輸)
     ↓
AWDL/WiFi Direct 層 (無基礎設施 WiFi)
     ↓
物理層 (Wi-Fi 硬體)
```

**AWDL 的角色**：
- Apple Wireless Direct Link (AWDL)：不需要 router 的點對點 WiFi
- 避免連接到共享網路時的 WiFi 頻道競爭
- 硬體層面支援，個人開發者難以直接使用

### 開源實作：Open Wireless Link (OWL)

#### 概述

由 TU Darmstadt 大學 Secure Mobile Networking Lab 開發，針對 AWDL 協定的反向工程實作。

**主要成就**：
- ✅ 成功逆向工程 AWDL 協定
- ✅ 榮獲 MobiCom '18 最佳社群論文獎
- ✅ 集成到 Wireshark 3.0 作為 AWDL dissector

**GitHub 地址**：[seemoo-lab/owl](https://github.com/seemoo-lab/owl)

#### 技術實作細節

**語言與平台**：
- 純 C 實作
- 支援 Linux 與 macOS
- 用戶空間運行，透過 Netlink API 與 Linux 核心互動

**架構**：
- 虛擬網路介面 (`awdl0`)
- 支援 IPv6 通訊
- 與現有網路程式相容（無需修改）

**硬體要求**：
- Wi-Fi 卡需支援監控模式（Monitor mode）
- 支援幀注入（Frame injection）
- **推薦芯片**：Atheros AR9280
- ⚠️ 虛擬機與 WSL 不支援（需直接硬體訪問）

**安裝與依賴**：

```bash
# Debian/Ubuntu
sudo apt-get install libpcap-dev libev-dev libnl-3-dev

# Fedora
sudo dnf install libpcap-devel libev-devel libnl3-devel

# macOS
brew install libpcap libev libnl
```

**編譯與執行**：

```bash
git clone https://github.com/seemoo-lab/owl.git
cd owl
cmake .
make
sudo ./owl -i wlan0
```

#### 局限性

- ⚠️ 靜態選舉值，設備只能為 slave 或 winner，不能切換
- ⚠️ 通道序列不動態適應
- ⚠️ 無法同時連接多個 AP
- ⚠️ 反向工程基礎，可能與新 iOS 版本不相容

**來源**：
- [OWL Repository](https://github.com/seemoo-lab/owl)
- [Open Wireless Link Project](https://owlink.org/)

### OpenDrop：開源 AirDrop 實作

#### 概述

基於 OWL 的 AWDL 實作，加上應用層的 AirDrop 協定實作。

**特點**：
- ✅ Python 實作，易於理解與修改
- ✅ 與 Apple AirDrop 相容
- ✅ 跨平台支援（Linux、macOS）
- ✅ 支援 iOS 與 macOS 設備

**限制**：
- ❌ 需要支援 monitor mode 的 Wi-Fi 硬體
- ❌ Linux 與 macOS 實作成熟，但 iOS 集成困難

**GitHub 地址**：[seemoo-lab/opendrop](https://github.com/seemoo-lab/opendrop)

**安裝**：

```bash
pip install opendrop
opendrop --help
```

**來源**：
- [OpenDrop PyPI](https://pypi.org/project/opendrop/)
- [Introducing OpenDrop](https://www.packtpub.com/en-br/learning/tech-news/introducing-opendrop-an-open-source-implementation-of-apple-airdrop-written-in-python)

### AirDrop 可程式化性評估

**優點**：
- ✅ 無需 WiFi 網路，點對點傳輸
- ✅ 近距離傳輸速度快
- ✅ 開源實作存在，可參考

**缺點**：
- ❌ 協定本身受專利保護，難以直接使用
- ❌ iOS 上程式化支援有限
- ❌ 硬體要求高（需特定 WiFi 卡）
- ❌ 開源實作可靠性與相容性有限
- ❌ 與 Apple 更新版本的同步困難

**建議**：
- 🔴 **不推薦**用於自建檔案同步系統
- ✅ 可作為參考學習，理解 Apple 無線協定架構

---

## 開源 WiFi 傳輸工具

### 1. **LocalSend** ⭐⭐⭐ 推薦度最高

#### 概述

輕量級、零設定的點對點檔案同步工具，完全開源。

**特點**：
- ✅ 100% 開源（無廣告、無追蹤）
- ✅ 完全離線，資料不離開本機 WiFi
- ✅ 端到端加密（AES-GCM）
- ✅ 跨平台：Windows、macOS、Linux、Android、iOS
- ✅ 零設定，自動發現設備
- ✅ 70,000+ GitHub stars，500 萬下載量

**工作原理**：
```
[PC] ←───────── WiFi 直連 ───────→ [iPhone]
     ← 自動發現 (mDNS)
     ← 點對點 TCP
     ← 端加密 (AES-GCM)
```

**使用流程**：
1. 雙端下載並開啟 LocalSend
2. 自動掃描發現 WiFi 內的設備
3. 選擇目標設備
4. 選擇檔案拖拽或選擇
5. 接收端確認並接收

**官方網站**：[LocalSend](https://localsend.org)

**GitHub**：[localsend/localsend](https://github.com/localsend/localsend)

**iOS 下載**：[Apple App Store](https://apps.apple.com/us/app/localsend-share-files-to-nearby-devices/id1626001067)

**技術棧**：
- **跨平台框架**：Flutter
- **網路層**：原生 TCP sockets + 自訂協定
- **加密**：OpenSSL (AES-GCM)
- **設備發現**：Bonjour/mDNS

#### 優點與缺點

**優點**：
- ✅ 完全免費，無任何付費功能
- ✅ 使用者體驗優異，啟動快速
- ✅ 社群活躍，定期更新
- ✅ 支援大檔案傳輸（測試無上限）

**缺點**：
- ❌ 不提供實時同步（點對點傳輸）
- ❌ 無版本控制或增量備份
- ❌ iOS 版本無後臺傳輸支援

#### 適用場景

- ✅ 快速一次性檔案傳輸
- ✅ 家庭 WiFi 環境
- ✅ 不需要持續同步的場景

---

### 2. **Sharik**

#### 概述

MIT 授權的跨平台檔案分享工具。

**特點**：
- ✅ 開源（MIT License）
- ✅ 支援 Android、iOS、Windows、Mac、Linux
- ✅ WiFi 或行動熱點傳輸
- ✅ 簡潔的 UI 設計

**iOS App Store**：[Sharik - App Store](https://apps.apple.com/us/app/sharik-file-sharing-via-wifi/id1531473857)

**GitHub**：[marchellodev/sharik](https://github.com/marchellodev/sharik)

#### 評估

相比 LocalSend：
- 類似的功能集
- 社群規模較小（相對活躍度低）
- MIT License 相比 Apache 2.0 更寬鬆

**建議**：可視為 LocalSend 的備選方案。

---

### 3. **Flying Carpet**

#### 概述

跨平台 AirDrop 替代品，支援點對點傳輸，無需預先連接 WiFi。

**特點**：
- ✅ Ad hoc WiFi：Android/Linux/Windows 作為 hotspot，iPhone 連接
- ✅ 跨平台：iOS、Android、macOS、Windows、Linux
- ✅ 開源（Apache 2.0）
- ✅ 無需預先網路基礎設施

**技術實作**：
- **桌面版**：Rust + Tauri
- **Android**：Kotlin + LocalOnlyHotspot API
- **iOS**：Swift（閉源）

**Github**：[spieglt/FlyingCarpet](https://github.com/spieglt/FlyingCarpet)

#### iOS 限制

⚠️ iOS 版本無法程式化地創建 hotspot（Apple 限制），只能連接到由其他設備創建的 hotspot。

#### 適用場景

- ✅ 臨時網路不可用的環境
- ⚠️ iOS 端只能接收，不能發起

---

### 4. **WiFiTransfer**（GitHub 開源項目）

#### 概述

相對簡潔的 WiFi 檔案傳輸解決方案。

**GitHub**：[wang1925/WiFiTransfer](https://github.com/wang1925/WiFiTransfer)

**特點**：
- 輕量級實作
- 支援 iPhone app 與 PC 通訊

**限制**：
- 相對新手友好，但維護狀況一般
- 功能不如 LocalSend 完整

---

### 開源工具比較表

| 工具 | 平台支援 | 加密 | 設備發現 | 維護狀況 | 推薦度 |
|------|---------|------|---------|---------|--------|
| **LocalSend** | Win/Mac/Linux/Android/iOS | ✅ AES-GCM | ✅ mDNS | ⭐⭐⭐ 活躍 | ⭐⭐⭐⭐⭐ |
| **Sharik** | Win/Mac/Linux/Android/iOS | ✅ | ✅ | ⭐⭐ 一般 | ⭐⭐⭐⭐ |
| **Flying Carpet** | Win/Mac/Linux/Android/iOS | ✅ | ❌ | ⭐⭐⭐ 活躍 | ⭐⭐⭐ |
| **WiFiTransfer** | iOS/PC | ⚠️ | ❌ | ⭐ 有限 | ⭐⭐ |

---

## iOS 後臺執行限制

### 核心限制

這是 iOS 檔案同步方案的重要制約因素。下列限制直接影響單向推送或雙向同步的可行性。

### 1. Background Fetch

**用途**：週期性拉取服務器內容

**限制**：
- ❌ 無保證執行時間（系統決定）
- ❌ 每次執行最多 30 秒
- ❌ 無法設定最小間隔（如指定 1 小時，系統只保證不早於 1 小時，但不保證恰好 1 小時後執行）
- ❌ 受電池狀態、網路條件影響

**結論**：不適合實時檔案接收

**來源**：[iOS Background Fetch 簡介](https://newrelic.com/blog/best-practices/ios9-background-execution)

### 2. URLSession 後臺傳輸

**優勢**：
- ✅ iOS 原生支援
- ✅ 下載/上傳任務可在後臺持續
- ✅ App 退出後仍可完成傳輸

**限制**：

**WiFi 優化**：
```
isDiscretionary = true
  ↓
系統延遲傳輸至 WiFi + 充電狀態
```

**同時傳輸限制**：
- ⚠️ 建議最多 4 個後臺任務
- ❌ 超過會被系統限流

**上傳檔案限制**：
- ❌ 上傳必須來自檔案引用，不支援內存數據

**協定限制**：
- ❌ 只支援 HTTP/HTTPS
- ❌ 不支援自訂協定

**調試困難**：
- ⚠️ 附加 Xcode debugger 會阻止 app 後臺掛起，導致任務無法執行
- ✅ 應使用 OSLog 替代

**來源**：[URLSession 後臺傳輸常見陷阱](https://www.avanderlee.com/swift/urlsession-common-pitfalls-with-background-download-upload-tasks/)

### 3. VoIP Background Mode

**原意用途**：保持 VoIP 應用在後臺運行以接收來電

**理論上的檔案傳輸可能**：
- ⚠️ 某些開發者嘗試用於保持網路連接活動
- ❌ **不符合 Apple App Store 審查政策**
- ❌ 濫用將導致 app 被拒或下架

**限制**：
- 設計用於語音通訊，不用於檔案傳輸
- Apple 會檢查 VoIP push 使用情況

**結論**：不推薦用於檔案同步

**來源**：
- [iOS 後臺模式指南](https://getstream.io/blog/ios-background-modes/)
- [VoIP 最佳實踐](https://developer.apple.com/library/archive/documentation/Performance/Conceptual/EnergyGuide-iOS/OptimizeVoIP.html)

### 4. WebSocket 與 Socket.IO 持久連接

**問題**：iOS 不支援在應用掛起時保持裸 TCP 連接

**技術根本原因**：
- iOS 的 multitasking 架構不允許任意背景 socket
- TCP 連接在 app 掛起時會被系統關閉

**常見嘗試（都不可行）**：
- ❌ 使用 VoIP 模式保持 WebSocket（被審查拒絕）
- ❌ 使用 Background Processing（仍會被掛起）
- ❌ 使用 PushKit（應改用 push notification）

**推薦替代方案**：
- ✅ **Push Notifications**：伺服器主動喚醒 app，app 使用 URLSession 後臺傳輸
- ✅ **Background Fetch**：週期性檢查伺服器（但頻率無保證）

**來源**：
- [Stack Overflow - iOS WebSocket 持久連接](https://developer.apple.com/forums/thread/681892)
- [Socket.IO Swift 問題列表](https://github.com/socketio/socket.io-client-swift/issues/712)

### 5. 實時檔案接收的可行性分析

假設場景：**PC 推送檔案到 iPhone，無需用戶操作**

```
PC (WiFi)
  ↓
  └─→ [HTTP PUT 上傳] ──→ iPhone (後臺)
                           └─→ ❌ App 需在前景或已被喚醒
                           └─→ ⚠️ URLSession 可後臺接收，但需事先預設
```

**結論**：
- ✅ **可行方案**：
  1. App 在前景時接收
  2. App 事先使用 URLSession 設定後臺下載任務
  3. 伺服器推送 notification，App 喚醒並傳輸

- ❌ **不可行**：
  1. App 完全後臺時任意接收
  2. 實時 socket 監聽

---

## 綜合評估與建議

### 方案選擇決策樹

```
需求：PC ↔ iPhone 雙向檔案同步

├─ 「自動化、無用戶操作」？
│  ├─ YES → 方案 4：後臺推送 + URLSession
│  └─ NO  ↓
│
└─ 「簡潔易用，快速傳輸」？
   ├─ YES → 方案 1：LocalSend ⭐ 最推薦
   └─ NO  ↓

      └─ 「雙向同步，檔案管理」？
         ├─ YES → 方案 2：WebDAV (Documents/FileBrowser) ⭐⭐ 推薦
         └─ NO  ↓

            └─ 「單向推送，簡單上傳」？
               └─ YES → 方案 3：HTTP Server App ⭐ 可行
```

### 推薦方案清單

#### **第一層推薦：LocalSend** ⭐⭐⭐⭐⭐

**適用場景**：
- 家庭或辦公室 WiFi
- 一次性檔案傳輸
- 無特殊同步需求
- 注重易用性與安全性

**實作成本**：低（直接使用現成 app）

**相容性**：跨平台完美

**限制**：
- 無實時同步
- 無版本控制

---

#### **第二層推薦：WebDAV (Documents by Readdle 或 FileBrowser)** ⭐⭐⭐⭐

**適用場景**：
- 需要雙向同步
- 需要檔案管理（瀏覽、刪除、重命名）
- 願意設定一次 IP 地址與認證

**實作成本**：低（購買 app，約 $10-20）

**相容性**：跨 iOS/macOS/Windows 好

**限制**：
- iOS 無原生支援，需第三方 app
- 手動設定 IP 與認證
- 需確保兩端在同一 WiFi

---

#### **第三層推薦：自建 HTTP Server (Air Transfer 或 File Transfer App)** ⭐⭐⭐

**適用場景**：
- PC 主動推送，iPhone 被動接收
- 簡化用戶界面（web 型上傳）
- 不需要 iPhone 主動拉取

**實作成本**：低（直接使用現成 app）

**限制**：
- 單向傳輸
- 無複雜檔案管理
- App 需在前景

---

#### **進階推薦：自建解決方案** ⭐⭐

**若需要高度自訂（如整合到現有系統）**

**技術棧建議**：

1. **iPhone 端**：
   - 使用 Swift GCDWebServer 實作簡單 HTTP server
   - 支援 PUT 上傳、GET 下載
   - 結合 URLSession 後臺傳輸功能

2. **服務發現**：
   - 集成 Bonjour/mDNS 廣播
   - PC 自動發現 iPhone 設備

3. **PC 端**：
   - Python/Go/Rust 簡單客户端
   - 監控本機檔案夾，自動 PUT 推送到 iPhone

4. **加密與認證**：
   - HTTPS（自簽憑證）
   - Token-based 認證

**參考實作**：
- 基礎 WebDAV：研究 Documents by Readdle 的開源實作
- HTTP Server：使用 `GCDWebServer`（CocoaPods）
- Bonjour：使用 `NetService` API

---

### 技術方案對比矩陣

| 特性 | LocalSend | WebDAV | HTTP Server | 自建方案 |
|------|-----------|--------|-------------|---------|
| **易用性** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| **雙向支援** | ✅ | ✅ | ❌ | ✅ |
| **檔案管理** | ✅ | ✅✅✅ | ❌ | ✅ |
| **自動發現** | ✅ | ⚠️ | ⚠️ | ✅ |
| **後臺傳輸** | ❌ | ⚠️ | ❌ | ⚠️ |
| **加密** | ✅ | ❌ | ❌ | ✅ |
| **開源** | ✅ | ❌ | ⚠️ | - |
| **維護成本** | 低 | 低 | 低 | 高 |
| **跨平台** | ✅ | ✅ | ✅ | ✅ |

---

## 參考資源與來源

### 官方文檔
- [Apple Bonjour Developer](https://developer.apple.com/bonjour/)
- [Apple URLSession Background Transfers](https://developer.apple.com/documentation/foundation/urlsession)
- [Apple iOS Background Modes](https://developer.apple.com/documentation/xcode/configuring-background-execution-modes)

### 應用與服務
- [LocalSend 官方](https://localsend.org)
- [Documents by Readdle - WebDAV](https://support.readdle.com/documents/)
- [FileBrowser Professional](https://www.stratospherix.com/products/filebrowser/home/)
- [Air Transfer - App Store](https://apps.apple.com/us/app/air-transfer-file-transfer-from-to-pc-thru-wifi/id521595136)

### 開源項目
- [Open Wireless Link (OWL)](https://owlink.org/) - AWDL 實作
- [OpenDrop](https://github.com/seemoo-lab/opendrop) - AirDrop 開源實作
- [Sharik](https://github.com/marchellodev/sharik) - 跨平台檔案共享
- [Flying Carpet](https://github.com/spieglt/FlyingCarpet) - Ad hoc WiFi 傳輸

### 技術文章
- [URLSession 後臺傳輸常見陷阱](https://www.avanderlee.com/swift/urlsession-common-pitfalls-with-background-download-upload-tasks/)
- [iOS 後臺模式指南](https://getstream.io/blog/ios-background-modes/)
- [Bonjour 與 mDNS 指南](https://bytes.twotrees.com/understanding-mdns-and-apple-bonjour-a-guide-for-k-12-schools-and-smbs/)
- [iOS WebSocket 後臺限制討論](https://developer.apple.com/forums/thread/681892)

---

**文檔版本**: 1.0
**最後更新**: 2026-03-10
**來源研究時間**: 2024-2025 年最新資料

