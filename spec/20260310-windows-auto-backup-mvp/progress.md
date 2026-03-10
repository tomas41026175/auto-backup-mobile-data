# Progress: Windows Auto Backup MVP

**Branch**: —（尚未建立）
**Phase**: planning
**Updated**: 2026-03-10

## 規劃階段完成項目

- [x] 初始架構設計
- [x] 架構審查 R1：深度審查（10 個發現）
- [x] 架構審查 R2：Anti-Over-Engineering（砍掉 6 項過度設計）
- [x] 架構審查 R3：技術細節驗證（mDNS service type、目錄結構、typed IPC）
- [x] 架構審查 R4：紅隊攻擊（致命假設驗證、Task 合併、Plan B）
- [x] 架構審查 R5：收斂定稿
- [x] 工作流程驗證（7 個流程、27 個操作點、16 IPC channels、4 缺口修復）
- [x] 架構審查 R6：研究資料交叉比對（4 P0 / 8 P1 / 3 P2，9 份研究文件 vs spec 全面校驗）
- [x] 架構審查 R7：Spec 決策修正（12 項修正：electron-conf 替換、_airplay 備援移除、GC 防護、初始化順序等）
- [x] 架構審查 R8：Task 實作細化（27 個已知陷阱、依賴版本鎖定、IPC type map 草稿、共用型別定義）

## 規劃階段完成項目（續）

- [x] 跨平台研究（7 份研究文件：mDNS / Notification / Tray / Window-Dock / LoginItems / electron-builder macOS / 檔案路徑）
- [x] 跨平台架構決策記錄（ADR: `docs/adr-cross-platform.md`）
- [x] 系統架構圖新增跨平台分層圖（第 4 張圖）
- [x] Spec Non-Goals 更新跨平台說明
- [x] 架構審查 R9：跨平台架構整理

## 規劃階段完成項目（UI + 雙向同步）

- [x] UI 設計完成
  - Layout Shell（AppLayout：72px sidebar + 32px draggable header + close button）
  - Dashboard（三種狀態：idle/backing-up/error；mDNS banner；PairedDeviceCard；QuickStats）
  - Settings（6 section；per-device FileTypeChip accordion；SyncDirectionSelector；Plan B 手動 IP）
  - History（BackupRecord 列表；狀態篩選；時間篩選；關鍵字搜尋）
  - Design System（globals.css：TailwindCSS v4 @theme，全語意化色彩 token）
- [x] PC → Mobile 雙向同步研究（6 份文件）
  - `research/pc-to-mobile/01-ios-sandbox.md`：iOS 沙盒未放寬，Photo Library 外部不可寫
  - `research/pc-to-mobile/02-afc-libimobiledevice.md`：v1.4.0，Windows usbmuxd 不完整
  - `research/pc-to-mobile/03-wifi-transfer.md`：LocalSend 架構參考；iOS 背景限制
  - `research/pc-to-mobile/04-existing-tools.md`：iMazing/AnyTrans/WALTR Pro 技術路線
  - `research/pc-to-mobile/05-ios-app-requirements.md`：自動同步**必須有** iOS App，MVP 2-3 週
  - `research/pc-to-mobile/06-electron-nodejs.md`：Express HTTP server + URLSession 雙向通訊
- [x] 架構審查 R10：雙向同步擴充性
  - 新增 `SyncDirection` 型別（mobile-to-pc / pc-to-mobile / bidirectional）
  - 新增 `SyncFileType[]` per-device 設定結構
  - BackupManager interface 預留 direction + syncTypes 欄位
  - IPC channel 預留（sync-direction-changed, get-sync-capabilities）
  - UI SyncDirectionSelector：PC→Mobile 標示 "Soon"（disabled）
- [x] 架構審查 R11：整合一致性審查
  - **P0 修正**：Set→Array 序列化規則（IPC 邊界禁用 Set，改為 Array）
  - BackupRecord 新增 syncTypes / direction 欄位，與 BackupTask 對齊
  - 未採用 3 項（MockBackupManager 行為、getStatus 重複、BackupJob 內部細節）
- [x] 架構審查 R12：Anti-Complexity 最終審查
  - BackupTask.syncTypes → optional（undefined = all types）
  - direction 維持 required
  - 架構健康評分 4/10（MVP 合理範圍）
  - T2 mDNS 識別為最高風險，建議 T1 完成後立即實機驗證

## 待執行 Tasks

- [ ] Task 1: 專案初始化 + IPC 型別層 + Tray 常駐
- [ ] Task 2: mDNS 裝置偵測 + 通知 + Mock 備份
- [ ] Task 3: Settings 頁面（裝置配對 + 路徑設定 + 手動 IP）
- [ ] Task 4: Dashboard + 備份歷史 + Router
- [ ] Task 5: 整合測試 + 打包

## 開發前阻擋項

- [ ] mDNS 實機驗證（Windows + iPhone 螢幕鎖定場景，預估 1-2 小時）

## Log

- 2026-03-10: 建立 spec，完成五輪架構優化 + 工作流程驗證
- 2026-03-10: 完成 R6/R7/R8 三輪研究整合審查，spec 已整合 9 份研究結論，所有 Decision Lock 更新完畢
- 2026-03-10: 完成跨平台研究（7 份文件）+ 跨平台 ADR + 系統架構圖更新 + R9 架構整理
- 2026-03-10: 完成 UI 設計（Layout Shell / Dashboard / Settings / History）+ Design System（TailwindCSS v4 @theme）
- 2026-03-10: 完成 PC→Mobile 雙向同步研究（6 份文件）+ entities.md + 00-index.md；確認 iOS 沙盒限制，Post-MVP 路線為 WiFi HTTP + iOS App
- 2026-03-10: 完成 R10/R11/R12 三輪架構審查；新增 SyncDirection/SyncFileType 型別；P0 Set→Array 序列化規則；BackupTask.syncTypes optional；docs/00-index.md 更新雙向同步研究索引
