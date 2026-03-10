# System Diagrams

**專案**: Windows Auto Backup MVP
**更新**: 2026-03-10

---

## 1. 系統架構圖

```
┌─────────────────────────────────────────────────────────────────┐
│                        Electron App                             │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Main Process (Node.js)                │   │
│  │                                                          │   │
│  │  main/index.ts (Bootstrap)                               │   │
│  │  ├── setAppUserModelId()                                 │   │
│  │  ├── createWindow()                                      │   │
│  │  ├── createTray()          ← tray.ts [全域變數]          │   │
│  │  ├── initBonjour()         ← bonjour [全域變數]          │   │
│  │  ├── initStores()                                        │   │
│  │  └── setupIpcHandlers()    ← ipc-handlers.ts            │   │
│  │                                                          │   │
│  │  Services/                                               │   │
│  │  ├── DeviceScanner                                       │   │
│  │  │   ├── bonjour-service (_companion-link._tcp)          │   │
│  │  │   ├── 被動監聽 + browser.update() 主動 query (60s)   │   │
│  │  │   ├── 30s debounce                                    │   │
│  │  │   └── TCP ping port 62078 (手動配對裝置)              │   │
│  │  ├── NotificationService                                 │   │
│  │  │   ├── Electron Notification API                       │   │
│  │  │   ├── Set<Notification> [GC 防護]                     │   │
│  │  │   └── setAlwaysOnTop workaround                       │   │
│  │  ├── BackupManager (interface)                           │   │
│  │  │   └── MockBackupManager (MVP)                         │   │
│  │  ├── SettingsStore         ← electron-conf               │   │
│  │  └── BackupHistoryStore    ← electron-conf               │   │
│  │       └── BackupHistoryRepository (interface)            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                           │  IPC Bridge                         │
│                    ┌──────┴──────┐                              │
│                    │  Preload    │  contextBridge               │
│                    │  index.ts   │  @electron-toolkit/preload   │
│                    └──────┬──────┘                              │
│                           │  @electron-toolkit/typed-ipc        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                 Renderer Process (React)                 │   │
│  │                                                          │   │
│  │  App.tsx (Router)                                        │   │
│  │  ├── /           → Dashboard.tsx                         │   │
│  │  ├── /settings   → Settings.tsx                          │   │
│  │  └── /history    → History.tsx                           │   │
│  │                                                          │   │
│  │  Stores/ (Zustand)                                       │   │
│  │  ├── app-store.ts    (devices, backupStatus, mdnsAvail)  │   │
│  │  └── settings-store.ts (backupPath, pairedDevices[])    │   │
│  │       └─ pairedDevice { name, ip, isOnline,            │   │
│  │            syncDirection, syncTypes?: SyncFileType[] }  │   │
│  │                                                          │   │
│  │  Components/                                             │   │
│  │  ├── BackupProgress, PathPicker                          │   │
│  │  ├── DeviceList, ManualDeviceInput                       │   │
│  │  └── UI (Button, Card, Badge, Progress, Input)           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────┐    ┌──────────────────────────────────────┐   │
│  │  System Tray │    │        electron-conf (JSON)          │   │
│  │  右鍵選單    │    │  settings.json  backup-history.json  │   │
│  └──────────────┘    └──────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
         │  mDNS / UDP 5353              │  Windows API
         ▼                              ▼
    iPhone (WiFi)              Windows Notification
```

---

## 2. 核心流程圖

### Happy Path：iPhone 回家自動備份

```
iPhone 連上 WiFi
    │
    ▼
DeviceScanner
    ├── 被動監聽 _companion-link._tcp
    └── 主動 browser.update() 每 60s
    │
    ▼
命中已配對裝置？
    ├── No  → 忽略
    └── Yes → 啟動 30s debounce timer
                │
                ├── 30s 內離線 → 取消，不通知
                └── 30s 穩定  → device-stable-online 事件
                                    │
                                    ▼
                            NotificationService
                            發送 Windows 系統通知
                            「iPhone 已連線 — 點擊開始備份」
                                    │
                    ┌───────────────┴──────────────┐
                    │ 點擊通知                      │ 忽略通知
                    ▼                              ▼
              win.show()                     不再重複通知
              setAlwaysOnTop workaround      同一次上線只通知一次
                    │
                    ▼
             驗證備份路徑存在？
                    ├── No  → Dashboard 顯示錯誤提示
                    └── Yes → MockBackupManager.startBackup()
                                    │
                                    ▼
                            IPC push backup-progress
                            0% → 50% → 100%
                                    │
                                    ▼
                            backup-complete
                            BackupHistoryStore.add()
                            Dashboard 切回「待命」
```

### mDNS 不可用 Flow

```
App 啟動
    │
    ▼
mDNS 自我檢測 (5s)
    ├── 成功 → 正常監聽模式
    └── 失敗 → mdnsAvailable = false
                    │
                    ▼
             Dashboard 黃色警告 Banner
             「自動偵測不可用，請手動新增裝置」
                    │
                    ▼
             使用者 → Settings → 手動 IP 輸入
             TCP 探測 port 62078
             加入已配對裝置
                    │
                    ▼
             定期 TCP ping (每 60s)
             偵測到上線 → device-found IPC push
                    │
                    ▼
             Dashboard「立即備份」按鈕 (手動觸發)
```

### App 生命週期 Flow

```
啟動 → setAppUserModelId → whenReady
    → createWindow → createTray (全域)
    → initBonjour (全域) → initStores → setupIpcHandlers
    │
    ├── 視窗關閉 X → win.hide() (isQuitting=false)
    │                Tray 繼續常駐，偵測繼續
    │
    ├── 雙擊 Tray  → win.show() → get-current-state IPC
    │                initializeStores() → setupIpcListeners()
    │
    └── 右鍵退出   → isQuitting=true → bonjour.destroy()
                    → app.quit()
```

---

## 3. 前後端分布圖

```
┌─────────────────────────────────────────────────────────────────┐
│  MAIN PROCESS（後端）                     Node.js 環境          │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  【擁有的能力】                                                  │
│  ✦ 檔案系統存取 (fs)           ✦ 網路原生 Socket (TCP/UDP)      │
│  ✦ electron-conf 讀寫          ✦ mDNS/Bonjour 監聽              │
│  ✦ 系統通知發送                ✦ dialog.showOpenDialog          │
│  ✦ app.setLoginItemSettings    ✦ shell.openPath                 │
│  ✦ BrowserWindow 控制          ✦ Tray 管理                      │
│                                                                 │
│  【負責的資料】                                                  │
│  Settings { backupPath, pairedDevices }  ← electron-conf       │
│  BackupRecord { id, time, device, fileCount, size,              │
│    direction, syncTypes? }               ← electron-conf       │
│  AppState { devices, status, mdnsAvail } ← 記憶體 (runtime)    │
│                                                                 │
└──────────────────────┬──────────────────────────────────────────┘
                       │
         @electron-toolkit/typed-ipc (17 channels)
                       │
         ┌─────────────┴──────────────┐
         │  renderer → main (invoke)  │  main → renderer (push)
         │  get-current-state         │  device-found
         │  get-settings              │  device-lost
         │  save-settings             │  backup-progress
         │  validate-path             │  backup-complete
         │  select-directory          │  mdns-status
         │  scan-devices              │
         │  pair-device               │
         │  unpair-device             │
         │  add-device-manual         │
         │  start-backup              │
         │  cancel-backup             │
         │  get-history               │
         └─────────────┬──────────────┘
                       │
┌──────────────────────┴──────────────────────────────────────────┐
│  RENDERER PROCESS（前端）                 Chromium 環境         │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  【Pages】                    【Components】                    │
│  /  Dashboard                 BackupProgress (進度條)           │
│  /settings  Settings          PathPicker (路徑選擇)             │
│  /history   History           DeviceList (裝置清單)             │
│                               ManualDeviceInput (手動 IP)       │
│                               UI 基礎元件 (Button/Card/Badge…)  │
│                                                                 │
│  【Zustand Stores】           【禁止直接存取】                   │
│  app-store                    ✗ fs (檔案系統)                   │
│  ├── devices[]                ✗ electron-conf                   │
│  ├── currentBackup            ✗ bonjour-service                 │
│  ├── status                   ✗ Notification API                │
│  └── mdnsAvailable            ✗ dialog                          │
│                                                                 │
│  settings-store               【只能透過 IPC 請求 main】        │
│  ├── backupPath                                                  │
│  └── pairedDevices[]                                            │
│       └─ { name, ip, isOnline,                                  │
│            syncDirection: SyncDirection,                         │
│            syncTypes?: SyncFileType[] }  ← Array (IPC 邊界)    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

【外部系統】
    iPhone ←──── mDNS/UDP 5353 ────── DeviceScanner
    Windows OS ← Notification API ─── NotificationService
    外接硬碟 ←── fs.existsSync ──────── BackupManager (Post-MVP)
```

---

## 4. 跨平台分層圖

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  ┌───────────────────── Shared Layer ────────────────────────┐  │
│  │  （Windows / macOS 共用，不需要 platform branch）          │  │
│  │                                                            │  │
│  │  React UI          Zustand Stores     IPC Type Map        │  │
│  │  ├ Dashboard.tsx    ├ app-store.ts     └ ipc-channels.ts  │  │
│  │  ├ Settings.tsx     └ settings-store.ts                    │  │
│  │  ├ History.tsx                                             │  │
│  │  └ Components/      BackupManager      bonjour-service    │  │
│  │    ├ BackupProgress  (interface)        (pure JS mDNS)    │  │
│  │    ├ PathPicker     BackupHistory                          │  │
│  │    ├ DeviceList      Repository        electron-conf      │  │
│  │    └ ManualDevice    (interface)        (JSON store)       │  │
│  │                                                            │  │
│  │  DeviceScanner 核心邏輯（debounce、配對比對、TCP ping）   │  │
│  │  shared/types.ts（Device, BackupJob, Settings, AppState） │  │
│  └────────────────────────────────────────────────────────────┘  │
│                           │                                      │
│  ┌───────────── Platform Branch Layer ───────────────────────┐  │
│  │  （需要 process.platform 條件分支）                        │  │
│  │                                                            │  │
│  │  ┌─────────────────┐         ┌─────────────────┐          │  │
│  │  │    win32         │         │    darwin        │          │  │
│  │  ├─────────────────┤         ├─────────────────┤          │  │
│  │  │ setAppUserModelId│         │ (不呼叫)        │          │  │
│  │  │ toastXml         │         │ (不支援)        │          │  │
│  │  │ setAlwaysOnTop   │         │ (不需要)        │          │  │
│  │  │  workaround      │         │                 │          │  │
│  │  │ Tray: double-    │         │ Tray: click     │          │  │
│  │  │  click 開啟      │         │  開啟           │          │  │
│  │  │ setContextMenu() │         │ popUpContext     │          │  │
│  │  │                  │         │  Menu()          │          │  │
│  │  │ setSkipTaskbar() │         │ app.dock.hide() │          │  │
│  │  │ (window-all-     │         │ app.on          │          │  │
│  │  │  closed: hide)   │         │  ('activate')   │          │  │
│  │  │ LoginItems:      │         │ LoginItems:     │          │  │
│  │  │  Registry        │         │  SMAppService   │          │  │
│  │  │ dialog:          │         │ dialog:         │          │  │
│  │  │  promptToCreate  │         │  createDirectory│          │  │
│  │  └─────────────────┘         └─────────────────┘          │  │
│  └────────────────────────────────────────────────────────────┘  │
│                           │                                      │
│  ┌───────────── Platform Exclusive Layer ────────────────────┐  │
│  │  （不共用，各平台獨立處理）                                │  │
│  │                                                            │  │
│  │  ┌─────────────────┐         ┌──────────────────────┐     │  │
│  │  │  Windows 專屬    │         │  macOS 專屬           │     │  │
│  │  ├─────────────────┤         ├──────────────────────┤     │  │
│  │  │ NSIS .exe        │         │ DMG .dmg             │     │  │
│  │  │ installer        │         │ + Notarization       │     │  │
│  │  │                  │         │ entitlements.plist    │     │  │
│  │  │ SmartScreen      │         │ Info.plist 擴展      │     │  │
│  │  │ (可接受)         │         │  NSLocalNetwork...   │     │  │
│  │  │                  │         │  NSBonjourServices   │     │  │
│  │  │ ICO 多尺寸       │         │ Template PNG 黑白    │     │  │
│  │  │ tray icon        │         │ tray icon            │     │  │
│  │  │                  │         │ Universal Binary     │     │  │
│  │  │ D:\Backup\       │         │ /Volumes/Drive/      │     │  │
│  │  │ iPhone           │         │ iPhone               │     │  │
│  │  └─────────────────┘         └──────────────────────┘     │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

程式碼佔比估算:
  Shared Layer        ≈ 70%  （MVP 完成後可直接共用）
  Platform Branch     ≈ 20%  （需加入 darwin 條件分支）
  Platform Exclusive  ≈ 10%  （macOS 需全新建立）
```

---

## 5. Shared Types 結構圖

> R10–R12 架構審查後確立的共用型別定義（`shared/types.ts`）

```
┌─────────────────────────────────────────────────────────────────┐
│  shared/types.ts                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  // 同步方向（R10 新增）                                         │
│  type SyncDirection =                                            │
│    | 'mobile-to-pc'    // MVP 支援                               │
│    | 'pc-to-mobile'    // Post-MVP（需 iOS App）                 │
│    | 'bidirectional'   // Post-MVP                               │
│                                                                  │
│  // 同步檔案類型（R10 新增）                                     │
│  type SyncFileType =                                             │
│    | 'photos' | 'videos' | 'screenshots'                         │
│    | 'documents' | 'music' | 'downloads'                         │
│                                                                  │
│  // 配對裝置（含 per-device 設定）                               │
│  interface PairedDevice {                                         │
│    name: string                                                   │
│    ip: string                                                     │
│    isOnline: boolean                                              │
│    syncDirection: SyncDirection   // 必填                         │
│    syncTypes?: SyncFileType[]     // undefined = 全部類型        │
│  }                                                                │
│                                                                  │
│  // 備份任務（IPC invoke payload）                               │
│  interface BackupTask {                                           │
│    deviceId: string                                               │
│    direction: SyncDirection       // 必填                         │
│    syncTypes?: SyncFileType[]     // optional（R12 決策）        │
│  }                                                                │
│                                                                  │
│  // 備份歷史記錄（R11 擴充）                                     │
│  interface BackupRecord {                                         │
│    id: string                                                     │
│    timestamp: number                                              │
│    deviceName: string                                             │
│    fileCount: number                                              │
│    totalSize: number                                              │
│    status: 'success' | 'error'                                   │
│    direction: SyncDirection       // R11 新增                     │
│    syncTypes?: SyncFileType[]     // R11 新增                     │
│    errorMessage?: string                                          │
│  }                                                                │
│                                                                  │
│  ⚠️ IPC 序列化規則（R11 P0）：                                   │
│     Set<SyncFileType> 禁止跨 IPC 傳遞                             │
│     → 必須在 IPC 邊界轉為 SyncFileType[]                         │
│     → Renderer 可在記憶體中用 Set，序列化時用 Array.from()        │
└─────────────────────────────────────────────────────────────────┘

關係圖：

  PairedDevice ──────────────────→ BackupTask
  (settings-store / UI state)      (IPC invoke payload)
       │                                │
       │ syncTypes?: SyncFileType[]     │ syncTypes?: SyncFileType[]
       │ syncDirection: SyncDirection   │ direction: SyncDirection (required)
       │                                │
       └──────────────────────→ BackupRecord
                                 (BackupHistoryStore)
                                 + status + fileCount + size
```

---

## 關聯文件

- 架構決策歷程 → [architecture-review.md](./architecture-review.md)
- 跨平台 ADR → [adr-cross-platform.md](./adr-cross-platform.md)
- 跨平台研究總索引 → [research/cross-platform/00-master-index.md](./research/cross-platform/00-master-index.md)
- 技術研究資料 → [research/master-index.md](./research/master-index.md)
- 完整 Spec → [../spec/20260310-windows-auto-backup-mvp/spec.md](../spec/20260310-windows-auto-backup-mvp/spec.md)
