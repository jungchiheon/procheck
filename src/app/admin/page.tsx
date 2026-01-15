// src/app/admin/page.tsx
'use client'

import { useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabaseClient'
import { GlassCard } from '@/components/ui/GlassCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { ProButton } from '@/components/ui/ProButton'
import { AdminNotificationBell } from '@/components/AdminNotificationBell' // 3-0) 알림벨 추가
import { ClipboardList, Users } from 'lucide-react'

export default function AdminHomePage() {
  // 3-1) 라우터
  const router = useRouter()

  // 3-2) 로그아웃
  const onLogout = async () => {
    await supabaseClient.auth.signOut()
    router.replace('/login')
  }

  return (
    <div className="space-y-6">
      {/* 3-3) 헤더 */}
      <PageHeader
        title="관리자 메인"
        right={
          <div className="flex items-center gap-2">
            {/* 3-3-1) 알림벨 */}
            <AdminNotificationBell />
            {/* 3-3-2) 로그아웃 */}
            <ProButton variant="ghost" onClick={onLogout}>
              로그아웃
            </ProButton>
          </div>
        }
      />

      {/* 3-4) 메인 카드 */}
      <GlassCard className="p-6">
        <div className="grid gap-3 sm:grid-cols-2">
          {/* 3-4-1) 업무 메모 */}
          <button
            onClick={() => router.push('/admin/work')}
            className="group rounded-2xl border border-white/10 bg-white/5 p-5 text-left hover:bg-white/10 transition"
            type="button"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl border border-white/10 bg-black/20 flex items-center justify-center">
                <ClipboardList className="h-5 w-5 text-white/80" />
              </div>
              <div>
                <div className="text-white font-semibold tracking-tight">업무 메모</div>
                <div className="text-sm text-white/55">자동 저장 메모장</div>
              </div>
            </div>
          </button>

          {/* 3-4-2) 직원 관리 */}
          <button
            onClick={() => router.push('/admin/staff')}
            className="group rounded-2xl border border-white/10 bg-white/5 p-5 text-left hover:bg-white/10 transition"
            type="button"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl border border-white/10 bg-black/20 flex items-center justify-center">
                <Users className="h-5 w-5 text-white/80" />
              </div>
              <div>
                <div className="text-white font-semibold tracking-tight">직원 관리</div>
                <div className="text-sm text-white/55">목록·추가·상세 관리</div>
              </div>
            </div>
          </button>
        </div>
      </GlassCard>
    </div>
  )
}
