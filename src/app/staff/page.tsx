// src/app/staff/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabaseClient'
import { GlassCard } from '@/components/ui/GlassCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { ProButton } from '@/components/ui/ProButton'
import { cn } from '@/lib/cn'
import { BadgeCheck, PhoneCall, MessageCircle, PackageSearch } from 'lucide-react'

type Profile = {
  id: string
  nickname: string
  role: 'admin' | 'staff'
  last_checkin_at: string | null
  last_checkout_at: string | null
}

type UnreadRow = { room_id: number; unread_count: number }

export default function StaffHomePage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loadingAction, setLoadingAction] = useState(false)
  const [chatUnread, setChatUnread] = useState(0)

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

      // 채팅 unread total
      const uid = data.user.id
      const { data: uc } = await supabaseClient
        .rpc('get_chat_unread_counts', { p_uid: uid })
        .returns<UnreadRow[]>()

      const rows = (uc ?? []) as UnreadRow[]
      const total = rows.reduce((sum, r) => sum + (Number(r.unread_count) || 0), 0)
      setChatUnread(total)
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
      alert('호출 전송됨')
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
          <ProButton variant="ghost" onClick={onLogout}>
            로그아웃
          </ProButton>
        }
      />

      {/* 근무 상태 */}
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

      {/* 요청: 근무상태 밑에 "한줄 2칸" (분실물 / 채팅) */}
      <GlassCard className="p-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            onClick={() => router.push('/staff/lost')}
            className="relative rounded-2xl border border-white/10 bg-white/5 p-5 text-left hover:bg-white/10 transition"
            type="button"
          >
            <RowIcon2 icon={<PackageSearch className="h-5 w-5 text-white/80" />} title="분실물 게시판" desc="" />
          </button>

          <button
            onClick={() => router.push('/staff/chat')}
            className="relative rounded-2xl border border-white/10 bg-white/5 p-5 text-left hover:bg-white/10 transition"
            type="button"
          >
            <RowIcon2 icon={<MessageCircle className="h-5 w-5 text-white/80" />} title="1:1 채팅" desc="" />

            {chatUnread > 0 && (
              <div className="absolute top-4 right-4 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[11px] flex items-center justify-center">
                {chatUnread > 99 ? '99+' : chatUnread}
              </div>
            )}
          </button>
        </div>
      </GlassCard>
    </div>
  )
}

function RowIcon2({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn('h-10 w-10 rounded-xl border border-white/10 bg-black/20 flex items-center justify-center')}>
        {icon}
      </div>
      <div>
        <div className="text-white font-semibold tracking-tight">{title}</div>
        <div className="text-sm text-white/55">{desc}</div>
      </div>
    </div>
  )
}
