# Spec: Windows WiFi 傳輸版本

**Task**: 在獨立分支上開發 Windows 版本，使用 libimobiledevice WiFi 模式透過區網備份已配對的 iOS 裝置照片/影片，未來規劃合併回 main
**Started**: 2026-03-11T00:00:00+08:00
**Phase**: planning
**Mode**: complex-issue

---

## Impact Summary

| Layer | 影響 | 說明 |
|-------|------|------|
| **main** | yes | platform-utils 新增、afc-backup-manager 重構掛載策略、usb-device-monitor 路徑更新、ipc-handlers 新增 check-windows-drivers |
| **preload** | yes | 新增 check-windows-drivers 到 contextBridge |
| **renderer** | yes | WindowsDriversBanner 元件、Dashboard 條件渲染、app-store 新增 windowsDriversStatus |
| **shared** | yes | types.ts 新增 WindowsDriverStatus、ipc-channels.ts 新增 check-windows-drivers channel |

### 與現有 Service 的整合點

| Service | 整合方式 | 說明 |
|---------|---------|------|
| **AfcBackupManager** | 修改 | 抽取 IMountStrategy 介面，加入 WindowsMountStrategy（WinFsp + ifuse-win） |
| **DeviceScanner** | 無關 | bonjour-service 已跨平台，mDNS 邏輯不需修改 |
| **NotificationService** | 無關 | Electron Notification API 跨平台 |
| **SettingsStore** | 無關 | electron-conf 跨平台 |
| **BackupHistoryStore** | 無關 | electron-conf 跨平台 |
| **UsbDeviceMonitor** | 修改 | 更新 binary 路徑解析，改用 platform-utils |

### IPC Channel 變更

| Channel | 方向 | 型別 | 用途 | 新增/修改 |
|---------|------|------|------|----------|
| `check-windows-drivers` | renderer → main | `() => WindowsDriverStatus` | 檢查 WinFsp + libimobiledevice 安裝狀態 | 新增 |
| `check-macos-fuse` | renderer → main | `() => FuseStatus` | 僅 macOS 可用（不刪除，平台路由） | 修改（加 platform guard） |

### 系統層依賴

**macOS（現有，不變）**：
- `libimobiledevice`（Homebrew）：`idevicepair`, `ifuse`, `ideviceinfo`, `idevice_id`
- `macFUSE`：ifuse 的 FUSE 後端

**Windows（新增）**：
- `Apple Mobile Device Support`（iTunes 或 Apple Devices App）：提供 `usbmuxd` 等效服務，使 libimobiledevice 可透過 WiFi 連線
- `libimobiledevice Windows`（standalone 二進位）：`idevicepair.exe`, `ifuse.exe`, `ideviceinfo.exe`, `idevice_id.exe` + 相依 DLL
- `WinFsp`（https://winfsp.dev/）：`ifuse.exe` 的 FUSE 後端（等效 macFUSE）
- 二進位均以 `extraResources` 方式打包進應用程式，不要求使用者另行安裝 libimobiledevice；WinFsp 和 Apple Mobile Device Support 需引導安裝

### WiFi 連線機制

iOS WiFi 備份透過 Apple Mobile Device Service（AMDS）的 usbmuxd WiFi multiplexing 達成：

```
iOS 裝置（已啟用 WiFi sync）
  → 廣播至區網（AMDS 監聽）
  → AMDS/usbmuxd 建立 WiFi 通道
  → libimobiledevice 透過 usbmuxd 連線（與 USB 模式相同 API）
  → idevicepair validate → ifuse mount → DCIM copy
```

**先決條件**：
1. iOS 裝置曾透過 USB 連線 Windows PC 並點擊「信任此電腦」
2. 在 iPhone Settings > General > VPN & Device Management > 電腦名稱 > 啟用 WiFi Sync
3. Windows 上安裝 Apple Mobile Device Support（iTunes/Apple Devices）
4. 安裝 WinFsp（FUSE 驅動）

---

## Decision Lock

- **目標裝置**：iOS 專用，不支援 Android（現有 AFC 架構延伸）
- **WiFi 機制**：libimobiledevice WiFi 模式（透過 AMDS usbmuxd WiFi multiplexing），不開發 iOS companion app
- **Codebase 策略**：獨立分支 `feat/windows-wifi-transfer`，未來規劃合併回 main；不修改現有 macOS 功能
- **Binary 打包**：libimobiledevice Windows 二進位以 `extraResources` 打包；WinFsp + Apple Mobile Device Support 以 UI 引導安裝
- **掛載方式**：WinFsp + ifuse-win（鏡像 macOS 的 macFUSE + ifuse 架構），Windows 掛載點使用暫時目錄（`%TEMP%\afc-backup-*`）

## Claude 裁量範圍

- platform-utils 的 binary 路徑搜尋策略（registry、固定路徑、PATH 環境變數順序）
- WindowsDriversBanner 的 UI 細節（顏色、佈局、連結文字）
- WinFsp 版本鎖定策略
- 測試 mock 的具體實作細節

## Non-Goals

- **Android 支援**：與現有 iOS/AFC 架構無關，另立任務
- **PC → Mobile 方向**：雙向同步需 iOS companion app，延後到獨立任務
- **自動安裝 WinFsp / Apple Devices**：引導連結即可，不做靜默安裝
- **USB 備份 on Windows**：本任務聚焦 WiFi；USB 備份需要 Windows FUSE 同等方案驗證後再規劃
- **Code signing / Notarization**：Windows SmartScreen 警告接受，簽章為獨立任務
- **自動更新機制**：另立任務
- **macOS 功能修改**：本分支不動 macOS 備份邏輯，只新增 Windows 路徑

## Acceptance Criteria

- [ ] `platform-utils.ts` 在 Windows 正確解析 libimobiledevice binary 路徑（extraResources 目錄） -- verify: `npm run typecheck` 通過；unit test 覆蓋 win32/darwin 兩個路徑場景
- [ ] `check-windows-drivers` IPC 正確回傳 WinFsp 安裝狀態與 Apple Mobile Device Support 狀態 -- verify: `npx vitest run src/main/ipc-handlers` 通過
- [ ] `afc-backup-manager.ts` 在 Windows 使用 WinFsp 掛載 iOS DCIM，備份流程與 macOS 一致 -- verify: unit test mock WinFsp 掛載流程通過；`npm run typecheck` 通過
- [ ] `usb-device-monitor.ts` 在 Windows 使用正確的 binary 路徑偵測 iOS 裝置 -- verify: unit test 通過（mock Windows 路徑）
- [ ] Dashboard 在 Windows 顯示 WindowsDriversBanner（WinFsp 未安裝時） -- verify: `npm test` renderer 測試通過；手動在 Windows 確認 banner 出現
- [ ] `electron-builder` 成功打包 Windows NSIS installer，包含 libimobiledevice Windows binaries -- verify: `npm run build` 產出 `.exe` installer；確認 extraResources 包含所需 exe + dll
- [ ] macOS 版本功能不受影響 -- verify: `npx vitest run` 全部測試通過；`npm run dev` macOS 備份流程正常

## Risk Assessment

| 風險 | 等級 | 影響 | 緩解措施 |
|------|------|------|---------|
| WinFsp + ifuse-win 實際掛載 iOS DCIM 未驗證 | 高 | 備份核心無法運作 | **PoC 必做**：在 Windows 機器驗證完整掛載流程 |
| libimobiledevice Windows binary 版本與 iOS 新版不相容 | 高 | 無法連線 iOS 裝置 | PoC 時鎖定版本；spec 記錄驗證的版本 |
| Apple Mobile Device Support WiFi multiplexing 行為與 macOS usbmuxd 不一致 | 中 | WiFi 連線失敗 | PoC 驗證；fallback 文件記錄已知限制 |
| Windows TEMP 目錄路徑含空格導致 ifuse.exe 參數錯誤 | 中 | 掛載失敗 | 路徑加引號；unit test 含空格路徑場景 |
| 未信任電腦的 iOS 裝置無法 WiFi 連線 | 低 | 使用者體驗差 | UI 加入清楚的前置步驟說明 |

---

## PoC 驗證步驟

**目的**：驗證 Windows + WinFsp + libimobiledevice + ifuse 能否掛載 iOS DCIM 並讀取照片

**步驟（必須在實體 Windows 機器上執行）**：
1. 安裝 Apple Devices（或 iTunes）+ 以 USB 連線 iPhone，點擊「信任此電腦」
2. 在 iPhone Settings 啟用 WiFi Sync（Settings > General > VPN & Device Management > 電腦 > 啟用）
3. 安裝 WinFsp：`winget install WinFsp.WinFsp`
4. 下載 libimobiledevice Windows standalone：`choco install libimobiledevice` 或從 GitHub release 下載
5. 斷開 USB，確認 WiFi 連線：`idevice_id.exe -l`（應能看到裝置 UDID）
6. 驗證配對：`idevicepair.exe validate`
7. 建立掛載點：`mkdir C:\Temp\iphone-mount`
8. 掛載 AFC：`ifuse.exe C:\Temp\iphone-mount`（WinFsp 後端）
9. 列出 DCIM：`dir C:\Temp\iphone-mount\DCIM\`
10. 卸載：`net use /delete` 或 `taskkill /IM ifuse.exe`

**成功標準**：步驟 9 能列出 DCIM 目錄下的照片/影片檔案
**失敗備案**：改用 `pymobiledevice3`（Python 直接 AFC 協定，無需 FUSE）作為備援方案，寫入獨立 spec

---

## 工作流程驗證

### Flow 1: Windows WiFi 備份（Happy Path）

```
前置：iPhone 已信任 Windows PC，已啟用 WiFi Sync，WinFsp + Apple Devices 已安裝
  → 使用者開啟 Auto Backup 應用程式
  → Dashboard 顯示「驅動程式就緒」（綠色）
  → iPhone 連上同一 WiFi
  → mDNS 偵測到裝置 (_companion-link._tcp)
  → 使用者點擊「開始備份」
  → AfcBackupManager.startBackup():
      → idevicepair.exe validate（過 WiFi/usbmuxd）
      → ifuse.exe -u {UDID} {tempDir}（WinFsp 掛載）
      → collectDcimFiles() + filterNewFiles()
      → copyFileWithHash()
      → net use /delete (卸載)
  → 備份完成，BackupRecord 儲存 ✓
```

**涉及 Task**: T01, T03, T05
**涉及 AC**: #1, #3, #7

### Flow 2: 驅動程式缺失引導

```
使用者首次安裝 Auto Backup（WinFsp 未安裝）
  → app 啟動 → check-windows-drivers IPC
  → WindowsDriverStatus { winfsp: false, appleMobileDevice: true }
  → Dashboard 顯示 WindowsDriversBanner（紅色）
  → banner 提供「下載 WinFsp」連結
  → 使用者安裝後重啟 app
  → 再次 check-windows-drivers → { winfsp: true, appleMobileDevice: true }
  → banner 消失，正常使用 ✓
```

**涉及 Task**: T02, T05, T06, T07, T08, T09
**涉及 AC**: #2, #5

### Flow 3: macOS 版本不受影響

```
macOS 使用者執行現有 macOS build
  → check-macos-fuse（僅 darwin 執行）
  → afcBackupManager 使用 MacOSMountStrategy（ifuse + macFUSE）
  → platform-utils 回傳 /opt/homebrew/bin 路徑
  → 完整備份流程與修改前一致 ✓
```

**涉及 Task**: T01, T03
**涉及 AC**: #7

---

## Shared Types 變更

```typescript
// 新增至 src/shared/types.ts

export interface WindowsDriverStatus {
  winfsp: boolean           // WinFsp 是否已安裝（FUSE 後端）
  appleMobileDevice: boolean // Apple Mobile Device Support 是否運行（usbmuxd）
  libimobiledevice: boolean  // extraResources 中的 libimobiledevice binary 是否存在
}
```

```typescript
// 新增至 src/shared/ipc-channels.ts IpcHandlerChannels

'check-windows-drivers': () => WindowsDriverStatus
```

---

## Task Plan

### Wave 1: Platform Abstraction + Shared Types

> 基礎層，後續所有 Wave 依賴此 Wave 的型別與工具

**Task T01: platform-utils.ts — 平台感知 binary 路徑解析**
- Files: `src/main/utils/platform-utils.ts`（新增）
- Action:
  - 定義 `BinaryPaths` 介面（idevicepair, ideviceinfo, idevice_id, ifuse）
  - `resolveBinaryPaths()` 函式：darwin → `/opt/homebrew/bin`；win32 → `process.resourcesPath + '/win/libimobiledevice/'`（extraResources 打包路徑）
  - `getMountCommand(udid, mountPoint)` → win32 用 `ifuse.exe`；darwin 用 `ifuse`
  - `getUnmountCommand(mountPoint)` → win32 用 `net use {mountPoint} /delete`；darwin 用 `umount` + `diskutil unmount` fallback
  - `getTempMountBase()` → win32 用 `os.tmpdir()`；darwin 用 `/tmp`
  - 不依賴任何其他 service 或 IPC
- Verify: `npx vitest run src/main/utils/platform-utils` 通過（mock `process.platform`、`process.resourcesPath`）
- Done: 所有 binary 路徑與掛載指令透過此模組統一解析，不直接 hardcode

**Task T02: Shared Types + IPC Channel 新增**
- Files: `src/shared/types.ts`, `src/shared/ipc-channels.ts`
- Action:
  - 在 `types.ts` 新增 `WindowsDriverStatus` 介面（winfsp, appleMobileDevice, libimobiledevice 三個 boolean）
  - 在 `ipc-channels.ts` 的 `IpcHandlerChannels` 新增 `'check-windows-drivers': () => WindowsDriverStatus`
  - 不修改任何現有型別，純新增
- Verify: `npm run typecheck` 通過；確認 preload/index.d.ts 的 IpcHandlerChannels 引用自動更新
- Done: 型別定義完整，IPC type map 包含新 channel

### Wave 2: Windows 備份核心

> 依賴 Wave 1 的 platform-utils

**Task T03: AfcBackupManager 重構 — 抽取掛載策略**
- Files: `src/main/services/afc-backup-manager.ts`
- Action:
  - 定義內部 `IMountStrategy` 介面：`mount(udid): Promise<string>`, `unmount(mountPoint): Promise<void>`
  - 建立 `MacOSMountStrategy`（現有 ifuse + diskutil 邏輯搬入）
  - 建立 `WindowsMountStrategy`（使用 `platform-utils.getMountCommand`，掛載至 `getTempMountBase()`）
  - `AfcBackupManager` constructor 依 `process.platform` 選擇策略，或接受注入（方便測試）
  - 更新所有 binary 路徑呼叫改用 `platform-utils.resolveBinaryPaths()`
  - 不改動備份邏輯主流程（collectDcimFiles、copyFileWithHash、xxHash 驗證）
- Verify: `npx vitest run src/main/services/afc-backup-manager` 通過（mock 兩個策略的掛載/卸載）；`npm run typecheck` 通過
- Done: `AfcBackupManager` 支援 macOS/Windows 雙平台掛載，現有測試全過

**Task T04: UsbDeviceMonitor — Windows binary 路徑支援**
- Files: `src/main/services/usb-device-monitor.ts`
- Action:
  - 移除 hardcode 的 `IDEVICE_ID_PATH = '/opt/homebrew/bin/idevice_id'` 等常數
  - 改呼叫 `platform-utils.resolveBinaryPaths()` 取得路徑
  - 保持其餘 USB 偵測邏輯不變（Apple Vendor ID 0x05AC、延遲 1.5s 等）
- Verify: `npx vitest run src/main/services/usb-device-monitor` 通過（mock platform-utils 回傳 Windows 路徑）；`npm run typecheck` 通過
- Done: UsbDeviceMonitor 不再 hardcode macOS 路徑

### Wave 3: IPC Handlers + Preload

> 依賴 Wave 1 的型別，Wave 2 的 service

**Task T05: ipc-handlers.ts — 新增 check-windows-drivers**
- Files: `src/main/ipc-handlers.ts`
- Action:
  - 新增 `'check-windows-drivers'` handler：
    - `winfsp`：檢查 `HKLM\SOFTWARE\WinFsp` registry key（win32）或 `C:\Program Files (x86)\WinFsp` 目錄存在
    - `appleMobileDevice`：檢查 Windows Service `Apple Mobile Device Service` 狀態（`sc query AppleMobileDeviceService`）
    - `libimobiledevice`：檢查 `path.join(process.resourcesPath, 'win/libimobiledevice/idevicepair.exe')` 存在
  - `'check-macos-fuse'` handler 加入 `if (process.platform !== 'darwin') return null` guard（避免 Windows 執行 kextstat）
  - 兩個 handler 保持獨立，不合併
- Verify: `npx vitest run src/main/ipc-handlers` 通過（mock fs.existsSync、child_process.execSync for sc query）；`npm run typecheck` 通過
- Done: Windows handler 正確偵測三項驅動狀態；macOS handler 有 platform guard

**Task T06: Preload — 暴露 check-windows-drivers**
- Files: `src/preload/index.ts`, `src/preload/index.d.ts`
- Action:
  - 確認 `@electron-toolkit/typed-ipc` 的 typed-ipc 自動從 `IpcHandlerChannels` 推導 `check-windows-drivers`
  - 若需手動更新 `index.d.ts`，補上 `checkWindowsDrivers: () => Promise<WindowsDriverStatus>` 型別
  - 不修改 contextBridge 的暴露結構，只新增 channel（typed-ipc 通常自動處理）
- Verify: `npm run typecheck` 通過；renderer 可呼叫 `window.api.invoke('check-windows-drivers')` 無型別錯誤
- Done: Renderer 可 type-safe 呼叫新 handler

### Wave 4: Renderer UI

> 依賴 Wave 1–3 的 IPC 和型別

**Task T07: WindowsDriversBanner 元件**
- Files: `src/renderer/src/components/WindowsDriversBanner.tsx`（新增）
- Action:
  - Props: `status: WindowsDriverStatus`
  - 若三項全 true → 不渲染（return null）
  - 若有任一 false → 顯示警告 banner，列出未安裝項目與下載連結：
    - WinFsp：`https://winfsp.dev/`
    - Apple Devices（Apple Mobile Device Support）：Microsoft Store 連結
    - libimobiledevice 缺失（extraResources 問題）→ 顯示「請重新安裝應用程式」
  - 風格與現有 `MacFuseBanner` 一致（Card + Badge warning）
- Verify: `npx vitest run src/renderer/src/components/WindowsDriversBanner` 通過（各 false 組合的 snapshot/text 測試）
- Done: 各種 driver 缺失組合的 UI 正確顯示

**Task T08: app-store.ts — 新增 windowsDriversStatus**
- Files: `src/renderer/src/stores/app-store.ts`
- Action:
  - 新增 `windowsDriversStatus: WindowsDriverStatus | null` 狀態欄位
  - 新增 `setWindowsDriversStatus(status: WindowsDriverStatus | null)` action
  - 初始化時若 `process.platform === 'win32'`，呼叫 `window.api.invoke('check-windows-drivers')` 並 setWindowsDriversStatus
  - 不修改現有狀態欄位
- Verify: `npx vitest run src/renderer/src/stores/app-store` 通過（mock IPC，win32/darwin 兩情境）；`npm run typecheck` 通過
- Done: Store 在 Windows 啟動時自動取得驅動狀態

**Task T09: Dashboard.tsx — 條件渲染 Windows Banner**
- Files: `src/renderer/src/pages/Dashboard.tsx`
- Action:
  - 從 `app-store` 取得 `windowsDriversStatus`
  - 在現有 `MacFuseBanner` 旁邊（或後方）條件渲染 `WindowsDriversBanner`：
    - `{process.platform === 'win32' && windowsDriversStatus && <WindowsDriversBanner status={windowsDriversStatus} />}`
  - macOS 不渲染 `WindowsDriversBanner`；Windows 不渲染 `MacFuseBanner`
- Verify: `npx vitest run src/renderer/src/pages/Dashboard` 通過（分別 mock win32/darwin 環境）；`npm run typecheck` 通過
- Done: Dashboard 在正確平台顯示對應 banner

### Wave 5: Build + 文件

**Task T10: electron-builder.yml — Windows extraResources + 分支打包設定**
- Files: `electron-builder.yml`
- Action:
  - 新增 `extraResources` for Windows：
    ```yaml
    win:
      extraResources:
        - from: resources/win/libimobiledevice/
          to: win/libimobiledevice/
          filter: ["**/*"]
    ```
  - 新增 `resources/win/libimobiledevice/.gitkeep` 佔位（實際 binary 由 PoC 驗證後補入）
  - `resources/win/libimobiledevice/` 加入 `.gitignore`（binary 不入 repo）
  - 確認 Windows NSIS target 設定正確（已有，確認即可）
- Verify: `npm run build` 不報錯（可在 macOS 上做 dry-run，實際 Windows binary 填入後再做完整打包）；`npm run typecheck` 通過
- Done: build 設定結構正確，Windows extraResources 路徑對齊 platform-utils 預期

**Task T11: Windows 安裝說明文件**
- Files: `docs/windows-setup.md`（新增）, `docs/00-index.md`（更新連結）
- Action:
  - 說明 Windows 前置步驟（Apple Devices / iTunes 安裝、信任電腦、啟用 WiFi Sync、WinFsp 安裝）
  - 附上 PoC 驗證步驟（供開發者測試用）
  - 說明已知限制（iPhone 需曾以 USB 連線 PC）
  - 更新 `docs/00-index.md` 加入連結
- Verify: 文件可正確渲染（Markdown lint）
- Done: 使用者和開發者均有清楚的 Windows 設定指南

---

## 測試策略

**需 mock 的 API**:
- `process.platform`（'win32' / 'darwin' 切換）
- `process.resourcesPath`（模擬 extraResources 路徑）
- `fs.existsSync`（binary 路徑、WinFsp 目錄）
- `child_process.execSync`（`sc query AppleMobileDeviceService`、`idevicepair.exe validate`）
- `child_process.spawn`（ifuse.exe 掛載）
- Electron: `BrowserWindow`, `Notification`
- `@node-rs/xxhash`（xxh64）

**測試範圍**:
- Unit:
  - `platform-utils.ts`（win32/darwin 路徑解析、掛載/卸載指令產生）
  - `afc-backup-manager.ts`（MacOSMountStrategy、WindowsMountStrategy mock 掛載）
  - `usb-device-monitor.ts`（Windows binary 路徑）
  - `ipc-handlers.ts check-windows-drivers`（三種 false 組合）
  - `WindowsDriversBanner.tsx`（各 status 組合）
  - `app-store.ts`（win32 初始化呼叫 check-windows-drivers）
  - `Dashboard.tsx`（win32 渲染 WindowsDriversBanner，darwin 不渲染）
- Integration:
  - Windows 備份完整流程（mock WinFsp 掛載、mock libimobiledevice CLI）

---

## Deviation Rules

**自動修復**（不需回報，直接處理）：
- bug、型別錯誤、lint、缺少 import
- loading state、error state 補充
- Zustand store 型別對齊
- TailwindCSS class 調整
- Vitest 測試修正

**停止回報**（必須回報，等待確認）：
- 新增/修改 IPC channel type map（非本 spec 規劃的）
- 改變掛載策略（從 WinFsp+ifuse 改為其他方案，如 pymobiledevice3）
- 影響 5+ 個 plan 外的檔案
- 引入新的 npm native 套件
- 變更 electron-conf store schema
- 新增 Non-Goals 中明確排除的功能
- 任何修改現有 macOS 備份流程的變更
