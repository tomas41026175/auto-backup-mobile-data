# Tech Stack Entities

重要工具、協定、概念的跨面向聚合索引。

---

## libimobiledevice

- **定位**（04 工具分析）：C 語言開源函式庫，可存取 iPhone AFC、備份、通知等
- **技術**（01 備份協定）：透過 usbmuxd，使用 AFC 協定讀取 DCIM，v1.4.0（2025-10）仍活躍
- **限制**（05 iOS 沙箱）：需要 USB 實體連接，需通過 Trust 對話框，iPhone 需解鎖
- **Node.js 整合**（01）：無成熟 binding，建議 CLI wrapper（ideviceinfo、idevicescreenshot）
- **macOS 狀況**（07）：macOS 原生有 usbmuxd，比 Windows 整合度更好

## pymobiledevice3

- **定位**（04）：Python 純實作，2025 年最活躍的開源 iOS 存取方案
- **優勢**（04）：支援 iOS 17+ CoreDevice 協定、備份功能完整、社群最活躍
- **Node.js 整合**：需 subprocess 橋接，非原生 binding
- **建議**（04）：若 libimobiledevice CLI 不夠用，pymobiledevice3 是最佳備選

## bonjour-service（npm）

- **定位**（02 mDNS）：Node.js Bonjour/mDNS 套件，v1.3.0（2024-11）
- **API**（02）：publish/find/destroy，支援 PTR/SRV/TXT 記錄
- **問題**（02）：23 個 open issues，macOS Sequoia UUID 碰撞問題
- **替代**（02）：multicast-dns（純 JS）、node-dns-sd
- **在本專案**：已使用，發現 iPhone 的 `_companion-link._tcp` 服務

## AFC（Apple File Conduit）

- **定位**（01、05）：Apple 私有協定，透過 USB + usbmuxd 存取 iPhone 檔案系統
- **可存取範圍**（05）：DCIM（照片/影片）、Documents（部分 App）
- **限制**（05）：需 USB、需 Trust 配對、iPhone 需解鎖、USB Restricted Mode 1hr 後阻斷
- **iOS 18 變化**（01、05）：Inactivity Reboot（72hr 未解鎖自動重啟至 BFU 狀態），影響自動備份

## PTP（Picture Transfer Protocol）

- **定位**（01、05）：MTP 子集，macOS 用於讀取 iPhone 照片的協定
- **macOS 框架**（07）：ImageCaptureCore（官方）、gphoto2（開源）
- **限制**（05）：唯讀、僅 DCIM、需 USB、無 Node.js binding

## electron-builder

- **定位**（08）：Electron 應用打包工具，1.19M/week 下載量
- **無簽名設定**（08）：`identity: null`，可產出 DMG 但 Gatekeeper 會警告
- **重大限制**（08）：無簽名 ❌ 無法 auto-update（Squirrel.Mac 硬性要求）
- **版本注意**（08）：v26 的 node-module-collector 是最大 breaking change
- **在本專案**：已設定 mac 區塊，`identity: null`，arm64，extendInfo

## launchd（macOS）

- **定位**（09）：macOS 官方的行程排程/服務管理機制
- **用法**（09）：LaunchAgent plist（StartInterval/WatchPaths/KeepAlive）
- **vs node-cron**（09）：launchd 系統層級，app 不需常駐；node-cron 需 app 在跑
- **無簽名限制**（07）：基本 LaunchAgent 功能不受簽名影響

## SMAppService（macOS 13+）

- **定位**（07）：取代舊 SMLoginItemSetEnabled 的 Login Items API
- **四種服務類型**（07）：mainApp / loginItem / daemon / agent
- **狀態**（07）：enabled / notRegistered / requiresApproval / notFound
- **無簽名限制**（07）：需在 System Settings 手動允許，無法程式化靜默啟用

## vitest + vi.mock('electron')

- **定位**（10）：Electron main process 單元測試方案
- **設定**（10）：需獨立 vitest.config.ts，不依賴 electron-vite 內建整合
- **可 mock**（10）：app、BrowserWindow、ipcMain、dialog、Menu、Tray、shell
- **服務層測試**（10）：Map 模擬 electron-conf、EventEmitter 模擬 bonjour、memfs 模擬檔案系統

## node-usb

- **定位**（09）：Node.js USB hotplug 事件監聽
- **用法**（09）：取代已停維的 usb-detection，監聽 Apple Vendor ID（0x05AC）裝置插入
- **整合**（09）：結合 launchd WatchPaths 可省資源

## xxHash64

- **定位**（03）：超高速非加密 hash，用於傳輸完整性驗證
- **效能**（03）：比 SHA-256 快 15x，`@node-rs/xxhash` 套件
- **用法**（03）：邊傳輸邊計算（Transform stream），傳完即得 hash

## Playwright for Electron

- **定位**（10）：E2E 測試框架，experimental 支援 Electron v14+
- **功能**（10）：啟動 app、操作 UI、截圖、多視窗、IPC 互動
- **CI 設定**（10）：Linux 需 xvfb，macOS/Windows 不需

## MessagePort / MessageChannel（Electron）

- **定位**（06）：IPC 的高效替代，用於大量資料傳輸
- **優勢**（06）：Transferable 零拷貝，避免序列化開銷
- **用法**（06）：適合串流傳輸場景，如 backup progress 大量推送

---

## 協定關係圖

```
iPhone
  ├── USB ── usbmuxd ── lockdownd ── AFC ──→ DCIM 照片/影片
  │                               └── mobilebackup2 ──→ iTunes 備份
  └── WiFi ── (需 iOS companion App) ── HTTP ──→ 自訂 API

macOS
  ├── bonjour-service ── mDNS ──→ 發現 iPhone
  ├── node-usb ──→ USB 插入事件
  └── libimobiledevice / pymobiledevice3 ──→ AFC 存取
```
