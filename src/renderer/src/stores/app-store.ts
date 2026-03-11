import { create } from 'zustand'
import type {
  Device,
  BackupJob,
  AppStatus,
  BackupRecord,
  UsbDevice,
  BackupProgressDetail,
  BackupCompleteDetail,
  BackupErrorDetail,
  FuseStatus
} from '../../../shared/types'

export type { FuseStatus }

interface AppStore {
  devices: Device[]
  currentBackup: BackupJob | null
  status: AppStatus
  mdnsAvailable: boolean
  usbDevice: UsbDevice | null
  backupProgressDetail: BackupProgressDetail | null
  backupComplete: BackupCompleteDetail | null
  backupError: BackupErrorDetail | null
  fuseStatus: FuseStatus | null

  setDevices: (devices: Device[]) => void
  addDevice: (device: Device) => void
  removeDevice: (deviceId: string) => void
  setCurrentBackup: (job: BackupJob | null) => void
  setStatus: (status: AppStatus) => void
  setMdnsAvailable: (available: boolean) => void
  setUsbDevice: (device: UsbDevice | null) => void
  setBackupProgressDetail: (progress: BackupProgressDetail | null) => void
  setBackupComplete: (detail: BackupCompleteDetail | null) => void
  setBackupError: (error: BackupErrorDetail | null) => void
  setFuseStatus: (status: FuseStatus | null) => void
}

const useAppStore = create<AppStore>((set) => ({
  devices: [],
  currentBackup: null,
  status: 'idle',
  mdnsAvailable: true,
  usbDevice: null,
  backupProgressDetail: null,
  backupComplete: null,
  backupError: null,
  fuseStatus: null,

  setDevices: (devices) => set({ devices }),
  addDevice: (device) =>
    set((state) => ({
      devices: state.devices.some((d) => d.id === device.id)
        ? state.devices.map((d) => (d.id === device.id ? device : d))
        : [...state.devices, device],
    })),
  removeDevice: (deviceId) =>
    set((state) => ({
      devices: state.devices.filter((d) => d.id !== deviceId),
    })),
  setCurrentBackup: (job) => set({ currentBackup: job }),
  setStatus: (status) => set({ status }),
  setMdnsAvailable: (available) => set({ mdnsAvailable: available }),
  setUsbDevice: (device) => set({ usbDevice: device }),
  setBackupProgressDetail: (progress) => set({ backupProgressDetail: progress }),
  setBackupComplete: (detail) => set({ backupComplete: detail }),
  setBackupError: (error) => set({ backupError: error }),
  setFuseStatus: (status) => set({ fuseStatus: status }),
}))

export default useAppStore

// ── Store initialization ──────────────────────────────────────────────────────

export async function initializeStores(): Promise<void> {
  try {
    const appState = await window.api.invoke('get-current-state')
    useAppStore.getState().setDevices(appState.devices)
    useAppStore.getState().setCurrentBackup(appState.currentBackup)
    useAppStore.getState().setStatus(appState.status)
    useAppStore.getState().setMdnsAvailable(appState.mdnsAvailable)
    if (appState.usbDevice !== undefined) {
      useAppStore.getState().setUsbDevice(appState.usbDevice)
    }
    if (appState.backupProgressDetail !== undefined) {
      useAppStore.getState().setBackupProgressDetail(appState.backupProgressDetail)
    }
    if (appState.backupComplete !== undefined) {
      useAppStore.getState().setBackupComplete(appState.backupComplete)
    }
    if (appState.backupError !== undefined) {
      useAppStore.getState().setBackupError(appState.backupError)
    }
  } catch {
    useAppStore.getState().setStatus('error')
  }
}

// ── IPC listener setup ────────────────────────────────────────────────────────

export function setupIpcListeners(): () => void {
  const unsubDeviceFound = window.api.on('device-found', (_event, device) => {
    useAppStore.getState().addDevice(device)
  })

  const unsubDeviceLost = window.api.on('device-lost', (_event, deviceId) => {
    useAppStore.getState().removeDevice(deviceId)
  })

  const unsubBackupProgress = window.api.on('backup-progress', (_event, job) => {
    useAppStore.getState().setCurrentBackup(job)
    useAppStore.getState().setStatus('backing-up')
    useAppStore.getState().setBackupComplete(null)
    useAppStore.getState().setBackupError(null)
  })

  const unsubBackupComplete = window.api.on('backup-complete', (_event, _record: BackupRecord) => {
    useAppStore.getState().setCurrentBackup(null)
    useAppStore.getState().setStatus('idle')
    useAppStore.getState().setBackupProgressDetail(null)
  })

  const unsubMdnsStatus = window.api.on('mdns-status', (_event, available) => {
    useAppStore.getState().setMdnsAvailable(available)
  })

  const unsubUsbConnected = window.api.on('device-usb-connected', (_event, device) => {
    useAppStore.getState().setUsbDevice(device)
    useAppStore.getState().setBackupError(null)
    useAppStore.getState().setBackupComplete(null)
  })

  const unsubUsbDisconnected = window.api.on('device-usb-disconnected', () => {
    useAppStore.getState().setUsbDevice(null)
    useAppStore.getState().setCurrentBackup(null)
    useAppStore.getState().setBackupProgressDetail(null)
    useAppStore.getState().setStatus('idle')
  })

  const unsubBackupProgressDetail = window.api.on('backup-progress-detail', (_event, progress) => {
    useAppStore.getState().setBackupProgressDetail(progress)
    useAppStore.getState().setBackupComplete(null)
    useAppStore.getState().setBackupError(null)
    useAppStore.getState().setStatus('backing-up')
  })

  const unsubBackupCompleteDetail = window.api.on('backup-complete-detail', (_event, detail) => {
    useAppStore.getState().setBackupComplete(detail)
    useAppStore.getState().setBackupProgressDetail(null)
    useAppStore.getState().setCurrentBackup(null)
    useAppStore.getState().setStatus('idle')
  })

  const unsubBackupError = window.api.on('backup-error', (_event, error) => {
    useAppStore.getState().setBackupError(error)
    useAppStore.getState().setBackupProgressDetail(null)
    useAppStore.getState().setCurrentBackup(null)
    useAppStore.getState().setStatus('error')
  })

  return (): void => {
    unsubDeviceFound()
    unsubDeviceLost()
    unsubBackupProgress()
    unsubBackupComplete()
    unsubMdnsStatus()
    unsubUsbConnected()
    unsubUsbDisconnected()
    unsubBackupProgressDetail()
    unsubBackupCompleteDetail()
    unsubBackupError()
  }
}
