import { Notification } from 'electron'
import type { BrowserWindow } from 'electron'
import type { Device } from '../../shared/types'
import type { BackupManager } from '../../shared/types'
import type { SettingsStore } from './settings-store'
import { showMainWindow } from '../utils/window-utils'

export interface NotificationService {
  handleDeviceStableOnline(device: Device): void
  destroy(): void
}

export function createNotificationService(
  getWin: (() => BrowserWindow | null) | BrowserWindow,
  backupManager: BackupManager,
  settingsStore: SettingsStore
): NotificationService {
  const resolveWin = typeof getWin === 'function' ? getWin : () => getWin
  // GC 防護：closure 層級 Set，防止 Notification 物件被回收
  const activeNotifications: Set<Notification> = new Set()

  function startBackupForDevice(deviceId: string, direction: 'mobile-to-pc'): void {
    backupManager
      .startBackup({ deviceId, direction })
      .catch((err: unknown) => {
        console.error('[NotificationService] startBackup error:', err)
      })
  }

  function showDeviceNotification(device: Device): void {
    if (!Notification.isSupported()) return

    const notification = new Notification({
      title: `${device.name} 已連線`,
      body: '點擊開始備份'
    })

    activeNotifications.add(notification)

    notification.on('click', () => {
      const win = resolveWin()
      if (win && !win.isDestroyed()) showMainWindow(win)
      startBackupForDevice(device.id, 'mobile-to-pc')
      activeNotifications.delete(notification)
    })

    notification.on('close', () => {
      activeNotifications.delete(notification)
    })

    notification.show()
  }

  function handleDeviceStableOnline(device: Device): void {
    const settings = settingsStore.getSettings()
    const paired = settings.pairedDevices.find((d) => d.id === device.id)

    if (paired?.autoBackup) {
      // 自動備份：靜默觸發，不顯示通知
      startBackupForDevice(device.id, 'mobile-to-pc')
    } else {
      showDeviceNotification(device)
    }
  }

  function destroy(): void {
    activeNotifications.clear()
  }

  return {
    handleDeviceStableOnline,
    destroy
  }
}
