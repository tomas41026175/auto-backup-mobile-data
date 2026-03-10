import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { createTray } from './tray'
import { createSettingsStore } from './services/settings-store'
import { createBackupHistoryStore } from './services/backup-history-store'
import { createDeviceScanner } from './services/device-scanner'
import { createNotificationService } from './services/notification-service'
import { MockBackupManager } from './services/backup-manager'
import { setupIpcHandlers } from './ipc-handlers'
import type { BackupJob, BackupRecord, Device } from '../shared/types'

// AppUserModelId 必須在 app.whenReady() 之前呼叫
if (process.platform === 'win32') {
  app.setAppUserModelId(is.dev ? process.execPath : 'com.autobackup.app')
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
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

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // 關閉視窗只隱藏，不退出（常駐 Tray）
  mainWindow.on('close', (event) => {
    event.preventDefault()
    mainWindow?.hide()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId(is.dev ? process.execPath : 'com.autobackup.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 初始化順序：createWindow → initStores → services → IPC handlers
  createWindow()

  if (mainWindow === null) return

  const win = mainWindow

  // 1. 初始化 stores
  const settingsStore = createSettingsStore()
  const backupHistoryStore = createBackupHistoryStore()

  // 2. 初始化 BackupManager
  const backupManager = new MockBackupManager(settingsStore, backupHistoryStore)

  // 3. 初始化 DeviceScanner（注入 settingsStore）
  const deviceScanner = createDeviceScanner(settingsStore)

  // 4. 初始化 NotificationService（注入 win 和 backupManager）
  const notificationService = createNotificationService(win, backupManager)

  // 5. 設定 IPC handlers
  setupIpcHandlers({
    settingsStore,
    backupHistoryStore,
    deviceScanner,
    backupManager
  })

  // 6. 接線事件：device-stable-online → notificationService + webContents push
  deviceScanner.on('device-stable-online', (device: Device) => {
    notificationService.handleDeviceStableOnline(device)
  })

  deviceScanner.on('device-found', (device: Device) => {
    win.webContents.send('device-found', device)
  })

  deviceScanner.on('device-lost', (deviceId: string) => {
    win.webContents.send('device-lost', deviceId)
  })

  deviceScanner.on('mdns-status', (available: boolean) => {
    win.webContents.send('mdns-status', available)
  })

  // 7. 接線備份事件 → webContents push
  backupManager.on('backup-progress', (job: BackupJob) => {
    win.webContents.send('backup-progress', job)
  })

  backupManager.on('backup-complete', (record: BackupRecord) => {
    win.webContents.send('backup-complete', record)
  })

  // 8. 建立 Tray
  createTray()

  // 9. app 退出時清理
  app.on('before-quit', () => {
    deviceScanner.destroy()
    notificationService.destroy()
  })
})

// 防止 app 因視窗全關閉而退出（交由 Tray 控制）
app.on('window-all-closed', () => {
  // 不呼叫 app.quit()，保持常駐
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
