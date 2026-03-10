# Electron 跨平台檔案路徑處理

> 研究日期：2026-03-10
> 適用 Electron 版本：v28+（Electron 34 為當前最新穩定版）

## 目錄

1. [path.join / path.resolve 的平台差異](#1-pathjoin--pathresolve-的平台差異)
2. [app.getPath() 各參數實際路徑對照](#2-appgetpath-各參數實際路徑對照)
3. [外接硬碟路徑設計差異](#3-外接硬碟路徑設計差異)
4. [外接硬碟偵測方案](#4-外接硬碟偵測方案)
5. [dialog.showOpenDialog 跨平台行為差異](#5-dialogshowopendialog-跨平台行為差異)
6. [備份路徑驗證](#6-備份路徑驗證)
7. [Settings UI 路徑選擇設計](#7-settings-ui-路徑選擇設計)
8. [路徑顯示的跨平台標準化](#8-路徑顯示的跨平台標準化)
9. [完整實作範例](#9-完整實作範例)

---

## 1. path.join / path.resolve 的平台差異

### 核心差異：分隔符

| 屬性 | Windows | macOS / Linux (POSIX) |
|------|---------|----------------------|
| `path.sep` | `\`（反斜線） | `/`（正斜線） |
| `path.delimiter` | `;` | `:` |
| 路徑大小寫 | 不敏感（case-insensitive） | 敏感（case-sensitive） |
| 磁碟根路徑 | `C:\`、`D:\` | `/` |
| UNC 路徑 | `\\server\share` | 不適用 |

### path.sep 差異範例

```javascript
const path = require('node:path');

// POSIX (macOS/Linux)
console.log(path.sep); // '/'
'foo/bar/baz'.split(path.sep); // ['foo', 'bar', 'baz']

// Windows
console.log(path.sep); // '\\'
'foo\\bar\\baz'.split(path.sep); // ['foo', 'bar', 'baz']
```

### path.join 差異範例

```javascript
// macOS 執行結果
path.join('/Users', 'tomas', 'Documents', 'backup');
// → '/Users/tomas/Documents/backup'

// Windows 執行結果
path.join('C:\\Users', 'tomas', 'Documents', 'backup');
// → 'C:\\Users\\tomas\\Documents\\backup'
```

### path.resolve 差異範例

```javascript
// macOS
path.resolve('/foo/bar', './baz');
// → '/foo/bar/baz'

path.resolve('/foo/bar', '../baz');
// → '/foo/baz'

// Windows
path.resolve('C:\\foo', 'bar');
// → 'C:\\foo\\bar'

// Windows 注意：per-drive 工作目錄
path.resolve('C:')  // 不同於 path.resolve('C:\\')
```

### path.basename 的跨平台陷阱

```javascript
// macOS 上解析 Windows 路徑 → 錯誤結果
path.basename('C:\\temp\\myfile.html');
// → 'C:\\temp\\myfile.html'  ← 整段被當成檔名

// 正確做法：使用 path.win32 強制指定平台
path.win32.basename('C:\\temp\\myfile.html');
// → 'myfile.html'  ← 正確

// 同樣地，Windows 上解析 POSIX 路徑
path.posix.basename('/tmp/myfile.html');
// → 'myfile.html'  ← 正確
```

### 最佳實踐：永遠使用 path API，禁止手動字串串接

```javascript
// ❌ 錯誤：手動串接，Windows 上會出問題
const badPath = userData + '\\' + 'config.json';

// ✅ 正確：path.join 自動處理平台分隔符
const goodPath = path.join(app.getPath('userData'), 'config.json');
```

---

## 2. app.getPath() 各參數實際路徑對照

### 完整路徑對照表

| 參數名稱 | Windows 實際路徑 | macOS 實際路徑 | 說明 |
|---------|----------------|--------------|------|
| `home` | `C:\Users\username` | `/Users/username` | 使用者家目錄 |
| `appData` | `C:\Users\username\AppData\Roaming` | `~/Library/Application Support` | 應用資料根目錄 |
| `userData` | `C:\Users\username\AppData\Roaming\AppName` | `~/Library/Application Support/AppName` | 應用設定檔（最常用） |
| `sessionData` | 同 `userData`（預設） | 同 `userData`（預設） | Chromium session 資料 |
| `temp` | `C:\Users\username\AppData\Local\Temp` | `/var/folders/.../T/` | 系統暫存目錄 |
| `exe` | `C:\Program Files\AppName\AppName.exe` | `/Applications/AppName.app/Contents/MacOS/AppName` | 目前執行檔 |
| `desktop` | `C:\Users\username\Desktop` | `~/Desktop` | 使用者桌面 |
| `documents` | `C:\Users\username\Documents` | `~/Documents` | 文件資料夾 |
| `downloads` | `C:\Users\username\Downloads` | `~/Downloads` | 下載資料夾 |
| `music` | `C:\Users\username\Music` | `~/Music` | 音樂資料夾 |
| `pictures` | `C:\Users\username\Pictures` | `~/Pictures` | 圖片資料夾 |
| `videos` | `C:\Users\username\Videos` | `~/Movies` | 影片資料夾 |
| `logs` | `C:\Users\username\AppData\Roaming\AppName\logs` | `~/Library/Logs/AppName` | 應用日誌 |
| `crashDumps` | `C:\Users\username\AppData\Roaming\AppName\Crash Reports` | `~/Library/Logs/DiagnosticMessages` | 崩潰報告 |
| `recent` | `C:\Users\username\AppData\Roaming\Microsoft\Windows\Recent` | **不支援**（拋出 Error） | 最近文件（僅 Windows） |

> **注意**：`recent` 為 Windows 專屬參數，macOS 呼叫會拋出錯誤。

### 使用範例

```javascript
import { app } from 'electron';
import path from 'node:path';

// 取得 userData 路徑（跨平台安全）
const userDataPath = app.getPath('userData');
// Windows: C:\Users\tomas\AppData\Roaming\AutoBackup
// macOS:   /Users/tomas/Library/Application Support/AutoBackup

// 建立應用設定檔路徑
const configPath = path.join(userDataPath, 'config.json');

// 取得下載資料夾
const downloadsPath = app.getPath('downloads');
// Windows: C:\Users\tomas\Downloads
// macOS:   /Users/tomas/Downloads

// 平台安全的路徑存取
function getAppPath(name: Parameters<typeof app.getPath>[0]): string {
  try {
    return app.getPath(name);
  } catch {
    // 'recent' 在 macOS 會拋出錯誤
    return app.getPath('home');
  }
}
```

### Windows AppX 套件特殊路徑

若應用透過 Microsoft Store 以 AppX 封裝發布，`userData` 路徑會不同：

```
C:\Users\username\AppData\Local\Packages\{AppId}\LocalCache\Roaming\{AppName}
```

---

## 3. 外接硬碟路徑設計差異

### 根本架構差異

| 面向 | Windows | macOS |
|------|---------|-------|
| 根概念 | 磁碟代號（Drive Letter） | 單一根目錄 `/` |
| 外接硬碟路徑 | `D:\`、`E:\`、`F:\` 等 | `/Volumes/DriveName` |
| 路徑格式 | `D:\Backup\Photos` | `/Volumes/MyDrive/Backup/Photos` |
| 識別方式 | 代號（不含名稱） | 磁碟名稱（掛載點） |
| 拔除後 | 代號消失 | `/Volumes/DriveName` 消失 |

### Windows 磁碟代號機制

```
內建硬碟：C:\（系統磁碟）
外接 HDD：D:\、E:\ ...（動態分配）
USB 隨身碟：E:\、F:\ ...
網路磁碟：Z:\（常見慣例）
```

**挑戰**：代號不固定，同一個外接硬碟下次插入可能是不同代號。

### macOS /Volumes/ 機制

```
內建磁碟：/          （根目錄）
外接 HDD：/Volumes/MyDrive
USB 隨身碟：/Volumes/USB_DRIVE
Time Machine：/Volumes/Time Machine Backups
```

**優點**：磁碟名稱穩定，只要不重新格式化就不變。

---

## 4. 外接硬碟偵測方案

### 方案一：node-disk-info（推薦，跨平台）

```bash
npm install node-disk-info
```

```javascript
import nodeDiskInfo from 'node-disk-info';

interface DriveInfo {
  filesystem: string;  // 檔案系統名稱
  blocks: number;      // 總容量（bytes）
  used: number;        // 已使用
  available: number;   // 可用空間
  capacity: string;    // 使用率（如 '45%'）
  mounted: string;     // 掛載點（Windows: 'C:', macOS: '/Volumes/Drive'）
}

async function listExternalDrives(): Promise<DriveInfo[]> {
  const disks = await nodeDiskInfo.getDiskInfo();

  if (process.platform === 'win32') {
    // Windows：過濾掉 C: 系統磁碟
    return disks.filter(disk => !disk.mounted.startsWith('C'));
  } else {
    // macOS：只取 /Volumes/ 下的（排除根目錄 /）
    return disks.filter(disk => disk.mounted.startsWith('/Volumes/'));
  }
}
```

### 方案二：原生系統指令（更精確）

```javascript
import { execSync } from 'node:child_process';

function getExternalDrives(): Array<{ name: string; path: string; available: number }> {
  if (process.platform === 'win32') {
    // Windows：使用 WMIC 取得磁碟清單
    // DriveType=2: 可移除磁碟, DriveType=3: 固定磁碟（外接HDD通常是3）
    const output = execSync(
      'wmic logicaldisk get Caption,VolumeName,DriveType,FreeSpace /format:csv'
    ).toString();

    return output.split('\n')
      .slice(2) // 跳過標頭
      .filter(line => line.trim())
      .map(line => {
        const [, caption, driveType, freeSpace, volumeName] = line.split(',');
        return {
          name: volumeName?.trim() || caption?.trim() || '',
          path: `${caption?.trim()}\\`,
          available: parseInt(freeSpace?.trim() || '0'),
          driveType: parseInt(driveType?.trim() || '0'),
        };
      })
      .filter(drive =>
        // DriveType 2=可移除, 3=固定（包含外接HDD）
        drive.driveType === 2 || drive.driveType === 3
      )
      .filter(drive => !drive.path.startsWith('C')); // 排除系統磁碟
  } else {
    // macOS：讀取 /Volumes/ 目錄
    const fs = require('node:fs');
    const volumesPath = '/Volumes';

    try {
      const entries = fs.readdirSync(volumesPath, { withFileTypes: true });
      return entries
        .filter((entry: any) => entry.isDirectory() || entry.isSymbolicLink())
        .map((entry: any) => {
          const drivePath = `${volumesPath}/${entry.name}`;
          try {
            const stat = fs.statfsSync(drivePath);
            return {
              name: entry.name,
              path: drivePath,
              available: stat.bfree * stat.bsize,
            };
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    } catch {
      return [];
    }
  }
}
```

### 方案三：fs.readdirSync /Volumes（macOS 專用，最簡單）

```javascript
import fs from 'node:fs';

function getMacOSExternalDrives(): string[] {
  if (process.platform !== 'darwin') return [];

  try {
    return fs.readdirSync('/Volumes').map(name => `/Volumes/${name}`);
  } catch {
    return [];
  }
}
```

### 各方案比較

| 方案 | 優點 | 缺點 | 適用場景 |
|------|------|------|---------|
| `node-disk-info` | 跨平台、有容量資訊 | 額外依賴 | 生產環境推薦 |
| 原生 WMIC / readdirSync | 無依賴 | 需各平台分別處理 | 簡單需求 |
| `drivelist` npm 套件 | 有 isRemovable 屬性 | 需 native addon | 需精確識別可移除磁碟 |

---

## 5. dialog.showOpenDialog 跨平台行為差異

### 關鍵行為差異

| 行為 | Windows | macOS | Linux |
|------|---------|-------|-------|
| 同時選檔案+目錄 | **不支援**（只顯示目錄選擇器） | 支援 | **不支援** |
| `defaultPath` 支援 | 完整支援 | 完整支援 | 僅 portal v4+ 支援 |
| `message` 參數 | **無效** | 顯示於對話框上方 | **無效** |
| `createDirectory` | 不支援 | **macOS 專屬** | 不支援 |
| `noResolveAliases` | 不支援 | **macOS 專屬** | 不支援 |
| `treatPackageAsDirectory` | 不支援 | **macOS 專屬** | 不支援 |
| `promptToCreate` | **Windows 專屬** | 不支援 | 不支援 |
| `dontAddToRecent` | **Windows 專屬** | 不支援 | 不支援 |

### 標準使用範例

```typescript
import { dialog, BrowserWindow } from 'electron';
import path from 'node:path';

interface OpenDialogOptions {
  win: BrowserWindow;
  title?: string;
  defaultPath?: string;
}

async function selectBackupDirectory(
  options: OpenDialogOptions
): Promise<string | undefined> {
  const properties: Electron.OpenDialogOptions['properties'] = [
    'openDirectory',
    'createDirectory', // macOS only，其他平台忽略
  ];

  const result = await dialog.showOpenDialog(options.win, {
    title: options.title ?? '選擇備份目的地',
    defaultPath: options.defaultPath ?? getDefaultBackupPath(),
    properties,
    message: '請選擇外接硬碟或備份目錄', // 僅 macOS 顯示
    buttonLabel: '選擇此目錄',
  });

  if (result.canceled || result.filePaths.length === 0) {
    return undefined;
  }

  return result.filePaths[0];
}

function getDefaultBackupPath(): string {
  if (process.platform === 'win32') {
    // Windows：預設開啟到「本機」或 D:\
    return 'D:\\';
  } else {
    // macOS：預設開啟到 /Volumes/
    return '/Volumes';
  }
}
```

### filters 過濾器設定

```typescript
// filters 格式：副檔名不含點號和萬用字元
const result = await dialog.showOpenDialog(win, {
  title: '選擇備份設定檔',
  filters: [
    { name: 'JSON 設定檔', extensions: ['json'] },    // ✅ 正確
    { name: '所有文字檔', extensions: ['txt', 'md'] }, // ✅ 正確
    { name: '所有檔案', extensions: ['*'] },           // ✅ 顯示全部
    // { name: 'JSON', extensions: ['.json'] },        // ❌ 錯誤：有點號
    // { name: 'JSON', extensions: ['*.json'] },       // ❌ 錯誤：有萬用字元
  ],
  properties: ['openFile'],
});
```

---

## 6. 備份路徑驗證

### fs.existsSync 跨平台差異

`fs.existsSync` 本身行為一致，但路徑格式不同需特別處理：

```typescript
import fs from 'node:fs';
import path from 'node:path';

interface PathValidationResult {
  exists: boolean;
  isDirectory: boolean;
  isWritable: boolean;
  availableSpace?: number;
  error?: string;
}

async function validateBackupPath(targetPath: string): Promise<PathValidationResult> {
  // 1. 基本存在性檢查
  if (!fs.existsSync(targetPath)) {
    return {
      exists: false,
      isDirectory: false,
      isWritable: false,
      error: `路徑不存在：${targetPath}`,
    };
  }

  // 2. 確認是目錄
  const stat = fs.statSync(targetPath);
  if (!stat.isDirectory()) {
    return {
      exists: true,
      isDirectory: false,
      isWritable: false,
      error: '路徑非目錄',
    };
  }

  // 3. 確認可寫入（fs.access 的 Promise 版本）
  let isWritable = false;
  try {
    await fs.promises.access(targetPath, fs.constants.W_OK);
    isWritable = true;
  } catch {
    isWritable = false;
  }

  // 4. 取得可用空間（Node.js 18+ 支援 statfs）
  let availableSpace: number | undefined;
  try {
    const statfs = await fs.promises.statfs(targetPath);
    availableSpace = statfs.bfree * statfs.bsize;
  } catch {
    // statfs 在舊版 Node.js 或特殊 FS 可能不支援
  }

  return {
    exists: true,
    isDirectory: true,
    isWritable,
    availableSpace,
  };
}
```

### Windows 路徑驗證的特殊注意

```typescript
function sanitizeWindowsPath(inputPath: string): string {
  // Windows 路徑中的非法字元：< > : " | ? *
  // 注意：: 在磁碟代號中是合法的（如 C:）
  const illegalCharsInFilename = /[<>"|?*]/g;

  // 禁止目錄遍歷
  const withoutTraversal = inputPath.replace(/\.\./g, '');

  return withoutTraversal.replace(illegalCharsInFilename, '');
}

function normalizePathForPlatform(inputPath: string): string {
  if (process.platform === 'win32') {
    // Windows：確保使用正確的反斜線（Node.js path.normalize 會處理）
    return path.normalize(inputPath);
  } else {
    // macOS/Linux：確保使用正斜線
    return path.normalize(inputPath);
  }
}
```

### 備份前路徑完整驗證流程

```typescript
const MIN_FREE_SPACE_BYTES = 1024 * 1024 * 1024; // 1 GB

async function validateAndPrepareBackupPath(targetPath: string): Promise<void> {
  const normalized = normalizePathForPlatform(targetPath);
  const validation = await validateBackupPath(normalized);

  if (!validation.exists) {
    // 嘗試建立目錄
    fs.mkdirSync(normalized, { recursive: true });
  }

  if (!validation.isWritable) {
    throw new Error(`備份目錄無寫入權限：${normalized}`);
  }

  if (
    validation.availableSpace !== undefined &&
    validation.availableSpace < MIN_FREE_SPACE_BYTES
  ) {
    const gbAvailable = (validation.availableSpace / 1024 ** 3).toFixed(1);
    throw new Error(`可用空間不足：目前剩餘 ${gbAvailable} GB，需要至少 1 GB`);
  }
}
```

---

## 7. Settings UI 路徑選擇設計

### 設計原則

```
1. Windows：預設顯示磁碟清單（C:, D:, E: ...），讓使用者選磁碟後再選目錄
2. macOS：預設顯示 /Volumes/ 下的磁碟清單，讓使用者選取
3. 兩平台皆提供「瀏覽...」按鈕呼叫 dialog.showOpenDialog
4. 路徑輸入框支援手動輸入（進階使用者）
```

### Settings UI 主體元件（React + Electron IPC）

```typescript
// renderer/components/BackupPathSelector.tsx

interface BackupPathSelectorProps {
  value: string;
  onChange: (newPath: string) => void;
}

interface DriveOption {
  label: string;   // 顯示名稱（如 "My Drive (D:)" 或 "My Drive (/Volumes/MyDrive)"）
  value: string;   // 實際路徑
  available?: number;  // 可用空間（bytes）
}

export function BackupPathSelector({ value, onChange }: BackupPathSelectorProps) {
  const [drives, setDrives] = useState<DriveOption[]>([]);
  const isWindows = navigator.platform.includes('Win');

  useEffect(() => {
    // 透過 IPC 取得磁碟清單
    window.electronAPI.listExternalDrives().then((driveList) => {
      setDrives(driveList.map(formatDriveOption));
    });
  }, []);

  const handleBrowse = async () => {
    const selected = await window.electronAPI.selectDirectory(value);
    if (selected) onChange(selected);
  };

  return (
    <div className="backup-path-selector">
      {/* 磁碟快速選擇 */}
      {drives.length > 0 && (
        <div className="drive-list">
          <label>外接磁碟</label>
          <div className="drives">
            {drives.map(drive => (
              <button
                key={drive.value}
                className={value.startsWith(drive.value) ? 'active' : ''}
                onClick={() => onChange(drive.value)}
              >
                <span className="drive-name">{drive.label}</span>
                {drive.available && (
                  <span className="drive-space">
                    {formatBytes(drive.available)} 可用
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 路徑輸入與瀏覽 */}
      <div className="path-input-group">
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={isWindows ? 'D:\\Backup' : '/Volumes/MyDrive/Backup'}
        />
        <button onClick={handleBrowse}>瀏覽...</button>
      </div>

      {/* 路徑顯示（標準化後） */}
      {value && (
        <div className="path-display">
          <span className="path-label">備份至：</span>
          <span className="path-value">{formatDisplayPath(value)}</span>
        </div>
      )}
    </div>
  );
}
```

---

## 8. 路徑顯示的跨平台標準化

### 顯示策略

```typescript
// 依平台顯示正確格式的路徑
function formatDisplayPath(rawPath: string): string {
  if (process.platform === 'win32') {
    // Windows：確保顯示反斜線（符合使用者習慣）
    return rawPath.replace(/\//g, '\\');
  } else {
    // macOS/Linux：確保顯示正斜線
    return rawPath.replace(/\\/g, '/');
  }
}

// 縮短長路徑以適合 UI 顯示
function truncateDisplayPath(rawPath: string, maxLength: number = 50): string {
  const display = formatDisplayPath(rawPath);
  if (display.length <= maxLength) return display;

  // 保留頭尾，中間用 ... 替代
  const sep = process.platform === 'win32' ? '\\' : '/';
  const parts = display.split(sep);
  const first = parts[0]; // C: 或 /Volumes/DriveName
  const last = parts[parts.length - 1];

  return `${first}${sep}...${sep}${last}`;
}

// 格式化磁碟選項標籤
function formatDriveOption(drive: { name: string; path: string; available?: number }): DriveOption {
  if (process.platform === 'win32') {
    // Windows：顯示 "Volume Name (D:)"
    const driveLetter = drive.path.replace('\\', '');
    return {
      label: drive.name ? `${drive.name} (${driveLetter})` : driveLetter,
      value: drive.path,
      available: drive.available,
    };
  } else {
    // macOS：顯示磁碟名稱
    return {
      label: drive.name, // /Volumes/ 下的目錄名即為磁碟名
      value: drive.path,
      available: drive.available,
    };
  }
}
```

### 路徑的儲存格式建議

```typescript
// 儲存時：統一使用正斜線（JSON 友好）
function serializePath(nativePath: string): string {
  return nativePath.replace(/\\/g, '/');
}

// 讀取時：還原為平台原生格式
function deserializePath(storedPath: string): string {
  if (process.platform === 'win32') {
    return storedPath.replace(/\//g, '\\');
  }
  return storedPath;
}

// electron-store 設定範例
const store = new Store({
  schema: {
    backupPath: {
      type: 'string',
      default: '',
    },
  },
});

// 儲存
store.set('backupPath', serializePath(selectedPath));

// 讀取
const backupPath = deserializePath(store.get('backupPath'));
```

---

## 9. 完整實作範例

### Main Process：IPC 處理器

```typescript
// main/ipc/pathHandlers.ts

import { ipcMain, dialog, BrowserWindow, app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import nodeDiskInfo from 'node-disk-info';

export function registerPathHandlers(): void {

  // 列出外接磁碟
  ipcMain.handle('list-external-drives', async () => {
    try {
      const disks = await nodeDiskInfo.getDiskInfo();
      const platform = process.platform;

      const externalDisks = disks.filter(disk => {
        if (platform === 'win32') {
          return !disk.mounted.toUpperCase().startsWith('C');
        }
        return disk.mounted.startsWith('/Volumes/');
      });

      return externalDisks.map(disk => ({
        name: platform === 'win32'
          ? disk.filesystem
          : disk.mounted.replace('/Volumes/', ''),
        path: platform === 'win32'
          ? `${disk.mounted}\\`
          : disk.mounted,
        available: disk.available * 1024, // 轉為 bytes
      }));
    } catch (error) {
      return [];
    }
  });

  // 開啟目錄選擇對話框
  ipcMain.handle('select-directory', async (event, defaultPath?: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return null;

    const resolvedDefault = defaultPath ?? (
      process.platform === 'win32' ? 'D:\\' : '/Volumes'
    );

    const result = await dialog.showOpenDialog(win, {
      title: '選擇備份目的地',
      defaultPath: resolvedDefault,
      properties: [
        'openDirectory',
        'createDirectory', // macOS only
      ],
      message: '請選擇外接硬碟或備份目錄', // macOS only
      buttonLabel: '選擇此目錄',
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  // 驗證備份路徑
  ipcMain.handle('validate-backup-path', async (_event, targetPath: string) => {
    const exists = fs.existsSync(targetPath);
    if (!exists) {
      return { valid: false, error: '路徑不存在' };
    }

    const stat = fs.statSync(targetPath);
    if (!stat.isDirectory()) {
      return { valid: false, error: '路徑不是目錄' };
    }

    try {
      await fs.promises.access(targetPath, fs.constants.W_OK);
    } catch {
      return { valid: false, error: '沒有寫入權限' };
    }

    let availableSpace: number | undefined;
    try {
      const statfs = await fs.promises.statfs(targetPath);
      availableSpace = statfs.bfree * statfs.bsize;
    } catch {
      // statfs 不支援時略過
    }

    return { valid: true, availableSpace };
  });
}
```

### Preload：型別安全的 IPC Bridge

```typescript
// preload/index.ts

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  listExternalDrives: () =>
    ipcRenderer.invoke('list-external-drives'),
  selectDirectory: (defaultPath?: string) =>
    ipcRenderer.invoke('select-directory', defaultPath),
  validateBackupPath: (targetPath: string) =>
    ipcRenderer.invoke('validate-backup-path', targetPath),
});
```

---

## 來源連結

- [Electron app API 官方文件](https://www.electronjs.org/docs/latest/api/app)
- [Electron dialog API 官方文件](https://www.electronjs.org/docs/latest/api/dialog)
- [Node.js path 模組官方文件](https://nodejs.org/api/path.html)
- [node-disk-info GitHub](https://github.com/cristiammercado/node-disk-info)
- [node-disk-info npm](https://www.npmjs.com/package/node-disk-info)
- [drivelist npm](https://www.npmjs.com/package/drivelist)
- [How to store user data in Electron - Cameron Nokes](https://cameronnokes.com/blog/how-to-store-user-data-in-electron/)
- [app.getPath('userData') 路徑討論 Issue #6628](https://github.com/electron/electron/issues/6628)
- [app.getPath AppX 套件 Issue #39636](https://github.com/electron/electron/issues/39636)
- [Electron cross-platform app development guide](https://www.electronjs.org/docs/latest/tutorial/performance)
- [Node.js path.join Method - GeeksforGeeks](https://www.geeksforgeeks.org/node-js-path-join-method/)
- [Node.js path.resolve Method - GeeksforGeeks](https://www.geeksforgeeks.org/node-js-path-resolve-method/)
