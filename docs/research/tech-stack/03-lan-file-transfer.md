# LAN 大檔案傳輸技術實作研究

> 研究日期：2026-03-11
> 涵蓋範圍：TCP/HTTP 傳輸協定、Node.js 串流處理、斷點續傳、Checksum 驗證、並行傳輸、效能優化、iOS 整合、安全性考量
> 資料來源：2024-2025 技術文獻

---

## 目錄

1. [TCP Socket vs HTTP Chunked Transfer](#1-tcp-socket-vs-http-chunked-transfer)
2. [Node.js 大檔案串流傳輸最佳實踐](#2-nodejs-大檔案串流傳輸最佳實踐)
3. [進度追蹤實作](#3-進度追蹤實作)
4. [斷點續傳（Resume）](#4-斷點續傳resume)
5. [Checksum 驗證](#5-checksum-驗證)
6. [並行傳輸](#6-並行傳輸)
7. [傳輸速度優化](#7-傳輸速度優化)
8. [Node.js HTTP 用戶端套件比較](#8-nodejs-http-用戶端套件比較)
9. [SFTP / rsync 在 Node.js 中的實作](#9-sftp--rsync-在-nodejs-中的實作)
10. [iOS URLSession 傳輸最佳實踐](#10-ios-urlsession-傳輸最佳實踐)
11. [LAN 傳輸安全性考量](#11-lan-傳輸安全性考量)
12. [總結與建議](#12-總結與建議)

---

## 1. TCP Socket vs HTTP Chunked Transfer

### 比較總覽

| 特性 | TCP Socket (`net` 模組) | HTTP Chunked Transfer |
|------|------------------------|-----------------------|
| 協定層級 | L4 傳輸層 | L7 應用層 |
| 額外開銷 | 極低（僅 TCP header） | 中等（HTTP header + chunk encoding） |
| 實作複雜度 | 較高（需自訂協定） | 較低（標準 HTTP 語意） |
| 斷點續傳 | 需自行實作 | 原生支援（Range header） |
| 防火牆相容 | 需開放自訂 port | 標準 80/443 port |
| 多工能力 | 每連線單一串流 | HTTP/2 支援多工 |
| 適用場景 | 極致效能、自訂協定 | 通用性、標準化互通 |

### TCP Socket 適用場景

- LAN 內部專用傳輸，不需考慮防火牆穿越
- 需要最低延遲與最高吞吐量
- 傳輸協定可完全自訂（如加入自訂 metadata header）

```javascript
// TCP Server - 接收檔案
import { createWriteStream } from 'node:fs';
import net from 'node:net';

const server = net.createServer((socket) => {
  socket.setNoDelay(true);

  const writeStream = createWriteStream('received-video.mp4');
  socket.pipe(writeStream);

  socket.on('close', () => {
    console.log('Transfer complete');
  });

  socket.on('error', (err) => {
    console.error('Socket error:', err.message);
  });
});

server.listen(8080, '0.0.0.0');
```

```javascript
// TCP Client - 傳送檔案
import { createReadStream } from 'node:fs';
import net from 'node:net';

const socket = net.createConnection({
  host: '192.168.1.100',
  port: 8080,
  noDelay: true,
});

const readStream = createReadStream('/path/to/large-video.mp4');
readStream.pipe(socket);

readStream.on('end', () => {
  console.log('File sent');
});
```

### HTTP Chunked Transfer 適用場景

- 需要與標準 HTTP 工具鏈整合（如 proxy、load balancer）
- 需要斷點續傳能力
- 客戶端為瀏覽器或標準 HTTP 用戶端（如 iOS URLSession）
- HTTP/2 以上不使用 chunked encoding，改用更高效的 frame-based streaming

**建議：LAN 備份場景優先使用 HTTP，因為 iOS URLSession 原生支援、斷點續傳容易實作、除錯工具豐富。若效能瓶頸確認在協定層，再考慮 TCP Socket。**

> 來源：[File Transfer Over TCP: A Practical Guide](https://dev.to/sudiip__17/-file-transfer-over-tcp-a-practical-guide-for-developers-130n)、[HTTP Chunked vs Store & Forward](https://gist.github.com/v-kolesnikov/8e5e4bc72726b8c190ca487ed213365e)

---

## 2. Node.js 大檔案串流傳輸最佳實踐

### 核心原則：Stream + Pipe + Backpressure

處理數 GB 影片時，**絕不能將整個檔案載入記憶體**，必須使用串流處理。

### 2.1 使用 `pipeline()` 取代 `.pipe()`

`pipeline()` 是 Node.js 10+ 推薦的串流串接方式，會自動處理錯誤傳播與串流清理：

```javascript
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

async function transferFile(sourcePath: string, destPath: string): Promise<void> {
  await pipeline(
    createReadStream(sourcePath),
    createWriteStream(destPath),
  );
}
```

### 2.2 Backpressure 正確處理

Backpressure 是指接收端處理速度慢於發送端時，資料在 buffer 中堆積的現象。

**正確做法：檢查 `.write()` 回傳值**

```javascript
function sendData(readable: Readable, writable: Writable): void {
  readable.on('data', (chunk) => {
    const canContinue = writable.write(chunk);
    if (!canContinue) {
      readable.pause();
    }
  });

  writable.on('drain', () => {
    readable.resume();
  });
}
```

**錯誤做法（會導致記憶體爆炸）：**

```javascript
// 忽略 .write() 回傳值 - 不要這樣做
readable.on('data', (data) => writable.write(data));
```

### 2.3 highWaterMark 調校

預設 `highWaterMark` 為 16KB，對於大檔案傳輸過於保守。

| highWaterMark | 適用場景 | 記憶體消耗 |
|---------------|---------|-----------|
| 16 KB（預設） | 一般用途 | 極低 |
| 64 KB | LAN 傳輸起始建議 | 低 |
| 256 KB - 1 MB | 高速 LAN（Gigabit+） | 中等 |
| 4 MB+ | 需要實測驗證 | 較高 |

```javascript
const readStream = createReadStream(filePath, {
  highWaterMark: 256 * 1024, // 256 KB
});
```

### 2.4 Backpressure 效果實測數據

| 指標 | 有 Backpressure | 無 Backpressure |
|------|----------------|-----------------|
| 記憶體用量 | ~88 MB | ~1.52 GB |
| GC 頻率/分鐘 | ~75 次 | ~36 次 |
| 效能穩定度 | 穩定 | 降級 |

> 來源：[Node.js Backpressuring in Streams](https://nodejs.org/en/learn/modules/backpressuring-in-streams)、[Understanding Streams in Node.js](https://betterstack.com/community/guides/scaling-nodejs/nodejs-streams/)

---

## 3. 進度追蹤實作

### 3.1 自行實作進度追蹤

```typescript
interface TransferProgress {
  bytesTransferred: number;
  totalBytes: number;
  percentage: number;
  speed: number;          // bytes/sec
  eta: number;            // seconds remaining
  elapsed: number;        // seconds elapsed
}

function createProgressTracker(totalBytes: number): Transform {
  let bytesTransferred = 0;
  let startTime = Date.now();
  const speedSamples: number[] = [];
  const SAMPLE_WINDOW = 5; // 5 秒移動平均

  return new Transform({
    transform(chunk, _encoding, callback) {
      bytesTransferred += chunk.length;
      const elapsed = (Date.now() - startTime) / 1000;

      // 移動平均速度計算（避免 UI 抖動）
      const instantSpeed = chunk.length / (elapsed || 1);
      speedSamples.push(instantSpeed);
      if (speedSamples.length > SAMPLE_WINDOW * 10) {
        speedSamples.shift();
      }

      const avgSpeed = speedSamples.reduce((a, b) => a + b, 0)
        / speedSamples.length;
      const remaining = totalBytes - bytesTransferred;
      const eta = avgSpeed > 0 ? remaining / avgSpeed : Infinity;

      const progress: TransferProgress = {
        bytesTransferred,
        totalBytes,
        percentage: (bytesTransferred / totalBytes) * 100,
        speed: avgSpeed,
        eta,
        elapsed,
      };

      this.emit('progress', progress);
      callback(null, chunk);
    },
  });
}
```

### 3.2 使用 `progress-stream` 套件

```javascript
import progress from 'progress-stream';

const progressTracker = progress({
  length: fileSize,
  time: 100, // 每 100ms 發送事件
});

progressTracker.on('progress', (state) => {
  console.log(`${state.percentage.toFixed(1)}%`);
  console.log(`Speed: ${(state.speed / 1024 / 1024).toFixed(1)} MB/s`);
  console.log(`ETA: ${state.eta} seconds`);
});

readStream.pipe(progressTracker).pipe(writeStream);
```

### 3.3 速度計算要點

- **使用移動平均（Moving Average）**：避免因網路波動造成 UI 數字跳動
- **取樣間隔**：建議 5 秒窗口計算平均速度
- **ETA 計算**：`剩餘位元組 / 平均速度`
- **百分比更新頻率**：UI 端建議每 100-200ms 更新一次，避免過度渲染

> 來源：[progress-stream npm](https://www.npmjs.com/package/progress-stream)、[transfer-rate npm](https://www.npmjs.com/package/transfer-rate)

---

## 4. 斷點續傳（Resume）

### 4.1 HTTP Range Header 實作

#### Server 端（Node.js）

```typescript
import { createReadStream, statSync } from 'node:fs';
import http from 'node:http';

function handleRangeRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  filePath: string,
): void {
  const stat = statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': 'application/octet-stream',
    });

    createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Accept-Ranges': 'bytes',
      'Content-Type': 'application/octet-stream',
    });

    createReadStream(filePath).pipe(res);
  }
}
```

#### Client 端（斷點續傳下載）

```typescript
import { createWriteStream, statSync, existsSync } from 'node:fs';
import http from 'node:http';

async function resumeDownload(
  url: string,
  destPath: string,
): Promise<void> {
  let startByte = 0;

  // 檢查已下載的部分
  if (existsSync(destPath)) {
    const stat = statSync(destPath);
    startByte = stat.size;
  }

  const headers: Record<string, string> = {};
  if (startByte > 0) {
    headers['Range'] = `bytes=${startByte}-`;
  }

  return new Promise((resolve, reject) => {
    http.get(url, { headers }, (res) => {
      const writeStream = createWriteStream(destPath, {
        flags: startByte > 0 ? 'a' : 'w', // append 模式
      });

      res.pipe(writeStream);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
  });
}
```

### 4.2 TCP 層面的斷點續傳

TCP 本身不支援應用層的續傳，需自訂協定：

```typescript
// 自訂協定 header 結構
interface TransferHeader {
  fileId: string;        // 檔案唯一識別（hash 或 UUID）
  fileName: string;
  totalSize: number;
  offset: number;        // 續傳起始位置
  chunkSize: number;
}
```

**建議：使用 HTTP Range header 機制，成熟度高、iOS URLSession 原生支援。**

> 來源：[Implementing HTTP Range Requests in Node.js](https://cri.dev/posts/2025-06-18-how-to-http-range-requests-video-nodejs/)、[HTTP Range Requests - MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Range_requests)

---

## 5. Checksum 驗證

### 5.1 演算法效能比較

#### 1 GiB NVMe 測試結果

| 演算法 | CPU 時間 | CPU 使用率 | 安全性 |
|--------|---------|-----------|--------|
| xxHash64 | 0.21s | 11% | 非加密 |
| xxHash128 | 0.21s | 10% | 非加密 |
| MD5 | 1.38s | 56% | 已破解（碰撞可在 1 秒內產生） |
| SHA-512 | 2.36s | 70% | 加密等級 |
| SHA-256 | 3.76s | 80% | 加密等級 |

#### 10 GiB SATA 測試結果

| 演算法 | CPU 時間 | 速度倍數（vs SHA-256） |
|--------|---------|----------------------|
| xxHash128 | 2.44s | ~15x |
| xxHash64 | 4.76s | ~7.5x |
| MD5 | 16.62s | ~2.2x |
| SHA-256 | 35.99s | 1x（基準） |

### 5.2 選擇建議

| 場景 | 建議演算法 | 理由 |
|------|----------|------|
| LAN 檔案完整性驗證 | **xxHash64/128** | 速度最快，LAN 為受信任環境 |
| 需要加密等級安全性 | SHA-256 或 BLAKE3 | BLAKE3 接近 xxHash 速度但有加密安全性 |
| 相容性考量 | MD5 | 廣泛支援，但效能和安全性皆非最佳 |

### 5.3 邊傳輸邊計算 Checksum

```typescript
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';

// 使用 Node.js 內建 crypto（SHA-256）
async function hashWhileTransfer(filePath: string): Promise<string> {
  const hash = createHash('sha256');

  const hashTransform = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk);
      callback(null, chunk); // 傳遞資料到下一個串流
    },
  });

  await pipeline(
    createReadStream(filePath),
    hashTransform,
    targetWriteStream,
  );

  return hash.digest('hex');
}
```

```typescript
// 使用 xxHash（xxhash-addon 套件）
import { XXHash64 } from 'xxhash-addon';

function createXXHashTransform(seed: number = 0): Transform {
  const hasher = new XXHash64(Buffer.alloc(8));

  return new Transform({
    transform(chunk, _encoding, callback) {
      hasher.update(chunk);
      callback(null, chunk);
    },
    flush(callback) {
      const digest = hasher.digest();
      this.emit('hash', digest.toString('hex'));
      callback();
    },
  });
}
```

### 5.4 Node.js xxHash 套件選擇

| 套件 | 類型 | 特點 |
|------|------|------|
| `@node-rs/xxhash` | Rust binding（NAPI） | 效能最佳，跨平台 |
| `xxhash-addon` | C++ binding | 效能優秀，可達 MD5 的 50 倍 |
| `xxhashjs` | 純 JavaScript | 無需編譯，效能較低 |
| `xxhash` | C binding | 穩定但維護較少 |

> 來源：[For File Integrity Testing, You're Wasting Your Time With MD5](https://strugglers.net/~andy/mothballed-blog/2024/04/20/for-file-integrity-testing-youre-wasting-your-time-with-md5/)、[Use Fast Data Algorithms](https://jolynch.github.io/posts/use_fast_data_algorithms/)

---

## 6. 並行傳輸

### 6.1 多檔案並行傳輸策略

```typescript
interface TransferTask {
  filePath: string;
  fileSize: number;
  status: 'pending' | 'transferring' | 'completed' | 'error';
}

async function parallelTransfer(
  tasks: ReadonlyArray<TransferTask>,
  concurrency: number = 3,
): Promise<void> {
  const queue = [...tasks];
  const active: Promise<void>[] = [];

  while (queue.length > 0 || active.length > 0) {
    while (active.length < concurrency && queue.length > 0) {
      const task = queue.shift()!;
      const promise = transferSingleFile(task)
        .then(() => {
          const idx = active.indexOf(promise);
          if (idx > -1) active.splice(idx, 1);
        });
      active.push(promise);
    }

    if (active.length > 0) {
      await Promise.race(active);
    }
  }
}
```

### 6.2 Connection Pool 管理

```typescript
import http from 'node:http';

// HTTP Agent 作為 Connection Pool
const agent = new http.Agent({
  keepAlive: true,
  maxSockets: 4,          // 同時最多 4 個連線
  maxFreeSockets: 2,      // 閒置保持 2 個連線
  timeout: 60000,         // 60 秒逾時
});

// 所有請求共用同一 agent
function makeRequest(options: http.RequestOptions): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = http.request({ ...options, agent }, resolve);
    req.on('error', reject);
    req.end();
  });
}
```

### 6.3 並行策略建議

| 策略 | 說明 | 適用場景 |
|------|------|---------|
| 單檔序列、多檔並行 | 每個檔案一條連線，並行傳輸多個檔案 | 多個中大型檔案 |
| 單檔切片並行 | 一個檔案切成多份同時上傳 | 單一超大檔案（10GB+） |
| 佇列式限流 | 使用 p-limit / p-queue 控制並發數 | 通用場景 |

```typescript
// 使用 p-limit 控制並發
import pLimit from 'p-limit';

const limit = pLimit(3); // 最多 3 個同時進行

const transfers = files.map((file) =>
  limit(() => transferFile(file))
);

await Promise.all(transfers);
```

> 來源：[Uploading Multiple Files Using Multithreading in Node.js](https://dev.to/wesleymreng7/uploading-multiple-files-at-the-same-time-using-multithreading-in-nodejs-3ib4)、[Multipart File Uploads: Scaling Large File Transfers](https://uploadcare.com/blog/multipart-file-uploads-scaling-large-file-transfers/)

---

## 7. 傳輸速度優化

### 7.1 Nagle Algorithm 與 TCP_NODELAY

Nagle 演算法會將小封包合併後再發送，降低網路開銷但增加延遲。

**對大檔案傳輸的影響：**

- 大檔案傳輸通常發送大 chunk，Nagle 影響較小
- 但協定握手、metadata 交換等小訊息會受影響
- **建議：啟用 `TCP_NODELAY`**，現代 LAN 環境中延遲比頻寬節省更重要

```javascript
// Node.js 中啟用 TCP_NODELAY
const socket = net.createConnection({
  host: '192.168.1.100',
  port: 8080,
  noDelay: true, // 停用 Nagle，啟用 TCP_NODELAY
});

// 或在已存在的 socket 上設定
socket.setNoDelay(true);

// HTTP Server 也可設定
const server = http.createServer();
server.on('connection', (socket) => {
  socket.setNoDelay(true);
});
```

> Marc Brooker (AWS) 2024 年文章觀點：「TCP_NODELAY should be the default」— 現代分散式系統中，Nagle 的原始問題（單位元組封包）已透過應用層協定設計解決。

### 7.2 Buffer Size 調整

```javascript
// 讀取串流 buffer（highWaterMark）
const readStream = createReadStream(filePath, {
  highWaterMark: 256 * 1024, // 256 KB（預設 16 KB）
});

// Socket buffer
const socket = new net.Socket({
  readableHighWaterMark: 256 * 1024,
  writableHighWaterMark: 256 * 1024,
});
```

### 7.3 系統層級優化

```bash
# Linux - 調整 TCP buffer 大小
sysctl -w net.core.rmem_max=16777216    # 16 MB 接收 buffer
sysctl -w net.core.wmem_max=16777216    # 16 MB 發送 buffer
sysctl -w net.ipv4.tcp_rmem="4096 87380 16777216"
sysctl -w net.ipv4.tcp_wmem="4096 65536 16777216"

# macOS - 類似調整
sysctl -w kern.ipc.maxsockbuf=16777216
sysctl -w net.inet.tcp.sendspace=1048576
sysctl -w net.inet.tcp.recvspace=1048576
```

### 7.4 效能調校建議清單

| 參數 | 預設值 | 建議值（Gigabit LAN） | 說明 |
|------|--------|---------------------|------|
| `highWaterMark` | 16 KB | 256 KB - 1 MB | 串流 buffer 大小 |
| `TCP_NODELAY` | false | true | 停用 Nagle |
| `keepAlive` | false | true | 保持連線存活 |
| HTTP Agent `maxSockets` | 5 | 3-4 | 並行連線數 |
| Chunk 大小 | - | 1-10 MB | 切片上傳的 chunk 大小 |

> 來源：[It's Always TCP_NODELAY](https://brooker.co.za/blog/2024/05/09/nagle.html)、[TCP_NODELAY & Nagle's Algorithm | ExtraHop](https://www.extrahop.com/blog/tcp-nodelay-nagle-quickack-best-practices)

---

## 8. Node.js HTTP 用戶端套件比較

### 串流傳輸能力比較

| 特性 | `got` | `axios` | `node-fetch` | 原生 `http` |
|------|-------|---------|-------------|-------------|
| 串流下載 | 原生支援 | `responseType: 'stream'` | `.body` 為 ReadableStream | 原生支援 |
| 串流上傳 | 支援 | 支援 | 支援 | 原生支援 |
| 進度事件 | 內建 `downloadProgress` | `onDownloadProgress` | 需自行實作 | 需自行實作 |
| 斷點續傳 | 手動設定 Range header | 手動設定 Range header | 手動設定 Range header | 手動設定 Range header |
| HTTP/2 | 支援 | 不支援 | 不支援 | `http2` 模組 |
| 重試機制 | 內建 | 需外掛 | 無 | 需自行實作 |
| 套件大小 | 較大 | 中等 | 較小 | 0（內建） |
| TypeScript | 原生 | 原生 | @types 需另裝 | 原生 |

### Axios 串流下載範例

```typescript
import axios from 'axios';
import { createWriteStream } from 'node:fs';

async function downloadWithProgress(
  url: string,
  destPath: string,
): Promise<void> {
  const response = await axios.get(url, {
    responseType: 'stream',
    onDownloadProgress: (progressEvent) => {
      const percentage = progressEvent.total
        ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
        : 0;
      console.log(`Download: ${percentage}%`);
    },
  });

  const writer = createWriteStream(destPath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}
```

### 建議

**LAN 備份場景推薦使用原生 `http`/`http2` 模組**：
- 無額外依賴
- 完整的串流控制能力
- 直接存取底層 socket（可設定 TCP_NODELAY 等）
- 效能最佳

若需要更高層抽象，`got` 是最完整的選擇（內建重試、HTTP/2、進度追蹤）。

> 來源：[Axios vs Fetch (2025 update)](https://blog.logrocket.com/axios-vs-fetch-2025/)、[Axios Download Progress in Node.js](https://futurestud.io/tutorials/axios-download-progress-in-node-js)

---

## 9. SFTP / rsync 在 Node.js 中的實作

### 9.1 SFTP via ssh2-sftp-client

`ssh2-sftp-client` 是基於 `ssh2` 的高層封裝，純 JavaScript 實作。

```typescript
import SftpClient from 'ssh2-sftp-client';

const sftp = new SftpClient();

async function transferViaSftp(
  localPath: string,
  remotePath: string,
): Promise<void> {
  await sftp.connect({
    host: '192.168.1.100',
    port: 22,
    username: 'backup',
    privateKey: readFileSync('/path/to/key'),
  });

  // 上傳（支援串流）
  await sftp.put(localPath, remotePath);

  // 下載
  await sftp.get(remotePath, localPath);

  await sftp.end();
}
```

**SFTP 優缺點（LAN 場景）：**

| 優點 | 缺點 |
|------|------|
| 內建加密（SSH） | 加密開銷降低傳輸速度 |
| 成熟穩定的協定 | 不支援並行傳輸（單一 channel） |
| 支援目錄遍歷、權限管理 | 無內建斷點續傳 |

### 9.2 rsync 在 Node.js 中的可行性

Node.js 沒有原生的 rsync 實作，可行方案：

1. **子程序呼叫**（推薦）：透過 `child_process.spawn()` 呼叫系統 `rsync`
2. **rsync 套件**：`rsyncwrapper`、`node-rsync` 等封裝套件
3. **自行實作差異比對**：使用 rolling checksum 演算法（複雜度極高）

```typescript
import { spawn } from 'node:child_process';

function rsyncTransfer(
  source: string,
  dest: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const rsync = spawn('rsync', [
      '-avz',
      '--progress',
      '--partial',    // 支援斷點續傳
      source,
      dest,
    ]);

    rsync.stdout.on('data', (data) => {
      console.log(data.toString());
    });

    rsync.on('close', (code) => {
      code === 0 ? resolve() : reject(new Error(`rsync exited with ${code}`));
    });
  });
}
```

**建議：LAN 備份場景中，若不需要 SSH 加密，HTTP 方案更適合。SFTP 適合需要安全傳輸的場景。rsync 適合增量同步但需要系統層支援。**

> 來源：[ssh2-sftp-client npm](https://www.npmjs.com/package/ssh2-sftp-client)、[ssh2 GitHub](https://github.com/mscdex/ssh2)、[Implementing rsync or sftp in Node.js](https://techsparx.com/nodejs/deployment/rsync.html)

---

## 10. iOS URLSession 傳輸最佳實踐

### 10.1 背景傳輸設定

```swift
// 建立背景 URLSession
let config = URLSessionConfiguration.background(
    withIdentifier: "com.app.backup-transfer"
)
config.isDiscretionary = false         // LAN 備份不應被系統延後
config.allowsConstrainedNetworkAccess = true

let session = URLSession(
    configuration: config,
    delegate: self,
    delegateQueue: nil
)
```

### 10.2 大檔案上傳

**關鍵限制：背景上傳必須從檔案上傳，不能從 Data 或 Stream**

```swift
// 正確：從檔案上傳
let uploadTask = session.uploadTask(
    with: request,
    fromFile: fileURL
)
uploadTask.countOfBytesClientExpectsToSend = fileSize
uploadTask.countOfBytesClientExpectsToReceive = 200
uploadTask.resume()
```

### 10.3 斷點續傳（iOS 17+）

iOS 17 引入了 Resumable Upload 協定支援：

```swift
// 暫停上傳並取得續傳資料
guard let resumeData = await uploadTask.cancelByProducingResumeData() else {
    return // 無法續傳
}

// 從斷點恢復
let newTask = session.uploadTask(withResumeData: resumeData)
newTask.resume()
```

```swift
// 錯誤恢復
func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    didCompleteWithError error: Error?
) {
    if let urlError = error as? URLError,
       let resumeData = urlError.uploadTaskResumeData {
        // 儲存 resumeData，稍後重試
        saveResumeData(resumeData)
    }
}
```

### 10.4 進度追蹤

```swift
func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    didSendBodyData bytesSent: Int64,
    totalBytesSent: Int64,
    totalBytesExpectedToSend: Int64
) {
    let progress = Double(totalBytesSent) / Double(totalBytesExpectedToSend)
    DispatchQueue.main.async {
        self.updateProgressUI(progress)
    }
}
```

### 10.5 LAN 傳輸特別考量

| 考量點 | 建議 |
|--------|------|
| `isDiscretionary` | 設為 `false`（LAN 備份應立即執行） |
| 逾時設定 | 適當延長（大檔案需要時間） |
| Wi-Fi 限制 | 確保 `allowsCellularAccess = false`（僅 Wi-Fi） |
| 並發數 | 限制 3-4 個同時上傳任務 |
| Chunk 大小 | 建議 1-5 MB per chunk |

> 來源：[Build Robust and Resumable File Transfers - WWDC23](https://developer.apple.com/videos/play/wwdc2023/10006/)、[URLSession Common Pitfalls](https://www.avanderlee.com/swift/urlsession-common-pitfalls-with-background-download-upload-tasks/)、[Background Upload in iOS](https://medium.com/@diananareiko8/background-upload-in-ios-f885ed439bd3)

---

## 11. LAN 傳輸安全性考量

### 11.1 是否需要加密？

| 因素 | 分析 |
|------|------|
| **威脅模型** | LAN 為受信任網路，攻擊面較小（但非零） |
| **ARP Spoofing** | 同一 LAN 內可進行中間人攻擊 |
| **資料敏感度** | 個人影片/照片屬中等敏感度 |
| **效能影響** | TLS 1.3 在現代硬體上開銷約 2-5% |
| **實作成本** | 自簽憑證管理增加複雜度 |

### 11.2 建議方案

**MVP 階段：不加密（HTTP）**
- LAN 為受信任環境
- 減少實作複雜度
- 避免憑證管理問題
- 傳輸效能最大化

**正式版：可選 TLS**
- 提供 TLS 選項但預設關閉
- 使用自簽憑證 + certificate pinning
- TLS 1.3 效能損失可接受

### 11.3 替代安全措施

即使不使用 TLS，仍可採取以下措施：

```typescript
// 1. API Token 驗證（防止未授權存取）
const AUTH_TOKEN = crypto.randomBytes(32).toString('hex');

function validateRequest(req: http.IncomingMessage): boolean {
  return req.headers['x-auth-token'] === AUTH_TOKEN;
}

// 2. 設備配對機制（首次使用時交換 token）
// 透過 QR Code 或手動輸入配對碼

// 3. 傳輸完成後 Checksum 驗證（確保完整性）
// 使用 xxHash 驗證檔案完整性
```

> 來源：[Is FTP Secure? A Detailed Look at File Transfer Protocol Security in 2024](https://contabo.com/blog/is-ftp-secure-a-detailed-look-at-file-transfer-protocol-security-in-2024/)、[TLS 1.3 Deep Dive](https://calmops.com/network/tls-1-3-deep-dive-2026/)

---

## 12. 總結與建議

### 針對 Auto Backup Mobile Data 專案的技術選型建議

| 決策點 | 建議 | 理由 |
|--------|------|------|
| **傳輸協定** | HTTP/1.1 + Range header | iOS URLSession 原生支援、斷點續傳、除錯方便 |
| **Server 框架** | Node.js 原生 `http` 模組 | 無依賴、完整底層控制、效能最佳 |
| **串流處理** | `pipeline()` + `highWaterMark: 256KB` | 自動 backpressure、錯誤傳播 |
| **Checksum** | xxHash64（`@node-rs/xxhash`） | LAN 受信任環境、速度比 SHA-256 快 15x |
| **進度追蹤** | 自訂 Transform stream | 移動平均速度、ETA 計算 |
| **並行策略** | `p-limit` 控制 3 並發 | 避免 I/O 瓶頸，兼顧吞吐量 |
| **斷點續傳** | HTTP Range header | 標準實作、iOS 原生支援 |
| **加密** | MVP 不加密、後續可選 TLS | 降低複雜度，LAN 風險可接受 |
| **TCP 優化** | `TCP_NODELAY: true` | 現代 LAN 環境標準做法 |

### 效能預估（Gigabit LAN）

| 檔案大小 | 理論最快 | 預估實際（含 overhead） |
|----------|---------|----------------------|
| 1 GB | ~8 秒 | ~12-15 秒 |
| 5 GB | ~40 秒 | ~60-75 秒 |
| 10 GB | ~80 秒 | ~120-150 秒 |

### 開發優先順序

1. **P0**：基本 HTTP 串流傳輸 + 進度追蹤
2. **P1**：斷點續傳（Range header）
3. **P1**：Checksum 驗證（xxHash）
4. **P2**：多檔案並行傳輸
5. **P3**：TCP 效能調校
6. **P3**：可選 TLS 加密
