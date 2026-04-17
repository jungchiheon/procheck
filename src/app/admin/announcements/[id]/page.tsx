'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabaseClient'
import { GlassCard } from '@/components/ui/GlassCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { ProButton } from '@/components/ui/ProButton'
import { cn } from '@/lib/cn'

type Post = {
  id: string
  title: string
  body: string
  created_at: string
  view_count: number
}

type Comment = {
  id: string
  body: string
  created_at: string
  author_nickname: string
}

export default function AdminAnnouncementDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = String(params?.id ?? '')

  const [post, setPost] = useState<Post | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setErr(null)
    const viewKey = `pc_admin_notice_view_${id}`
    const now = Date.now()
    const last = Number(sessionStorage.getItem(viewKey) ?? 0)
    const shouldPostView = now - last > 2000
    if (shouldPostView) sessionStorage.setItem(viewKey, String(now))
    try {
      const { data: sess } = await supabaseClient.auth.getSession()
      const token = sess.session?.access_token
      if (!token) throw new Error('세션 없음')
      const headers = { Authorization: `Bearer ${token}` }
      const res = await fetch(`/api/admin/announcements/${id}`, { headers })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error ?? '불러오기 실패')
      setPost(j.post ?? null)
      setComments(j.comments ?? [])
      if (shouldPostView && j.post) {
        void (async () => {
          const vr = await fetch(`/api/admin/announcements/${id}/view`, { method: 'POST', headers })
          const vj = await vr.json().catch(() => ({}))
          if (vr.ok && typeof vj?.view_count === 'number') {
            setPost((prev) => (prev ? { ...prev, view_count: vj.view_count } : prev))
          } else if (!vr.ok && typeof window !== 'undefined') {
            sessionStorage.removeItem(viewKey)
          }
        })()
      }
    } catch (e: any) {
      if (shouldPostView && typeof window !== 'undefined') sessionStorage.removeItem(viewKey)
      setErr(e?.message ?? '오류')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  const onSendComment = async () => {
    const text = reply.trim()
    if (!text || !id) return
    setSending(true)
    setErr(null)
    try {
      const { data: sess } = await supabaseClient.auth.getSession()
      const token = sess.session?.access_token
      if (!token) throw new Error('세션 없음')
      const res = await fetch(`/api/admin/announcements/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ body: text }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error ?? '댓글 실패')
      setReply('')
      await load()
    } catch (e: any) {
      setErr(e?.message ?? '오류')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader title="공지" backHref="/admin/announcements" />

      {loading && <div className="text-[12px] text-white/40">불러오는 중…</div>}
      {err && !loading && (
        <div className="rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-[12px] text-red-100/95">{err}</div>
      )}

      {post && (
        <>
          <GlassCard className="p-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-white/40">
              <span>조회 {post.view_count}</span>
              <span>
                {new Date(post.created_at).toLocaleString('ko-KR', {
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <h1 className="mt-2 text-[16px] font-semibold leading-snug text-white">{post.title}</h1>
            <div className={cn('mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-white/75')}>{post.body}</div>
          </GlassCard>

          <GlassCard className="overflow-hidden p-0">
            <div className="border-b border-white/10 px-3 py-2 text-[11px] text-white/45">댓글 {comments.length}</div>
            <div className="divide-y divide-white/[0.06]">
              {comments.length === 0 && (
                <div className="px-3 py-6 text-center text-[11px] text-white/35">댓글이 없습니다.</div>
              )}
              {comments.map((c) => (
                <div key={c.id} className="px-3 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11px] font-medium text-white/70">{c.author_nickname}</span>
                    <span className="text-[10px] text-white/30">
                      {new Date(c.created_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-white/60">{c.body}</p>
                </div>
              ))}
            </div>
            <div className="border-t border-white/10 p-3">
              <textarea
                className="min-h-[72px] w-full resize-y rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[12px] text-white outline-none placeholder:text-white/30 focus:border-white/20"
                placeholder="댓글"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
              />
              <div className="mt-2 flex justify-end">
                <ProButton type="button" disabled={sending || !reply.trim()} className="text-[12px]" onClick={() => void onSendComment()}>
                  {sending ? '등록 중…' : '등록'}
                </ProButton>
              </div>
            </div>
          </GlassCard>
        </>
      )}

      {!loading && !post && !err && (
        <button type="button" className="text-[12px] text-white/50 underline" onClick={() => router.push('/admin/announcements')}>
          목록
        </button>
      )}
    </div>
  )
}
