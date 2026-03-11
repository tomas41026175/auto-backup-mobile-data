---
id: TASK-007
title: Phase 1 — macOS Platform Branch 修改（主程序）
status: done
priority: high
worktree: ".worktrees/TASK-007"
branch: "task/TASK-007"
created: 2026-03-11T00:00:00Z
updated: 2026-03-11T00:00:00Z
---

## 描述

對 Electron 主程序（main process）加入 macOS platform branch，使 App 能在 macOS 上正常運作。
包含視窗生命週期修正、Tray 行為適配、通知焦點 workaround 隔離、以及 PathPicker 路徑適配。

**前置條件**：TASK-006 驗證 PASS。

## 實作項目

### 1. 新增 `src/main/utils/window-utils.ts`（共用函式）

提取 `tray.ts` 和 `notification-service.ts` 重複的 `showMainWindow` 邏輯，加入 platform guard：

```typescript
export function showMainWindow(win: BrowserWindow): void {
  if (win.isVisible()) {
    if (process.platform === 'win32') {
      win.setAlwaysOnTop(true)
      win.focus()
      win.setAlwaysOnTop(false)
    } else {
      win.focus()
    }
  } else {
    win.show()
    if (process.platform === 'win32') {
      win.setAlwaysOnTop(true)
      win.focus()
      win.setAlwaysOnTop(false)
    }
  }
}
```

### 2. `src/main/index.ts` 修改

- **`isQuitting` flag**：加入模組層級 `let isQuitting = false`
  - `app.on('before-quit')` 中設 `isQuitting = true`
  - `mainWindow.on('close')` 改為：`if (!isQuitting) { event.preventDefault(); win.hide() }`
  - 修正 `Cmd+Q` 無法退出的問題
- **`app.on('activate')`**：補上「視窗存在但隱藏時 `mainWindow.show()`」
- **`app.dock.hide()`**：在 `whenReady()` 內、`createWindow()` 後加 `if (process.platform === 'darwin') app.dock?.hide()`
- **`select-backup-path` handler**：
  - 加入 `createDirectory` 到 `properties`
  - darwin 時加 `defaultPath: '/Volumes'`

### 3. `src/main/tray.ts` 修改

- **Icon 路徑**：darwin 使用 `iconTemplate.png`，win32 使用 `icon.png`
- **Tray 事件**：darwin 綁 `click`，win32 綁 `double-click`
- **Context Menu**：darwin 改用 `right-click` 事件 + `tray.popUpContextMenu(contextMenu)`（不用 `setContextMenu`，會阻擋 `click`）
- **`showMainWindow`**：改用 `window-utils.ts` 的共用函式

### 4. `src/main/services/notification-service.ts` 修改

- 通知 click handler 的 `setAlwaysOnTop` workaround 改用 `window-utils.ts` 的共用函式（自動含 win32 guard）

### 5. `src/renderer/src/pages/Settings.tsx` 修改

- autoStart Toggle 處理（任何平台均未接線，屬 Dead UI）：
  - 直接隱藏 Toggle（最簡）或顯示 disabled 狀態並標注「此版本不支援」

## 驗收條件

- [ ] 新增 `src/main/utils/window-utils.ts`，包含 platform-aware `showMainWindow`
- [ ] `Cmd+Q`（macOS）/ Alt+F4（Windows）可正常退出 App
- [ ] macOS 點擊 Tray icon 可開啟主視窗（單擊）
- [ ] macOS 右鍵 Tray 可彈出 context menu
- [ ] macOS 使用 `select-backup-path` 時，對話框開啟到 `/Volumes/`
- [ ] `npm run typecheck` 通過
- [ ] `npx vitest run` 29/29 測試通過
- [ ] autoStart Toggle 不再以 dead state 顯示給用戶

## 參考

- `docs/adr-cross-platform.md` → macOS 個人使用方案 → Phase 1 實作清單
- 三輪程式碼審查紀錄（index.ts L43-46 close handler、L120-124 activate、tray.ts L64+L66）
