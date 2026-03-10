import { app, BrowserWindow, Menu, Tray } from 'electron'
import { join } from 'path'

// GC 防護：模組層級全域變數，防止 Tray 被垃圾回收
let tray: Tray | null = null

function getMainWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows()
  return windows.length > 0 ? windows[0] : null
}

function showMainWindow(): void {
  const win = getMainWindow()
  if (win === null) return

  if (win.isVisible()) {
    // Windows 通知焦點 workaround
    win.setAlwaysOnTop(true)
    win.focus()
    win.setAlwaysOnTop(false)
  } else {
    win.show()
    win.setAlwaysOnTop(true)
    win.focus()
    win.setAlwaysOnTop(false)
  }
}

export function createTray(): void {
  const iconPath = join(__dirname, '../../resources/icon.png')
  tray = new Tray(iconPath)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '開啟設定',
      click: (): void => {
        showMainWindow()
      }
    },
    {
      label: '立即掃描',
      click: (): void => {
        // TODO: TASK-002 將掛載 scan-devices IPC handler
        showMainWindow()
      }
    },
    {
      label: '立即備份',
      click: (): void => {
        // TODO: TASK-003 將掛載 start-backup IPC handler
        showMainWindow()
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: (): void => {
        app.quit()
      }
    }
  ])

  tray.setToolTip('Auto Backup Mobile')
  tray.setContextMenu(contextMenu)

  tray.on('double-click', () => {
    showMainWindow()
  })
}

export function destroyTray(): void {
  if (tray !== null) {
    tray.destroy()
    tray = null
  }
}
