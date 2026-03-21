'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabaseClient'
import { GlassCard } from '@/components/ui/GlassCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { ProButton } from '@/components/ui/ProButton'
import { cn } from '@/lib/cn'
import { AdminNotificationBell } from '@/components/AdminNotificationBell'
import { RefreshCcw, CheckCircle2, X, ChevronLeft, ChevronRight } from 'lucide-react'

type StaffStatus = 'WORKING' | 'CAR_WAIT' | 'LODGE_WAIT' | 'OFF'
type StaffGroup = 'ON' | 'OFF'
type TabKey = 'staff' | 'misu' | 'settle'

const STAFF_STATUS_LABEL: Record<StaffStatus, string> = {
  WORKING: '출근중',
  CAR_WAIT: '차대기중',
  LODGE_WAIT: '숙소대기중',
  OFF: '퇴근',
}

const GROUP_LABEL: Record<StaffGroup, string> = {
  ON: '출근',
  OFF: '퇴근',
}

const GROUP_ORDER: StaffGroup[] = ['ON', 'OFF']
const groupRank = (g: StaffGroup) => GROUP_ORDER.indexOf(g)

type StaffRow = {
  id: string
  login_id: string
  nickname: string
  last_checkin_at: string | null
  last_checkout_at: string | null
  work_status: StaffStatus | null
}

type SortMode = 'visit' | 'status'

const VISIT_KEY = 'pc_admin_staff_last_visit_v1'
const STAFF_CACHE_KEY = 'pc_admin_staff_rows_v2'
const STAFF_CACHE_TTL_MS = 60 * 1000
const PREFETCH_TOP_N = 6
const PAGE_CHUNK = 40

const MISU_CACHE_KEY = 'pc_admin_misu_rows_v1'
const MISU_CACHE_TTL_MS = 30 * 1000

type MisuItem = {
  paymentId: number
  staffId: string
  staffNickname: string
  workLogId: number | null
  storeName: string
  baseIso: string
  ymd: string
  lineText: string
  misuAmount: number
  createdAt: string
  memoObj: any
  adminName: string | null
}

/* ------------------------- 전체 정산 ------------------------- */
type SettleLog = {
  id: number
  staffId: string
  staffName: string
  work_at: string
  ts: number
  timeText: string
  storeName: string
  minutes: number
  storeTotal: number
  staffPay: number
  adminPay: number
  tip: number
  misu: boolean
  misuAmount: number
  cash: boolean
  savedBy: string | null
  memoObj: any
}

const SETTLE_ALL_TTL = 10 * 1000

export default function AdminStaffPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [tab, setTab] = useState<TabKey>('staff')

  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  // staff
  const [rows, setRows] = useState<StaffRow[]>([])
  const [sortMode, setSortMode] = useState<SortMode>('visit')

  const [nowTick, setNowTick] = useState(Date.now())
  const [visitMap, setVisitMap] = useState<Record<string, number>>({})

  // 직원 추가 모달
  const [open, setOpen] = useState(false)
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [creating, setCreating] = useState(false)

  // 점진 렌더
  const [renderCount, setRenderCount] = useState(PAGE_CHUNK)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  // prefetch 중복 방지
  const lastPrefetchKeyRef = useRef<string>('')

  // misu
  const [misuLoading, setMisuLoading] = useState(false)
  const [misuError, setMisuError] = useState<string | null>(null)
  const [misuItems, setMisuItems] = useState<MisuItem[]>([])
  const [misuSyncTick, setMisuSyncTick] = useState(0)

  // settle (탭)
  const [settleDayYmd, setSettleDayYmd] = useState(getKstDateString())
  const [settleLoading, setSettleLoading] = useState(false)
  const [settleError, setSettleError] = useState<string | null>(null)
  const [settleRows, setSettleRows] = useState<SettleLog[]>([])

  // “몇 분 전” 갱신
  useEffect(() => {
    const t = window.setInterval(() => setNowTick(Date.now()), 60_000)
    return () => window.clearInterval(t)
  }, [])

  // 방문기록/캐시 선로딩
  useEffect(() => {
    try {
      const raw = localStorage.getItem(VISIT_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') setVisitMap(parsed)
      }
    } catch {}

    const cached = ssRead<{ ts: number; rows: StaffRow[] }>(STAFF_CACHE_KEY, STAFF_CACHE_TTL_MS)
    if (cached?.rows?.length) setRows(cached.rows)

    const cachedMisu = ssRead<{ ts: number; items: MisuItem[] }>(MISU_CACHE_KEY, MISU_CACHE_TTL_MS)
    if (cachedMisu?.items?.length) setMisuItems(cachedMisu.items)
  }, [])

  // 최초 staff 동기화
  useEffect(() => {
    let alive = true
    ;(async () => {
      setError(null)
      setSyncing(true)
      try {
        const { data: sess } = await supabaseClient.auth.getSession()
        const uid = sess.session?.user?.id
        if (!uid) throw new Error('로그인 만료')

        const profQ = supabaseClient.from('user_profiles').select('role, is_active').eq('id', uid).maybeSingle()

        const staffQ = supabaseClient
          .from('user_profiles')
          .select('id, login_id, nickname, last_checkin_at, last_checkout_at, work_status')
          .eq('role', 'staff')
          .eq('is_active', true)

        const [{ data: prof, error: profErr }, { data: staffRows, error: staffErr }] = await Promise.all([profQ, staffQ])
        if (!alive) return

        if (profErr) throw new Error(`관리자 프로필 조회 실패: ${profErr.message}`)
        if (!prof) throw new Error('user_profiles에 내 row 없음')
        if (!prof.is_active) throw new Error('비활성 계정')
        if (prof.role !== 'admin') throw new Error('관리자만 접근 가능')
        if (staffErr) throw new Error(`staff 목록 조회 실패: ${staffErr.message}`)

        const list = normalizeStaffRows(staffRows)
        setRows(list)
        ssWrite(STAFF_CACHE_KEY, { ts: Date.now(), rows: list })
        setRenderCount(PAGE_CHUNK)
      } catch (e: any) {
        if (!alive) return
        setError(e?.message ?? '오류')
      } finally {
        if (!alive) return
        setSyncing(false)
      }
    })()

    return () => {
      alive = false
    }
  }, [])

  const isWorkingLegacy = (r: StaffRow) => {
    if (!r.last_checkin_at) return false
    if (!r.last_checkout_at) return true
    return new Date(r.last_checkin_at) > new Date(r.last_checkout_at)
  }

  const statusOf = (r: StaffRow): StaffStatus => {
    const s = r.work_status as StaffStatus | null
    if (s) return s
    return isWorkingLegacy(r) ? 'WORKING' : 'OFF'
  }

  const groupOfStatus = (st: StaffStatus): StaffGroup => (st === 'OFF' ? 'OFF' : 'ON')
  const groupOfRow = (r: StaffRow): StaffGroup => groupOfStatus(statusOf(r))

  const lastActivityMs = (r: StaffRow) => {
    const working = isWorkingLegacy(r)
    const baseIso = working ? r.last_checkin_at : r.last_checkout_at ?? r.last_checkin_at
    const t = baseIso ? new Date(baseIso).getTime() : 0
    return Number.isFinite(t) ? t : 0
  }

  const sinceText = (r: StaffRow) => {
    const working = isWorkingLegacy(r)
    const baseIso = working ? r.last_checkin_at : r.last_checkout_at ?? r.last_checkin_at
    if (!baseIso) return ''
    return formatSince(baseIso, nowTick)
  }

  const ordered = useMemo(() => {
    const list = [...rows]
    list.sort((a, b) => {
      const ag = groupOfRow(a)
      const bg = groupOfRow(b)
      const ar = groupRank(ag)
      const br = groupRank(bg)
      if (ar !== br) return ar - br

      if (sortMode === 'visit') {
        const av = Number(visitMap[a.id] ?? 0)
        const bv = Number(visitMap[b.id] ?? 0)
        if (av !== bv) return bv - av
      } else {
        const at = lastActivityMs(a)
        const bt = lastActivityMs(b)
        if (at !== bt) return bt - at
      }

      return (a.nickname || '').localeCompare(b.nickname || '', 'ko')
    })
    return list
  }, [rows, visitMap, sortMode])

  useEffect(() => {
    if (tab !== 'staff') return
    const el = sentinelRef.current
    if (!el) return

    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting)
        if (hit) setRenderCount((c) => Math.min(ordered.length, c + PAGE_CHUNK))
      },
      { root: null, threshold: 0.1 }
    )

    io.observe(el)
    return () => io.disconnect()
  }, [ordered.length, tab])

  useEffect(() => {
    if (tab !== 'staff') return
    const top = ordered.slice(0, PREFETCH_TOP_N)
    const key = top.map((x) => x.id).join(',')
    if (!key || key === lastPrefetchKeyRef.current) return
    lastPrefetchKeyRef.current = key
    const run = () => top.forEach((s) => router.prefetch(`/admin/staff/${s.id}`))
    idle(run)
  }, [router, ordered, tab])

  const markVisitedIdle = (staffId: string) => {
    const next = { ...visitMap, [staffId]: Date.now() }
    idle(() => {
      setVisitMap(next)
      try {
        localStorage.setItem(VISIT_KEY, JSON.stringify(next))
      } catch {}
    })
  }

  const onCreate = async () => {
    setError(null)
    setCreating(true)
    try {
      const id = loginId.trim()
      const pw = password
      const nn = nickname.trim()

      if (!id) throw new Error('ID를 입력하세요.')
      if (!pw) throw new Error('비밀번호를 입력하세요.')
      if (!nn) throw new Error('닉네임을 입력하세요.')

      const { data: session } = await supabaseClient.auth.getSession()
      const token = session.session?.access_token
      if (!token) throw new Error('로그인 만료')

      const res = await fetch('/api/admin/create-staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ loginId: id, password: pw, nickname: nn }),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || '직원 생성 실패')

      setOpen(false)
      setLoginId('')
      setPassword('')
      setNickname('')

      setSyncing(true)
      const { data, error } = await supabaseClient
        .from('user_profiles')
        .select('id, login_id, nickname, last_checkin_at, last_checkout_at, work_status')
        .eq('role', 'staff')
        .eq('is_active', true)
      if (error) throw new Error(`staff 목록 조회 실패: ${error.message}`)

      const list = normalizeStaffRows(data)
      setRows(list)
      ssWrite(STAFF_CACHE_KEY, { ts: Date.now(), rows: list })
      setRenderCount(PAGE_CHUNK)
    } catch (e: any) {
      setError(e?.message ?? '오류')
    } finally {
      setCreating(false)
      setSyncing(false)
    }
  }

  const onLogout = async () => {
    await supabaseClient.auth.signOut()
    router.replace('/login')
  }

  const visible = ordered.slice(0, renderCount)

  const grouped = useMemo(() => {
    const map = new Map<StaffGroup, StaffRow[]>()
    for (const g of GROUP_ORDER) map.set(g, [])
    for (const r of visible) map.get(groupOfRow(r))!.push(r)
    return map
  }, [visible])

  const badgeClassByStatus = (st: StaffStatus) => {
    if (st === 'WORKING' || st === 'CAR_WAIT') return 'border-emerald-300/30 bg-emerald-500/10 text-emerald-100'
    if (st === 'LODGE_WAIT') return 'border-amber-300/30 bg-amber-500/10 text-amber-100'
    return 'border-red-400/30 bg-red-500/10 text-red-100'
  }

  const sectionTitleClass = (g: StaffGroup) => (g === 'ON' ? 'text-emerald-100' : 'text-red-100')

  /* ------------------------- 미수 관리 ------------------------- */
  const loadMisu = async (opts?: { force?: boolean }) => {
    const force = Boolean(opts?.force)

    if (!force) {
      const cached = ssRead<{ ts: number; items: MisuItem[] }>(MISU_CACHE_KEY, MISU_CACHE_TTL_MS)
      if (cached?.items) {
        setMisuItems(cached.items)
        return
      }
    }

    setMisuError(null)
    setMisuLoading(true)

    try {
      const { data: payRows, error: payErr } = await supabaseClient
        .from('staff_payment_logs')
        .select('id, staff_id, work_log_id, memo, created_at')
        .not('memo', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1000)

      if (payErr) throw new Error(`미수 조회 실패(payment_logs): ${payErr.message}`)

      const raw = Array.isArray(payRows) ? payRows : []

      const filtered = raw
        .map((r: any) => {
          const memoObj = parseMemoAny(r?.memo ?? null)
          if (!memoObj) return null

          const misuAmount = Math.max(0, Number(memoObj?.misuAmount ?? 0))
          const done = Boolean(memoObj?.misuDone ?? memoObj?.misu_done ?? memoObj?.misuCleared ?? memoObj?.misu_cleared)
          if (done) return null
          if (misuAmount <= 0) return null

          const createdAt = String(r?.created_at ?? '')
          if (!createdAt) return null

          const baseIso = pickMisuBaseIso(memoObj, createdAt)

          return {
            paymentId: Number(r?.id),
            staffId: String(r?.staff_id ?? ''),
            workLogId: r?.work_log_id == null ? null : Number(r.work_log_id),
            createdAt,
            baseIso,
            memoObj,
            misuAmount,
            adminName: pickSavedByName(memoObj),
          }
        })
        .filter(
          (x): x is {
            paymentId: number
            staffId: string
            workLogId: number | null
            createdAt: string
            baseIso: string
            memoObj: any
            misuAmount: number
            adminName: string | null
          } => Boolean(x)
        )

      if (filtered.length === 0) {
        setMisuItems([])
        ssWrite(MISU_CACHE_KEY, { ts: Date.now(), items: [] })
        return
      }

      const staffIds = Array.from(new Set(filtered.map((x) => x.staffId).filter(Boolean)))
      const workLogIds = Array.from(new Set(filtered.map((x) => x.workLogId).filter((x): x is number => typeof x === 'number')))

      const staffMap = new Map<string, { nickname: string }>()
      if (staffIds.length > 0) {
        const { data: profRows, error: profErr } = await supabaseClient.from('user_profiles').select('id, nickname').in('id', staffIds)
        if (profErr) throw new Error(`미수 조회 실패(user_profiles): ${profErr.message}`)
        for (const r of Array.isArray(profRows) ? profRows : []) {
          const id = String((r as any)?.id ?? '')
          if (!id) continue
          staffMap.set(id, { nickname: String((r as any)?.nickname ?? '직원') })
        }
      }

      const workMap = new Map<number, { storeName: string }>()
      if (workLogIds.length > 0) {
        const { data: wRows, error: wErr } = await supabaseClient.from('staff_work_logs').select('id, stores(name)').in('id', workLogIds)
        if (wErr) throw new Error(`미수 조회 실패(staff_work_logs): ${wErr.message}`)

        for (const r of Array.isArray(wRows) ? wRows : []) {
          const id = Number((r as any)?.id ?? 0)
          if (!id) continue
          const storeName =
            (r as any)?.stores?.name != null
              ? String((r as any).stores.name)
              : (r as any)?.stores?.[0]?.name
                ? String((r as any).stores[0].name)
                : '가게 미지정'
          workMap.set(id, { storeName })
        }
      }

      const items: MisuItem[] = filtered.map((x) => {
        const staff = staffMap.get(x.staffId) ?? { nickname: '직원' }
        const w = x.workLogId != null ? workMap.get(x.workLogId) : null
        const storeName = w?.storeName ?? '가게 미지정'

        const ymd = toKstDateStringAt7(x.baseIso)
        const lineText = buildMisuOnlyText({ memoObj: x.memoObj, misuAmount: x.misuAmount })

        return {
          paymentId: x.paymentId,
          staffId: x.staffId,
          staffNickname: staff.nickname || '직원',
          workLogId: x.workLogId,
          storeName,
          baseIso: x.baseIso,
          ymd,
          lineText,
          misuAmount: x.misuAmount,
          createdAt: x.createdAt,
          memoObj: x.memoObj,
          adminName: x.adminName ?? null,
        }
      })

      items.sort((a, b) => {
        if (a.ymd !== b.ymd) return a.ymd < b.ymd ? 1 : -1
        const at = a.baseIso ? new Date(a.baseIso).getTime() : 0
        const bt = b.baseIso ? new Date(b.baseIso).getTime() : 0
        if (at !== bt) return bt - at
        return (a.staffNickname || '').localeCompare(b.staffNickname || '', 'ko')
      })

      setMisuItems(items)
      ssWrite(MISU_CACHE_KEY, { ts: Date.now(), items })
    } catch (e: any) {
      setMisuError(e?.message ?? '미수 조회 오류')
    } finally {
      setMisuLoading(false)
      setMisuSyncTick((t) => t + 1)
    }
  }

  useEffect(() => {
    if (tab !== 'misu') return
    loadMisu({ force: true }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const misuByDay = useMemo(() => {
    void misuSyncTick
    const map = new Map<string, MisuItem[]>()
    for (const it of misuItems) {
      const arr = map.get(it.ymd) ?? []
      arr.push(it)
      map.set(it.ymd, arr)
    }
    return Array.from(map.entries())
      .map(([ymd, items]) => {
        const sum = items.reduce((s, x) => s + (x.misuAmount || 0), 0)
        return { ymd, items, sum, count: items.length }
      })
      .sort((a, b) => (a.ymd < b.ymd ? 1 : -1))
  }, [misuItems, misuSyncTick])

  const misuTotal = useMemo(() => {
    const sum = misuItems.reduce((s, x) => s + (x.misuAmount || 0), 0)
    return { sum, count: misuItems.length }
  }, [misuItems])

  const markMisuDone = async (it: MisuItem) => {
    const ok = window.confirm(`미수 정산 완료 처리할까요?\n\n${it.staffNickname} · ${it.storeName}\n${formatCurrency(it.misuAmount)}원`)
    if (!ok) return

    setMisuError(null)
    try {
      const prevObj = parseMemoAny(JSON.stringify(it.memoObj)) ?? {}
      const nextObj = {
        ...prevObj,
        misuDone: true,
        misuDoneAt: new Date().toISOString(),
      }

      const { error: uErr } = await supabaseClient.from('staff_payment_logs').update({ memo: JSON.stringify(nextObj) }).eq('id', it.paymentId)
      if (uErr) throw new Error(`정산 완료 처리 실패: ${uErr.message}`)

      setMisuItems((prev) => {
        const next = prev.filter((x) => x.paymentId !== it.paymentId)
        ssWrite(MISU_CACHE_KEY, { ts: Date.now(), items: next })
        return next
      })
      setMisuSyncTick((t) => t + 1)
    } catch (e: any) {
      setMisuError(e?.message ?? '정산 완료 처리 오류')
    }
  }

  /* ------------------------- 전체 정산(탭) ------------------------- */
  const fetchSettlementDay = async (dayYmd: string, opts?: { force?: boolean }) => {
    const force = Boolean(opts?.force)
    const cacheKey = `pc_admin_settle_day_${dayYmd}_v3`

    if (!force) {
      const cached = ssRead<{ ts: number; rows: SettleLog[] }>(cacheKey, SETTLE_ALL_TTL)?.rows ?? null
      if (cached) {
        setSettleRows(cached)
        return
      }
    }

    const { startIso, endIso } = getKstDayRangeIso7(dayYmd)

    const pageSize = 1000
    let from = 0
    const all: any[] = []

    while (true) {
      const { data, error } = await supabaseClient
        .from('staff_work_logs')
        .select('id, staff_id, work_at, minutes, stores(name), staff_payment_logs(amount, memo, method, paid_at)')
        .gte('work_at', startIso)
        .lt('work_at', endIso)
        .order('work_at', { ascending: true })
        .range(from, from + pageSize - 1)

      if (error) throw new Error(`정산 내역 로드 실패: ${error.message}`)
      const chunk = Array.isArray(data) ? data : []
      all.push(...chunk)
      if (chunk.length < pageSize) break
      from += pageSize
    }

    const staffIds = Array.from(new Set(all.map((r) => String(r?.staff_id ?? '')).filter(Boolean)))
    const staffMap = new Map<string, string>()
    if (staffIds.length) {
      const { data: profs, error: pErr } = await supabaseClient.from('user_profiles').select('id, nickname').in('id', staffIds)
      if (pErr) throw new Error(`직원 프로필 로드 실패: ${pErr.message}`)
      for (const r of Array.isArray(profs) ? profs : []) {
        const id = String((r as any)?.id ?? '')
        if (!id) continue
        staffMap.set(id, String((r as any)?.nickname ?? '직원'))
      }
    }

    const rows: SettleLog[] = all
      .map((r: any) => deriveSettleLog(r, staffMap))
      .filter((x): x is SettleLog => Boolean(x))

    setSettleRows(rows)
    ssWrite(cacheKey, { ts: Date.now(), rows })
  }

  const runSettlementFetchDay = async (dayYmd: string, opts?: { force?: boolean }) => {
    setSettleError(null)
    setSettleLoading(true)
    try {
      await fetchSettlementDay(dayYmd, { force: Boolean(opts?.force) })
    } catch (e: any) {
      setSettleError(e?.message ?? '정산 조회 오류')
    } finally {
      setSettleLoading(false)
    }
  }

  useEffect(() => {
    if (tab !== 'settle') return
    runSettlementFetchDay(settleDayYmd, { force: true }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, settleDayYmd])

  const settleStaffBlocks = useMemo(() => {
    if (tab !== 'settle') return []

    const map = new Map<
      string,
      {
        staffId: string
        staffName: string
        staffUnit: number
        adminSum: number
        items: SettleLog[]
        firstTs: number
      }
    >()

    for (const row of settleRows) {
      const key = row.staffId
      const prev = map.get(key)
      const staffUnit = Math.round((row.staffPay || 0) / 1000)

      if (!prev) {
        map.set(key, {
          staffId: row.staffId,
          staffName: row.staffName,
          staffUnit,
          adminSum: Math.max(0, Number(row.adminPay || 0)),
          items: [row],
          firstTs: row.ts,
        })
      } else {
        prev.staffUnit += staffUnit
        prev.adminSum += Math.max(0, Number(row.adminPay || 0))
        prev.items.push(row)
        prev.firstTs = Math.min(prev.firstTs, row.ts)
      }
    }

    return Array.from(map.values())
      .map((block) => {
        block.items.sort((a, b) => a.ts - b.ts)
        return block
      })
      .sort((a, b) => {
        if (a.firstTs !== b.firstTs) return a.firstTs - b.firstTs
        return a.staffName.localeCompare(b.staffName, 'ko')
      })
  }, [tab, settleRows])

  return (
    <div className="space-y-6">
      <PageHeader
        title=""
        backHref="/admin"
        right={
          <div className="flex items-center gap-2">
            <AdminNotificationBell />
            <ProButton variant="ghost" onClick={onLogout}>
              로그아웃
            </ProButton>
          </div>
        }
      />

      {/* 탭 */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setTab('staff')}
          className={cn(
            'rounded-xl border px-4 py-2 text-sm font-semibold transition',
            tab === 'staff' ? 'border-white/12 bg-white/10 text-white' : 'border-white/12 bg-white/5 text-white/70 hover:bg-white/10'
          )}
        >
          직원 관리
        </button>

        <button
          type="button"
          onClick={() => setTab('misu')}
          className={cn(
            'rounded-xl border px-4 py-2 text-sm font-semibold transition',
            tab === 'misu' ? 'border-white/12 bg-white/10 text-white' : 'border-white/12 bg-white/5 text-white/70 hover:bg-white/10'
          )}
        >
          미수 관리
        </button>

        <button
          type="button"
          onClick={() => setTab('settle')}
          className={cn(
            'rounded-xl border px-4 py-2 text-sm font-semibold transition',
            tab === 'settle' ? 'border-white/12 bg-white/10 text-white' : 'border-white/12 bg-white/5 text-white/70 hover:bg-white/10'
          )}
        >
          정산
        </button>

        <div className="flex-1" />
        <div className="text-xs text-white/40">{syncing ? '동기화 중…' : '\u00A0'}</div>
      </div>

      {error && tab === 'staff' && (
        <GlassCard className="p-5">
          <div className="text-sm text-red-200">{error}</div>
        </GlassCard>
      )}

      {/* ------------------------- 직원 관리 탭 ------------------------- */}
      {tab === 'staff' && (
        <>
          <GlassCard className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-white font-semibold tracking-tight">직원 목록</div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSortMode('visit')}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-sm border transition',
                    sortMode === 'visit' ? 'bg-white text-zinc-900 border-white/0' : 'bg-white/5 text-white/80 border-white/12 hover:bg-white/10'
                  )}
                  type="button"
                >
                  변경순
                </button>
                <button
                  onClick={() => setSortMode('status')}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-sm border transition',
                    sortMode === 'status' ? 'bg-white text-zinc-900 border-white/0' : 'bg-white/5 text-white/80 border-white/12 hover:bg-white/10'
                  )}
                  type="button"
                >
                  상태순
                </button>

                <ProButton onClick={() => setOpen(true)} type="button" className={cn('!rounded-lg !px-3 !py-1.5 !text-sm !font-semibold !border')}>
                  직원 추가
                </ProButton>
              </div>
            </div>

            <div className="mt-3">
              {visible.length === 0 && <div className="py-5 text-sm text-white/60">{syncing ? '불러오는 중…' : '직원이 없습니다.'}</div>}

              {GROUP_ORDER.map((g) => {
                const arr = grouped.get(g) ?? []
                if (arr.length === 0) return null

                return (
                  <div key={g} className="mt-4 first:mt-0">
                    <div className="flex items-center justify-between">
                      <div className={cn('text-sm font-semibold', sectionTitleClass(g))}>{GROUP_LABEL[g]}</div>
                      <div className="text-xs text-white/40">{arr.length}명</div>
                    </div>

                    <div className="mt-2 divide-y divide-white/10 rounded-2xl border border-white/10 bg-black/10">
                      {arr.map((s) => {
                        const since = sinceText(s)
                        const st = statusOf(s)

                        return (
                          <button
                            key={s.id}
                            onClick={() => {
                              startTransition(() => router.push(`/admin/staff/${s.id}`))
                              markVisitedIdle(s.id)
                            }}
                            className={cn('w-full text-left rounded-xl transition', 'px-3 py-3 hover:bg-white/5')}
                            type="button"
                            disabled={isPending}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-white text-sm font-semibold truncate">{s.nickname}</div>
                                <div className="mt-0.5 text-[11px] text-white/35 truncate">{s.login_id}</div>
                              </div>

                              <div className="shrink-0 flex items-center gap-2">
                                {since && <div className="text-[11px] text-white/45 whitespace-nowrap">{since}</div>}
                                <div className={cn('rounded-full border whitespace-nowrap', 'px-2.5 py-1 text-[11px]', badgeClassByStatus(st))}>
                                  {STAFF_STATUS_LABEL[st]}
                                </div>
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}

              <div ref={sentinelRef} className="h-8" />
            </div>
          </GlassCard>

          {open && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
              <button className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} type="button" aria-label="닫기" />
              <div className="relative w-full max-w-md">
                <GlassCard className="p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-white text-lg font-semibold">직원 추가</div>
                    </div>
                    <button
                      onClick={() => setOpen(false)}
                      className="rounded-xl border border-white/12 bg-white/5 p-2 text-white/80 hover:bg-white/10 transition"
                      type="button"
                      aria-label="닫기"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-5 space-y-4">
                    <div>
                      <label className="text-sm font-medium text-white/80">로그인ID</label>
                      <input
                        className="mt-2 w-full rounded-xl border border-white/12 bg-black/20 px-3 py-2.5 text-white outline-none placeholder:text-white/30 focus:border-white/25"
                        value={loginId}
                        onChange={(e) => setLoginId(e.target.value)}
                        placeholder="staff03"
                        autoComplete="off"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-white/80">비밀번호</label>
                      <input
                        type="password"
                        className="mt-2 w-full rounded-xl border border-white/12 bg-black/20 px-3 py-2.5 text-white outline-none placeholder:text-white/30 focus:border-white/25"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="new-password"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-white/80">닉네임</label>
                      <input
                        className="mt-2 w-full rounded-xl border border-white/12 bg-black/20 px-3 py-2.5 text-white outline-none placeholder:text-white/30 focus:border-white/25"
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        placeholder="직원3"
                        autoComplete="off"
                      />
                    </div>

                    <div className="pt-2 flex gap-2">
                      <ProButton variant="ghost" className="flex-1" onClick={() => setOpen(false)} type="button">
                        취소
                      </ProButton>
                      <ProButton className="flex-1" onClick={onCreate} disabled={creating} type="button">
                        {creating ? '생성 중...' : '생성'}
                      </ProButton>
                    </div>
                  </div>
                </GlassCard>
              </div>
            </div>
          )}
        </>
      )}

      {/* ------------------------- 미수 관리 탭 ------------------------- */}
      {tab === 'misu' && (
        <GlassCard className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-white font-semibold tracking-tight">미수 내역</div>

            <div className="flex items-center gap-3">
              <div className="text-xs text-white/60">
                총 {misuTotal.count}건 · {formatCurrency(misuTotal.sum)}원
              </div>

              <button
                type="button"
                onClick={() => loadMisu({ force: true })}
                className={cn(
                  'inline-flex items-center gap-2',
                  'h-9 px-3 rounded-xl border border-white/12 bg-white/5',
                  'text-sm font-semibold text-white/85 hover:bg-white/10 transition',
                  misuLoading && 'opacity-70 cursor-not-allowed'
                )}
                disabled={misuLoading}
              >
                <RefreshCcw className={cn('h-4 w-4', misuLoading && 'animate-spin')} />
                새로고침
              </button>
            </div>
          </div>

          {misuError && (
            <div className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">{misuError}</div>
          )}

          <div className="mt-4">
            {misuLoading && <div className="py-6 text-sm text-white/60">불러오는 중...</div>}
            {!misuLoading && misuByDay.length === 0 && <div className="py-6 text-sm text-white/60">미수 내역이 없습니다.</div>}

            {!misuLoading &&
              misuByDay.map((day) => (
                <div key={day.ymd} className="mb-4">
                  <div className="flex items-end justify-between gap-3">
                    <div className="text-white font-semibold">{day.ymd}</div>
                    <div className="text-xs text-white/60">
                      {day.count}건 · {formatCurrency(day.sum)}원
                    </div>
                  </div>

                  <div className="mt-2 divide-y divide-white/10 rounded-2xl border border-white/10 bg-black/10">
                    {day.items.map((it) => (
                      <div key={it.paymentId} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm text-white font-semibold truncate">
                              {it.staffNickname} / {it.storeName} / {isoToHm(it.baseIso || it.createdAt)}
                            </div>
                            <div className="mt-0.5 text-[11px] text-white/45 truncate">{it.adminName ? `저장: ${it.adminName}` : '-'}</div>
                            <div className="mt-1 text-xs text-white/70 truncate">{it.lineText}</div>
                          </div>

                          <div className="shrink-0 text-right">
                            <div className="text-sm text-white/85 font-semibold">{formatCurrency(it.misuAmount)}원</div>
                            <button
                              type="button"
                              onClick={() => markMisuDone(it)}
                              className={cn(
                                'mt-2 inline-flex items-center gap-1.5',
                                'rounded-xl border border-emerald-300/30 bg-emerald-500/10',
                                'px-3 py-1.5 text-[12px] font-semibold text-emerald-100 hover:bg-emerald-500/15 transition'
                              )}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              정산 완료
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </GlassCard>
      )}

      {/* ------------------------- 정산 탭 ------------------------- */}
      {tab === 'settle' && (
        <GlassCard className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-white font-semibold tracking-tight">정산 (전체 직원)</div>

            <button
              type="button"
              onClick={() => runSettlementFetchDay(settleDayYmd, { force: true })}
              className={cn(
                'inline-flex items-center gap-2',
                'h-9 px-3 rounded-xl border border-white/12 bg-white/5',
                'text-sm font-semibold text-white/85 hover:bg-white/10 transition',
                settleLoading && 'opacity-70 cursor-not-allowed'
              )}
              disabled={settleLoading}
            >
              <RefreshCcw className={cn('h-4 w-4', settleLoading && 'animate-spin')} />
              새로고침
            </button>
          </div>

          <div className="mt-2 text-sm text-white/55">기준 : 07:00 ~ 다음날 07:00</div>

          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setSettleDayYmd((prev) => addDaysYmd(prev, -1))}
              className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-white/12 bg-white/5 text-white/80 hover:bg-white/10 transition"
              aria-label="전날"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="min-w-[140px] text-center text-white font-semibold">{settleDayYmd}</div>

            <button
              type="button"
              onClick={() => setSettleDayYmd((prev) => addDaysYmd(prev, 1))}
              className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-white/12 bg-white/5 text-white/80 hover:bg-white/10 transition"
              aria-label="다음날"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {settleError && (
            <div className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">{settleError}</div>
          )}

          <div className="mt-5">
            {settleLoading && <div className="py-6 text-sm text-white/60">정산 내역 불러오는 중...</div>}
            {!settleLoading && settleStaffBlocks.length === 0 && <div className="py-6 text-sm text-white/60">해당 날짜에 정산 내역이 없습니다.</div>}

            {!settleLoading &&
              settleStaffBlocks.map((block) => (
                <div key={block.staffId} className="mb-4 rounded-2xl border border-white/10 bg-black/10">
                  <div className="px-4 py-3 border-b border-white/10">
                    <div className="text-white font-semibold">
                      {block.staffName} {block.staffUnit}
                    </div>
                  </div>

                  <div className="divide-y divide-white/10">
                    {block.items.map((row) => (
                      <div key={row.id} className="px-4 py-3">
                        <div className="text-sm text-white/85 truncate">
                          {row.storeName}
                          {isoToKoTimeText(row.work_at)}
                          {' '}
                          {buildSettleCompactText(row.memoObj, row.minutes, row.misuAmount)}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="px-4 py-3 border-t border-white/10 text-sm font-semibold text-white/80">
                    {formatCurrency(block.adminSum)}
                  </div>
                </div>
              ))}
          </div>
        </GlassCard>
      )}
    </div>
  )
}

/* ------------------------- utils ------------------------- */
function normalizeStaffRows(data: unknown): StaffRow[] {
  const arr = Array.isArray(data) ? data : []
  return arr
    .map((r: any) => {
      const row: StaffRow = {
        id: String(r?.id ?? ''),
        login_id: String(r?.login_id ?? ''),
        nickname: String(r?.nickname ?? ''),
        last_checkin_at: r?.last_checkin_at ?? null,
        last_checkout_at: r?.last_checkout_at ?? null,
        work_status: (r?.work_status ?? null) as any,
      }
      if (!row.id) return null
      return row
    })
    .filter((x): x is StaffRow => Boolean(x))
}

function formatSince(iso: string, nowMs: number) {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return ''
  const diffSec = Math.max(0, Math.floor((nowMs - t) / 1000))
  if (diffSec < 30) return '방금'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}분 전`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}시간 전`
  const diffDay = Math.floor(diffHour / 24)
  return `${diffDay}일 전`
}

function ssRead<T>(key: string, ttlMs: number): T | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const ts = Number((parsed as any)?.ts ?? 0)
    if (!ts || Date.now() - ts > ttlMs) return null
    return parsed as T
  } catch {
    return null
  }
}

function ssWrite(key: string, value: any) {
  idle(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(value))
    } catch {}
  })
}

function idle(fn: () => void) {
  if (typeof (window as any).requestIdleCallback === 'function') {
    ;(window as any).requestIdleCallback(fn, { timeout: 800 })
  } else {
    window.setTimeout(fn, 0)
  }
}

function parseMemoAny(memo: string | null) {
  if (!memo) return null
  try {
    const obj = JSON.parse(memo)
    if (!obj || typeof obj !== 'object') return null
    return obj
  } catch {
    return null
  }
}

function pickSavedByName(memoObj: any): string | null {
  if (!memoObj || typeof memoObj !== 'object') return null
  const cand =
    memoObj?.savedBy?.nickname ||
    memoObj?.savedBy?.name ||
    memoObj?.saved_by?.nickname ||
    memoObj?.adminNickname ||
    memoObj?.admin_name ||
    memoObj?.admin?.nickname ||
    memoObj?.admin?.name
  return typeof cand === 'string' && cand.trim() ? cand.trim() : null
}

function isoToHm(iso: string) {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function isoToKoTimeText(iso: string) {
  const d = new Date(iso)
  const h = d.getHours()
  const m = d.getMinutes()
  return `${String(h).padStart(2, '0')}시${String(m).padStart(2, '0')}분`
}

function toKstDateStringAt7(iso: string) {
  const d = new Date(iso)
  const hh = d.getHours()
  const base = new Date(d)
  if (hh < 7) base.setDate(base.getDate() - 1)
  const y = base.getFullYear()
  const m = String(base.getMonth() + 1).padStart(2, '0')
  const day = String(base.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function repeatChar(ch: string, n: number) {
  const k = Math.max(0, Number(n || 0))
  if (k <= 0) return ''
  return new Array(k).fill(ch).join('')
}

/* ------------------ 표시용 service compact helpers ------------------ */
const J_KEY_MINUTES: Record<string, number> = {
  J_HALF: 30,
  J_ONE: 60,
  J_ONE_HALF: 90,
  J_TWO: 120,
}

const R_KEY_MINUTES: Record<string, number> = {
  RT_HALF: 30,
  RT_ONE: 60,
}

function formatHalfUnitText(minutes: number, prefix: '' | '룸') {
  const half = Math.round(Math.max(0, Number(minutes || 0)) / 30)
  if (half <= 0) return ''

  const full = Math.floor(half / 2)
  const hasHalf = half % 2 === 1

  if (full === 0 && hasHalf) return prefix ? `${prefix}반개` : '반개'
  if (!hasHalf) return prefix ? `${prefix}${full}개` : `${full}개`
  return prefix ? `${prefix}${full}개반` : `${full}개반`
}

function extractCompactPartsFromMemo(memoObj: any, fallbackMinutes = 0, fallbackMisuAmount = 0) {
  let jMinutes = 0
  let rMinutes = 0
  let atCount = 0
  let heartCount = 0
  let tip = 0
  let misuAmount = Math.max(0, Number(fallbackMisuAmount || 0))

  if (memoObj && typeof memoObj === 'object') {
    tip = Math.max(0, Number(memoObj?.tip ?? 0))
    misuAmount = Math.max(0, Number(memoObj?.misuAmount ?? misuAmount ?? 0))

    if (memoObj.v === 4 && Array.isArray(memoObj.steps)) {
      for (const s of memoObj.steps as any[]) {
        const key = String(s?.key ?? '')
        if (s?.kind === 'R' || key.startsWith('RT_')) rMinutes += Math.max(0, Number(R_KEY_MINUTES[key] ?? 0))
        else jMinutes += Math.max(0, Number(J_KEY_MINUTES[key] ?? 0))

        atCount += Math.max(0, Number(s?.at ?? 0))
        heartCount += Math.max(0, Number(s?.heart ?? 0))
      }
      return { jMinutes, rMinutes, atCount, heartCount, tip, misuAmount }
    }

    if (memoObj.v === 3) {
      const jCounts = memoObj?.jCounts ?? {}
      const rCounts = memoObj?.rCounts ?? {}

      for (const k of Object.keys(J_KEY_MINUTES)) {
        const c = Math.max(0, Number(jCounts?.[k] ?? 0))
        jMinutes += c * J_KEY_MINUTES[k]
      }
      for (const k of Object.keys(R_KEY_MINUTES)) {
        const c = Math.max(0, Number(rCounts?.[k] ?? 0))
        rMinutes += c * R_KEY_MINUTES[k]
      }

      heartCount = Math.max(0, Number(memoObj?.heartCount ?? 0))
      atCount = Math.max(0, Number(memoObj?.atCount ?? 0))
      return { jMinutes, rMinutes, atCount, heartCount, tip, misuAmount }
    }

    if (memoObj.v === 2) {
      const baseMinutes = Math.max(0, Number(memoObj?.baseMinutes ?? fallbackMinutes ?? 0))
      const isRoom = Boolean(memoObj?.rSvc)
      if (isRoom) rMinutes += baseMinutes
      else jMinutes += baseMinutes

      heartCount = memoObj?.heart ? 1 : 0
      atCount = memoObj?.at ? 1 : 0
      return { jMinutes, rMinutes, atCount, heartCount, tip, misuAmount }
    }

    if (memoObj.v === 1) {
      const baseMinutes = inferLegacyMinutes(memoObj?.baseLabel, fallbackMinutes)
      jMinutes += baseMinutes
      heartCount = memoObj?.heart ? 1 : 0
      atCount = memoObj?.at ? 1 : 0
      return { jMinutes, rMinutes, atCount, heartCount, tip, misuAmount }
    }
  }

  jMinutes += Math.max(0, Number(fallbackMinutes || 0))
  return { jMinutes, rMinutes, atCount, heartCount, tip, misuAmount }
}

function inferLegacyMinutes(baseLabel: any, fallbackMinutes: number) {
  const s = String(baseLabel ?? '')
  if (s.includes('2개')) return 120
  if (s.includes('1개반')) return 90
  if (s.includes('1개')) return 60
  if (s.includes('반개')) return 30
  return Math.max(0, Number(fallbackMinutes || 0))
}

function buildSettleCompactText(memoObj: any, fallbackMinutes: number, fallbackMisuAmount: number) {
  const { jMinutes, rMinutes, atCount, heartCount, tip, misuAmount } = extractCompactPartsFromMemo(memoObj, fallbackMinutes, fallbackMisuAmount)

  const jText = formatHalfUnitText(jMinutes, '')
  const rText = formatHalfUnitText(rMinutes, '룸')
  const svcText = `${jText}${rText}`.trim() || '0개'
  const addonText = `${repeatChar('@', atCount)}${repeatChar('♡', heartCount)}`
  const misuMark = misuAmount > 0 ? '◼︎' : ''
  const tipUnit = tip > 0 ? Math.round(tip / 1000) : 0
  const tipText = tipUnit > 0 ? `(${tipUnit})` : ''

  return `${svcText}${addonText}${misuMark}${tipText}`.trim()
}

/* ------------------ ✅ v4: 합산 + “미수까지만(◼︎까지)” ------------------ */
function buildMisuOnlyText(args: { memoObj: any; misuAmount: number }) {
  const memoObj = args.memoObj
  const misuMark = args.misuAmount > 0 ? '◼︎' : ''

  const tipRaw = memoObj && typeof memoObj === 'object' ? Number(memoObj?.tip ?? 0) : 0
  const tip = Number.isFinite(tipRaw) ? Math.max(0, tipRaw) : 0
  const tipUnit = tip > 0 ? Math.round(tip / 1000) : 0
  const tipText = tipUnit > 0 ? `(${tipUnit})` : ''

  if (memoObj && typeof memoObj === 'object' && memoObj.v === 4 && Array.isArray(memoObj.steps)) {
    const steps = memoObj.steps as any[]

    const firstMisuIdx = steps.findIndex((s) => Boolean(s?.misu))
    const slice = firstMisuIdx >= 0 ? steps.slice(0, firstMisuIdx + 1) : steps

    let jMin = 0
    let rMin = 0
    let atCount = 0
    let heartCount = 0

    for (const s of slice) {
      const key = String(s?.key ?? '')
      const kind = String(s?.kind ?? (key.startsWith('RT_') ? 'R' : 'J'))

      if (kind === 'R') rMin += Math.max(0, Number(R_KEY_MINUTES[key] ?? 0))
      else jMin += Math.max(0, Number(J_KEY_MINUTES[key] ?? 0))

      atCount += Math.max(0, Number(s?.at ?? 0))
      heartCount += Math.max(0, Number(s?.heart ?? 0))
    }

    const jText = formatHalfUnitText(jMin, '')
    const rText = formatHalfUnitText(rMin, '룸')
    const svcText = `${jText}${rText}`.trim()
    const addons = `${repeatChar('@', atCount)}${repeatChar('♡', heartCount)}`

    return `${svcText}${addons}${tipText}${misuMark}`.trim()
  }

  const { qty, heartLike } = extractAggFromMemo(memoObj ?? {})
  const qtyText = qty > 0 ? `${qty}개` : ''
  const hearts = repeatChar('♡', heartLike)
  return `${qtyText}${hearts}${tipText}${misuMark}`.trim()
}

function numFromAny(v: any): number {
  const n = Number(v)
  if (Number.isFinite(n)) return n
  if (typeof v === 'string') {
    const m = v.match(/(\d+)/)
    if (m) return Number(m[1])
  }
  return 0
}

function toBool(v: any) {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v === 1
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    return s === '1' || s === 'true' || s === 'y' || s === 'yes' || s === 't'
  }
  return Boolean(v)
}

function pickMisuBaseIso(memoObj: any, createdAt: string) {
  const cands = [
    memoObj?.misuAt,
    memoObj?.misu_at,
    memoObj?.misuCreatedAt,
    memoObj?.misu_created_at,
    memoObj?.misuDateTime,
    memoObj?.misu_datetime,
    memoObj?.misuTime,
    memoObj?.misu_time,
    memoObj?.misuDate,
    memoObj?.misu_date,
    memoObj?.misuInputAt,
    memoObj?.misu_input_at,
  ]
  for (const v of cands) {
    const s = typeof v === 'string' ? v : null
    if (!s) continue
    const t = new Date(s).getTime()
    if (Number.isFinite(t) && t > 0) return s
  }
  return createdAt
}

function extractAggFromMemo(memoObj: any) {
  const root = memoObj ?? {}

  const directQty =
    numFromAny(root?.misuCountTotal) ||
    numFromAny(root?.countTotal) ||
    numFromAny(root?.qtyTotal) ||
    numFromAny(root?.totalCount) ||
    numFromAny(root?.totalQty) ||
    numFromAny(root?.misuQtyTotal)

  const directHearts =
    numFromAny(root?.misuHeartTotal) ||
    numFromAny(root?.heartTotal) ||
    numFromAny(root?.atTotal) ||
    numFromAny(root?.totalHeart) ||
    numFromAny(root?.totalAt)

  if (directQty > 0 || directHearts > 0) {
    return { qty: Math.max(0, directQty), heartLike: Math.max(0, directHearts) }
  }

  const arrays: any[] = [
    root?.menus,
    root?.menuItems,
    root?.menu_list,
    root?.menuList,
    root?.items,
    root?.lines,
    root?.rows,
    root?.entries,
    root?.details,
    root?.parts,
    root?.list,
    root?.misuItems,
    root?.misu?.items,
    root?.misu?.menus,
    root?.detail?.items,
    root?.detail?.menus,
    root?.data?.items,
    root?.payload?.items,
  ].filter(Array.isArray)

  let qty = 0
  let heartLike = 0

  if (arrays.length > 0) {
    for (const arr of arrays) {
      for (const m of arr) {
        qty += numFromAny(m?.count ?? m?.qty ?? m?.cnt ?? m?.n ?? m?.ea ?? m?.pieces ?? m?.units ?? m?.quantity ?? m?.misuCount ?? m?.misuQty)
        const heart = numFromAny(m?.heartCount) || (toBool(m?.heart ?? m?.isHeart ?? m?.heartYn) ? 1 : 0)
        const at = numFromAny(m?.atCount) || (toBool(m?.at ?? m?.isAt ?? m?.atYn) ? 1 : 0)
        heartLike += heart + at
      }
    }
  }

  if (qty === 0 && heartLike === 0) {
    const deep = deepAggregate(root)
    qty = deep.qty
    heartLike = deep.heartLike
  }

  return { qty: Math.max(0, qty), heartLike: Math.max(0, heartLike) }
}

function deepAggregate(root: any) {
  const seen = new WeakSet<object>()
  let qty = 0
  let heartLike = 0

  const countKeys = new Set(['count', 'qty', 'cnt', 'n', 'ea', 'pieces', 'units', 'quantity', 'misuCount', 'misuQty', 'menuCount', 'menuQty'])
  const ignoreKeysContains = ['amount', 'price', 'money', 'cost', 'sum', 'total', 'misuamount']

  const walk = (node: any) => {
    if (!node) return
    if (typeof node !== 'object') return

    if (seen.has(node as object)) return
    seen.add(node as object)

    if (Array.isArray(node)) {
      for (const v of node) walk(v)
      return
    }

    try {
      const keys = Object.keys(node)

      let hasItemSignal = false
      for (const k of keys) {
        const lk = k.toLowerCase()
        if (countKeys.has(k) || countKeys.has(lk)) hasItemSignal = true
        if (lk.includes('heart') || lk === 'heart' || lk.includes('at') || lk === 'at') hasItemSignal = true
      }

      if (hasItemSignal) {
        for (const k of keys) {
          const lk = k.toLowerCase()
          if (ignoreKeysContains.some((w) => lk.includes(w))) continue

          if (countKeys.has(k) || countKeys.has(lk)) {
            qty += numFromAny((node as any)[k])
          }

          if (lk === 'heart' || lk.includes('heart')) {
            const v = (node as any)[k]
            heartLike += numFromAny(v) || (toBool(v) ? 1 : 0)
          }
          if (lk === 'at' || lk === '@' || lk.includes('at')) {
            const v = (node as any)[k]
            heartLike += numFromAny(v) || (toBool(v) ? 1 : 0)
          }
        }
      }

      for (const k of keys) {
        const v = (node as any)[k]
        if (v && typeof v === 'object') walk(v)
      }
    } catch {}
  }

  walk(root)

  if (!Number.isFinite(qty)) qty = 0
  if (!Number.isFinite(heartLike)) heartLike = 0
  return { qty: Math.max(0, qty), heartLike: Math.max(0, heartLike) }
}

function formatCurrency(n: number) {
  const v = Number(n ?? 0)
  if (!Number.isFinite(v)) return '0'
  return v.toLocaleString('ko-KR')
}

/* ---- settlement helpers ---- */
function safeJson(s: string | null) {
  if (!s) return null
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

function deriveSettleLog(r: any, staffMap: Map<string, string>): SettleLog | null {
  const id = Number(r?.id ?? 0)
  const staffId = String(r?.staff_id ?? '')
  const work_at = String(r?.work_at ?? '')
  if (!id || !staffId || !work_at) return null

  const ts = new Date(work_at).getTime()
  if (!Number.isFinite(ts)) return null

  const staffName = staffMap.get(staffId) ?? '직원'
  const storeName =
    r?.stores?.name != null
      ? String(r.stores.name)
      : r?.stores?.[0]?.name
        ? String(r.stores[0].name)
        : '가게 미지정'

  const payRaw = Array.isArray(r?.staff_payment_logs) ? r.staff_payment_logs[0] : null
  const memoStr: string | null = payRaw?.memo ?? null
  const memoObj = safeJson(memoStr)

  const minutes = Math.max(0, Number(r?.minutes ?? 0))

  let storeTotal = 0
  let staffPay = Math.max(0, Number(payRaw?.amount ?? 0))
  let adminPay = 0
  let tip = 0
  let misu = false
  let misuAmount = 0
  let cash = false

  const savedBy = pickSavedByName(memoObj)

  if (memoObj && typeof memoObj === 'object') {
    storeTotal = Math.max(0, Number((memoObj as any).storeTotal ?? 0))
    staffPay = Math.max(0, Number((memoObj as any).staffPay ?? staffPay ?? 0))
    adminPay = Math.max(0, Number((memoObj as any).adminPay ?? 0))
    tip = Math.max(0, Number((memoObj as any).tip ?? 0))
    misu = Boolean((memoObj as any).misu)
    misuAmount = Math.max(0, Number((memoObj as any).misuAmount ?? 0))
    cash = Boolean((memoObj as any).cash)
  }

  const timeText = new Date(work_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })

  return {
    id,
    staffId,
    staffName,
    work_at,
    ts,
    timeText,
    storeName,
    minutes,
    storeTotal,
    staffPay,
    adminPay,
    tip,
    misu,
    misuAmount,
    cash,
    savedBy,
    memoObj,
  }
}

/* ---- date/time helpers ---- */
function getKstDateString() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDaysYmd(ymd: string, delta: number) {
  const d = new Date(`${ymd}T00:00:00+09:00`)
  d.setDate(d.getDate() + delta)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getKstDayRangeIso7(dateYmd: string) {
  const start = new Date(`${dateYmd}T07:00:00+09:00`)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}