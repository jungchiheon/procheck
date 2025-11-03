'use client';

// 1:1 쪽지 (LocalStorage)
// - 직원↔직원 금지
// - 최근 목록 / 연락처 / 대화 / 전송
import React from 'react';
import ClientGuard from '@/middleware/client-guard';
import PageWrap from '@/components/PageWrap';
import { useAuth } from '@/lib/auth';
import { LS_KEYS, load, save, genId } from '@/lib/storage';

const canDM = (aRole: string, bRole: string) => !(aRole === 'staff' && bRole === 'staff');

type Msg = { id: number; fromId: number; toId: number; text: string; at: string; read: boolean };

export default function MessagesPage() {
  const { user } = useAuth();

  // 사용자/스토리지 로드
  const allUsers = (load<any[]>(LS_KEYS.users) || []) as any[];

  const [messages, setMessages] = React.useState<Msg[]>(
    () => (load<Msg[]>(LS_KEYS.messages) || []) as Msg[]
  );
  const [query, setQuery] = React.useState('');
  const [draft, setDraft] = React.useState('');
  const [activeId, setActiveId] = React.useState<number | null>(null);

  // navJump(messageUserId) → 특정 사용자 스레드로 포커싱(선택사항)
  React.useEffect(() => {
    if (!user) return;
    const nav = load<any>(LS_KEYS.navJump) || {};
    if (nav.messageUserId) {
      setActiveId(nav.messageUserId);
      save(LS_KEYS.navJump, { ...nav, messageUserId: undefined });
    }
  }, [user]);

  const contacts = React.useMemo(() => {
    if (!user) return [] as any[];
    return allUsers
      .filter(u => u.id !== user.id)
      .filter(u => canDM(user.role, u.role))
      .filter(u => {
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return (u.nickname || '').toLowerCase().includes(q) || (u.username || '').toLowerCase().includes(q);
      });
  }, [allUsers, user, query]);

  const thread = React.useMemo(() => {
    if (!user || !activeId) return [] as Msg[];
    return messages
      .filter(m => (m.fromId === user.id && m.toId === activeId) || (m.fromId === activeId && m.toId === user.id))
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }, [messages, user, activeId]);

  // 읽음 처리 (상대→나 메시지)
  React.useEffect(() => {
    if (!user || !activeId) return;
    let changed = false;
    const next = messages.map(m => {
      if (m.fromId === activeId && m.toId === user.id && !m.read) { changed = true; return { ...m, read: true }; }
      return m;
    });
    if (changed) { save(LS_KEYS.messages, next); setMessages(next); }
  }, [activeId, user, messages]);

  const send = () => {
    if (!user || !activeId) return;
    const text = draft.trim(); if (!text) return;
    const m: Msg = { id: genId(), fromId: user.id, toId: activeId, text, at: new Date().toISOString(), read: false };
    const next = [...messages, m];
    save(LS_KEYS.messages, next); setMessages(next); setDraft('');
  };

  // 최근 목록(상대별 마지막 메시지)
  const recentList = React.useMemo(() => {
    if (!user) return [] as { otherId: number; last: Msg }[];
    const map = new Map<number, Msg>();
    for (const m of messages) {
      const otherId = m.fromId === user.id ? m.toId : (m.toId === user.id ? m.fromId : null);
      if (!otherId) continue;
      const prev = map.get(otherId);
      if (!prev || new Date(prev.at) < new Date(m.at)) map.set(otherId, m);
    }
    return Array.from(map.entries()).map(([otherId, last]) => ({ otherId, last }))
      .sort((a, b) => new Date(b.last.at).getTime() - new Date(a.last.at).getTime());
  }, [messages, user]);

  const unreadCount = React.useCallback((otherId: number) =>
    user ? messages.filter(m => m.fromId === otherId && m.toId === user.id && !m.read).length : 0
  , [messages, user]);

  return (
    <ClientGuard>
      <PageWrap>
        <h2 className="text-xl font-semibold mb-4">쪽지</h2>

        {!user ? null : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* 좌측: 최근 + 연락처 */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 lg:col-span-1">
              <div className="mb-3">
                <input
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
                  placeholder="이름/아이디 검색"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>

              <div>
                <div className="text-xs text-slate-500 mb-2">최근</div>
                <div className="space-y-1">
                  {recentList.length === 0 && <div className="text-sm text-slate-400">최근 대화가 없습니다.</div>}
                  {recentList.map(({ otherId, last }) => {
                    const other = allUsers.find(u => u.id === otherId);
                    if (!other || !canDM(user.role, other.role)) return null;
                    const unread = unreadCount(otherId);
                    return (
                      <button
                        key={otherId}
                        onClick={() => setActiveId(otherId)}
                        className={`w-full text-left px-3 py-2 rounded-lg transition hover:bg-slate-50 ${activeId === otherId ? 'bg-slate-50' : ''}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-medium">{other?.nickname || other?.username}</div>
                          <div className="text-xs text-slate-400">{new Date(last.at).toLocaleString()}</div>
                        </div>
                        <div className="text-xs text-slate-500 truncate">{last.text}</div>
                        {unread > 0 && (
                          <div className="mt-1 inline-flex items-center px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[11px]">
                            미읽음 {unread}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6">
                <div className="text-xs text-slate-500 mb-2">연락처</div>
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {contacts.map(c => (
                    <button
                      key={c.id}
                      onClick={() => setActiveId(c.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg transition hover:bg-slate-50 ${activeId === c.id ? 'bg-slate-50' : ''}`}
                    >
                      <div className="font-medium">{c.nickname || c.username}</div>
                      <div className="text-xs text-slate-400">{c.role}</div>
                    </button>
                  ))}
                  {contacts.length === 0 && <div className="text-sm text-slate-400">연락처가 없습니다.</div>}
                </div>
              </div>
            </div>

            {/* 우측: 스레드 */}
            <div className="bg-white rounded-2xl border border-slate-200 p-0 lg:col-span-2 flex flex-col h-[70vh]">
              {!activeId ? (
                <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">좌측에서 대상을 선택하세요.</div>
              ) : (
                <>
                  <div className="px-4 py-3 border-b border-slate-200">
                    <div className="font-medium">
                      {(allUsers.find(u => u.id === activeId)?.nickname) || (allUsers.find(u => u.id === activeId)?.username)}
                    </div>
                    <div className="text-xs text-slate-400">직원↔직원 대화는 불가 / 그 외 허용</div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {thread.length === 0 && <div className="text-sm text-slate-400">대화를 시작해보세요.</div>}
                    {thread.map(m => {
                      const mine = !!user && m.fromId === user.id;
                      return (
                        <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-800'}`}>
                            <div>{m.text}</div>
                            <div className={`mt-1 text-[10px] ${mine ? 'text-slate-300' : 'text-slate-500'}`}>
                              {new Date(m.at).toLocaleString()}
                              {!mine && !m.read ? ' · 미읽음' : ''}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="p-3 border-t border-slate-200">
                    <form
                      onSubmit={(e) => { e.preventDefault(); send(); }}
                      className="flex items-center gap-2"
                    >
                      <input
                        className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
                        placeholder="메시지 입력"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                      />
                      <button
                        type="submit"
                        className="rounded-xl bg-slate-900 text-white hover:bg-slate-700 px-3 py-2 text-sm"
                      >
                        보내기
                      </button>
                    </form>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </PageWrap>
    </ClientGuard>
  );
}