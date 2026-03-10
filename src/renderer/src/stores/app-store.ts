import { create } from 'zustand'
import type { Device, BackupJob, AppStatus, BackupRecord } from '../../../shared/types'

interface AppStore {
  devices: Device[]
  currentBackup: BackupJob | null
  status: AppStatus
  mdnsAvailable: boolean

  setDevices: (devices: Device[]) => void
  addDevice: (device: Device) => void
  removeDevice: (deviceId: string) => void
  setCurrentBackup: (job: BackupJob | null) => void
  setStatus: (status: AppStatus) => void
  setMdnsAvailable: (available: boolean) => void
}

const useAppStore = create<AppStore>((set) => ({
  devices: [],
  currentBackup: null,
  status: 'idle',
  mdnsAvailable: true,

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
  })

  const unsubBackupComplete = window.api.on('backup-complete', (_event, _record: BackupRecord) => {
    useAppStore.getState().setCurrentBackup(null)
    useAppStore.getState().setStatus('idle')
  })

  const unsubMdnsStatus = window.api.on('mdns-status', (_event, available) => {
    useAppStore.getState().setMdnsAvailable(available)
  })

  return (): void => {
    unsubDeviceFound()
    unsubDeviceLost()
    unsubBackupProgress()
    unsubBackupComplete()
    unsubMdnsStatus()
  }
}
