import { app, BrowserWindow, Menu, Tray } from 'electron'
import { join } from 'path'
import { showMainWindow } from './utils/window-utils'

// GC 防護：模組層級全域變數，防止 Tray 被垃圾回收
let tray: Tray | null = null

function getMainWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows()
  return windows.length > 0 ? windows[0] : null
}

export function createTray(): void {
  const iconPath = process.platform === 'darwin'
    ? join(__dirname, '../../resources/iconTemplate.png')
    : join(__dirname, '../../resources/icon.png')
  tray = new Tray(iconPath)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '開啟設定',
      click: (): void => {
        const win = getMainWindow()
        if (win) showMainWindow(win)
      }
    },
    {
      label: '立即掃描',
      click: (): void => {
        // TODO: TASK-002 將掛載 scan-devices IPC handler
        const win = getMainWindow()
        if (win) showMainWindow(win)
      }
    },
    {
      label: '立即備份',
      click: (): void => {
        // TODO: TASK-003 將掛載 start-backup IPC handler
        const win = getMainWindow()
        if (win) showMainWindow(win)
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

  if (process.platform === 'darwin') {
    // macOS: 右鍵彈出 context menu，左鍵開啟視窗
    tray.on('right-click', () => {
      tray!.popUpContextMenu(contextMenu)
    })
    tray.on('click', () => {
      const win = getMainWindow()
      if (win) showMainWindow(win)
    })
  } else {
    // Windows: setContextMenu + double-click
    tray.setContextMenu(contextMenu)
    tray.on('double-click', () => {
      const win = getMainWindow()
      if (win) showMainWindow(win)
    })
  }
}

export function destroyTray(): void {
  if (tray !== null) {
    tray.destroy()
    tray = null
  }
}
