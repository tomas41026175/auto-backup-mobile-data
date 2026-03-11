import { EventEmitter } from 'events'
import { execFile as execFileCb } from 'child_process'
import { promisify } from 'util'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmdirSync,
  createReadStream,
  createWriteStream,
  statSync,
  readdirSync
} from 'fs'
import { join, basename, dirname } from 'path'
import { tmpdir } from 'os'
import { xxh64 } from '@node-rs/xxhash'
import { getMainWindow } from '../window-manager'
import type {
  BackupManager,
  BackupTask,
  BackupStatus,
  BackupRecord,
  BackupJob
} from '../../shared/types'
import type { SettingsStore } from './settings-store'
import type { BackupHistoryStore } from './backup-history-store'

const execFile = promisify(execFileCb)
const IDEVICE_BIN = '/opt/homebrew/bin'
const DCIM_SUBDIR = 'DCIM'

// ─── types ───────────────────────────────────────────────────────────────────

interface BackupContext {
  task: BackupTask
  job: BackupJob
  jobId: string
  startTime: number
  deviceName: string
  backupPath: string
  isCancelled: () => boolean
}

interface CopyResult {
  fileCount: number
  bytesTransferred: number
}

// ─── class ───────────────────────────────────────────────────────────────────

export class AfcBackupManager extends EventEmitter implements BackupManager {
  private readonly settingsStore: SettingsStore
  private readonly historyStore: BackupHistoryStore
  private readonly activeJobs: Map<string, boolean> = new Map()

  constructor(settingsStore: SettingsStore, historyStore: BackupHistoryStore) {
    super()
    this.settingsStore = settingsStore
    this.historyStore = historyStore
  }

  async startBackup(task: BackupTask): Promise<void> {
    const settings = this.settingsStore.getSettings()
    if (!settings.backupPath || !existsSync(settings.backupPath)) {
      throw new Error(`Backup path does not exist: ${settings.backupPath}`)
    }
    if (task.direction !== 'mobile-to-pc') {
      throw new Error(`Unsupported direction: ${task.direction}`)
    }

    const device = settings.pairedDevices.find((d) => d.id === task.deviceId)
    const deviceName = device?.name ?? task.deviceId
    const jobId = `backup-${task.deviceId}-${Date.now()}`
    const startTime = Date.now()
    const job = buildInitialJob(jobId, task, deviceName)

    this.activeJobs.set(task.deviceId, false)
    this.pushProgress(job)

    const ctx: BackupContext = {
      task, job, jobId, startTime, deviceName,
      backupPath: settings.backupPath,
      isCancelled: () => this.activeJobs.get(task.deviceId) === true
    }

    await this.runWithMount(ctx)
  }

  private async runWithMount(ctx: BackupContext): Promise<void> {
    const mountPoint = mkdtempSync(join(tmpdir(), 'afc-backup-'))
    let mounted = false
    let result: CopyResult = { fileCount: 0, bytesTransferred: 0 }

    try {
      await validatePairing(ctx.task.deviceId)
      this.pushProgress({ ...ctx.job, status: 'scanning' })

      await mountIfuse(ctx.task.deviceId, mountPoint)
      mounted = true

      result = await this.runTransfer(ctx, mountPoint)
      this.pushProgress({ ...ctx.job, status: 'completing', progress: 100 })
      this.saveRecord(ctx, result, 'success')
    } catch {
      const status = ctx.isCancelled() ? 'cancelled' : 'error'
      this.saveRecord(ctx, result, status)
    } finally {
      this.activeJobs.delete(ctx.task.deviceId)
      if (mounted) await unmountIfuse(mountPoint)
      safeRmdir(mountPoint)
    }
  }

  private async runTransfer(ctx: BackupContext, mountPoint: string): Promise<CopyResult> {
    const dcimPath = join(mountPoint, DCIM_SUBDIR)
    const destBase = join(ctx.backupPath, ctx.task.deviceId, 'DCIM')
    mkdirSync(destBase, { recursive: true })

    const files = collectDcimFiles(dcimPath)
    const pending = filterNewFiles(files, dcimPath, destBase)
    const total = pending.length

    this.pushProgress({ ...ctx.job, status: 'transferring', progress: 0 })

    let fileCount = 0
    let bytesTransferred = 0

    for (const rel of pending) {
      if (ctx.isCancelled()) break
      const bytes = await copyFileWithHash(join(dcimPath, rel), join(destBase, rel))
      bytesTransferred += bytes
      fileCount++
      const progress = total > 0 ? Math.round((fileCount / total) * 100) : 100
      this.pushProgress({ ...ctx.job, status: 'transferring', progress })
      this.pushIpcProgress(fileCount, total, basename(rel), 0)
    }

    return { fileCount, bytesTransferred }
  }

  private saveRecord(
    ctx: BackupContext,
    result: CopyResult,
    status: 'success' | 'error' | 'cancelled'
  ): void {
    const record = buildRecord(ctx.jobId, ctx.task, ctx.deviceName, ctx.startTime, result, status)
    this.historyStore.addRecord(record)
    this.emit('backup-complete', record)
    getMainWindow()?.webContents.send('backup-complete', record)
  }

  private pushProgress(job: BackupJob): void {
    this.emit('backup-progress', job)
    getMainWindow()?.webContents.send('backup-progress', job)
  }

  private pushIpcProgress(
    current: number, total: number, fileName: string, speed: number
  ): void {
    getMainWindow()?.webContents.send('backup-progress', { current, total, fileName, speed })
  }

  cancelBackup(deviceId: string): void {
    if (this.activeJobs.has(deviceId)) {
      this.activeJobs.set(deviceId, true)
    }
  }

  getStatus(deviceId: string): BackupStatus {
    return this.activeJobs.has(deviceId) ? 'transferring' : 'idle'
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function buildInitialJob(jobId: string, task: BackupTask, deviceName: string): BackupJob {
  return {
    id: jobId,
    deviceId: task.deviceId,
    deviceName,
    status: 'connecting',
    progress: 0,
    startedAt: new Date().toISOString(),
    direction: task.direction,
    syncTypes: task.syncTypes ?? []
  }
}

function buildRecord(
  jobId: string,
  task: BackupTask,
  deviceName: string,
  startTime: number,
  result: CopyResult,
  status: 'success' | 'error' | 'cancelled'
): BackupRecord {
  return {
    id: jobId,
    deviceId: task.deviceId,
    deviceName,
    completedAt: new Date().toISOString(),
    duration: Date.now() - startTime,
    fileCount: result.fileCount,
    bytesTransferred: result.bytesTransferred,
    status,
    syncTypes: task.syncTypes ?? [],
    direction: task.direction
  }
}

async function validatePairing(deviceId: string): Promise<void> {
  const udidFlag = deviceId !== 'default' ? ['-u', deviceId] : []
  await execFile(`${IDEVICE_BIN}/idevicepair`, [...udidFlag, 'validate'])
}

async function mountIfuse(deviceId: string, mountPoint: string): Promise<void> {
  // AFC root 掛載（com.apple.afc service）：直接存取 DCIM
  const udidFlag = deviceId !== 'default' ? ['-u', deviceId] : []
  await execFile('/opt/homebrew/bin/ifuse', [...udidFlag, mountPoint])
}

async function unmountIfuse(mountPoint: string): Promise<void> {
  await execFile('umount', [mountPoint]).catch(async () => {
    await execFile('diskutil', ['unmount', mountPoint]).catch(() => undefined)
  })
}

function safeRmdir(path: string): void {
  try {
    rmdirSync(path)
  } catch {
    // ignore if not empty or already removed
  }
}

function collectDcimFiles(dcimPath: string): string[] {
  if (!existsSync(dcimPath)) return []
  const results: string[] = []
  for (const entry of readdirSync(dcimPath, { withFileTypes: true })) {
    const full = join(dcimPath, entry.name)
    if (entry.isDirectory()) {
      for (const sub of readdirSync(full, { withFileTypes: true })) {
        if (sub.isFile()) results.push(join(entry.name, sub.name))
      }
    } else if (entry.isFile()) {
      results.push(entry.name)
    }
  }
  return results
}

function filterNewFiles(files: string[], srcBase: string, destBase: string): string[] {
  return files.filter((rel) => {
    const dest = join(destBase, rel)
    if (!existsSync(dest)) return true
    return statSync(join(srcBase, rel)).size !== statSync(dest).size
  })
}

async function copyFileWithHash(src: string, dest: string): Promise<number> {
  mkdirSync(dirname(dest), { recursive: true })
  return new Promise((resolve, reject) => {
    const rs = createReadStream(src)
    const ws = createWriteStream(dest)
    let bytesRead = 0
    const srcChunks: Buffer[] = []

    rs.on('data', (chunk: unknown) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)
      bytesRead += buf.length
      srcChunks.push(buf)
    })
    rs.pipe(ws)
    rs.on('error', reject)
    ws.on('error', reject)

    ws.on('finish', () => verifyHash(src, dest, srcChunks, bytesRead, resolve, reject))
  })
}

function verifyHash(
  src: string,
  dest: string,
  srcChunks: Buffer[],
  bytesRead: number,
  resolve: (n: number) => void,
  reject: (e: Error) => void
): void {
  const srcHash = xxh64(Buffer.concat(srcChunks)).toString(16)
  const destChunks: Buffer[] = []
  const verify = createReadStream(dest)
  verify.on('data', (chunk: unknown) => {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)
    destChunks.push(buf)
  })
  verify.on('end', () => {
    const destHash = xxh64(Buffer.concat(destChunks)).toString(16)
    if (srcHash !== destHash) {
      reject(new Error(`Hash mismatch for ${src}: src=${srcHash} dest=${destHash}`))
    } else {
      resolve(bytesRead)
    }
  })
  verify.on('error', reject)
}
