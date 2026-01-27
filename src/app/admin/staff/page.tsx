'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabaseClient'
import { GlassCard } from '@/components/ui/GlassCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { ProButton } from '@/components/ui/ProButton'
import { cn } from '@/lib/cn'
import { AdminNotificationBell } from '@/components/AdminNotificationBell'
import { Plus, X } from 'lucide-react'

type StaffStatus = 'WORKING' | 'CAR_WAIT' | 'LODGE_WAIT' | 'OFF'
type StaffGroup = 'ON' | 'OFF' // ON=출근(출근중+차대기중+숙소대기중), OFF=퇴근

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
const STAFF_CACHE_TTL_MS = 60 * 1000 // 60초(웹 체감용)
const PREFETCH_TOP_N = 6
const PAGE_CHUNK = 40

export default function AdminStaffPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

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

  // “몇 분 전” 갱신
  useEffect(() => {
    const t = window.setInterval(() => setNowTick(Date.now()), 60_000)
    return () => window.clearInterval(t)
  }, [])

  // 방문기록/캐시 선로딩 (화면 즉시)
  useEffect(() => {
    // visitMap
    try {
      const raw = localStorage.getItem(VISIT_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') setVisitMap(parsed)
      }
    } catch {
      // ignore
    }

    // staff cache
    const cached = ssRead<{ ts: number; rows: StaffRow[] }>(STAFF_CACHE_KEY, STAFF_CACHE_TTL_MS)
    if (cached?.rows?.length) setRows(cached.rows)
  }, [])

  // 최초 동기화(웹 기준)
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

        // 렌더카운트 리셋
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

  // ✅ 그룹(출근/퇴근) 매핑: OFF만 퇴근, 나머지는 출근
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

  // ✅ 그룹(출근/퇴근) 우선 정렬 + 그룹 내부 정렬(변경순/상태순)
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
  }, [ordered.length])

  // 상위 일부 prefetch (렌더 안 막게 idle)
  useEffect(() => {
    const top = ordered.slice(0, PREFETCH_TOP_N)
    const key = top.map((x) => x.id).join(',')
    if (!key || key === lastPrefetchKeyRef.current) return
    lastPrefetchKeyRef.current = key

    const run = () => top.forEach((s) => router.prefetch(`/admin/staff/${s.id}`))
    idle(run)
  }, [router, ordered])

  const markVisitedIdle = (staffId: string) => {
    const next = { ...visitMap, [staffId]: Date.now() }
    idle(() => {
      setVisitMap(next)
      try {
        localStorage.setItem(VISIT_KEY, JSON.stringify(next))
      } catch {
        // ignore
      }
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
        body: JSON.stringify({ loginId: id, password: pw, nickname: nn }),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || '직원 생성 실패')

      setOpen(false)
      setLoginId('')
      setPassword('')
      setNickname('')

      // 즉시 반영을 위해 재동기화
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

  // ✅ 그룹(출근/퇴근)으로 묶기
  const grouped = useMemo(() => {
    const map = new Map<StaffGroup, StaffRow[]>()
    for (const g of GROUP_ORDER) map.set(g, [])
    for (const r of visible) map.get(groupOfRow(r))!.push(r)
    return map
  }, [visible])

  // ✅ 배지 스타일: 출근중/차대기중=초록, 숙소대기중=노랑, 퇴근=빨강
  const badgeClassByStatus = (st: StaffStatus) => {
    if (st === 'WORKING' || st === 'CAR_WAIT') return 'border-emerald-300/30 bg-emerald-500/10 text-emerald-100'
    if (st === 'LODGE_WAIT') return 'border-amber-300/30 bg-amber-500/10 text-amber-100'
    return 'border-red-400/30 bg-red-500/10 text-red-100'
  }

  const sectionTitleClass = (g: StaffGroup) => (g === 'ON' ? 'text-emerald-100' : 'text-red-100')

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

      <div className="flex items-center gap-2">
        <span className="rounded-xl border border-white/12 bg-white/10 px-4 py-2 text-sm text-white font-semibold">직원 관리</span>
        <span
          className={cn('rounded-xl border border-white/12 bg-white/5 px-4 py-2 text-sm', 'text-white/50 cursor-not-allowed')}
          title="준비 중"
        >
          매출 관리
        </span>

        <div className="flex-1" />
        <div className="text-xs text-white/40">{syncing ? '동기화 중…' : '\u00A0'}</div>
      </div>

      {error && (
        <GlassCard className="p-5">
          <div className="text-sm text-red-200">{error}</div>
        </GlassCard>
      )}

      <GlassCard className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-white font-semibold tracking-tight">직원 목록</div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSortMode('visit')}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm border transition',
                sortMode === 'visit'
                  ? 'bg-white text-zinc-900 border-white/0'
                  : 'bg-white/5 text-white/80 border-white/12 hover:bg-white/10'
              )}
              type="button"
            >
              변경순
            </button>
            <button
              onClick={() => setSortMode('status')}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm border transition',
                sortMode === 'status'
                  ? 'bg-white text-zinc-900 border-white/0'
                  : 'bg-white/5 text-white/80 border-white/12 hover:bg-white/10'
              )}
              type="button"
            >
              상태순
            </button>
          </div>
        </div>

        <div className="mt-3">
          {visible.length === 0 && (
            <div className="py-5 text-sm text-white/60">{syncing ? '불러오는 중…' : '직원이 없습니다.'}</div>
          )}

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
                            {/* ✅ 우측 동그란 배지: 출근중/차대기중/숙소대기중/퇴근 */}
                            <div
                              className={cn(
                                'rounded-full border whitespace-nowrap',
                                'px-2.5 py-1 text-[11px]',
                                badgeClassByStatus(st)
                              )}
                            >
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

          {/* sentinel */}
          <div ref={sentinelRef} className="h-8" />
        </div>
      </GlassCard>

      {/* + 버튼 */}
      <button
        onClick={() => setOpen(true)}
        className={cn(
          'fixed right-6 bottom-6 z-40',
          'h-14 w-14 rounded-2xl border border-white/12 bg-white text-zinc-900 shadow-2xl',
          'hover:bg-white/90 active:bg-white/80 transition'
        )}
        type="button"
        aria-label="직원 추가"
      >
        <Plus className="h-6 w-6 mx-auto" />
      </button>

      {/* 모달 */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <button className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} type="button" aria-label="닫기" />
          <div className="relative w-full max-w-md">
            <GlassCard className="p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-white text-lg font-semibold">직원 추가</div>
                  <div className="mt-1 text-sm text-white/55">로그인ID/비밀번호/닉네임</div>
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
    </div>
  )
}

/* utils */
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
    const ts = Number(parsed?.ts ?? 0)
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
    } catch {
      // ignore
    }
  })
}

function idle(fn: () => void) {
  if (typeof (window as any).requestIdleCallback === 'function') {
    ;(window as any).requestIdleCallback(fn, { timeout: 800 })
  } else {
    window.setTimeout(fn, 0)
  }
}
