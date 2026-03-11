---
id: TASK-011
title: PoC — node-usb hotplug on Electron（macOS arm64）
status: pending
priority: high
worktree: ""
branch: ""
created: 2026-03-11T00:00:00Z
updated: 2026-03-11T00:00:00Z
---

## 描述

驗證 node-usb 能在 Electron main process 中監聽 iPhone USB 插入/拔出事件。
確認 native module rebuild 流程與 electron-builder 打包相容性。

## 驗收條件

- [ ] `npm install usb` 成功，並以 `electron-rebuild` 重新編譯
- [ ] Electron app 啟動後，插入 iPhone 觸發 `usb.on('attach')` 事件
- [ ] 能過濾 Apple Vendor ID `0x05AC`，正確識別為 iPhone
- [ ] 拔出 iPhone 觸發 `usb.on('detach')` 事件
- [ ] `npm run build:mac` 打包後，DMG 安裝版同樣能正常觸發事件
- [ ] 結果記錄至 `dev-log/TASK-011_poc-node-usb/poc-result.md`

## 備註

- 若 node-usb 有問題，測試備選：`@serialport/bindings-cpp`
- 需確認 macOS 是否需要額外 entitlements（USB access）
