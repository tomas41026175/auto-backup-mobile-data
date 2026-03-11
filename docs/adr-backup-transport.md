# ADR: iPhone 備份傳輸方案 — AFC 直接存取 vs ifuse mount

**日期**：2026-03-11
**狀態**：已採用

---

## 背景

TASK-010 PoC 驗證過程中發現：ifuse 在 macOS Sequoia 上需要安裝 macFUSE kernel extension，
並要求用戶在「系統設定 → 隱私權與安全性」手動允許，這對一般用戶造成額外安裝摩擦。

libimobiledevice 提供兩種存取 iPhone DCIM 的方式：
1. **ifuse mount**：透過 macFUSE 將 iPhone 掛載為本地磁碟，再用標準 fs API 存取
2. **AFC 直接存取**：透過 `idevicebackup2`、`idevicefsync` 等 CLI 工具，直接使用 AFC 協定傳輸

---

## 決策

**採用 AFC 直接存取**，不使用 ifuse mount。

---

## 理由

| 面向 | ifuse mount | AFC 直接存取 |
|------|------------|-------------|
| 用戶安裝步驟 | 需手動安裝 macFUSE + 允許 kernel extension | 僅需 `brew install libimobiledevice` |
| macOS Sequoia 相容性 | 需用戶在系統設定手動允許（UX 摩擦高） | ✅ 開箱即用 |
| brew 安裝 | ifuse 不提供 macOS bottle，需從源碼編譯 | libimobiledevice 提供 arm64 bottle |
| 程式複雜度 | 需管理 mount/umount 生命週期 | 直接 execFile CLI，較簡單 |
| 傳輸效能 | 略快（直接 fs read） | 相近（AFC 協定本身已最佳化） |

macFUSE kernel extension 的用戶手動允許步驟，對「開箱即用」的個人備份工具是不可接受的 UX 負擔。

---

## 實作方式

使用 `child_process.execFile` 呼叫以下 CLI（優先順序）：

1. `idevicebackup2 --unencrypted`：備份整個 DCIM 到本地目錄
2. `idevicefsync`（若需要更細粒度控制）：AFC 協定同步

所有 CLI 呼叫使用 `execFile`（非 `exec`），防止 shell injection。

---

## 後果

- **正面**：用戶安裝流程更簡單，macOS Sequoia 相容性更好
- **負面**：無法用標準 `fs` API 直接讀寫 iPhone 檔案，需透過 CLI 工具
- **技術債**：若未來需要更細粒度的 AFC 存取（如逐檔串流進度），需評估是否引入 AFC Node.js binding
