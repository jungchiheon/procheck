'use client';

import React from 'react';
import ClientGuard from '@/middleware/client-guard';
import PageWrap from '@/components/PageWrap';
import { useAuth } from '@/lib/auth';
import { LS_KEYS, load, save, genId } from '@/lib/storage';

type StoreRow = { id: number|string; name: string; managerId: number };
type User = { id: number; username: string; nickname?: string; role: string };

export default function StoresPage() {
  const { user } = useAuth();
  if (user?.role !== 'super_admin') {
    return (
      <ClientGuard>
        <PageWrap>
          <h2 className="text-xl font-semibold mb-4">가게 관리</h2>
          <div className="text-slate-600">권한이 없습니다.</div>
        </PageWrap>
      </ClientGuard>
    );
  }

  const managers = (load<User[]>(LS_KEYS.users) || []).filter(u => u.role === 'manager');
  const [list, setList] = React.useState<StoreRow[]>(
    () => (load<any[]>(LS_KEYS.stores) || []).map(s => ({ id: s.id, name: s.name, managerId: s.managerId }))
  );

  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<StoreRow | null>(null);
  const [form, setForm] = React.useState<{ name: string; managerId: number | '' }>({
    name: '',
    managerId: managers[0]?.id ?? '',
  });

  const persist = (rows: StoreRow[]) => { save(LS_KEYS.stores, rows); setList(rows); };

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', managerId: managers[0]?.id ?? '' });
    setOpen(true);
  };
  const openEdit = (row: StoreRow) => {
    setEditing(row);
    setForm({ name: row.name, managerId: row.managerId });
    setOpen(true);
  };
  const close = () => { setOpen(false); setEditing(null); };

  const onSave = () => {
    if (!form.name.trim()) return alert('가게 이름을 입력하세요.');
    if (!form.managerId) return alert('부관리자를 선택하세요.');
    if (!editing) {
      const row: StoreRow = { id: genId(), name: form.name.trim(), managerId: Number(form.managerId) };
      persist([row, ...list]);
    } else {
      const next = list.map(s => s.id === editing.id ? { ...s, name: form.name.trim(), managerId: Number(form.managerId) } : s);
      persist(next);
    }
    close();
  };

  const onDelete = (id: StoreRow['id']) => {
    if (!confirm('삭제하시겠습니까?')) return;
    persist(list.filter(s => s.id !== id));
  };

  const managerName = (id: number) => {
    const m = managers.find(x => x.id === id);
    return m ? (m.nickname || m.username) : '-';
  };

  return (
    <ClientGuard>
      <PageWrap>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">가게 관리</h2>
          <button
            onClick={openCreate}
            className="rounded-xl bg-slate-900 hover:bg-slate-700 text-white text-sm font-medium px-4 py-2.5"
          >
            + 가게 추가
          </button>
        </div>

        {/* 모바일: 카드형 목록 */}
        <div className="md:hidden grid grid-cols-1 gap-3">
          {list.map(s => (
            <div key={String(s.id)} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="text-base font-semibold">{s.name}</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEdit(s)}
                    className="px-2 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-sm"
                    title="수정"
                    aria-label="수정"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => onDelete(s.id)}
                    className="px-2 py-1.5 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 text-sm"
                    title="삭제"
                    aria-label="삭제"
                  >
                    🗑️
                  </button>
                </div>
              </div>
              <div className="mt-1 text-sm text-slate-600">
                {/* ‘부관리자 : 부관리자A’ 가 아니라 이름만 */}
                {managerName(s.managerId)}
              </div>
            </div>
          ))}
          {list.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-slate-500">
              등록된 가게가 없습니다.
            </div>
          )}
        </div>

        {/* 데스크탑: 테이블 */}
        <div className="hidden md:block overflow-x-auto bg-white border border-slate-200 rounded-2xl">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-3 text-left w-[40%]">이름</th>
                <th className="p-3 text-left w-[40%]">부관리자</th>
                <th className="p-3 text-left w-[20%]">작업</th>
              </tr>
            </thead>
            <tbody>
              {list.map(s => (
                <tr key={String(s.id)} className="border-t">
                  <td className="p-3">{s.name}</td>
                  <td className="p-3">{managerName(s.managerId)}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEdit(s)}
                        className="px-2 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-sm"
                        title="수정"
                        aria-label="수정"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => onDelete(s.id)}
                        className="px-2 py-1.5 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 text-sm"
                        title="삭제"
                        aria-label="삭제"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr><td className="p-4 text-slate-500" colSpan={3}>등록된 가게가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 팝업: 추가/수정 */}
        <Modal open={open} onClose={close} title={editing ? '가게 수정' : '가게 추가'}>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">가게 이름</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="예: 강남점"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">부관리자</label>
              <select
                value={form.managerId as any}
                onChange={e => setForm(f => ({ ...f, managerId: Number(e.target.value) }))}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              >
                <option value="" disabled>선택</option>
                {managers.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.nickname || m.username}
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                onClick={close}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm px-4 py-2.5"
              >
                취소
              </button>
              <button
                onClick={onSave}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-700 text-white text-sm font-medium px-4 py-2.5"
              >
                {editing ? '수정 저장' : '추가'}
              </button>
            </div>
          </div>
        </Modal>
      </PageWrap>
    </ClientGuard>
  );
}

function Modal({
  open, onClose, title, children,
}: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
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