import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'

// ── platform-utils mock ───────────────────────────────────────────────────────
vi.mock('../../src/main/utils/platform-utils', () => ({
  resolveBinaryPaths: vi.fn().mockReturnValue({
    idevicepair: '/opt/homebrew/bin/idevicepair',
    ideviceinfo: '/opt/homebrew/bin/ideviceinfo',
    idevice_id: '/opt/homebrew/bin/idevice_id',
    afcclient: '/opt/homebrew/bin/afcclient',
  }),
  getTempDir: vi.fn().mockReturnValue('/tmp'),
}))

// ── usb mock ──────────────────────────────────────────────────────────────────
// node-usb 模組層級事件（attach / detach）由 usbEmitter 代理
const usbEmitter = new EventEmitter()

vi.mock('usb', () => ({
  usb: {
    on: (event: string, listener: (...args: unknown[]) => void) => usbEmitter.on(event, listener),
    off: (event: string, listener: (...args: unknown[]) => void) => usbEmitter.off(event, listener)
  }
}))

// ── child_process mock ────────────────────────────────────────────────────────
// execFile 使用 callback (err, stdout, stderr) 格式
const mockExecFile = vi.fn()

vi.mock('child_process', () => ({
  execFile: (
    path: string,
    args: string[],
    callback: (err: Error | null, stdout: string, stderr: string) => void
  ) => {
    mockExecFile(path, args, callback)
  }
}))

// ── helpers ───────────────────────────────────────────────────────────────────

function makeAppleDevice(productId = 0x12a8, busNumber = 1, deviceAddress = 2) {
  return {
    busNumber,
    deviceAddress,
    deviceDescriptor: {
      idVendor: 0x05ac,
      idProduct: productId
    }
  }
}

function makeNonAppleDevice(busNumber = 1, deviceAddress = 3) {
  return {
    busNumber,
    deviceAddress,
    deviceDescriptor: {
      idVendor: 0x1234,
      idProduct: 0x5678
    }
  }
}

// 推進假計時器並 flush microtasks（多次 await 確保 async Promise chain 完成）
async function advanceAndFlush(ms: number): Promise<void> {
  vi.advanceTimersByTime(ms)
  for (let i = 0; i < 15; i++) {
    await Promise.resolve()
  }
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('UsbDeviceMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    usbEmitter.removeAllListeners()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Apple 裝置插入', () => {
    it('插入 Apple 裝置後應 emit usb-device-connected，包含 UDID 與裝置資訊', async () => {
      // Arrange: execFile callback 形式
      mockExecFile.mockImplementation(
        (path: string, _args: string[], callback: (err: Error | null, stdout: string, stderr: string) => void) => {
          if (path.includes('idevice_id')) {
            callback(null, 'abc123def456\n', '')
          } else if (path.includes('ideviceinfo')) {
            callback(null, 'DeviceName: My iPhone 16 Pro\nProductVersion: 18.2.1\n', '')
          }
        }
      )

      const { createUsbDeviceMonitor } = await import(
        '../../src/main/services/usb-device-monitor'
      )
      const monitor = createUsbDeviceMonitor()
      const connectedHandler = vi.fn()
      monitor.on('usb-device-connected', connectedHandler)

      // Act
      usbEmitter.emit('attach', makeAppleDevice())
      await advanceAndFlush(2000) // 超過 1500ms 等待延遲

      // Assert
      expect(connectedHandler).toHaveBeenCalledOnce()
      const info = connectedHandler.mock.calls[0][0]
      expect(info.udid).toBe('abc123def456')
      expect(info.name).toBe('My iPhone 16 Pro')
      expect(info.iosVersion).toBe('18.2.1')
      expect(info.productId).toBe(0x12a8)

      monitor.destroy()
    }, 15_000)
  })

  describe('非 Apple 裝置', () => {
    it('插入非 Apple 裝置不應觸發任何事件', async () => {
      const { createUsbDeviceMonitor } = await import(
        '../../src/main/services/usb-device-monitor'
      )
      const monitor = createUsbDeviceMonitor()
      const connectedHandler = vi.fn()
      monitor.on('usb-device-connected', connectedHandler)

      usbEmitter.emit('attach', makeNonAppleDevice())
      await advanceAndFlush(2000)

      expect(connectedHandler).not.toHaveBeenCalled()
      expect(mockExecFile).not.toHaveBeenCalled()

      monitor.destroy()
    }, 10_000)
  })

  describe('iPhone 拔出', () => {
    it('拔出 Apple 裝置後應 emit usb-device-disconnected 帶 UDID', async () => {
      // Arrange
      mockExecFile.mockImplementation(
        (path: string, _args: string[], callback: (err: Error | null, stdout: string, stderr: string) => void) => {
          if (path.includes('idevice_id')) {
            callback(null, 'udid-xyz\n', '')
          } else {
            callback(null, 'DeviceName: Test Phone\nProductVersion: 17.0\n', '')
          }
        }
      )

      const { createUsbDeviceMonitor } = await import(
        '../../src/main/services/usb-device-monitor'
      )
      const monitor = createUsbDeviceMonitor()
      const disconnectedHandler = vi.fn()
      monitor.on('usb-device-disconnected', disconnectedHandler)

      const appleDevice = makeAppleDevice(0x12a8, 2, 5)

      // Attach first
      usbEmitter.emit('attach', appleDevice)
      await advanceAndFlush(2000)

      // Act: detach
      usbEmitter.emit('detach', appleDevice)

      // Assert
      expect(disconnectedHandler).toHaveBeenCalledOnce()
      expect(disconnectedHandler.mock.calls[0][0]).toBe('udid-xyz')

      monitor.destroy()
    }, 15_000)

    it('從未 attach 的 Apple 裝置拔出不應觸發 disconnected 事件', async () => {
      const { createUsbDeviceMonitor } = await import(
        '../../src/main/services/usb-device-monitor'
      )
      const monitor = createUsbDeviceMonitor()
      const disconnectedHandler = vi.fn()
      monitor.on('usb-device-disconnected', disconnectedHandler)

      usbEmitter.emit('detach', makeAppleDevice())

      expect(disconnectedHandler).not.toHaveBeenCalled()

      monitor.destroy()
    }, 10_000)
  })

  describe('idevice_id 失敗', () => {
    it('idevice_id 無法取得 UDID 時不應 emit connected 事件', async () => {
      mockExecFile.mockImplementation(
        (path: string, _args: string[], callback: (err: Error | null, stdout: string, stderr: string) => void) => {
          if (path.includes('idevice_id')) {
            callback(new Error('idevice_id failed'), '', '')
          }
        }
      )

      const { createUsbDeviceMonitor } = await import(
        '../../src/main/services/usb-device-monitor'
      )
      const monitor = createUsbDeviceMonitor()
      const connectedHandler = vi.fn()
      monitor.on('usb-device-connected', connectedHandler)

      usbEmitter.emit('attach', makeAppleDevice())
      await advanceAndFlush(2000)

      expect(connectedHandler).not.toHaveBeenCalled()

      monitor.destroy()
    }, 10_000)
  })

  describe('destroy', () => {
    it('destroy 後應移除 USB 監聽器，不再觸發事件', async () => {
      mockExecFile.mockImplementation(
        (_path: string, _args: string[], callback: (err: Error | null, stdout: string, stderr: string) => void) => {
          callback(null, 'any-udid\n', '')
        }
      )

      const { createUsbDeviceMonitor } = await import(
        '../../src/main/services/usb-device-monitor'
      )
      const monitor = createUsbDeviceMonitor()
      const connectedHandler = vi.fn()
      monitor.on('usb-device-connected', connectedHandler)

      // Destroy before any attach
      monitor.destroy()

      usbEmitter.emit('attach', makeAppleDevice())
      await advanceAndFlush(2000)

      expect(connectedHandler).not.toHaveBeenCalled()
    }, 10_000)
  })
})
