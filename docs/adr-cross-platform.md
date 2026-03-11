# ADR: 跨平台擴展策略（Windows → macOS）

**日期**: 2026-03-10
**更新**: 2026-03-11（加入個人使用方案、三輪程式碼審查發現）
**狀態**: 已接受

## 背景

Windows Auto Backup MVP 以 Windows 為唯一目標平台完成架構設計與八輪審查。在 MVP 開發前，透過七份跨平台研究文件（mDNS、Notification、Tray、Window/Dock、LoginItems、electron-builder macOS、檔案路徑）評估未來擴展至 macOS 的可行性與工作量。

本 ADR 記錄跨平台擴展的架構決策，確保 MVP 開發時在關鍵位置預留 platform guard 空間，避免 Post-MVP 移植時需要大規模重構。

## 決策

### 三層分類

#### 共用層（Shared Layer）-- 不需要 platform branch

| 元件 | 原因 |
|------|------|
| `bonjour-service` mDNS 偵測邏輯 | 純 JS UDP socket，底層 `multicast-dns` 跨平台行為一致 |
| IPC type map + channels (`src/shared/`) | 與平台無關，純 TypeScript 型別定義 |
| Zustand stores (`src/renderer/stores/`) | 純前端狀態管理，與平台無關 |
| React UI 頁面與元件 | 純 Web 技術，完全跨平台 |
| `BackupManager` interface | 抽象層隔離實作細節 |
| `BackupHistoryRepository` interface | 抽象層隔離儲存細節 |
| `electron-conf` 資料儲存 | 跨平台支援 |
| `fs.existsSync` 路徑驗證 | Node.js 跨平台 API |
| DeviceScanner 核心邏輯（debounce、配對比對、TCP ping） | 純邏輯，與平台無關 |

#### Platform Branch 層 -- 需要 `process.platform` 條件分支

| 元件 | Windows 實作 | macOS 實作 | 影響檔案 |
|------|-------------|-----------|---------|
| AppUserModelId | `app.setAppUserModelId()` 必須呼叫 | 無此 API，跳過 | `src/main/index.ts` |
| Notification 選項 | `toastXml` / `timeoutType` 可用 | 不支援，省略 | `src/main/services/notification-service.ts` |
| Notification 焦點 workaround | `setAlwaysOnTop` 三行修復 | 不需要 | `src/main/services/notification-service.ts` |
| Tray icon 格式 | ICO 多尺寸 | Template PNG 黑白 | `src/main/tray.ts`, `resources/` |
| Tray 觸發事件 | `double-click` 開啟視窗 | `click` 開啟視窗 | `src/main/tray.ts` |
| Tray Context Menu | `setContextMenu()` | `popUpContextMenu()` + `right-click` | `src/main/tray.ts` |
| Dock / Taskbar 隱藏 | `win.setSkipTaskbar(true)` | `app.dock.hide()` | `src/main/index.ts` |
| `app.on('activate')` | 不觸發 | 必須處理（重新顯示視窗） | `src/main/index.ts` |
| `window-all-closed` | 呼叫 `app.quit()`（但 MVP 已用 hide 模式） | 不呼叫 `app.quit()` | `src/main/index.ts` |
| `dialog.showOpenDialog` 選項 | `promptToCreate` | `createDirectory` | `src/main/ipc-handlers.ts` |
| 開機自啟動 | Registry，開發版可用 | `SMAppService`，需簽名 | `src/main/index.ts` |
| 打包格式 | NSIS `.exe` | DMG `.dmg` | `electron-builder.yml` |

#### 平台專屬層 -- 不共用，macOS 需獨立處理

| 項目 | 說明 |
|------|------|
| macOS Code Signing | 需 Apple Developer 帳號（$99/年）+ Developer ID Application 憑證 |
| macOS Notarization | `@electron/notarize` afterSign hook，公開發佈幾乎必須 |
| macOS entitlements | `entitlements.mac.plist`（JIT、unsigned memory、network） |
| macOS Info.plist 擴展 | `NSLocalNetworkUsageDescription`（macOS 15+ 強制）+ `NSBonjourServices` |
| macOS Gatekeeper 繞過 | macOS 15 移除 Control-Click 繞過，未簽名體驗極差 |
| macOS Universal Binary | arm64 + x64 合併打包，`@electron/universal` |
| Tray Template Image 設計稿 | 需設計黑白 16x16 + 32x32@2x PNG |
| 外接硬碟路徑 UI | `/Volumes/DriveName/` 瀏覽，與 Windows 磁碟代號完全不同 |

## Platform Branch 實作規範

### process.platform 使用規則

1. **集中管理**：所有 `process.platform` 判斷應集中在少數入口點（`index.ts`、`tray.ts`、`notification-service.ts`），避免散佈在業務邏輯中

2. **MVP 階段預留模式**：
   ```typescript
   // 推薦寫法：MVP 只實作 win32，但結構已預留 darwin
   if (process.platform === 'win32') {
     app.setAppUserModelId(appId)
   }
   // 未來 macOS 移植時，只需加入 else if ('darwin') 分支
   ```

3. **不做過早抽象**：MVP 不建立 platform adapter / strategy pattern。直接使用 `if (process.platform)` 即可。只有當 platform branch 超過 3 個檔案出現相同判斷時，才考慮抽出 utility

4. **Tray 是最大分歧點**：`tray.ts` 預期需要最多 platform 判斷（icon 格式、事件綁定、context menu 方式）。建議在 `tray.ts` 中以函式分段組織，而非拆成多檔案

### MVP 開發時的具體預留項目

| 位置 | 預留動作 | 原因 |
|------|---------|------|
| `src/main/index.ts` | `setAppUserModelId` 用 `win32` guard 包覆 | macOS 無此 API |
| `src/main/tray.ts` | Tray 事件用 `win32` guard 包覆 `double-click` | macOS 用 `click` |
| `src/main/services/notification-service.ts` | `toastXml` / `timeoutType` 用 `win32` guard | macOS 不支援 |
| `src/main/services/notification-service.ts` | `setAlwaysOnTop` workaround 用 `win32` guard | macOS 不需要 |
| `electron-builder.yml` | 僅配置 `win` 區塊 | macOS 配置 Post-MVP 加入 |

## macOS 特有前置條件

### 必要條件（公開發佈）

1. **Apple Developer Program 會員**：$99/年，用於取得 Developer ID Application 憑證
2. **Code Signing**：hardened runtime + entitlements plist
3. **Notarization**：`@electron/notarize` + afterSign hook + app-specific password
4. **Info.plist 擴展**：
   - `NSLocalNetworkUsageDescription`（macOS 15+ 強制，否則 mDNS 無法使用）
   - `NSBonjourServices`（宣告 `_companion-link._tcp`）
5. **entitlements.mac.plist**：
   - `cs.allow-jit`（V8 引擎必要）
   - `cs.allow-unsigned-executable-memory`（V8 必要）
   - `cs.disable-library-validation`（載入 Electron 內部 framework）
   - `network.client` + `network.server`（mDNS UDP multicast）

### 選擇性條件

- **Universal Binary**（arm64 + x64）：公開發佈建議啟用，涵蓋所有 Mac
- **Mac App Store**：需 sandbox + 可能需申請 `com.apple.developer.networking.multicast`
- **Template Image 設計**：需黑白 PNG 設計稿（16x16 + 32x32@2x）

### 已知風險

| 風險 | 嚴重度 | 說明 |
|------|--------|------|
| electron-builder Mach-O UUID 碰撞 | 中 | Issue #9158 標記 not planned，影響本地網路授權 |
| macOS Sequoia mDNSResponder bug | 低 | 已有 workaround，與 Node.js 無關 |
| SMAppService 開發環境限制 | 中 | 開機自啟動在開發模式無法測試，需簽名環境 |

## 後果

### 正面

- MVP 開發時 platform guard 僅增加約 10-15 行程式碼，幾乎不影響開發速度
- Post-MVP macOS 移植時，共用層（約 70% 程式碼）不需要任何修改
- Platform branch 層（約 20% 程式碼）只需新增 `darwin` 條件分支
- 平台專屬層（約 10% 程式碼）為全新建立，不影響現有程式碼

### 負面

- macOS 公開發佈的前置成本高（Developer 帳號 + Notarization 流程建立約需 1 週）
- macOS 15+ 權限收緊，未簽名 App 的使用者體驗遠差於 Windows SmartScreen
- Tray 行為差異大，需要充分的 macOS 實機測試

### 風險緩解

- macOS 移植優先做內部測試版（不簽名，手動 xattr 繞過），驗證功能正確性
- 確認產品方向後再投入 Notarization（$99/年 + 流程建立時間）
- Tray 行為差異已有完整研究文件（03-tray-macos-vs-windows.md），可直接參考實作

---

## macOS 個人使用方案（2026-03-11 確認）

### 前提與範圍

目標：個人使用，不公開發佈。

**排除項目（永遠不做）**：
- Code Signing / Notarization（需 $99/年 Apple Developer 帳號）
- entitlements.mac.plist（hardened runtime，個人用不需要）
- Universal Binary（arm64 本機 build 即可）
- 開機自啟動（SMAppService 需簽名環境，無法在開發版測試）
- Mac App Store

**Gatekeeper 繞過**（一次性）：
```bash
xattr -d com.apple.quarantine /Applications/AutoBackup.app
```

### 前置驗證（Phase 0，必做）

**最大阻斷風險**：macOS 15+ 對未簽名 App 是否正常顯示「本地網路存取」權限對話框，行為不確定。

驗證步驟：
1. `npm run build:mac` 產出 DMG
2. 安裝後執行 `xattr -d com.apple.quarantine /Applications/AutoBackup.app`
3. 啟動 App，觀察是否彈出本地網路權限對話框
4. 確認 mDNS 能收到封包

**Gate**：Phase 0 通過才進入 Phase 1。若失敗 → 評估 ad-hoc 簽名（`identity: "-"`）。

### 實作清單（三輪程式碼審查確認）

#### Phase 1：Platform Branch 修改（約 1 天）

| # | 修改 | 檔案 | 說明 |
|---|------|------|------|
| 1 | 新增 `showMainWindow` 共用函式（含 `win32` guard） | `src/main/utils/window-utils.ts`（新） | 提取 tray.ts + notification-service.ts 重複的 `setAlwaysOnTop` workaround |
| 2 | `isQuitting` flag + `before-quit` 設定 | `src/main/index.ts` | 修正 `Cmd+Q` 無法退出 App（`close` handler 無條件 `preventDefault`） |
| 3 | `app.on('activate')` 補上「視窗存在但隱藏時 `.show()`」 | `src/main/index.ts` | 現有邏輯只處理「無視窗時建立新視窗」，漏掉隱藏視窗情況 |
| 4 | `app.dock.hide()` darwin guard | `src/main/index.ts` | 在 `whenReady()` 回調內、`createWindow()` 之後加入 |
| 5 | `select-backup-path` handler：加 `createDirectory` + darwin `defaultPath: '/Volumes'` | `src/main/index.ts` | 目前只有 `openDirectory`，缺少 macOS 所需選項 |
| 6 | Tray icon 路徑切換（darwin → `iconTemplate.png`） | `src/main/tray.ts` | Electron 識別 `Template` 結尾自動處理深/淺色主題 |
| 7 | Tray 事件：darwin `click`，win32 `double-click` | `src/main/tray.ts` | macOS 用單擊，Windows 用雙擊 |
| 8 | Tray context menu：darwin 改用 `right-click` + `popUpContextMenu()` | `src/main/tray.ts` | `setContextMenu()` 在 macOS 會阻擋 `click` 事件 |
| 9 | `showMainWindow` 改用共用函式 | `src/main/tray.ts` | 移除重複的 `setAlwaysOnTop` workaround |
| 10 | `setAlwaysOnTop` workaround 改用共用函式（加 win32 guard） | `src/main/services/notification-service.ts` | macOS 不需要焦點 workaround |
| 11 | autoStart Toggle 在 macOS 隱藏或顯示 disabled 狀態 | `src/renderer/src/pages/Settings.tsx` | autoStart 儲存後實際上無任何效果（任何平台均未接線），macOS 個人版不支援 |

#### Phase 2：electron-builder 打包（約 0.5 天）

| # | 修改 | 檔案 |
|---|------|------|
| 1 | 加入 `mac` 區塊（target: dmg，`identity: null`，不簽名） | `electron-builder.yml` |
| 2 | `extendInfo`：`NSLocalNetworkUsageDescription` + `NSBonjourServices: ['_companion-link._tcp']` | `electron-builder.yml` |
| 3 | 加入 `build:mac` script | `package.json` |

#### Phase 3：Tray Template Image（約 0.5 天）

| # | 修改 | 說明 |
|---|------|------|
| 1 | 製作 `iconTemplate.png`（16x16）+ `iconTemplate@2x.png`（32x32） | `resources/` | 純黑色 + alpha，PNG-24，Electron 自動反色 |

### 程式碼審查發現（三輪，2026-03-11）

審查實際程式碼後，對原始提案的修正：

**不需要改（原本以為需要）**：
- `setAppUserModelId`：index.ts L16-18 已有 `win32` guard ✅
- Notification `toastXml`/`timeoutType`：notification-service.ts 完全未使用這些選項 ✅
- `window-all-closed`：現有空 handler 在 macOS 行為正確 ✅

**新增發現（原提案遺漏）**：
- `isQuitting` flag 缺失 → `Cmd+Q` 無法退出 App（`close` handler 攔截所有關閉事件）
- `activate` 邏輯不完整 → 視窗存在但隱藏時不會 `show()`
- `autoStart` Toggle 是 Dead UI → 儲存後任何平台均無效果（main process 未呼叫 `app.setLoginItemSettings()`）
- PathPicker 使用 `window.electron.ipcRenderer.invoke` 繞過 typed IPC（架構不一致，但不影響功能與移植）

### 工作量估算

| Phase | 估時 |
|-------|------|
| Phase 0 驗證 | 0.5 天 |
| Phase 1 platform branch | 1 天 |
| Phase 2 打包 | 0.5 天 |
| Phase 3 Template Image | 0.5 天 |
| **合計** | **約 2.5 天** |

---

## 關聯文件

- 跨平台研究總索引 → [research/cross-platform/00-master-index.md](./research/cross-platform/00-master-index.md)
- 系統架構圖（含跨平台分層圖） → [system-diagrams.md](./system-diagrams.md)
- 主 Spec → [../spec/20260310-windows-auto-backup-mvp/spec.md](../spec/20260310-windows-auto-backup-mvp/spec.md)
