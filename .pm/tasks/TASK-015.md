---
id: TASK-015
title: 接入 AfcBackupManager + macFUSE 引導 UI + 端對端真機整合測試
status: done
priority: high
worktree: ".worktrees/TASK-015"
branch: "task/TASK-015"
created: 2026-03-11T00:00:00Z
updated: 2026-03-11T00:00:00Z
---

## 描述

目前 `src/main/index.ts` 仍使用 `MockBackupManager`，而 `AfcBackupManager` 已實作完成但尚未接入生產。
本任務完成最後一哩路：替換實作、加入 macFUSE 核准引導、並做端對端真機整合測試。

### 背景知識

- `AfcBackupManager` 位於 `src/main/services/afc-backup-manager.ts`
- `MockBackupManager` 位於 `src/main/services/backup-manager.ts`
- `index.ts` 的 `app.whenReady()` 中 `new MockBackupManager(settingsStore, backupHistoryStore)` 需替換
- `AfcBackupManager` 使用 `ifuse` 掛載 iPhone DCIM，需要 macFUSE kext 已核准
- macFUSE 安裝路徑：`/Library/Filesystems/macfuse.fs`（已安裝）
- kext 核准狀態可用 `system_profiler SPExtensionsDataType` 或檢查 `ifuse --version` 試掛來判斷
- idevice 工具路徑：`/opt/homebrew/bin/`
- 備份路徑設定在 `settingsStore.getSettings().backupPath`

### 架構規則（必須遵守）

- Service 只 emit EventEmitter 事件，index.ts 統一接線 IPC（不在 service 內呼叫 webContents.send）
- IPC channel 定義集中在 `src/shared/ipc-channels.ts`

## 驗收條件

- [ ] `src/main/index.ts` 改用 `AfcBackupManager`（移除 MockBackupManager import）
- [ ] 新增 `check-macos-fuse` IPC handler：回傳 `{ installed: boolean, approved: boolean }`
  - installed: `/Library/Filesystems/macfuse.fs` 存在
  - approved: 嘗試 `ifuse --version` 成功（kext 已載入）
- [ ] Dashboard 或 Settings 頁面加入 macFUSE 狀態提示：
  - 未安裝 → 顯示安裝連結（https://osxfuse.github.io）
  - 已安裝但未核准 → 顯示「請前往 系統設定 → 隱私權與安全性 核准 macFUSE」提示
  - 已核准 → 不顯示（或顯示綠色 ready 狀態）
- [ ] 端對端真機測試通過（iPhone 插上 USB → 觸發備份 → 驗證 DCIM 檔案複製到 backupPath）
  - 手動測試步驟記錄在 `dev-log/TASK-015_afc-production/test-result.md`
- [ ] 現有 85 個 vitest 測試全部繼續通過（`npm test` green）
- [ ] 若 AfcBackupManager 單元測試缺失，補充 mock 測試（mock execFile + mock fs）

## 備註

- macFUSE kext 核准無法程式自動觸發，只能引導用戶手動操作
- 真機測試需要 iPhone 實際插上，且 `idevicepair validate` 成功
- `AfcBackupManager` 的 `IDEVICE_BIN = '/opt/homebrew/bin'` 為 hardcode，暫不改（MVP）
- 若 backupPath 未設定，備份按鈕應 disabled（已有 UI logic，確認即可）
