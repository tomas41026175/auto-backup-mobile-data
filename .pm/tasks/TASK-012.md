---
id: TASK-012
title: UsbDeviceMonitor service（node-usb hotplug + idevice CLI wrapper）
status: pending
priority: high
worktree: ""
branch: ""
created: 2026-03-11T00:00:00Z
updated: 2026-03-11T00:00:00Z
---

## 描述

實作 `UsbDeviceMonitor` service，整合 node-usb hotplug 事件與 libimobiledevice CLI，
偵測 iPhone 插入後自動取得裝置資訊，並透過 IPC 通知 renderer。
取代現有 mDNS 觸發備份的邏輯（mDNS 保留為裝置在線狀態顯示用）。

## 驗收條件

- [ ] 建立 `src/main/services/usb-device-monitor.ts`
- [ ] iPhone 插入時，自動執行 `idevice_id -l` 取得 UDID
- [ ] 執行 `ideviceinfo` 取得裝置名稱、iOS 版本
- [ ] 透過 IPC channel `device-usb-connected` 推送裝置資訊至 renderer
- [ ] iPhone 拔出時，透過 IPC channel `device-usb-disconnected` 推送
- [ ] 非 iPhone 裝置（Vendor ID 不符）不觸發
- [ ] `vitest` 單元測試：mock node-usb attach/detach 事件，驗證 IPC 推送行為
- [ ] 更新 `src/shared/ipc-channels.ts` 新增對應 channel 型別定義

## 備註

- 依賴 TASK-010、TASK-011 PoC 通過
- idevice CLI 呼叫使用 `child_process.execFile`，不用 shell injection 風險的 exec
