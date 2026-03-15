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
import { resolveBinaryPaths } from '../utils/platform-utils'

const execFile = promisify(execFileCb)
const DCIM_SUBDIR = 'DCIM'

// ─── strategy interface ───────────────────────────────────────────────────────

export interface IMountStrategy {
  mount(deviceId: string): Promise<string>
  unmount(handle: string): Promise<void>
  listDcimFiles(handle: string): Promise<string[]>
  isNewFile(rel: string, handle: string, destPath: string): boolean
  transferFile(rel: string, handle: string, destPath: string): Promise<number>
}

// ─── macOS strategy ───────────────────────────────────────────────────────────

export class MacOSMountStrategy implements IMountStrategy {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(_idevicepairPath: string) {
    // idevicepairPath reserved for future per-strategy pairing validation
  }

  async mount(deviceId: string): Promise<string> {
    const mountPoint = mkdtempSync(join(tmpdir(), 'afc-backup-'))
    const udidFlag = deviceId !== 'default' ? ['-u', deviceId] : []
    await execFile('/opt/homebrew/bin/ifuse', [...udidFlag, mountPoint])
    return mountPoint
  }

  async unmount(mountPoint: string): Promise<void> {
    await execFile('umount', [mountPoint]).catch(async () => {
      await execFile('diskutil', ['unmount', mountPoint]).catch(() => undefined)
    })
    safeRmdir(mountPoint)
  }

  listDcimFiles(mountPoint: string): Promise<string[]> {
    const dcimPath = join(mountPoint, DCIM_SUBDIR)
    return Promise.resolve(collectDcimFiles(dcimPath))
  }

  isNewFile(rel: string, mountPoint: string, destPath: string): boolean {
    if (!existsSync(destPath)) return true
    return statSync(join(mountPoint, DCIM_SUBDIR, rel)).size !== statSync(destPath).size
  }

  async transferFile(rel: string, mountPoint: string, destPath: string): Promise<number> {
    return copyFileWithHash(join(mountPoint, DCIM_SUBDIR, rel), destPath)
  }
}

// ─── Windows AFC strategy ─────────────────────────────────────────────────────

export class WindowsAfcStrategy implements IMountStrategy {
  private readonly afcclientPath: string
  private readonly listDcimScriptPath: string

  constructor(afcclientPath: string, listDcimScriptPath: string) {
    this.afcclientPath = afcclientPath
    this.listDcimScriptPath = listDcimScriptPath
  }

  async mount(deviceId: string): Promise<string> {
    // No FUSE mount needed — return deviceId as the handle
    return deviceId
  }

  async unmount(_handle: string): Promise<void> {
    // No-op: afcclient is stateless
  }

  async listDcimFiles(handle: string): Promise<string[]> {
    // Use pymobiledevice3 Python script — afcclient ls only lists directories, not files
    try {
      console.log('[WindowsAfcStrategy] listDcimFiles script:', this.listDcimScriptPath, 'udid:', handle)
      const { stdout, stderr } = await execFile('python', [this.listDcimScriptPath, handle])
      if (stderr) console.warn('[WindowsAfcStrategy] python stderr:', stderr)
      console.log('[WindowsAfcStrategy] stdout length:', stdout.length)
      const files = JSON.parse(stdout) as string[]
      console.log('[WindowsAfcStrategy] file count:', files.length)
      return files
    } catch (err) {
      console.error('[WindowsAfcStrategy] listDcimFiles failed:', err)
      return []
    }
  }

  isNewFile(_rel: string, _handle: string, destPath: string): boolean {
    return !existsSync(destPath)
  }

  async transferFile(rel: string, handle: string, destPath: string): Promise<number> {
    const deviceId = handle
    const destDir = dirname(destPath)
    mkdirSync(destDir, { recursive: true })
    await execFile(this.afcclientPath, [
      '-u', deviceId, '-n', 'get', `/DCIM/${rel}`, destDir
    ])
    return statSync(destPath).size
  }
}

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
  private readonly strategy: IMountStrategy

  constructor(
    settingsStore: SettingsStore,
    historyStore: BackupHistoryStore,
    strategy?: IMountStrategy
  ) {
    super()
    this.settingsStore = settingsStore
    this.historyStore = historyStore
    const paths = resolveBinaryPaths()
    if (!strategy) {
      if (process.platform === 'win32') {
        const { app } = require('electron') as typeof import('electron')
        const resourcesBase = app.isPackaged
          ? process.resourcesPath
          : join(app.getAppPath(), 'resources')
        const scriptPath = join(resourcesBase, 'list_dcim.py')
        this.strategy = new WindowsAfcStrategy(paths.afcclient, scriptPath)
      } else {
        this.strategy = new MacOSMountStrategy(paths.idevicepair)
      }
    } else {
      this.strategy = strategy
    }
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
    let handle: string | null = null
    let result: CopyResult = { fileCount: 0, bytesTransferred: 0 }

    try {
      await validatePairing(ctx.task.deviceId)
      this.pushProgress({ ...ctx.job, status: 'scanning' })

      handle = await this.strategy.mount(ctx.task.deviceId)

      result = await this.runTransfer(ctx, handle)
      this.pushProgress({ ...ctx.job, status: 'completing', progress: 100 })
      this.saveRecord(ctx, result, 'success')
    } catch (err) {
      const status = ctx.isCancelled() ? 'cancelled' : 'error'
      console.error('[AfcBackupManager] backup failed:', err)
      if (status === 'error') {
        const message = err instanceof Error ? err.message : String(err)
        getMainWindow()?.webContents.send('backup-error', { message })
      }
      this.saveRecord(ctx, result, status)
    } finally {
      this.activeJobs.delete(ctx.task.deviceId)
      if (handle !== null) await this.strategy.unmount(handle)
    }
  }

  private async runTransfer(ctx: BackupContext, handle: string): Promise<CopyResult> {
    const destBase = join(ctx.backupPath, ctx.task.deviceId, 'DCIM')
    mkdirSync(destBase, { recursive: true })

    const files = await this.strategy.listDcimFiles(handle)
    const pending = files.filter((rel) => {
      const destPath = join(destBase, rel)
      return this.strategy.isNewFile(rel, handle, destPath)
    })
    const total = pending.length

    if (total === 0) {
      // All files already backed up — nothing to transfer
      this.pushProgress({ ...ctx.job, status: 'completing', progress: 100 })
      return { fileCount: 0, bytesTransferred: 0 }
    }

    this.pushProgress({ ...ctx.job, status: 'transferring', progress: 0 })

    let fileCount = 0
    let bytesTransferred = 0

    for (const rel of pending) {
      if (ctx.isCancelled()) break
      const destPath = join(destBase, rel)
      const bytes = await this.strategy.transferFile(rel, handle, destPath)
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
  }

  private pushProgress(job: BackupJob): void {
    this.emit('backup-progress', job)
  }

  private pushIpcProgress(
    current: number, total: number, fileName: string, speed: number
  ): void {
    getMainWindow()?.webContents.send('backup-progress-detail', { current, total, fileName, speed })
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
    duration: Math.round((Date.now() - startTime) / 1000),
    fileCount: result.fileCount,
    bytesTransferred: result.bytesTransferred,
    status,
    syncTypes: task.syncTypes ?? [],
    direction: task.direction
  }
}

async function validatePairing(deviceId: string): Promise<void> {
  // On Windows, idevicepair has no -n flag for WiFi; skip validation —
  // listDcimFiles will fail naturally if the device is unreachable.
  if (process.platform === 'win32') return
  const udidFlag = deviceId !== 'default' ? ['-u', deviceId] : []
  const paths = resolveBinaryPaths()
  await execFile(paths.idevicepair, [...udidFlag, 'validate'])
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
