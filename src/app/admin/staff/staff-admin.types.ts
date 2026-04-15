export type StaffStatus = 'WORKING' | 'CAR_WAIT' | 'LODGE_WAIT' | 'OFF' | 'CHOICE_ING' | 'CHOICE_DONE'
/** 직원 소속 (에이원 / 고고) — DB `user_profiles.affiliation` */
export type StaffAffiliation = 'AONE' | 'GOGO'
export const AFFILIATION_LABEL: Record<StaffAffiliation, string> = {
  AONE: '에이원',
  GOGO: '고고',
}

export type StaffGroup = 'ON' | 'OFF'
export type TabKey = 'staff' | 'attendance' | 'misu' | 'settle'

export const GROUP_LABEL: Record<StaffGroup, string> = { ON: '출근', OFF: '퇴근' }
export const GROUP_ORDER: StaffGroup[] = ['ON', 'OFF']

export type StaffRow = {
  id: string
  login_id: string
  nickname: string
  last_checkin_at: string | null
  last_checkout_at: string | null
  work_status: StaffStatus | null
  affiliation: StaffAffiliation | null
}

export type SortMode = 'visit' | 'status'

export const VISIT_KEY = 'pc_admin_staff_last_visit_v1'
export const STAFF_CACHE_KEY = 'pc_admin_staff_rows_v2'
export const STAFF_CACHE_TTL_MS = 60 * 1000
export const PREFETCH_TOP_N = 6
export const PAGE_CHUNK = 40

// 미수 캐시
export const MISU_CACHE_KEY = 'pc_admin_misu_rows_v1'
export const MISU_CACHE_TTL_MS = 30 * 1000

export type MisuItem = {
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
export type SettleLog = {
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

export const SETTLE_ALL_TTL = 30 * 1000

/** 정산 처리 상태 (일별 JSON `user_profiles.settlement_day_status[ymd]`) */
export type SettleProcessKey = 'PENDING' | 'DEPOSIT_DONE' | 'CASH_DONE'
export const SETTLE_PROCESS_LABEL: Record<SettleProcessKey, string> = {
  PENDING: '처리전',
  DEPOSIT_DONE: '입금완료',
  CASH_DONE: '현금완료',
}
export const SETTLE_PROCESS_OPTIONS: SettleProcessKey[] = ['PENDING', 'DEPOSIT_DONE', 'CASH_DONE']

export type SettleProfileRow = {
  bank_name: string | null
  bank_account: string | null
  bank_holder: string | null
  settlement_traits: string | null
  settlement_day_status: Record<string, string> | null
}

/** 미수 구분 표기 (꽉 찬 네모 두 개) — 정산·미수 문자열 공통 */
export const MISU_MARK = '\u25FC\u25FC'
