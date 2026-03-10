# Docs Index — Windows Auto Backup MVP

**更新**: 2026-03-10

---

## 文件清單

| 文件 | 說明 |
|------|------|
| [system-diagrams.md](./system-diagrams.md) | 系統架構圖、核心流程圖、前後端分布圖 |
| [architecture-review.md](./architecture-review.md) | 八輪架構審查歷程（R1–R8）與決策紀錄 |
| [research/master-index.md](./research/master-index.md) | 9 份技術研究整合索引與跨面向洞察 |
| [research/entities.md](./research/entities.md) | 套件與概念實體索引 |

## 研究面向

| 文件 | 主題 |
|------|------|
| [research/01-electron-vite-tailwind-setup.md](./research/01-electron-vite-tailwind-setup.md) | electron-vite + TailwindCSS v4 初始化 |
| [research/02-bonjour-service-windows-mdns.md](./research/02-bonjour-service-windows-mdns.md) | bonjour-service + Windows mDNS + iPhone 偵測 |
| [research/03-typed-ipc-patterns.md](./research/03-typed-ipc-patterns.md) | @electron-toolkit/typed-ipc 使用模式 |
| [research/04-electron-store-patterns.md](./research/04-electron-store-patterns.md) | electron-conf / electron-store 主進程模式 |
| [research/05-zustand-electron-ipc-sync.md](./research/05-zustand-electron-ipc-sync.md) | Zustand + Electron IPC 狀態同步 |
| [research/06-electron-windows-notification.md](./research/06-electron-windows-notification.md) | Electron Windows 原生通知 API |
| [research/07-vitest-electron-testing.md](./research/07-vitest-electron-testing.md) | Vitest + Electron 單元測試 |
| [research/08-electron-builder-windows.md](./research/08-electron-builder-windows.md) | electron-builder Windows NSIS 打包 |
| [research/09-electron-tray-windows.md](./research/09-electron-tray-windows.md) | Electron System Tray Windows 最佳實踐 |

## 雙向同步研究（PC ↔ Mobile）

| 文件 | 主題 |
|------|------|
| [research/pc-to-mobile/00-index.md](./research/pc-to-mobile/00-index.md) | PC → iPhone 雙向同步可行性總索引與方案評估 |
| [research/pc-to-mobile/01-ios-sandbox.md](./research/pc-to-mobile/01-ios-sandbox.md) | iOS 沙盒與檔案系統限制（iOS 16-18） |
| [research/pc-to-mobile/02-afc-libimobiledevice.md](./research/pc-to-mobile/02-afc-libimobiledevice.md) | AFC 協定 / libimobiledevice / USB 有線方案 |
| [research/pc-to-mobile/03-wifi-transfer.md](./research/pc-to-mobile/03-wifi-transfer.md) | WiFi 無線傳輸方案（WebDAV / HTTP / Bonjour） |
| [research/pc-to-mobile/04-existing-tools.md](./research/pc-to-mobile/04-existing-tools.md) | 現有工具技術路線分析（iMazing / AnyTrans / WALTR Pro） |
| [research/pc-to-mobile/05-ios-app-requirements.md](./research/pc-to-mobile/05-ios-app-requirements.md) | iOS 配套 App 需求評估與決策樹 |
| [research/pc-to-mobile/06-electron-nodejs.md](./research/pc-to-mobile/06-electron-nodejs.md) | Electron / Node.js 整合方案與 npm 套件生態 |
| [research/pc-to-mobile/entities.md](./research/pc-to-mobile/entities.md) | 實體索引（AFC、Document Provider、iMazing、LocalSend 等） |

## 跨平台研究（Windows → macOS）

| 文件 | 主題 |
|------|------|
| [research/cross-platform/00-master-index.md](./research/cross-platform/00-master-index.md) | 跨平台擴展可行性總索引與工作量估算 |
| [research/cross-platform/01-mdns-macos-vs-windows.md](./research/cross-platform/01-mdns-macos-vs-windows.md) | bonjour-service macOS vs Windows |
| [research/cross-platform/02-notification-macos-vs-windows.md](./research/cross-platform/02-notification-macos-vs-windows.md) | Notification API 跨平台差異 |
| [research/cross-platform/03-tray-macos-vs-windows.md](./research/cross-platform/03-tray-macos-vs-windows.md) | Tray 圖示格式與行為跨平台 |
| [research/cross-platform/04-window-dock-macos-vs-windows.md](./research/cross-platform/04-window-dock-macos-vs-windows.md) | 視窗 / Dock / Taskbar 行為差異 |
| [research/cross-platform/05-login-items-macos-vs-windows.md](./research/cross-platform/05-login-items-macos-vs-windows.md) | setLoginItemSettings 跨平台差異 |
| [research/cross-platform/06-electron-builder-macos.md](./research/cross-platform/06-electron-builder-macos.md) | electron-builder macOS DMG 打包 |
| [research/cross-platform/07-file-path-cross-platform.md](./research/cross-platform/07-file-path-cross-platform.md) | 跨平台檔案路徑處理 |

## 相關連結

- Spec → [../spec/20260310-windows-auto-backup-mvp/spec.md](../spec/20260310-windows-auto-backup-mvp/spec.md)
- Progress → [../spec/20260310-windows-auto-backup-mvp/progress.md](../spec/20260310-windows-auto-backup-mvp/progress.md)
