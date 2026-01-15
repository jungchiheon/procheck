// src/app/admin/staff/[id]/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabaseClient'
import { GlassCard } from '@/components/ui/GlassCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { ProButton } from '@/components/ui/ProButton'
import { cn } from '@/lib/cn'
import { Star, RotateCcw, Save, Trash2 } from 'lucide-react'

type Staff = {
  id: string
  login_id: string
  nickname: string
  role: 'admin' | 'staff'
  is_active: boolean
  last_checkin_at: string | null
  last_checkout_at: string | null
  bank_name: string | null
  bank_account: string | null
  bank_holder: string | null
}

type StoreRow = { id: number; name: string; is_active: boolean }

type WorkLogRow = {
  id: number
  work_at: string
  minutes: number
  option_heart: boolean
  option_at: boolean
  stores?: { name: string } | null
}

export default function AdminStaffDetailPage() {
  // 1-1) 라우터/params
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const staffId = params.id

  // ✅ 1-2) 로딩 분리 (핵심)
  const [staffLoading, setStaffLoading] = useState(true)
  const [storesLoading, setStoresLoading] = useState(true)
  const [logsLoading, setLogsLoading] = useState(true)

  // 1-3) 데이터 상태
  const [staff, setStaff] = useState<Staff | null>(null)
  const [stores, setStores] = useState<StoreRow[]>([])
  const [workLogs, setWorkLogs] = useState<WorkLogRow[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 1-4) 입력 폼 상태
  const [storeQuery, setStoreQuery] = useState('')
  const [selectedStoreId, setSelectedStoreId] = useState<number | ''>('')
  const [storeDropdownOpen, setStoreDropdownOpen] = useState(false)

  const [workTime, setWorkTime] = useState(getTimeHHMM())
  const [minutes, setMinutes] = useState(0)
  const [optionHeart, setOptionHeart] = useState(false)
  const [optionAt, setOptionAt] = useState(false)
  const [memo, setMemo] = useState('')

  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  // 1-5) ★ 계좌 모달 상태
  const [bankOpen, setBankOpen] = useState(false)
  const [bankName, setBankName] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [bankHolder, setBankHolder] = useState('')
  const [bankSaving, setBankSaving] = useState(false)

  // ✅ 출퇴근 설정 모달 상태(일단 UI 트리거는 없음)
  const [attOpen, setAttOpen] = useState(false)
  const [checkinLocal, setCheckinLocal] = useState('')
  const [checkoutLocal, setCheckoutLocal] = useState('')
  const [attSaving, setAttSaving] = useState(false)
  const [attError, setAttError] = useState<string | null>(null)

  // 1-6) 금액 계산(30분=15000 => 1분=500)
  const amount = useMemo(() => minutes * 500, [minutes])

  // 1-7) 기준일: 출근일 있으면 그 날짜, 없으면 오늘(KST)
  const baseDate = useMemo(() => {
    if (!staff?.last_checkin_at) return getKstDateString()
    return toKstDateString(staff.last_checkin_at)
  }, [staff?.last_checkin_at])

  // 1-8) 가게 필터(초성 검색 포함)
  const filteredStores = useMemo(() => {
    const q = storeQuery.trim()
    const active = stores.filter((s) => s.is_active)
    if (!q) return active

    if (isSingleChosung(q)) {
      return active
        .filter((s) => getLeadingHangulChosung(s.name) === q)
        .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    }

    const qLower = q.toLowerCase()
    return active
      .filter((s) => s.name.toLowerCase().includes(qLower))
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(qLower) ? 0 : 1
        const bStarts = b.name.toLowerCase().startsWith(qLower) ? 0 : 1
        if (aStarts !== bStarts) return aStarts - bStarts
        return a.name.localeCompare(b.name, 'ko')
      })
  }, [stores, storeQuery])

  // 1-9) 근무 내역 총합(기준일)
  const totalMinutes = useMemo(() => workLogs.reduce((sum, w) => sum + (w.minutes || 0), 0), [workLogs])

  // ✅ 1-10) stores 로드: 캐시(10분) + 네트워크
  const loadStoresFast = async (): Promise<StoreRow[]> => {
    const key = 'pc_stores_v1'
    const ttlMs = 10 * 60 * 1000

    // 1-10-1) 캐시 우선
    try {
      const cached = sessionStorage.getItem(key)
      if (cached) {
        const parsed = JSON.parse(cached)
        if (parsed?.ts && Array.isArray(parsed?.rows) && Date.now() - parsed.ts < ttlMs) {
          return parsed.rows as StoreRow[]
        }
      }
    } catch {
      // ignore
    }

    // 1-10-2) 캐시 없으면 네트워크
    const t0 = performance.now()
    const { data, error } = await supabaseClient
      .from('stores')
      .select('id, name, is_active')
      .order('name', { ascending: true })

    console.log('stores(ms)=', performance.now() - t0, error)

    if (error) throw new Error(`stores 로드 실패: ${error.message}`)
    const rows = (data ?? []) as StoreRow[]

    try {
      sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), rows }))
    } catch {
      // ignore
    }

    return rows
  }

  // ✅ 1-11) 근무 내역 로드 함수(날짜 범위 필터)
  const fetchWorkLogs = async (sid: string, ymd: string) => {
    const { startIso, endIso } = getKstDayRangeIso(ymd)

    const t0 = performance.now()
    const { data, error } = await supabaseClient
      .from('staff_work_logs')
      .select('id, work_at, minutes, option_heart, option_at, stores(name)')
      .eq('staff_id', sid)
      .gte('work_at', startIso)
      .lt('work_at', endIso)
      .order('work_at', { ascending: true })

    console.log('worklogs(ms)=', performance.now() - t0, error)

    if (error) throw new Error(`work_logs 로드 실패: ${error.message}`)
    setWorkLogs((data as any) ?? [])
  }

  // ✅ 1-12) 초기 로드: staff 먼저 → stores/logs 병렬
  useEffect(() => {
    let alive = true

    ;(async () => {
      setStaffLoading(true)
      setStoresLoading(true)
      setLogsLoading(true)
      setError(null)
      setMessage(null)

      try {
        // 1-12-1) 토큰 확보
        const { data: session } = await supabaseClient.auth.getSession()
        const token = session.session?.access_token
        if (!token) throw new Error('세션이 없습니다. 다시 로그인 해주세요.')

        // 1-12-2) staff(API)
        const tApi = performance.now()
        const res = await fetch(`/api/admin/staff/${staffId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const json = await res.json().catch(() => ({}))
        console.log('staff_api(ms)=', performance.now() - tApi)

        if (!res.ok) throw new Error(json?.error || 'staff 조회 실패')

        const staffData = json.staff as Staff
        if (!alive) return

        setStaff(staffData)
        setBankName(staffData.bank_name ?? '')
        setBankAccount(staffData.bank_account ?? '')
        setBankHolder(staffData.bank_holder ?? '')
        setStaffLoading(false) // ✅ 화면은 여기서 바로 뜸

        // 1-12-3) stores + worklogs 병렬
        const targetDate = staffData.last_checkin_at ? toKstDateString(staffData.last_checkin_at) : getKstDateString()

        loadStoresFast()
          .then((rows) => {
            if (!alive) return
            setStores(rows)
          })
          .catch((e: any) => alive && setError(e?.message ?? 'stores 로드 오류'))
          .finally(() => alive && setStoresLoading(false))

        fetchWorkLogs(staffData.id, targetDate)
          .catch((e: any) => alive && setError(e?.message ?? 'worklogs 로드 오류'))
          .finally(() => alive && setLogsLoading(false))
      } catch (e: any) {
        if (!alive) return
        setError(e?.message ?? '초기 로드 오류')
        setStaffLoading(false)
        setStoresLoading(false)
        setLogsLoading(false)
      }
    })()

    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffId])

  // 1-13) 입력 초기화
  const resetForm = () => {
    setMinutes(0)
    setOptionHeart(false)
    setOptionAt(false)
    setMemo('')
  }

  // 1-14) 가게 선택 처리
  const onPickStore = (s: StoreRow) => {
    setSelectedStoreId(s.id)
    setStoreQuery(s.name)
    setStoreDropdownOpen(false)
  }

  // ✅ 출퇴근 저장 로직(현재 UI 트리거는 없지만 모달은 유지)
  const openAttendanceModal = () => {
    if (!staff) return
    setAttError(null)
    setCheckinLocal(isoToLocalInput(staff.last_checkin_at))
    setCheckoutLocal(isoToLocalInput(staff.last_checkout_at))
    setAttOpen(true)
  }

  const onSaveAttendance = async () => {
    if (!staff) return
    setAttSaving(true)
    setAttError(null)
    setError(null)
    setMessage(null)

    try {
      const ciIso = localInputToIso(checkinLocal)
      const coIso = localInputToIso(checkoutLocal)

      if (ciIso && coIso && new Date(ciIso) > new Date(coIso)) {
        throw new Error('퇴근 시간이 출근 시간보다 빠릅니다.')
      }

      const { data: session } = await supabaseClient.auth.getSession()
      const token = session.session?.access_token
      if (!token) throw new Error('세션이 없습니다. 다시 로그인 해주세요.')

      const res = await fetch(`/api/admin/staff/${staff.id}/set-attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          last_checkin_at: ciIso,
          last_checkout_at: coIso,
        }),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || '출퇴근 저장 실패')

      const updated = json.staff as { last_checkin_at: string | null; last_checkout_at: string | null }

      const nextStaff: Staff = {
        ...staff,
        last_checkin_at: updated.last_checkin_at ?? ciIso,
        last_checkout_at: updated.last_checkout_at ?? coIso,
      }

      setStaff(nextStaff)
      setAttOpen(false)
      setMessage('출퇴근 시간이 저장되었습니다.')

      // ✅ 저장 후 근무내역 재조회 (체크인 날짜 기준)
      setLogsLoading(true)
      const nextBase = nextStaff.last_checkin_at ? toKstDateString(nextStaff.last_checkin_at) : getKstDateString()
      await fetchWorkLogs(nextStaff.id, nextBase)
    } catch (e: any) {
      setAttError(e?.message ?? '출퇴근 저장 오류')
    } finally {
      setLogsLoading(false)
      setAttSaving(false)
    }
  }

  // 1-15) 저장(근무 + 정산)
  const onSave = async () => {
    setError(null)
    setMessage(null)

    if (!staff) return

    if (!selectedStoreId) return setError('가게를 선택하세요.')
    if (!workTime) return setError('시작 시각을 선택하세요.')
    if (minutes <= 0) return setError('근무 시간을 추가하세요.')
    if (amount <= 0) return setError('정산 금액이 0원입니다.')

    setSaving(true)
    try {
      const workAtIso = computeWorkAtIso({
        baseDate,
        timeHm: workTime,
        staffCheckinIso: staff.last_checkin_at,
        lastLogIso: workLogs.length ? workLogs[workLogs.length - 1].work_at : null,
      })

      const nowIso = new Date().toISOString()

      const { data: wData, error: wErr } = await supabaseClient
        .from('staff_work_logs')
        .insert({
          staff_id: staff.id,
          store_id: selectedStoreId,
          work_at: workAtIso,
          minutes,
          option_heart: optionHeart,
          option_at: optionAt,
        })
        .select('id')
        .single()

      if (wErr) throw new Error(`근무 저장 실패: ${wErr.message}`)
      const workLogId = wData?.id as number | undefined
      if (!workLogId) throw new Error('workLogId missing')

      const { error: pErr } = await supabaseClient.from('staff_payment_logs').insert({
        staff_id: staff.id,
        work_log_id: workLogId,
        amount,
        method: 'cash',
        paid_at: nowIso,
        memo: memo.trim() ? memo.trim() : null,
      })
      if (pErr) throw new Error(`정산 저장 실패: ${pErr.message}`)

      setMessage('근무 + 정산 내역이 저장되었습니다.')
      resetForm()

      // ✅ 저장 후 근무내역만 재조회
      setLogsLoading(true)
      await fetchWorkLogs(staff.id, baseDate)
    } catch (e: any) {
      setError(e?.message ?? '저장 오류')
    } finally {
      setLogsLoading(false)
      setSaving(false)
    }
  }

  // 1-16) 근무 내역 삭제
  const onDeleteWorkLog = async (workLogId: number) => {
    if (!staff) return
    setError(null)
    setMessage(null)

    const ok = window.confirm('이 근무 내역을 삭제할까요?')
    if (!ok) return

    setDeletingId(workLogId)
    try {
      const { data: deletedRows, error: dErr } = await supabaseClient
        .from('staff_work_logs')
        .delete()
        .eq('id', workLogId)
        .select('id')

      if (dErr) throw new Error(`삭제 실패: ${dErr.message}`)
      if (!deletedRows || deletedRows.length === 0) {
        throw new Error('삭제 권한이 없거나, 이미 삭제된 항목입니다(RLS 가능성).')
      }

      setMessage('삭제되었습니다.')

      setLogsLoading(true)
      await fetchWorkLogs(staff.id, baseDate)
    } catch (e: any) {
      setError(e?.message ?? '삭제 오류')
    } finally {
      setLogsLoading(false)
      setDeletingId(null)
    }
  }

  // 1-17) ★ 계좌 저장
  const onSaveBank = async () => {
    if (!staff) return
    setError(null)
    setMessage(null)
    setBankSaving(true)

    try {
      const { error } = await supabaseClient
        .from('user_profiles')
        .update({
          bank_name: bankName.trim() || null,
          bank_account: bankAccount.trim() || null,
          bank_holder: bankHolder.trim() || null,
        })
        .eq('id', staff.id)

      if (error) throw new Error(`계좌 저장 실패: ${error.message}`)

      setStaff({
        ...staff,
        bank_name: bankName.trim() || null,
        bank_account: bankAccount.trim() || null,
        bank_holder: bankHolder.trim() || null,
      })

      setMessage('저장되었습니다.')
      setBankOpen(false)
    } catch (e: any) {
      setError(e?.message ?? '계좌 저장 오류')
    } finally {
      setBankSaving(false)
    }
  }

  // 1-18) 로그아웃
  const onLogout = async () => {
    await supabaseClient.auth.signOut()
    router.replace('/login')
  }

  // ✅ staff만 로딩 중이면 최소 화면
  if (staffLoading) return <div className="text-sm text-white/60">Loading...</div>

  if (!staff) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="직원 상세"
          backHref="/admin/staff"
          right={
            <ProButton variant="ghost" onClick={onLogout}>
              로그아웃
            </ProButton>
          }
        />
        <GlassCard className="p-6">
          <div className="text-white/80">직원 정보를 불러오지 못했습니다.</div>
          {error && <div className="mt-3 text-sm text-red-200">{error}</div>}
        </GlassCard>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 헤더: ✅ 근무 버튼 제거, ✅ 계좌는 별 아이콘만 */}
      <PageHeader
        title={staff.nickname}
        subtitle={staff.login_id}
        backHref="/admin/staff"
        right={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setBankOpen(true)}
              className={cn(
                'inline-flex items-center justify-center',
                'h-10 w-10 rounded-xl border border-white/12 bg-white/5',
                'text-white/85 hover:bg-white/10 transition'
              )}
              type="button"
              aria-label="계좌"
              title="계좌"
            >
              <Star className="h-5 w-5" />
            </button>

            <ProButton variant="ghost" onClick={onLogout}>
              로그아웃
            </ProButton>
          </div>
        }
      />

      {/* 섹션: 근무/정산 입력 */}
      <GlassCard className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-white font-semibold tracking-tight">근무/정산 입력</div>
            <div className="mt-1 text-sm text-white/55">30분당 15,000원 기준</div>
          </div>

          <button
            onClick={resetForm}
            className={cn(
              'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm',
              'border border-white/12 bg-white/5 text-white/85 hover:bg-white/10 transition'
            )}
            type="button"
          >
            <RotateCcw className="h-4 w-4" />
            초기화
          </button>
        </div>

        <div className="mt-5">
          <label className="text-sm font-medium text-white/80">가게 선택</label>

          <div className="relative mt-2">
            <input
              disabled={storesLoading}
              className={cn(
                'w-full rounded-xl border border-white/12 bg-black/20 px-3 py-2.5 text-white outline-none placeholder:text-white/30 focus:border-white/25',
                storesLoading && 'opacity-70 cursor-not-allowed'
              )}
              value={storeQuery}
              onChange={(e) => {
                setStoreQuery(e.target.value)
                setStoreDropdownOpen(true)
                setSelectedStoreId('')
              }}
              onFocus={() => {
                if (!storesLoading) setStoreDropdownOpen(true)
              }}
              onBlur={() => {
                window.setTimeout(() => setStoreDropdownOpen(false), 120)
              }}
              placeholder={storesLoading ? '가게 목록 불러오는 중...' : '예: ㄱ (초성) / 강남'}
              autoComplete="off"
            />

            {!storesLoading && storeDropdownOpen && filteredStores.length > 0 && (
              <div
                className={cn(
                  'absolute z-20 mt-2 w-full overflow-hidden rounded-2xl',
                  'border border-white/12 bg-zinc-950/95 backdrop-blur-xl shadow-2xl'
                )}
              >
                <div className="max-h-60 overflow-y-auto py-1">
                  {filteredStores.map((s) => (
                    <button
                      key={s.id}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => onPickStore(s)}
                      className="w-full text-left px-4 py-3 hover:bg-white/10 transition"
                      type="button"
                    >
                      <div className="text-sm font-semibold text-white">{s.name}</div>
                      <div className="mt-0.5 text-xs text-white/35">ID: {s.id}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {storesLoading && <div className="mt-2 text-xs text-white/45">가게 목록을 불러오는 중입니다…</div>}
        </div>

        <div className="mt-5">
          <label className="text-sm font-medium text-white/80">시작 시각</label>
          <input
            type="time"
            className="mt-2 w-full rounded-xl border border-white/12 bg-black/20 px-3 py-2.5 text-white outline-none focus:border-white/25"
            value={workTime}
            onChange={(e) => setWorkTime(e.target.value)}
          />
          <div className="mt-2 text-xs text-white/40">기준일: {baseDate} (자정 넘어가면 자동으로 다음날로 계산)</div>
        </div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-white/55">현재</div>
          <div className="mt-1 text-white font-semibold">
            {formatMinutes(minutes)} · {formatCurrency(amount)}원
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <TimeButton label="+30분" onClick={() => setMinutes((m) => m + 30)} />
          <TimeButton label="+1시간" onClick={() => setMinutes((m) => m + 60)} />
          <TimeButton label="+1시간30분" onClick={() => setMinutes((m) => m + 90)} />
          <TimeButton label="+2시간" onClick={() => setMinutes((m) => m + 120)} />
        </div>

        <div className="mt-4 flex items-center gap-2">
          <OptionTextButton active={optionHeart} onClick={() => setOptionHeart((v) => !v)} text="♡" />
          <OptionTextButton active={optionAt} onClick={() => setOptionAt((v) => !v)} text="@" />
        </div>

        <div className="mt-4">
          <label className="text-sm font-medium text-white/80">정산 메모(선택)</label>
          <textarea
            className="mt-2 h-24 w-full resize-none rounded-xl border border-white/12 bg-black/20 px-3 py-2.5 text-white outline-none placeholder:text-white/30 focus:border-white/25"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="메모를 입력하세요..."
          />
        </div>

        {message && (
          <div className="mt-4 rounded-xl border border-emerald-300/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {message}
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        <div className="mt-4">
          <ProButton onClick={onSave} disabled={saving || storesLoading} className="w-full">
            <Save className="mr-2 h-4 w-4" />
            {saving ? '저장 중...' : '근무 + 정산 저장'}
          </ProButton>
        </div>
      </GlassCard>

      {/* 섹션: 근무 내역 */}
      <GlassCard className="p-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-white font-semibold tracking-tight">근무 내역</div>
            <div className="mt-1 text-sm text-white/55">기준일: {baseDate}</div>
          </div>
          <div className="text-sm text-white/80">총 {formatMinutes(totalMinutes)}</div>
        </div>

        <div className="mt-4 divide-y divide-white/10">
          {logsLoading && <div className="py-6 text-sm text-white/60">근무 내역 불러오는 중...</div>}

          {!logsLoading && workLogs.length === 0 && (
            <div className="py-6 text-sm text-white/60">해당 날짜의 근무 내역이 없습니다.</div>
          )}

          {!logsLoading &&
            workLogs.map((w) => {
              const time = toKstTime(new Date(w.work_at))
              const storeName = w.stores?.name ?? '가게 미지정'
              const rowAmount = (w.minutes || 0) * 500

              return (
                <div key={w.id} className="py-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-white font-semibold">
                      {time} · {w.minutes}분 · {formatCurrency(rowAmount)}원
                    </div>
                    <div className="mt-1 text-sm text-white/55 truncate">{storeName}</div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <div className="flex items-center gap-2 text-white/70">
                      {w.option_heart && (
                        <span className="rounded-full border border-white/12 bg-white/5 px-2 py-1 text-xs">♡</span>
                      )}
                      {w.option_at && (
                        <span className="rounded-full border border-white/12 bg-white/5 px-2 py-1 text-xs">@</span>
                      )}
                    </div>

                    <button
                      onClick={() => onDeleteWorkLog(w.id)}
                      disabled={deletingId === w.id}
                      className={cn(
                        'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm',
                        'border border-white/12 bg-white/5 text-white/85 hover:bg-white/10 transition',
                        'disabled:opacity-60 disabled:cursor-not-allowed'
                      )}
                      type="button"
                    >
                      <Trash2 className="h-4 w-4" />
                      {deletingId === w.id ? '삭제 중...' : '삭제'}
                    </button>
                  </div>
                </div>
              )
            })}
        </div>
      </GlassCard>

      {/* ✅ 출퇴근 설정 모달: 현재 트리거 없음(원하면 나중에 연결) */}
      {attOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <button className="absolute inset-0 bg-black/60" onClick={() => setAttOpen(false)} aria-label="닫기" />
          <div className="relative w-full max-w-md">
            <GlassCard className="p-6">
              <div>
                <div className="text-white text-lg font-semibold">출퇴근 설정</div>
                <div className="mt-1 text-sm text-white/55">직원이 못찍었을 때 관리자 수동 수정</div>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-white/80">출근 일시</label>
                    <button
                      type="button"
                      onClick={() => setCheckinLocal('')}
                      className="text-xs text-white/45 hover:text-white/80 transition"
                    >
                      비우기
                    </button>
                  </div>
                  <input
                    type="datetime-local"
                    className="mt-2 w-full rounded-xl border border-white/12 bg-black/20 px-3 py-2.5 text-white outline-none focus:border-white/25"
                    value={checkinLocal}
                    onChange={(e) => setCheckinLocal(e.target.value)}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-white/80">퇴근 일시</label>
                    <button
                      type="button"
                      onClick={() => setCheckoutLocal('')}
                      className="text-xs text-white/45 hover:text-white/80 transition"
                    >
                      비우기
                    </button>
                  </div>
                  <input
                    type="datetime-local"
                    className="mt-2 w-full rounded-xl border border-white/12 bg-black/20 px-3 py-2.5 text-white outline-none focus:border-white/25"
                    value={checkoutLocal}
                    onChange={(e) => setCheckoutLocal(e.target.value)}
                  />
                </div>

                {attError && (
                  <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                    {attError}
                  </div>
                )}

                <div className="pt-2 flex gap-2">
                  <ProButton
                    variant="ghost"
                    className="flex-1"
                    type="button"
                    onClick={() => setAttOpen(false)}
                    disabled={attSaving}
                  >
                    취소
                  </ProButton>
                  <ProButton className="flex-1" type="button" onClick={onSaveAttendance} disabled={attSaving}>
                    {attSaving ? '저장 중...' : '저장하기'}
                  </ProButton>
                </div>
              </div>
            </GlassCard>
          </div>
        </div>
      )}

      {/* ★ 계좌 모달 */}
      {bankOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <button className="absolute inset-0 bg-black/60" onClick={() => setBankOpen(false)} aria-label="닫기" />

          <div className="relative w-full max-w-md">
            <GlassCard className="p-6">
              <div className="text-white text-lg font-semibold">★ 정산용 계좌</div>
              <div className="mt-1 text-sm text-white/55">직원 계좌 정보를 저장합니다.</div>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="text-sm font-medium text-white/80">은행명</label>
                  <input
                    className="mt-2 w-full rounded-xl border border-white/12 bg-black/20 px-3 py-2.5 text-white outline-none placeholder:text-white/30 focus:border-white/25"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="예: 국민은행"
                    autoComplete="off"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-white/80">계좌번호</label>
                  <input
                    className="mt-2 w-full rounded-xl border border-white/12 bg-black/20 px-3 py-2.5 text-white outline-none placeholder:text-white/30 focus:border-white/25"
                    value={bankAccount}
                    onChange={(e) => setBankAccount(e.target.value)}
                    placeholder="예: 123-456-7890"
                    autoComplete="off"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-white/80">예금주</label>
                  <input
                    className="mt-2 w-full rounded-xl border border-white/12 bg-black/20 px-3 py-2.5 text-white outline-none placeholder:text-white/30 focus:border-white/25"
                    value={bankHolder}
                    onChange={(e) => setBankHolder(e.target.value)}
                    placeholder="예: 홍길동"
                    autoComplete="off"
                  />
                </div>

                <div className="pt-2 flex gap-2">
                  <ProButton
                    variant="ghost"
                    className="flex-1"
                    type="button"
                    onClick={() => setBankOpen(false)}
                    disabled={bankSaving}
                  >
                    닫기
                  </ProButton>
                  <ProButton className="flex-1" type="button" onClick={onSaveBank} disabled={bankSaving}>
                    {bankSaving ? '저장 중...' : '저장하기'}
                  </ProButton>
                </div>
              </div>
            </GlassCard>
          </div>
        </div>
      )}
    </div>
  )
}

/* -------------------------
   2) 작은 UI 컴포넌트
------------------------- */

function TimeButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-xl px-3 py-2.5 text-sm transition border',
        'bg-white/5 text-white/85 border-white/12 hover:bg-white/10'
      )}
      type="button"
    >
      {label}
    </button>
  )
}

function OptionTextButton({ active, onClick, text }: { active: boolean; onClick: () => void; text: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm transition border',
        active ? 'bg-white text-zinc-900 border-white/0' : 'bg-white/5 text-white/85 border-white/12 hover:bg-white/10'
      )}
      type="button"
      aria-label={text}
    >
      {text}
    </button>
  )
}

/* -------------------------
   3) 날짜/시간 유틸 (KST + 자정 보정)
------------------------- */

function computeWorkAtIso(args: { baseDate: string; timeHm: string; staffCheckinIso: string | null; lastLogIso: string | null }) {
  const baseIso = new Date(`${args.baseDate}T${args.timeHm}:00+09:00`).toISOString()

  const inputMin = hhmmToMinutes(args.timeHm)
  const checkinMin = args.staffCheckinIso ? hhmmToMinutes(toKstHHMM(args.staffCheckinIso)) : null
  const lastLogMin = args.lastLogIso ? hhmmToMinutes(toKstHHMM(args.lastLogIso)) : null

  const shouldNextDay = (checkinMin != null && inputMin < checkinMin) || (lastLogMin != null && inputMin < lastLogMin)
  if (!shouldNextDay) return baseIso

  const nextDay = new Date(`${args.baseDate}T${args.timeHm}:00+09:00`)
  nextDay.setDate(nextDay.getDate() + 1)
  return nextDay.toISOString()
}

function hhmmToMinutes(hm: string) {
  const [h, m] = hm.split(':').map((v) => Number(v))
  return h * 60 + m
}

function toKstHHMM(iso: string) {
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function getKstDateString() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getTimeHHMM() {
  const d = new Date()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function toKstTime(d: Date) {
  return d.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function toKstDateString(iso: string) {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('ko-KR').format(n)
}

function formatMinutes(min: number) {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h <= 0) return `${m}분`
  if (m === 0) return `${h}시간`
  return `${h}시간 ${m}분`
}

function getKstDayRangeIso(dateYmd: string) {
  const startIso = new Date(`${dateYmd}T00:00:00+09:00`).toISOString()
  const end = new Date(`${dateYmd}T00:00:00+09:00`)
  end.setDate(end.getDate() + 1)
  return { startIso, endIso: end.toISOString() }
}

/* ✅ datetime-local 변환 */
function isoToLocalInput(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day}T${hh}:${mm}`
}

function localInputToIso(v: string) {
  const s = (v ?? '').trim()
  if (!s) return null
  const d = new Date(s)
  if (!Number.isFinite(d.getTime())) return null
  return d.toISOString()
}

/* -------------------------
   4) 초성 검색 유틸
------------------------- */

function isSingleChosung(q: string) {
  return q.length === 1 && CHOSUNG.includes(q)
}

function getLeadingHangulChosung(name: string) {
  for (const ch of name) {
    const c = getChosung(ch)
    if (c) return c
  }
  return null
}

const CHOSUNG = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ']

function getChosung(ch: string) {
  const code = ch.charCodeAt(0)
  if (code < 0xac00 || code > 0xd7a3) return null
  const index = Math.floor((code - 0xac00) / 588)
  return CHOSUNG[index] ?? null
}
