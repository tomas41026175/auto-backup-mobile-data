import { Conf } from 'electron-conf/main'
import type { PairedDevice, Settings, SyncDirection, SyncFileType } from '../../shared/types'
import { DEFAULT_SYNC_TYPES } from '../../shared/types'

const DEFAULT_SETTINGS: Settings = {
  backupPath: '',
  pairedDevices: [],
  autoStart: false
}

interface StoredPairedDevice {
  id: string
  name: string
  ip: string
  addedAt: string
  syncDirection: SyncDirection
  syncTypes: SyncFileType[]
}

interface StoredSettings {
  backupPath: string
  pairedDevices: StoredPairedDevice[]
  autoStart: boolean
}

// electron-conf store instance（GC 防護：模組層級）
const store = new Conf<StoredSettings>({ name: 'settings' })

function deserializeSettings(stored: StoredSettings): Settings {
  return {
    backupPath: stored.backupPath,
    autoStart: stored.autoStart,
    pairedDevices: stored.pairedDevices.map((d) => ({
      ...d,
      syncTypes: Array.isArray(d.syncTypes) ? d.syncTypes : DEFAULT_SYNC_TYPES
    }))
  }
}

function serializeSettings(settings: Settings): StoredSettings {
  return {
    backupPath: settings.backupPath,
    autoStart: settings.autoStart,
    pairedDevices: settings.pairedDevices.map((d) => ({
      ...d,
      syncTypes: Array.from(d.syncTypes) // 永遠存成 Array
    }))
  }
}

export interface SettingsStore {
  getSettings(): Settings
  saveSettings(partial: Partial<Settings>): Settings
  addPairedDevice(device: Omit<PairedDevice, 'syncDirection' | 'syncTypes' | 'addedAt'> & Partial<Pick<PairedDevice, 'syncDirection' | 'syncTypes'>>): PairedDevice
  removePairedDevice(deviceId: string): void
  updateDeviceConfig(deviceId: string, config: Partial<PairedDevice>): PairedDevice
}

export function createSettingsStore(): SettingsStore {
  // 初始化預設值
  if (!store.has('backupPath')) {
    store.set('backupPath', DEFAULT_SETTINGS.backupPath)
  }
  if (!store.has('pairedDevices')) {
    store.set('pairedDevices', DEFAULT_SETTINGS.pairedDevices)
  }
  if (!store.has('autoStart')) {
    store.set('autoStart', DEFAULT_SETTINGS.autoStart)
  }

  function getSettings(): Settings {
    const stored: StoredSettings = {
      backupPath: store.get('backupPath', DEFAULT_SETTINGS.backupPath),
      pairedDevices: store.get('pairedDevices', []),
      autoStart: store.get('autoStart', false)
    }
    return deserializeSettings(stored)
  }

  function saveSettings(partial: Partial<Settings>): Settings {
    const current = getSettings()
    const updated: Settings = { ...current, ...partial }
    const serialized = serializeSettings(updated)
    store.set('backupPath', serialized.backupPath)
    store.set('pairedDevices', serialized.pairedDevices)
    store.set('autoStart', serialized.autoStart)
    return updated
  }

  function addPairedDevice(
    device: Omit<PairedDevice, 'syncDirection' | 'syncTypes' | 'addedAt'> &
      Partial<Pick<PairedDevice, 'syncDirection' | 'syncTypes'>>
  ): PairedDevice {
    const current = getSettings()
    const newDevice: PairedDevice = {
      id: device.id,
      name: device.name,
      ip: device.ip,
      addedAt: new Date().toISOString(),
      syncDirection: device.syncDirection ?? 'mobile-to-pc',
      syncTypes: device.syncTypes ?? [...DEFAULT_SYNC_TYPES]
    }
    const updated: Settings = {
      ...current,
      pairedDevices: [...current.pairedDevices, newDevice]
    }
    saveSettings(updated)
    return newDevice
  }

  function removePairedDevice(deviceId: string): void {
    const current = getSettings()
    const updated: Settings = {
      ...current,
      pairedDevices: current.pairedDevices.filter((d) => d.id !== deviceId)
    }
    saveSettings(updated)
  }

  function updateDeviceConfig(deviceId: string, config: Partial<PairedDevice>): PairedDevice {
    const current = getSettings()
    const deviceIndex = current.pairedDevices.findIndex((d) => d.id === deviceId)
    if (deviceIndex === -1) {
      throw new Error(`Device not found: ${deviceId}`)
    }
    const existing = current.pairedDevices[deviceIndex]
    const updatedDevice: PairedDevice = {
      ...existing,
      ...config,
      id: existing.id // id 不可被覆蓋
    }
    const updatedDevices = current.pairedDevices.map((d) => (d.id === deviceId ? updatedDevice : d))
    saveSettings({ pairedDevices: updatedDevices })
    return updatedDevice
  }

  return {
    getSettings,
    saveSettings,
    addPairedDevice,
    removePairedDevice,
    updateDeviceConfig
  }
}
