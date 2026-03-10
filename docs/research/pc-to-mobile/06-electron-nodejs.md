# PC 到 iPhone 雙向檔案同步：Electron/Node.js 整合方案

## 概述

本文檔整理 Electron + Node.js 實現 PC 到 iPhone 雙向檔案同步的技術方案，包括可用套件、native module 整合、Windows 依賴、WiFi 傳輸架構與 asar 打包限制。

---

## 1. npm 套件生態（2024-2025 維護狀況）

### 1.1 直接 iOS 通訊套件

#### libimobiledevice-node（推薦）
- **npm 名稱**：`libimobiledevice`
- **状態**：主動維護，特別針對 Electron 支援
- **功能**：iOS 裝置識別、備份、設備資訊、配對、檔案傳輸
- **API 風格**：Callback-based，需要手動管理非同步流程
- **編譯要求**：
  - macOS：Xcode
  - Windows：Visual Studio 2017、Windows SDK 8.1、msbuild.exe
- **實裝指令**：
  ```bash
  yarn add libimobiledevice
  # 或
  npm install libimobiledevice
  ```
- **基本使用**：
  ```javascript
  const lib = require('libimobiledevice')
  lib.id(data => console.log(data))  // 列出連線裝置
  ```
- **來源**：[norman784/libimobiledevice-node](https://github.com/norman784/libimobiledevice-node)

#### libijs（純 JavaScript 實作）
- **npm 名稱**：`libijs`
- **状態**：早期概念驗證，不建議生產環境
- **優勢**：
  - 純 JavaScript，無 native addon 編譯開銷
  - AFC 服務支援同步多個檔案傳輸
  - 檔案下載效能明顯優於 libimobiledevice AFC 客戶端
- **功能**：USB 通訊、AFC 檔案傳輸、備份/還原、診斷資訊
- **特色**：Multiplexed AFC 連線支援同時請求（顯著提升多檔案傳輸速度）
- **使用範例**：
  ```javascript
  const afcClient = yield getAfcClient(device);
  yield afcClient.downloadFile("DCIM/100APPLE/IMG_0001.JPG", "./IMG_0001.JPG");
  const fileStream = yield afcClient.openFileAsReadableStream("iTunes_Control/iTunes/VoiceMemos.plist");
  ```
- **限制**：仍在開發階段，無完整文檔
- **來源**：[mceSystems/libijs](https://github.com/mceSystems/libijs)

#### idevicekit
- **npm 名稱**：`idevicekit`
- **状態**：較少維護，功能有限
- **需求**：Node.js >= 6.0、系統需安裝 libimobiledevice 與 ideviceinstaller
- **來源**：[thebeet/idevicekit](https://github.com/thebeet/idevicekit)

#### idevice
- **npm 名稱**：`idevice`
- **状態**：不活躍，最後發布於 6 年前（v2.1.0）
- **功能**：探測 iOS 裝置
- **評估**：不推薦新專案使用

#### idevice-app-launcher
- **npm 名稱**：Microsoft 官方套件
- **功能**：協調 libimobiledevice + ideviceinstaller、啟動 iOS app
- **使用場景**：App 執行管理，不是檔案同步
- **來源**：[microsoft/idevice-app-launcher](https://github.com/microsoft/idevice-app-launcher)

#### ios-device-lib
- **npm 名稱**：`ios-device-lib`
- **状態**：最後更新約 1 年前（v0.9.4）
- **功能**：iOS 裝置通訊
- **維護度**：中等

### 1.2 不可用/不適用套件

| 套件名稱 | 原因 |
|---------|------|
| `node-mobiledevice` | 搜尋無直接結果，可能不存在 |
| `node-iphone-sync` | 搜尋無直接結果，可能不存在 |
| `@kwsites/file-transfer` | 搜尋無此套件，可能是誤傳 |

---

## 2. Electron Main Process 呼叫 libimobiledevice CLI

### 2.1 可行性評估

**可行性**：有條件可行，但存在已知問題

### 2.2 基本實作

使用 `child_process.spawn()` 呼叫 libimobiledevice 命令列工具：

```javascript
// main.js (Electron Main Process)
const { spawn } = require('child_process');

function getConnectedDevices() {
  return new Promise((resolve, reject) => {
    const idevice = spawn('idevice_id', ['-l']);  // list all connected

    let stdout = '';
    idevice.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    idevice.on('close', (code) => {
      if (code === 0) {
        const devices = stdout.trim().split('\n').filter(Boolean);
        resolve(devices);
      } else {
        reject(new Error(`idevice_id failed with code ${code}`));
      }
    });
  });
}

// 從 renderer process 呼叫
ipcMain.handle('get-devices', () => getConnectedDevices());
```

### 2.3 已知問題與限制

#### Windows 打包後崩潰
- **問題**：使用 electron-packager 或 electron-builder 打包後，呼叫 `idevice_info` 導致 child process 崩潰
- **症狀**：Debug 模式下正常，生產環境失敗
- **推測原因**：打包過程中 libimobiledevice CLI 工具路徑丟失或依賴未正確包含
- **GitHub Issue**：[norman784/libimobiledevice-node#9](https://github.com/norman784/libimobiledevice-node/issues/9)

#### Renderer vs Main Process
- **建議**：僅在 renderer process 中產生 child process（使用 `ipcMain.handle`）
- **避免**：在 main process 直接 spawn，會導致新 Electron 實例意外啟動

#### IPC 通訊模式
```javascript
// Renderer -> Main 的正確做法
ipcRenderer.invoke('spawn-idevice-command', commandArgs)
  .then(result => console.log(result))
  .catch(err => console.error(err));
```

---

## 3. electron-rebuild 對 Native Addon 的影響

### 3.1 何時需要使用 electron-rebuild

如果專案使用 native Node.js addon（如 libimobiledevice-node），必須針對特定 Electron 版本重新編譯：

```bash
npx @electron/rebuild
# 或 Windows
.\node_modules\.bin\electron-rebuild.cmd
```

### 3.2 node-gyp 編譯流程

Native addon 使用 node-gyp（跨平台編譯工具）：

1. **binding.gyp 配置**
   ```gyp
   {
     "targets": [{
       "target_name": "libimobiledevice_binding",
       "sources": [ "src/binding.cc" ],
       "include_dirs": [ "include" ]
     }]
   }
   ```

2. **編譯產物**：`.node` 檔案（動態連結庫）

3. **bindings 模組**：自動尋找編譯的 `.node` 檔案
   ```javascript
   const binding = require('bindings')('libimobiledevice_binding');
   ```

### 3.3 Electron 特定配置

#### Windows 延遲載入（Electron 4.x+）
在 binding.gyp 中添加：
```gyp
"conditions": [
  ["OS=='win'", {
    "msvs_settings": {
      "VCLinkerTool": {
        "DelayLoadDLLs": ["electron.exe"]
      }
    },
    "defines": ["WIN_DELAY_LOAD_HOOK"]
  }]
]
```

**原因**：Electron 4.x+ 改變符號導出方式
- 舊版本：Native modules 連結到 node.dll
- 新版本：符號由 electron.exe 導出，無 node.dll

#### post-install 腳本
package.json：
```json
{
  "scripts": {
    "postinstall": "electron-builder install-app-deps"
  }
}
```

### 3.4 環境變數手動配置

若需手動指定編譯參數：
```bash
npm_config_target=version         # Electron 版本
npm_config_arch=x64               # 架構
npm_config_target_arch=x64
npm_config_disturl=https://github.com/electron/electron/releases/download
npm_config_runtime=electron
npm_config_build_from_source=true
npm install
```

---

## 4. Windows 上 iTunes / Apple Mobile Device Service 依賴

### 4.1 核心依賴

在 Windows 上使用 libimobiledevice 需要：

1. **Apple Mobile Device USB Driver**
   - 在 Device Manager 顯示為「Universal Serial Bus controllers」
   - 通常隨 iTunes 自動安裝
   - 驅動程式檔案在系統安裝 iTunes 時部署

2. **Apple Mobile Device Service (AMDS)**
   - Windows 服務
   - 路徑：Services > Apple Mobile Device Service
   - 必須設為「Automatic」啟動模式
   - 若連線失敗，嘗試重啟此服務

### 4.2 診斷與修復

**問題**：裝置在 Windows 上無法識別

**排查步驟**：

```bash
# 1. 檢查設備是否出現在 Device Manager
# Settings > Device Manager > Universal Serial Bus controllers

# 2. 重啟 Apple Mobile Device Service
# 右鍵 > Properties > Startup type = Automatic
# 若未執行，點 "Start"

# 3. 在 Windows 上測試 idevice_id
idevice_id -l        # 應列出連線的 UDID

# 4. 若仍失敗，嘗試更新驅動
# Device Manager > 右鍵 iPhone > Update Driver
```

### 4.3 完整安裝流程

1. 在 PC 上安裝 iTunes（包含驅動）
2. 使用 USB 傳輸線連接 iPhone
3. iPhone 上信任此電腦（長按「信任」）
4. 驗證 Windows Services 中 AMDS 為 Running
5. 執行 `idevice_id -l` 確認裝置被識別

### 4.4 WiFi 連線時的變數

- **初次配對**：必須使用 USB
- **後續連線**：可選 WiFi（需在 iPhone 設定中啟用「WiFi 同步」）
- **UIsbmuxd 支援**：libimobiledevice 和 usbmuxd 皆支援 WiFi 模式

---

## 5. Node.js HTTP Server 做 WiFi 傳輸的架構

### 5.1 設計優勢

相比 libimobiledevice USB 方案，HTTP 伺服器方案的優點：

- **無需驅動**：純網路通訊，無 Windows 驅動/iTunes 依賴
- **跨網路**：同一 WiFi 即可通訊（無地理距離限制）
- **實作簡單**：標準 HTTP/WebSocket，容易客製化
- **緩衝友善**：大檔案傳輸無中斷

### 5.2 PC 端伺服器實作

#### 簡易 Express 伺服器

```javascript
// server.js (Electron Main Process)
const express = require('express');
const multer = require('multer');
const path = require('path');
const os = require('os');

const app = express();
const upload = multer({ dest: './uploads' });

// 列舉 PC 上的檔案
app.get('/api/files', (req, res) => {
  const files = fs.readdirSync('./documents');
  res.json({ files });
});

// 上傳檔案到 PC
app.post('/api/upload', upload.single('file'), (req, res) => {
  const filePath = path.join('./uploads', req.file.originalname);
  fs.renameSync(req.file.path, filePath);
  res.json({ success: true, path: filePath });
});

// 下載檔案
app.get('/api/download/:filename', (req, res) => {
  const filePath = path.join('./documents', req.params.filename);
  res.download(filePath);
});

const PORT = 8080;
app.listen(PORT, '0.0.0.0', () => {
  const ip = Object.values(os.networkInterfaces())
    .flat()
    .find(addr => addr.family === 'IPv4' && !addr.internal)?.address;
  console.log(`Server ready at http://${ip}:${PORT}`);
});
```

#### 取得 LAN IP

```javascript
function getLanIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}
```

### 5.3 iPhone 用戶端實作

在 iPhone Safari 或自訂 iOS app 中：

```javascript
// iOS JavaScript (WebView 或 Progressive Web App)
async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('http://PC_IP:8080/api/upload', {
    method: 'POST',
    body: formData
  });

  return response.json();
}

async function downloadFile(filename) {
  const link = document.createElement('a');
  link.href = `http://PC_IP:8080/api/download/${filename}`;
  link.download = filename;
  link.click();
}
```

### 5.4 實時同步方案：WebSocket

針對需要實時同步的場景，使用 Socket.io：

```javascript
// Electron Main (WebSocket Server)
const io = require('socket.io')(3000);

io.on('connection', (socket) => {
  socket.on('sync-request', (data) => {
    // PC 檔案狀態變化時廣播給所有 iPhone 客戶端
    io.emit('files-updated', getFileList());
  });
});

// iOS WebView
const socket = io('http://PC_IP:3000');
socket.on('files-updated', (files) => {
  updateFileListUI(files);
});
```

### 5.5 安全考慮

**生產環境中的注意事項**：

```javascript
// 1. 驗證要求的檔案路徑（防止目錄遍歷）
const safePath = path.resolve(
  path.join(__dirname, 'uploads'),
  req.params.filename
);
if (!safePath.startsWith(path.join(__dirname, 'uploads'))) {
  return res.status(403).send('Forbidden');
}

// 2. 限制檔案大小
const upload = multer({
  dest: './uploads',
  limits: { fileSize: 500 * 1024 * 1024 }  // 500MB
});

// 3. 限制上傳速率（防止 DDoS）
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 分鐘
  max: 100  // 最多 100 次請求
});
app.post('/api/upload', limiter, upload.single('file'), ...);

// 4. 使用 HTTPS/WSS（若跨網路）
// 需搭配自簽憑證或公開簽發的證書
```

### 5.6 推薦套件清單

| 套件 | 用途 | npm 名稱 |
|-----|------|--------|
| Express | HTTP 伺服器框架 | `express` |
| multer | 檔案上傳處理 | `multer` |
| Socket.io | 即時雙向通訊 | `socket.io` |
| axios | HTTP 客戶端（iOS 端） | `axios` |
| express-rate-limit | 速率限制 | `express-rate-limit` |

---

## 6. asar 打包對 Native 模組的限制

### 6.1 問題概述

asar（Atom Shell Archive）是 Electron 預設的應用打包格式，但 native module 的 `.node` 檔案無法直接從 asar 內部載入。

**根因**：Node.js 的 `process.dlopen()` 需要檔案系統存取，無法在虛擬 asar 檔案系統中執行。

### 6.2 解決方案：asarUnpack

#### electron-builder 配置

在 electron-builder 設定檔（`electron-builder.yml` 或 `package.json`）中：

```yaml
# electron-builder.yml
asarUnpack:
  - node_modules/libimobiledevice
  - out/main/chunks/*.node
  - resources/**
```

或在 package.json：

```json
{
  "build": {
    "asarUnpack": [
      "node_modules/libimobiledevice",
      "out/main/chunks/*.node",
      "resources/**"
    ]
  }
}
```

#### electron-forge 配置

使用 Auto Unpack Native Modules 外掛：

```javascript
// forge.config.js
module.exports = {
  packagerConfig: {
    asar: true
  },
  plugins: [
    [
      '@electron-forge/plugin-auto-unpack-natives',
      {
        // 自動偵測並 unpack 所有 native module
      }
    ]
  ]
};
```

### 6.3 打包後的檔案結構

使用 asarUnpack 後：

```
MyApp.app/Contents/Resources/
├── app.asar               # 主要應用程式碼
├── app.asar.unpacked/     # 解包目錄
│   └── node_modules/
│       └── libimobiledevice/
│           ├── build/
│           │   └── Release/
│           │       └── libimobiledevice.node
│           └── package.json
```

### 6.4 electron-builder 注意事項

#### 自動偵測
```json
{
  "build": {
    "nodeGypRebuild": true
  }
}
```

electron-builder 在構建時會：
1. 自動掃描 native module
2. 將其加入 unpacked list
3. 無需手動配置

#### 驗證打包

打包後驗證 native module 已正確 unpacked：

```bash
# macOS
unzip -l dist/MyApp.app/Contents/Resources/app.asar | grep '.node'

# Windows
# 使用 7-Zip 開啟 app.asar 檢查內容
# 或檢查 resources/app.asar.unpacked 目錄
```

### 6.5 常見問題

| 問題 | 原因 | 解決方案 |
|------|------|--------|
| Module not found | asarUnpack 未正確設定 | 驗證 glob pattern 是否匹配 |
| Cannot find .node | 路徑相對於 asar 而非檔案系統 | 使用 `app.getAppPath()` 取得正確路徑 |
| 打包體積過大 | asarUnpack 包含過多檔案 | 精確指定 glob，排除 test/doc |

### 6.6 載入已 unpack 的模組

若需手動載入 native module：

```javascript
const path = require('path');
const { app } = require('electron');

// 取得 asar.unpacked 中的模組
function loadNativeModule(moduleName) {
  const appPath = app.getAppPath();
  const unpackedPath = path.join(appPath, 'asar.unpacked', 'node_modules', moduleName);
  return require(unpackedPath);
}

const libimobiledevice = loadNativeModule('libimobiledevice');
```

---

## 7. 整合決策矩陣

### 7.1 USB 連線方案

| 評分項 | libimobiledevice-node | libijs | CLI spawn |
|-------|----------------------|--------|-----------|
| 維護度 | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| 易用性 | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |
| 效能 | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ |
| 打包複雜度 | ⭐⭐ (需 asarUnpack) | ⭐⭐⭐ | ⭐⭐ |
| Windows 相容性 | ⭐⭐ (已知問題) | ⭐⭐ | ⭐⭐⭐ |
| 生產就緒 | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |

**推薦**：優先選 `libimobiledevice-node` native binding，次選 CLI spawn

### 7.2 WiFi 傳輸方案

| 評分項 | HTTP Server | WebSocket + Socket.io |
|-------|-------------|---------------------|
| 設定簡單度 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| 即時性 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 可靠性 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 跨網路支援 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 安全性實現難度 | ⭐⭐⭐ | ⭐⭐ |

**推薦**：基礎同步用 HTTP Server，實時同步用 WebSocket

---

## 8. 完整整合範例

### 8.1 Electron 應用結構

```
electron-app/
├── src/
│   ├── main/
│   │   ├── index.ts          # Main process
│   │   ├── ipc-handlers.ts    # IPC handlers
│   │   └── device-service.ts  # libimobiledevice 包裝
│   └── renderer/
│       ├── App.tsx            # UI
│       └── device-api.ts      # IPC 呼叫
├── electron-builder.yml       # 打包配置
└── package.json
```

### 8.2 核心實作

**device-service.ts**（Main Process）：

```typescript
import { ipcMain } from 'electron';
const libimobiledevice = require('libimobiledevice');

export class DeviceService {
  getConnectedDevices(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      libimobiledevice.id((devices) => {
        resolve(devices || []);
      });
    });
  }

  transferFile(udid: string, localPath: string, devicePath: string) {
    // libimobiledevice AFC protocol 實作
    // 或使用 HTTP server backup 方案
  }
}

// 暴露給 renderer
const service = new DeviceService();
ipcMain.handle('devices:list', () => service.getConnectedDevices());
ipcMain.handle('file:transfer', (event, args) =>
  service.transferFile(args.udid, args.local, args.device)
);
```

**device-api.ts**（Renderer Process）：

```typescript
import { ipcRenderer } from 'electron';

export const deviceAPI = {
  async getDevices() {
    return await ipcRenderer.invoke('devices:list');
  },

  async transferFile(udid: string, localPath: string, devicePath: string) {
    return await ipcRenderer.invoke('file:transfer', {
      udid,
      local: localPath,
      device: devicePath
    });
  }
};
```

### 8.3 electron-builder.yml 完整配置

```yaml
productName: "Auto Backup Mobile"
appId: "com.example.backup"

directories:
  output: dist
  buildResources: resources

files:
  - from: .
    to: .
    filter:
      - package.json
      - dist/**
      - node_modules/**

asarUnpack:
  - node_modules/libimobiledevice/**

win:
  target:
    - nsis
  certificateFile: null

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true

mac:
  target:
    - dmg
    - zip

publish: null
```

---

## 9. 參考資料與來源

### 官方文檔
- [Electron - Native Code](https://www.electronjs.org/docs/latest/tutorial/native-code-and-electron)
- [Electron - Using Native Node Modules](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)
- [Electron - ASAR Archives](https://www.electronjs.org/docs/latest/tutorial/asar-archives)
- [libimobiledevice Official](https://libimobiledevice.org/)

### npm 套件
- [libimobiledevice - npm](https://www.npmjs.com/package/libimobiledevice)
- [libijs - GitHub](https://github.com/mceSystems/libijs)
- [idevicekit - npm](https://www.npmjs.com/package/idevicekit)
- [node-ios-device - npm](https://www.npmjs.com/package/node-ios-device)

### Electron 工具
- [electron-rebuild - npm](https://www.npmjs.com/package/@electron/rebuild)
- [electron-builder - Official](https://www.electron.build/)
- [Electron Forge - Auto Unpack Plugin](https://www.electronforge.io/config/plugins/auto-unpack-natives)

### GitHub Issues & Discussions
- [libimobiledevice-node Windows Issue](https://github.com/norman784/libimobiledevice-node/issues/9)
- [Electron child_process ASAR Issue](https://github.com/electron/electron/issues/9459)
- [electron-builder asarUnpack Issue](https://github.com/electron-userland/electron-builder/issues/8640)

### 文章與教學
- [BigBinary: Using native modules in Electron](https://www.bigbinary.com/blog/native-modules-electron)
- [Medium: Electron App with C++ backend as Native Addon](https://gauriatiq.medium.com/electron-app-with-c-back-end-as-native-addon-c67867f4058)
- [Matthew Slipper: Everything You Wanted To Know About Electron Child Processes](https://www.matthewslipper.com/2019/09/22/everything-you-wanted-electron-child-process.html)

### Apple 官方支援
- [Apple Support: iTunes Sync](https://support.apple.com/en-us/108347)
- [Apple Support: iPhone Recognition Issues](https://support.apple.com/en-us/108643)
- [Apple Support: Restart Apple Mobile Device Service](https://support.apple.com/en-us/102347)

---

## 10. 決策建議

### 若優先考慮 USB 連線
1. **首選**：`libimobiledevice` native binding
   - 維護度最高，Electron 社群支援充分
   - 配合 asarUnpack 處理 native module
   - Windows 端需確保 iTunes/AMDS 已安裝

2. **次選**：CLI spawn + child_process
   - 實作最簡單，無編譯負擔
   - 打包更直接，但需注意 Windows 路徑

### 若優先考慮 WiFi 傳輸
1. **基礎方案**：Express HTTP Server
   - 零依賴，快速實作
   - 適合同一 LAN 內傳輸

2. **進階方案**：Socket.io + WebSocket
   - 實時同步，更好使用體驗
   - 支援跨網路部署

### 混合方案建議
- USB 優先（更快、更可靠）
- WiFi 備用（當無 USB 傳輸線時）
- 兩套機制並行，自動判斷裝置狀態

---

**最後更新**：2026-03-10
**參考資料統計**：15+ 官方來源、8+ 開源專案、3+ npm 套件
