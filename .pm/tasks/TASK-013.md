---
id: TASK-013
title: AfcBackupManager（ifuse 掛載 + Stream 複製 + xxHash64 + progress IPC）
status: pending
priority: high
worktree: ""
branch: ""
created: 2026-03-11T00:00:00Z
updated: 2026-03-11T00:00:00Z
---

## 描述

實作真實的備份引擎，取代現有 MockBackupManager。
使用 ifuse 掛載 iPhone DCIM，以 Node.js Stream 複製檔案，
xxHash64 驗證傳輸完整性，並透過 IPC 即時推送備份進度。

## 驗收條件

- [ ] 建立 `src/main/services/afc-backup-manager.ts`，實作 `BackupManager` interface
- [ ] `startBackup()` 執行流程：ifuse 掛載 → 掃描 DCIM → 差異比對（跳過已備份）→ Stream 複製 → xxHash64 驗證 → ifuse 卸載
- [ ] 每複製一個檔案，透過 IPC channel `backup-progress` 推送 `{ current, total, fileName, speed }`
- [ ] 備份完成後更新 `BackupHistoryStore`（成功/失敗/檔案數/大小）
- [ ] 中途失敗能正確卸載 ifuse（finally 保證）
- [ ] `vitest` 單元測試：mock `child_process`、`fs.createReadStream`、`@node-rs/xxhash`
- [ ] 安裝 `@node-rs/xxhash` 並確認 electron-rebuild 相容

## 備註

- 依賴 TASK-010 PoC 通過（ifuse 可用）
- 差異比對策略：比對檔名 + 檔案大小，避免重複備份
- ifuse 掛載點：`/tmp/auto-backup-iphone-{udid}`
