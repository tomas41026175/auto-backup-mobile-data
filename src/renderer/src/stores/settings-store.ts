import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import type { PairedDevice, Settings, SyncDirection, SyncFileType } from '../../../shared/types'

interface SettingsState {
  backupPath: string
  pairedDevices: PairedDevice[]
  autoStart: boolean
  isLoading: boolean
  isSaving: boolean
  error: string | null
}

interface SettingsActions {
  loadSettings: () => Promise<void>
  saveSettings: () => Promise<void>
  setBackupPath: (path: string) => void
  setPairedDevices: (devices: PairedDevice[]) => void
  addPairedDevice: (device: PairedDevice) => void
  removePairedDevice: (deviceId: string) => void
  updateDeviceSyncTypes: (deviceId: string, syncTypes: Set<SyncFileType>) => void
  updateDeviceSyncDirection: (deviceId: string, syncDirection: SyncDirection) => void
  setAutoStart: (autoStart: boolean) => void
}

type SettingsStore = SettingsState & SettingsActions

const useSettingsStoreBase = create<SettingsStore>()((set, get) => ({
  backupPath: '',
  pairedDevices: [],
  autoStart: false,
  isLoading: false,
  isSaving: false,
  error: null,

  loadSettings: async (): Promise<void> => {
    set({ isLoading: true, error: null })
    try {
      const settings: Settings = await window.api.invoke('get-settings')
      set({
        backupPath: settings.backupPath,
        pairedDevices: settings.pairedDevices,
        autoStart: settings.autoStart,
        isLoading: false,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : '載入設定失敗'
      set({ error: message, isLoading: false })
    }
  },

  saveSettings: async (): Promise<void> => {
    set({ isSaving: true, error: null })
    try {
      const { backupPath, pairedDevices, autoStart } = get()
      const settings: Settings = {
        backupPath,
        pairedDevices,
        autoStart,
      }
      await window.api.invoke('save-settings', settings)
      set({ isSaving: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : '儲存設定失敗'
      set({ error: message, isSaving: false })
    }
  },

  setBackupPath: (path: string): void => {
    set({ backupPath: path })
  },

  setPairedDevices: (devices: PairedDevice[]): void => {
    set({ pairedDevices: devices })
  },

  addPairedDevice: (device: PairedDevice): void => {
    set((state) => ({
      pairedDevices: [...state.pairedDevices, device],
    }))
  },

  removePairedDevice: (deviceId: string): void => {
    set((state) => ({
      pairedDevices: state.pairedDevices.filter((d) => d.id !== deviceId),
    }))
  },

  updateDeviceSyncTypes: (deviceId: string, syncTypes: Set<SyncFileType>): void => {
    set((state) => ({
      pairedDevices: state.pairedDevices.map((d) =>
        d.id !== deviceId ? d : { ...d, syncTypes: Array.from(syncTypes) },
      ),
    }))
  },

  updateDeviceSyncDirection: (deviceId: string, syncDirection: SyncDirection): void => {
    set((state) => ({
      pairedDevices: state.pairedDevices.map((d) =>
        d.id !== deviceId ? d : { ...d, syncDirection },
      ),
    }))
  },

  setAutoStart: (autoStart: boolean): void => {
    set({ autoStart })
  },
}))

export function useSettingsStore(): SettingsStore {
  return useSettingsStoreBase(
    useShallow((state) => state),
  )
}
