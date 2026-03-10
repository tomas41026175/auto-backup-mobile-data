# Vitest 測試 Electron Main Process 服務

收集日期：2026-03-10
適用版本：Vitest 3.x、electron-vite 2.x、Electron 30+

---

## 目錄

1. [vitest.config.ts 設定（electron-vite 專案）](#1-vitestconfigts-設定electron-vite-專案)
2. [Mock Electron API](#2-mock-electron-api)
3. [Mock bonjour-service](#3-mock-bonjour-service)
4. [測試 Debounce 邏輯](#4-測試-debounce-邏輯)
5. [測試 EventEmitter 模式的服務](#5-測試-eventemitter-模式的服務)
6. [electron-store Mock 方式](#6-electron-store-mock-方式)
7. [整合測試設定](#7-整合測試設定)
8. [測試覆蓋率設定](#8-測試覆蓋率設定)
9. [device-scanner.test.ts 範例結構](#9-device-scannertestts-範例結構)
10. [backup-manager.test.ts 範例結構](#10-backup-managertestts-範例結構)
11. [參考來源](#11-參考來源)

---

## 1. vitest.config.ts 設定（electron-vite 專案）

### 架構概念

electron-vite 專案包含三個獨立的 Vite 設定（main、preload、renderer），測試時需針對不同 process 使用不同 environment：

- **main process**：`environment: 'node'`
- **renderer process**：`environment: 'jsdom'` 或 `'happy-dom'`

### electron.vite.config.ts（修改為可 export）

```typescript
// electron.vite.config.ts
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import type { UserConfig } from 'vite'

// 各 process 獨立 export，供 vitest.config.ts 使用
export const main: UserConfig = {
  plugins: [externalizeDepsPlugin()],
  resolve: {
    alias: {
      '@main': resolve('src/main'),
    },
  },
}

export const preload: UserConfig = {
  plugins: [externalizeDepsPlugin()],
}

export const renderer: UserConfig = {
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
    },
  },
  plugins: [react()],
}

export default defineConfig({ main, preload, renderer })
```

### vitest.config.ts（使用 projects 設定，Vitest 3.x 推薦）

> **注意**：Vitest 3.2 起，`vitest.workspace.ts` 已被棄用，改用 `test.projects`。

```typescript
// vitest.config.ts
import { defineConfig, mergeConfig } from 'vitest/config'
import { main, renderer } from './electron.vite.config'

export default defineConfig({
  test: {
    projects: [
      // Main process 測試：Node 環境
      mergeConfig(main, {
        test: {
          name: 'main',
          include: ['src/main/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['./src/test/setup-main.ts'],
        },
      }),
      // Renderer process 測試：瀏覽器模擬環境
      mergeConfig(renderer, {
        test: {
          name: 'renderer',
          include: ['src/renderer/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['./src/test/setup-renderer.ts'],
        },
      }),
    ],
    // 僅在 root-level 有效的設定
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/main/**/*.ts', 'src/renderer/**/*.{ts,tsx}'],
      exclude: ['**/*.test.ts', '**/*.spec.ts', '**/node_modules/**'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
})
```

### 舊版 vitest.workspace.ts（Vitest 2.x 相容）

```typescript
// vitest.workspace.ts（2.x 方式，3.x 已棄用但仍可用）
import { mergeConfig } from 'vite'
import { defineWorkspace } from 'vitest/config'
import { main, renderer } from './electron.vite.config'

export default defineWorkspace([
  mergeConfig(main, {
    test: {
      include: ['src/main/**/*.test.ts'],
      name: 'main',
      environment: 'node',
    },
  }),
  mergeConfig(renderer, {
    test: {
      include: ['src/renderer/**/*.test.{ts,tsx}'],
      name: 'renderer',
      environment: 'jsdom',
    },
  }),
])
```

### package.json 腳本

```json
{
  "scripts": {
    "test": "vitest",
    "test:main": "vitest --project main",
    "test:renderer": "vitest --project renderer",
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui"
  }
}
```

---

## 2. Mock Electron API

### 方法一：`__mocks__/electron.ts` 手動 Mock（推薦）

在專案根目錄建立 `__mocks__/electron.ts`，Vitest 會自動載入：

```typescript
// __mocks__/electron.ts
import { vi } from 'vitest'

// --- app ---
const app = {
  isPackaged: false,
  getPath: vi.fn((name: string) => `/mock/path/${name}`),
  getVersion: vi.fn(() => '1.0.0'),
  getName: vi.fn(() => 'test-app'),
  quit: vi.fn(),
  on: vi.fn(),
  whenReady: vi.fn(() => Promise.resolve()),
}

// --- BrowserWindow ---
const mockWebContents = {
  send: vi.fn(),
  on: vi.fn(),
  openDevTools: vi.fn(),
}

const BrowserWindow = vi.fn().mockImplementation(() => ({
  loadURL: vi.fn(),
  loadFile: vi.fn(),
  show: vi.fn(),
  hide: vi.fn(),
  close: vi.fn(),
  destroy: vi.fn(),
  isDestroyed: vi.fn(() => false),
  isMinimized: vi.fn(() => false),
  focus: vi.fn(),
  restore: vi.fn(),
  on: vi.fn(),
  once: vi.fn(),
  off: vi.fn(),
  webContents: mockWebContents,
}))

// 靜態方法
BrowserWindow.getAllWindows = vi.fn(() => [])
BrowserWindow.fromWebContents = vi.fn()

// --- ipcMain ---
const ipcMain = {
  on: vi.fn(),
  once: vi.fn(),
  handle: vi.fn(),
  handleOnce: vi.fn(),
  removeHandler: vi.fn(),
  removeAllListeners: vi.fn(),
}

// --- Notification ---
const Notification = vi.fn().mockImplementation(() => ({
  show: vi.fn(),
  close: vi.fn(),
  on: vi.fn(),
}))
// 靜態方法
Notification.isSupported = vi.fn(() => true)

// --- Tray ---
const Tray = vi.fn().mockImplementation(() => ({
  setToolTip: vi.fn(),
  setContextMenu: vi.fn(),
  setImage: vi.fn(),
  on: vi.fn(),
  destroy: vi.fn(),
}))

// --- Menu ---
const Menu = {
  buildFromTemplate: vi.fn((template) => ({ template })),
  setApplicationMenu: vi.fn(),
}

// --- dialog ---
const dialog = {
  showOpenDialog: vi.fn(),
  showSaveDialog: vi.fn(),
  showMessageBox: vi.fn(),
  showErrorBox: vi.fn(),
}

// --- nativeImage ---
const nativeImage = {
  createFromPath: vi.fn(() => ({ toPNG: vi.fn(), toDataURL: vi.fn() })),
  createEmpty: vi.fn(),
}

// --- shell ---
const shell = {
  openExternal: vi.fn(),
  openPath: vi.fn(),
}

export {
  app,
  BrowserWindow,
  ipcMain,
  Notification,
  Tray,
  Menu,
  dialog,
  nativeImage,
  shell,
}
```

### 方法二：在測試檔案中使用 `vi.mock`

```typescript
// device-scanner.test.ts
import { vi, describe, it, expect, beforeEach } from 'vitest'

// vi.mock 會被 hoisted 到檔案頂端，必須在 import 前定義
vi.mock('electron', () => ({
  ipcMain: {
    on: vi.fn(),
    handle: vi.fn(),
    removeAllListeners: vi.fn(),
  },
  BrowserWindow: vi.fn().mockImplementation(() => ({
    webContents: { send: vi.fn() },
    isDestroyed: vi.fn(() => false),
  })),
  Notification: Object.assign(
    vi.fn().mockImplementation(() => ({ show: vi.fn() })),
    { isSupported: vi.fn(() => true) }
  ),
}))

// 之後才 import 被測試的模組
import { DeviceScanner } from '../src/main/services/device-scanner'
```

### 在測試中取得 Mock 引用

```typescript
import { ipcMain, BrowserWindow } from 'electron'
import { vi } from 'vitest'

// 取得 mock 後可進行斷言
it('should call ipcMain.on', () => {
  const scanner = new DeviceScanner()
  expect(vi.mocked(ipcMain.on)).toHaveBeenCalledWith(
    'scan-devices',
    expect.any(Function)
  )
})
```

---

## 3. Mock bonjour-service

`bonjour-service` 的核心流程：`new Bonjour()` → `bonjour.find(options)` → 監聽 `browser.on('up', cb)` / `browser.on('down', cb)`。

### `__mocks__/bonjour-service.ts`

```typescript
// __mocks__/bonjour-service.ts
import { vi } from 'vitest'
import { EventEmitter } from 'events'

// 模擬 Browser（繼承 EventEmitter 以支援 .on/.emit）
export class MockBrowser extends EventEmitter {
  start = vi.fn()
  stop = vi.fn()
  update = vi.fn()
  services: unknown[] = []
}

// 模擬 Bonjour 實例
export class MockBonjour {
  private browser: MockBrowser

  constructor() {
    this.browser = new MockBrowser()
  }

  find = vi.fn((_options: unknown, onup?: (service: unknown) => void) => {
    if (onup) {
      this.browser.on('up', onup)
    }
    return this.browser
  })

  publish = vi.fn((_options: unknown) => ({
    name: 'mock-service',
    stop: vi.fn(),
  }))

  unpublishAll = vi.fn()
  destroy = vi.fn()

  // 測試輔助：手動觸發裝置發現
  _triggerDeviceUp(service: unknown): void {
    this.browser.emit('up', service)
  }

  _triggerDeviceDown(service: unknown): void {
    this.browser.emit('down', service)
  }

  // 暴露 browser 供測試用
  _getBrowser(): MockBrowser {
    return this.browser
  }
}

// Default export：工廠函式（bonjour-service 預設匯出方式）
const Bonjour = vi.fn().mockImplementation(() => new MockBonjour())

export default Bonjour
```

### 在測試中使用

```typescript
// device-scanner.test.ts
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

vi.mock('bonjour-service')
vi.mock('electron')

import Bonjour from 'bonjour-service'
import { DeviceScanner } from '../src/main/services/device-scanner'

describe('DeviceScanner', () => {
  let scanner: DeviceScanner
  let mockBonjour: ReturnType<typeof Bonjour>

  beforeEach(() => {
    vi.clearAllMocks()
    scanner = new DeviceScanner()
    mockBonjour = vi.mocked(Bonjour).mock.results[0].value
  })

  it('should emit device-found when mDNS service comes up', () => {
    const handler = vi.fn()
    scanner.on('device-found', handler)

    scanner.startScan()

    // 模擬 mDNS 發現新裝置
    mockBonjour._triggerDeviceUp({
      name: 'iPhone-14',
      host: '192.168.1.100',
      port: 62078,
      type: 'apple-mobdev2',
    })

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ host: '192.168.1.100' })
    )
  })
})
```

---

## 4. 測試 Debounce 邏輯

### 核心 API

| 方法 | 用途 |
|------|------|
| `vi.useFakeTimers()` | 接管所有計時器（setTimeout/setInterval） |
| `vi.useRealTimers()` | 還原真實計時器 |
| `vi.advanceTimersByTime(ms)` | 快進指定毫秒 |
| `vi.advanceTimersByTimeAsync(ms)` | 非同步快進（含 Promise microtask） |
| `vi.runAllTimers()` | 執行所有待執行計時器 |
| `vi.runOnlyPendingTimers()` | 僅執行當前待執行計時器 |
| `vi.clearAllTimers()` | 清除所有待執行計時器 |

### 測試 Debounce 的標準模式

```typescript
import { vi, describe, it, expect, afterEach } from 'vitest'

// 假設被測函式有 300ms debounce
import { debouncedSave } from '../src/main/utils/debounce-save'

describe('debouncedSave', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('should not execute before debounce delay', () => {
    vi.useFakeTimers()
    const callback = vi.fn()

    debouncedSave(callback)
    debouncedSave(callback)
    debouncedSave(callback) // 多次呼叫

    // 快進 299ms，尚未觸發
    vi.advanceTimersByTime(299)
    expect(callback).not.toHaveBeenCalled()
  })

  it('should execute exactly once after debounce delay', () => {
    vi.useFakeTimers()
    const callback = vi.fn()

    debouncedSave(callback)
    debouncedSave(callback)
    debouncedSave(callback)

    // 快進超過 debounce 時間
    vi.advanceTimersByTime(300)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('should reset timer on each call', () => {
    vi.useFakeTimers()
    const callback = vi.fn()

    debouncedSave(callback)
    vi.advanceTimersByTime(200) // 快進但未超過

    debouncedSave(callback)    // 重置計時器
    vi.advanceTimersByTime(200) // 從重置點算，仍未超過

    expect(callback).not.toHaveBeenCalled()

    vi.advanceTimersByTime(100) // 現在超過了
    expect(callback).toHaveBeenCalledTimes(1)
  })
})
```

### 在服務類別中測試 Debounce

```typescript
describe('BackupManager - debounced scan', () => {
  it('should debounce rapid file change events', () => {
    vi.useFakeTimers()

    const manager = new BackupManager()
    const triggerBackup = vi.spyOn(manager as never, 'triggerBackup')

    // 模擬快速連續的檔案變更事件
    manager.handleFileChange('/path/to/file1')
    manager.handleFileChange('/path/to/file2')
    manager.handleFileChange('/path/to/file3')

    vi.advanceTimersByTime(500) // 超過 debounce 時間

    // 應只備份一次，不是三次
    expect(triggerBackup).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })
})
```

---

## 5. 測試 EventEmitter 模式的服務

### 基本模式：監聽 emit 事件

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DeviceScanner } from '../src/main/services/device-scanner'

describe('DeviceScanner EventEmitter', () => {
  let scanner: DeviceScanner

  beforeEach(() => {
    scanner = new DeviceScanner()
  })

  it('should emit "device-found" event when new device is discovered', () => {
    const deviceFoundHandler = vi.fn()
    scanner.on('device-found', deviceFoundHandler)

    // 觸發掃描，內部 mDNS mock 會 emit 'up' 事件
    scanner.startScan()

    // 確認事件帶有正確 payload
    expect(deviceFoundHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        name: expect.any(String),
        host: expect.any(String),
        port: expect.any(Number),
      })
    )
  })

  it('should emit "device-lost" event when device disconnects', () => {
    const deviceLostHandler = vi.fn()
    scanner.on('device-lost', deviceLostHandler)

    scanner.startScan()
    // 觸發裝置離線
    scanner.emit('device-lost', { name: 'iPhone-14', host: '192.168.1.100' })

    expect(deviceLostHandler).toHaveBeenCalledTimes(1)
  })

  it('should support multiple listeners', () => {
    const handler1 = vi.fn()
    const handler2 = vi.fn()

    scanner.on('device-found', handler1)
    scanner.on('device-found', handler2)

    scanner.emit('device-found', { name: 'test', host: '10.0.0.1', port: 62078 })

    expect(handler1).toHaveBeenCalledTimes(1)
    expect(handler2).toHaveBeenCalledTimes(1)
  })

  it('should remove listener with off()', () => {
    const handler = vi.fn()
    scanner.on('device-found', handler)
    scanner.off('device-found', handler)

    scanner.emit('device-found', { name: 'test', host: '10.0.0.1', port: 62078 })

    expect(handler).not.toHaveBeenCalled()
  })
})
```

### 使用 Promise 等待非同步事件

```typescript
it('should emit device-found asynchronously', () => {
  return new Promise<void>((resolve) => {
    scanner.once('device-found', (device) => {
      expect(device.host).toBe('192.168.1.100')
      resolve()
    })

    scanner.startScan()
    // 觸發 mock bonjour 發出裝置事件
    mockBonjour._triggerDeviceUp({
      name: 'iPhone',
      host: '192.168.1.100',
      port: 62078,
    })
  })
})
```

---

## 6. electron-store Mock 方式

`electron-store` 在測試環境中無法直接實例化（需要 Electron `app.getPath('userData')`），必須整個替換。

### 方法一：`__mocks__/electron-store.ts`（推薦）

```typescript
// __mocks__/electron-store.ts
import { vi } from 'vitest'

interface StoreOptions<T> {
  defaults?: T
}

// 模擬記憶體內的 store
class MockElectronStore<T extends Record<string, unknown>> {
  private store: Map<string, unknown>

  constructor(options?: StoreOptions<T>) {
    this.store = new Map(Object.entries(options?.defaults ?? {}))
  }

  get = vi.fn(<K extends keyof T>(key: K, defaultValue?: T[K]): T[K] | undefined => {
    return (this.store.get(key as string) ?? defaultValue) as T[K] | undefined
  })

  set = vi.fn(<K extends keyof T>(key: K, value: T[K]): void => {
    this.store.set(key as string, value)
  })

  delete = vi.fn(<K extends keyof T>(key: K): void => {
    this.store.delete(key as string)
  })

  has = vi.fn(<K extends keyof T>(key: K): boolean => {
    return this.store.has(key as string)
  })

  clear = vi.fn((): void => {
    this.store.clear()
  })

  get size(): number {
    return this.store.size
  }

  // 模擬 store 的完整 object
  get store(): Record<string, unknown> {
    return Object.fromEntries(this.store)
  }

  onDidChange = vi.fn()
  onDidAnyChange = vi.fn()
}

export default MockElectronStore
```

### 方法二：在 vitest.config.ts 設定 alias

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    alias: {
      'electron-store': resolve(__dirname, '__mocks__/electron-store.ts'),
    },
  },
})
```

### 方法三：在測試中直接 vi.mock

```typescript
vi.mock('electron-store', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      has: vi.fn(() => false),
      clear: vi.fn(),
      store: {},
    })),
  }
})
```

### 測試範例

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('electron-store')
vi.mock('electron')

import Store from 'electron-store'
import { ConfigManager } from '../src/main/services/config-manager'

describe('ConfigManager', () => {
  let configManager: ConfigManager
  let mockStore: InstanceType<typeof Store>

  beforeEach(() => {
    vi.clearAllMocks()
    configManager = new ConfigManager()
    mockStore = vi.mocked(Store).mock.instances[0]
  })

  it('should save backup path to store', () => {
    configManager.setBackupPath('/Users/test/backup')
    expect(mockStore.set).toHaveBeenCalledWith('backupPath', '/Users/test/backup')
  })

  it('should return default value when key not found', () => {
    vi.mocked(mockStore.get).mockReturnValueOnce(undefined)
    const path = configManager.getBackupPath()
    expect(path).toBe('/default/backup')
  })
})
```

---

## 7. 整合測試設定

### 概念

整合測試（Integration Test）在 Electron 環境中指多個服務協同工作的測試，不是真正啟動 Electron，而是在 Node 環境中測試 main process 服務間的互動。

### src/test/setup-main.ts

```typescript
// src/test/setup-main.ts
import { vi, beforeAll, afterAll, afterEach } from 'vitest'

// 全域 mock electron（所有 main process 測試共用）
vi.mock('electron', async () => {
  const { app, BrowserWindow, ipcMain, Notification, Tray } = await import(
    '../../__mocks__/electron'
  )
  return { app, BrowserWindow, ipcMain, Notification, Tray }
})

vi.mock('electron-store')

// 全域計時器設定
beforeAll(() => {
  // 可在這裡設定全域 fake timers
})

afterEach(() => {
  vi.clearAllMocks()
  vi.clearAllTimers()
})

afterAll(() => {
  vi.restoreAllMocks()
})
```

### 整合測試範例：DeviceScanner + BackupManager 協同

```typescript
// src/test/integration/scan-and-backup.test.ts
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

vi.mock('bonjour-service')
vi.mock('electron')
vi.mock('electron-store')

import Bonjour from 'bonjour-service'
import { DeviceScanner } from '../../main/services/device-scanner'
import { BackupManager } from '../../main/services/backup-manager'

describe('[Integration] DeviceScanner → BackupManager', () => {
  let scanner: DeviceScanner
  let backupManager: BackupManager
  let mockBonjour: ReturnType<typeof Bonjour>

  beforeEach(() => {
    vi.useFakeTimers()
    scanner = new DeviceScanner()
    backupManager = new BackupManager(scanner) // BackupManager 訂閱 scanner 事件
    mockBonjour = vi.mocked(Bonjour).mock.results[0].value
    scanner.startScan()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    scanner.stopScan()
  })

  it('should trigger backup when new device is discovered', () => {
    const backupSpy = vi.spyOn(backupManager, 'startBackup')

    // 模擬裝置出現
    mockBonjour._triggerDeviceUp({
      name: 'My-iPhone',
      host: '192.168.1.50',
      port: 62078,
      type: 'apple-mobdev2',
    })

    // 等待 debounce
    vi.advanceTimersByTime(500)

    expect(backupSpy).toHaveBeenCalledWith(
      expect.objectContaining({ host: '192.168.1.50' })
    )
  })

  it('should stop backup when device disconnects', () => {
    const stopSpy = vi.spyOn(backupManager, 'stopBackup')

    mockBonjour._triggerDeviceDown({ name: 'My-iPhone', host: '192.168.1.50' })

    expect(stopSpy).toHaveBeenCalled()
  })
})
```

---

## 8. 測試覆蓋率設定

### Provider 選擇

| Provider | 優點 | 缺點 |
|----------|------|------|
| **v8**（預設） | 速度快，Electron/Node 原生支援，Vitest 3.2+ 準確度與 Istanbul 相當 | 不支援非 V8 環境 |
| **istanbul** | 相容性最廣，報告詳細 | 速度較慢，需要額外 instrumentation |

### 安裝

```bash
# 選一個
pnpm add -D @vitest/coverage-v8
pnpm add -D @vitest/coverage-istanbul
```

### vitest.config.ts 完整覆蓋率設定

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',                  // 或 'istanbul'
      enabled: false,                  // 預設關閉，用 --coverage flag 開啟
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',

      // 追蹤哪些檔案（包含未被測試到的）
      include: [
        'src/main/**/*.ts',
        'src/preload/**/*.ts',
      ],
      exclude: [
        'src/main/index.ts',           // Entry point，E2E 測
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/__mocks__/**',
        '**/node_modules/**',
        '**/dist/**',
      ],

      // 覆蓋率門檻（低於即失敗）
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },

      // istanbul 特定設定（provider: 'istanbul' 時有效）
      // all: true,                    // 報告所有檔案，包含未 import 的
    },
  },
})
```

### 忽略特定程式碼

```typescript
// v8 provider
/* v8 ignore next */
if (process.env.NODE_ENV === 'production') { /* ... */ }

/* v8 ignore next 3 */
function debugOnly() {
  console.log('debug')
}

// istanbul provider
/* istanbul ignore if */
if (condition) { /* ... */ }

/* istanbul ignore next */
function notTested() { /* ... */ }
```

---

## 9. device-scanner.test.ts 範例結構

```typescript
// src/main/services/__tests__/device-scanner.test.ts
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

// Mock 必須在 import 前宣告（vi.mock 會被 hoisted）
vi.mock('bonjour-service')
vi.mock('electron', () => ({
  ipcMain: {
    on: vi.fn(),
    handle: vi.fn(),
    removeAllListeners: vi.fn(),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
}))

import Bonjour from 'bonjour-service'
import { ipcMain } from 'electron'
import { DeviceScanner, type DiscoveredDevice } from '../device-scanner'

// 取得 MockBonjour 實例的輔助函式
function getMockBonjour() {
  return vi.mocked(Bonjour).mock.results[0].value
}

describe('DeviceScanner', () => {
  let scanner: DeviceScanner

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    scanner = new DeviceScanner()
  })

  afterEach(() => {
    scanner.stopScan()
    vi.useRealTimers()
  })

  // ─── 初始化 ────────────────────────────────────────────────────────────
  describe('initialization', () => {
    it('should create Bonjour instance on construction', () => {
      expect(Bonjour).toHaveBeenCalledTimes(1)
    })

    it('should not be scanning before startScan()', () => {
      expect(scanner.isScanning).toBe(false)
    })
  })

  // ─── startScan / stopScan ──────────────────────────────────────────────
  describe('startScan()', () => {
    it('should call bonjour.find with correct service type', () => {
      scanner.startScan()
      const mockBonjour = getMockBonjour()

      expect(mockBonjour.find).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'apple-mobdev2' }),
        expect.any(Function)
      )
    })

    it('should set isScanning to true', () => {
      scanner.startScan()
      expect(scanner.isScanning).toBe(true)
    })

    it('should not start scan if already scanning', () => {
      scanner.startScan()
      scanner.startScan() // 第二次呼叫

      const mockBonjour = getMockBonjour()
      expect(mockBonjour.find).toHaveBeenCalledTimes(1)
    })
  })

  describe('stopScan()', () => {
    it('should destroy bonjour instance', () => {
      scanner.startScan()
      scanner.stopScan()

      const mockBonjour = getMockBonjour()
      expect(mockBonjour.destroy).toHaveBeenCalled()
    })

    it('should set isScanning to false', () => {
      scanner.startScan()
      scanner.stopScan()
      expect(scanner.isScanning).toBe(false)
    })
  })

  // ─── 裝置發現事件 ─────────────────────────────────────────────────────
  describe('device discovery events', () => {
    const mockService = {
      name: 'iPhone-14-Pro',
      host: '192.168.1.100',
      port: 62078,
      type: 'apple-mobdev2',
      txt: {},
    }

    it('should emit "device-found" when mDNS service comes up', () => {
      const handler = vi.fn()
      scanner.on('device-found', handler)
      scanner.startScan()

      getMockBonjour()._triggerDeviceUp(mockService)

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'iPhone-14-Pro',
          host: '192.168.1.100',
          port: 62078,
        })
      )
    })

    it('should emit "device-lost" when mDNS service goes down', () => {
      const handler = vi.fn()
      scanner.on('device-lost', handler)
      scanner.startScan()

      getMockBonjour()._triggerDeviceUp(mockService)   // 先發現
      getMockBonjour()._triggerDeviceDown(mockService) // 再離開

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'iPhone-14-Pro' })
      )
    })

    it('should not emit duplicate device-found for same host', () => {
      const handler = vi.fn()
      scanner.on('device-found', handler)
      scanner.startScan()

      getMockBonjour()._triggerDeviceUp(mockService)
      getMockBonjour()._triggerDeviceUp(mockService) // 重複

      expect(handler).toHaveBeenCalledTimes(1)
    })
  })

  // ─── Debounce 掃描 ────────────────────────────────────────────────────
  describe('debounced rescan', () => {
    it('should debounce multiple rapid device events', () => {
      const handler = vi.fn()
      scanner.on('scan-complete', handler)
      scanner.startScan()

      // 快速連續觸發多個裝置
      getMockBonjour()._triggerDeviceUp({ name: 'D1', host: '192.168.1.1', port: 62078 })
      getMockBonjour()._triggerDeviceUp({ name: 'D2', host: '192.168.1.2', port: 62078 })
      getMockBonjour()._triggerDeviceUp({ name: 'D3', host: '192.168.1.3', port: 62078 })

      vi.advanceTimersByTime(300) // 超過 debounce 時間

      expect(handler).toHaveBeenCalledTimes(1) // 只觸發一次 scan-complete
    })
  })

  // ─── 已發現裝置清單 ──────────────────────────────────────────────────
  describe('getDiscoveredDevices()', () => {
    it('should return empty array before scan', () => {
      expect(scanner.getDiscoveredDevices()).toEqual([])
    })

    it('should return discovered devices after scan', () => {
      scanner.startScan()

      getMockBonjour()._triggerDeviceUp({
        name: 'iPhone',
        host: '192.168.1.100',
        port: 62078,
      })

      const devices = scanner.getDiscoveredDevices()
      expect(devices).toHaveLength(1)
      expect(devices[0].host).toBe('192.168.1.100')
    })
  })
})
```

---

## 10. backup-manager.test.ts 範例結構

```typescript
// src/main/services/__tests__/backup-manager.test.ts
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'

vi.mock('electron-store')
vi.mock('electron', () => ({
  ipcMain: { on: vi.fn(), handle: vi.fn() },
  Notification: Object.assign(
    vi.fn().mockImplementation(() => ({ show: vi.fn() })),
    { isSupported: vi.fn(() => true) }
  ),
  app: {
    getPath: vi.fn(() => '/mock/userData'),
  },
}))

import Store from 'electron-store'
import { Notification } from 'electron'
import { BackupManager, type BackupStatus } from '../backup-manager'
import type { DiscoveredDevice } from '../device-scanner'

// 建立 fake DeviceScanner（實作 EventEmitter 介面）
function createFakeScanner() {
  const emitter = new EventEmitter()
  return Object.assign(emitter, {
    isScanning: false,
    startScan: vi.fn(),
    stopScan: vi.fn(),
    getDiscoveredDevices: vi.fn(() => [] as DiscoveredDevice[]),
  })
}

type FakeScanner = ReturnType<typeof createFakeScanner>

describe('BackupManager', () => {
  let backupManager: BackupManager
  let fakeScanner: FakeScanner
  let mockStore: InstanceType<typeof Store>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    fakeScanner = createFakeScanner()
    backupManager = new BackupManager(fakeScanner)
    mockStore = vi.mocked(Store).mock.instances[0]
  })

  afterEach(() => {
    vi.useRealTimers()
    backupManager.dispose()
  })

  // ─── 初始化 ────────────────────────────────────────────────────────────
  describe('initialization', () => {
    it('should load config from store', () => {
      expect(mockStore.get).toHaveBeenCalledWith('backupConfig', expect.any(Object))
    })

    it('should subscribe to scanner device-found events', () => {
      const deviceListeners = fakeScanner.listeners('device-found')
      expect(deviceListeners).toHaveLength(1)
    })
  })

  // ─── 備份觸發 ─────────────────────────────────────────────────────────
  describe('backup triggering', () => {
    const testDevice: DiscoveredDevice = {
      name: 'My-iPhone',
      host: '192.168.1.50',
      port: 62078,
    }

    it('should start backup when device is found', () => {
      const startSpy = vi.spyOn(backupManager, 'startBackup')

      fakeScanner.emit('device-found', testDevice)

      expect(startSpy).toHaveBeenCalledWith(testDevice)
    })

    it('should not start backup if device already backing up', () => {
      const startSpy = vi.spyOn(backupManager, 'startBackup')

      fakeScanner.emit('device-found', testDevice)
      fakeScanner.emit('device-found', testDevice) // 重複

      expect(startSpy).toHaveBeenCalledTimes(1)
    })

    it('should stop backup when device is lost', () => {
      const stopSpy = vi.spyOn(backupManager, 'stopBackup')

      fakeScanner.emit('device-found', testDevice)
      fakeScanner.emit('device-lost', testDevice)

      expect(stopSpy).toHaveBeenCalledWith(testDevice.host)
    })
  })

  // ─── Notification ──────────────────────────────────────────────────────
  describe('notifications', () => {
    it('should show notification when backup starts', () => {
      const device: DiscoveredDevice = { name: 'iPhone', host: '10.0.0.1', port: 62078 }

      backupManager.startBackup(device)

      expect(Notification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('Backup'),
        })
      )

      const mockNotification = vi.mocked(Notification).mock.instances[0] as {
        show: ReturnType<typeof vi.fn>
      }
      expect(mockNotification.show).toHaveBeenCalled()
    })
  })

  // ─── Config 管理 ──────────────────────────────────────────────────────
  describe('config management', () => {
    it('should save backup path to store', () => {
      backupManager.setBackupDestination('/Volumes/Backup')

      expect(mockStore.set).toHaveBeenCalledWith(
        'backupConfig',
        expect.objectContaining({ destination: '/Volumes/Backup' })
      )
    })

    it('should return current backup status', () => {
      const status: BackupStatus = backupManager.getStatus()

      expect(status).toMatchObject({
        isRunning: expect.any(Boolean),
        devices: expect.any(Array),
      })
    })
  })

  // ─── Debounce 備份觸發 ────────────────────────────────────────────────
  describe('debounced backup trigger', () => {
    it('should debounce rapid device events before starting backup', () => {
      const device: DiscoveredDevice = { name: 'iPhone', host: '10.0.0.1', port: 62078 }
      const startSpy = vi.spyOn(backupManager, 'startBackup')

      // 快速連續觸發
      fakeScanner.emit('device-found', device)
      fakeScanner.emit('device-found', device)
      fakeScanner.emit('device-found', device)

      vi.advanceTimersByTime(500)

      expect(startSpy).toHaveBeenCalledTimes(1)
    })
  })

  // ─── 清理 ─────────────────────────────────────────────────────────────
  describe('dispose()', () => {
    it('should remove all scanner event listeners on dispose', () => {
      backupManager.dispose()

      expect(fakeScanner.listeners('device-found')).toHaveLength(0)
      expect(fakeScanner.listeners('device-lost')).toHaveLength(0)
    })
  })
})
```

---

## 11. 參考來源

- [electron-vite Getting Started](https://electron-vite.org/guide/) - electron-vite 官方文件
- [Vitest Test Projects Guide](https://vitest.dev/guide/projects) - Vitest projects 設定（取代 workspace）
- [Vitest Mocking Guide](https://vitest.dev/guide/mocking.html) - 官方 Mock 指南
- [Vitest Mocking Modules](https://vitest.dev/guide/mocking/modules) - 模組 Mock 方式
- [Vitest Fake Timers](https://vitest.dev/guide/mocking/timers) - 計時器 Mock
- [Vitest Coverage Guide](https://vitest.dev/guide/coverage.html) - 覆蓋率設定
- [Mastering Fake Timers with Vitest - Bruno Sabot](https://brunosabot.dev/posts/2024/mastering-time-using-fake-timers-with-vitest/) - Fake Timers 實務
- [electron-mocks - GitHub](https://github.com/spaceagetv/electron-mocks) - Electron 類別 Mock 函式庫
- [electron-mock-ipc - GitHub](https://github.com/h3poteto/electron-mock-ipc) - ipcMain/ipcRenderer Mock
- [bonjour-service - GitHub](https://github.com/onlxltd/bonjour-service) - bonjour-service API
- [Electron Renderer/Main Vitest 分離設定 - はるさめ.dev](https://harusame.dev/blog/posts/electron-render-main-vitest-setting/) - 日文詳細教學
- [Can't mock electron api - Vitest Issue #425](https://github.com/vitest-dev/vitest/issues/425) - electron mock 問題與解法
- [vite-electron-builder ipcMain mock discussion #726](https://github.com/cawa-93/vite-electron-builder/discussions/726) - ipcMain mock 社群討論
- [electron-store Issue #89 - ElectronStore is not a constructor](https://github.com/sindresorhus/electron-store/issues/89) - electron-store mock 問題
- [Vitest Coverage: V8 vs Istanbul - Oreate AI Blog](https://www.oreateai.com/blog/vitests-coverage-conundrum-v8-vs-istanbul-which-engine-fuels-your-tests/2d0ae913100c68d4571c7e5bdf971d93) - V8 vs Istanbul 比較
