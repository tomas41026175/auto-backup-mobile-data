import { useEffect, useState } from 'react'
import {
  CheckCircle2,
  XCircle,
  Clock,
  FolderOpen,
  Filter,
  Search,
} from 'lucide-react'
import type { BackupRecord } from '../../../shared/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime()
  const diffHours = diffMs / (1000 * 60 * 60)
  if (diffHours < 1) return '剛才'
  if (diffHours < 24) return `${Math.floor(diffHours)} 小時前`
  if (diffHours < 48) return '昨天'
  return `${Math.floor(diffHours / 24)} 天前`
}

function formatDateTime(isoString: string): string {
  return new Date(isoString).toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins} 分 ${secs} 秒`
}

// ── Types ─────────────────────────────────────────────────────────────────────

type FilterStatus = 'all' | 'success' | 'error' | 'cancelled'
type FilterPeriod = 'all' | 'today' | 'thisWeek'

// ── Sub-components ────────────────────────────────────────────────────────────

interface StatItemProps {
  label: string
  value: string
}

function StatItem({ label, value }: StatItemProps): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-xl font-semibold text-gray-100">{value}</span>
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  )
}

function StatDivider(): React.JSX.Element {
  return <div className="w-px self-stretch bg-gray-700" />
}

interface RecordItemProps {
  record: BackupRecord
}

function RecordItem({ record }: RecordItemProps): React.JSX.Element {
  const isSuccess = record.status === 'success'

  return (
    <div className="group relative flex cursor-default overflow-hidden rounded-lg transition-colors duration-150 hover:bg-gray-700/50 bg-gray-800">
      {/* Left accent line */}
      <div
        className={`w-[3px] shrink-0 self-stretch rounded-l-lg ${
          isSuccess ? 'bg-green-500' : 'bg-red-500'
        }`}
      />

      {/* Content */}
      <div className="flex flex-1 flex-col gap-1 px-3 py-3">
        {/* Row 1: icon + device name + relative time */}
        <div className="flex items-center gap-2">
          {isSuccess ? (
            <CheckCircle2 size={15} className="text-green-400 shrink-0" />
          ) : (
            <XCircle size={15} className="text-red-400 shrink-0" />
          )}
          <span className="flex-1 truncate text-sm font-semibold text-gray-100">
            {record.deviceName}
          </span>
          <span className="shrink-0 text-xs text-gray-500">
            {formatRelativeTime(record.completedAt)}
          </span>
        </div>

        {/* Row 2: datetime + fileCount + duration */}
        <div className="ml-[23px] text-xs text-gray-400">
          <span>
            {formatDateTime(record.completedAt)}
            {isSuccess && (
              <>
                <span className="text-gray-600"> | </span>
                {record.fileCount.toLocaleString()} 個項目
                <span className="text-gray-600"> | </span>
                {formatDuration(record.duration)}
              </>
            )}
          </span>
        </div>

        {/* Row 3: sync types + direction */}
        <div className="ml-[23px] flex items-center gap-1 text-xs text-gray-500">
          <FolderOpen size={11} />
          <span className="truncate">
            {record.syncTypes.join(', ')} ·{' '}
            {record.direction === 'mobile-to-pc' ? '手機 → 電腦' : '電腦 → 手機'}
          </span>
        </div>
      </div>
    </div>
  )
}

function EmptyState(): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16">
      <Clock size={40} className="text-gray-600" />
      <div className="flex flex-col items-center gap-1">
        <span className="text-sm font-medium text-gray-400">尚無備份紀錄</span>
        <span className="text-xs text-gray-600">完成第一次備份後將在此顯示</span>
      </div>
    </div>
  )
}

// ── History Page ──────────────────────────────────────────────────────────────

function History(): React.JSX.Element {
  const [records, setRecords] = useState<BackupRecord[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')

  useEffect(() => {
    setLoading(true)
    window.api
      .invoke('get-history')
      .then((data) => {
        setRecords(data)
      })
      .catch(() => {
        setRecords([])
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  const now = new Date()

  const thisMonthCount = records.filter((r) => {
    const d = new Date(r.completedAt)
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  }).length

  const latestRecord = records.reduce<string | null>((prev, r) => {
    if (!prev) return r.completedAt
    return r.completedAt > prev ? r.completedAt : prev
  }, null)

  const filteredRecords = records.filter((r) => {
    if (filterStatus !== 'all' && r.status !== filterStatus) return false

    if (filterPeriod === 'today') {
      const d = new Date(r.completedAt)
      if (
        d.getFullYear() !== now.getFullYear() ||
        d.getMonth() !== now.getMonth() ||
        d.getDate() !== now.getDate()
      ) {
        return false
      }
    } else if (filterPeriod === 'thisWeek') {
      if (Date.now() - new Date(r.completedAt).getTime() > 7 * 24 * 60 * 60 * 1000) {
        return false
      }
    }

    if (
      searchQuery.trim() !== '' &&
      !r.deviceName.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false
    }

    return true
  })

  const statusOptions: { value: FilterStatus; label: string }[] = [
    { value: 'all', label: '全部' },
    { value: 'success', label: '成功' },
    { value: 'error', label: '失敗' },
    { value: 'cancelled', label: '已取消' },
  ]

  const periodOptions: { value: FilterPeriod; label: string }[] = [
    { value: 'all', label: '全部時間' },
    { value: 'today', label: '今天' },
    { value: 'thisWeek', label: '本週' },
  ]

  const successCount = filteredRecords.filter((r) => r.status === 'success').length
  const failCount = filteredRecords.filter(
    (r) => r.status === 'error' || r.status === 'cancelled'
  ).length

  return (
    <div className="flex h-full flex-col overflow-hidden bg-gray-900">
      {/* Page Header */}
      <div className="shrink-0 border-b border-gray-700 px-4 pb-4 pt-5">
        <h1 className="mb-4 text-base font-semibold text-gray-100">備份歷史</h1>

        {/* Stats row */}
        <div className="flex items-center justify-around rounded-xl bg-gray-800 px-4 py-3">
          <StatItem label="本月備份" value={`${thisMonthCount} 次`} />
          <StatDivider />
          <StatItem label="總計" value={`${records.length} 次`} />
          <StatDivider />
          <StatItem
            label="最後備份"
            value={latestRecord !== null ? formatRelativeTime(latestRecord) : '—'}
          />
        </div>
      </div>

      {/* Filter row */}
      <div className="shrink-0 flex items-center gap-2 border-b border-gray-700 px-4 py-3">
        {/* Status filter */}
        <div className="relative">
          <Filter
            size={12}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500"
          />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
            className="h-7 cursor-pointer appearance-none rounded-md border border-gray-600 bg-gray-800 pl-7 pr-6 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-500">
            ▾
          </span>
        </div>

        {/* Period filter */}
        <div className="relative">
          <select
            value={filterPeriod}
            onChange={(e) => setFilterPeriod(e.target.value as FilterPeriod)}
            className="h-7 cursor-pointer appearance-none rounded-md border border-gray-600 bg-gray-800 px-3 pr-6 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {periodOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-500">
            ▾
          </span>
        </div>

        {/* Search */}
        <div className="relative flex-1">
          <Search
            size={12}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500"
          />
          <input
            type="text"
            placeholder="搜尋裝置..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-7 w-full rounded-md border border-gray-600 bg-gray-800 pl-7 pr-3 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Records list */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <span className="text-sm text-gray-500">載入中...</span>
          </div>
        ) : filteredRecords.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col gap-2">
            {/* Count summary */}
            <div className="flex items-center gap-2 pb-1">
              <span className="text-xs text-gray-500">共 {filteredRecords.length} 筆記錄</span>
              <div className="flex gap-1.5">
                {successCount > 0 && (
                  <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-[10px] text-green-400">
                    {successCount} 成功
                  </span>
                )}
                {failCount > 0 && (
                  <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] text-red-400">
                    {failCount} 失敗
                  </span>
                )}
              </div>
            </div>

            <div className="h-px bg-gray-700" />

            {/* Record list */}
            <div className="flex flex-col gap-2 pt-1">
              {filteredRecords.map((record) => (
                <RecordItem key={record.id} record={record} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default History
