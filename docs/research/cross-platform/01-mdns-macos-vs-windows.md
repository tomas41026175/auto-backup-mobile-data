# mDNS 跨平台行為差異：macOS vs Windows

> 研究日期：2026-03-10
> 適用套件：`bonjour-service`、`multicast-dns`
> 情境：Electron App 偵測 iPhone（`_companion-link._tcp`）

---

## 目錄

1. [套件架構總覽](#1-套件架構總覽)
2. [bonjour-service 在 macOS 上的行為](#2-bonjour-service-在-macos-上的行為)
3. [_companion-link._tcp 偵測 iPhone 的行為差異](#3-_companion-link_tcp-偵測-iphone-的行為差異)
4. [multicast-dns 作為替代方案](#4-multicast-dns-作為替代方案)
5. [跨平台統一 mDNS 實作策略](#5-跨平台統一-mdns-實作策略)
6. [macOS mDNS 權限問題](#6-macos-mdns-權限問題)
7. [Electron App macOS 設定完整範例](#7-electron-app-macos-設定完整範例)
8. [建議與結論](#8-建議與結論)
9. [來源](#9-來源)

---

## 1. 套件架構總覽

### 套件層級關係

```
bonjour-service (TypeScript 重寫版, ~8-12M 週下載)
  └─ multicast-dns (pure JavaScript, ~16M 週下載)
       └─ Node.js dgram (UDP socket API)
            └─ OS UDP layer → 224.0.0.251:5353

bonjour (原始 JavaScript 版, ~3M 週下載)
  └─ multicast-dns
       └─ ...（同上）

mdns (native binding 版, ~2K 週下載，已式微)
  └─ dns_sd.h API（需要系統 Bonjour/Avahi）
```

### 關鍵差異：Pure JS vs Native Binding

| 特性 | `bonjour-service` / `multicast-dns` | `mdns`（舊版） |
|------|--------------------------------------|----------------|
| 依賴方式 | Pure JavaScript，直接操作 UDP socket | Native addon，依賴 `dns_sd.h` |
| macOS 系統 daemon | **不依賴** mDNSResponder | **依賴** mDNSResponder |
| Windows 需求 | 無需安裝 Bonjour for Windows | 需要 Apple Bonjour SDK for Win |
| 安裝複雜度 | `npm install` 即可 | 需要系統層依賴 |
| 跨平台一致性 | 高（相同程式碼路徑） | 低（平台行為不同） |

---

## 2. bonjour-service 在 macOS 上的行為

### 是否依賴 mDNSResponder？

**答案：不依賴。**

`bonjour-service` 透過 `multicast-dns` 直接建立 UDP socket，自行發送/接收 mDNS multicast 封包，**完全繞過** macOS 的 mDNSResponder daemon。

```
應用程式 (Node.js/Electron)
  │
  ▼
multicast-dns → dgram.createSocket('udp4', { reuseAddr: true })
  │
  ▼
UDP Multicast 224.0.0.251:5353
  │
  ├─ mDNSResponder（系統 daemon，同樣監聽 5353）
  └─ 其他裝置的 mDNS 回應
```

### 端口 5353 共存問題

macOS 上 `mDNSResponder` 已在 port 5353 監聽。`multicast-dns` 使用 `SO_REUSEADDR`（Node.js 的 `reuseAddr: true`）與系統 daemon 共享該端口：

```javascript
// multicast-dns 內部做法（簡化）
const socket = dgram.createSocket({
  type: 'udp4',
  reuseAddr: true  // 對應 SO_REUSEADDR，允許多個 socket 綁定同一 port
})
socket.bind(5353)
socket.addMembership('224.0.0.251')
```

RFC 6762 Section 15 規定：所有 mDNS 實作**應當**（SHOULD）使用 `SO_REUSEPORT` 和/或 `SO_REUSEADDR`，正是為了允許多個 responder 共存。

### macOS 實際運作狀況

- mDNSResponder 和 `multicast-dns` 都能收到相同的 multicast 封包
- 兩者並行運作，**不會互相干擾**
- macOS Sequoia（15.x）曾出現 mDNSResponder 故障導致 `.local` 解析失敗的 bug（已有 workaround）

---

## 3. `_companion-link._tcp` 偵測 iPhone 的行為差異

### 服務說明

`_companion-link._tcp.local` 是 Apple 的私有協定，屬於 Continuity 功能的一部分：

- **iOS 13+**：取代 MRP (Media Remote Protocol)，用於 Action Center 遙控 widget
- **包含 Continuity / Handoff**（推測）
- 所有 Apple 裝置（iPhone、iPad、Mac）均會廣播此服務
- 端口：動態分配（通常為 49153、49154 等高端口）

### TXT Record 欄位

| 欄位 | 範例值 | 用途 |
|------|--------|------|
| `rpVr` | `195.2` | 協定版本 |
| `rpMd` | `iPhone14,5` | 裝置型號 |
| `rpFl` | `0x36782` | 功能 flags |
| `rpHA` | `45efecc5211` | HomeKit AuthTag |
| `rpHN` | `86d44e4f11ff` | Discovery Nonce（輪換） |
| `rpAD` | `cc5011ae31ee` | Bonjour Auth Tag（輪換） |
| `rpBA` | `E1:B2:E3:BB:11:FF` | 藍牙 MAC（輪換，隱私保護） |

大多數欄位（rpHA、rpHN、rpAD、rpBA）採**旋轉加密方案**定期更換，無法直接用於持久裝置識別。

### macOS vs Windows 偵測行為比較

| 面向 | macOS | Windows |
|------|-------|---------|
| 系統 mDNS 支援 | 原生（mDNSResponder） | Windows 10 1903+ 原生支援 |
| iPhone 廣播 `_companion-link._tcp` | 是 | 是（同一 LAN 即可） |
| Node.js 能否接收 | 是，透過 `multicast-dns` | 是，透過 `multicast-dns` |
| Windows Firewall 影響 | 無 | **可能阻擋 UDP 5353 入站** |
| Bonjour for Windows 安裝需求 | 無需（pure JS） | 無需（pure JS） |
| 接收到的 TXT record 內容 | 相同 | 相同 |

### Windows Firewall 注意事項

Windows Defender Firewall 預設會阻擋未授權應用程式的 UDP 入站封包。若使用 Electron 在 Windows 上監聽 mDNS 回應，需確認：

1. Electron app 有 Windows Firewall 例外規則，或
2. 使用者在首次執行時手動允許

```javascript
// Node.js / Electron 偵測 _companion-link._tcp 範例
import Bonjour from 'bonjour-service'

const bonjour = new Bonjour()
const browser = bonjour.find({ type: 'companion-link' })

browser.on('up', (service) => {
  console.log('發現 Apple 裝置:', {
    name: service.name,
    host: service.host,
    port: service.port,
    addresses: service.addresses,
    txt: service.txt,  // rpMd 欄位可判斷裝置型號
  })
})

browser.on('down', (service) => {
  console.log('裝置離線:', service.name)
})
```

---

## 4. `multicast-dns` 作為替代方案

### 套件特性比較

| 特性 | `bonjour-service` | `multicast-dns` |
|------|-------------------|-----------------|
| 層級 | 高階 API（DNS-SD 服務瀏覽） | 低階 API（原始 mDNS 封包） |
| TypeScript | 原生支援 | 需 `@types/multicast-dns` |
| 週下載量 | ~8-12M | ~16M |
| 最後更新 | 較近期 | 4 年前（但穩定） |
| 依賴關係 | 依賴 `multicast-dns` | 無上游 mDNS 依賴 |
| macOS 行為 | 相同（底層相同） | 相同 |
| Windows 行為 | 相同（底層相同） | 相同 |

### 各平台實際表現

**macOS：**
- 兩者均可正常運作
- 與系統 mDNSResponder 透過 `reuseAddr` 共存
- 無需 root 權限（一般 UDP multicast 操作）

**Windows：**
- 兩者均可正常運作（不需要 Apple Bonjour for Windows）
- Windows 10 1903+ 內建 mDNS 支援，但 Node.js 的 pure JS 實作直接操作 UDP，不依賴系統 mDNS
- 注意 Firewall 規則

**Linux（Electron 未來可能支援）：**
- 注意避免與 Avahi daemon 衝突
- 可使用 `excludeInterface('0.0.0.0')` 處理衝突

### 何時選擇 `multicast-dns` 直接使用？

若需要：
- 自訂 mDNS 封包解析
- 監聽所有 mDNS 流量（packet sniffing）
- 更細緻控制 query/response 行為

```javascript
import mdns from 'multicast-dns'

const mdnsInstance = mdns()

mdnsInstance.on('response', (response) => {
  response.answers.forEach((answer) => {
    if (answer.type === 'PTR' && answer.name === '_companion-link._tcp.local') {
      console.log('找到 companion-link 服務:', answer.data)
    }
  })
})

// 查詢 _companion-link._tcp.local
mdnsInstance.query({
  questions: [{
    name: '_companion-link._tcp.local',
    type: 'PTR'
  }]
})
```

---

## 5. 跨平台統一 mDNS 實作策略

### 建議：共用同一套 code（無需 platform branch）

由於 `bonjour-service` 底層使用 pure JavaScript `multicast-dns`，在 macOS 和 Windows 上的程式碼路徑完全相同，**不需要** platform-specific 分支。

```
❌ 不建議：
src/
  mdns-macos.ts  ← 使用 dns_sd.h 原生 API
  mdns-windows.ts ← 使用 Bonjour SDK
  mdns-factory.ts ← platform 判斷

✅ 建議：
src/
  mdns-browser.ts  ← 統一使用 bonjour-service，所有平台共用
```

### 統一實作範例

```typescript
// src/services/mdns-browser.ts
import Bonjour, { Browser, Service } from 'bonjour-service'

interface DeviceInfo {
  name: string
  host: string
  port: number
  addresses: string[]
  model?: string  // 從 txt.rpMd 解析
}

export class MdnsBrowser {
  private bonjour: InstanceType<typeof Bonjour>
  private browser: Browser | null = null

  constructor() {
    // 選項透傳至 multicast-dns
    // 若有需要，可在此指定 interface 或 ip
    this.bonjour = new Bonjour()
  }

  start(onDeviceFound: (device: DeviceInfo) => void): void {
    this.browser = this.bonjour.find({ type: 'companion-link' })

    this.browser.on('up', (service: Service) => {
      const device: DeviceInfo = {
        name: service.name,
        host: service.host ?? '',
        port: service.port,
        addresses: service.addresses ?? [],
        model: service.txt?.['rpMd'] as string | undefined,
      }
      onDeviceFound(device)
    })
  }

  stop(): void {
    this.browser?.stop()
    this.bonjour.destroy()
  }
}
```

### Platform-Specific 部分（僅限 macOS 權限層）

唯一需要 platform-specific 處理的是**應用程式打包層**（Info.plist / entitlements），而非 JavaScript 程式碼本身。

---

## 6. macOS mDNS 權限問題

### 6.1 NSLocalNetworkUsageDescription（macOS 15+ 強制要求）

**macOS Sequoia（15.x）開始**，所有使用以下功能的 App 均需在 `Info.plist` 宣告：
- Bonjour / mDNS 服務瀏覽
- Unicast / Multicast 連線
- 允許使用者輸入 IP 位址

若缺少此 key，使用者不會看到權限請求提示，App 可能無法存取本地網路。

### 6.2 NSBonjourServices（iOS 14+ / macOS 12+ 要求）

若 App 瀏覽特定 Bonjour 服務類型，必須在 `Info.plist` 宣告使用的服務清單。

### 6.3 com.apple.developer.networking.multicast（受限 entitlement）

若 App **直接操作 UDP multicast 封包**（如 `NWConnectionGroup`）而非透過 Bonjour API，則需要此受限 entitlement，並需向 Apple 申請：

> https://developer.apple.com/contact/request/networking-multicast

**重要**：使用 `bonjour-service` / `multicast-dns` 的 Node.js / Electron App 是否需要此 entitlement 取決於情境：

| 情境 | 是否需要 `com.apple.developer.networking.multicast` |
|------|-----------------------------------------------------|
| 透過 Bonjour API（macOS native）瀏覽服務 | 不需要 |
| pure JS（multicast-dns）直接操作 UDP multicast | **可能需要**（sandbox 環境） |
| Electron App（非 App Store，非 sandbox） | 通常不需要，但需要 `NSLocalNetworkUsageDescription` |
| Electron App（Mac App Store，sandbox 環境） | **可能需要** `com.apple.developer.networking.multicast` |

### 6.4 macOS Sequoia mDNSResponder Bug（2024 年底回報）

2024 年 12 月有使用者回報升級 macOS Sequoia 後，`.local` hostname 解析失敗。這是 mDNSResponder 本身的 bug，與 Node.js 使用無關，臨時 workaround：

```bash
# 手動重新註冊 hostname
dns-sd -R $(hostname).local _device-info._tcp local 0

# 驗證
dns-sd -q $(hostname).local
```

---

## 7. Electron App macOS 設定完整範例

### 7.1 Info.plist 設定（`electron-builder` extendInfo）

在 `electron-builder.yml`（或 `package.json` 的 build 區段）加入：

```yaml
# electron-builder.yml
mac:
  extendInfo:
    NSLocalNetworkUsageDescription: "此應用程式需要存取本地網路以偵測同一 Wi-Fi 上的 iPhone 裝置。"
    NSBonjourServices:
      - "_companion-link._tcp"
      - "_apple-mobdev2._tcp"
```

或直接在 `Info.plist` 中設定：

```xml
<!-- Info.plist -->
<key>NSLocalNetworkUsageDescription</key>
<string>此應用程式需要存取本地網路以偵測同一 Wi-Fi 上的 iPhone 裝置。</string>

<key>NSBonjourServices</key>
<array>
    <string>_companion-link._tcp</string>
    <string>_apple-mobdev2._tcp</string>
</array>
```

### 7.2 entitlements.mac.plist（非 App Store 版本）

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- 基本 sandbox（非 MAS 可選擇不啟用） -->
    <!-- <key>com.apple.security.app-sandbox</key><true/> -->

    <!-- 網路存取 -->
    <key>com.apple.security.network.client</key>
    <true/>
    <key>com.apple.security.network.server</key>
    <true/>

    <!-- JIT（Electron 必要） -->
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
</dict>
</plist>
```

### 7.3 entitlements.mac.plist（Mac App Store 版本，需要 sandbox）

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.app-sandbox</key>
    <true/>

    <key>com.apple.security.network.client</key>
    <true/>
    <key>com.apple.security.network.server</key>
    <true/>

    <!-- MAS 環境中 pure JS mDNS 可能需要此 entitlement -->
    <!-- 需向 Apple 申請：https://developer.apple.com/contact/request/networking-multicast -->
    <!-- <key>com.apple.developer.networking.multicast</key><true/> -->
</dict>
</plist>
```

### 7.4 electron-builder 完整設定範例

```yaml
# electron-builder.yml
appId: com.example.autobackup
productName: Auto Backup

mac:
  category: public.app-category.utilities
  entitlementsFile: build/entitlements.mac.plist
  entitlementsLoginHelperFile: build/entitlements.mac.plist
  hardenedRuntime: true
  gatekeeperAssess: false
  extendInfo:
    NSLocalNetworkUsageDescription: "需要存取本地網路以偵測 iPhone 裝置。"
    NSBonjourServices:
      - "_companion-link._tcp"
      - "_apple-mobdev2._tcp"

win:
  target:
    - target: nsis
      arch: [x64]
  # Windows 無需額外 mDNS 相關設定
```

### 7.5 已知的 electron-builder Mach-O UUID 問題

**問題**：macOS Sequoia 使用 Mach-O image UUID 驗證本地網路授權。electron-builder 建置的不同版本 App 可能產生相同 UUID，導致授權狀態衝突。

**狀態**：electron-builder issue #9158 已被標記為 "not planned"（2024）。

**臨時解法**：可考慮在建置時透過後處理工具（如 `install_name_tool`）強制重新生成 UUID，或等待 Electron 官方修復。

---

## 8. 建議與結論

### 技術選型建議

1. **使用 `bonjour-service`**（而非舊版 `mdns` 或 `bonjour`）
   - TypeScript 原生支援
   - 活躍維護，週下載量高
   - 底層 `multicast-dns` 成熟穩定

2. **共用同一套 JavaScript/TypeScript 程式碼**（macOS + Windows）
   - `bonjour-service` 底層為 pure JS，不需要 platform branch
   - Platform-specific 差異僅在打包層（Info.plist、entitlements）

3. **偵測 `_companion-link._tcp` 的注意事項**
   - iPhone 的 TXT record 大多數欄位定期輪換（隱私保護）
   - `rpMd` 欄位（裝置型號）相對穩定，可用於判斷裝置類型
   - 不應依賴 MAC 位址（`rpBA`）做持久識別

4. **macOS 打包必做事項（macOS 15+）**
   - `NSLocalNetworkUsageDescription`：**必填**
   - `NSBonjourServices`：宣告使用的服務類型
   - 若目標為 Mac App Store（sandbox）：評估是否需申請 `com.apple.developer.networking.multicast`

5. **Windows 注意事項**
   - 確認 Electron App 有 Windows Firewall 入站規則（UDP 5353）
   - 不需要安裝 Apple Bonjour for Windows

### 決策樹

```
需要 mDNS 偵測 iPhone？
│
├─ 是否目標 Mac App Store？
│   ├─ 是 → sandbox + 考慮申請 multicast entitlement
│   └─ 否 → 只需 NSLocalNetworkUsageDescription
│
└─ JavaScript 程式碼
    └─ 統一使用 bonjour-service（macOS + Windows 相同程式碼）
```

---

## 9. 來源

- [GitHub - onlxltd/bonjour-service](https://github.com/onlxltd/bonjour-service) — TypeScript Bonjour 實作
- [GitHub - mafintosh/multicast-dns](https://github.com/mafintosh/multicast-dns) — 底層 pure JS mDNS 實作
- [GitHub - watson/bonjour](https://github.com/watson/bonjour) — 原始 JavaScript Bonjour
- [GitHub - mdns-js/node-mdns-js](https://github.com/mdns-js/node-mdns-js) — 另一個 pure JS mDNS 實作
- [npm trends: bonjour vs mdns vs multicast-dns](https://npmtrends.com/bonjour-vs-mdns-vs-multicast-dns-vs-node-dns-sd) — 下載量比較
- [Apple Developer: How to use multicast networking in your app](https://developer.apple.com/news/?id=0oi77447) — multicast entitlement 與 NSLocalNetworkUsageDescription
- [Apple Developer Documentation: com.apple.developer.networking.multicast](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.networking.multicast) — 受限 entitlement 說明
- [Apple Community: _companion-link._tcp.local service type](https://discussions.apple.com/thread/254083127) — companion-link 服務說明
- [pyatv: Companion Protocol Documentation](https://pyatv.dev/documentation/protocols/) — companion-link TXT record 欄位說明
- [Sequoia new security entitlements - Xojo Forum](https://forum.xojo.com/t/sequoia-new-security-entitlement-s/81329) — macOS 15 NSLocalNetworkUsageDescription 需求
- [electron-builder Issue #9158: macOS local network privacy UUID collision](https://github.com/electron-userland/electron-builder/issues/9158) — Electron UUID 衝突問題
- [Fix Sequoia mDNS - Justus Perlwitz](https://www.justus.pw/posts/2024-12-21-fix-sequoia-mdns.html) — macOS Sequoia mDNSResponder bug workaround
- [RFC 6762: Multicast DNS](https://www.rfc-editor.org/rfc/rfc6762.html) — mDNS 標準規範
- [Bonjour (software) - Wikipedia](https://en.wikipedia.org/wiki/Bonjour_(software)) — Bonjour 概覽
