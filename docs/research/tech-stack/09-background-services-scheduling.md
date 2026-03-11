# 背景服務與排程技術研究

> 研究日期：2026-03-11
> 涵蓋範圍：node-cron、chokidar、launchd、Windows Task Scheduler、USB/WiFi 事件、Electron 電源管理、背景執行限制、排程持久化

---

## 1. node-cron：Electron Main Process 排程

### 1.1 概述

[node-cron](https://www.npmjs.com/package/node-cron)（v4.2.1）是輕量級 Node.js 排程套件，適合在 Electron main process 中執行定時任務。

### 1.2 Cron Expression 語法

node-cron 使用六欄位格式：

```
┌──────────── 秒 (0-59)
│ ┌────────── 分 (0-59)
│ │ ┌──────── 時 (0-23)
│ │ │ ┌────── 日 (1-31)
│ │ │ │ ┌──── 月 (1-12 或 JAN-DEC)
│ │ │ │ │ ┌── 星期 (0-6 或 SUN-SAT)
* * * * * *
```

**運算符：**

| 運算符 | 說明 | 範例 |
|--------|------|------|
| `*` | 任意值 | `* * * * *`（每分鐘） |
| `,` | 列舉 | `1,3,5 * * * *` |
| `-` | 範圍 | `1-5 * * * *` |
| `/` | 步進 | `*/5 * * * *`（每 5 分鐘） |

### 1.3 核心 API

```typescript
import cron from 'node-cron';

// 排程任務
const task = cron.schedule('0 */30 * * * *', () => {
  console.log('每 30 分鐘執行');
}, {
  scheduled: true,        // 是否立即啟動（預設 true）
  timezone: 'Asia/Taipei', // 時區設定
  name: 'backup-task',    // 任務名稱
  recoverMissedExecutions: true  // 恢復錯過的執行
});

// 任務控制
task.start();
task.stop();

// 驗證 cron expression
const isValid = cron.validate('*/5 * * * *'); // boolean

// 取得所有排程任務
const tasks: Map<string, ScheduledTask> = cron.getTasks();
```

### 1.4 Electron Main Process 最佳實踐

```typescript
// main.ts - Electron main process
import { app } from 'electron';
import cron from 'node-cron';

interface ScheduleState {
  readonly expression: string;
  readonly lastRun: number | null;
  readonly enabled: boolean;
}

// 排程狀態持久化
function saveScheduleState(state: ScheduleState): void {
  // 使用 electron-store 或 sqlite 持久化
}

// 在 app ready 後初始化排程
app.on('ready', () => {
  const task = cron.schedule('0 0 3 * * *', async () => {
    try {
      await performBackup();
      saveScheduleState({
        expression: '0 0 3 * * *',
        lastRun: Date.now(),
        enabled: true
      });
    } catch (error) {
      // 錯誤處理 + 通知 renderer
    }
  }, {
    recoverMissedExecutions: true
  });
});

// app 結束前清理
app.on('before-quit', () => {
  cron.getTasks().forEach((task) => task.stop());
});
```

**注意事項：**

- node-cron 是 process-dependent，app 重啟需重新初始化排程
- `recoverMissedExecutions: true` 可在主線程凍結後補執行錯過的任務
- 搭配持久化層（electron-store / SQLite）記錄 lastRun 時間，避免重複執行

### 來源

- [node-cron npm](https://www.npmjs.com/package/node-cron)
- [node-cron GitHub](https://github.com/node-cron/node-cron)
- [Job Scheduling in Node.js with Node-cron - Better Stack](https://betterstack.com/community/guides/scaling-nodejs/node-cron-scheduled-tasks/)

---

## 2. chokidar：檔案系統監聽

### 2.1 概述

[chokidar](https://github.com/paulmillr/chokidar) 是跨平台檔案監聽函式庫，在約 3000 萬個 repository 中使用。

- **v4**（2024-09）：依賴從 13 減至 1，移除 glob 支援，支援 ESM/CJS
- **v5**（2025-11）：ESM-only，需 Node.js >= 20

### 2.2 macOS FSEvents 整合

macOS 上 chokidar 預設使用原生 FSEvents API，提供高效能的遞迴目錄監聽，相較於其他 *nix 平台的 kqueue 方案效能更好。

### 2.3 核心 API 與設定

```typescript
import { watch } from 'chokidar';

const watcher = watch('/path/to/watch', {
  // 基本設定
  persistent: true,         // 保持 process 存活（預設 true）
  ignoreInitial: true,      // 忽略初始掃描事件

  // 效能控制
  depth: 3,                 // 限制遞迴深度（減少資源消耗）
  ignored: [                // 忽略特定路徑
    /(^|[\/\\])\../,        // 隱藏檔案
    '**/node_modules/**',
    '**/*.tmp'
  ],

  // 寫入完成偵測（重要：大檔案傳輸場景）
  awaitWriteFinish: {
    stabilityThreshold: 2000, // 等待 2 秒無變化
    pollInterval: 100          // 檢查間隔
  },

  // 原子寫入偵測（文字編輯器常見行為）
  atomic: true,

  // Polling 模式（僅用於 NFS / 網路磁碟）
  usePolling: false,         // 預設 false，啟用會增加 CPU 使用
  interval: 100,             // polling 間隔 (ms)
  binaryInterval: 300        // 二進位檔案 polling 間隔 (ms)
});

// 事件監聽
watcher
  .on('add', (path) => console.log(`檔案新增: ${path}`))
  .on('change', (path) => console.log(`檔案變更: ${path}`))
  .on('unlink', (path) => console.log(`檔案刪除: ${path}`))
  .on('addDir', (path) => console.log(`目錄新增: ${path}`))
  .on('unlinkDir', (path) => console.log(`目錄刪除: ${path}`))
  .on('error', (error) => console.error(`監聽錯誤: ${error}`))
  .on('ready', () => console.log('初始掃描完成'));

// 關閉 watcher
await watcher.close();
```

### 2.4 監聽大量檔案的效能建議

| 策略 | 說明 |
|------|------|
| 限制 `depth` | 避免不必要的深層遞迴 |
| 使用 `ignored` | 排除 node_modules、.git 等 |
| 避免 `usePolling` | polling 模式 CPU 消耗高 |
| `awaitWriteFinish` | 大檔案傳輸時避免多次觸發事件 |
| 分批監聽 | 將大目錄拆分為多個 watcher，各自管理 |
| 適當 `stabilityThreshold` | 手機備份場景建議 2000-5000ms |

### 來源

- [chokidar GitHub](https://github.com/paulmillr/chokidar)
- [chokidar npm](https://www.npmjs.com/package/chokidar)

---

## 3. launchd（macOS 排程服務）

### 3.1 LaunchAgent plist 設定

LaunchAgent plist 放置於 `~/Library/LaunchAgents/`，用戶登入時自動載入。

#### 完整 plist 範例

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <!-- 必要：唯一識別名稱 -->
  <key>Label</key>
  <string>com.autobackup.scheduler</string>

  <!-- 執行程式與參數 -->
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/Users/username/apps/auto-backup/backup-runner.js</string>
  </array>

  <!-- 定時排程：每 3600 秒（1 小時）執行 -->
  <key>StartInterval</key>
  <integer>3600</integer>

  <!-- 日曆排程：每天凌晨 3:00 -->
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>3</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>

  <!-- 檔案變更觸發 -->
  <key>WatchPaths</key>
  <array>
    <string>/Volumes/iPhone</string>
  </array>

  <!-- 保持存活 -->
  <key>KeepAlive</key>
  <dict>
    <key>NetworkState</key>
    <true/>
    <key>SuccessfulExit</key>
    <false/>
  </dict>

  <!-- 載入時立即執行 -->
  <key>RunAtLoad</key>
  <true/>

  <!-- 日誌輸出 -->
  <key>StandardOutPath</key>
  <string>/tmp/autobackup.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/autobackup.err</string>
</dict>
</plist>
```

#### 關鍵設定說明

| Key | 說明 |
|-----|------|
| `StartInterval` | 每 N 秒執行一次。系統睡眠期間的事件會在喚醒後合併為一次 |
| `StartCalendarInterval` | 類似 crontab 的日曆排程，省略的欄位視為萬用字元。可用 array 指定多個時段 |
| `WatchPaths` | 監聽指定路徑的變更，任一路徑變化即觸發任務 |
| `KeepAlive` | 可設為 `true`（永遠保持）或 dict（條件式保持） |
| `RunAtLoad` | plist 載入時立即執行一次 |

### 3.2 Node.js 程式化管理 LaunchAgent

```typescript
import { writeFile, unlink } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';

interface LaunchAgentConfig {
  readonly label: string;
  readonly program: string;
  readonly args: readonly string[];
  readonly startInterval?: number;
  readonly calendarInterval?: {
    readonly hour?: number;
    readonly minute?: number;
    readonly weekday?: number;
  };
  readonly watchPaths?: readonly string[];
  readonly runAtLoad?: boolean;
}

function buildPlist(config: LaunchAgentConfig): string {
  const programArgs = [config.program, ...config.args]
    .map((arg) => `    <string>${arg}</string>`)
    .join('\n');

  let scheduleSection = '';

  if (config.startInterval !== undefined) {
    scheduleSection += `
  <key>StartInterval</key>
  <integer>${config.startInterval}</integer>`;
  }

  if (config.calendarInterval !== undefined) {
    const entries = Object.entries(config.calendarInterval)
      .map(([key, val]) => {
        const plistKey = key.charAt(0).toUpperCase() + key.slice(1);
        return `    <key>${plistKey}</key>\n    <integer>${val}</integer>`;
      })
      .join('\n');
    scheduleSection += `
  <key>StartCalendarInterval</key>
  <dict>
${entries}
  </dict>`;
  }

  if (config.watchPaths !== undefined && config.watchPaths.length > 0) {
    const paths = config.watchPaths
      .map((p) => `    <string>${p}</string>`)
      .join('\n');
    scheduleSection += `
  <key>WatchPaths</key>
  <array>
${paths}
  </array>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${config.label}</string>
  <key>ProgramArguments</key>
  <array>
${programArgs}
  </array>${scheduleSection}
  <key>RunAtLoad</key>
  <${config.runAtLoad ?? false}/>
  <key>StandardOutPath</key>
  <string>/tmp/${config.label}.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/${config.label}.err</string>
</dict>
</plist>`;
}

const AGENTS_DIR = path.join(homedir(), 'Library', 'LaunchAgents');

async function installAgent(config: LaunchAgentConfig): Promise<void> {
  const plistPath = path.join(AGENTS_DIR, `${config.label}.plist`);
  const content = buildPlist(config);
  await writeFile(plistPath, content, { mode: 0o644 });

  const uid = execSync('id -u').toString().trim();
  execSync(`launchctl bootstrap gui/${uid} ${plistPath}`);
}

async function uninstallAgent(label: string): Promise<void> {
  const plistPath = path.join(AGENTS_DIR, `${label}.plist`);
  const uid = execSync('id -u').toString().trim();

  try {
    execSync(`launchctl bootout gui/${uid} ${plistPath}`);
  } catch {
    // agent 可能未載入
  }
  await unlink(plistPath);
}

function isAgentLoaded(label: string): boolean {
  try {
    const output = execSync(`launchctl list ${label}`, {
      encoding: 'utf-8'
    });
    return output.includes(label);
  } catch {
    return false;
  }
}
```

### 3.3 launchd 與 Electron App 結合的架構模式

```
┌─────────────────────────────────────────┐
│  macOS launchd                          │
│  ~/Library/LaunchAgents/                │
│  com.autobackup.watcher.plist           │
│                                         │
│  觸發方式：                              │
│  - StartCalendarInterval (定時)          │
│  - WatchPaths (檔案變更)                 │
│  - StartInterval (間隔)                  │
└──────────────┬──────────────────────────┘
               │ 啟動
               ▼
┌─────────────────────────────────────────┐
│  backup-runner.js (獨立 Node.js 腳本)    │
│  - 檢查 Electron app 是否運行中          │
│  - 若運行中：透過 IPC 通知 main process  │
│  - 若未運行：直接執行備份邏輯             │
└─────────────────────────────────────────┘
```

### 3.4 無簽名 App 使用 launchd 的限制

- **LaunchAgent 本身不需要 app 簽名**：plist 指向的可以是任何可執行檔（shell script、node 腳本）
- **Electron app 啟動限制**：未簽名的 Electron app 在 macOS Gatekeeper 保護下無法直接啟動，使用者需手動允許（系統偏好設定 > 安全性與隱私權）
- **Hardened Runtime**：macOS 10.15+ 要求啟用 hardened runtime 才能正常啟動
- **建議架構**：launchd 觸發的是獨立的 Node.js 腳本（非 Electron app 本體），避開簽名限制

### 來源

- [launchd.info - A launchd Tutorial](https://www.launchd.info/)
- [Apple Developer - Creating Launch Daemons and Agents](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html)
- [launchd.plist man page](https://keith.github.io/xcode-man-pages/launchd.plist.5.html)

---

## 4. Windows Task Scheduler

### 4.1 透過 Node.js 程式化建立排程任務

#### windows-scheduler 套件

[windows-scheduler](https://github.com/AndreaFranchini/windows-scheduler) 是 `schtasks` 命令的 Node.js 封裝。

```typescript
import { create, get, update, remove, run, end } from 'windows-scheduler';

// 建立每日排程任務
await create({
  taskName: 'AutoBackup',
  taskRun: 'C:\\Apps\\auto-backup\\backup-runner.exe',
  schedule: 'DAILY',
  startTime: '03:00',
  modifier: 1  // 每 1 天
});

// 建立間隔排程
await create({
  taskName: 'BackupCheck',
  taskRun: 'C:\\Apps\\auto-backup\\check.exe',
  schedule: 'MINUTE',
  modifier: 30  // 每 30 分鐘
});

// 查詢任務
const taskInfo = await get({
  taskName: 'AutoBackup',
  format: 'LIST',
  verbose: true
});

// 立即執行
await run({ taskName: 'AutoBackup' });

// 刪除任務
await remove({ taskName: 'AutoBackup' });
```

#### 直接使用 schtasks 命令

```typescript
import { execSync } from 'node:child_process';

// 建立開機時執行的任務（以 SYSTEM 帳戶）
function createStartupTask(taskName: string, exePath: string): void {
  execSync(
    `SCHTASKS /CREATE /SC ONSTART /TN "${taskName}" ` +
    `/TR "${exePath}" /RU "NT AUTHORITY\\SYSTEM" /RL HIGHEST /F`
  );
}

// 建立登入時執行的任務（以當前使用者）
function createLogonTask(taskName: string, exePath: string): void {
  execSync(
    `SCHTASKS /CREATE /SC ONLOGON /TN "${taskName}" ` +
    `/TR "${exePath}" /RL HIGHEST /F`
  );
}

// 刪除任務
function deleteTask(taskName: string): void {
  execSync(`SCHTASKS /DELETE /TN "${taskName}" /F`);
}
```

### 4.2 排程類型

| Schedule | 說明 | Modifier 範圍 |
|----------|------|----------------|
| `MINUTE` | 每 N 分鐘 | 1-1439 |
| `HOURLY` | 每 N 小時 | 1-23 |
| `DAILY` | 每 N 天 | 1-365 |
| `WEEKLY` | 每 N 週 | 1-52 |
| `MONTHLY` | 每月指定日 | 1-12 |
| `ONSTART` | 系統啟動時 | - |
| `ONLOGON` | 使用者登入時 | - |
| `ONIDLE` | 系統閒置時 | - |

### 4.3 SYSTEM 帳戶注意事項

- 以 `NT AUTHORITY\SYSTEM` 執行可在無使用者登入時運行
- 但無法存取桌面、無法顯示 UI
- 適合背景備份服務，不適合需要 GUI 的 Electron app
- 需要存取使用者檔案時，應以使用者帳戶執行

### 來源

- [windows-scheduler GitHub](https://github.com/AndreaFranchini/windows-scheduler)
- [Automating Electron App Startup with Task Scheduler](https://neekey.net/2023/09/02/automating-startup-of-an-electron-app-on-windows-machines-using-task-scheduler/)

---

## 5. 裝置連線觸發備份

### 5.1 USB 插入事件監聽

#### node-usb（推薦，取代 usb-detection）

[node-usb](https://node-usb.github.io/node-usb/) 是目前推薦的 USB 裝置偵測方案。

```typescript
import { usb, getDeviceList } from 'usb';

// 監聽 USB 裝置連接
usb.on('attach', (device) => {
  const descriptor = device.deviceDescriptor;
  console.log('USB 裝置連接:', {
    vendorId: descriptor.idVendor,
    productId: descriptor.idProduct
  });

  // 判斷是否為目標裝置（如 iPhone）
  if (isTargetDevice(descriptor)) {
    startBackupProcess();
  }
});

// 監聽 USB 裝置移除
usb.on('detach', (device) => {
  console.log('USB 裝置移除');
});

// 列出所有 USB 裝置
const devices = getDeviceList();

// 允許 process 正常退出
usb.unrefHotplugEvents();

function isTargetDevice(descriptor: {
  idVendor: number;
  idProduct: number;
}): boolean {
  // Apple 裝置 Vendor ID = 0x05AC
  return descriptor.idVendor === 0x05AC;
}
```

#### 平台原生機制

| 平台 | 技術 | 說明 |
|------|------|------|
| macOS | IOKit | 透過 IOServiceMatching 監聽裝置連接事件 |
| Windows | WMI | 透過 Win32_DeviceChangeEvent 監聽 |
| Linux | libudev | 透過 udev rules 監聽裝置事件 |

#### 從 usb-detection 遷移

```typescript
// 舊 API（usb-detection）
usbDetect.on('add', callback);
usbDetect.on('remove', callback);
usbDetect.find();

// 新 API（node-usb）
usb.on('attach', callback);
usb.on('detach', callback);
getDeviceList();
```

### 5.2 macOS 特殊考量：WatchPaths 搭配 launchd

```xml
<!-- 當 /Volumes/ 下有新裝置掛載時觸發 -->
<key>WatchPaths</key>
<array>
  <string>/Volumes</string>
</array>
```

這是最省資源的方式：不需要常駐 process，由 launchd 在裝置掛載時觸發腳本。

### 來源

- [node-usb Documentation](https://node-usb.github.io/node-usb/)
- [usb-detection npm](https://www.npmjs.com/package/usb-detection)
- [node-usb GitHub](https://github.com/node-usb/node-usb)

---

## 6. WiFi 連線事件偵測

### 6.1 node-wifi

[node-wifi](https://github.com/friedrith/node-wifi) 支援 macOS、Windows、Linux 的 WiFi 網路管理。

```typescript
import wifi from 'node-wifi';

// 初始化
wifi.init({ iface: null }); // null = 自動選擇介面

// 取得目前連線
const connections = await wifi.getCurrentConnections();
// [{ ssid: 'HomeNetwork', bssid: '...', signal_level: -50, ... }]

// 掃描可用網路
const networks = await wifi.scan();

// 連線到指定網路
await wifi.connect({ ssid: 'NetworkName', password: 'pass123' });
```

### 6.2 網路狀態變更偵測（輪詢模式）

node-wifi 本身不提供事件監聽，需搭配輪詢機制：

```typescript
import wifi from 'node-wifi';
import cron from 'node-cron';

interface NetworkState {
  readonly ssid: string | null;
  readonly connected: boolean;
}

let previousState: NetworkState = { ssid: null, connected: false };

cron.schedule('*/10 * * * * *', async () => {
  try {
    const connections = await wifi.getCurrentConnections();
    const currentState: NetworkState = {
      ssid: connections.length > 0 ? connections[0].ssid : null,
      connected: connections.length > 0
    };

    if (currentState.ssid !== previousState.ssid) {
      onNetworkChanged(previousState, currentState);
    }
    previousState = currentState;
  } catch {
    // 網路介面暫時不可用
  }
});

function onNetworkChanged(
  prev: NetworkState,
  curr: NetworkState
): void {
  if (curr.connected && curr.ssid === 'HomeWiFi') {
    // 連上家中 WiFi，啟動備份掃描
    startBackupScan();
  }
}
```

### 6.3 平台依賴

| 平台 | 依賴工具 |
|------|----------|
| macOS | `airport`、`networksetup`（內建） |
| Windows | `netsh`（內建） |
| Linux | `nmcli`（需安裝 network-manager） |

### 來源

- [node-wifi GitHub](https://github.com/friedrith/node-wifi)

---

## 7. Electron 電源狀態管理

### 7.1 powerSaveBlocker API

[powerSaveBlocker](https://www.electronjs.org/docs/latest/api/power-save-blocker) 是 Electron main process 模組，用於阻止系統進入低電源模式。

```typescript
import { powerSaveBlocker } from 'electron';

// 兩種阻擋類型
// 1. prevent-app-suspension：允許螢幕關閉，但保持系統活躍
//    適用場景：檔案下載、背景備份
const suspensionBlockerId = powerSaveBlocker.start('prevent-app-suspension');

// 2. prevent-display-sleep：保持螢幕和系統都活躍
//    適用場景：影片播放（備份場景通常不需要）
const displayBlockerId = powerSaveBlocker.start('prevent-display-sleep');

// 檢查是否啟動中
console.log(powerSaveBlocker.isStarted(suspensionBlockerId)); // true

// 停止阻擋
powerSaveBlocker.stop(suspensionBlockerId);
```

### 7.2 備份任務中的電源管理模式

```typescript
import { powerSaveBlocker } from 'electron';

async function performBackupWithPowerGuard(): Promise<void> {
  // 備份開始前阻止系統休眠
  const blockerId = powerSaveBlocker.start('prevent-app-suspension');

  try {
    await performBackup();
  } finally {
    // 備份完成後釋放
    powerSaveBlocker.stop(blockerId);
  }
}
```

### 7.3 優先順序

`prevent-display-sleep` 優先於 `prevent-app-suspension`。當兩者同時請求時，系統會使用較嚴格的模式，直到該請求停止後才降級。

### 來源

- [Electron powerSaveBlocker API](https://www.electronjs.org/docs/latest/api/power-save-blocker)
- [Prevent System from Entering Sleep Mode - GeeksforGeeks](https://www.geeksforgeeks.org/javascript/prevent-system-from-entering-sleep-mode-in-electronjs/)

---

## 8. 背景執行時的資源限制

### 8.1 macOS App Nap

macOS 會自動對符合條件的背景 app 進入 App Nap 模式：

**觸發條件（全部滿足）：**

- App 不在前景
- 未更新可見視窗內容
- 未播放音訊
- 未設定 IOKit / NSProcessInfo assertions
- 未使用 OpenGL

**App Nap 效果：**

| 限制 | 影響 |
|------|------|
| 優先順序降低 | 減少 CPU 配額 |
| Timer 節流 | 降低 timer 觸發頻率 |
| I/O 節流 | 降低磁碟讀寫速率 |

**防止 App Nap（Electron 中）：**

```typescript
// 方法 1：使用 powerSaveBlocker（推薦）
import { powerSaveBlocker } from 'electron';
const id = powerSaveBlocker.start('prevent-app-suspension');
// 這會設定 NSProcessInfo assertion，自動阻止 App Nap

// 方法 2：透過 Info.plist 設定（全局停用）
// 在 Electron app 的 Info.plist 中加入：
// <key>NSAppSleepDisabled</key>
// <true/>
```

**注意**：Electron app（如 VS Code、Slack）通常不會進入 App Nap，因為它們持續處理 IPC 訊息。但純背景備份任務仍需主動阻止。

### 8.2 Windows 背景 App 限制

**UWP 背景任務限制：**

| 資源 | 限制 |
|------|------|
| 執行時間 | 最長 30 秒（某些觸發器可達 10 分鐘） |
| 記憶體 | 受限裝置上有記憶體上限 |
| 網路 | 前景 app 優先 |

**Desktop App（Electron）注意：**

- Windows 11 Efficiency Mode 可能降低背景 app 優先順序
- Power Throttling 會降低背景 app 的 CPU 頻率
- Electron 作為 Win32 app 受限較少，但仍會被 Efficiency Mode 影響

**因應策略：**

```typescript
// Windows 上透過 Task Scheduler 以高優先順序執行
// /RL HIGHEST 確保不受 Efficiency Mode 影響
execSync(
  `SCHTASKS /CREATE /SC DAILY /TN "AutoBackup" ` +
  `/TR "${exePath}" /ST 03:00 /RL HIGHEST /F`
);
```

### 來源

- [Apple Developer - App Nap](https://developer.apple.com/library/archive/documentation/Performance/Conceptual/power_efficiency_guidelines_osx/AppNap.html)
- [Microsoft Learn - Background task resource constraints](https://learn.microsoft.com/en-us/windows/uwp/launch-resume/guidelines-for-background-tasks)
- [Electron Performance](https://www.electronjs.org/docs/latest/tutorial/performance)

---

## 9. 排程任務的持久化

### 9.1 App 重啟後恢復排程狀態

```typescript
import Store from 'electron-store';
import cron, { ScheduledTask } from 'node-cron';

interface PersistedSchedule {
  readonly id: string;
  readonly expression: string;
  readonly enabled: boolean;
  readonly lastRun: number | null;
  readonly taskType: 'backup' | 'scan' | 'cleanup';
}

const store = new Store<{
  schedules: readonly PersistedSchedule[];
}>();

const activeTasks = new Map<string, ScheduledTask>();

// App 啟動時恢復排程
function restoreSchedules(): void {
  const schedules = store.get('schedules', []);

  for (const schedule of schedules) {
    if (!schedule.enabled) continue;

    const task = cron.schedule(schedule.expression, () => {
      executeScheduledTask(schedule);
    }, {
      recoverMissedExecutions: true
    });

    activeTasks.set(schedule.id, task);
  }
}

// 儲存排程狀態
function persistSchedule(schedule: PersistedSchedule): void {
  const schedules = store.get('schedules', []);
  const updated = [
    ...schedules.filter((s) => s.id !== schedule.id),
    schedule
  ];
  store.set('schedules', updated);
}

// 執行任務並更新 lastRun
function executeScheduledTask(schedule: PersistedSchedule): void {
  persistSchedule({
    ...schedule,
    lastRun: Date.now()
  });
  // 根據 taskType 執行對應邏輯
}
```

### 9.2 系統層級持久化（跨重啟）

| 平台 | 機制 | 說明 |
|------|------|------|
| macOS | LaunchAgent plist | 使用者登入後自動載入，系統重啟後仍有效 |
| Windows | Task Scheduler | 支援 ONSTART / ONLOGON 觸發，不依賴 app |
| 跨平台 | electron-store + node-cron | app 內排程，需 app 運行中 |

### 9.3 混合策略（推薦）

```
系統層級排程（launchd / Task Scheduler）
  └─ 確保 Electron app 在指定時間啟動
      └─ App 內部排程（node-cron）
          └─ 管理細粒度的備份任務
              └─ 狀態持久化（electron-store / SQLite）
                  └─ 重啟後恢復排程狀態
```

---

## 10. 多個排程任務的優先順序管理

### 10.1 任務優先順序設計

```typescript
enum TaskPriority {
  CRITICAL = 0,   // USB 裝置連接觸發的即時備份
  HIGH = 1,        // 使用者手動觸發的備份
  NORMAL = 2,      // 定時排程備份
  LOW = 3,         // 清理、索引等維護任務
  IDLE = 4         // 系統閒置時才執行
}

interface ScheduledBackupTask {
  readonly id: string;
  readonly priority: TaskPriority;
  readonly expression: string;
  readonly handler: () => Promise<void>;
  readonly maxConcurrent: number;
}

class TaskScheduler {
  private readonly queue: ScheduledBackupTask[] = [];
  private runningCount = 0;
  private readonly maxConcurrent = 2;

  enqueue(task: ScheduledBackupTask): void {
    // 按優先順序插入（immutable 風格）
    const newQueue = [...this.queue, task].sort(
      (a, b) => a.priority - b.priority
    );
    // 注意：此處為示意，實際應使用 class 內部狀態管理
    this.queue.length = 0;
    this.queue.push(...newQueue);
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    while (
      this.queue.length > 0 &&
      this.runningCount < this.maxConcurrent
    ) {
      const task = this.queue.shift();
      if (task === undefined) break;

      this.runningCount++;
      try {
        await task.handler();
      } finally {
        this.runningCount--;
        this.processQueue();
      }
    }
  }
}
```

### 10.2 衝突處理策略

| 情境 | 處理方式 |
|------|----------|
| 兩個備份同時觸發 | 依優先順序排隊，同時最多執行 N 個 |
| USB 備份進行中遇到定時備份 | USB 備份（CRITICAL）優先完成 |
| 系統資源不足 | 暫停 LOW/IDLE 任務，優先執行 HIGH+ |
| 同一裝置重複備份 | 使用 debounce，忽略短時間內的重複觸發 |
| App 即將關閉 | 等待 CRITICAL 任務完成，中止 LOW 任務 |

---

## 11. 技術選型建議摘要

| 需求 | macOS 方案 | Windows 方案 | 跨平台方案 |
|------|-----------|-------------|-----------|
| 定時排程 | launchd + StartCalendarInterval | Task Scheduler (DAILY) | node-cron |
| 間隔執行 | launchd + StartInterval | Task Scheduler (MINUTE) | node-cron |
| 檔案變更觸發 | launchd + WatchPaths | - | chokidar |
| USB 連接觸發 | IOKit（透過 node-usb） | WMI（透過 node-usb） | node-usb |
| WiFi 事件 | airport + 輪詢 | netsh + 輪詢 | node-wifi + node-cron |
| 防止休眠 | powerSaveBlocker | powerSaveBlocker | Electron API |
| 開機自啟動 | LaunchAgent (RunAtLoad) | Task Scheduler (ONLOGON) | app.setLoginItemSettings |
| 狀態持久化 | electron-store | electron-store | electron-store / SQLite |
