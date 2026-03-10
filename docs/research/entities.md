# Entities: Windows Auto Backup MVP 研究實體索引

所有研究面向中出現的重要工具、套件、概念聚合。

---

## 套件

### bonjour-service
- **定位**（02）：純 JS mDNS/DNS-SD 套件，不需 native addon
- **API**（02）：`browse()`、`find()`、`publish()`；`browser.update()` 觸發主動 PTR 查詢
- **生命週期**（02, 08）：必須在 app 退出前呼叫 `bonjour.destroy()`，否則 `EADDRINUSE`
- **Windows 注意**（02）：依賴 Windows mDNS（mdnsNSP），公共網路防火牆可能封鎖
- **打包**（02, 08）：純 JS，**不需** `asarUnpack` 或 `electron-rebuild`
- **替代方案**（02）：`multicast-dns`（週下載 1594 萬，底層控制用）

### electron-store
- **版本**（04）：最新 v11.0.2，v9+ 起純 ESM
- **相容性問題**（04）：electron-vite 預設 CJS，引入會 `ERR_REQUIRE_ESM`
- **解法 1**（04）：`externalizeDeps.exclude: ['electron-store']`
- **解法 2**（04）：改用 `electron-conf`（社群推薦，ESM/CJS 皆支援）
- **架構**（04）：多 store 需不同 `name`，renderer 禁止直接存取

### electron-conf
- **定位**（04）：electron-store 的替代品，同時支援 ESM/CJS
- **優勢**（04）：electron-vite 社群推薦，避免 ESM 衝突問題

### @electron-toolkit/typed-ipc
- **定位**（03）：型別安全 IPC，alex8088 維護（electron-vite 同一作者）
- **型別定義**（03）：IPC type map 用 **union 型別** 分拆 listener map 和 handler map
- **依賴**（03）：renderer 端需搭配 `@electron-toolkit/preload`
- **注意**（03）：`on()` 回傳 unsubscribe 函式，React useEffect cleanup 必須呼叫

### Zustand
- **版本**（05）：v5 有 breaking change
- **v5 陷阱**（05）：物件 selector 無 `useShallow` 包裝會拋 "Maximum update depth exceeded"
- **初始化順序**（05）：`initializeStores()` 必須先於 `setupIpcListeners()`
- **Middleware**（05）：`subscribeWithSelector` 用於監聽特定欄位副作用

### electron-vite
- **版本**（01）：最新配合 Electron ^39.x、React ^19.x
- **TailwindCSS v4 坑**（01）：需在 `tsconfig.node.json` 設 `moduleResolution: "bundler"`
- **tsconfig 結構**（01）：三組配置 `tsconfig.json`（references）/ `tsconfig.node.json`（main）/ `tsconfig.web.json`（renderer）

### Vitest
- **版本**（07）：v3.x，`test.projects` 取代已棄用 `vitest.workspace.ts`
- **環境**（07）：main process 用 `environment: 'node'`，renderer 用 `jsdom`
- **Debounce 測試**（07）：`vi.useFakeTimers()` + `vi.advanceTimersByTime()`

### electron-builder
- **NSIS**（08）：Windows installer，支援安裝路徑、桌面捷徑、開始選單自訂
- **SmartScreen**（08）：不做 code signing 時使用者需手動點「仍要執行」，MVP 可接受
- **開機啟動**（08）：`app.setLoginItemSettings()`，開發環境需加保護

---

## 概念

### mDNS Service Type
- `_companion-link._tcp`（02）：Apple Continuity/Handoff，iPhone **會廣播**，主要偵測方式
- `_airplay._tcp`（02）：AirPlay 媒體串流，iPhone 是發送端**不廣播**，**spec 備援方案有誤**
- `_apple-continuity._tcp`（02）：可作為備援
- `_services._dns-sd._udp`（02）：全服務發現，可列出所有 DNS-SD 服務

### GC 回收陷阱
- **Tray**（09）：必須全域宣告，否則數十秒後被 GC 回收，圖示消失
- **Notification**（06）：必須保存參照（如 `Set<Notification>`），否則 click 事件不觸發
- **Bonjour**（02）：全域宣告，退出前 destroy

### isQuitting 旗標
- **用途**（09）：區分使用者關閉視窗（隱藏到 Tray）vs 從選單退出（真正關閉）
- **實作**（09）：`app.on('before-quit')` 設 `isQuitting = true`，`win.on('close')` 檢查旗標

### AppUserModelId
- **用途**（06, 09）：Windows 通知和 Tray 的 app 身份識別
- **開發環境**（06）：`app.setAppUserModelId(process.execPath)`
- **生產環境**（06）：使用反域名格式如 `com.yourname.autobackup`
- **時機**（09）：必須在 `app.whenReady()` 之前呼叫

### Windows 通知焦點搶奪 Bug
- **問題**（06）：點擊通知後呼叫 `win.focus()` 在某些 Windows 版本無效
- **Workaround**（06）：`win.setAlwaysOnTop(true)` → `win.focus()` → `win.setAlwaysOnTop(false)`

### mDNS 主動 Query
- **方式 1**（02）：`browser.update()` 觸發主動 PTR 查詢（推薦）
- **方式 2**（02）：`setInterval` + 重建 browser（較粗糙）
- **頻率**（spec）：每 60 秒

### TailwindCSS v4 與 electron-vite
- **問題**（01）：`moduleResolution` 未設為 `"bundler"` 導致模組解析失敗
- **Issue**（01）：electron-vite #741
- **解法**（01）：在 `tsconfig.node.json` 明確設 `"moduleResolution": "bundler"`

---

## 相關章節導航

- mDNS 技術細節 → [02-bonjour-service-windows-mdns.md](./02-bonjour-service-windows-mdns.md)
- IPC 型別安全 → [03-typed-ipc-patterns.md](./03-typed-ipc-patterns.md)
- 資料持久化 → [04-electron-store-patterns.md](./04-electron-store-patterns.md)
- 狀態管理 → [05-zustand-electron-ipc-sync.md](./05-zustand-electron-ipc-sync.md)
- 通知系統 → [06-electron-windows-notification.md](./06-electron-windows-notification.md)
- 測試策略 → [07-vitest-electron-testing.md](./07-vitest-electron-testing.md)
- 打包部署 → [08-electron-builder-windows.md](./08-electron-builder-windows.md)
- Tray 常駐 → [09-electron-tray-windows.md](./09-electron-tray-windows.md)
