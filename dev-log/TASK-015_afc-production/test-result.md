# TASK-015 端對端測試計畫

## 環境需求

- macOS + iPhone（iOS 14+）
- `/opt/homebrew/bin/ifuse` 已安裝（`brew install ifuse`）
- `/opt/homebrew/bin/idevicepair` 已安裝（`brew install libimobiledevice`）
- macFUSE 已安裝（`/Library/Filesystems/macfuse.fs` 存在）
- macFUSE 已於 系統設定 → 隱私權與安全性 核准

---

## 測試案例

### TC-01：macFUSE 未安裝時的 UI 提示

**前提**：macFUSE 未安裝（`/Library/Filesystems/macfuse.fs` 不存在）

**步驟**：
1. 啟動 App（`npm run dev`）
2. 觀察 Dashboard 頁面頂部

**預期**：
- 顯示紅色警告橫幅「請安裝 macFUSE」
- 包含可點擊連結

---

### TC-02：macFUSE 已安裝但未核准時的 UI 提示

**前提**：macFUSE 已安裝，但 kext 尚未通過系統安全性核准（`ifuse --version` 執行失敗）

**步驟**：
1. 啟動 App
2. 觀察 Dashboard 頁面

**預期**：
- 顯示黃色警告橫幅「請前往 系統設定 → 隱私權與安全性 核准 macFUSE」

---

### TC-03：macFUSE 已安裝且已核准時不顯示警告

**前提**：macFUSE 已安裝且 `ifuse --version` 執行成功（exit code 0）

**步驟**：
1. 啟動 App
2. 觀察 Dashboard 頁面

**預期**：
- 不顯示 macFUSE 相關橫幅（靜默）

---

### TC-04：iPhone USB 備份流程

**前提**：macFUSE 已安裝且核准，iPhone 已配對（`idevicepair validate` 成功）

**步驟**：
1. 啟動 App，完成設定（設定備份路徑、配對裝置）
2. 以 USB 連接 iPhone
3. 確認 Dashboard 顯示 USB 連接橫幅（藍色）
4. 點擊「立即備份」

**預期**：
- 備份進度正常更新（connecting → scanning → transferring → completing）
- 備份完成後顯示完成訊息
- 備份目標路徑下出現 `{deviceId}/DCIM/` 資料夾，包含從 iPhone 複製的照片/影片

---

### TC-05：取消備份

**前提**：TC-04 的備份正在進行中

**步驟**：
1. 在備份進行中，觀察是否有取消選項（透過後端 `cancel-backup` IPC）
2. 呼叫取消

**預期**：
- 備份停止，顯示 cancelled 狀態
- 已部分複製的檔案保留在目標路徑

---

### TC-06：備份路徑不存在時的錯誤處理

**前提**：設定中的備份路徑不存在

**步驟**：
1. 設定備份路徑為不存在的路徑
2. 嘗試啟動備份

**預期**：
- 收到錯誤訊息「Backup path does not exist」
- Dashboard 顯示錯誤狀態

---

## 自動化測試（現有）

- `npm test` 執行所有單元測試（vitest）
- `tests/unit/afc-backup-manager.test.ts` 涵蓋核心備份邏輯（mock execFile、fs）

---

## 備註

- 真機測試無法在 CI 環境自動化執行（需要實體 iPhone + macFUSE 環境）
- TC-04 至 TC-06 需手動驗證
- `check-macos-fuse` IPC 的 installed/approved 狀態由 `ipc-handlers.ts` 處理，可透過 unit test mock 驗證（TC-01 至 TC-03 邏輯）
