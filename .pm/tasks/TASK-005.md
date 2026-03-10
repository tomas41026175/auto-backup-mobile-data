---
id: TASK-005
title: 整合測試 + 打包
status: done
priority: medium
worktree: ".worktrees/TASK-005"
branch: "task/TASK-005"
created: 2026-03-10T00:00:00Z
updated: 2026-03-10T00:00:00Z
---

## 描述

撰寫整合測試（完整備份流程 mock 環境），設定 electron-builder 打包為 Windows NSIS installer，
確保全部測試 + typecheck 通過，可產出可安裝的 Windows 應用程式。

## 前置條件

TASK-001–004 全部完成後才能開始。

## 檔案範圍

`electron-builder.yml`, `tests/integration/backup-flow.test.ts`, `vitest.config.ts`

## 實作要點

- 整合流程測試：裝置上線 → debounce 30 秒 → 通知 → 觸發備份 → 進度更新 → 完成（全 mock 環境）
- `vitest.config.ts`：使用 `test.projects` 分離 main/renderer 測試環境
- electron-builder.yml：Windows NSIS 打包，開機自啟動選項
- `bonjour-service` 為純 JS 套件，不需 `asarUnpack` 或 `electron-rebuild`
- 確認 `npm run build` 可成功產出 `.exe` installer

## 驗收條件

- [ ] `npx vitest run` 全部測試通過（unit + integration）
- [ ] `npm run typecheck` 通過
- [ ] `npm run build` 成功產出 Windows `.exe` installer
- [ ] 整合測試覆蓋核心流程（裝置偵測 → 通知 → 備份 → 完成）
