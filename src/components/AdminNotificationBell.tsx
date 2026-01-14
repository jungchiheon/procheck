// src/components/admin/AdminNotificationBell.tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabaseClient } from '@/lib/supabaseClient'
import { cn } from '@/lib/cn'
import { Bell, Check } from 'lucide-react'

type NotiRow = {
  id: number
  type: string
  staff_id: string
  admin_id: string | null
  message: string | null
  is_read: boolean
  created_at: string
  user_profiles?: { nickname: string | null; login_id: string | null } | null
}

export function AdminNotificationBell() {
  // 1-1) 상태
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<NotiRow[]>([])
  const [error, setError] = useState<string | null>(null)

  // 1-2) 관리자 여부(간단 체크)
  const [isAdmin, setIsAdmin] = useState(false)

  // 1-3) dropdown 밖 클릭 감지
  const boxRef = useRef<HTMLDivElement | null>(null)

  // 1-4) 표시할 숫자 (99+)
  const badgeText = useMemo(() => {
    if (count <= 0) return ''
    if (count > 99) return '99+'
    return String(count)
  }, [count])

  // 1-5) 관리자 확인 + 초기 카운트 로드 + realtime 구독
  useEffect(() => {
    let channel: ReturnType<typeof supabaseClient.channel> | null = null

    ;(async () => {
      try {
        setError(null)

        // 1-5-1) 현재 유저 확인
        const { data: userData } = await supabaseClient.auth.getUser()
        const uid = userData.user?.id
        if (!uid) return

        // 1-5-2) profile에서 admin 여부 확인
        const { data: prof, error: profErr } = await supabaseClient
          .from('user_profiles')
          .select('id, role, is_active')
          .eq('id', uid)
          .maybeSingle()

        if (profErr) throw new Error(`1-5-2) profile 확인 실패: ${profErr.message}`)
        if (!prof || !prof.is_active || prof.role !== 'admin') {
          setIsAdmin(false)
          return
        }
        setIsAdmin(true)

        // 1-5-3) 초기 미확인 카운트
        await loadUnreadCount()

        // 1-5-4) Realtime: notifications insert 구독
        channel = supabaseClient
          .channel('admin-notifications')
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'notifications',
            },
            (payload) => {
              // 1-5-4-1) call + unread만 카운트
              const row = payload.new as any
              if (row?.type === 'call' && row?.is_read === false) {
                setCount((c) => c + 1)
              }
            }
          )
          .subscribe()
      } catch (e: any) {
        setError(e?.message ?? '1-5) 오류')
      }
    })()

    return () => {
      if (channel) supabaseClient.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 1-6) dropdown 외부 클릭 닫기
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!open) return
      const el = boxRef.current
      if (!el) return
      if (el.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  // 1-7) 미확인 카운트 로드
  const loadUnreadCount = async () => {
    // 1-7-1) type='call' & is_read=false
    const { count, error } = await supabaseClient
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'call')
      .eq('is_read', false)

    if (error) throw new Error(`1-7) unread count 실패: ${error.message}`)
    setCount(count ?? 0)
  }

  //  최근 목록 로드
const loadRecent = async () => {
  setLoading(true)
  setError(null)
  try {
    const { data, error } = await supabaseClient
      .from('notifications')
      .select(
        'id, type, staff_id, admin_id, message, is_read, created_at, user_profiles!notifications_staff_id_fkey(nickname, login_id)'
      )
      .eq('type', 'call')
      .order('created_at', { ascending: false })
      .limit(20)
      .returns<NotiRow[]>() // 1-2-2-1) 여기 추가

    if (error) throw new Error(`1-8) list 로드 실패: ${error.message}`)
    setItems(data ?? []) // 1-2-2-2) cast 제거
  } catch (e: any) {
    setError(e?.message ?? '1-8) 오류')
  } finally {
    setLoading(false)
  }
}


  // 1-9) 열기/닫기
  const onToggle = async () => {
    if (!isAdmin) return
    const next = !open
    setOpen(next)
    if (next) {
      await loadRecent()
      // 1-9-1) 열 때 카운트 최신화(동시성 보정)
      await loadUnreadCount()
    }
  }

  // 1-10) 모두 읽음 처리
  const onMarkAllRead = async () => {
    setError(null)
    setLoading(true)
    try {
      // 1-10-1) unread call -> read
      const { data: updated, error } = await supabaseClient
        .from('notifications')
        .update({ is_read: true })
        .eq('type', 'call')
        .eq('is_read', false)
        .select('id')

      if (error) throw new Error(`1-10) update 실패: ${error.message}`)

      // 1-10-2) UI 반영
      setCount(0)
      setItems((prev) => prev.map((x) => ({ ...x, is_read: true })))
    } catch (e: any) {
      setError(e?.message ?? '1-10) 오류')
    } finally {
      setLoading(false)
    }
  }

  // 1-11) 관리자 아니면 렌더링 안 함
  if (!isAdmin) return null

  return (
    <div ref={boxRef} className="relative">
      {/* 2-1) 벨 버튼 */}
      <button
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

        {/* 2-2) 배지 */}
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

      {/* 2-3) 드롭다운 */}
      {open && (
        <div
          className={cn(
            'absolute right-0 mt-2 w-80 overflow-hidden rounded-2xl',
            'border border-white/12 bg-zinc-950/95 backdrop-blur-xl shadow-2xl z-50'
          )}
        >
          {/* 2-3-1) 헤더 */}
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-white">호출 알림</div>
            <button
              onClick={onMarkAllRead}
              disabled={loading || count === 0}
              className={cn(
                'inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs border transition',
                'border-white/12 bg-white/5 text-white/80 hover:bg-white/10',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
              type="button"
            >
              <Check className="h-3.5 w-3.5" />
              모두 읽음
            </button>
          </div>

          <div className="h-px w-full bg-white/10" />

          {/* 2-3-2) 내용 */}
          <div className="max-h-96 overflow-y-auto">
            {loading && <div className="px-4 py-6 text-sm text-white/60">Loading...</div>}

            {!loading && error && (
              <div className="px-4 py-4 text-sm text-red-200">{error}</div>
            )}

            {!loading && !error && items.length === 0 && (
              <div className="px-4 py-6 text-sm text-white/60">최근 호출이 없습니다.</div>
            )}

            {!loading &&
              !error &&
              items.map((n) => {
                const who =
                  n.user_profiles?.nickname ||
                  n.user_profiles?.login_id ||
                  n.message ||
                  '호출'

                return (
                  <div
                    key={n.id}
                    className={cn(
                      'px-4 py-3 border-b border-white/10',
                      'hover:bg-white/5 transition',
                      !n.is_read ? 'bg-white/[0.03]' : ''
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm text-white font-semibold truncate">{who}</div>
                      <div className="text-[11px] text-white/45 shrink-0">
                        {toKstHm(n.created_at)}
                      </div>
                    </div>
                    {n.message && <div className="mt-1 text-xs text-white/55">{n.message}</div>}
                    {!n.is_read && (
                      <div className="mt-2 text-[11px] text-emerald-200/80">미확인</div>
                    )}
                  </div>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}

/* -------------------------
   3) 시간 포맷
------------------------- */
function toKstHm(iso: string) {
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}
