import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IpcRendererEvent } from 'electron'
import type { UsbDevice, BackupProgressDetail, BackupCompleteDetail, BackupErrorDetail } from '../../../shared/types'

// ── window.api mock ──────────────────────────────────────────────────────────

type ListenerMap = Record<string, (event: IpcRendererEvent, ...args: unknown[]) => void>

const listeners: ListenerMap = {}
const mockInvoke = vi.fn()
const mockOn = vi.fn((channel: string, listener: ListenerMap[string]) => {
  listeners[channel] = listener
  return (): void => {
    delete listeners[channel]
  }
})

Object.defineProperty(global, 'window', {
  value: {
    api: {
      invoke: mockInvoke,
      on: mockOn,
      off: vi.fn(),
    },
  },
  writable: true,
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function emit(channel: string, ...args: unknown[]): void {
  const listener = listeners[channel]
  if (listener) {
    listener({} as IpcRendererEvent, ...args)
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('app-store IPC listeners', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    Object.keys(listeners).forEach((key) => delete listeners[key])

    // 動態 import 以確保每次都拿到 fresh store
    const { default: useAppStore } = await import('./app-store')
    useAppStore.setState({
      devices: [],
      currentBackup: null,
      status: 'idle',
      mdnsAvailable: true,
      usbDevice: null,
      backupProgressDetail: null,
      backupComplete: null,
      backupError: null,
    })
  })

  describe('setupIpcListeners', () => {
    it('device-usb-connected 應更新 usbDevice 狀態', async () => {
      const { default: useAppStore, setupIpcListeners } = await import('./app-store')
      setupIpcListeners()

      const device: UsbDevice = {
        udid: 'abc123',
        deviceName: 'iPhone 15 Pro',
        productType: 'iPhone16,1',
        productVersion: '17.2',
      }

      emit('device-usb-connected', device)

      expect(useAppStore.getState().usbDevice).toEqual(device)
    })

    it('device-usb-connected 應清除 backupError 與 backupComplete', async () => {
      const { default: useAppStore, setupIpcListeners } = await import('./app-store')
      useAppStore.setState({
        backupError: { message: '前次錯誤' },
        backupComplete: { fileCount: 10, totalSize: 100, durationMs: 5000 },
      })
      setupIpcListeners()

      const device: UsbDevice = {
        udid: 'abc123',
        deviceName: 'iPhone 15 Pro',
        productType: 'iPhone16,1',
        productVersion: '17.2',
      }

      emit('device-usb-connected', device)

      expect(useAppStore.getState().backupError).toBeNull()
      expect(useAppStore.getState().backupComplete).toBeNull()
    })

    it('device-usb-disconnected 應清除 usbDevice 並回到 idle 狀態', async () => {
      const { default: useAppStore, setupIpcListeners } = await import('./app-store')
      useAppStore.setState({
        usbDevice: {
          udid: 'abc123',
          deviceName: 'iPhone 15 Pro',
          productType: 'iPhone16,1',
          productVersion: '17.2',
        },
        status: 'backing-up',
      })
      setupIpcListeners()

      emit('device-usb-disconnected')

      expect(useAppStore.getState().usbDevice).toBeNull()
      expect(useAppStore.getState().status).toBe('idle')
      expect(useAppStore.getState().currentBackup).toBeNull()
      expect(useAppStore.getState().backupProgressDetail).toBeNull()
    })

    it('backup-progress-detail 應更新 backupProgressDetail 並設 status 為 backing-up', async () => {
      const { default: useAppStore, setupIpcListeners } = await import('./app-store')
      setupIpcListeners()

      const progress: BackupProgressDetail = {
        current: 512 * 1024 * 1024,
        total: 1024 * 1024 * 1024,
        fileName: 'IMG_1234.HEIC',
        speed: 15.5,
      }

      emit('backup-progress-detail', progress)

      expect(useAppStore.getState().backupProgressDetail).toEqual(progress)
      expect(useAppStore.getState().status).toBe('backing-up')
    })

    it('backup-progress-detail 應清除 backupComplete 與 backupError', async () => {
      const { default: useAppStore, setupIpcListeners } = await import('./app-store')
      useAppStore.setState({
        backupComplete: { fileCount: 10, totalSize: 100, durationMs: 5000 },
        backupError: { message: '前次錯誤' },
      })
      setupIpcListeners()

      const progress: BackupProgressDetail = {
        current: 0,
        total: 1024,
        fileName: 'test.jpg',
        speed: 1.0,
      }

      emit('backup-progress-detail', progress)

      expect(useAppStore.getState().backupComplete).toBeNull()
      expect(useAppStore.getState().backupError).toBeNull()
    })

    it('backup-complete-detail 應更新 backupComplete 並清除 backupProgressDetail', async () => {
      const { default: useAppStore, setupIpcListeners } = await import('./app-store')
      useAppStore.setState({
        backupProgressDetail: { current: 500, total: 1000, fileName: 'test.jpg', speed: 5 },
      })
      setupIpcListeners()

      const detail: BackupCompleteDetail = {
        fileCount: 250,
        totalSize: 2 * 1024 * 1024 * 1024,
        durationMs: 90_000,
      }

      emit('backup-complete-detail', detail)

      expect(useAppStore.getState().backupComplete).toEqual(detail)
      expect(useAppStore.getState().backupProgressDetail).toBeNull()
      expect(useAppStore.getState().currentBackup).toBeNull()
      expect(useAppStore.getState().status).toBe('idle')
    })

    it('backup-error 應更新 backupError 並設 status 為 error', async () => {
      const { default: useAppStore, setupIpcListeners } = await import('./app-store')
      setupIpcListeners()

      const error: BackupErrorDetail = {
        message: '連接裝置時發生錯誤，請確認裝置已解鎖',
      }

      emit('backup-error', error)

      expect(useAppStore.getState().backupError).toEqual(error)
      expect(useAppStore.getState().status).toBe('error')
      expect(useAppStore.getState().backupProgressDetail).toBeNull()
      expect(useAppStore.getState().currentBackup).toBeNull()
    })

    it('setupIpcListeners 回傳的 cleanup 應取消所有訂閱', async () => {
      const { default: useAppStore, setupIpcListeners } = await import('./app-store')
      const cleanup = setupIpcListeners()

      cleanup()

      // 取消訂閱後，事件不再更新 store
      const usbDevice: UsbDevice = {
        udid: 'xyz',
        deviceName: 'Test',
        productType: 'iPhone',
        productVersion: '18.0',
      }
      emit('device-usb-connected', usbDevice)

      expect(useAppStore.getState().usbDevice).toBeNull()
    })

    it('mdns-status false 應更新 mdnsAvailable', async () => {
      const { default: useAppStore, setupIpcListeners } = await import('./app-store')
      setupIpcListeners()

      emit('mdns-status', false)

      expect(useAppStore.getState().mdnsAvailable).toBe(false)
    })
  })
})
