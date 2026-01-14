'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import ProBackground from '@/components/ui/ProBackground'
import { supabaseClient } from '@/lib/supabaseClient'

// staff 공통
export default function StaffShell({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    ;(async () => {
      // 로그인 확인
      const { data } = await supabaseClient.auth.getUser()
      if (!data.user) {
        router.replace('/login')
        return
      }

      // 스태프 확인
      const { data: profile } = await supabaseClient
        .from('user_profiles')
        .select('role')
        .eq('id', data.user.id)
        .maybeSingle()

      if (!profile || profile.role !== 'staff') {
        router.replace('/login')
        return
      }

      setReady(true)
    })()
  }, [router])

  if (!ready) {
    return (
      <ProBackground>
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="text-sm text-white/60">Loading...</div>
        </div>
      </ProBackground>
    )
  }

  return (
    <ProBackground>
      <div className="min-h-screen p-6">
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </div>
    </ProBackground>
  )
}
