# PoC 結果：libimobiledevice macOS Sequoia 相容性驗證

**任務 ID**: TASK-010
**執行日期**: 2026-03-11
**執行者**: Claude Agent

---

## 環境資訊

| 項目 | 版本 |
|------|------|
| macOS 版本 | 15.6.1 (Sequoia) BuildVersion: 24G90 |
| 架構 | arm64 (Apple Silicon) |
| libimobiledevice | 1.4.0 |
| ifuse | 1.2.0 (從源碼編譯) |
| macFUSE | 5.1.3 |
| Homebrew | /opt/homebrew/bin/brew |

### 依賴套件
| 套件 | 版本 |
|------|------|
| libplist | 2.7.0 |
| libimobiledevice-glue | 1.3.2 |
| libtasn1 | 4.21.0 |
| libtatsu | 1.0.5 |
| libusbmuxd | 2.1.1 |

---

## 驗收條件測試結果

| # | 驗收條件 | 結果 | 備註 |
|---|---------|------|------|
| 1 | `brew install libimobiledevice ifuse` 成功安裝（記錄版本號） | ✅ 通過 | libimobiledevice 1.4.0 via brew；ifuse 1.2.0 從源碼編譯（見說明） |
| 2 | `idevice_id -l` 能列出裝置 UDID | ⏸️ 需實機 | 無裝置連接，指令執行無錯誤但無輸出 |
| 3 | `idevicepair pair` 完成 Trust 配對 | ⏸️ 需實機 | 依賴驗收條件 2 |
| 4 | `ifuse ~/mnt/iphone` 能掛載 iPhone 檔案系統 | ⏸️ 需實機 | 依賴驗收條件 3 |
| 5 | `ls ~/mnt/iphone/DCIM/` 能列出照片目錄 | ⏸️ 需實機 | 依賴驗收條件 4 |
| 6 | `umount` / `fusermount -u` 能正常卸載 | ⏸️ 需實機 | 依賴驗收條件 4 |
| 7 | 記錄 iOS 版本、macOS 版本、libimobiledevice 版本 | ✅ 通過 | macOS 15.6.1 / libimobiledevice 1.4.0（iOS 版本待實機取得） |

---

## 安裝過程紀錄

### Step 1: 環境確認
```
macOS 15.6.1 (Sequoia), arm64, Homebrew at /opt/homebrew/bin/brew
```

### Step 2: 安裝工具

**libimobiledevice（成功）**
```bash
brew install libimobiledevice
# 結果: libimobiledevice 1.4.0 安裝至 /opt/homebrew/Cellar/libimobiledevice/1.4.0
```

**ifuse（已知問題 — 需從源碼編譯）**

`brew install ifuse` 失敗，錯誤訊息：
```
ifuse: Linux is required for this software.
libfuse: Linux is required for this software.
Error: ifuse: Unsatisfied requirements failed this build.
```

**解決方案：安裝 macFUSE 後從源碼編譯 ifuse**
```bash
# 1. 安裝 macFUSE (kernel extension, 提供 /usr/local/lib/libfuse3.dylib)
brew install --cask macfuse   # 版本 5.1.3

# 2. 安裝編譯依賴
brew install autoconf automake libtool pkg-config

# 3. 從源碼編譯 ifuse
git clone https://github.com/libimobiledevice/ifuse.git /tmp/ifuse
cd /tmp/ifuse
autoreconf -fi
./configure --prefix=/opt/homebrew
make && make install

# 結果: ifuse 1.2.0 安裝至 /opt/homebrew/bin/ifuse
```

configure 輸出確認 fuse3 偵測成功：
```
checking for fuse3 >= 3.0.0... yes
```

### Step 3: 裝置連線測試
```bash
idevice_id -l
# 結果: 無輸出（目前無 iPhone 連接）
# 注意: 指令執行無錯誤，表示 usbmuxd 通訊正常
```

---

## 遇到的問題與解法

### 問題 1: `brew install ifuse` 在 macOS 失敗

**原因**: Homebrew 的 ifuse formula 硬性要求 Linux 作業系統，macOS 不支援直接安裝。

**解法**:
1. 安裝 macFUSE（macOS 的 FUSE 實作，提供 kernel extension）
2. 從 GitHub 官方源碼編譯 ifuse 1.2.0
3. configure 自動偵測到 macFUSE 提供的 fuse3 libraries

**重要注意**: macFUSE 需要 kernel extension，在 macOS Sequoia 首次執行 ifuse 時可能需要：
- 前往「系統設定 → 隱私權與安全性」允許 macFUSE kernel extension
- 可能需要重新開機

---

## 結論

**狀態**: BLOCKED（需要實機測試）

**已完成部分**:
- libimobiledevice 1.4.0 成功安裝並可執行
- ifuse 1.2.0 從源碼編譯成功（macFUSE 5.1.3 作為後端）
- 工具鏈在 macOS Sequoia arm64 上可正常建置

**阻擋原因**:
需要實體 iPhone 連接才能完成驗收條件 2-6（UDID 列出、配對、掛載、DCIM 存取、卸載）。

**技術可行性評估**:
- libimobiledevice 本身在 macOS Sequoia arm64 上運作正常
- ifuse 需要從源碼編譯（brew formula 僅支援 Linux），但編譯成功
- macFUSE kernel extension 在 macOS Sequoia 上有額外安全性要求（需用戶授權）
- **整體方案技術上可行**，但需要實機驗證掛載功能

**後續建議**:
1. 連接實體 iPhone，執行驗收條件 2-6
2. 確認 macFUSE kernel extension 在 System Settings 中已獲授權
3. 若掛載失敗，考慮替代方案：
   - `idevicebackup2`（不需 FUSE，使用 iTunes 備份格式）
   - PhotoKit / AFC protocol（透過 libimobiledevice AFC 客戶端直接存取，無需 mount）

---

## 指令參考（待實機執行）

```bash
# 確認裝置
idevice_id -l

# 配對
idevicepair pair

# 建立掛載點
mkdir -p ~/mnt/iphone

# 掛載
ifuse ~/mnt/iphone

# 列出 DCIM
ls ~/mnt/iphone/DCIM/

# 卸載
umount ~/mnt/iphone 2>/dev/null || fusermount -u ~/mnt/iphone 2>/dev/null
```
