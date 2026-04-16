'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabaseClient'
import { GlassCard } from '@/components/ui/GlassCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { ProButton } from '@/components/ui/ProButton'
import { cn } from '@/lib/cn'
import { Save, Trash2, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { MISU_MARK } from '../staff-admin.types'
import { v5DisplayLineFromTokens } from '../staff-admin.utils'

/* ------------------------- types ------------------------- */
type StaffStatus = 'WORKING' | 'CAR_WAIT' | 'LODGE_WAIT' | 'OFF' | 'CHOICE_ING' | 'CHOICE_DONE'

const STAFF_STATUS_LABEL: Record<StaffStatus, string> = {
  WORKING: '출근중',
  CAR_WAIT: '차대기중',
  LODGE_WAIT: '숙소대기중',
  OFF: '퇴근',
  CHOICE_ING: '초이스중',
  CHOICE_DONE: '초이스완료',
}

const ATT_SUB_STATUSES: StaffStatus[] = ['CHOICE_ING', 'CHOICE_DONE', 'CAR_WAIT']

/** 근태 모달: 퇴근이 아닌 경우 구형 WORKING/LODGE_WAIT → 초이스중으로 맞춤 */
function normalizeAttForModal(s: StaffStatus): StaffStatus {
  if (s === 'OFF') return 'OFF'
  if (s === 'CHOICE_ING' || s === 'CHOICE_DONE' || s === 'CAR_WAIT') return s
  return 'CHOICE_ING'
}

function isOnShiftStatus(s: StaffStatus | null | undefined): boolean {
  return s != null && s !== 'OFF'
}

function statusLabel(s: string | null | undefined): string {
  const k = s as StaffStatus
  return STAFF_STATUS_LABEL[k] ?? (s || '—')
}

type StaffAffiliation = 'AONE' | 'GOGO'
const AFFILIATION_LABEL: Record<StaffAffiliation, string> = { AONE: '에이원', GOGO: '고고' }

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
  affiliation?: StaffAffiliation | null
}

type StoreRow = { id: number; name: string; is_active: boolean }
type PaymentRow = { amount: number | null; memo: string | null; method: string | null; paid_at: string | null }

// ✅ 누가 저장했는지(관리자)
type SavedBy = { id: string; login_id: string; nickname: string; at: string }

const BTN_BASE = 'rounded-lg border border-white/12 bg-white/5 text-white/85 hover:bg-white/10 transition'
const BTN_ICON = `inline-flex items-center justify-center ${BTN_BASE}`
const BTN_TEXT_SM = `px-3 py-2 text-[11px] font-semibold ${BTN_BASE}`
const BTN_SEG = 'rounded-lg border px-3 py-2.5 text-sm font-semibold transition'
const STAFF_PREFILL_KEY = (staffId: string) => `pc_staff_prefill_${staffId}_v1`

// ------------------ memo versions ------------------
type JSvcKey = 'NONE' | 'J_HALF' | 'J_ONE' | 'J_ONE_HALF' | 'J_TWO'
type RSvcKey = 'NONE' | 'RT_HALF' | 'RT_ONE'

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
  savedBy?: SavedBy | null
}

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
  savedBy?: SavedBy | null
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
  savedBy?: SavedBy | null
}

/** v4(기존): steps 방식 */
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
  savedBy?: SavedBy | null
}

/** ✅ v5: “쌓는 방식” tokens */
type Token =
  | { t: 'J'; key: Exclude<JSvcKey, 'NONE'> }
  | { t: 'R'; key: Exclude<RSvcKey, 'NONE'> }
  | { t: 'HEART' }
  | { t: 'AT' }
  | { t: 'TIP'; amount: number } // +amount (원)
  | { t: 'MISU' } // 구분선(□□)
  | { t: 'CASH' } // 현금(이후 토큰은 2줄·순차 표기)

type MemoV5 = {
  v: 5
  tokens: Token[]
  cash: boolean
  // 계산 결과(저장 시 함께)
  minutes: number
  staffPay: number
  adminPay: number
  storeTotal: number
  tipTotal: number
  misuAmount: number
  misu: boolean
  baseLabel: string
  savedBy?: SavedBy | null
}

type AnyMemo = MemoV1 | MemoV2 | MemoV3 | MemoV4 | MemoV5 | null

type WorkLogRow = {
  id: number
  work_at: string
  minutes: number
  option_heart: boolean
  option_at: boolean
  stores: { name: string } | null
  payment: PaymentRow | null
  memoObj: AnyMemo
}

type DerivedLog = {
  id: number
  work_at: string
  ts: number
  timeText: string
  storeName: string
  // 표시
  displayLine: string
  // 정산값
  minutes: number
  staffPay: number
  adminPay: number
  tip: number
  cash: boolean
  misu: boolean
  misuAmount: number
  savedByName: string | null
}

/* ------------------------- constants / rules ------------------------- */
const STAFF_TTL = 2 * 60 * 1000
const LOGS_TTL = 30 * 1000
const STORES_TTL = 10 * 60 * 1000

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

  // ✅ v5 tokens
  const [tokens, setTokens] = useState<Token[]>([])
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
        const { data: prof } = await supabaseClient.from('user_profiles').select('id, login_id, nickname, role, is_active').eq('id', uid).maybeSingle()
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

  /* ------------------------- token builders (쌓기) ------------------------- */
  const pushToken = (t: Token) => {
    setError(null)
    setMessage(null)
    setTokens((p) => [...p, t])
  }

  const removeLastMatch = (pred: (t: Token) => boolean) =>
    setTokens((p) => {
      for (let i = p.length - 1; i >= 0; i--) {
        if (pred(p[i])) return [...p.slice(0, i), ...p.slice(i + 1)]
      }
      return p
    })

  // 서비스(우클릭 감소)
  const incJ = (k: Exclude<JSvcKey, 'NONE'>) => pushToken({ t: 'J', key: k })
  const decJ = (k: Exclude<JSvcKey, 'NONE'>) => removeLastMatch((x) => x.t === 'J' && (x as any).key === k)

  const incR = (k: Exclude<RSvcKey, 'NONE'>) => pushToken({ t: 'R', key: k })
  const decR = (k: Exclude<RSvcKey, 'NONE'>) => removeLastMatch((x) => x.t === 'R' && (x as any).key === k)

  // ✅ 하트/골뱅이: 서비스 없이도 가능(단독 토큰)
  const incHeart = () => pushToken({ t: 'HEART' })
  const decHeart = () => removeLastMatch((x) => x.t === 'HEART')

  const incAt = () => pushToken({ t: 'AT' })
  const decAt = () => removeLastMatch((x) => x.t === 'AT')

  // 팁(쌓기)
  const addTip = (amount: number) => {
    const a = Math.max(0, Number(amount || 0))
    if (!a) return
    pushToken({ t: 'TIP', amount: a })
  }

  const addTipFromPrompt = () => {
    const raw = window.prompt('팁 금액을 입력하세요 (원)', '')
    if (!raw) return
    const n = Number(String(raw).replace(/[^\d.-]/g, ''))
    if (!Number.isFinite(n) || n <= 0) {
      setError('유효한 팁 금액을 입력하세요.')
      return
    }
    addTip(Math.round(n))
  }

  /** 미수: 토글(없으면 추가 / 있으면 첫 MISU 제거) — 왔다갔다 입력 가능 */
  const toggleMisuSplit = () => {
    setError(null)
    setMessage(null)
    setTokens((p) => {
      const i = p.findIndex((x) => x.t === 'MISU')
      if (i >= 0) return [...p.slice(0, i), ...p.slice(i + 1)]
      return [...p, { t: 'MISU' }]
    })
  }

  /** 현금: 토큰 1개(순서 기준). 다시 누르면 제거 */
  const toggleCashToken = () => {
    setError(null)
    setMessage(null)
    setTokens((p) => {
      const i = p.findIndex((x) => x.t === 'CASH')
      if (i >= 0) return [...p.slice(0, i), ...p.slice(i + 1)]
      return [...p, { t: 'CASH' }]
    })
  }

  const resetAll = () => {
    setMessage(null)
    setError(null)
    setStoreQuery('')
    setSelectedStoreId('')
    setStoreDropdownOpen(false)
    setWorkTime(getTimeHHMM())
    setTokens([])
  }

  /* ------------------------- calc (tokens -> amounts + display) ------------------------- */
  const calc = useMemo(() => {
    const misuIdx = tokens.findIndex((x) => x.t === 'MISU')
    const before = misuIdx >= 0 ? tokens.slice(0, misuIdx) : tokens
    const after = misuIdx >= 0 ? tokens.slice(misuIdx + 1) : []

    const aggSegment = (seg: Token[]) => {
      let jMin = 0
      let rMin = 0
      let hearts = 0
      let ats = 0
      let tipTotal = 0

      // store/staff/admin 합산
      let store = 0
      let staff = 0
      let admin = 0

      for (const t of seg) {
        if (t.t === 'CASH' || t.t === 'MISU') continue
        if (t.t === 'J') {
          const svc = J_SVC[t.key]
          jMin += svc.minutes
          store += svc.store
          staff += svc.staff
          admin += svc.admin
        } else if (t.t === 'R') {
          const svc = R_SVC[t.key]
          rMin += svc.minutes
          store += svc.store
          staff += svc.staff
          admin += svc.admin
        } else if (t.t === 'HEART') {
          hearts += 1
          store += ADDON_HEART.store
          staff += ADDON_HEART.staff
          admin += ADDON_HEART.admin
        } else if (t.t === 'AT') {
          ats += 1
          store += ADDON_AT.store
          staff += ADDON_AT.staff
          admin += ADDON_AT.admin
        } else if (t.t === 'TIP') {
          const a = Math.max(0, Number(t.amount || 0))
          tipTotal += a
          // tip은 store/admin에 영향 X, staffPay에만 +
        }
      }

      const minutes = jMin + rMin
      const tipUnit = tipTotal > 0 ? Math.round(tipTotal / 1000) : 0
      const tipText = tipUnit > 0 ? `(${tipUnit})` : ''

      const svcText = `${formatUnitsKo(jMin / 60, '')}${formatUnitsKo(rMin / 60, '룸')}`.trim()
      const addons = `${repeatChar('@', ats)}${repeatChar('♡', hearts)}`
      const display = `${svcText}${addons}${tipText}`.trim()

      return { minutes, store, staff, admin, tipTotal, display }
    }

    const b = aggSegment(before)
    const a = aggSegment(after)

    // ✅ 전체 합계
    const minutes = b.minutes + a.minutes
    const storeTotal = b.store + a.store
    const adminPay = b.admin + a.admin
    const tipTotal = b.tipTotal + a.tipTotal
    const staffPay = b.staff + a.staff + tipTotal

    // ✅ misuAmount: “미수 버튼 누르기 직전까지” (before segment) 의 store 금액만
    const misuAmount = misuIdx >= 0 ? Math.max(0, b.store) : 0
    const misu = misuAmount > 0

    const line = v5DisplayLineFromTokens(tokens as unknown[])

    // baseLabel(저장용): 보기좋게 (서비스/룸만)
    const baseLabel = buildBaseLabelFromTokens(tokens)

    return {
      line,
      minutes,
      storeTotal,
      staffPay,
      adminPay,
      tipTotal,
      misuAmount,
      misu,
      misuIdx,
      before,
      after,
      baseLabel,
    }
  }, [tokens])

  // ✅ 버튼 배지 카운트(가시성)
  const badgeCounts = useMemo(() => {
    const count = { J_HALF: 0, J_ONE: 0, J_ONE_HALF: 0, J_TWO: 0, RT_HALF: 0, RT_ONE: 0, HEART: 0, AT: 0 }
    for (const t of tokens) {
      if (t.t === 'J') count[t.key] += 1
      if (t.t === 'R') count[t.key] += 1
      if (t.t === 'HEART') count.HEART += 1
      if (t.t === 'AT') count.AT += 1
    }
    return count
  }, [tokens])

  // 가게 검색
  const filteredStores = useMemo(() => {
    const rawQ = storeQuery.trim()
    const q = normalizeSearchText(rawQ)
    const active = stores.filter((s) => s.is_active)
    if (!q) return active
    const qSeq = toChosungKey(rawQ)
    return active
      .filter((s) => {
        const nameText = normalizeSearchText(s.name)
        if (nameText.includes(q)) return true
        if (!qSeq) return false
        return toChosungKey(s.name).includes(qSeq)
      })
      .sort((a, b) => {
        const aStarts = normalizeSearchText(a.name).startsWith(q) || (!!qSeq && toChosungKey(a.name).startsWith(qSeq)) ? 0 : 1
        const bStarts = normalizeSearchText(b.name).startsWith(q) || (!!qSeq && toChosungKey(b.name).startsWith(qSeq)) ? 0 : 1
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
        if (alive) setSelectedYmd(todayYmd)

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

  /** 직원목록(일괄 상태 설정)에서 저장한 가게/시간 프리셋 반영 */
  useEffect(() => {
    if (!staffId) return
    if (!stores.length) return
    try {
      const raw = localStorage.getItem(STAFF_PREFILL_KEY(staffId))
      if (!raw) return
      const parsed = JSON.parse(raw) as { storeId?: number; storeName?: string; workTime?: string } | null
      if (!parsed) return
      const byId = stores.find((s) => Number(s.id) === Number(parsed.storeId ?? 0))
      const picked = byId ?? stores.find((s) => s.name === String(parsed.storeName ?? ''))
      if (picked) {
        setSelectedStoreId(picked.id)
        setStoreQuery(picked.name)
      }
      if (typeof parsed.workTime === 'string' && /^\d{2}:\d{2}$/.test(parsed.workTime)) {
        setWorkTime(parsed.workTime)
      }
    } catch {}
  }, [staffId, stores])

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

  const onSave = async () => {
    setError(null)
    setMessage(null)

    if (!selectedStoreId) return setError('가게를 선택하세요.')
    if (!workTime) return setError('시작 시각을 선택하세요.')
    if (!calc.minutes || calc.minutes <= 0) return setError('서비스/옵션을 최소 1번 이상 눌러주세요.')

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
          option_heart: tokens.some((t) => t.t === 'HEART'),
          option_at: tokens.some((t) => t.t === 'AT'),
        })
        .select('id')
        .single()

      if (wErr) throw new Error(`근무 저장 실패: ${wErr.message}`)
      const workLogId = Number(wData?.id)
      if (!workLogId) throw new Error('workLogId missing')

      // ✅ v5 memo 생성
      const memoObj: MemoV5 = {
        v: 5,
        tokens: tokens.map((t) => normalizeToken(t)),
        cash: tokens.some((t) => t.t === 'CASH'),
        minutes: calc.minutes,
        staffPay: calc.staffPay,
        adminPay: calc.adminPay,
        storeTotal: calc.storeTotal,
        tipTotal: calc.tipTotal,
        misuAmount: calc.misuAmount,
        misu: calc.misu,
        baseLabel: calc.baseLabel,
        savedBy: savedBy ?? null,
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

      // reset input
      setTokens([])
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

  const bumpStartTimePlus5 = () => {
    setWorkTime(addMinutesToNowHHMM(5))
  }

  /* 다른 탭·관리자가 같은 직원 work_status를 바꾸면 화면 동기화 */
  useEffect(() => {
    if (!staffId) return
    const ch = supabaseClient
      .channel(`user_profiles_work_status_${staffId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'user_profiles', filter: `id=eq.${staffId}` },
        (payload) => {
          const row = payload.new as Record<string, unknown> | null
          if (!row || !('work_status' in row)) return
          const next = row.work_status as string | null
          if (next == null) return
          const st = next as StaffStatus
          setStaff((prev) => {
            if (!prev) return prev
            const merged = { ...prev, work_status: st }
            ssWrite(`pc_staff_${staffId}_v2`, { ts: Date.now(), staff: merged })
            return merged
          })
          setAttStatus(st)
        }
      )
      .subscribe()

    return () => {
      supabaseClient.removeChannel(ch)
    }
  }, [staffId])

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

  /* ------------------------- render ------------------------- */
  const titleName = staff?.nickname ?? '직원'
  const subId = staff?.login_id ?? ''
  const affText =
    staff?.affiliation === 'AONE' || staff?.affiliation === 'GOGO' ? AFFILIATION_LABEL[staff.affiliation] : ''
  const statusText = statusLabel((staff?.work_status as string) ?? attStatus)

  const summaryLine = (calc.line || '-').replace(/\s*\n\s*/g, ' ').trim()

  return (
    <div className="space-y-6">
      <PageHeader
        title={titleName}
        subtitle={`${subId}${affText ? ` · ${affText}` : ''}${statusText ? ` · ${statusText}` : ''}`}
        backHref="/admin/staff"
        right={
          <div className="flex items-center gap-2">
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
        <div className="overflow-visible">
          <div className="flex min-w-[30rem] flex-nowrap items-end gap-2.5">
          <div className="w-[9.25rem] shrink-0">
            <label className="text-[11px] font-medium text-white/80">가게 선택</label>
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
                onFocus={() => {
                  if (!storesLoading) setStoreDropdownOpen(true)
                }}
                onBlur={() => {
                  window.setTimeout(() => setStoreDropdownOpen(false), 120)
                }}
                placeholder={storesLoading ? '불러오는 중…' : ''}
                autoComplete="off"
              />
              {!storesLoading && storeDropdownOpen && (
                <div className={cn('absolute z-20 mt-2 w-full overflow-hidden rounded-xl', 'border border-white/12 bg-zinc-950/95 backdrop-blur-xl shadow-2xl')}>
                  <div className="max-h-60 overflow-y-auto py-1">
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
            {storesLoading && <div className="mt-1.5 text-[10px] text-white/45">가게 목록 로드 중…</div>}
          </div>

          <div className="min-w-0 flex-1">
            <label className="text-[11px] font-medium text-white/80">시작 시각</label>
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
                onClick={bumpStartTimePlus5}
                className="h-[34px] w-[40px] shrink-0 rounded-lg border border-white/12 bg-white/5 px-0 py-0 text-[11px] font-semibold text-white/80 hover:bg-white/10 transition"
                title="현재 시각 +5분"
              >
                +5
              </button>
            </div>
          </div>
        </div>
        </div>

        {/* ✅ 3x5 버튼 (쌓기) */}
        <div className="mt-4">
          <div className="grid grid-cols-3 gap-2">
            <CountButton label="2개" count={badgeCounts.J_TWO} onInc={() => incJ('J_TWO')} onDec={() => decJ('J_TWO')} />
            <CountButton label="♡" count={badgeCounts.HEART} onInc={incHeart} onDec={decHeart} />
            <GridButton onClick={() => addTip(100000)}>100,000</GridButton>

            <CountButton label="1개반" count={badgeCounts.J_ONE_HALF} onInc={() => incJ('J_ONE_HALF')} onDec={() => decJ('J_ONE_HALF')} />
            <CountButton label="@" count={badgeCounts.AT} onInc={incAt} onDec={decAt} />
            <GridButton onClick={() => addTip(50000)}>50,000</GridButton>

            <CountButton label="1개" count={badgeCounts.J_ONE} onInc={() => incJ('J_ONE')} onDec={() => decJ('J_ONE')} />
            <GridButton onClick={addTipFromPrompt}>팁 직접입력</GridButton>
            <GridButton onClick={() => addTip(10000)}>10,000</GridButton>

            <CountButton label="룸1개" count={badgeCounts.RT_ONE} onInc={() => incR('RT_ONE')} onDec={() => decR('RT_ONE')} />
            <CountButton label="룸반개" count={badgeCounts.RT_HALF} onInc={() => incR('RT_HALF')} onDec={() => decR('RT_HALF')} />
            <GridButton onClick={() => setTokens((p) => p.filter((x) => x.t !== 'TIP'))}>팁초기화</GridButton>

            <GridButton active={tokens.some((t) => t.t === 'CASH')} onClick={toggleCashToken}>현금</GridButton>
            <GridButton active={tokens.some((t) => t.t === 'MISU')} onClick={toggleMisuSplit}>미수</GridButton>
            <GridButton onClick={resetAll}>전체초기화</GridButton>
          </div>
        </div>

        {/* ✅ 정산요약 */}
        <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          <div className="text-[11px] text-white/45">정산요약</div>
          <div className="mt-1 text-[12px] font-semibold text-white/90 truncate" title={summaryLine}>
            {summaryLine}
          </div>
        </div>

        {message && (
          <div className="mt-4 rounded-xl border border-emerald-300/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{message}</div>
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
                className={cn('h-8 w-8', BTN_ICON)}
                aria-label="이전날"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="text-sm text-white/80">{selectedYmd}</div>
              <button
                type="button"
                onClick={() => moveDay(+1)}
                className={cn('h-8 w-8', BTN_ICON)}
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
            derivedLogs.map((d) => (
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
                    <div className="mt-0.5 text-[11px] text-white/45 truncate">저장: {d.savedByName ?? '-'}</div>
                    <div className="mt-1 text-xs text-white/70 whitespace-pre-line break-words line-clamp-4">{d.displayLine}</div>
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
                  <div className="mt-1 text-sm text-white/60">{detail.displayLine}</div>
                </div>
                <button
                  onClick={() => {
                    setDetailOpen(false)
                    setDetail(null)
                  }}
                  className={cn('p-2', BTN_ICON)}
                  type="button"
                  aria-label="닫기"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 space-y-2 text-sm">
                <RowKV k="저장" v={detail.savedByName ?? '-'} />
                <RowKV k="직원 정산" v={`${formatCurrency(detail.staffPay)}원`} />
                <RowKV k="관리자 정산" v={`${formatCurrency(detail.adminPay)}원`} />
                {detail.tip > 0 && <RowKV k="팁" v={`${formatCurrency(detail.tip)}원`} />}
                {detail.misu && detail.misuAmount > 0 && <RowKV k="미수금액" v={`${formatCurrency(detail.misuAmount)}원`} />}
                {(detail.cash || detail.misu) && <RowKV k="상태" v={`${detail.cash ? '현금' : ''}${detail.misu ? ' 미수' : ''}`.trim()} />}
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
                    {staff?.nickname ?? ''} · 현재: {statusLabel((staff?.work_status as string) ?? attStatus)}
                  </div>
                </div>
                <button
                  onClick={() => setAttOpen(false)}
                  className={cn('p-2', BTN_ICON)}
                  type="button"
                  aria-label="닫기"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (attStatus === 'OFF') setAttStatus('CHOICE_ING')
                  }}
                  className={cn(
                    BTN_SEG,
                    isOnShiftStatus(attStatus)
                      ? 'bg-white text-zinc-900 border-white/0'
                      : 'bg-white/5 text-white/85 border-white/12 hover:bg-white/10'
                  )}
                >
                  출근
                </button>
                <button
                  type="button"
                  onClick={() => setAttStatus('OFF')}
                  className={cn(
                    BTN_SEG,
                    attStatus === 'OFF'
                      ? 'bg-white text-zinc-900 border-white/0'
                      : 'bg-white/5 text-white/85 border-white/12 hover:bg-white/10'
                  )}
                >
                  퇴근
                </button>
              </div>

              {isOnShiftStatus(attStatus) && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {ATT_SUB_STATUSES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setAttStatus(s)}
                      className={cn(
                        'rounded-lg border px-2 py-2.5 text-xs font-semibold transition sm:text-sm',
                        attStatus === s ? 'bg-white text-zinc-900 border-white/0' : 'bg-white/5 text-white/85 border-white/12 hover:bg-white/10'
                      )}
                    >
                      {STAFF_STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
              )}

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
        BTN_SEG,
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
        'relative rounded-lg border px-3 py-2.5 text-sm font-semibold transition',
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

function parseMemo(memo: string | null): AnyMemo {
  if (!memo) return null
  try {
    const obj = JSON.parse(memo)
    if (!obj || typeof obj !== 'object') return null
    if (obj.v === 5) return obj as MemoV5
    if (obj.v === 4) return obj as MemoV4
    if (obj.v === 3) return obj as MemoV3
    if (obj.v === 2) return obj as MemoV2
    if (obj.v === 1) return obj as MemoV1
    return null
  } catch {
    return null
  }
}

function pickSavedByNameFromMemo(memo: any): string | null {
  const nick = memo?.savedBy?.nickname
  const login = memo?.savedBy?.login_id
  const name = memo?.savedBy?.name
  const s =
    (typeof nick === 'string' && nick.trim()
      ? nick
      : typeof name === 'string' && name.trim()
        ? name
        : typeof login === 'string' && login.trim()
          ? login
          : null) ?? null
  return s ? String(s) : null
}

/* ------------------------- derive log display ------------------------- */
function deriveLog(w: WorkLogRow): DerivedLog | null {
  const ts = new Date(w.work_at).getTime()
  if (!Number.isFinite(ts)) return null

  const timeText = toKstTime(new Date(w.work_at))
  const storeName = w.stores?.name ?? '가게 미지정'
  const memo = w.memoObj

  // ✅ v5(tokens) 표시
  if (memo && memo.v === 5) {
    const m = memo as MemoV5
    const line = v5DisplayLineFromTokens(m.tokens as unknown[])
    return {
      id: w.id,
      work_at: w.work_at,
      ts,
      timeText,
      storeName,
      displayLine: line,
      minutes: Number(m.minutes || w.minutes || 0),
      staffPay: Number(m.staffPay || 0),
      adminPay: Number(m.adminPay || 0),
      tip: Number(m.tipTotal || 0),
      cash: Boolean(m.cash) || (Array.isArray(m.tokens) && m.tokens.some((t) => (t as Token).t === 'CASH')),
      misu: Boolean(m.misu),
      misuAmount: Number(m.misuAmount || 0),
      savedByName: pickSavedByNameFromMemo(m),
    }
  }

  // fallback v4/v3/v2/v1: 최소 정보만
  const staffPay = Math.max(0, Number(w.payment?.amount ?? 0))
  return {
    id: w.id,
    work_at: w.work_at,
    ts,
    timeText,
    storeName,
    displayLine: memo ? '(구형 데이터)' : '-',
    minutes: Number(w.minutes || 0),
    staffPay,
    adminPay: 0,
    tip: 0,
    cash: false,
    misu: false,
    misuAmount: 0,
    savedByName: memo ? pickSavedByNameFromMemo(memo) : null,
  }
}

/* ------------------------- token -> display helpers ------------------------- */
function normalizeToken(t: Token): Token {
  // 저장 안전성(숫자 정리 등)
  if (t.t === 'TIP') return { t: 'TIP', amount: Math.max(0, Math.floor(Number(t.amount || 0))) }
  if (t.t === 'CASH') return { t: 'CASH' }
  return t
}

function buildBaseLabelFromTokens(tokens: Token[]) {
  // 서비스/룸만 보기 좋게
  let jMin = 0
  let rMin = 0
  for (const t of tokens) {
    if (t.t === 'MISU' || t.t === 'CASH') continue
    if (t.t === 'J') jMin += J_SVC[t.key].minutes
    if (t.t === 'R') rMin += R_SVC[t.key].minutes
  }
  const j = formatUnitsKo(jMin / 60, '')
  const r = formatUnitsKo(rMin / 60, '룸')
  return `${j}${r}`.trim() || '-'
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

/** 현재 시각 기준으로 분을 더한 HH:mm (시작 시각 +5 등) */
function addMinutesToNowHHMM(addMin: number) {
  const d = new Date()
  d.setMinutes(d.getMinutes() + addMin)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function toKstTime(d: Date) {
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
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

function formatCurrency(n: number) {
  return new Intl.NumberFormat('ko-KR').format(Math.max(0, Number(n || 0)))
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
const LEADING_JAMO = ['ᄀ', 'ᄁ', 'ᄂ', 'ᄃ', 'ᄄ', 'ᄅ', 'ᄆ', 'ᄇ', 'ᄈ', 'ᄉ', 'ᄊ', 'ᄋ', 'ᄌ', 'ᄍ', 'ᄎ', 'ᄏ', 'ᄐ', 'ᄑ', 'ᄒ'] as const

function normalizeChosungChar(ch: string) {
  const idx = (LEADING_JAMO as readonly string[]).indexOf(ch)
  if (idx >= 0) return (CHOSUNG as readonly string[])[idx] ?? ch
  return ch
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