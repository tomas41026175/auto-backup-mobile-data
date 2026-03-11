# Spec: Windows Auto Backup MVP

**Task**: Windows Electron 桌面應用，偵測 iPhone 連上同一 WiFi 後彈出系統通知，確認後備份照片/資料夾到外接硬碟
**Started**: 2026-03-10T00:00:00+08:00
**Phase**: planning
**Mode**: simple

---

## MVP 驗證假設

本 MVP 驗證的核心假設：

1. **「自動偵測 + 通知」的使用者體驗是否成立** -- 使用者是否覺得「iPhone 到家自動提醒備份」有用
2. **mDNS 偵測在 Windows 環境的可靠性** -- `bonjour-service` 能否穩定偵測 iPhone
3. **不驗證**：實際備份傳輸（MVP 為 mock）、iOS app 開發、跨平台支援

**開發前必做**：mDNS 實機驗證 -- 用 `bonjour-service` 在 Windows 上偵測 iPhone，測試以下場景：
- iPhone 螢幕鎖定後 mDNS 廣播是否持續（可能停止）
- iPhone 離開/重新加入 WiFi 的偵測延遲
- 多台 Apple 裝置同時在線的區分能力

---

## Decision Lock

- 技術棧：Electron + React + TypeScript + TailwindCSS v4（`@tailwindcss/vite` plugin）
- 構建工具：electron-vite（HMR 較好）
- 目錄結構：electron-vite 標準 -- `src/main/`、`src/preload/`、`src/renderer/`、`src/shared/`
- 平台：Windows（暫不考慮跨平台）
- 偵測方式：mDNS/Bonjour（`bonjour-service` 純 JS 套件），監聽 `_companion-link._tcp`（iPhone 不廣播 `_airplay._tcp`，不設備援；偵測失敗有手動 IP Plan B）
- mDNS 主動查詢：iPhone 螢幕鎖定後可能停止廣播，需加入定期主動 query 模式（每 60 秒，使用 `browser.update()` 重送 PTR 查詢）作為被動監聯的補充
- mDNS 自我檢測：啟動時驗證 mDNS 可用性，不可用時在 UI 顯示警告
- 通知方式：Windows 原生系統通知（Electron Notification API）
- 傳輸方向：每台已配對裝置獨立設定 syncDirection（`mobile-to-pc` | `pc-to-mobile` | `bidirectional`），MVP 僅實作 `mobile-to-pc`，其餘為 Post-MVP
- 同步檔案類型：每台裝置獨立設定 syncTypes（`photos` | `videos` | `screenshots` | `slowmo` | `documents` | `voice`），預設 `['photos', 'videos', 'screenshots']`
- PC → Mobile 方案（Post-MVP）：WiFi HTTP Server（PC 端）+ 配套 iOS App（URLSession + Document Provider），需獨立 iOS 開發工作，不在 MVP 範圍
- PC → Mobile Windows 依賴：AFC/USB 方案依賴 iTunes/AMDS，Windows 環境差異大；WiFi 方案受 iOS 背景限制，iPhone App 需在前景或使用 Background URLSession；選擇 WiFi HTTP 為 Post-MVP 路線
- 傳輸方式：MVP 階段用 mock 模擬，不做實際傳輸
- 備份路徑：使用者設定固定磁碟代號 + 子目錄（如 `D:\Backup\iPhone`），啟動備份前驗證路徑存在
- 資料儲存：`electron-conf`（取代 electron-store，ESM/CJS 皆支援，避免 electron-store v9+ 純 ESM 與 electron-vite CJS 衝突），僅限 main process 存取，renderer 透過 IPC
- iPhone 端：MVP 不開發 iOS app
- 常駐方式：System Tray icon
- IPC 通訊：`@electron-toolkit/typed-ipc` type map，集中定義於 `src/shared/ipc-channels.ts`
- 狀態管理：Zustand。main->renderer 用 `webContents.send` 推送，renderer->main 用 `ipcRenderer.invoke` 請求，視窗開啟時透過 `get-current-state` 同步初始狀態
- mDNS 防抖：裝置上線後 debounce 30 秒確認穩定才視為「在線」，每台裝置每次上線只發送一次通知
- 配對機制：偵測到的裝置列表中，使用者手動點擊「配對」綁定，僅已配對裝置觸發通知
- 手動新增裝置（Plan B）：Settings 頁面提供 IP 輸入欄位 + TCP 探測，當 mDNS 無法偵測時作為備援
- Main Process 結構：`main.ts` 負責 bootstrap（建構所有 service 實例並傳入），IPC handler 拆分至 `src/main/ipc-handlers.ts`
- 測試框架：Vitest（v3.x，使用 `test.projects` 分離 main/renderer 測試環境）
- GC 防護規範：Tray 必須模組層級全域變數；Notification 物件保存至 `Set<Notification>` 防 GC 回收 click 事件；Bonjour 實例全域宣告 + `app.on('before-quit')` 呼叫 `destroy()`
- 初始化順序（Main Process）：`app.setAppUserModelId()` -> `app.whenReady()` -> `createWindow()` -> `createTray()` -> `initBonjour()` -> `initStores()` -> `setupIpcHandlers()`
- 初始化順序（Renderer）：`initializeStores()`（IPC invoke 同步初始狀態）-> `setupIpcListeners()`（建立 push 監聽）-> render UI
- AppUserModelId：開發環境 `app.setAppUserModelId(process.execPath)`，生產環境使用 `com.autobackup.app`，必須在 `app.whenReady()` 之前呼叫
- Windows 通知焦點 workaround：通知點擊 handler 中 `win.setAlwaysOnTop(true)` -> `win.focus()` -> `win.setAlwaysOnTop(false)`
- IPC type map 結構：使用 union 型別分拆 listener map 和 handler map（`@electron-toolkit/typed-ipc` 要求）
- Zustand 版本約束：v5.x，物件 selector 必須用 `useShallow` 包裝，否則拋 "Maximum update depth exceeded"
- Renderer IPC listener cleanup：所有 `on()` 返回的 unsubscribe 函式必須在 useEffect cleanup 中呼叫
- electron-builder 打包：`bonjour-service` 為純 JS 套件，不需 `asarUnpack` 或 `electron-rebuild`

## Non-Goals

以下明確不在 MVP 範圍內，避免 scope creep：

- **Auto-update**：MVP 不做自動更新機制
- **Code signing**：MVP 不做程式碼簽章（接受 Windows SmartScreen 警告）
- **E2E 測試**：僅做 unit + integration 測試
- **離線恢復**：MVP 備份為 mock，不存在真實中斷恢復場景
- **electron-conf 資料損壞恢復**：機率極低，延後處理
- **iOS app 開發**：PC → Mobile 需配套 iOS App（Document Provider Extension + URLSession），這是獨立工作量（2-3 週 MVP），需 App Store 審核（3-5 天），延後到 Windows MVP 驗證後再啟動
- **跨平台支援**：MVP 僅 Windows。macOS 版本為 Post-MVP，架構已預留 `process.platform` guard 空間（詳見 `docs/adr-cross-platform.md`）。macOS 公開發佈需要 Apple Developer 帳號（$99/年）+ Code Signing + Notarization
- **PC → Mobile 雙向同步**：Post-MVP，需 iOS 配套 App + PC 端 HTTP Server，研究已完成（見 `docs/research/pc-to-mobile/`）
- **實際檔案傳輸**：備份流程全部 mock

## Architecture Review Notes

- ~~ARP 掃描~~ -> mDNS/Bonjour（iOS 14+ 私人 WiFi 地址導致 MAC 隨機化，ARP 方案失效）
- ~~SQLite~~ -> electron-store JSON（MVP 資料量不需要資料庫，減少 native binding 打包問題）
- ~~DI 框架~~ -> 手動建構注入（MVP 只有 3-4 個 service，不需要 DI container）
- ~~離線中斷恢復~~ -> MVP 備份為 mock，不需要中斷恢復機制
- ~~mDNS 健康檢查~~ -> 簡化為啟動時自我檢測，不做持續健康檢查
- ~~electron-store 損壞恢復~~ -> MVP 不做，機率極低
- ~~`_apple-mobdev2._tcp`~~ -> `_companion-link._tcp`（僅此一個，iPhone 不廣播 `_airplay._tcp`，偵測失敗有手動 IP Plan B）
- ~~`electron/` + `shared/` + `src/` 平鋪~~ -> electron-vite 標準目錄 `src/main/`、`src/preload/`、`src/renderer/`、`src/shared/`
- ~~8 個 Task~~ -> 合併為 5 個 Task，每個 Task 有可 demo 的產出
- ~~原生 IPC channel 字串~~ -> `@electron-toolkit/typed-ipc` type map，型別安全
- ~~electron-store 直接在 renderer 存取~~ -> 僅限 main process，renderer 透過 IPC
- ~~electron-store~~ -> `electron-conf`（electron-store v9+ 純 ESM 與 electron-vite CJS 衝突，改用 electron-conf）
- ~~`_airplay._tcp` 備援~~ -> 移除（iPhone 不廣播此服務，R6 研究確認）
- BackupManager 定義 interface，方便未來接真實傳輸
- BackupHistoryRepository interface 抽象，未來需要 SQLite 時替換實作即可
- `BackupManager` interface 擴充預留：interface 加入 `direction: SyncDirection` 參數（透過 `BackupTask` 物件），型別定義於 `src/shared/types.ts`，MockBackupManager 只實作 `mobile-to-pc`，介面已準備好未來接 `pc-to-mobile` 實作
- per-device 設定結構：settings-store 的 `PairedDevice` 物件加入 `syncDirection: SyncDirection` 和 `syncTypes: SyncFileType[]` 欄位，統一定義於 `src/shared/types.ts`
- 序列化邊界規則：Store 層（electron-conf）和 IPC 傳輸統一使用 `SyncFileType[]`（Array）；Renderer 端 Zustand store 內部可轉為 `Set<SyncFileType>` 方便 UI 操作，但進出 IPC 邊界必須轉回 Array（`Set` 無法 JSON.stringify）
- `BackupRecord` 新增 `syncTypes: SyncFileType[]` 和 `direction: SyncDirection` 欄位，記錄每次備份的檔案類型和方向；MVP History 頁面不做按 syncTypes 篩選

---

## Acceptance Criteria

- [ ] App 啟動後常駐 System Tray，雙擊開啟主視窗 -- verify: 手動啟動 app，確認 tray icon 出現，雙擊可開啟視窗
- [ ] 背景 mDNS 監聽（被動 + 主動 query），偵測到已配對 iPhone 時彈出 Windows 系統通知（30 秒 debounce 後） -- verify: 連接 iPhone 到同一 WiFi，等待 30 秒後觀察通知；短暫斷線重連不重複通知
- [ ] 點擊通知後開啟主視窗顯示備份進度（mock） -- verify: 點擊通知後觀察 UI 狀態變化為「備份中」
- [ ] 首次使用可掃描區網裝置並配對 iPhone -- verify: 開啟設定頁，點擊「掃描裝置」，從列表中配對一台裝置，重啟後配對保留
- [ ] Settings 頁面可設定備份路徑（含路徑存在驗證）及手動輸入 IP 新增裝置 -- verify: 設定不存在的路徑時顯示錯誤提示；手動輸入 IP 後 TCP 探測成功可新增裝置
- [ ] Dashboard 顯示目前狀態（待命/掃描中/備份中）及 mDNS 可用性狀態 -- verify: 各狀態間切換 UI 正確反映；mDNS 不可用時顯示警告
- [ ] 備份歷史頁面顯示 mock 備份紀錄 -- verify: 查看歷史頁有模擬資料
- [ ] 視窗關閉後 app 繼續常駐 tray，不退出 -- verify: 關閉視窗後 tray icon 仍在，mDNS 偵測仍運作

---

## 工作流程驗證

### Flow 1: 首次安裝與設定（Onboarding）

```
使用者雙擊 .exe installer
  → 安裝完成，app 自動啟動
  → 主視窗開啟，Dashboard 顯示「尚未設定」狀態
  → 使用者導航至 Settings
  → [1a] 設定備份路徑
  │   → 點擊「選擇資料夾」→ dialog.showOpenDialog
  │   → 選擇 D:\Backup\iPhone → 路徑驗證通過 → 儲存成功 ✓
  │   → [1a-err] 選擇不存在的路徑 → 紅字錯誤提示 ✓
  │   → [1a-err] 外接硬碟未掛載（D:\ 不存在）→ 路徑驗證失敗 → 錯誤提示 ✓
  → [1b] 配對裝置（mDNS 可用時）
  │   → 點擊「掃描裝置」
  │   → DeviceList 顯示偵測到的 Apple 裝置（名稱 + IP）
  │   → 使用者辨識自己的 iPhone → 點擊「配對」→ 裝置移至已配對列表 ✓
  │   → [1b-err] 掃描 5 秒無結果 → 顯示「未偵測到裝置」提示 ✓
  → [1c] 配對裝置（mDNS 不可用時 — Plan B）
  │   → mDNS 狀態指示為黃色/紅色
  │   → 使用者在「手動新增」欄位輸入 iPhone IP（如 192.168.1.50）
  │   → 點擊「探測」→ TCP port 探測 → 確認為 Apple 裝置 → 新增成功 ✓
  │   → [1c-err] IP 格式錯誤 → 輸入驗證紅字 ✓
  │   → [1c-err] TCP 探測失敗（IP 不是 iPhone）→ 錯誤提示 ✓
  → 使用者關閉視窗 → app 最小化到 Tray（不退出）✓
```

**涉及 Task**: T1（Tray）、T2（mDNS、settings-store）、T3（Settings UI）
**涉及 AC**: #1, #4, #5, #6, #8

### Flow 2: 自動偵測與備份（核心 Happy Path）

```
app 已常駐 Tray，已有已配對裝置，備份路徑已設定
  → iPhone 連上同一 WiFi
  → mDNS 被動監聽收到 _companion-link._tcp 廣播
  │   → [或] 主動 query（每 60 秒）收到回應
  → DeviceScanner 比對已配對裝置清單 → 命中
  → 啟動 30 秒 debounce timer
  → [2a] 30 秒內 iPhone 未離線
  │   → 觸發 device-stable-online 事件
  │   → NotificationService 發送 Windows 系統通知
  │     「iPhone 已連線 — 點擊開始備份」
  │   → [2a-1] 使用者點擊通知
  │   │   → 主視窗開啟/顯示 → Dashboard 切換為「備份中」
  │   │   → BackupManager.startBackup() → 先驗證路徑存在
  │   │   → MockBackupManager 模擬進度 0% → 50% → 100%
  │   │   → IPC push 進度更新 → Dashboard 進度條即時更新
  │   │   → 備份完成 → 狀態切回「待命」
  │   │   → backup-history-store 寫入一筆記錄 ✓
  │   → [2a-2] 使用者忽略通知（不點擊）
  │   │   → 不再重複通知（同一次上線只通知一次）
  │   │   → app 持續 Tray 常駐 ✓
  │   → [2a-3] 使用者點擊通知但路徑不存在
  │   │   → BackupManager 驗證路徑 → 失敗
  │   │   → Dashboard 顯示錯誤「備份路徑不可用，請至設定頁重新選擇」✓
  → [2b] 30 秒內 iPhone 離線（mDNS 抖動）
  │   → debounce timer 取消 → 不觸發通知 ✓
  → [2c] iPhone 離線後再次上線
  │   → 重新啟動 debounce → 穩定後再次通知（新一輪）✓
```

**涉及 Task**: T2（偵測、通知、備份）、T4（Dashboard UI）
**涉及 AC**: #2, #3, #6, #7

### Flow 3: iPhone 螢幕鎖定場景

```
iPhone 已連上 WiFi 且螢幕亮著
  → mDNS 被動監聯正常接收廣播 ✓
  → iPhone 螢幕鎖定
  → [3a] iOS 停止/降低 mDNS 廣播
  │   → 被動監聽可能標記為離線
  │   → 但主動 query（每 60 秒）仍可能得到回應
  │   → [3a-1] 主動 query 有回應 → 裝置維持在線 ✓
  │   → [3a-2] 主動 query 也無回應 → 標記離線
  │     → 使用者解鎖 iPhone → 重新廣播 → 重新觸發偵測流程 ✓
  → [3b] iOS 繼續廣播（部分版本）
  │   → 一切正常 ✓
```

**涉及 Task**: T2（device-scanner 主動 query）
**涉及 AC**: #2

### Flow 4: mDNS 完全不可用

```
app 啟動
  → mDNS 自我檢測開始
  → 5 秒內未收到自我廣播的回應
  → 標記 mdnsAvailable = false
  → Dashboard 顯示 mDNS 狀態指示器為警告
    「自動偵測不可用，請手動新增裝置或檢查防火牆」
  → 使用者導航至 Settings
  → 使用手動 IP 輸入配對裝置 ✓
  → [4a] 即使 mDNS 不可用，手動配對的裝置仍可觸發備份嗎？
  │   → 否。mDNS 不可用意味著無法自動偵測上線。
  │   → 使用者需從 Dashboard 手動點擊「立即備份」按鈕觸發 ✓
  │   → 或從 Tray 右鍵選單「立即備份」觸發 ✓
```

**涉及 Task**: T2（mDNS 自我檢測）、T3（手動 IP）、T4（Dashboard 手動觸發）
**涉及 AC**: #5, #6
**發現的 spec 缺口**: Dashboard 和 Tray 需要「手動觸發備份」按鈕（mDNS 不可用時的備援操作）

### Flow 5: 多台 Apple 裝置同時在線

```
區網內有 iPhone（已配對）+ MacBook（未配對）+ iPad（未配對）
  → DeviceScanner 偵測到 3 台 Apple 裝置
  → 比對已配對清單 → 僅 iPhone 命中
  → 只對 iPhone 發送通知 ✓
  → Settings 掃描列表顯示全部 3 台（可供配對）✓
```

**涉及 Task**: T2（配對過濾）、T3（DeviceList）
**涉及 AC**: #2, #4

### Flow 6: 日常使用（非首次）

```
使用者每天回家
  → iPhone 自動連上家裡 WiFi
  → app 常駐 Tray → 偵測到 → 通知
  → 使用者點擊 → mock 備份 → 完成
  → 使用者查看 History 頁面 → 看到今天的備份紀錄
  → 使用者查看之前的備份紀錄列表 ✓
```

**涉及 Task**: T2, T4
**涉及 AC**: #2, #3, #7

### Flow 7: App 生命週期

```
[7a] 正常關閉
  → Tray 右鍵 →「退出」→ app 完全關閉 ✓

[7b] 視窗關閉
  → 點擊視窗 X → win.hide() → Tray 繼續常駐 → 偵測繼續 ✓

[7c] 系統重啟
  → 若使用者勾選「開機自動啟動」→ app 自動啟動 → Tray 常駐 ✓
  → 未勾選 → 需手動啟動 ✓

[7d] 雙擊 Tray icon
  → 主視窗顯示 / 從隱藏恢復 → Dashboard 透過 get-current-state 同步最新狀態 ✓

[7e] 視窗開啟時 mDNS 偵測到裝置
  → main push IPC 事件 → Zustand store 即時更新 → UI 即時反映 ✓
```

**涉及 Task**: T1（Tray）、T4（Dashboard 狀態同步）
**涉及 AC**: #1, #8

---

### 工作流程驗證結果

#### 覆蓋率

| AC | 被流程覆蓋 |
|----|-----------|
| #1 Tray 常駐 | Flow 1, 7 |
| #2 mDNS 偵測 + 通知 | Flow 2, 3, 5, 6 |
| #3 點擊通知觸發備份 | Flow 2, 6 |
| #4 掃描配對 | Flow 1, 5 |
| #5 Settings 路徑 + 手動 IP | Flow 1, 4 |
| #6 Dashboard 狀態 | Flow 2, 4, 6 |
| #7 備份歷史 | Flow 2, 6 |
| #8 視窗關閉常駐 | Flow 1, 7 |

全部 8 條 AC 均被至少 2 個流程覆蓋 ✓

#### 發現的 Spec 缺口（已修復）

| # | 缺口 | 來源 | 修復方式 | 影響 Task |
|---|------|------|---------|----------|
| G1 | Dashboard 和 Tray 缺少「手動觸發備份」按鈕 | Flow 4 | Dashboard 加「立即備份」按鈕 + Tray 右鍵選單加「立即備份」 | T1, T4 |
| G2 | 掃描逾時行為未定義 | Flow 1 | 掃描 10 秒後無結果 → 顯示「未偵測到裝置，試試手動輸入」 | T3 |
| G3 | 首次啟動引導缺失 | Flow 1 | Dashboard 未設定狀態顯示 Setup Banner → 導向 Settings | T4 |
| G4 | mDNS 不可用 + 手動配對裝置無法自動偵測 | Flow 4 | 手動配對裝置透過定期 TCP ping 檢測上線（每 60 秒） | T2 |

---

### 使用者操作 → 工作項目對照矩陣

| 使用者操作 | 觸發元件 | Main Process | IPC Channel | Renderer | Task |
|-----------|---------|-------------|-------------|----------|------|
| 啟動 app | — | main/index.ts bootstrap | — | — | T1 |
| 看到 Tray icon | — | tray.ts 建立 Tray | — | — | T1 |
| 右鍵 Tray → 開啟設定 | tray.ts | win.show() | — | App.tsx → Settings | T1 |
| 右鍵 Tray → 立即掃描 | tray.ts | device-scanner.scan() | `scan-devices` | DeviceList 更新 | T1, T2 |
| 右鍵 Tray → 立即備份 | tray.ts | backup-manager.startBackup() | `start-backup` | Dashboard 進度更新 | T1, T2, T4 |
| 右鍵 Tray → 退出 | tray.ts | app.quit() | — | — | T1 |
| 雙擊 Tray | tray.ts | win.show() | `get-current-state` | app-store 同步 | T1, T4 |
| 關閉視窗 X | BrowserWindow | event.preventDefault() + win.hide() | — | — | T1 |
| 首次開啟 → 看到 Setup Banner | — | — | `get-settings` | Dashboard → Banner → 導向 Settings | T4 |
| 點擊「選擇備份路徑」 | PathPicker | dialog.showOpenDialog | `save-settings` | 路徑顯示 | T3 |
| 輸入不存在的路徑 | PathPicker | fs.existsSync → false | `validate-path` | 紅字錯誤提示 | T3 |
| 點擊「掃描裝置」 | DeviceList | device-scanner.scan() | `scan-devices` | 裝置列表更新 | T2, T3 |
| 掃描 10 秒無結果 | DeviceList | timeout | `scan-devices` (timeout) | 「未偵測到裝置」提示 | T3 |
| 點擊裝置「配對」 | DeviceList | settings-store.addPairedDevice() | `pair-device` | 移至已配對列表 | T2, T3 |
| 點擊裝置「取消配對」 | DeviceList | settings-store.removePairedDevice() | `unpair-device` | 移回可用列表 | T2, T3 |
| 手動輸入 IP → 探測 | ManualDeviceInput | net.connect(ip, 62078) | `add-device-manual` | 成功/失敗回饋 | T2, T3 |
| iPhone 連上 WiFi | — | device-scanner 偵測 | `device-found` (push) | app-store 更新 | T2 |
| 30 秒 debounce 穩定 | — | device-scanner → notification-service | — (內部事件) | — | T2 |
| Windows 通知彈出 | — | Notification API | — | — | T2 |
| 點擊通知 | — | win.show() + backup-manager.start() | `backup-progress` (push) | Dashboard 切為備份中 | T2, T4 |
| Dashboard 點擊「立即備份」 | Dashboard | backup-manager.startBackup() | `start-backup` | 進度條開始 | T2, T4 |
| 備份進行中 | BackupProgress | MockBackupManager emit progress | `backup-progress` (push) | 進度條更新 | T2, T4 |
| 備份完成 | — | backup-history-store.add() | `backup-complete` (push) | 狀態切回待命 | T2, T4 |
| 查看備份歷史 | — | backup-history-store.getAll() | `get-history` | History 列表 | T2, T4 |
| mDNS 不可用 → 警告 | Dashboard | device-scanner 自我檢測 | `get-current-state` | 黃色警告 Banner | T2, T4 |
| 手動配對裝置定期 TCP ping | — | device-scanner.pingManualDevices() | `device-found` (push) | app-store 更新 | T2 |

### IPC Channel 完整清單

| Channel | 方向 | 觸發者 | Payload | 用途 |
|---------|------|--------|---------|------|
| `get-current-state` | renderer → main | Store 初始化 / 視窗開啟 | → `AppState` | 同步完整狀態快照 |
| `get-settings` | renderer → main | Settings 頁面載入 | → `Settings` | 讀取設定 |
| `save-settings` | renderer → main | Settings 儲存 | `Partial<Settings>` → `Settings` | 寫入設定 |
| `validate-path` | renderer → main | 路徑選擇後 | `string` → `boolean` | 驗證路徑存在 |
| `scan-devices` | renderer → main | 掃描按鈕 / Tray | → `Device[]` | 觸發 mDNS 掃描並回傳結果 |
| `pair-device` | renderer → main | 配對按鈕 | `Device` → `void` | 配對裝置 |
| `unpair-device` | renderer → main | 取消配對 | `string`(deviceId) → `void` | 取消配對 |
| `add-device-manual` | renderer → main | 手動 IP 輸入 | `string`(ip) → `Device \| null` | TCP 探測 + 新增裝置 |
| `update-device-config` | renderer → main | 裝置設定變更 | `{ deviceId: string, syncDirection?: SyncDirection, syncTypes?: SyncFileType[] }` → `void` | 更新裝置的 syncDirection / syncTypes（Post-MVP 啟用） |
| `start-backup` | renderer → main | 立即備份按鈕 | `string`(deviceId) → `void` | 啟動備份 |
| `cancel-backup` | renderer → main | 取消備份按鈕 | → `void` | 取消備份 |
| `get-history` | renderer → main | History 頁面載入 | → `BackupRecord[]` | 讀取備份歷史 |
| `device-found` | main → renderer | mDNS 偵測 / TCP ping | `Device` | 裝置上線推送 |
| `device-lost` | main → renderer | mDNS 離線 | `string`(deviceId) | 裝置離線推送 |
| `backup-progress` | main → renderer | MockBackupManager | `BackupJob` | 備份進度推送 |
| `backup-complete` | main → renderer | 備份完成 | `BackupRecord` | 備份完成推送 |
| `mdns-status` | main → renderer | mDNS 自我檢測 | `boolean` | mDNS 可用性狀態推送 |

---

## Shared Types（src/shared/types.ts）

```typescript
// === 雙向同步型別（R10 新增）===

export type SyncDirection = 'mobile-to-pc' | 'pc-to-mobile' | 'bidirectional'

export type SyncFileType = 'photos' | 'videos' | 'screenshots' | 'slowmo' | 'documents' | 'voice'

export const DEFAULT_SYNC_TYPES: SyncFileType[] = ['photos', 'videos', 'screenshots']

// === 裝置型別（R10 擴充）===

export interface PairedDevice {
  id: string          // UUID
  name: string        // mDNS 偵測到的裝置名稱
  ip: string          // IP 位址
  addedAt: number     // timestamp
  syncDirection: SyncDirection    // 傳輸方向，MVP 僅支援 mobile-to-pc
  syncTypes: SyncFileType[]       // 要同步的檔案類型
}

// === 備份任務（R10 擴充）===

export interface BackupTask {
  deviceId: string
  direction: SyncDirection        // 方向參數（必填，MVP 固定為 'mobile-to-pc'）
  syncTypes?: SyncFileType[]      // 要同步的檔案類型（optional，MVP MockBackupManager 忽略此欄位）
}

// === BackupManager interface（R10 更新）===

export interface BackupManager {
  startBackup(task: BackupTask): Promise<void>
  cancelBackup(deviceId: string): void
  getStatus(deviceId: string): BackupStatus
}
```

**MVP 實作範圍**：`MockBackupManager` 只處理 `direction === 'mobile-to-pc'` 的情況，其他 direction 拋出 `UnsupportedDirectionError`。`PairedDevice` 建立時 `syncDirection` 預設為 `'mobile-to-pc'`，`syncTypes` 預設為 `DEFAULT_SYNC_TYPES`。

---

## 目錄結構

```
auto-backup/
├── src/
│   ├── main/
│   │   ├── index.ts                      # Bootstrap：建構 service、註冊 IPC、建立視窗
│   │   ├── tray.ts                       # System Tray 邏輯
│   │   ├── ipc-handlers.ts              # 所有 IPC handler 集中註冊
│   │   └── services/
│   │       ├── device-scanner.ts         # mDNS 偵測（被動監聽 + 主動 query + 30 秒 debounce）
│   │       ├── notification-service.ts   # Windows 原生通知
│   │       ├── backup-manager.ts         # BackupManager interface + MockBackupManager
│   │       ├── settings-store.ts         # electron-conf 封裝（僅 main process）
│   │       └── backup-history-store.ts   # 備份歷史 electron-conf 封裝
│   ├── preload/
│   │   └── index.ts                      # contextBridge 暴露 typed API
│   ├── renderer/
│   │   ├── App.tsx                       # Router + Layout
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx             # 主畫面：狀態 + 備份進度 + mDNS 狀態
│   │   │   ├── Settings.tsx              # 設定：路徑 + 裝置配對 + 手動 IP 輸入
│   │   │   └── History.tsx               # 備份歷史
│   │   ├── components/
│   │   │   ├── BackupProgress.tsx        # 備份進度條
│   │   │   ├── PathPicker.tsx            # 資料夾選擇器
│   │   │   ├── DeviceList.tsx            # 裝置列表 + 配對按鈕
│   │   │   └── ManualDeviceInput.tsx     # 手動 IP 輸入 + TCP 探測
│   │   ├── stores/
│   │   │   ├── app-store.ts              # Zustand：全域狀態（裝置、備份狀態）
│   │   │   └── settings-store.ts         # Zustand：設定狀態
│   │   └── index.html
│   └── shared/
│       ├── ipc-channels.ts              # IPC channel type map（@electron-toolkit/typed-ipc）
│       └── types.ts                      # 共用型別（Device, BackupJob, Settings, AppState）
├── tests/
│   ├── unit/
│   │   ├── device-scanner.test.ts
│   │   ├── notification-service.test.ts
│   │   └── backup-manager.test.ts
│   └── integration/
│       └── backup-flow.test.ts
├── resources/
│   └── tray-icon.png
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── tsconfig.web.json
├── electron.vite.config.ts
├── electron-builder.yml
└── vitest.config.ts
```

## Task Plan

**Task 1: 專案初始化 + IPC 型別層 + Tray 常駐**
- Demo: App 啟動顯示空白視窗，常駐 System Tray，關閉視窗不退出
- Files: `package.json`, `electron.vite.config.ts`, `vitest.config.ts`, `tsconfig*.json`, `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/App.tsx`, `src/renderer/index.html`, `src/shared/ipc-channels.ts`, `src/shared/types.ts`, `src/main/tray.ts`, `resources/tray-icon.png`
- Action:
  - 用 electron-vite 建立專案骨架，整合 React + TypeScript + TailwindCSS v4（`@tailwindcss/vite`）
  - 安裝核心依賴：`zustand`, `bonjour-service`, `electron-conf`, `@electron-toolkit/typed-ipc`
  - 定義所有 IPC channel type map（`get-current-state`, `device-found`, `device-lost`, `backup-progress`, `backup-complete`, `start-backup`, `cancel-backup`, `get-settings`, `save-settings`, `validate-path`, `scan-devices`, `pair-device`, `unpair-device`, `add-device-manual`, `get-history`, `mdns-status`）
  - 定義共用型別：`Device`（name, ip, serviceType, paired）、`BackupJob`（id, deviceName, status, progress）、`Settings`（backupPath, pairedDevices）、`AppState`（devices, currentBackup, status, mdnsAvailable）
  - preload 暴露 typed contextBridge API（invoke + on/off listener）
  - 建立 Tray icon，右鍵選單（開啟設定 / 立即掃描 / 立即備份 / 退出），關閉視窗時 `event.preventDefault()` + `win.hide()`
- Verify: `npm run dev` 成功啟動 Electron 視窗；tray icon 出現，右鍵選單可操作；關閉視窗不退出；`npm run typecheck` 通過
- Done: Dev 模式可正常啟動，Tray 常駐，IPC type map 定義完成，關閉視窗只隱藏不退出

**Task 2: mDNS 裝置偵測 + 通知 + Mock 備份**
- Demo: 偵測到 iPhone 後彈出 Windows 系統通知，點擊觸發 mock 備份流程
- Files: `src/main/services/device-scanner.ts`, `src/main/services/notification-service.ts`, `src/main/services/backup-manager.ts`, `src/main/services/settings-store.ts`, `src/main/services/backup-history-store.ts`, `src/main/ipc-handlers.ts`, `tests/unit/device-scanner.test.ts`, `tests/unit/backup-manager.test.ts`
- Action:
  - DeviceScanner：用 `bonjour-service` 監聽 `_companion-link._tcp`（主）+ `_airplay._tcp`（備援）
  - 啟動時 mDNS 自我檢測，回報可用性狀態
  - 被動監聽 + 主動 query（每 60 秒）雙模式，處理 iPhone 螢幕鎖定停止廣播的場景
  - 裝置上線後 30 秒 debounce，穩定後觸發 `device-stable-online` 事件
  - 對比 electron-conf 已配對裝置，僅已配對裝置觸發通知
  - 每台裝置每次上線只觸發一次
  - 手動配對裝置（無 mDNS）透過定期 TCP ping（每 60 秒 connect port 62078）檢測上線
  - NotificationService：收到穩定上線事件後發送 Windows 原生通知，點擊開啟主視窗
  - BackupManager interface + MockBackupManager（模擬進度 0-100%）
  - 備份前驗證路徑存在
  - electron-conf 封裝（settings-store + backup-history-store），僅 main process 存取
  - ipc-handlers.ts 集中註冊所有 handler
  - main/index.ts 建構所有 service 實例並注入
- Verify: `npx vitest run` 單元測試通過（debounce、配對過濾、重複觸發防護、mock 備份進度）；手動測試通知顯示
- Done: mDNS 偵測 + 通知 + mock 備份全流程可運作

**Task 3: Settings 頁面（裝置配對 + 路徑設定 + 手動 IP）**
- Demo: 可掃描並配對裝置、設定備份路徑、手動輸入 IP 新增裝置
- Files: `src/renderer/pages/Settings.tsx`, `src/renderer/components/PathPicker.tsx`, `src/renderer/components/DeviceList.tsx`, `src/renderer/components/ManualDeviceInput.tsx`, `src/renderer/stores/settings-store.ts`
- Action:
  - 備份路徑選擇（呼叫 Electron dialog.showOpenDialog via IPC）
  - 路徑驗證：儲存時透過 IPC 驗證路徑存在，不存在顯示紅字錯誤
  - 裝置配對區塊：「掃描裝置」按鈕觸發 mDNS 掃描，DeviceList 列出偵測到的裝置，每個裝置有「配對/取消配對」按鈕
  - 掃描逾時處理：10 秒後無結果顯示「未偵測到裝置，試試手動輸入 IP」提示
  - 已配對裝置列表顯示在上方
  - 手動新增裝置（Plan B）：IP 輸入欄位 + TCP 探測按鈕，探測成功可新增為裝置
  - Zustand settings-store 透過 IPC 與 main process electron-conf 同步
- Verify: `npm run dev` 開啟設定頁面，可掃描裝置、配對、手動 IP 新增、設定路徑、驗證路徑、重啟後保留
- Done: 設定可正常儲存/讀取，裝置配對（含手動 IP）功能正常，路徑驗證有效

**Task 4: Dashboard + 備份歷史 + Router**
- Demo: Dashboard 即時顯示狀態與 mock 備份進度，History 頁面顯示歷史紀錄
- Files: `src/renderer/pages/Dashboard.tsx`, `src/renderer/pages/History.tsx`, `src/renderer/components/BackupProgress.tsx`, `src/renderer/stores/app-store.ts`, `src/renderer/App.tsx`
- Action:
  - Dashboard：顯示目前狀態（待命/掃描中/備份中）+ mDNS 可用性指示 +「立即備份」按鈕
  - 未設定狀態（無備份路徑或無已配對裝置）顯示 Setup Banner，引導使用者前往 Settings
  - 備份中顯示進度條，透過 main push 的 IPC 事件即時更新
  - 待命狀態顯示已配對裝置清單與最後備份時間
  - History 頁面：從 main process 讀取備份歷史，定義 BackupHistoryRepository interface
  - App.tsx 設定 Router：Dashboard（首頁）/ Settings / History
  - Store 初始化時透過 `get-current-state` 從 main process 同步狀態
- Verify: `npm run dev` 查看 Dashboard 和 History 頁面，狀態切換正確反映，mock 備份進度即時更新
- Done: 三個頁面 UI 完整，狀態透過 Zustand + IPC push 即時同步

**Task 5: 整合測試 + 打包**
- Demo: 可產出 Windows installer，安裝後完整流程可運行
- Files: `electron-builder.yml`, `tests/integration/backup-flow.test.ts`, `vitest.config.ts`
- Action:
  - 整合流程測試：裝置上線 -> debounce 30 秒 -> 通知 -> 觸發備份 -> 進度更新 -> 完成（全 mock 環境）
  - 設定 electron-builder 打包為 Windows installer（NSIS）
  - 確認開機自啟動設定可選
  - 全部測試通過 + typecheck 通過
- Verify: `npx vitest run` 全部通過；`npm run build` 成功產出 `.exe` installer；`npm run typecheck` 通過
- Done: 測試覆蓋核心流程，可產出可安裝的 Windows 應用程式

---

## Deviation Rules

**自動修復**（不需回報，直接處理）：
- bug、型別錯誤、lint、缺少 import
- loading state、error state 補充
- Zustand store 型別對齊
- TailwindCSS class 調整
- Vitest 測試修正

**停止回報**（必須回報，等待確認）：
- 新增外部服務整合
- 改變核心偵測邏輯（mDNS service type、debounce 策略）
- 影響 5+ 個 plan 外的檔案
- 引入 DI 框架或額外狀態管理套件
- 變更 IPC type map 結構
- 新增 Non-Goals 中明確排除的功能
