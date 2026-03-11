---
id: TASK-010
title: PoC — libimobiledevice macOS Sequoia 相容性驗證
status: in_progress
priority: high
worktree: ".worktrees/TASK-010"
branch: "task/TASK-010"
created: 2026-03-11T00:00:00Z
updated: 2026-03-11T00:00:00Z
---

## 描述

驗證 libimobiledevice 在 macOS Sequoia (arm64) 環境下是否能正常存取 iPhone DCIM。
這是 USB 備份功能的最高風險假設，必須先通過 PoC 才能進入實作。

## 驗收條件

- [ ] `brew install libimobiledevice ifuse` 成功安裝（記錄版本號）
- [ ] iPhone 透過 USB 連接後，`idevice_id -l` 能列出裝置 UDID
- [ ] `idevicepair pair` 完成 Trust 配對
- [ ] `ifuse ~/mnt/iphone` 能掛載 iPhone 檔案系統
- [ ] `ls ~/mnt/iphone/DCIM/` 能列出照片目錄
- [ ] `fusermount -u ~/mnt/iphone`（或 `umount`）能正常卸載
- [ ] 記錄 iOS 版本、macOS 版本、libimobiledevice 版本

## 備註

- 若 ifuse 掛載失敗，測試備選方案：`idevicebackup2`
- iOS 18 USB Restricted Mode：測試 iPhone 鎖定 1hr 後是否仍可存取
- 結果記錄至 `dev-log/TASK-010_poc-libimobiledevice/poc-result.md`
