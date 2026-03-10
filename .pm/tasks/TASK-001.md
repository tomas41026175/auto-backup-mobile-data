---
id: TASK-001
title: 專案初始化 + IPC 型別層 + Tray 常駐
status: done
priority: high
worktree: ".worktrees/TASK-001"
branch: "task/TASK-001"
created: 2026-03-10T00:00:00Z
updated: 2026-03-10T00:00:00Z
---

## 描述

用 electron-vite 建立專案骨架，整合 React + TypeScript + TailwindCSS v4（`@tailwindcss/vite`）。
安裝核心依賴、定義 IPC type map、建立 System Tray，確保關閉視窗不退出。

## 檔案範圍

`package.json`, `electron.vite.config.ts`, `vitest.config.ts`, `tsconfig*.json`,
`src/main/index.ts`, `src/preload/index.ts`, `src/renderer/App.tsx`, `src/renderer/index.html`,
`src/shared/ipc-channels.ts`, `src/shared/types.ts`, `src/main/tray.ts`, `resources/tray-icon.png`

## 實作要點

- electron-vite 標準目錄：`src/main/`, `src/preload/`, `src/renderer/`, `src/shared/`
- 安裝：`zustand`, `bonjour-service`, `electron-conf`, `@electron-toolkit/typed-ipc`
- 定義所有 IPC channel type map（16 個 channels：get-current-state, device-found, device-lost, backup-progress, backup-complete, start-backup, cancel-backup, get-settings, save-settings, validate-path, scan-devices, pair-device, unpair-device, add-device-manual, get-history, mdns-status）
- 共用型別：`Device`, `BackupJob`, `Settings`, `AppState`, `SyncDirection`, `SyncFileType`, `PairedDevice`, `BackupTask`, `BackupManager`
- preload 暴露 typed contextBridge API（invoke + on/off listener）
- Tray：右鍵選單（開啟設定 / 立即掃描 / 立即備份 / 退出）
- 關閉視窗時 `event.preventDefault()` + `win.hide()`
- GC 防護：Tray 用模組層級全域變數
- 初始化順序：`app.setAppUserModelId()` -> `app.whenReady()` -> `createWindow()` -> `createTray()` -> ...
- AppUserModelId：開發 `process.execPath`，生產 `com.autobackup.app`

## 驗收條件

- [ ] `npm run dev` 成功啟動 Electron 視窗
- [ ] Tray icon 出現，右鍵選單可操作
- [ ] 關閉視窗不退出（只隱藏）
- [ ] `npm run typecheck` 通過
- [ ] IPC type map 全部 16 個 channel 定義完成
