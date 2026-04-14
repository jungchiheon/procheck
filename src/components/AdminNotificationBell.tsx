// src/components/AdminNotificationBell.tsx
'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabaseClient } from '@/lib/supabaseClient'
import { cn } from '@/lib/cn'
import { Bell, Check, Minus, Plus } from 'lucide-react'

type NotiRow = {
  id: number
  type: string
  staff_id: string
  admin_id: string | null
  message: string | null
  is_read: boolean
  created_at: string

  // 승인 기능(컬럼 없던 기존 row 대비: optional)
  status?: string | null
  approved_minutes?: number | null
  approved_at?: string | null
  approved_by?: string | null

  user_profiles?: { nickname: string | null; login_id: string | null } | null
}

export function AdminNotificationBell() {
  // 1-1) 상태
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<NotiRow[]>([])
  const [error, setError] = useState<string | null>(null)

  // 1-2) 승인 분 UI 상태: notiId -> minutes
  const [minutesMap, setMinutesMap] = useState<Record<number, number>>({})
  const [actionId, setActionId] = useState<number | null>(null)

  // 1-3) 관리자 여부
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminUid, setAdminUid] = useState<string | null>(null)

  // 1-4) refs (버튼 / 패널)
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  // 1-4-1) Portal 렌더링 준비
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // 1-4-2) 모바일 잘림 방지: fixed 패널 위치 계산
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({})

  // 1-5) 배지 텍스트
  const badgeText = useMemo(() => {
    if (count <= 0) return ''
    if (count > 99) return '99+'
    return String(count)
  }, [count])

  // 1-6) open일 때: 화면 밖(왼쪽/오른쪽) 절대 안 나가게 위치/폭 clamp
  useEffect(() => {
    if (!open) return

    const update = () => {
      const r = btnRef.current?.getBoundingClientRect()
      if (!r) return

      const vw = window.innerWidth
      const vh = window.innerHeight

      const margin = 12
      const gap = 8

      // 폭: 모바일이면 양쪽 마진 확보, 데스크탑이면 380px
      const width = Math.min(380, vw - margin * 2)

      // 기본: 버튼 오른쪽 끝에 패널 오른쪽을 맞춤
      const desiredLeft = r.right - width

      // ✅ clamp: left는 최소 margin, 최대 vw - margin - width
      const left = Math.min(Math.max(desiredLeft, margin), vw - margin - width)

      // top: 버튼 아래
      let top = r.bottom + gap

      // 아래가 너무 부족하면 위로 띄우기(안전장치)
      const approxPanelHeight = Math.min(520, Math.floor(vh * 0.75))
      if (top + approxPanelHeight > vh - margin) {
        top = Math.max(margin, r.top - gap - approxPanelHeight)
      }

      setPanelStyle({
        position: 'fixed',
        top,
        left,
        width,
        zIndex: 9999,
      })
    }

    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)

    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])

  // 1-7) dropdown 외부 클릭 닫기 (Portal이라 panelRef도 포함해서 검사)
  useEffect(() => {
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!open) return
      const target = e.target as Node | null
      if (!target) return

      const btn = btnRef.current
      const panel = panelRef.current

      if (btn && btn.contains(target)) return
      if (panel && panel.contains(target)) return

      setOpen(false)
    }

    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown, { passive: true })

    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown as any)
    }
  }, [open])

  // 1-8) 최초: 관리자 확인 + 카운트 + realtime
  useEffect(() => {
    let channel: ReturnType<typeof supabaseClient.channel> | null = null

    ;(async () => {
      try {
        setError(null)

        // 1-8-1) 현재 유저
        const { data: userData } = await supabaseClient.auth.getUser()
        const uid = userData.user?.id
        if (!uid) return
        setAdminUid(uid)

        // 1-8-2) admin 체크
        const { data: prof, error: profErr } = await supabaseClient
          .from('user_profiles')
          .select('id, role, is_active')
          .eq('id', uid)
          .maybeSingle()

        if (profErr) throw new Error(`profile 확인 실패: ${profErr.message}`)
        if (!prof || !prof.is_active || prof.role !== 'admin') {
          setIsAdmin(false)
          return
        }
        setIsAdmin(true)

        // 1-8-3) 초기 카운트
        await loadUnreadCount()

        // 1-8-4) Realtime insert
        channel = supabaseClient
          .channel('admin-notifications')
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'notifications' },
            () => {
              // call 알림만 카운트 갱신
              loadUnreadCount().catch(() => null)
              if (open) loadRecent().catch(() => null)
            }
          )
          .subscribe()
      } catch (e: any) {
        setError(e?.message ?? '초기화 오류')
      }
    })()

    return () => {
      if (channel) supabaseClient.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // 1-9) 미확인 카운트
  const loadUnreadCount = async () => {
    const { count, error } = await supabaseClient
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'call')
      .eq('is_read', false)

    if (error) throw new Error(`unread count 실패: ${error.message}`)
    setCount(count ?? 0)
  }

  // 1-10) 최근 목록 로드 (FK 조인 명시)
  const loadRecent = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabaseClient
        .from('notifications')
        .select(
          `
          id, type, staff_id, admin_id, message, is_read, created_at,
          status, approved_minutes, approved_at, approved_by,
          user_profiles!notifications_staff_id_fkey(nickname, login_id)
        `
        )
        .eq('type', 'call')
        .order('created_at', { ascending: false })
        .limit(20)
        .returns<NotiRow[]>()

      if (error) throw new Error(`list 로드 실패: ${error.message}`)

      const rows = data ?? []
      setItems(rows)

      // minutesMap 초기화(기존 승인분 반영)
      setMinutesMap((prev) => {
        const next = { ...prev }
        for (const r of rows) {
          if (next[r.id] == null) next[r.id] = Number(r.approved_minutes ?? 0)
        }
        return next
      })
    } catch (e: any) {
      setError(e?.message ?? '목록 로드 오류')
    } finally {
      setLoading(false)
    }
  }

  // 1-11) 열기/닫기
  const onToggle = async () => {
    if (!isAdmin) return
    const next = !open
    setOpen(next)
    if (next) {
      await loadRecent()
      await loadUnreadCount()
    }
  }

  // 1-12) 5분 단위 조절
  const bumpMinutes = (id: number, delta: number) => {
    setMinutesMap((prev) => {
      const cur = prev[id] ?? 0
      const next = Math.max(0, Math.min(300, cur + delta))
      return { ...prev, [id]: next }
    })
  }

  // 1-13) 승인 처리
  const onApprove = async (n: NotiRow) => {
    setActionId(n.id)
    setError(null)
    try {
      const minutes = minutesMap[n.id] ?? 0
      const nowIso = new Date().toISOString()

      const { error } = await supabaseClient
        .from('notifications')
        .update({
          status: 'approved',
          approved_minutes: minutes,
          approved_at: nowIso,
          approved_by: adminUid,
          is_read: true,
        })
        .eq('id', n.id)

      if (error) throw new Error(`승인 실패: ${error.message}`)

      await loadRecent()
      await loadUnreadCount()
    } catch (e: any) {
      setError(e?.message ?? '승인 오류')
    } finally {
      setActionId(null)
    }
  }

  // 1-14) 모두 읽음
  const onMarkAllRead = async () => {
    setError(null)
    setLoading(true)
    try {
      const { error } = await supabaseClient
        .from('notifications')
        .update({ is_read: true })
        .eq('type', 'call')
        .eq('is_read', false)

      if (error) throw new Error(`update 실패: ${error.message}`)

      setCount(0)
      setItems((prev) => prev.map((x) => ({ ...x, is_read: true })))
    } catch (e: any) {
      setError(e?.message ?? '모두 읽음 오류')
    } finally {
      setLoading(false)
    }
  }

  if (!isAdmin) return null

  const dropdown = (
    <div
      ref={panelRef}
      style={panelStyle}
      className={cn(
        'overflow-hidden rounded-xl',
        'border border-white/12 bg-zinc-950/95 backdrop-blur-xl shadow-2xl ring-1 ring-black/25'
      )}
    >
      <div className="border-b border-white/10 bg-black/25 px-3 py-2 sm:px-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-bold tracking-tight text-white">호출 알림</div>
            <div className="mt-0.5 text-[10px] text-white/40">직원 호출 · 승인 시 읽음 처리</div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={() => void loadRecent()}
              disabled={loading}
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold text-white/70 hover:bg-white/10 transition disabled:opacity-50"
              type="button"
            >
              {loading ? '…' : '갱신'}
            </button>
            <button
              onClick={() => void onMarkAllRead()}
              disabled={loading || count === 0}
              className={cn(
                'inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold text-white/80 transition',
                'hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40'
              )}
              type="button"
            >
              <Check className="h-3 w-3" strokeWidth={2.5} />
              전체 읽음
            </button>
          </div>
        </div>
      </div>

      <div className="max-h-[70vh] overflow-y-auto overscroll-contain [scrollbar-width:thin]">
        {loading && items.length === 0 && (
          <div className="px-3 py-8 text-center text-xs text-white/45">불러오는 중…</div>
        )}
        {!loading && error && (
          <div className="mx-3 my-2 rounded-lg border border-red-400/30 bg-red-500/10 px-2.5 py-2 text-xs text-red-100">{error}</div>
        )}
        {!loading && !error && items.length === 0 && (
          <div className="px-3 py-8 text-center text-xs text-white/45">최근 호출이 없습니다.</div>
        )}

        {!loading &&
          !error &&
          items.map((n) => {
            const who = n.user_profiles?.nickname || n.user_profiles?.login_id || n.message || '호출'
            const status = (n.status ?? 'pending') as string
            const isPending = status === 'pending'
            const isApproved = status === 'approved'
            const minutes = minutesMap[n.id] ?? 0

            return (
              <div key={n.id} className="border-b border-white/[0.06] px-3 py-2.5 last:border-b-0 sm:px-4">
                <div className="rounded-lg border border-white/10 bg-black/20 p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="truncate text-[13px] font-semibold text-white">{who}</span>
                        {!n.is_read && (
                          <span className="shrink-0 rounded border border-emerald-400/25 bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-200/90">
                            미확인
                          </span>
                        )}
                      </div>
                      <div className="mt-1 font-mono text-[11px] tabular-nums text-white/40">{toKstHm(n.created_at)}</div>
                      {n.message && (
                        <p className="mt-1.5 text-[11px] leading-snug text-white/55 break-words">{n.message}</p>
                      )}
                    </div>

                    <div
                      className={cn(
                        'shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-bold',
                        isApproved
                          ? 'border-emerald-400/35 bg-emerald-500/15 text-emerald-100'
                          : 'border-white/12 bg-white/5 text-white/55'
                      )}
                    >
                      {isApproved ? '승인' : '대기'}
                    </div>
                  </div>

                  {isPending && (
                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-white/8 pt-2.5">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => bumpMinutes(n.id, -5)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/12 bg-white/5 text-white/85 hover:bg-white/10 transition"
                          aria-label="5분 감소"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <div className="min-w-[4.5rem] text-center font-mono text-xs font-semibold tabular-nums text-white/90">
                          {minutes}분
                        </div>
                        <button
                          type="button"
                          onClick={() => bumpMinutes(n.id, +5)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/12 bg-white/5 text-white/85 hover:bg-white/10 transition"
                          aria-label="5분 증가"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => void onApprove(n)}
                        disabled={actionId === n.id}
                        className={cn(
                          'inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-[11px] font-bold transition',
                          'bg-white text-zinc-900 hover:bg-white/90 active:scale-[0.98]',
                          'disabled:cursor-not-allowed disabled:opacity-60'
                        )}
                      >
                        <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                        {actionId === n.id ? '처리 중…' : '승인'}
                      </button>
                    </div>
                  )}

                  {isApproved && (
                    <div className="mt-2 border-t border-white/8 pt-2 text-[11px] text-white/50">
                      승인 분{' '}
                      <span className="font-mono font-semibold tabular-nums text-emerald-200/90">{Number(n.approved_minutes ?? 0)}</span>
                      분
                      {n.approved_at && (
                        <span className="ml-2 font-mono text-[10px] text-white/35">· {toKstHm(n.approved_at)}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
      </div>
    </div>
  )

  return (
    <>
      {/* 벨 버튼 */}
      <button
        ref={btnRef}
        onClick={onToggle}
        className={cn(
          'relative inline-flex items-center justify-center',
          'h-10 w-10 rounded-xl border border-white/12 bg-white/5',
          'text-white/85 hover:bg-white/10 transition'
        )}
        type="button"
        aria-label="알림"
      >
        <Bell className="h-5 w-5" />
        {badgeText && (
          <span
            className={cn(
              'absolute -top-1 -right-1 min-w-[18px] h-[18px]',
              'px-1 rounded-full',
              'bg-red-500 text-white text-[11px] leading-[18px] text-center'
            )}
          >
            {badgeText}
          </span>
        )}
      </button>

      {/* ✅ Portal 드롭다운 */}
      {open && mounted ? createPortal(dropdown, document.body) : null}
    </>
  )
}

function toKstHm(iso: string) {
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}
