# Tech Stack Research — Master Index

> **專案**：auto-backup-mobile-data（Electron + macOS，無簽名，iPhone 自動備份）
> **研究時間**：2026-03-11
> **面向數**：10 個（並行收集）

---

## 面向清單

| # | 文件 | 核心問題 | 關鍵結論 |
|---|------|----------|----------|
| 01 | [iPhone 備份協定](./01-iphone-backup-protocols.md) | 純 WiFi 無越獄可讀照片嗎？ | ❌ 幾乎不可行，需 USB（AFC）或 iOS App（WiFi） |
| 02 | [mDNS/Bonjour](./02-mdns-bonjour.md) | 如何發現 iPhone？ | bonjour-service + TCP ping，`_companion-link._tcp` 最可靠 |
| 03 | [LAN 檔案傳輸](./03-lan-file-transfer.md) | 如何高效傳輸大檔案？ | HTTP chunked + Stream pipeline + xxHash64 + Range 斷點續傳 |
| 04 | [類似工具分析](./04-similar-tools-analysis.md) | 競品如何做到的？ | 全用 usbmuxd→AFC，pymobiledevice3 是最佳開源方案 |
| 05 | [iOS 沙箱限制](./05-ios-sandbox-restrictions.md) | iOS 開放哪些存取？ | PTP 唯讀 DCIM、AFC 需 USB 配對、Trust 不可完全自動化 |
| 06 | [Electron IPC 架構](./06-electron-ipc-architecture.md) | 大檔案傳輸的 IPC 設計？ | Stream + progress push，MessagePort 零拷貝，Worker Thread 跑 checksum |
| 07 | [macOS 系統整合](./07-macos-system-integration.md) | macOS 特有整合注意事項？ | Sequoia 本地網路權限非 TCC、SMAppService（macOS 13+）、無簽名通知降級 banner |
| 08 | [electron-builder 打包](./08-electron-builder-packaging.md) | 如何打包無簽名 DMG？ | `identity: null`、無簽名 ❌ 不能 auto-update（Squirrel.Mac 硬性要求） |
| 09 | [背景服務與排程](./09-background-services-scheduling.md) | 如何實作自動備份排程？ | launchd（macOS）/Task Scheduler（Win）、node-usb hotplug、powerSaveBlocker |
| 10 | [測試策略](./10-testing-strategies.md) | Electron 如何測試？ | Vitest + vi.mock('electron')、Playwright for E2E、memfs 模擬檔案系統 |

---

## 跨面向洞察

### 因果鏈

**技術限制鏈**：
```
iOS 沙箱（05）→ 無法純 WiFi 存取照片（01）→ 必須 USB + AFC 或 iOS companion App
                                              ↓
                              USB 路線：libimobiledevice / pymobiledevice3（04）
                              WiFi 路線：iOS App HTTP server + LAN transfer（03）
```

**macOS 權限鏈**：
```
無 Code Signing（08）→ 通知降級 banner（07）
                    → 無法 auto-update（08）
                    → SMAppService Login Items 受限（07）
                    → Hardened Runtime 部分功能不可用（07）
```

**備份觸發鏈**：
```
mDNS 發現裝置（02）→ TCP ping 確認在線（02）→ 觸發備份（09）
                                              ↓
                              USB 偵測：node-usb hotplug（09）
                              WiFi 偵測：網路事件輪詢（09）
```

### 關鍵矛盾點

1. **WiFi 自動備份 vs iOS 沙箱**：專案目標是 LAN 自動備份，但 iOS 沙箱完全封閉 LAN 存取（無 iOS App 的前提下）。mDNS 可以發現裝置，但無法在沒有 iOS companion App 的情況下傳輸檔案。

2. **無簽名 vs 完整功能**：個人使用不簽名省去 Apple Developer $99/年，但付出代價：不能 auto-update、通知無法彈跳、Login Items 受限。

3. **開源方案成熟度**：pymobiledevice3（Python）是 2025 年最活躍的 iOS 存取方案，但本專案是 Node.js/Electron，無直接 binding，需 CLI wrapper 或跨語言橋接。

### 高風險假設驗證清單

| 假設 | 風險等級 | 研究結論 | 行動 |
|------|----------|----------|------|
| 純 WiFi 可備份照片 | 🔴 Critical | **不成立**，需 USB 或 iOS App | 決定技術路線 |
| libimobiledevice 在 macOS 穩定 | 🟠 High | v1.4.0 (2025-10) 活躍，但需實測 | PoC 驗證 |
| 無簽名 app 可用 bonjour-service | 🟡 Medium | macOS Sequoia 有新的 UUID 碰撞問題 | 測試確認 |
| USB Restricted Mode 不影響備份 | 🟠 High | iOS 18 1hr 鎖定後阻斷，需 iPhone 解鎖 | 設計 UX 提示 |

---

## 技術選型建議摘要

### MVP 路線（USB + AFC）

```
裝置發現：bonjour-service + TCP ping（port 62078）
檔案存取：libimobiledevice CLI wrapper (ideviceimagemounter / ifuse) 或 pymobiledevice3 subprocess
傳輸引擎：Node.js Stream + progress tracking
排程：node-cron + launchd（macOS）
打包：electron-builder identity:null DMG arm64
測試：vitest + vi.mock('electron') + Playwright E2E
```

### 備選路線（WiFi + iOS App）

```
裝置發現：同上
iOS 端：Swift URLSession HTTP server（Photos Framework 存取）
Mac 端：HTTP chunked receive + xxHash64 checksum
傳輸：Range-based 斷點續傳
```

---

## 儲存位置

```
docs/research/tech-stack/
├── master-index.md          ← 本文件
├── entities.md              ← 重要實體聚合
├── 01-iphone-backup-protocols.md
├── 02-mdns-bonjour.md
├── 03-lan-file-transfer.md
├── 04-similar-tools-analysis.md
├── 05-ios-sandbox-restrictions.md
├── 06-electron-ipc-architecture.md
├── 07-macos-system-integration.md
├── 08-electron-builder-packaging.md
├── 09-background-services-scheduling.md
└── 10-testing-strategies.md
```
