---
id: TASK-004
title: Dashboard + 備份歷史 + Router
status: done
priority: medium
worktree: ".worktrees/TASK-004"
branch: "task/TASK-004"
created: 2026-03-10T00:00:00Z
updated: 2026-03-10T00:00:00Z
---

## 描述

實作 Dashboard（即時狀態 + 備份進度）、History 頁面、App Router，
以及 Zustand app-store 透過 IPC push 事件即時同步狀態。

## 前置條件

TASK-001 完成後才能開始（可與 TASK-002/003 平行）。

## 檔案範圍

`src/renderer/pages/Dashboard.tsx`, `src/renderer/pages/History.tsx`,
`src/renderer/components/BackupProgress.tsx`, `src/renderer/stores/app-store.ts`,
`src/renderer/App.tsx`

## 實作要點

- Dashboard 三種狀態：idle / backing-up / error
- 未設定狀態（無路徑或無已配對裝置）顯示 Setup Banner → 導向 Settings
- mDNS 不可用顯示黃色警告 Banner
- PairedDeviceCard 顯示已配對裝置 + 最後備份時間
- QuickStats 統計資訊
- 「立即備份」按鈕（`start-backup` IPC）
- BackupProgress 進度條：透過 main push `backup-progress` 即時更新
- History 頁面：`get-history` 讀取備份記錄，BackupHistoryRepository interface
- History 支援狀態篩選、時間篩選、關鍵字搜尋
- App.tsx Router：Dashboard（首頁）/ Settings / History，AppLayout（72px sidebar + 32px header）
- app-store 初始化：`get-current-state` 同步初始狀態 → `setupIpcListeners()` 建立推送監聽
- renderer IPC listener cleanup：useEffect cleanup 呼叫 unsubscribe
- Zustand v5.x：物件 selector 用 `useShallow` 包裝

## 驗收條件

- [ ] Dashboard 三種狀態正確顯示
- [ ] Setup Banner 出現在未設定狀態
- [ ] mDNS 不可用時顯示警告
- [ ] 備份進度條即時更新（mock 0→100%）
- [ ] History 頁面顯示備份記錄，篩選功能正常
- [ ] Router 三個頁面切換正常
- [ ] `npm run typecheck` 通過
