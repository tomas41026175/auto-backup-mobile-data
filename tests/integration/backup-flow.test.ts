import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import type { Device, PairedDevice, BackupJob, BackupRecord, BackupTask, BackupStatus } from '../../src/shared/types'
import { DEFAULT_SYNC_TYPES } from '../../src/shared/types'

// ── Mock bonjour-service ──────────────────────────────────────────────────────

class MockBrowser extends EventEmitter {
  update = vi.fn()
  stop = vi.fn()
}

// 主掃描 browser（讓測試可以觸發 up/down 事件，也可以呼叫 up callback）
let currentBrowser: MockBrowser | null = null
// 主掃描 browser 的 up callback（bonjour find 的第二個參數）
let onServiceUp: ((service: unknown) => void) | null = null

const mockBonjourInstance = {
  find: vi.fn(),
  publish: vi.fn().mockReturnValue({ stop: vi.fn() }),
  destroy: vi.fn()
}

vi.mock('bonjour-service', () => ({
  Bonjour: vi.fn().mockImplementation(() => mockBonjourInstance)
}))

// ── Mock net（TCP ping 永遠 timeout）──────────────────────────────────────────

vi.mock('net', () => ({
  connect: vi.fn().mockImplementation(() => {
    const socket = new EventEmitter() as EventEmitter & {
      setTimeout: ReturnType<typeof vi.fn>
      destroy: ReturnType<typeof vi.fn>
    }
    socket.setTimeout = vi.fn()
    socket.destroy = vi.fn()
    return socket
  })
}))

// ── Mock Electron Notification ────────────────────────────────────────────────

class MockNotification extends EventEmitter {
  title: string
  body: string

  constructor(opts: { title: string; body: string }) {
    super()
    this.title = opts.title
    this.body = opts.body
  }

  show = vi.fn()
}

let lastNotification: MockNotification | null = null

const MockNotificationConstructor = vi.fn().mockImplementation((opts: { title: string; body: string }) => {
  lastNotification = new MockNotification(opts)
  return lastNotification
})
MockNotificationConstructor.isSupported = vi.fn().mockReturnValue(true)

vi.mock('electron', () => ({
  Notification: MockNotificationConstructor,
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/test-app'),
    on: vi.fn()
  }
}))

// ── Mock electron-conf ────────────────────────────────────────────────────────

vi.mock('electron-conf/main', () => ({
  Conf: vi.fn().mockImplementation(() => {
    const data: Record<string, unknown> = {}
    return {
      has: (key: string) => key in data,
      get: (key: string, defaultVal?: unknown) => (key in data ? data[key] : defaultVal),
      set: (key: string, value: unknown) => { data[key] = value }
    }
  })
}))

// ── Mock fs.existsSync ────────────────────────────────────────────────────────

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true)
}))

// ── Helper: flush timers / microtasks ─────────────────────────────────────────

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

// ── 建立測試用 SettingsStore ──────────────────────────────────────────────────

function createMockSettingsStore(pairedDevices: PairedDevice[] = []) {
  let settings = {
    backupPath: 'C:\\Backup',
    pairedDevices,
    autoStart: false
  }

  return {
    getSettings: vi.fn(() => ({ ...settings, pairedDevices: [...settings.pairedDevices] })),
    saveSettings: vi.fn((partial: Partial<typeof settings>) => {
      settings = { ...settings, ...partial }
      return settings
    }),
    addPairedDevice: vi.fn(),
    removePairedDevice: vi.fn(),
    updateDeviceConfig: vi.fn()
  }
}

// ── 建立測試用 BackupHistoryStore ─────────────────────────────────────────────

function createMockHistoryStore() {
  const records: BackupRecord[] = []
  return {
    addRecord: vi.fn((record: BackupRecord) => { records.push(record) }),
    getHistory: vi.fn(() => [...records]),
    clearHistory: vi.fn(() => { records.length = 0 })
  }
}

// ── 建立測試用 BrowserWindow ──────────────────────────────────────────────────

function createMockWindow() {
  return {
    isVisible: vi.fn().mockReturnValue(false),
    isDestroyed: vi.fn().mockReturnValue(false),
    show: vi.fn(),
    focus: vi.fn(),
    setAlwaysOnTop: vi.fn()
  }
}

// ─────────────────────────────────────────────────────────────────────────────

describe('備份完整流程', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    lastNotification = null
    currentBrowser = null
    onServiceUp = null

    // 重置 bonjour mock 狀態
    mockBonjourInstance.find.mockReset()
    mockBonjourInstance.publish.mockReset().mockReturnValue({ stop: vi.fn() })
    mockBonjourInstance.destroy.mockReset()

    // 預設：第一次呼叫（自我測試）回傳不觸發 callback 的 browser
    //        第二次呼叫（主掃描）回傳可控制的 MockBrowser，並存下 callback
    mockBonjourInstance.find
      .mockImplementationOnce(() => ({ stop: vi.fn() }))
      .mockImplementation((_opts: unknown, cb?: (service: unknown) => void) => {
        onServiceUp = cb ?? null
        currentBrowser = new MockBrowser()
        return currentBrowser
      })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  // ── Flow 1: 裝置上線 → debounce → 通知 → 備份 ────────────────────────────

  it('裝置穩定上線後觸發通知並啟動備份', async () => {
    const { createDeviceScanner } = await import('../../src/main/services/device-scanner')
    const { createNotificationService } = await import('../../src/main/services/notification-service')
    const { MockBackupManager } = await import('../../src/main/services/backup-manager')

    const pairedDevice: PairedDevice = {
      id: 'mdns-iPhone',
      name: 'iPhone',
      ip: '192.168.1.100',
      addedAt: new Date().toISOString(),
      syncDirection: 'mobile-to-pc',
      syncTypes: [...DEFAULT_SYNC_TYPES]
    }

    const settingsStore = createMockSettingsStore([pairedDevice])
    const historyStore = createMockHistoryStore()
    const backupManager = new MockBackupManager(settingsStore, historyStore)
    const win = createMockWindow()

    const startBackupSpy = vi.spyOn(backupManager, 'startBackup')

    const scanner = createDeviceScanner(settingsStore)
    const notificationService = createNotificationService(
      win as Parameters<typeof createNotificationService>[0],
      backupManager
    )

    // 綁定事件
    scanner.on('device-stable-online', (device: Device) => {
      notificationService.handleDeviceStableOnline(device)
    })

    // 等待 start() 完成（mDNS 自我測試 timeout 5秒）
    await vi.advanceTimersByTimeAsync(5_100)
    await flushMicrotasks()

    // 模擬 mDNS 裝置上線（透過 find 的 callback 觸發）
    const service = {
      name: 'iPhone',
      addresses: ['192.168.1.100'],
      host: '192.168.1.100',
      type: '_companion-link._tcp'
    }
    onServiceUp?.(service)

    // 推進 30 秒 debounce
    await vi.advanceTimersByTimeAsync(30_000)
    await flushMicrotasks()

    // 應該發送了通知
    expect(lastNotification).not.toBeNull()
    expect(lastNotification?.title).toBe('iPhone 已連線')
    expect(lastNotification?.show).toHaveBeenCalled()

    // 點擊通知 → 觸發備份
    lastNotification?.emit('click')
    await flushMicrotasks()

    expect(startBackupSpy).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: 'mdns-iPhone', direction: 'mobile-to-pc' })
    )

    scanner.destroy()
    notificationService.destroy()
  })

  it('debounce 期間離線不觸發通知', async () => {
    const { createDeviceScanner } = await import('../../src/main/services/device-scanner')

    const pairedDevice: PairedDevice = {
      id: 'mdns-Android',
      name: 'Android',
      ip: '192.168.1.200',
      addedAt: new Date().toISOString(),
      syncDirection: 'mobile-to-pc',
      syncTypes: [...DEFAULT_SYNC_TYPES]
    }

    const settingsStore = createMockSettingsStore([pairedDevice])

    const scanner = createDeviceScanner(settingsStore)
    const stableOnlineSpy = vi.fn()
    scanner.on('device-stable-online', stableOnlineSpy)

    await vi.advanceTimersByTimeAsync(5_100)
    await flushMicrotasks()

    // 裝置上線（透過 find callback 觸發）
    onServiceUp?.({
      name: 'Android',
      addresses: ['192.168.1.200'],
      host: '192.168.1.200',
      type: '_companion-link._tcp'
    })

    // 推進 15 秒（debounce 未結束）
    await vi.advanceTimersByTimeAsync(15_000)
    await flushMicrotasks()

    // 裝置離線（透過 browser down 事件）
    currentBrowser?.emit('down', {
      name: 'Android',
      addresses: ['192.168.1.200'],
      host: '192.168.1.200',
      type: '_companion-link._tcp'
    })

    // 繼續推進 20 秒（超過 30 秒總計）
    await vi.advanceTimersByTimeAsync(20_000)
    await flushMicrotasks()

    // 不應觸發 device-stable-online
    expect(stableOnlineSpy).not.toHaveBeenCalled()

    scanner.destroy()
  })

  it('同一裝置同一 session 只觸發一次通知', async () => {
    const { createDeviceScanner } = await import('../../src/main/services/device-scanner')

    const pairedDevice: PairedDevice = {
      id: 'mdns-iPad',
      name: 'iPad',
      ip: '192.168.1.150',
      addedAt: new Date().toISOString(),
      syncDirection: 'mobile-to-pc',
      syncTypes: [...DEFAULT_SYNC_TYPES]
    }

    const settingsStore = createMockSettingsStore([pairedDevice])

    const scanner = createDeviceScanner(settingsStore)
    const stableOnlineSpy = vi.fn()
    scanner.on('device-stable-online', stableOnlineSpy)

    await vi.advanceTimersByTimeAsync(5_100)
    await flushMicrotasks()

    const service = {
      name: 'iPad',
      addresses: ['192.168.1.150'],
      host: '192.168.1.150',
      type: '_companion-link._tcp'
    }

    // 第一次上線（透過 find callback 觸發）
    onServiceUp?.(service)
    await vi.advanceTimersByTimeAsync(30_000)
    await flushMicrotasks()

    expect(stableOnlineSpy).toHaveBeenCalledTimes(1)

    // 第二次上線（同一 session，notifiedDevices 已有記錄）
    onServiceUp?.(service)
    await vi.advanceTimersByTimeAsync(30_000)
    await flushMicrotasks()

    // 仍只有 1 次
    expect(stableOnlineSpy).toHaveBeenCalledTimes(1)

    scanner.destroy()
  })

  // ── Flow 2: 備份流程 ───────────────────────────────────────────────────────

  it('mock 備份進度 0→100% 依序發送', async () => {
    const { MockBackupManager } = await import('../../src/main/services/backup-manager')

    const settingsStore = createMockSettingsStore()
    const historyStore = createMockHistoryStore()
    const manager = new MockBackupManager(settingsStore, historyStore)

    const progressValues: number[] = []
    manager.on('backup-progress', (job: BackupJob) => {
      progressValues.push(job.progress)
    })

    const task: BackupTask = { deviceId: 'device-1', direction: 'mobile-to-pc' }
    const startPromise = manager.startBackup(task)

    // 推進 5 個步驟（每步 500ms）
    await vi.advanceTimersByTimeAsync(500 * 5)
    await flushMicrotasks()
    await startPromise

    expect(progressValues).toEqual([0, 25, 50, 75, 100])
  })

  it('備份路徑不存在拋出 BackupPathNotFoundError', async () => {
    const { MockBackupManager, BackupPathNotFoundError } = await import('../../src/main/services/backup-manager')
    const { existsSync } = await import('fs')

    vi.mocked(existsSync).mockReturnValueOnce(false)

    const settingsStore = createMockSettingsStore()
    const historyStore = createMockHistoryStore()
    const manager = new MockBackupManager(settingsStore, historyStore)

    const task: BackupTask = { deviceId: 'device-1', direction: 'mobile-to-pc' }

    await expect(manager.startBackup(task)).rejects.toThrow(BackupPathNotFoundError)
  })

  it('取消備份中止進度推送', async () => {
    const { MockBackupManager } = await import('../../src/main/services/backup-manager')

    const settingsStore = createMockSettingsStore()
    const historyStore = createMockHistoryStore()
    const manager = new MockBackupManager(settingsStore, historyStore)

    const progressValues: number[] = []
    const statusValues: BackupStatus[] = []

    manager.on('backup-progress', (job: BackupJob) => {
      progressValues.push(job.progress)
      statusValues.push(job.status)
    })

    const task: BackupTask = { deviceId: 'device-cancel', direction: 'mobile-to-pc' }
    void manager.startBackup(task)

    // 只推進 1 步（0%）
    await vi.advanceTimersByTimeAsync(500)
    await flushMicrotasks()

    // 取消
    manager.cancelBackup('device-cancel')
    await flushMicrotasks()

    // 後續進度不再發送
    await vi.advanceTimersByTimeAsync(2_000)
    await flushMicrotasks()

    // 最後一個 status 應為 cancelled
    expect(statusValues[statusValues.length - 1]).toBe('cancelled')
    // 不應到達 100%
    expect(progressValues).not.toContain(100)
  })

  // ── Flow 3: mDNS 自我檢測 ────────────────────────────────────────────────

  it('5 秒無回應標記 mdnsAvailable = false', async () => {
    const { createDeviceScanner } = await import('../../src/main/services/device-scanner')

    const settingsStore = createMockSettingsStore()

    // beforeEach 已設定 find 的行為：第一次回傳自我測試 browser（timeout），第二次回傳主掃描 browser
    const scanner = createDeviceScanner(settingsStore)
    const mdnsStatusSpy = vi.fn()
    scanner.on('mdns-status', mdnsStatusSpy)

    // 推進 5 秒讓自我測試 timeout
    await vi.advanceTimersByTimeAsync(5_100)
    await flushMicrotasks()

    expect(scanner.mdnsAvailable).toBe(false)
    expect(mdnsStatusSpy).toHaveBeenCalledWith(false)

    scanner.destroy()
  })

  // ── Flow 4: settings store ───────────────────────────────────────────────

  it('配對裝置預設 syncDirection = mobile-to-pc', async () => {
    const { createSettingsStore } = await import('../../src/main/services/settings-store')

    const store = createSettingsStore()
    const added = store.addPairedDevice({
      id: 'device-new',
      name: 'New Device',
      ip: '192.168.1.10'
    })

    expect(added.syncDirection).toBe('mobile-to-pc')
  })

  it('配對裝置預設 syncTypes = DEFAULT_SYNC_TYPES', async () => {
    const { createSettingsStore } = await import('../../src/main/services/settings-store')

    const store = createSettingsStore()
    const added = store.addPairedDevice({
      id: 'device-defaults',
      name: 'Defaults Device',
      ip: '192.168.1.11'
    })

    expect(added.syncTypes).toEqual(expect.arrayContaining(DEFAULT_SYNC_TYPES))
    expect(added.syncTypes).toHaveLength(DEFAULT_SYNC_TYPES.length)
  })
})
