'use client'

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { GlassCard } from '@/components/ui/GlassCard'
import { cn } from '@/lib/cn'
import { supabaseClient } from '@/lib/supabaseClient'
import type { StaffAffiliation, StaffRow, StaffStatus, SortMode } from '../staff-admin.types'
import { AFFILIATION_LABEL } from '../staff-admin.types'

export type StaffListTabProps = {
  syncing: boolean
  visible: StaffRow[]
  sortMode: SortMode
  setSortMode: (m: SortMode) => void
  sentinelRef: RefObject<HTMLDivElement | null>
  onStaffDoubleTap: (staffId: string) => void
  onApplyStatusToStaffs: (
    staffIds: string[],
    status: Extract<StaffStatus, 'CHOICE_ING' | 'CHOICE_DONE' | 'CAR_WAIT'>,
    prefill?: { storeId: number; storeName: string; workTime: string }
  ) => Promise<void>
  isPending: boolean
}

type StoreRow = { id: number; name: string; is_active: boolean }
type PrefillRow = { storeId?: number; storeName?: string; workTime?: string }

export function StaffListTab(props: StaffListTabProps) {
  const {
    syncing,
    visible,
    sortMode: _sortMode,
    setSortMode: _setSortMode,
    sentinelRef,
    onStaffDoubleTap,
    onApplyStatusToStaffs,
    isPending,
  } = props

  const [affTab, setAffTab] = useState<StaffAffiliation>('GOGO')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [applyingKey, setApplyingKey] = useState<'CHOICE_ING' | 'CHOICE_DONE' | 'CAR_WAIT' | null>(null)
  const [stores, setStores] = useState<StoreRow[]>([])
  const [storesLoading, setStoresLoading] = useState(false)
  const [storeQuery, setStoreQuery] = useState('')
  const [selectedStoreId, setSelectedStoreId] = useState<number | ''>('')
  const [storeDropdownOpen, setStoreDropdownOpen] = useState(false)
  const [workTime, setWorkTime] = useState(getTimeHHMM())
  const [prefillMap, setPrefillMap] = useState<Record<string, PrefillRow>>({})
  const tapRef = useRef<Record<string, number>>({})

  const rowsByAff = useMemo(() => {
    const arr = visible.filter((r) => r.affiliation === affTab)
    arr.sort((a, b) => (a.nickname || '').localeCompare(b.nickname || '', 'ko'))
    return arr
  }, [visible, affTab])

  const rowsByStatusSections = useMemo(() => {
    const sections: Array<{ key: string; label: string; rows: StaffRow[]; tone: string }> = [
      { key: 'CHOICE_ING', label: '초이스중', rows: [], tone: 'text-sky-200/90' },
      { key: 'CAR_WAIT', label: '차대기중', rows: [], tone: 'text-amber-200/90' },
      { key: 'CHOICE_DONE', label: '초이스완료', rows: [], tone: 'text-emerald-200/90' },
      { key: 'ETC', label: '기타/퇴근', rows: [], tone: 'text-white/65' },
    ]
    for (const r of rowsByAff) {
      if (r.work_status === 'CHOICE_ING') sections[0].rows.push(r)
      else if (r.work_status === 'CAR_WAIT') sections[1].rows.push(r)
      else if (r.work_status === 'CHOICE_DONE') sections[2].rows.push(r)
      else sections[3].rows.push(r)
    }
    return sections
  }, [rowsByAff])

  const filteredStores = useMemo(() => {
    const q = storeQuery.trim().toLowerCase()
    const active = stores.filter((s) => s.is_active)
    if (!q) return active
    return active
      .filter((s) => s.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1
        const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1
        if (aStarts !== bStarts) return aStarts - bStarts
        return a.name.localeCompare(b.name, 'ko')
      })
  }, [stores, storeQuery])

  useEffect(() => {
    let alive = true
    setStoresLoading(true)
    ;(async () => {
      try {
        const { data, error } = await supabaseClient.from('stores').select('id, name, is_active').eq('is_active', true).order('name', { ascending: true })
        if (!alive) return
        if (error) return
        setStores((Array.isArray(data) ? data : []) as StoreRow[])
      } finally {
        if (alive) setStoresLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const onPickStore = (s: StoreRow) => {
    setSelectedStoreId(s.id)
    setStoreQuery(s.name)
    setStoreDropdownOpen(false)
  }

  const refreshPrefillMap = () => {
    const next: Record<string, PrefillRow> = {}
    for (const r of visible) {
      try {
        const raw = localStorage.getItem(`pc_staff_prefill_${r.id}_v1`)
        if (!raw) continue
        const parsed = JSON.parse(raw) as PrefillRow
        if (!parsed || typeof parsed !== 'object') continue
        next[r.id] = parsed
      } catch {}
    }
    setPrefillMap(next)
  }

  useEffect(() => {
    refreshPrefillMap()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  const statusText = (s: StaffStatus | null) => {
    if (!s || s === 'OFF') return '퇴근'
    if (s === 'CHOICE_ING') return '초이스중'
    if (s === 'CHOICE_DONE') return '초이스완료'
    if (s === 'CAR_WAIT') return '차대기'
    return '출근'
  }

  const toggleSelectOrOpen = (staffId: string) => {
    const now = Date.now()
    const prev = tapRef.current[staffId] ?? 0
    tapRef.current[staffId] = now
    if (now - prev <= 280) {
      onStaffDoubleTap(staffId)
      return
    }
    setSelectedIds((prevIds) => (prevIds.includes(staffId) ? prevIds.filter((id) => id !== staffId) : [...prevIds, staffId]))
  }

  const applyStatus = async (status: 'CHOICE_ING' | 'CHOICE_DONE' | 'CAR_WAIT') => {
    if (!selectedIds.length) return
    if (status !== 'CAR_WAIT') {
      if (!selectedStoreId) {
        window.alert('가게를 선택하세요.')
        return
      }
      if (!workTime) {
        window.alert('시간을 선택하세요.')
        return
      }
    }
    setApplyingKey(status)
    try {
      await onApplyStatusToStaffs(
        selectedIds,
        status,
        status === 'CAR_WAIT' ? undefined : { storeId: Number(selectedStoreId), storeName: storeQuery.trim(), workTime }
      )
      setSelectedIds([])
      refreshPrefillMap()
    } finally {
      setApplyingKey(null)
    }
  }

  return (
    <GlassCard className="p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] text-white/45">{selectedIds.length}명 선택</div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <button
          type="button"
          disabled={!selectedIds.length || applyingKey != null}
          onClick={() => void applyStatus('CHOICE_ING')}
          className={cn(
            'rounded-lg border px-2 py-2 text-[11px] font-bold transition',
            'border-sky-400/35 bg-sky-500/15 text-sky-100 hover:bg-sky-500/25',
            (!selectedIds.length || applyingKey != null) && 'opacity-50'
          )}
        >
          {applyingKey === 'CHOICE_ING' ? '처리중…' : '초이스중'}
        </button>
        <button
          type="button"
          disabled={!selectedIds.length || applyingKey != null}
          onClick={() => void applyStatus('CHOICE_DONE')}
          className={cn(
            'rounded-lg border px-2 py-2 text-[11px] font-bold transition',
            'border-emerald-400/35 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25',
            (!selectedIds.length || applyingKey != null) && 'opacity-50'
          )}
        >
          {applyingKey === 'CHOICE_DONE' ? '처리중…' : '초이스완료'}
        </button>
        <button
          type="button"
          disabled={!selectedIds.length || applyingKey != null}
          onClick={() => void applyStatus('CAR_WAIT')}
          className={cn(
            'rounded-lg border px-2 py-2 text-[11px] font-bold transition',
            'border-amber-400/35 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25',
            (!selectedIds.length || applyingKey != null) && 'opacity-50'
          )}
        >
          {applyingKey === 'CAR_WAIT' ? '처리중…' : '차대기중'}
        </button>
      </div>

      <div className="mt-3 overflow-x-auto rounded-lg border border-white/10 bg-black/15 p-2.5 [scrollbar-width:none]">
        <div className="flex min-w-[29rem] flex-nowrap items-end gap-2.5">
        <div className="w-[8.75rem] shrink-0">
          <label className="text-[11px] font-medium text-white/75">가게 선택</label>
          <div className="relative mt-1.5">
            <input
              disabled={storesLoading}
              className={cn(
                'w-full rounded-lg border border-white/12 bg-black/20 px-2.5 py-2 text-[12px] text-white outline-none placeholder:text-white/30 focus:border-white/25 truncate',
                storesLoading && 'opacity-70 cursor-not-allowed'
              )}
              value={storeQuery}
              onChange={(e) => {
                setStoreQuery(e.target.value)
                setStoreDropdownOpen(true)
                setSelectedStoreId('')
              }}
              onFocus={() => !storesLoading && setStoreDropdownOpen(true)}
              onBlur={() => window.setTimeout(() => setStoreDropdownOpen(false), 120)}
              placeholder={storesLoading ? '불러오는 중…' : ''}
              autoComplete="off"
            />
            {!storesLoading && storeDropdownOpen && filteredStores.length > 0 && (
              <div className={cn('absolute z-20 mt-2 w-full overflow-hidden rounded-xl', 'border border-white/12 bg-zinc-950/95 backdrop-blur-xl shadow-2xl')}>
                <div className="max-h-52 overflow-y-auto py-1">
                  {filteredStores.map((s) => (
                    <button
                      key={s.id}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => onPickStore(s)}
                      className="w-full text-left px-3 py-2.5 hover:bg-white/10 transition"
                      type="button"
                    >
                      <div className="text-[12px] font-semibold text-white">{s.name}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <label className="text-[11px] font-medium text-white/75">시간 설정</label>
          <div className="mt-1.5 flex flex-nowrap items-center gap-1.5">
            <input
              type="time"
              className={cn(
                'w-[7.1rem] min-w-0 shrink-0 rounded-lg border border-white/12 bg-black/20 px-2 py-2',
                'text-[12px] text-white outline-none focus:border-white/25',
                '[color-scheme:dark]'
              )}
              value={workTime}
              onChange={(e) => setWorkTime(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setWorkTime(addMinutesToNowHHMM(5))}
              className="h-[34px] w-[40px] shrink-0 rounded-lg border border-white/12 bg-white/5 px-0 py-0 text-[11px] font-semibold text-white/80 hover:bg-white/10 transition"
              title="현재 시각 +5분"
            >
              +5
            </button>
          </div>
        </div>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <div className="w-[72px] shrink-0">
          <div className="grid gap-2">
            {(['GOGO', 'AONE'] as const).map((aff) => (
              <button
                key={aff}
                type="button"
                onClick={() => setAffTab(aff)}
                className={cn(
                  'rounded-lg border px-2 py-2 text-[11px] font-semibold transition',
                  affTab === aff ? 'bg-white text-zinc-900 border-white/0' : 'bg-white/5 text-white/80 border-white/12 hover:bg-white/10'
                )}
              >
                {AFFILIATION_LABEL[aff]}
              </button>
            ))}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          {visible.length === 0 && <div className="py-5 text-sm text-white/60">{syncing ? '불러오는 중…' : '직원이 없습니다.'}</div>}

          <div className="space-y-2">
            {rowsByStatusSections.map((section) => (
              <div key={section.key} className="rounded-lg border border-white/10 bg-black/10 p-1.5">
                <div className={cn('px-1 pb-1 text-[10px] font-semibold', section.tone)}>
                  {section.label} <span className="text-white/35">({section.rows.length})</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                  {section.rows.map((s) => {
                    const selected = selectedIds.includes(s.id)
                    const isOn = s.work_status != null && s.work_status !== 'OFF'
                    const pre = prefillMap[s.id]
                    return (
                      <button
                        key={s.id}
                        onClick={() => toggleSelectOrOpen(s.id)}
                        className={cn(
                          'rounded-lg border px-1.5 py-1.5 text-left transition',
                          'bg-black/15 hover:bg-white/10',
                          selected ? 'border-white/55 ring-1 ring-white/40' : 'border-white/12'
                        )}
                        type="button"
                        disabled={isPending}
                      >
                        <div className="truncate text-[11px] font-semibold text-white">{s.nickname}</div>
                        <div className={cn('mt-0.5 text-[10px] font-medium', isOn ? 'text-emerald-200/90' : 'text-rose-200/90')}>
                          {statusText(s.work_status)}
                        </div>
                        <div className="mt-0.5 truncate text-[10px] text-white/50">{pre?.storeName || '-'}</div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-1">
        {visible.length === 0 && <div className="py-5 text-sm text-white/60">{syncing ? '불러오는 중…' : '직원이 없습니다.'}</div>}

        <div ref={sentinelRef} className="h-8" />
      </div>
    </GlassCard>
  )
}

function getTimeHHMM() {
  const d = new Date()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function addMinutesToNowHHMM(addMin: number) {
  const d = new Date()
  d.setMinutes(d.getMinutes() + addMin)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}
