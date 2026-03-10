# electron-store 使用模式研究

> 收集日期：2026-03-10
> 研究範圍：electron-store v9+ 在 Electron 主進程中的架構設計與 TypeScript 整合

---

## 1. 版本現況

| 項目 | 資訊 |
|------|------|
| 最新版本 | **v11.0.2**（2024-10-05 發布） |
| 重大版本 | v9.0.0 引入純 ESM 轉換（Breaking Change） |
| 最低需求 | Node.js 20+，Electron 30+ |
| 模組格式 | **純 ESM**，無 CommonJS export |
| 儲存格式 | JSON，位置為 `app.getPath('userData')` |

**v9 → v11 主要破壞性變更：**
- 移除 CommonJS 支援，改為純 ESM
- 所有 `require('electron-store')` 必須改為 `import Store from 'electron-store'`
- 任何 CJS 專案必須先遷移至 ESM 才能使用

來源：[electron-store Releases](https://github.com/sindresorhus/electron-store/releases)

---

## 2. 安裝與基本用法

### 安裝

```bash
npm install electron-store
```

> 注意：`electron-store` 內建 TypeScript 型別定義，**不需要**另外安裝 `@types/electron-store`。

### 基本操作

```typescript
import Store from 'electron-store';

const store = new Store();

// 寫入
store.set('theme', 'dark');
store.set('window.width', 1200);  // 支援 dot-notation 巢狀路徑

// 讀取
const theme = store.get('theme');           // 'dark'
const width = store.get('window.width');    // 1200
const missing = store.get('foo', 'default'); // 有 fallback 預設值

// 刪除
store.delete('theme');

// 檢查存在
store.has('theme'); // boolean

// 陣列操作
store.appendToArray('logs', { timestamp: Date.now(), message: 'ok' });

// 重設為預設值
store.reset('theme');
```

---

## 3. TypeScript 型別定義方式（Generic Schema）

### 3.1 定義 Schema 介面

```typescript
// src/main/store/types.ts
import type { JSONSchemaType } from 'ajv';

export interface Settings {
  theme: 'light' | 'dark' | 'system';
  language: string;
  autoStart: boolean;
  backupIntervalMinutes: number;
  sourcePaths: string[];
  destinationPath: string;
}

export interface BackupRecord {
  id: string;
  timestamp: number;
  sourcePath: string;
  destinationPath: string;
  status: 'success' | 'failed' | 'partial';
  fileCount: number;
  totalBytes: number;
  errorMessage?: string;
}
```

### 3.2 定義 JSON Schema（搭配 ajv 驗證）

```typescript
// src/main/store/settings-store.ts
import Store from 'electron-store';
import type { JSONSchemaType } from 'ajv';
import type { Settings } from './types';

const schema: JSONSchemaType<Settings> = {
  type: 'object',
  properties: {
    theme: {
      type: 'string',
      enum: ['light', 'dark', 'system'],
      default: 'system',
    },
    language: {
      type: 'string',
      default: 'zh-TW',
    },
    autoStart: {
      type: 'boolean',
      default: false,
    },
    backupIntervalMinutes: {
      type: 'number',
      minimum: 1,
      maximum: 1440,
      default: 60,
    },
    sourcePaths: {
      type: 'array',
      items: { type: 'string' },
      default: [],
    },
    destinationPath: {
      type: 'string',
      default: '',
    },
  },
  required: [
    'theme',
    'language',
    'autoStart',
    'backupIntervalMinutes',
    'sourcePaths',
    'destinationPath',
  ],
  additionalProperties: false,
};

// 以 generic 實例化，讓 store.get() / store.set() 有完整型別推斷
export const settingsStore = new Store<Settings>({
  name: 'settings',   // 對應儲存檔案 settings.json
  schema,
  defaults: {
    theme: 'system',
    language: 'zh-TW',
    autoStart: false,
    backupIntervalMinutes: 60,
    sourcePaths: [],
    destinationPath: '',
  },
});
```

### 3.3 STORE_KEYS 常數模式（型別安全的 key 存取）

```typescript
export const SETTINGS_KEYS = {
  THEME: 'theme',
  LANGUAGE: 'language',
  AUTO_START: 'autoStart',
  BACKUP_INTERVAL: 'backupIntervalMinutes',
  SOURCE_PATHS: 'sourcePaths',
  DESTINATION_PATH: 'destinationPath',
} as const satisfies Record<string, keyof Settings>;
```

來源：[Using Typescript with electron-store - Ryosuke](https://whoisryosuke.com/blog/2022/using-typescript-with-electron-store/)，[electron-store with TypeScript Example - DEV Community](https://dev.to/anasrin/electron-store-with-typescript-example-108j)

---

## 4. 為何不應在 Renderer 直接存取 Store

### 4.1 安全性問題

現代 Electron 應用要求啟用 `contextIsolation: true` 並禁用 `nodeIntegration`。在這個安全模型下：

- Renderer 進程運行於 **沙盒環境**，無法直接存取 Node.js API
- `electron-store` 需要 Node.js 的 `fs` 模組，只有主進程有權存取
- 直接在 Renderer 使用 `Store` 會繞過 contextIsolation，產生安全漏洞

### 4.2 架構原則

```
┌─────────────────────────────────────────────┐
│  Main Process（信任區域）                    │
│  - 持有 electron-store 實例                  │
│  - 管理 ipcMain.handle() 處理器              │
│  - 所有檔案系統操作都在此層                  │
└────────────────┬────────────────────────────┘
                 │ IPC（結構化序列化）
┌────────────────▼────────────────────────────┐
│  Preload Script（橋接層）                    │
│  - 透過 contextBridge 暴露有限 API           │
│  - 只暴露必要的操作，不暴露整個 ipcRenderer  │
└────────────────┬────────────────────────────┘
                 │ window.electronAPI
┌────────────────▼────────────────────────────┐
│  Renderer Process（不受信任）                │
│  - 只能呼叫 contextBridge 暴露的方法         │
│  - 無法直接存取 Node.js / Electron API       │
└─────────────────────────────────────────────┘
```

> **重要**：即使 Electron 提供 `Store.initRenderer()` 方法允許在 Renderer 建立 Store，在現代 Electron 安全架構中仍**不建議**此做法，因為它需要開啟 `nodeIntegration`。

來源：[Electron Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)，[Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)

---

## 5. 透過 IPC 讓 Renderer 讀寫 Store 的典型實作

### 5.1 Main Process：IPC 處理器（`src/main/ipc/store-handlers.ts`）

```typescript
import { ipcMain } from 'electron';
import { settingsStore, SETTINGS_KEYS } from '../store/settings-store';
import { backupHistoryStore } from '../store/backup-history-store';
import type { Settings, BackupRecord } from '../store/types';

export function registerStoreHandlers(): void {
  // Settings：讀取全部
  ipcMain.handle('store:settings:getAll', (): Settings => {
    return settingsStore.store; // 返回完整 store 物件
  });

  // Settings：讀取單一欄位
  ipcMain.handle(
    'store:settings:get',
    <K extends keyof Settings>(
      _event: Electron.IpcMainInvokeEvent,
      key: K
    ): Settings[K] => {
      return settingsStore.get(key);
    }
  );

  // Settings：寫入單一欄位
  ipcMain.handle(
    'store:settings:set',
    <K extends keyof Settings>(
      _event: Electron.IpcMainInvokeEvent,
      key: K,
      value: Settings[K]
    ): void => {
      settingsStore.set(key, value);
    }
  );

  // BackupHistory：新增紀錄
  ipcMain.handle(
    'store:backup:add',
    (_event: Electron.IpcMainInvokeEvent, record: BackupRecord): void => {
      const existing = backupHistoryStore.get('records');
      backupHistoryStore.set('records', [...existing, record]);
    }
  );

  // BackupHistory：讀取所有紀錄
  ipcMain.handle('store:backup:getAll', (): BackupRecord[] => {
    return backupHistoryStore.get('records');
  });
}
```

### 5.2 Preload Script（`src/preload/index.ts`）

```typescript
import { contextBridge, ipcRenderer } from 'electron';
import type { Settings, BackupRecord } from '../main/store/types';

// 定義暴露給 Renderer 的 API 型別
export interface StoreAPI {
  settings: {
    getAll: () => Promise<Settings>;
    get: <K extends keyof Settings>(key: K) => Promise<Settings[K]>;
    set: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>;
  };
  backup: {
    add: (record: BackupRecord) => Promise<void>;
    getAll: () => Promise<BackupRecord[]>;
  };
}

contextBridge.exposeInMainWorld('storeAPI', {
  settings: {
    getAll: (): Promise<Settings> =>
      ipcRenderer.invoke('store:settings:getAll'),
    get: <K extends keyof Settings>(key: K): Promise<Settings[K]> =>
      ipcRenderer.invoke('store:settings:get', key),
    set: <K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> =>
      ipcRenderer.invoke('store:settings:set', key, value),
  },
  backup: {
    add: (record: BackupRecord): Promise<void> =>
      ipcRenderer.invoke('store:backup:add', record),
    getAll: (): Promise<BackupRecord[]> =>
      ipcRenderer.invoke('store:backup:getAll'),
  },
} satisfies StoreAPI);
```

### 5.3 Renderer 的全域型別宣告（`src/renderer/env.d.ts`）

```typescript
import type { StoreAPI } from '../preload';

declare global {
  interface Window {
    storeAPI: StoreAPI;
  }
}
```

### 5.4 Renderer 中使用

```typescript
// 讀取設定
const settings = await window.storeAPI.settings.getAll();

// 更新設定
await window.storeAPI.settings.set('theme', 'dark');

// 新增備份紀錄
await window.storeAPI.backup.add({
  id: crypto.randomUUID(),
  timestamp: Date.now(),
  sourcePath: '/Volumes/iPhone/DCIM',
  destinationPath: '/Users/user/Backups/iPhone',
  status: 'success',
  fileCount: 123,
  totalBytes: 4096000,
});
```

### 5.5 進階：使用 `onDidChange` 即時同步到所有視窗

```typescript
// src/main/ipc/store-handlers.ts（擴充）
import { BrowserWindow } from 'electron';

// 當 store 變更時，主動推播到所有視窗
settingsStore.onDidChange('theme', (newValue) => {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('store:settings:changed', 'theme', newValue);
  });
});

// Preload 中增加訂閱方法
contextBridge.exposeInMainWorld('storeAPI', {
  // ...其他方法
  onSettingsChanged: (
    callback: (key: keyof Settings, value: unknown) => void
  ) => {
    ipcRenderer.on('store:settings:changed', (_event, key, value) => {
      callback(key, value);
    });
  },
});
```

來源：[Inter-Process Communication | Electron](https://www.electronjs.org/docs/latest/tutorial/ipc)，[BigBinary Blog - Sync Store](https://www.bigbinary.com/blog/sync-store-main-renderer-electron)

---

## 6. 多個 Store 實例的組織方式

### 6.1 目錄結構

```
src/main/store/
├── index.ts                  # 統一匯出，初始化所有 store
├── types.ts                  # 所有 store 的共用型別定義
├── settings-store.ts         # 應用設定 store（settings.json）
└── backup-history-store.ts   # 備份歷史 store（backup-history.json）
```

### 6.2 各 Store 使用不同 `name` 避免衝突

```typescript
// settings-store.ts
export const settingsStore = new Store<Settings>({
  name: 'settings',         // → userData/settings.json
  schema: settingsSchema,
});

// backup-history-store.ts
export const backupHistoryStore = new Store<BackupHistory>({
  name: 'backup-history',   // → userData/backup-history.json
  schema: backupHistorySchema,
});
```

> **關鍵**：`name` 選項決定儲存的 JSON 檔名。預設為 `config`，多個實例**必須**指定不同 name，否則會共用同一個 `config.json` 導致資料衝突。

來源：[electron-store issue #48 - Multiple instance store](https://github.com/sindresorhus/electron-store/issues/48)

### 6.3 統一入口（`src/main/store/index.ts`）

```typescript
export { settingsStore, SETTINGS_KEYS } from './settings-store';
export { backupHistoryStore, BACKUP_KEYS } from './backup-history-store';
export type { Settings, BackupRecord, BackupHistory } from './types';

// 在應用啟動時呼叫，確保 store 初始化
export function initializeStores(): void {
  // electron-store 在建立實例時自動初始化
  // 此函式供需要明確初始化流程的場景使用
  console.log('Stores initialized:', {
    settings: settingsStore.path,
    backupHistory: backupHistoryStore.path,
  });
}
```

---

## 7. BackupHistory Store 的完整實作範例

```typescript
// src/main/store/backup-history-store.ts
import Store from 'electron-store';
import type { JSONSchemaType } from 'ajv';
import type { BackupRecord } from './types';

interface BackupHistory {
  records: BackupRecord[];
  lastBackupTime: number | null;
}

const schema: JSONSchemaType<BackupHistory> = {
  type: 'object',
  properties: {
    records: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          timestamp: { type: 'number' },
          sourcePath: { type: 'string' },
          destinationPath: { type: 'string' },
          status: {
            type: 'string',
            enum: ['success', 'failed', 'partial'],
          },
          fileCount: { type: 'number' },
          totalBytes: { type: 'number' },
          errorMessage: { type: 'string', nullable: true },
        },
        required: [
          'id',
          'timestamp',
          'sourcePath',
          'destinationPath',
          'status',
          'fileCount',
          'totalBytes',
        ],
      },
      default: [],
    },
    lastBackupTime: {
      type: 'number',
      nullable: true,
      default: null,
    },
  },
  required: ['records', 'lastBackupTime'],
};

export const backupHistoryStore = new Store<BackupHistory>({
  name: 'backup-history',
  schema,
  defaults: {
    records: [],
    lastBackupTime: null,
  },
});

// 保留最近 N 筆紀錄（避免 store 無限增長）
export function pruneOldRecords(keepCount = 500): void {
  const records = backupHistoryStore.get('records');
  if (records.length > keepCount) {
    backupHistoryStore.set(
      'records',
      records.slice(records.length - keepCount)
    );
  }
}
```

---

## 8. electron-vite 打包環境注意事項

### 8.1 核心問題

electron-store v9+ 是純 ESM 套件，而 electron-vite 預設會將主進程程式碼打包成 CJS。這導致：

```
Error [ERR_REQUIRE_ESM]: require() of ES Module .../electron-store/index.js
```

### 8.2 解決方案一：使用 `externalizeDeps.exclude` 讓 Vite 打包 ESM 依賴

```typescript
// electron.vite.config.ts
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

export default defineConfig({
  main: {
    build: {
      externalizeDeps: {
        exclude: ['electron-store'],  // 讓 Vite 打包此模組（轉換為 CJS 相容格式）
      },
    },
  },
  preload: {
    // preload 不應 import electron-store
  },
  renderer: {
    // renderer 不應 import electron-store
  },
});
```

### 8.3 解決方案二：整個專案遷移至 ESM

```json
// package.json
{
  "type": "module"
}
```

```json
// tsconfig.node.json（electron-vite 主進程設定）
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022"
  }
}
```

> **注意**：選擇方案二後，需要確認 Electron 版本 >= 30，且所有相關設定（`electron.vite.config.mjs`）都改用 ESM 格式。

### 8.4 解決方案三：使用 `electron-conf` 替代（較簡單）

若整合困難，electron-vite 社群維護者推薦改用 [`electron-conf`](https://github.com/alex8088/electron-conf)，它：
- 同時支援 ESM 和 CJS
- API 與 electron-store 相近
- 官方針對 electron-vite 場景優化

```bash
npm install electron-conf
```

來源：[electron-vite Discussion #542](https://github.com/alex8088/electron-vite/discussions/542)，[electron-vite Troubleshooting](https://electron-vite.org/guide/troubleshooting)

---

## 9. ESM/CJS 相容性完整摘要

| 版本 | 模組格式 | Electron 最低版本 | 備註 |
|------|---------|-----------------|------|
| v8 以下 | CJS | 任何版本 | 舊版，已停止更新 |
| v9.0.0 | 純 ESM | 30+ | 破壞性變更 |
| v10.x | 純 ESM | 30+ | |
| v11.x（最新）| 純 ESM | 30+ | |

**ESM Electron 支援時間線：**
- Electron 28：初步 ESM 支援（實驗性）
- Electron 30：穩定 ESM 支援（electron-store v9+ 要求的最低版本）

來源：[ES Modules (ESM) in Electron](https://www.electronjs.org/docs/latest/tutorial/esm)

---

## 10. 資料結構設計建議

### Settings Schema

```typescript
interface Settings {
  // 外觀
  theme: 'light' | 'dark' | 'system';
  language: string;

  // 行為
  autoStart: boolean;            // 開機自動啟動
  minimizeToTray: boolean;       // 關閉時最小化到系統匣
  showNotifications: boolean;

  // 備份設定
  backupIntervalMinutes: number; // 自動備份間隔（分鐘）
  sourcePaths: string[];         // 來源路徑列表（行動裝置掛載點）
  destinationPath: string;       // 目標備份路徑
  keepCopies: number;            // 保留備份份數

  // 視窗狀態（可選）
  windowBounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}
```

### BackupRecord Schema

```typescript
interface BackupRecord {
  id: string;                             // UUID
  timestamp: number;                      // Unix timestamp（毫秒）
  deviceName: string;                     // 裝置名稱（如 "iPhone 15 Pro"）
  sourcePath: string;                     // 實際來源路徑
  destinationPath: string;                // 實際目標路徑
  status: 'success' | 'failed' | 'partial';
  fileCount: number;                      // 複製的檔案數量
  totalBytes: number;                     // 複製的總位元組數
  durationMs: number;                     // 備份耗時（毫秒）
  errorMessage?: string;                  // 失敗時的錯誤訊息
}
```

**設計原則：**
- `Settings` 和 `BackupRecord` 存放在**不同 store 檔案**，避免單一 JSON 過大
- `BackupRecord` 是僅追加（append-only）的歷史紀錄，定期修剪舊紀錄
- `Settings` 相對小且讀取頻繁，適合完整載入到記憶體
- 避免在 store 中存放 `Buffer` 或 `Uint8Array`（HTML Structured Clone 序列化限制）

---

## 11. 重要注意事項與最佳實踐

1. **electron-store 不是資料庫**：適合小型資料（設定、偏好、快取），不適合大量記錄。大量歷史紀錄考慮使用 SQLite（`better-sqlite3`）。

2. **原子寫入**：electron-store 使用原子寫入防止程序崩潰時資料損壞，已內建，無需額外處理。

3. **IPC 序列化限制**：透過 IPC 傳遞的物件使用 HTML Structured Clone Algorithm，不支援 DOM 物件、Node.js C++ 類別、Electron 物件（如 `WebContents`）。

4. **效能考量**：每次 `store.get()` 都是同步磁碟讀取。高頻讀取的資料應在記憶體中快取一份，避免重複 I/O。

5. **加密選項**：敏感資料（如 API token）可使用 `encryptionKey` 選項，支援 `aes-256-cbc`、`aes-256-gcm`、`aes-256-ctr`。

6. **跨進程監聽**：使用 `watch: true` 選項啟用跨進程的檔案變更監聽，適合多個 BrowserWindow 場景。

---

## 參考來源

- [electron-store GitHub](https://github.com/sindresorhus/electron-store)
- [electron-store Releases](https://github.com/sindresorhus/electron-store/releases)
- [electron-store with TypeScript Example - DEV Community](https://dev.to/anasrin/electron-store-with-typescript-example-108j)
- [Using Typescript with electron-store - Ryosuke](https://whoisryosuke.com/blog/2022/using-typescript-with-electron-store/)
- [Inter-Process Communication | Electron](https://www.electronjs.org/docs/latest/tutorial/ipc)
- [ES Modules (ESM) in Electron | Electron](https://www.electronjs.org/docs/latest/tutorial/esm)
- [Context Isolation | Electron](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- [Security | Electron](https://www.electronjs.org/docs/latest/tutorial/security)
- [Creating a synchronized store between main and renderer process in Electron | BigBinary Blog](https://www.bigbinary.com/blog/sync-store-main-renderer-electron)
- [What's the right tsconfig to use with electron-store? - electron-vite Discussion #542](https://github.com/alex8088/electron-vite/discussions/542)
- [electron-vite Troubleshooting](https://electron-vite.org/guide/troubleshooting)
- [Multiple instance store - electron-store issue #48](https://github.com/sindresorhus/electron-store/issues/48)
- [electron-store issue #91 - ESM and renderer error](https://github.com/electron-vite/vite-plugin-electron-renderer/issues/91)
