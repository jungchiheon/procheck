'use client';

import React from 'react';
import ClientGuard from '@/middleware/client-guard';
import PageWrap from '@/components/PageWrap';
import { useAuth } from '@/lib/auth';
import { LS_KEYS, load, todayStr } from '@/lib/storage';

const fmt = (v?: string | null) => {
  if (!v) return '-';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '-' : d.toLocaleString();
};

type Store = { id: string; name: string } | any;
type AttRow = {
  id: number;
  user_id: number;
  store_id: string;
  check_in_at: string | null;
  check_out_at: string | null;
  total_hours?: number | null;
  work_date?: string | null;
};

const TODAY = todayStr();

export default function AttendancePage() {
  const { user } = useAuth();
  const [stores, setStores] = React.useState<Store[]>([]);
  const [currentStoreId, setCurrentStoreId] = React.useState<string>('');
  const [rows, setRows] = React.useState<AttRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [workingRowId, setWorkingRowId] = React.useState<number | null>(null);
  const [err, setErr] = React.useState<string>('');

  // 스토어 로드 (API → 실패 시 LS)
  const loadStores = React.useCallback(async () => {
    try {
      const res = await fetch('/api/stores', { cache: 'no-store' });
      if (!res.ok) throw new Error('stores api failed');
      const json = await res.json();
      const list = (json?.rows || json || []).map((s: any) => ({ id: String(s.id), name: s.name }));
      setStores(list);
      setCurrentStoreId(list[0]?.id || '');
    } catch {
      const ls = (load<any[]>(LS_KEYS.stores) || []).map(s => ({ id: String(s.id), name: s.name }));
      setStores(ls);
      setCurrentStoreId(ls[0]?.id || '');
    }
  }, []);

  // 출퇴근 로드 (역할별, 오늘 날짜)
  const loadAttendance = React.useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setErr('');
    try {
      const role = user.role as 'staff' | 'manager' | 'super_admin';
      const qs = new URLSearchParams();
      qs.set('role', role);
      if (role === 'staff') qs.set('userId', String(user.id));
      if (role === 'manager') qs.set('managerId', String(user.id));
      qs.set('dateFrom', TODAY);
      qs.set('dateTo', TODAY);

      const res = await fetch(`/api/attendance?${qs.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'load failed');

      const list: AttRow[] = json?.rows || [];
      setRows(list);
      const open = list.find(r => r.user_id === user.id && !r.check_out_at);
      setWorkingRowId(open?.id ?? null);
    } catch (e: any) {
      setErr(e?.message || 'API 실패');
    } finally {
      setLoading(false);
    }
  }, [user]);

  React.useEffect(() => { loadStores(); }, [loadStores]);
  React.useEffect(() => { loadAttendance(); }, [loadAttendance]);

  // 체크인
  const onCheckIn = async () => {
    if (!user) return;
    if (!currentStoreId) return alert('가게를 선택하세요.');
    if (workingRowId) return alert('이미 출근 상태입니다.');

    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: user.id, storeId: currentStoreId }) // uuid면 문자열 그대로
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || '체크인 실패');
      await loadAttendance();
    } catch (e: any) {
      alert(e?.message || '체크인 실패');
    }
  };

  // 체크아웃
  const onCheckOut = async () => {
    if (!workingRowId) return alert('출근 상태가 아닙니다.');
    try {
      const res = await fetch('/api/attendance', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: workingRowId })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || '체크아웃 실패');
      await loadAttendance();
    } catch (e: any) {
      alert(e?.message || '체크아웃 실패');
    }
  };

  const myRows = rows.filter(r => r.user_id === user?.id).slice(0, 50);

  return (
    <ClientGuard>
      <PageWrap>
        <h2 className="text-xl font-semibold mb-4">출퇴근</h2>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <select
              value={currentStoreId}
              onChange={e => setCurrentStoreId(e.target.value)} // 문자열 그대로
              className="rounded-xl border-slate-300"
            >
              {stores.map((s: any) => (
                <option key={String(s.id)} value={String(s.id)}>{s.name}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button onClick={onCheckIn} className="px-4 py-2 rounded-xl bg-brand-600 text-white hover:bg-brand-700" disabled={loading}>출근</button>
              <button onClick={onCheckOut} className="px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-700" disabled={loading}>퇴근</button>
            </div>
            <div className="text-sm text-slate-500">상태: {workingRowId ? '근무중' : '대기'}</div>
            {err && <div className="text-xs text-amber-600">{err}</div>}
          </div>
        </div>

        <div className="mt-6">
          <h3 className="font-medium mb-2">내 기록 (최근 50개)</h3>
          <div className="overflow-x-auto bg-white border border-slate-200 rounded-2xl">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-3 text-left">가게</th>
                  <th className="p-3 text-left">출근</th>
                  <th className="p-3 text-left">퇴근</th>
                  <th className="p-3 text-left">총 시간</th>
                </tr>
              </thead>
              <tbody>
                {myRows.map(r => {
                  const storeName = stores.find((s: any) => String(s.id) === String(r.store_id))?.name || '-';
                  return (
                    <tr key={r.id} className="border-t">
                      <td className="p-3">{storeName}</td>
                      <td className="p-3">{fmt(r.check_in_at)}</td>
                      <td className="p-3">{fmt(r.check_out_at)}</td>
                      <td className="p-3">{(r.total_hours ?? 0).toFixed?.(2) ?? Number(r.total_hours || 0).toFixed(2)} h</td>
                    </tr>
                  );
                })}
                {myRows.length === 0 && (
                  <tr><td colSpan={4} className="p-4 text-slate-500">기록이 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </PageWrap>
    </ClientGuard>
  );
}