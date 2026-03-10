# iOS 沙盒與檔案系統限制研究

## 概述

本文檔整理了 iOS 檔案系統沙盒機制的最新資訊，涵蓋可存取的目錄、外部程式的存取邊界、iOS 16/17/18 的政策變化，以及對「PC 到 iPhone 雙向檔案同步」的技術制約。

**研究時間**: 2024-2025 | **涵蓋版本**: iOS 16 ~ iOS 18

---

## 1. iOS 沙盒基礎機制

### 1.1 核心原則

iOS 採用 **強制應用沙盒** (Mandatory Application Sandboxing)，所有第三方應用程式都被隔離在各自的沙盒容器內：

- **隔離基礎**: 每個應用程式在安裝時被隨機分配一個唯一的主目錄 (Container)
- **預設拒絕**: 沙盒採用「預設拒絕」政策，所有訪問都被明確禁止，除非有特定授權
- **無直接檔案系統存取**: 使用者無法直接瀏覽 iOS 檔案系統，所有檔案存取必須透過 OS 提供的 API

### 1.2 沙盒容器結構

每個應用程式的沙盒包含多個容器目錄，具有不同用途：

| 容器名稱 | 路徑位置 | 用途 | 可寫入 |
|---------|---------|------|-------|
| **Bundle Container** | `AppName.app/` | 應用程式套件、可執行檔及資源 | ❌ 唯讀 |
| **Data Container** | `/var/mobile/Containers/Data/` | 應用程式資料及用戶內容 | ✅ 可讀寫 |

### 1.3 Data Container 內部結構

Data Container 內部包含以下標準目錄：

| 目錄 | 路徑 | 備份 | 可寫入 | 用途 |
|-----|-----|------|------|------|
| **Documents/** | `Documents/` | ✅ | ✅ | 使用者建立的檔案（文件、使用者選擇的媒體） |
| **Documents/Inbox** | `Documents/Inbox/` | ✅ | 📝* | 外部應用程式或郵件傳入的檔案 |
| **Library/** | `Library/` | ✅** | ✅ | 應用程式特定的支援檔案 |
| **Library/Application Support/** | `Library/Application Support/` | ✅ | ✅ | 應用程式資料、設定、範本等 |
| **Library/Caches/** | `Library/Caches/` | ❌ | ✅ | 暫時緩存資料（系統可在應用離開時清除） |
| **tmp/** | `tmp/` | ❌ | ✅ | 臨時檔案（應用終止時刪除） |

**註解**:
- `*` = 只能讀取和刪除，無法寫入
- `**` = Library/Caches 目錄不被備份

### 1.4 重要限制

❌ **禁止存取**:
- 不能讀寫 Bundle 容器 (`AppName.app/`)
- 不能直接訪問其他應用程式的容器
- 不能存取系統檔案系統的任意路徑
- 不能讀取 `/private`, `/var`, `/tmp` 等系統目錄（除自身容器內的 tmp）

✅ **受控存取例外**:
- 透過 `UIDocumentPickerViewController` 選擇外部檔案（使用 Security-Scoped URL）
- 透過系統框架 (Photos.framework, Contacts.framework 等) 存取特定用戶資料
- App Groups 在同一開發團隊的應用間共享容器

---

## 2. Files App 與 Document Provider 架構

### 2.1 Document Provider 擴充概念

**Document Provider Extension** 是 iOS 11+ 引入的機制，允許應用程式透過 Files app 公開其管理的檔案給其他應用程式存取：

```
┌─────────────────────────────────────────┐
│         iOS Files App (系統應用)          │
└────────────────┬────────────────────────┘
                 │
        ┌────────┴────────┐
        ▼                  ▼
┌──────────────┐   ┌──────────────────┐
│ Local Files  │   │ Document Provider│
│              │   │ Extensions       │
│ (Device)     │   │ (Third-party)    │
└──────────────┘   └──────────────────┘
```

### 2.2 Document Provider 的兩個主要元件

#### A. Document Picker View Controller Extension
- 提供瀏覽和選擇檔案的使用者介面
- 需要實作四項基本操作：
  - **Import** - 從其他應用匯入檔案到 Provider
  - **Open** - 開啟 Provider 管理的檔案
  - **Export** - 匯出檔案到 Provider
  - **Move** - 移動檔案到 Provider

#### B. File Provider Extension (NSFileProviderExtension)
- 實際管理和提供檔案存取
- 負責檔案的下載、上傳、同步
- 建立遠端內容的本地代理 (Placeholder)

### 2.3 Files App 外部存取邊界

Files App 內部存取限制：

| 存取來源 | 可存取範圍 | 權限邊界 |
|---------|----------|--------|
| **Local Files** | 裝置本地儲存空間 | 受沙盒限制，Files App 只能看自己的容器 |
| **iCloud Drive** | 用戶 iCloud Drive 儲存空間 | 透過 CloudKit 框架，需要用戶授權 |
| **Document Providers** | 各 Provider Extension 的文件根目錄 | 每個 Provider 獨立沙盒 |
| **SMB/WebDAV** | 網路共享位置 | 透過支援的第三方應用 |

**關鍵限制**:
- Files App 本身 **不能直接寫入其他應用程式的沙盒**
- Document Provider Extension 只能存取 **自己的文件儲存位置** (`documentStorageURL`)
- 外部應用無法直接「推送」檔案到另一應用，只能透過：
  1. 使用者主動選擇檔案（UIDocumentPickerViewController）
  2. 使用 App Groups（限同一開發團隊的應用）
  3. 透過 CloudKit/iCloud Drive 進行雲同步

### 2.4 iOS 16+ 的 FileProvider 改進

iOS 16 引入 **「Desktop Class Sync」** (桌面級同步)，帶來以下改進：

- **Stateless 架構**: 系統負責管理磁碟結構和檔案狀態，Extension 只負責同步任務
- **FileProvider UI Extension**: 在 Files App 中提供額外整合點
- **Push 通知支援**: 使用 PushKit 的 `fileProvider` 類型通知遠端變更
  ```swift
  let pushRegistry = PKPushRegistry(queue: queue)
  pushRegistry.desiredPushTypes = Set([PKPushType.fileProvider])
  // Topic: "<app-identifier>.pushkit.fileprovider"
  ```

---

## 3. iOS 版本沙盒政策演變

### 3.1 iOS 16 (2022)

- 引入 **FileProvider 桌面級同步** API
- 加強 **iCloud Drive 整合** 能力
- 引入 iCloud Shared Photo Library (iOS 16.1)

**檔案存取政策**: 保持向後相容，沙盒限制未放寬

### 3.2 iOS 17 (2023)

- 持續完善 FileProvider API
- 加強背景同步機制
- App Groups 容器共享的穩定性改進

**檔案存取政策**: 無重大變更，維持 iOS 16 標準

### 3.3 iOS 18 (2024)

- **UIDocumentPickerViewController** 效能優化
- 改進 **CloudKit 同步** 的背景任務支援
- iOS 18.2 起：沙盒帳戶設定位置遷移 (Settings.app → Developer Settings)

**檔案存取政策**: **未見放寬**，仍然維持嚴格沙盒

**重要安全更新** (June 2024):
- Apple 加強沙盒設定檔，禁止應用程式無授權存取網路表和 API
- 沙盒應用程式只能看自己的網路連線

### 3.4 整體趨勢

❌ **沙盒從未放寬**: Apple 一貫加強而非放寬沙盒限制
✅ **API 不斷完善**: 提供更好的受控存取方式 (FileProvider, DocumentPicker, CloudKit)

**結論**: 不應期待 iOS 會開放「直接檔案系統存取」；應轉向使用官方提供的受控 API。

---

## 4. App Groups / 共享容器的適用範圍

### 4.1 基本概念

**App Groups** 是 iOS 應用程式間進行資料共享的機制，允許同一開發團隊的多個應用和擴充程式存取共享容器：

```
┌─────────────────────────────────────────────┐
│   開發團隊 Team ID: ABC123                   │
├──────────┬──────────────┬──────────────────┤
│ 主應用   │ Widget       │ Share Extension  │
│ (App)    │ (Extension)  │ (Extension)      │
└──────────┴──────┬───────┴──────────────────┘
                  │
         ┌────────▼────────┐
         │  Shared Container│
         │ group.xxx.yyy   │
         └─────────────────┘
```

### 4.2 共享容器的 API 存取

```swift
// 存取 App Group 共享容器
if let sharedContainer = FileManager.default.containerURL(
    forSecurityApplicationGroupIdentifier: "group.com.example.MyApp"
) {
    let filePath = sharedContainer.appendingPathComponent("shared-data.db")
    // 讀寫檔案
}

// 共享 UserDefaults
let sharedDefaults = UserDefaults(suiteName: "group.com.example.MyApp")
sharedDefaults?.set("value", forKey: "key")
```

### 4.3 限制與邊界

| 限制項目 | 說明 |
|--------|------|
| **團隊限制** | 只有同一開發團隊（Team ID）的應用才能共享容器 |
| **無跨團隊共享** | 無法與其他開發商的應用共享資料 |
| **儲存空間限制** | 無明確硬上限，受裝置可用存儲空間限制 |
| **沙盒仍適用** | 共享容器仍在沙盒內，無法存取系統檔案系統 |
| **擴充程式限制** | Extension 只能與主應用共享，不同 Extension 無直接共享機制 |

### 4.4 實際應用場景

✅ **適用**:
- 同一開發商的主應用與 Widget 共享資料
- 主應用與 Share Extension 共享配置
- 主應用與 Notification Service Extension 共享狀態

❌ **不適用**:
- 第三方應用程式間的資料共享（如「PC 備份工具」與「Photos 應用」）
- 跨越不同開發商邊界的同步

---

## 5. 外部檔案推送能力分析

### 5.1 照片 (Photos)

#### 限制
- **無法直接寫入**: Photos.framework 不允許外部應用直接在 Photo Library 中建立或修改資產
- **PHAsset 唯讀**: 外部應用無法透過 PHAsset API 寫入照片
- **iCloud Photos 同步**: 內部同步由 iCloud Photos 管理，外部應用無法干預

#### 受控存取方式
```swift
// ✅ 允許: 使用者透過 UIDocumentPickerViewController 選擇
// ❌ 不允許: 外部應用直接寫入 Photo Library

// 替代方案: Photos Picker (iOS 16+)
let photosPickerConfig = PHPickerConfiguration()
photosPickerConfig.selectionLimit = 0 // 多選
let picker = PHPickerViewController(configuration: photosPickerConfig)
// 使用者選擇 → 檔案複製到應用容器
```

#### 外部推送替代方案
1. **iCloud Photos**: 使用者手動同步或 iCloud 自動同步
2. **FileProvider 類 App**: 建立類似 Dropbox 的 Photo Provider Extension
3. **CloudKit + 通知**: 由主應用透過 CloudKit 同步，觸發 iCloud Photos 重新整理

### 5.2 文件 (Documents)

#### 允許存取範圍
- **Documents 目錄**: 應用的 Documents/ 目錄
- **Documents/Inbox**: 接收外部傳入的檔案
- **iCloud Drive 下的應用資料夾**: 透過 UIDocumentPickerViewController

#### 外部推送方式

**方案 A: UIDocumentPickerViewController (User-initiated)**
```swift
let controller = UIDocumentPickerViewController(
    forOpeningContentTypes: [.pdf, .plainText]
)
// 使用者選擇檔案 → 應用獲得 Security-Scoped URL
// 讀寫需要管理 startAccessingSecurityScopedResource()
```

**方案 B: Document Provider Extension + FileProvider**
```swift
// 主應用建立 Document Provider Extension
// 在 Files App 中顯示自訂檔案階層
// 外部應用無法直接寫入，但可透過 Provider 的 API
```

**方案 C: App Groups (限同一開發商)**
```swift
// 只有同一開發商可使用
let sharedContainer = FileManager.default.containerURL(
    forSecurityApplicationGroupIdentifier: "group.xxx"
)
```

### 5.3 媒體 (Videos, Audio)

#### 限制
- **不能直接寫入**: 無法透過 Media-related APIs 外部推送視訊/音樂
- **目錄限制**: 應用無法存取系統的 Music、Podcasts 目錄

#### 受控存取方式
1. **複製到 Documents**: 外部應用將檔案複製到自身 Documents 目錄
2. **AVFoundation 播放**: 透過 AVPlayer 播放（需先取得檔案）
3. **iCloud Music Library**: 使用者透過 Music app 手動同步

### 5.4 總結表

| 檔案類型 | 外部直接推送 | 建議替代方案 |
|---------|-----------|-----------|
| **照片** | ❌ 不可 | iCloud Photos / FileProvider Extension |
| **文件** | ❌ 直接不可<br/>✅ 可透過 DocumentPickerViewController 分享 | Document Provider Extension / iCloud Drive |
| **視訊** | ❌ 不可 | 複製到 Documents / 建立專用 FileProvider |
| **音樂** | ❌ 不可 | 複製到 Documents / FileProvider |
| **一般檔案** | ❌ 不可 | 透過 Document Provider 或 App Groups |

---

## 6. PC 到 iPhone 同步的技術可行性

### 6.1 核心制約

| 制約 | 說明 | 影響 |
|-----|------|------|
| **無檔案系統存取** | iOS 沙盒禁止直接檔案系統訪問 | 不能直接同步到特定目錄 |
| **應用隔離** | 每個應用獨立沙盒 | 無法跨應用推送檔案 |
| **無後台磁碟寫入** | 背景進程無法主動寫入 | 同步需要使用者互動或系統事件 |
| **Photo Library 唯讀** | 無法外部寫入照片 | 照片同步需要替代方案 |

### 6.2 技術可行的同步方案

#### **方案 A: 建立專用 FileProvider App**
```
PC 檔案 → (WiFi/USB) → iPhone FileProvider App → Files App
```

**優勢**:
- ✅ 受 Apple 官方支援 (iOS 16+)
- ✅ 與 Files App 無縫整合
- ✅ 支援拖放和背景同步
- ✅ 可處理檔案版本控制

**限制**:
- ❌ 只能在 FileProvider 自訂目錄同步，不能直接寫入 Photos/Documents
- ❌ 需使用者透過 Files App 手動組織

**推薦使用**: PC 到 iPhone **文件同步**

#### **方案 B: 使用 iCloud Drive + CloudKit**
```
PC → iCloud Drive → (CloudKit 同步) → iPhone
```

**優勢**:
- ✅ 自動同步（使用者授權後）
- ✅ 系統內建支援
- ✅ 跨裝置同步

**限制**:
- ❌ 依賴 iCloud 訂閱
- ❌ 需要 Internet 連線
- ❌ 不適合大檔案（CloudKit 有大小限制）

**推薦使用**: 雲端備份和協作

#### **方案 C: App Groups (限同一開發商)**
```
PC 備份工具 → App Groups Container → iPhone 主應用
```

**優勢**:
- ✅ 同一團隊應用間快速共享
- ✅ 無沙盒限制

**限制**:
- ❌ 僅限同一開發商 (Team ID)
- ❌ 無法與第三方應用共享

**推薦使用**: 自家應用生態系統間同步

#### **方案 D: 相片同步（替代方案）**
```
PC 照片資料夾 → FileProvider App 的相片資料夾
           ↓
使用者在 Files App 中檢視
           ↓
複製到 Photo Library (使用者動作) / 或建立自訂 Gallery App
```

**優勢**:
- ✅ 迴避 PHAsset 唯讀限制
- ✅ 使用者可控制何時匯入

**限制**:
- ❌ 需使用者手動操作
- ❌ 不是自動同步

**推薦使用**: 相片備份和分級查看

### 6.3 不可行的方案

❌ **直接寫入 Photo Library**
- iOS PHAsset API 不允許外部寫入
- 無workaround 方案

❌ **直接寫入應用程式的 Documents**
- 沙盒隔離，無法跨應用寫入

❌ **背景檔案推送（無使用者互動）**
- iOS 背景執行被嚴格限制
- 無法自主進行 I/O 操作

---

## 7. 實作建議

### 7.1 推薦架構

對於「PC 到 iPhone 雙向同步」，建議採用混合架構：

```
┌─────────────────────────────────────────────────┐
│              PC 端 (Windows/Mac)                 │
│  ┌──────────────────────────────────────────┐  │
│  │ 同步客戶端 (Local Sync Service)          │  │
│  │ - 監控檔案變更                           │  │
│  │ - 提供 REST API / WebSocket              │  │
│  └──────────────────┬───────────────────────┘  │
└─────────────────────┼──────────────────────────┘
                      │ (WiFi / USB)
┌─────────────────────┼──────────────────────────┐
│              iPhone 端                          │
│  ┌──────────────────▼───────────────────────┐  │
│  │ FileProvider App (推薦)                  │  │
│  │ - 連接 PC 同步服務                       │  │
│  │ - 在 Files App 中顯示檔案樹              │  │
│  │ - 支援拖放到其他應用                     │  │
│  └──────────────────┬───────────────────────┘  │
│                     │                          │
│  ┌──────────────────▼───────────────────────┐  │
│  │ 相片管理模組（可選）                     │  │
│  │ - 獨立 Gallery App（自建）               │  │
│  │ - 或透過 Files App 複製到 Photo Library │  │
│  └──────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### 7.2 推薦優先順序

1. **第一階段**: FileProvider 文件同步
   - 最小化 iOS 複雜度
   - 利用系統內建 Files App
   - 可支援拖放到其他應用

2. **第二階段**: 相片同步（Gallery App）
   - 建立獨立相片查看應用
   - 迴避 PHAsset 限制
   - 提供更好的使用者體驗

3. **第三階段**: 背景同步 + CloudKit
   - 加入 iCloud 同步選項
   - 自動同步已授權檔案

### 7.3 成果交付物

| 元件 | 技術選擇 | 備註 |
|-----|--------|------|
| **PC 同步服務** | Node.js / Rust (Tauri) | 監控、API、WebSocket |
| **iPhone FileProvider App** | Swift + FileProvider API | iOS 16+ 支援 |
| **相片管理** | Swift UIKit/SwiftUI | 自建 Gallery 或第三方方案 |
| **背景同步** | URLSession + CloudKit | 可選，取決於 UX 需求 |

---

## 8. 參考資源與來源

### 官方文件
- [File System Basics - Apple Developer](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/FileSystemOverview/FileSystemOverview.html)
- [File Provider - Apple Developer Documentation](https://developer.apple.com/documentation/fileprovider)
- [Security of Runtime Process - Apple Support](https://support.apple.com/guide/security/security-of-runtime-process-sec15bfe098e/web)
- [Protecting user data with App Sandbox - Apple Developer](https://developer.apple.com/documentation/security/protecting-user-data-with-app-sandbox)
- [App Extension Programming Guide: Document Provider](https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/FileProvider.html)

### 技術文章 & 教學
- [iOS File Provider Extension Tutorial - Kodeco](https://www.kodeco.com/697468-ios-file-provider-extension-tutorial)
- [Bring desktop class sync to iOS with FileProvider - WWDC 2022](https://developer.apple.com/videos/play/tech-talks/10067/)
- [Reading iOS Sandbox Profiles - 8kSec](https://8ksec.io/reading-ios-sandbox-profiles/)
- [iOS File System Guide - shawnbaek.com](https://shawnbaek.com/2024/03/31/ios-file-system/)

### 工具 & 第三方方案
- [GitHub: FileProvider (Swift)](https://github.com/amosavian/FileProvider)
- [PhotoSync - Transfer photos App](https://www.photosync-app.com/home)
- [Synology Drive - iOS File Sync](https://techdirectarchive.com/2024/10/17/sync-file-and-photos-from-ios-and-mac-with-synology-drive/)

### 社群討論
- [Apple Developer Forums - File Provider](https://developer.apple.com/forums/tags/fileprovider)
- [UIDocumentPickerViewController - Hacking with Swift Forums](https://www.hackingwithswift.com/forums/ios/uidocumentviewcontroller-stopaccessingsecurityscopedresource/1250)

---

## 9. 更新紀錄

| 日期 | 版本 | 變更 |
|-----|------|------|
| 2025-03-10 | 1.0 | 初稿完成，涵蓋 iOS 16-18 沙盒限制和檔案同步方案 |

---

## 附錄 A: Security-Scoped URLs 說明

當使用 UIDocumentPickerViewController 或 UIDirectoryPickerViewController 時，使用者選擇的檔案會以 **Security-Scoped URL** 的形式返回。這些 URL 是臨時授權令牌：

```swift
// ✅ 開始存取（必須）
url.startAccessingSecurityScopedResource()

// 讀寫檔案
let data = try Data(contentsOf: url)

// ❌ 結束存取（必須）
url.stopAccessingSecurityScopedResource()
```

**關鍵點**:
- Security-Scoped URL 只在應用程式運行期間有效
- 退出應用後權限自動失效
- 若要持久化存取，需使用 **Security-Scoped Bookmark**：

```swift
let bookmark = try url.bookmarkData(
    options: .withSecurityScope,
    includingResourceValuesForKeys: nil,
    relativeTo: nil
)
// 儲存 bookmark 到檔案，下次啟動時可恢復 URL
```

---

## 附錄 B: FileProvider 最佳實務

### B.1 檔案協調 (File Coordination)

所有檔案讀寫必須使用 NSFileCoordinator：

```swift
let coordinator = NSFileCoordinator()
coordinator.purposeIdentifier = providerIdentifier

var error: NSError?
coordinator.coordinateReadingItem(at: url, options: [], error: &error) { readURL in
    let data = try Data(contentsOf: readURL)
}
```

### B.2 預留佔位符 (Placeholders)

FileProvider 使用預留佔位符代表遠端檔案，按需下載：

```swift
override func providePlaceholder(at url: URL, completionHandler: @escaping (Error?) -> Void) {
    // 建立輕量級預留佔位符
    let attributes = NSFileProviderExtension.attributesForItem(withIdentifier:)
    do {
        try FileManager.default.createFile(atPath: url.path, contents: nil, attributes: attributes)
        completionHandler(nil)
    } catch {
        completionHandler(error)
    }
}

override func startProvidingItem(at url: URL, completionHandler: @escaping (Error?) -> Void) {
    // 實際下載遠端檔案
    downloadRemoteFile(url: remoteURL) { localData, error in
        if let data = localData {
            try data.write(to: url)
        }
        completionHandler(error)
    }
}
```

### B.3 推送通知 (PushKit)

使用 PushKit 通知系統檔案變更：

```swift
let pushRegistry = PKPushRegistry(queue: .main)
pushRegistry.delegate = self
pushRegistry.desiredPushTypes = Set([PKPushType.fileProvider])

// 伺服器發送格式:
// {
//   "aps": { "alert": { "body": "" } },
//   "container-identifier": "NSFileProviderWorkingSetContainerItemIdentifier",
//   "domain": "<domain-identifier>"
// }
// Topic: "<app-identifier>.pushkit.fileprovider"
```

---

本文檔為 PC 到 iPhone 同步專案的 iOS 沙盒限制研究成果。如需進一步討論特定技術實作，請參考附錄中的官方文件連結。
