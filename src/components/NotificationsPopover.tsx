'use client';
import React from 'react';
import Link from 'next/link';

const K = {
  notices: 'ems_notices',
  calls: 'ems_calls',
  messages: 'ems_messages',
} as const;

/** 안전한 JSON 파서 */
function tryParse<T>(raw: string | null, fallback: T): T {
  try { return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
}

/** 배열 로더 (TSX에서 제네릭 화살표 대신 함수 선언식으로) */
function loadArr<T = any>(k: string): T[] {
  if (typeof window === 'undefined') return [] as any;
  return tryParse<T[]>(window.localStorage.getItem(k), []);
}
function save(k: string, v: any) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(k, JSON.stringify(v));
    // 같은 탭 알림용 커스텀 이벤트
    window.dispatchEvent(new CustomEvent('ls:update', { detail: { key: k } }));
  }
}

/** 알림 아이템 타입: href를 리터럴로 명시 */
type Base = { id: number | string; title: string; createdAt: string; read?: boolean };
type NoticeItem  = Base & { type: 'notice';  href: '/notices'  };
type CallItem    = Base & { type: 'call';    href: '/calls'    };
type MessageItem = Base & { type: 'message'; href: '/messages' };
type Item = NoticeItem | CallItem | MessageItem;

export default function NotificationsPopover() {
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<Item[]>([]);
  const [unread, setUnread] = React.useState(0);

  const refresh = React.useCallback(() => {
    const notices: NoticeItem[] = loadArr<any>(K.notices).map((n: any) => ({
      type: 'notice',
      id: n.id,
      title: n.title || '공지',
      createdAt: n.createdAt || new Date().toISOString(),
      read: !!n.read,
      href: '/notices',
    }));
    const calls: CallItem[] = loadArr<any>(K.calls).map((c: any) => ({
      type: 'call',
      id: c.id,
      title: `호출 요청 (${c.status || 'pending'})`,
      createdAt: c.requestedAt || new Date().toISOString(),
      read: !!c.read,
      href: '/calls',
    }));
    const msgs: MessageItem[] = loadArr<any>(K.messages).map((m: any) => ({
      type: 'message',
      id: m.id,
      title: m.title || '쪽지',
      createdAt: m.createdAt || new Date().toISOString(),
      read: !!m.read,
      href: '/messages',
    }));

    const merged: Item[] = [...notices, ...calls, ...msgs]
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 30);

    setItems(merged);
    setUnread(merged.filter(i => !i.read).length);
  }, []);

  React.useEffect(() => {
    refresh();
    // 다른 탭(storage) + 같은 탭(custom) 변경 감지
    const onStorage = (e: StorageEvent) => {
      if (!e.key) return;
      if ([K.notices, K.calls, K.messages].includes(e.key as any)) refresh();
    };
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent).detail as { key?: string };
      if (detail?.key && [K.notices, K.calls, K.messages].includes(detail.key as any)) refresh();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('ls:update', onCustom as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('ls:update', onCustom as EventListener);
    };
  }, [refresh]);

  const markAllRead = () => {
    const upd = (k: string) => {
      const arr = loadArr<any>(k).map((x: any) => ({ ...x, read: true }));
      save(k, arr);
    };
    [K.notices, K.calls, K.messages].forEach(upd);
    refresh();
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="relative inline-flex items-center justify-center w-10 h-10 rounded-lg hover:bg-slate-100"
        aria-label="알림"
        title="알림"
      >
        {/* 벨 아이콘 */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0 1 18 14.158V11a6 6 0 1 0-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex min-w-5 h-5 px-1 items-center justify-center rounded-full bg-brand-600 text-white text-[11px]">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-soft z-50">
          <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
            <div className="text-sm font-semibold">알림</div>
            <button onClick={markAllRead} className="text-xs text-slate-500 hover:text-slate-700">모두 읽음 처리</button>
          </div>
          <div className="max-h-80 overflow-auto">
            {items.length === 0 ? (
              <div className="p-4 text-sm text-slate-500">알림이 없습니다.</div>
            ) : (
              items.map(it => (
                <Link
                  key={`${it.type}_${it.id}`}
                  href={it.href}
                  className={`flex items-start gap-2 px-3 py-2 hover:bg-slate-50 ${it.read ? 'opacity-70' : ''}`}
                  onClick={() => setOpen(false)}
                >
                  <span className={`mt-1 w-2 h-2 rounded-full ${it.read ? 'bg-slate-300' : 'bg-brand-600'}`} />
                  <div className="flex-1">
                    <div className="text-sm">{it.title}</div>
                    <div className="text-[11px] text-slate-500">{new Date(it.createdAt).toLocaleString()}</div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}