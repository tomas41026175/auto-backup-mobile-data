import type {
  AppState,
  BackupJob,
  BackupRecord,
  BackupTask,
  Device,
  PairedDevice,
  Settings
} from './types'

/**
 * Listener event map: main → renderer push
 * 格式：{ channelName: [...args] }
 */
export interface IpcListenerChannels {
  'device-found': [device: Device]
  'device-lost': [deviceId: string]
  'backup-progress': [job: BackupJob]
  'backup-complete': [record: BackupRecord]
  'mdns-status': [available: boolean]
}

/**
 * Handler event map: renderer → main invoke
 * 格式：{ channelName: (args) => returnValue }
 */
export interface IpcHandlerChannels {
  'get-current-state': () => AppState
  'get-settings': () => Settings
  'save-settings': (settings: Settings) => void
  'validate-path': (path: string) => boolean
  'scan-devices': () => Device[]
  'pair-device': (device: Device) => PairedDevice
  'unpair-device': (deviceId: string) => void
  'add-device-manual': (args: { name: string; ip: string }) => PairedDevice
  'update-device-config': (args: {
    deviceId: string
    config: Partial<PairedDevice>
  }) => PairedDevice
  'start-backup': (task: BackupTask) => void
  'cancel-backup': (deviceId: string) => void
  'get-history': () => BackupRecord[]
}
