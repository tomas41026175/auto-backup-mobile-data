# Electron 應用測試策略

> 研究日期：2026-03-11
> 涵蓋範圍：Vitest + Electron、Playwright E2E、IPC Mock、服務層測試、CI/CD、效能測試
> 資料來源：2024-2025 最新文件與社群討論

---

## 目錄

1. [Vitest 在 Electron 環境的設定](#1-vitest-在-electron-環境的設定)
2. [Playwright for Electron E2E 測試](#2-playwright-for-electron-e2e-測試)
3. [Spectron 替代方案](#3-spectron-替代方案)
4. [IPC Mock 策略](#4-ipc-mock-策略)
5. [服務層單元測試](#5-服務層單元測試)
6. [EventEmitter 模式測試](#6-eventemitter-模式測試)
7. [測試覆蓋率工具](#7-測試覆蓋率工具)
8. [GitHub Actions CI 設定](#8-github-actions-ci-設定)
9. [測試資料管理](#9-測試資料管理)
10. [效能測試](#10-效能測試)
11. [推薦測試架構總覽](#11-推薦測試架構總覽)

---

## 1. Vitest 在 Electron 環境的設定

### 1.1 electron-vite 與 Vitest 整合現況

electron-vite 目前（2025）**尚未內建 Vitest 整合**。主要困難在於：

- Vitest 只支援標準 Vite 設定，無法直接使用 electron-vite 的 main/preload/renderer 三段式設定結構
- Electron 不支援 `type: module`，與 Vitest 的 ESM-first 設計有衝突

**解決方案：建立獨立 vitest.config.ts**

```typescript
// vitest.config.ts（專案根目錄）
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@main': resolve(__dirname, 'src/main'),
      '@preload': resolve(__dirname, 'src/preload'),
      '@renderer': resolve(__dirname, 'src/renderer'),
    },
  },
  test: {
    globals: true,
    environment: 'node', // main process 測試用 node 環境
    include: ['src/**/*.{test,spec}.{ts,js}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.{test,spec}.ts', 'src/**/*.d.ts'],
    },
    setupFiles: ['./test/setup.ts'],
  },
})
```

> 來源：[electron-vite issue #88](https://github.com/alex8088/electron-vite/issues/88)

### 1.2 Mock Electron API

Vitest 可透過 `vi.mock()` mock 整個 electron 模組。早期版本有 hoisting 問題（[vitest #425](https://github.com/vitest-dev/vitest/issues/425)），已在 v0.0.132+ 修復。

```typescript
// test/setup.ts
import { vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => `/mock/path/${name}`),
    isPackaged: false,
    on: vi.fn(),
    whenReady: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn(),
  },
  BrowserWindow: vi.fn().mockImplementation(() => ({
    loadURL: vi.fn(),
    loadFile: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    show: vi.fn(),
    close: vi.fn(),
    webContents: {
      send: vi.fn(),
      on: vi.fn(),
      openDevTools: vi.fn(),
    },
  })),
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
    removeAllListeners: vi.fn(),
  },
  dialog: {
    showOpenDialog: vi.fn(),
    showMessageBox: vi.fn(),
    showErrorBox: vi.fn(),
  },
  Menu: {
    setApplicationMenu: vi.fn(),
    buildFromTemplate: vi.fn(),
  },
  Tray: vi.fn().mockImplementation(() => ({
    setContextMenu: vi.fn(),
    setImage: vi.fn(),
    on: vi.fn(),
  })),
  nativeTheme: {
    shouldUseDarkColors: false,
    on: vi.fn(),
  },
  shell: {
    openExternal: vi.fn(),
    openPath: vi.fn(),
  },
}))
```

### 1.3 測試 Main Process 程式碼

**關鍵原則**：將業務邏輯從 Electron API 調用中分離，使其可獨立測試。

```typescript
// src/main/services/backup-config.ts（可測試的純邏輯）
export interface BackupConfig {
  sourcePath: string
  targetPath: string
  interval: number
}

export function validateConfig(config: Partial<BackupConfig>): string[] {
  const errors: string[] = []
  if (!config.sourcePath) errors.push('sourcePath is required')
  if (!config.targetPath) errors.push('targetPath is required')
  if (config.interval && config.interval < 60) errors.push('interval must be >= 60 seconds')
  return errors
}

// src/main/services/__tests__/backup-config.test.ts
import { describe, it, expect } from 'vitest'
import { validateConfig } from '../backup-config'

describe('validateConfig', () => {
  it('應回傳空陣列當設定有效時', () => {
    const errors = validateConfig({
      sourcePath: '/source',
      targetPath: '/target',
      interval: 300,
    })
    expect(errors).toEqual([])
  })

  it('應回傳錯誤當缺少必要欄位時', () => {
    const errors = validateConfig({})
    expect(errors).toContain('sourcePath is required')
    expect(errors).toContain('targetPath is required')
  })
})
```

**測試 IPC handler 的包裝模式**：

```typescript
// src/main/ipc/handlers.ts
import { ipcMain } from 'electron'
import type { BackupConfig } from '../services/backup-config'
import { validateConfig } from '../services/backup-config'

// 可獨立測試的 handler 函式
export function handleValidateConfig(
  _event: Electron.IpcMainInvokeEvent,
  config: Partial<BackupConfig>
): { valid: boolean; errors: string[] } {
  const errors = validateConfig(config)
  return { valid: errors.length === 0, errors }
}

// 註冊（在 app ready 時呼叫）
export function registerIpcHandlers(): void {
  ipcMain.handle('config:validate', handleValidateConfig)
}

// 測試
import { describe, it, expect, vi } from 'vitest'
import { handleValidateConfig } from '../handlers'

describe('handleValidateConfig', () => {
  const mockEvent = {} as Electron.IpcMainInvokeEvent

  it('應回傳 valid=true 當設定正確', () => {
    const result = handleValidateConfig(mockEvent, {
      sourcePath: '/src',
      targetPath: '/dst',
      interval: 300,
    })
    expect(result.valid).toBe(true)
  })
})
```

> 來源：[Vitest Mocking Guide](https://vitest.dev/guide/mocking)、[vitest #425](https://github.com/vitest-dev/vitest/issues/425)

---

## 2. Playwright for Electron E2E 測試

### 2.1 支援狀況（2024-2025）

Playwright 對 Electron 的支援標記為 **experimental**，透過 Chrome DevTools Protocol（CDP）實現。支援版本：

- Electron v14+ 完整支援
- `@playwright/test` v1.52.0+ 文件化
- 可存取 main process（透過 `evaluate`）
- 支援截圖、影片錄製、HAR 記錄
- `electron-playwright-helpers` 套件提供額外工具函式

> 來源：[Playwright Electron API](https://playwright.dev/docs/api/class-electron)

### 2.2 E2E 測試設定範例

**安裝**：

```bash
npm install --save-dev @playwright/test
```

**Playwright 設定**：

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: process.env.CI ? 2 : 0,
  use: {
    trace: 'on-first-retry',
  },
})
```

**基礎 E2E 測試**：

```typescript
// e2e/app.spec.ts
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'

let electronApp: ElectronApplication
let window: Page

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: ['.'],
    env: { ...process.env, NODE_ENV: 'test' },
  })
  window = await electronApp.firstWindow()
  // 等待 app 完全載入
  await window.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await electronApp.close()
})

test('應顯示應用程式視窗', async () => {
  const title = await window.title()
  expect(title).toBeDefined()
})

test('應顯示主畫面', async () => {
  await expect(window.locator('[data-testid="main-view"]')).toBeVisible()
})

test('可存取 main process 資訊', async () => {
  const appPath = await electronApp.evaluate(async ({ app }) => {
    return app.getAppPath()
  })
  expect(appPath).toBeTruthy()
})

test('可驗證 isPackaged 狀態', async () => {
  const isPackaged = await electronApp.evaluate(async ({ app }) => {
    return app.isPackaged
  })
  expect(isPackaged).toBe(false)
})

test('截圖比對', async () => {
  await window.screenshot({ path: 'e2e/screenshots/main-window.png' })
  // 或使用 visual comparison
  await expect(window).toHaveScreenshot('main-window.png')
})
```

**多視窗測試**（參考 electron-playwright-example）：

```typescript
test('開啟設定視窗', async () => {
  // 點擊觸發新視窗的按鈕
  const [newWindow] = await Promise.all([
    electronApp.waitForEvent('window'),
    window.click('[data-testid="open-settings"]'),
  ])
  await newWindow.waitForLoadState('domcontentloaded')
  const title = await newWindow.title()
  expect(title).toContain('Settings')
  await newWindow.close()
})
```

**IPC 測試**：

```typescript
test('可透過 main process 觸發 IPC', async () => {
  // 在 main process 中 evaluate 並送訊息給 renderer
  await electronApp.evaluate(async ({ BrowserWindow }) => {
    const [mainWindow] = BrowserWindow.getAllWindows()
    mainWindow.webContents.send('test-message', { data: 'hello' })
  })

  // 在 renderer 中驗證結果
  const result = await window.evaluate(() => {
    return (window as unknown as { testResult: string }).testResult
  })
  expect(result).toBeDefined()
})
```

> 來源：[Electron Automated Testing](https://www.electronjs.org/docs/latest/tutorial/automated-testing)、[electron-playwright-example](https://github.com/spaceagetv/electron-playwright-example)

### 2.3 CI/CD 中的無頭模式

```yaml
# 在 GitHub Actions 中（見第 8 節完整設定）
- name: Run E2E Tests
  run: xvfb-run --auto-servernum npx playwright test
  # macOS 不需要 xvfb
```

影片錄製設定：

```typescript
const electronApp = await electron.launch({
  args: ['.'],
  recordVideo: { dir: './e2e/videos' },
})
```

---

## 3. Spectron 替代方案

Spectron 於 **2022 年 2 月正式棄用**，主要原因：

- 維護停滯，長期缺乏改進
- Electron 14 將 `remote` 模組移出核心，Spectron 需要大幅重寫
- 無法支援新版 Electron

### 推薦替代方案

| 方案 | 類型 | 特色 | 適用場景 |
|------|------|------|----------|
| **Playwright** | CDP-based | 官方推薦、可存取 main process、截圖/影片 | 主要 E2E 測試方案 |
| **WebdriverIO** | WebDriver | Spectron 精神繼承者、豐富插件生態系 | 需要 WebDriver 協定時 |
| **Custom IPC Driver** | IPC-based | 輕量、無外部依賴 | 簡單驗證場景 |

**本專案推薦：Playwright**，理由：

1. 與 Vitest 同生態系（Vite 工具鏈）
2. 支援 main process 評估
3. 社群活躍、持續更新
4. 測試語法直觀

> 來源：[Spectron Deprecation Notice](https://www.electronjs.org/blog/spectron-deprecation-notice)、[WebdriverIO Electron Service](https://webdriver.io/docs/wdio-electron-service/)

---

## 4. IPC Mock 策略

### 4.1 在 Renderer 測試中 Mock contextBridge 暴露的 API

Renderer process 透過 `contextBridge.exposeInMainWorld` 暴露 API。測試時需要在全域模擬這些 API。

```typescript
// src/preload/index.ts（生產程式碼）
import { contextBridge, ipcRenderer } from 'electron'

const electronAPI = {
  getDevices: () => ipcRenderer.invoke('devices:list'),
  startBackup: (deviceId: string) =>
    ipcRenderer.invoke('backup:start', deviceId),
  onBackupProgress: (callback: (progress: number) => void) => {
    const handler = (_event: unknown, progress: number) => callback(progress)
    ipcRenderer.on('backup:progress', handler)
    return () => ipcRenderer.removeListener('backup:progress', handler)
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// test/mocks/electron-api.ts（測試 mock）
import { vi } from 'vitest'

export function createMockElectronAPI() {
  return {
    getDevices: vi.fn().mockResolvedValue([]),
    startBackup: vi.fn().mockResolvedValue({ success: true }),
    onBackupProgress: vi.fn().mockReturnValue(() => {}),
  }
}

// test/setup-renderer.ts
import { createMockElectronAPI } from './mocks/electron-api'

// 注入全域 mock
Object.defineProperty(globalThis, 'electronAPI', {
  value: createMockElectronAPI(),
  writable: true,
})
```

**在 Renderer 元件測試中使用**：

```typescript
// src/renderer/components/__tests__/DeviceList.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAPI = globalThis.electronAPI as ReturnType<
  typeof import('../../../test/mocks/electron-api').createMockElectronAPI
>

describe('DeviceList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('應載入裝置列表', async () => {
    mockAPI.getDevices.mockResolvedValue([
      { id: '1', name: 'iPhone 15', type: 'ios' },
      { id: '2', name: 'Pixel 8', type: 'android' },
    ])

    // 渲染元件並驗證...
  })
})
```

### 4.2 測試 ipcMain Handler

**方法一：直接測試 handler 函式**（推薦）

```typescript
// src/main/ipc/device-handlers.ts
import type { DeviceService } from '../services/device-service'

export function createDeviceHandlers(deviceService: DeviceService) {
  return {
    'devices:list': async () => {
      return deviceService.getConnectedDevices()
    },
    'devices:info': async (_event: unknown, deviceId: string) => {
      return deviceService.getDeviceInfo(deviceId)
    },
  }
}

// 測試
import { describe, it, expect, vi } from 'vitest'
import { createDeviceHandlers } from '../device-handlers'

describe('device IPC handlers', () => {
  const mockDeviceService = {
    getConnectedDevices: vi.fn(),
    getDeviceInfo: vi.fn(),
  }

  const handlers = createDeviceHandlers(mockDeviceService as unknown as DeviceService)

  it('devices:list 應回傳裝置列表', async () => {
    const devices = [{ id: '1', name: 'Test Device' }]
    mockDeviceService.getConnectedDevices.mockResolvedValue(devices)

    const result = await handlers['devices:list']()
    expect(result).toEqual(devices)
  })
})
```

**方法二：使用 electron-mock-ipc（整合測試）**

```typescript
import { ipcMain, ipcRenderer } from '@puncsky/electron-mock-ipc'

// 註冊 handler
ipcMain.handle('ping', () => 'pong')

// 模擬 renderer 呼叫
const result = await ipcRenderer.invoke('ping')
expect(result).toBe('pong')
```

> 來源：[electron-mock-ipc](https://github.com/h3poteto/electron-mock-ipc)、[electron-mocks](https://github.com/spaceagetv/electron-mocks)、[WebdriverIO Electron Mocking](https://webdriver.io/docs/desktop-testing/electron/mocking/)

---

## 5. 服務層單元測試

### 5.1 Mock electron-conf（Settings Store）

```typescript
// src/main/services/settings-service.ts
import type { Conf } from 'electron-conf'

export interface AppSettings {
  backupInterval: number
  autoStart: boolean
  targetFolder: string
}

export class SettingsService {
  constructor(private readonly store: Conf<AppSettings>) {}

  getBackupInterval(): number {
    return this.store.get('backupInterval', 300)
  }

  setBackupInterval(seconds: number): void {
    if (seconds < 60) throw new Error('Interval must be >= 60 seconds')
    this.store.set('backupInterval', seconds)
  }

  getAllSettings(): AppSettings {
    return {
      backupInterval: this.store.get('backupInterval', 300),
      autoStart: this.store.get('autoStart', false),
      targetFolder: this.store.get('targetFolder', ''),
    }
  }
}

// 測試：使用 Map 模擬 store
import { describe, it, expect, vi } from 'vitest'
import { SettingsService } from '../settings-service'

function createMockStore(
  initial: Record<string, unknown> = {}
): Conf<AppSettings> {
  const data = new Map(Object.entries(initial))
  return {
    get: vi.fn((key: string, defaultValue?: unknown) =>
      data.has(key) ? data.get(key) : defaultValue
    ),
    set: vi.fn((key: string, value: unknown) => {
      data.set(key, value)
    }),
    delete: vi.fn((key: string) => data.delete(key)),
    clear: vi.fn(() => data.clear()),
    has: vi.fn((key: string) => data.has(key)),
  } as unknown as Conf<AppSettings>
}

describe('SettingsService', () => {
  it('應回傳預設備份間隔', () => {
    const store = createMockStore()
    const service = new SettingsService(store)
    expect(service.getBackupInterval()).toBe(300)
  })

  it('應設定備份間隔', () => {
    const store = createMockStore()
    const service = new SettingsService(store)
    service.setBackupInterval(600)
    expect(store.set).toHaveBeenCalledWith('backupInterval', 600)
  })

  it('應拒絕過短的間隔', () => {
    const store = createMockStore()
    const service = new SettingsService(store)
    expect(() => service.setBackupInterval(30)).toThrow('Interval must be >= 60')
  })
})
```

### 5.2 Mock bonjour-service / mDNS

```typescript
// src/main/services/device-scanner.ts
import type { Bonjour, Browser, Service } from 'bonjour-service'
import { EventEmitter } from 'events'

export class DeviceScanner extends EventEmitter {
  private browser: Browser | null = null

  constructor(private readonly bonjour: Bonjour) {
    super()
  }

  startScan(serviceType: string): void {
    this.browser = this.bonjour.find({ type: serviceType })
    this.browser.on('up', (service: Service) => {
      this.emit('device:found', {
        name: service.name,
        host: service.host,
        port: service.port,
        addresses: service.addresses,
      })
    })
    this.browser.on('down', (service: Service) => {
      this.emit('device:lost', { name: service.name })
    })
  }

  stopScan(): void {
    this.browser?.stop()
    this.browser = null
  }
}

// 測試
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'
import { DeviceScanner } from '../device-scanner'

function createMockBonjour() {
  const mockBrowser = new EventEmitter() as EventEmitter & { stop: ReturnType<typeof vi.fn> }
  mockBrowser.stop = vi.fn()

  return {
    bonjour: {
      find: vi.fn().mockReturnValue(mockBrowser),
      destroy: vi.fn(),
    },
    mockBrowser,
  }
}

describe('DeviceScanner', () => {
  let scanner: DeviceScanner
  let mockBrowser: EventEmitter & { stop: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    const mock = createMockBonjour()
    scanner = new DeviceScanner(mock.bonjour as unknown as Bonjour)
    mockBrowser = mock.mockBrowser
  })

  it('應在發現服務時發出 device:found 事件', () => {
    const handler = vi.fn()
    scanner.on('device:found', handler)
    scanner.startScan('http')

    mockBrowser.emit('up', {
      name: 'iPhone-backup',
      host: '192.168.1.100',
      port: 8080,
      addresses: ['192.168.1.100'],
    })

    expect(handler).toHaveBeenCalledWith({
      name: 'iPhone-backup',
      host: '192.168.1.100',
      port: 8080,
      addresses: ['192.168.1.100'],
    })
  })

  it('stopScan 應停止瀏覽器', () => {
    scanner.startScan('http')
    scanner.stopScan()
    expect(mockBrowser.stop).toHaveBeenCalled()
  })
})
```

### 5.3 Mock 檔案系統操作（memfs）

**安裝**：

```bash
npm install --save-dev memfs
```

**設定 mock 檔案**：

```typescript
// test/__mocks__/fs.ts
export { fs as default } from 'memfs'

// test/__mocks__/fs/promises.ts
export { fs } from 'memfs'
export default (await import('memfs')).fs.promises
```

**使用 memfs 測試檔案操作**：

```typescript
// src/main/services/file-manager.ts
import fs from 'fs/promises'
import path from 'path'

export class FileManager {
  async listBackupFiles(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
  }

  async ensureDir(dir: string): Promise<void> {
    await fs.mkdir(dir, { recursive: true })
  }

  async copyFile(src: string, dest: string): Promise<void> {
    await this.ensureDir(path.dirname(dest))
    await fs.copyFile(src, dest)
  }
}

// 測試
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { vol } from 'memfs'
import { FileManager } from '../file-manager'

vi.mock('fs')
vi.mock('fs/promises')

describe('FileManager', () => {
  const manager = new FileManager()

  beforeEach(() => {
    vol.reset()
  })

  it('應列出備份檔案', async () => {
    vol.fromJSON({
      '/backups/photo1.jpg': 'data1',
      '/backups/photo2.jpg': 'data2',
      '/backups/subfolder': null, // 目錄
    })

    const files = await manager.listBackupFiles('/backups')
    expect(files).toContain('photo1.jpg')
    expect(files).toContain('photo2.jpg')
  })

  it('應建立巢狀目錄', async () => {
    await manager.ensureDir('/backups/2024/03')
    const { fs } = await import('memfs')
    expect(fs.existsSync('/backups/2024/03')).toBe(true)
  })

  it('應複製檔案並自動建立目標目錄', async () => {
    vol.fromJSON({ '/source/file.txt': 'content' })
    await manager.copyFile('/source/file.txt', '/dest/sub/file.txt')
    const { fs } = await import('memfs')
    expect(fs.readFileSync('/dest/sub/file.txt', 'utf8')).toBe('content')
  })
})
```

> 來源：[memfs npm](https://www.npmjs.com/package/memfs)、[memfs gist](https://gist.github.com/barthap/e0a672e9000e72cdfbca73e4f2702f5e)、[mock-fs npm](https://www.npmjs.com/package/mock-fs)

---

## 6. EventEmitter 模式測試

### 6.1 直接測試 emit 事件

```typescript
import { describe, it, expect, vi } from 'vitest'
import { DeviceScanner } from '../device-scanner'

describe('DeviceScanner EventEmitter', () => {
  it('應在掃描到裝置時依序發出事件', async () => {
    const scanner = createScannerWithMock()
    const events: string[] = []

    scanner.on('scan:start', () => events.push('start'))
    scanner.on('device:found', () => events.push('found'))
    scanner.on('scan:complete', () => events.push('complete'))

    await scanner.performScan()

    expect(events).toEqual(['start', 'found', 'complete'])
  })
})
```

### 6.2 使用 Promise 包裝非同步事件

```typescript
import { once } from 'events'

it('應在超時後發出 scan:timeout', async () => {
  vi.useFakeTimers()
  const scanner = createScannerWithMock()
  scanner.startScan('http')

  const timeoutPromise = once(scanner, 'scan:timeout')
  vi.advanceTimersByTime(30_000)

  const [reason] = await timeoutPromise
  expect(reason).toBe('No devices found within timeout')
  vi.useRealTimers()
})
```

### 6.3 驗證 listener 清理

```typescript
it('stopScan 後不應繼續觸發事件', () => {
  const scanner = createScannerWithMock()
  const handler = vi.fn()
  scanner.on('device:found', handler)

  scanner.startScan('http')
  scanner.stopScan()

  // 模擬外部觸發（不應到達 handler）
  // mockBrowser.emit('up', ...) 不應觸發 scanner 的事件
  expect(scanner.listenerCount('device:found')).toBe(1)
})

it('destroy 應移除所有 listeners', () => {
  const scanner = createScannerWithMock()
  scanner.on('device:found', vi.fn())
  scanner.on('device:lost', vi.fn())

  scanner.destroy()

  expect(scanner.listenerCount('device:found')).toBe(0)
  expect(scanner.listenerCount('device:lost')).toBe(0)
})
```

> 來源：[Testing Event Emitters (DEV)](https://dev.to/shelob9/testing-event-emitter-38b5)、[Jest Event Emitters](https://borzecki.github.io/blog/jest-event-emitters/)

---

## 7. 測試覆蓋率工具

### 7.1 Vitest 覆蓋率設定

Vitest 支援兩個 coverage provider：

| Provider | 套件 | 速度 | 準確度 | 備註 |
|----------|------|------|--------|------|
| **v8**（預設推薦） | `@vitest/coverage-v8` | 快（~10% overhead） | 自 v3.2.0 起與 Istanbul 一致 | 使用 AST-based remapping |
| **istanbul** | `@vitest/coverage-istanbul` | 慢（~300% overhead） | 業界標準 13+ 年 | 需要 source instrumentation |

> 注意：`@vitest/coverage-c8` 已停止維護，應遷移至 `@vitest/coverage-v8`

**安裝與設定**：

```bash
npm install --save-dev @vitest/coverage-v8
```

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      enabled: true,
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.{test,spec}.ts',
        'src/**/*.d.ts',
        'src/**/index.ts', // re-export files
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
    },
  },
})
```

**執行**：

```json
{
  "scripts": {
    "test": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:ci": "vitest run --coverage --reporter=json --reporter=default"
  }
}
```

### 7.2 Ignore Coverage Directives

使用 `@preserve` 關鍵字（TypeScript/esbuild 必要）：

```typescript
/* v8 ignore next -- @preserve */
if (process.env.NODE_ENV === 'development') {
  console.log('debug info')
}

/* v8 ignore start -- @preserve */
function devOnlyHelper() {
  // 整個函式從覆蓋率排除
}
/* v8 ignore stop -- @preserve */
```

> 來源：[Vitest Coverage Guide](https://vitest.dev/guide/coverage.html)、[V8 Coverage in 2024](https://medium.com/@cenfun/embracing-native-v8-coverage-reports-in-2024-881e08c0a2ca)

---

## 8. GitHub Actions CI 設定

### 8.1 完整 CI 設定

```yaml
# .github/workflows/test.yml
name: Test

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  unit-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests with coverage
        run: npx vitest run --coverage

      - name: Upload coverage
        uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: coverage/

  e2e-test:
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build app
        run: npm run build

      # Linux 需要 xvfb（虛擬顯示）
      - name: Run E2E tests (Linux)
        if: runner.os == 'Linux'
        run: xvfb-run --auto-servernum npx playwright test
        env:
          CI: '1'

      - name: Run E2E tests (macOS/Windows)
        if: runner.os != 'Linux'
        run: npx playwright test
        env:
          CI: '1'

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: e2e-results-${{ matrix.os }}
          path: |
            e2e/screenshots/
            e2e/videos/
            playwright-report/
```

### 8.2 Headless CI 說明

| 平台 | 需要 xvfb | 說明 |
|------|-----------|------|
| Linux | 是 | Chromium 需要 X11 display server |
| macOS | 否 | 原生支援無頭渲染 |
| Windows | 否 | 原生支援無頭渲染 |

**xvfb 原理**：Xvfb（X virtual framebuffer）在記憶體中實作 X11 display server protocol，所有圖形操作在記憶體中完成，無需實際螢幕。

**自動化工具**：

```bash
# 使用 xvfb-maybe 自動判斷是否需要 xvfb
npx xvfb-maybe npx playwright test

# 或直接使用 xvfb-run
xvfb-run --auto-servernum --server-args="-screen 0 1280x960x24" npx playwright test
```

> 注意：Electron 團隊有[討論](https://github.com/electron/electron/issues/29164)未來可能不再需要 xvfb（跟隨 Chromium headless 改進），但目前仍為必要。

> 來源：[Electron Headless CI](https://www.electronjs.org/docs/latest/tutorial/testing-on-headless-ci)、[xvfb-maybe](https://github.com/anaisbetts/xvfb-maybe)

---

## 9. 測試資料管理

### 9.1 Fixture 模式

```typescript
// test/fixtures/devices.ts
import type { Device } from '../../src/main/types'

export const FIXTURES = {
  devices: {
    iphone: {
      id: 'device-001',
      name: 'iPhone 15 Pro',
      type: 'ios' as const,
      model: 'iPhone15,3',
      storage: { total: 256_000, available: 128_000 },
    },
    android: {
      id: 'device-002',
      name: 'Pixel 8',
      type: 'android' as const,
      model: 'Pixel 8',
      storage: { total: 128_000, available: 64_000 },
    },
  },
  backupConfigs: {
    default: {
      sourcePath: '/media/phone/DCIM',
      targetPath: '/backups/photos',
      interval: 300,
      includeVideos: true,
    },
    photosOnly: {
      sourcePath: '/media/phone/DCIM',
      targetPath: '/backups/photos',
      interval: 600,
      includeVideos: false,
    },
  },
} as const
```

### 9.2 Factory Pattern（使用 Vitest test.extend）

```typescript
// test/factories/device-factory.ts
import type { Device } from '../../src/main/types'

let idCounter = 0

export function createDevice(overrides: Partial<Device> = {}): Device {
  idCounter += 1
  return {
    id: `device-${String(idCounter).padStart(3, '0')}`,
    name: `Test Device ${idCounter}`,
    type: 'ios',
    model: 'TestModel',
    storage: { total: 256_000, available: 128_000 },
    ...overrides,
  }
}

export function createDevices(count: number, overrides: Partial<Device> = {}): Device[] {
  return Array.from({ length: count }, () => createDevice(overrides))
}

// 使用 Vitest test.extend 建立可重用的 fixture context
// test/fixtures/test-context.ts
import { test as base } from 'vitest'
import { createDevice } from '../factories/device-factory'
import { createMockStore } from '../mocks/store'

interface TestFixtures {
  device: Device
  store: ReturnType<typeof createMockStore>
}

export const test = base.extend<TestFixtures>({
  device: async ({}, use) => {
    const device = createDevice()
    await use(device)
  },
  store: async ({}, use) => {
    const store = createMockStore({ autoStart: true })
    await use(store)
    // teardown：清理 store
  },
})

// 在測試中使用
import { test } from '../../fixtures/test-context'
import { expect } from 'vitest'

test('應正確處理裝置資訊', ({ device, store }) => {
  // device 和 store 已自動建立
  expect(device.id).toBeDefined()
  expect(store.get).toBeDefined()
})
```

### 9.3 test-fixture-factory 進階模式

```typescript
// 適合需要資料庫或複雜依賴的整合測試
import { createFixtureFactory } from 'test-fixture-factory'

const useDevice = createFixtureFactory<Device>()
  .withValue(async (use) => {
    const device = createDevice()
    await use(device)
  })

const useBackup = createFixtureFactory<Backup>()
  .withContext<{ device: Device }>()
  .withValue(async ({ device }, use) => {
    const backup = createBackup({ deviceId: device.id })
    await use(backup)
  })
```

> 來源：[Vitest Test Context](https://main.vitest.dev/guide/test-context)、[Test Fixture Factory](https://george.czabania.com/post/focused-tests-with-vitest-and-test-fixture-factory/)、[vitest-fixture](https://github.com/larsthorup/vitest-fixture)

---

## 10. 效能測試

### 10.1 啟動時間基準

**Electron 啟動時間參考值**：

| 指標 | 目標值 | 說明 |
|------|--------|------|
| 冷啟動至視窗顯示 | < 2 秒 | 使用者可感知的上限 |
| 首次有意義繪製 | < 3 秒 | 含資料載入 |
| Idle 記憶體 | < 200 MB | 單視窗應用 |

**測量啟動時間**：

```typescript
// e2e/performance.spec.ts
import { test, expect, _electron as electron } from '@playwright/test'

test('啟動時間應在 3 秒內', async () => {
  const startTime = Date.now()

  const electronApp = await electron.launch({ args: ['.'] })
  const window = await electronApp.firstWindow()
  await window.waitForLoadState('domcontentloaded')

  const loadTime = Date.now() - startTime
  console.log(`App startup time: ${loadTime}ms`)

  expect(loadTime).toBeLessThan(3000)
  await electronApp.close()
})
```

### 10.2 記憶體使用量監測

```typescript
test('idle 記憶體應低於 200MB', async () => {
  const electronApp = await electron.launch({ args: ['.'] })
  const window = await electronApp.firstWindow()
  await window.waitForLoadState('networkidle')

  // 取得 main process 記憶體
  const mainMemory = await electronApp.evaluate(async () => {
    return process.memoryUsage()
  })

  // 取得 renderer process 記憶體
  const rendererMetrics = await window.evaluate(() => {
    return (performance as Performance & {
      memory?: { usedJSHeapSize: number; totalJSHeapSize: number }
    }).memory
  })

  const totalMB =
    mainMemory.heapUsed / 1024 / 1024 +
    (rendererMetrics?.usedJSHeapSize ?? 0) / 1024 / 1024

  console.log(`Main process heap: ${(mainMemory.heapUsed / 1024 / 1024).toFixed(1)} MB`)
  console.log(`Renderer heap: ${((rendererMetrics?.usedJSHeapSize ?? 0) / 1024 / 1024).toFixed(1)} MB`)
  console.log(`Total: ${totalMB.toFixed(1)} MB`)

  expect(totalMB).toBeLessThan(200)
  await electronApp.close()
})
```

### 10.3 IPC 效能基準

```typescript
test('IPC 往返延遲應低於 50ms', async () => {
  const electronApp = await electron.launch({ args: ['.'] })
  const window = await electronApp.firstWindow()

  const latency = await window.evaluate(async () => {
    const iterations = 100
    const start = performance.now()
    for (let i = 0; i < iterations; i++) {
      await (window as unknown as { electronAPI: { ping: () => Promise<string> } })
        .electronAPI.ping()
    }
    return (performance.now() - start) / iterations
  })

  console.log(`Average IPC round-trip: ${latency.toFixed(2)}ms`)
  expect(latency).toBeLessThan(50)
  await electronApp.close()
})
```

### 10.4 CPU Profiling

```bash
# 使用 Node.js 內建 profiler 分析模組載入
node --cpu-prof --heap-prof -e "require('electron')"

# 或透過 Electron 啟動時收集
electron --inspect-brk main.js
# 然後使用 Chrome DevTools 連接 chrome://inspect
```

> 來源：[Electron Performance](https://www.electronjs.org/docs/latest/tutorial/performance)、[electron-bench](https://github.com/ZacWalk/electron-bench)

---

## 11. 推薦測試架構總覽

```
tests/
├── unit/                          # Vitest 單元測試
│   ├── main/                      # Main process 服務測試
│   │   ├── services/
│   │   │   ├── settings.test.ts
│   │   │   ├── device-scanner.test.ts
│   │   │   ├── file-manager.test.ts
│   │   │   └── backup-engine.test.ts
│   │   └── ipc/
│   │       └── handlers.test.ts
│   └── renderer/                  # Renderer 元件測試
│       └── components/
├── e2e/                           # Playwright E2E 測試
│   ├── app.spec.ts
│   ├── backup-flow.spec.ts
│   ├── settings.spec.ts
│   ├── performance.spec.ts
│   ├── screenshots/
│   └── videos/
├── fixtures/                      # 共用測試資料
│   ├── devices.ts
│   └── test-context.ts
├── factories/                     # Factory functions
│   └── device-factory.ts
├── mocks/                         # 共用 mocks
│   ├── electron-api.ts
│   └── store.ts
├── __mocks__/                     # Vitest 自動 mock
│   ├── fs.ts
│   └── fs/
│       └── promises.ts
└── setup.ts                       # Vitest 全域 setup
```

### 測試類型與工具對應

| 測試類型 | 工具 | 目標 | 覆蓋率目標 |
|----------|------|------|------------|
| 單元測試 | Vitest | 服務層、工具函式、IPC handler | 80%+ |
| 元件測試 | Vitest + Testing Library | Renderer UI 元件 | 80%+ |
| 整合測試 | Vitest | 多服務協作、EventEmitter 流程 | 70%+ |
| E2E 測試 | Playwright | 完整使用者流程 | 關鍵路徑 |
| 效能測試 | Playwright | 啟動時間、記憶體、IPC 延遲 | 基準值 |

### npm scripts

```json
{
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest run",
    "test:watch": "vitest --watch",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "test:e2e:headed": "playwright test --headed",
    "test:perf": "playwright test e2e/performance.spec.ts",
    "test:ci": "vitest run --coverage && xvfb-maybe playwright test"
  }
}
```

---

## 參考資源

### 官方文件

- [Electron Automated Testing](https://www.electronjs.org/docs/latest/tutorial/automated-testing)
- [Playwright Electron API](https://playwright.dev/docs/api/class-electron)
- [Vitest Coverage Guide](https://vitest.dev/guide/coverage.html)
- [Vitest Mocking Guide](https://vitest.dev/guide/mocking)
- [Electron Performance](https://www.electronjs.org/docs/latest/tutorial/performance)
- [Electron Headless CI](https://www.electronjs.org/docs/latest/tutorial/testing-on-headless-ci)

### 社群資源

- [electron-vite Vitest Support (issue #88)](https://github.com/alex8088/electron-vite/issues/88)
- [Vitest Mock Electron (issue #425)](https://github.com/vitest-dev/vitest/issues/425)
- [electron-playwright-example](https://github.com/spaceagetv/electron-playwright-example)
- [electron-playwright-helpers](https://www.npmjs.com/package/electron-playwright-helpers)
- [electron-mock-ipc](https://github.com/h3poteto/electron-mock-ipc)
- [electron-mocks](https://github.com/spaceagetv/electron-mocks)
- [WebdriverIO Electron Mocking](https://webdriver.io/docs/desktop-testing/electron/mocking/)
- [Spectron Deprecation Notice](https://www.electronjs.org/blog/spectron-deprecation-notice)

### 測試工具

- [memfs - In-memory filesystem](https://www.npmjs.com/package/memfs)
- [mock-fs](https://www.npmjs.com/package/mock-fs)
- [xvfb-maybe](https://github.com/anaisbetts/xvfb-maybe)
- [test-fixture-factory](https://george.czabania.com/post/focused-tests-with-vitest-and-test-fixture-factory/)
- [vitest-fixture](https://github.com/larsthorup/vitest-fixture)
- [V8 Coverage in 2024](https://medium.com/@cenfun/embracing-native-v8-coverage-reports-in-2024-881e08c0a2ca)
