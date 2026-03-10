# @electron-toolkit/typed-ipc 使用模式研究

> 調查日期：2026-03-10
> 來源：npm、GitHub (alex8088/electron-toolkit)、Electron 官方文件

---

## 1. 套件概覽

`@electron-toolkit/typed-ipc` 是 [alex8088/electron-toolkit](https://github.com/alex8088/electron-toolkit) 生態系中的型別安全 IPC 套件，搭配 `@electron-toolkit/preload` 使用。

**設計理念**：
- 保留 Electron 原生 IPC 寫法，不過度封裝
- 在 main/renderer 雙側都提供 TypeScript 型別檢查與 IntelliSense
- listener 參數、handler 參數與回傳值型別皆可靜態驗證
- 避免因 channel string typo 導致的低層錯誤

---

## 2. 安裝

```bash
npm i @electron-toolkit/preload @electron-toolkit/typed-ipc
```

兩個套件必須同時安裝：
- `@electron-toolkit/preload`：負責透過 `contextBridge` 暴露 `electronAPI`，讓 renderer 可存取 `window.electron.ipcRenderer`
- `@electron-toolkit/typed-ipc`：提供泛型的 `IpcListener` / `IpcEmitter` 類別，套用型別約束

---

## 3. 核心型別系統

### 3.1 內部型別定義（套件原始碼）

```typescript
// 套件內部的 types.ts
type IpcListenEventMap = {
  [key: string]: [...args: any[]]
}

type IpcHandleEventMap = {
  [key: string]: (...args: any[]) => any
}

// IpcEventMap 是兩者的聯合
type IpcEventMap = IpcListenEventMap | IpcHandleEventMap

// 條件型別：從聯合中萃取對應的部分
type ExtractArgs<T> = T extends IpcListenEventMap ? T : never
type ExtractHandler<T> = T extends IpcHandleEventMap ? T : never
```

### 3.2 區分兩種 channel 型態

| 型態 | 值的形式 | 用途 |
|------|---------|------|
| Listener event map | `channel: [arg1, arg2, ...]` | renderer → main 的單向 `send` |
| Handler event map | `channel: (...args) => ReturnType` | renderer → main 的 `invoke`（有回應） |

---

## 4. IPC Channel Type Map 定義（共用型別）

在專案的 `src/shared/` 或全域 `*.d.ts` 中定義，供 main 和 renderer 共用：

```typescript
// src/shared/ipc-types.d.ts（或 env.d.ts / globals.d.ts）

// ── Main process 接收的 IPC events ──
// 使用聯合型別（union）區分 listener 和 handler
type IpcEvents =
  | {
      // Listener event map：renderer.send → main.on
      // 值為 tuple，代表參數清單
      ping: [message: string]
      'upload-file': [filePath: string, destination: string]
    }
  | {
      // Handler event map：renderer.invoke → main.handle
      // 值為函式型別，代表 handler 簽名
      'say-hello': () => string
      'get-file-list': (directory: string) => Promise<string[]>
      'backup-start': (config: BackupConfig) => Promise<BackupResult>
    }

// ── Renderer process 接收的 IPC events（main → renderer push）──
// 只有 listener event map，因為 renderer 不 handle
type IpcRendererEvent = {
  // main.send → renderer.on
  ready: [isReady: boolean]
  'backup-progress': [percent: number, message: string]
  'backup-complete': [result: BackupResult]
  'backup-error': [error: string]
}
```

> **重要**：必須在 `tsconfig.json` 的 `include` 中納入此 `.d.ts` 檔案，否則型別不會生效。

```json
// tsconfig.json
{
  "include": [
    "src/**/*.ts",
    "src/**/*.d.ts"
  ]
}
```

---

## 5. Preload 設定（contextBridge 暴露）

`@electron-toolkit/typed-ipc` 在 renderer 端依賴 `window.electron.ipcRenderer`，由 preload 透過 contextBridge 注入。

### 方法一：使用 `@electron-toolkit/preload` 快捷函式（推薦）

```typescript
// src/preload/index.ts
import { exposeElectronAPI } from '@electron-toolkit/preload'

exposeElectronAPI()
// 等同於下方手動方式，自動處理 contextIsolated 判斷
```

### 方法二：手動 contextBridge

```typescript
// src/preload/index.ts
import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  // context isolation 關閉時直接掛到 window
  window.electron = electronAPI
}
```

### electronAPI 暴露的 ipcRenderer 方法

`window.electron.ipcRenderer` 包含以下方法（`@electron-toolkit/typed-ipc` renderer 端內部使用）：

- `send(channel, ...args)` — 單向傳送
- `invoke(channel, ...args)` — 請求/回應
- `on(channel, listener)` — 監聽主進程推送
- `once(channel, listener)` — 一次性監聽
- `removeAllListeners(channel)`
- `removeListener(channel, listener)`

### TypeScript Window 型別宣告

```typescript
// src/preload/index.d.ts 或 src/renderer/env.d.ts
import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
  }
}
```

---

## 6. Renderer → Main 模式（invoke/handle）

### 6.1 Main Process：註冊 handler

```typescript
// src/main/index.ts
import { IpcListener, IpcEmitter } from '@electron-toolkit/typed-ipc/main'

// 泛型參數傳入共用的型別定義
const ipcMain = new IpcListener<IpcEvents>()
const ipcEmitter = new IpcEmitter<IpcRendererEvent>()

// ✅ handle 只能用在 handler event map 的 channel
// ✅ 返回值型別自動推導自 IpcEvents 中的函式簽名
ipcMain.handle('say-hello', () => {
  return 'hello'  // 型別：string（符合 () => string）
})

ipcMain.handle('backup-start', async (event, config) => {
  // config 型別自動推導為 BackupConfig
  const result = await performBackup(config)
  return result  // 型別必須符合 BackupResult
})

// ❌ 編譯錯誤：'ping' 是 listener channel，不能用 handle
// ipcMain.handle('ping', () => {})
```

### 6.2 Renderer Process：呼叫 invoke

```typescript
// src/renderer/src/services/ipc.ts
import { IpcEmitter } from '@electron-toolkit/typed-ipc/renderer'

const emitter = new IpcEmitter<IpcEvents>()

// ✅ invoke 返回 Promise，型別自動推導
const greeting = await emitter.invoke('say-hello')
// greeting 型別：string

const result = await emitter.invoke('backup-start', config)
// result 型別：BackupResult

// ❌ 編譯錯誤：'ping' 是 listener channel，不能用 invoke
// await emitter.invoke('ping')
```

---

## 7. Main → Renderer Push 模式（send/on）

### 7.1 Main Process：推送訊息給 Renderer

```typescript
// src/main/index.ts
import { IpcEmitter } from '@electron-toolkit/typed-ipc/main'

const ipcEmitter = new IpcEmitter<IpcRendererEvent>()

// ✅ 第一個參數是 WebContents（指定目標視窗）
// ✅ 之後的參數型別由 IpcRendererEvent 約束
ipcEmitter.send(mainWindow.webContents, 'ready', true)
// 'ready' 對應 [isReady: boolean]，第三個參數型別為 boolean

ipcEmitter.send(mainWindow.webContents, 'backup-progress', 50, '上傳中...')
// 型別：[percent: number, message: string]

// 在 ipcMain listener 的 event handler 中可用 event.sender
ipcMain.on('ping', (event, message) => {
  // event.sender 即為發送方的 WebContents
  ipcEmitter.send(event.sender, 'ready', true)
})
```

### 7.2 Main Process：監聽 Renderer 單向傳送

```typescript
// src/main/index.ts
import { IpcListener } from '@electron-toolkit/typed-ipc/main'

const ipcMain = new IpcListener<IpcEvents>()

// ✅ on 只能用在 listener event map 的 channel
// ✅ args 型別自動推導
ipcMain.on('ping', (event, message) => {
  // message 型別：string
  console.log(message)
})

ipcMain.on('upload-file', (event, filePath, destination) => {
  // filePath: string, destination: string
})
```

### 7.3 Renderer Process：監聽 Main 推送

```typescript
// src/renderer/src/hooks/useIpc.ts
import { IpcListener } from '@electron-toolkit/typed-ipc/renderer'

const ipcListener = new IpcListener<IpcRendererEvent>()

// ✅ on 返回取消訂閱函式（cleanup function）
const unsubscribe = ipcListener.on('ready', (event, isReady) => {
  // isReady 型別：boolean
  console.log('App ready:', isReady)
})

// React useEffect 中使用
useEffect(() => {
  const unsubscribe = ipcListener.on('backup-progress', (event, percent, message) => {
    setProgress(percent)
    setStatusMessage(message)
  })

  return () => {
    unsubscribe()  // 元件卸載時清除監聽，避免記憶體洩漏
  }
}, [])
```

---

## 8. Renderer 單向傳送（send）

```typescript
// src/renderer/src/services/ipc.ts
import { IpcEmitter } from '@electron-toolkit/typed-ipc/renderer'

const emitter = new IpcEmitter<IpcEvents>()

// ✅ send 用於 listener event map 的 channel（不等待回應）
emitter.send('ping', 'hello main')
// 'ping' 對應 [message: string]，第二個參數型別為 string

emitter.send('upload-file', '/path/to/file', '/destination')
// 型別：[filePath: string, destination: string]

// ❌ 編譯錯誤：'say-hello' 是 handler channel，應用 invoke
// emitter.send('say-hello')
```

---

## 9. 完整實作範例

### 9.1 專案目錄結構

```
src/
├── shared/
│   └── ipc-types.d.ts        # ← 共用型別定義（main + renderer 都用）
├── main/
│   └── index.ts              # ← IpcListener + IpcEmitter（main 端）
├── preload/
│   └── index.ts              # ← contextBridge 暴露 electronAPI
└── renderer/
    └── src/
        ├── env.d.ts          # ← Window 型別擴充
        └── services/
            └── ipc.ts        # ← IpcListener + IpcEmitter（renderer 端）
```

### 9.2 完整型別定義

```typescript
// src/shared/ipc-types.d.ts
interface BackupConfig {
  source: string
  destination: string
  incremental: boolean
}

interface BackupResult {
  success: boolean
  filesCount: number
  totalBytes: number
  errorMessage?: string
}

// Main process 接收（renderer → main）
type IpcEvents =
  | {
      ping: [message: string]
    }
  | {
      'say-hello': () => string
      'get-backup-status': () => Promise<'idle' | 'running' | 'error'>
      'start-backup': (config: BackupConfig) => Promise<BackupResult>
    }

// Renderer process 接收（main → renderer push）
type IpcRendererEvent = {
  'app-ready': [isReady: boolean]
  'backup-progress': [percent: number, currentFile: string]
  'backup-complete': [result: BackupResult]
  'backup-error': [errorMessage: string]
}
```

### 9.3 Preload

```typescript
// src/preload/index.ts
import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
}
```

### 9.4 Main Process

```typescript
// src/main/index.ts
import { app, BrowserWindow } from 'electron'
import { IpcListener, IpcEmitter } from '@electron-toolkit/typed-ipc/main'

let mainWindow: BrowserWindow

const ipc = new IpcListener<IpcEvents>()
const emitter = new IpcEmitter<IpcRendererEvent>()

// Handler（renderer.invoke → main.handle，有回傳值）
ipc.handle('say-hello', () => 'hello from main')

ipc.handle('get-backup-status', async () => {
  return 'idle' as const
})

ipc.handle('start-backup', async (event, config) => {
  // 傳送進度給 renderer
  emitter.send(event.sender, 'backup-progress', 0, '初始化...')

  try {
    const result = await runBackup(config, (percent, file) => {
      emitter.send(event.sender, 'backup-progress', percent, file)
    })
    emitter.send(event.sender, 'backup-complete', result)
    return result
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : '未知錯誤'
    emitter.send(event.sender, 'backup-error', errorMessage)
    return { success: false, filesCount: 0, totalBytes: 0, errorMessage }
  }
})

// Listener（renderer.send → main.on，無回傳值）
ipc.on('ping', (event, message) => {
  console.log('Received ping:', message)
  emitter.send(event.sender, 'app-ready', true)
})

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false
    }
  })

  mainWindow.loadURL('...')

  // 視窗就緒後通知 renderer
  mainWindow.webContents.on('did-finish-load', () => {
    emitter.send(mainWindow.webContents, 'app-ready', true)
  })
})
```

### 9.5 Renderer Process

```typescript
// src/renderer/src/services/ipc.ts
import { IpcListener, IpcEmitter } from '@electron-toolkit/typed-ipc/renderer'

export const ipcListener = new IpcListener<IpcRendererEvent>()
export const ipcEmitter = new IpcEmitter<IpcEvents>()

// ── Renderer 呼叫 Main ──

// invoke（有回傳值）
export async function sayHello(): Promise<string> {
  return ipcEmitter.invoke('say-hello')
}

export async function startBackup(config: BackupConfig): Promise<BackupResult> {
  return ipcEmitter.invoke('start-backup', config)
}

// send（無回傳值）
export function sendPing(message: string): void {
  ipcEmitter.send('ping', message)
}
```

```typescript
// src/renderer/src/hooks/useBackup.ts
import { useEffect, useState } from 'react'
import { ipcListener, ipcEmitter } from '../services/ipc'

export function useBackup() {
  const [progress, setProgress] = useState(0)
  const [currentFile, setCurrentFile] = useState('')
  const [result, setResult] = useState<BackupResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // 訂閱 main → renderer 的 push 訊息
    const unsubProgress = ipcListener.on('backup-progress', (_, percent, file) => {
      setProgress(percent)
      setCurrentFile(file)
    })

    const unsubComplete = ipcListener.on('backup-complete', (_, result) => {
      setResult(result)
    })

    const unsubError = ipcListener.on('backup-error', (_, errorMessage) => {
      setError(errorMessage)
    })

    // 元件卸載時清除所有監聽（避免記憶體洩漏）
    return () => {
      unsubProgress()
      unsubComplete()
      unsubError()
    }
  }, [])

  const startBackup = async (config: BackupConfig) => {
    setProgress(0)
    setError(null)
    await ipcEmitter.invoke('start-backup', config)
  }

  return { progress, currentFile, result, error, startBackup }
}
```

### 9.6 Window 型別宣告

```typescript
// src/renderer/src/env.d.ts
import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
  }
}
```

---

## 10. 套件內部實作（renderer.ts 原始碼）

```typescript
// @electron-toolkit/typed-ipc/renderer（簡化版）
import type { IpcEventMap, IpcListenEventMap, ExtractArgs, ExtractHandler } from './types'

export class IpcEmitter<T extends IpcEventMap> {
  // send：用於 listener event map
  send<E extends keyof ExtractArgs<T>>(
    channel: Extract<E, string>,
    ...args: ExtractArgs<T>[E]
  ): void {
    window.electron.ipcRenderer.send(channel, ...args)
  }

  // invoke：用於 handler event map，返回 Promise
  invoke<E extends keyof ExtractHandler<T>>(
    channel: Extract<E, string>,
    ...args: Parameters<ExtractHandler<T>[E]>
  ): Promise<ReturnType<ExtractHandler<T>[E]>> {
    return window.electron.ipcRenderer.invoke(channel, ...args)
  }
}

export class IpcListener<T extends IpcListenEventMap> {
  // on：監聽，返回取消訂閱函式
  on<E extends keyof T>(
    channel: Extract<E, string>,
    listener: (e: Electron.IpcRendererEvent, ...args: T[E]) => void
  ): () => void {
    return window.electron.ipcRenderer.on(channel, listener as any)
  }

  // once：一次性監聽，返回取消訂閱函式
  once<E extends keyof T>(
    channel: Extract<E, string>,
    listener: (e: Electron.IpcRendererEvent, ...args: T[E]) => void | Promise<void>
  ): () => void {
    return window.electron.ipcRenderer.once(channel, listener as any)
  }
}
```

---

## 11. 與原生 Electron IPC 的差異

| 面向 | 原生 Electron IPC | @electron-toolkit/typed-ipc |
|------|------------------|------------------------------|
| channel 名稱 | 任意字串，無驗證 | 必須是型別 map 中定義的 key |
| 參數型別 | `any[]`，無推導 | 自動從型別 map 推導 |
| 回傳值型別 | `Promise<any>` | 自動推導為 handler 函式的返回型別 |
| IntelliSense | 無 channel 補全 | 有 channel 名稱自動補全 |
| listener/handler 混淆 | 可能誤用（runtime 才發現） | 編譯期分離，`send` 只能用 listener channel，`invoke` 只能用 handler channel |
| 清除監聽 | 需手動存 reference 再 `removeListener` | `on()` 直接返回 unsubscribe 函式 |
| 封裝程度 | 低層 API | 薄包裝，保留原生寫法 |

### 注意事項

1. **型別 map 必須是聯合型別（union）而非交集**：`IpcEvents` 是 `listener map | handler map`，不能混在同一個物件中
2. **`.d.ts` 必須被 tsconfig 涵蓋**：若型別未生效，檢查 `include` 設定
3. **renderer 端依賴 `window.electron`**：若未正確設定 preload，runtime 會拋出 `window.electron is undefined`
4. **`contextIsolation: true` 是前提**：應保持開啟，不建議關閉（安全性考量）
5. **`on()` 返回的 unsubscribe 必須呼叫**：特別在 React 的 `useEffect` cleanup 中，避免元件重新掛載時累積重複監聽
6. **`IpcEmitter`（main 端）的 `send()` 第一個參數是 `WebContents`**，renderer 端的 `send()` 沒有這個參數

---

## 12. 替代方案比較

若專案無法使用 `@electron-toolkit/typed-ipc`，以下為類似的型別安全 IPC 方案：

| 套件 | 特色 | 適用場景 |
|------|------|---------|
| `electron-typed-ipc` (deiucanta) | 提供 `TypedIpcMain` / `TypedIpcRenderer` 包裝原生 API | 不依賴 electron-toolkit 生態 |
| `electron-typescript-ipc` (JichouP) | 專注 contextBridge 型別安全，提供 `createIpcRenderer` | 自訂 preload API 設計 |
| `interprocess` (daltonmenezes) | 完整的 IPC 管理工具，支援 RPC 風格 | 大型應用，需要更完整的抽象 |
| 手動型別斷言 | 在原生 IPC 上加型別投射 | 簡單專案，不想額外依賴 |

---

## 來源

- [@electron-toolkit/typed-ipc - npm](https://www.npmjs.com/package/@electron-toolkit/typed-ipc)
- [GitHub - alex8088/electron-toolkit](https://github.com/alex8088/electron-toolkit)
- [@electron-toolkit/preload - npm](https://www.npmjs.com/package/@electron-toolkit/preload)
- [Type-safe IPC in Electron - heckmann.app](https://heckmann.app/en/blog/electron-ipc-architecture/)
- [Inter-Process Communication | Electron 官方文件](https://www.electronjs.org/docs/latest/tutorial/ipc)
- [GitHub - deiucanta/electron-typed-ipc](https://github.com/deiucanta/electron-typed-ipc)
- [GitHub - JichouP/electron-typescript-ipc](https://github.com/JichouP/electron-typescript-ipc)
- [electron-ipc.com - EIPC 文件](https://electron-ipc.com/docs/getting-started/introduction/)
