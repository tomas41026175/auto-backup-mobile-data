# Electron 主/渲染進程架構最佳實踐

> 研究日期：2026-03-11
> 適用版本：Electron 28-35（2024-2025 最新版本）
> 資料來源：Electron 官方文件、社群最佳實踐

---

## 目錄

1. [IPC 設計模式](#1-ipc-設計模式)
2. [contextBridge 安全模式](#2-contextbridge-安全模式)
3. [大檔案傳輸場景的 IPC 設計](#3-大檔案傳輸場景的-ipc-設計)
4. [Worker Thread 在 Electron 中的使用](#4-worker-thread-在-electron-中的使用)
5. [進程崩潰處理](#5-進程崩潰處理)
6. [electron-vite 特定注意事項](#6-electron-vite-特定注意事項)
7. [Electron 26-35 API 變化](#7-electron-26-35-api-變化)
8. [contextIsolation 與 sandbox 設定](#8-contextisolation-與-sandbox-設定)
9. [多視窗管理](#9-多視窗管理)
10. [記憶體管理](#10-記憶體管理)
11. [Node.js 版本相容性](#11-nodejs-版本相容性)

---

## 1. IPC 設計模式

### 1.1 ipcMain.handle vs ipcMain.on 選擇原則

| 特性 | `ipcMain.on` + `send` | `ipcMain.handle` + `invoke` |
|------|----------------------|---------------------------|
| 通訊方向 | 單向（需手動回覆） | 雙向（自動回傳 Promise） |
| 回傳值 | 透過 `event.sender.send()` 回覆 | 直接 return 值或 Promise |
| 錯誤處理 | 需自行管理 | 自動將 throw 傳遞為 rejection |
| 適用場景 | 事件通知、fire-and-forget | 請求-回應模式 |
| 阻塞風險 | 無（非同步） | 無（非同步） |

**核心原則**：

- **請求-回應模式**：使用 `invoke` / `handle`（推薦）
- **單向通知**：使用 `send` / `on`
- **絕對避免** `sendSync`：會阻塞整個 renderer 進程

### 1.2 Pattern 1：Renderer → Main（單向通知）

適用場景：設定視窗標題、發送日誌、觸發不需要回傳的動作。

```typescript
// main.ts
import { ipcMain, BrowserWindow } from 'electron'

ipcMain.on('set-title', (event, title: string) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  win?.setTitle(title)
})
```

```typescript
// preload.ts
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  setTitle: (title: string) => ipcRenderer.send('set-title', title),
})
```

```typescript
// renderer.ts
window.electronAPI.setTitle('My App - Document.txt')
```

### 1.3 Pattern 2：Renderer → Main（雙向 invoke/handle）

適用場景：開啟檔案對話框、讀取設定、任何需要回傳值的操作。

```typescript
// main.ts
import { ipcMain, dialog } from 'electron'

ipcMain.handle('dialog:openFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
  })
  if (!canceled) {
    return filePaths[0]
  }
  return null
})
```

```typescript
// preload.ts
contextBridge.exposeInMainWorld('electronAPI', {
  openFile: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:openFile'),
})
```

```typescript
// renderer.ts
const filePath = await window.electronAPI.openFile()
```

### 1.4 Pattern 3：Main → Renderer（主動推送）

適用場景：選單事件、系統通知、進度更新。

```typescript
// main.ts
// 主動向 renderer 推送訊息
mainWindow.webContents.send('update-counter', 1)
```

```typescript
// preload.ts
contextBridge.exposeInMainWorld('electronAPI', {
  onUpdateCounter: (callback: (value: number) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, value: number) =>
      callback(value)
    ipcRenderer.on('update-counter', handler)
    // 回傳清理函式
    return () => ipcRenderer.removeListener('update-counter', handler)
  },
})
```

```typescript
// renderer.ts（React 範例）
useEffect(() => {
  const cleanup = window.electronAPI.onUpdateCounter((value) => {
    setCounter((prev) => prev + value)
  })
  return cleanup // 元件卸載時移除監聽器
}, [])
```

### 1.5 IPC 監聽器清理（防止記憶體洩漏）

桌面應用與網頁不同，可能長時間運行，必須清理 IPC 監聽器：

```typescript
// preload.ts - 安全的事件監聽模式
contextBridge.exposeInMainWorld('electronAPI', {
  onProgress: (callback: (progress: number) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: number) =>
      callback(progress)
    ipcRenderer.on('transfer:progress', handler)
    return () => ipcRenderer.removeListener('transfer:progress', handler)
  },
})
```

---

## 2. contextBridge 安全模式

### 2.1 安全基線設定

```typescript
// main.ts
const mainWindow = new BrowserWindow({
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    nodeIntegration: false,     // 必須 false
    contextIsolation: true,     // 必須 true（Electron 12+ 預設）
    sandbox: true,              // 推薦 true（Electron 20+ 預設）
    webSecurity: true,          // 必須 true
    allowRunningInsecureContent: false,
  },
})
```

### 2.2 Preload Script 最佳實踐

**錯誤示範 - 暴露整個 ipcRenderer：**

```typescript
// preload.ts - 危險！
contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: ipcRenderer, // 允許任意 IPC 訊息，嚴重安全漏洞
})
```

**正確示範 - 每個功能獨立暴露：**

```typescript
// preload.ts - 安全
contextBridge.exposeInMainWorld('electronAPI', {
  // 僅暴露特定功能，不暴露原始 IPC
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (data: string) => ipcRenderer.invoke('file:save', data),
  getAppVersion: () => ipcRenderer.invoke('app:version'),

  // 事件監聽也要封裝
  onFileChanged: (callback: (path: string) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, path: string) =>
      callback(path)
    ipcRenderer.on('file:changed', handler)
    return () => ipcRenderer.removeListener('file:changed', handler)
  },
})
```

### 2.3 TypeScript 型別定義

```typescript
// src/types/electron.d.ts
export interface IElectronAPI {
  openFile: () => Promise<string | null>
  saveFile: (data: string) => Promise<boolean>
  getAppVersion: () => Promise<string>
  onFileChanged: (callback: (path: string) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: IElectronAPI
  }
}
```

### 2.4 contextBridge 限制

- 無法傳遞自訂 prototype 或 Symbol
- 函式、Promise、Symbol、Buffer、TypedArray 會被特殊處理
- 物件會被深層複製（不是傳參考）

---

## 3. 大檔案傳輸場景的 IPC 設計

### 3.1 架構概觀：Main Process 傳輸 + 進度推送

```
┌─────────────┐     invoke      ┌─────────────┐
│  Renderer    │ ──────────────> │    Main      │
│  (UI)        │                 │  Process     │
│              │ <────────────── │  (檔案 I/O)  │
│  進度條顯示  │  webContents.   │  Stream 讀寫  │
│              │  send(progress) │              │
└─────────────┘                 └─────────────┘
```

```typescript
// main.ts - 檔案傳輸 + 進度推送
import { ipcMain, BrowserWindow } from 'electron'
import { createReadStream, createWriteStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'

ipcMain.handle(
  'file:copy',
  async (event, sourcePath: string, destPath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { success: false, error: 'Window not found' }

    const { size: totalSize } = await stat(sourcePath)
    let transferred = 0

    const progressTracker = new Transform({
      transform(chunk, _encoding, callback) {
        transferred += chunk.length
        const progress = Math.round((transferred / totalSize) * 100)

        // 推送進度到 renderer（節流：每 1% 更新一次）
        win.webContents.send('file:progress', {
          transferred,
          total: totalSize,
          percentage: progress,
        })

        callback(null, chunk)
      },
    })

    try {
      await pipeline(
        createReadStream(sourcePath),
        progressTracker,
        createWriteStream(destPath),
      )
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  },
)
```

```typescript
// preload.ts
contextBridge.exposeInMainWorld('electronAPI', {
  copyFile: (source: string, dest: string): Promise<CopyResult> =>
    ipcRenderer.invoke('file:copy', source, dest),

  onFileProgress: (callback: (progress: FileProgress) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, progress: FileProgress) =>
      callback(progress)
    ipcRenderer.on('file:progress', handler)
    return () => ipcRenderer.removeListener('file:progress', handler)
  },
})
```

### 3.2 避免大量資料塞滿 IPC Channel

**原則**：IPC 傳輸有序列化/反序列化成本，避免單次傳送超過數 MB 的資料。

```typescript
// main.ts - 分塊讀取檔案並透過 IPC 傳送
ipcMain.handle(
  'file:readChunked',
  async (event, filePath: string, chunkSize = 64 * 1024) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return

    const stream = createReadStream(filePath, { highWaterMark: chunkSize })

    for await (const chunk of stream) {
      // 每個 chunk 獨立傳送，避免一次性序列化大量資料
      win.webContents.send('file:chunk', {
        data: (chunk as Buffer).toString('base64'),
        size: (chunk as Buffer).length,
      })
    }

    win.webContents.send('file:chunk-end')
  },
)
```

### 3.3 使用 MessagePort / MessageChannel 進行高效傳輸

MessagePort 比標準 IPC 更高效，因為：

- 支援 Transferable Objects（零拷貝傳輸 ArrayBuffer）
- 繞過主 IPC channel，不會阻塞其他 IPC 通訊
- 適合大量資料或高頻率的資料傳輸

```typescript
// main.ts - 建立 MessageChannel 進行串流傳輸
import { MessageChannelMain } from 'electron'

ipcMain.handle('file:createStreamChannel', (event, filePath: string) => {
  const { port1, port2 } = new MessageChannelMain()

  // 將 port2 傳給 renderer
  event.sender.postMessage('file:streamPort', null, [port2])

  // main process 使用 port1 傳送資料
  const stream = createReadStream(filePath, { highWaterMark: 64 * 1024 })

  stream.on('data', (chunk: Buffer) => {
    // 使用 Transferable 傳輸 ArrayBuffer（零拷貝）
    const arrayBuffer = chunk.buffer.slice(
      chunk.byteOffset,
      chunk.byteOffset + chunk.byteLength,
    )
    port1.postMessage({ type: 'data', buffer: arrayBuffer }, [arrayBuffer])
  })

  stream.on('end', () => {
    port1.postMessage({ type: 'end' })
    port1.close()
  })

  stream.on('error', (err) => {
    port1.postMessage({ type: 'error', message: err.message })
    port1.close()
  })

  // 必須呼叫 start() 才能開始接收佇列中的訊息
  port1.start()
})
```

```typescript
// preload.ts - 接收 MessagePort
ipcRenderer.on('file:streamPort', (event) => {
  // event.ports[0] 就是傳過來的 port
  const port = event.ports[0]
  port.onmessage = (msgEvent) => {
    const { type, buffer, message } = msgEvent.data
    switch (type) {
      case 'data':
        // 處理接收到的 ArrayBuffer
        handleChunk(new Uint8Array(buffer))
        break
      case 'end':
        handleComplete()
        port.close()
        break
      case 'error':
        handleError(message)
        port.close()
        break
    }
  }
  port.start()
})
```

### 3.4 MessagePort 注意事項

| 特性 | 標準 IPC (`send`/`invoke`) | MessagePort |
|------|--------------------------|-------------|
| 傳輸 MessagePort | 不支援 | 支援 |
| Transferable Objects | 不支援 | 支援（零拷貝） |
| 通訊方向 | Renderer ↔ Main | 任意進程間 |
| 建立方式 | 自動 | 需手動建立 Channel |
| 適用場景 | 一般指令/查詢 | 大量資料/串流 |

---

## 4. Worker Thread 在 Electron 中的使用

### 4.1 Web Workers（Renderer Process）

```typescript
// main.ts - 啟用 nodeIntegrationInWorker
const mainWindow = new BrowserWindow({
  webPreferences: {
    nodeIntegrationInWorker: true, // 允許 Worker 中使用 Node.js
    // 注意：sandbox 必須為 false 才能使用此功能
    sandbox: false,
  },
})
```

**限制**：

- SharedWorker 和 Service Worker 不支援 Node.js 整合
- Electron 內建模組無法在 Worker 中使用
- 避免在 Worker 中載入 native modules（可能導致崩潰）

### 4.2 Node.js Worker Threads（Main Process）

適用於在 main process 中進行 CPU 密集運算（如 checksum 計算），避免阻塞事件迴圈。

```typescript
// main.ts - 使用 Worker Thread 計算 checksum
import { Worker } from 'node:worker_threads'
import { ipcMain } from 'electron'

ipcMain.handle(
  'file:checksum',
  async (event, filePaths: readonly string[]) => {
    // 為每個檔案啟動一個 Worker Thread
    const results = await Promise.all(
      filePaths.map(
        (filePath) =>
          new Promise<ChecksumResult>((resolve, reject) => {
            const worker = new Worker(
              new URL('./workers/checksum-worker.js', import.meta.url),
            )
            worker.postMessage({ filePath })
            worker.on('message', resolve)
            worker.on('error', reject)
          }),
      ),
    )
    return results
  },
)
```

```typescript
// workers/checksum-worker.ts
import { parentPort } from 'node:worker_threads'
import { createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'

parentPort?.on('message', async ({ filePath }: { filePath: string }) => {
  const hash = createHash('sha256')
  const stream = createReadStream(filePath)

  for await (const chunk of stream) {
    hash.update(chunk)
  }

  parentPort?.postMessage({
    filePath,
    checksum: hash.digest('hex'),
  })
})
```

### 4.3 Worker Thread 使用建議

| 方案 | 使用場景 | 優點 | 注意事項 |
|------|---------|------|---------|
| Worker Threads（Node.js） | Main process 中的 CPU 密集任務 | 共享記憶體、效能高 | 不能使用 Electron API |
| Web Workers | Renderer process 中的 CPU 密集任務 | 不阻塞 UI | `nodeIntegrationInWorker` 需開啟 |
| UtilityProcess | 獨立子進程 | 可使用 Node.js API、隔離性好 | Electron 22+ 支援 |

### 4.4 防止 Native Module 在 Worker 中載入

```typescript
// worker 啟動前的安全措施
process.dlopen = () => {
  throw new Error('Loading native modules in workers is not safe')
}
```

---

## 5. 進程崩潰處理

### 5.1 Renderer 崩潰偵測與恢復

```typescript
// main.ts
mainWindow.webContents.on('render-process-gone', (event, details) => {
  console.error('Renderer process gone:', details.reason)

  switch (details.reason) {
    case 'crashed':
    case 'oom':
      // 嘗試自動恢復
      mainWindow.webContents.reload()
      break
    case 'killed':
      // 被系統或使用者終止
      console.warn('Renderer was killed')
      break
    case 'integrity-failure':
      // 程式碼完整性檢查失敗
      app.quit()
      break
    default:
      mainWindow.webContents.reload()
  }
})
```

**`render-process-gone` 的 reason 值**（取代已廢棄的 `crashed` 事件）：

| reason | 說明 |
|--------|------|
| `clean-exit` | 正常退出（exit code 0） |
| `abnormal-exit` | 非正常退出 |
| `killed` | 被 SIGKILL 或 TerminateProcess 終止 |
| `crashed` | 進程崩潰 |
| `oom` | 記憶體不足 |
| `launch-failed` | 進程啟動失敗 |
| `integrity-failure` | 程式碼完整性檢查失敗 |

### 5.2 處理未回應的 Renderer

```typescript
// main.ts
mainWindow.webContents.on('unresponsive', async () => {
  const { response } = await dialog.showMessageBox({
    message: '應用程式沒有回應',
    title: '是否要強制重新載入？',
    buttons: ['重新載入', '等待'],
    cancelId: 1,
  })

  if (response === 0) {
    mainWindow.webContents.forcefullyCrashRenderer()
    mainWindow.webContents.reload()
  }
})

mainWindow.webContents.on('responsive', () => {
  console.log('Renderer is responsive again')
})
```

### 5.3 Crash Reporter 設定

```typescript
// main.ts - 應在 app.on('ready') 之前初始化
import { crashReporter } from 'electron'

crashReporter.start({
  submitURL: 'https://your-crash-server.com/submit',
  uploadToServer: true,
  extra: {
    appVersion: app.getVersion(),
    environment: process.env['NODE_ENV'] ?? 'production',
  },
  rateLimit: true, // macOS/Windows：限制每小時 1 次上傳
})
```

### 5.4 子進程崩潰處理

```typescript
// main.ts
app.on('child-process-gone', (event, details) => {
  console.error(`Child process gone: ${details.type}`, details.reason)
  // details.type: 'Utility', 'GPU', 'Plugin' 等
})
```

---

## 6. electron-vite 特定注意事項

### 6.1 專案結構

```
├── electron.vite.config.ts
├── src/
│   ├── main/           # Main process
│   │   └── index.ts
│   ├── preload/         # Preload scripts
│   │   └── index.ts
│   └── renderer/        # Renderer process
│       ├── index.html
│       └── src/
│           └── App.tsx
├── resources/           # 靜態資源
└── out/                 # 建置輸出
```

### 6.2 HMR 與 Hot Reloading

```typescript
// src/main/index.ts - 開發/生產環境 URL 切換
function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
    },
  })

  // electron-vite 自動設定此環境變數
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}
```

**啟用 hot reloading：**

```bash
# CLI 方式（推薦，保持靈活性）
electron-vite dev --watch
```

```typescript
// electron.vite.config.ts 方式
import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {
    build: {
      watch: {}, // 啟用 main process 的 hot reloading
    },
  },
  preload: {
    build: {
      watch: {},
    },
  },
  renderer: {
    // Renderer 使用 Vite 原生 HMR
  },
})
```

### 6.3 Hot Reloading 行為

| 變更來源 | 行為 |
|---------|------|
| Main process | 重新建置 → 重啟整個 Electron 應用 |
| Preload script | 重新建置 → 重新載入 renderer |
| Renderer | Vite HMR（保持狀態的熱更新） |

### 6.4 TypeScript 整合

electron-vite 內建 TypeScript 支援，無需額外設定。建議搭配 `tsconfig.json` 的 paths 對應：

```typescript
// electron.vite.config.ts
import { defineConfig } from 'electron-vite'
import { resolve } from 'path'

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        '@shared': resolve('src/shared'),
      },
    },
  },
  preload: {
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared'),
      },
    },
  },
})
```

### 6.5 Asset 處理

- **Renderer**：使用 Vite 標準 asset 處理（import、public 目錄）
- **Main/Preload**：electron-vite 提供專門的 asset 處理機制
- **Worker 支援**：可透過 import suffixes 載入 Worker Threads、Child Process、Utility Process

### 6.6 Source Code 保護

electron-vite 支援將程式碼編譯為 V8 bytecode，保護源碼不被輕易反編譯。

---

## 7. Electron 26-35 API 變化

### 7.1 重大版本變更摘要

| 版本 | Chromium | Node.js | V8 | 重要變更 |
|------|----------|---------|-----|---------|
| 28 | 120 | 18.18.2 | 12.0 | ESM 支援、`ipcRenderer.sendTo()` 移除 |
| 29 | 122 | 20.9.0 | 12.2 | `crashed` 事件移除 → `render-process-gone` |
| 30 | 124 | 20.11.1 | 12.4 | `BrowserView` 廢棄 → `WebContentsView` |
| 31 | 126 | 20.14.0 | 12.6 | WebSQL 移除 |
| 32 | 128 | 20.16.0 | 12.8 | `File.path` 移除 → `webUtils.getPathForFile()` |
| 33 | - | - | - | C++20 原生模組需求、macOS 10.15 不再支援 |
| 34 | - | - | - | Windows 全螢幕時選單列自動隱藏 |
| 35 | - | - | - | `protocol.handle()` 取代舊 protocol API |

### 7.2 關鍵遷移事項

**Electron 28+：`ipcRenderer.sendTo()` 移除**

```typescript
// ❌ 已移除
ipcRenderer.sendTo(webContentsId, channel, ...args)

// ✅ 使用 MessageChannel 替代 renderer 間通訊
const { port1, port2 } = new MessageChannelMain()
window1.webContents.postMessage('port', null, [port1])
window2.webContents.postMessage('port', null, [port2])
```

**Electron 29+：崩潰事件更名**

```typescript
// ❌ 已移除
webContents.on('crashed', handler)

// ✅ 使用新事件
webContents.on('render-process-gone', (event, details) => {
  console.log(details.reason) // 'crashed' | 'oom' | 'killed' | ...
})
```

**Electron 30+：BrowserView 廢棄**

```typescript
// ❌ 已廢棄
const view = new BrowserView()
mainWindow.setBrowserView(view)

// ✅ 使用 WebContentsView
const view = new WebContentsView()
mainWindow.contentView.addChildView(view)
```

**Electron 32+：File.path 移除**

```typescript
// ❌ 已移除（renderer process）
const path = file.path

// ✅ 使用 webUtils
import { webUtils } from 'electron'
const path = webUtils.getPathForFile(file)
```

**Electron 35+：Protocol 註冊方式變更**

```typescript
// ❌ 舊 API
protocol.registerFileProtocol('app', handler)

// ✅ 新 API
protocol.handle('app', handler)
```

---

## 8. contextIsolation 與 sandbox 設定

### 8.1 設定矩陣與影響

| 設定 | 預設值 | 影響 |
|------|--------|------|
| `contextIsolation: true` | Electron 12+ 預設 | Preload 與 renderer 在獨立 JS context 執行 |
| `sandbox: true` | Electron 20+ 預設 | Preload 只能使用受限的 Node.js polyfill |
| `nodeIntegration: false` | 預設 | Renderer 不能直接使用 Node.js API |

### 8.2 Sandbox 模式下 Preload 可用的 API

```typescript
// sandbox: true 時 preload 可用的模組
import { contextBridge, crashReporter, ipcRenderer, nativeImage, webFrame, webUtils } from 'electron'
import events from 'node:events'
import timers from 'node:timers'
import url from 'node:url'

// 可用的全域物件
// Buffer, process, clearImmediate, setImmediate
```

### 8.3 安全設定建議

```typescript
// 最安全的設定組合
const mainWindow = new BrowserWindow({
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
  },
})

// 額外安全措施：封鎖非預期的導航
mainWindow.webContents.on('will-navigate', (event) => {
  event.preventDefault()
})

mainWindow.webContents.setWindowOpenHandler(() => ({
  action: 'deny',
}))
```

### 8.4 何時需要停用 Sandbox

- 使用 `nodeIntegrationInWorker`（Web Worker 中使用 Node.js）
- Preload script 需要存取檔案系統（應改用 IPC 委託給 main process）
- 使用某些需要完整 Node.js 環境的套件

---

## 9. 多視窗管理

### 9.1 BrowserWindow Pool 模式

```typescript
// window-manager.ts
interface WindowEntry {
  readonly id: number
  readonly window: BrowserWindow
  readonly type: string
}

class WindowManager {
  private readonly windows: Map<number, WindowEntry> = new Map()

  createWindow(type: string, options: BrowserWindowConstructorOptions): BrowserWindow {
    const win = new BrowserWindow(options)

    const entry: WindowEntry = {
      id: win.id,
      window: win,
      type,
    }

    this.windows.set(win.id, entry)

    // 視窗關閉時自動清理
    win.on('closed', () => {
      this.windows.delete(win.id)
    })

    return win
  }

  getWindowsByType(type: string): readonly BrowserWindow[] {
    return [...this.windows.values()]
      .filter((entry) => entry.type === type)
      .map((entry) => entry.window)
  }

  closeAll(): void {
    for (const entry of this.windows.values()) {
      entry.window.close()
    }
  }
}
```

### 9.2 視窗生命週期管理

```typescript
// main.ts
const win = new BrowserWindow({ show: false })

// 延遲顯示，避免白屏閃爍
win.once('ready-to-show', () => {
  win.show()
})

// 監聽視窗狀態
win.on('close', (event) => {
  // 可在此阻止關閉（例如：有未儲存的變更）
  event.preventDefault()
  // 詢問使用者後再決定是否關閉
})

// 視窗失焦/獲焦
win.on('blur', () => { /* 降低更新頻率 */ })
win.on('focus', () => { /* 恢復正常更新頻率 */ })
```

### 9.3 記憶體考量

每個 BrowserWindow 約占用 **100MB** 記憶體（獨立 renderer process），因此：

- 考慮重複使用視窗而非建立新視窗
- 使用 `win.destroy()` 而非 `win.close()` 立即釋放資源
- 對隱藏視窗啟用 `backgroundThrottling`（Electron 28+ 注意：設為 false 會影響同一 BrowserWindow 的所有 WebContents）

---

## 10. 記憶體管理

### 10.1 V8 Memory Cage 影響

從 Electron 21+ 開始，V8 Memory Cage 要求所有 ArrayBuffer 必須在 V8 管理的記憶體內：

```c
// ❌ Electron 20+ 會崩潰 - 外部記憶體的 ArrayBuffer
napi_create_external_buffer(env, length, data, finalizer, NULL, &result);

// ✅ 將資料複製到 V8 記憶體
napi_create_buffer_copy(env, length, data, &copied_data, &result);
```

**V8 heap 限制為 4GB**（pointer compression）。

### 10.2 大量 Buffer 處理建議

```typescript
// 使用 Stream 而非一次載入整個檔案
// ❌ 記憶體爆炸
const data = await fs.readFile(largeFilePath)

// ✅ 串流處理
const stream = createReadStream(largeFilePath, {
  highWaterMark: 64 * 1024, // 64KB chunks
})

for await (const chunk of stream) {
  // 逐塊處理
}
```

### 10.3 記憶體洩漏防治

```typescript
// 1. 清理 IPC 監聽器
ipcMain.removeHandler('channel-name')
ipcMain.removeAllListeners('channel-name')

// 2. 清理定時器
const timerId = setInterval(() => {}, 1000)
clearInterval(timerId) // 務必清理

// 3. 視窗關閉時清理資源
win.on('closed', () => {
  // 清理該視窗相關的所有監聽器和資源
})

// 4. 監控記憶體使用
setInterval(() => {
  const usage = process.memoryUsage()
  console.log(`Heap: ${Math.round(usage.heapUsed / 1024 / 1024)}MB`)
}, 30000)
```

### 10.4 記憶體監控 API

```typescript
// Main process
const memUsage = process.memoryUsage()
// { rss, heapTotal, heapUsed, external, arrayBuffers }

// Renderer process
const perfMemory = performance.memory
// { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit }
```

---

## 11. Node.js 版本相容性

### 11.1 版本對照表（2024-2025）

| Electron 版本 | Node.js 版本 | Chromium 版本 | 發布時間 |
|-------------|-------------|--------------|---------|
| 28.x | 18.18.2 | 120 | 2023-12 |
| 29.x | 20.9.0 | 122 | 2024-02 |
| 30.x | 20.11.1 | 124 | 2024-04 |
| 31.x | 20.14.0 | 126 | 2024-06 |
| 32.x | 20.16.0 | 128 | 2024-08 |

### 11.2 生態系遷移至 Node 22

2025 年初，Electron 的 npm 生態系套件（`@electron/*` 和 `@electron-forge/*`）將 Node.js 22 設為最低支援版本。這意味著：

- 開發環境建議使用 Node.js 22+
- CI/CD 也需要更新至 Node.js 22+
- Electron runtime 內建的 Node.js 版本與開發環境的 Node.js 版本是**獨立**的

### 11.3 ESM 支援（Electron 28+）

Electron 28 正式支援 ECMAScript Modules（ESM），包括：

- Main process 可使用 ESM
- UtilityProcess API 支援 ESM 入口點
- 搭配 electron-vite 可完整使用 ESM + TypeScript

---

## 參考資源

### Electron 官方文件

- [Inter-Process Communication](https://www.electronjs.org/docs/latest/tutorial/ipc)
- [Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- [MessagePorts in Electron](https://www.electronjs.org/docs/latest/tutorial/message-ports/)
- [Process Sandboxing](https://www.electronjs.org/docs/latest/tutorial/sandbox)
- [Multithreading](https://www.electronjs.org/docs/latest/tutorial/multithreading)
- [Performance](https://www.electronjs.org/docs/latest/tutorial/performance)
- [Breaking Changes](https://www.electronjs.org/docs/latest/breaking-changes)
- [crashReporter API](https://www.electronjs.org/docs/latest/api/crash-reporter)
- [webContents API](https://www.electronjs.org/docs/latest/api/web-contents)
- [V8 Memory Cage](https://www.electronjs.org/blog/v8-memory-cage)
- [Electron Releases Timeline](https://www.electronjs.org/docs/latest/tutorial/electron-timelines)
- [Moving Ecosystem to Node 22](https://www.electronjs.org/blog/ecosystem-node-22)

### electron-vite

- [electron-vite 官方網站](https://electron-vite.org/)
- [HMR and Hot Reloading](https://electron-vite.org/guide/hmr-and-hot-reloading)

### 社群資源

- [Building High-Performance Electron Apps](https://www.johnnyle.io/read/electron-performance)
- [IPC in Electron - Ray](https://myray.app/blog/ipc-in-electron)
- [Electron App Performance Optimization](https://brainhub.eu/library/electron-app-performance)
- [Electron Performance Optimization Guide](https://emadibrahim.com/electron-guide/performance)
