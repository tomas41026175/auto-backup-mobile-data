# Dev Log Index

**Updated**: 2026-03-15

| 任務 | 狀態 | 說明 | 更新時間 |
|------|------|------|---------|
| [TASK-000_windows-auto-backup-mvp](./TASK-000_windows-auto-backup-mvp/spec.md) | ✅ 完成 | Windows USB AFC 備份 MVP | 2026-03-15 |
| [TASK-016_windows-wifi-transfer](./TASK-016_windows-wifi-transfer/spec.md) | ⏸ 擱置 | WiFi 傳輸（iOS 沙箱限制，暫不實作） | 2026-03-11 |

## 已完成功能摘要（2026-03-15）

### USB 備份核心
- AFC 備份流程（afcclient.exe + list_dcim.py）
- 備份進度詳細顯示（current/total/speed）
- 備份時長修正（ms → 秒）
- 空備份邊界處理（0 檔案不顯示 0%→complete）
- 備份歷史時長遷移（舊資料 ms 格式向下相容）

### Dashboard UI
- 已配對裝置列表 + 備份按鈕
- 每個裝置「打開備份資料夾」按鈕（`shell.openPath`）
- Windows 驅動狀態 Banner

### iCloud Photos 同步（`ICloud.tsx` + `icloud-sync-manager.ts` + `icloud_download.py`）
- pyicloud 子程序，stdin/stdout JSON 協定
- 認證 → 雙重驗證 → 掃描相簿 → 下載全流程
- 中斷續傳（`.icloud_sync_state.json`）
- 每相簿子目錄：`dest_dir/icloud/<相簿名稱>/`
- 非致命 file_error vs 致命 error 事件區分
- 相簿列表（初始 count=0，掃描後 album_update 更新）
- 相簿選擇下拉（全部 / 指定相簿）+ localStorage 持久化
- 帳號記憶（Apple ID + 密碼存於 electron-conf settings）
- 顯示密碼切換
- 取消同步按鈕（頁面切換後重新進入仍顯示）
- 進度條（掃描中 indeterminate / 下載中 determinate）
- 同步完成摘要
