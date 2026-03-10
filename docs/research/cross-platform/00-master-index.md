# Cross-Platform Research Master Index
# Windows → macOS 擴展可行性研究

**研究日期**: 2026-03-10
**面向數**: 7 個
**背景**: 評估現有 Windows MVP 架構擴展至 macOS 的工作量與風險

---

## 面向索引

| # | 面向 | 關鍵結論 | 文件 |
|---|------|---------|------|
| 01 | bonjour-service macOS vs Windows | **同一套 code 可用**；macOS 15+ 需 Info.plist 權限宣告 | [→](./01-mdns-macos-vs-windows.md) |
| 02 | Notification API 跨平台 | `setAppUserModelId` / `toastXml` 必須 win32 包覆；GC 問題兩平台都有 | [→](./02-notification-macos-vs-windows.md) |
| 03 | Tray 圖示與行為跨平台 | macOS 需 Template Image；click vs double-click 差異；`popUpContextMenu()` | [→](./03-tray-macos-vs-windows.md) |
| 04 | 視窗 / Dock / Taskbar | `app.on('activate')` macOS 專屬；`window-all-closed` 不同處理 | [→](./04-window-dock-macos-vs-windows.md) |
| 05 | setLoginItemSettings | macOS 13+ 需 `SMAppService` + 使用者核准；開發版不可靠 | [→](./05-login-items-macos-vs-windows.md) |
| 06 | electron-builder macOS DMG | macOS 15 移除繞過 Gatekeeper 方式；Notarization 幾乎必須 | [→](./06-electron-builder-macos.md) |
| 07 | 跨平台檔案路徑 | 外接硬碟路徑架構根本不同（磁碟代號 vs /Volumes）；UI 需分開設計 | [→](./07-file-path-cross-platform.md) |

---

## 跨面向洞察

### 可共用（不需 platform branch）

| 元件 | 原因 |
|------|------|
| `bonjour-service` mDNS 偵測邏輯 | 純 JS UDP socket，跨平台行為一致 |
| IPC type map + channels | 與平台無關 |
| Zustand stores | 與平台無關 |
| Renderer UI（React + Tailwind）| 純 Web，完全跨平台 |
| `BackupManager` interface | 抽象層隔離 |
| `electron-conf` 資料儲存 | 跨平台支援 |
| `fs.existsSync` 路徑驗證 | 跨平台 |

### 需要 platform branch

| 元件 | Windows | macOS | 對應文件 |
|------|---------|-------|---------|
| `setAppUserModelId` | 必須呼叫 | 無此 API，跳過 | 02 |
| `toastXml` / `timeoutType` | 支援 | 不支援，跳過 | 02 |
| Tray icon 格式 | ICO（多尺寸） | Template PNG（黑白） | 03 |
| Tray 觸發事件 | `double-click` | `click` | 03 |
| `app.dock.hide()` | 無此 API | 必須呼叫 | 04 |
| `app.on('activate')` | 不觸發 | 必須處理 | 04 |
| `window-all-closed` | 呼叫 `app.quit()` | 不呼叫 | 04 |
| `setLoginItemSettings` | Registry，開發版可用 | SMAppService，需簽名 | 05 |
| 打包格式 | NSIS `.exe` | DMG `.dmg` | 06 |
| Gatekeeper 繞過 | SmartScreen（可接受） | macOS 15 需系統設定手動放行（很差） | 06 |
| 外接硬碟路徑 | `D:\Backup\iPhone` | `/Volumes/DriveName/iPhone` | 07 |
| `dialog.showOpenDialog` 選項 | `promptToCreate` | `createDirectory` | 07 |

### 因果鏈

**macOS Gatekeeper 風險鏈**
- macOS 15 移除 Control-Click 繞過（06）→ 未簽名 app 需到系統設定手動放行
- 使用者體驗遠差於 Windows SmartScreen → macOS 版本若公開發佈**幾乎必須 Notarize**
- Notarization 需要：簽名 + hardened runtime + entitlements + Apple Developer 帳號（$99/年）

**macOS 權限收緊鏈**
- macOS 15+ `NSLocalNetworkUsageDescription` 必填（01）→ electron-builder 需設定 Info.plist
- macOS 13+ `SMAppService` 強制（05）→ 開機自啟需完整簽名，開發環境無法測試
- macOS 沙盒環境 multicast entitlement（01）→ Mac App Store 發布需額外申請

**路徑設計影響鏈**
- Windows 磁碟代號 vs macOS `/Volumes`（07）→ Settings UI 的路徑選擇元件需分開實作
- `dialog.showOpenDialog` 選項不同（07）→ IPC handler 需 platform 判斷

### 矛盾點

| 議題 | 說明 |
|------|------|
| electron-builder Mach-O UUID 碰撞 | Issue #9158 標記 not planned，影響 universal binary 的 asar 完整性，需關注後續更新 |
| macOS `setContextMenu` 阻擋 click | 設定 contextMenu 後無法監聽 click 事件；需改用 `popUpContextMenu()` 手動觸發，與 Windows 行為不同 |

---

## 跨平台擴展工作量估算

### 低工作量（< 1 天）
- `process.platform` 包覆 Windows 專用 API（setAppUserModelId、toastXml）
- Tray 事件從 double-click 改為 click（macOS）
- `window-all-closed` + `activate` 事件處理
- `app.dock.hide()` 呼叫

### 中工作量（1-3 天）
- Tray icon 準備 Template PNG（需設計稿）
- 外接硬碟路徑 UI 重新設計（磁碟選擇 vs /Volumes 瀏覽）
- electron-builder macOS 配置（entitlements、Info.plist、DMG）
- Universal Binary（arm64 + x64）打包測試

### 高工作量（1 週+）
- Apple Developer 帳號申請 + Code Signing 設定
- Notarization 流程建立（afterSign hook + @electron/notarize）
- macOS 13+ setLoginItemSettings 測試（需簽名環境）
- macOS 15 Local Network 權限實機測試

### 結論

**技術風險最高點**：macOS Notarization（公開發佈幾乎必須，且需付費 Developer 帳號）

**MVP 跨平台策略建議**：
1. Windows MVP 完成並驗證後再開始 macOS 移植
2. 先做內部測試版（不簽名，手動放行），驗證功能
3. 確認產品方向後再投入 Notarization

---

## 關聯文件

- Windows 研究索引 → [../master-index.md](../master-index.md)
- 系統架構圖 → [../../system-diagrams.md](../../system-diagrams.md)
- 主 Spec → [../../../spec/20260310-windows-auto-backup-mvp/spec.md](../../../spec/20260310-windows-auto-backup-mvp/spec.md)
