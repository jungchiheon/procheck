'use client';

import React from 'react';
import ClientGuard from '@/middleware/client-guard';
import PageWrap from '@/components/PageWrap';
import { useAuth } from '@/lib/auth';
import { LS_KEYS, load, save, genId } from '@/lib/storage';
import { PhoneCall, Plus, Check, X, Search, Filter, Store } from 'lucide-react';

/** =========================
 * Types & helpers
 * ======================= */
type CallStatus = 'pending' | 'approved' | 'rejected';
type CallRow = {
  id: number;
  staffId: number;
  managerId: number | null;
  storeId: number | string;
  when: string;             // ISO
  status: CallStatus;
  requestedAt: string;      // ISO
};

const fmt = (iso?: string) => {
  if (!iso) return '-';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '-' : d.toLocaleString();
};

// 브라우저 로컬 기준 현재 시각을 30분 단위로 반올림해서 datetime-local 포맷으로
const nowRoundedLocal = () => {
  const d = new Date();
  const mins = d.getMinutes();
  const rounded = Math.ceil(mins / 30) * 30;
  if (rounded === 60) {
    d.setHours(d.getHours() + 1);
    d.setMinutes(0);
  } else {
    d.setMinutes(rounded);
  }
  d.setSeconds(0);
  d.setMilliseconds(0);
  const pad = (n: number) => String(n).padStart(2, '0');
  // yyyy-MM-ddTHH:mm
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const isoFromLocal = (val: string) => {
  // input[type="datetime-local"] 값 → ISO
  try {
    if (!val) return '';
    const d = new Date(val);
    return d.toISOString();
  } catch {
    return '';
  }
};

/** =========================
 * Modal shell
 * ======================= */
function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-soft overflow-hidden">
          {title && (
            <div className="px-4 py-3 border-b bg-slate-50 flex items-center gap-2">
              <PhoneCall size={16} className="text-slate-700" />
              <div className="text-sm font-semibold">{title}</div>
            </div>
          )}
          <div className="p-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** =========================
 * New request form (staff)
 * ======================= */
function RequestForm({
  stores,
  defaultStoreId,
  submitting,
  onSubmit,
}: {
  stores: any[];
  defaultStoreId?: number | string;
  submitting?: boolean;
  onSubmit: (v: { storeId: number | string; whenISO: string }) => void;
}) {
  const [storeId, setStoreId] = React.useState<number | string>(
    defaultStoreId ?? (stores[0]?.id ?? '')
  );
  const [when, setWhen] = React.useState<string>(nowRoundedLocal());

  // 모달이 열릴 때마다 기본값을 최신으로 갱신하고 싶다면 아래 노출된 effect를
  // 부모에서 key 리셋으로 처리하므로 여기서는 유지하지 않아도 됩니다.

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const whenISO = isoFromLocal(when);
        if (!storeId) return alert('가게를 선택하세요.');
        if (!whenISO) return alert('시간을 올바르게 선택하세요.');
        onSubmit({ storeId, whenISO });
      }}
    >
      <div>
        <label className="block text-xs text-slate-500 mb-1">가게</label>
        <select
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
          value={storeId as any}
          onChange={(e) => setStoreId(Number(e.target.value))}
        >
          {stores.map((s: any) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-slate-500 mb-1">예약 시간</label>
        <input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
        />
        <div className="mt-1 text-[11px] text-slate-500">
          현재 시각 기준으로 자동 설정됩니다. 필요하면 변경하세요.
        </div>
      </div>

      <div className="pt-2 flex justify-end">
        <button
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-700 text-white text-sm font-medium px-4 py-2.5 disabled:opacity-60"
        >
          <Plus size={16} />
          호출 요청
        </button>
      </div>
    </form>
  );
}

/** =========================
 * Main Page
 * ======================= */
export default function CallsPage() {
  const { user } = useAuth();

  // 데이터 소스
  const stores = load<any[]>(LS_KEYS.stores) || [];
  const users = load<any[]>(LS_KEYS.users) || [];
  const [list, setList] = React.useState<CallRow[]>(
    () => load<CallRow[]>(LS_KEYS.calls) || []
  );

  // UI 상태
  const [q, setQ] = React.useState('');
  const [status, setStatus] = React.useState<'all' | CallStatus>('all');

  // 모달
  const [openNew, setOpenNew] = React.useState(false);
  // 모달 내부 폼을 새로 열 때마다 기본 시간(nowRoundedLocal)로 초기화하도록 key 변경
  const [modalKey, setModalKey] = React.useState(0);

  // 역할 기반 뷰 제한
  const myManagerId = React.useMemo(
    () => (user?.role === 'staff' ? (user?.managerId || null) : null),
    [user]
  );

  // 목록 필터링/정렬: 직원 → 본인 요청만 / 매니저 → 자기 소속 직원 요청 / 총관리자 → 전체
  const scoped = React.useMemo(() => {
    if (!user) return [] as CallRow[];
    let base = list;

    if (user.role === 'staff') {
      base = base.filter((c) => c.staffId === user.id);
    } else if (user.role === 'manager') {
      base = base.filter((c) => c.managerId === user.id);
    }

    const needle = q.trim().toLowerCase();
    if (needle) {
      base = base.filter((c) => {
        const staff = users.find((u: any) => u.id === c.staffId);
        const store = stores.find((s: any) => String(s.id) === String(c.storeId));
        return (
          (staff?.nickname || staff?.username || '').toLowerCase().includes(needle) ||
          (store?.name || '').toLowerCase().includes(needle) ||
          c.status.toLowerCase().includes(needle)
        );
      });
    }

    if (status !== 'all') {
      base = base.filter((c) => c.status === status);
    }

    // 최신 요청 먼저
    return base
      .slice()
      .sort((a, b) => (b.requestedAt || '').localeCompare(a.requestedAt || ''));
  }, [list, user, users, stores, q, status]);

  // 저장 헬퍼
  const persist = (rows: CallRow[]) => {
    save(LS_KEYS.calls, rows);
    setList(rows);
  };

  // 생성: 직원만
  const createRequest = (payload: { storeId: number | string; whenISO: string }) => {
    if (!user || user.role !== 'staff') {
      alert('직원만 호출을 생성할 수 있습니다.');
      return;
    }
    const rec: CallRow = {
      id: genId(),
      staffId: user.id,
      managerId: myManagerId ?? null,
      storeId: payload.storeId,
      when: payload.whenISO,
      status: 'pending',
      requestedAt: new Date().toISOString(),
    };
    const next = [rec, ...list];
    persist(next);
    setOpenNew(false);
  };

  // 상태 변경: 매니저/총관리자만
  const setStatusRow = (id: number, nextStatus: CallStatus) => {
    if (!user || user.role === 'staff') {
      alert('권한이 없습니다.');
      return;
    }
    const next = list.map((c) => (c.id === id ? { ...c, status: nextStatus } : c));
    persist(next);
  };

  // 상태 뱃지
  const Badge = ({ st }: { st: CallStatus }) => {
    const color =
      st === 'pending'
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : st === 'approved'
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : 'bg-rose-50 text-rose-700 border-rose-200';
    const label = st === 'pending' ? '대기' : st === 'approved' ? '승인' : '거절';
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] ${color}`}>
        {label}
      </span>
    );
  };

  // 상태 필터 토글
  const cycleStatus = () => {
    setStatus((s) =>
      s === 'all' ? 'pending' : s === 'pending' ? 'approved' : s === 'approved' ? 'rejected' : 'all'
    );
  };

  return (
    <ClientGuard>
      <PageWrap>
        {/* 헤더 */}
        <div className="flex flex-col gap-3 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PhoneCall className="text-slate-700" />
              <h2 className="text-xl font-semibold">호출</h2>
            </div>

            {user?.role === 'staff' && (
              <button
                onClick={() => {
                  setModalKey((k) => k + 1);
                  setOpenNew(true);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-700 text-white text-sm font-medium px-4 py-2.5"
              >
                <Plus size={16} />
                호출 요청
              </button>
            )}
          </div>

          {/* 컨트롤 바: 모바일 가로 정렬 + 자동 줄바꿈 */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="직원/가게/상태 검색"
                className="w-[220px] max-w-[60vw] pl-9 pr-3 py-2 rounded-xl border border-slate-300 bg-white text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              />
            </div>

            <button
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm px-3 py-2"
              onClick={cycleStatus}
              title="상태 필터"
            >
              <Filter size={16} />
              {status === 'all' ? '전체' : status === 'pending' ? '대기' : status === 'approved' ? '승인' : '거절'}
            </button>
            {/* 정렬 버튼은 제거(요청사항). 내부는 최신순 유지 */}
          </div>
        </div>

        {/* 목록 */}
        <div className="overflow-x-auto bg-white border border-slate-200 rounded-2xl">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-3 text-left">직원</th>
                <th className="p-3 text-left">가게</th>
                <th className="p-3 text-left">요청 시간</th>
                <th className="p-3 text-left">예약 시간</th>
                <th className="p-3 text-left">상태</th>
                <th className="p-3 text-left">작업</th>
              </tr>
            </thead>
            <tbody>
              {scoped.map((c) => {
                const staff = users.find((u: any) => u.id === c.staffId);
                const store = stores.find((s: any) => String(s.id) === String(c.storeId));
                return (
                  <tr key={c.id} className="border-t">
                    <td className="p-3">{staff?.nickname || staff?.username || c.staffId}</td>
                    <td className="p-3">
                      <div className="inline-flex items-center gap-1.5">
                        <Store size={14} className="text-slate-400" />
                        <span>{store?.name || '-'}</span>
                      </div>
                    </td>
                    <td className="p-3">{fmt(c.requestedAt)}</td>
                    <td className="p-3">{fmt(c.when)}</td>
                    <td className="p-3">
                      <Badge st={c.status} />
                    </td>
                    <td className="p-3">
                      {user?.role !== 'staff' ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setStatusRow(c.id, 'approved')}
                            className="px-2 py-1 rounded-lg bg-slate-900 text-white text-xs inline-flex items-center gap-1"
                            title="승인"
                          >
                            <Check size={14} />
                            승인
                          </button>
                          <button
                            onClick={() => setStatusRow(c.id, 'rejected')}
                            className="px-2 py-1 rounded-lg bg-red-600 text-white text-xs inline-flex items-center gap-1"
                            title="거절"
                          >
                            <X size={14} />
                            거절
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {scoped.length === 0 && (
                <tr>
                  <td className="p-4 text-slate-500" colSpan={6}>
                    표시할 호출이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 신규 요청 모달 (직원 전용) — 제목을 '호출 요청'으로 */}
        <Modal
          open={openNew}
          onClose={() => setOpenNew(false)}
          title="호출 요청"
        >
          {/* key를 바꿔서 열 때마다 기본 시간(nowRoundedLocal) 리셋 */}
          <RequestForm
            key={modalKey}
            stores={stores}
            defaultStoreId={stores[0]?.id}
            onSubmit={createRequest}
          />
        </Modal>
      </PageWrap>
    </ClientGuard>
  );
}
