import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BackupProgress } from './BackupProgress'
import useAppStore from '../stores/app-store'
import type { BackupJob, BackupProgressDetail, BackupCompleteDetail, BackupErrorDetail } from '../../../shared/types'

// ── window.api mock ──────────────────────────────────────────────────────────

const mockInvoke = vi.fn()
const mockOn = vi.fn().mockReturnValue(() => {})

Object.defineProperty(window, 'api', {
  value: { invoke: mockInvoke, on: mockOn, off: vi.fn() },
  writable: true,
})

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockBackupJob: BackupJob = {
  id: 'job-001',
  deviceId: 'device-001',
  deviceName: 'iPhone 14',
  status: 'transferring',
  progress: 50,
  startedAt: new Date(Date.now() - 30_000).toISOString(),
  direction: 'mobile-to-pc',
  syncTypes: ['photos'],
}

const mockProgressDetail: BackupProgressDetail = {
  current: 512 * 1024 * 1024,
  total: 1024 * 1024 * 1024,
  fileName: 'IMG_1234.HEIC',
  speed: 15.5,
}

const mockCompleteDetail: BackupCompleteDetail = {
  fileCount: 250,
  totalSize: 2 * 1024 * 1024 * 1024,
  durationMs: 90_000,
}

const mockError: BackupErrorDetail = {
  message: '連接裝置時發生錯誤，請確認裝置已解鎖',
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BackupProgress', () => {
  beforeEach(() => {
    // 每次測試前重置 store 與 mock
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
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  describe('無備份狀態', () => {
    it('無任何備份相關狀態時應回傳 null（不渲染）', () => {
      const { container } = render(<BackupProgress />)
      expect(container.firstChild).toBeNull()
    })
  })

  describe('備份進行中', () => {
    it('有 currentBackup 時應顯示裝置名稱', () => {
      useAppStore.setState({ currentBackup: mockBackupJob })
      render(<BackupProgress />)
      const elements = screen.getAllByText(/iPhone 14/)
      expect(elements.length).toBeGreaterThan(0)
    })

    it('有 currentBackup 時應顯示進度百分比', () => {
      useAppStore.setState({ currentBackup: mockBackupJob })
      render(<BackupProgress />)
      const elements = screen.getAllByText(/50%/)
      expect(elements.length).toBeGreaterThan(0)
    })

    it('有 backupProgressDetail 時應顯示檔名', () => {
      useAppStore.setState({
        currentBackup: mockBackupJob,
        backupProgressDetail: mockProgressDetail,
      })
      render(<BackupProgress />)
      expect(screen.getAllByText('IMG_1234.HEIC').length).toBeGreaterThan(0)
    })

    it('有 backupProgressDetail 時應顯示速度', () => {
      useAppStore.setState({
        currentBackup: mockBackupJob,
        backupProgressDetail: mockProgressDetail,
      })
      render(<BackupProgress />)
      expect(screen.getAllByText(/15\.5 MB\/s/).length).toBeGreaterThan(0)
    })

    it('有 backupProgressDetail 時應顯示剩餘時間', () => {
      useAppStore.setState({
        currentBackup: mockBackupJob,
        backupProgressDetail: mockProgressDetail,
      })
      render(<BackupProgress />)
      expect(screen.getAllByText(/剩餘/).length).toBeGreaterThan(0)
    })

    it('點擊取消按鈕應呼叫 cancel-backup IPC', async () => {
      const user = userEvent.setup()
      mockInvoke.mockResolvedValue(undefined)
      useAppStore.setState({ currentBackup: mockBackupJob })
      render(<BackupProgress />)

      const cancelBtns = screen.getAllByLabelText('取消備份')
      await user.click(cancelBtns[0])

      expect(mockInvoke).toHaveBeenCalledWith('cancel-backup', 'device-001')
    })
  })

  describe('備份完成', () => {
    it('有 backupComplete 時應顯示備份完成文字', () => {
      useAppStore.setState({ backupComplete: mockCompleteDetail })
      render(<BackupProgress />)
      expect(screen.getAllByText('備份完成').length).toBeGreaterThan(0)
    })

    it('應顯示檔案數量', () => {
      useAppStore.setState({ backupComplete: mockCompleteDetail })
      render(<BackupProgress />)
      expect(screen.getAllByText('250').length).toBeGreaterThan(0)
    })

    it('應顯示總大小（GB 格式）', () => {
      useAppStore.setState({ backupComplete: mockCompleteDetail })
      render(<BackupProgress />)
      expect(screen.getAllByText('2.00 GB').length).toBeGreaterThan(0)
    })

    it('應顯示耗時', () => {
      useAppStore.setState({ backupComplete: mockCompleteDetail })
      render(<BackupProgress />)
      // 90000ms = 1分30秒
      expect(screen.getAllByText('1 分 30 秒').length).toBeGreaterThan(0)
    })

    it('backupError 優先於 backupComplete', () => {
      useAppStore.setState({
        backupComplete: mockCompleteDetail,
        backupError: mockError,
      })
      render(<BackupProgress />)
      expect(screen.getAllByText('備份失敗').length).toBeGreaterThan(0)
      expect(screen.queryByText('備份完成')).toBeNull()
    })
  })

  describe('備份失敗', () => {
    it('有 backupError 時應顯示備份失敗文字', () => {
      useAppStore.setState({ backupError: mockError })
      render(<BackupProgress />)
      expect(screen.getAllByText('備份失敗').length).toBeGreaterThan(0)
    })

    it('應顯示錯誤訊息', () => {
      useAppStore.setState({ backupError: mockError })
      render(<BackupProgress />)
      expect(screen.getAllByText(mockError.message).length).toBeGreaterThan(0)
    })

    it('應顯示重試按鈕', () => {
      useAppStore.setState({ backupError: mockError })
      render(<BackupProgress />)
      expect(screen.getAllByLabelText('重試備份').length).toBeGreaterThan(0)
    })

    it('點擊重試按鈕應呼叫 onRetry callback', async () => {
      const user = userEvent.setup()
      const onRetry = vi.fn()
      useAppStore.setState({ backupError: mockError })
      render(<BackupProgress onRetry={onRetry} />)

      const retryBtns = screen.getAllByLabelText('重試備份')
      await user.click(retryBtns[0])

      expect(onRetry).toHaveBeenCalledOnce()
    })
  })
})
