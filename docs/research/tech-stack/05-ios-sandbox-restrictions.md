# iOS 安全沙箱與檔案存取限制

> 研究日期：2026-03-11
> 涵蓋版本：iOS 11.4.1 ~ iOS 18.x
> 目的：評估無越獄條件下，macOS 應用程式能從 iPhone 存取的資料類型與技術限制

---

## 1. iOS 沙箱機制

### 1.1 核心架構

所有第三方 App 皆在沙箱中執行。安裝時系統為每個 App 建立隨機路徑的 Home 目錄，App 無法存取其他 App 的容器或修改系統檔案。

作業系統分區以 **唯讀** 方式掛載，大部分系統元件以非特權使用者 `mobile` 執行（與第三方 App 同權限層級）。

存取控制透過 **Entitlements**（數位簽章的 key-value pair）實現，無法在執行期修改。

### 1.2 App 容器目錄結構

```
<AppHomeDir>/
├── AppName.app/          # Bundle Container（唯讀，包含 App binary 與資源）
├── Documents/            # 使用者產生的內容，iCloud 備份，可透過 File Sharing 存取
├── Library/
│   ├── Preferences/      # App 偏好設定（NSUserDefaults）
│   ├── Caches/           # 快取資料，系統可能在空間不足時清除
│   ├── Application Support/  # App 支援檔案
│   └── ...
└── tmp/                  # 暫存檔案，App 未執行時系統會清除
```

### 1.3 各目錄存取限制

| 目錄 | 讀寫 | iCloud 備份 | 使用者可見 | 用途 |
|------|------|------------|-----------|------|
| `AppName.app/` | 唯讀 | 否 | 否 | App bundle，程式碼簽章驗證 |
| `Documents/` | 讀寫 | 是 | 是（File Sharing 啟用時） | 使用者文件 |
| `Library/Preferences/` | 讀寫 | 是 | 否 | 設定 plist |
| `Library/Caches/` | 讀寫 | 否 | 否 | 可重建的快取 |
| `tmp/` | 讀寫 | 否 | 否 | 暫存，系統自動清理 |

### 1.4 跨 App 存取機制

App 預設無法存取自身容器外的檔案，例外情況：
- 透過系統 API 存取特定資料（照片、通訊錄、行事曆等），需使用者授權
- App Groups（同開發者的 App 間共享資料）
- Document Picker / File Provider Extension
- iCloud 容器（需 Entitlement）

---

## 2. 無越獄條件下的外部存取能力

### 2.1 照片（DCIM）

| 方式 | 可行性 | 限制 |
|------|--------|------|
| **PTP（Picture Transfer Protocol）** | 可行 | iPhone 連接 USB 時自動呈現為 PTP 相機裝置，可讀取 DCIM 目錄中的照片與影片。僅限讀取，不支援重新命名、修改或刪除。需裝置已解鎖且已信任主機。 |
| **AFC（Apple File Conduit）** | 部分可行 | AFC 被限制在 `/private/var/mobile/Media` 目錄，可存取 Camera Roll。但 AFC 主要供 iTunes/Finder 使用，第三方需透過 libimobiledevice 或 pymobiledevice3 存取。 |
| **macOS Image Capture 框架** | 可行 | macOS 原生 `ImageCaptureCore` 框架可列舉並下載 iPhone 照片。`PTPCamera` 程序會在裝置連接時自動啟動。 |
| **gphoto2** | 部分可行 | 在 macOS 上需先停止 PTPCamera 程序才能使用。部分檔案可能出現傳輸錯誤。 |

### 2.2 影片

與照片相同，影片儲存在 DCIM 目錄中，透過 PTP 和 AFC 皆可存取。PTP 模式下可讀取但不可修改。大型影片檔案透過 PTP 傳輸可能較慢。

### 2.3 文件（iCloud Drive）

| 方式 | 可行性 | 限制 |
|------|--------|------|
| **macOS 本機 iCloud Drive** | 可行 | iCloud Drive 同步到 `~/Library/Mobile Documents/` 或 `~/Library/CloudStorage/`，可直接讀取檔案系統。需使用者登入同一 Apple ID。 |
| **CloudKit API** | 需 App 開發 | 需要建立 iOS/macOS App 並取得使用者授權。適合存取特定 App 的 iCloud 容器，不適合通用檔案存取。 |
| **NSFileProviderManager** | 可行（macOS App） | 可建立 File Provider domain，檔案可見於 `~/Library/CloudStorage/`。適合建立自訂雲端同步方案。 |
| **直接檔案系統存取** | 不可行 | USB 連接下無法存取 iPhone 上 iCloud Drive 的檔案，需透過雲端同步。 |

### 2.4 通訊錄 / 行事曆

| 方式 | 可行性 | 說明 |
|------|--------|------|
| **iTunes/Finder 備份解析** | 可行 | 備份檔案中包含 SQLite 資料庫：`AddressBook.sqlitedb`（通訊錄）、`Calendar.sqlitedb`（行事曆）。可用 iLEAPP、iBackup Viewer 等工具解析。 |
| **加密備份** | 可行但需密碼 | 加密備份包含更多資料（如健康資料、Wi-Fi 密碼），但需備份密碼才能解析。 |
| **iCloud 同步** | 間接可行 | 通訊錄透過 CloudKit 同步，行事曆透過 CalDAV。macOS 上的 Contacts.app 和 Calendar.app 可存取同步資料。 |

---

## 3. PhotoKit / Photos Framework

### 3.1 概述

PhotoKit 是 Apple 提供的 iOS 端照片存取框架，包含：
- **Photos Framework**：存取照片庫的模型資料（PHAsset、PHCollection 等）
- **PhotosUI**：提供照片選擇器 UI 元件

### 3.2 透過 Companion App 暴露資料

PhotoKit **僅限 iOS App 內部使用**，無法直接從外部程式（macOS App）呼叫。但可透過以下架構間接暴露：

| 方案 | 說明 |
|------|------|
| **iOS Companion App + 網路傳輸** | iOS App 使用 PhotoKit 讀取照片庫，透過 Bonjour/Wi-Fi/USB 將資料傳送給 macOS App |
| **App Extension（Share Extension）** | 使用者手動選擇照片後，透過 Share Extension 傳送 |
| **Background App Refresh** | iOS App 在背景定期檢查新照片並透過網路同步 |

限制：
- 需使用者授予照片庫存取權限（iOS 14+ 可選擇「僅限選取的照片」）
- 背景執行受 iOS 嚴格限制（約 30 秒執行時間）
- iOS 15+ 的「有限存取」模式下，App 無法得知完整照片庫內容

### 3.3 iOS 14+ 隱私變更

- **Limited Photo Library Access**：使用者可只授權特定照片，App 無法列舉未授權的項目
- **PHPickerViewController**：不需要照片庫權限即可讓使用者選擇照片（iOS 14+）

---

## 4. Files App / Document Provider Extension

### 4.1 架構

iOS Files App 透過 **File Provider Extension** 整合第三方儲存服務。由兩個元件組成：

1. **Document Picker View Controller Extension**：提供瀏覽/選擇 UI
2. **File Provider Extension**：授予 host app 存取沙箱外檔案的能力，管理遠端檔案的本機副本

### 4.2 操作模式

| 模式 | 說明 |
|------|------|
| **Import** | 從 Provider 複製檔案到 host app 容器 |
| **Open** | 直接開啟 Provider 的檔案，可修改後存回 |
| **Export** | 從 host app 複製檔案到 Provider |
| **Move** | 將檔案從 host app 容器移動到 Provider |

### 4.3 與備份方案的關聯

File Provider Extension 可作為一種將 iPhone 檔案暴露給外部系統的機制：
- iOS App 實作 File Provider Extension → 檔案出現在 Files App 中
- 這些檔案可透過 iTunes/Finder 備份被包含在備份中
- 但無法直接從 macOS 透過 USB 存取 File Provider 管理的檔案

---

## 5. iOS 16/17/18 的沙箱變化

### 5.1 iOS 16

- **Lockdown Mode（鎖定模式）**：極端安全模式，連接 USB 時裝置需解鎖
- **Passkeys 支援**：增強認證安全
- 沙箱核心機制未有重大變更

### 5.2 iOS 17

- **CoreDevice 框架**：取代部分舊版裝置通訊機制，iOS 17.0+ 引入新的 RemoteXPC 協議
- **新 Lockdown Tunnel**：iOS 17.4+ 使用新的 lockdown tunnel，影響第三方工具（libimobiledevice、pymobiledevice3）的相容性
- 沙箱 Profile 持續強化，修補多個路徑處理漏洞（可能被利用繞過沙箱）
- **通訊安全**：擴展到更多應用場景

### 5.3 iOS 18

- **Inactivity Reboot（閒置重啟）**：
  - iOS 18.0：裝置鎖定 7 天未解鎖自動重啟
  - iOS 18.1：縮短為 **72 小時（3 天）**
  - 重啟後裝置進入 BFU（Before First Unlock）狀態，所有資料處於最高保護等級
  - USB 資料存取完全不可用，直到使用者輸入密碼
- **USB Restricted Mode 強化**：修補 CVE-2025-24200（iOS 18.3.1），防止透過輔助功能框架繞過
- 沙箱修補：iOS 18.7 修復捷徑可能繞過沙箱限制的權限問題

### 5.4 趨勢總結

Apple 持續 **收緊** 安全限制：
- USB 存取窗口縮短
- 閒置自動重啟減少資料暴露時間
- CoreDevice/RemoteXPC 取代舊協議，增加第三方工具的實作難度

---

## 6. PTP（Picture Transfer Protocol）

### 6.1 macOS 上的實作

| 工具/框架 | 說明 |
|-----------|------|
| **ImageCaptureCore 框架** | macOS 原生框架，Image Capture.app 的底層。可透過 `ICDeviceBrowser` 偵測裝置，`ICCameraDevice` 列舉/下載照片。 |
| **PTPCamera** | macOS 系統程序，當偵測到 PTP 裝置時自動啟動。若要使用其他工具存取，需先終止此程序。 |
| **gphoto2 / libgphoto2** | 開源 PTP/MTP 實作。在 macOS 上需停用 PTPCamera 才能使用。已知與 iPhone 的部分相容性問題。 |
| **Image Capture.app** | macOS 內建應用程式，可瀏覽並匯入 iPhone 照片。可設定「連接此相機時打開」的行為。 |

### 6.2 PTP 存取範圍

- 僅限 DCIM 目錄（照片與影片）
- 唯讀存取（可下載，不可修改/刪除裝置上的檔案）
- 不支援存取其他類型檔案（文件、App 資料等）
- 需裝置已解鎖且已建立信任

---

## 7. Locked vs Unlocked iPhone

### 7.1 裝置狀態與存取能力

| 狀態 | AFC 存取 | PTP 存取 | 備份 | 說明 |
|------|---------|---------|------|------|
| **BFU（開機未解鎖）** | 不可 | 不可 | 不可 | 資料加密金鑰未載入，所有資料不可存取 |
| **AFU（已解鎖後鎖定）** | 依配對狀態 | 依配對狀態 | 依配對狀態 | 部分加密金鑰仍在記憶體中 |
| **已解鎖** | 可（需配對） | 可（需配對） | 可（需配對） | 完整存取 |

### 7.2 USB Restricted Mode 影響

| 條件 | 行為 |
|------|------|
| 鎖定 < 1 小時 | 已配對裝置可繼續 USB 資料傳輸 |
| 鎖定 > 1 小時 | USB 資料連接中斷，僅保留充電。需解鎖並重新認證 |
| 3 天未連接 USB | 鎖定後立即阻斷 USB 資料，無 1 小時緩衝 |
| iOS 18.1+ 閒置 72 小時 | 自動重啟，進入 BFU 狀態 |

### 7.3 配對記錄（Lockdown Records）

- 首次配對時交換 2048-bit RSA 公鑰
- 配對記錄儲存於 macOS `/var/db/lockdown/`
- 有效期 **30 天**（iOS 11+，之前為 6 個月）
- 過期後需重新配對（裝置需解鎖）
- 配對記錄可用於邏輯提取（forensics），但需在有效期內

---

## 8. Trust 對話框機制

### 8.1 觸發條件

- iPhone 首次透過 USB 連接到未信任的電腦時彈出
- iOS 16+ 設定自動備份時，每次連接都會彈出
- 裝置必須處於 **解鎖狀態** 才會顯示 Trust 對話框

### 8.2 技術流程

```
1. USB 連接 → usbmuxd 偵測裝置
2. 呼叫 lockdownd 的 VerifyPairing
3. 若首次連接 → 返回 InvalidHostID 錯誤
4. 發送 Pair 請求 → iOS 顯示「信任此電腦？」對話框
5. 使用者點擊「信任」並輸入密碼
6. 交換 RSA 公鑰，建立配對記錄
7. 後續連接透過 lockdownd 驗證配對
```

### 8.3 程式化處理

- **libimobiledevice**：`idevicepair pair` 命令觸發配對流程，但仍需使用者在裝置上確認
- **pymobiledevice3**：透過 lockdown service API 處理配對，同樣需使用者互動
- **無法完全自動化**：Trust 對話框是 iOS 安全模型的核心部分，設計上 **必須** 有使用者手動確認
- **最佳實踐**：應用程式應偵測配對狀態，在未配對時引導使用者完成信任流程

### 8.4 usbmux 架構

```
macOS App → usbmuxd（USB 多工器）→ USB → iPhone lockdownd
                                              ↓
                                         AFC / PTP / 其他服務
```

- usbmuxd 提供類似 TCP 的連線多工機制
- 所有 iOS 服務（AFC、備份、安裝等）皆透過 usbmux 連線到裝置上對應的 port
- lockdownd 負責認證與服務啟動

---

## 9. 近年 Apple 對第三方 USB 存取的政策變化

### 9.1 安全強化時間線

| 時間 | 變更 | 影響 |
|------|------|------|
| iOS 11.4.1（2018） | 引入 USB Restricted Mode | 鎖定 1 小時後阻斷 USB 資料 |
| iOS 12（2018） | 3 天規則 | 長時間未連接 USB 後立即阻斷 |
| iOS 13（2019） | 更嚴格的未配對裝置阻斷 | 關閉配件連接漏洞 |
| iOS 16（2022） | Lockdown Mode | 極端安全模式，USB 需解鎖才能使用 |
| iOS 17.0（2023） | CoreDevice / RemoteXPC | 新裝置通訊協議，影響第三方工具相容性 |
| iOS 17.4（2024） | 新 Lockdown Tunnel | pymobiledevice3 需更新適配 |
| iOS 18.1（2024） | Inactivity Reboot（72hr） | 閒置自動重啟至 BFU |
| iOS 18.3.1（2025） | 修補 CVE-2025-24200 | 堵住 USB Restricted Mode 繞過漏洞 |

### 9.2 對第三方開發者的影響

- **libimobiledevice**：持續維護，但需追趕 Apple 協議變更。iOS 17+ 的 CoreDevice 增加了實作複雜度。
- **pymobiledevice3**：純 Python 實作，iOS 17.4+ 透過新 lockdown tunnel 全平台支援。macOS/Windows 上 iOS 17.0-17.3.1 需額外驅動。
- **商業工具**（iMazing、AnyTrans 等）：持續適配新版 iOS，但核心限制相同。
- **趨勢**：Apple 明確傾向 **減少** 第三方對裝置的直接存取能力，每一代 iOS 都增加更多限制。

### 9.3 合規考量

- MFi（Made for iPhone/iPad）認證：硬體配件需通過 Apple 認證
- USB-C 轉換（iPhone 15+）：協議不變，但硬體介面更標準化
- Apple 可能在未來進一步限制非 Apple 軟體的 USB 通訊能力

---

## 10. 對備份方案的設計影響

### 10.1 可行的資料存取路徑

| 資料類型 | 推薦路徑 | 備註 |
|----------|----------|------|
| 照片/影片 | PTP（ImageCaptureCore）或 AFC | 最直接，需裝置解鎖+信任 |
| 文件 | iCloud Drive 同步 | 需同一 Apple ID，透過檔案系統讀取 |
| 通訊錄/行事曆 | iTunes 備份 + SQLite 解析 | 或透過 iCloud 同步到 macOS |
| App 資料 | iTunes 備份解析 | 僅包含允許備份的 App 資料 |
| 健康資料 | 加密 iTunes 備份 | 需備份密碼 |

### 10.2 關鍵限制

1. **必須使用者互動**：首次連接的 Trust 對話框無法自動化
2. **裝置需解鎖**：所有有意義的資料存取都需要裝置處於解鎖狀態
3. **USB Restricted Mode**：長時間未使用需重新認證
4. **iOS 18 Inactivity Reboot**：72 小時閒置重啟，需重新輸入密碼
5. **配對記錄過期**：30 天需重新配對

---

## 來源

- [Apple Security Guide - Runtime Process Security](https://support.apple.com/guide/security/security-of-runtime-process-sec15bfe098e/web)
- [Apple File System Basics](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/FileSystemOverview/FileSystemOverview.html)
- [AFC - The Apple Wiki](https://theapplewiki.com/wiki/AFC)
- [PhotoKit - Apple Developer Documentation](https://developer.apple.com/documentation/photokit)
- [File Provider - Apple Developer Documentation](https://developer.apple.com/documentation/fileprovider)
- [USB Restricted Mode Complete Guide (Trio)](https://www.trio.so/blog/usb-restricted-mode)
- [USB Restricted Mode in iOS 13 (ElcomSoft)](https://blog.elcomsoft.com/2019/09/usb-restricted-mode-in-ios-13-apple-vs-graykey-round-two/)
- [iOS 18 Inactivity Reboot (Magnet Forensics)](https://www.magnetforensics.com/blog/understanding-the-security-impacts-of-ios-18s-inactivity-reboot/)
- [CVE-2025-24200 Analysis (Quarkslab)](https://blog.quarkslab.com/first-analysis-of-apples-usb-restricted-mode-bypass-cve-2025-24200.html)
- [pymobiledevice3 - GitHub](https://github.com/doronz88/pymobiledevice3)
- [libimobiledevice](https://libimobiledevice.org/)
- [Understanding usbmux and iOS lockdown service](https://jon-gabilondo-angulo-7635.medium.com/understanding-usbmux-and-the-ios-lockdown-service-7f2a1dfd07ae)
- [Apple Lockdown Mode Security](https://support.apple.com/guide/security/lockdown-mode-security-sec2437264f0/web)
- [About Trust This Computer (Apple Support)](https://support.apple.com/en-us/109054)
- [libimobiledevice/usbmuxd - GitHub](https://github.com/libimobiledevice/usbmuxd)
- [iOS File System (Shawn Baek)](https://shawnbaek.com/2024/03/31/ios-file-system/)
- [Developer guide on iOS file system (tanaschita)](https://tanaschita.com/20221010-quick-guide-on-the-ios-file-system/)
- [Build your own cloud sync with FileProvider APIs](https://claudiocambra.com/posts/build-file-provider-sync/)
- [iPhone Photo Backup to Linux - Native Guide](https://www.uncommonengineer.com/docs/engineer/Misc/iphone-to-linux-mount/)
- [mac-gphoto-enabler - GitHub](https://github.com/mejedi/mac-gphoto-enabler)
