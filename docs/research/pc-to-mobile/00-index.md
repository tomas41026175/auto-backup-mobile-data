# PC 到 Mobile 雙向同步：研究索引

**研究周期**: 2025-03-10
**涵蓋平台**: iOS / Windows / Mac / Electron
**核心問題**: PC 與 iPhone 之間的檔案同步技術可行性評估

---

## 研究系列文檔

| # | 研究主題 | 核心發現 | 文件 |
|---|---------|---------|------|
| **01** | iOS 沙盒與檔案系統限制 | 沙盒強制隔離；無根文件系統訪問；Container 隨機路徑 | [→](./01-ios-sandbox.md) |
| **02** | AFC 協議 & libimobiledevice | USB 文件傳輸協議；PC 工具支持度；跨平台限制 | [→](./02-afc-libimobiledevice.md) |
| **03** | WiFi 檔案傳輸技術 | mDNS / Bonjour；HTTP 伺服器；直連限制 | [→](./03-wifi-transfer.md) |
| **04** | 現有工具技術路線分析 | iMazing/AnyTrans/WALTR Pro 對比；AFC vs Bonjour；CLI 支援；iOS 18 相容 | [→](./04-existing-tools.md) |
| **05** | iOS 配套 App 需求評估 | **需要 iOS App 的判斷** / Document Provider Extension / 背景模式 | [→](./05-ios-app-requirements.md) |
| **06** | Electron/Node.js 実装 | PC 端技術棧；mDNS 伺服器；file transfer 實作 | [→](./06-electron-nodejs.md) |

---

## 核心結論速查

### ❓ 「PC 到 iPhone 需要 iOS App 嗎？」

| 場景 | 需要 iOS App | 理由 | 備註 |
|------|-----------|------|------|
| **USB 直連無 MFi 硬件** | ❌ | Apple 不允許通用 USB 訪問；需 MFi 認證 | [01, 02] |
| **iTunes File Sharing** | ⚠️ 可選 | 應用必須啟用 `UIFileSharingEnabled`；PC 手動拖拽 | [05] |
| **WiFi 自動推送** | ✅ | 需 App 實現 URLSession 或 Silent Push | [05, 06] |
| **Files App 整合** | ✅ | Document Provider Extension（iOS 11+） | [05] |
| **後台同步** | ✅ | Background Fetch / Silent Push Notification | [05] |

### ⚙️ 技術方案對比

| 方案 | 開發難度 | 時間成本 | App Store 審核 | 自動化程度 |
|------|---------|---------|---------------|----------|
| MFi USB 硬件 | ⭐ | 硬件採購 | 無 | ✅ 完全自動 |
| iTunes File Sharing | ⭐ | 0-1 週 | 無 | ❌ 手動 |
| WiFi HTTP 伺服器 + 簡易 App | ⭐⭐ | 2-3 週 | 3-5 天 | ⚠️ 半自動 |
| Document Provider + Silent Push | ⭐⭐⭐⭐ | 6-8 週 | 3-5 天 | ✅ 完全自動 |
| Electron PC + iOS App + 雲後端 | ⭐⭐⭐⭐⭐ | 12+ 週 | 3-5 天 | ✅ 完全自動 |

### 🏗️ 推薦架構

```
┌─ PC Electron App ─────────────┐
│  • mDNS Server (Bonjour)      │
│  • HTTP File Server            │  [06]
│  • 檔案監聽 & 隊列管理         │
└──────────────┬────────────────┘
               │ WiFi/Bonjour
               ▼
┌─ iPhone iOS App ──────────────┐
│  • Document Provider Ext.      │  [05]
│  • URLSession 下載管理         │
│  • Silent Push 喚醒            │
│  • Files App 整合              │
└─ Local Storage (App Container)┘
```

---

## 相互依賴與決策鏈

### 初期決策
1. **確認部署環境**：企業內網 (LAN 直連) 或 雲部署 (HTTPS)？[03]
2. **檔案量與同步頻率**：大檔案/高頻 → 需 App；輕量/低頻 → USB + iTunes File Sharing
3. **開發資源**：無 iOS 開發經驗 → 建議純 USB 方案；有團隊 → Document Provider

### 技術決策樹
```
目標：PC → iPhone 檔案推送
├─ 是否需要自動化？
│  ├─ NO → USB (MFi) / iTunes File Sharing
│  └─ YES
│     ├─ 需要 Files App 整合？
│     │  ├─ NO → 簡易 HTTP 伺服器 + 簡易 iOS App
│     │  └─ YES → Document Provider Extension
│     │
│     └─ 同步頻率？
│        ├─ 高頻(每分鐘) → Silent Push + 後台任務
│        ├─ 低頻(每小時) → Background Fetch
│        └─ 極低頻(手動) → 定時輪詢
```

---

## 跨面向洞察

### 因果鏈

**iOS 沙盒 → 必須 iOS App**
- iOS 16-18 沙盒未放寬（01）→ 外部無法直接寫入 Photo Library 或其他 App 容器（01）→ PC 主動推送自動同步**必須有配套 iOS App**（05）
- 結論：無論 USB 或 WiFi，「完全無 App」的方案只能達到半自動（iTunes File Sharing 手動拖拽）

**AFC Windows 依賴鏈**
- AFC 協定需 usbmuxd（02）→ Windows usbmuxd 支援不完整（02）→ 商業工具（iMazing/AnyTrans）依賴 Apple Mobile Device Support（04）→ 使用者必須安裝 iTunes（06）→ **Electron 打包需處理 iTunes 依賴**，增加安裝體積與摩擦

**WiFi 背景接收限制鏈**
- iOS 背景限制（03）→ iPhone App 不能任意監聽（03）→ 需 URLSession Background Task 或 Silent Push 喚醒（05）→ Silent Push 需後端 APNs 伺服器（05）→ **純 LAN 方案難以做到全自動背景接收**，需使用者開啟 App

### 矛盾點

| 議題 | 說明 |
|------|------|
| WALTR Pro 聲稱「不需 iTunes」透過 WiFi 推送 | 但研究（04）指出實際仍需 Apple Mobile Device Services；「無需 iTunes」可能只是指不需打開 iTunes UI |
| libimobiledevice v1.4.0 聲稱 iOS 17+ 支援 | 但 Windows usbmuxd 實作仍不完整（02），Windows 上實際可用性需實機驗證 |
| LocalSend 標榜「零設定」WiFi 傳輸 | 需 iPhone App 保持前景，無法做到 iPhone 鎖屏後自動接收（03），與現有 mDNS 研究中 iPhone 螢幕鎖定後廣播不穩定問題一致 |

### 硬件 vs 軟件取捨

| 向度 | MFi USB 硬件 | iOS App + WiFi |
|------|-------------|----------------|
| **硬件成本** | $30-50（每台） | $0 |
| **開發成本** | 極低 | 2-8 週 |
| **使用者體驗** | 即插即用 | 需安裝 App |
| **擴展性** | 受限 | 高度可客製 |
| **App Store 審核** | 無 | 需 3-5 天 |

## 實體索引

→ [entities.md](./entities.md)（AFC、libimobiledevice、Document Provider、iMazing、LocalSend 等所有關鍵實體聚合評價）

---

## 使用指南

### 如果你的問題是...

**「PC 可以直接推送檔案到 iPhone 嗎？不要 App」**
→ 閱讀 [01, 02, 05] | 結論：✅ 可行（MFi USB）或 ⚠️ 半自動（iTunes File Sharing）

**「WiFi 同步實現的技術細節」**
→ 閱讀 [03, 06] | 重點：Bonjour 服務發現 + HTTP 伺服器

**「iOS App 最少需要什麼」**
→ 閱讀 [05] | 重點：Document Provider Extension / URLSession / 背景模式

**「完整 MVP 開發計劃」**
→ 閱讀 [05, 06] | 預計 6-8 週

**「為何需要 iOS App？」**
→ 閱讀 [01, 02] | 根本原因：iOS 沙盒 + AFC 限制

---

## 參考資源對應表

| 主題 | 來源檔案 | 關鍵連結 |
|------|---------|---------|
| iOS 沙盒政策 | [01] | [Apple Developer - Sandbox](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/) |
| libimobiledevice | [02] | [GitHub - libimobiledevice](https://github.com/libimobiledevice/libimobiledevice) |
| Bonjour/mDNS | [03, 06] | [Apple - Bonjour Overview](https://developer.apple.com/bonjour/) |
| File Provider | [05] | [Apple Developer - FileProvider](https://developer.apple.com/documentation/fileprovider) |
| Electron | [06] | [Electron 官方文檔](https://www.electronjs.org/docs) |

---

## 後續研究方向

### 04 - 現有工具技術路線分析 ✅ 已完成
涵蓋內容：
- iMazing（CLI、AFC、Windows 依賴、iOS 18 支援）
- AnyTrans by iMobie（協議架構、多 iCloud 同步）
- WALTR Pro（Bonjour 無需 iTunes、Wi-Fi 傳輸）
- Finder Sync/File Provider（macOS 專屬、Document Provider）
- 各工具 API 與整合能力（iMazing CLI 對比）
- 技術選型建議（場景化推薦）

### 後續：中間層架構評估（計畫中）
預計涵蓋：
- GraphQL / REST API 設計選擇
- 雲存儲 (AWS S3 / Azure Blob) vs 自建伺服器
- 認證 & 授權 (OAuth / JWT)
- 監控與日誌記錄

### 補充研究
- [ ] Android 對等方案評估
- [ ] macOS 端實現細節
- [ ] 企業簽名 vs App Store 分佈對比

---

**最後更新**: 2025-03-10
**作者**: Research Team
**版本**: 1.0

