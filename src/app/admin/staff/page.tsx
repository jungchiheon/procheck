// src/app/admin/staff/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabaseClient'
import { GlassCard } from '@/components/ui/GlassCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { ProButton } from '@/components/ui/ProButton'
import { cn } from '@/lib/cn'
import { AdminNotificationBell } from '@/components/AdminNotificationBell'
import { Plus, X } from 'lucide-react'

type StaffRow = {
  id: string
  login_id: string
  nickname: string
  role: 'admin' | 'staff'
  is_active: boolean
  last_checkin_at: string | null
  last_checkout_at: string | null
}

type SortMode = 'visit' | 'working'

const VISIT_KEY = 'pc_admin_staff_last_visit_v1'
const STAFF_CACHE_KEY = 'pc_admin_staff_rows_v1'
const STAFF_CACHE_TTL_MS = 30 * 1000 // 30초 캐시(체감 렌더 속도용)

export default function AdminStaffPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [rows, setRows] = useState<StaffRow[]>([])

  // ✅ 정렬 모드(변경순/출근순)
  const [sortMode, setSortMode] = useState<SortMode>('visit')

  // “몇 분 전” 갱신용(1분에 1번만)
  const [nowTick, setNowTick] = useState(Date.now())

  // 최근 방문(변경순) 저장소(localStorage)
  const [visitMap, setVisitMap] = useState<Record<string, number>>({})

  // 직원 추가 모달
  const [open, setOpen] = useState(false)
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    const t = window.setInterval(() => setNowTick(Date.now()), 60_000)
    return () => window.clearInterval(t)
  }, [])

  // localStorage 방문기록 로드
  useEffect(() => {
    try {
      const raw = localStorage.getItem(VISIT_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') setVisitMap(parsed)
    } catch {
      // ignore
    }
  }, [])

  // 최초 로드
  useEffect(() => {
    let alive = true

    ;(async () => {
      setLoading(true)
      setError(null)

      try {
        // 1) 세션/관리자 확인
        const { data: userData, error: userErr } = await supabaseClient.auth.getUser()
        if (userErr || !userData.user) throw new Error('로그인 만료')

        const { data: prof, error: profErr } = await supabaseClient
          .from('user_profiles')
          .select('role, is_active')
          .eq('id', userData.user.id)
          .maybeSingle()

        if (profErr) throw new Error(`관리자 프로필 조회 실패: ${profErr.message}`)
        if (!prof) throw new Error('user_profiles에 내 row 없음')
        if (!prof.is_active) throw new Error('비활성 계정')
        if (prof.role !== 'admin') throw new Error('관리자만 접근 가능')

        // 2) 캐시 우선 렌더
        const cached = readStaffCache()
        if (cached?.rows?.length) {
          if (!alive) return
          setRows(cached.rows)
          setLoading(false)
        }

        // 3) 최신 목록 로드(캐시 갱신)
        await fetchStaff({ alive })

        if (!alive) return
        setLoading(false)
      } catch (e: any) {
        if (!alive) return
        setError(e?.message ?? '오류')
        setLoading(false)
      }
    })()

    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const readStaffCache = (): { ts: number; rows: StaffRow[] } | null => {
    try {
      const raw = sessionStorage.getItem(STAFF_CACHE_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (!parsed?.ts || !Array.isArray(parsed?.rows)) return null
      if (Date.now() - Number(parsed.ts) > STAFF_CACHE_TTL_MS) return null
      return { ts: Number(parsed.ts), rows: parsed.rows as StaffRow[] }
    } catch {
      return null
    }
  }

  const writeStaffCache = (list: StaffRow[]) => {
    try {
      sessionStorage.setItem(STAFF_CACHE_KEY, JSON.stringify({ ts: Date.now(), rows: list }))
    } catch {
      // ignore
    }
  }

  // 직원 목록 로드
  const fetchStaff = async (opts?: { alive: boolean }) => {
    const { data, error } = await supabaseClient
      .from('user_profiles')
      .select('id, login_id, nickname, role, is_active, last_checkin_at, last_checkout_at')
      .eq('role', 'staff')
      .eq('is_active', true)

    if (error) throw new Error(`staff 목록 조회 실패: ${error.message}`)

    const list = (data as StaffRow[]) ?? []
    if (opts && !opts.alive) return

    setRows(list)
    writeStaffCache(list)
  }

  // 근무중 판정
  const isWorking = (r: StaffRow) => {
    if (!r.last_checkin_at) return false
    if (!r.last_checkout_at) return true
    return new Date(r.last_checkin_at) > new Date(r.last_checkout_at)
  }

  // 출근/퇴근 “상태 변화 시각” (출근 중이면 checkin, 아니면 checkout 우선)
  const lastActivityMs = (r: StaffRow) => {
    const working = isWorking(r)
    const baseIso = working ? r.last_checkin_at : (r.last_checkout_at ?? r.last_checkin_at)
    const t = baseIso ? new Date(baseIso).getTime() : 0
    return Number.isFinite(t) ? t : 0
  }

  // “몇 분 전” 라벨
  const sinceText = (r: StaffRow) => {
    const working = isWorking(r)
    const baseIso = working ? r.last_checkin_at : r.last_checkout_at ?? r.last_checkin_at
    if (!baseIso) return ''
    return formatSince(baseIso, nowTick)
  }

  // ✅ 정렬 적용(변경순/출근순)
  const sorted = useMemo(() => {
    const list = [...rows]

    if (sortMode === 'working') {
      list.sort((a, b) => {
        const aw = isWorking(a) ? 0 : 1
        const bw = isWorking(b) ? 0 : 1
        if (aw !== bw) return aw - bw // 출근중 우선
        const at = lastActivityMs(a)
        const bt = lastActivityMs(b)
        if (at !== bt) return bt - at // 최근 활동 우선
        return (a.nickname || '').localeCompare(b.nickname || '', 'ko')
      })
      return list
    }

    // visit(변경순)
    list.sort((a, b) => {
      const av = Number(visitMap[a.id] ?? 0)
      const bv = Number(visitMap[b.id] ?? 0)
      if (av !== bv) return bv - av
      return (a.nickname || '').localeCompare(b.nickname || '', 'ko')
    })

    return list
  }, [rows, visitMap, sortMode])

  // 상위 일부 prefetch
  useEffect(() => {
    const top = sorted.slice(0, 10)
    top.forEach((s) => router.prefetch(`/admin/staff/${s.id}`))
  }, [router, sorted])

  // 카드 클릭 시 방문기록 저장
  const markVisited = (staffId: string) => {
    const next = { ...visitMap, [staffId]: Date.now() }
    setVisitMap(next)
    try {
      localStorage.setItem(VISIT_KEY, JSON.stringify(next))
    } catch {
      // ignore
    }
  }

  // 직원 추가 제출
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
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ loginId: id, password: pw, nickname: nn }),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || '직원 생성 실패')

      setOpen(false)
      setLoginId('')
      setPassword('')
      setNickname('')

      await fetchStaff()
    } catch (e: any) {
      setError(e?.message ?? '오류')
    } finally {
      setCreating(false)
    }
  }

  // 로그아웃
  const onLogout = async () => {
    await supabaseClient.auth.signOut()
    router.replace('/login')
  }

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

      {/* 상단 탭 */}
      <div className="flex items-center gap-2">
        <span className="rounded-xl border border-white/12 bg-white/10 px-4 py-2 text-sm text-white font-semibold">
          직원 관리
        </span>
        <span
          className={cn(
            'rounded-xl border border-white/12 bg-white/5 px-4 py-2 text-sm',
            'text-white/50 cursor-not-allowed'
          )}
          title="준비 중"
        >
          매출 관리
        </span>
      </div>

      {loading && (
        <GlassCard className="p-5">
          <div className="text-sm text-white/60">Loading...</div>
        </GlassCard>
      )}
      {error && (
        <GlassCard className="p-5">
          <div className="text-sm text-red-200">{error}</div>
        </GlassCard>
      )}

      {!loading && !error && (
        <GlassCard className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-white font-semibold tracking-tight">직원 목록</div>

            {/* ✅ 변경순 / 출근순 토글 */}
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
                onClick={() => setSortMode('working')}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm border transition',
                  sortMode === 'working'
                    ? 'bg-white text-zinc-900 border-white/0'
                    : 'bg-white/5 text-white/80 border-white/12 hover:bg-white/10'
                )}
                type="button"
              >
                출근순
              </button>
            </div>
          </div>

          <div className="mt-3 divide-y divide-white/10">
            {sorted.length === 0 && <div className="py-5 text-sm text-white/60">직원이 없습니다.</div>}

            {sorted.map((s) => {
              const working = isWorking(s)
              const since = sinceText(s)

              return (
                <button
                  key={s.id}
                  onClick={() => {
                    markVisited(s.id)
                    router.push(`/admin/staff/${s.id}`)
                  }}
                  className={cn(
                    'w-full text-left rounded-xl transition',
                    'px-2 py-3 hover:bg-white/5' // ✅ 간격 줄임
                  )}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-white text-sm font-semibold truncate">{s.nickname}</div>
                      <div className="mt-0.5 text-[11px] text-white/35 truncate">{s.login_id}</div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      {since && <div className="text-[11px] text-white/45 whitespace-nowrap">{since}</div>}
                      <div
                        className={cn(
                          'rounded-full border whitespace-nowrap',
                          'px-2.5 py-1 text-[11px]', // ✅ 칩도 더 촘촘하게
                          working
                            ? 'border-emerald-300/30 bg-emerald-500/10 text-emerald-100'
                            : 'border-white/12 bg-white/5 text-white/60'
                        )}
                      >
                        {working ? '출근 중' : '대기/퇴근'}
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </GlassCard>
      )}

      {/* 플로팅 + 버튼 */}
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

      {/* 직원 추가 모달 */}
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

/* -------------------------
   시간 표시 유틸
------------------------- */

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
