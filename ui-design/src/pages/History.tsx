import React, { useState } from 'react'
import {
  CheckCircle2,
  XCircle,
  Clock,
  FolderOpen,
  Filter,
  Search,
} from 'lucide-react'
import { cn, Badge, Divider } from '../components/ui'

// ── Types ─────────────────────────────────────────────────────────────────────

interface BackupRecord {
  id: string
  deviceName: string
  deviceIp: string
  startedAt: Date
  completedAt: Date | null
  status: 'success' | 'failed'
  fileCount: number | null
  sizeBytes: number | null
  backupPath: string
  errorMessage: string | null
}

// ── Mock Data ─────────────────────────────────────────────────────────────────

const mockRecords: BackupRecord[] = [
  {
    id: '1',
    deviceName: 'iPhone SE (Tomas)',
    deviceIp: '192.168.1.50',
    startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    completedAt: new Date(Date.now() - 1.8 * 60 * 60 * 1000),
    status: 'success',
    fileCount: 847,
    sizeBytes: 1_288_490_188,
    backupPath: 'D:\\Backup\\iPhone',
    errorMessage: null,
  },
  {
    id: '2',
    deviceName: 'iPhone SE (Tomas)',
    deviceIp: '192.168.1.50',
    startedAt: new Date(Date.now() - 26 * 60 * 60 * 1000),
    completedAt: null,
    status: 'failed',
    fileCount: null,
    sizeBytes: null,
    backupPath: 'D:\\Backup\\iPhone',
    errorMessage: '備份路徑不可用，外接硬碟未掛載',
  },
  {
    id: '3',
    deviceName: 'iPhone SE (Tomas)',
    deviceIp: '192.168.1.50',
    startedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    completedAt: new Date(Date.now() - 2.9 * 24 * 60 * 60 * 1000),
    status: 'success',
    fileCount: 1203,
    sizeBytes: 2_684_354_560,
    backupPath: 'D:\\Backup\\iPhone',
    errorMessage: null,
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)
  if (diffHours < 1) return '剛才'
  if (diffHours < 24) return `${Math.floor(diffHours)} 小時前`
  if (diffHours < 48) return '昨天'
  return `${Math.floor(diffHours / 24)} 天前`
}

function formatDateTime(date: Date): string {
  return date.toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface StatItemProps {
  label: string
  value: string
}

function StatItem({ label, value }: StatItemProps): React.ReactElement {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span
        className="text-xl font-semibold"
        style={{ color: 'var(--color-text)' }}
      >
        {value}
      </span>
      <span
        className="text-xs"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {label}
      </span>
    </div>
  )
}

interface StatDividerProps {}

function StatDivider(_props: StatDividerProps): React.ReactElement {
  return (
    <div
      className="w-px self-stretch"
      style={{ backgroundColor: 'var(--color-border)' }}
    />
  )
}

interface RecordItemProps {
  record: BackupRecord
}

function RecordItem({ record }: RecordItemProps): React.ReactElement {
  const isSuccess = record.status === 'success'

  return (
    <div
      className={cn(
        'group relative flex cursor-default overflow-hidden rounded-lg transition-colors duration-150',
        'hover:bg-[--color-bg-overlay]',
      )}
      style={{ backgroundColor: 'var(--color-bg-surface)' }}
    >
      {/* 左側色彩細線 */}
      <div
        className="w-[3px] shrink-0 self-stretch rounded-l-lg"
        style={{
          backgroundColor: isSuccess
            ? 'var(--color-success)'
            : 'var(--color-error)',
        }}
      />

      {/* 記錄內容 */}
      <div className="flex flex-1 flex-col gap-1 px-3 py-3">
        {/* 第一行：狀態圖示 + 裝置名稱 + 相對時間 */}
        <div className="flex items-center gap-2">
          {isSuccess ? (
            <CheckCircle2
              size={15}
              style={{ color: 'var(--color-success)', flexShrink: 0 }}
            />
          ) : (
            <XCircle
              size={15}
              style={{ color: 'var(--color-error)', flexShrink: 0 }}
            />
          )}
          <span
            className="flex-1 truncate text-sm font-semibold"
            style={{ color: 'var(--color-text)' }}
          >
            {record.deviceName}
          </span>
          <span
            className="shrink-0 text-xs"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {formatRelativeTime(record.startedAt)}
          </span>
        </div>

        {/* 第二行：日期時間 | 檔案大小 | 項目數 或 錯誤原因 */}
        <div
          className="ml-[23px] text-xs"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {isSuccess && record.sizeBytes !== null && record.fileCount !== null ? (
            <span>
              {formatDateTime(record.startedAt)}
              <span style={{ color: 'var(--color-text-muted)' }}> | </span>
              {formatBytes(record.sizeBytes)}
              <span style={{ color: 'var(--color-text-muted)' }}> | </span>
              {record.fileCount.toLocaleString()} 個項目
            </span>
          ) : (
            <span>
              {formatDateTime(record.startedAt)}
              <span style={{ color: 'var(--color-text-muted)' }}> | </span>
              <span style={{ color: 'var(--color-error)' }}>
                {record.errorMessage}
              </span>
            </span>
          )}
        </div>

        {/* 第三行：備份路徑 */}
        <div
          className="ml-[23px] flex items-center gap-1 text-xs"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <FolderOpen size={11} />
          <span className="truncate">{record.backupPath}</span>
        </div>
      </div>
    </div>
  )
}

interface EmptyStateProps {}

function EmptyState(_props: EmptyStateProps): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16">
      <Clock
        size={40}
        style={{ color: 'var(--color-text-muted)' }}
      />
      <div className="flex flex-col items-center gap-1">
        <span
          className="text-sm font-medium"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          尚無備份記錄
        </span>
        <span
          className="text-xs"
          style={{ color: 'var(--color-text-muted)' }}
        >
          完成第一次備份後將在此顯示
        </span>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

type FilterStatus = 'all' | 'success' | 'failed'
type FilterPeriod = 'all' | 'thisMonth' | 'last7Days'

export function History(): React.ReactElement {
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>('thisMonth')
  const [searchQuery, setSearchQuery] = useState<string>('')

  const totalCount = mockRecords.length
  const thisMonthCount = mockRecords.filter((r) => {
    const now = new Date()
    return (
      r.startedAt.getFullYear() === now.getFullYear() &&
      r.startedAt.getMonth() === now.getMonth()
    )
  }).length

  const lastBackup = mockRecords.reduce<Date | null>((latest, r) => {
    if (latest === null || r.startedAt > latest) return r.startedAt
    return latest
  }, null)

  const filteredRecords = mockRecords.filter((r) => {
    if (filterStatus !== 'all' && r.status !== filterStatus) return false

    if (filterPeriod === 'thisMonth') {
      const now = new Date()
      if (
        r.startedAt.getFullYear() !== now.getFullYear() ||
        r.startedAt.getMonth() !== now.getMonth()
      ) {
        return false
      }
    } else if (filterPeriod === 'last7Days') {
      if (Date.now() - r.startedAt.getTime() > 7 * 24 * 60 * 60 * 1000) return false
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
    { value: 'failed', label: '失敗' },
  ]

  const periodOptions: { value: FilterPeriod; label: string }[] = [
    { value: 'all', label: '全部時間' },
    { value: 'thisMonth', label: '本月' },
    { value: 'last7Days', label: '近 7 天' },
  ]

  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      style={{ backgroundColor: 'var(--color-bg-base)' }}
    >
      {/* ── 頁面 Header ── */}
      <div
        className="shrink-0 px-4 pt-5 pb-4"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <h1
          className="mb-4 text-base font-semibold"
          style={{ color: 'var(--color-text)' }}
        >
          備份歷史
        </h1>

        {/* 統計列 */}
        <div
          className="flex items-center justify-around rounded-xl px-4 py-3"
          style={{ backgroundColor: 'var(--color-bg-surface)' }}
        >
          <StatItem label="本月備份" value={`${thisMonthCount} 次`} />
          <StatDivider />
          <StatItem label="總計" value={`${totalCount} 次`} />
          <StatDivider />
          <StatItem
            label="最後備份"
            value={lastBackup !== null ? formatRelativeTime(lastBackup) : '—'}
          />
        </div>
      </div>

      {/* ── 篩選列 ── */}
      <div
        className="shrink-0 flex items-center gap-2 px-4 py-3"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        {/* 狀態篩選 */}
        <div className="relative">
          <Filter
            size={12}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--color-text-muted)' }}
          />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
            className={cn(
              'h-7 appearance-none rounded-md border pl-7 pr-6 text-xs',
              'transition-colors focus:outline-none focus:ring-1',
              'cursor-pointer',
            )}
            style={{
              backgroundColor: 'var(--color-bg-raised)',
              borderColor: 'var(--color-border-strong)',
              color: 'var(--color-text)',
            }}
          >
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <span
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px]"
            style={{ color: 'var(--color-text-muted)' }}
          >
            ▾
          </span>
        </div>

        {/* 時間篩選 */}
        <div className="relative">
          <select
            value={filterPeriod}
            onChange={(e) => setFilterPeriod(e.target.value as FilterPeriod)}
            className={cn(
              'h-7 appearance-none rounded-md border px-3 pr-6 text-xs',
              'transition-colors focus:outline-none focus:ring-1',
              'cursor-pointer',
            )}
            style={{
              backgroundColor: 'var(--color-bg-raised)',
              borderColor: 'var(--color-border-strong)',
              color: 'var(--color-text)',
            }}
          >
            {periodOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <span
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px]"
            style={{ color: 'var(--color-text-muted)' }}
          >
            ▾
          </span>
        </div>

        {/* 搜尋裝置 */}
        <div className="relative flex-1">
          <Search
            size={12}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--color-text-muted)' }}
          />
          <input
            type="text"
            placeholder="搜尋裝置..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              'h-7 w-full rounded-md border pl-7 pr-3 text-xs',
              'transition-colors focus:outline-none focus:ring-1',
            )}
            style={{
              backgroundColor: 'var(--color-bg-raised)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)',
            }}
          />
        </div>
      </div>

      {/* ── 備份記錄清單 ── */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {filteredRecords.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col gap-2">
            {/* 篩選結果計數 */}
            <div className="flex items-center gap-2 pb-1">
              <span
                className="text-xs"
                style={{ color: 'var(--color-text-muted)' }}
              >
                共 {filteredRecords.length} 筆記錄
              </span>
              <div className="flex gap-1.5">
                {filteredRecords.filter((r) => r.status === 'success').length > 0 && (
                  <Badge variant="success">
                    {filteredRecords.filter((r) => r.status === 'success').length} 成功
                  </Badge>
                )}
                {filteredRecords.filter((r) => r.status === 'failed').length > 0 && (
                  <Badge variant="error">
                    {filteredRecords.filter((r) => r.status === 'failed').length} 失敗
                  </Badge>
                )}
              </div>
            </div>

            <Divider />

            {/* 記錄列表 */}
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
