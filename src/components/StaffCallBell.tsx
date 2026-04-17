'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabaseClient } from '@/lib/supabaseClient'
import { cn } from '@/lib/cn'
import { Bell, X } from 'lucide-react'

type CallRow = {
  id: number
  message: string | null
  created_at: string
  status?: string | null
  approved_minutes?: number | null
  approved_at?: string | null
  is_read?: boolean
}

function formatWhen(iso: string) {
  try {
    const d = new Date(iso)
    return d.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

function statusLabel(row: CallRow) {
  const s = (row.status ?? 'pending') as string
  if (s === 'approved') {
    const m = Number(row.approved_minutes ?? 0)
    return m > 0 ? `수락 · ${m}분` : '수락됨'
  }
  return '대기중'
}

export function StaffCallBell() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<CallRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [mounted, setMounted] = useState(false)
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({})

  useEffect(() => setMounted(true), [])

  const pendingCount = useMemo(
    () => items.filter((x) => (x.status ?? 'pending') === 'pending').length,
    [items]
  )

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true
    if (!silent) {
      setLoading(true)
    }
    setError(null)
    try {
      const { data: session } = await supabaseClient.auth.getSession()
      const token = session.session?.access_token
      if (!token) throw new Error('세션이 없습니다.')

      const res = await fetch('/api/staff/my-calls', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? '목록을 불러오지 못했습니다.')
      setItems((json.items ?? []) as CallRow[])
    } catch (e: any) {
      setError(e?.message ?? '오류')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load({ silent: true })
  }, [load])

  useEffect(() => {
    if (!open) return
    void load()
  }, [open, load])

  useEffect(() => {
    if (!open) return

    const update = () => {
      const r = btnRef.current?.getBoundingClientRect()
      if (!r) return
      const vw = window.innerWidth
      const vh = window.innerHeight
      const margin = 12
      const gap = 8
      const width = Math.min(380, vw - margin * 2)
      const desiredLeft = r.right - width
      const left = Math.min(Math.max(desiredLeft, margin), vw - margin - width)
      let top = r.bottom + gap
      const approxH = Math.min(480, Math.floor(vh * 0.7))
      if (top + approxH > vh - margin) {
        top = Math.max(margin, r.top - gap - approxH)
      }
      setPanelStyle({ position: 'fixed', top, left, width, zIndex: 9999 })
    }

    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])

  useEffect(() => {
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!open) return
      const t = e.target as Node | null
      if (!t) return
      if (btnRef.current?.contains(t)) return
      if (panelRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [open])

  const badgeText = pendingCount > 99 ? '99+' : pendingCount > 0 ? String(pendingCount) : ''

  const panel = open && mounted && (
    <div
      ref={panelRef}
      style={panelStyle}
      className={cn(
        'overflow-hidden rounded-xl border border-white/12 bg-zinc-950/95 backdrop-blur-xl shadow-2xl ring-1 ring-black/25'
      )}
    >
      <div className="border-b border-white/10 bg-black/25 px-3 py-2.5 sm:px-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-bold text-white">내 호출 내역</div>
            <div className="mt-0.5 text-[10px] text-white/40">대기중 = 관리자 확인 전 · 수락됨 = 처리 완료</div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-white/70 hover:bg-white/10"
            aria-label="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="max-h-[min(70vh,480px)] overflow-y-auto overscroll-contain px-0 py-1 [scrollbar-width:thin]">
        {loading && items.length === 0 && (
          <div className="px-3 py-8 text-center text-xs text-white/45">불러오는 중…</div>
        )}
        {error && (
          <div className="mx-3 my-2 rounded-lg border border-red-400/30 bg-red-500/10 px-2.5 py-2 text-xs text-red-100">{error}</div>
        )}
        {!loading && !error && items.length === 0 && (
          <div className="px-3 py-8 text-center text-xs text-white/45">아직 호출 기록이 없습니다.</div>
        )}
        {items.map((row) => {
          const pending = (row.status ?? 'pending') === 'pending'
          return (
            <div key={row.id} className="border-b border-white/[0.06] px-3 py-2.5 last:border-b-0 sm:px-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 text-[12px] text-white/90">{row.message || '호출'}</div>
                <span
                  className={cn(
                    'shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold',
                    pending ? 'border-amber-400/35 bg-amber-500/15 text-amber-100' : 'border-emerald-400/35 bg-emerald-500/15 text-emerald-100'
                  )}
                >
                  {statusLabel(row)}
                </span>
              </div>
              <div className="mt-1 text-[10px] text-white/40">{formatWhen(row.created_at)}</div>
              {!pending && row.approved_at && (
                <div className="mt-0.5 text-[10px] text-white/35">처리 시각: {formatWhen(row.approved_at)}</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/12 bg-white/5 text-white/85 hover:bg-white/10 transition"
        aria-label="호출 알림"
      >
        <Bell className="h-4 w-4" />
        {badgeText ? (
          <span className="absolute -right-0.5 -top-0.5 min-w-[16px] rounded-full bg-red-500 px-0.5 text-center text-[10px] font-bold leading-4 text-white">
            {badgeText}
          </span>
        ) : null}
      </button>
      {mounted && panel && createPortal(panel, document.body)}
    </>
  )
}
