// src/app/admin/work/page.tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabaseClient'
import { GlassCard } from '@/components/ui/GlassCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { ProButton } from '@/components/ui/ProButton'

export default function AdminWorkPage() {
  // 3-2-1) 상태
  const router = useRouter()
  const [adminId, setAdminId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  const [content, setContent] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const debounceRef = useRef<number | null>(null)

  // 3-2-2) 관리자 id 로드 + 메모 로드
  useEffect(() => {
    ;(async () => {
      const { data } = await supabaseClient.auth.getUser()
      if (!data.user) {
        router.replace('/login')
        return
      }

      // 3-2-2-1) 관리자 id 확보
      const { data: profile } = await supabaseClient
        .from('user_profiles')
        .select('id, role')
        .eq('id', data.user.id)
        .maybeSingle()

      if (!profile || profile.role !== 'admin') {
        router.replace('/login')
        return
      }

      setAdminId(profile.id)

      // 3-2-2-2) 메모 로드
      const { data: note } = await supabaseClient
        .from('admin_notes')
        .select('content')
        .eq('admin_id', profile.id)
        .maybeSingle()

      if (note?.content != null) setContent(note.content)
      setReady(true)
    })()
  }, [router])

  // 3-2-3) 디바운스 자동 저장
  useEffect(() => {
    if (!ready || !adminId) return
    if (debounceRef.current) window.clearTimeout(debounceRef.current)

    debounceRef.current = window.setTimeout(async () => {
      try {
        setStatus('saving')
        const { error } = await supabaseClient.from('admin_notes').upsert(
          { admin_id: adminId, content, updated_at: new Date().toISOString() },
          { onConflict: 'admin_id' }
        )
        if (error) throw error
        setStatus('saved')
        window.setTimeout(() => setStatus('idle'), 800)
      } catch {
        setStatus('error')
      }
    }, 500)

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
  }, [content, adminId, ready])

  // 3-2-4) 로그아웃
  const onLogout = async () => {
    await supabaseClient.auth.signOut()
    router.replace('/login')
  }

  // 3-2-5) 상태 텍스트
  const statusText = useMemo(() => {
    if (status === 'saving') return '저장 중...'
    if (status === 'saved') return '저장됨'
    if (status === 'error') return '저장 실패'
    return ''
  }, [status])

  if (!ready) return null

  return (
    <div className="space-y-6">
      {/* 3-2-6) 헤더 */}
      <PageHeader
        title="업무 메모"
        subtitle="자동 저장중입니다."
        backHref="/admin"
        right={
          <div className="flex items-center gap-3">
            <span className="text-sm text-white/55">{statusText}</span>
            <ProButton variant="ghost" onClick={onLogout}>
              로그아웃
            </ProButton>
          </div>
        }
      />

      {/* 3-2-7) 카드 */}
      <GlassCard className="p-6">
        <textarea
          className="h-[62vh] w-full resize-none rounded-2xl border border-white/10 bg-black/20 p-4
                     text-white placeholder:text-white/35 outline-none focus:border-white/25"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="메모를 입력하세요..."
        />
      </GlassCard>
    </div>
  )
}
