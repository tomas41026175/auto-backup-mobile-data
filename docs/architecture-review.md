# 架構優化記錄

**專案**: Windows Auto Backup MVP
**日期**: 2026-03-10
**審查輪次**: 12 輪

---

## 初始架構（優化前）

- 偵測：ARP 掃描 + Apple OUI MAC 前綴比對
- 儲存：electron-store（設定）+ SQLite（備份歷史）
- 狀態管理：未定義
- IPC：未規劃集中管理
- 配對：未定義
- 錯誤處理：未覆蓋
- 目錄結構：平鋪

---

## 第一輪：架構審查（10 個發現）

### P0 -- 必須修復

| # | 問題 | 建議 | 結果 |
|---|------|------|------|
| 1 | iOS 14+ 私人 WiFi 地址導致 MAC 隨機化，ARP 方案失效 | 改用 mDNS/Bonjour（`bonjour-service`） | **採納** |
| 2 | 裝置偵測事件流未定義（mDNS 抖動、重複通知、離線處理） | 新增 DevicePresenceManager、30 秒 debounce、單次通知策略 | **採納**（簡化為 device-scanner 內建 debounce） |
| 3 | 首次使用配對流程完全缺失 | 掃描 -> 使用者手動配對 -> 僅已配對觸發通知 | **採納** |
| 4 | 錯誤處理空白（路徑不存在、mDNS 失敗、store 損壞） | 路徑驗證 + mDNS 健康檢查 + store 恢復 | **部分採納**（僅路徑驗證） |

### P1 -- 應該修復

| # | 問題 | 建議 | 結果 |
|---|------|------|------|
| 5 | Renderer 狀態管理未定義 | Zustand + push/invoke 雙向模式 | **採納** |
| 6 | 依賴注入未明確要求 | 所有 service constructor injection | **簡化**（手動建構，不用 DI 框架） |
| 7 | Main Process 職責過度集中 | 拆分 app-controller.ts + ipc-handlers 按 domain 拆 | **簡化**（main.ts bootstrap + 單一 ipc-handlers.ts） |

### P2 -- 可延後

| # | 問題 | 建議 | 結果 |
|---|------|------|------|
| 8 | mDNS Windows 相依性風險 | 啟動時健康檢查 + 狀態指示器 | **第 3-4 輪升級為啟動時自我檢測** |
| 9 | Mock 備份行為規格未定義 | 定義模擬 10 檔案、500ms 間隔、10% 失敗率 | **延後**（實作時再定） |
| 10 | shared/ 目錄職責不明確 | 拆為 ipc/ + models/ | **延後**（MVP 型別少） |

---

## 第二輪：Anti-Over-Engineering 審查

### 砍掉的設計（過度設計）

| 原建議 | 決定 | 理由 |
|--------|------|------|
| 離線中斷恢復（等待 60 秒） | **砍掉** | MVP 備份是 mock，不存在真實中斷 |
| mDNS 健康檢查 | **砍掉** | 偵測失敗靜默忽略即可 |
| electron-store 損壞恢復 | **砍掉** | 機率極低，延後成本趨近於零 |
| DI 框架 | **砍掉** | 3-4 個 service，手動 new 即可 |
| app-controller.ts 拆分 | **砍掉** | main.ts 在 400 行限制內，超過再拆 |
| Onboarding wizard（多步驟） | **簡化** | 改為掃描 + 配對按鈕，不需要導引流程 |

### 保留並強化的設計

| 項目 | 強化內容 |
|------|---------|
| mDNS debounce | 明確定義 30 秒穩定期 + 單次觸發防護 |
| 配對機制 | 手動配對 + 僅已配對觸發通知 |
| 路徑驗證 | 啟動備份前雙重檢查 |
| Zustand 狀態管理 | push/invoke 雙向模式 + get-current-state 初始同步 |
| Interface 抽象 | DeviceScanner、BackupManager、BackupHistoryRepository |

---

## 第三輪：mDNS 深度驗證 + 目錄結構

### P0 變更

| 項目 | 變更前 | 變更後 | 原因 |
|------|--------|--------|------|
| mDNS service type | `_apple-mobdev2._tcp` | `_companion-link._tcp`（主）+ `_airplay._tcp`（備援） | `_companion-link._tcp` 在 iPhone 上更可靠 |
| 目錄結構 | `electron/` + `shared/` + `src/` 平鋪 | electron-vite 標準：`src/main/`、`src/preload/`、`src/renderer/`、`src/shared/` | 遵循 electron-vite 社群慣例 |
| iPhone 螢幕鎖定 | 未考慮 | 主動 query 模式（每 60 秒）補充被動監聽 | iPhone 鎖定後可能停止 mDNS 廣播 |

---

## 第四輪：開發體驗 + Task 合併

### P1 變更

| 項目 | 變更前 | 變更後 | 原因 |
|------|--------|--------|------|
| IPC 型別安全 | 字串常數 | `@electron-toolkit/typed-ipc` type map | 編譯期型別檢查 |
| 測試框架 | 未指定 | Vitest | electron-vite 生態系原生支援 |
| electron-store 存取 | 未限制 | 僅限 main process，renderer 透過 IPC | 安全性 + Electron 最佳實踐 |
| TailwindCSS | 未指定版本 | v4 + `@tailwindcss/vite` plugin | 新專案直接用最新版 |
| 手動新增裝置 | 無 | Settings 加 IP 輸入 + TCP 探測 | mDNS 偵測不到時的 Plan B |
| mDNS 自我檢測 | 不做 | 啟動時驗證可用性 | 升級自第一輪 P2 #8 |
| Task 數量 | 8 個 | 5 個 | 每個 Task 有可 demo 的產出，減少碎片化 |

---

## 第五輪：收斂定稿

### 最終動作

- 新增 MVP 驗證假設區塊（明確本 MVP 驗證什麼、不驗證什麼）
- 新增 Non-Goals 區塊（8 項明確排除）
- 更新 Decision Lock（整合所有 5 輪決策）
- 更新 AC（8 條，含 mDNS 狀態指示、手動 IP）
- 合併 Task Plan 為 5 個（每個有 Demo 產出描述）
- 更新 Deviation Rules（加入 Vitest、TailwindCSS、IPC type map 相關規則）

---

## 最終架構決策總覽

| 決策項目 | 初始方案 | 最終方案 | 變更輪次 | 變更原因 |
|---------|---------|---------|---------|---------|
| 裝置偵測 | ARP 掃描 + OUI | mDNS/Bonjour | R1 | iOS 私人 WiFi 地址 |
| mDNS service type | `_apple-mobdev2._tcp` | `_companion-link._tcp` + `_airplay._tcp` | R3 | iPhone 可靠性更高 |
| mDNS 模式 | 被動監聽 | 被動 + 主動 query（60 秒） | R3 | iPhone 螢幕鎖定場景 |
| mDNS 自我檢測 | 不做 | 啟動時驗證 | R4 | 使用者可見性 |
| 資料儲存 | electron-store + SQLite | electron-store only（僅 main） | R1, R4 | 減少打包問題 + 安全性 |
| 狀態管理 | 未定義 | Zustand + IPC push/invoke | R1 | main/renderer 資料流清晰 |
| IPC 型別安全 | 字串常數 | `@electron-toolkit/typed-ipc` | R4 | 編譯期型別檢查 |
| 配對流程 | 未定義 | 手動掃描 + 配對 + 手動 IP Plan B | R1, R4 | 區分裝置 + mDNS 備援 |
| mDNS 防抖 | 未定義 | 30 秒 debounce + 單次觸發 | R1 | 防止通知轟炸 |
| DI 策略 | 未定義 | 手動建構注入（無框架） | R2 | MVP 規模不需要 |
| 錯誤處理 | 未定義 | 路徑驗證 + mDNS 啟動檢測 | R1, R4 | MVP scope |
| 構建工具 | 未定義 | electron-vite | R1 | HMR + React 整合 |
| 目錄結構 | 平鋪 | electron-vite 標準 | R3 | 社群慣例 |
| 測試框架 | 未指定 | Vitest | R4 | electron-vite 生態系 |
| TailwindCSS | 未指定 | v4 + @tailwindcss/vite | R4 | 新專案用最新版 |
| Task 數量 | 7 -> 8 | 5 | R4 | 可 demo 粒度 |

---

## 工作流程驗證（Spec 新增區塊）

驗證 7 個使用者流程，覆蓋全部 8 條 AC，發現並修復 4 個缺口：

| 缺口 | 修復 | 影響 Task |
|------|------|----------|
| Dashboard/Tray 缺少「手動觸發備份」 | Dashboard 加按鈕 + Tray 右鍵選單加項目 | T1, T4 |
| 掃描逾時行為未定義 | 10 秒無結果 → 提示手動輸入 | T3 |
| 首次啟動引導缺失 | Dashboard 未設定狀態顯示 Setup Banner | T4 |
| 手動配對裝置無法自動偵測 | 定期 TCP ping（每 60 秒 port 62078） | T2 |

同時新增：
- 使用者操作 → 工作項目對照矩陣（27 個操作點）
- IPC Channel 完整清單（16 個 channel，含方向和 payload）

---

## AC 變更追蹤

| 版本 | AC 數量 | 主要變更 |
|------|---------|---------|
| v1（初始） | 5 條 | 基礎功能 |
| v2（R1-R2 後） | 8 條 | +debounce 驗證、+裝置配對、+路徑驗證、+視窗關閉常駐 |
| v3（R3-R5 定稿） | 8 條 | 更新 mDNS 描述（+主動 query）、+手動 IP、+mDNS 狀態指示 |

---

## Task 變更追蹤

| 版本 | Task 數量 | 主要變更 |
|------|----------|---------|
| v1（初始） | 7 個 | 基礎功能 |
| v2（R1 後） | 8 個 | ARP->mDNS、移除 SQLite、+IPC 層 |
| v3（R1-R2 後） | 8 個 | +Zustand、+debounce、+配對、+路徑驗證、+IPC push |
| v4（R3-R5 定稿） | 5 個 | 合併為可 demo 粒度、+typed IPC、+Vitest、+手動 IP、+mDNS 自我檢測 |
| v5（工作流程驗證後） | 5 個 | +Tray「立即備份」、+掃描逾時、+Setup Banner、+手動裝置 TCP ping、+16 IPC channels |

---

## 第六輪：研究資料整合 -- 發現問題

**審查日期**: 2026-03-10
**輸入**: 9 份研究文件 + master-index 跨面向洞察

### P0 -- 必須修復（阻塞開發）

| # | 問題 | 來源 | 現行 Spec | 修正建議 | 影響 Task |
|---|------|------|----------|---------|----------|
| F1 | `_airplay._tcp` 備援方案無效 | 02 研究：iPhone 是 AirPlay 發送端，不廣播此服務 | Decision Lock 寫「備援 `_airplay._tcp`」 | 移除 `_airplay._tcp`，僅用 `_companion-link._tcp`；偵測失敗有手動 IP Plan B | T2 |
| F2 | electron-store v9+ 純 ESM 與 electron-vite CJS 衝突 | 04 研究：`ERR_REQUIRE_ESM` 啟動失敗 | Decision Lock 僅寫「electron-store」未指定相容方案 | 改用 `electron-conf`（ESM/CJS 皆支援，electron-vite 作者維護） | T1（阻塞） |
| F3 | Tray / Notification / Bonjour 物件 GC 回收陷阱 | 06, 09 研究 | Spec 未明確要求全域宣告或參照保存 | Tray 必須模組層級全域變數；Notification 用 Set 保存參照；Bonjour 全域變數 + before-quit destroy | T1, T2 |
| F4 | `setAppUserModelId` 時機未明確 | 06, 09 研究：必須在 `app.whenReady()` 之前呼叫 | Spec 未提及 | 在 main/index.ts 最頂部呼叫，開發環境用 `process.execPath`，生產用 appId | T1 |

### P1 -- 應該修復（影響品質）

| # | 問題 | 來源 | 修正建議 | 影響 Task |
|---|------|------|---------|----------|
| F5 | IPC type map 必須用 union 型別分拆 listener / handler map | 03 研究 | 區分 `IpcMainEvents`（listener \| handler）和 `IpcRendererEvents`（listener） | T1 |
| F6 | Zustand v5 物件 selector 必須用 `useShallow` 包裝 | 05 研究：否則拋 "Maximum update depth exceeded" | 加入 Deviation Rules 自動修復項 | T3, T4 |
| F7 | 初始化順序：`initializeStores()` 必須先於 `setupIpcListeners()` | 05 研究：否則可能漏接 push 事件 | 明確定義 Renderer 初始化時序 | T4 |
| F8 | Windows 通知點擊焦點搶奪 Bug | 06 研究 | 需 `setAlwaysOnTop(true)` -> `focus()` -> `setAlwaysOnTop(false)` workaround | T2 |
| F9 | mDNS 主動 query 應用 `browser.update()` 而非重建 browser | 02 研究 | 更優雅且避免多餘 socket | T2 |
| F10 | Vitest 3.x 使用 `test.projects` 取代 `vitest.workspace.ts` | 07 研究 | 採用 `test.projects` 設定 | T1, T5 |
| F11 | `bonjour-service` 純 JS 不需 `asarUnpack` | 02, 08 研究 | electron-builder.yml 不加 asarUnpack for bonjour-service | T5 |
| F12 | Renderer 端 IPC listener `on()` 返回 unsubscribe，React useEffect cleanup 必須呼叫 | 03 研究 | 加入 coding convention | T3, T4 |

### P2 -- 可延後

| # | 問題 | 來源 | 備註 |
|---|------|------|------|
| F13 | Windows 公共網路防火牆預設封鎖 mDNS | 02 研究 | mDNS 自我檢測已覆蓋 |
| F14 | Bonjour 多網路介面可能需指定 interface IP | 02 研究 | MVP 假設單一 WiFi |
| F15 | `@utility` 指令在 dev 模式下可能不生效 | 01 研究 | 避免使用即可 |

### 結論

P0 共 4 項（F2 為 Task 1 阻塞項），P1 共 8 項，P2 共 3 項。

---

## 第七輪：Spec 更新 -- 修正決策

**審查日期**: 2026-03-10
**輸入**: R6 的 P0/P1 項目

### 決策修正

| # | 對應 R6 | 決策 | 理由 |
|---|---------|------|------|
| D1 | F1 | 移除 `_airplay._tcp` 備援，僅用 `_companion-link._tcp` | iPhone 不廣播此服務，假備援不如不寫 |
| D2 | F2 | 使用 `electron-conf` 替代 `electron-store` | electron-vite 作者維護，ESM/CJS 皆支援，零衝突 |
| D3 | F3 | 新增「GC 防護規範」 | Tray 全域宣告、Notification Set 保存、Bonjour destroy |
| D4 | F4 | 新增初始化順序 | `setAppUserModelId` -> `whenReady` -> createWindow -> createTray -> initBonjour -> initStores -> setupIpcHandlers |
| D5 | F5 | IPC type map 用 union 型別 | 區分 listener map 和 handler map |
| D6 | F6 | Zustand v5.x + `useShallow` | 加入自動修復項 |
| D7 | F7 | Renderer 初始化時序 | initializeStores -> setupIpcListeners -> render |
| D8 | F8 | 通知點擊加 `setAlwaysOnTop` workaround | Windows 已知 bug |
| D9 | F9 | 主動 query 用 `browser.update()` | 不重建 browser |
| D10 | F10 | Vitest 用 `test.projects` | main node + renderer jsdom |
| D11 | F11 | 不加 `asarUnpack` for bonjour-service | 純 JS |
| D12 | F12 | useEffect cleanup 呼叫 unsubscribe | 防記憶體洩漏 |

### 結論

12 項決策，最大結構性變更為 D2（electron-conf）和 D1（移除假備援）。

---

## 第八輪：Task Plan 精化 -- 實作就緒

**審查日期**: 2026-03-10
**輸入**: R7 決策修正結果

### Task 1 已知陷阱

| 陷阱 | 來源 | 預防措施 |
|------|------|---------|
| TailwindCSS v4 需 `moduleResolution: "bundler"` | 01 研究 | 確認 tsconfig.node.json |
| `electron-conf` 取代 `electron-store` | D2 | 參考 electron-conf 文件 |
| Tray 必須模組層級全域變數 | 09 研究 | 檔案頂層宣告 |
| `setAppUserModelId` 必須在 `whenReady()` 前 | 06, 09 研究 | main/index.ts 最頂部 |
| IPC type map 用 union 型別 | 03 研究 | 參考 typed-ipc 文件 |
| `@electron-toolkit/preload` 搭配 `typed-ipc` | 03 研究 | 一起安裝 |
| `isQuitting` 旗標在 `before-quit` 設定 | 09 研究 | 區分隱藏 vs 退出 |
| `window-all-closed` handler 留空 | 09 研究 | 不呼叫 `app.quit()` |

### Task 2 已知陷阱

| 陷阱 | 來源 | 預防措施 |
|------|------|---------|
| `bonjour.find()` type 參數不含底線和 `_tcp` | 02 研究 | 寫 `{ type: 'companion-link' }` |
| 主動 query 用 `browser.update()` | 02 研究 | `setInterval(() => browser.update(), 60_000)` |
| Bonjour 退出前必須 `destroy()` | 02 研究 | `before-quit` 中呼叫 |
| HMR 後需清理前一個 Bonjour 實例 | 02 研究 | 實作 `dispose()` 方法 |
| Notification 物件必須保存參照 | 06 研究 | `Set<Notification>` |
| 通知點擊需 `setAlwaysOnTop` workaround | 06 研究 | 三行 workaround |
| TCP ping port 62078 可能被防火牆封鎖 | 推斷 | 失敗時提示使用者 |

### Task 3 已知陷阱

| 陷阱 | 來源 | 預防措施 |
|------|------|---------|
| Zustand v5 物件 selector 需 `useShallow` | 05 研究 | `import { useShallow }` |
| IPC listener `on()` 返回 unsubscribe | 03 研究 | useEffect cleanup 呼叫 |
| `dialog.showOpenDialog` 需透過 IPC | 安全規範 | 加 `select-directory` IPC channel |

### Task 4 已知陷阱

| 陷阱 | 來源 | 預防措施 |
|------|------|---------|
| 初始化順序：initializeStores 先於 setupIpcListeners | 05 研究 | App.tsx useEffect 依序執行 |
| `useShallow` 用於多欄位 selector | 05 研究 | 或分開取值 |
| 視窗從 hidden 恢復需重新同步狀態 | 05 研究 | main push 或 renderer visibility change |

### Task 5 已知陷阱

| 陷阱 | 來源 | 預防措施 |
|------|------|---------|
| bonjour-service 不需 `asarUnpack` | 02, 08 研究 | 不加 |
| Vitest 3.x 用 `test.projects` | 07 研究 | 參考範例 |
| electron-conf mock 需特殊處理 | 07 研究 | 記憶體 mock |
| `vi.useFakeTimers()` 後必須 `vi.useRealTimers()` | 07 研究 | afterEach 還原 |

### 依賴清單

```
dependencies:
  electron-conf, bonjour-service ^1.3.0, zustand ^5.x,
  react ^19.x, react-dom ^19.x, react-router-dom ^7.x,
  @electron-toolkit/typed-ipc, @electron-toolkit/preload

devDependencies:
  electron ^39.x, electron-vite ^5.x, electron-builder ^24.x,
  @vitejs/plugin-react, tailwindcss ^4.x, @tailwindcss/vite,
  typescript ^5.x, vitest ^3.x, jsdom, @vitest/coverage-v8,
  @electron-toolkit/tsconfig
```

### IPC Type Map 與共用型別草稿

已定義完整型別（見 spec 更新），包含 `IpcMainEvents`（union: listener | handler）和 `IpcRendererEvents`（listener map），以及 `Device`, `BackupJob`, `BackupRecord`, `Settings`, `AppState` 五個核心型別。

新增 `select-directory` IPC channel（R6 發現的缺口）。

### 結論

27 個已知陷阱分配至 5 個 Task。依賴清單確認（`electron-conf` 取代 `electron-store`）。型別草稿可直接作為 Task 1 輸入。

---

## 第九輪：跨平台架構整理

**審查日期**: 2026-03-10
**輸入**: 7 份跨平台研究文件（01-07）+ 跨平台研究總索引

### 分析結果

對照 Decision Lock 的所有決策，分三層分類：

**共用層（不需改動，約 70% 程式碼）**：
- bonjour-service mDNS 偵測、IPC type map、Zustand stores、React UI、BackupManager/BackupHistoryRepository interface、electron-conf、DeviceScanner 核心邏輯、shared/types.ts

**Platform Branch 層（需 `process.platform` guard，約 20% 程式碼）**：

| Decision Lock 項目 | 影響 | MVP 預留動作 |
|-------------------|------|-------------|
| `setAppUserModelId` | win32 only | 已用 win32 guard 包覆（R7 決策 D4） |
| Notification `toastXml`/`timeoutType` | win32 only | 需用 win32 guard 包覆 |
| Notification `setAlwaysOnTop` workaround | win32 only | 需用 win32 guard 包覆 |
| Tray `double-click` 事件 | macOS 用 `click` | 需用 platform guard |
| Tray `setContextMenu()` | macOS 需改用 `popUpContextMenu()` | 需用 platform guard |
| `window-all-closed` 處理 | macOS 不呼叫 `app.quit()` | MVP 已用 hide 模式，差異小 |
| `dialog.showOpenDialog` 選項 | `promptToCreate` vs `createDirectory` | 需用 platform guard |
| 開機自啟動 `setLoginItemSettings` | macOS 需 SMAppService + 簽名 | macOS 完全不同實作 |
| 外接硬碟路徑格式 | 磁碟代號 vs `/Volumes` | UI 需分開設計 |

**平台專屬層（不共用，約 10% 程式碼）**：
- macOS: Code Signing + Notarization + entitlements + Info.plist + DMG + Universal Binary + Template PNG
- Windows: NSIS + ICO + SmartScreen（已在 MVP）

### 決策

1. **MVP 開發時加入 platform guard**：在 `index.ts`、`tray.ts`、`notification-service.ts` 中，Windows 專屬 API 用 `if (process.platform === 'win32')` 包覆
2. **不做過早抽象**：不建立 platform adapter pattern，直接用 if 判斷
3. **建立跨平台 ADR**：`docs/adr-cross-platform.md`，完整記錄三層分類與 macOS 前置條件
4. **更新系統架構圖**：新增第 4 張跨平台分層圖
5. **更新 Non-Goals**：明確說明 macOS 為 Post-MVP + 需要 Apple Developer 帳號

### 結論

跨平台擴展的架構影響可控。MVP 只需在約 5 個檔案中加入 `process.platform` guard（共約 10-15 行），Post-MVP macOS 移植的主要工作在平台專屬層（Notarization 流程 + Tray Template Image + 外接硬碟路徑 UI），而非共用業務邏輯。

技術風險最高點為 macOS Notarization（公開發佈幾乎必須，且需 $99/年 Developer 帳號）。

---

## 第十輪：雙向同步架構擴充性審查（R10）

**審查日期**: 2026-03-10
**觸發**: PC → Mobile 技術可行性研究完成（6 份研究文件），需將擴充性納入現有架構
**輸入**: `docs/research/pc-to-mobile/` 系列文件（01-06）+ 00-index.md + entities.md

### 研究關鍵發現

| # | 發現 | 來源 | 影響 |
|---|------|------|------|
| 1 | iOS 16-18 沙盒未放寬，外部無法直接寫入 Photo Library 或 App Container | 01-ios-sandbox | PC → Mobile 自動同步必須有 iOS App |
| 2 | PC → Mobile 自動同步必須有配套 iOS App（Document Provider + URLSession） | 05-ios-app-requirements | 獨立 iOS 開發工作量（2-3 週 MVP + App Store 審核） |
| 3 | Windows USB 路線（AFC）依賴 iTunes/AMDS，安裝環境差異大 | 02-afc-libimobiledevice, 04-existing-tools | AFC/USB 風險過高，不適合自動化方案 |
| 4 | WiFi HTTP Server 是最低摩擦的 Post-MVP 路線（PC：Node.js HTTP server，iPhone：URLSession） | 03-wifi-transfer, 06-electron-nodejs | PC 端技術棧與現有 Electron 架構一致 |
| 5 | iOS 背景限制：iPhone App 需在前景，或使用 Background URLSession（純 LAN 不支援 Silent Push） | 05-ios-app-requirements | 半自動（需使用者開啟 App），全自動需雲後端 APNs |

### 架構調整決策

| # | 決策 | 結果 | 理由 |
|---|------|------|------|
| R10-D1 | `SyncDirection` 型別加入 shared types | **採納** | 型別定義成本極低（<10 行），未來 Post-MVP 擴充時不需改 interface |
| R10-D2 | `SyncFileType` 型別 + `DEFAULT_SYNC_TYPES` 常數 | **採納** | 預先定義支援的檔案類型，避免未來 string magic value |
| R10-D3 | BackupManager interface 加入 `BackupTask`（含 direction + syncTypes） | **採納** | MockBackupManager 只實作 `mobile-to-pc`，其他方向拋 Error |
| R10-D4 | `PairedDevice` 加入 `syncDirection` + `syncTypes` 欄位 | **採納** | per-device 設定，MVP 預設值固定，UI 暫不開放修改 |
| R10-D5 | IPC channel `update-device-config` 預留 | **採納** | 定義型別但 MVP handler 暫不實作（或僅 stub） |
| R10-D6 | PC → Mobile 實作：Post-MVP，不在 MVP Decision Lock | **採納** | 與研究結論一致，需 iOS App 為獨立開發里程碑 |
| R10-D7 | AFC/USB 方案：風險過高（iTunes/AMDS 依賴），Post-MVP 優先 WiFi 路線 | **採納** | Windows usbmuxd 支援不完整，商業工具（iMazing）需 Business 訂閱 |
| R10-D8 | 建立 Document Provider + Silent Push 全自動方案 | **不採納** | 開發成本 6-8 週 + 需雲後端 APNs，複雜度 >7/10，與 MVP 精神矛盾 |
| R10-D9 | MFi USB 硬件方案 | **不採納** | 每台硬件 $30-50，使用者需額外採購，與「零摩擦」目標矛盾 |
| R10-D10 | 雲存儲中繼方案（S3/Azure Blob） | **不採納** | 引入雲端依賴違反 LAN 直連架構原則，複雜度遠超 MVP |

### 更新後架構摘要

**shared types 新增**：
- `SyncDirection`（union type）、`SyncFileType`（union type）、`DEFAULT_SYNC_TYPES`（常數）
- `PairedDevice` 新增 `syncDirection` 和 `syncTypes` 欄位
- 新增 `BackupTask` interface（取代直接傳 deviceId string）

**BackupManager 介面變化**：
- `startBackup(task: BackupTask)` 取代原本的 `startBackup(deviceId: string)`
- MockBackupManager 只處理 `direction === 'mobile-to-pc'`

**settings-store schema 變化**：
- `PairedDevice` 物件新增兩個欄位，既有裝置需 migration（補上預設值 `syncDirection: 'mobile-to-pc'`、`syncTypes: DEFAULT_SYNC_TYPES`）

**IPC channel 新增**：
- `update-device-config`：更新裝置的 syncDirection / syncTypes，MVP 階段為 stub

### 三問框架驗證

1. **問題真的存在嗎？** -- 是。研究已完成，需將結論落入架構文件，確保 MVP 型別設計不阻塞 Post-MVP 擴充。
2. **解法是最簡單的嗎？** -- 是。只新增型別定義和預設值，不做任何 Post-MVP 功能實作。複雜度 2/10。
3. **現在做 vs 延後做？** -- 現在做成本極低（型別 + 預設值），延後做需改 interface + migration，成本 >3x。

---

## 最終架構決策總覽（更新至 R10）

| 決策項目 | R5 方案 | R8/R9 修正 | 輪次 | 原因 |
|---------|---------|---------|------|------|
| mDNS 備援 service type | `_airplay._tcp` | 移除 | R7 | iPhone 不廣播 |
| 資料儲存 | electron-store | `electron-conf` | R7 | ESM/CJS 衝突 |
| GC 防護 | 未明確 | 全域宣告 + Set 參照 + destroy | R7 | 三處陷阱 |
| 初始化順序 | 未明確 | 7 步驟時序 | R7 | AppUserModelId 時機 |
| IPC type map 結構 | 未明確 | union 型別 | R7 | typed-ipc 要求 |
| 主動 query 方式 | 未指定 | `browser.update()` | R7 | 更優雅 |
| asarUnpack | 可能誤加 | 不需要 | R7 | 純 JS |
| 跨平台策略 | 未規劃 | 三層分類 + platform guard 預留 | R9 | macOS Post-MVP |
| Non-Goals 跨平台說明 | 僅「Windows」 | 含 macOS 前置條件說明 | R9 | 決策可追溯 |
| 雙向同步型別 | 未定義 | `SyncDirection` + `SyncFileType` 型別 | R10 | Post-MVP 擴充預留 |
| BackupManager 介面 | `startBackup(deviceId)` | `startBackup(BackupTask)` 含 direction | R10 | 支援多方向備份 |
| PairedDevice 欄位 | name/ip/paired | 新增 syncDirection + syncTypes | R10 | per-device 設定 |
| IPC channel 預留 | 16 個 | +1 `update-device-config` | R10 | 裝置設定更新 |
| PC → Mobile 技術路線 | 未評估 | WiFi HTTP Server（Post-MVP） | R10 | AFC 風險高，WiFi 最低摩擦 |
| AFC/USB 方案 | 未評估 | 不採納（iTunes/AMDS 依賴） | R10 | Windows 環境差異大 |

---

## 第十一輪：整合一致性審查（R11）

**審查日期**: 2026-03-10
**觸發**: R10 引入 per-device `syncDirection` + `syncTypes` + `BackupTask`，需驗證與現有架構各層面的一致性
**審查重點**: 新型別與 IPC type map、settings store、BackupManager interface、Dashboard UI、History store 之間的一致性

### 發現清單

| # | 問題 | 嚴重度 | 建議 | 決策 |
|---|------|--------|------|------|
| R11-1 | `update-device-config` 已列入 IPC Channel 完整清單（spec 第 339 行），但 IPC type map 尚未在 R8 的型別草稿中明確定義 handler 簽名。MVP 階段此 channel 為 stub，TypeScript 若定義了型別但 handler 未實作，`ipcMain.handle` 不會報錯（只有 renderer 端 invoke 時才會 reject），不阻塞開發。 | P2 | 在 `ipc-channels.ts` handler map 中定義型別，但 handler 實作放空（`async () => {}`）或拋出 `NotImplementedError`。MVP 不需要此 channel 的 renderer 端調用。 | **採納** -- 定義型別但 stub 實作，成本極低，避免 Post-MVP 忘記加型別 |
| R11-2 | `PairedDevice.syncTypes` spec 中定義為 `SyncFileType[]`（Array），但 UI 實作（Settings.tsx）使用 `Set<string>`。IPC 序列化時 `Set` 無法直接 JSON.stringify（會變成 `{}`），需要 `Array.from()` 轉換。 | P1 | 在 spec 中明確說明：**Store 層（electron-conf）和 IPC 傳輸使用 `SyncFileType[]`（Array），Renderer 端 UI 可在 Zustand store 內部轉為 `Set` 使用，但進出 IPC 邊界必須轉為 Array**。這是序列化邊界規則，不是型別變更。 | **採納** -- 新增序列化規則到 Architecture Review Notes |
| R11-3 | `MockBackupManager` 是否需要對不同 `syncTypes` 產生不同的 mock 行為（如不同檔案數量、不同耗時）。 | P2 | **不需要**。MVP mock 的目的是驗證 UI 流程，不是模擬真實備份差異。MockBackupManager 忽略 `syncTypes` 內容，統一模擬固定進度（如 10 檔案、500ms 間隔）。 | **不採納**（不增加 mock 複雜度） -- MVP mock 只需證明流程可跑通，syncTypes 差異化是實際備份時才需要的 |
| R11-4 | `BackupManager.getStatus()` 回傳型別 `BackupStatus` 是否需要包含 `syncTypes`（讓 Dashboard 顯示「正在備份照片和影片」）。 | P1 | **不需要在 `BackupStatus` 加 `syncTypes`**。Dashboard 備份中狀態可從 `BackupTask`（已包含 syncTypes）取得資訊，不必在 status 物件中重複。Dashboard 元件可從 app-store 中存取的 `currentBackupTask` 取得 syncTypes。 | **不採納**（不在 getStatus 重複資料） -- 避免資料源重複。但 app-store 的 `currentBackup` 狀態物件應包含 `BackupTask` 資訊，這在 T4 實作時自然會做。 |
| R11-5 | `backup-progress` IPC push 事件的 payload 是 `BackupJob`，但 `BackupJob` 型別（spec R8 定義）未包含 `syncTypes`。Dashboard 若需顯示「正在備份：照片、影片」，需要知道當前 syncTypes。 | P1 | 有兩個選項：(A) `BackupJob` 加入 `syncTypes` 欄位；(B) Dashboard 從 app-store 的 `currentBackupTask` 取得。選 (B)，因為 BackupJob 是進度物件，syncTypes 是任務描述，職責不同。app-store 在 `start-backup` 時記錄 `BackupTask`，backup-progress 只更新進度百分比。 | **不採納**（不擴充 BackupJob） -- 選擇方案 B：Dashboard 從 app-store 取 task 資訊，backup-progress 只推進度。職責分離更清晰。 |
| R11-6 | `BackupRecord`（History 頁面用）是否應記錄 `syncTypes` 和 `syncDirection`。目前 BackupRecord（研究文件 04 定義）只有 `sourcePath`、`destinationPath`、`status`、`fileCount`、`totalBytes`。UI mockup（History.tsx）也沒有這些欄位。 | P1 | **應該記錄**。BackupRecord 是歷史紀錄，記錄「這次備份了什麼」是基本需求。新增 `syncTypes: SyncFileType[]` 和 `direction: SyncDirection` 到 `BackupRecord`。成本極低（兩個欄位），延後加需要 migration。但 MVP mock 階段 History 不做篩選功能（Non-Goals 不含篩選），僅顯示。 | **採納** -- BackupRecord 新增 syncTypes + direction 欄位，但 History 頁面 MVP 不做按 syncTypes 篩選 |
| R11-7 | Settings.tsx 的 `PairedDevice` 介面缺少 `syncDirection` 的初始值設定。UI mock 中 `pairedDevices` 初始資料沒有 `syncDirection` 屬性（第 400-407 行），但介面定義中有（第 74 行）。這是 UI prototype 的不完整，不影響 spec。 | P2 | UI prototype 補上 `syncDirection: 'mobile-to-pc'` 預設值。這是 prototype 修正，不影響架構。 | **採納** -- UI prototype 修正（不影響 spec，開發時自然會對齊） |

### 小結

R11 共 7 項發現，0 個 P0，4 個 P1，3 個 P2。核心結論：

1. **序列化邊界規則**（R11-2）是最重要的發現 -- `Set` vs `Array` 的不一致如果不在 spec 中明確說明，開發時會造成 IPC 傳輸的 bug。需新增到 Architecture Review Notes。
2. **BackupRecord 擴充**（R11-6）成本低但價值高 -- 歷史紀錄不記錄「備份了什麼類型」是資訊缺失。
3. **三項不採納**（R11-3, R11-4, R11-5）都是基於「職責分離」和「MVP 不過早複雜化」原則，合理拒絕。
4. 整體而言，R10 引入的新型別與現有架構的一致性良好，沒有結構性矛盾。

---

## 第十二輪：Anti-Complexity 最終審查（R12）

**審查日期**: 2026-03-10
**觸發**: R10/R11 審查完成，進行最終的複雜度評估與 MVP 執行風險盤點
**審查重點**: 從「最小完成 MVP」角度，審視 12 輪審查累積的架構複雜度是否合理

### 發現清單

| # | 問題 | 嚴重度 | 建議 | 決策 |
|---|------|--------|------|------|
| R12-1 | `syncTypes` 在 MVP 是否過早？MockBackupManager 完全不使用 syncTypes，UI Settings 的 syncTypes toggle 在 MVP 也只影響 UI 呈現，mock 備份不會因此有任何差異。 | P1 | **三問框架分析**：(1) 問題真實存在？-- 部分。syncTypes 的 UI 體驗驗證是 MVP 假設之一（使用者是否理解同步項目的概念）。(2) 最簡單方案？-- 是。只是型別 + UI toggle + store 儲存，不影響 mock 邏輯。(3) 延後成本？-- 延後需改 PairedDevice interface + store schema + UI，成本約 2-3x。**結論：保留 syncTypes 在 UI 和 store 層，但 BackupManager interface 的 `BackupTask.syncTypes` 改為 optional。** | **部分採納** -- syncTypes 保留於 UI + store（驗證 UX），BackupTask.syncTypes 改為 optional（`syncTypes?: SyncFileType[]`），MockBackupManager 完全忽略此欄位 |
| R12-2 | `syncDirection` 在 MVP 完全固定為 `mobile-to-pc`，UI 中 `pc-to-mobile` 和 `bidirectional` 選項已標記 `available: false`。是否需要更明確的 Post-MVP 標記？ | P2 | Decision Lock 已寫明「MVP 僅實作 `mobile-to-pc`」。程式碼層面，`SYNC_DIRECTIONS` 的 `available: false` 已足夠清晰。不需要額外的 `// POST-MVP` 註解 -- 過多的註解反而是噪音。 | **不採納** -- 現有的 `available: false` + Decision Lock 文字已足夠，不新增程式碼註解 |
| R12-3 | `BackupTask.direction` 是否應改為 optional？MVP 階段 MockBackupManager 只處理 `mobile-to-pc`，direction 必填但永遠是固定值，有些冗餘。 | P1 | **不改為 optional**。direction 是 BackupTask 的核心語意 -- 「你要往哪個方向備份」。設為 optional 會讓 interface 語意模糊（沒指定 direction 代表什麼？預設值是什麼？）。MVP 階段總是傳入 `'mobile-to-pc'`，這是正確的顯式表達。 | **不採納** -- direction 是 BackupTask 的核心屬性，保持必填。語意清晰比省幾個字元重要。 |
| R12-4 | `update-device-config` IPC channel 的 handler 在 MVP 不實作（stub），是否應在 ipc-channels.ts 中定義型別？如果定義了但沒有 handler，TypeScript 不會報錯（typed-ipc 只做型別推導，不強制 handler 存在）。 | P2 | **定義型別，不實作 handler**。型別定義在 `ipc-channels.ts` 是文件性質的（宣告未來 API），開發者看到就知道這個 channel 存在但尚未啟用。若不定義，Post-MVP 時需要翻 spec 找 payload 格式。 | **採納** -- 定義型別，handler 留 stub 或不註冊。成本零，收益在 Post-MVP |
| R12-5 | 從 R1 到 R12 共 12 輪，架構複雜度變化評估。 | -- | 見下方「最終架構健康度評估」 | -- |

### 最終架構健康度評估

**複雜度演進**：

| 維度 | R0（初始） | R5（定稿） | R10-R12（最終） | 變化評語 |
|------|----------|----------|----------------|---------|
| 型別數量 | ~3 個 | ~8 個 | ~12 個（+SyncDirection, SyncFileType, BackupTask, DEFAULT_SYNC_TYPES） | 合理增長。新型別都是簡單 union/interface，無深層巢狀。 |
| IPC channel | 0 | 16 | 17（+update-device-config） | 可控。17 個 channel 對 Electron app 而言正常。 |
| Service 數量 | 0 | 5 | 5（不變） | 穩定。R10 未引入新 service。 |
| 抽象層 | 0 | 3 interface | 3 interface（不變） | 穩定。BackupManager interface 擴充但未新增抽象。 |
| 決策數量 | ~10 | ~25 | ~35 | R10 新增 10 個決策，但多為「不做什麼」（D8, D9, D10），實際影響代碼的只有 D1-D5。 |

**整體複雜度評分**：4/10（可控）

- MVP 核心仍然是 5 個 service + 3 個頁面 + 17 個 IPC channel
- R10 新增的型別是「宣告性」的（定義未來方向），不增加執行時複雜度
- 沒有引入新的抽象層、新的設計模式、或新的依賴套件
- 最大的複雜度來源仍然是 mDNS 偵測邏輯（debounce + 主動 query + TCP ping），這是 R1-R4 就確定的

**架構健康度結論**：健康。12 輪審查的累積效果是「做了很多決定不做什麼」，實際程式碼複雜度並未顯著增加。主要貢獻在於風險預防（GC 防護、初始化順序、序列化邊界）而非功能膨脹。

### MVP 執行風險評估

| Task | 風險點 | 風險等級 | 說明 |
|------|--------|---------|------|
| T1：專案初始化 + IPC + Tray | electron-vite + typed-ipc + electron-conf 初次整合 | **中** | 三個套件首次搭配，可能有版本相容問題。R8 已列 8 個已知陷阱，但「未知的未知」仍存在。建議預留 buffer。 |
| T2：mDNS 偵測 + 通知 + Mock 備份 | mDNS 實機行為不可預測（iPhone 螢幕鎖定、防火牆） | **高** | 這是整個 MVP 風險最高的 Task。mDNS 研究雖充分（R3, R6），但紙上研究 vs 實機行為仍有差距。「開發前必做」的實機驗證至關重要，若 mDNS 不可靠，需要加大 Plan B（手動 IP + TCP ping）的比重。 |
| T3：Settings 頁面 | Zustand + IPC 同步 + useShallow | **低** | UI 頁面，已有 prototype。主要風險是 useShallow 遺漏導致的 re-render 問題，但這是開發時可即時發現的。 |
| T4：Dashboard + History + Router | IPC push 事件監聽 + store 初始化時序 | **低-中** | R7 已定義初始化時序（initializeStores -> setupIpcListeners -> render），但視窗從 hidden 恢復時的狀態同步需要額外注意。 |
| T5：整合測試 + 打包 | electron-builder NSIS 打包 + bonjour-service 在 asar 中的行為 | **中** | 打包是最容易「最後一步翻車」的環節。R8 確認 bonjour-service 不需 asarUnpack，但建議早期就做一次 build 驗證（不要等到 T5 才第一次打包）。 |

**最高風險 Task**：T2（mDNS 偵測）。緩解策略：在 T2 開始前完成 mDNS 實機驗證（spec 已要求），若驗證失敗，需調整架構（加強 TCP ping 備援，降低對 mDNS 的依賴）。

**建議**：T5 的「打包驗證」建議提前到 T1 結束時做一次空殼 build，確認 electron-builder 基礎設定正確。避免所有功能做完後才發現打包有問題。

### 三問框架最終驗證

對照 R12 全部發現：

1. **問題真的存在嗎？** -- R12-1（syncTypes 過早）是邊界問題，結論是「部分保留」。R12-2, R12-3 都是「不存在的問題」，正確地不採納了。
2. **解法是最簡單的嗎？** -- 是。12 輪審查未引入任何「為了優雅」的抽象。所有決策都偏向最簡方案。
3. **現在做 vs 延後做？** -- R10 新增的型別定義成本極低（<20 行代碼），延後改 interface 成本 >3x。結論正確。

### 小結

R12 共 5 項發現（含架構健康度評估），1 項部分採納（R12-1），1 項採納（R12-4），3 項不採納（R12-2, R12-3, R12-5 為評估非決策）。

**核心結論**：
- MVP 架構在 12 輪審查後，複雜度仍在 4/10 可控範圍
- 最高風險在 T2 mDNS 實機驗證，這不是架構問題，而是外部依賴的不確定性
- R10/R11 引入的 syncDirection/syncTypes 型別擴充是值得的 -- 成本極低，防止 Post-MVP 大規模 refactor
- **唯一的架構調整**：`BackupTask.syncTypes` 改為 optional（R12-1）
- 建議 T1 結束時提前做一次空殼 build 驗證
