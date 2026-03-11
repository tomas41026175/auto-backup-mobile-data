---
id: TASK-014
title: UI 整合 USB 裝置狀態（Dashboard + 備份進度）
status: done
priority: medium
worktree: ""
branch: ""
created: 2026-03-11T00:00:00Z
updated: 2026-03-11T00:00:00Z
---

## 描述

更新 Dashboard UI，整合 USB 裝置連線狀態與真實備份進度顯示，
取代現有 mock 狀態。讓使用者能看到：iPhone 已連接、備份進行中、備份完成。

## 驗收條件

- [ ] Dashboard 收到 `device-usb-connected` 時，顯示裝置名稱與 iOS 版本
- [ ] Dashboard 收到 `device-usb-disconnected` 時，回到「未連接」狀態
- [ ] 備份進行中：顯示進度條、當前檔名、速度（MB/s）、剩餘時間估算
- [ ] 備份完成：顯示成功摘要（檔案數、總大小、耗時）
- [ ] 備份失敗：顯示錯誤訊息與重試按鈕
- [ ] Tray icon badge 在備份中更新（若平台支援）
- [ ] `vitest` 元件測試：mock IPC 事件，驗證各狀態的 UI 渲染

## 備註

- 依賴 TASK-012（USB 連線 IPC）、TASK-013（備份進度 IPC）
- Renderer store (`app-store.ts`) 新增 `usbDevice` 與 `backupProgress` 狀態
