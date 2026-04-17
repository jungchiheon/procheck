// src/app/staff/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabaseClient'
import { GlassCard } from '@/components/ui/GlassCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { ProButton } from '@/components/ui/ProButton'
import { cn } from '@/lib/cn'
import { BadgeCheck, PhoneCall, Megaphone, ChevronRight } from 'lucide-react'
import { StaffCallBell } from '@/components/StaffCallBell'

type Profile = {
  id: string
  nickname: string
  role: 'admin' | 'staff'
  last_checkin_at: string | null
  last_checkout_at: string | null
}

export default function StaffHomePage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loadingAction, setLoadingAction] = useState(false)

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

  const isWorking = useMemo(() => {
    if (!profile?.last_checkin_at) return false
    if (!profile.last_checkout_at) return true
    return new Date(profile.last_checkin_at) > new Date(profile.last_checkout_at)
  }, [profile])

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

  const onCallAdmin = async () => {
    setLoadingAction(true)
    try {
      const { data: session } = await supabaseClient.auth.getSession()
      const token = session.session?.access_token
      if (!token) return alert('세션이 없습니다. 다시 로그인 해주세요.')

      const res = await fetch('/api/staff/call-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: `${profile?.nickname ?? '직원'} 호출` }),
      })

      if (!res.ok) return alert('호출 실패')
      alert('전송됨')
    } finally {
      setLoadingAction(false)
    }
  }

  const onLogout = async () => {
    await supabaseClient.auth.signOut()
    router.replace('/login')
  }

  if (!profile) return null

  return (
    <div className="space-y-6">
      <PageHeader
        title={profile.nickname}
        subtitle={`현재 상태: ${isWorking ? '출근 중' : '퇴근/대기'}`}
        right={
          <div className="flex items-center gap-2">
            <StaffCallBell />
            <ProButton variant="ghost" onClick={onLogout}>
              로그아웃
            </ProButton>
          </div>
        }
      />

      <GlassCard className="p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-black/20">
            <BadgeCheck className="h-5 w-5 text-white/80" />
          </div>
          <div>
            <div className="font-semibold tracking-tight text-white">근무 상태</div>
            <div className="text-sm text-white/55">{isWorking ? '출근 중입니다.' : '현재 근무 중이 아닙니다.'}</div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <ProButton disabled={loadingAction || isWorking} onClick={onCheckIn}>
            출근하기
          </ProButton>

          <ProButton disabled={loadingAction || !isWorking} onClick={onCheckOut} variant="ghost">
            퇴근하기
          </ProButton>
        </div>

        <div className="mt-6 flex flex-col gap-3 rounded-xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5">
              <PhoneCall className="h-5 w-5 text-sky-200/90" />
            </div>
            <div className="font-semibold text-white">관리자 호출</div>
          </div>
          <ProButton disabled={loadingAction} onClick={onCallAdmin} className="w-full shrink-0 sm:w-auto">
            <PhoneCall className="mr-2 h-4 w-4" />
            호출
          </ProButton>
        </div>
      </GlassCard>

      <button
        type="button"
        onClick={() => router.push('/staff/announcements')}
        className={cn(
          'flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-left',
          'transition hover:bg-white/[0.07]'
        )}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/25">
            <Megaphone className="h-4 w-4 text-white/55" />
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-white/90">공지사항</div>
            <div className="text-[11px] text-white/40">읽기 전용</div>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-white/30" />
      </button>
    </div>
  )
}
