# Research Master Index: Windows Auto Backup MVP

**研究日期**: 2026-03-10
**面向數**: 9 個
**儲存位置**: `docs/research/`

---

## 研究面向索引

| # | 面向 | 關鍵結論 | 文件 |
|---|------|---------|------|
| 01 | electron-vite + TailwindCSS v4 | TailwindCSS v4 需 `moduleResolution: "bundler"`；Electron ^39, React ^19 | [→](./01-electron-vite-tailwind-setup.md) |
| 02 | bonjour-service + Windows mDNS | 純 JS 不需 rebuild；退出必須 `destroy()`；`_airplay._tcp` iPhone 不廣播 | [→](./02-bonjour-service-windows-mdns.md) |
| 03 | @electron-toolkit/typed-ipc | Union 型別分拆 listener/handler map；`on()` 回傳 unsubscribe | [→](./03-typed-ipc-patterns.md) |
| 04 | electron-store | v9+ 純 ESM 與 electron-vite CJS 衝突；建議 `electron-conf` | [→](./04-electron-store-patterns.md) |
| 05 | Zustand + Electron IPC | v5 需 `useShallow`；初始化順序 init → listener | [→](./05-zustand-electron-ipc-sync.md) |
| 06 | Windows 原生通知 | 保存通知參照；開發環境需 `setAppUserModelId`；焦點搶奪 workaround | [→](./06-electron-windows-notification.md) |
| 07 | Vitest + Electron 測試 | `test.projects`；`MockBrowser extends EventEmitter`；fake timers | [→](./07-vitest-electron-testing.md) |
| 08 | electron-builder NSIS | bonjour-service 純 JS（不需 asarUnpack）；SmartScreen MVP 可接受 | [→](./08-electron-builder-windows.md) |
| 09 | Electron Tray Windows | tray 全域宣告防 GC；`isQuitting` 旗標；靜態選單需全量重設 | [→](./09-electron-tray-windows.md) |

---

## 跨面向洞察

### 因果鏈

**ESM/CJS 衝突鏈**
- electron-store v9+ 純 ESM（04）→ electron-vite 預設打包 CJS → `ERR_REQUIRE_ESM` 啟動失敗
- 解法：`externalizeDeps.exclude: ['electron-store']` 或改用 `electron-conf`
- **影響 Task 1**（初始化時必須解決，否則後續 Task 全部阻塞）

**mDNS Service Type 錯誤鏈**
- Spec 將 `_airplay._tcp` 列為備援（02 研究發現：iPhone 是 AirPlay 發送端，不廣播此服務）
- 實際可用備援：`_apple-continuity._tcp`、`_sleep-proxy._udp`、`_services._dns-sd._udp`（全服務發現）
- **需更新 spec 的 Decision Lock**

**GC 回收陷阱鏈**
- Tray 未全域宣告 → GC 回收 → 圖示消失（09）
- Notification 未保存參照 → GC 回收 → click 事件失效（06）
- bonjour 未 destroy → EADDRINUSE → 下次啟動失敗（02）
- 三個問題根因相同：**Electron 原生物件必須持有參照**

**狀態同步時序鏈**
- 視窗開啟 → `get-current-state` IPC → Zustand init（05）→ 建立 IPC listeners → UI 渲染
- 若 listeners 先於 init 建立，可能漏接 push 事件導致狀態不一致
- **影響 Task 4** Dashboard 初始化實作

### 矛盾點

| 矛盾 | Agent 02 | Agent 08 | 結論 |
|------|---------|---------|------|
| bonjour-service 是否需要 asarUnpack | 純 JS，**不需要** | 提供了 asarUnpack 配置範例 | **以 02 為準**：純 JS 套件不需 asarUnpack，08 的範例是通用 native module 範例 |

### 架構影響清單

以下是研究發現對 **原始 spec** 的修正項目：

| # | 原 spec | 修正 | 影響 |
|---|---------|------|------|
| A1 | `_airplay._tcp` 作為備援 | iPhone 不廣播此服務，需改用其他備援 | Task 2 |
| A2 | 使用 `electron-store` | v9+ ESM 衝突，需配置 `externalizeDeps.exclude` 或改 `electron-conf` | Task 1 |
| A3 | mDNS 主動 query 用 `setInterval` | 改用 `browser.update()` 更優雅 | Task 2 |
| A4 | Notification click 開啟視窗 | 需加 `setAlwaysOnTop` workaround + 開發環境 `setAppUserModelId` | Task 2 |
| A5 | Tray 宣告位置未明確 | 必須為模組層級全域變數 | Task 1 |

---

## 技術決策速查

```
初始化順序:
app.setAppUserModelId()          ← 必須在 app.whenReady() 之前
  → app.whenReady()
  → createWindow()
  → createTray()                 ← 全域變數
  → bonjour = new Bonjour()     ← 全域變數
  → initializeStores()          ← 必須先於 setupIpcListeners()
  → setupIpcListeners()

退出清理順序:
app.on('before-quit'):
  → bonjour.destroy()           ← 防 EADDRINUSE
  → tray.destroy()
  → app.quit()
```

---

## 詳細資料

完整程式碼範例與來源連結見各面向文件。
