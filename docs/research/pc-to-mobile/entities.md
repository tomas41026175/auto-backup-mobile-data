# PC → Mobile 研究實體索引

**研究日期**: 2026-03-10

---

## 協定 / 技術

### AFC（Apple File Conduit）
- **定位**（來自 02）：USB 有線傳輸核心協定，基於 usbmuxd/lockdownd 認證
- **存取範圍**（來自 02）：標準 AFC 限 `/var/mobile/Media`；AFC2（完整系統）iOS 8+ 已禁用
- **Windows 支援**（來自 02）：官方工具鏈支援 Linux/macOS；Windows 依賴 usbmuxd，支援度 ⚠️
- **商業工具**（來自 04）：iMazing、AnyTrans 皆基於 AFC，WALTR Pro 聲稱 Bonjour 但仍需 Apple Mobile Device Services
- **Electron 整合**（來自 06）：可透過 `child_process.spawn` 呼叫 libimobiledevice CLI，但 Windows 打包後有崩潰問題

### Bonjour / mDNS
- **定位**（來自 03）：零設定網路服務發現，跨平台識別裝置
- **iOS 限制**（來自 03）：iOS 背景執行限制導致 mDNS 廣播不穩定（與現有 iPhone→PC 研究一致）
- **Windows 支援**（來自 03）：需額外安裝，macOS/Linux 原生
- **Electron 應用**（來自 06）：PC 端可用 `bonjour-service` 廣播 HTTP server，iPhone 端 App 用 `NetServiceBrowser` 發現

### Document Provider Extension（NSFileProviderExtension）
- **定位**（來自 01、05）：iOS 11+ 官方機制，讓 Files app 整合第三方儲存空間
- **能力**（來自 05）：可讓 PC 推送檔案到 iPhone 可見的儲存位置，支援自動同步
- **限制**（來自 01）：仍在 App 沙盒內，無法直接寫入照片庫或其他 App 的容器
- **開發成本**（來自 05）：完整實作需 6-8 週，是技術難度最高但自動化程度最完整的方案

### iOS 沙盒
- **核心規則**（來自 01）：每個 App 只能存取自己的 Container，路徑含隨機 UUID，重裝後改變
- **版本演變**（來自 01）：iOS 16/17/18 **未放寬**，iOS 18.2 反而加強
- **Photo Library**（來自 01）：PHAsset API 唯讀，外部無法直接寫入，需獨立 Gallery App
- **對設計的影響**（來自 05）：PC → iPhone 自動同步**必須有 iOS App**，無法繞過

---

## 工具 / 套件

### libimobiledevice
- **定位**（來自 02）：開源跨平台 iPhone 通訊函式庫，實作 AFC、lockdownd、usbmuxd
- **最新版本**（來自 02）：v1.4.0（2025年10月），支援 iOS 17+
- **Windows 現況**（來自 02）：MSYS2 可建置，但 usbmuxd Windows 支援不完整
- **Node.js 綁定**（來自 06）：`appium-ios-device` 為生產環境推薦，`libijs` 純 JS 實作但尚未穩定

### iMazing
- **技術路線**（來自 04）：基於 AFC 協定，提供官方 CLI（Business 訂閱）
- **Windows 支援**（來自 04）：完整支援，iOS 18 已相容
- **可整合性**（來自 04）：唯一提供官方 CLI 的商業工具，可供 Electron 呼叫
- **限制**（來自 04）：需安裝 iTunes / AMDS；Business 訂閱才有 CLI

### LocalSend
- **定位**（來自 03）：開源 P2P WiFi 傳輸，70K+ GitHub stars
- **技術**（來自 03）：Bonjour 服務發現 + HTTP + 端對端加密
- **評估**（來自 03）：最優入門 WiFi 方案，但需使用者手動操作，無法全自動背景同步
- **參考價值**：可做為自建 WiFi 傳輸的架構參考

### Apple Mobile Device Support（AMDS）
- **定位**（來自 04、06）：Windows 上 iTunes 安裝的驅動服務，AFC 的前提條件
- **依賴鏈**（來自 06）：幾乎所有 USB 方案在 Windows 都依賴 AMDS
- **風險**（來自 06）：使用者可能未安裝 iTunes，需在 installer 中處理依賴

### URLSession（iOS）
- **定位**（來自 05）：iOS 標準 HTTP 客戶端，支援背景下載任務
- **背景限制**（來自 05）：Background URLSession 可後台下載，但需事先設定，不能任意監聽
- **與 PC 端整合**（來自 06）：PC 端起 HTTP server，iPhone App 用 URLSession 拉取，是最簡單的雙向通訊架構

---

## 方案類型

### WiFi HTTP Server 架構
- **PC 端**（來自 06）：Electron main process 用 Node.js Express 起 HTTP server
- **iPhone 端**（來自 05）：URLSession 下載 + Document Provider 儲存
- **發現機制**（來自 03）：Bonjour/mDNS
- **難度**（來自 05）：2-3 週 MVP，App Store 審核 3-5 天
- **限制**（來自 03）：iPhone App 必須在前景或有 Background URLSession 設定才能接收

### iTunes File Sharing
- **機制**（來自 05）：App 設定 `UIFileSharingEnabled`，使用者在 iTunes/Finder 手動拖拽
- **限制**（來自 05）：不自動，需使用者操作；只能存取啟用 File Sharing 的 App 的 Documents 目錄
- **適合情境**：低頻、手動的單次傳輸

---

## 關聯文件

- iOS 沙盒詳情 → [01-ios-sandbox.md](./01-ios-sandbox.md)
- AFC / libimobiledevice → [02-afc-libimobiledevice.md](./02-afc-libimobiledevice.md)
- WiFi 傳輸方案 → [03-wifi-transfer.md](./03-wifi-transfer.md)
- 現有工具比較 → [04-existing-tools.md](./04-existing-tools.md)
- iOS App 需求評估 → [05-ios-app-requirements.md](./05-ios-app-requirements.md)
- Electron 整合 → [06-electron-nodejs.md](./06-electron-nodejs.md)
