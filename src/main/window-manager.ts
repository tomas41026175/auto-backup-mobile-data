import type { BrowserWindow } from 'electron'

// GC 防護：模組層級全域變數，防止 mainWindow 被垃圾回收
let mainWindow: BrowserWindow | null = null

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function setMainWindow(win: BrowserWindow | null): void {
  mainWindow = win
}
