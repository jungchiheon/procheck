'use client';

import React from 'react';
import ClientGuard from '@/middleware/client-guard';
import PageWrap from '@/components/PageWrap';
import { useAuth } from '@/lib/auth';
import { LS_KEYS, load, save, genId } from '@/lib/storage';

type Role = 'super_admin' | 'manager' | 'staff';
type UserRow = {
  id: number;
  username: string;
  password: string;
  nickname: string;
  role: Role;
  managerId?: number | null;
};

const roleLabel = (r: Role) =>
  ({ super_admin: '총관리자', manager: '부관리자', staff: '직원' }[r]);

const includesQ = (s: string, q: string) =>
  (s || '').toLowerCase().includes(q.toLowerCase());

export default function UsersPage() {
  const { user } = useAuth();

  // 권한 체크
  if (!user) return null;
  if (user.role !== 'super_admin') {
    return (
      <ClientGuard>
        <PageWrap>
          <h2 className="text-xl font-semibold mb-4">사용자 관리</h2>
          <div className="text-slate-600">권한이 없습니다.</div>
        </PageWrap>
      </ClientGuard>
    );
  }

  const [list, setList] = React.useState<UserRow[]>(
    () => (load<UserRow[]>(LS_KEYS.users) || []) as UserRow[]
  );
  const managers = React.useMemo(
    () => list.filter(u => u.role === 'manager'),
    [list]
  );

  // 검색/필터
  const [q, setQ] = React.useState('');
  const [roleTab, setRoleTab] = React.useState<Role | 'all'>('all');

  const filtered = React.useMemo(() => {
    const base =
      roleTab === 'all' ? list : list.filter(u => u.role === roleTab);
    if (!q.trim()) return base.sort(byNicknameThenUsername);
    return base
      .filter(
        u =>
          includesQ(u.nickname, q) ||
          includesQ(u.username, q) ||
          includesQ(roleLabel(u.role), q)
      )
      .sort(byNicknameThenUsername);
  }, [list, q, roleTab]);

  // 모달/폼
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<UserRow | null>(null);
  const [form, setForm] = React.useState<{
    username: string;
    password: string;
    nickname: string;
    role: Role;
    managerId: number | '';
  }>({
    username: '',
    password: '',
    nickname: '',
    role: 'staff',
    managerId: managers[0]?.id ?? '',
  });

  const persist = (rows: UserRow[]) => {
    save(LS_KEYS.users, rows);
    setList(rows);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({
      username: '',
      password: '',
      nickname: '',
      role: 'staff',
      managerId: managers[0]?.id ?? '',
    });
    setOpen(true);
  };
  const openEdit = (row: UserRow) => {
    setEditing(row);
    setForm({
      username: row.username,
      password: row.password,
      nickname: row.nickname,
      role: row.role,
      managerId: (row.managerId ?? '') as any,
    });
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    setEditing(null);
  };

  const onSave = () => {
    if (!form.username.trim()) return alert('아이디를 입력하세요.');
    if (!form.password.trim()) return alert('비밀번호를 입력하세요.');
    if (!form.nickname.trim()) return alert('닉네임을 입력하세요.');
    if (form.role === 'staff' && !form.managerId) {
      return alert('직원은 부관리자를 선택해야 합니다.');
    }

    // 중복 username 방지(수정 중에는 자기 자신 제외)
    const exists = list.some(
      u =>
        u.username.trim().toLowerCase() ===
          form.username.trim().toLowerCase() && (!editing || u.id !== editing.id)
    );
    if (exists) return alert('이미 존재하는 아이디입니다.');

    if (!editing) {
      const row: UserRow = {
        id: genId(),
        username: form.username.trim(),
        password: form.password,
        nickname: form.nickname.trim(),
        role: form.role,
        managerId: form.role === 'staff' ? Number(form.managerId) : null,
      };
      persist([row, ...list]);
    } else {
      const next = list.map(u =>
        u.id === editing.id
          ? {
              ...u,
              username: form.username.trim(),
              password: form.password,
              nickname: form.nickname.trim(),
              role: form.role,
              managerId: form.role === 'staff' ? Number(form.managerId) : null,
            }
          : u
      );
      persist(next);
    }
    close();
  };

  const onDelete = (id: number) => {
    if (!confirm('삭제하시겠습니까?')) return;
    // manager 삭제 시 해당 매니저를 참조하는 staff의 managerId 정리(선택: null)
    const deleting = list.find(u => u.id === id);
    let next = list.filter(u => u.id !== id);
    if (deleting?.role === 'manager') {
      next = next.map(u =>
        u.role === 'staff' && u.managerId === id ? { ...u, managerId: null } : u
      );
    }
    persist(next);
  };

  return (
    <ClientGuard>
      <PageWrap>
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">사용자 관리</h2>
          <button
            onClick={openCreate}
            className="rounded-xl bg-slate-900 hover:bg-slate-700 text-white text-sm font-medium px-4 py-2.5"
          >
            + 사용자 추가
          </button>
        </div>

        {/* 검색/탭(모바일 우선 카드) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="검색 (이름/아이디/역할)"
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
            />
            <div className="md:col-span-2">
              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                {([
                  { key: 'all', label: '전체' },
                  { key: 'super_admin', label: '총관리자' },
                  { key: 'manager', label: '부관리자' },
                  { key: 'staff', label: '직원' },
                ] as const).map(t => {
                  const active = roleTab === (t.key as any);
                  return (
                    <button
                      key={t.key}
                      onClick={() => setRoleTab(t.key as any)}
                      className={`px-3 py-1.5 text-sm rounded-lg ${
                        active
                          ? 'bg-white border border-slate-200 shadow-sm'
                          : 'text-slate-600 hover:text-slate-800'
                      }`}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* 모바일: 카드 리스트 */}
        <div className="md:hidden grid grid-cols-1 gap-3">
          {filtered.map(u => (
            <div
              key={u.id}
              className="rounded-2xl border border-slate-200 bg-white p-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-base font-semibold">
                    {u.nickname || u.username}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {u.username} · {roleLabel(u.role)}
                  </div>
                  {u.role === 'staff' && (
                    <div className="text-xs text-slate-500 mt-1">
                      부관리자:{' '}
                      {managerName(u.managerId, list) || <span className="text-slate-400">미지정</span>}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEdit(u)}
                    className="px-2 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-sm"
                    title="수정"
                    aria-label="수정"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => onDelete(u.id)}
                    className="px-2 py-1.5 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 text-sm"
                    title="삭제"
                    aria-label="삭제"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-slate-500">
              사용자 없음
            </div>
          )}
        </div>

        {/* 데스크탑: 표 */}
        <div className="hidden md:block overflow-x-auto bg-white border border-slate-200 rounded-2xl">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-3 text-left w-[24%]">닉네임</th>
                <th className="p-3 text-left w-[24%]">아이디</th>
                <th className="p-3 text-left w-[16%]">역할</th>
                <th className="p-3 text-left w-[24%]">부관리자</th>
                <th className="p-3 text-left w-[12%]">작업</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.id} className="border-t">
                  <td className="p-3">{u.nickname || u.username}</td>
                  <td className="p-3">{u.username}</td>
                  <td className="p-3">{roleLabel(u.role)}</td>
                  <td className="p-3">
                    {u.role === 'staff'
                      ? managerName(u.managerId, list) || <span className="text-slate-400">미지정</span>
                      : <span className="text-slate-400">-</span>}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEdit(u)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-xs"
                        title="수정"
                        aria-label="수정"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => onDelete(u.id)}
                        className="px-2.5 py-1.5 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 text-xs"
                        title="삭제"
                        aria-label="삭제"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-slate-500">
                    사용자 없음
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 팝업(추가/수정) */}
        <Modal
          open={open}
          onClose={close}
          title={editing ? '사용자 수정' : '사용자 추가'}
        >
          <div className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">아이디</label>
                <input
                  value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  placeholder="예: kim"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">비밀번호</label>
                <input
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="8자 이상"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">닉네임</label>
                <input
                  value={form.nickname}
                  onChange={e => setForm(f => ({ ...f, nickname: e.target.value }))}
                  placeholder="예: 김직원"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">역할</label>
                <select
                  value={form.role}
                  onChange={e =>
                    setForm(f => ({
                      ...f,
                      role: e.target.value as Role,
                      // 역할을 staff이 아닌 것으로 바꾸면 managerId 정리
                      managerId:
                        (e.target.value as Role) === 'staff'
                          ? (f.managerId || managers[0]?.id || '')
                          : ('' as any),
                    }))
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
                >
                  <option value="super_admin">총관리자</option>
                  <option value="manager">부관리자</option>
                  <option value="staff">직원</option>
                </select>
              </div>
            </div>

            {/* 직원일 때만 노출 */}
            {form.role === 'staff' && (
              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  부관리자
                </label>
                <select
                  value={form.managerId as any}
                  onChange={e =>
                    setForm(f => ({
                      ...f,
                      managerId: Number(e.target.value),
                    }))
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
                >
                  <option value="" disabled>
                    선택
                  </option>
                  {managers.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.nickname || m.username}
                    </option>
                  ))}
                </select>
              </div>
            )}

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

/* ---------- helpers ---------- */

function byNicknameThenUsername(a: UserRow, b: UserRow) {
  const an = (a.nickname || a.username || '').toLowerCase();
  const bn = (b.nickname || b.username || '').toLowerCase();
  return an.localeCompare(bn);
}

function managerName(managerId: number | null | undefined, users: UserRow[]) {
  if (!managerId) return '';
  const m = users.find(u => u.id === managerId);
  return m ? m.nickname || m.username : '';
}

/* ---------- Modal ---------- */
function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
          {title && (
            <div className="px-4 py-3 border-b bg-slate-50 text-sm font-medium">
              {title}
            </div>
          )}
          <div className="p-4">{children}</div>
        </div>
      </div>
    </div>
  );
}