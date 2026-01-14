'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabaseClient'
import { ShieldCheck, User2, KeyRound } from 'lucide-react'

export default function LoginPage() {
  // 상태
  const router = useRouter()
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // 버튼 텍스트
  const buttonText = useMemo(() => (loading ? '로그인 중...' : '로그인'), [loading])

  const trySignIn = async (email: string) => {
    // 로그인
    const { error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    })
    return error
  }

  // 로그인 처리 (admin → staff 순서)
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      // 입력값 검증
      const id = loginId.trim()
      if (!id) throw new Error('아이디를 입력하세요.')
      if (!password) throw new Error('비밀번호를 입력하세요.')

      // 내부 이메일 후보 2개(supabase때문에 이메일형식써야함..)
      const adminEmail = `${id}@admin.internal`
      const staffEmail = `${id}@staff.internal`

      // admin으로 먼저 시도
      const err1 = await trySignIn(adminEmail)

      // 실패하면 staff로 시도
      if (err1) {
        const err2 = await trySignIn(staffEmail)
        if (err2) throw new Error(`로그인 실패: ${err2.message}`)
      }

      // 로그인 성공 후 유저 확인
      const { data: userData, error: userErr } = await supabaseClient.auth.getUser()
      if (userErr || !userData.user) throw new Error('세션 확인 실패')

      // authenticated 상태 → user_profiles 조회
      const { data: profile, error: profileErr } = await supabaseClient
        .from('user_profiles')
        .select('id, role, is_active')
        .eq('id', userData.user.id)
        .maybeSingle()

      if (profileErr) throw new Error(`프로필 조회 실패: ${profileErr.message}`)
      if (!profile) throw new Error('프로필이 없습니다. 관리자에게 문의하세요.')
      if (!profile.is_active) throw new Error('비활성화된 계정입니다.')

      // role에 따라 이동
      if (profile.role === 'admin') router.replace('/admin')
      else router.replace('/staff')
    } catch (err: any) {
      // 실패 시 잔여 세션 방지
      await supabaseClient.auth.signOut().catch(() => null)
      setError(err?.message ?? '오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* 배경 */}
      <div className="absolute inset-0 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-800" />
      <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
      <div className="absolute -bottom-32 -right-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />

      {/* 중앙 정렬 */}
      <div className="relative z-10 min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* 상단 영역 */}
          <div className="mb-6 flex items-center justify-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-white/90" />
            </div>
            <div className="text-white">
              <div className="text-xl font-semibold tracking-tight">ProCheck</div>
            </div>
          </div>

          {/* 2-8) 카드 */}
          <form
            onSubmit={onSubmit}
            className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl"
          >
            <div className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-lg font-semibold text-white">로그인</h1>
                  <p className="mt-1 text-sm text-white/60">
                    로그인ID와 비밀번호를 입력하세요.
                  </p>
                </div>
                <span className="text-xs text-white/50 border border-white/15 bg-white/5 rounded-full px-2 py-1">
                  Secure
                </span>
              </div>

              {/* 2-9) 입력 폼 */}
              <div className="mt-6 space-y-4">
                {/* 2-9-1) ID */}
                <div>
                  <label className="text-sm font-medium text-white/80">ID</label>
                  <div className="mt-2 flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 focus-within:border-white/25">
                    <User2 className="h-4 w-4 text-white/50" />
                    <input
                      className="w-full bg-transparent text-white placeholder:text-white/35 outline-none
           autofill:bg-transparent"

                      value={loginId}
                      onChange={(e) => setLoginId(e.target.value)}
                      placeholder="admin01 / staff03"
                      autoComplete="username"
                    />
                  </div>
                </div>

                {/* 2-9-2) Password */}
                <div>
                  <label className="text-sm font-medium text-white/80">Password</label>
                  <div className="mt-2 flex items-center gap-2 rounded-xl border border-white/12 bg-white/5 px-3 py-2.5
           focus-within:border-white/25 focus-within:bg-white/8 transition">
                    <KeyRound className="h-4 w-4 text-white/50" />
                    <input
                      className="w-full bg-transparent text-white placeholder:text-white/35 outline-none
           autofill:bg-transparent"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                    />
                  </div>
                </div>

                {/* 2-9-3) 에러 */}
                {error && (
                  <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                    {error}
                  </div>
                )}

                {/* 2-9-4) 버튼 */}
                <button
                  disabled={loading}
                  className="w-full rounded-xl bg-white text-zinc-900 font-semibold py-2.5 shadow-sm
                             hover:bg-white/90 active:bg-white/80 disabled:opacity-60 disabled:cursor-not-allowed
                             transition"
                >
                  {buttonText}
                </button>

                {/* 2-10) 하단 안내(과하지 않게) */}
                <div className="pt-2 text-xs text-white/45 leading-5">
                  관리자/직원 계정은 관리자 화면에서 생성됩니다. 문제가 있으면 관리자에게 문의하세요.
                </div>
              </div>
            </div>

            {/* 2-11) 카드 하단 라인 */}
            <div className="h-px w-full bg-white/10" />
            <div className="px-6 py-4 text-xs text-white/45">
              © ProCheck. All rights reserved.
            </div>
          </form>
        </div>
      </div>
      </div>
)
}
