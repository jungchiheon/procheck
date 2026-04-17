'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabaseClient'
import { GlassCard } from '@/components/ui/GlassCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { ProButton } from '@/components/ui/ProButton'
import { cn } from '@/lib/cn'
import { Plus } from 'lucide-react'

type Row = {
  id: string
  title: string
  created_at: string
  view_count: number
  comment_count: number
}

function formatListDate(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}.${m}.${day}.`
}

export default function AdminAnnouncementsPage() {
  const router = useRouter()
  const [items, setItems] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  const load = useCallback(async (p: number) => {
    setLoading(true)
    setErr(null)
    try {
      const { data: sess } = await supabaseClient.auth.getSession()
      const token = sess.session?.access_token
      if (!token) throw new Error('세션 없음')
      const res = await fetch(`/api/admin/announcements?page=${p}`, { headers: { Authorization: `Bearer ${token}` } })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error ?? '목록 오류')
      setItems(j.items ?? [])
      setPage(j.page ?? p)
      setTotalPages(Math.max(1, Number(j.totalPages) || 1))
      setTotal(Number(j.total) || 0)
    } catch (e: any) {
      setErr(e?.message ?? '오류')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(page)
  }, [page, load])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const t = title.trim()
    if (!t) return
    setSaving(true)
    setErr(null)
    try {
      const { data: sess } = await supabaseClient.auth.getSession()
      const token = sess.session?.access_token
      if (!token) throw new Error('세션 없음')
      const res = await fetch('/api/admin/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: t, body: body.trim() }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error ?? '등록 실패')
      setTitle('')
      setBody('')
      setComposeOpen(false)
      setPage(1)
      await load(1)
    } catch (e: any) {
      setErr(e?.message ?? '오류')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader title="공지사항" backHref="/admin" />

      {err && (
        <div className="rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-[12px] text-red-100/95">{err}</div>
      )}

      <GlassCard className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
          <span className="text-[11px] text-white/45">목록 {total > 0 ? `(${total})` : ''}</span>
          <button
            type="button"
            onClick={() => void load(page)}
            className="text-[11px] text-white/45 underline-offset-2 hover:text-white/70 hover:underline"
          >
            새로고침
          </button>
        </div>

        {loading && <div className="px-3 py-8 text-center text-[12px] text-white/40">불러오는 중…</div>}
        {!loading && items.length === 0 && (
          <div className="px-3 py-8 text-center text-[12px] text-white/40">글이 없습니다.</div>
        )}
        {!loading &&
          items.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => router.push(`/admin/announcements/${row.id}`)}
              className={cn(
                'flex w-full items-center gap-2 border-b border-white/[0.06] px-3 py-2 text-left last:border-b-0',
                'hover:bg-white/[0.04]'
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-baseline gap-1.5">
                  <span className="truncate text-[13px] text-white/90">{row.title}</span>
                  {row.comment_count > 0 ? (
                    <span className="shrink-0 text-[12px] font-medium text-rose-400/95">[{row.comment_count}]</span>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-[11px] tabular-nums text-white/45">
                <span>{formatListDate(row.created_at)}</span>
                <span className="text-white/40">{row.view_count}</span>
              </div>
            </button>
          ))}
      </GlassCard>

      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 py-2 text-[12px] text-white/55">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-2xl border border-white/10 bg-white/5 px-3 py-1.5 disabled:opacity-40"
          >
            이전
          </button>
          <span className="tabular-nums px-2">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-2xl border border-white/10 bg-white/5 px-3 py-1.5 disabled:opacity-40"
          >
            다음
          </button>
        </div>
      )}

      {composeOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center p-3 sm:items-center sm:p-4">
          <button type="button" aria-label="닫기" className="absolute inset-0 bg-black/60" onClick={() => setComposeOpen(false)} />
          <GlassCard className="relative w-full max-w-lg p-4">
            <div className="text-[11px] font-medium uppercase tracking-wide text-white/40">글 작성</div>
            <form onSubmit={onSubmit} className="mt-3 space-y-2">
              <input
                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[13px] text-white outline-none placeholder:text-white/30 focus:border-white/20"
                placeholder="제목"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <textarea
                className="min-h-[120px] w-full resize-y rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[13px] text-white outline-none placeholder:text-white/30 focus:border-white/20"
                placeholder="내용"
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setComposeOpen(false)}
                  className="rounded-lg border border-white/12 bg-white/5 px-3 py-1.5 text-[12px] text-white/75 hover:bg-white/10"
                >
                  취소
                </button>
                <ProButton type="submit" disabled={saving || !title.trim()} className="text-[12px]">
                  {saving ? '등록 중…' : '등록'}
                </ProButton>
              </div>
            </form>
          </GlassCard>
        </div>
      )}

      <button
        type="button"
        onClick={() => setComposeOpen(true)}
        className={cn(
          'fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full',
          'border border-white/15 bg-white/10 text-white/90 shadow-lg backdrop-blur',
          'hover:bg-white/15 active:scale-95 transition'
        )}
        aria-label="공지 작성"
      >
        <Plus className="h-5 w-5" />
      </button>
    </div>
  )
}
