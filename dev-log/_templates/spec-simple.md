# Spec: {任務標題}

**Task**: {任務描述}
**Started**: {ISO timestamp, e.g. 2026-03-11T10:00:00+08:00}
**Phase**: planning
**Mode**: simple

---

## Impact Summary

<!-- 標示本次變更影響的 Electron 層級，未影響的刪除 -->

| Layer | 影響 | 說明 |
|-------|------|------|
| **main** | {yes/no} | {影響的 service 或 handler，如 device-scanner.ts} |
| **preload** | {yes/no} | {是否需要新增 contextBridge API} |
| **renderer** | {yes/no} | {影響的 page/component/store} |
| **shared** | {yes/no} | {types.ts 或 ipc-channels.ts 變更} |

### IPC Channel 變更

<!-- 若無 IPC 變更，整段刪除 -->

| Channel | 方向 | 型別 | 用途 |
|---------|------|------|------|
| `{channel-name}` | {renderer -> main / main -> renderer} | {payload -> returnType} | {用途說明} |

### 系統依賴

<!-- 若無外部依賴，整段刪除 -->

- **brew 工具**: {如 libimobiledevice, ifuse}
- **npm 套件**: {如 bonjour-service, node-usb}
- **macOS 權限**: {如 NSLocalNetworkUsageDescription}

---

## Decision Lock

<!-- 已與使用者確認，執行階段不推翻 -->

- {決策 1}
- {決策 2}

## Acceptance Criteria

- [ ] {AC 描述} -- verify: {如何確認，可為命令或手動步驟}
- [ ] {AC 描述} -- verify: {如何確認}

---

## Task Plan

<!-- 每個 Task 應有可 demo 的產出，最多 3 個 Task -->

**Task 1: {名稱}**
- Files: `{精確路徑，如 src/main/services/xxx.ts}`
- Action: {具體說明}
- Verify: `{可直接執行的命令，如 npm run test -- xxx.test.ts}`
- Done: {明確的完成標準}

**Task 2: {名稱}**
- Files: `{精確路徑}`
- Action: {具體說明}
- Verify: `{可直接執行的命令}`
- Done: {明確的完成標準}

---

## 測試策略

<!-- 標示需要 mock 的 Electron / Node API -->

**需 mock 的 API**:
- {如 BrowserWindow, dialog.showOpenDialog, Notification}
- {如 bonjour-service 的 Browser 物件}

**測試範圍**:
- Unit: {列出需要單元測試的模組}
- Integration: {列出需要整合測試的流程，若無可刪除}

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
- 引入新的 npm 套件
- 變更 electron-conf store schema
