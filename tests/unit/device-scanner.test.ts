import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'

// Mock browser 實例（需要回應 up/down 事件）
class MockBrowser extends EventEmitter {
  update = vi.fn()
  stop = vi.fn()
}

// 全域 browser 實例，讓測試可以直接觸發事件
let currentBrowser: MockBrowser | null = null

const mockBonjourInstance = {
  find: vi.fn(),
  publish: vi.fn().mockReturnValue({ stop: vi.fn() }),
  destroy: vi.fn()
}

vi.mock('bonjour-service', () => ({
  Bonjour: vi.fn().mockImplementation(() => mockBonjourInstance)
}))

// Mock net（TCP ping）— 永遠 timeout（不影響 mDNS 流程）
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

// 讓 microtask queue 清空的輔助函式
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

// Mock settingsStore
function createMockSettingsStore(pairedDeviceIds: string[] = []) {
  return {
    getSettings: vi.fn().mockReturnValue({
      backupPath: '/tmp/backup',
      pairedDevices: pairedDeviceIds.map((id) => ({
        id,
        name: `Device ${id}`,
        ip: '192.168.1.100',
        addedAt: new Date().toISOString(),
        syncDirection: 'mobile-to-pc' as const,
        syncTypes: ['photos' as const]
      })),
      autoStart: false
    }),
    saveSettings: vi.fn(),
    addPairedDevice: vi.fn(),
    removePairedDevice: vi.fn(),
    updateDeviceConfig: vi.fn()
  }
}

// 建立 scanner 並等待 async start() 完成（fake timer 推進 self-test timeout）
async function createScannerAndWaitForStart(settingsStore: ReturnType<typeof createMockSettingsStore>) {
  const { createDeviceScanner } = await import('../../src/main/services/device-scanner')
  const scanner = createDeviceScanner(settingsStore)
  // 推進 mDNS 自我檢測 timeout（5 秒）
  vi.advanceTimersByTime(5_100)
  // 讓 Promise 鏈完成（多個 microtask flush）
  await flushMicrotasks()
  return scanner
}

function setupFindMock(): void {
  mockBonjourInstance.find.mockImplementation((_opts: unknown, upCallback?: (s: unknown) => void) => {
    const browser = new MockBrowser()
    currentBrowser = browser
    if (upCallback) {
      browser.on('up', upCallback)
    }
    return browser
  })
}

describe('DeviceScanner', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    currentBrowser = null
    setupFindMock()
    mockBonjourInstance.publish.mockReturnValue({ stop: vi.fn() })
    mockBonjourInstance.destroy.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('已配對裝置過濾', () => {
    it('已配對裝置應觸發 debounce timer 並在 30 秒後發送 device-stable-online', async () => {
      const pairedDeviceId = 'mdns-iPhone14'
      const settingsStore = createMockSettingsStore([pairedDeviceId])
      const scanner = await createScannerAndWaitForStart(settingsStore)

      const stableOnlineHandler = vi.fn()
      scanner.on('device-stable-online', stableOnlineHandler)

      expect(currentBrowser).not.toBeNull()

      const mockService = {
        name: 'iPhone14',
        host: '192.168.1.100',
        addresses: ['192.168.1.100'],
        type: '_companion-link._tcp'
      }

      currentBrowser!.emit('up', mockService)

      // debounce 時間內不應觸發
      vi.advanceTimersByTime(29_000)
      expect(stableOnlineHandler).not.toHaveBeenCalled()

      // 超過 30 秒後應觸發
      vi.advanceTimersByTime(2_000)
      expect(stableOnlineHandler).toHaveBeenCalledOnce()

      scanner.destroy()
    }, 10_000)

    it('未配對裝置不應觸發 device-stable-online', async () => {
      const settingsStore = createMockSettingsStore([]) // 無配對裝置
      const scanner = await createScannerAndWaitForStart(settingsStore)

      const stableOnlineHandler = vi.fn()
      scanner.on('device-stable-online', stableOnlineHandler)

      const mockService = {
        name: 'UnpairedDevice',
        host: '192.168.1.200',
        addresses: ['192.168.1.200'],
        type: '_companion-link._tcp'
      }

      currentBrowser!.emit('up', mockService)
      vi.advanceTimersByTime(60_000)

      expect(stableOnlineHandler).not.toHaveBeenCalled()

      scanner.destroy()
    }, 10_000)
  })

  describe('重複觸發防護', () => {
    it('同一裝置同一 session 只觸發一次 device-stable-online', async () => {
      const pairedDeviceId = 'mdns-TestDevice'
      const settingsStore = createMockSettingsStore([pairedDeviceId])
      const scanner = await createScannerAndWaitForStart(settingsStore)

      const stableOnlineHandler = vi.fn()
      scanner.on('device-stable-online', stableOnlineHandler)

      const mockService = {
        name: 'TestDevice',
        host: '192.168.1.100',
        addresses: ['192.168.1.100'],
        type: '_companion-link._tcp'
      }

      // 第一次上線
      currentBrowser!.emit('up', mockService)
      vi.advanceTimersByTime(31_000)
      expect(stableOnlineHandler).toHaveBeenCalledTimes(1)

      // 再次觸發（不離線直接再上線）
      currentBrowser!.emit('up', mockService)
      vi.advanceTimersByTime(31_000)

      // 仍然只觸發一次（已在 notifiedDevices Set 中）
      expect(stableOnlineHandler).toHaveBeenCalledTimes(1)

      scanner.destroy()
    }, 10_000)

    it('裝置離線後再上線應重新觸發通知', async () => {
      const pairedDeviceId = 'mdns-TestDevice2'
      const settingsStore = createMockSettingsStore([pairedDeviceId])
      const scanner = await createScannerAndWaitForStart(settingsStore)

      const stableOnlineHandler = vi.fn()
      scanner.on('device-stable-online', stableOnlineHandler)

      const mockService = {
        name: 'TestDevice2',
        host: '192.168.1.101',
        addresses: ['192.168.1.101'],
        type: '_companion-link._tcp'
      }

      // 第一次上線 → 觸發
      currentBrowser!.emit('up', mockService)
      vi.advanceTimersByTime(31_000)
      expect(stableOnlineHandler).toHaveBeenCalledTimes(1)

      // 離線（清除 notifiedDevices）
      currentBrowser!.emit('down', mockService)

      // 再次上線 → 應重新觸發
      currentBrowser!.emit('up', mockService)
      vi.advanceTimersByTime(31_000)
      expect(stableOnlineHandler).toHaveBeenCalledTimes(2)

      scanner.destroy()
    }, 10_000)
  })

  describe('debounce 邏輯', () => {
    it('裝置在 debounce 期間離線應取消計時器', async () => {
      const pairedDeviceId = 'mdns-FlickerDevice'
      const settingsStore = createMockSettingsStore([pairedDeviceId])
      const scanner = await createScannerAndWaitForStart(settingsStore)

      const stableOnlineHandler = vi.fn()
      scanner.on('device-stable-online', stableOnlineHandler)

      const mockService = {
        name: 'FlickerDevice',
        host: '192.168.1.102',
        addresses: ['192.168.1.102'],
        type: '_companion-link._tcp'
      }

      // 上線
      currentBrowser!.emit('up', mockService)

      // 10 秒後（debounce 期間）離線
      vi.advanceTimersByTime(10_000)
      currentBrowser!.emit('down', mockService)

      // 等待超過 30 秒
      vi.advanceTimersByTime(30_000)

      // 應不觸發（timer 被取消）
      expect(stableOnlineHandler).not.toHaveBeenCalled()

      scanner.destroy()
    }, 10_000)
  })

  describe('mDNS 自我檢測', () => {
    it('5 秒內無回應應標記 mdnsAvailable 為 false', async () => {
      const settingsStore = createMockSettingsStore([])
      const { createDeviceScanner } = await import('../../src/main/services/device-scanner')
      const scanner = createDeviceScanner(settingsStore)

      // 推進超過 5 秒 self-test timeout
      vi.advanceTimersByTime(6_000)
      await flushMicrotasks()

      // mdnsAvailable 應為 false（無回應）
      expect(scanner.mdnsAvailable).toBe(false)

      scanner.destroy()
    }, 10_000)
  })
})
