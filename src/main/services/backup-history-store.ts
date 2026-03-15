import { Conf } from 'electron-conf/main'
import type { BackupRecord } from '../../shared/types'

interface StoredHistory {
  records: BackupRecord[]
}

// GC 防護：模組層級全域
const store = new Conf<StoredHistory>({ name: 'backup-history' })

export interface BackupHistoryStore {
  addRecord(record: BackupRecord): void
  getHistory(): BackupRecord[]
  clearHistory(): void
}

export function createBackupHistoryStore(): BackupHistoryStore {
  if (!store.has('records')) {
    store.set('records', [])
  }

  function getHistory(): BackupRecord[] {
    const records = store.get('records', [])
    // Migrate old records that stored duration in ms instead of seconds.
    // A backup taking more than 1 day (86400s) is unrealistic — treat as ms.
    const migrated = records.map((r) =>
      r.duration > 86400 ? { ...r, duration: Math.round(r.duration / 1000) } : r
    )
    // 依 completedAt 降序排列
    return [...migrated].sort(
      (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
    )
  }

  function addRecord(record: BackupRecord): void {
    const current = store.get('records', [])
    store.set('records', [...current, record])
  }

  function clearHistory(): void {
    store.set('records', [])
  }

  return {
    addRecord,
    getHistory,
    clearHistory
  }
}
