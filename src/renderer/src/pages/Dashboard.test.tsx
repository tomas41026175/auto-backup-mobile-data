import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Dashboard from './Dashboard'
import useAppStore from '../stores/app-store'
import type { Settings, BackupRecord, UsbDevice } from '../../../shared/types'

// ── window.api mock ──────────────────────────────────────────────────────────

const mockInvoke = vi.fn()
const mockOn = vi.fn().mockReturnValue(() => {})

Object.defineProperty(window, 'api', {
  value: { invoke: mockInvoke, on: mockOn, off: vi.fn() },
  writable: true,
})

// ── window.electron mock ─────────────────────────────────────────────────────

Object.defineProperty(window, 'electron', {
  value: { ipcRenderer: { send: vi.fn() } },
  writable: true,
})

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockSettings: Settings = {
  backupPath: '/Users/test/Backup',
  autoStart: false,
  pairedDevices: [
    {
      id: 'device-001',
      name: 'iPhone 14',
      ip: '192.168.1.100',
      addedAt: new Date().toISOString(),
      syncDirection: 'mobile-to-pc',
      syncTypes: ['photos', 'videos'],
    },
  ],
}

const mockHistory: BackupRecord[] = [
  {
    id: 'rec-001',
    deviceId: 'device-001',
    deviceName: 'iPhone 14',
    completedAt: new Date().toISOString(),
    duration: 60_000,
    fileCount: 100,
    bytesTransferred: 500 * 1024 * 1024,
    status: 'success',
    syncTypes: ['photos'],
    direction: 'mobile-to-pc',
  },
]

const mockUsbDevice: UsbDevice = {
  udid: 'abc123',
  deviceName: 'iPhone 15 Pro',
  productType: 'iPhone16,1',
  productVersion: '17.2',
}

// ── Store reset helper ────────────────────────────────────────────────────────

function resetStore(): void {
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
}

// ── Render helper ─────────────────────────────────────────────────────────────

async function renderDashboardAndWait(): Promise<ReturnType<typeof render>> {
  let result!: ReturnType<typeof render>
  await act(async () => {
    result = render(
      <MemoryRouter initialEntries={['/']}>
        <Dashboard />
      </MemoryRouter>
    )
  })
  return result
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Dashboard', () => {
  beforeEach(() => {
    resetStore()
    vi.clearAllMocks()
    // Default: settings with paired device and backup path
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'get-settings') return Promise.resolve(mockSettings)
      if (channel === 'get-history') return Promise.resolve(mockHistory)
      return Promise.resolve(null)
    })
  })

  afterEach(() => {
    cleanup()
  })

  describe('載入狀態', () => {
    it('載入中應顯示載入文字', () => {
      // 讓 invoke 永遠掛起
      mockInvoke.mockImplementation(() => new Promise(() => {}))
      render(
        <MemoryRouter initialEntries={['/']}>
          <Dashboard />
        </MemoryRouter>
      )
      expect(screen.getByText('載入中...')).toBeDefined()
    })
  })

  describe('USB 裝置連線狀態', () => {
    it('usbDevice 為 null 時，不應顯示 USB banner', async () => {
      useAppStore.setState({ usbDevice: null })
      await renderDashboardAndWait()
      expect(screen.queryByText(/USB 已連接/)).toBeNull()
    })

    it('store 中有 usbDevice 時應顯示裝置名稱與 iOS 版本', async () => {
      useAppStore.setState({ usbDevice: mockUsbDevice })
      await renderDashboardAndWait()
      await waitFor(() => {
        expect(screen.getAllByText('iPhone 15 Pro').length).toBeGreaterThan(0)
      })
      expect(screen.getAllByText(/iOS 17\.2 · USB 已連接/).length).toBeGreaterThan(0)
    })

    it('usbDevice 為 null 時不應顯示 USB banner', async () => {
      useAppStore.setState({ usbDevice: null })
      await renderDashboardAndWait()
      await waitFor(() => {
        // 等待 settings 載入完成
        expect(screen.queryByText('載入中...')).toBeNull()
      })
      expect(screen.queryByText(/USB 已連接/)).toBeNull()
    })
  })

  describe('設定未完成', () => {
    it('backupPath 為空時應顯示設定提示', async () => {
      mockInvoke.mockImplementation((channel: string) => {
        if (channel === 'get-settings') {
          return Promise.resolve({ ...mockSettings, backupPath: '', pairedDevices: [] })
        }
        if (channel === 'get-history') return Promise.resolve([])
        return Promise.resolve(null)
      })
      await renderDashboardAndWait()
      await waitFor(() => {
        expect(screen.getAllByText('尚未完成設定').length).toBeGreaterThan(0)
      })
    })
  })

  describe('mDNS 狀態', () => {
    it('mdnsAvailable 為 true 時應顯示自動偵測已啟用', async () => {
      useAppStore.setState({ mdnsAvailable: true })
      await renderDashboardAndWait()
      expect(screen.getAllByText('自動偵測已啟用').length).toBeGreaterThan(0)
    })

    it('mdnsAvailable 為 false 時應顯示警告 banner', async () => {
      useAppStore.setState({ mdnsAvailable: false })
      await renderDashboardAndWait()
      expect(screen.getAllByText(/自動偵測不可用/).length).toBeGreaterThan(0)
    })
  })

  describe('備份狀態', () => {
    it('settings 載入後 status 為 idle 時應顯示待命中', async () => {
      useAppStore.setState({ status: 'idle' })
      await renderDashboardAndWait()
      await waitFor(() => {
        expect(screen.getAllByText('待命中').length).toBeGreaterThan(0)
      })
    })

    it('status 為 backing-up 時應顯示正在備份', async () => {
      useAppStore.setState({
        status: 'backing-up',
        currentBackup: {
          id: 'job-001',
          deviceId: 'device-001',
          deviceName: 'iPhone 14',
          status: 'transferring',
          progress: 30,
          startedAt: new Date().toISOString(),
          direction: 'mobile-to-pc',
          syncTypes: ['photos'],
        },
      })
      await renderDashboardAndWait()
      await waitFor(() => {
        expect(screen.getAllByText('正在備份').length).toBeGreaterThan(0)
      })
    })

    it('backupError 存在時應顯示備份失敗', async () => {
      useAppStore.setState({
        backupError: { message: '連接失敗' },
        status: 'error',
      })
      await renderDashboardAndWait()
      await waitFor(() => {
        expect(screen.getAllByText('備份失敗').length).toBeGreaterThan(0)
      })
      expect(screen.getAllByText('連接失敗').length).toBeGreaterThan(0)
    })

    it('backupComplete 存在時應顯示備份完成摘要', async () => {
      useAppStore.setState({
        backupComplete: {
          fileCount: 100,
          totalSize: 1024 * 1024 * 1024,
          durationMs: 60_000,
        },
        status: 'idle',
      })
      await renderDashboardAndWait()
      await waitFor(() => {
        expect(screen.getAllByText('備份完成').length).toBeGreaterThan(0)
      })
      expect(screen.getAllByText('100').length).toBeGreaterThan(0)
    })
  })

  describe('已配對裝置', () => {
    it('settings 載入後應顯示已配對的裝置名稱', async () => {
      await renderDashboardAndWait()
      await waitFor(() => {
        // 主內容中的 PairedDeviceCard 有 iPhone 14
        const elements = screen.getAllByText('iPhone 14')
        expect(elements.length).toBeGreaterThan(0)
      })
    })

    it('devices 包含裝置 id 時應顯示線上狀態', async () => {
      useAppStore.setState({
        devices: [
          {
            id: 'device-001',
            name: 'iPhone 14',
            ip: '192.168.1.100',
            serviceType: '_companion-link._tcp',
            paired: true,
          },
        ],
      })
      await renderDashboardAndWait()
      await waitFor(() => {
        expect(screen.getAllByText('線上').length).toBeGreaterThan(0)
      })
    })

    it('devices 不含裝置 id 時應顯示離線狀態', async () => {
      useAppStore.setState({ devices: [] })
      await renderDashboardAndWait()
      await waitFor(() => {
        expect(screen.getAllByText('離線').length).toBeGreaterThan(0)
      })
    })
  })
})
