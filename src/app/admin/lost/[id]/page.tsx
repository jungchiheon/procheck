'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabaseClient'
import { GlassCard } from '@/components/ui/GlassCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { ProButton } from '@/components/ui/ProButton'
import { Trash2 } from 'lucide-react'

type LostPost = {
  id: number
  title: string
  content: string
  image_url: string | null
  created_at: string
  created_by: string
}

export default function AdminLostDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = Number(params.id)

  const [post, setPost] = useState<LostPost | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const { data, error } = await supabaseClient
          .from('lost_posts')
          .select('id,title,content,image_url,created_at,created_by')
          .eq('id', id)
          .maybeSingle()

        if (error) throw new Error(error.message)
        if (!data) throw new Error('게시글을 찾을 수 없습니다.')
        setPost(data as LostPost)
      } catch (e: any) {
        setError(e?.message ?? '오류')
      } finally {
        setLoading(false)
      }
    })()
  }, [id])

  const onDelete = async () => {
    if (!post) return
    const ok = window.confirm('삭제할까요?')
    if (!ok) return

    setDeleting(true)
    try {
      const { error } = await supabaseClient.from('lost_posts').delete().eq('id', post.id)
      if (error) throw new Error(error.message)
      router.replace('/admin/lost')
    } catch (e: any) {
      setError(e?.message ?? '삭제 오류')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="분실물 상세"
        backHref="/admin/lost"
        right={
          <ProButton variant="ghost" onClick={onDelete} disabled={deleting}>
            <Trash2 className="mr-2 h-4 w-4" />
            {deleting ? '삭제 중...' : '삭제'}
          </ProButton>
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

      {!loading && !error && post && (
        <GlassCard className="p-6 space-y-4">
          <div>
            <div className="text-white text-lg font-semibold">{post.title}</div>
            <div className="mt-1 text-xs text-white/45">{toMMDD(post.created_at)}</div>
          </div>

          <div className="text-sm text-white/80 whitespace-pre-wrap leading-6">{post.content}</div>

          {post.image_url && (
            <div className="pt-2">
              <img
                src={post.image_url}
                alt="분실물 사진"
                className="w-full rounded-2xl border border-white/10"
              />
            </div>
          )}
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
