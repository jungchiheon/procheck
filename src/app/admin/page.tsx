// src/app/admin/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabaseClient'
import { GlassCard } from '@/components/ui/GlassCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { ProButton } from '@/components/ui/ProButton'
import { AdminNotificationBell } from '@/components/AdminNotificationBell'
import { cn } from '@/lib/cn'
import { ClipboardList, Users, MessageCircle, PackageSearch } from 'lucide-react'

type UnreadRow = { room_id: number; unread_count: number }

export default function AdminHomePage() {
  const router = useRouter()
  const [chatUnread, setChatUnread] = useState(0)

  // 3-2) 로그아웃
  const onLogout = async () => {
    await supabaseClient.auth.signOut()
    router.replace('/login')
  }

  // 3-3) 채팅 unread total (버튼 배지)
  useEffect(() => {
    ;(async () => {
      const { data: u } = await supabaseClient.auth.getUser()
      const uid = u.user?.id
      if (!uid) return

      const { data, error } = await supabaseClient
        .rpc('get_chat_unread_counts', { p_uid: uid })
        .returns<UnreadRow[]>()

      if (error) return

      const rows = ((data ?? []) as UnreadRow[])
      const total = rows.reduce((sum, r) => sum + (Number(r.unread_count) || 0), 0)
      setChatUnread(total)
    })()
  }, [])

  return (
    <div className="space-y-6">
      <PageHeader
        title="관리자 메인"
        right={
          <div className="flex items-center gap-2">
            <AdminNotificationBell />
            <ProButton variant="ghost" onClick={onLogout}>
              로그아웃
            </ProButton>
          </div>
        }
      />

      <GlassCard className="p-6">
        <div className="grid gap-3 sm:grid-cols-2">
          {/* 업무 메모 */}
          <button
            onClick={() => router.push('/admin/work')}
            className="group rounded-2xl border border-white/10 bg-white/5 p-5 text-left hover:bg-white/10 transition"
            type="button"
          >
            <RowIcon icon={<ClipboardList className="h-5 w-5 text-white/80" />} title="업무 메모" desc="" />
          </button>

          {/* 직원 관리 */}
          <button
            onClick={() => router.push('/admin/staff')}
            className="group rounded-2xl border border-white/10 bg-white/5 p-5 text-left hover:bg-white/10 transition"
            type="button"
          >
            <RowIcon icon={<Users className="h-5 w-5 text-white/80" />} title="직원 관리" desc="" />
          </button>

          {/* 분실물 게시판 */}
          <button
            onClick={() => router.push('/admin/lost')}
            className="group rounded-2xl border border-white/10 bg-white/5 p-5 text-left hover:bg-white/10 transition"
            type="button"
          >
            <RowIcon icon={<PackageSearch className="h-5 w-5 text-white/80" />} title="분실물 게시판" desc="" />
          </button>

          {/* 1:1 채팅 (배지) */}
          <button
            onClick={() => router.push('/admin/chat')}
            className="group rounded-2xl border border-white/10 bg-white/5 p-5 text-left hover:bg-white/10 transition relative"
            type="button"
          >
            <RowIcon icon={<MessageCircle className="h-5 w-5 text-white/80" />} title="1:1 채팅" desc="" />

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

function RowIcon({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
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
