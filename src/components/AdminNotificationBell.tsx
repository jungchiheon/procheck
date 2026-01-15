// src/components/AdminNotificationBell.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabaseClient } from '@/lib/supabaseClient'
import { cn } from '@/lib/cn'
import { Bell, Check, Minus, Plus } from 'lucide-react'

/* -------------------------
   1) 타입
------------------------- */
type NotiRow = {
  id: number
  type: string
  staff_id: string
  admin_id: string | null
  message: string | null
  is_read: boolean
  created_at: string

  // 1-1) 승인 기능 컬럼
  status: 'pending' | 'approved' | 'rejected' | string
  approved_minutes: number
  approved_at: string | null
  approved_by: string | null

  // 1-2) staff join (FK: notifications.staff_id -> user_profiles.id)
  user_profiles?: { nickname: string | null; login_id: string | null } | null
}

export function AdminNotificationBell() {
  // 2-1) 상태
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotiRow[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  // 2-2) 승인 분(로컬 UI 상태): notiId -> minutes
  const [minutesMap, setMinutesMap] = useState<Record<number, number>>({})
  const [adminUid, setAdminUid] = useState<string | null>(null)

  const [loading, setLoading] = useState(false)
  const [actionId, setActionId] = useState<number | null>(null)

  // 2-3) 초기 로드 + 리얼타임
  useEffect(() => {
    ;(async () => {
      // 2-3-1) 관리자 uid 확보(approved_by 저장용)
      const { data: u } = await supabaseClient.auth.getUser()
      setAdminUid(u.user?.id ?? null)

      // 2-3-2) 초기 로드
      await refresh()
    })()

    // 2-3-3) Realtime: notifications insert 구독
    const channel = supabaseClient
      .channel('admin_notifications_bell')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => {
          // 2-3-3-1) 신규 알림 반영(필요하면 type 필터)
          const row = payload.new as any

          // 2-3-3-2) 호출 알림만 카운트/리스트 반영
          if (row?.type === 'call') {
            setUnreadCount((c) => c + 1)
            // 2-3-3-3) 리스트 최상단에 추가(상세는 refresh로 통일해도 됨)
            refresh().catch(() => null)
          }
        }
      )
      .subscribe()

    return () => {
      supabaseClient.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 2-4) 초기/갱신 로드
  const refresh = async () => {
    setLoading(true)
    try {
      // 2-4-1) 미확인 개수
      const { count, error: cErr } = await supabaseClient
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('type', 'call')
        .eq('is_read', false)

      if (!cErr) setUnreadCount(count ?? 0)

      // 2-4-2) 최근 호출 리스트(최대 20)
      const { data, error } = await supabaseClient
        .from('notifications')
        .select(
          `
          id, type, staff_id, admin_id, message, is_read, created_at,
          status, approved_minutes, approved_at, approved_by,
          user_profiles(nickname, login_id)
        `
        )
        .eq('type', 'call')
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) throw new Error(`2-4-2) load failed: ${error.message}`)

      const rows = (data ?? []) as unknown as NotiRow[]
      setItems(rows)

      // 2-4-3) minutesMap 초기화(기존 승인분 있으면 반영)
      setMinutesMap((prev) => {
        const next = { ...prev }
        for (const r of rows) {
          if (next[r.id] == null) next[r.id] = r.approved_minutes ?? 0
        }
        return next
      })
    } finally {
      setLoading(false)
    }
  }

  // 2-5) 5분 단위 +/- (min 0, max 300 예시)
  const bumpMinutes = (id: number, delta: number) => {
    setMinutesMap((prev) => {
      const cur = prev[id] ?? 0
      const next = Math.max(0, Math.min(300, cur + delta))
      return { ...prev, [id]: next }
    })
  }

  // 2-6) 승인 처리
  const approve = async (n: NotiRow) => {
    setActionId(n.id)
    try {
      const minutes = minutesMap[n.id] ?? 0

      // 2-6-1) 승인 update
      const { error } = await supabaseClient
        .from('notifications')
        .update({
          status: 'approved',
          approved_minutes: minutes,
          approved_at: new Date().toISOString(),
          approved_by: adminUid,
          is_read: true, // 2-6-2) 승인하면 읽음 처리
        })
        .eq('id', n.id)

      if (error) throw new Error(`2-6) approve failed: ${error.message}`)

      // 2-6-3) 로컬 상태 반영
      setItems((prev) =>
        prev.map((x) =>
          x.id === n.id
            ? {
                ...x,
                status: 'approved',
                approved_minutes: minutes,
                approved_at: new Date().toISOString(),
                approved_by: adminUid,
                is_read: true,
              }
            : x
        )
      )

      // 2-6-4) unreadCount 갱신
      await refresh()
    } finally {
      setActionId(null)
    }
  }

  // 2-7) 시간 표시
  const fmtTime = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleString('ko-KR', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  }

  // 2-8) 배지 표시
  const badgeText = useMemo(() => (unreadCount > 99 ? '99+' : String(unreadCount)), [unreadCount])

  return (
    <div className="relative">
      {/* 3-1) 벨 버튼 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex items-center justify-center rounded-xl border border-white/12 bg-white/5 p-2 text-white/85 hover:bg-white/10 transition"
        aria-label="알림"
      >
        <Bell className="h-5 w-5" />

        {/* 3-1-1) 배지 */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[11px] flex items-center justify-center">
            {badgeText}
          </span>
        )}
      </button>

      {/* 3-2) 드롭다운 */}
      {open && (
        <div
          className={cn(
            'absolute right-0 mt-2 w-[360px] z-50 overflow-hidden rounded-2xl',
            'border border-white/12 bg-zinc-950/95 backdrop-blur-xl shadow-2xl'
          )}
        >
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <div className="text-sm font-semibold text-white">호출 알림</div>
            <button
              type="button"
              onClick={() => refresh()}
              className="text-xs text-white/60 hover:text-white/80 transition"
              disabled={loading}
            >
              {loading ? '갱신 중...' : '새로고침'}
            </button>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {items.length === 0 && (
              <div className="px-4 py-6 text-sm text-white/60">호출 내역이 없습니다.</div>
            )}

            {items.map((n) => {
              const name = n.user_profiles?.nickname || n.user_profiles?.login_id || '직원'
              const minutes = minutesMap[n.id] ?? 0
              const isPending = n.status === 'pending'
              const isApproved = n.status === 'approved'

              return (
                <div key={n.id} className="px-4 py-4 border-b border-white/10">
                  {/* 3-3) 상단 라인 */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">
                        {name} 호출
                      </div>
                      <div className="mt-1 text-xs text-white/45">
                        {fmtTime(n.created_at)}
                      </div>
                      {n.message && <div className="mt-2 text-xs text-white/70">{n.message}</div>}
                    </div>

                    {/* 3-3-1) 상태 배지 */}
                    <div
                      className={cn(
                        'shrink-0 rounded-full px-2 py-1 text-[11px] border',
                        isApproved
                          ? 'border-emerald-300/30 bg-emerald-500/10 text-emerald-100'
                          : 'border-white/12 bg-white/5 text-white/60'
                      )}
                    >
                      {isApproved ? '승인됨' : '대기'}
                    </div>
                  </div>

                  {/* 3-4) 승인 UI: pending일 때만 */}
                  {isPending && (
                    <div className="mt-3 flex items-center justify-between gap-2">
                      {/* 3-4-1) 5분 단위 조절 */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => bumpMinutes(n.id, -5)}
                          className="rounded-xl border border-white/12 bg-white/5 p-2 text-white/85 hover:bg-white/10 transition"
                          aria-label="-5분"
                        >
                          <Minus className="h-4 w-4" />
                        </button>

                        <div className="min-w-[90px] text-center text-sm text-white">
                          {minutes}분
                        </div>

                        <button
                          type="button"
                          onClick={() => bumpMinutes(n.id, +5)}
                          className="rounded-xl border border-white/12 bg-white/5 p-2 text-white/85 hover:bg-white/10 transition"
                          aria-label="+5분"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>

                      {/* 3-4-2) 승인 버튼 */}
                      <button
                        type="button"
                        onClick={() => approve(n)}
                        disabled={actionId === n.id}
                        className={cn(
                          'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition',
                          'bg-white text-zinc-900 hover:bg-white/90 active:bg-white/80',
                          'disabled:opacity-60 disabled:cursor-not-allowed'
                        )}
                      >
                        <Check className="h-4 w-4" />
                        {actionId === n.id ? '처리 중...' : '승인'}
                      </button>
                    </div>
                  )}

                  {/* 3-5) 승인된 경우 표시 */}
                  {isApproved && (
                    <div className="mt-3 text-xs text-white/60">
                      승인 추가시간: <span className="text-white/85 font-semibold">{n.approved_minutes}분</span>
                      {n.approved_at && <span className="ml-2">({fmtTime(n.approved_at)})</span>}
                    </div>
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
