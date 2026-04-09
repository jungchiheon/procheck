'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabaseClient'
import { GlassCard } from '@/components/ui/GlassCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { ProButton } from '@/components/ui/ProButton'
import { cn } from '@/lib/cn'
import { AdminNotificationBell } from '@/components/AdminNotificationBell'
import { RefreshCcw, CheckCircle2, X, ChevronLeft, ChevronRight } from 'lucide-react'

type StaffStatus = 'WORKING' | 'CAR_WAIT' | 'LODGE_WAIT' | 'OFF' | 'CHOICE_ING' | 'CHOICE_DONE'
/** 직원 소속 (에이원 / 고고) — DB `user_profiles.affiliation` */
type StaffAffiliation = 'AONE' | 'GOGO'
const AFFILIATION_LABEL: Record<StaffAffiliation, string> = {
  AONE: '에이원',
  GOGO: '고고',
}

type StaffGroup = 'ON' | 'OFF'
type TabKey = 'staff' | 'misu' | 'settle'

const GROUP_LABEL: Record<StaffGroup, string> = { ON: '출근', OFF: '퇴근' }
const GROUP_ORDER: StaffGroup[] = ['ON', 'OFF']
const groupRank = (g: StaffGroup) => GROUP_ORDER.indexOf(g)

type StaffRow = {
  id: string
  login_id: string
  nickname: string
  last_checkin_at: string | null
  last_checkout_at: string | null
  work_status: StaffStatus | null
  affiliation: StaffAffiliation | null
}

type SortMode = 'visit' | 'status'

const VISIT_KEY = 'pc_admin_staff_last_visit_v1'
const STAFF_CACHE_KEY = 'pc_admin_staff_rows_v2'
const STAFF_CACHE_TTL_MS = 60 * 1000
const PREFETCH_TOP_N = 6
const PAGE_CHUNK = 40

// 미수 캐시
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
  lineText: string // ✅ “미수까지만” 표시 문자열
  misuAmount: number
  createdAt: string
  memoObj: any
  adminName: string | null
}

// 전체 정산 raw row
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

const SETTLE_ALL_TTL = 30 * 1000

/** 정산 처리 상태 (일별 JSON `user_profiles.settlement_day_status[ymd]`) */
type SettleProcessKey = 'PENDING' | 'DEPOSIT_DONE' | 'CASH_DONE'
const SETTLE_PROCESS_LABEL: Record<SettleProcessKey, string> = {
  PENDING: '처리전',
  DEPOSIT_DONE: '입금완료',
  CASH_DONE: '현금완료',
}
const SETTLE_PROCESS_OPTIONS: SettleProcessKey[] = ['PENDING', 'DEPOSIT_DONE', 'CASH_DONE']

type SettleProfileRow = {
  bank_name: string | null
  bank_account: string | null
  bank_holder: string | null
  settlement_traits: string | null
  settlement_day_status: Record<string, string> | null
}

function parseDayStatusMap(raw: unknown): Record<string, string> | null {
  if (raw == null) return null
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, string>
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw)
      return typeof p === 'object' && p && !Array.isArray(p) ? (p as Record<string, string>) : null
    } catch {
      return null
    }
  }
  return null
}

function normalizeProcessKey(v: string | undefined | null): SettleProcessKey {
  if (v === 'DEPOSIT_DONE' || v === 'CASH_DONE' || v === 'PENDING') return v
  return 'PENDING'
}

/** 직원 목록 — `affiliation` 컬럼이 없는 DB에서도 동작하도록 조회에 포함하지 않음(추가 후엔 여기에 affiliation 붙이면 됨) */
function fetchStaffListForAdmin() {
  return supabaseClient
    .from('user_profiles')
    .select('id, login_id, nickname, last_checkin_at, last_checkout_at, work_status')
    .eq('role', 'staff')
    .eq('is_active', true)
}

export default function AdminStaffPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [tab, setTab] = useState<TabKey>('staff')

  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  // staff
  const [rows, setRows] = useState<StaffRow[]>([])
  const [sortMode, setSortMode] = useState<SortMode>('visit')

  const [visitMap, setVisitMap] = useState<Record<string, number>>({})

  // 직원 추가 모달
  const [open, setOpen] = useState(false)
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [createAffiliation, setCreateAffiliation] = useState<StaffAffiliation>('AONE')
  const [creating, setCreating] = useState(false)

  // 점진 렌더
  const [renderCount, setRenderCount] = useState(PAGE_CHUNK)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const lastPrefetchKeyRef = useRef<string>('')

  // misu
  const [misuLoading, setMisuLoading] = useState(false)
  const [misuError, setMisuError] = useState<string | null>(null)
  const [misuItems, setMisuItems] = useState<MisuItem[]>([])
  const [misuSyncTick, setMisuSyncTick] = useState(0)

  // settle tab (✅ “하루 단위” 네비게이션)
  const [settleYmd, setSettleYmd] = useState(getKstDateString())
  const [settleLoading, setSettleLoading] = useState(false)
  const [settleError, setSettleError] = useState<string | null>(null)
  const [settleRows, setSettleRows] = useState<SettleLog[]>([])
  const [settleProfiles, setSettleProfiles] = useState<Record<string, SettleProfileRow>>({})
  const [settleProfilesLoading, setSettleProfilesLoading] = useState(false)
  const [starMenuStaffId, setStarMenuStaffId] = useState<string | null>(null)
  const [heartStaffId, setHeartStaffId] = useState<string | null>(null)
  const [heartStaffNickname, setHeartStaffNickname] = useState<string>('')
  const [misuConfirmItem, setMisuConfirmItem] = useState<MisuItem | null>(null)
  const [misuConfirmLoading, setMisuConfirmLoading] = useState(false)
  const [heartDraft, setHeartDraft] = useState<{
    bank_name: string
    bank_account: string
    bank_holder: string
    settlement_traits: string
  } | null>(null)
  const heartSaveTimerRef = useRef<number | null>(null)

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

        const [{ data: prof, error: profErr }, { data: staffRows, error: staffErr }] = await Promise.all([
          profQ,
          fetchStaffListForAdmin(),
        ])
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

  // (레거시) 체크인/체크아웃 기반 출근 여부 추정
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

  // 그룹(출근/퇴근)
  const groupOfStatus = (st: StaffStatus): StaffGroup => (st === 'OFF' ? 'OFF' : 'ON')
  const groupOfRow = (r: StaffRow): StaffGroup => groupOfStatus(statusOf(r))

  const lastActivityMs = (r: StaffRow) => {
    const working = isWorkingLegacy(r)
    const baseIso = working ? r.last_checkin_at : r.last_checkout_at ?? r.last_checkin_at
    const t = baseIso ? new Date(baseIso).getTime() : 0
    return Number.isFinite(t) ? t : 0
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

  // 점진 렌더 sentinel
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

  // 상위 일부 prefetch
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

  // 직원 추가
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
        body: JSON.stringify({ loginId: id, password: pw, nickname: nn, affiliation: createAffiliation }),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || '직원 생성 실패')

      setOpen(false)
      setLoginId('')
      setPassword('')
      setNickname('')
      setCreateAffiliation('AONE')

      // 재동기화
      setSyncing(true)
      const { data, error } = await fetchStaffListForAdmin()
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
        .filter((x): x is any => Boolean(x))

      if (filtered.length === 0) {
        setMisuItems([])
        ssWrite(MISU_CACHE_KEY, { ts: Date.now(), items: [] })
        return
      }

      const staffIds = Array.from(new Set(filtered.map((x) => x.staffId).filter(Boolean)))
      const workLogIds = Array.from(new Set(filtered.map((x) => x.workLogId).filter((x: any): x is number => typeof x === 'number')))

      // staff 프로필
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

      // work_log (가게명)
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

      const items: MisuItem[] = filtered.map((x: any) => {
        const staff = staffMap.get(x.staffId) ?? { nickname: '직원' }
        const w = x.workLogId != null ? workMap.get(x.workLogId) : null
        const storeName = w?.storeName ?? '가게 미지정'
        const ymd = toKstDateStringAt7(x.baseIso)

        // ✅ 핵심: “쌓는 방식(v5 tokens)” 우선으로 미수까지만 문자열 생성
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

  const runMisuDone = async (it: MisuItem) => {
    setMisuError(null)
    try {
      const prevObj = parseMemoAny(JSON.stringify(it.memoObj)) ?? {}
      const nextObj = { ...prevObj, misuDone: true, misuDoneAt: new Date().toISOString() }

      const { error: uErr } = await supabaseClient.from('staff_payment_logs').update({ memo: JSON.stringify(nextObj) }).eq('id', it.paymentId)
      if (uErr) throw new Error(`정산 완료 처리 실패: ${uErr.message}`)

      setMisuItems((prev) => {
        const next = prev.filter((x) => x.paymentId !== it.paymentId)
        ssWrite(MISU_CACHE_KEY, { ts: Date.now(), items: next })
        return next
      })
      setMisuSyncTick((t) => t + 1)
      setMisuConfirmItem(null)
    } catch (e: any) {
      setMisuError(e?.message ?? '정산 완료 처리 오류')
    }
  }

  const confirmMisuDone = async () => {
    if (!misuConfirmItem) return
    setMisuConfirmLoading(true)
    try {
      await runMisuDone(misuConfirmItem)
    } finally {
      setMisuConfirmLoading(false)
    }
  }

  /* ------------------------- 정산 탭 (하루 단위) ------------------------- */
  const fetchSettlementDay = async (ymd: string) => {
    const { startIso, endIso } = getKstRangeIso7(ymd, ymd)
    const cacheKey = `pc_admin_settle_all_${ymd}_${ymd}_v2`
    const cached = ssRead<{ ts: number; rows: SettleLog[] }>(cacheKey, SETTLE_ALL_TTL)?.rows ?? null
    if (cached) {
      setSettleRows(cached)
      return
    }

    // staff_work_logs + staff_payment_logs join
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

    // staff nickname map
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

  const runSettlementDay = async (ymd: string) => {
    setSettleError(null)
    setSettleLoading(true)
    try {
      await fetchSettlementDay(ymd)
    } catch (e: any) {
      setSettleError(e?.message ?? '정산 조회 오류')
    } finally {
      setSettleLoading(false)
    }
  }

  useEffect(() => {
    if (tab !== 'settle') return
    const today = getKstDateString()
    setSettleYmd(today)
    runSettlementDay(today).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const settleStaffBlocks = useMemo(() => {
    if (tab !== 'settle') return []

    const map = new Map<string, { staffId: string; staffName: string; logs: SettleLog[] }>()
    for (const r of settleRows) {
      const key = r.staffId
      const cur = map.get(key)
      if (!cur) map.set(key, { staffId: r.staffId, staffName: r.staffName, logs: [r] })
      else cur.logs.push(r)
    }

    const blocks = Array.from(map.values())
    for (const b of blocks) {
      b.logs.sort((a, b2) => a.ts - b2.ts)
    }

    // 직원명 정렬(한글)
    blocks.sort((a, b) => (a.staffName || '').localeCompare(b.staffName || '', 'ko'))

    return blocks.map((b) => {
      const staffPaySum = b.logs.reduce((s, x) => s + (x.staffPay || 0), 0)
      const adminPaySum = b.logs.reduce((s, x) => s + (x.adminPay || 0), 0)

      // ✅ 직원 표시 금액: 1000원당 1
      const staffUnit = Math.round(staffPaySum / 1000)

      const lines = b.logs.map((x) => {
        const timeHm = isoToHm(x.work_at)
        const seq = buildSettleLineFromMemo(x.memoObj) // ✅ 쌓는 방식 반영 + ◼︎
        return {
          id: `${x.staffId}_${x.id}`,
          storeName: x.storeName,
          timeHm,
          seq,
        }
      })

      return {
        staffId: b.staffId,
        staffName: b.staffName,
        staffUnit,
        adminPaySum,
        lines,
      }
    })
  }, [tab, settleRows])

  const loadSettleStaffProfiles = useCallback(async (ids: string[]) => {
    if (!ids.length) {
      setSettleProfiles({})
      return
    }
    setSettleProfilesLoading(true)
    try {
      let data: unknown
      let error: { message: string } | null

      const full = await supabaseClient
        .from('user_profiles')
        .select('id, bank_name, bank_account, bank_holder, settlement_day_status, settlement_traits')
        .in('id', ids)

      if (full.error && /settlement_|column|does not exist/i.test(String(full.error.message))) {
        const basic = await supabaseClient
          .from('user_profiles')
          .select('id, bank_name, bank_account, bank_holder')
          .in('id', ids)
        data = basic.data
        error = basic.error
      } else {
        data = full.data
        error = full.error
      }

      if (error) throw error
      const rows = Array.isArray(data) ? data : []
      const next: Record<string, SettleProfileRow> = {}
      for (const r of rows) {
        const row = r as Record<string, unknown>
        const id = String(row?.id ?? '')
        if (!id) continue
        next[id] = {
          bank_name: (row.bank_name as string) ?? null,
          bank_account: (row.bank_account as string) ?? null,
          bank_holder: (row.bank_holder as string) ?? null,
          settlement_traits: (row.settlement_traits as string) ?? null,
          settlement_day_status: parseDayStatusMap(row.settlement_day_status),
        }
      }
      setSettleProfiles(next)
    } catch (e: any) {
      setSettleError(e?.message ?? '정산 직원 정보(계좌·처리상태)를 불러오지 못했습니다. Supabase에 settlement_day_status, settlement_traits 컬럼이 있는지 확인하세요.')
    } finally {
      setSettleProfilesLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab !== 'settle') return
    const ids = Array.from(new Set(settleRows.map((r) => r.staffId)))
    if (!ids.length) {
      setSettleProfiles({})
      return
    }
    loadSettleStaffProfiles(ids)
  }, [tab, settleRows, loadSettleStaffProfiles])

  useEffect(() => {
    if (!starMenuStaffId) return
    const close = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (t?.closest?.('[data-settle-star-wrap]')) return
      setStarMenuStaffId(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [starMenuStaffId])

  const persistProcessStatus = async (staffId: string, ymd: string, status: SettleProcessKey) => {
    let cur: Record<string, string> = {}
    setSettleProfiles((p) => {
      const prevRow = p[staffId]
      cur = { ...(prevRow?.settlement_day_status ?? {}), [ymd]: status }
      return {
        ...p,
        [staffId]: {
          bank_name: prevRow?.bank_name ?? null,
          bank_account: prevRow?.bank_account ?? null,
          bank_holder: prevRow?.bank_holder ?? null,
          settlement_traits: prevRow?.settlement_traits ?? null,
          settlement_day_status: cur,
        },
      }
    })
    const { error } = await supabaseClient.from('user_profiles').update({ settlement_day_status: cur }).eq('id', staffId)
    if (error) throw new Error(error.message)
    setStarMenuStaffId(null)
  }

  const flushHeartSave = useCallback(
    async (staffId: string, draft: { bank_name: string; bank_account: string; bank_holder: string; settlement_traits: string }) => {
      const { error } = await supabaseClient
        .from('user_profiles')
        .update({
          bank_name: draft.bank_name.trim() || null,
          bank_account: draft.bank_account.trim() || null,
          bank_holder: draft.bank_holder.trim() || null,
          settlement_traits: draft.settlement_traits.trim() || null,
        })
        .eq('id', staffId)
      if (error) throw new Error(error.message)
      setSettleProfiles((prev) => ({
        ...prev,
        [staffId]: {
          ...(prev[staffId] ?? {
            bank_name: null,
            bank_account: null,
            bank_holder: null,
            settlement_traits: null,
            settlement_day_status: null,
          }),
          bank_name: draft.bank_name.trim() || null,
          bank_account: draft.bank_account.trim() || null,
          bank_holder: draft.bank_holder.trim() || null,
          settlement_traits: draft.settlement_traits.trim() || null,
        },
      }))
    },
    []
  )

  const scheduleHeartSave = useCallback(
    (staffId: string, draft: { bank_name: string; bank_account: string; bank_holder: string; settlement_traits: string }) => {
      if (heartSaveTimerRef.current) window.clearTimeout(heartSaveTimerRef.current)
      heartSaveTimerRef.current = window.setTimeout(() => {
        heartSaveTimerRef.current = null
        flushHeartSave(staffId, draft).catch((e) => setSettleError((e as Error)?.message ?? '저장 실패'))
      }, 450)
    },
    [flushHeartSave]
  )

  const openHeartForStaff = useCallback(
    async (staffId: string, staffNickname: string) => {
      if (heartSaveTimerRef.current) {
        window.clearTimeout(heartSaveTimerRef.current)
        heartSaveTimerRef.current = null
      }
      if (heartStaffId === staffId && heartDraft) {
        try {
          await flushHeartSave(heartStaffId, heartDraft)
        } catch (e: any) {
          setSettleError(e?.message ?? '저장 실패')
          return
        }
        setHeartStaffId(null)
        setHeartStaffNickname('')
        setHeartDraft(null)
        return
      }
      if (heartStaffId && heartDraft && heartStaffId !== staffId) {
        try {
          await flushHeartSave(heartStaffId, heartDraft)
        } catch (e: any) {
          setSettleError(e?.message ?? '저장 실패')
          return
        }
      }
      setHeartStaffId(staffId)
      setHeartStaffNickname(staffNickname.trim() || '직원')
      const p = settleProfiles[staffId]
      setHeartDraft({
        bank_name: p?.bank_name ?? '',
        bank_account: p?.bank_account ?? '',
        bank_holder: p?.bank_holder ?? '',
        settlement_traits: p?.settlement_traits ?? '',
      })
    },
    [heartStaffId, heartDraft, flushHeartSave, settleProfiles]
  )

  const closeHeartModal = useCallback(async () => {
    if (heartSaveTimerRef.current) {
      window.clearTimeout(heartSaveTimerRef.current)
      heartSaveTimerRef.current = null
    }
    if (heartStaffId && heartDraft) {
      try {
        await flushHeartSave(heartStaffId, heartDraft)
      } catch (e: any) {
        setSettleError(e?.message ?? '저장 실패')
        return
      }
    }
    setHeartStaffId(null)
    setHeartStaffNickname('')
    setHeartDraft(null)
  }, [heartStaffId, heartDraft, flushHeartSave])

  useEffect(() => {
    if (tab !== 'settle') return
    const ids = new Set(settleStaffBlocks.map((b) => b.staffId))
    if (ids.size === 0) return
    const ch = supabaseClient
      .channel(`settle_profiles_rt_${settleYmd}_${ids.size}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'user_profiles' },
        (payload) => {
          const id = String((payload.new as Record<string, unknown>)?.id ?? '')
          if (!id || !ids.has(id)) return
          const row = payload.new as Record<string, unknown>
          setSettleProfiles((prev) => ({
            ...prev,
            [id]: {
              bank_name: (row.bank_name as string) ?? null,
              bank_account: (row.bank_account as string) ?? null,
              bank_holder: (row.bank_holder as string) ?? null,
              settlement_traits: (row.settlement_traits as string) ?? null,
              settlement_day_status: parseDayStatusMap(row.settlement_day_status) ?? prev[id]?.settlement_day_status ?? null,
            },
          }))
        }
      )
      .subscribe()
    return () => {
      supabaseClient.removeChannel(ch)
    }
  }, [tab, settleStaffBlocks, settleYmd])

  useEffect(() => {
    if (tab === 'settle') return
    setStarMenuStaffId(null)
    if (heartStaffId) void closeHeartModal()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  useEffect(() => {
    if (tab !== 'misu') setMisuConfirmItem(null)
  }, [tab])

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
                            <div className="min-w-0">
                              <div className="text-white text-sm font-semibold truncate">{s.nickname}</div>
                              <div className="mt-0.5 text-[11px] text-white/35 truncate">{s.login_id}</div>
                              {s.affiliation && (
                                <div className="mt-0.5 text-[11px] text-white/45">{AFFILIATION_LABEL[s.affiliation]}</div>
                              )}
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

          {/* 직원 추가 모달 */}
          {open && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
              <button className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} type="button" aria-label="닫기" />
              <div className="relative w-full max-w-md">
                <GlassCard className="p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-white text-lg font-semibold">직원 추가</div>
                      <div className="mt-1 text-sm text-white/55">로그인ID/비밀번호/닉네임/소속</div>
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

                    <div>
                      <label className="text-sm font-medium text-white/80">소속</label>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {(['AONE', 'GOGO'] as const).map((key) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setCreateAffiliation(key)}
                            className={cn(
                              'rounded-xl border px-3 py-2.5 text-sm font-semibold transition',
                              createAffiliation === key
                                ? 'bg-white text-zinc-900 border-white/0'
                                : 'bg-white/5 text-white/85 border-white/12 hover:bg-white/10'
                            )}
                          >
                            {AFFILIATION_LABEL[key]}
                          </button>
                        ))}
                      </div>
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
                            {/* ✅ 맨위: 직원/가게/시간 */}
                            <div className="text-sm text-white font-semibold truncate">
                              {it.staffNickname} / {it.storeName} / {isoToHm(it.baseIso || it.createdAt)}
                            </div>

                            {/* ✅ 저장한 관리자 */}
                            <div className="mt-0.5 text-[11px] text-white/45 truncate">{it.adminName ? `저장: ${it.adminName}` : '-'}</div>

                            {/* ✅ 맨밑줄: 합산+미수까지만(◼︎까지) */}
                            <div className="mt-1 text-xs text-white/70 truncate">{it.lineText}</div>
                          </div>

                          <div className="shrink-0 text-right">
                            <div className="text-sm text-white/85 font-semibold">{formatCurrency(it.misuAmount)}원</div>
                            <button
                              type="button"
                              onClick={() => setMisuConfirmItem(it)}
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

          {/* 미수 정산 완료 확인 */}
          {misuConfirmItem && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <button
                type="button"
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                aria-label="닫기"
                onClick={() => !misuConfirmLoading && setMisuConfirmItem(null)}
              />
              <div className="relative w-full max-w-sm">
                <div
                  className={cn(
                    'relative rounded-2xl border border-white/15 p-6 pt-7 shadow-2xl',
                    'bg-zinc-950 text-white'
                  )}
                >
                  <button
                    type="button"
                    disabled={misuConfirmLoading}
                    onClick={() => setMisuConfirmItem(null)}
                    className="absolute right-4 top-4 rounded-xl border border-white/12 bg-white/5 p-2 text-white/70 hover:bg-white/10 transition disabled:opacity-50"
                    aria-label="닫기"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <div className="flex items-start gap-3 pr-10">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/20">
                      <CheckCircle2 className="h-6 w-6" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold tracking-tight">미수 정산 완료</h2>
                      <p className="mt-1 text-sm text-white/50 leading-relaxed">
                        아래 내역을 정산 완료로 처리할까요? 완료 후 목록에서 사라집니다.
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 space-y-2 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="text-white/45">직원</span>
                      <span className="font-medium text-white text-right truncate">{misuConfirmItem.staffNickname}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-white/45">가게</span>
                      <span className="font-medium text-white text-right truncate">{misuConfirmItem.storeName}</span>
                    </div>
                    <div className="flex justify-between gap-2 border-t border-white/10 pt-2 mt-2">
                      <span className="text-white/45">미수 금액</span>
                      <span className="text-lg font-semibold text-emerald-200">{formatCurrency(misuConfirmItem.misuAmount)}원</span>
                    </div>
                  </div>
                  <div className="mt-6 flex gap-2">
                    <button
                      type="button"
                      disabled={misuConfirmLoading}
                      onClick={() => setMisuConfirmItem(null)}
                      className="flex-1 rounded-xl border border-white/15 bg-white/5 py-3 text-sm font-semibold text-white/85 hover:bg-white/10 transition disabled:opacity-50"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      disabled={misuConfirmLoading}
                      onClick={() => confirmMisuDone()}
                      className="flex-1 rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 transition disabled:opacity-60"
                    >
                      {misuConfirmLoading ? '처리 중…' : '정산 완료'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </GlassCard>
      )}

      {/* ------------------------- 정산 탭 ------------------------- */}
      {tab === 'settle' && (
        <GlassCard className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-white font-semibold tracking-tight">정산</div>

            <div className="flex items-center gap-3">
              {settleProfilesLoading && <span className="text-xs text-white/40">직원 정보 로드…</span>}
              <button
                type="button"
                onClick={() => runSettlementDay(settleYmd)}
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
          </div>

          <div className="mt-2 text-sm text-white/55">기준 : 07:00 ~ 다음날 07:00</div>

          {/* ✅ 날짜 네비 (전날/다음날) */}
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const prev = addDaysYmd(settleYmd, -1)
                setSettleYmd(prev)
                runSettlementDay(prev).catch(() => {})
              }}
              className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-white/12 bg-white/5 text-white/80 hover:bg-white/10 transition"
              aria-label="전날"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="text-white font-semibold">{settleYmd}</div>

            <button
              type="button"
              onClick={() => {
                const next = addDaysYmd(settleYmd, +1)
                setSettleYmd(next)
                runSettlementDay(next).catch(() => {})
              }}
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
            {!settleLoading && settleStaffBlocks.length === 0 && <div className="py-6 text-sm text-white/60">해당 날짜에 내역이 없습니다.</div>}

            {!settleLoading &&
              settleStaffBlocks.map((b) => {
                const dayMap = settleProfiles[b.staffId]?.settlement_day_status
                const proc = normalizeProcessKey(dayMap?.[settleYmd])
                return (
                  <div key={b.staffId} className="mb-4">
                    {/* ✅ 직원별 헤더 + 처리상태(⭐) + 처리여부 + 계좌/특징(♥) */}
                    <div className="flex flex-wrap items-end justify-between gap-3 gap-y-2">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                        <div className="text-white font-semibold shrink-0">
                          {b.staffName} {b.staffUnit}
                        </div>

                        <div className="relative" data-settle-star-wrap>
                          <button
                            type="button"
                            title="처리 상태"
                            onClick={(e) => {
                              e.stopPropagation()
                              setStarMenuStaffId((prev) => (prev === b.staffId ? null : b.staffId))
                            }}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/12 bg-white/5 text-base leading-none hover:bg-white/10 transition"
                          >
                            ⭐
                          </button>
                          {starMenuStaffId === b.staffId && (
                            <div
                              className="absolute left-0 top-full z-30 mt-1 min-w-[9rem] rounded-xl border border-white/12 bg-zinc-950/98 py-1 shadow-xl backdrop-blur"
                              data-settle-star-wrap
                            >
                              {SETTLE_PROCESS_OPTIONS.map((key) => (
                                <button
                                  key={key}
                                  type="button"
                                  className={cn(
                                    'block w-full px-3 py-2 text-left text-sm font-medium transition',
                                    proc === key ? 'bg-white/15 text-white' : 'text-white/85 hover:bg-white/10'
                                  )}
                                  onClick={() => {
                                    persistProcessStatus(b.staffId, settleYmd, key).catch((err) =>
                                      setSettleError((err as Error)?.message ?? '처리 상태 저장 실패')
                                    )
                                  }}
                                >
                                  {SETTLE_PROCESS_LABEL[key]}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="text-white/40">처리여부</span>
                          <span className="font-semibold text-white/90">{SETTLE_PROCESS_LABEL[proc]}</span>
                        </div>

                        <button
                          type="button"
                          title="정산 계좌"
                          onClick={() => openHeartForStaff(b.staffId, b.staffName)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/12 bg-white/5 text-base leading-none hover:bg-white/10 transition"
                        >
                          ♥
                        </button>

                      </div>

                      <div className="text-xs text-white/70 shrink-0">{formatCurrency(b.adminPaySum)}원</div>
                    </div>

                    {/* ✅ 직원별 work log 리스트 */}
                    <div className="mt-2 divide-y divide-white/10 rounded-2xl border border-white/10 bg-black/10">
                      {b.lines.map((ln) => (
                        <div key={ln.id} className="px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm text-white/85 font-semibold truncate">
                                {ln.storeName} {ln.timeHm}
                              </div>
                              <div className="mt-1 text-xs text-white/70 truncate">{ln.seq}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
          </div>

          {/* ♥ 정산 계좌 (실시간 저장) */}
          {heartStaffId && heartDraft && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <button
                type="button"
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                aria-label="닫기"
                onClick={() => closeHeartModal()}
              />
              <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto">
                <div
                  className={cn(
                    'rounded-2xl border border-white/15 p-6 shadow-2xl',
                    'bg-zinc-950'
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xl font-bold tracking-tight text-white truncate">{heartStaffNickname}</div>
                      <div className="mt-1 text-sm text-white/50">정산 계좌 · 입력 시 자동 저장</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => closeHeartModal()}
                      className="shrink-0 rounded-xl border border-white/12 bg-white/10 p-2 text-white/80 hover:bg-white/15 transition"
                      aria-label="닫기"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-5 space-y-4">
                    <div>
                      <label className="text-sm font-medium text-white/80">은행명</label>
                      <input
                        className="mt-2 w-full rounded-xl border border-white/12 bg-zinc-900 px-3 py-2.5 text-white outline-none placeholder:text-white/30 focus:border-white/25"
                        value={heartDraft.bank_name}
                        onChange={(e) => {
                          const next = { ...heartDraft, bank_name: e.target.value }
                          setHeartDraft(next)
                          scheduleHeartSave(heartStaffId, next)
                        }}
                        placeholder="은행명"
                        autoComplete="off"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-white/80">예금주</label>
                      <input
                        className="mt-2 w-full rounded-xl border border-white/12 bg-zinc-900 px-3 py-2.5 text-white outline-none placeholder:text-white/30 focus:border-white/25"
                        value={heartDraft.bank_holder}
                        onChange={(e) => {
                          const next = { ...heartDraft, bank_holder: e.target.value }
                          setHeartDraft(next)
                          scheduleHeartSave(heartStaffId, next)
                        }}
                        placeholder="예금주"
                        autoComplete="off"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-white/80">계좌번호</label>
                      <input
                        className="mt-2 w-full rounded-xl border border-white/12 bg-zinc-900 px-3 py-2.5 text-white outline-none placeholder:text-white/30 focus:border-white/25"
                        value={heartDraft.bank_account}
                        onChange={(e) => {
                          const next = { ...heartDraft, bank_account: e.target.value }
                          setHeartDraft(next)
                          scheduleHeartSave(heartStaffId, next)
                        }}
                        placeholder="계좌번호"
                        autoComplete="off"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-white/80">메모</label>
                      <textarea
                        className="mt-2 w-full min-h-[140px] rounded-xl border border-white/12 bg-zinc-900 px-3 py-3 text-base text-white leading-relaxed outline-none placeholder:text-white/30 focus:border-white/25 resize-y"
                        value={heartDraft.settlement_traits}
                        onChange={(e) => {
                          const next = { ...heartDraft, settlement_traits: e.target.value }
                          setHeartDraft(next)
                          scheduleHeartSave(heartStaffId, next)
                        }}
                        placeholder="메모를 입력하세요"
                        autoComplete="off"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
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
        affiliation: (r?.affiliation === 'AONE' || r?.affiliation === 'GOGO' ? r.affiliation : null) as StaffAffiliation | null,
      }
      if (!row.id) return null
      return row
    })
    .filter((x): x is StaffRow => Boolean(x))
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

// ✅ memo에서 저장한 관리자 이름 추출
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

// 선택일 07:00 기준 날짜로 변환
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

/* ------------------ ✅ v5 tokens 기반 표시 (핵심) ------------------ */
/**
 * v5 예시:
 * memoObj.v === 5
 * memoObj.tokens = [
 *   {t:'J', key:'J_ONE'}, {t:'R', key:'RT_ONE'}, {t:'TIP', amount:100000}, {t:'MISU'},
 *   {t:'J', key:'J_ONE_HALF'}, ...
 * ]
 *
 * - ◼︎ 은 {t:'MISU'} 시점
 * - 팁은 {t:'TIP'} 시점에 (amount/1000) 표시
 * - 미수관리: “첫 ◼︎ 까지”만 보여야 함
 */
const SVC_MINUTES: Record<string, number> = { J_HALF: 30, J_ONE: 60, J_ONE_HALF: 90, J_TWO: 120, RT_HALF: 30, RT_ONE: 60 }

function buildMisuOnlyText(args: { memoObj: any; misuAmount: number }) {
  const memoObj = args.memoObj
  const misuMark = args.misuAmount > 0 ? '◼︎' : ''

  // ✅ v5 tokens 우선
  if (memoObj && typeof memoObj === 'object' && memoObj.v === 5 && Array.isArray(memoObj.tokens)) {
    const tokens = memoObj.tokens as any[]
    const misuIdx = tokens.findIndex((x) => x?.t === 'MISU')
    const slice = misuIdx >= 0 ? tokens.slice(0, misuIdx + 1) : tokens

    // 1) 서비스/룸 합산 (표시는 합산)
    let jMin = 0
    let rMin = 0

    // 2) addon 합산 (표시는 뒤에)
    let hearts = 0
    let ats = 0

    // 3) tip tokens (표시는 “시점” 유지: MISU 이전이면 ◼︎ 앞, 이후면 ◼︎ 뒤인데
    //    미수관리에서는 “◼︎까지 slice”만 보니까 => tip은 무조건 ◼︎ 앞/혹은 ◼︎ 직전에 있어야 함
    //    단, slice 내부에 TIP이 여러 번이면 합산해서 하나로 표기
    let tipUnitSum = 0

    for (const t of slice) {
      if (!t) continue
      if (t.t === 'J') jMin += Math.max(0, Number(SVC_MINUTES[String(t.key)] ?? 0))
      if (t.t === 'R') rMin += Math.max(0, Number(SVC_MINUTES[String(t.key)] ?? 0))
      if (t.t === 'HEART') hearts += 1
      if (t.t === 'AT') ats += 1
      if (t.t === 'TIP') {
        const amt = Math.max(0, Number(t.amount ?? 0))
        tipUnitSum += Math.round(amt / 1000)
      }
    }

    const svc = `${formatUnitsKo(jMin / 60, '')}${formatUnitsKo(rMin / 60, '룸')}`.trim()
    const addons = `${repeatChar('@', ats)}${repeatChar('♡', hearts)}`
    const tipText = tipUnitSum > 0 ? `(${tipUnitSum})` : ''

    // ✅ 미수관리: tip은 “미수 버튼 누르기 전”에 들어온 것만 slice에 존재 => ◼︎ 앞
    return `${svc}${addons}${tipText}${misuMark}`.trim()
  }

  // ✅ v4 fallback (기존 steps): “미수 step 까지” 합산
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
      const mins = Math.max(0, Number(SVC_MINUTES[key] ?? 0))
      const kind = String(s?.kind ?? (key.startsWith('RT_') ? 'R' : 'J'))
      if (kind === 'R') rMin += mins
      else jMin += mins

      atCount += Math.max(0, Number(s?.at ?? 0))
      heartCount += Math.max(0, Number(s?.heart ?? 0))
    }

    const tipRaw = Number(memoObj?.tip ?? 0)
    const tipUnit = tipRaw > 0 ? Math.round(Math.max(0, tipRaw) / 1000) : 0
    const tipText = tipUnit > 0 ? `(${tipUnit})` : ''

    const svcText = `${formatUnitsKo(jMin / 60, '')}${formatUnitsKo(rMin / 60, '룸')}`.trim()
    const addons = `${repeatChar('@', atCount)}${repeatChar('♡', heartCount)}`
    return `${svcText}${addons}${tipText}${misuMark}`.trim()
  }

  // fallback (구형 memo)
  const tipRaw = memoObj && typeof memoObj === 'object' ? Number(memoObj?.tip ?? 0) : 0
  const tipUnit = tipRaw > 0 ? Math.round(Math.max(0, tipRaw) / 1000) : 0
  const tipText = tipUnit > 0 ? `(${tipUnit})` : ''
  return `${tipText}${misuMark}`.trim()
}

// ✅ 정산 탭 개별 라인(서비스/룸 합산 + addon + (tip) + ◼︎) : “쌓는 방식” 반영
function buildSettleLineFromMemo(memoObj: any) {
  if (!memoObj || typeof memoObj !== 'object') return '-'

  // v5 tokens 우선
  if (memoObj.v === 5 && Array.isArray(memoObj.tokens)) {
    const tokens = memoObj.tokens as any[]

    // “미수 여부/팁 시점”이 tokens에 있으므로, 표시도 tokens 순서를 반영하되
    // 네가 요구한 정산 표기는 “합산 후 뒤에 addon, 그 다음 tip/미수 위치는 시점대로”
    let jMin = 0
    let rMin = 0
    let hearts = 0
    let ats = 0

    // tip은 “미수 전/후”를 위해 분리 합산
    let tipBeforeUnit = 0
    let tipAfterUnit = 0

    const misuIdx = tokens.findIndex((x) => x?.t === 'MISU')

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]
      if (!t) continue
      if (t.t === 'J') jMin += Math.max(0, Number(SVC_MINUTES[String(t.key)] ?? 0))
      if (t.t === 'R') rMin += Math.max(0, Number(SVC_MINUTES[String(t.key)] ?? 0))
      if (t.t === 'HEART') hearts += 1
      if (t.t === 'AT') ats += 1
      if (t.t === 'TIP') {
        const amt = Math.max(0, Number(t.amount ?? 0))
        const u = Math.round(amt / 1000)
        if (misuIdx >= 0 && i > misuIdx) tipAfterUnit += u
        else tipBeforeUnit += u
      }
    }

    const svc = `${formatUnitsKo(jMin / 60, '')}${formatUnitsKo(rMin / 60, '룸')}`.trim()
    const addons = `${repeatChar('@', ats)}${repeatChar('♡', hearts)}`
    const before = tipBeforeUnit > 0 ? `(${tipBeforeUnit})` : ''
    const after = tipAfterUnit > 0 ? `(${tipAfterUnit})` : ''
    const misuMark = misuIdx >= 0 ? '◼︎' : ''

    // ✅ 규칙: tip이 미수 전이면 ◼︎ 앞, 미수 후면 ◼︎ 뒤
    return `${svc}${addons}${before}${misuMark}${after}`.trim()
  }

  // v4 fallback (기존 memo)
  const tipRaw = Math.max(0, Number(memoObj?.tip ?? 0))
  const tipUnit = tipRaw > 0 ? Math.round(tipRaw / 1000) : 0
  const tipText = tipUnit > 0 ? `(${tipUnit})` : ''
  const misuMark = memoObj?.misu ? '◼︎' : ''
  // v4에서는 “시점”이 없으니: 항상 ◼︎ 앞에 붙여버림(기존 데이터용)
  return `${tipText}${misuMark}`.trim() || '-'
}

function repeatChar(ch: string, n: number) {
  const k = Math.max(0, Number(n || 0))
  if (k <= 0) return ''
  return new Array(k).fill(ch).join('')
}

const NUM_KO: Record<number, string> = { 1: '한', 2: '두', 3: '세', 4: '네', 5: '다섯', 6: '여섯', 7: '일곱', 8: '여덟', 9: '아홉', 10: '열' }
function numToKo(n: number) {
  return NUM_KO[n] ?? String(n)
}
function formatUnitsKo(units: number, prefix: '' | '룸') {
  const u = Math.round((Number.isFinite(units) ? units : 0) * 2) / 2
  if (u <= 0) return ''
  const intPart = Math.floor(u)
  const hasHalf = u - intPart >= 0.5

  if (intPart === 0 && hasHalf) return prefix ? `${prefix}반개` : '반개'
  if (!hasHalf) return prefix ? `${prefix}${numToKo(intPart)}개` : `${numToKo(intPart)}개`
  return prefix ? `${prefix}${numToKo(intPart)}개반` : `${numToKo(intPart)}개반`
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

function getKstRangeIso7(startYmd: string, endYmd: string) {
  const start = new Date(`${startYmd}T07:00:00+09:00`)
  const end = new Date(`${endYmd}T07:00:00+09:00`)
  end.setDate(end.getDate() + 1)
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}