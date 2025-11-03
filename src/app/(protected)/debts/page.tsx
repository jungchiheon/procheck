'use client';

import React from 'react';
import ClientGuard from '@/middleware/client-guard';
import PageWrap from '@/components/PageWrap';
import { useAuth } from '@/lib/auth';
import { LS_KEYS, load, save, genId } from '@/lib/storage';

type Debt = {
  id: number;
  userId: number;
  storeId: string;    // 문자열 통일
  amount: number;
  note?: string;
  createdAt?: string;
};

type User = { id: number; username: string; nickname?: string; role: string; managerId?: number };
type Store = { id: string; name: string };

const fmtMoney = (n: number) => (Number(n) || 0).toLocaleString();
const includesQ = (s: string, q: string) => s.toLowerCase().includes(q.toLowerCase());

export default function DebtsPage() {
  const { user } = useAuth();
  if (!user) return (
  <ClientGuard>
    <PageWrap><div /></PageWrap>
  </ClientGuard>
);
  if (user.role === 'staff') {
    return (
      <ClientGuard>
        <PageWrap>
          <h2 className="text-xl font-semibold mb-4">미수금 관리</h2>
          <div className="text-slate-600">권한이 없습니다.</div>
        </PageWrap>
      </ClientGuard>
    );
  }

  const rawUsers = (load<User[]>(LS_KEYS.users) || []) as User[];
  const rawStores = (load<any[]>(LS_KEYS.stores) || []);
  const stores: Store[] = rawStores.map((s) => ({ id: String(s.id), name: s.name }));

  const [allDebts, setAllDebts] = React.useState<Debt[]>(
    () => (load<Debt[]>(LS_KEYS.debts) || []).map((d) => ({ ...d, storeId: String(d.storeId) }))
  );
  const [q, setQ] = React.useState('');
  const [activeUserId, setActiveUserId] = React.useState<number | null>(null);

  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Debt | null>(null);

  const [form, setForm] = React.useState<{
    userId: number | '';
    storeId: string | '';
    amount: string;
    note: string;
  }>({
    userId: '',
    storeId: stores[0]?.id || '',
    amount: '',
    note: '',
  });

  const persist = (rows: Debt[]) => { save(LS_KEYS.debts, rows); setAllDebts(rows); };

  const staff = React.useMemo(() => {
    const lower = q.trim().toLowerCase();
    const base = rawUsers.filter((u) => u.role !== 'super_admin');
    if (!lower) return base.sort((a, b) => (a.nickname || a.username).localeCompare(b.nickname || b.username));
    return base
      .filter((u) => includesQ(u.nickname || u.username || '', lower))
      .sort((a, b) => (a.nickname || a.username).localeCompare(b.nickname || b.username));
  }, [rawUsers, q]);

  React.useEffect(() => {
    if (activeUserId == null && staff[0]) setActiveUserId(staff[0].id);
  }, [activeUserId, staff]);

  const selectedUser = React.useMemo(() => rawUsers.find((u) => u.id === activeUserId) || null, [rawUsers, activeUserId]);

  const list = React.useMemo(() => {
    if (!activeUserId) return [];
    return allDebts
      .filter((d) => d.userId === activeUserId)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [allDebts, activeUserId]);

  const totalAmount = React.useMemo(() => list.reduce((s, d) => s + (Number(d.amount) || 0), 0), [list]);

  const openCreate = () => {
    setEditing(null);
    setForm({ userId: activeUserId || '', storeId: stores[0]?.id || '', amount: '', note: '' });
    setOpen(true);
  };
  const openEdit = (d: Debt) => {
    setEditing(d);
    setForm({ userId: d.userId, storeId: d.storeId, amount: String(d.amount), note: d.note || '' });
    setOpen(true);
  };
  const close = () => { setOpen(false); setEditing(null); };

  const onSave = () => {
    const amountNum = Number(form.amount);
    if (!form.userId) return alert('직원을 선택하세요.');
    if (!form.storeId) return alert('가게를 선택하세요.');
    if (!amountNum || isNaN(amountNum)) return alert('금액을 입력하세요.');

    if (!editing) {
      const row: Debt = {
        id: genId(),
        userId: Number(form.userId),
        storeId: String(form.storeId),
        amount: amountNum,
        note: form.note?.trim() || '',
        createdAt: new Date().toISOString(),
      };
      persist([row, ...allDebts]);
    } else {
      const next = allDebts.map((d) =>
        d.id === editing.id
          ? { ...d, userId: Number(form.userId), storeId: String(form.storeId), amount: amountNum, note: form.note?.trim() || '' }
          : d
      );
      persist(next);
    }
    close();
  };

  const onDelete = (id: number) => {
    if (!confirm('삭제하시겠습니까?')) return;
    persist(allDebts.filter((d) => d.id !== id));
  };

  return (
    <ClientGuard>
      <PageWrap>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">미수금 관리</h2>
          <div className="hidden sm:block text-sm text-slate-500">직원을 검색하여 선택한 뒤, 미수금을 관리하세요.</div>
        </div>

        {/* 모바일 상단 영역 */}
        <div className="lg:hidden bg-white rounded-2xl border border-slate-200 p-4 mb-4">
          <div className="grid grid-cols-1 gap-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="직원 검색 (예: 김)"
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
            />
            <select
              value={activeUserId ?? ''}
              onChange={(e) => setActiveUserId(Number(e.target.value))}
              className="rounded-xl border-slate-300"
            >
              {staff.map((u) => (
                <option key={u.id} value={u.id}>{u.nickname || u.username}</option>
              ))}
              {staff.length === 0 && <option value="">직원이 없습니다</option>}
            </select>
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-sm">
                <div className="text-slate-500">선택 직원</div>
                <div className="font-semibold">{selectedUser ? (selectedUser.nickname || selectedUser.username) : '미선택'}</div>
              </div>
              <div className="text-right">
                <div className="text-slate-500 text-sm">총 미수금</div>
                <div className="text-base font-semibold">{fmtMoney(totalAmount)} 원</div>
              </div>
            </div>
            <button onClick={openCreate} className="rounded-xl bg-slate-900 text-white hover:bg-slate-700 px-4 py-2.5" disabled={!activeUserId}>
              + 미수금 추가
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* 좌측: 검색 + 직원 목록 (데스크탑) */}
          <aside className="hidden lg:block bg-white border border-slate-200 rounded-2xl p-3 lg:col-span-1">
            <div className="mb-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="직원 검색 (이름/아이디)"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              />
            </div>
            <div className="max-h-[65vh] overflow-auto pr-1">
              {staff.length === 0 && <div className="text-sm text-slate-400 p-2">직원이 없습니다.</div>}
              <ul className="space-y-1">
                {staff.map((u) => {
                  const myTotal = allDebts.filter((d) => d.userId === u.id).reduce((s, d) => s + (Number(d.amount) || 0), 0);
                  const active = activeUserId === u.id;
                  return (
                    <li key={u.id}>
                      <button
                        onClick={() => setActiveUserId(u.id)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left hover:bg-slate-50 ${
                          active ? 'bg-slate-50 border border-slate-200' : ''
                        }`}
                      >
                        <div className="truncate">
                          <div className="font-medium truncate">{u.nickname || u.username}</div>
                          <div className="text-[11px] text-slate-500">{u.role}</div>
                        </div>
                        <div className="text-xs text-slate-600 whitespace-nowrap">{fmtMoney(myTotal)} 원</div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </aside>

          {/* 우측: 리스트 */}
          <section className="bg-white border border-slate-200 rounded-2xl lg:col-span-3 flex flex-col">
            <div className="flex p-4 border-b border-slate-200 items-center justify-between">
              <div>
                <div className="text-sm text-slate-500">선택 직원</div>
                <div className="text-base font-semibold">{selectedUser ? selectedUser.nickname || selectedUser.username : '미선택'}</div>
              </div>
              <div className="flex items-baseline gap-6">
                <div>
                  <div className="text-sm text-slate-500">총 미수금</div>
                  <div className="text-lg font-semibold">{fmtMoney(totalAmount)} 원</div>
                </div>
                <button onClick={openCreate} className="hidden lg:inline-flex items-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-700 text-white text-sm font-medium px-4 py-2.5" disabled={!activeUserId}>
                  + 미수금 추가
                </button>
              </div>
            </div>

            {/* 모바일 카드 */}
            <div className="lg:hidden p-3 space-y-2">
              {list.map((d) => {
                const st = stores.find((s) => s.id === d.storeId);
                return (
                  <div key={d.id} className="rounded-2xl border border-slate-200 p-3 bg-white">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{st?.name || '가게없음'}</div>
                      <div className="text-base font-semibold">{fmtMoney(Number(d.amount))} 원</div>
                    </div>
                    {d.note ? <div className="text-sm text-slate-600 mt-1">{d.note}</div> : null}
                    <div className="mt-3 flex items-center gap-2">
                      <button onClick={() => openEdit(d)} className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-xs" title="수정" aria-label="수정">✏️</button>
                      <button onClick={() => onDelete(d.id)} className="px-3 py-1.5 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 text-xs" title="삭제" aria-label="삭제">🗑️</button>
                    </div>
                  </div>
                );
              })}
              {list.length === 0 && <div className="text-sm text-slate-500 p-3">미수금 내역이 없습니다.</div>}
            </div>

            {/* 데스크탑 테이블 */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 sticky top-0 z-10">
                  <tr>
                    <th className="p-3 text-left w-[40%]">가게</th>
                    <th className="p-3 text-left w-[20%]">금액</th>
                    <th className="p-3 text-left">비고</th>
                    <th className="p-3 text-left w-[16%]">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((d) => {
                    const st = stores.find((s) => s.id === d.storeId);
                    return (
                      <tr key={d.id} className="border-t">
                        <td className="p-3">{st?.name || '가게없음'}</td>
                        <td className="p-3">{fmtMoney(Number(d.amount || 0))} 원</td>
                        <td className="p-3"><div className="line-clamp-2 text-slate-700">{d.note || '-'}</div></td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <button onClick={() => openEdit(d)} className="px-2.5 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-xs" title="수정" aria-label="수정">✏️</button>
                            <button onClick={() => onDelete(d.id)} className="px-2.5 py-1.5 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 text-xs" title="삭제" aria-label="삭제">🗑️</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {list.length === 0 && (
                    <tr><td className="p-6 text-slate-500" colSpan={4}>미수금 내역이 없습니다.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* 팝업 */}
        <Modal open={open} onClose={close} title={editing ? '미수금 수정' : '미수금 추가'}>
          <div className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">직원</label>
                <select
                  value={form.userId as any}
                  onChange={(e) => setForm((f) => ({ ...f, userId: Number(e.target.value) }))}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
                >
                  <option value="" disabled>선택</option>
                  {staff.map((u) => <option key={u.id} value={u.id}>{u.nickname || u.username}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">가게</label>
                <select
                  value={form.storeId as any}
                  onChange={(e) => setForm((f) => ({ ...f, storeId: String(e.target.value) }))}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
                >
                  <option value="" disabled>선택</option>
                  {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">금액</label>
                <input
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="예) 150000"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">비고</label>
                <input
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="설명(선택)"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button onClick={close} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm px-4 py-2.5">
                취소
              </button>
              <button onClick={onSave} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-700 text-white text-sm font-medium px-4 py-2.5">
                {editing ? '수정 저장' : '추가'}
              </button>
            </div>
          </div>
        </Modal>
      </PageWrap>
    </ClientGuard>
  );
}

function Modal({ open, onClose, title, children }:{
  open:boolean; onClose:()=>void; title?:string; children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
          {title && <div className="px-4 py-3 border-b bg-slate-50 text-sm font-medium">{title}</div>}
          <div className="p-4">{children}</div>
        </div>
      </div>
    </div>
  );
}
