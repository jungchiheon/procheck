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

  // 1-2) 데이터 상태
  const [loading, setLoading] = useState(true)
  const [staff, setStaff] = useState<Staff | null>(null)

  const [stores, setStores] = useState<StoreRow[]>([])
  const [workLogs, setWorkLogs] = useState<WorkLogRow[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 1-3) 입력 폼 상태
  const [storeQuery, setStoreQuery] = useState('') // 1-3-1) "가게 선택" 입력 하나로 통일
  const [selectedStoreId, setSelectedStoreId] = useState<number | ''>('') // 1-3-2) 실제 선택된 store_id
  const [storeDropdownOpen, setStoreDropdownOpen] = useState(false) // 1-3-3) 드롭다운 표시

  const [workTime, setWorkTime] = useState(getTimeHHMM()) // 1-3-4) 날짜 제거, 시간만
  const [minutes, setMinutes] = useState(0)
  const [optionHeart, setOptionHeart] = useState(false)
  const [optionAt, setOptionAt] = useState(false)
  const [memo, setMemo] = useState('')

  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  // 1-4) ★ 계좌 모달 상태
  const [bankOpen, setBankOpen] = useState(false)
  const [bankName, setBankName] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [bankHolder, setBankHolder] = useState('')
  const [bankSaving, setBankSaving] = useState(false)

  // 1-5) 금액 계산(30분=15000 => 1분=500)
  const amount = useMemo(() => minutes * 500, [minutes])

  // 1-6) 기준일: 출근일 있으면 그 날짜, 없으면 오늘(KST)
  const baseDate = useMemo(() => {
    if (!staff?.last_checkin_at) return getKstDateString()
    return toKstDateString(staff.last_checkin_at)
  }, [staff?.last_checkin_at])

  // 1-7) 근무중 판정
  const workingStatus = useMemo(() => {
    if (!staff) return { label: '대기 중', detail: '' }

    const ci = staff.last_checkin_at ? new Date(staff.last_checkin_at) : null
    const co = staff.last_checkout_at ? new Date(staff.last_checkout_at) : null

    if (ci && (!co || ci > co)) return { label: '근무 중', detail: `출근: ${toKstTime(ci)}` }
    if (co) return { label: '퇴근', detail: `퇴근: ${toKstTime(co)}` }
    return { label: '대기 중', detail: '' }
  }, [staff])

  // 1-8) 가게 필터(초성 검색 포함)
  const filteredStores = useMemo(() => {
  const q = storeQuery.trim()
  const active = stores.filter((s) => s.is_active)
  if (!q) return active

  // 2-3-1) 초성 1글자 입력이면 "앞글자(첫 한글)의 초성"만 매칭
  if (isSingleChosung(q)) {
    return active
      .filter((s) => getLeadingHangulChosung(s.name) === q)
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }

  // 2-3-2) 그 외(일반 문자열)는 "앞부분 우선" 정렬로 보여주기
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

  // 1-10) 초기 로드
  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setError(null)
      setMessage(null)

      try {
        // 1-10-1) 토큰 확보
        const { data: session } = await supabaseClient.auth.getSession()
        const token = session.session?.access_token
        if (!token) throw new Error('1-10-1) 세션이 없습니다. 다시 로그인 해주세요.')

        // 1-10-2) staff(API: service role)
        const res = await fetch(`/api/admin/staff/${staffId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.error || '1-10-2) staff 조회 실패')

        const staffData = json.staff as Staff
        setStaff(staffData)

        // 1-10-3) ★ 계좌 모달 기본값
        setBankName(staffData.bank_name ?? '')
        setBankAccount(staffData.bank_account ?? '')
        setBankHolder(staffData.bank_holder ?? '')

        // 1-10-4) stores 로드
        const { data: storesData, error: storesErr } = await supabaseClient
          .from('stores')
          .select('id, name, is_active')
          .order('name', { ascending: true })

        if (storesErr) throw new Error(`1-10-4) stores 로드 실패: ${storesErr.message}`)
        setStores((storesData as StoreRow[]) ?? [])

        // 1-10-5) 근무 내역 로드(기준일)
        const targetDate = staffData.last_checkin_at ? toKstDateString(staffData.last_checkin_at) : getKstDateString()
        await fetchWorkLogs(staffData.id, targetDate)
      } catch (e: any) {
        setError(e?.message ?? '1-10) 오류')
      } finally {
        setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffId])

  // 1-11) 근무 내역 로드 함수(날짜 범위 필터)
  const fetchWorkLogs = async (sid: string, ymd: string) => {
    const { startIso, endIso } = getKstDayRangeIso(ymd)

    const { data, error } = await supabaseClient
      .from('staff_work_logs')
      .select('id, work_at, minutes, option_heart, option_at, stores(name)')
      .eq('staff_id', sid)
      .gte('work_at', startIso)
      .lt('work_at', endIso)
      .order('work_at', { ascending: true })

    if (error) throw new Error(`1-11) work_logs 로드 실패: ${error.message}`)
    setWorkLogs((data as any) ?? [])
  }

  // 1-12) 입력 초기화
  const resetForm = () => {
    setMinutes(0)
    setOptionHeart(false)
    setOptionAt(false)
    setMemo('')
  }

  // 1-13) 가게 선택 처리(입력+선택 합침)
  const onPickStore = (s: StoreRow) => {
    // 1-13-1) 선택한 가게 id 저장
    setSelectedStoreId(s.id)
    // 1-13-2) 입력칸에는 가게명 표시(선택된 느낌)
    setStoreQuery(s.name)
    // 1-13-3) 드롭다운 닫기
    setStoreDropdownOpen(false)
  }

  // 1-14) 저장(근무 + 정산)
  const onSave = async () => {
    setError(null)
    setMessage(null)

    if (!staff) return

    // 1-14-1) validation
    if (!selectedStoreId) return setError('1-14-1) 가게를 선택하세요.')
    if (!workTime) return setError('1-14-1) 시작 시각을 선택하세요.')
    if (minutes <= 0) return setError('1-14-1) 근무 시간을 추가하세요.')
    if (amount <= 0) return setError('1-14-1) 정산 금액이 0원입니다.')

    setSaving(true)
    try {
      // 1-14-2) 날짜는 입력에서 제거됨 → baseDate + time 으로 work_at 계산
      //          자정 넘어가는 경우(다음날) 자동 보정
      const workAtIso = computeWorkAtIso({
        baseDate,
        timeHm: workTime,
        staffCheckinIso: staff.last_checkin_at,
        lastLogIso: workLogs.length ? workLogs[workLogs.length - 1].work_at : null,
      })

      const nowIso = new Date().toISOString()

      // 1-14-3) staff_work_logs insert (id 리턴 받아서, payment memo에 태그로 남김 → 삭제 연결)
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

      if (wErr) throw new Error(`1-14-3) 근무 저장 실패: ${wErr.message}`)
      const workLogId = wData?.id as number | undefined
      if (!workLogId) throw new Error('1-14-3) workLogId missing')

      // 1-14-4) staff_payment_logs insert (memo에 연결 태그를 항상 포함)
      // 3-1-1) staff_payment_logs insert (work_log_id로 1:1 연결)
const { error: pErr } = await supabaseClient.from('staff_payment_logs').insert({
  staff_id: staff.id,
  work_log_id: workLogId, // 3-1-1-1) 핵심: work_log_id 저장
  amount,
  method: 'cash',
  paid_at: nowIso,
  memo: memo.trim() ? memo.trim() : null,
})
if (pErr) throw new Error(`1-14-4) 정산 저장 실패: ${pErr.message}`)

      // 1-14-5) 성공 처리
      setMessage('근무 + 정산 내역이 저장되었습니다.')
      resetForm()

      // 1-14-6) 근무 내역 재조회(기준일 유지)
      await fetchWorkLogs(staff.id, baseDate)
    } catch (e: any) {
      setError(e?.message ?? '1-14) 저장 오류')
    } finally {
      setSaving(false)
    }
  }

  // 1-15) 근무 내역 삭제
const onDeleteWorkLog = async (workLogId: number) => {
  if (!staff) return
  setError(null)
  setMessage(null)

  const ok = window.confirm('이 근무 내역을 삭제할까요?')
  if (!ok) return

  setDeletingId(workLogId)
  try {
    // 1-15-1) delete 결과를 select로 받아서 "실제로 삭제됐는지" 확인
    const { data: deletedRows, error: dErr } = await supabaseClient
      .from('staff_work_logs')
      .delete()
      .eq('id', workLogId)
      .select('id') // 1-15-1-1) 삭제된 행 반환(0개면 실제 삭제 안된 것)

    if (dErr) throw new Error(`1-15-1) 삭제 실패: ${dErr.message}`)

    // 1-15-2) RLS/권한 문제면 0개가 돌아올 수 있음 → 이때는 실패로 처리
    if (!deletedRows || deletedRows.length === 0) {
      throw new Error('1-15-2) 삭제 권한이 없거나, 이미 삭제된 항목입니다(RLS 가능성).')
    }

    // 1-15-3) 성공
    setMessage('삭제되었습니다.')
    await fetchWorkLogs(staff.id, baseDate)
  } catch (e: any) {
    setError(e?.message ?? '1-15) 삭제 오류')
  } finally {
    setDeletingId(null)
  }
}
  // 1-16) ★ 계좌 저장
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

      if (error) throw new Error(`1-16) 계좌 저장 실패: ${error.message}`)

      setStaff({
        ...staff,
        bank_name: bankName.trim() || null,
        bank_account: bankAccount.trim() || null,
        bank_holder: bankHolder.trim() || null,
      })

      setMessage('저장되었습니다.')
      setBankOpen(false)
    } catch (e: any) {
      setError(e?.message ?? '1-16) 오류')
    } finally {
      setBankSaving(false)
    }
  }

  // 1-17) 로그아웃
  const onLogout = async () => {
    await supabaseClient.auth.signOut()
    router.replace('/login')
  }

  if (loading) return <div className="text-sm text-white/60">Loading...</div>

  if (!staff) {
    return (
      <div className="space-y-4">
        <PageHeader title="직원 상세" backHref="/admin/staff" right={<ProButton variant="ghost" onClick={onLogout}>로그아웃</ProButton>} />
        <GlassCard className="p-6">
          <div className="text-white/80">직원 정보를 불러오지 못했습니다.</div>
          {error && <div className="mt-3 text-sm text-red-200">{error}</div>}
        </GlassCard>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 1-18) 헤더 */}
      <PageHeader
        title={staff.nickname}
        subtitle={staff.login_id}
        backHref="/admin/staff"
        right={
          <div className="flex items-center gap-2">
            {/* 1-18-1) ★ 계좌 버튼 */}
            <button
              onClick={() => setBankOpen(true)}
              className={cn(
                'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm',
                'border border-white/12 bg-white/5 text-white/85 hover:bg-white/10 transition'
              )}
              type="button"
            >
              <Star className="h-4 w-4" />
              계좌
            </button>

            <ProButton variant="ghost" onClick={onLogout}>
              로그아웃
            </ProButton>
          </div>
        }
      />

      {/* 1-19) 섹션 1: 근무 상태 */}
      <GlassCard className="p-6">
        <div className="text-white font-semibold tracking-tight">근무 상태</div>
        <div className="mt-2">
          <div className="text-sm text-white/55">현재 상태</div>
          <div className="mt-1 text-lg text-white">{workingStatus.label}</div>
          {workingStatus.detail && <div className="mt-1 text-sm text-white/55">{workingStatus.detail}</div>}
        </div>
      </GlassCard>

      {/* 1-20) 섹션 2: 근무/정산 입력 */}
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

        {/* 1-20-1) 가게 선택(검색+선택 합침, 스크롤 드롭다운) */}
        <div className="mt-5">
          <label className="text-sm font-medium text-white/80">가게 선택</label>

          <div className="relative mt-2">
            <input
              className="w-full rounded-xl border border-white/12 bg-black/20 px-3 py-2.5 text-white outline-none placeholder:text-white/30 focus:border-white/25"
              value={storeQuery}
              onChange={(e) => {
                setStoreQuery(e.target.value)
                setStoreDropdownOpen(true)
                setSelectedStoreId('') // 1-20-1-1) 다시 입력하면 선택 초기화
              }}
              onFocus={() => setStoreDropdownOpen(true)}
              onBlur={() => {
                // 1-20-1-2) 클릭 선택을 위해 blur 지연
                window.setTimeout(() => setStoreDropdownOpen(false), 120)
              }}
              placeholder="예: ㄱ (초성) / 강남"
              autoComplete="off"
            />

            {/* 1-20-1-3) 드롭다운 */}
            {storeDropdownOpen && filteredStores.length > 0 && (
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
                      onMouseDown={(e) => e.preventDefault()} // 1-20-1-4) blur로 닫히기 전에 선택
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
        </div>

        {/* 1-20-2) 시간만 */}
        <div className="mt-5">
          <label className="text-sm font-medium text-white/80">시작 시각</label>
          <input
            type="time"
            className="mt-2 w-full rounded-xl border border-white/12 bg-black/20 px-3 py-2.5 text-white outline-none focus:border-white/25"
            value={workTime}
            onChange={(e) => setWorkTime(e.target.value)}
          />
          <div className="mt-2 text-xs text-white/40">
            기준일: {baseDate} (자정 넘어가면 자동으로 다음날로 계산)
          </div>
        </div>

        {/* 1-20-3) 시간/금액 표시 */}
        <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-white/55">현재</div>
          <div className="mt-1 text-white font-semibold">
            {formatMinutes(minutes)} · {formatCurrency(amount)}원
          </div>
        </div>

        {/* 1-20-4) 시간 추가 버튼 */}
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <TimeButton label="+30분" onClick={() => setMinutes((m) => m + 30)} />
          <TimeButton label="+1시간" onClick={() => setMinutes((m) => m + 60)} />
          <TimeButton label="+1시간30분" onClick={() => setMinutes((m) => m + 90)} />
          <TimeButton label="+2시간" onClick={() => setMinutes((m) => m + 120)} />
        </div>

        {/* 1-20-5) 옵션(중복 제거: 아이콘 없이 텍스트만 하나씩) */}
        <div className="mt-4 flex items-center gap-2">
          <OptionTextButton active={optionHeart} onClick={() => setOptionHeart((v) => !v)} text="♡" />
          <OptionTextButton active={optionAt} onClick={() => setOptionAt((v) => !v)} text="@" />
        </div>

        {/* 1-20-6) 메모 */}
        <div className="mt-4">
          <label className="text-sm font-medium text-white/80">정산 메모(선택)</label>
          <textarea
            className="mt-2 h-24 w-full resize-none rounded-xl border border-white/12 bg-black/20 px-3 py-2.5 text-white outline-none placeholder:text-white/30 focus:border-white/25"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="메모를 입력하세요..."
          />
        </div>

        {/* 1-20-7) 메시지/에러 */}
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

        {/* 1-20-8) 저장 버튼 */}
        <div className="mt-4">
          <ProButton onClick={onSave} disabled={saving} className="w-full">
            <Save className="mr-2 h-4 w-4" />
            {saving ? '저장 중...' : '근무 + 정산 저장'}
          </ProButton>
        </div>
      </GlassCard>

      {/* 1-21) 섹션 3: 근무 내역 리스트(삭제 + 금액 표시 추가) */}
      <GlassCard className="p-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-white font-semibold tracking-tight">근무 내역</div>
            <div className="mt-1 text-sm text-white/55">기준일: {baseDate}</div>
          </div>
          <div className="text-sm text-white/80">총 {formatMinutes(totalMinutes)}</div>
        </div>

        <div className="mt-4 divide-y divide-white/10">
          {workLogs.length === 0 && (
            <div className="py-6 text-sm text-white/60">해당 날짜의 근무 내역이 없습니다.</div>
          )}

          {workLogs.map((w) => {
            const time = toKstTime(new Date(w.work_at))
            const storeName = w.stores?.name ?? '가게 미지정'
            const rowAmount = (w.minutes || 0) * 500 // 1-21-1) 금액 표시(분*500)

            return (
              <div key={w.id} className="py-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-white font-semibold">
                    {time} · {w.minutes}분 · {formatCurrency(rowAmount)}원
                  </div>
                  <div className="mt-1 text-sm text-white/55 truncate">{storeName}</div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  {/* 1-21-2) 옵션 표기(그대로 유지) */}
                  <div className="flex items-center gap-2 text-white/70">
                    {w.option_heart && (
                      <span className="rounded-full border border-white/12 bg-white/5 px-2 py-1 text-xs">
                        ♡
                      </span>
                    )}
                    {w.option_at && (
                      <span className="rounded-full border border-white/12 bg-white/5 px-2 py-1 text-xs">
                        @
                      </span>
                    )}
                  </div>

                  {/* 1-21-3) 삭제 버튼 */}
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

      {/* 1-22) ★ 계좌 모달 */}
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
                  <ProButton variant="ghost" className="flex-1" type="button" onClick={() => setBankOpen(false)} disabled={bankSaving}>
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

function OptionTextButton({
  active,
  onClick,
  text,
}: {
  active: boolean
  onClick: () => void
  text: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm transition border',
        active
          ? 'bg-white text-zinc-900 border-white/0'
          : 'bg-white/5 text-white/85 border-white/12 hover:bg-white/10'
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

function computeWorkAtIso(args: {
  baseDate: string // YYYY-MM-DD
  timeHm: string // HH:MM
  staffCheckinIso: string | null
  lastLogIso: string | null
}) {
  // 3-1) 기본: baseDate + time
  const baseIso = new Date(`${args.baseDate}T${args.timeHm}:00+09:00`).toISOString()

  // 3-2) 자정 넘어감 판단 규칙(현실적인 자동 보정)
  //      - 체크인 시간이 있고, 입력 시간이 체크인 시간보다 "이전"이면 다음날로 간주
  //      - 또는 마지막 근무기록 시간이 있고, 입력 시간이 마지막 기록 시간보다 "이전"이면 다음날로 간주
  const inputMin = hhmmToMinutes(args.timeHm)

  const checkinMin =
    args.staffCheckinIso ? hhmmToMinutes(toKstHHMM(args.staffCheckinIso)) : null

  const lastLogMin =
    args.lastLogIso ? hhmmToMinutes(toKstHHMM(args.lastLogIso)) : null

  const shouldNextDay =
    (checkinMin != null && inputMin < checkinMin) ||
    (lastLogMin != null && inputMin < lastLogMin)

  if (!shouldNextDay) return baseIso

  // 3-3) 다음날로 +1 day
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

function toKstDateString(iso: string) {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function toKstTime(d: Date) {
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
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

/* -------------------------
   4) 초성 검색 유틸 (ㄱ 입력 → 가/강/골... 매칭)
------------------------- */
// 2-4) 초성 1글자 여부
function isSingleChosung(q: string) {
  return q.length === 1 && CHOSUNG.includes(q)
}

// 2-5) "가게명에서 첫 한글 글자"의 초성만 뽑기
function getLeadingHangulChosung(name: string) {
  for (const ch of name) {
    const c = getChosung(ch)
    if (c) return c
  }
  return null
}

const CHOSUNG = [
  'ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ',
]

function toChosungString(str: string) {
  // 4-1) 문자열을 초성 문자열로 변환
  let out = ''
  for (const ch of str) {
    out += getChosung(ch) ?? ch
  }
  return out
}

function getChosung(ch: string) {
  // 4-2) 한글 음절이면 초성 반환
  const code = ch.charCodeAt(0)
  // Hangul Syllables range: AC00–D7A3
  if (code < 0xac00 || code > 0xd7a3) return null
  const index = Math.floor((code - 0xac00) / 588)
  return CHOSUNG[index] ?? null
}
