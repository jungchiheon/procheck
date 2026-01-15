'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabaseClient'
import { GlassCard } from '@/components/ui/GlassCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { ProButton } from '@/components/ui/ProButton'
import { cn } from '@/lib/cn'
import { Plus } from 'lucide-react'

type LostRow = {
  id: number
  title: string
  created_at: string
}

export default function AdminLostListPage() {
  const router = useRouter()
  const [rows, setRows] = useState<LostRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        // 1) 관리자 체크
        const { data: u } = await supabaseClient.auth.getUser()
        const uid = u.user?.id
        if (!uid) {
          router.replace('/login')
          return
        }

        const { data: prof } = await supabaseClient
          .from('user_profiles')
          .select('role,is_active')
          .eq('id', uid)
          .maybeSingle()

        if (!prof || !prof.is_active || prof.role !== 'admin') {
          router.replace('/login')
          return
        }

        // 2) 목록
        const { data, error } = await supabaseClient
          .from('lost_posts')
          .select('id,title,created_at')
          .order('created_at', { ascending: false })
          .limit(100)

        if (error) throw new Error(error.message)
        setRows((data ?? []) as LostRow[])
      } catch (e: any) {
        setError(e?.message ?? '오류')
      } finally {
        setLoading(false)
      }
    })()
  }, [router])

  return (
    <div className="space-y-6">
      <PageHeader
        title="분실물 게시판"
        subtitle="제목/내용/사진(옵션)"
        backHref="/admin"
        right={
          <Link href="/admin/lost/new">
            <ProButton>
              <Plus className="mr-2 h-4 w-4" />
              글쓰기
            </ProButton>
          </Link>
        }
      />

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

      {!loading && !error && (
        <GlassCard className="p-4">
          <div className="divide-y divide-white/10">
            {rows.length === 0 && (
              <div className="py-10 text-sm text-white/60 text-center">게시글이 없습니다.</div>
            )}

            {rows.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => router.push(`/admin/lost/${r.id}`)}
                className={cn('w-full text-left px-3 py-4 rounded-xl hover:bg-white/5 transition')}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-white font-semibold truncate">{r.title}</div>
                  <div className="text-xs text-white/45 shrink-0">{toMMDD(r.created_at)}</div>
                </div>
              </button>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  )
}

function toMMDD(iso: string) {
  const d = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}-${dd}`
}
