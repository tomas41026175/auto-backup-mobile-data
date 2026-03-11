# mDNS/Bonjour 裝置發現技術研究

> 研究日期：2026-03-11
> 狀態：完成
> 用途：Windows Auto Backup MVP - iOS 裝置區域網路發現機制

## 目錄

- [1. DNS-SD 與 mDNS 協定原理](#1-dns-sd-與-mdns-協定原理)
- [2. bonjour-service npm 套件](#2-bonjour-service-npm-套件)
- [3. 替代套件比較](#3-替代套件比較)
- [4. iOS 裝置 Bonjour 服務類型](#4-ios-裝置-bonjour-服務類型)
- [5. Port 62078 與 Apple Mobile Device Protocol](#5-port-62078-與-apple-mobile-device-protocol)
- [6. 本地網路權限（macOS / iOS）](#6-本地網路權限macos--ios)
- [7. Windows 上的 Bonjour 支援](#7-windows-上的-bonjour-支援)
- [8. 常見 mDNS 實作問題](#8-常見-mdns-實作問題)
- [9. Node.js TCP Ping 裝置存活驗證](#9-nodejs-tcp-ping-裝置存活驗證)
- [10. 建議方案](#10-建議方案)
- [來源](#來源)

---

## 1. DNS-SD 與 mDNS 協定原理

### 1.1 mDNS（Multicast DNS）— RFC 6762

mDNS 是一種零配置網路協定，允許裝置在區域網路內不依賴傳統 DNS 伺服器進行名稱解析。

**核心機制：**

- 使用標準 DNS 封包格式（無新增 opcode 或 response code）
- 查詢送往保留的多播位址：
  - IPv4：`224.0.0.251`
  - IPv6：`FF02::FB`
- 固定使用 **UDP port 5353**
- 域名空間為 `.local`（例如 `my-iphone.local`）

**查詢模式：**

| 模式 | 說明 |
|------|------|
| One-shot Query | 傳統解析器發送查詢至 `224.0.0.251:5353`，使用第一個回應 |
| Continuous Query | 完整 mDNS 實作持續監聽，非同步更新結果 |

**關鍵機制：**

- **CACHE-FLUSH bit**：指示鄰近節點覆蓋（而非附加）既有快取記錄
- **Conflict Resolution**：裝置啟動時進行 probing，偵測名稱衝突
- **TTL**：記錄有效期限，過期自動移除
- **Goodbye Packet**：服務下線時發送 TTL=0 的記錄

### 1.2 DNS-SD（DNS-Based Service Discovery）— RFC 6763

DNS-SD 建立在 mDNS 之上，定義了服務發現的命名與查詢規範。

**服務發現流程：**

```
1. 瀏覽服務 → PTR 查詢
   _http._tcp.local → PTR → "My Web Server._http._tcp.local"

2. 解析實例 → SRV + TXT 查詢
   SRV → target: myhost.local, port: 80
   TXT → key=value pairs（額外元資料）

3. 解析主機 → A/AAAA 查詢
   myhost.local → A → 192.168.1.100
```

**DNS 記錄類型：**

| 記錄類型 | 用途 | 範例 |
|----------|------|------|
| PTR | 列舉服務實例 | `_http._tcp.local → "My Server._http._tcp.local"` |
| SRV | 提供主機名稱與 port | `priority=0, weight=0, port=80, target=myhost.local` |
| TXT | 額外元資料（key-value） | `model=MacBookPro18,3` |
| A/AAAA | 主機名稱→IP 解析 | `myhost.local → 192.168.1.100` |

**服務類型命名規則：**

```
_<service>._<transport>.local
```

- `_<service>`：IANA 註冊的服務名稱，前綴底線
- `_<transport>`：`_tcp` 或 `_udp`

---

## 2. bonjour-service npm 套件

### 2.1 基本資訊

| 項目 | 內容 |
|------|------|
| 套件名稱 | [bonjour-service](https://www.npmjs.com/package/bonjour-service) |
| GitHub | [onlxltd/bonjour-service](https://github.com/onlxltd/bonjour-service) |
| 最新版本 | v1.3.0（2024-11-18） |
| 語言 | TypeScript 77.7% / JavaScript 22.3% |
| Stars | 106 |
| Open Issues | 23 |
| 授權 | MIT |
| 底層依賴 | `multicast-dns`（週下載量 ~14M）、`dns-txt` |

### 2.2 API 文件

**初始化：**

```typescript
import { Bonjour } from 'bonjour-service'

const instance = new Bonjour(
  { /* multicast-dns options（可選）*/ },
  (error: Error) => { /* error callback（強烈建議提供）*/ }
)
```

**發布服務（publish）：**

```typescript
const service = instance.publish({
  name: 'My Web Server',   // 服務名稱
  type: 'http',             // 服務類型（不含底線和 _tcp）
  port: 3000,               // 埠號
  host: 'myhost.local',     // 可選，預設為本機 hostname
  protocol: 'tcp',          // 可選，預設 tcp
  subtypes: ['printer'],    // 可選，子類型陣列
  txt: { key: 'value' },    // 可選，TXT 記錄
})

// Service 事件
service.on('up', () => { /* 服務已發布 */ })
service.on('error', (err) => { /* 錯誤處理 */ })
```

**瀏覽服務（find / findOne）：**

```typescript
// 持續瀏覽
const browser = instance.find({ type: 'http' }, (service) => {
  console.log('Found:', service.name, service.host, service.port)
})

// Browser 事件
browser.on('up', (service) => { /* 發現新服務 */ })
browser.on('down', (service) => { /* 服務離線 */ })
browser.on('txt-update', (service) => { /* TXT 記錄更新 */ })

// 只找第一個
instance.findOne({ type: 'http' }, (service) => {
  console.log('First match:', service)
})
```

**Service 物件屬性：**

```typescript
interface Service {
  name: string        // 服務名稱
  type: string        // 服務類型
  host: string        // hostname 或 IP
  port: number        // 埠號
  fqdn: string        // 完整域名，例如 "My Server._http._tcp.local"
  txt: object         // TXT 記錄（key-value）
  addresses: string[] // IP 位址列表
}
```

**銷毀：**

```typescript
instance.destroy() // 關閉所有伺服器和瀏覽器
```

### 2.3 已知問題（2024-2025）

| Issue | 說明 | 影響 |
|-------|------|------|
| [#73](https://github.com/onlxltd/bonjour-service/issues/73) | Service 的 `error` 事件永遠不會被觸發 | 錯誤處理不完整 |
| [#70](https://github.com/onlxltd/bonjour-service/issues/70) | 無法限制發布的 IP 位址範圍 | 多網卡環境問題 |
| [#66](https://github.com/onlxltd/bonjour-service/issues/66) | Version 2 規劃討論（2024-11） | 未來架構變更 |
| [#61](https://github.com/onlxltd/bonjour-service/issues/61) | 缺少網路變更偵測功能 | 需要自行實作 |
| [#59](https://github.com/onlxltd/bonjour-service/issues/59) | UDP-only 服務搜尋無法運作 | 功能限制 |
| [#58](https://github.com/onlxltd/bonjour-service/issues/58) | 建構式 options 無法完整傳遞給 multicast-dns | 配置受限 |
| [#54](https://github.com/onlxltd/bonjour-service/issues/54) | Browser.services 型別定義不正確 | TypeScript 相容性 |

**維護狀況評估：**

- 最後 release 為 2024-11-18（v1.3.0），維護尚在進行
- 23 個 open issues，部分長期未解決
- 是原始 `bonjour` 套件（已停止維護）的 TypeScript 重寫版本
- 原始 `bonjour` 套件有 `ip` 依賴的高嚴重性安全漏洞，`bonjour-service` 已修復

---

## 3. 替代套件比較

### 3.1 綜合比較表

| 特性 | bonjour-service | mdns (node_mdns) | mdns-js | node-dns-sd | multicast-dns |
|------|----------------|-------------------|---------|-------------|---------------|
| **實作方式** | Pure JS (TS) | Native binding (dns_sd API) | Pure JS | Pure JS | Pure JS |
| **TypeScript** | 原生支援 | 需 @types | 無 | 無 | 需 @types |
| **服務發布** | 支援 | 支援 | 支援 | 不支援 | 低階支援 |
| **服務發現** | 支援 | 支援 | 支援 | 支援 | 低階支援 |
| **IPv6** | 支援 | 支援 | 部分 | 不支援 | 支援 |
| **原生依賴** | 無 | 需要（dns_sd） | 無 | 無 | 無 |
| **Electron 相容** | 佳 | 需 rebuild | 佳 | 佳 | 佳 |
| **週下載量** | ~1.1M | ~2K | ~10K | ~1K | ~14M |
| **維護狀態** | 活躍（2024） | 停滯 | 停滯 | 停滯 | 活躍 |
| **API 層級** | 高階 | 高階 | 中階 | 中階 | 低階 |

### 3.2 各套件詳細說明

**bonjour-service（推薦）**

- 原始 `bonjour` 的 TypeScript 重寫，修復安全漏洞
- 高階 API，開箱即用
- 無原生依賴，Electron 打包無障礙
- 底層使用 `multicast-dns`

**mdns (node_mdns)**

- 使用系統原生 dns_sd API（macOS 內建，Linux 需 Avahi，Windows 需 Bonjour SDK）
- 原生 binding 在 Electron 中需要 `electron-rebuild`
- 最後更新已久，GitHub 876 stars 但已不維護

**mdns-js**

- Pure JS 實作，但功能不完整
- 不支援瀏覽器環境
- Node.js 版本相容性限制多

**node-dns-sd**

- 僅支援服務瀏覽（不支援發布）
- 僅支援 IPv4
- 專注於從服務名稱取得 IP 位址

**multicast-dns**

- 最低階的 mDNS 協定實作
- 週下載量最高（~14M），被眾多上層套件依賴
- 需要自行組裝 DNS-SD 邏輯
- 適合需要精細控制的場景

### 3.3 選擇建議

對於 **Electron + Node.js** 場景：

1. **首選 `bonjour-service`**：高階 API、TypeScript、無原生依賴
2. **備選 `multicast-dns`**：如需更精細控制底層行為
3. **避免 `mdns`**：原生 binding 增加打包複雜度

---

## 4. iOS 裝置 Bonjour 服務類型

### 4.1 iOS 裝置常見廣播服務

| 服務類型 | Port | 說明 | 啟用條件 |
|----------|------|------|----------|
| `_companion-link._tcp` | 49153-49154（動態） | Apple 裝置間通訊（**幾乎所有裝置都可被發現**） | 始終廣播 |
| `_apple-mobdev2._tcp` | 62078 | iTunes Wi-Fi 同步 | **需在 iTunes 中啟用 Wi-Fi 同步** |
| `_rdlink._tcp` | 動態 | Remote Active Queue Management，裝置識別 | 始終廣播 |
| `_device-info._tcp` | N/A | 裝置基本資訊（透過 TXT 記錄） | 始終廣播 |
| `_airplay._tcp` | 7000 | AirPlay 串流 | 始終廣播 |
| `_raop._tcp` | 動態 | Remote Audio Output Protocol（AirPlay 音訊） | 始終廣播 |
| `_airdrop._tcp` | 動態 | AirDrop 檔案傳輸 | AirDrop 開啟時 |
| `_homekit._tcp` | 動態 | HomeKit 配件協定 | HomeKit 啟用時 |
| `_hap._tcp` | 動態 | HomeKit Accessory Protocol | HomeKit 啟用時 |

### 4.2 裝置發現策略

**最可靠的發現方式：**

1. **`_companion-link._tcp`** — 覆蓋率最高，幾乎所有 Apple 裝置都會廣播
2. **`_apple-mobdev2._tcp`** — 針對 Wi-Fi 同步場景，但需使用者先啟用

**TXT 記錄中的裝置資訊：**

```
model=iPhone15,2          // 裝置型號識別碼
osxvers=22                // OS 版本
rpBA=XX:XX:XX:XX:XX:XX   // Bluetooth 位址
rpHN=XXXXXXXX            // 雜湊過的名稱
```

**發現流程：**

```
1. 監聽 _companion-link._tcp → 取得裝置列表
2. 對發現的裝置 → TCP ping port 62078 → 確認 Wi-Fi 同步是否啟用
3. 可選：查詢 _apple-mobdev2._tcp → 直接找到已啟用同步的裝置
```

---

## 5. Port 62078 與 Apple Mobile Device Protocol

### 5.1 usbmuxd 架構

**usbmuxd**（USB Multiplexing Daemon）是 Apple 裝置通訊的核心服務，負責在 USB 或 TCP/IP 上多工傳輸多個資料流。

**通訊層級（由低到高）：**

```
┌─────────────────────────────────────┐
│  應用層：iTunes / Xcode / libimobiledevice  │
├─────────────────────────────────────┤
│  lockdownd：裝置認證、服務存取控制          │
├─────────────────────────────────────┤
│  usbmuxd：TCP 連線多工                     │
├─────────────────────────────────────┤
│  傳輸層：USB bulk endpoints / TCP/IP        │
└─────────────────────────────────────┘
```

### 5.2 Port 62078 詳細資訊

| 項目 | 內容 |
|------|------|
| Port | 62078/TCP |
| 服務 | lockdownd（iOS 鎖定守護程序） |
| 協定格式 | 32-bit big-endian 長度前綴 + XML plist payload |
| 存取方式 | USB（透過 usbmuxd）或 TCP/IP（Wi-Fi 同步） |

### 5.3 Wi-Fi 同步啟用條件

1. iOS 裝置必須已透過 USB **配對（pairing）**
2. 在 iTunes/Finder 中**勾選 Wi-Fi 同步**
3. 裝置與電腦在**同一區域網路**
4. 裝置**已連接電源充電**（部分操作需要）

**一旦啟用，裝置會：**

- 廣播 `_apple-mobdev2._tcp` Bonjour 服務
- 在 port 62078 上監聽 TCP 連線
- 配對記錄（pairing record）保存於：
  - macOS：`/var/db/lockdown/`
  - Windows：`%ProgramData%\Apple\Lockdown\`

### 5.4 協定封包格式

```
┌──────────────────────────────────┐
│ 4 bytes: payload length (BE)     │
│ N bytes: XML plist payload       │
└──────────────────────────────────┘
```

**通訊流程：**

```
Client → lockdownd: QueryType
lockdownd → Client: Type=com.apple.mobile.lockdown
Client → lockdownd: GetValue (DeviceName, ProductType, etc.)
lockdownd → Client: Value=...
Client → lockdownd: StartSession (with pairing record)
lockdownd → Client: SessionID, EnableSessionSSL=true
... SSL 加密通道建立 ...
Client → lockdownd: StartService (com.apple.mobilebackup2)
lockdownd → Client: Port=XXXXX (動態分配的服務 port)
```

### 5.5 安全考量

- **CVE-2021-30883**：usbmuxd 配對後可被利用進行 iOS 攻擊
- 配對記錄（pairing record）等同於裝置信任憑證，需妥善保管
- Wi-Fi 同步使用 SSL/TLS 加密通道
- 建議：定期清理過期配對記錄、不使用時關閉 Wi-Fi 同步

---

## 6. 本地網路權限（macOS / iOS）

### 6.1 iOS 14+：Local Network Privacy

自 iOS 14 起，App 首次存取區域網路時，系統會跳出權限請求對話框。

**Info.plist 必要設定：**

```xml
<!-- 使用說明文字 -->
<key>NSLocalNetworkUsageDescription</key>
<string>此 App 需要存取區域網路以發現您的裝置</string>

<!-- Bonjour 服務類型清單 -->
<key>NSBonjourServices</key>
<array>
    <string>_companion-link._tcp</string>
    <string>_apple-mobdev2._tcp</string>
</array>
```

**權限行為：**

- 未授權時，Bonjour API 不會回報任何裝置（靜默等待）
- `NWConnection` 會停留在 `waiting` 狀態
- 權限對話框僅出現一次，後續需到「設定 > 隱私權 > 區域網路」手動變更
- 被拒絕時，API 回傳 `kDNSServiceErr_PolicyDenied` 錯誤

### 6.2 macOS Sequoia（15.0+）：Local Network Permission

**重大變更：** macOS 15 將 iOS 的區域網路隱私保護移植到 macOS。

**影響範圍：**

- 所有使用 Bonjour、unicast/multicast 連線、或允許使用者輸入 IP 位址的 App
- Electron App 同樣受影響

**Electron App 所需 entitlements：**

```xml
<!-- entitlements.plist -->
<key>com.apple.security.network.client</key>
<true/>
<key>com.apple.security.network.server</key>
<true/>
```

**Info.plist 設定：**

```xml
<key>NSLocalNetworkUsageDescription</key>
<string>需要存取區域網路以發現 iOS 裝置</string>

<key>NSBonjourServices</key>
<array>
    <string>_companion-link._tcp</string>
    <string>_apple-mobdev2._tcp</string>
</array>
```

**已知問題（macOS 15.0）：**

- multicast 流量有時會中斷，App 無法接收 multicast
- 從 Terminal 啟動 App 時正常，雙擊圖示啟動時異常
- Apple 表示已在 macOS 15.1 修復
- **Workaround**：以 launchd daemon 執行（不受 local network privacy 限制）

### 6.3 對 Electron App 的實作建議

```
1. 在 Info.plist 中宣告 NSLocalNetworkUsageDescription 和 NSBonjourServices
2. 在 entitlements.plist 中加入 network.client 和 network.server
3. 實作優雅的權限拒絕處理（告知使用者如何在系統偏好設定中啟用）
4. macOS 15.0 使用者建議升級至 15.1+
5. 測試時同時測試 Terminal 啟動和圖示啟動兩種情境
```

---

## 7. Windows 上的 Bonjour 支援

### 7.1 Windows 原生 mDNS

自 Windows 10 1903（SDK 10.0.18362.0）起，Windows 提供原生 mDNS 支援。

| 功能 | Windows 原生 | Apple Bonjour SDK |
|------|-------------|-------------------|
| mDNS 名稱解析（.local） | 支援 | 支援 |
| DNS-SD 服務發現 | **不支援** | 支援 |
| 服務廣播/註冊 | **不支援** | 支援 |
| 除錯工具 | 無 | `dns-sd` CLI 工具 |
| 架構 | 64-bit only | 32/64-bit |

**關鍵限制：** Windows 原生 `dnscache` 服務僅處理 mDNS 名稱解析（device.local → IP），**不實作 DNS-SD**（服務發現），因此無法透過原生 API 瀏覽 `_companion-link._tcp` 等服務。

### 7.2 Apple Bonjour SDK for Windows

- 最新版本：3.0.0.10（2025-11-14）
- 包含 `mDNSResponder` 服務和 `dns-sd` CLI
- 安裝 iTunes 時會自動安裝

**潛在衝突：** 同時安裝 Bonjour 和啟用 Windows 原生 mDNS 可能產生衝突，建議二擇一。

### 7.3 對 Node.js App 的影響

使用 **pure JavaScript 實作**（如 `bonjour-service` / `multicast-dns`）時：

- **不依賴系統原生 mDNS 服務**
- 直接透過 UDP socket 操作 multicast
- Windows、macOS、Linux 行為一致
- **無需安裝 Bonjour SDK**

這是選擇 pure JS 方案的最大優勢之一：跨平台一致性。

### 7.4 Windows 防火牆設定

Electron App 首次啟動時，Windows 防火牆可能彈出允許網路存取的對話框。需要：

- 允許 UDP port 5353（mDNS multicast）的**入站和出站**
- 程式碼中設定適當的 socket 選項（`reuseAddr: true`）

---

## 8. 常見 mDNS 實作問題

### 8.1 防火牆問題

**問題：** mDNS 查詢/回應被防火牆攔截

**解決方案：**

```
必須開放的規則：
- UDP port 5353 入站（接收 mDNS 回應）
- UDP port 5353 出站（發送 mDNS 查詢）
- 多播位址 224.0.0.251 的流量
```

**各平台處理：**

| 平台 | 預設行為 | 處理方式 |
|------|---------|---------|
| macOS | 通常開放 | macOS 15+ 需 local network 權限 |
| Windows | 防火牆彈窗 | 需使用者允許，或透過 installer 設定規則 |
| Linux | 通常開放 | 部分發行版需配置 iptables/nftables |

### 8.2 VPN 問題

**問題：** VPN 連線導致 mDNS 無法在區域網路運作

**原因：**

- VPN 通常使用 TUN（Layer 3）介面，multicast 封包無法通過
- 只有 TAP（Layer 2）VPN 支援 multicast
- VPN 可能改變預設路由，導致 multicast 送往錯誤介面

**解決方案：**

- 使用 split tunneling，排除 `224.0.0.251/32` 的流量
- 綁定特定網路介面（非 VPN 介面）進行 mDNS 查詢
- `multicast-dns` 套件支援指定 `interface` option

### 8.3 多網卡環境

**問題：** 裝置有多個網路介面（Wi-Fi + Ethernet + VPN），mDNS 查詢送往錯誤介面

**解決方案：**

```typescript
import { Bonjour } from 'bonjour-service'

// 指定特定介面（bonjour-service 底層 multicast-dns 支援）
const instance = new Bonjour({
  interface: '192.168.1.100'  // 綁定到特定介面的 IP
})
```

**注意事項：**

- 需偵測網路介面變更（`bonjour-service` #61 尚未內建此功能）
- 可用 `os.networkInterfaces()` 列舉可用介面
- 需過濾 loopback、VPN、Docker bridge 等虛擬介面
- 多網卡時可能需要在每個介面上各建立一個 Bonjour 實例

### 8.4 跨 VLAN/Subnet 問題

**問題：** mDNS 是 link-local 協定，無法跨子網路運作

**解決方案：**

- 使用 Avahi reflector（Linux 路由器）
- 使用支援 mDNS relay 的路由器（如 Ubiquiti）
- 對於我們的場景：**確保 iOS 裝置和電腦在同一子網路**

### 8.5 封包遺失與可靠性

**問題：** mDNS 使用 UDP，存在封包遺失風險

**對策：**

- DNS-SD 標準已考慮此問題：查詢會定期重發
- `bonjour-service` 內建重試機制
- 額外建議：搭配 TCP ping 進行裝置存活確認

---

## 9. Node.js TCP Ping 裝置存活驗證

### 9.1 為何需要 TCP Ping

mDNS 發現的裝置可能：

- 已經離開網路但快取尚未過期
- mDNS goodbye packet 遺失
- 服務已停止但裝置仍在線

TCP ping port 62078 可確認 iOS 裝置是否真的可連線且 Wi-Fi 同步服務正在運行。

### 9.2 使用 Node.js net 模組實作

```typescript
import { Socket } from 'net'

interface TcpPingResult {
  alive: boolean
  latencyMs: number
  error?: string
}

function tcpPing(
  host: string,
  port: number,
  timeoutMs: number = 3000
): Promise<TcpPingResult> {
  return new Promise((resolve) => {
    const startTime = Date.now()
    const socket = new Socket()

    socket.setTimeout(timeoutMs)

    socket.on('connect', () => {
      const latencyMs = Date.now() - startTime
      socket.destroy()
      resolve({ alive: true, latencyMs })
    })

    socket.on('timeout', () => {
      socket.destroy()
      resolve({ alive: false, latencyMs: timeoutMs, error: 'timeout' })
    })

    socket.on('error', (err: Error) => {
      socket.destroy()
      resolve({
        alive: false,
        latencyMs: Date.now() - startTime,
        error: err.message,
      })
    })

    socket.connect(port, host)
  })
}

// 使用範例
const result = await tcpPing('192.168.1.50', 62078, 3000)
if (result.alive) {
  console.log(`裝置在線，延遲 ${result.latencyMs}ms`)
}
```

### 9.3 週期性存活檢查

```typescript
interface DeviceStatus {
  host: string
  alive: boolean
  lastSeen: Date
  consecutiveFailures: number
}

async function healthCheck(
  devices: ReadonlyArray<DeviceStatus>,
  options: { port: number; timeoutMs: number; maxFailures: number }
): Promise<ReadonlyArray<DeviceStatus>> {
  const results = await Promise.all(
    devices.map(async (device) => {
      const ping = await tcpPing(device.host, options.port, options.timeoutMs)
      return {
        ...device,
        alive: ping.alive,
        lastSeen: ping.alive ? new Date() : device.lastSeen,
        consecutiveFailures: ping.alive
          ? 0
          : device.consecutiveFailures + 1,
      }
    })
  )
  return results
}
```

### 9.4 最佳實踐

| 項目 | 建議值 | 說明 |
|------|--------|------|
| 連線 timeout | 3000ms | 區域網路通常 < 10ms，3 秒足夠 |
| 檢查間隔 | 15-30 秒 | 平衡即時性和網路負擔 |
| 失敗閾值 | 3 次 | 連續 3 次失敗才判定離線 |
| 並行檢查 | Promise.all | 同時 ping 多台裝置 |
| Socket 清理 | 必須 destroy | 避免 socket 洩漏 |

### 9.5 npm 套件替代方案

| 套件 | 週下載量 | 特點 |
|------|---------|------|
| `tcp-ping` | ~5K | 簡單 API，支援 latency 統計 |
| `tcp-ping-port` | ~1K | 支援 DNS timeout 設定 |
| `net-ping` | ~10K | 支援 ICMP ping（需 raw socket） |
| 自行實作 | N/A | **推薦**：程式碼量少、無額外依賴 |

---

## 10. 建議方案

### 10.1 技術選型

```
裝置發現：bonjour-service（TypeScript、pure JS、無原生依賴）
底層協定：multicast-dns（bonjour-service 自動使用）
存活確認：自行實作 TCP ping（net.Socket）
目標服務：_companion-link._tcp（發現）+ port 62078 TCP ping（確認同步可用）
```

### 10.2 發現流程設計

```
┌─────────────────────────┐
│ 1. mDNS Browse           │
│    _companion-link._tcp  │
│    → 取得所有 Apple 裝置  │
└──────────┬──────────────┘
           │
┌──────────▼──────────────┐
│ 2. 過濾 iOS 裝置         │
│    檢查 TXT record       │
│    model=iPhone*         │
└──────────┬──────────────┘
           │
┌──────────▼──────────────┐
│ 3. TCP Ping 62078        │
│    確認 Wi-Fi 同步已啟用  │
└──────────┬──────────────┘
           │
┌──────────▼──────────────┐
│ 4. 週期性 Health Check   │
│    每 15-30 秒確認存活    │
└─────────────────────────┘
```

### 10.3 跨平台注意事項

| 平台 | 注意事項 |
|------|---------|
| macOS 15+ | 需設定 NSLocalNetworkUsageDescription + entitlements |
| Windows | 防火牆需允許 UDP 5353；避免與 Bonjour SDK 衝突 |
| VPN 環境 | 需偵測並排除 VPN 介面 |
| 多網卡 | 使用 `os.networkInterfaces()` 選擇正確介面 |

---

## 來源

### RFC 標準文件

- [RFC 6762 - Multicast DNS](https://datatracker.ietf.org/doc/html/rfc6762)
- [RFC 6763 - DNS-Based Service Discovery](https://www.rfc-editor.org/rfc/rfc6763.html)

### npm 套件

- [bonjour-service - npm](https://www.npmjs.com/package/bonjour-service)
- [bonjour-service - GitHub](https://github.com/onlxltd/bonjour-service)
- [multicast-dns - npm](https://www.npmjs.com/package/multicast-dns)
- [multicast-dns - GitHub](https://github.com/mafintosh/multicast-dns)
- [mdns (node_mdns) - GitHub](https://github.com/agnat/node_mdns)
- [mdns-js - GitHub](https://github.com/mdns-js/node-mdns-js)
- [node-dns-sd - GitHub](https://github.com/futomi/node-dns-sd)
- [tcp-ping - npm](https://www.npmjs.com/package/tcp-ping)
- [bonjour-service Security Analysis - Socket](https://socket.dev/npm/package/bonjour-service)
- [npm trends: bonjour vs mdns vs multicast-dns vs node-dns-sd](https://npmtrends.com/bonjour-vs-mdns-vs-multicast-dns-vs-node-dns-sd)

### Apple 技術文件

- [Apple Bonjour Developer Page](https://developer.apple.com/bonjour/)
- [Bonjour Operations - Apple Archive](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/NetServices/Articles/NetServicesArchitecture.html)
- [TN3179: Understanding Local Network Privacy](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)
- [NSLocalNetworkUsageDescription - Apple Developer Documentation](https://developer.apple.com/documentation/bundleresources/information-property-list/nslocalnetworkusagedescription)
- [WWDC20: Support Local Network Privacy in Your App](https://developer.apple.com/videos/play/wwdc2020/10110/)
- [Electron Mac App Store Submission Guide](https://www.electronjs.org/docs/latest/tutorial/mac-app-store-submission-guide)

### iOS 裝置發現與 Port 62078

- [mDNS/Bonjour Bible - Common Service Strings](https://jonathanmumm.com/tech-it/mdns-bonjour-bible-common-service-strings-for-various-vendors/)
- [Looking up Apple Devices in a Local Network - MacPaw](https://macpaw.com/news/apple-local-network)
- [Port 62078 - Apple iTunes Sync / usbmuxd - PentestPad](https://www.pentestpad.com/port-exploit/port-62078-apple-itunes-sync-usbmuxd)
- [Usbmux - The Apple Wiki](https://theapplewiki.com/wiki/Usbmux)
- [Understanding usbmux and the iOS lockdown service](https://jon-gabilondo-angulo-7635.medium.com/understanding-usbmux-and-the-ios-lockdown-service-7f2a1dfd07ae)

### 本地網路權限

- [Request and Check Local Network Permission - Nonstrict](https://nonstrict.eu/blog/2024/request-and-check-for-local-network-permission/)
- [macOS Sequoia Local Network Permission - Apple Developer Forums](https://developer.apple.com/forums/thread/763753)
- [electron-builder macOS UUID Collision Issue #9158](https://github.com/electron-userland/electron-builder/issues/9158)

### Windows mDNS

- [Windows 10 mDNS Support - Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/266761/does-windows-10-support-mdns)
- [mDNS on Windows 11 - Start9 Community](https://community.start9.com/t/solved-mdns-on-windows-11-partially-works/1859)
- [Standard mDNS Service on Windows - w3tutorials](https://www.w3tutorials.net/blog/standard-mdns-service-on-windows/)
- [Bonjour (software) - Wikipedia](https://en.wikipedia.org/wiki/Bonjour_(software))
- [Multicast DNS - Wikipedia](https://en.wikipedia.org/wiki/Multicast_DNS)

### mDNS 疑難排解

- [mDNS across VLANs - XDA](https://www.xda-developers.com/make-mdns-work-across-vlans/)
- [mDNS over VPN - TP-Link Community](https://community.tp-link.com/en/business/forum/topic/658648)
- [MDNS not sending queries - Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/101168/mdns-not-sending-queries-to-the-network)
- [Multicast DNS on Home Networks](https://stevessmarthomeguide.com/multicast-dns/)
