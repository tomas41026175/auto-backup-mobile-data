import { EventEmitter } from 'events'
import { existsSync } from 'fs'
import type { BackupJob, BackupRecord, BackupStatus, BackupTask } from '../../shared/types'
import type { SettingsStore } from './settings-store'
import type { BackupHistoryStore } from './backup-history-store'
import type { BackupManager } from '../../shared/types'

export class BackupPathNotFoundError extends Error {
  constructor(path: string) {
    super(`Backup path does not exist: ${path}`)
    this.name = 'BackupPathNotFoundError'
  }
}

export class UnsupportedDirectionError extends Error {
  constructor(direction: string) {
    super(`Unsupported sync direction: ${direction}`)
    this.name = 'UnsupportedDirectionError'
  }
}

interface MockBackupState {
  job: BackupJob
  timers: ReturnType<typeof setTimeout>[]
  cancelled: boolean
}

export class MockBackupManager extends EventEmitter implements BackupManager {
  private readonly settingsStore: SettingsStore
  private readonly historyStore: BackupHistoryStore
  private readonly activeBackups: Map<string, MockBackupState> = new Map()

  constructor(settingsStore: SettingsStore, historyStore: BackupHistoryStore) {
    super()
    this.settingsStore = settingsStore
    this.historyStore = historyStore
  }

  async startBackup(task: BackupTask): Promise<void> {
    const settings = this.settingsStore.getSettings()

    // 驗證 backupPath 存在
    if (!settings.backupPath || !existsSync(settings.backupPath)) {
      throw new BackupPathNotFoundError(settings.backupPath)
    }

    // 只支援 mobile-to-pc
    if (task.direction !== 'mobile-to-pc') {
      throw new UnsupportedDirectionError(task.direction)
    }

    const device = settings.pairedDevices.find((d) => d.id === task.deviceId)
    const deviceName = device?.name ?? task.deviceId

    const jobId = `backup-${task.deviceId}-${Date.now()}`
    const startedAt = new Date().toISOString()

    const job: BackupJob = {
      id: jobId,
      deviceId: task.deviceId,
      deviceName,
      status: 'transferring' as BackupStatus,
      progress: 0,
      startedAt,
      direction: task.direction,
      syncTypes: task.syncTypes ?? device?.syncTypes ?? []
    }

    const state: MockBackupState = {
      job,
      timers: [],
      cancelled: false
    }
    this.activeBackups.set(task.deviceId, state)

    // 模擬進度：0% → 25% → 50% → 75% → 100%（每 500ms）
    const progressSteps = [0, 25, 50, 75, 100]
    const startTime = Date.now()

    progressSteps.forEach((progress, index) => {
      const timer = setTimeout(() => {
        if (state.cancelled) return

        const currentJob: BackupJob = { ...state.job, progress }
        state.job = currentJob
        this.emit('backup-progress', currentJob)

        if (progress === 100) {
          const duration = Date.now() - startTime
          const completedJob: BackupJob = { ...currentJob, status: 'done' }
          state.job = completedJob

          const record: BackupRecord = {
            id: jobId,
            deviceId: task.deviceId,
            deviceName,
            completedAt: new Date().toISOString(),
            duration,
            fileCount: Math.floor(Math.random() * 100) + 1,
            bytesTransferred: Math.floor(Math.random() * 1024 * 1024 * 500),
            status: 'success',
            syncTypes: job.syncTypes,
            direction: task.direction
          }

          this.historyStore.addRecord(record)
          this.emit('backup-complete', record)
          this.activeBackups.delete(task.deviceId)
        }
      }, index * 500)

      state.timers.push(timer)
    })
  }

  cancelBackup(deviceId: string): void {
    const state = this.activeBackups.get(deviceId)
    if (!state) return

    state.cancelled = true
    state.timers.forEach((t) => clearTimeout(t))

    const cancelledJob: BackupJob = { ...state.job, status: 'cancelled' }
    this.emit('backup-progress', cancelledJob)

    const record: BackupRecord = {
      id: state.job.id,
      deviceId,
      deviceName: state.job.deviceName,
      completedAt: new Date().toISOString(),
      duration: Date.now() - new Date(state.job.startedAt).getTime(),
      fileCount: 0,
      bytesTransferred: 0,
      status: 'cancelled',
      syncTypes: state.job.syncTypes,
      direction: state.job.direction
    }

    this.historyStore.addRecord(record)
    this.activeBackups.delete(deviceId)
  }

  getStatus(deviceId: string): BackupStatus {
    const state = this.activeBackups.get(deviceId)
    return state ? state.job.status : 'idle'
  }
}
