'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabaseClient'
import { GlassCard } from '@/components/ui/GlassCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { ProButton } from '@/components/ui/ProButton'
import { cn } from '@/lib/cn'
import { Star, Save, Trash2, ChevronLeft, ChevronRight, X, UserCheck } from 'lucide-react'

/* ------------------------- types ------------------------- */
type StaffStatus = 'WORKING' | 'CAR_WAIT' | 'LODGE_WAIT' | 'OFF'

const STAFF_STATUS_LABEL: Record<StaffStatus, string> = {
  WORKING: '출근중',
  CAR_WAIT: '차대기중',
  LODGE_WAIT: '숙소대기중',
  OFF: '퇴근',
}

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
  work_status?: StaffStatus | null
}

type StoreRow = { id: number; name: string; is_active: boolean }
type PaymentRow = { amount: number | null; memo: string | null; method: string | null; paid_at: string | null }

// ✅ 누가 저장했는지(관리자)
type SavedBy = { id: string; login_id: string; nickname: string; at: string }

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
  savedBy?: SavedBy | null // ✅
}

type JSvcKey = 'NONE' | 'J_HALF' | 'J_ONE' | 'J_ONE_HALF' | 'J_TWO'
type RSvcKey = 'NONE' | 'RT_HALF' | 'RT_ONE'

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
  savedBy?: SavedBy | null // ✅
}

type MemoV3 = {
  v: 3
  baseLabel: string
  baseMinutes: number
  svcUnits: number
  jUnits?: number
  rUnits?: number
  jCounts: Record<Exclude<JSvcKey, 'NONE'>, number>
  rCounts: Record<Exclude<RSvcKey, 'NONE'>, number>
  heartCount: number
  atCount: number
  staffBase: number
  adminBase: number
  staffAdd: number
  adminAdd: number
  tip: number
  cash: boolean
  misu: boolean
  misuAmount: number
  staffPay: number
  adminPay: number
  storeTotal: number
  savedBy?: SavedBy | null // ✅
}

/** ✅ v4: 서비스 1건 단위 입력(순서 유지) + 마지막 1건에 미수(■■) 토글 */
type StepJ = { kind: 'J'; key: Exclude<JSvcKey, 'NONE'>; heart: number; at: number; misu: boolean }
type StepR = { kind: 'R'; key: Exclude<RSvcKey, 'NONE'>; heart: number; at: number; misu: boolean }
type Step = StepJ | StepR

type MemoV4 = {
  v: 4
  baseLabel: string
  baseMinutes: number
  svcUnits: number
  jUnits: number
  rUnits: number
  steps: Step[]
  staffBase: number
  adminBase: number
  staffAdd: number
  adminAdd: number
  tip: number
  cash: boolean
  misu: boolean
  misuAmount: number
  staffPay: number
  adminPay: number
  storeTotal: number
  savedBy?: SavedBy | null // ✅
}

type WorkLogRow = {
  id: number
  work_at: string
  minutes: number
  option_heart: boolean
  option_at: boolean
  stores: { name: string } | null
  payment: PaymentRow | null
  memoObj: MemoV1 | MemoV2 | MemoV3 | MemoV4 | null
}

type DerivedLog = {
  id: number
  work_at: string
  ts: number
  timeText: string
  storeName: string
  baseLabel: string
  minutes: number
  jUnits: number
  rUnits: number
  storeTotal: number
  staffPay: number
  adminPay: number
  tip: number
  cash: boolean
  misu: boolean
  misuAmount: number
  heartCount: number
  atCount: number
  savedByName: string | null // ✅
}

/* ------------------------- constants / rules ------------------------- */
const STAFF_TTL = 2 * 60 * 1000
const LOGS_TTL = 30 * 1000
const STORES_TTL = 10 * 60 * 1000
const SETTLE_TTL = 30 * 1000

const J_SVC: Record<Exclude<JSvcKey, 'NONE'>, { label: string; minutes: number; store: number; staff: number; admin: number }> = {
  J_HALF: { label: '반개', minutes: 30, store: 20000, staff: 15000, admin: 5000 },
  J_ONE: { label: '1개', minutes: 60, store: 40000, staff: 33000, admin: 7000 },
  J_ONE_HALF: { label: '1개반', minutes: 90, store: 60000, staff: 48000, admin: 12000 },
  J_TWO: { label: '2개', minutes: 120, store: 80000, staff: 66000, admin: 14000 },
}

const R_SVC: Record<Exclude<RSvcKey, 'NONE'>, { label: string; minutes: number; store: number; staff: number; admin: number }> = {
  RT_HALF: { label: '룸반개', minutes: 30, store: 30000, staff: 25000, admin: 5000 },
  RT_ONE: { label: '룸1개', minutes: 60, store: 60000, staff: 50000, admin: 10000 },
}

const ADDON_HEART = { label: '♡', store: 100000, staff: 90000, admin: 10000 }
const ADDON_AT = { label: '@', store: 200000, staff: 180000, admin: 20000 }

const J_KEYS: Array<Exclude<JSvcKey, 'NONE'>> = ['J_HALF', 'J_ONE', 'J_ONE_HALF', 'J_TWO']
const R_KEYS: Array<Exclude<RSvcKey, 'NONE'>> = ['RT_HALF', 'RT_ONE']

const EMPTY_J_COUNTS: Record<Exclude<JSvcKey, 'NONE'>, number> = { J_HALF: 0, J_ONE: 0, J_ONE_HALF: 0, J_TWO: 0 }
const EMPTY_R_COUNTS: Record<Exclude<RSvcKey, 'NONE'>, number> = { RT_HALF: 0, RT_ONE: 0 }

/* ------------------------- page ------------------------- */
export default function AdminStaffDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const staffId = params.id

  // ✅ 현재 로그인한 관리자(저장 주체) 캐시
  const savedByRef = useRef<SavedBy | null>(null)

  const [staff, setStaff] = useState<Staff | null>(null)
  const [stores, setStores] = useState<StoreRow[]>([])
  const [workLogs, setWorkLogs] = useState<WorkLogRow[]>([])

  const [staffLoading, setStaffLoading] = useState(true)
  const [storesLoading, setStoresLoading] = useState(true)
  const [logsLoading, setLogsLoading] = useState(true)

  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [selectedYmd, setSelectedYmd] = useState(getKstDateString())
  const lastNowYmdRef = useRef(getKstDateString())

  const [storeQuery, setStoreQuery] = useState('')
  const [selectedStoreId, setSelectedStoreId] = useState<number | ''>('')
  const [storeDropdownOpen, setStoreDropdownOpen] = useState(false)
  const [workTime, setWorkTime] = useState(getTimeHHMM())

  // ✅ v4 순서 입력
  const [steps, setSteps] = useState<Step[]>([])
  // ✅ (선택) 미수 직접입력(override). 0이면 steps로 자동 계산
  const [misuOverride, setMisuOverride] = useState<number>(0)

  const [cash, setCash] = useState(false)
  const [tip, setTip] = useState<number>(0)
  const [saving, setSaving] = useState(false)

  // 계좌 모달
  const [bankOpen, setBankOpen] = useState(false)
  const [bankName, setBankName] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [bankHolder, setBankHolder] = useState('')
  const [bankSaving, setBankSaving] = useState(false)

  // 내역 상세 팝업
  const [detailOpen, setDetailOpen] = useState(false)
  const [detail, setDetail] = useState<DerivedLog | null>(null)
  const [deleting, setDeleting] = useState(false)

  // 정산 팝업
  const [settleOpen, setSettleOpen] = useState(false)
  const [settleStartYmd, setSettleStartYmd] = useState(getKstDateString())
  const [settleEndYmd, setSettleEndYmd] = useState(getKstDateString())
  const [settleLoading, setSettleLoading] = useState(false)
  const [settleError, setSettleError] = useState<string | null>(null)
  const [settleRows, setSettleRows] = useState<WorkLogRow[]>([])

  // 근태 모달
  const [attOpen, setAttOpen] = useState(false)
  const [attSaving, setAttSaving] = useState(false)
  const [attStatus, setAttStatus] = useState<StaffStatus>('OFF')

  // ✅ 현재 로그인한 관리자 프로필(닉네임) 선로딩
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { data: sess } = await supabaseClient.auth.getSession()
        const uid = sess.session?.user?.id
        if (!uid) return
        const { data: prof } = await supabaseClient
          .from('user_profiles')
          .select('id, login_id, nickname, role, is_active')
          .eq('id', uid)
          .maybeSingle()

        if (!alive || !prof) return
        savedByRef.current = {
          id: uid,
          login_id: String((prof as any)?.login_id ?? ''),
          nickname: String((prof as any)?.nickname ?? ''),
          at: new Date().toISOString(),
        }
      } catch {}
    })()

    return () => {
      alive = false
    }
  }, [])

  // ✅ 현금/미수 동시 ON 불가 유지
  const toggleCash = () => {
    setCash((prev) => {
      const next = !prev
      if (next) {
        setMisuOverride(0)
        setSteps((p) => p.map((s) => ({ ...s, misu: false })))
      }
      return next
    })
  }

  // ✅ step 추가/감소(우클릭 감소)
  const pushJ = (k: Exclude<JSvcKey, 'NONE'>) => {
    setError(null)
    setMessage(null)
    setSteps((p) => [...p, { kind: 'J', key: k, heart: 0, at: 0, misu: false }])
  }
  const pushR = (k: Exclude<RSvcKey, 'NONE'>) => {
    setError(null)
    setMessage(null)
    setSteps((p) => [...p, { kind: 'R', key: k, heart: 0, at: 0, misu: false }])
  }

  const removeLastMatch = (pred: (s: Step) => boolean) =>
    setSteps((p) => {
      for (let i = p.length - 1; i >= 0; i--) {
        if (pred(p[i])) return [...p.slice(0, i), ...p.slice(i + 1)]
      }
      return p
    })

  const decJ = (k: Exclude<JSvcKey, 'NONE'>) => removeLastMatch((s) => s.kind === 'J' && s.key === k)
  const decR = (k: Exclude<RSvcKey, 'NONE'>) => removeLastMatch((s) => s.kind === 'R' && s.key === k)

  // ✅ 옵션은 "마지막 서비스 1건"에 붙임
  const incHeart = () => {
    setError(null)
    setMessage(null)
    if (steps.length === 0) return setError('먼저 서비스(반개/1개/룸 등)를 선택하세요.')
    setSteps((p) => {
      if (p.length === 0) return p
      const next = [...p]
      const last = next[next.length - 1]
      next[next.length - 1] = { ...last, heart: Math.max(0, Number(last.heart || 0)) + 1 }
      return next
    })
  }
  const decHeart = () =>
    setSteps((p) => {
      for (let i = p.length - 1; i >= 0; i--) {
        const h = Math.max(0, Number(p[i].heart || 0))
        if (h > 0) {
          const next = [...p]
          next[i] = { ...next[i], heart: h - 1 }
          return next
        }
      }
      return p
    })

  const incAt = () => {
    setError(null)
    setMessage(null)
    if (steps.length === 0) return setError('먼저 서비스(반개/1개/룸 등)를 선택하세요.')
    setSteps((p) => {
      if (p.length === 0) return p
      const next = [...p]
      const last = next[next.length - 1]
      next[next.length - 1] = { ...last, at: Math.max(0, Number(last.at || 0)) + 1 }
      return next
    })
  }
  const decAt = () =>
    setSteps((p) => {
      for (let i = p.length - 1; i >= 0; i--) {
        const a = Math.max(0, Number(p[i].at || 0))
        if (a > 0) {
          const next = [...p]
          next[i] = { ...next[i], at: a - 1 }
          return next
        }
      }
      return p
    })

  // ✅ 미수(■■): 마지막 서비스 1건에만 토글, 동시에 1건만 미수 가능
  const toggleMisuLast = () => {
    setError(null)
    setMessage(null)
    if (steps.length === 0) return setError('먼저 서비스(반개/1개/룸 등)를 선택하세요.')
    setSteps((p) => {
      if (p.length === 0) return p
      const lastIdx = p.length - 1
      const turningOn = !p[lastIdx].misu
      const next = p.map((s, i) => {
        if (i === lastIdx) return { ...s, misu: turningOn }
        return turningOn ? { ...s, misu: false } : { ...s, misu: false }
      })
      return next
    })
    setCash(false)
  }

  // ✅ 계산(steps 기반) + 버튼 배지 count 제공
  const calc = useMemo(() => {
    const jCounts = { ...EMPTY_J_COUNTS }
    const rCounts = { ...EMPTY_R_COUNTS }

    let jMinutes = 0
    let rMinutes = 0

    let baseStore = 0
    let baseStaff = 0
    let baseAdmin = 0

    let addStore = 0
    let addStaff = 0
    let addAdmin = 0

    let heartCount = 0
    let atCount = 0

    let autoMisuAmount = 0

    for (const s of steps) {
      const h = Math.max(0, Number(s.heart || 0))
      const a = Math.max(0, Number(s.at || 0))
      heartCount += h
      atCount += a

      const stepAddStore = h * ADDON_HEART.store + a * ADDON_AT.store
      const stepAddStaff = h * ADDON_HEART.staff + a * ADDON_AT.staff
      const stepAddAdmin = h * ADDON_HEART.admin + a * ADDON_AT.admin

      addStore += stepAddStore
      addStaff += stepAddStaff
      addAdmin += stepAddAdmin

      if (s.kind === 'J') {
        jCounts[s.key] = (jCounts[s.key] || 0) + 1
        const svc = J_SVC[s.key]
        jMinutes += svc.minutes
        baseStore += svc.store
        baseStaff += svc.staff
        baseAdmin += svc.admin

        if (s.misu) autoMisuAmount += svc.store + stepAddStore
      } else {
        rCounts[s.key] = (rCounts[s.key] || 0) + 1
        const svc = R_SVC[s.key]
        rMinutes += svc.minutes
        baseStore += svc.store
        baseStaff += svc.staff
        baseAdmin += svc.admin

        if (s.misu) autoMisuAmount += svc.store + stepAddStore
      }
    }

    const baseMinutes = jMinutes + rMinutes
    const safeTip = Math.max(0, Number(tip || 0))

    const staffPay = baseStaff + addStaff + safeTip
    const adminPay = baseAdmin + addAdmin
    const storeTotal = baseStore + addStore

    const parts: string[] = []
    for (const k of J_KEYS) {
      const c = Math.max(0, Number(jCounts[k] || 0))
      if (c > 0) parts.push(`${J_SVC[k].label}×${c}`)
    }
    for (const k of R_KEYS) {
      const c = Math.max(0, Number(rCounts[k] || 0))
      if (c > 0) parts.push(`${R_SVC[k].label}×${c}`)
    }
    const baseLabel = parts.length ? parts.join(' + ') : '-'

    const jUnits = jMinutes / 60
    const rUnits = rMinutes / 60
    const svcUnits = baseMinutes / 60

    const override = Math.max(0, Number(misuOverride || 0))
    const misuAmount = override > 0 ? override : autoMisuAmount
    const misuFlag = misuAmount > 0

    return {
      jCounts,
      rCounts,
      heartCount,
      atCount,
      baseLabel,
      minutes: baseMinutes,
      svcUnits,
      jUnits,
      rUnits,
      staffBase: baseStaff,
      adminBase: baseAdmin,
      staffAdd: addStaff,
      adminAdd: addAdmin,
      tip: safeTip,
      misuAmount,
      staffPay,
      adminPay,
      storeTotal,
      misuFlag,
    }
  }, [steps, tip, misuOverride])

  // ✅ 입력 요약(순서대로: 서비스 + 옵션 + ■■)
  const compactInputSummary = useMemo(() => {
    const t = hhmmToKoText(workTime)
    const body = steps.length ? steps.map(formatStepForInput).join(' + ') : '0개'
    const hasStepMisu = steps.some((s) => s.misu)
    const tailMisu = !hasStepMisu && calc.misuFlag ? '■■' : ''
    return `${t} ${body}${tailMisu ? ` ${tailMisu}` : ''}`.trim()
  }, [workTime, steps, calc.misuFlag])

  // 가게 검색
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

  /* ------------------------- bootstrap ------------------------- */
  useEffect(() => {
    let alive = true
    setError(null)
    setMessage(null)

    const staffCacheKey = `pc_staff_${staffId}_v2`
    const cachedStaff = ssRead<{ ts: number; staff: Staff }>(staffCacheKey, STAFF_TTL)?.staff ?? null
    if (cachedStaff) {
      setStaff(cachedStaff)
      setBankName(cachedStaff.bank_name ?? '')
      setBankAccount(cachedStaff.bank_account ?? '')
      setBankHolder(cachedStaff.bank_holder ?? '')
      setAttStatus((cachedStaff.work_status as StaffStatus) ?? 'OFF')
      setStaffLoading(false)

      const todayYmd = getKstDateString()
      setSelectedYmd(todayYmd)
      setSettleStartYmd(todayYmd)
      setSettleEndYmd(todayYmd)
    } else {
      setStaffLoading(true)
    }

    setStoresLoading(true)
    loadStoresFast()
      .then((rows) => {
        if (!alive) return
        setStores(rows)
      })
      .catch((e: any) => alive && setError(e?.message ?? 'stores 로드 오류'))
      .finally(() => alive && setStoresLoading(false))

    const preYmd = getKstDateString()
    const logsCacheKey = `pc_logs_${staffId}_${preYmd}_v2`
    const cachedLogs = ssRead<{ ts: number; rows: WorkLogRow[] }>(logsCacheKey, LOGS_TTL)?.rows ?? null
    if (cachedLogs) {
      setWorkLogs(cachedLogs)
      setLogsLoading(false)
    } else {
      setLogsLoading(true)
    }

    ;(async () => {
      try {
        const { data: session } = await supabaseClient.auth.getSession()
        const token = session.session?.access_token
        if (!token) throw new Error('세션이 없습니다. 다시 로그인 해주세요.')

        const res = await fetch(`/api/admin/staff/${staffId}`, { headers: { Authorization: `Bearer ${token}` } })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.error || 'staff 조회 실패')

        const freshStaff = json.staff as Staff
        if (!alive) return
        setStaff(freshStaff)
        setBankName(freshStaff.bank_name ?? '')
        setBankAccount(freshStaff.bank_account ?? '')
        setBankHolder(freshStaff.bank_holder ?? '')
        setAttStatus((freshStaff.work_status as StaffStatus) ?? 'OFF')
        setStaffLoading(false)
        ssWrite(staffCacheKey, { ts: Date.now(), staff: freshStaff })

        const todayYmd = getKstDateString()
        if (alive) {
          setSelectedYmd(todayYmd)
          setSettleStartYmd(todayYmd)
          setSettleEndYmd(todayYmd)
        }

        const rows = await queryWorkLogs(staffId, todayYmd)
        if (!alive) return
        setWorkLogs(rows)
        setLogsLoading(false)
        ssWrite(`pc_logs_${staffId}_${todayYmd}_v2`, { ts: Date.now(), rows })
      } catch (e: any) {
        if (!alive) return
        setError(e?.message ?? '초기 로드 오류')
        setStaffLoading(false)
        setStoresLoading(false)
        setLogsLoading(false)
      }
    })()

    return () => {
      alive = false
    }
  }, [staffId])

  useEffect(() => {
    let alive = true
    if (!staffId || !selectedYmd) return
    setError(null)

    const key = `pc_logs_${staffId}_${selectedYmd}_v2`
    const cached = ssRead<{ ts: number; rows: WorkLogRow[] }>(key, LOGS_TTL)?.rows ?? null
    if (cached) {
      setWorkLogs(cached)
      setLogsLoading(false)
    } else {
      setLogsLoading(true)
    }

    ;(async () => {
      try {
        const rows = await queryWorkLogs(staffId, selectedYmd)
        if (!alive) return
        setWorkLogs(rows)
        setLogsLoading(false)
        ssWrite(key, { ts: Date.now(), rows })
      } catch (e: any) {
        if (!alive) return
        setError(e?.message ?? '내역 로드 오류')
        setLogsLoading(false)
      }
    })()

    return () => {
      alive = false
    }
  }, [staffId, selectedYmd])

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

  /* ------------------------- actions ------------------------- */
  const onPickStore = (s: StoreRow) => {
    setSelectedStoreId(s.id)
    setStoreQuery(s.name)
    setStoreDropdownOpen(false)
  }

  const moveDay = (delta: number) => setSelectedYmd((prev) => addDaysYmd(prev, delta))
  const bumpTip = (delta: number) => setTip((t) => Math.max(0, Number(t || 0) + delta))
  const resetTip = () => setTip(0)

  const resetServices = () => setSteps([])

  const resetAll = () => {
    setMessage(null)
    setError(null)
    setStoreQuery('')
    setSelectedStoreId('')
    setStoreDropdownOpen(false)
    setWorkTime(getTimeHHMM())
    resetServices()
    setCash(false)
    setTip(0)
    setMisuOverride(0)
  }

  const onSave = async () => {
    setError(null)
    setMessage(null)

    if (!selectedStoreId) return setError('가게를 선택하세요.')
    if (!workTime) return setError('시작 시각을 선택하세요.')
    if (!calc.minutes || calc.minutes <= 0) return setError('서비스(반개/1개/룸 등)를 최소 1번 이상 눌러주세요.')

    setSaving(true)
    try {
      const workAtIso = computeWorkAtIso7({ baseDayYmd: selectedYmd, timeHm: workTime })
      const nowIso = new Date().toISOString()

      // ✅ 저장한 관리자 정보 확보
      let savedBy = savedByRef.current
      if (!savedBy) {
        const { data: sess } = await supabaseClient.auth.getSession()
        const uid = sess.session?.user?.id
        if (uid) {
          const { data: prof } = await supabaseClient.from('user_profiles').select('id, login_id, nickname').eq('id', uid).maybeSingle()
          savedBy = {
            id: uid,
            login_id: String((prof as any)?.login_id ?? ''),
            nickname: String((prof as any)?.nickname ?? ''),
            at: nowIso,
          }
          savedByRef.current = savedBy
        }
      } else {
        savedBy = { ...savedBy, at: nowIso }
        savedByRef.current = savedBy
      }

      const { data: wData, error: wErr } = await supabaseClient
        .from('staff_work_logs')
        .insert({
          staff_id: staffId,
          store_id: selectedStoreId,
          work_at: workAtIso,
          minutes: calc.minutes,
          option_heart: calc.heartCount > 0,
          option_at: calc.atCount > 0,
        })
        .select('id')
        .single()

      if (wErr) throw new Error(`근무 저장 실패: ${wErr.message}`)
      const workLogId = Number(wData?.id)
      if (!workLogId) throw new Error('workLogId missing')

      const memoObj: MemoV4 = {
        v: 4,
        baseLabel: calc.baseLabel,
        baseMinutes: calc.minutes,
        svcUnits: calc.svcUnits,
        jUnits: calc.jUnits,
        rUnits: calc.rUnits,
        steps: steps.map((s) => ({
          ...s,
          heart: Math.max(0, Number(s.heart || 0)),
          at: Math.max(0, Number(s.at || 0)),
          misu: Boolean(s.misu),
        })),
        staffBase: calc.staffBase,
        adminBase: calc.adminBase,
        staffAdd: calc.staffAdd,
        adminAdd: calc.adminAdd,
        tip: calc.tip,
        cash,
        misu: calc.misuFlag,
        misuAmount: calc.misuAmount,
        staffPay: calc.staffPay,
        adminPay: calc.adminPay,
        storeTotal: calc.storeTotal,
        savedBy: savedBy ?? null, // ✅
      }

      const { error: pErr } = await supabaseClient.from('staff_payment_logs').insert({
        staff_id: staffId,
        work_log_id: workLogId,
        amount: calc.staffPay,
        method: 'cash',
        paid_at: nowIso,
        memo: JSON.stringify(memoObj),
      })
      if (pErr) throw new Error(`정산 저장 실패: ${pErr.message}`)

      setMessage('저장되었습니다.')

      setLogsLoading(true)
      const rows = await queryWorkLogs(staffId, selectedYmd)
      setWorkLogs(rows)
      setLogsLoading(false)
      ssWrite(`pc_logs_${staffId}_${selectedYmd}_v2`, { ts: Date.now(), rows })

      setTip(0)
      setMisuOverride(0)
      setCash(false)
      setSteps([])
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
      const rows = await queryWorkLogs(staffId, selectedYmd)
      setWorkLogs(rows)
      setLogsLoading(false)
      ssWrite(`pc_logs_${staffId}_${selectedYmd}_v2`, { ts: Date.now(), rows })
    } catch (e: any) {
      setError(e?.message ?? '삭제 오류')
    } finally {
      setDeleting(false)
    }
  }

  const onSaveBank = async () => {
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
        .eq('id', staffId)

      if (error) throw new Error(`계좌 저장 실패: ${error.message}`)

      setStaff((prev) =>
        prev
          ? { ...prev, bank_name: bankName.trim() || null, bank_account: bankAccount.trim() || null, bank_holder: bankHolder.trim() || null }
          : prev
      )

      ssWrite(`pc_staff_${staffId}_v2`, {
        ts: Date.now(),
        staff: {
          ...(staff as Staff),
          bank_name: bankName.trim() || null,
          bank_account: bankAccount.trim() || null,
          bank_holder: bankHolder.trim() || null,
        },
      })

      setMessage('저장되었습니다.')
      setBankOpen(false)
    } catch (e: any) {
      setError(e?.message ?? '계좌 저장 오류')
    } finally {
      setBankSaving(false)
    }
  }

  const onSaveAttendance = async () => {
    setError(null)
    setMessage(null)
    setAttSaving(true)

    try {
      const { error } = await supabaseClient.from('user_profiles').update({ work_status: attStatus }).eq('id', staffId)
      if (error) throw new Error(`근태 저장 실패: ${error.message}`)

      setStaff((prev) => (prev ? { ...prev, work_status: attStatus } : prev))

      ssWrite(`pc_staff_${staffId}_v2`, { ts: Date.now(), staff: { ...(staff as Staff), work_status: attStatus } })
      setMessage('근태가 저장되었습니다.')
      setAttOpen(false)
    } catch (e: any) {
      setError(e?.message ?? '근태 저장 오류')
    } finally {
      setAttSaving(false)
    }
  }

  const onLogout = async () => {
    await supabaseClient.auth.signOut()
    router.replace('/login')
  }

  /* ------------------------- view models ------------------------- */
  const derivedLogs = useMemo(() => {
    return workLogs
      .map((w) => deriveLog(w))
      .filter((x): x is DerivedLog => Boolean(x))
      .sort((a, b) => (a.ts !== b.ts ? a.ts - b.ts : a.storeName.localeCompare(b.storeName, 'ko')))
  }, [workLogs])

  const totalStaffPay = useMemo(() => derivedLogs.reduce((sum, r) => sum + (r.staffPay || 0), 0), [derivedLogs])
  const totalAdminPay = useMemo(() => derivedLogs.reduce((sum, r) => sum + (r.adminPay || 0), 0), [derivedLogs])

  const settleDerived = useMemo(() => {
    if (!settleOpen) return []
    return settleRows.map((w) => deriveLog(w)).filter((x): x is DerivedLog => Boolean(x)).sort((a, b) => a.ts - b.ts)
  }, [settleOpen, settleRows])

  const settleDays = useMemo(() => {
    if (!settleOpen) return []
    const map = new Map<string, DerivedLog[]>()
    for (const d of settleDerived) {
      const ymd = toKstDateStringAt7(d.work_at)
      const arr = map.get(ymd) ?? []
      arr.push(d)
      map.set(ymd, arr)
    }
    return Array.from(map.entries())
      .map(([ymd, items]) => {
        items.sort((a, b) => (a.ts !== b.ts ? a.ts - b.ts : a.storeName.localeCompare(b.storeName, 'ko')))
        const staffSum = items.reduce((s, x) => s + (x.staffPay || 0), 0)
        const adminSum = items.reduce((s, x) => s + (x.adminPay || 0), 0)
        const tipSum = items.reduce((s, x) => s + (x.tip || 0), 0)
        const misuSum = items.reduce((s, x) => s + (x.misuAmount || 0), 0)
        const storeSum = items.reduce((s, x) => s + (x.storeTotal || 0), 0)
        const minutesSum = items.reduce((s, x) => s + (x.minutes || 0), 0)
        return { ymd, items, staffSum, adminSum, tipSum, misuSum, storeSum, minutesSum }
      })
      .sort((a, b) => (a.ymd < b.ymd ? 1 : -1))
  }, [settleOpen, settleDerived])

  const settleTotal = useMemo(() => {
    if (!settleOpen) return { staffSum: 0, adminSum: 0, tipSum: 0, misuSum: 0, storeSum: 0, minutesSum: 0, count: 0 }
    const staffSum = settleDerived.reduce((s, x) => s + (x.staffPay || 0), 0)
    const adminSum = settleDerived.reduce((s, x) => s + (x.adminPay || 0), 0)
    const tipSum = settleDerived.reduce((s, x) => s + (x.tip || 0), 0)
    const misuSum = settleDerived.reduce((s, x) => s + (x.misuAmount || 0), 0)
    const storeSum = settleDerived.reduce((s, x) => s + (x.storeTotal || 0), 0)
    const minutesSum = settleDerived.reduce((s, x) => s + (x.minutes || 0), 0)
    return { staffSum, adminSum, tipSum, misuSum, storeSum, minutesSum, count: settleDerived.length }
  }, [settleOpen, settleDerived])

  /* ------------------------- settlement fetch (cache) ------------------------- */
  const fetchSettlementRange = async (sid: string, startYmd: string, endYmd: string) => {
    const { startIso, endIso } = getKstRangeIso7(startYmd, endYmd)
    const cacheKey = `pc_settle_${sid}_${startYmd}_${endYmd}_v2`
    const cached = ssRead<{ ts: number; rows: WorkLogRow[] }>(cacheKey, SETTLE_TTL)?.rows ?? null
    if (cached) {
      setSettleRows(cached)
      return
    }

    const pageSize = 1000
    let from = 0
    const all: any[] = []

    while (true) {
      const { data, error } = await supabaseClient
        .from('staff_work_logs')
        .select('id, work_at, minutes, option_heart, option_at, stores(name), staff_payment_logs(amount, memo, method, paid_at)')
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
    ssWrite(cacheKey, { ts: Date.now(), rows })
  }

  const runSettlementFetch = async () => {
    setSettleError(null)
    setSettleLoading(true)
    try {
      if (!settleStartYmd || !settleEndYmd) throw new Error('기간을 선택하세요.')
      if (settleStartYmd > settleEndYmd) throw new Error('시작일이 종료일보다 늦습니다.')
      await fetchSettlementRange(staffId, settleStartYmd, settleEndYmd)
    } catch (e: any) {
      setSettleError(e?.message ?? '정산 조회 오류')
    } finally {
      setSettleLoading(false)
    }
  }

  /* ------------------------- render ------------------------- */
  const titleName = staff?.nickname ?? '직원'
  const subId = staff?.login_id ?? ''
  const statusText = STAFF_STATUS_LABEL[(staff?.work_status as StaffStatus) ?? attStatus ?? 'OFF']
  const misuBtnActive = Boolean(steps.length && steps[steps.length - 1]?.misu)

  return (
    <div className="space-y-6">
      <PageHeader
        title={titleName}
        subtitle={`${subId}${statusText ? ` · ${statusText}` : ''}`}
        backHref="/admin/staff"
        right={
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setSettleOpen(true)
                setSettleError(null)
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
              onClick={() => {
                setAttStatus(((staff?.work_status as StaffStatus) ?? 'OFF') as StaffStatus)
                setAttOpen(true)
              }}
              className={cn(
                'inline-flex items-center justify-center',
                'h-10 w-10 rounded-xl border border-white/12 bg-white/5',
                'text-white/85 hover:bg-white/10 transition'
              )}
              type="button"
              aria-label="근태"
              title="근태"
            >
              <UserCheck className="h-5 w-5" />
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

      {error && (
        <GlassCard className="p-5">
          <div className="text-sm text-red-200">{error}</div>
        </GlassCard>
      )}

      <GlassCard className="p-5">
        <div className="grid grid-cols-2 gap-3">
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
                <div className={cn('absolute z-20 mt-2 w-full overflow-hidden rounded-2xl', 'border border-white/12 bg-zinc-950/95 backdrop-blur-xl shadow-2xl')}>
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

        {/* ✅ 3x5 버튼 */}
        <div className="mt-4">
          <div className="grid grid-cols-3 gap-2">
            <CountButton label="반개" count={calc.jCounts.J_HALF} onInc={() => pushJ('J_HALF')} onDec={() => decJ('J_HALF')} />
            <CountButton label="룸반개" count={calc.rCounts.RT_HALF} onInc={() => pushR('RT_HALF')} onDec={() => decR('RT_HALF')} />
            <GridButton onClick={() => bumpTip(10000)}>팁 +10,000</GridButton>

            <CountButton label="1개" count={calc.jCounts.J_ONE} onInc={() => pushJ('J_ONE')} onDec={() => decJ('J_ONE')} />
            <CountButton label="룸1개" count={calc.rCounts.RT_ONE} onInc={() => pushR('RT_ONE')} onDec={() => decR('RT_ONE')} />
            <GridButton onClick={() => bumpTip(50000)}>팁 +50,000</GridButton>

            <CountButton label="1개반" count={calc.jCounts.J_ONE_HALF} onInc={() => pushJ('J_ONE_HALF')} onDec={() => decJ('J_ONE_HALF')} />
            <CountButton label="♡" count={calc.heartCount} onInc={incHeart} onDec={decHeart} />
            <GridButton onClick={() => bumpTip(100000)}>팁 +100,000</GridButton>

            <CountButton label="2개" count={calc.jCounts.J_TWO} onInc={() => pushJ('J_TWO')} onDec={() => decJ('J_TWO')} />
            <CountButton label="@" count={calc.atCount} onInc={incAt} onDec={decAt} />
            <GridButton onClick={resetTip}>팁초기화</GridButton>

            <GridButton active={cash} onClick={toggleCash}>
              현금
            </GridButton>

            <GridButton active={misuBtnActive} onClick={toggleMisuLast}>
              미수
            </GridButton>

            <GridButton onClick={resetAll}>전체초기화</GridButton>
          </div>
        </div>

        {/* ✅ 정산요약 */}
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-white/50">정산 요약</div>
          </div>

          <div className="mt-1 text-white font-semibold whitespace-nowrap overflow-hidden text-ellipsis" title={compactInputSummary}>
            {compactInputSummary}
          </div>

          <div className="mt-2 text-white font-semibold whitespace-nowrap">
            직원 {formatCurrency(calc.staffPay)}원, 관리자 {formatCurrency(calc.adminPay)}원
          </div>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
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

            <div>
              <div className="text-xs text-white/55">미수 직접입력</div>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                className="mt-2 w-full rounded-xl border border-white/12 bg-black/20 px-3 py-2 text-white outline-none placeholder:text-white/30 focus:border-white/25"
                value={Number.isFinite(misuOverride) ? misuOverride : 0}
                onChange={(e) => {
                  const next = Math.max(0, Number(e.target.value || 0))
                  setMisuOverride(next)
                  if (next > 0) setCash(false)
                }}
                placeholder="0"
              />
            </div>
          </div>
        </div>

        {message && (
          <div className="mt-4 rounded-xl border border-emerald-300/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {message}
          </div>
        )}
        {error && <div className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div>}

        <div className="mt-4">
          <ProButton onClick={onSave} disabled={saving || storesLoading} className="w-full">
            <Save className="mr-2 h-4 w-4" />
            {saving ? '저장 중...' : '저장'}
          </ProButton>
        </div>
      </GlassCard>

      {/* 내역 */}
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
          {!logsLoading && derivedLogs.length === 0 && <div className="py-6 text-sm text-white/60">해당 범위(07:00~다음날07:00)에 내역이 없습니다.</div>}

          {!logsLoading &&
            derivedLogs.map((d) => {
              const compact = buildCompactLineFromDerived(d)
              return (
                <div
                  key={d.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openDetail(d)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') openDetail(d)
                  }}
                  className={cn('py-3 px-2 rounded-xl cursor-pointer', 'hover:bg-white/5 transition', 'outline-none focus:ring-2 focus:ring-white/15')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-white font-semibold truncate">
                        {d.timeText} · {d.storeName}
                      </div>

                      {/* ✅ 저장한 관리자 표시 */}
                      <div className="mt-0.5 text-[11px] text-white/45 truncate">저장: {d.savedByName ?? '-'}</div>

                      <div className="mt-1 text-xs text-white/55 truncate">{compact}</div>
                      <div className="mt-1 text-[11px] text-white/45">{d.baseLabel}</div>
                    </div>

                    <div className="shrink-0 text-right">
                      <div className="text-sm text-white/85 font-semibold">
                        {formatCurrency(d.staffPay)} / {formatCurrency(d.adminPay)}
                      </div>
                      {d.tip > 0 && <div className="mt-1 text-[11px] text-white/45">팁 {formatCurrency(d.tip)}원</div>}
                    </div>
                  </div>
                </div>
              )
            })}
        </div>
      </GlassCard>

      {/* 상세 팝업 */}
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
                  <div className="mt-1 text-sm text-white/60">{buildCompactLineFromDerived(detail)}</div>
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
                {/* ✅ 저장한 관리자 표시 */}
                <RowKV k="저장" v={detail.savedByName ?? '-'} />

                <RowKV k="직원 정산" v={`${formatCurrency(detail.staffPay)}원`} />
                <RowKV k="관리자 정산" v={`${formatCurrency(detail.adminPay)}원`} />
                {detail.tip > 0 && <RowKV k="팁" v={`${formatCurrency(detail.tip)}원`} />}
                {detail.misu && detail.misuAmount > 0 && <RowKV k="미수금액" v={`${formatCurrency(detail.misuAmount)}원`} />}
                <RowKV k="옵션" v={`${repeatChar('♡', detail.heartCount)}${repeatChar('@', detail.atCount)}`.trim() || '-'} />
                {(detail.cash || detail.misu) && <RowKV k="상태" v={`${detail.cash ? '현금' : ''}${detail.misu ? '미수' : ''}`} />}
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

      {/* 정산 팝업 */}
      {settleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <button className="absolute inset-0 bg-black/60" onClick={() => setSettleOpen(false)} type="button" aria-label="닫기" />
          <div className="relative w-full max-w-3xl">
            <GlassCard className="p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-white text-lg font-semibold truncate">정산 · {staff?.nickname ?? ''}</div>
                  <div className="mt-1 text-sm text-white/55 truncate">기준 : 07:00 ~ 다음날 07:00</div>
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
                <div className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">{settleError}</div>
              )}

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

              <div className="mt-5 max-h-[55vh] overflow-y-auto pr-1">
                {settleLoading && <div className="py-6 text-sm text-white/60">정산 내역 불러오는 중...</div>}
                {!settleLoading && settleDays.length === 0 && <div className="py-6 text-sm text-white/60">조회 결과가 없습니다.</div>}

                {!settleLoading &&
                  settleDays.map((day) => (
                    <div key={day.ymd} className="mb-4">
                      <div className="flex items-end justify-between gap-3">
                        <div className="text-white font-semibold">{day.ymd}</div>
                        <div className="text-xs text-white/60 text-right">
                          <div>
                            직원 {formatCurrency(day.staffSum)} · 관리자 {formatCurrency(day.adminSum)}
                          </div>
                          <div>
                            팁 {formatCurrency(day.tipSum)} · 미수 {formatCurrency(day.misuSum)}
                          </div>
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
                                <div className="mt-1 text-xs text-white/55 truncate">{buildCompactLineFromDerived(d)}</div>
                                <div className="mt-1 text-[11px] text-white/45">
                                  {d.baseLabel} {d.minutes ? ` · ${d.minutes}분` : ''}
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

      {/* 근태 모달 */}
      {attOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <button className="absolute inset-0 bg-black/60" onClick={() => setAttOpen(false)} aria-label="닫기" />
          <div className="relative w-full max-w-md">
            <GlassCard className="p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-white text-lg font-semibold">근태 설정</div>
                  <div className="mt-1 text-sm text-white/55 truncate">
                    {staff?.nickname ?? ''} · 현재: {STAFF_STATUS_LABEL[((staff?.work_status as StaffStatus) ?? 'OFF') as StaffStatus]}
                  </div>
                </div>
                <button
                  onClick={() => setAttOpen(false)}
                  className="rounded-xl border border-white/12 bg-white/5 p-2 text-white/80 hover:bg-white/10 transition"
                  type="button"
                  aria-label="닫기"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2">
                {(['WORKING', 'CAR_WAIT', 'LODGE_WAIT', 'OFF'] as StaffStatus[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setAttStatus(s)}
                    className={cn(
                      'rounded-xl border px-3 py-3 text-sm font-semibold transition',
                      attStatus === s ? 'bg-white text-zinc-900 border-white/0' : 'bg-white/5 text-white/85 border-white/12 hover:bg-white/10'
                    )}
                  >
                    {STAFF_STATUS_LABEL[s]}
                  </button>
                ))}
              </div>

              <div className="mt-5 flex gap-2">
                <ProButton variant="ghost" className="flex-1" type="button" onClick={() => setAttOpen(false)} disabled={attSaving}>
                  닫기
                </ProButton>
                <ProButton className="flex-1" type="button" onClick={onSaveAttendance} disabled={attSaving}>
                  {attSaving ? '저장 중...' : '저장'}
                </ProButton>
              </div>
            </GlassCard>
          </div>
        </div>
      )}

      {/* 계좌 모달 */}
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
                  <ProButton variant="ghost" className="flex-1" type="button" onClick={() => setBankOpen(false)} disabled={bankSaving}>
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

/* ------------------------- UI helpers ------------------------- */
function GridButton({ active, onClick, children }: { active?: boolean; onClick: () => void; children: ReactNode }) {
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

function CountButton({ label, count, onInc, onDec }: { label: string; count: number; onInc: () => void; onDec: () => void }) {
  return (
    <button
      onClick={onInc}
      onContextMenu={(e) => {
        e.preventDefault()
        onDec()
      }}
      className={cn(
        'relative rounded-xl border px-3 py-2.5 text-sm font-semibold transition',
        count > 0 ? 'bg-white text-zinc-900 border-white/0' : 'bg-white/5 text-white/85 border-white/12 hover:bg-white/10'
      )}
      type="button"
    >
      {label}
      {count > 0 && (
        <span className="absolute -top-2 -right-2 min-w-[22px] h-[22px] px-1 rounded-full bg-black/70 border border-white/15 text-white text-[11px] flex items-center justify-center">
          {count}
        </span>
      )}
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

/* ------------------------- data fetch ------------------------- */
async function queryWorkLogs(staffId: string, ymd: string): Promise<WorkLogRow[]> {
  const { startIso, endIso } = getKstDayRangeIso7(ymd)
  const { data, error } = await supabaseClient
    .from('staff_work_logs')
    .select('id, work_at, minutes, option_heart, option_at, stores(name), staff_payment_logs(amount, memo, method, paid_at)')
    .eq('staff_id', staffId)
    .gte('work_at', startIso)
    .lt('work_at', endIso)
    .order('work_at', { ascending: true })

  if (error) throw new Error(`work_logs 로드 실패: ${error.message}`)
  return normalizeWorkLogs(data)
}

async function loadStoresFast(): Promise<StoreRow[]> {
  const key = 'pc_stores_v1'
  const cached = ssRead<{ ts: number; rows: StoreRow[] }>(key, STORES_TTL)?.rows ?? null
  if (cached) return cached

  const { data, error } = await supabaseClient.from('stores').select('id, name, is_active').order('name', { ascending: true })
  if (error) throw new Error(`stores 로드 실패: ${error.message}`)

  const rows = normalizeStores(data)
  ssWrite(key, { ts: Date.now(), rows })
  return rows
}

function normalizeStores(data: unknown): StoreRow[] {
  const arr = Array.isArray(data) ? data : []
  return arr
    .map((r: any) => {
      const row: StoreRow = { id: Number(r?.id), name: String(r?.name ?? ''), is_active: Boolean(r?.is_active) }
      if (!row.id || !row.name) return null
      return row
    })
    .filter((x): x is StoreRow => Boolean(x))
}

function normalizeWorkLogs(data: unknown): WorkLogRow[] {
  const arr = Array.isArray(data) ? data : []
  return arr
    .map((r: any) => {
      const payRaw = Array.isArray(r?.staff_payment_logs) ? r.staff_payment_logs[0] : null
      const payment: PaymentRow | null = payRaw
        ? { amount: payRaw?.amount == null ? null : Number(payRaw.amount), memo: payRaw?.memo ?? null, method: payRaw?.method ?? null, paid_at: payRaw?.paid_at ?? null }
        : null

      const memoObj = parseMemo(payment?.memo ?? null)

      const row: WorkLogRow = {
        id: Number(r?.id),
        work_at: String(r?.work_at ?? ''),
        minutes: Number(r?.minutes ?? 0),
        option_heart: Boolean(r?.option_heart),
        option_at: Boolean(r?.option_at),
        stores: r?.stores?.name ? { name: String(r.stores.name) } : null,
        payment,
        memoObj,
      }
      if (!row.id || !row.work_at) return null
      return row
    })
    .filter((x): x is WorkLogRow => Boolean(x))
}

function pickSavedByNameFromMemo(memo: any): string | null {
  const nick = memo?.savedBy?.nickname
  const login = memo?.savedBy?.login_id
  const name = memo?.savedBy?.name
  const s = (typeof nick === 'string' && nick.trim() ? nick : typeof name === 'string' && name.trim() ? name : typeof login === 'string' && login.trim() ? login : null)
  return s ? String(s) : null
}

function deriveLog(w: WorkLogRow): DerivedLog | null {
  const ts = new Date(w.work_at).getTime()
  if (!Number.isFinite(ts)) return null

  const timeText = toKstTime(new Date(w.work_at))
  const storeName = w.stores?.name ?? '가게 미지정'
  const memo = w.memoObj

  // ✅ v4
  if (memo && memo.v === 4) {
    const m = memo as MemoV4
    const steps = Array.isArray(m.steps) ? m.steps : []

    const jMinutes = steps.reduce((sum, s) => (s.kind === 'J' ? sum + (J_SVC as any)[s.key]?.minutes || 0 : sum), 0)
    const rMinutes = steps.reduce((sum, s) => (s.kind === 'R' ? sum + (R_SVC as any)[s.key]?.minutes || 0 : sum), 0)

    const heartCount = steps.reduce((sum, s) => sum + Math.max(0, Number((s as any).heart || 0)), 0)
    const atCount = steps.reduce((sum, s) => sum + Math.max(0, Number((s as any).at || 0)), 0)

    return {
      id: w.id,
      work_at: w.work_at,
      ts,
      timeText,
      storeName,
      baseLabel: m.baseLabel,
      minutes: Number(m.baseMinutes || w.minutes || 0),
      jUnits: Number.isFinite(Number(m.jUnits)) ? Number(m.jUnits) : jMinutes / 60,
      rUnits: Number.isFinite(Number(m.rUnits)) ? Number(m.rUnits) : rMinutes / 60,
      storeTotal: Number(m.storeTotal || 0),
      staffPay: Number(m.staffPay || 0),
      adminPay: Number(m.adminPay || 0),
      tip: Number(m.tip || 0),
      cash: Boolean(m.cash),
      misu: Boolean(m.misu),
      misuAmount: Number(m.misuAmount || 0),
      heartCount,
      atCount,
      savedByName: pickSavedByNameFromMemo(m),
    }
  }

  // v3
  if (memo && memo.v === 3) {
    const m = memo as MemoV3
    const jUnits = Number.isFinite(Number(m.jUnits)) ? Number(m.jUnits) : unitsFromCountsJ(m.jCounts)
    const rUnits = Number.isFinite(Number(m.rUnits)) ? Number(m.rUnits) : unitsFromCountsR(m.rCounts)
    return {
      id: w.id,
      work_at: w.work_at,
      ts,
      timeText,
      storeName,
      baseLabel: m.baseLabel,
      minutes: Number(m.baseMinutes || w.minutes || 0),
      jUnits,
      rUnits,
      storeTotal: Number(m.storeTotal || 0),
      staffPay: Number(m.staffPay || 0),
      adminPay: Number(m.adminPay || 0),
      tip: Number(m.tip || 0),
      cash: Boolean(m.cash),
      misu: Boolean(m.misu),
      misuAmount: Number(m.misuAmount || 0),
      heartCount: Math.max(0, Number(m.heartCount || 0)),
      atCount: Math.max(0, Number(m.atCount || 0)),
      savedByName: pickSavedByNameFromMemo(m),
    }
  }

  // v2
  if (memo && memo.v === 2) {
    const m = memo as MemoV2
    const baseMinutes = Number(m.baseMinutes || w.minutes || 0)
    return {
      id: w.id,
      work_at: w.work_at,
      ts,
      timeText,
      storeName,
      baseLabel: m.baseLabel,
      minutes: baseMinutes,
      jUnits: baseMinutes / 60,
      rUnits: 0,
      storeTotal: Number(m.storeTotal || 0),
      staffPay: Number(m.staffPay || 0),
      adminPay: Number(m.adminPay || 0),
      tip: Number(m.tip || 0),
      cash: Boolean(m.cash),
      misu: Boolean(m.misu),
      misuAmount: Number(m.misuAmount || 0),
      heartCount: m.heart ? 1 : 0,
      atCount: m.at ? 1 : 0,
      savedByName: pickSavedByNameFromMemo(m),
    }
  }

  // v1
  if (memo && memo.v === 1) {
    const m = memo as MemoV1
    const mins = Number(w.minutes || 0)
    return {
      id: w.id,
      work_at: w.work_at,
      ts,
      timeText,
      storeName,
      baseLabel: m.baseLabel,
      minutes: mins,
      jUnits: mins / 60,
      rUnits: 0,
      storeTotal: Number(m.storeTotal || 0),
      staffPay: Number(m.staffPay || 0),
      adminPay: Number(m.adminPay || 0),
      tip: Number(m.tip || 0),
      cash: Boolean(m.cash),
      misu: Boolean(m.misu),
      misuAmount: 0,
      heartCount: m.heart ? 1 : 0,
      atCount: m.at ? 1 : 0,
      savedByName: pickSavedByNameFromMemo(m),
    }
  }

  // fallback
  const fallbackStaff = Math.max(0, Number(w.payment?.amount ?? 0))
  const mins = Number(w.minutes || 0)
  return {
    id: w.id,
    work_at: w.work_at,
    ts,
    timeText,
    storeName,
    baseLabel: `${mins}분`,
    minutes: mins,
    jUnits: mins / 60,
    rUnits: 0,
    storeTotal: 0,
    staffPay: fallbackStaff,
    adminPay: 0,
    tip: 0,
    cash: false,
    misu: false,
    misuAmount: 0,
    heartCount: Boolean(w.option_heart) ? 1 : 0,
    atCount: Boolean(w.option_at) ? 1 : 0,
    savedByName: null,
  }
}

function parseMemo(memo: string | null): MemoV1 | MemoV2 | MemoV3 | MemoV4 | null {
  if (!memo) return null
  try {
    const obj = JSON.parse(memo)
    if (!obj || typeof obj !== 'object') return null
    if (obj.v === 4) return obj as MemoV4
    if (obj.v === 3) return obj as MemoV3
    if (obj.v === 2) return obj as MemoV2
    if (obj.v === 1) return obj as MemoV1
    return null
  } catch {
    return null
  }
}

/* ------------------------- compact line helpers ------------------------- */
function buildCompactLineFromDerived(d: DerivedLog) {
  const t = isoToKoTimeText(d.work_at)
  const n = buildSvcSummary(d.jUnits, d.rUnits)
  const addons = `${repeatChar('♡', d.heartCount)}${repeatChar('@', d.atCount)}`
  const misuMark = d.misu ? '■■' : ''
  return `${t} ${n}${addons ? ` ${addons}` : ''}${misuMark ? ` ${misuMark}` : ''}`.trim()
}

function formatStepForInput(s: Step) {
  const svcLabel = s.kind === 'J' ? J_SVC[s.key].label : R_SVC[s.key].label
  const addons = `${repeatChar('♡', s.heart)}${repeatChar('@', s.at)}`
  const misu = s.misu ? '■■' : ''
  return `${svcLabel}${addons ? ` ${addons}` : ''}${misu ? ` ${misu}` : ''}`.trim()
}

function repeatChar(ch: string, n: number) {
  const k = Math.max(0, Number(n || 0))
  if (k <= 0) return ''
  return new Array(k).fill(ch).join('')
}

function formatUnits(units: number, prefix: '' | '룸') {
  const u = Number.isFinite(units) ? units : 0
  const rounded = Math.round(u * 2) / 2
  if (rounded <= 0) return ''
  const intPart = Math.floor(rounded)
  const half = rounded - intPart >= 0.5
  if (intPart === 0 && half) return prefix ? `${prefix}반개` : '반개'
  if (!half) return prefix ? `${prefix}${intPart}개` : `${intPart}개`
  if (intPart === 1) return prefix ? `${prefix}1개반` : '1개반'
  return prefix ? `${prefix}${intPart}개반` : `${intPart}개반`
}

function buildSvcSummary(jUnits: number, rUnits: number) {
  const j = formatUnits(jUnits, '')
  const r = formatUnits(rUnits, '룸')
  if (j && r) return `${j} + ${r}`
  return j || r || '0개'
}

function unitsFromCountsJ(counts: Record<Exclude<JSvcKey, 'NONE'>, number>) {
  let minutes = 0
  for (const k of J_KEYS) {
    const c = Math.max(0, Number(counts?.[k] || 0))
    if (c <= 0) continue
    minutes += J_SVC[k].minutes * c
  }
  return minutes / 60
}

function unitsFromCountsR(counts: Record<Exclude<RSvcKey, 'NONE'>, number>) {
  let minutes = 0
  for (const k of R_KEYS) {
    const c = Math.max(0, Number(counts?.[k] || 0))
    if (c <= 0) continue
    minutes += R_SVC[k].minutes * c
  }
  return minutes / 60
}

/* ------------------------- time/date utils ------------------------- */
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
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function isoToKoTimeText(iso: string) {
  const d = new Date(iso)
  const h = d.getHours()
  const m = d.getMinutes()
  return `${h}시${String(m).padStart(2, '0')}분`
}

function hhmmToKoText(hm: string) {
  if (!hm) return '-'
  const [hh, mm] = hm.split(':').map((v) => Number(v))
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return hm
  return `${hh}시${String(mm).padStart(2, '0')}분`
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

function getKstDayRangeIso7(dateYmd: string) {
  const start = new Date(`${dateYmd}T07:00:00+09:00`)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}

function getKstRangeIso7(startYmd: string, endYmd: string) {
  const start = new Date(`${startYmd}T07:00:00+09:00`)
  const end = new Date(`${endYmd}T07:00:00+09:00`)
  end.setDate(end.getDate() + 1)
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}

/* ------------------------- cache utils ------------------------- */
function ssRead<T>(key: string, ttlMs: number): T | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const ts = Number(parsed?.ts ?? 0)
    if (!ts || Date.now() - ts > ttlMs) return null
    return parsed as T
  } catch {
    return null
  }
}

function ssWrite(key: string, value: any) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {}
}

/* ------------------------- 초성검색 ------------------------- */
const CHOSUNG = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'] as const

function isChosungString(q: string) {
  if (!q) return false
  for (const ch of q) if (!(CHOSUNG as readonly string[]).includes(ch)) return false
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
  return (CHOSUNG as readonly string[])[index] ?? null
}