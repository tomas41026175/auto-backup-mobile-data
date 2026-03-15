# Auto Backup Mobile Data

Windows 桌面應用程式（Electron），透過 USB 自動將 iPhone 照片與影片備份到本機電腦，並支援 iCloud Photos 同步。

## 功能特色

- **USB 自動備份**：偵測到 iPhone USB 插入時自動開始備份（libimobiledevice AFC 協定）
- **iCloud Photos 同步**：輸入 Apple ID 即可將 iCloud 相簿下載到本機，支援相簿篩選、進度顯示與中斷續傳
- **備份歷史記錄**：追蹤每次備份的狀態、時間、檔案數量與傳輸大小
- **開啟備份資料夾**：每個已配對裝置可直接從 UI 開啟對應的備份目錄
- **設定持久化**：備份路徑、iCloud 帳號、自動備份等設定跨啟動保留
- **Windows 驅動狀態**：啟動時自動偵測 Apple Mobile Device Service 與 afcclient.exe

## 技術架構

```
Electron (Windows x64)
├── Main Process
│   ├── window-manager.ts         # BrowserWindow 全域狀態（防 GC）
│   ├── tray.ts                   # System Tray + Context Menu
│   ├── ipc-handlers.ts           # IPC 事件處理
│   └── services/
│       ├── afc-backup-manager.ts    # USB AFC 備份（afcclient.exe）
│       ├── icloud-sync-manager.ts   # iCloud 下載（pyicloud Python 子程序）
│       ├── usb-device-monitor.ts    # USB 熱插偵測（node-usb）
│       ├── backup-history-store.ts  # 備份歷史（electron-conf）
│       ├── settings-store.ts        # 使用者設定（electron-conf）
│       └── notification-service.ts  # 系統通知
├── Preload (contextBridge typed IPC)
└── Renderer (React + Tailwind v4)
    └── pages/
        ├── Dashboard.tsx  # 裝置列表 + 備份操作 + 歷史
        ├── ICloud.tsx     # iCloud 同步 UI
        └── Settings.tsx   # 設定頁面
```

### 關鍵技術

| 面向 | 技術 | 說明 |
|------|------|------|
| USB 檔案存取 | afcclient.exe (libimobiledevice) | AFC 協定存取 DCIM |
| USB 熱插偵測 | node-usb | Apple Vendor ID `0x05AC` |
| iCloud 下載 | pyicloud (Python) | 子程序 JSON 協定通訊 |
| 設定儲存 | electron-conf | main process 持久化 |
| UI 框架 | React + Tailwind v4 | 深色主題 |
| 打包 | electron-builder | 無簽名 Windows exe |
| 測試 | Vitest | `vi.mock('electron')` |

## 快速開始

### 系統需求

- Windows 10/11 (x64)
- Node.js 20+
- Python 3.8+（iCloud 同步需要）
- Apple Mobile Device Service（iTunes 或 Apple Devices 裝置驅動）
- iPhone（需通過 Trust 對話框）

### 安裝

```bash
# iCloud 同步依賴
pip install pyicloud

# 專案依賴
npm install
```

### 執行

```bash
# 開發模式（Hot Reload）
npm run dev

# 打包 Windows exe
npm run build:win
```

### 首次使用

1. 啟動 App → 系統 Tray 出現圖示
2. 用 USB 連接 iPhone → 點擊 iPhone 上的「信任」
3. App 自動偵測裝置，可在 Dashboard 手動觸發或等待自動備份

### iCloud Photos 同步

1. 切換到「iCloud」頁面
2. 輸入 Apple ID 和密碼（記憶功能：下次自動填入）
3. 選擇目標資料夾（或使用已設定的備份路徑）
4. 選擇要同步的相簿（「全部相簿」或指定相簿）
5. 點擊「開始同步」
6. 如需雙重驗證，App 會彈出輸入框
7. 下載完成後，檔案位於：`目標資料夾/icloud/<相簿名稱>/`

**中斷續傳**：同步中途取消後，下次重新開始會自動跳過已下載的檔案。

## 開發指南

```bash
npm run dev          # 開發模式
npm run typecheck    # TypeScript 型別檢查
npm run lint         # ESLint
npm run test         # Vitest 單元測試
npm run build:win    # 打包 Windows exe
```

### 專案結構

```
src/
├── main/
│   ├── services/    # 業務邏輯服務層
│   └── utils/       # 工具函式
├── preload/         # contextBridge typed API
├── renderer/        # React UI
│   └── src/
│       ├── pages/       # 頁面（Dashboard / ICloud / Settings）
│       └── components/  # 共用元件
└── shared/          # Main/Renderer 共用型別與 IPC 型別定義

resources/
├── icloud_download.py  # pyicloud 下載腳本（JSON stdin/stdout 協定）
├── list_dcim.py        # AFC DCIM 檔案列表腳本
└── win/
    └── libimobiledevice/  # afcclient.exe, idevice_id.exe, ideviceinfo.exe
```

## IPC 協定

所有 IPC 型別定義集中於 `src/shared/ipc-channels.ts`：

- **Handler channels**（renderer → main invoke）：`get-settings`, `save-settings`, `start-backup`, `cancel-backup`, `start-icloud-sync`, `cancel-icloud-sync`, `submit-2fa-code`, `get-icloud-status`, `open-backup-folder`, `select-backup-path`, ...
- **Listener channels**（main → renderer push）：`device-usb-connected`, `backup-progress-detail`, `backup-complete-detail`, `icloud-sync-progress`, `icloud-albums`, `icloud-album-update`, `icloud-sync-complete`, `icloud-sync-error`, ...

## iCloud 下載腳本協定

`resources/icloud_download.py` 使用 stdin/stdout JSON lines 與 Electron 通訊：

**stdin**：
- 第 1 行：`{"apple_id": "...", "password": "...", "dest_dir": "...", "album": "all"|"相簿名稱"}`
- 後續行：2FA 驗證碼（如需要）

**stdout events**：`status`, `album_list`, `scanning_album`, `album_update`, `2fa_required`, `progress`, `file_error`（非致命）, `complete`, `error`（致命）

**中斷續傳**：在 `dest_dir/icloud/.icloud_sync_state.json` 記錄已下載的相對路徑集合。

## License

MIT
