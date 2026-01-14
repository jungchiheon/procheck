// src/app/staff/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabaseClient'
import { GlassCard } from '@/components/ui/GlassCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { ProButton } from '@/components/ui/ProButton'
import { BadgeCheck, PhoneCall } from 'lucide-react'

type Profile = {
  id: string
  nickname: string
  role: 'admin' | 'staff'
  last_checkin_at: string | null
  last_checkout_at: string | null
}

export default function StaffHomePage() {
  // 3-3-1) 상태
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loadingAction, setLoadingAction] = useState(false)

  // 3-3-2) 프로필 로드(StaffShell이 role 가드는 하지만, 화면 데이터 필요)
  useEffect(() => {
    ;(async () => {
      const { data } = await supabaseClient.auth.getUser()
      if (!data.user) {
        router.replace('/login')
        return
      }

      const { data: p } = await supabaseClient
        .from('user_profiles')
        .select('id,nickname,role,last_checkin_at,last_checkout_at')
        .eq('id', data.user.id)
        .maybeSingle()

      if (!p) {
        router.replace('/login')
        return
      }

      setProfile(p as Profile)
    })()
  }, [router])

  // 3-3-3) 출근 상태
  const isWorking = useMemo(() => {
    if (!profile?.last_checkin_at) return false
    if (!profile.last_checkout_at) return true
    return new Date(profile.last_checkin_at) > new Date(profile.last_checkout_at)
  }, [profile])

  // 3-3-4) 출근
  const onCheckIn = async () => {
    if (!profile) return
    setLoadingAction(true)
    try {
      const now = new Date().toISOString()
      await supabaseClient.from('user_profiles').update({ last_checkin_at: now }).eq('id', profile.id)
      setProfile({ ...profile, last_checkin_at: now })
    } finally {
      setLoadingAction(false)
    }
  }

  // 3-3-5) 퇴근
  const onCheckOut = async () => {
    if (!profile) return
    setLoadingAction(true)
    try {
      const now = new Date().toISOString()
      await supabaseClient.from('user_profiles').update({ last_checkout_at: now }).eq('id', profile.id)
      setProfile({ ...profile, last_checkout_at: now })
    } finally {
      setLoadingAction(false)
    }
  }

  // 3-3-6) 호출
  const onCallAdmin = async () => {
    setLoadingAction(true)
    try {
      const { data: session } = await supabaseClient.auth.getSession()
      const token = session.session?.access_token
      if (!token) return alert('3-3-6) 세션이 없습니다. 다시 로그인 해주세요.')

      const res = await fetch('/api/staff/call-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: `${profile?.nickname ?? '직원'} 호출` }),
      })

      if (!res.ok) return alert('3-3-6) 호출 실패')
      alert('호출 전송됨')
    } finally {
      setLoadingAction(false)
    }
  }

  // 3-3-7) 로그아웃
  const onLogout = async () => {
    await supabaseClient.auth.signOut()
    router.replace('/login')
  }

  if (!profile) return null

  return (
    <div className="space-y-6">
      {/* 3-3-8) 헤더 */}
      <PageHeader
        title={profile.nickname}
        subtitle={`현재 상태: ${isWorking ? '출근 중' : '퇴근/대기'}`}
        right={
          <ProButton variant="ghost" onClick={onLogout}>
            로그아웃
          </ProButton>
        }
      />

      {/* 3-3-9) 상태 카드 */}
      <GlassCard className="p-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl border border-white/10 bg-black/20 flex items-center justify-center">
            <BadgeCheck className="h-5 w-5 text-white/80" />
          </div>
          <div>
            <div className="text-white font-semibold tracking-tight">근무 상태</div>
            <div className="text-sm text-white/55">
              {isWorking ? '출근 중입니다.' : '현재 근무 중이 아닙니다.'}
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <ProButton disabled={loadingAction || isWorking} onClick={onCheckIn}>
            출근하기
          </ProButton>

          <ProButton disabled={loadingAction || !isWorking} onClick={onCheckOut} variant="ghost">
            퇴근하기
          </ProButton>

          <ProButton disabled={loadingAction} onClick={onCallAdmin} variant="ghost">
            <PhoneCall className="mr-2 h-4 w-4" />
            관리자 호출
          </ProButton>
        </div>
      </GlassCard>
    </div>
  )
}
