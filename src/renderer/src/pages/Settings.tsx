import React, { useEffect } from 'react'
import { Card, Divider } from '../components/ui'
import { PathPicker } from '../components/PathPicker'
import { DeviceList } from '../components/DeviceList'
import { ManualDeviceInput } from '../components/ManualDeviceInput'
import { useSettingsStore } from '../stores/settings-store'
import type { PairedDevice, SyncDirection, SyncFileType } from '../../../shared/types'

// ── Section Title ─────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-widest text-[--color-text-muted]">
      {children}
    </h2>
  )
}

// ── Settings Page ─────────────────────────────────────────────────────────────

function Settings(): React.JSX.Element {
  const {
    backupPath,
    pairedDevices,
    isLoading,
    isSaving,
    error,
    loadSettings,
    saveSettings,
    setBackupPath,
    addPairedDevice,
    removePairedDevice,
    updateDeviceSyncTypes,
    updateDeviceSyncDirection,
  } = useSettingsStore()

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  async function handleBackupPathChange(path: string): Promise<void> {
    setBackupPath(path)
    await saveSettings()
  }

  function handleDevicePaired(device: PairedDevice): void {
    addPairedDevice(device)
    void saveSettings()
  }

  function handleDeviceUnpaired(deviceId: string): void {
    removePairedDevice(deviceId)
    void saveSettings()
  }

  function handleSyncTypesChanged(deviceId: string, syncTypes: Set<SyncFileType>): void {
    updateDeviceSyncTypes(deviceId, syncTypes)
    void saveSettings()
  }

  function handleSyncDirectionChanged(deviceId: string, syncDirection: SyncDirection): void {
    updateDeviceSyncDirection(deviceId, syncDirection)
    void saveSettings()
  }

  function handleManualDeviceAdded(device: PairedDevice): void {
    addPairedDevice(device)
    void saveSettings()
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-[--color-bg-base]">
        <p className="text-sm text-[--color-text-muted]">載入設定中...</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[--color-bg-base]">
      <div className="flex flex-col gap-4 p-4">
        {error && (
          <div className="rounded-lg bg-[--color-error-subtle] px-3 py-2">
            <p className="text-xs text-[--color-error]">{error}</p>
          </div>
        )}

        {/* ── 區塊 1：備份路徑設定 ─────────────────────────────── */}
        <Card>
          <div className="flex flex-col gap-3">
            <SectionTitle>備份路徑設定</SectionTitle>
            <Divider />
            <PathPicker value={backupPath} onChange={(path) => void handleBackupPathChange(path)} />
          </div>
        </Card>

        {/* ── 區塊 2：偵測裝置（含已配對裝置展開面板）────────────── */}
        <Card>
          <div className="flex flex-col gap-3">
            <SectionTitle>偵測裝置</SectionTitle>
            <Divider />
            {pairedDevices.length === 0 && (
              <p className="py-1 text-xs text-[--color-text-muted]">
                尚未配對任何裝置。請使用下方「掃描裝置」功能。
              </p>
            )}
            <DeviceList
              pairedDevices={pairedDevices}
              onDevicePaired={handleDevicePaired}
              onDeviceUnpaired={handleDeviceUnpaired}
              onSyncTypesChanged={handleSyncTypesChanged}
              onSyncDirectionChanged={handleSyncDirectionChanged}
            />
          </div>
        </Card>

        {/* ── 區塊 3：手動新增裝置（Plan B）──────────────────────── */}
        <Card>
          <div className="flex flex-col gap-3">
            <SectionTitle>手動新增（IP 輸入）</SectionTitle>
            <Divider />
            <ManualDeviceInput onDeviceAdded={handleManualDeviceAdded} />
          </div>
        </Card>

        <p className="pb-2 text-center text-xs text-[--color-text-muted]">
          Windows Auto Backup &nbsp;&nbsp; v0.1.0
          {isSaving && ' · 儲存中...'}
        </p>
      </div>
    </div>
  )
}

export default Settings
