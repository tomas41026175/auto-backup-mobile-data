# Spec: {任務標題}

**Task**: {任務描述}
**Started**: {ISO timestamp, e.g. 2026-03-11T10:00:00+08:00}
**Phase**: planning
**Mode**: complex-issue

---

## Impact Summary

<!-- 標示本次變更影響的 Electron 層級 -->

| Layer | 影響 | 說明 |
|-------|------|------|
| **main** | {yes/no} | {影響的 service 或 handler} |
| **preload** | {yes/no} | {是否需要新增 contextBridge API} |
| **renderer** | {yes/no} | {影響的 page/component/store} |
| **shared** | {yes/no} | {types.ts 或 ipc-channels.ts 變更} |

### 與現有 Service 的整合點

<!-- 列出本次功能與既有 service 的交互。不相關的刪除 -->

| Service | 整合方式 | 說明 |
|---------|---------|------|
| **BackupManager** | {呼叫 / 被呼叫 / 事件監聽 / 無關} | {如：備份完成後觸發通知} |
| **DeviceScanner** | {呼叫 / 被呼叫 / 事件監聯 / 無關} | {如：裝置上線時啟動備份} |
| **NotificationService** | {呼叫 / 被呼叫 / 事件監聽 / 無關} | {如：備份錯誤時推送通知} |
| **SettingsStore** | {讀取 / 寫入 / 無關} | {如：讀取 pairedDevices 清單} |
| **BackupHistoryStore** | {讀取 / 寫入 / 無關} | {如：寫入備份紀錄} |

### IPC Channel 變更

<!-- 完整列出新增與修改的 channel -->

| Channel | 方向 | 型別 | 用途 | 新增/修改 |
|---------|------|------|------|----------|
| `{channel-name}` | {renderer -> main / main -> renderer} | {payload -> returnType} | {用途} | {新增/修改} |

### 系統層依賴

<!-- 列出所有 OS 層級的依賴 -->

- **brew 工具**: {如 libimobiledevice (`idevicepair`, `ifuse`, `ideviceinfo`)}
- **npm native 套件**: {如 node-usb（需 electron-rebuild）}
- **macOS 系統服務**: {如 launchd plist（開機自啟動）、usbmuxd}
- **Entitlements**: {如 com.apple.security.device.usb}

### macOS 權限注意事項

<!-- 列出可能需要的系統權限與對 App 行為的影響 -->

| 權限 | 用途 | 影響 |
|------|------|------|
| {NSLocalNetworkUsageDescription} | {mDNS 裝置掃描} | {首次啟動彈出授權對話框} |
| {USB Restricted Mode} | {USB 裝置存取} | {iPhone 需解鎖並信任此電腦} |
| {SMAppService} | {開機自啟動} | {macOS 13+ 的 Login Item 註冊方式} |

---

## Decision Lock

<!-- 已與使用者確認，執行階段不推翻 -->

- {決策 1}
- {決策 2}

## Claude 裁量範圍

<!-- 細節由 Claude 自行決定，無需詢問 -->

- {項目}

## Non-Goals

<!-- 至少列出 3 項明確排除的範圍，防止 scope creep -->

- {Non-goal 1}: {排除原因}
- {Non-goal 2}: {排除原因}
- {Non-goal 3}: {排除原因}

## Acceptance Criteria

- [ ] {AC 描述} -- verify: {如何確認，可為命令或手動步驟}
- [ ] {AC 描述} -- verify: {如何確認}

## Risk Assessment

| 風險 | 等級 | 影響 | 緩解措施 |
|------|------|------|---------|
| {如：libimobiledevice CLI 版本不相容} | {高/中/低} | {功能無法運作} | {PoC 驗證 + 版本鎖定} |
| {如：mDNS 在特定路由器不可用} | {高/中/低} | {裝置偵測失敗} | {手動 IP 輸入 Plan B} |

---

## PoC 驗證步驟

<!-- 若涉及新硬體/協定/native 套件整合，必須先做 PoC。無需 PoC 時整段刪除 -->

**目的**: {驗證什麼假設，如：libimobiledevice 能否在 macOS 上透過 USB 讀取 iPhone 照片}

**步驟**:
1. {如：`brew install libimobiledevice` + `idevicepair pair`}
2. {如：`ifuse /tmp/iphone-mount` 掛載 AFC 目錄}
3. {如：`ls /tmp/iphone-mount/DCIM/` 確認照片可讀取}

**成功標準**: {如：能列出 DCIM 目錄下的照片檔案}
**失敗備案**: {如：改用 node-usb 直接實作 AFC 協定}

---

## 工作流程驗證

<!-- 描述 2-3 個關鍵使用者流程，確保 spec 完整覆蓋 -->

### Flow 1: {流程名稱，如：USB 連接自動備份}

```
{前置條件}
  -> {步驟 1}
  -> {步驟 2}
  -> [分支 a] {正常路徑} -> {結果} ✓
  -> [分支 b] {錯誤路徑} -> {處理方式} ✓
```

**涉及 Task**: {T1, T3}
**涉及 AC**: {#1, #2}

### Flow 2: {流程名稱}

```
{同上格式}
```

---

## Shared Types 變更

<!-- 列出需要新增或修改的 shared types，確保 main/renderer 對齊 -->

```typescript
// 新增的型別（寫入 src/shared/types.ts）
{type / interface 定義}
```

---

## Task Plan

<!-- 依 main/shared/renderer 分層排列，每個 Wave 內的 Task 可平行執行 -->

### Wave 1: Shared Types + Main Services

<!-- 先建 shared types 和 main 層 service，確保 IPC 可用 -->

**Task 1: {名稱}**
- Files: `{精確路徑}`
- Action: {具體說明，含要避免的做法}
- Verify: `{可直接執行的命令}`
- Done: {明確的完成標準}

**Task 2: {名稱}**
- Files: `{精確路徑}`
- Action: {具體說明}
- Verify: `{可直接執行的命令}`
- Done: {明確的完成標準}

### Wave 2: IPC Handlers + Preload

<!-- 連接 main service 與 renderer -->

**Task 3: {名稱}**
- Files: `{精確路徑}`
- Action: {具體說明}
- Verify: `{可直接執行的命令}`
- Done: {明確的完成標準}

### Wave 3: Renderer UI + Store

<!-- 前端頁面與狀態管理 -->

**Task 4: {名稱}**
- Files: `{精確路徑}`
- Action: {具體說明}
- Verify: `{可直接執行的命令}`
- Done: {明確的完成標準}

### Wave 4: 整合測試 + 收尾

**Task 5: {名稱}**
- Files: `{精確路徑}`
- Action: {具體說明}
- Verify: `{可直接執行的命令}`
- Done: {明確的完成標準}

---

## 測試策略

**需 mock 的 API**:
- Electron: {BrowserWindow, dialog, Notification, systemPreferences}
- Node native: {node-usb 的 usb.getDeviceList(), child_process.exec (libimobiledevice CLI)}
- Network: {bonjour-service 的 Browser/Service 物件}

**測試範圍**:
- Unit: {列出需要單元測試的模組}
- Integration: {列出需要整合測試的流程}

---

## Deviation Rules

**自動修復**（不需回報，直接處理）：
- bug、型別錯誤、lint、缺少 import
- loading state、error state 補充
- Zustand store 型別對齊
- TailwindCSS class 調整
- Vitest 測試修正

**停止回報**（必須回報，等待確認）：
- 新增/修改 IPC channel type map
- 改變核心偵測邏輯（mDNS / USB / AFC）
- 影響 5+ 個 plan 外的檔案
- 引入新的 npm 套件（尤其 native 套件）
- 變更 electron-conf store schema
- 新增 Non-Goals 中明確排除的功能
- 改變 macOS 權限需求（影響 entitlements）
