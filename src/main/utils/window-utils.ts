import type { BrowserWindow } from 'electron'

export function showMainWindow(win: BrowserWindow): void {
  if (win.isVisible()) {
    if (process.platform === 'win32') {
      win.setAlwaysOnTop(true)
      win.focus()
      win.setAlwaysOnTop(false)
    } else {
      win.focus()
    }
  } else {
    win.show()
    if (process.platform === 'win32') {
      win.setAlwaysOnTop(true)
      win.focus()
      win.setAlwaysOnTop(false)
    }
  }
}
