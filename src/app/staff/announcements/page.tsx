'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabaseClient'
import { GlassCard } from '@/components/ui/GlassCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { cn } from '@/lib/cn'

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

export default function StaffAnnouncementsPage() {
  const router = useRouter()
  const [items, setItems] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
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
      const res = await fetch(`/api/staff/announcements?page=${p}`, { headers: { Authorization: `Bearer ${token}` } })
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

  return (
    <div className="mx-auto max-w-lg space-y-3">
      <PageHeader title="공지사항" backHref="/staff" />

      {err && (
        <GlassCard className="border-white/10 bg-white/[0.03] p-3 text-[12px] text-white/55">{err}</GlassCard>
      )}

      <GlassCard className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
          <span className="text-[11px] text-white/45">게시글 {total > 0 ? `(${total})` : ''}</span>
          <button
            type="button"
            onClick={() => void load(page)}
            className="text-[11px] text-white/45 underline-offset-2 hover:text-white/70 hover:underline"
          >
            새로고침
          </button>
        </div>

        {loading && <div className="px-3 py-10 text-center text-[12px] text-white/40">불러오는 중…</div>}
        {!loading && items.length === 0 && !err && (
          <div className="px-3 py-10 text-center text-[12px] text-white/40">공지가 없습니다.</div>
        )}
        {!loading &&
          items.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => router.push(`/staff/announcements/${row.id}`)}
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
    </div>
  )
}
