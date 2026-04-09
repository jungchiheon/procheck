// src/app/admin/page.tsx
'use client'

import { useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabaseClient'
import { GlassCard } from '@/components/ui/GlassCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { ProButton } from '@/components/ui/ProButton'
import { AdminNotificationBell } from '@/components/AdminNotificationBell'
import { cn } from '@/lib/cn'
import { Users, Store } from 'lucide-react'

export default function AdminHomePage() {
  const router = useRouter()

  const onLogout = async () => {
    await supabaseClient.auth.signOut()
    router.replace('/login')
  }

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
        {/* 중앙 정사각형 그리드: 좌 2칸 · 우 2칸, 모서리 둥글게 */}
        <div className="mx-auto w-full max-w-sm">
          <div
            className={cn(
              'grid grid-cols-2 grid-rows-2 gap-2 sm:gap-3',
              'aspect-square w-full',
              'rounded-3xl border border-white/10 bg-black/20 p-2 sm:p-3'
            )}
          >
            <button
              onClick={() => router.push('/admin/staff')}
              className={cn(
                'group flex min-h-0 flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-3',
                'text-center hover:bg-white/10 transition',
                'aspect-square'
              )}
              type="button"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/25">
                <Users className="h-5 w-5 text-white/85" />
              </div>
              <span className="text-sm font-semibold text-white">직원 관리</span>
            </button>

            <button
              onClick={() => router.push('/admin/stores')}
              className={cn(
                'group flex min-h-0 flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-3',
                'text-center hover:bg-white/10 transition',
                'aspect-square'
              )}
              type="button"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/25">
                <Store className="h-5 w-5 text-white/85" />
              </div>
              <span className="text-sm font-semibold text-white">가게 관리</span>
            </button>

            {/* 좌·우 하단 칸 (비워 두거나 나중에 메뉴 추가) */}
            <div
              className="aspect-square rounded-2xl border border-dashed border-white/10 bg-white/[0.02]"
              aria-hidden
            />
            <div
              className="aspect-square rounded-2xl border border-dashed border-white/10 bg-white/[0.02]"
              aria-hidden
            />
          </div>
        </div>
      </GlassCard>
    </div>
  )
}
