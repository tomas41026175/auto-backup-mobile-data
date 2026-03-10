import { ipcMain } from 'electron'
import * as fs from 'fs'
import * as net from 'net'
import type { Device, PairedDevice, Settings } from '../shared/types'
import type { SettingsStore } from './services/settings-store'
import type { BackupHistoryStore } from './services/backup-history-store'
import type { DeviceScanner } from './services/device-scanner'
import type { BackupManager } from '../shared/types'

const SCAN_TIMEOUT_MS = 10_000
const TCP_CONNECT_TIMEOUT_MS = 3_000
const TCP_PING_PORT = 62078

interface SetupIpcHandlersOptions {
  settingsStore: SettingsStore
  backupHistoryStore: BackupHistoryStore
  deviceScanner: DeviceScanner
  backupManager: BackupManager
}

export function setupIpcHandlers({
  settingsStore,
  backupHistoryStore,
  deviceScanner,
  backupManager
}: SetupIpcHandlersOptions): void {
  // get-current-state
  ipcMain.handle('get-current-state', () => {
    // renderer 負責追蹤 push events，devices 初始為空
    return {
      devices: [] as Device[],
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
  ipcMain.handle('save-settings', (_event, settings: Settings) => {
    settingsStore.saveSettings(settings)
  })

  // validate-path
  ipcMain.handle('validate-path', (_event, path: string) => {
    return fs.existsSync(path)
  })

  // scan-devices
  ipcMain.handle('scan-devices', async () => {
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
