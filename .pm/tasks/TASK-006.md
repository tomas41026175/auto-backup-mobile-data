---
id: TASK-006
title: Phase 0 — macOS 前置驗證（mDNS 本地網路權限）
status: done
priority: high
worktree: ".worktrees/TASK-006"
branch: "task/TASK-006"
created: 2026-03-11T00:00:00Z
updated: 2026-03-11T00:00:00Z
---

## 描述

在實作 macOS 移植前，先驗證最大阻斷風險：未簽名 Electron App 在 macOS 15+ 是否能正常觸發「本地網路存取」權限對話框，並成功收到 mDNS 封包。

此任務的目的是確認方案可行性，**不做任何 platform branch 程式碼修改**。

## 驗證步驟

1. 在 `electron-builder.yml` 暫時加入最簡 `mac` 區塊（僅 target: dmg）
2. `npm run build:mac`（需先在 `package.json` 加入此 script）
3. 安裝 DMG 後執行：`xattr -d com.apple.quarantine /Applications/Auto\ Backup.app`
4. 啟動 App，觀察是否彈出「本地網路存取」權限對話框
5. 確認 bonjour-service mDNS 能正常收到封包（可在 Dashboard 觀察 mDNS 狀態）
6. 記錄驗證結果，決定後續方案

## 驗收條件

- [ ] `package.json` 加入 `build:mac` script
- [ ] `electron-builder.yml` 加入最簡 `mac` 區塊（包含 `NSLocalNetworkUsageDescription` + `NSBonjourServices`）
- [ ] 成功產出 `.dmg`
- [ ] 安裝並繞過 Gatekeeper 後 App 正常啟動
- [ ] 記錄本地網路權限對話框是否出現（PASS / FAIL）
- [ ] 記錄 mDNS 是否正常運作（PASS / FAIL）

## 備註

**Gate**：
- 驗證 PASS → 繼續 TASK-007（Phase 1）
- 驗證 FAIL → 評估 ad-hoc 簽名（`identity: "-"`），需更新計畫後再繼續

本任務加入的 `electron-builder.yml` mac 區塊為正式版本，不需在後續 TASK-008 重做。

## 參考

- `docs/adr-cross-platform.md` → macOS 個人使用方案 → Phase 0 節
