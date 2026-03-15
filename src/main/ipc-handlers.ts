import { ipcMain, app, shell, type App as ElectronApp } from 'electron'
import * as fs from 'fs'
import * as net from 'net'
import * as path from 'path'
import { execFile as execFileCb } from 'child_process'
import { promisify } from 'util'

const execFile = promisify(execFileCb)
import type { Device, PairedDevice, Settings } from '../shared/types'
import type { SettingsStore } from './services/settings-store'
import type { BackupHistoryStore } from './services/backup-history-store'
import type { DeviceScanner } from './services/device-scanner'
import type { BackupManager } from '../shared/types'
import type { ICloudSyncManager } from './services/icloud-sync-manager'

const SCAN_TIMEOUT_MS = 10_000
const TCP_CONNECT_TIMEOUT_MS = 3_000
const TCP_PING_PORT = 62078

interface SetupIpcHandlersOptions {
  settingsStore: SettingsStore
  backupHistoryStore: BackupHistoryStore
  deviceScanner: DeviceScanner
  backupManager: BackupManager
  icloudSyncManager: ICloudSyncManager
}

export function setupIpcHandlers({
  settingsStore,
  backupHistoryStore,
  deviceScanner,
  backupManager,
  icloudSyncManager
}: SetupIpcHandlersOptions): void {
  // get-current-state
  ipcMain.handle('get-current-state', async () => {
    // On Windows, scan via libimobiledevice for initial state
    const devices: Device[] = process.platform === 'win32'
      ? await scanDevicesWindows(app)
      : []
    return {
      devices,
      currentBackup: null,
      status: 'idle' as const,
      mdnsAvailable: deviceScanner.mdnsAvailable
    }
  })

  // get-settings
  ipcMain.handle('get-settings', () => {
    return settingsStore.getSettings()
  })

  // save-settings
  ipcMain.handle('save-settings', (_event, settings: Partial<Settings>) => {
    settingsStore.saveSettings(settings)
  })

  // validate-path
  ipcMain.handle('validate-path', (_event, path: string) => {
    return fs.existsSync(path)
  })

  // scan-devices
  ipcMain.handle('scan-devices', async () => {
    if (process.platform === 'win32') {
      return scanDevicesWindows(app)
    }
    const timeoutPromise = new Promise<Device[]>((resolve) =>
      setTimeout(() => resolve([]), SCAN_TIMEOUT_MS)
    )
    const scanPromise = deviceScanner.scan()
    return Promise.race([scanPromise, timeoutPromise])
  })

  // pair-device
  ipcMain.handle('pair-device', (_event, device: Device): PairedDevice => {
    return settingsStore.addPairedDevice({
      id: device.id,
      name: device.name,
      ip: device.ip
    })
  })

  // unpair-device
  ipcMain.handle('unpair-device', (_event, deviceId: string) => {
    settingsStore.removePairedDevice(deviceId)
  })

  // add-device-manual：TCP 探測後配對
  ipcMain.handle('add-device-manual', async (_event, args: { name: string; ip: string }) => {
    const reachable = await tcpProbe(args.ip, TCP_PING_PORT, TCP_CONNECT_TIMEOUT_MS)
    if (!reachable) {
      throw new Error(`Device at ${args.ip} is not reachable`)
    }
    const deviceId = `manual-${args.ip}`
    return settingsStore.addPairedDevice({
      id: deviceId,
      name: args.name,
      ip: args.ip
    })
  })

  // update-device-config
  ipcMain.handle(
    'update-device-config',
    (_event, args: { deviceId: string; config: Partial<PairedDevice> }): PairedDevice => {
      return settingsStore.updateDeviceConfig(args.deviceId, args.config)
    }
  )

  // start-backup
  ipcMain.handle('start-backup', async (_event, task: Parameters<typeof backupManager.startBackup>[0]) => {
    const paired = settingsStore.getSettings().pairedDevices
    if (!paired.some((d) => d.id === task.deviceId)) {
      throw new Error(`Unknown deviceId: ${task.deviceId}`)
    }
    await backupManager.startBackup(task)
  })

  // cancel-backup
  ipcMain.handle('cancel-backup', (_event, deviceId: string) => {
    backupManager.cancelBackup(deviceId)
  })

  // get-history
  ipcMain.handle('get-history', () => {
    return backupHistoryStore.getHistory()
  })

  // check-macos-fuse
  // installed: filesystem bundle 存在
  // approved:  kextstat 顯示 macFUSE kext 已載入（代表用戶已在隱私與安全性中核准）
  ipcMain.handle('check-macos-fuse', async () => {
    if (process.platform !== 'darwin') return null
    const installed = fs.existsSync('/Library/Filesystems/macfuse.fs')
    let approved = false
    if (installed) {
      try {
        const { stdout } = await execFile('/usr/sbin/kextstat', [])
        approved = stdout.toLowerCase().includes('fuse')
      } catch {
        approved = false
      }
    }
    return { installed, approved }
  })

  // open-backup-folder
  ipcMain.handle('open-backup-folder', async (_event, folderPath: string) => {
    // Ensure the folder exists before opening
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true })
    }
    const err = await shell.openPath(folderPath)
    if (err) console.error('[open-backup-folder] shell.openPath error:', err)
  })

  // check-windows-drivers
  ipcMain.handle('check-windows-drivers', async () => {
    if (process.platform !== 'win32') return null

    // winfsp: check C:\Program Files (x86)\WinFsp exists
    const winfsp = fs.existsSync('C:\\Program Files (x86)\\WinFsp')

    // appleMobileDevice: check service 'Apple Mobile Device Service' is RUNNING
    let appleMobileDevice = false
    try {
      const { stdout } = await execFile('sc.exe', ['query', 'Apple Mobile Device Service'])
      appleMobileDevice = stdout.includes('RUNNING')
    } catch {
      appleMobileDevice = false
    }

    // libimobiledevice: check afcclient.exe in extraResources (dev: project resources/, prod: process.resourcesPath)
    const libBase = app.isPackaged
      ? path.join(process.resourcesPath, 'win', 'libimobiledevice')
      : path.join(app.getAppPath(), 'resources', 'win', 'libimobiledevice')
    const afcclientPath = path.join(libBase, 'afcclient.exe')
    const libimobiledevice = fs.existsSync(afcclientPath)

    return { winfsp, appleMobileDevice, libimobiledevice }
  })

  // start-icloud-sync
  ipcMain.handle('start-icloud-sync', (_event, args: { appleId: string; password: string; destDir: string; album?: string }) => {
    icloudSyncManager.start(args.appleId, args.password, args.destDir, args.album)
  })

  // cancel-icloud-sync
  ipcMain.handle('cancel-icloud-sync', () => {
    icloudSyncManager.cancel()
  })

  // submit-2fa-code
  ipcMain.handle('submit-2fa-code', (_event, code: string) => {
    icloudSyncManager.submitTwoFACode(code)
  })

  // get-icloud-status
  ipcMain.handle('get-icloud-status', () => {
    return icloudSyncManager.getStatus()
  })
}

async function scanDevicesWindows(appRef: ElectronApp): Promise<Device[]> {
  const libBase = appRef.isPackaged
    ? path.join(process.resourcesPath, 'win', 'libimobiledevice')
    : path.join(appRef.getAppPath(), 'resources', 'win', 'libimobiledevice')

  const ideviceIdPath = path.join(libBase, 'idevice_id.exe')
  const ideviceinfoPath = path.join(libBase, 'ideviceinfo.exe')

  let udids: string[]
  try {
    const { stdout } = await execFile(ideviceIdPath, ['-l', '-n'])
    udids = stdout.trim().split('\n').map((l) => l.trim().split(' ')[0]).filter((l) => l.length > 0)
  } catch {
    return []
  }

  const devices: Device[] = []
  for (const udid of udids) {
    let name = 'iPhone'
    try {
      const { stdout: info } = await execFile(ideviceinfoPath, ['-u', udid])
      for (const line of info.split('\n')) {
        const trimmed = line.trim()
        if (trimmed.startsWith('DeviceName:')) {
          name = trimmed.slice('DeviceName:'.length).trim() || 'iPhone'
          break
        }
      }
    } catch { /* use default name */ }

    devices.push({ id: udid, name, ip: '', serviceType: 'wifi', paired: false })
  }
  return devices
}

function tcpProbe(ip: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect(port, ip)
    let done = false

    const finish = (result: boolean): void => {
      if (done) return
      done = true
      socket.destroy()
      resolve(result)
    }

    socket.setTimeout(timeoutMs)
    socket.on('connect', () => finish(true))
    socket.on('error', () => finish(false))
    socket.on('timeout', () => finish(false))
  })
}
