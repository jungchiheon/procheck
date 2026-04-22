'use client'

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { GlassCard } from '@/components/ui/GlassCard'
import { cn } from '@/lib/cn'
import { supabaseClient } from '@/lib/supabaseClient'
import type { StaffRow, StaffStatus, SortMode } from '../staff-admin.types'

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

  const rowsAll = useMemo(() => {
    const arr = [...visible]
    arr.sort((a, b) => (a.nickname || '').localeCompare(b.nickname || '', 'ko'))
    return arr
  }, [visible])

  const rowsByStatusSections = useMemo(() => {
    const sections: Array<{ key: string; label: string; rows: StaffRow[]; tone: string }> = [
      { key: 'CHOICE_ING', label: '초이스중', rows: [], tone: 'text-sky-200/90' },
      { key: 'CAR_WAIT', label: '차대기중', rows: [], tone: 'text-amber-200/90' },
      { key: 'CHOICE_DONE', label: '초이스완료', rows: [], tone: 'text-emerald-200/90' },
      { key: 'ON', label: '출근', rows: [], tone: 'text-white/65' },
    ]
    for (const r of rowsAll) {
      if (r.work_status === 'CHOICE_ING') sections[0].rows.push(r)
      else if (r.work_status === 'CAR_WAIT') sections[1].rows.push(r)
      else if (r.work_status === 'CHOICE_DONE') sections[2].rows.push(r)
      else if (r.work_status && r.work_status !== 'OFF') sections[3].rows.push(r)
    }
    return sections
  }, [rowsAll])

  const filteredStores = useMemo(() => {
    const rawQ = storeQuery.trim()
    const q = normalizeSearchText(rawQ)
    const active = stores.filter((s) => s.is_active)
    if (!q) return active
    const qChosung = toChosungKey(rawQ)
    return active
      .filter((s) => {
        const name = s.name || ''
        const nameText = normalizeSearchText(name)
        if (nameText.includes(q)) return true
        if (!qChosung) return false
        const nameChosung = toChosungKey(name)
        return nameChosung.includes(qChosung)
      })
      .sort((a, b) => {
        const aStarts = normalizeSearchText(a.name).startsWith(q) || (!!qChosung && toChosungKey(a.name).startsWith(qChosung)) ? 0 : 1
        const bStarts = normalizeSearchText(b.name).startsWith(q) || (!!qChosung && toChosungKey(b.name).startsWith(qChosung)) ? 0 : 1
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

      <div className="mt-3 overflow-visible rounded-lg border border-white/10 bg-black/15 p-2.5">
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
            {!storesLoading && storeDropdownOpen && (
              <div className={cn('absolute z-20 mt-2 w-full overflow-hidden rounded-xl', 'border border-white/12 bg-zinc-950/95 backdrop-blur-xl shadow-2xl')}>
                <div className="max-h-52 overflow-y-auto py-1">
                  {filteredStores.length === 0 ? (
                    <div className="px-3 py-2.5 text-[11px] text-white/45">검색 결과 없음</div>
                  ) : (
                    filteredStores.map((s) => (
                      <button
                        key={s.id}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => onPickStore(s)}
                        className="w-full text-left px-3 py-2.5 hover:bg-white/10 transition"
                        type="button"
                      >
                        <div className="text-[12px] font-semibold text-white">{s.name}</div>
                      </button>
                    ))
                  )}
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

      <div className="mt-3">
        <div className="min-w-0">
          {visible.length === 0 && <div className="py-5 text-sm text-white/60">{syncing ? '불러오는 중…' : '직원이 없습니다.'}</div>}

          <div className="space-y-2">
            {rowsByStatusSections.map((section) => (
              <div key={section.key} className="rounded-lg border border-white/10 bg-black/10 p-1.5">
                <div className={cn('px-1 pb-1 text-[10px] font-semibold', section.tone)}>
                  {section.label} <span className="text-white/35">({section.rows.length})</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {section.rows.map((s) => {
                    const selected = selectedIds.includes(s.id)
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

const CHOSUNG = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'] as const
const LEADING_JAMO = ['ᄀ', 'ᄁ', 'ᄂ', 'ᄃ', 'ᄄ', 'ᄅ', 'ᄆ', 'ᄇ', 'ᄈ', 'ᄉ', 'ᄊ', 'ᄋ', 'ᄌ', 'ᄍ', 'ᄎ', 'ᄏ', 'ᄐ', 'ᄑ', 'ᄒ'] as const

function normalizeChosungChar(ch: string) {
  const idx = (LEADING_JAMO as readonly string[]).indexOf(ch)
  if (idx >= 0) return (CHOSUNG as readonly string[])[idx] ?? ch
  return ch
}

function normalizeChosungQuery(q: string) {
  let out = ''
  for (const ch of q) out += normalizeChosungChar(ch)
  return out
}

function normalizeSearchText(v: string) {
  return v.replace(/\s+/g, '').toLowerCase()
}

function toChosungKey(q: string) {
  let out = ''
  for (const rawCh of q) {
    const normalized = normalizeChosungChar(rawCh)
    if ((CHOSUNG as readonly string[]).includes(normalized)) {
      out += normalized
      continue
    }
    const fromSyllable = getChosung(rawCh)
    if (fromSyllable) out += fromSyllable
  }
  return out
}

function isChosungString(q: string) {
  if (!q) return false
  for (const rawCh of q) {
    const ch = normalizeChosungChar(rawCh)
    if (!(CHOSUNG as readonly string[]).includes(ch)) return false
  }
  return true
}

function getChosungSeq(name: string) {
  return toChosungKey(name)
}

function getChosung(ch: string) {
  const code = ch.charCodeAt(0)
  if (code < 0xac00 || code > 0xd7a3) return null
  const index = Math.floor((code - 0xac00) / 588)
  return (CHOSUNG as readonly string[])[index] ?? null
}
