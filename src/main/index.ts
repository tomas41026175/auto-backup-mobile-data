import { app, shell, BrowserWindow, dialog, ipcMain } from 'electron'
import { join } from 'path'
import { optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { createTray } from './tray'
import { setupIpcHandlers } from './ipc-handlers'
import { createSettingsStore } from './services/settings-store'
import { createBackupHistoryStore } from './services/backup-history-store'
import { createDeviceScanner } from './services/device-scanner'
import { MockBackupManager } from './services/backup-manager'
import { createNotificationService } from './services/notification-service'
import { getMainWindow, setMainWindow } from './window-manager'
import type { DeviceScanner } from './services/device-scanner'
import type { Device, BackupJob, BackupRecord } from '../shared/types'

// AppUserModelId 必須在 app.whenReady() 之前呼叫（單一呼叫點，移除重複）
if (process.platform === 'win32') {
  app.setAppUserModelId(is.dev ? process.execPath : 'com.autobackup.app')
}

let isQuitting = false

// 模組層級全域（GC 防護）
let deviceScanner: DeviceScanner | null = null

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  setMainWindow(win)

  win.on('ready-to-show', () => {
    win.show()
  })

  // 關閉視窗只隱藏，不退出（常駐 Tray）
  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      win.hide()
    }
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 初始化順序：createWindow → createTray → initServices → setupIpc
  createWindow()
  createTray()
  if (process.platform === 'darwin') {
    app.dock?.hide()
  }

  // 建立服務層
  const settingsStore = createSettingsStore()
  const backupHistoryStore = createBackupHistoryStore()
  const scanner = createDeviceScanner(settingsStore)
  deviceScanner = scanner
  const backupManager = new MockBackupManager(settingsStore, backupHistoryStore)

  const win = getMainWindow()
  if (!win) throw new Error('createWindow did not initialize BrowserWindow')
  const notificationService = createNotificationService(win, backupManager)

  // 接線：DeviceScanner 事件 → push IPC 到 renderer
  scanner.on('device-found', (device: Device) => {
    getMainWindow()?.webContents.send('device-found', device)
  })
  scanner.on('device-lost', (deviceId: string) => {
    getMainWindow()?.webContents.send('device-lost', deviceId)
  })
  scanner.on('device-stable-online', (device: Device) => {
    notificationService.handleDeviceStableOnline(device)
  })
  scanner.on('mdns-status', (available: boolean) => {
    getMainWindow()?.webContents.send('mdns-status', available)
  })

  // MockBackupManager 事件 → push IPC 到 renderer
  backupManager.on('backup-progress', (job: BackupJob) => {
    getMainWindow()?.webContents.send('backup-progress', job)
  })
  backupManager.on('backup-complete', (record: BackupRecord) => {
    getMainWindow()?.webContents.send('backup-complete', record)
  })

  // 補充未在 ipc-channels.ts 定義的 UI 用途 channels
  ipcMain.handle('select-backup-path', async () => {
    const currentWin = getMainWindow()
    if (!currentWin) return null
    const result = await dialog.showOpenDialog(currentWin, {
      properties: ['openDirectory', 'createDirectory'],
      title: '選擇備份路徑',
      ...(process.platform === 'darwin' ? { defaultPath: '/Volumes' } : {})
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
  ipcMain.on('close-window', () => {
    getMainWindow()?.hide()
  })

  setupIpcHandlers({ settingsStore, backupHistoryStore, deviceScanner: scanner, backupManager })
})

// 防止 app 因視窗全關閉而退出（交由 Tray 控制）
app.on('window-all-closed', () => {
  // 不呼叫 app.quit()，保持常駐
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  } else {
    getMainWindow()?.show()
  }
})

app.on('before-quit', () => {
  isQuitting = true
  deviceScanner?.destroy()
})
