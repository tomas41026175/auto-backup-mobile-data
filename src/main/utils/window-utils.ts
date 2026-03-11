import type { BrowserWindow } from 'electron'

function focusWindow(win: BrowserWindow): void {
  if (process.platform === 'win32') {
    win.setAlwaysOnTop(true)
    win.focus()
    win.setAlwaysOnTop(false)
  } else {
    win.focus()
  }
}

export function showMainWindow(win: BrowserWindow): void {
  if (!win.isVisible()) {
    win.show()
  }
  focusWindow(win)
}
