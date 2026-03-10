import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// mock fs 必須在 import 前設定
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true)
}))

import { existsSync } from 'fs'
import { MockBackupManager, BackupPathNotFoundError, UnsupportedDirectionError } from '../../src/main/services/backup-manager'
import type { BackupJob, BackupRecord } from '../../src/shared/types'

const mockExistsSync = vi.mocked(existsSync)

// 讓 microtask queue 清空的輔助函式
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function createMockSettingsStore(backupPath: string = '/tmp/backup') {
  return {
    getSettings: vi.fn().mockReturnValue({
      backupPath,
      pairedDevices: [
        {
          id: 'device-001',
          name: 'iPhone 14',
          ip: '192.168.1.100',
          addedAt: new Date().toISOString(),
          syncDirection: 'mobile-to-pc' as const,
          syncTypes: ['photos' as const, 'videos' as const]
        }
      ],
      autoStart: false
    }),
    saveSettings: vi.fn(),
    addPairedDevice: vi.fn(),
    removePairedDevice: vi.fn(),
    updateDeviceConfig: vi.fn()
  }
}

function createMockHistoryStore() {
  const records: BackupRecord[] = []
  return {
    addRecord: vi.fn((record: BackupRecord) => records.push(record)),
    getHistory: vi.fn(() => [...records].reverse()),
    clearHistory: vi.fn(() => records.splice(0))
  }
}

describe('MockBackupManager', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockExistsSync.mockReturnValue(true)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('startBackup - 路徑驗證', () => {
    it('backupPath 不存在時應拋出 BackupPathNotFoundError', async () => {
      mockExistsSync.mockReturnValue(false)

      const settingsStore = createMockSettingsStore('/nonexistent/path')
      const historyStore = createMockHistoryStore()
      const manager = new MockBackupManager(settingsStore, historyStore)

      await expect(
        manager.startBackup({
          deviceId: 'device-001',
          direction: 'mobile-to-pc'
        })
      ).rejects.toThrow(BackupPathNotFoundError)
    })

    it('backupPath 為空字串時應拋出 BackupPathNotFoundError', async () => {
      mockExistsSync.mockReturnValue(false)

      const settingsStore = createMockSettingsStore('')
      const historyStore = createMockHistoryStore()
      const manager = new MockBackupManager(settingsStore, historyStore)

      await expect(
        manager.startBackup({
          deviceId: 'device-001',
          direction: 'mobile-to-pc'
        })
      ).rejects.toThrow(BackupPathNotFoundError)
    })
  })

  describe('startBackup - 方向驗證', () => {
    it('direction 不是 mobile-to-pc 時應拋出 UnsupportedDirectionError', async () => {
      mockExistsSync.mockReturnValue(true)

      const settingsStore = createMockSettingsStore('/tmp/backup')
      const historyStore = createMockHistoryStore()
      const manager = new MockBackupManager(settingsStore, historyStore)

      await expect(
        manager.startBackup({
          deviceId: 'device-001',
          direction: 'pc-to-mobile'
        })
      ).rejects.toThrow(UnsupportedDirectionError)
    })

    it('direction 為 bidirectional 時應拋出 UnsupportedDirectionError', async () => {
      mockExistsSync.mockReturnValue(true)

      const settingsStore = createMockSettingsStore('/tmp/backup')
      const historyStore = createMockHistoryStore()
      const manager = new MockBackupManager(settingsStore, historyStore)

      await expect(
        manager.startBackup({
          deviceId: 'device-001',
          direction: 'bidirectional'
        })
      ).rejects.toThrow(UnsupportedDirectionError)
    })
  })

  describe('startBackup - 進度模擬', () => {
    it('應依序發送 0→25→50→75→100% 進度', async () => {
      mockExistsSync.mockReturnValue(true)

      const settingsStore = createMockSettingsStore('/tmp/backup')
      const historyStore = createMockHistoryStore()
      const manager = new MockBackupManager(settingsStore, historyStore)

      const progressEvents: BackupJob[] = []
      manager.on('backup-progress', (job) => progressEvents.push({ ...job }))

      // 觸發備份（不 await，讓 async 繼續執行）
      let backupResolved = false
      manager.startBackup({
        deviceId: 'device-001',
        direction: 'mobile-to-pc'
      }).then(() => { backupResolved = true }).catch(() => {})

      // 等待 async 內部的 await（existsSync 是同步，但 async function 本身需要 microtask）
      await flushMicrotasks()

      // 推進所有計時器（5 個 step × 500ms = 2500ms）
      vi.advanceTimersByTime(2_500)
      await flushMicrotasks()

      expect(backupResolved).toBe(true)

      const progressValues = progressEvents.map((j) => j.progress)
      expect(progressValues).toContain(0)
      expect(progressValues).toContain(25)
      expect(progressValues).toContain(50)
      expect(progressValues).toContain(75)
      expect(progressValues).toContain(100)
    })

    it('完成後應發送 backup-complete 並寫入 history', async () => {
      mockExistsSync.mockReturnValue(true)

      const settingsStore = createMockSettingsStore('/tmp/backup')
      const historyStore = createMockHistoryStore()
      const manager = new MockBackupManager(settingsStore, historyStore)

      const completeEvents: BackupRecord[] = []
      manager.on('backup-complete', (record) => completeEvents.push({ ...record }))

      manager.startBackup({
        deviceId: 'device-001',
        direction: 'mobile-to-pc'
      }).catch(() => {})

      await flushMicrotasks()
      vi.advanceTimersByTime(2_500)
      await flushMicrotasks()

      expect(completeEvents).toHaveLength(1)
      expect(completeEvents[0].deviceId).toBe('device-001')
      expect(completeEvents[0].status).toBe('success')
      expect(historyStore.addRecord).toHaveBeenCalledOnce()
    })
  })

  describe('cancelBackup', () => {
    it('應中斷進度模擬並標記為 cancelled', async () => {
      mockExistsSync.mockReturnValue(true)

      const settingsStore = createMockSettingsStore('/tmp/backup')
      const historyStore = createMockHistoryStore()
      const manager = new MockBackupManager(settingsStore, historyStore)

      const progressEvents: BackupJob[] = []
      manager.on('backup-progress', (job) => progressEvents.push({ ...job }))

      manager.startBackup({
        deviceId: 'device-001',
        direction: 'mobile-to-pc'
      }).catch(() => {})

      await flushMicrotasks()

      // 推進到 0% 完成（第 0 個 step）
      vi.advanceTimersByTime(100)

      // 取消
      manager.cancelBackup('device-001')

      // 繼續推進，不應有更多進度
      vi.advanceTimersByTime(2_500)
      await flushMicrotasks()

      const lastEvent = progressEvents[progressEvents.length - 1]
      expect(lastEvent?.status).toBe('cancelled')
      expect(historyStore.addRecord).toHaveBeenCalledOnce()

      const record = historyStore.addRecord.mock.calls[0][0] as BackupRecord
      expect(record.status).toBe('cancelled')
    })

    it('取消不存在的 deviceId 不應拋出錯誤', () => {
      const settingsStore = createMockSettingsStore('/tmp/backup')
      const historyStore = createMockHistoryStore()
      const manager = new MockBackupManager(settingsStore, historyStore)

      expect(() => manager.cancelBackup('non-existent-device')).not.toThrow()
    })
  })

  describe('getStatus', () => {
    it('無備份中的裝置應回傳 idle', () => {
      const settingsStore = createMockSettingsStore('/tmp/backup')
      const historyStore = createMockHistoryStore()
      const manager = new MockBackupManager(settingsStore, historyStore)

      expect(manager.getStatus('device-001')).toBe('idle')
    })

    it('備份啟動後裝置應回傳 transferring', async () => {
      mockExistsSync.mockReturnValue(true)

      const settingsStore = createMockSettingsStore('/tmp/backup')
      const historyStore = createMockHistoryStore()
      const manager = new MockBackupManager(settingsStore, historyStore)

      manager.startBackup({
        deviceId: 'device-001',
        direction: 'mobile-to-pc'
      }).catch(() => {})

      // 等待 async 部分（驗證完成，設定 activeBackups）
      await flushMicrotasks()

      expect(manager.getStatus('device-001')).toBe('transferring')

      vi.advanceTimersByTime(2_500)
    })
  })
})
