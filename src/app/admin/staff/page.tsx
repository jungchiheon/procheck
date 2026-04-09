'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabaseClient'
import { GlassCard } from '@/components/ui/GlassCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { cn } from '@/lib/cn'
import { AdminNotificationBell } from '@/components/AdminNotificationBell'
import { CheckCircle2, X, ChevronLeft, ChevronRight, Star } from 'lucide-react'
import { ProButton } from '@/components/ui/ProButton'
import { StaffListTab } from './_components/StaffListTab'
import { fetchStaffListForAdmin } from './staff-admin.fetch'
import type {
  MisuItem,
  SettleLog,
  SettleProcessKey,
  SettleProfileRow,
  StaffAffiliation,
  StaffGroup,
  StaffRow,
  StaffStatus,
  SortMode,
  TabKey,
} from './staff-admin.types'
import {
  GROUP_ORDER,
  MISU_CACHE_KEY,
  MISU_CACHE_TTL_MS,
  PAGE_CHUNK,
  PREFETCH_TOP_N,
  SETTLE_ALL_TTL,
  SETTLE_PROCESS_LABEL,
  SETTLE_PROCESS_OPTIONS,
  STAFF_CACHE_KEY,
  STAFF_CACHE_TTL_MS,
  VISIT_KEY,
} from './staff-admin.types'
import {
  addDaysYmd,
  buildMisuOnlyText,
  buildSettleLineFromMemo,
  deriveSettleLog,
  formatCurrency,
  getKstDateString,
  getKstRangeIso7,
  idle,
  isoToHm,
  normalizeProcessKey,
  normalizeStaffRows,
  parseDayStatusMap,
  parseMemoAny,
  pickMisuBaseIso,
  pickSavedByName,
  ssRead,
  ssWrite,
  toKstDateStringAt7,
} from './staff-admin.utils'

const groupRank = (g: StaffGroup) => GROUP_ORDER.indexOf(g)

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

  const onStaffRowClick = (staffId: string) => {
    startTransition(() => router.push(`/admin/staff/${staffId}`))
    markVisitedIdle(staffId)
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
  const loadMisu = async (opts?: { force?: boolean; silent?: boolean }) => {
    const force = Boolean(opts?.force)
    const silent = Boolean(opts?.silent)

    if (!force && !silent) {
      const cached = ssRead<{ ts: number; items: MisuItem[] }>(MISU_CACHE_KEY, MISU_CACHE_TTL_MS)
      if (cached?.items) {
        setMisuItems(cached.items)
        return
      }
    }

    if (!silent) {
      setMisuError(null)
      setMisuLoading(true)
    }

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
      if (!silent) setMisuError(e?.message ?? '미수 조회 오류')
    } finally {
      if (!silent) setMisuLoading(false)
      setMisuSyncTick((t) => t + 1)
    }
  }

  useEffect(() => {
    if (tab !== 'misu') return
    loadMisu({ force: true }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  /** payment_logs 변경 시 미수 목록 자동 갱신 */
  useEffect(() => {
    if (tab !== 'misu') return
    let debounceId: number | null = null
    const schedule = () => {
      if (debounceId != null) window.clearTimeout(debounceId)
      debounceId = window.setTimeout(() => {
        debounceId = null
        loadMisu({ force: true, silent: true }).catch(() => {})
      }, 450)
    }
    const ch = supabaseClient
      .channel('misu_rt_payment_logs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_payment_logs' }, schedule)
      .subscribe()
    return () => {
      if (debounceId != null) window.clearTimeout(debounceId)
      supabaseClient.removeChannel(ch)
    }
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
  const fetchSettlementDay = async (ymd: string, opts?: { skipCache?: boolean }) => {
    const { startIso, endIso } = getKstRangeIso7(ymd, ymd)
    const cacheKey = `pc_admin_settle_all_${ymd}_${ymd}_v2`
    if (!opts?.skipCache) {
      const cached = ssRead<{ ts: number; rows: SettleLog[] }>(cacheKey, SETTLE_ALL_TTL)?.rows ?? null
      if (cached) {
        setSettleRows(cached)
        return
      }
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

  const runSettlementDay = async (ymd: string, opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent)
    if (!silent) {
      setSettleError(null)
      setSettleLoading(true)
    }
    try {
      await fetchSettlementDay(ymd, { skipCache: true })
    } catch (e: any) {
      setSettleError(e?.message ?? '정산 조회 오류')
    } finally {
      if (!silent) setSettleLoading(false)
    }
  }

  useEffect(() => {
    if (tab !== 'settle') return
    const today = getKstDateString()
    setSettleYmd(today)
    runSettlementDay(today).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  /** work_logs / payment_logs 변경 시 정산 목록 자동 갱신(디바운스) */
  useEffect(() => {
    if (tab !== 'settle') return
    let debounceId: number | null = null
    const scheduleRefetch = () => {
      if (debounceId != null) window.clearTimeout(debounceId)
      debounceId = window.setTimeout(() => {
        debounceId = null
        runSettlementDay(settleYmd, { silent: true }).catch(() => {})
      }, 450)
    }
    const ch = supabaseClient
      .channel(`settle_rt_work_pay_${settleYmd}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_work_logs' }, scheduleRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_payment_logs' }, scheduleRefetch)
      .subscribe()
    return () => {
      if (debounceId != null) window.clearTimeout(debounceId)
      supabaseClient.removeChannel(ch)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, settleYmd])

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
        const seq = buildSettleLineFromMemo(x.memoObj) // ✅ 쌓는 방식 반영 + □□
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
        <StaffListTab
          syncing={syncing}
          visible={visible}
          grouped={grouped}
          sortMode={sortMode}
          setSortMode={setSortMode}
          sentinelRef={sentinelRef}
          onStaffClick={onStaffRowClick}
          isPending={isPending}
          sectionTitleClass={sectionTitleClass}
          open={open}
          setOpen={setOpen}
          loginId={loginId}
          setLoginId={setLoginId}
          password={password}
          setPassword={setPassword}
          nickname={nickname}
          setNickname={setNickname}
          createAffiliation={createAffiliation}
          setCreateAffiliation={setCreateAffiliation}
          onCreate={onCreate}
          creating={creating}
        />
      )}

      {/* ------------------------- 미수 관리 탭 ------------------------- */}
      {tab === 'misu' && (
        <>
        <GlassCard className="overflow-hidden p-0">
          <div className="border-b border-white/10 bg-black/25 px-4 py-4 sm:px-5">
            <div className="text-lg font-bold tracking-tight text-white">미수</div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-white/55">
              <span className="tabular-nums">
                <span className="font-semibold text-white/90">{misuTotal.count}</span>건
              </span>
              <span className="text-white/30">·</span>
              <span className="tabular-nums font-semibold text-amber-200/90">{formatCurrency(misuTotal.sum)}원</span>
            </div>
            <p className="mt-2 text-xs leading-snug text-white/40">저장·정산 반영 시 자동으로 맞춰집니다.</p>
          </div>

          <div className="space-y-4 px-4 py-4 sm:px-5">
            {misuError && (
              <div className="rounded-2xl border border-red-400/35 bg-red-500/15 px-4 py-3 text-sm font-medium text-red-100">{misuError}</div>
            )}

            {misuLoading && (
              <div className="py-12 text-center text-base text-white/55">불러오는 중…</div>
            )}
            {!misuLoading && misuByDay.length === 0 && (
              <div className="py-12 text-center text-base text-white/55">미수 내역이 없습니다.</div>
            )}

            {!misuLoading &&
              misuByDay.map((day) => (
                <div
                  key={day.ymd}
                  className="rounded-2xl border border-white/12 bg-gradient-to-b from-white/[0.06] to-black/25 p-4 shadow-lg ring-1 ring-black/20"
                >
                  <div className="flex items-end justify-between gap-3 border-b border-white/10 pb-3">
                    <span className="text-xl font-bold tabular-nums text-white">{day.ymd}</span>
                    <div className="text-right text-sm text-white/55">
                      <span className="font-semibold tabular-nums text-white/85">{day.count}</span>건 ·{' '}
                      <span className="font-semibold tabular-nums text-amber-200/90">{formatCurrency(day.sum)}원</span>
                    </div>
                  </div>

                  <div className="mt-3 space-y-3">
                    {day.items.map((it) => (
                      <div
                        key={it.paymentId}
                        className="rounded-xl border border-white/10 bg-black/30 p-3.5 sm:p-4"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="text-base font-bold text-white">{it.staffNickname}</div>
                            <div className="text-sm font-medium text-white/75">
                              <span className="break-words">{it.storeName}</span>
                              <span className="tabular-nums text-white/50"> · {isoToHm(it.baseIso || it.createdAt)}</span>
                            </div>
                            <div className="text-xs text-white/40">{it.adminName ? `저장 ${it.adminName}` : '저장 —'}</div>
                            <div className="text-sm leading-relaxed text-white/65 break-words">{it.lineText}</div>
                          </div>
                          <div className="flex shrink-0 flex-col gap-2 sm:w-36 sm:items-end">
                            <div className="text-lg font-bold tabular-nums text-white sm:text-right">{formatCurrency(it.misuAmount)}원</div>
                            <button
                              type="button"
                              onClick={() => setMisuConfirmItem(it)}
                              className={cn(
                                'inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-emerald-400/35',
                                'bg-emerald-500/15 px-4 text-sm font-bold text-emerald-100 shadow-sm hover:bg-emerald-500/25 active:scale-[0.98] transition sm:w-full'
                              )}
                            >
                              <CheckCircle2 className="h-5 w-5 shrink-0" />
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

        {/* body 포털: 레이아웃 transform/filter와 무관하게 뷰포트에 고정 (목록 아래에 붙는 현상 방지) */}
        {misuConfirmItem &&
          typeof document !== 'undefined' &&
          createPortal(
            <div className="fixed inset-0 z-[200] overflow-y-auto">
              <button
                type="button"
                className="absolute inset-0 bg-black/65 backdrop-blur-sm"
                aria-label="닫기"
                onClick={() => !misuConfirmLoading && setMisuConfirmItem(null)}
              />
              <div className="relative z-[1] mx-auto flex min-h-[100dvh] w-full max-w-sm items-center justify-center p-4">
                <div className="w-full rounded-xl border border-white/12 bg-zinc-950 p-4 text-white shadow-2xl">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-base font-bold">정산 완료</div>
                      <p className="mt-1 text-xs text-white/50">미수 목록에서 제거합니다.</p>
                    </div>
                    <button
                      type="button"
                      disabled={misuConfirmLoading}
                      onClick={() => setMisuConfirmItem(null)}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 disabled:opacity-50"
                      aria-label="닫기"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="mt-3 truncate text-sm text-white/80" title={`${misuConfirmItem.staffNickname} · ${misuConfirmItem.storeName}`}>
                    {misuConfirmItem.staffNickname} · {misuConfirmItem.storeName}
                  </p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-emerald-300">{formatCurrency(misuConfirmItem.misuAmount)}원</p>
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      disabled={misuConfirmLoading}
                      onClick={() => setMisuConfirmItem(null)}
                      className="flex-1 min-h-11 rounded-lg border border-white/12 bg-white/5 text-sm font-semibold text-white/90 hover:bg-white/10 disabled:opacity-50"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      disabled={misuConfirmLoading}
                      onClick={() => void confirmMisuDone()}
                      className="flex-1 min-h-11 rounded-lg bg-emerald-500 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-60"
                    >
                      {misuConfirmLoading ? '처리 중…' : '완료'}
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )}
        </>
      )}

      {/* ------------------------- 정산 탭 (모바일·터치 우선) ------------------------- */}
      {tab === 'settle' && (
        <GlassCard className="overflow-hidden p-0">
          <div className="border-b border-white/10 bg-black/25 px-4 py-4 sm:px-5">
            <div className="min-w-0">
              <div className="text-lg font-bold tracking-tight text-white">정산</div>
              <div className="mt-1 text-xs leading-snug text-white/50">07:00 ~ 다음날 07:00 · 내역은 저장 시 자동 반영</div>
              {settleProfilesLoading && <div className="mt-1 text-[11px] text-amber-200/70">직원 계좌·상태 동기화 중…</div>}
            </div>

            <div className="mt-4 flex items-stretch gap-2">
              <button
                type="button"
                onClick={() => {
                  const prev = addDaysYmd(settleYmd, -1)
                  setSettleYmd(prev)
                  runSettlementDay(prev).catch(() => {})
                }}
                className="inline-flex min-h-[56px] min-w-[56px] shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white shadow-sm hover:bg-white/15 active:scale-[0.98] transition"
                aria-label="전날"
              >
                <ChevronLeft className="h-7 w-7" strokeWidth={2.5} />
              </button>

              <div className="flex min-h-[56px] flex-1 flex-col items-center justify-center rounded-2xl border border-white/12 bg-black/35 px-2 py-2">
                <span className="text-xl font-bold tabular-nums tracking-tight text-white">{settleYmd}</span>
                {settleYmd !== getKstDateString() && (
                  <button
                    type="button"
                    onClick={() => {
                      const t = getKstDateString()
                      setSettleYmd(t)
                      runSettlementDay(t).catch(() => {})
                    }}
                    className="mt-1 rounded-lg bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-200 ring-1 ring-emerald-400/30 active:scale-[0.98]"
                  >
                    오늘로
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  const next = addDaysYmd(settleYmd, +1)
                  setSettleYmd(next)
                  runSettlementDay(next).catch(() => {})
                }}
                className="inline-flex min-h-[56px] min-w-[56px] shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white shadow-sm hover:bg-white/15 active:scale-[0.98] transition"
                aria-label="다음날"
              >
                <ChevronRight className="h-7 w-7" strokeWidth={2.5} />
              </button>
            </div>
          </div>

          <div className="space-y-4 px-4 py-4 sm:px-5">
            {settleError && (
              <div className="rounded-2xl border border-red-400/35 bg-red-500/15 px-4 py-3 text-sm font-medium text-red-100">{settleError}</div>
            )}

            {settleLoading && (
              <div className="py-10 text-center text-base text-white/55">정산 내역 불러오는 중…</div>
            )}
            {!settleLoading && settleStaffBlocks.length === 0 && (
              <div className="py-10 text-center text-base text-white/55">해당 날짜에 내역이 없습니다.</div>
            )}

            {!settleLoading &&
              settleStaffBlocks.map((b) => {
                const dayMap = settleProfiles[b.staffId]?.settlement_day_status
                const proc = normalizeProcessKey(dayMap?.[settleYmd])
                return (
                  <div
                    key={b.staffId}
                    className="rounded-2xl border border-white/12 bg-gradient-to-b from-white/[0.07] to-black/25 p-4 shadow-lg ring-1 ring-black/20"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="text-xl font-bold text-white">{b.staffName}</span>
                          <span className="text-lg font-semibold tabular-nums text-amber-200/95">{b.staffUnit}</span>
                        </div>
                        <div className="mt-1.5 text-sm font-semibold tabular-nums text-white/60">{formatCurrency(b.adminPaySum)}원</div>
                      </div>
                      <button
                        type="button"
                        title="정산 계좌·메모"
                        onClick={() => openHeartForStaff(b.staffId, b.staffName)}
                        className="inline-flex min-h-[52px] min-w-[52px] shrink-0 items-center justify-center rounded-2xl border border-amber-400/35 bg-amber-500/10 text-amber-100 shadow-inner hover:bg-amber-500/20 active:scale-[0.97] transition"
                        aria-label="정산 계좌"
                      >
                        <Star className="h-6 w-6 fill-amber-400/35" strokeWidth={1.75} />
                      </button>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {SETTLE_PROCESS_OPTIONS.map((key) => {
                        const active = proc === key
                        return (
                          <button
                            key={key}
                            type="button"
                            className={cn(
                              'min-h-[52px] rounded-xl border px-1.5 py-2 text-center text-[11px] font-bold leading-tight transition sm:text-xs',
                              active
                                ? 'border-emerald-400/55 bg-emerald-500/25 text-emerald-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]'
                                : 'border-white/12 bg-white/5 text-white/80 hover:bg-white/10 active:scale-[0.98]'
                            )}
                            onClick={() => {
                              persistProcessStatus(b.staffId, settleYmd, key).catch((err) =>
                                setSettleError((err as Error)?.message ?? '처리 상태 저장 실패')
                              )
                            }}
                          >
                            {SETTLE_PROCESS_LABEL[key]}
                          </button>
                        )
                      })}
                    </div>

                    <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-black/30">
                      {b.lines.map((ln, idx) => (
                        <div
                          key={ln.id}
                          className={cn('px-3 py-3.5 sm:px-4 sm:py-4', idx > 0 && 'border-t border-white/8')}
                        >
                          <div className="text-base font-semibold leading-snug text-white">
                            <span className="break-words">{ln.storeName}</span>{' '}
                            <span className="tabular-nums text-white/75">{ln.timeHm}</span>
                          </div>
                          <div className="mt-2 text-sm leading-relaxed text-white/70 break-words">{ln.seq}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
          </div>

          {/* 별: 정산 계좌 (실시간 저장) */}
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
                      className="inline-flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-2xl border border-white/12 bg-white/10 text-white/90 hover:bg-white/15 active:scale-[0.98] transition"
                      aria-label="닫기"
                    >
                      <X className="h-6 w-6" />
                    </button>
                  </div>

                  <div className="mt-5 space-y-4">
                    <div>
                      <label className="text-base font-semibold text-white/85">은행명</label>
                      <input
                        className="mt-2 min-h-[52px] w-full rounded-xl border border-white/12 bg-zinc-900 px-4 py-3 text-base text-white outline-none placeholder:text-white/30 focus:border-white/25"
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
                      <label className="text-base font-semibold text-white/85">예금주</label>
                      <input
                        className="mt-2 min-h-[52px] w-full rounded-xl border border-white/12 bg-zinc-900 px-4 py-3 text-base text-white outline-none placeholder:text-white/30 focus:border-white/25"
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
                      <label className="text-base font-semibold text-white/85">계좌번호</label>
                      <input
                        className="mt-2 min-h-[52px] w-full rounded-xl border border-white/12 bg-zinc-900 px-4 py-3 text-base text-white outline-none placeholder:text-white/30 focus:border-white/25"
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
                      <label className="text-base font-semibold text-white/85">메모</label>
                      <textarea
                        className="mt-2 min-h-[160px] w-full rounded-xl border border-white/12 bg-zinc-900 px-4 py-4 text-base text-white leading-relaxed outline-none placeholder:text-white/30 focus:border-white/25 resize-y"
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