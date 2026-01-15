// src/app/admin/staff/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
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

type SortMode = 'name' | 'working'

export default function AdminStaffPage() {
  // 1-1) router
  const router = useRouter()

  // 1-2) 상태
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [sortMode, setSortMode] = useState<SortMode>('name')
  const [rows, setRows] = useState<StaffRow[]>([])

  // 1-3) 직원 추가 모달
  const [open, setOpen] = useState(false)
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [creating, setCreating] = useState(false)

  // 1-4) 최초 로드
  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        // 1-4-1) 세션/관리자 확인
        const { data: userData, error: userErr } = await supabaseClient.auth.getUser()
        if (userErr || !userData.user) throw new Error('1-4-1) 세션 없음: 다시 로그인 필요')

        const { data: prof, error: profErr } = await supabaseClient
          .from('user_profiles')
          .select('role, is_active')
          .eq('id', userData.user.id)
          .maybeSingle()

        if (profErr) throw new Error(`1-4-1) 관리자 프로필 조회 실패: ${profErr.message}`)
        if (!prof) throw new Error('1-4-1) user_profiles에 내 row 없음')
        if (!prof.is_active) throw new Error('1-4-1) 비활성 계정')
        if (prof.role !== 'admin') throw new Error('1-4-1) 관리자만 접근 가능')

        // 1-4-2) 직원 목록 로드
        await fetchStaff()
      } catch (e: any) {
        setError(e?.message ?? '1-4) 오류')
      } finally {
        setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 1-5) 직원 목록 로드 함수
  const fetchStaff = async () => {
    const { data, error } = await supabaseClient
      .from('user_profiles')
      .select('id, login_id, nickname, role, is_active, last_checkin_at, last_checkout_at')
      .eq('role', 'staff')
      .eq('is_active', true)

    if (error) throw new Error(`1-5) staff 목록 조회 실패: ${error.message}`)
    setRows((data as StaffRow[]) ?? [])
  }

  // 1-6) 근무중 판정
  const isWorking = (r: StaffRow) => {
    if (!r.last_checkin_at) return false
    if (!r.last_checkout_at) return true
    return new Date(r.last_checkin_at) > new Date(r.last_checkout_at)
  }

  // 1-7) 정렬된 목록
  const sorted = useMemo(() => {
    const list = [...rows]
    if (sortMode === 'working') {
      list.sort((a, b) => {
        const aw = isWorking(a) ? 0 : 1
        const bw = isWorking(b) ? 0 : 1
        if (aw !== bw) return aw - bw
        return (a.nickname || '').localeCompare(b.nickname || '', 'ko')
      })
      return list
    }
    list.sort((a, b) => (a.nickname || '').localeCompare(b.nickname || '', 'ko'))
    return list
  }, [rows, sortMode])

  // 1-8) 직원 추가 제출
  const onCreate = async () => {
    setError(null)
    setCreating(true)
    try {
      const id = loginId.trim()
      const pw = password
      const nn = nickname.trim()

      if (!id) throw new Error('1-8-1) 로그인ID를 입력하세요.')
      if (!pw) throw new Error('1-8-1) 비밀번호를 입력하세요.')
      if (!nn) throw new Error('1-8-1) 닉네임을 입력하세요.')

      const { data: session } = await supabaseClient.auth.getSession()
      const token = session.session?.access_token
      if (!token) throw new Error('1-8-2) 세션 없음: 다시 로그인 필요')

      const res = await fetch('/api/admin/create-staff', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ loginId: id, password: pw, nickname: nn }),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || '1-8-3) 직원 생성 실패')

      setOpen(false)
      setLoginId('')
      setPassword('')
      setNickname('')

      await fetchStaff()
    } catch (e: any) {
      setError(e?.message ?? '1-8) 오류')
    } finally {
      setCreating(false)
    }
  }

  // 1-9) 로그아웃
  const onLogout = async () => {
    await supabaseClient.auth.signOut()
    router.replace('/login')
  }

  return (
    <div className="space-y-6">
      {/* 2-1) 헤더(뒤로가기 이미 있음) */}
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

      {/* 2-2) 상단 탭: “관리자 메인” 제거 */}
      <div className="flex items-center gap-2">
        <span className="rounded-xl border border-white/12 bg-white/10 px-4 py-2 text-sm text-white font-semibold">
          직원 관리
        </span>
        <Link
          href="/admin/stores"
          className="rounded-xl border border-white/12 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10 transition"
        >
          가게 관리
        </Link>
      </div>

      {/* 2-3) 로딩/에러 */}
      {loading && (
        <GlassCard className="p-6">
          <div className="text-sm text-white/60">Loading...</div>
        </GlassCard>
      )}
      {error && (
        <GlassCard className="p-6">
          <div className="text-sm text-red-200">{error}</div>
        </GlassCard>
      )}

      {/* 2-4) 본문 */}
      {!loading && !error && (
        <GlassCard className="p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="text-white font-semibold tracking-tight">직원 목록</div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setSortMode('name')}
                className={cn(
                  'rounded-xl px-3 py-2 text-sm border transition',
                  sortMode === 'name'
                    ? 'bg-white text-zinc-900 border-white/0'
                    : 'bg-white/5 text-white/85 border-white/12 hover:bg-white/10'
                )}
                type="button"
              >
                가나다순
              </button>
              <button
                onClick={() => setSortMode('working')}
                className={cn(
                  'rounded-xl px-3 py-2 text-sm border transition',
                  sortMode === 'working'
                    ? 'bg-white text-zinc-900 border-white/0'
                    : 'bg-white/5 text-white/85 border-white/12 hover:bg-white/10'
                )}
                type="button"
              >
                출근순
              </button>
            </div>
          </div>

          <div className="mt-4 divide-y divide-white/10">
            {sorted.length === 0 && (
              <div className="py-6 text-sm text-white/60">직원이 없습니다.</div>
            )}

            {sorted.map((s) => {
              const working = isWorking(s)
              return (
                <button
                  key={s.id}
                  onClick={() => router.push(`/admin/staff/${s.id}`)}
                  className="w-full text-left py-4 hover:bg-white/5 transition px-2 rounded-xl"
                  type="button"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-white text-base font-semibold truncate">{s.nickname}</div>
                      <div className="mt-1 text-xs text-white/35 truncate">{s.login_id}</div>
                    </div>

                    <div
                      className={cn(
                        'shrink-0 rounded-full px-3 py-1 text-xs border',
                        working
                          ? 'border-emerald-300/30 bg-emerald-500/10 text-emerald-100'
                          : 'border-white/12 bg-white/5 text-white/60'
                      )}
                    >
                      {working ? '출근 중' : '대기/퇴근'}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </GlassCard>
      )}

      {/* 2-5) 플로팅 + 버튼 */}
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

      {/* 2-6) 직원 추가 모달 */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <button
            className="absolute inset-0 bg-black/60"
            onClick={() => setOpen(false)}
            type="button"
            aria-label="닫기"
          />
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
                  <ProButton
                    variant="ghost"
                    className="flex-1"
                    onClick={() => setOpen(false)}
                    type="button"
                  >
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
