import { Notification } from 'electron'
import type { BrowserWindow } from 'electron'
import type { Device } from '../../shared/types'
import type { BackupManager } from '../../shared/types'
import { showMainWindow } from '../utils/window-utils'

export interface NotificationService {
  handleDeviceStableOnline(device: Device): void
  destroy(): void
}

export function createNotificationService(
  win: BrowserWindow,
  backupManager: BackupManager
): NotificationService {
  // GC 防護：closure 層級 Set，防止 Notification 物件被回收
  const activeNotifications: Set<Notification> = new Set()

  function showDeviceNotification(device: Device): void {
    if (!Notification.isSupported()) return

    const notification = new Notification({
      title: `${device.name} 已連線`,
      body: '點擊開始備份'
    })

    // GC 防護：加入 Set
    activeNotifications.add(notification)

    notification.on('click', () => {
      showMainWindow(win)

      // 自動開始備份
      const settings = { direction: 'mobile-to-pc' as const }
      backupManager
        .startBackup({
          deviceId: device.id,
          direction: settings.direction
        })
        .catch((err: unknown) => {
          console.error('[NotificationService] startBackup error:', err)
        })

      // 點擊後從 Set 移除
      activeNotifications.delete(notification)
    })

    notification.on('close', () => {
      activeNotifications.delete(notification)
    })

    notification.show()
  }

  function handleDeviceStableOnline(device: Device): void {
    showDeviceNotification(device)
  }

  function destroy(): void {
    activeNotifications.clear()
  }

  return {
    handleDeviceStableOnline,
    destroy
  }
}
