'use client';

import React from 'react';
import ClientGuard from '@/middleware/client-guard';
import PageWrap from '@/components/PageWrap';
import { useAuth } from '@/lib/auth';
import { LS_KEYS, load, save, genId, todayStr } from '@/lib/storage';
import { Search, Plus, Wallet, Store, Users, X, Pencil } from 'lucide-react';

type SaleRow = {
  id: number;
  user_id: string;           // ← uuid (문자열)
  legacy_user_id?: number;   // ← API가 붙여 준 숫자 id (이걸로 로컬 users 매칭)
  store_id: string;          // uuid
  sale_date: string;         // YYYY-MM-DD
  amount: number;
  cnt: number;
  incentive: number;
  note?: string | null;
};

const toNum = (v: any, def = 0) => {
  const n = Number(String(v).replaceAll(',', ''));
  return Number.isFinite(n) ? n : def;
};
const norm = (s: string) => s.normalize('NFC').toLowerCase();
const isUUID = (s:string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

/* ---------- Modal ---------- */
function Modal({ open, title, onClose, children }:{
  open:boolean; title?:string; onClose:()=>void; children:React.ReactNode
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute left-1/2 sm:top-1/2 sm:-translate-y-1/2 bottom-0 sm:bottom-auto w-full sm:w-[92vw] max-w-lg -translate-x-1/2">
        <div className="bg-white rounded-t-2xl sm:rounded-2xl border border-slate-200 shadow-soft overflow-hidden">
          <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
            <div className="text-sm font-semibold">{title}</div>
            <button onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-slate-100">
              <X size={16} />
            </button>
          </div>
          <div className="p-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

/* ---------- 읽기 전용 항목 ---------- */
function ItemRow({ label, value }:{ label:string; value:React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="text-xs text-slate-500 mt-1">{label}</div>
      <div className="text-sm text-slate-800 text-right break-words">{value}</div>
    </div>
  );
}

export default function SalesPage() {
  const { user } = useAuth();

  const users = load<any[]>(LS_KEYS.users) || [];

  // ✅ stores: API 우선 로드(실패 시 LS 폴백). API 성공 시 반드시 UUID id를 보유
  const [stores, setStores] = React.useState<{id:string;name:string}[]>([]);
  const [storesFromApi, setStoresFromApi] = React.useState(false);
  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/stores', { cache: 'no-store' });
        const json = await res.json();
        const list = (json?.rows || []).map((s:any) => ({ id: String(s.id), name: s.name }));
        if (list.length) {
          setStores(list);
          setStoresFromApi(true);
          return;
        }
        throw new Error('empty');
      } catch {
        const ls = (load<any[]>(LS_KEYS.stores) || []).map((s:any)=> ({ id: String(s.id), name: s.name }));
        setStores(ls);
        setStoresFromApi(false);
      }
    })();
  }, []);

  const [rows, setRows] = React.useState<SaleRow[]>([]);
  const [q, setQ] = React.useState('');
  const [dateFrom, setDateFrom] = React.useState(todayStr());
  const [dateTo, setDateTo] = React.useState(todayStr());
  const [storeFilter, setStoreFilter] = React.useState<'all' | string>('all');

  const [detailOpen, setDetailOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [modalKey, setModalKey] = React.useState(0);
  const [selected, setSelected] = React.useState<SaleRow | null>(null);

  const [form, setForm] = React.useState({
    id: null as number | null,
    userId: user?.id || 0,         // ← 숫자(로컬 유저 id)
    userSearch: '',
    storeId: '' as string,          // uuid or fallback
    date: todayStr(),
    amount: '',
    count: '',
    incentive: '',
    note: '',
  });

  // 직원명 표시(검색/테이블/상세 공통)
  const displayUserName = React.useCallback((r: SaleRow) => {
    if (typeof r.legacy_user_id === 'number') {
      const u = users.find((x:any) => x.id === r.legacy_user_id);
      if (u) return u.nickname || u.username || `ID ${r.legacy_user_id}`;
    }
    const maybeNum = Number(r.user_id);
    if (Number.isFinite(maybeNum)) {
      const u = users.find((x:any) => x.id === maybeNum);
      if (u) return u.nickname || u.username || `ID ${maybeNum}`;
    }
    return '알 수 없음';
  }, [users]);

  /* ---------- 로드 ---------- */
  const loadSales = React.useCallback(async () => {
    if (!user) return;
    try {
      const role = user.role as 'staff'|'manager'|'super_admin';
      const qs = new URLSearchParams({ role, dateFrom, dateTo });
      if (role === 'staff') qs.set('userId', String(user.id));
      if (role === 'manager') qs.set('managerId', String(user.id));
      // UUID일 때만 서버 필터 적용
      if (storeFilter !== 'all' && isUUID(String(storeFilter))) {
        qs.set('storeId', String(storeFilter));
      }
      const res = await fetch(`/api/sales?${qs.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'load failed');

      // 서버에서 내려오는 user_id(uuid) + (선택적으로) legacy_user_id
      setRows((json.rows || []) as SaleRow[]);
      save('cache_sales', json.rows || []);
    } catch {
      // 폴백: 로컬 스토리지 구조를 SaleRow로 맞춰서 변환
      const cache = (load<any[]>('cache_sales') || []) as SaleRow[];
      if (cache.length) { setRows(cache); return; }
      const ls = (load<any[]>(LS_KEYS.sales) || []).map((r:any) => ({
        id: Number(r.id)||genId(),
        user_id: String(r.userId),         // ← LS는 숫자이므로 문자열로
        legacy_user_id: Number(r.userId),  // ← 표시용 매칭을 위해 같이 보관
        store_id: String(r.storeId),
        sale_date: String(r.date||todayStr()),
        amount: Number(r.amount||0),
        cnt: Number(r.count||0),
        incentive: Number(r.incentive||0),
        note: r.note ?? null
      })) as SaleRow[];
      setRows(ls);
    }
  }, [user, dateFrom, dateTo, storeFilter]);

  React.useEffect(() => { loadSales(); }, [loadSales]);

  /* ---------- 검색/정렬 ---------- */
  const scoped = React.useMemo(() => {
    if (!user) return [] as SaleRow[];
    let base = rows.slice();

    const n = norm(q.trim());
    if (n) {
      base = base.filter((r) => {
        const name = displayUserName(r);
        const s = stores.find((x:any)=> String(x.id)===String(r.store_id));
        return (
          norm(name||'').includes(n) ||
          norm(s?.name||'').includes(n) ||
          norm(r.note||'').includes(n)
        );
      });
    }
    base.sort((a,b)=> (b.sale_date + String(b.id)).localeCompare(a.sale_date + String(a.id)));
    return base;
  }, [rows, q, stores, user, displayUserName]);

  /* ---------- 합계 ---------- */
  const totalAmount = scoped.reduce((sum,r)=> sum + (r.amount||0), 0);
  const totalCount  = scoped.reduce((sum,r)=> sum + (r.cnt||0), 0);

  /* ---------- 직원 검색 후보 ---------- */
  const filteredEmployees = React.useMemo(() => {
    const needle = norm(form.userSearch.trim());
    const pool = users;
    if (!needle) return pool;
    return pool.filter((u:any)=> norm(u.nickname||u.username||'').includes(needle));
  }, [form.userSearch, users]);

  /* ---------- 보기/편집 ---------- */
  const openDetail = (r: SaleRow) => { setSelected(r); setDetailOpen(true); };

  const openCreate = () => {
    const defaultStore = stores[0]?.id || '';
    setSelected(null);
    setForm(f => ({
      ...f,
      id: null,
      userId: user?.id || (users[0]?.id ?? 0),
      storeId: defaultStore,
      date: todayStr(),
      amount: '',
      count: '',
      incentive: '',
      note: '',
    }));
    setModalKey(k=>k+1);
    setEditOpen(true);
  };

  const openEditFromDetail = () => {
    if (!selected) return;

    // 편집 폼의 userId는 "숫자(로컬)"가 필요 → legacy_user_id 우선, 없으면 user_id 숫자 변환 폴백
    const editUserId =
      (typeof selected.legacy_user_id === 'number' ? selected.legacy_user_id :
       Number(selected.user_id)) || (user?.id || 0);

    setForm({
      id: selected.id,
      userId: editUserId,
      userSearch: '',
      storeId: String(selected.store_id),
      date: selected.sale_date,
      amount: String(selected.amount),
      count: String(selected.cnt),
      incentive: String(selected.incentive||0),
      note: selected.note || '',
    });
    setDetailOpen(false);
    setModalKey(k=>k+1);
    setEditOpen(true);
  };

  // 권한 체크: 직원은 자기 레코드만 수정 가능 (legacy_user_id 우선 비교)
  const canEditRow = (r: SaleRow) => {
    if (user?.role !== 'staff') return true;
    if (typeof r.legacy_user_id === 'number') return r.legacy_user_id === user?.id;
    const maybeNum = Number(r.user_id);
    return Number.isFinite(maybeNum) ? maybeNum === user?.id : false;
  };

  /* ---------- 저장/삭제 ---------- */
  const onSave = async () => {
    if (!user) return;
    if (user.role==='staff' && form.userId !== user.id) return alert('직원은 본인 매출만 등록/수정 가능합니다.');
    if (!form.storeId) return alert('가게를 선택하세요.');
    if (!form.date) return alert('날짜를 선택하세요.');

    const payload = {
      userId: form.userId,
      storeId: String(form.storeId), // uuid ideally
      date: form.date,
      amount: Math.max(0, toNum(form.amount)),
      count: Math.max(0, toNum(form.count)),
      incentive: Math.max(0, toNum(form.incentive)),
      note: form.note?.trim() || null,
    };

    // ✅ API로 받은 매장(UUID)이 아닐 경우: 무조건 LS 폴백 (DB에 숫자 "1" 같은 값이 들어가지 않도록)
    const mustFallbackLS = !storesFromApi || !isUUID(payload.storeId);

    try {
      if (!mustFallbackLS) {
        if (form.id == null) {
          const res = await fetch('/api/sales', {
            method: 'POST', headers:{ 'content-type':'application/json' },
            body: JSON.stringify(payload)
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json?.error || 'create failed');
        } else {
          const res = await fetch('/api/sales', {
            method: 'PATCH', headers:{ 'content-type':'application/json' },
            body: JSON.stringify({ id: form.id, ...payload })
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json?.error || 'update failed');
        }
      } else {
        // LS 폴백 저장
        const prev = (load<any[]>(LS_KEYS.sales) || []);
        if (form.id == null) {
          const rec = {
            id: genId(),
            userId: payload.userId,
            storeId: payload.storeId, // 숫자라도 로컬엔 저장 가능
            date: payload.date,
            amount: payload.amount,
            count: payload.count,
            incentive: payload.incentive,
            note: payload.note
          };
          save(LS_KEYS.sales, [rec, ...prev]);
        } else {
          const next = prev.map((r:any)=> r.id===form.id ? {
            ...r,
            userId: payload.userId,
            storeId: payload.storeId,
            date: payload.date,
            amount: payload.amount,
            count: payload.count,
            incentive: payload.incentive,
            note: payload.note
          } : r);
          save(LS_KEYS.sales, next);
        }
      }
      setEditOpen(false);
      await loadSales();
    } catch (e:any) {
      // 마지막 안전망: 실패 시에도 LS에 저장
      const prev = (load<any[]>(LS_KEYS.sales) || []);
      if (form.id == null) {
        const rec = {
          id: genId(),
          userId: payload.userId,
          storeId: payload.storeId,
          date: payload.date,
          amount: payload.amount,
          count: payload.count,
          incentive: payload.incentive,
          note: payload.note
        };
        save(LS_KEYS.sales, [rec, ...prev]);
      } else {
        const next = prev.map((r:any)=> r.id===form.id ? {
          ...r,
          userId: payload.userId,
          storeId: payload.storeId,
          date: payload.date,
          amount: payload.amount,
          count: payload.count,
          incentive: payload.incentive,
          note: payload.note
        } : r);
        save(LS_KEYS.sales, next);
      }
      setEditOpen(false);
      await loadSales();
    }
  };

  const onDelete = async (id:number) => {
    if (!confirm('삭제하시겠습니까?')) return;
    try {
      if (storesFromApi) {
        const res = await fetch('/api/sales', {
          method: 'DELETE', headers:{ 'content-type':'application/json' },
          body: JSON.stringify({ id })
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'delete failed');
      } else {
        const prev = (load<any[]>(LS_KEYS.sales) || []);
        save(LS_KEYS.sales, prev.filter((r:any)=> r.id!==id));
      }
      setDetailOpen(false);
      await loadSales();
    } catch {
      const prev = (load<any[]>(LS_KEYS.sales) || []);
      save(LS_KEYS.sales, prev.filter((r:any)=> r.id!==id));
      setDetailOpen(false);
      await loadSales();
    }
  };

  const RowMobile = ({ r }: { r: SaleRow }) => {
    const s = stores.find((x:any)=> String(x.id)===String(r.store_id));
    const name = displayUserName(r);
    return (
      <button onClick={()=>openDetail(r)} className="w-full text-left rounded-2xl border border-slate-200 px-4 py-3 bg-white shadow-sm active:scale-[0.99] transition">
        <div className="text-base font-medium">{r.sale_date}</div>
        <div className="mt-1 text-sm text-slate-600 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 min-w-0">
            <Users size={14} className="text-slate-400 shrink-0" />
            <span className="truncate">{name}</span>
          </span>
          <span className="text-slate-300">·</span>
          <span className="inline-flex items-center gap-1 min-w-0">
            <Store size={14} className="text-slate-400 shrink-0" />
            <span className="truncate">{s?.name || '-'}</span>
          </span>
        </div>
      </button>
    );
  };

  const RowDesktop = ({ r }: { r: SaleRow }) => {
    const s = stores.find((x:any)=> String(x.id)===String(r.store_id));
    return (
      <tr className="border-t cursor-pointer hover:bg-slate-50" onClick={()=>openDetail(r)}>
        <td className="p-3">{r.sale_date}</td>
        <td className="p-3">{displayUserName(r)}</td>
        <td className="p-3">{s?.name || '-'}</td>
      </tr>
    );
  };

  return (
    <ClientGuard>
      <PageWrap>
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Wallet className="text-slate-700" />
            <h2 className="text-xl font-semibold">매출</h2>
          </div>
          <div className="hidden sm:block">
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-700 text-white text-sm font-medium px-4 py-2.5"
            >
              <Plus size={16} /> 매출 입력
            </button>
          </div>
        </div>

        {/* 컨트롤 */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={q} onChange={(e)=>setQ(e.target.value)}
              placeholder="직원/가게/메모 검색"
              className="w-[220px] max-w-[70vw] pl-9 pr-3 py-2 rounded-xl border border-slate-300 bg-white text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
            />
          </div>

          <div className="flex items-center gap-2">
            <input type="date" value={dateFrom} onChange={(e)=>setDateFrom(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" />
            <span className="text-slate-400 text-sm">~</span>
            <input type="date" value={dateTo} onChange={(e)=>setDateTo(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" />
          </div>

          <select
            value={storeFilter as any}
            onChange={(e)=> setStoreFilter(e.target.value==='all' ? 'all' : String(e.target.value))}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            title={storesFromApi ? 'API 매장 로드됨' : '로컬 매장(숫자 ID) — 서버 필터 미적용'}
          >
            <option value="all">전체 매장</option>
            {stores.map((s:any)=> <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {/* 집계 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="text-xs text-slate-500">총 매출</div>
            <div className="text-lg font-semibold mt-1">{totalAmount.toLocaleString()} 원</div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="text-xs text-slate-500">총 건수</div>
            <div className="text-lg font-semibold mt-1">{totalCount} 건</div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="text-xs text-slate-500">평균 매출/건</div>
            <div className="text-lg font-semibold mt-1">
              {totalCount ? Math.round(totalAmount/totalCount).toLocaleString() : 0} 원
            </div>
          </div>
        </div>

        {/* 목록 */}
        <div className="bg-transparent sm:bg-white sm:border sm:border-slate-200 sm:rounded-2xl">
          {/* 모바일 카드 */}
          <div className="sm:hidden grid gap-2">
            {scoped.length===0 ? (
              <div className="p-4 text-slate-500 text-sm">표시할 매출이 없습니다.</div>
            ) : (
              scoped.map(r=> <RowMobile key={r.id} r={r} />)
            )}
          </div>
          {/* 데스크탑 테이블 */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-3 text-left">날짜</th>
                  <th className="p-3 text-left">직원</th>
                  <th className="p-3 text-left">가게</th>
                </tr>
              </thead>
              <tbody>
                {scoped.length===0 ? (
                  <tr><td className="p-4 text-slate-500" colSpan={3}>표시할 매출이 없습니다.</td></tr>
                ) : scoped.map(r=> <RowDesktop key={r.id} r={r} />)}
              </tbody>
            </table>
          </div>
        </div>

        {/* 모바일 FAB */}
        <button
          onClick={openCreate}
          className="sm:hidden fixed right-4 bottom-20 z-40 rounded-full shadow-soft bg-slate-900 text-white px-4 py-3 inline-flex items-center gap-2"
        >
          <Plus size={16} /> 매출 입력
        </button>

        {/* 보기 모달 */}
        <Modal open={detailOpen} onClose={()=>setDetailOpen(false)} title="매출 상세">
          {!selected ? null : (
            <div className="space-y-3">
              <ItemRow label="날짜" value={selected.sale_date} />
              <ItemRow label="직원" value={displayUserName(selected)} />
              <ItemRow label="가게" value={(stores.find(s=> String(s.id)===String(selected.store_id))?.name) || '-'} />
              <ItemRow label="매출액" value={`${(selected.amount||0).toLocaleString()} 원`} />
              <ItemRow label="건수" value={`${selected.cnt||0} 건`} />
              <ItemRow label="인센티브" value={`${(selected.incentive||0).toLocaleString()} 원`} />
              {selected.note ? <ItemRow label="메모" value={selected.note} /> : null}

              <div className="pt-2 flex justify-between">
                {canEditRow(selected) ? (
                  <button onClick={()=>onDelete(selected.id)} className="text-sm text-red-600 hover:underline">삭제</button>
                ) : <div />}

                <div className="flex gap-2">
                  <button onClick={()=>setDetailOpen(false)} className="rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-4 py-2 text-sm">닫기</button>
                  {canEditRow(selected) && (
                    <button onClick={openEditFromDetail} className="rounded-xl bg-slate-900 hover:bg-slate-700 text-white px-4 py-2 text-sm inline-flex items-center gap-1">
                      <Pencil size={14} /> 수정
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </Modal>

        {/* 편집 모달 */}
        <Modal open={editOpen} onClose={()=>setEditOpen(false)} title={form.id ? '매출 수정' : '매출 입력'}>
          <div key={modalKey} className="space-y-3">
            {/* 직원 (관리자/부관리자만) */}
            {user?.role!=='staff' ? (
              <div className="space-y-2">
                <label className="block text-xs text-slate-500">직원</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={form.userSearch}
                      onChange={(e)=>setForm(f=>({...f, userSearch: e.target.value}))}
                      placeholder="이름 검색 (예: 김)"
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 bg-white text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
                    />
                  </div>
                  <select
                    value={form.userId as any}
                    onChange={(e)=>setForm(f=>({...f, userId: Number(e.target.value)}))}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    {filteredEmployees.map((u:any)=> (
                      <option key={u.id} value={u.id}>{u.nickname || u.username}</option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-600">
                직원: <span className="font-medium">{users.find((u:any)=>u.id===form.userId)?.nickname || users.find((u:any)=>u.id===form.userId)?.username}</span>
              </div>
            )}

            {/* 가게 */}
            <div>
              <label className="block text-xs text-slate-500 mb-1">가게</label>
              <select
                value={form.storeId}
                onChange={(e)=>setForm(f=>({...f, storeId: String(e.target.value)}))}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {stores.map((s:any)=> <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {!storesFromApi && (
                <div className="mt-1 text-xs text-amber-600">
                  * 서버 매장 목록을 불러오지 못해 로컬(ID: {form.storeId})로 저장됩니다.
                </div>
              )}
            </div>

            {/* 날짜/금액/건수/인센티브/메모 */}
            <div>
              <label className="block text-xs text-slate-500 mb-1">날짜</label>
              <input type="date" value={form.date} onChange={(e)=>setForm(f=>({...f, date: e.target.value }))} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="block text-xs text-slate-500 mb-1">매출액(원)</label>
                <input inputMode="numeric" value={form.amount} onChange={(e)=>setForm(f=>({...f, amount: e.target.value }))} placeholder="0" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">건수</label>
                <input inputMode="numeric" value={form.count} onChange={(e)=>setForm(f=>({...f, count: e.target.value }))} placeholder="0" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">인센티브(원)</label>
                <input inputMode="numeric" value={form.incentive} onChange={(e)=>setForm(f=>({...f, incentive: e.target.value }))} placeholder="0" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">메모</label>
              <input value={form.note} onChange={(e)=>setForm(f=>({...f, note: e.target.value }))} placeholder="선택 입력" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" />
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button onClick={()=>setEditOpen(false)} className="rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-4 py-2 text-sm">닫기</button>
              <button onClick={onSave} className="rounded-xl bg-slate-900 hover:bg-slate-700 text-white px-4 py-2 text-sm">저장</button>
            </div>
          </div>
        </Modal>
      </PageWrap>
    </ClientGuard>
  );
}
