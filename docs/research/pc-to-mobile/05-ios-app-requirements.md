# iOS 配套 App 需求評估

## 概要

本文檔評估開發 PC 到 iPhone 雙向檔案同步系統時，iOS 配套應用的必要性、技術限制，以及最小可行方案的框架需求。

---

## 1. 不需要 iOS App 的傳輸方案

### 1.1 USB 直接連接 (有限支持)

#### 技術限制
- **MFi 認證要求**：iOS 只能與 MFi 認證的 USB 配件通訊
- **需要認證晶片**：自 2012 年起，所有 Lightning/USB-C 連接器必須包含認證整合電路
- **不支持通用 USB 隨身碟**：普通 USB 隨身碟無法在 iPhone 上直接訪問，除非通過 Files app 中已支持的 MFi 認證閃存驅動器
- **文件系統支持**：iOS 僅讀取 ExFAT、FAT32、HFS+、APFS
- **電源限制**：Lightning 連接器的功率限制可能影響某些驅動器的工作

#### 可行性判斷
| 項目 | 結論 |
|------|------|
| 無 iOS app 直接文件傳輸 | ❌ 不可行（需 MFi 認證硬件） |
| MFi 認證 USB 隨身碟 | ✅ 可行但有硬件成本 |
| PC 主動推送 | ❌ 不可行 |

**來源**：[Apple Developer Forums - MFi 相關討論](https://developer.apple.com/forums/thread/83487)、[MacRumors - MFi 限制](https://www.macrumors.com/2023/02/28/iphone-15-usb-c-cables-without-mfi-badges/)

---

### 1.2 WiFi 同步 (iTunes/Finder)

#### 技術限制
- **初始化需求**：必須先用 USB 連接建立無線同步關係，才能後續通過 WiFi 進行同步
- **速度約束**：WiFi 同步速度低於 USB 連接，受無線網路頻寬和訊號強度影響
- **大檔案問題**：大檔案傳輸在 WiFi 上經常出現連線不穩定或速度問題
- **單源同步**：每種內容類型只能與一台電腦同步
- **被動操作**：使用者必須主動在 Finder 中點擊同步，不支持自動推送

#### 可行性判斷
| 項目 | 結論 |
|------|------|
| 無 iOS app 被動同步 | ⚠️ 可行但有限（需手動觸發） |
| PC 主動推送 | ❌ 不可行 |
| 自動化同步 | ❌ 不可行 |
| 大檔案傳輸 | ⚠️ 不穩定 |

**來源**：[Apple Support - WiFi 同步設置](https://support.apple.com/guide/itunes/wi-fi-syncing-itns3751d862/windows)、[FoneTool - WiFi 同步限制](https://www.fonetool.com/phone-transfer/sync-iphone-over-wifi-without-cable-9270-rc.html)

---

### 1.3 iTunes File Sharing (需要目標應用)

#### 運作機制
- **應用選擇共享**：開發者必須在應用中啟用 `UIFileSharingEnabled`（Info.plist 中的 `Application supports iTunes file sharing`）
- **雙向檔案交換**：允許 PC 端透過 iTunes/Finder 向應用的文件目錄複製檔案，應用也可將檔案提供給 PC 下載
- **沒有自動化**：完全手動操作，PC 端需在 Finder 中拖拽檔案到應用

#### 可行性判斷
| 項目 | 結論 |
|------|------|
| 無 iOS app | ❌ 不可行（應用必須明確啟用） |
| 最小應用實現 | ✅ 可行（見 1.4） |
| PC 主動推送 | ❌ 不可行（手動拖拽） |
| 自動同步 | ❌ 不可行 |

**來源**：[Apple Support - iTunes File Sharing](https://support.apple.com/en-us/120403)、[HowToGeek - iTunes File Sharing 使用](https://www.howtogeek.com/215969/)

---

## 2. 需要 iOS App 的傳輸方案

### 2.1 Document Provider Extension (推薦方案)

#### 技術概述
Document Provider Extension（通過 `NSFileProviderExtension` 或 iOS 16+ 的 `NSFileProviderReplicatedExtension`）允許應用在 Files app 中呈現自訂儲存空間。

#### 運作機制
```
PC ←→ [服務器/本地存儲] ←→ iOS App
                      ↓
                  Files App 可見
```

#### 核心框架需求
| 框架 | 最低版本 | 用途 |
|------|---------|------|
| **FileProvider** | iOS 11+ | 基礎 Document Provider |
| **FileProvider (Replicated)** | iOS 16+ | 推薦：系統管理內容快取 |
| **Foundation (URLSession)** | iOS 7+ | 網路傳輸 |
| **Security** | iOS 7+ | 檔案訪問權限 |

#### 實現要點
- 創建 File Provider App Extension target
- 實現 `NSFileProviderExtension` 的關鍵方法：
  - `fetchContents()` / `fetchDocuments()` - 查詢檔案
  - `createItem()` / `modifyItem()` / `deleteItem()` - 檔案操作
  - `documentStorageURL()` - 儲存位置設置
- 配置 Info.plist 中的 `NSExtensionFileProviderDocumentGroup`（共享容器識別符）
- 使用 iCloud Drive 或 Web API 後端同步檔案

#### 優勢
✅ Files app 原生整合
✅ 支持背景同步
✅ iOS 16+ 有系統快取管理
✅ 提供完整檔案管理 UI

#### 限制
❌ 需要應用發佈
❌ iOS 16+ 才能使用 Replicated 版本
⚠️ 需通過 App Store 審核

**來源**：[Apple Developer - File Provider 文檔](https://developer.apple.com/documentation/fileprovider)、[Kodeco - File Provider Extension 教程](https://www.kodeco.com/697468-ios-file-provider-extension-tutorial)

---

### 2.2 無線傳輸（WiFi/藍牙）

#### Multipeer Connectivity (應用間通訊)
**能否無 iOS app 運作**：❌ **不可行**

Multipeer Connectivity 是框架層面的實現，允許兩個安裝了同一應用的 iOS 設備通訊。**它不是系統級功能**，必須由應用顯式實現。

**關鍵點**：
- 需要 PC 和 iPhone 上都運行支持 Multipeer Connectivity 的應用
- 支持 Bluetooth、P2P WiFi、基礎設施 WiFi
- 可進行檔案流傳輸
- 近距離無網際網路連接仍可工作

**應用場景**：開發多設備檔案共享應用時，可使用此框架實現設備間直接通訊。

#### Network Extension
**能否無 iOS app 運作**：❌ **不可行**

Network Extension 是系統級框架，用於 VPN、URL 過濾等網路層操作，**非應用級檔案傳輸框架**。需要企業簽名或開發者測試模式。

#### URLSession（Web API 方案）
**推薦用於 PC↔️iPhone 通訊**

```
PC 應用
  ↓ (HTTP POST/PUT)
[Web 服務器/自建服務]
  ↓ (HTTP GET/POST)
iOS App (URLSession 請求)
```

**框架需求**：
- `URLSession` - HTTP 客戶端（Foundation）
- `Codable` - JSON 序列化
- `OperationQueue` 或 `async/await` - 非同步網路操作

**優勢**：
✅ 跨平台（PC/iOS 皆可用 HTTP）
✅ 無需額外框架
✅ 支持後台傳輸（URLSessionConfiguration.waitsForConnectivity）

**限制**：
❌ 需要網路連接（WiFi/蜂窩）
⚠️ 不支持 LAN 直連（除非開發自建 HTTP 服務器）

**來源**：[Apple Developer - Multipeer Connectivity](https://developer.apple.com/documentation/multipeerconnectivity)、[HackerNoon - Multipeer Connectivity 指南](https://hackernoon.com/master-ios-multipeer-connectivity-and-share-data-across-multiple-devices-without-internet-access)

---

### 2.3 背景模式（後台同步）

#### 支持的背景模式
| 背景模式 | 應用場景 | 限制 |
|---------|---------|------|
| **Background Fetch** | 定期檢查新檔案 | 系統控制時間間隔（15 分鐘～數小時），不可保證 |
| **Silent Push Notification** (`content-available: 1`) | 伺服器主動喚醒應用 | ~30 秒執行時間；系統限流（基於電量、網路狀態）；無法保證送達 |
| **Remote Notification** | 顯示推送提示 | 需使用者互動啟動應用 |
| **VoIP Push** | VoIP 來電 | 專用於 VoIP，濫用會被 App Store 拒絕 |
| **File Transfer Extension** | 背景下載/上傳 | iOS 13.4+；URLSessionDownloadTask；系統管理生命週期 |

#### 背景同步的現實考量
- **不可靠**：Silent Push 會遭系統限流；Background Fetch 時間不確定
- **耗電**：頻繁喚醒應用會影響電池續航
- **App Store 審核**：濫用背景模式會被拒絕（如使用 VoIP Push 做非 VoIP 用途）

#### 可行的後台方案
✅ **Silent Push Notification**（適合低頻同步）
✅ **URLSessionDownloadTask with background session**（適合大檔案）
❌ **VoIP Push**（有風險）
⚠️ **Background Fetch**（時間不可控）

**來源**：[Apple Developer - 背景推送更新](https://developer.apple.com/documentation/usernotifications/setting_up_a_remote_notification_server/pushing_background_updates_to_your_app)、[DEV Community - iOS 背景模式指南](https://dev.to/alekseibarinov/ios-background-modes-a-quick-guide-ag3)

---

## 3. 最小可行 iOS App (MVP)

### 3.1 核心需求

#### 基本功能
應用作為「接收端」，支持 PC 推送檔案。最小實現應包括：

1. **檔案接收**
   - Documents folder 訪問
   - File app 整合（Document Provider Extension 或 File Sharing）

2. **WiFi 推送接收**
   - URLSession 監聽 HTTP 伺服器或連接到已有伺服器
   - 後台下載支持

3. **用戶界面**
   - 檔案列表展示
   - 下載狀態指示

#### 框架清單（MVP）

| 框架 | 用途 | 最低版本 |
|------|------|---------|
| **UIKit / SwiftUI** | UI 框架 | iOS 13+ (SwiftUI) / iOS 2+ (UIKit) |
| **Foundation** | 基礎框架 | iOS 2+ |
| **UniformTypeIdentifiers** | 檔案類型識別 | iOS 14+ |
| **FileProvider** | Document Provider (可選) | iOS 11+ |
| **UserNotifications** | 推送通知 | iOS 10+ |
| **BackgroundTasks** | 背景任務 | iOS 13+ |

#### 最小 Info.plist 配置

```xml
<key>UISupportedInterfaceOrientations</key>
<array>
    <string>UIInterfaceOrientationPortrait</string>
</array>

<!-- 若使用 File Sharing -->
<key>UIFileSharingEnabled</key>
<true/>

<!-- 若使用 Document Provider -->
<key>NSExtensionFileProviderDocumentGroup</key>
<string>group.com.yourcompany.fileSync</string>

<!-- 背景模式 -->
<key>UIBackgroundModes</key>
<array>
    <string>fetch</string>
    <string>remote-notification</string>
</array>
```

### 3.2 實現步驟

#### 第 1 階段：基本 UI（2-3 週）
```swift
import SwiftUI
import UniformTypeIdentifiers

@main
struct FileSyncApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .fileImporter(
                    isPresented: .constant(true),
                    allowedContentTypes: [.data],
                    onCompletion: { result in
                        // 處理匯入檔案
                    }
                )
        }
    }
}

struct ContentView: View {
    @State var files: [FileItem] = []

    var body: some View {
        NavigationStack {
            List(files) { file in
                VStack(alignment: .leading) {
                    Text(file.name)
                    Text("\(file.size) bytes")
                        .font(.caption)
                }
            }
            .navigationTitle("Synced Files")
        }
    }
}
```

#### 第 2 階段：WiFi 傳輸（3-4 週）
```swift
import Foundation

class FileSyncManager: NSObject, URLSessionDelegate {
    static let shared = FileSyncManager()

    func downloadFile(from url: URL) {
        let config = URLSessionConfiguration.background(withIdentifier: "com.filesync.bg")
        let session = URLSession(configuration: config, delegate: self, delegateQueue: nil)
        let task = session.downloadTask(with: url)
        task.resume()
    }

    // 實現背景下載委託
    func urlSession(_ session: URLSession,
                   downloadTask: URLSessionDownloadTask,
                   didFinishDownloadingTo location: URL) {
        // 移動檔案到 Documents
    }
}
```

#### 第 3 階段：Document Provider (可選，4-6 週)
```swift
import FileProvider

class FileProviderExtension: NSFileProviderExtension {

    override func fetchContents(for itemIdentifier: NSFileProviderItemIdentifier,
                               usingExistingContentsIfPossible existingContents: Bool,
                               request: NSFileProviderRequest,
                               completionHandler: @escaping (URL?, NSFileProviderItem?, Error?) -> Void) {
        // 實現從遠端取檔
    }

    override func createItem(basedOn itemTemplate: NSFileProviderItem,
                            fields: NSFileProviderItemFields,
                            contents: URL?,
                            options: NSFileProviderCreateItemOptions = [],
                            completionHandler: @escaping (NSFileProviderItem?, NSFileProviderItemFields, Bool, Error?) -> Void) {
        // 實現上傳邏輯
    }
}
```

### 3.3 App Store 審核要求

#### 必要聲明
- **隱私政策**：說明收集/使用哪些資料
- **用途描述（NSLocalizedUsageDescription）**：
  - `NSLocalizedUsageDescriptionForUsage` - 存取理由
  - `NSBonjourServiceTypes` - 若使用 mDNS 本地發現
- **背景模式說明**：在描述中清楚說明為何需要背景執行

#### 審核焦點
| 項目 | 審核標準 | 相關指南 |
|------|---------|---------|
| 隱私 | 最小化資料收集；透明聲明 | WWDC 隱私講座 |
| 功能 | 不能濫用背景模式（如 VoIP） | App Store 審核指南 5.1 |
| 效能 | 不崩潰、響應迅速 | App Store 審核指南 2.1 |
| 內容 | 無違法/不適內容 | App Store 審核指南 1.1-1.4 |

#### 拒絕風險
❌ 使用 VoIP Push 做非 VoIP 用途
❌ 過度濫用背景模式導致耗電
❌ 未清楚說明隱私資料使用
❌ 功能不完整或明顯崩潰

**來源**：[Apple App Store 審核指南](https://developer.apple.com/app-store/review/guidelines/)、[App Store 審核檢查清單](https://appinstitute.com/app-store-review-checklist/)

---

## 4. TestFlight 與企業分佈

### 4.1 TestFlight

#### 用途
- 最多 100 位內部測試者，每個最多 30 台裝置
- 最多 10,000 位外部測試者
- 無法跳過 App Store 審核

#### 能否繞過限制
❌ **不能**。TestFlight 必須先通過 App Store 審核才能啟用，無法繞過任何 iOS 限制（如背景模式、檔案訪問等）。

### 4.2 企業發佈（企業簽名）

#### 歷史背景
- 2020 年前：企業開發者帳號可在 App Store 外直接發佈應用
- **2020 年後**：Apple 禁止使用企業簽名繞過 App Store，詳見 [WWDC 2020 討論](https://developer.apple.com/forums/thread/651157)

#### 現代替代方案
1. **Custom Apps（推薦）**
   - 透過 Apple Business Manager 發佈給組織
   - 使用 MDM（如 Intune）部署
   - 支持簽署和加密
   - 無 App Store 審核流程（但 Apple 可審查安全性）

2. **標準開發者帳號 + 私有應用**
   - 在 App Store 發佈但設為「私有」（組織內限制）
   - 仍需通過 App Store 審核

#### TestFlight 與企業簽名的限制
| 方案 | 背景模式 | 檔案訪問 | 推送通知 | 需通過 App Store |
|------|---------|---------|---------|-----------------|
| TestFlight | ✅ 支持 | ✅ 支持 | ✅ 支持 | ✅ 是 |
| Custom Apps | ✅ 支持 | ✅ 支持 | ✅ 支持 | ⚠️ 否（內部審查） |
| 標準私有應用 | ✅ 支持 | ✅ 支持 | ✅ 支持 | ✅ 是 |

**結論**：**無法繞過 iOS API 限制**。所有方案都遵循相同的 iOS 沙箱/權限模型。

**來源**：[Appcircle - iOS 應用分佈指南 2025](https://appcircle.io/guides/ios/ios-app-distribution)、[Hexnode - 企業應用分佈](https://www.hexnode.com/blogs/enterprise-app-distribution/)

---

## 5. 判斷決策樹

### 5.1 「需要 iOS App」的判斷

```
需求：PC 主動推送檔案到 iPhone？
├─ YES
│  ├─ 需要自動化/背景執行？
│  │  ├─ YES → 需要 iOS App（實現 URLSession 後台下載 或 Silent Push）
│  │  └─ NO  → 可選 iOS App（用戶手動打開 → 觸發下載）
│  │
│  └─ 僅需手動文件共享？
│     ├─ YES → 不需 App（iTunes File Sharing；但需啟用特殊設置）
│     └─ NO  → 需要 iOS App
│
└─ NO（iPhone → PC）
   └─ 同上邏輯反向適用
```

### 5.2 傳輸方案選擇

#### 場景 A：家庭環境，WiFi 局域網，無伺服器

**最簡單方案**：
1. Mac/PC 上運行簡單 HTTP 伺服器
2. iOS App（用 URLSession）連接伺服器
3. 不需要 Document Provider Extension
4. **工作量**：1-2 週

---

#### 場景 B：多設備同步，需要 Cloud 後端

**推薦方案**：
1. 開發 iOS App，實現 Document Provider Extension
2. 後端：AWS S3 / Azure Blob / 自建伺服器
3. 應用實現 Silent Push Notification 或 Background Fetch
4. **工作量**：6-8 週（含審核）

---

#### 場景 C：企業/組織部署

**可行方案**：
1. 使用 Custom Apps 發佈（無 App Store 審核）
2. 透過 MDM 推送給設備
3. 支持所有背景模式、File Provider Extension 等
4. **工作量**：同方案 B，但審核時間短

---

## 6. 總結表

| 功能需求 | 無 iOS App | 簡易 App | 完整 App | 備註 |
|---------|-----------|---------|---------|------|
| **PC → iPhone 檔案推送** | ❌ | ✅ | ✅ | 需應用或 iTunes File Sharing |
| **自動背景同步** | ❌ | ⚠️ | ✅ | App 提供 Silent Push 或 Background Fetch |
| **Files App 整合** | ⚠️ | ⚠️ | ✅ | 需 Document Provider Extension |
| **WiFi 傳輸（LAN）** | ❌ | ✅ | ✅ | 需簡單 HTTP 伺服器或 Multipeer Connectivity |
| **USB 直連（無 MFi）** | ❌ | ❌ | ❌ | Apple 不允許；需 MFi 硬件 |
| **App Store 發佈** | N/A | ✅ | ✅ | 需通過審核；3-5 個工作日 |
| **企業簽名發佈** | N/A | ✅ | ✅ | Custom Apps；2-3 天內審查 |
| **最小開發時間** | N/A | 2-3 週 | 6-8 週 | 不含 App Store 審核等待時間 |

---

## 7. 建議方案

### MVP（最小可行產品）
**選擇**：簡易 iOS App（Document Picker + URLSession）

**理由**：
1. 開發時間短（2-3 週）
2. 滿足基本同步需求
3. 使用者可透過 Files app 訪問同步的檔案
4. 支持 WiFi 傳輸（無需伺服器，僅需簡單 HTTP）

**核心實現**：
```swift
// 檔案匯入
DocumentPickerViewController(forOpeningContentTypes: [.data])

// WiFi 下載
URLSessionConfiguration.background(withIdentifier: "com.filesync.bg")

// Files 整合
UIFileSharingEnabled = true (最簡單)
或
NSFileProviderExtension (更好的整合)
```

### 完整版
**選擇**：完整 iOS App（Document Provider + Silent Push + 後台同步）

**理由**：
1. 真正的自動同步
2. Files app 原生支持
3. 生產級用戶體驗

**核心實現**：
- Document Provider Extension（iOS 16+ Replicated）
- APNs Silent Push（每當 PC 端有新檔案）
- URLSessionDownloadTask（實際檔案下載）
- CloudKit 或自建後端存儲

---

## 參考資料

### 官方文檔
- [Apple File Provider Framework](https://developer.apple.com/documentation/fileprovider)
- [iOS Background Modes](https://developer.apple.com/documentation/usernotifications/setting_up_a_remote_notification_server/pushing_background_updates_to_your_app)
- [Multipeer Connectivity](https://developer.apple.com/documentation/multipeerconnectivity)
- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [iTunes File Sharing - Apple Support](https://support.apple.com/en-us/120403)

### 社群教程
- [Kodeco - File Provider Extension Tutorial](https://www.kodeco.com/697468-ios-file-provider-extension-tutorial)
- [Kodeco - Multipeer Connectivity Guide](https://www.kodeco.com/12689804-getting-started-with-multipeer-connectivity)
- [NSHipster - Multipeer Connectivity](https://nshipster.com/multipeer-connectivity/)

### 工具與範例
- [OwnCloud iOS App (開源 File Provider 實現)](https://github.com/owncloud/ios-app)
- [Hacking with Swift - Document-Based Apps](https://www.hackingwithswift.com/quick-start/swiftui/how-to-create-a-document-based-app-using-filedocument-and-documentgroup)

---

**文檔版本**：1.0
**最後更新**：2025-03-10
**資料來源**：Apple Developer Documentation、官方論壇、開發社群 (2024-2025)

