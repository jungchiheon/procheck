import { MISU_MARK, type SettleLog, type SettleProcessKey, type StaffAffiliation, type StaffRow } from './staff-admin.types'

export function parseDayStatusMap(raw: unknown): Record<string, string> | null {
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

export function normalizeProcessKey(v: string | undefined | null): SettleProcessKey {
  if (v === 'DEPOSIT_DONE' || v === 'CASH_DONE' || v === 'PENDING') return v
  return 'PENDING'
}

export function normalizeStaffRows(data: unknown): StaffRow[] {
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

export function ssRead<T>(key: string, ttlMs: number): T | null {
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

export function ssWrite(key: string, value: any) {
  idle(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(value))
    } catch {}
  })
}

export function idle(fn: () => void) {
  if (typeof (window as any).requestIdleCallback === 'function') {
    ;(window as any).requestIdleCallback(fn, { timeout: 800 })
  } else {
    window.setTimeout(fn, 0)
  }
}

export function parseMemoAny(memo: string | null) {
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
export function pickSavedByName(memoObj: any): string | null {
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

export function isoToHm(iso: string) {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

// 선택일 07:00 기준 날짜로 변환
export function toKstDateStringAt7(iso: string) {
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
 * - MISU_MARK(□□) 은 {t:'MISU'} 시점
 * - 팁은 {t:'TIP'} 시점에 (amount/1000) 표시
 * - 미수관리: “첫 □□ 까지”만 보여야 함
 */
const SVC_MINUTES: Record<string, number> = { J_HALF: 30, J_ONE: 60, J_ONE_HALF: 90, J_TWO: 120, RT_HALF: 30, RT_ONE: 60 }

/** 현금 토큼 이전: 기존처럼 합산 표기. 이후: 버튼 순서 그대로 (예: @(100)□□반개♡@) */
function v5SegTextAggregate(tokens: any[]): string {
  let jMin = 0
  let rMin = 0
  let hearts = 0
  let ats = 0
  let tipTotal = 0

  for (const t of tokens) {
    if (!t) continue
    if (t.t === 'MISU' || t.t === 'CASH') continue
    if (t.t === 'J') jMin += Math.max(0, Number(SVC_MINUTES[String(t.key)] ?? 0))
    if (t.t === 'R') rMin += Math.max(0, Number(SVC_MINUTES[String(t.key)] ?? 0))
    if (t.t === 'HEART') hearts += 1
    if (t.t === 'AT') ats += 1
    if (t.t === 'TIP') tipTotal += Math.max(0, Number(t.amount ?? 0))
  }

  const svc = `${formatUnitsKo(jMin / 60, '')}${formatUnitsKo(rMin / 60, '룸')}`.trim()
  const addons = `${repeatChar('@', ats)}${repeatChar('♡', hearts)}`
  const tipUnit = tipTotal > 0 ? Math.round(tipTotal / 1000) : 0
  const tipText = tipUnit > 0 ? `(${tipUnit})` : ''
  return `${svc}${addons}${tipText}`.trim()
}

/** 현금 이전(pre) 구간: 미수(□□)가 있으면 합산을 미수 앞/뒤로 나눠 표시 (미수만 사라지는 현상 방지) */
function v5PreCashAggregateWithMisu(pre: any[]): string {
  const misuIdx = pre.findIndex((x) => x?.t === 'MISU')
  if (misuIdx < 0) return v5SegTextAggregate(pre)
  const before = pre.slice(0, misuIdx)
  const after = pre.slice(misuIdx + 1)
  const b = v5SegTextAggregate(before)
  const a = v5SegTextAggregate(after)
  return `${b}${MISU_MARK}${a ? ` ${a}` : ''}`.trim()
}

function v5SequentialTokenPiece(t: any): string {
  if (!t || typeof t !== 'object') return ''
  if (t.t === 'CASH') return ''
  if (t.t === 'J') {
    const mins = Math.max(0, Number(SVC_MINUTES[String(t.key)] ?? 0))
    return formatUnitsKo(mins / 60, '')
  }
  if (t.t === 'R') {
    const mins = Math.max(0, Number(SVC_MINUTES[String(t.key)] ?? 0))
    return formatUnitsKo(mins / 60, '룸')
  }
  if (t.t === 'HEART') return '♡'
  if (t.t === 'AT') return '@'
  if (t.t === 'TIP') {
    const u = Math.round(Math.max(0, Number(t.amount ?? 0)) / 1000)
    return u > 0 ? `(${u})` : ''
  }
  if (t.t === 'MISU') return MISU_MARK
  return ''
}

/** v5 tokens 한 줄 표기 (현금 토큘이 있으면 2줄: 합산 / 현금 이후 순차) */
export function v5DisplayLineFromTokens(tokens: any[]): string {
  if (!Array.isArray(tokens) || tokens.length === 0) return '-'
  const cashIdx = tokens.findIndex((x) => x?.t === 'CASH')
  if (cashIdx >= 0) {
    const pre = tokens.slice(0, cashIdx)
    const post = tokens.slice(cashIdx + 1)
    const line1 = v5PreCashAggregateWithMisu(pre)
    const line2 = post.map((t) => v5SequentialTokenPiece(t)).join('')
    if (line2) {
      return `${line1}${line1 ? '\n' : ''}${line2}`.trim()
    }
    return line1 || '-'
  }

  const misuIdx = tokens.findIndex((x) => x?.t === 'MISU')
  const before = misuIdx >= 0 ? tokens.slice(0, misuIdx) : tokens
  const after = misuIdx >= 0 ? tokens.slice(misuIdx + 1) : []
  const b = v5SegTextAggregate(before)
  const a = v5SegTextAggregate(after)
  if (misuIdx < 0) return b || '-'
  return `${b}${MISU_MARK}${a ? ` ${a}` : ''}`.trim()
}

export function buildMisuOnlyText(args: { memoObj: any; misuAmount: number }) {
  const memoObj = args.memoObj
  const misuMark = args.misuAmount > 0 ? MISU_MARK : ''

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

    // 3) tip tokens (표시는 “시점” 유지: MISU 이전이면 □□ 앞, 이후면 □□ 뒤인데
    //    미수관리에서는 “□□까지 slice”만 보니까 => tip은 무조건 □□ 앞/혹은 □□ 직전에 있어야 함
    //    단, slice 내부에 TIP이 여러 번이면 합산해서 하나로 표기
    let tipUnitSum = 0

    for (const t of slice) {
      if (!t) continue
      if (t.t === 'CASH') continue
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

    // ✅ 미수관리: tip은 “미수 버튼 누르기 전”에 들어온 것만 slice에 존재 => □□ 앞
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

// ✅ 정산 탭 개별 라인(서비스/룸 합산 + addon + (tip) + □□) : “쌓는 방식” 반영
export function buildSettleLineFromMemo(memoObj: any) {
  if (!memoObj || typeof memoObj !== 'object') return '-'

  // v5 tokens 우선
  if (memoObj.v === 5 && Array.isArray(memoObj.tokens)) {
    return v5DisplayLineFromTokens(memoObj.tokens as any[]) || '-'
  }

  // v4 fallback (기존 memo)
  const tipRaw = Math.max(0, Number(memoObj?.tip ?? 0))
  const tipUnit = tipRaw > 0 ? Math.round(tipRaw / 1000) : 0
  const tipText = tipUnit > 0 ? `(${tipUnit})` : ''
  const misuMark = memoObj?.misu ? MISU_MARK : ''
  // v4에서는 “시점”이 없으니: 항상 □□ 앞에 붙여버림(기존 데이터용)
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

export function pickMisuBaseIso(memoObj: any, createdAt: string) {
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

export function formatCurrency(n: number) {
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

export function deriveSettleLog(r: any, staffMap: Map<string, string>): SettleLog | null {
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
export function getKstDateString() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDaysYmd(ymd: string, delta: number) {
  const d = new Date(`${ymd}T00:00:00+09:00`)
  d.setDate(d.getDate() + delta)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function getKstRangeIso7(startYmd: string, endYmd: string) {
  const start = new Date(`${startYmd}T07:00:00+09:00`)
  const end = new Date(`${endYmd}T07:00:00+09:00`)
  end.setDate(end.getDate() + 1)
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}
