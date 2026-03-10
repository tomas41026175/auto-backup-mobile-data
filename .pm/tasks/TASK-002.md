---
id: TASK-002
title: mDNS 裝置偵測 + 通知 + Mock 備份
status: done
priority: high
worktree: ".worktrees/TASK-002"
branch: "task/TASK-002"
created: 2026-03-10T00:00:00Z
updated: 2026-03-10T00:00:00Z
---

## 描述

實作 DeviceScanner（mDNS 被動監聽 + 主動 query）、NotificationService（Windows 原生通知）、
MockBackupManager、settings-store、backup-history-store，以及所有 IPC handler。

**⚠️ 最高風險 Task**：mDNS 在 Windows 的行為需實機驗證。

## 前置條件

TASK-001 完成後才能開始。

## 檔案範圍

`src/main/services/device-scanner.ts`, `src/main/services/notification-service.ts`,
`src/main/services/backup-manager.ts`, `src/main/services/settings-store.ts`,
`src/main/services/backup-history-store.ts`, `src/main/ipc-handlers.ts`,
`tests/unit/device-scanner.test.ts`, `tests/unit/backup-manager.test.ts`

## 實作要點

- DeviceScanner：用 `bonjour-service` 監聽 `_companion-link._tcp`
- 啟動時 mDNS 自我檢測（5 秒），回報可用性狀態
- 被動監聽 + 主動 query（每 60 秒，`browser.update()`）雙模式
- 裝置上線後 30 秒 debounce，穩定後觸發 `device-stable-online`
- 已配對裝置過濾：只對配對裝置發通知，每次上線只通知一次
- 手動配對裝置：定期 TCP ping（每 60 秒，connect port 62078）
- NotificationService：Windows 原生通知，點擊後開啟主視窗
- GC 防護：Notification 保存至 `Set<Notification>`
- MockBackupManager：模擬進度 0→100%，備份前驗證路徑存在
- BackupManager interface 含 direction + syncTypes 參數（BackupTask）
- MockBackupManager 只處理 `mobile-to-pc`，其他 direction 拋 `UnsupportedDirectionError`
- electron-conf 封裝（settings-store + backup-history-store），僅 main process
- ipc-handlers.ts 集中註冊全部 handler
- Bonjour 實例全域宣告 + `app.on('before-quit')` 呼叫 `destroy()`

## 驗收條件

- [ ] `npx vitest run` 單元測試通過（debounce、配對過濾、重複觸發防護、mock 備份進度）
- [ ] mDNS 自我檢測正常（5 秒 timeout）
- [ ] 已配對裝置觸發通知，未配對不觸發
- [ ] mock 備份進度 0→100% 正確推送
- [ ] `npm run typecheck` 通過
