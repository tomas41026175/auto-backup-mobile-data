# 架構優化記錄

**專案**: Windows Auto Backup MVP
**日期**: 2026-03-10
**審查輪次**: 5 輪

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
