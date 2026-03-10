---
id: TASK-003
title: Settings 頁面（裝置配對 + 路徑設定 + 手動 IP）
status: done
priority: medium
worktree: ".worktrees/TASK-003"
branch: "task/TASK-003"
created: 2026-03-10T00:00:00Z
updated: 2026-03-10T00:00:00Z
---

## 描述

實作 Settings 頁面，包含備份路徑選擇、裝置配對（mDNS 掃描列表）、
手動 IP 輸入（Plan B）及 Zustand settings-store 與 main process IPC 同步。

## 前置條件

TASK-001 完成後才能開始（可與 TASK-002 平行）。

## 檔案範圍

`src/renderer/pages/Settings.tsx`, `src/renderer/components/PathPicker.tsx`,
`src/renderer/components/DeviceList.tsx`, `src/renderer/components/ManualDeviceInput.tsx`,
`src/renderer/stores/settings-store.ts`

## 實作要點

- PathPicker：呼叫 `dialog.showOpenDialog` via IPC，路徑驗證（`validate-path`）
- 路徑不存在顯示紅字錯誤，外接硬碟未掛載同樣驗證
- DeviceList：「掃描裝置」按鈕觸發 `scan-devices`，10 秒逾時顯示提示
- 已配對裝置列表在上方，可取消配對
- 未配對裝置列表在下方，可配對
- per-device 設定：syncDirection（SyncDirectionSelector）、syncTypes（FileTypeChip accordion）
- PC→Mobile 方向標示 "Soon"（disabled）
- ManualDeviceInput：IP 輸入 + TCP 探測（`add-device-manual`），IP 格式驗證
- Zustand settings-store：透過 `get-settings` / `save-settings` IPC 與 main process 同步
- 序列化邊界：IPC 邊界禁用 Set，統一 Array（SyncFileType[]）

## 驗收條件

- [ ] 可掃描並配對裝置，重啟後保留
- [ ] 掃描 10 秒無結果顯示提示
- [ ] 備份路徑設定與驗證（不存在路徑顯示紅字）
- [ ] 手動 IP 輸入 TCP 探測成功後可新增裝置
- [ ] IP 格式錯誤顯示驗證提示
- [ ] `npm run typecheck` 通過
