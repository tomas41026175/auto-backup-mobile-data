---
id: TASK-013
title: AfcBackupManager（AFC 直接存取 + Stream 複製 + xxHash64 + progress IPC）
status: done
priority: high
worktree: ""
branch: ""
created: 2026-03-11T00:00:00Z
updated: 2026-03-11T02:30:00Z
---

## 描述

實作真實的備份引擎，取代現有 MockBackupManager。
使用 libimobiledevice AFC 協定直接存取 iPhone DCIM（不需 ifuse mount / macFUSE），
以 Node.js Stream 複製檔案，xxHash64 驗證傳輸完整性，並透過 IPC 即時推送備份進度。

**路線決策**：AFC 直接存取（非 ifuse mount），避免 macFUSE kernel extension 需用戶手動允許的 UX 摩擦。
詳見 `docs/adr-backup-transport.md`。

## 驗收條件

- [ ] 建立 `src/main/services/afc-backup-manager.ts`，實作 `BackupManager` interface
- [ ] `startBackup()` 執行流程：`idevicepair` 確認配對 → `idevicebackup2`（或 AFC CLI）列出 DCIM → 差異比對（跳過已備份）→ Stream 複製 → xxHash64 驗證
- [ ] 每複製一個檔案，透過 IPC channel `backup-progress` 推送 `{ current, total, fileName, speed }`
- [ ] 備份完成後更新 `BackupHistoryStore`（成功/失敗/檔案數/大小）
- [ ] 中途失敗能正確清理資源（finally 保證，無殘留 process）
- [ ] `vitest` 單元測試：mock `child_process.execFile`、Stream、`@node-rs/xxhash`
- [ ] 安裝 `@node-rs/xxhash` 並確認 electron-rebuild 相容

## 備註

- 依賴 TASK-010 PoC（libimobiledevice 1.4.0 可用）
- AFC 存取工具優先順序：`ifuse`（若用戶已裝 macFUSE）→ `idevicebackup2 --unencrypted` → `idevicefsync`
- 差異比對策略：比對檔名 + 檔案大小，避免重複備份
- CLI 呼叫一律使用 `child_process.execFile`（非 exec，防 shell injection）
