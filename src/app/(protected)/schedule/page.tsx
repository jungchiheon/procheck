'use client';

import React from 'react';
import ClientGuard from '@/middleware/client-guard';
import PageWrap from '@/components/PageWrap';
import { useAuth } from '@/lib/auth';
import { LS_KEYS, load, todayStr } from '@/lib/storage';

type Row = {
  id: string;
  user_id: number;
  store_id: string;
  start_at: string;
  end_at: string;
  work_date?: string;
};

type Store = { id: string; name: string };

const fmt = (iso?: string) => {
  if (!iso) return '-';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '-' : d.toLocaleString();
};

export default function SchedulePage() {
  const { user } = useAuth();
  const [stores, setStores] = React.useState<Store[]>([]);
  const [rows, setRows] = React.useState<Row[]>([]);
  const [loading, setLoading] = React.useState(false);

  const [date, setDate] = React.useState(todayStr());
  const [storeId, setStoreId] = React.useState<string>('');
  const [startTime, setStartTime] = React.useState('09:00');
  const [endTime, setEndTime]     = React.useState('18:00');
  const [editId, setEditId]       = React.useState<string | null>(null);
  const [error, setError]         = React.useState('');

  // 스토어 로드 (API → 실패 시 LS)
  const loadStores = React.useCallback(async () => {
    try {
      const res = await fetch('/api/stores', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'load fail');
      const list = (json?.rows || []).map((s:any) => ({ id: String(s.id), name: s.name }));
      setStores(list);
      setStoreId(list[0]?.id || '');
    } catch {
      const ls = (load<any[]>(LS_KEYS.stores) || []).map(s => ({ id: String(s.id), name: s.name }));
      setStores(ls);
      setStoreId(ls[0]?.id || '');
    }
  }, []);

  // 스케줄 로드
  const loadSchedules = React.useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const role = user.role as 'staff' | 'manager' | 'super_admin';
      const qs = new URLSearchParams({
        role,
        dateFrom: date,
        dateTo: date
      });
      if (role === 'staff') qs.set('userId', String(user.id));
      if (role === 'manager') qs.set('managerId', String(user.id));

      const res = await fetch(`/api/schedules?${qs.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'load fail');
      setRows(json.rows || []);
    } catch (e:any) {
      setError(e?.message || '스케줄 조회 실패');
    } finally {
      setLoading(false);
    }
  }, [user, date]);

  React.useEffect(() => { loadStores(); }, [loadStores]);
  React.useEffect(() => { loadSchedules(); }, [loadSchedules]);

  // date + HH:mm → ISO (UTC 기준으로 만들어 일관성)
  const toISO = (d: string, hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    const base = new Date(d + 'T00:00:00Z');
    base.setUTCHours(h, m, 0, 0);
    return base.toISOString();
  };

  const onSave = async () => {
    if (!user) return;
    if (!storeId) return alert('가게를 선택하세요.');
    const startAt = toISO(date, startTime);
    const endAt   = toISO(date, endTime);
    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      return alert('퇴근이 출근 이후여야 합니다.');
    }

    try {
      if (!editId) {
        const res = await fetch('/api/schedules', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            storeId,           // 문자열 그대로
            startAt, endAt
          })
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || '생성 실패');
      } else {
        const res = await fetch('/api/schedules', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            id: editId,
            storeId,
            startAt,
            endAt
          })
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || '수정 실패');
      }
      setEditId(null);
      await loadSchedules();
    } catch (e:any) {
      alert(e?.message || '저장 실패');
    }
  };

  const onEdit = (r: Row) => {
    setEditId(r.id);
    setStoreId(String(r.store_id));
    const s = new Date(r.start_at);
    const e = new Date(r.end_at);
    const hh = (n:number)=> String(n).padStart(2,'0');
    setDate(s.toISOString().slice(0,10));
    setStartTime(`${hh(s.getUTCHours())}:${hh(s.getUTCMinutes())}`);
    setEndTime(`${hh(e.getUTCHours())}:${hh(e.getUTCMinutes())}`);
  };

  const onDelete = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    const res = await fetch('/api/schedules', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id })
    });
    const json = await res.json();
    if (!res.ok) return alert(json?.error || '삭제 실패');
    await loadSchedules();
  };

  const users = load<any[]>(LS_KEYS.users) || [];

  return (
    <ClientGuard>
      <PageWrap>
        <h2 className="text-xl font-semibold mb-4">스케줄</h2>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <div className="grid sm:grid-cols-5 gap-3">
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="rounded-xl border-slate-300" />
            <select value={storeId} onChange={e=>setStoreId(e.target.value)} className="rounded-xl border-slate-300">
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input type="time" value={startTime} onChange={e=>setStartTime(e.target.value)} className="rounded-xl border-slate-300" />
            <input type="time" value={endTime} onChange={e=>setEndTime(e.target.value)} className="rounded-xl border-slate-300" />
            <button onClick={onSave} className="rounded-xl bg-slate-900 text-white hover:bg-slate-700">{editId? '수정' : '추가'}</button>
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
        </div>

        <div className="mt-6 overflow-x-auto bg-white border border-slate-200 rounded-2xl">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-3 text-left">직원</th>
                <th className="p-3 text-left">가게</th>
                <th className="p-3 text-left">시작</th>
                <th className="p-3 text-left">종료</th>
                <th className="p-3 text-left">작업</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const u = users.find((x:any)=> x.id === r.user_id);
                const st = stores.find(s=> String(s.id) === String(r.store_id))?.name || '-';
                return (
                  <tr key={r.id} className="border-t">
                    <td className="p-3">{u?.nickname || u?.username || r.user_id}</td>
                    <td className="p-3">{st}</td>
                    <td className="p-3">{fmt(r.start_at)}</td>
                    <td className="p-3">{fmt(r.end_at)}</td>
                    <td className="p-3 flex gap-2">
                      <button onClick={()=>onEdit(r)} className="px-2 py-1 rounded-lg bg-slate-900 text-white text-xs">수정</button>
                      <button onClick={()=>onDelete(r.id)} className="px-2 py-1 rounded-lg bg-red-600 text-white text-xs">삭제</button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="p-4 text-slate-500">표시할 스케줄이 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </PageWrap>
    </ClientGuard>
  );
}