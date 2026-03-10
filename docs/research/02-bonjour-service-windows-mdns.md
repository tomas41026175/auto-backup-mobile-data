# bonjour-service 在 Windows 上偵測 iPhone 的行為研究

> 研究日期：2026-03-10
> 適用版本：bonjour-service v1.3.0、Node.js 18+、Electron 28+

---

## 目錄

1. [bonjour-service API 與 TypeScript 型別](#1-bonjour-service-api-與-typescript-型別)
2. [mDNS Service Type：_companion-link._tcp vs _airplay._tcp](#2-mdns-service-type_companion-link_tcp-vs-_airplay_tcp)
3. [iPhone 螢幕鎖定後的 mDNS 廣播行為](#3-iphone-螢幕鎖定後的-mdns-廣播行為)
4. [主動 Query vs 被動監聽實作方式](#4-主動-query-vs-被動監聽實作方式)
5. [Windows 防火牆對 mDNS 的影響與解決方案](#5-windows-防火牆對-mdns-的影響與解決方案)
6. [Electron Main Process 使用注意事項](#6-electron-main-process-使用注意事項)
7. [替代方案比較](#7-替代方案比較)
8. [mDNS 自我檢測實作](#8-mdns-自我檢測實作)
9. [綜合建議](#9-綜合建議)
10. [參考來源](#10-參考來源)

---

## 1. bonjour-service API 與 TypeScript 型別

### 套件資訊

- **npm 名稱**：`bonjour-service`
- **最新版本**：1.3.0（截至研究日期）
- **語言**：TypeScript 原生實作（原 `bonjour` 套件的 TypeScript 重寫版）
- **GitHub**：https://github.com/onlxltd/bonjour-service
- **依賴**：底層使用 `multicast-dns`（純 JavaScript，無 native binding）

```bash
npm install bonjour-service
```

### 初始化

```typescript
import { Bonjour } from 'bonjour-service'

const bonjour = new Bonjour(
  options?,         // 傳遞給底層 multicast-dns 的設定
  errorCallback?    // (err: Error) => void，建議提供以優雅處理錯誤
)
```

### 型別定義（核心介面）

```typescript
// 發布服務選項
interface BonjourServiceOptions {
  name: string           // 服務名稱（必填）
  type: string           // 服務類型，例如 'http'（必填，不含底線和 _tcp）
  port: number           // 埠號（必填）
  host?: string          // 主機名稱，預設為本機 hostname
  protocol?: 'tcp' | 'udp'  // 預設 'tcp'
  subtypes?: string[]    // 子類型
  txt?: Record<string, string | boolean | number | Buffer>  // TXT 記錄
  disableIPv6?: boolean  // 停用 IPv6
}

// 瀏覽（搜尋）選項
interface BonjourBrowserOptions {
  type: string           // 服務類型（必填）
  protocol?: 'tcp' | 'udp'
  subtypes?: string[]
  txt?: { binary?: boolean }  // binary: true 保留二進位 TXT 記錄
}

// 已發現服務的結構
interface RemoteService {
  name: string
  type: string
  protocol: string
  host: string
  port: number
  fqdn: string           // 完整網域名稱
  txt: Record<string, string>
  addresses: string[]    // IP 位址列表（含 IPv4 / IPv6）
  subtypes: string[]
  referer: { address: string; family: string; port: number; size: number }
}
```

### publish() — 發布服務

```typescript
const service = bonjour.publish({
  name: 'My Backup Service',
  type: 'http',
  port: 8080,
  txt: { version: '1.0', platform: 'windows' }
})

// 事件
service.on('up', () => console.log('Service published'))
service.on('error', (err) => console.error('Publish error:', err))

// 手動控制
service.start()        // 開始發布
service.stop()         // 停止發布（發送 Goodbye 封包）
console.log(service.published)  // boolean
```

### find() — 持續監聽服務

```typescript
const browser = bonjour.find(
  { type: 'http' },
  (service: RemoteService) => {
    // 每發現一個新服務就呼叫（等同監聽 'up' 事件）
    console.log('Found:', service.name, service.addresses)
  }
)

// Browser 事件
browser.on('up', (service) => console.log('Service up:', service))
browser.on('down', (service) => console.log('Service down:', service))
browser.on('txt-update', (service) => console.log('TXT updated:', service))

// Browser 方法
browser.start()        // 開始監聽（find() 會自動呼叫）
browser.stop()         // 停止監聽
browser.update()       // 主動重送 PTR 查詢（觸發主動掃描）
browser.services()     // 回傳 RemoteService[] 目前在線服務列表
browser.expire()       // 檢查 TTL 並觸發 down 事件
```

### findOne() — 尋找第一個符合的服務

```typescript
bonjour.findOne({ type: 'http' }, (service) => {
  console.log('First found:', service)
  // Browser 在找到後會自動停止
})
```

### 清理資源

```typescript
bonjour.unpublishAll(callback?)  // 停止所有已發布的服務
bonjour.destroy()                // 關閉 UDP socket，釋放所有資源
```

---

## 2. mDNS Service Type：_companion-link._tcp vs _airplay._tcp

### _airplay._tcp

| 屬性 | 說明 |
|------|------|
| **目的** | AirPlay 媒體串流（影片、音訊、照片、螢幕鏡像） |
| **埠號** | 7000（TCP） |
| **廣播裝置** | Apple TV、HomePod、AirPlay 相容裝置，以及 iPhone/iPad 在 AirPlay 接收模式時 |
| **iOS 行為** | iPhone 預設**不廣播**此服務（iPhone 是 AirPlay 發送端，而非接收端） |
| **常見 TXT 記錄** | `deviceid`、`features`、`model`、`srcvers`、`flags`、`pk` |

**關鍵 TXT 欄位說明：**
```
features  = 64-bit bitfield 表示支援的功能
flags     = 20-bit 狀態旗標（idle、receiving audio/video 等）
deviceid  = 裝置 MAC 地址
pk        = 配對公鑰
```

### _companion-link._tcp

| 屬性 | 說明 |
|------|------|
| **目的** | Apple 裝置間的 Continuity / Handoff 功能（iOS 13+）；Apple TV Widget、Shortcuts 啟動 App |
| **埠號** | 未公開文件化（Apple 私有協定） |
| **廣播裝置** | iPhone、iPad、Mac、Apple TV |
| **iOS 行為** | iPhone 通常廣播此服務，是 Continuity 的核心機制之一 |
| **公開文件** | **無**（Apple 未公開規格，屬於反向工程發現） |

### 偵測 iPhone 建議使用的 Service Type

針對「偵測 iPhone 是否在同一區域網路」的場景，以下 service type 實際測試較為可靠：

| Service Type | 廣播裝置 | 鎖屏可靠性 | 備註 |
|---|---|---|---|
| `_companion-link._tcp` | iPhone / iPad / Mac / Apple TV | **中等**（依 Continuity 狀態） | iOS 13+ 支援，最常見 |
| `_airplay._tcp` | Apple TV、HomePod（iPhone 預設不發送） | - | iPhone 不發送此服務 |
| `_apple-mobdev2._tcp` | 啟用 Wi-Fi Sync 的 iPhone/iPad | **低**（需 iTunes 配對） | iTunes Wi-Fi Sync 服務 |
| `_raop._tcp` | AirPlay 音訊接收端 | - | iPhone 不發送此服務 |

**實務建議：同時監聽多個 service type，以提高偵測成功率。**

---

## 3. iPhone 螢幕鎖定後的 mDNS 廣播行為

### 已知行為（社群驗證）

#### mDNS 廣播在鎖屏後的變化

根據 Apple 開發者論壇和社群實測報告，iPhone 在以下情況下 mDNS 行為會受影響：

1. **螢幕鎖定 + Wi-Fi 保持連線**
   - mDNS 廣播**通常仍繼續**（mDNS responder 由 iOS 系統層管理，不依賴 App 前景執行）
   - `_companion-link._tcp` 等系統層服務**仍會廣播**
   - 但廣播頻率可能降低（省電模式）

2. **App 進入背景後的 mDNS 行為**
   - **App 層的 Bonjour**（使用 `NSNetServiceBrowser`）：App 進入背景後可能停止接收
   - **系統層的 mDNS 服務**（如 `_companion-link._tcp`）：由 `mDNSResponder` 守護程序管理，不受 App 生命週期影響

3. **iPhone 4 等舊款裝置**
   - 鎖屏後數秒 Wi-Fi 即斷線
   - 較新 iPhone（5s+）通常在鎖屏後保持 Wi-Fi 連線超過 2 小時

#### iOS 14.5+ 的 mDNS 限制（App 開發者注意）

Apple 在 iOS 14.5 起強化了多播限制：
- App 使用 Bonjour 必須在 `Info.plist` 宣告 `NSBonjourServices`
- 需要申請 `com.apple.developer.networking.multicast` 授權（適用 UDP broadcast）
- iOS 15 曾短暫放寬，iOS 16 再次收緊

**此限制影響的是 iPhone 上的 App，不影響 Windows 端監聽 iPhone 廣播的能力。**

#### Bonjour Sleep Proxy（睡眠代理）

Apple 設備支援 Sleep Proxy 機制：當裝置進入低功耗模式時，由網路上的代理裝置（通常是 Apple TV 或 HomePod）代為廣播 mDNS 服務。然而此機制主要針對 macOS，iPhone 的支援狀況不明確。

### 實測發現（來自 COVID-19 App iOS Beta Issue）

一個具代表性的實測場景（雖然針對 Bluetooth，但原理類似）：

- **雙方螢幕亮起（App 在背景）**：發現成功，幾乎立即響應
- **掃描裝置螢幕鎖定**：發現失敗
- **解鎖任一裝置的螢幕**：發現立即成功

這說明 iOS 的低功耗模式會降低網路廣播頻率。

### 針對 Windows 端（接收方）的影響

Windows 端的 `bonjour-service` 是**被動監聽**角色：
- 當 iPhone 廣播時，Windows 端會接收到
- iPhone 鎖屏後若停止廣播，Windows 端的 `browser.on('down')` 事件可能在 TTL 到期後才觸發
- 建議使用 `browser.update()` 定期主動送出 PTR 查詢，刺激 iPhone 回應

---

## 4. 主動 Query vs 被動監聽實作方式

### 兩種模式說明

| 模式 | 機制 | 適用場景 |
|------|------|----------|
| **被動監聽（Passive Browse）** | 訂閱 mDNS multicast group，等待其他裝置主動廣播 | 初始發現、即時感知上下線 |
| **主動 Query（Active Query）** | 主動發送 PTR 查詢到 `224.0.0.251:5353`，要求裝置回應 | 觸發更新、確認裝置仍在線、初始快速掃描 |

### 使用 bonjour-service 實作

```typescript
import { Bonjour } from 'bonjour-service'

const bonjour = new Bonjour(undefined, (err) => {
  console.error('mDNS error:', err)
})

// 被動監聽：持續接收廣播
const browser = bonjour.find({ type: 'companion-link' })

browser.on('up', (service) => {
  console.log('[UP] iPhone found:', {
    name: service.name,
    host: service.host,
    addresses: service.addresses,
    port: service.port,
  })
})

browser.on('down', (service) => {
  console.log('[DOWN] iPhone left:', service.name)
})

// 主動 Query：定期發送 PTR 查詢刺激回應
// browser.update() 會重送 PTR 查詢，已在線裝置會回應
const QUERY_INTERVAL_MS = 30_000

const queryTimer = setInterval(() => {
  browser.update()
  console.log('[QUERY] Sent active PTR query for _companion-link._tcp')
}, QUERY_INTERVAL_MS)

// 清理
process.on('SIGINT', () => {
  clearInterval(queryTimer)
  browser.stop()
  bonjour.destroy()
})
```

### 使用 multicast-dns 實作底層主動 Query

```typescript
import multicastDns from 'multicast-dns'

const mdns = multicastDns()

// 被動監聽所有 mDNS 回應
mdns.on('response', (packet, rinfo) => {
  const { answers, additionals } = packet
  const ptrRecords = answers.filter(r => r.type === 'PTR')
  const srvRecords = additionals.filter(r => r.type === 'SRV')
  const aRecords = additionals.filter(r => r.type === 'A')

  ptrRecords.forEach(ptr => {
    console.log('Service discovered:', ptr.data)
  })
})

// 主動 Query：發送 PTR 查詢
function queryService(serviceType: string): void {
  mdns.query({
    questions: [{
      name: `${serviceType}.local`,
      type: 'PTR'
    }]
  })
}

// 立即查詢 + 定期重查
queryService('_companion-link._tcp')
queryService('_airplay._tcp')
setInterval(() => {
  queryService('_companion-link._tcp')
}, 30_000)

// 監聽 Query 事件（其他裝置在詢問什麼）
mdns.on('query', (packet, rinfo) => {
  // 可用於實作 mDNS Responder
  console.log('Incoming query from:', rinfo.address)
})

// 清理
mdns.destroy()
```

### 混合策略（建議）

```typescript
import { Bonjour } from 'bonjour-service'

class IphoneDetector {
  private bonjour: Bonjour
  private browsers: ReturnType<Bonjour['find']>[] = []
  private queryTimer?: NodeJS.Timeout
  private devices = new Map<string, RemoteService>()

  private readonly SERVICE_TYPES = [
    'companion-link',    // _companion-link._tcp
    // 可視需要增加其他 service type
  ]

  constructor() {
    this.bonjour = new Bonjour(undefined, (err) => {
      console.error('[Bonjour] Error:', err)
    })
  }

  start(): void {
    for (const type of this.SERVICE_TYPES) {
      const browser = this.bonjour.find({ type })

      browser.on('up', (service) => this.onDeviceUp(service))
      browser.on('down', (service) => this.onDeviceDown(service))

      this.browsers.push(browser)
    }

    // 每 30 秒主動觸發一次掃描
    this.queryTimer = setInterval(() => this.refreshQuery(), 30_000)
  }

  private refreshQuery(): void {
    this.browsers.forEach(b => b.update())
  }

  private onDeviceUp(service: RemoteService): void {
    this.devices.set(service.host, service)
    console.log('[UP]', service.name, service.addresses)
  }

  private onDeviceDown(service: RemoteService): void {
    this.devices.delete(service.host)
    console.log('[DOWN]', service.name)
  }

  getDevices(): RemoteService[] {
    return Array.from(this.devices.values())
  }

  stop(): void {
    if (this.queryTimer) clearInterval(this.queryTimer)
    this.browsers.forEach(b => b.stop())
    this.bonjour.destroy()
  }
}
```

---

## 5. Windows 防火牆對 mDNS 的影響與解決方案

### Windows mDNS 內建支援

| Windows 版本 | mDNS 支援 | 說明 |
|---|---|---|
| Windows 10 1703+ | 內建 | 整合於 `DNS Client (dnscache)` 服務 |
| Windows 11 | 內建 | 同上，預設啟用 |
| Windows 10 以前 | 無 | 需安裝 Apple Bonjour for Windows |

**注意**：Windows 內建的 mDNS 僅支援名稱解析（`.local` 域名），**不支援 DNS-SD（服務發現）**。因此 `bonjour-service`（底層 `multicast-dns`）需自行開啟 UDP socket 監聽 5353 埠。

### 防火牆規則說明

mDNS 使用：
- **協定**：UDP
- **埠號**：5353
- **Multicast 位址**：`224.0.0.251`（IPv4）、`ff02::fb`（IPv6）

Windows Defender 防火牆預設規則：

| 網路設定檔 | mDNS (UDP-In) 規則狀態 |
|---|---|
| 私人網路（Private） | **預設啟用** |
| 公共網路（Public） | **預設停用** |
| 網域（Domain） | 視企業策略而定 |

### 驗證和啟用防火牆規則

```powershell
# 驗證 mDNS 規則狀態
netsh advfirewall firewall show rule name="mDNS (UDP-In)"

# 對所有設定檔啟用 mDNS
netsh advfirewall firewall set rule name="mDNS (UDP-In)" new enable=yes

# 僅對公共網路啟用
netsh advfirewall firewall set rule name="mDNS (UDP-In)" new enable=yes profile=public

# 驗證 DNS Client 服務狀態
Get-Service dnscache | Select-Object Name, Status, StartType
```

### 為 Electron App 新增防火牆例外

Electron App 第一次啟動時，Windows 可能彈出防火牆授權對話框。注意：

```powershell
# 不要使用環境變數路徑，要使用展開後的完整路徑
# 錯誤：%APPDATA%\...\electron.exe
# 正確：C:\Users\Username\AppData\...\electron.exe

# 以系統管理員身份新增規則
New-NetFirewallRule `
  -DisplayName "MyApp mDNS" `
  -Direction Inbound `
  -Protocol UDP `
  -LocalPort 5353 `
  -RemoteAddress 224.0.0.251 `
  -Action Allow
```

### Windows 特有問題：多張網路卡

Windows 多個網路介面時，`bonjour-service` 底層的 `multicast-dns` 可能無法正確加入所有介面的 Multicast Group：

```typescript
// 指定介面（透過底層 multicast-dns 選項）
const bonjour = new Bonjour({
  interface: '192.168.1.x',   // 指定 Wi-Fi 介面 IP
  // 或
  // interface: '0.0.0.0',    // 所有介面
})
```

### 在 Electron 安裝程式中自動設定防火牆

在 `electron-builder` 的 NSIS 安裝腳本中：

```nsis
; installer.nsi 片段
nsExec::ExecToLog 'netsh advfirewall firewall add rule name="MyApp mDNS" dir=in action=allow protocol=UDP localport=5353'
```

---

## 6. Electron Main Process 使用注意事項

### 為何 bonjour-service 適合在 Main Process 使用

`bonjour-service` 底層使用 `multicast-dns`，而 `multicast-dns` 是**純 JavaScript 實作**（不含 native binding），因此：

- 不需要 `electron-rebuild`
- 不需要 `asarUnpack` 例外設定
- 不需要 node-gyp 或 C++ 編譯環境

相比之下，`node-mdns`（`mdns` 套件）需要 native addon，在 Windows 上需要 Bonjour SDK for Windows，打包複雜度高。

### 基本使用範本（Main Process）

```typescript
// src/main/mdns-detector.ts
import { app, BrowserWindow } from 'electron'
import { Bonjour } from 'bonjour-service'

let bonjourInstance: Bonjour | null = null

function initMdns(mainWindow: BrowserWindow): void {
  bonjourInstance = new Bonjour(undefined, (err) => {
    console.error('[mDNS] Error:', err)
    mainWindow.webContents.send('mdns:error', err.message)
  })

  const browser = bonjourInstance.find({ type: 'companion-link' })

  browser.on('up', (service) => {
    mainWindow.webContents.send('mdns:device-up', {
      name: service.name,
      host: service.host,
      addresses: service.addresses,
    })
  })

  browser.on('down', (service) => {
    mainWindow.webContents.send('mdns:device-down', {
      name: service.name,
      host: service.host,
    })
  })
}

// App 生命週期管理
app.on('before-quit', () => {
  bonjourInstance?.destroy()
})

app.on('window-all-closed', () => {
  bonjourInstance?.destroy()
  bonjourInstance = null
})
```

### 打包設定

由於 `bonjour-service` 是純 JavaScript，Vite / Webpack 可直接 bundle：

**electron-vite（vite.config.ts）：**
```typescript
import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {
    // bonjour-service 是純 JS，不需要特別設定
    // 若遇到問題，可設為 external：
    build: {
      rollupOptions: {
        external: ['bonjour-service', 'multicast-dns']
      }
    }
  }
})
```

**electron-builder（package.json）：**
```json
{
  "build": {
    "files": ["dist/**/*"],
    "extraResources": [],
    "asar": true
    // bonjour-service 不需要 asarUnpack
  }
}
```

### 注意事項

1. **多個 Bonjour 實例**：避免在同一進程建立多個 `Bonjour` 實例，否則可能衝突於同一 UDP 5353 socket
2. **進程結束前務必 destroy()**：未呼叫 `destroy()` 可能導致 UDP socket 沒有正確釋放，下次啟動時出現 `EADDRINUSE` 錯誤
3. **IPC 通訊**：mDNS 事件只能在 Main Process 產生，需透過 `ipcMain` / `contextBridge` 傳送到 Renderer
4. **開發時的 Reload**：開發模式 Hot Reload 後記得清理前一個 Bonjour 實例

---

## 7. 替代方案比較

### npm 下載量（週，截至 2025 年）

| 套件 | 週下載量 | 特性 |
|------|----------|------|
| `multicast-dns` | ~15,946,398 | 低階實作，純 JS |
| `bonjour-service` | ~392 個下游專案 | 高階封裝，TypeScript |
| `bonjour`（原版） | ~2,988,325 | 原版純 JS，已少維護 |
| `dnssd` | ~2,825 | RFC 嚴格相容，純 JS |
| `node-mdns`（`mdns`） | ~2,092 | 需 native addon |
| `node-dns-sd` | ~918 | 純 JS，Node 18+ |

### 詳細比較

#### bonjour-service（推薦）

```
優點：
✅ TypeScript 原生支援，型別完整
✅ 純 JavaScript（底層 multicast-dns），無 native binding
✅ 高階 API（browse / find / publish），開發簡單
✅ Windows 開箱即用，無需額外 SDK
✅ Electron 打包友善（可直接 bundle 或設為 external）
✅ 活躍維護（ON LX Limited）

缺點：
❌ 週下載量相對低（但基於 multicast-dns，穩定）
❌ browser.update() 的主動 query 頻率無法細粒度控制
❌ 部分進階功能（如衝突解決、RFC 嚴格模式）不支援
```

#### multicast-dns（底層控制）

```
優點：
✅ 最高下載量，最廣泛測試
✅ 完全控制 DNS 封包（可自訂 Query 頻率和內容）
✅ 純 JavaScript，無 native binding
✅ 輕量，bonjour-service 的底層依賴

缺點：
❌ 低階 API，需自行處理 DNS 記錄解析
❌ 沒有高階的 browse / publish 封裝
❌ TypeScript 型別需額外安裝 @types
```

**適用場景：** 需要精細控制 PTR 查詢間隔、自訂 DNS 封包內容、或實作自訂 mDNS Responder

#### dnssd / dnssd2

```
優點：
✅ 嚴格遵循 RFC 6762 / 6763
✅ 處理睡眠/喚醒不會 flood 網路（dnssd2）
✅ 純 JavaScript，無 native binding
✅ 依賴為零

缺點：
❌ 週下載量低（2,825）
❌ 最後發布時間較久（8 年前）
❌ TypeScript 支援不完整
❌ 社群較小，維護活躍度不確定
```

#### node-mdns（mdns）

```
優點：
✅ 成熟穩定（15+ 年歷史）
✅ 豐富的功能集

缺點：
❌ 需要 native addon（node-gyp 編譯）
❌ Windows 需要 Apple Bonjour SDK for Windows（需向 Apple 申請或從非官方來源取得）
❌ Electron 打包需要 electron-rebuild + asarUnpack
❌ 在 Windows 上設定複雜，容易失敗
❌ 不建議在 Windows 目標專案使用
```

### 選型建議

```
專案需求                    推薦套件
─────────────────────────────────────────────────────
Windows Electron + 簡單 API  → bonjour-service
需要最大控制（底層封包）     → multicast-dns
嚴格 RFC 相容性              → dnssd2
Linux/macOS 原生整合         → node-mdns（不推薦 Windows）
```

---

## 8. mDNS 自我檢測實作

### 目的

在 Electron App 啟動時，驗證 mDNS 在當前 Windows 環境中是否可用（防火牆、網路卡等因素）。

### 方法一：使用 bonjour-service 自發自收

同一個進程同時發布一個測試服務，並用另一個 browser 監聽它。若能收到，代表 mDNS 正常運作。

```typescript
import { Bonjour } from 'bonjour-service'

interface MdnsSelfTestResult {
  available: boolean
  latencyMs?: number
  error?: string
}

async function selfTestMdns(timeoutMs = 5000): Promise<MdnsSelfTestResult> {
  return new Promise((resolve) => {
    const bonjour = new Bonjour(
      { loopback: true },  // 啟用 loopback 以接收自己發出的封包
      (err) => {
        bonjour.destroy()
        resolve({ available: false, error: err.message })
      }
    )

    const TEST_SERVICE_NAME = `mdns-self-test-${Date.now()}`
    const TEST_TYPE = 'http'
    const TEST_PORT = 19999

    let resolved = false
    const startTime = Date.now()

    const timeoutHandle = setTimeout(() => {
      if (!resolved) {
        resolved = true
        browser.stop()
        service.stop()
        bonjour.destroy()
        resolve({
          available: false,
          error: `Self-test timeout after ${timeoutMs}ms`
        })
      }
    }, timeoutMs)

    // 監聽測試服務
    const browser = bonjour.find({ type: TEST_TYPE })
    browser.on('up', (found) => {
      if (!resolved && found.name === TEST_SERVICE_NAME) {
        resolved = true
        clearTimeout(timeoutHandle)
        const latencyMs = Date.now() - startTime
        browser.stop()
        service.stop()
        bonjour.unpublishAll(() => bonjour.destroy())
        resolve({ available: true, latencyMs })
      }
    })

    // 發布測試服務（短暫延遲確保 browser 已準備好）
    const service = bonjour.publish({
      name: TEST_SERVICE_NAME,
      type: TEST_TYPE,
      port: TEST_PORT,
    })
  })
}

// 使用範例
async function checkMdnsAvailability(): Promise<void> {
  console.log('Testing mDNS availability...')
  const result = await selfTestMdns(5000)

  if (result.available) {
    console.log(`✓ mDNS is working (latency: ${result.latencyMs}ms)`)
  } else {
    console.error(`✗ mDNS unavailable: ${result.error}`)
    // 可在此提示用戶檢查防火牆設定
  }
}
```

### 方法二：使用 multicast-dns 底層驗證

```typescript
import multicastDns from 'multicast-dns'

async function testMdnsSocket(timeoutMs = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    let success = false

    const mdns = multicastDns({
      loopback: true,
      reuseAddr: true,
    })

    mdns.on('error', () => {
      mdns.destroy()
      resolve(false)
    })

    // 發送一個 PTR 查詢，測試 socket 是否能運作
    mdns.query({
      questions: [{
        name: '_http._tcp.local',
        type: 'PTR'
      }]
    }, () => {
      // 查詢成功送出代表 socket 可以運作
      success = true
    })

    setTimeout(() => {
      mdns.destroy()
      resolve(success)
    }, timeoutMs)
  })
}
```

### 方法三：Windows 防火牆狀態檢查

```typescript
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

async function checkWindowsFirewall(): Promise<{
  ruleExists: boolean
  ruleEnabled: boolean
}> {
  try {
    const { stdout } = await execAsync(
      'netsh advfirewall firewall show rule name="mDNS (UDP-In)"'
    )
    const ruleExists = stdout.includes('mDNS')
    const ruleEnabled = stdout.includes('Enabled:                              Yes')
    return { ruleExists, ruleEnabled }
  } catch {
    return { ruleExists: false, ruleEnabled: false }
  }
}
```

### 完整自我診斷流程

```typescript
async function diagnoseMdns(): Promise<void> {
  console.log('=== mDNS Diagnostics ===')

  // Step 1: 檢查 Windows 防火牆
  const fwStatus = await checkWindowsFirewall()
  console.log('Firewall rule exists:', fwStatus.ruleExists)
  console.log('Firewall rule enabled:', fwStatus.ruleEnabled)

  if (!fwStatus.ruleEnabled) {
    console.warn('⚠ mDNS firewall rule is disabled. Run as admin:')
    console.warn('  netsh advfirewall firewall set rule name="mDNS (UDP-In)" new enable=yes')
  }

  // Step 2: Socket 連通性測試
  const socketOk = await testMdnsSocket()
  console.log('UDP socket test:', socketOk ? 'PASS' : 'FAIL')

  // Step 3: 自發自收測試
  const selfTest = await selfTestMdns(5000)
  console.log('Self-advertisement test:', selfTest.available ? 'PASS' : 'FAIL')
  if (selfTest.latencyMs) {
    console.log('Roundtrip latency:', selfTest.latencyMs, 'ms')
  }
  if (selfTest.error) {
    console.error('Error:', selfTest.error)
  }
}
```

---

## 9. 綜合建議

### 架構建議

1. **套件選擇**：使用 `bonjour-service`（TypeScript + 純 JS），不使用 `node-mdns`
2. **監聽策略**：被動監聽 + 每 30 秒主動 `browser.update()` 的混合策略
3. **Service Type**：主要監聽 `_companion-link._tcp`，可同時監聽多個 service type
4. **鎖屏應對**：接受鎖屏後可能出現偵測延遲，不保證即時性；使用 TTL 管理裝置在線狀態
5. **Electron 整合**：在 Main Process 管理，透過 IPC 通知 Renderer
6. **啟動時自檢**：App 啟動後執行 mDNS 自我診斷，若失敗提示用戶檢查防火牆

### 已知限制

| 限制 | 說明 |
|------|------|
| iPhone 鎖屏後廣播可能減少 | 系統省電機制，無法完全迴避 |
| Windows 公共網路防火牆 | 需手動啟用或提升安裝程式權限 |
| 跨 VLAN 無法發現 | mDNS 是 link-local 協定，不跨路由器 |
| `_companion-link._tcp` 無官方文件 | 行為可能隨 iOS 版本更新而變化 |

---

## 10. 參考來源

- [bonjour-service - npm](https://www.npmjs.com/package/bonjour-service)
- [GitHub - onlxltd/bonjour-service](https://github.com/onlxltd/bonjour-service)
- [multicast-dns - npm](https://www.npmjs.com/package/multicast-dns)
- [GitHub - mafintosh/multicast-dns](https://github.com/mafintosh/multicast-dns)
- [dnssd - npm](https://www.npmjs.com/package/dnssd)
- [GitHub - DeMille/dnssd.js](https://github.com/DeMille/dnssd.js/)
- [npm trends: bonjour vs dnssd vs mdns vs multicast-dns](https://npmtrends.com/bonjour-vs-dnssd-vs-mdns-vs-multicast-dns-vs-node-dns-sd)
- [Service Discovery - Unofficial AirPlay Specification](https://openairplay.github.io/airplay-spec/service_discovery.html)
- [Service discovery - AirPlay 2 Internals](https://emanuelecozzi.net/docs/airplay2/discovery/)
- [Support for "companion" protocol - pyatv Issue #655](https://github.com/postlund/pyatv/issues/655)
- [_companion-link._tcp - Apple Community](https://discussions.apple.com/thread/254083127)
- [mDNS port 5353 - Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/2406081/mdns-port-5353)
- [Standard mDNS Service on Windows - w3tutorials.net](https://www.w3tutorials.net/blog/standard-mdns-service-on-windows/)
- [iOS 14.5 mDNS Notes - Nabto Developer Docs](https://docs.nabto.com/developer/platforms/ios/ios145.html)
- [iOS 17 mDNS IP resolving issue - Apple Developer Forums](https://developer.apple.com/forums/thread/742545)
- [Discovery fails when both devices are locked - COVID-19 App iOS Beta Issue #2](https://github.com/nhsx/COVID-19-app-iOS-BETA/issues/2)
- [mDNS, AWDL journey - artofrf.com](https://artofrf.com/2024/01/16/mdns-awdl-journey/)
- [Bonjour Sleep Proxy - Wikipedia](https://en.wikipedia.org/wiki/Bonjour_Sleep_Proxy)
- [iOS server socket dies on screen lock - CocoaHTTPServer Issue #10](https://github.com/robbiehanson/CocoaHTTPServer/issues/10)
- [Native Node Modules - Electron Docs](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)
- [Auto Unpack Native Modules Plugin - Electron Forge](https://www.electronforge.io/config/plugins/auto-unpack-natives)
- [mDNS / Bonjour Bible - Jonathan Mumm](https://jonathanmumm.com/tech-it/mdns-bonjour-bible-common-service-strings-for-various-vendors/)
