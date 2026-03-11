export type SyncDirection = 'mobile-to-pc' | 'pc-to-mobile' | 'bidirectional'

export type SyncFileType = 'photos' | 'videos' | 'screenshots' | 'slowmo' | 'documents' | 'voice'

export const DEFAULT_SYNC_TYPES: SyncFileType[] = ['photos', 'videos', 'screenshots']

export interface PairedDevice {
  id: string
  name: string
  ip: string
  addedAt: string
  syncDirection: SyncDirection
  syncTypes: SyncFileType[]
}

export interface Device {
  id: string
  name: string
  ip: string
  serviceType: string
  paired: boolean
}

export type BackupStatus =
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'transferring'
  | 'completing'
  | 'done'
  | 'error'
  | 'cancelled'

export interface BackupJob {
  id: string
  deviceId: string
  deviceName: string
  status: BackupStatus
  progress: number
  startedAt: string
  direction: SyncDirection
  syncTypes: SyncFileType[]
}

export interface BackupRecord {
  id: string
  deviceId: string
  deviceName: string
  completedAt: string
  duration: number
  fileCount: number
  bytesTransferred: number
  status: 'success' | 'error' | 'cancelled'
  syncTypes: SyncFileType[]
  direction: SyncDirection
}

export interface Settings {
  backupPath: string
  pairedDevices: PairedDevice[]
  autoStart: boolean
}

export type AppStatus = 'idle' | 'scanning' | 'backing-up' | 'error'

export interface UsbDevice {
  udid: string
  deviceName: string
  productType: string
  productVersion: string
}

export interface BackupProgressDetail {
  current: number
  total: number
  fileName: string
  speed: number
}

export interface BackupCompleteDetail {
  fileCount: number
  totalSize: number
  durationMs: number
}

export interface BackupErrorDetail {
  message: string
}

export interface AppState {
  devices: Device[]
  currentBackup: BackupJob | null
  status: AppStatus
  mdnsAvailable: boolean
  usbDevice: UsbDevice | null
  backupProgressDetail: BackupProgressDetail | null
  backupComplete: BackupCompleteDetail | null
  backupError: BackupErrorDetail | null
}

export interface BackupTask {
  deviceId: string
  direction: SyncDirection
  syncTypes?: SyncFileType[]
}

export interface BackupManager {
  startBackup(task: BackupTask): Promise<void>
  cancelBackup(deviceId: string): void
  getStatus(deviceId: string): BackupStatus
}

export interface UsbDeviceInfo {
  udid: string
  name: string
  iosVersion: string
  productId: number
}
