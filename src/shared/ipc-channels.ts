import type {
  AppState,
  BackupCompleteDetail,
  BackupErrorDetail,
  BackupJob,
  BackupProgressDetail,
  BackupRecord,
  BackupTask,
  Device,
  PairedDevice,
  Settings,
  UsbDevice
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
  'device-usb-connected': [device: UsbDevice]
  'device-usb-disconnected': []
  'backup-progress-detail': [progress: BackupProgressDetail]
  'backup-complete-detail': [detail: BackupCompleteDetail]
  'backup-error': [error: BackupErrorDetail]
  'tray-update': [status: 'backing-up' | 'idle' | 'error']
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
  'check-macos-fuse': () => { installed: boolean; approved: boolean }
}
