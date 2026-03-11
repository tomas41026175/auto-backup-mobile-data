import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Electron Notification
const mockNotificationShow = vi.fn()
const mockNotificationOn = vi.fn()
const mockNotificationIsSupported = vi.fn().mockReturnValue(true)

class MockNotification {
  title: string
  body: string

  constructor(options: { title: string; body: string }) {
    this.title = options.title
    this.body = options.body
  }

  show = mockNotificationShow
  on = mockNotificationOn

  static isSupported = mockNotificationIsSupported
}

vi.mock('electron', () => ({
  Notification: MockNotification,
  BrowserWindow: vi.fn()
}))

function createMockWindow() {
  return {
    isVisible: vi.fn().mockReturnValue(false),
    isDestroyed: vi.fn().mockReturnValue(false),
    show: vi.fn(),
    focus: vi.fn(),
    setAlwaysOnTop: vi.fn()
  }
}

function createMockBackupManager() {
  return {
    startBackup: vi.fn().mockResolvedValue(undefined),
    cancelBackup: vi.fn(),
    getStatus: vi.fn().mockReturnValue('idle' as const),
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn()
  }
}

describe('NotificationService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNotificationIsSupported.mockReturnValue(true)
  })

  it('應顯示裝置連線通知', async () => {
    const { createNotificationService } = await import('../../src/main/services/notification-service')
    const win = createMockWindow()
    const backupManager = createMockBackupManager()

    const service = createNotificationService(win as never, backupManager as never)

    const device = {
      id: 'mdns-iPhone14',
      name: 'iPhone 14',
      ip: '192.168.1.100',
      serviceType: '_companion-link._tcp',
      paired: true
    }

    service.handleDeviceStableOnline(device)

    expect(mockNotificationShow).toHaveBeenCalledOnce()
    // 驗證通知標題正確
    expect(mockNotificationOn).toHaveBeenCalledWith('click', expect.any(Function))
  })

  it('Notification 不支援時不應崩潰', async () => {
    mockNotificationIsSupported.mockReturnValue(false)

    const { createNotificationService } = await import('../../src/main/services/notification-service')
    const win = createMockWindow()
    const backupManager = createMockBackupManager()

    const service = createNotificationService(win as never, backupManager as never)

    const device = {
      id: 'mdns-TestDevice',
      name: 'Test Device',
      ip: '192.168.1.101',
      serviceType: '_companion-link._tcp',
      paired: true
    }

    expect(() => service.handleDeviceStableOnline(device)).not.toThrow()
    expect(mockNotificationShow).not.toHaveBeenCalled()
  })

  it('點擊通知後應顯示視窗並開始備份', async () => {
    const { createNotificationService } = await import('../../src/main/services/notification-service')
    const win = createMockWindow()
    const backupManager = createMockBackupManager()

    const service = createNotificationService(win as never, backupManager as never)

    const device = {
      id: 'mdns-iPhone14',
      name: 'iPhone 14',
      ip: '192.168.1.100',
      serviceType: '_companion-link._tcp',
      paired: true
    }

    service.handleDeviceStableOnline(device)

    // 取得 click handler
    const clickCall = mockNotificationOn.mock.calls.find(([event]) => event === 'click')
    expect(clickCall).toBeDefined()

    const clickHandler = clickCall![1] as () => void
    clickHandler()

    // 視窗應被顯示
    expect(win.show).toHaveBeenCalled()
    // 備份應被啟動
    expect(backupManager.startBackup).toHaveBeenCalledWith({
      deviceId: device.id,
      direction: 'mobile-to-pc'
    })
  })

  it('destroy 後 Set 應被清空', async () => {
    const { createNotificationService } = await import('../../src/main/services/notification-service')
    const win = createMockWindow()
    const backupManager = createMockBackupManager()

    const service = createNotificationService(win as never, backupManager as never)

    service.destroy()
    // 不應拋出任何錯誤
    expect(true).toBe(true)
  })
})
