import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'

// ─── mock 宣告必須在 import 前 ────────────────────────────────────────────────

vi.mock('../../../src/main/utils/platform-utils', () => ({
  resolveBinaryPaths: vi.fn().mockReturnValue({
    idevicepair: '/opt/homebrew/bin/idevicepair',
    ideviceinfo: '/opt/homebrew/bin/ideviceinfo',
    idevice_id: '/opt/homebrew/bin/idevice_id',
    afcclient: '/opt/homebrew/bin/afcclient',
  }),
  getTempDir: vi.fn().mockReturnValue('/tmp'),
}))

// 強制 darwin，使 constructor 選用 MacOSMountStrategy（測試以 macOS 策略驗證）
beforeAll(() => {
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
})
afterAll(() => {
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
})

// execFile 是 callback-style，mock 需要呼叫最後一個參數（callback）
vi.mock('child_process', () => ({
  execFile: vi.fn()
}))

vi.mock('@node-rs/xxhash', () => ({
  // xxh64 實際返回 bigint，所以用 BigInt mock
  xxh64: vi.fn().mockReturnValue(BigInt('0xaabbccdd'))
}))

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true),
    mkdtempSync: vi.fn().mockReturnValue('/tmp/afc-backup-test'),
    rmdirSync: vi.fn(),
    mkdirSync: vi.fn(),
    statSync: vi.fn().mockReturnValue({ size: 100 }),
    readdirSync: vi.fn().mockReturnValue([]),
    createReadStream: vi.fn(),
    createWriteStream: vi.fn()
  }
})

vi.mock('../../../src/main/window-manager', () => ({
  getMainWindow: vi.fn().mockReturnValue(null)
}))

// ─── import after mocks ───────────────────────────────────────────────────────

import { execFile } from 'child_process'
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  createReadStream,
  createWriteStream,
  mkdirSync
} from 'fs'
import { xxh64 } from '@node-rs/xxhash'
import { EventEmitter } from 'events'
import { AfcBackupManager } from '../../src/main/services/afc-backup-manager'
import type { BackupJob, BackupRecord } from '../../src/shared/types'

// ─── mock 型別 ────────────────────────────────────────────────────────────────

// execFile 是 callback-style：(cmd, args, callback) => void
// promisify 後會呼叫 callback，所以 mock 需要呼叫 callback
type ExecFileCallback = (err: Error | null, result: { stdout: string; stderr: string }) => void
const mockExecFileFn = vi.mocked(execFile) as unknown as ReturnType<typeof vi.fn>

function mockExecFileSuccess(): void {
  mockExecFileFn.mockImplementation(
    (_cmd: string, _args: string[], callback: ExecFileCallback) => {
      callback(null, { stdout: '', stderr: '' })
    }
  )
}

function mockExecFileOnce(err: Error | null, result = { stdout: '', stderr: '' }): void {
  mockExecFileFn.mockImplementationOnce(
    (_cmd: string, _args: string[], callback: ExecFileCallback) => {
      callback(err, result)
    }
  )
}

const mockXxh64 = vi.mocked(xxh64)
const mockExistsSync = vi.mocked(existsSync)
const mockMkdtempSync = vi.mocked(mkdtempSync)
const mockReaddirSync = vi.mocked(readdirSync)
const mockCreateReadStream = vi.mocked(createReadStream)
const mockCreateWriteStream = vi.mocked(createWriteStream)
const mockMkdirSync = vi.mocked(mkdirSync)

// ─── helpers ──────────────────────────────────────────────────────────────────

function createMockSettingsStore(backupPath = '/tmp/backup') {
  return {
    getSettings: vi.fn().mockReturnValue({
      backupPath,
      pairedDevices: [
        {
          id: 'device-001',
          name: 'iPhone Test',
          ip: '192.168.1.1',
          addedAt: new Date().toISOString(),
          syncDirection: 'mobile-to-pc' as const,
          syncTypes: ['photos' as const]
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
    addRecord: vi.fn((r: BackupRecord) => records.push(r)),
    getHistory: vi.fn(() => [...records]),
    clearHistory: vi.fn(() => records.splice(0))
  }
}

/** 建立假的 ReadStream EventEmitter，延遲 n ms 後 emit data/end */
function makeFakeReadStream(chunks: Buffer[] = [], delayMs = 10) {
  const ee = new EventEmitter() as ReturnType<typeof createReadStream>
  ;(ee as unknown as { pipe: (ws: unknown) => void }).pipe = vi.fn()
  setTimeout(() => {
    for (const chunk of chunks) ee.emit('data', chunk)
    ee.emit('end')
  }, delayMs)
  return ee
}

/**
 * 建立「等到 'end' listener 被加上後才 emit」的 ReadStream
 * 用於 verify stream：避免 setTimeout 在監聽器加入前就過期
 */
function makeLazyReadStream(chunks: Buffer[] = []) {
  const ee = new EventEmitter() as ReturnType<typeof createReadStream>
  ;(ee as unknown as { pipe: (ws: unknown) => void }).pipe = vi.fn()
  ee.on('newListener', (event: string) => {
    if (event === 'end') {
      setImmediate(() => {
        for (const chunk of chunks) ee.emit('data', chunk)
        ee.emit('end')
      })
    }
  })
  return ee
}

/** 建立假的 WriteStream EventEmitter，延遲後 emit finish（在 ReadStream end 之後）*/
function makeFakeWriteStream(delayMs = 20) {
  const ee = new EventEmitter() as ReturnType<typeof createWriteStream>
  setTimeout(() => ee.emit('finish'), delayMs)
  return ee
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('AfcBackupManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 重設 xxh64 mock（clearAllMocks 後需要重新設定 mockReturnValue）
    mockXxh64.mockReturnValue(BigInt('0xaabbccdd') as bigint)
    mockExistsSync.mockReturnValue(true)
    mockMkdtempSync.mockReturnValue('/tmp/afc-backup-test')
    mockReaddirSync.mockReturnValue([])
    mockMkdirSync.mockReturnValue(undefined)
  })

  // ── 輸入驗證 ─────────────────────────────────────────────────────────────

  describe('startBackup - 輸入驗證', () => {
    it('backupPath 不存在時應拋出 Error', async () => {
      mockExistsSync.mockReturnValue(false)
      const store = createMockSettingsStore('/nonexistent')
      const history = createMockHistoryStore()
      const mgr = new AfcBackupManager(store, history)

      await expect(
        mgr.startBackup({ deviceId: 'device-001', direction: 'mobile-to-pc' })
      ).rejects.toThrow('Backup path does not exist')
    })

    it('direction 不是 mobile-to-pc 時應拋出 Error', async () => {
      const store = createMockSettingsStore()
      const history = createMockHistoryStore()
      const mgr = new AfcBackupManager(store, history)

      await expect(
        mgr.startBackup({ deviceId: 'device-001', direction: 'pc-to-mobile' })
      ).rejects.toThrow('Unsupported direction')
    })
  })

  // ── idevicepair validate ──────────────────────────────────────────────────

  describe('startBackup - idevicepair validate', () => {
    it('應呼叫 idevicepair validate 並帶入 -u deviceId', async () => {
      // idevicepair validate 成功，ifuse 失敗 → 流程提早結束
      mockExecFileOnce(null) // idevicepair validate
      mockExecFileOnce(new Error('ifuse failed')) // ifuse mount

      const store = createMockSettingsStore()
      const history = createMockHistoryStore()
      const mgr = new AfcBackupManager(store, history)

      await mgr.startBackup({ deviceId: 'device-001', direction: 'mobile-to-pc' })

      const pairCall = mockExecFileFn.mock.calls[0] as [string, string[], ExecFileCallback]
      expect(pairCall[0]).toContain('idevicepair')
      expect(pairCall[1]).toContain('validate')
      expect(pairCall[1]).toContain('-u')
      expect(pairCall[1]).toContain('device-001')
    })
  })

  // ── 進度 emit ────────────────────────────────────────────────────────────

  describe('startBackup - 進度 emit', () => {
    it('應依序 emit connecting → scanning', async () => {
      // idevicepair 成功，ifuse 失敗
      mockExecFileOnce(null)
      mockExecFileOnce(new Error('mount fail'))

      const store = createMockSettingsStore()
      const history = createMockHistoryStore()
      const mgr = new AfcBackupManager(store, history)

      const statuses: string[] = []
      mgr.on('backup-progress', (job: BackupJob) => statuses.push(job.status))

      await mgr.startBackup({ deviceId: 'device-001', direction: 'mobile-to-pc' })

      expect(statuses).toContain('connecting')
      expect(statuses).toContain('scanning')
    })

    it('無需備份的檔案時進度應到達 completing', async () => {
      // 所有 execFile 呼叫成功（idevicepair + ifuse + umount/diskutil）
      mockExecFileSuccess()
      mockReaddirSync.mockReturnValue([])

      const store = createMockSettingsStore()
      const history = createMockHistoryStore()
      const mgr = new AfcBackupManager(store, history)

      const statuses: string[] = []
      mgr.on('backup-progress', (job: BackupJob) => statuses.push(job.status))

      await mgr.startBackup({ deviceId: 'device-001', direction: 'mobile-to-pc' })

      expect(statuses).toContain('completing')
      expect(history.addRecord).toHaveBeenCalledOnce()
    })
  })

  // ── 備份完成寫入 history ──────────────────────────────────────────────────

  describe('startBackup - 備份完成', () => {
    it('成功備份後應寫入 success 記錄到 historyStore', async () => {
      mockExecFileSuccess()
      mockReaddirSync.mockReturnValue([])

      const store = createMockSettingsStore()
      const history = createMockHistoryStore()
      const mgr = new AfcBackupManager(store, history)

      await mgr.startBackup({ deviceId: 'device-001', direction: 'mobile-to-pc' })

      expect(history.addRecord).toHaveBeenCalledOnce()
      const record = history.addRecord.mock.calls[0][0] as BackupRecord
      expect(record.status).toBe('success')
      expect(record.deviceId).toBe('device-001')
    })

    it('ifuse 掛載失敗時應寫入 error 記錄', async () => {
      mockExecFileOnce(null)                              // idevicepair validate
      mockExecFileOnce(new Error('mount failed'))         // ifuse mount

      const store = createMockSettingsStore()
      const history = createMockHistoryStore()
      const mgr = new AfcBackupManager(store, history)

      await mgr.startBackup({ deviceId: 'device-001', direction: 'mobile-to-pc' })

      expect(history.addRecord).toHaveBeenCalledOnce()
      const record = history.addRecord.mock.calls[0][0] as BackupRecord
      expect(record.status).toBe('error')
    })

    it('idevicepair validate 失敗時應寫入 error 記錄', async () => {
      mockExecFileOnce(new Error('device not paired'))   // idevicepair validate

      const store = createMockSettingsStore()
      const history = createMockHistoryStore()
      const mgr = new AfcBackupManager(store, history)

      await mgr.startBackup({ deviceId: 'device-001', direction: 'mobile-to-pc' })

      expect(history.addRecord).toHaveBeenCalledOnce()
      const record = history.addRecord.mock.calls[0][0] as BackupRecord
      expect(record.status).toBe('error')
    })
  })

  // ── 檔案複製與 xxHash64 驗證 ──────────────────────────────────────────────

  describe('startBackup - 檔案複製與 xxHash64 驗證', () => {
    it('複製一個檔案時應呼叫 createReadStream 和 createWriteStream', async () => {
      mockExecFileSuccess()

      // DCIM 包含一個子目錄，子目錄包含一個檔案
      mockExistsSync.mockImplementation((p: unknown) => {
        if (typeof p === 'string' && p.includes('IMG_001')) return false // dest 不存在 → 觸發複製
        return true
      })
      mockReaddirSync.mockImplementation((dirPath: unknown) => {
        if (typeof dirPath === 'string' && dirPath.endsWith('DCIM')) {
          return [{ name: 'APPLE', isDirectory: () => true, isFile: () => false }] as ReturnType<typeof readdirSync>
        }
        if (typeof dirPath === 'string' && dirPath.includes('APPLE')) {
          return [{ name: 'IMG_001.JPG', isDirectory: () => false, isFile: () => true }] as ReturnType<typeof readdirSync>
        }
        return []
      })

      const fakeContent = Buffer.from('fake image data')
      const fakeReadStream = makeFakeReadStream([fakeContent])
      const fakeWriteStream = makeFakeWriteStream()
      const fakeVerifyStream = makeLazyReadStream([fakeContent])

      mockCreateReadStream
        .mockReturnValueOnce(fakeReadStream)
        .mockReturnValueOnce(fakeVerifyStream)
      mockCreateWriteStream.mockReturnValueOnce(fakeWriteStream)

      const store = createMockSettingsStore()
      const history = createMockHistoryStore()
      const mgr = new AfcBackupManager(store, history)

      await mgr.startBackup({ deviceId: 'device-001', direction: 'mobile-to-pc' })

      expect(mockCreateReadStream).toHaveBeenCalled()
      expect(mockCreateWriteStream).toHaveBeenCalled()
      const record = history.addRecord.mock.calls[0][0] as BackupRecord
      expect(record.fileCount).toBe(1)
    })
  })

  // ── cancelBackup ──────────────────────────────────────────────────────────

  describe('cancelBackup', () => {
    it('取消不存在的 deviceId 不應拋出錯誤', () => {
      const store = createMockSettingsStore()
      const history = createMockHistoryStore()
      const mgr = new AfcBackupManager(store, history)

      expect(() => mgr.cancelBackup('non-existent')).not.toThrow()
    })
  })

  // ── getStatus ─────────────────────────────────────────────────────────────

  describe('getStatus', () => {
    it('無備份中的裝置應回傳 idle', () => {
      const store = createMockSettingsStore()
      const history = createMockHistoryStore()
      const mgr = new AfcBackupManager(store, history)

      expect(mgr.getStatus('device-001')).toBe('idle')
    })
  })
})
