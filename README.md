# Auto Backup Mobile Data

macOS 桌面應用程式（Electron），自動將 iPhone 照片與影片備份到本機電腦。

## 功能特色

- **USB 自動備份**：偵測到 iPhone USB 插入時自動開始備份（libimobiledevice + AFC 協定）
- **mDNS 裝置發現**：透過 Bonjour 顯示區域網路內 iPhone 的在線狀態
- **System Tray 常駐**：最小化至 menubar，背景靜默運作
- **備份歷史記錄**：追蹤每次備份的狀態、時間、檔案數量
- **設定持久化**：備份目標路徑、自動備份開關等設定跨啟動保留
- **無需 Apple Developer 憑證**：個人使用，無簽名發布

## 技術架構

```
Electron (macOS arm64)
├── Main Process
│   ├── window-manager.ts      # BrowserWindow 全域狀態（防 GC）
│   ├── tray.ts                # System Tray + Context Menu
│   ├── ipc-handlers.ts        # IPC 事件處理
│   └── services/
│       ├── device-scanner.ts  # mDNS 裝置掃描（bonjour-service）
│       ├── backup-manager.ts  # 備份流程控制（libimobiledevice CLI）
│       ├── backup-history-store.ts  # 備份歷史 (electron-conf)
│       ├── settings-store.ts  # 使用者設定 (electron-conf)
│       └── notification-service.ts  # 系統通知
├── Preload (contextBridge)
└── Renderer (React + Zustand + Tailwind v4)
```

### 技術選型

| 面向 | 技術選擇 | 說明 |
|------|----------|------|
| 檔案存取 | libimobiledevice (AFC) | USB + Trust 配對，存取 DCIM |
| 裝置發現 | bonjour-service (mDNS) | `_companion-link._tcp`，顯示在線狀態 |
| USB 熱插偵測 | node-usb | Apple Vendor ID `0x05AC` |
| 傳輸驗證 | xxHash64 (@node-rs/xxhash) | 比 SHA-256 快 15x |
| 排程 | launchd (macOS) + node-cron | LaunchAgent plist 系統層排程 |
| 打包 | electron-builder (`identity: null`) | 無簽名 DMG，arm64 |
| 測試 | Vitest + Playwright E2E | `vi.mock('electron')` + memfs |

## 快速開始

### 系統需求

- macOS 13+ (Ventura)
- Node.js 20+
- iPhone（需通過 Trust 對話框）

### 安裝

```bash
# 安裝 libimobiledevice（需要 Homebrew）
brew install libimobiledevice ifuse

# 安裝依賴
npm install
```

### 執行

```bash
# 開發模式（Hot Reload）
npm run dev

# 打包 DMG
npm run build:mac
```

### 首次使用

1. 啟動 App → 系統 Tray 出現圖示
2. 用 USB 連接 iPhone → 點擊 iPhone 上的「信任」
3. App 自動偵測裝置並開始備份

## 開發指南

```bash
npm run dev          # 開發模式
npm run typecheck    # TypeScript 型別檢查
npm run lint         # ESLint
npm run test         # Vitest 單元測試
npm run build:mac    # 打包 macOS DMG（arm64）
```

### 專案結構

```
src/
├── main/            # Electron Main Process
│   ├── services/    # 業務邏輯服務層
│   └── utils/       # 工具函式
├── preload/         # contextBridge API
├── renderer/        # React UI
│   └── src/
│       ├── pages/   # 頁面元件
│       └── stores/  # Zustand 狀態管理
└── shared/          # Main/Renderer 共用型別

docs/
└── research/tech-stack/   # 技術研究文件（10 個面向）
```

## 已知限制

- **純 WiFi 備份不可行**：iOS 沙箱限制，無法在沒有 iOS companion App 的情況下透過 WiFi 存取 DCIM
- **需要 USB 物理連接**：每次備份需要 iPhone 透過 USB 連接
- **iOS 18 USB Restricted Mode**：iPhone 鎖定超過 1 小時後需重新解鎖才能存取
- **無簽名限制**：不支援 auto-update（Squirrel.Mac 要求簽名）；通知為 banner 樣式（非彈跳）；Login Items 需手動在系統設定允許

## 研究文件

詳細技術研究見 [`docs/research/tech-stack/`](./docs/research/tech-stack/)：

- [01 iPhone 備份協定](./docs/research/tech-stack/01-iphone-backup-protocols.md)
- [02 mDNS/Bonjour 裝置發現](./docs/research/tech-stack/02-mdns-bonjour.md)
- [03 LAN 檔案傳輸](./docs/research/tech-stack/03-lan-file-transfer.md)
- [04 類似工具分析](./docs/research/tech-stack/04-similar-tools-analysis.md)
- [05 iOS 沙箱限制](./docs/research/tech-stack/05-ios-sandbox-restrictions.md)
- [06 Electron IPC 架構](./docs/research/tech-stack/06-electron-ipc-architecture.md)
- [07 macOS 系統整合](./docs/research/tech-stack/07-macos-system-integration.md)
- [08 electron-builder 打包](./docs/research/tech-stack/08-electron-builder-packaging.md)
- [09 背景服務與排程](./docs/research/tech-stack/09-background-services-scheduling.md)
- [10 測試策略](./docs/research/tech-stack/10-testing-strategies.md)

## License

MIT
