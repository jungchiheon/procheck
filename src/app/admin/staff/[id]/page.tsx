// src/app/admin/staff/[id]/page.tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabaseClient'
import { GlassCard } from '@/components/ui/GlassCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { ProButton } from '@/components/ui/ProButton'
import { cn } from '@/lib/cn'
import { Star, Save, Trash2, ChevronLeft, ChevronRight, X } from 'lucide-react'

type Staff = {
  id: string
  login_id: string
  nickname: string
  role: 'admin' | 'staff'
  is_active: boolean
  last_checkin_at: string | null
  last_checkout_at: string | null
  bank_name: string | null
  bank_account: string | null
  bank_holder: string | null
}

type StoreRow = { id: number; name: string; is_active: boolean }

type PaymentRow = {
  amount: number | null
  memo: string | null
  method: string | null
  paid_at: string | null
}

type WorkLogRow = {
  id: number
  work_at: string
  minutes: number
  option_heart: boolean
  option_at: boolean
  stores?: { name: string } | null
  staff_payment_logs?: PaymentRow[] | null
}

/* -------------------------
   정산 룰
------------------------- */

// ✅ 1열(J) / 2열(룸) 각각 1개씩 동시 선택
type JSvcKey = 'NONE' | 'J_HALF' | 'J_ONE' | 'J_ONE_HALF' | 'J_TWO'
type RSvcKey = 'NONE' | 'RT_HALF' | 'RT_ONE'

const J_SVC: Record<
  Exclude<JSvcKey, 'NONE'>,
  { label: string; minutes: number; store: number; staff: number; admin: number }
> = {
  J_HALF: { label: '반개', minutes: 30, store: 20000, staff: 15000, admin: 5000 },
  J_ONE: { label: '1개', minutes: 60, store: 40000, staff: 33000, admin: 7000 },
  J_ONE_HALF: { label: '1개반', minutes: 90, store: 60000, staff: 48000, admin: 12000 },
  J_TWO: { label: '2개', minutes: 120, store: 80000, staff: 66000, admin: 14000 },
}

const R_SVC: Record<
  Exclude<RSvcKey, 'NONE'>,
  { label: string; minutes: number; store: number; staff: number; admin: number }
> = {
  RT_HALF: { label: '룸반개', minutes: 30, store: 30000, staff: 25000, admin: 5000 },
  RT_ONE: { label: '룸1개', minutes: 60, store: 60000, staff: 50000, admin: 10000 },
}

// ♡ / @ 는 “추가 옵션”(중복 가능)
const ADDON_HEART = { label: '♡', store: 100000, staff: 90000, admin: 10000 }
const ADDON_AT = { label: '@', store: 200000, staff: 180000, admin: 20000 }

type MemoV1 = {
  v: 1
  baseSvc: string
  baseLabel: string
  staffBase: number
  adminBase: number
  staffAdd: number
  adminAdd: number
  tip: number
  cash: boolean
  misu: boolean
  heart: boolean
  at: boolean
  staffPay: number
  adminPay: number
  storeTotal: number
}

// ✅ 신규: J/룸 동시 선택 + 미수금액
type MemoV2 = {
  v: 2
  jSvc: Exclude<JSvcKey, 'NONE'> | null
  rSvc: Exclude<RSvcKey, 'NONE'> | null
  baseLabel: string
  baseMinutes: number
  staffBase: number
  adminBase: number
  staffAdd: number
  adminAdd: number
  tip: number
  cash: boolean
  misu: boolean
  misuAmount: number
  heart: boolean
  at: boolean
  staffPay: number
  adminPay: number
  storeTotal: number
}

/* -------------------------
   페이지
------------------------- */

export default function AdminStaffDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const staffId = params.id

  const [staffLoading, setStaffLoading] = useState(true)
  const [storesLoading, setStoresLoading] = useState(true)
  const [logsLoading, setLogsLoading] = useState(true)

  const [staff, setStaff] = useState<Staff | null>(null)
  const [stores, setStores] = useState<StoreRow[]>([])
  const [workLogs, setWorkLogs] = useState<WorkLogRow[]>([])

  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // ✅ 내역 범위 기준일(07:00~다음날07:00)
  const [selectedYmd, setSelectedYmd] = useState(getKstDateString())
  const lastNowYmdRef = useRef(getKstDateString())

  // 입력
  const [storeQuery, setStoreQuery] = useState('')
  const [selectedStoreId, setSelectedStoreId] = useState<number | ''>('')
  const [storeDropdownOpen, setStoreDropdownOpen] = useState(false)

  const [workTime, setWorkTime] = useState(getTimeHHMM())

  // ✅ 1열/2열 서비스 분리
  const [jSvc, setJSvc] = useState<JSvcKey>('NONE')
  const [rSvc, setRSvc] = useState<RSvcKey>('NONE')

  const [optionHeart, setOptionHeart] = useState(false)
  const [optionAt, setOptionAt] = useState(false)

  const [cash, setCash] = useState(false)
  const [misu, setMisu] = useState(false)

  const [tip, setTip] = useState<number>(0) // ✅ 기본 0원
  const [misuAmount, setMisuAmount] = useState<number>(0) // ✅ 미수금액(기본 0원)

  const [saving, setSaving] = useState(false)

  // ★ 계좌 모달
  const [bankOpen, setBankOpen] = useState(false)
  const [bankName, setBankName] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [bankHolder, setBankHolder] = useState('')
  const [bankSaving, setBankSaving] = useState(false)

  // 내역 상세 팝업
  const [detailOpen, setDetailOpen] = useState(false)
  const [detail, setDetail] = useState<DerivedLog | null>(null)
  const [deleting, setDeleting] = useState(false)

  // ✅ 정산 팝업
  const [settleOpen, setSettleOpen] = useState(false)
  const [settleStartYmd, setSettleStartYmd] = useState(getKstDateString())
  const [settleEndYmd, setSettleEndYmd] = useState(getKstDateString())
  const [settleLoading, setSettleLoading] = useState(false)
  const [settleError, setSettleError] = useState<string | null>(null)
  const [settleRows, setSettleRows] = useState<WorkLogRow[]>([])

  // ✅ 현금/미수는 동시에 ON 되지 않게
  const toggleCash = () => {
    setCash((prev) => {
      const next = !prev
      if (next) setMisu(false)
      return next
    })
  }
  const toggleMisu = () => {
    setMisu((prev) => {
      const next = !prev
      if (next) setCash(false)
      return next
    })
  }

  // 금액 계산(요약) - J + R 합산 + 옵션 + 팁 (미수금액은 별도 기록)
  const calc = useMemo(() => {
    const j = jSvc !== 'NONE' ? J_SVC[jSvc] : null
    const r = rSvc !== 'NONE' ? R_SVC[rSvc] : null

    const baseMinutes = (j?.minutes ?? 0) + (r?.minutes ?? 0)
    const baseStore = (j?.store ?? 0) + (r?.store ?? 0)
    const baseStaff = (j?.staff ?? 0) + (r?.staff ?? 0)
    const baseAdmin = (j?.admin ?? 0) + (r?.admin ?? 0)

    const addStaff = (optionHeart ? ADDON_HEART.staff : 0) + (optionAt ? ADDON_AT.staff : 0)
    const addAdmin = (optionHeart ? ADDON_HEART.admin : 0) + (optionAt ? ADDON_AT.admin : 0)
    const addStore = (optionHeart ? ADDON_HEART.store : 0) + (optionAt ? ADDON_AT.store : 0)

    const safeTip = Math.max(0, Number(tip || 0))
    const safeMisuAmount = Math.max(0, Number(misuAmount || 0))

    const staffPay = baseStaff + addStaff + safeTip
    const adminPay = baseAdmin + addAdmin
    const storeTotal = baseStore + addStore

    const labels = [j?.label, r?.label].filter(Boolean) as string[]
    const baseLabel = labels.length ? labels.join(' + ') : '-'

    return {
      j,
      r,
      baseLabel,
      minutes: baseMinutes,
      staffBase: baseStaff,
      adminBase: baseAdmin,
      storeBase: baseStore,
      staffAdd: addStaff,
      adminAdd: addAdmin,
      storeAdd: addStore,
      tip: safeTip,
      misuAmount: safeMisuAmount,
      staffPay,
      adminPay,
      storeTotal,
    }
  }, [jSvc, rSvc, optionHeart, optionAt, tip, misuAmount])

  // 가게 필터(초성)
  const filteredStores = useMemo(() => {
    const q = storeQuery.trim()
    const active = stores.filter((s) => s.is_active)
    if (!q) return active

    if (isChosungString(q)) {
      const qSeq = q
      return active
        .filter((s) => getChosungSeq(s.name).includes(qSeq))
        .sort((a, b) => {
          const aSeq = getChosungSeq(a.name)
          const bSeq = getChosungSeq(b.name)
          const aStarts = aSeq.startsWith(qSeq) ? 0 : 1
          const bStarts = bSeq.startsWith(qSeq) ? 0 : 1
          if (aStarts !== bStarts) return aStarts - bStarts
          return a.name.localeCompare(b.name, 'ko')
        })
    }

    const qLower = q.toLowerCase()
    return active
      .filter((s) => s.name.toLowerCase().includes(qLower))
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(qLower) ? 0 : 1
        const bStarts = b.name.toLowerCase().startsWith(qLower) ? 0 : 1
        if (aStarts !== bStarts) return aStarts - bStarts
        return a.name.localeCompare(b.name, 'ko')
      })
  }, [stores, storeQuery])

  // stores 캐시 로드
  const loadStoresFast = async (): Promise<StoreRow[]> => {
    const key = 'pc_stores_v1'
    const ttlMs = 10 * 60 * 1000

    try {
      const cached = sessionStorage.getItem(key)
      if (cached) {
        const parsed = JSON.parse(cached)
        if (parsed?.ts && Array.isArray(parsed?.rows) && Date.now() - parsed.ts < ttlMs) {
          return parsed.rows as StoreRow[]
        }
      }
    } catch {
      // ignore
    }

    const { data, error } = await supabaseClient.from('stores').select('id, name, is_active').order('name', { ascending: true })
    if (error) throw new Error(`stores 로드 실패: ${error.message}`)

    const rows = (data ?? []) as StoreRow[]
    try {
      sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), rows }))
    } catch {
      // ignore
    }
    return rows
  }

  // ✅ 근무 내역 로드(선택일 07:00~다음날07:00)
  const fetchWorkLogs = async (sid: string, ymd: string) => {
    const { startIso, endIso } = getKstDayRangeIso7(ymd)

    const { data, error } = await supabaseClient
      .from('staff_work_logs')
      .select(
        `
        id, work_at, minutes, option_heart, option_at,
        stores(name),
        staff_payment_logs(amount, memo, method, paid_at)
      `
      )
      .eq('staff_id', sid)
      .gte('work_at', startIso)
      .lt('work_at', endIso)
      .order('work_at', { ascending: true })

    if (error) throw new Error(`work_logs 로드 실패: ${error.message}`)

    const rows = normalizeWorkLogs(data)
    setWorkLogs(rows)
  }

  // ✅ 정산 조회(기간 07:00 기준, 페이지네이션)
  const fetchSettlementRange = async (sid: string, startYmd: string, endYmd: string) => {
    const { startIso, endIso } = getKstRangeIso7(startYmd, endYmd)

    const cacheKey = `pc_settle_${sid}_${startYmd}_${endYmd}_v1`
    const ttlMs = 30_000
    try {
      const raw = sessionStorage.getItem(cacheKey)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed?.ts && Array.isArray(parsed?.rows) && Date.now() - Number(parsed.ts) < ttlMs) {
          setSettleRows(parsed.rows as WorkLogRow[])
          return
        }
      }
    } catch {
      // ignore
    }

    const pageSize = 1000
    let from = 0
    const all: any[] = []

    while (true) {
      const { data, error } = await supabaseClient
        .from('staff_work_logs')
        .select(
          `
          id, work_at, minutes, option_heart, option_at,
          stores(name),
          staff_payment_logs(amount, memo, method, paid_at)
        `
        )
        .eq('staff_id', sid)
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

    const rows = normalizeWorkLogs(all)
    setSettleRows(rows)

    try {
      sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), rows }))
    } catch {
      // ignore
    }
  }

  const runSettlementFetch = async () => {
    if (!staff?.id) return
    setSettleError(null)
    setSettleLoading(true)
    try {
      if (!settleStartYmd || !settleEndYmd) throw new Error('기간을 선택하세요.')
      if (settleStartYmd > settleEndYmd) throw new Error('시작일이 종료일보다 늦습니다.')
      await fetchSettlementRange(staff.id, settleStartYmd, settleEndYmd)
    } catch (e: any) {
      setSettleError(e?.message ?? '정산 조회 오류')
    } finally {
      setSettleLoading(false)
    }
  }

  // ✅ 초기 로드: staff 먼저 → stores 비동기
  useEffect(() => {
    let alive = true

    ;(async () => {
      setStaffLoading(true)
      setStoresLoading(true)
      setError(null)
      setMessage(null)

      try {
        const { data: session } = await supabaseClient.auth.getSession()
        const token = session.session?.access_token
        if (!token) throw new Error('세션이 없습니다. 다시 로그인 해주세요.')

        const res = await fetch(`/api/admin/staff/${staffId}`, { headers: { Authorization: `Bearer ${token}` } })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.error || 'staff 조회 실패')

        const staffData = json.staff as Staff
        if (!alive) return

        setStaff(staffData)
        setBankName(staffData.bank_name ?? '')
        setBankAccount(staffData.bank_account ?? '')
        setBankHolder(staffData.bank_holder ?? '')

        const initYmd = staffData.last_checkin_at ? toKstDateStringAt7(staffData.last_checkin_at) : getKstDateString()
        lastNowYmdRef.current = getKstDateString()
        setSelectedYmd(initYmd)

        // 정산 기본기간도 오늘로
        setSettleStartYmd(initYmd)
        setSettleEndYmd(initYmd)

        setStaffLoading(false)

        loadStoresFast()
          .then((rows) => {
            if (!alive) return
            setStores(rows)
          })
          .catch((e: any) => alive && setError(e?.message ?? 'stores 로드 오류'))
          .finally(() => alive && setStoresLoading(false))
      } catch (e: any) {
        if (!alive) return
        setError(e?.message ?? '초기 로드 오류')
        setStaffLoading(false)
        setStoresLoading(false)
      }
    })()

    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffId])

  // ✅ 선택일 변경 시 내역 로드
  useEffect(() => {
    if (!staff?.id) return
    let alive = true

    setLogsLoading(true)
    setError(null)

    fetchWorkLogs(staff.id, selectedYmd)
      .catch((e: any) => alive && setError(e?.message ?? '내역 로드 오류'))
      .finally(() => alive && setLogsLoading(false))

    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff?.id, selectedYmd])

  // ✅ 자정 지나면 “오늘 기준일을 보고 있던 상태”면 날짜 보정
  useEffect(() => {
    const tick = () => {
      const nowYmd = getKstDateString()
      if (nowYmd === lastNowYmdRef.current) return
      if (selectedYmd === lastNowYmdRef.current) setSelectedYmd(nowYmd)
      lastNowYmdRef.current = nowYmd
    }
    const id = window.setInterval(tick, 30_000)
    return () => window.clearInterval(id)
  }, [selectedYmd])

  const onPickStore = (s: StoreRow) => {
    setSelectedStoreId(s.id)
    setStoreQuery(s.name)
    setStoreDropdownOpen(false)
  }

  const moveDay = (delta: number) => setSelectedYmd((prev) => addDaysYmd(prev, delta))

  const bumpTip = (delta: number) => setTip((t) => Math.max(0, Number(t || 0) + delta))
  const bumpMisu = (delta: number) => setMisuAmount((m) => Math.max(0, Number(m || 0) + delta))

  const resetTip = () => setTip(0)
  const resetMisuAmount = () => setMisuAmount(0)

  const resetServices = () => {
    setJSvc('NONE')
    setRSvc('NONE')
  }

  // ✅ “모두 초기화”
  const resetAll = () => {
    setMessage(null)
    setError(null)

    // 입력 전부
    setStoreQuery('')
    setSelectedStoreId('')
    setStoreDropdownOpen(false)
    setWorkTime(getTimeHHMM())

    // 서비스/옵션/결제
    resetServices()
    setOptionHeart(false)
    setOptionAt(false)
    setCash(false)
    setMisu(false)

    // 금액
    setTip(0)
    setMisuAmount(0)
  }

  const onSave = async () => {
    setError(null)
    setMessage(null)
    if (!staff) return

    if (!selectedStoreId) return setError('가게를 선택하세요.')
    if (!workTime) return setError('시작 시각을 선택하세요.')

    if (jSvc === 'NONE' && rSvc === 'NONE') {
      return setError('1열(J) 또는 2열(룸)에서 최소 1개는 선택하세요.')
    }

    if (!calc.minutes || calc.minutes <= 0) return setError('근무 시간이 0분입니다.')

    setSaving(true)
    try {
      const workAtIso = computeWorkAtIso7({ baseDayYmd: selectedYmd, timeHm: workTime })
      const nowIso = new Date().toISOString()

      const { data: wData, error: wErr } = await supabaseClient
        .from('staff_work_logs')
        .insert({
          staff_id: staff.id,
          store_id: selectedStoreId,
          work_at: workAtIso,
          minutes: calc.minutes,
          option_heart: optionHeart,
          option_at: optionAt,
        })
        .select('id')
        .single()

      if (wErr) throw new Error(`근무 저장 실패: ${wErr.message}`)
      const workLogId = Number(wData?.id)
      if (!workLogId) throw new Error('workLogId missing')

      const memoObj: MemoV2 = {
        v: 2,
        jSvc: jSvc === 'NONE' ? null : (jSvc as Exclude<JSvcKey, 'NONE'>),
        rSvc: rSvc === 'NONE' ? null : (rSvc as Exclude<RSvcKey, 'NONE'>),
        baseLabel: calc.baseLabel,
        baseMinutes: calc.minutes,
        staffBase: calc.staffBase,
        adminBase: calc.adminBase,
        staffAdd: calc.staffAdd,
        adminAdd: calc.adminAdd,
        tip: calc.tip,
        cash,
        misu,
        misuAmount: calc.misuAmount,
        heart: optionHeart,
        at: optionAt,
        staffPay: calc.staffPay,
        adminPay: calc.adminPay,
        storeTotal: calc.storeTotal,
      }

      const { error: pErr } = await supabaseClient.from('staff_payment_logs').insert({
        staff_id: staff.id,
        work_log_id: workLogId,
        amount: calc.staffPay,
        method: 'cash',
        paid_at: nowIso,
        memo: JSON.stringify(memoObj),
      })
      if (pErr) throw new Error(`정산 저장 실패: ${pErr.message}`)

      setMessage('저장되었습니다.')

      setLogsLoading(true)
      await fetchWorkLogs(staff.id, selectedYmd)
      setLogsLoading(false)

      // 저장 후: 금액/상태/옵션은 기본 복귀
      setTip(0)
      setMisuAmount(0)
      setCash(false)
      setMisu(false)
      setOptionHeart(false)
      setOptionAt(false)
    } catch (e: any) {
      setError(e?.message ?? '저장 오류')
    } finally {
      setSaving(false)
    }
  }

  const openDetail = (d: DerivedLog) => {
    setDetail(d)
    setDetailOpen(true)
  }

  const onDelete = async (logId: number) => {
    if (!staff) return
    const ok = window.confirm('이 내역을 삭제할까요?')
    if (!ok) return

    setDeleting(true)
    setError(null)
    setMessage(null)

    try {
      await supabaseClient.from('staff_payment_logs').delete().eq('work_log_id', logId)

      const { data: deletedRows, error: dErr } = await supabaseClient.from('staff_work_logs').delete().eq('id', logId).select('id')
      if (dErr) throw new Error(`삭제 실패: ${dErr.message}`)
      if (!deletedRows || deletedRows.length === 0) throw new Error('삭제 권한이 없거나, 이미 삭제된 항목입니다(RLS 가능성).')

      setDetailOpen(false)
      setDetail(null)
      setMessage('삭제되었습니다.')

      setLogsLoading(true)
      await fetchWorkLogs(staff.id, selectedYmd)
      setLogsLoading(false)
    } catch (e: any) {
      setError(e?.message ?? '삭제 오류')
    } finally {
      setDeleting(false)
    }
  }

  const onSaveBank = async () => {
    if (!staff) return
    setError(null)
    setMessage(null)
    setBankSaving(true)

    try {
      const { error } = await supabaseClient
        .from('user_profiles')
        .update({
          bank_name: bankName.trim() || null,
          bank_account: bankAccount.trim() || null,
          bank_holder: bankHolder.trim() || null,
        })
        .eq('id', staff.id)

      if (error) throw new Error(`계좌 저장 실패: ${error.message}`)

      setStaff({
        ...staff,
        bank_name: bankName.trim() || null,
        bank_account: bankAccount.trim() || null,
        bank_holder: bankHolder.trim() || null,
      })

      setMessage('저장되었습니다.')
      setBankOpen(false)
    } catch (e: any) {
      setError(e?.message ?? '계좌 저장 오류')
    } finally {
      setBankSaving(false)
    }
  }

  const onLogout = async () => {
    await supabaseClient.auth.signOut()
    router.replace('/login')
  }

  // ✅ 내역(표시용) : 시간 → 가게 정렬, 클릭 시 팝업
  const derivedLogs = useMemo(() => {
    const list = workLogs
      .map((w) => deriveLog(w))
      .filter((x): x is DerivedLog => Boolean(x))
      .sort((a, b) => {
        const at = new Date(a.work_at).getTime()
        const bt = new Date(b.work_at).getTime()
        if (at !== bt) return at - bt
        return a.storeName.localeCompare(b.storeName, 'ko')
      })
    return list
  }, [workLogs])

  const totalStaffPay = useMemo(() => derivedLogs.reduce((sum, r) => sum + (r.staffPay || 0), 0), [derivedLogs])
  const totalAdminPay = useMemo(() => derivedLogs.reduce((sum, r) => sum + (r.adminPay || 0), 0), [derivedLogs])

  // ✅ 정산 팝업용 derived + 일별 그룹
  const settleDerived = useMemo(() => {
    return settleRows
      .map((w) => deriveLog(w))
      .filter((x): x is DerivedLog => Boolean(x))
      .sort((a, b) => new Date(a.work_at).getTime() - new Date(b.work_at).getTime())
  }, [settleRows])

  const settleDays = useMemo(() => {
    const map = new Map<string, DerivedLog[]>()
    for (const d of settleDerived) {
      const ymd = toKstDateStringAt7(d.work_at)
      const arr = map.get(ymd) ?? []
      arr.push(d)
      map.set(ymd, arr)
    }

    const days = Array.from(map.entries())
      .map(([ymd, items]) => {
        const staffSum = items.reduce((s, x) => s + (x.staffPay || 0), 0)
        const adminSum = items.reduce((s, x) => s + (x.adminPay || 0), 0)
        const tipSum = items.reduce((s, x) => s + (x.tip || 0), 0)
        const misuSum = items.reduce((s, x) => s + (x.misuAmount || 0), 0)
        const storeSum = items.reduce((s, x) => s + (x.storeTotal || 0), 0)
        const minutesSum = items.reduce((s, x) => s + (x.minutes || 0), 0)

        // “언제/어디서/무슨일”을 보기 좋게: 시간→가게
        items.sort((a, b) => {
          const at = new Date(a.work_at).getTime()
          const bt = new Date(b.work_at).getTime()
          if (at !== bt) return at - bt
          return a.storeName.localeCompare(b.storeName, 'ko')
        })

        return { ymd, items, staffSum, adminSum, tipSum, misuSum, storeSum, minutesSum }
      })
      .sort((a, b) => (a.ymd < b.ymd ? 1 : -1)) // 최신일 위

    return days
  }, [settleDerived])

  const settleTotal = useMemo(() => {
    const staffSum = settleDerived.reduce((s, x) => s + (x.staffPay || 0), 0)
    const adminSum = settleDerived.reduce((s, x) => s + (x.adminPay || 0), 0)
    const tipSum = settleDerived.reduce((s, x) => s + (x.tip || 0), 0)
    const misuSum = settleDerived.reduce((s, x) => s + (x.misuAmount || 0), 0)
    const storeSum = settleDerived.reduce((s, x) => s + (x.storeTotal || 0), 0)
    const minutesSum = settleDerived.reduce((s, x) => s + (x.minutes || 0), 0)
    return { staffSum, adminSum, tipSum, misuSum, storeSum, minutesSum, count: settleDerived.length }
  }, [settleDerived])

  if (staffLoading) return <div className="text-sm text-white/60">Loading...</div>

  if (!staff) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="직원 상세"
          backHref="/admin/staff"
          right={
            <ProButton variant="ghost" onClick={onLogout}>
              로그아웃
            </ProButton>
          }
        />
        <GlassCard className="p-6">
          <div className="text-white/80">직원 정보를 불러오지 못했습니다.</div>
          {error && <div className="mt-3 text-sm text-red-200">{error}</div>}
        </GlassCard>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={staff.nickname}
        subtitle={staff.login_id}
        backHref="/admin/staff"
        right={
          <div className="flex items-center gap-2">
            {/* ✅ 별표 왼쪽: 정산 버튼 */}
            <button
              onClick={() => {
                setSettleOpen(true)
                setSettleError(null)
                // 기본 기간: 현재 보고 있는 selectedYmd로 맞춤
                setSettleStartYmd(selectedYmd)
                setSettleEndYmd(selectedYmd)
                setSettleRows([])
              }}
              className={cn(
                'inline-flex items-center justify-center',
                'h-10 px-3 rounded-xl border border-white/12 bg-white/5',
                'text-sm font-semibold text-white/85 hover:bg-white/10 transition'
              )}
              type="button"
            >
              정산
            </button>

            <button
              onClick={() => setBankOpen(true)}
              className={cn(
                'inline-flex items-center justify-center',
                'h-10 w-10 rounded-xl border border-white/12 bg-white/5',
                'text-white/85 hover:bg-white/10 transition'
              )}
              type="button"
              aria-label="계좌"
              title="계좌"
            >
              <Star className="h-5 w-5" />
            </button>

            <ProButton variant="ghost" onClick={onLogout}>
              로그아웃
            </ProButton>
          </div>
        }
      />

      {/* ✅ 카드 1: (가게 선택 + 시작시각) 한 줄 + (5x4 버튼) + 요약 + 저장 */}
      <GlassCard className="p-5">
        {/* ✅ 한 줄(나란히) */}
        <div className="grid grid-cols-2 gap-3">
          {/* 가게 선택 */}
          <div>
            <label className="text-sm font-medium text-white/80">가게 선택</label>
            <div className="relative mt-2">
              <input
                disabled={storesLoading}
                className={cn(
                  'w-full rounded-xl border border-white/12 bg-black/20 px-3 py-2.5 text-white outline-none placeholder:text-white/30 focus:border-white/25',
                  storesLoading && 'opacity-70 cursor-not-allowed'
                )}
                value={storeQuery}
                onChange={(e) => {
                  setStoreQuery(e.target.value)
                  setStoreDropdownOpen(true)
                  setSelectedStoreId('')
                }}
                onFocus={() => {
                  if (!storesLoading) setStoreDropdownOpen(true)
                }}
                onBlur={() => {
                  window.setTimeout(() => setStoreDropdownOpen(false), 120)
                }}
                placeholder={storesLoading ? '가게 목록 불러오는 중...' : '예: ㄱㄴ / ㅂㄴㄴ / 강남'}
                autoComplete="off"
              />

              {!storesLoading && storeDropdownOpen && filteredStores.length > 0 && (
                <div
                  className={cn(
                    'absolute z-20 mt-2 w-full overflow-hidden rounded-2xl',
                    'border border-white/12 bg-zinc-950/95 backdrop-blur-xl shadow-2xl'
                  )}
                >
                  <div className="max-h-60 overflow-y-auto py-1">
                    {filteredStores.map((s) => (
                      <button
                        key={s.id}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => onPickStore(s)}
                        className="w-full text-left px-4 py-3 hover:bg-white/10 transition"
                        type="button"
                      >
                        <div className="text-sm font-semibold text-white">{s.name}</div>
                        <div className="mt-0.5 text-xs text-white/35">ID: {s.id}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {storesLoading && <div className="mt-2 text-xs text-white/45">가게 목록을 불러오는 중입니다…</div>}
          </div>

          {/* 시작 시각 */}
          <div>
            <label className="text-sm font-medium text-white/80">시작 시각</label>
            <input
              type="time"
              className="mt-2 w-full rounded-xl border border-white/12 bg-black/20 px-3 py-2.5 text-white outline-none focus:border-white/25"
              value={workTime}
              onChange={(e) => setWorkTime(e.target.value)}
            />
          </div>
        </div>

        {/* ✅ 5행 4열 버튼 */}
        <div className="mt-4">
          <div className="grid grid-cols-4 gap-2">
            {/* row 1 */}
            <GridButton active={jSvc === 'J_HALF'} onClick={() => setJSvc((p) => (p === 'J_HALF' ? 'NONE' : 'J_HALF'))}>
              반개
            </GridButton>
            <GridButton active={rSvc === 'RT_HALF'} onClick={() => setRSvc((p) => (p === 'RT_HALF' ? 'NONE' : 'RT_HALF'))}>
              룸반개
            </GridButton>
            <GridButton onClick={() => bumpTip(10000)}>팁 +10,000</GridButton>
            <GridButton onClick={() => bumpMisu(10000)}>미수 +10,000</GridButton>

            {/* row 2 */}
            <GridButton active={jSvc === 'J_ONE'} onClick={() => setJSvc((p) => (p === 'J_ONE' ? 'NONE' : 'J_ONE'))}>
              1개
            </GridButton>
            <GridButton active={rSvc === 'RT_ONE'} onClick={() => setRSvc((p) => (p === 'RT_ONE' ? 'NONE' : 'RT_ONE'))}>
              룸1개
            </GridButton>
            <GridButton onClick={() => bumpTip(50000)}>팁 +50,000</GridButton>
            <GridButton onClick={() => bumpMisu(50000)}>미수 +50,000</GridButton>

            {/* row 3 */}
            <GridButton
              active={jSvc === 'J_ONE_HALF'}
              onClick={() => setJSvc((p) => (p === 'J_ONE_HALF' ? 'NONE' : 'J_ONE_HALF'))}
            >
              1개반
            </GridButton>
            <GridButton active={optionHeart} onClick={() => setOptionHeart((v) => !v)}>
              ♡
            </GridButton>
            <GridButton onClick={() => bumpTip(100000)}>팁 +100,000</GridButton>
            <GridButton onClick={() => bumpMisu(100000)}>미수 +100,000</GridButton>

            {/* row 4 */}
            <GridButton active={jSvc === 'J_TWO'} onClick={() => setJSvc((p) => (p === 'J_TWO' ? 'NONE' : 'J_TWO'))}>
              2개
            </GridButton>
            <GridButton active={optionAt} onClick={() => setOptionAt((v) => !v)}>
              @
            </GridButton>
            <GridButton onClick={resetTip}>팁초기화</GridButton>
            <GridButton onClick={resetMisuAmount}>미수초기화</GridButton>

            {/* row 5 */}
            <GridButton active={cash} onClick={toggleCash}>
              현금
            </GridButton>
            <GridButton active={misu} onClick={toggleMisu}>
              미수
            </GridButton>

            {/* ✅ 완전 공백 */}
            <div aria-hidden="true" />

            {/* ✅ “초기화”는 모두 초기화 */}
            <GridButton onClick={resetAll}>초기화</GridButton>
          </div>
        </div>

        {/* ✅ 정산 요약(우측에 팁/미수 직접입력 2개) */}
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm text-white/50">정산 요약</div>
              <div className="mt-1 text-white font-semibold">
                직원 {formatCurrency(calc.staffPay)}원 · 관리자 {formatCurrency(calc.adminPay)}원
              </div>

              <div className="mt-2 text-xs text-white/50 space-y-1">
                <div>
                  기본: {calc.baseLabel} {calc.minutes ? `(${calc.minutes}분)` : ''}
                </div>
                <div>
                  옵션: {optionHeart ? '♡ ' : ''}
                  {optionAt ? '@ ' : ''}
                  {!optionHeart && !optionAt ? '-' : ''}
                </div>
                <div>팁: {formatCurrency(calc.tip)}원</div>
                <div>미수금액: {formatCurrency(calc.misuAmount)}원</div>
                {(cash || misu) && (
                  <div>
                    상태: {cash ? '현금' : ''}
                    {cash && misu ? ' ' : ''}
                    {misu ? '미수' : ''}
                  </div>
                )}
              </div>
            </div>

            <div className="shrink-0 w-[160px] space-y-3">
              {/* 팁 직접입력 */}
              <div>
                <div className="text-xs text-white/55">팁 직접입력</div>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  className="mt-2 w-full rounded-xl border border-white/12 bg-black/20 px-3 py-2 text-white outline-none placeholder:text-white/30 focus:border-white/25"
                  value={Number.isFinite(tip) ? tip : 0}
                  onChange={(e) => setTip(Math.max(0, Number(e.target.value || 0)))}
                  placeholder="0"
                />
              </div>

              {/* 미수 직접입력 */}
              <div>
                <div className="text-xs text-white/55">미수 직접입력</div>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  className="mt-2 w-full rounded-xl border border-white/12 bg-black/20 px-3 py-2 text-white outline-none placeholder:text-white/30 focus:border-white/25"
                  value={Number.isFinite(misuAmount) ? misuAmount : 0}
                  onChange={(e) => setMisuAmount(Math.max(0, Number(e.target.value || 0)))}
                  placeholder="0"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 메시지/에러 */}
        {message && (
          <div className="mt-4 rounded-xl border border-emerald-300/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {message}
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div>
        )}

        {/* 저장 */}
        <div className="mt-4">
          <ProButton onClick={onSave} disabled={saving || storesLoading} className="w-full">
            <Save className="mr-2 h-4 w-4" />
            {saving ? '저장 중...' : '저장'}
          </ProButton>
        </div>
      </GlassCard>

      {/* ✅ 카드 2: 내역(팝업 상세보기) */}
      <GlassCard className="p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-white font-semibold tracking-tight">내역</div>
            <div className="mt-1 flex items-center gap-2">
              <button
                type="button"
                onClick={() => moveDay(-1)}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-white/12 bg-white/5 text-white/80 hover:bg-white/10 transition"
                aria-label="이전날"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div className="text-sm text-white/80">{selectedYmd}</div>

              <button
                type="button"
                onClick={() => moveDay(+1)}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-white/12 bg-white/5 text-white/80 hover:bg-white/10 transition"
                aria-label="다음날"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="text-xs text-white/60 text-right">
            <div>직원 합계 {formatCurrency(totalStaffPay)}원</div>
            <div>관리자 합계 {formatCurrency(totalAdminPay)}원</div>
          </div>
        </div>

        <div className="mt-4 divide-y divide-white/10">
          {logsLoading && <div className="py-6 text-sm text-white/60">내역 불러오는 중...</div>}

          {!logsLoading && derivedLogs.length === 0 && (
            <div className="py-6 text-sm text-white/60">해당 범위(07:00~다음날07:00)에 내역이 없습니다.</div>
          )}

          {!logsLoading &&
            derivedLogs.map((d) => (
              <div
                key={d.id}
                role="button"
                tabIndex={0}
                onClick={() => openDetail(d)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') openDetail(d)
                }}
                className={cn(
                  'py-3 px-2 rounded-xl cursor-pointer',
                  'hover:bg-white/5 transition',
                  'outline-none focus:ring-2 focus:ring-white/15'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-white font-semibold truncate">
                      {d.timeText} · {d.storeName}
                    </div>
                    <div className="mt-1 text-xs text-white/55">
                      {d.baseLabel}
                      {d.heart ? ' · ♡' : ''}
                      {d.at ? ' · @' : ''}
                      {d.misu ? (d.misuAmount > 0 ? ` · 미수(${formatCurrency(d.misuAmount)}원)` : ' · 미수') : ''}
                      {d.cash ? ' · 현금' : ''}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className="text-sm text-white/85 font-semibold">
                      {formatCurrency(d.staffPay)} / {formatCurrency(d.adminPay)}
                    </div>
                    {d.tip > 0 && <div className="mt-1 text-[11px] text-white/45">팁 {formatCurrency(d.tip)}원</div>}
                  </div>
                </div>
              </div>
            ))}
        </div>
      </GlassCard>

      {/* ✅ 상세 팝업 */}
      {detailOpen && detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <button
            className="absolute inset-0 bg-black/60"
            onClick={() => {
              setDetailOpen(false)
              setDetail(null)
            }}
            type="button"
            aria-label="닫기"
          />
          <div className="relative w-full max-w-md">
            <GlassCard className="p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-white text-lg font-semibold truncate">
                    {detail.timeText} · {detail.storeName}
                  </div>
                  <div className="mt-1 text-sm text-white/60">{detail.baseLabel}</div>
                </div>
                <button
                  onClick={() => {
                    setDetailOpen(false)
                    setDetail(null)
                  }}
                  className="rounded-xl border border-white/12 bg-white/5 p-2 text-white/80 hover:bg-white/10 transition"
                  type="button"
                  aria-label="닫기"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 space-y-2 text-sm">
                <RowKV k="직원 정산" v={`${formatCurrency(detail.staffPay)}원`} />
                <RowKV k="관리자 정산" v={`${formatCurrency(detail.adminPay)}원`} />
                {detail.tip > 0 && <RowKV k="팁" v={`${formatCurrency(detail.tip)}원`} />}
                {detail.misu && detail.misuAmount > 0 && <RowKV k="미수금액" v={`${formatCurrency(detail.misuAmount)}원`} />}
                <RowKV k="옵션" v={`${detail.heart ? '♡ ' : ''}${detail.at ? '@ ' : ''}`.trim() || '-'} />
                {(detail.cash || detail.misu) && (
                  <RowKV k="상태" v={`${detail.cash ? '현금' : ''}${detail.cash && detail.misu ? ' ' : ''}${detail.misu ? '미수' : ''}`} />
                )}
              </div>

              <div className="mt-5 flex gap-2">
                <ProButton
                  variant="ghost"
                  className="flex-1"
                  type="button"
                  onClick={() => {
                    setDetailOpen(false)
                    setDetail(null)
                  }}
                >
                  닫기
                </ProButton>

                <ProButton className="flex-1" type="button" onClick={() => onDelete(detail.id)} disabled={deleting}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  {deleting ? '삭제 중...' : '삭제'}
                </ProButton>
              </div>
            </GlassCard>
          </div>
        </div>
      )}

      {/* ✅ 정산 팝업 */}
      {settleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <button
            className="absolute inset-0 bg-black/60"
            onClick={() => {
              setSettleOpen(false)
            }}
            type="button"
            aria-label="닫기"
          />
          <div className="relative w-full max-w-3xl">
            <GlassCard className="p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-white text-lg font-semibold truncate">정산 · {staff.nickname}</div>
                  <div className="mt-1 text-sm text-white/55 truncate">
                    기준 : 07:00 ~ 다음날 07:00
                  </div>
                </div>

                <button
                  onClick={() => setSettleOpen(false)}
                  className="rounded-xl border border-white/12 bg-white/5 p-2 text-white/80 hover:bg-white/10 transition"
                  type="button"
                  aria-label="닫기"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* 기간 선택 */}
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-white/55">시작일</div>
                  <input
                    type="date"
                    className="mt-2 w-full rounded-xl border border-white/12 bg-black/20 px-3 py-2 text-white outline-none focus:border-white/25"
                    value={settleStartYmd}
                    onChange={(e) => setSettleStartYmd(e.target.value)}
                  />
                </div>
                <div>
                  <div className="text-xs text-white/55">종료일</div>
                  <input
                    type="date"
                    className="mt-2 w-full rounded-xl border border-white/12 bg-black/20 px-3 py-2 text-white outline-none focus:border-white/25"
                    value={settleEndYmd}
                    onChange={(e) => setSettleEndYmd(e.target.value)}
                  />
                </div>
              </div>

              {/* 빠른 선택 + 조회 */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const today = getKstDateString()
                    setSettleStartYmd(today)
                    setSettleEndYmd(today)
                  }}
                  className="rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10 transition"
                >
                  오늘
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const end = getKstDateString()
                    const start = addDaysYmd(end, -6)
                    setSettleStartYmd(start)
                    setSettleEndYmd(end)
                  }}
                  className="rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10 transition"
                >
                  최근 7일
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const end = getKstDateString()
                    const start = addDaysYmd(end, -29)
                    setSettleStartYmd(start)
                    setSettleEndYmd(end)
                  }}
                  className="rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10 transition"
                >
                  최근 30일
                </button>

                <div className="flex-1" />

                <ProButton type="button" onClick={runSettlementFetch} disabled={settleLoading}>
                  {settleLoading ? '조회 중...' : '조회'}
                </ProButton>
              </div>

              {settleError && (
                <div className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  {settleError}
                </div>
              )}

              {/* 합계 */}
              <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm text-white/50">기간 합계</div>
                <div className="mt-1 text-white font-semibold">
                  직원 {formatCurrency(settleTotal.staffSum)}원 · 관리자 {formatCurrency(settleTotal.adminSum)}원
                </div>
                <div className="mt-2 text-xs text-white/55 space-y-1">
                  <div>팁 합계 : {formatCurrency(settleTotal.tipSum)}원</div>
                  <div>미수 합계 : {formatCurrency(settleTotal.misuSum)}원</div>
                  <div>가게 합계 : {formatCurrency(settleTotal.storeSum)}원</div>
                  <div>총 시간 : {formatMinutes(settleTotal.minutesSum)} · 총 {settleTotal.count}건</div>
                </div>
              </div>

              {/* 일별 목록 */}
              <div className="mt-5 max-h-[55vh] overflow-y-auto pr-1">
                {settleLoading && <div className="py-6 text-sm text-white/60">정산 내역 불러오는 중...</div>}

                {!settleLoading && settleDays.length === 0 && (
                  <div className="py-6 text-sm text-white/60">조회 결과가 없습니다.</div>
                )}

                {!settleLoading &&
                  settleDays.map((day) => (
                    <div key={day.ymd} className="mb-4">
                      <div className="flex items-end justify-between gap-3">
                        <div className="text-white font-semibold">{day.ymd}</div>
                        <div className="text-xs text-white/60 text-right">
                        </div>
                      </div>

                      <div className="mt-2 divide-y divide-white/10 rounded-2xl border border-white/10 bg-black/10">
                        {day.items.map((d) => (
                          <div key={d.id} className="px-4 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm text-white font-semibold truncate">
                                  {d.timeText} · {d.storeName}
                                </div>
                                <div className="mt-1 text-xs text-white/55">
                                  {d.baseLabel}
                                  {d.heart ? ' · ♡' : ''}
                                  {d.at ? ' · @' : ''}
                                  {d.misu ? (d.misuAmount > 0 ? ` · 미수(${formatCurrency(d.misuAmount)}원)` : ' · 미수') : ''}
                                  {d.cash ? ' · 현금' : ''}
                                  {d.minutes ? ` · ${d.minutes}분` : ''}
                                </div>
                              </div>

                              <div className="shrink-0 text-right">
                                <div className="text-sm text-white/85 font-semibold">
                                  {formatCurrency(d.staffPay)} / {formatCurrency(d.adminPay)}
                                </div>
                                {d.tip > 0 && <div className="mt-1 text-[11px] text-white/45">팁 {formatCurrency(d.tip)}원</div>}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </GlassCard>
          </div>
        </div>
      )}

      {/* ★ 계좌 모달 */}
      {bankOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <button className="absolute inset-0 bg-black/60" onClick={() => setBankOpen(false)} aria-label="닫기" />
          <div className="relative w-full max-w-md">
            <GlassCard className="p-6">
              <div className="text-white text-lg font-semibold">★ 정산용 계좌</div>
              <div className="mt-1 text-sm text-white/55">직원 계좌 정보를 저장합니다.</div>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="text-sm font-medium text-white/80">은행명</label>
                  <input
                    className="mt-2 w-full rounded-xl border border-white/12 bg-black/20 px-3 py-2.5 text-white outline-none placeholder:text-white/30 focus:border-white/25"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="예: 국민은행"
                    autoComplete="off"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-white/80">계좌번호</label>
                  <input
                    className="mt-2 w-full rounded-xl border border-white/12 bg-black/20 px-3 py-2.5 text-white outline-none placeholder:text-white/30 focus:border-white/25"
                    value={bankAccount}
                    onChange={(e) => setBankAccount(e.target.value)}
                    placeholder="예: 123-456-7890"
                    autoComplete="off"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-white/80">예금주</label>
                  <input
                    className="mt-2 w-full rounded-xl border border-white/12 bg-black/20 px-3 py-2.5 text-white outline-none placeholder:text-white/30 focus:border-white/25"
                    value={bankHolder}
                    onChange={(e) => setBankHolder(e.target.value)}
                    placeholder="예: 홍길동"
                    autoComplete="off"
                  />
                </div>

                <div className="pt-2 flex gap-2">
                  <ProButton
                    variant="ghost"
                    className="flex-1"
                    type="button"
                    onClick={() => setBankOpen(false)}
                    disabled={bankSaving}
                  >
                    닫기
                  </ProButton>
                  <ProButton className="flex-1" type="button" onClick={onSaveBank} disabled={bankSaving}>
                    {bankSaving ? '저장 중...' : '저장하기'}
                  </ProButton>
                </div>
              </div>
            </GlassCard>
          </div>
        </div>
      )}
    </div>
  )
}

/* -------------------------
   UI helpers
------------------------- */

function GridButton({
  active,
  onClick,
  children,
}: {
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-xl border px-3 py-2.5 text-sm font-semibold transition',
        active ? 'bg-white text-zinc-900 border-white/0' : 'bg-white/5 text-white/85 border-white/12 hover:bg-white/10'
      )}
      type="button"
    >
      {children}
    </button>
  )
}

function RowKV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-white/60">{k}</div>
      <div className="text-white font-semibold">{v}</div>
    </div>
  )
}

/* -------------------------
   WorkLogs normalization
------------------------- */

function normalizeWorkLogs(data: unknown): WorkLogRow[] {
  const arr = Array.isArray(data) ? data : []
  const rows: WorkLogRow[] = arr
    .map((r: any) => {
      const payments: PaymentRow[] | null = Array.isArray(r?.staff_payment_logs)
        ? r.staff_payment_logs.map((p: any) => ({
            amount: p?.amount == null ? null : Number(p.amount),
            memo: p?.memo ?? null,
            method: p?.method ?? null,
            paid_at: p?.paid_at ?? null,
          }))
        : null

      const row: WorkLogRow = {
        id: Number(r?.id),
        work_at: String(r?.work_at ?? ''),
        minutes: Number(r?.minutes ?? 0),
        option_heart: Boolean(r?.option_heart),
        option_at: Boolean(r?.option_at),
        stores: r?.stores?.name ? { name: String(r.stores.name) } : null,
        staff_payment_logs: payments,
      }

      if (!row.id || !row.work_at) return null
      return row
    })
    .filter((x): x is WorkLogRow => Boolean(x))

  return rows
}

/* -------------------------
   Derived log (팝업/정산용)
------------------------- */

type DerivedLog = {
  id: number
  work_at: string
  timeText: string
  storeName: string
  baseLabel: string
  minutes: number
  storeTotal: number
  staffPay: number
  adminPay: number
  tip: number
  cash: boolean
  misu: boolean
  misuAmount: number
  heart: boolean
  at: boolean
}

function deriveLog(w: WorkLogRow): DerivedLog | null {
  const timeText = toKstTime(new Date(w.work_at))
  const storeName = w.stores?.name ?? '가게 미지정'

  const pay = Array.isArray(w.staff_payment_logs) ? w.staff_payment_logs[0] : null
  const memo = parseMemo(pay?.memo ?? null)

  if (memo && memo.v === 2) {
    return {
      id: w.id,
      work_at: w.work_at,
      timeText,
      storeName,
      baseLabel: memo.baseLabel,
      minutes: Number(memo.baseMinutes || w.minutes || 0),
      storeTotal: Number(memo.storeTotal || 0),
      staffPay: Number(memo.staffPay || 0),
      adminPay: Number(memo.adminPay || 0),
      tip: Number(memo.tip || 0),
      cash: Boolean(memo.cash),
      misu: Boolean(memo.misu),
      misuAmount: Number(memo.misuAmount || 0),
      heart: Boolean(memo.heart),
      at: Boolean(memo.at),
    }
  }

  if (memo && memo.v === 1) {
    return {
      id: w.id,
      work_at: w.work_at,
      timeText,
      storeName,
      baseLabel: memo.baseLabel,
      minutes: Number(w.minutes || 0),
      storeTotal: Number((memo as MemoV1).storeTotal || 0),
      staffPay: Number(memo.staffPay || 0),
      adminPay: Number(memo.adminPay || 0),
      tip: Number(memo.tip || 0),
      cash: Boolean(memo.cash),
      misu: Boolean(memo.misu),
      misuAmount: 0,
      heart: Boolean(memo.heart),
      at: Boolean(memo.at),
    }
  }

  const fallbackStaff = Math.max(0, Number(pay?.amount ?? 0))
  return {
    id: w.id,
    work_at: w.work_at,
    timeText,
    storeName,
    baseLabel: `${w.minutes}분`,
    minutes: Number(w.minutes || 0),
    storeTotal: 0,
    staffPay: fallbackStaff,
    adminPay: 0,
    tip: 0,
    cash: false,
    misu: false,
    misuAmount: 0,
    heart: Boolean(w.option_heart),
    at: Boolean(w.option_at),
  }
}

function parseMemo(memo: string | null): MemoV1 | MemoV2 | null {
  if (!memo) return null
  try {
    const obj = JSON.parse(memo)
    if (!obj || typeof obj !== 'object') return null
    if (obj.v === 2) return obj as MemoV2
    if (obj.v === 1) return obj as MemoV1
    return null
  } catch {
    return null
  }
}

/* -------------------------
   시간/날짜 유틸
------------------------- */

function computeWorkAtIso7(args: { baseDayYmd: string; timeHm: string }) {
  const inputMin = hhmmToMinutes(args.timeHm)
  const dayStartMin = 7 * 60

  const base = new Date(`${args.baseDayYmd}T${args.timeHm}:00+09:00`)
  if (inputMin < dayStartMin) base.setDate(base.getDate() + 1)
  return base.toISOString()
}

function hhmmToMinutes(hm: string) {
  const [h, m] = hm.split(':').map((v) => Number(v))
  return h * 60 + m
}

function getKstDateString() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getTimeHHMM() {
  const d = new Date()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function toKstTime(d: Date) {
  return d.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
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

function addDaysYmd(ymd: string, delta: number) {
  const d = new Date(`${ymd}T00:00:00+09:00`)
  d.setDate(d.getDate() + delta)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('ko-KR').format(Math.max(0, Number(n || 0)))
}

function formatMinutes(mins: number) {
  const m = Math.max(0, Number(mins || 0))
  const h = Math.floor(m / 60)
  const r = m % 60
  if (h <= 0) return `${r}분`
  if (r === 0) return `${h}시간`
  return `${h}시간 ${r}분`
}

// ✅ 선택일 07:00 ~ 다음날 07:00
function getKstDayRangeIso7(dateYmd: string) {
  const start = new Date(`${dateYmd}T07:00:00+09:00`)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}

// ✅ 기간(시작~종료) 07:00 기준 (종료일 포함)
function getKstRangeIso7(startYmd: string, endYmd: string) {
  const start = new Date(`${startYmd}T07:00:00+09:00`)
  const end = new Date(`${endYmd}T07:00:00+09:00`)
  end.setDate(end.getDate() + 1)
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}

/* -------------------------
   초성검색
------------------------- */

const CHOSUNG = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ']

function isChosungString(q: string) {
  if (!q) return false
  for (const ch of q) if (!CHOSUNG.includes(ch)) return false
  return true
}

function getChosungSeq(name: string) {
  let out = ''
  for (const ch of name) {
    const c = getChosung(ch)
    if (c) out += c
  }
  return out
}

function getChosung(ch: string) {
  const code = ch.charCodeAt(0)
  if (code < 0xac00 || code > 0xd7a3) return null
  const index = Math.floor((code - 0xac00) / 588)
  return CHOSUNG[index] ?? null
}
