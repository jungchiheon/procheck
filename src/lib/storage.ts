export const LS_KEYS = {
  users: 'ems_users',
  stores: 'ems_stores',
  session: 'ems_session',
  attendance: 'ems_attendance',
  schedules: 'ems_schedules',
  calls: 'ems_calls',
  debts: 'ems_debts',
  sales: 'ems_sales',

  // 게시판/알림 관련
  notices: 'ems_notices',              // 공지 목록
  lost: 'ems_lost',                    // 분실물(로컬)
  lostFound: 'ems_lostfound',          // (확장용) 분실물
  announcements: 'ems_announcements',  // (확장용) 공지
  annReads: 'ems_ann_reads',           // 공지 읽음 맵 { [userId]: number[] }
  navJump: 'ems_nav_jump',             // 내비 점프 힌트
  messages: 'ems_messages',            // 1:1 쪽지
} as const;

type AnyKey = string | keyof typeof LS_KEYS;

// 2) 로드/세이브/삭제 + 같은 탭 즉시 반영을 위한 커스텀 이벤트 발행
const emitLS = (key: string) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('ls:update', { detail: { key } }));
};

export const load = <T = any>(key: string): T | null => {
  if (typeof window === 'undefined') return null as any;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null as any;
  }
};

export const save = (key: string, val: any) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(val));
  emitLS(key); // 같은 탭에서도 즉시 구독자에게 알림
};

export const remove = (key: string) => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(key);
  emitLS(key);
};

// 3) 공통 유틸
let __idCounter = 0;
/** 밀리초+증분 카운터 기반 고유 숫자 ID */
export const genId = (): number => {
  __idCounter = (__idCounter + 1) % 1000;
  return Date.now() * 1000 + __idCounter;
};

export const fmtDT = (dt: string | number | Date) => new Date(dt).toLocaleString();
export const todayStr = () => new Date().toISOString().slice(0, 10);

// 4) 공지 읽음 관리(선택 사용)
export const pushAnnRead = (userId: number, annId: number) => {
  const map = (load<Record<string, number[]>>(LS_KEYS.annReads) || {});
  const set = new Set(map[userId] || []);
  set.add(annId);
  map[userId] = Array.from(set);
  save(LS_KEYS.annReads, map);
};

export const isAnnRead = (userId: number, annId: number) => {
  const map = (load<Record<string, number[]>>(LS_KEYS.annReads) || {});
  return (map[userId] || []).includes(annId);
};

export const unreadAnnCount = (userId: number): number => {
  const anns = load<any[]>(LS_KEYS.announcements) || [];
  return anns.filter((a) => !isAnnRead(userId, a.id)).length;
};

// 5) 쪽지 미읽음 카운트(받은 쪽지 중 읽지 않은 것)
export const unreadMsgCount = (userId: number): number => {
  const msgs = load<any[]>(LS_KEYS.messages) || [];
  return msgs.filter((m: any) => m.toId === userId && !m.read).length;
};

// 6) (확장) 유저별 마지막 확인 시각 저장/로드 + 미읽음 계산
export const LSX = {
  notices: (LS_KEYS as any).notices ?? 'ems_notices',
  messages: (LS_KEYS as any).messages ?? 'ems_messages',
  annReads: 'ems_ann_reads',
} as const;

export const setLastSeen = (k: string, userId: number, iso: string) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(`${k}_last_seen_${userId}`, iso);
};

export const getLastSeen = (k: string, userId: number): string | null => {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(`${k}_last_seen_${userId}`);
};

/** 마지막 확인 시각 기반 공지 미읽음(마지막 확인이 없으면 전체 건수) */
export const unreadNoticesCount = (userId: number): number => {
  const list = (load<any[]>(LSX.notices) || []);
  const last = getLastSeen(LSX.notices, userId);
  if (!last) return list.length;
  return list.filter((n: any) => (n.createdAt || '') > last).length;
};

/** 마지막 확인 시각 기반 쪽지 미읽음(내가 받은 메시지) */
export const unreadMessagesCount = (userId: number): number => {
  const msgs = (load<any[]>(LSX.messages) || []);
  const last = getLastSeen(LSX.messages, userId);
  if (!last) {
    return msgs.filter((m: any) => m.toId === userId && !m.read).length
        || msgs.filter((m: any) => m.toId === userId).length;
  }
  return msgs.filter((m: any) => m.toId === userId && (m.createdAt || '') > last).length;
};

// 7) LocalStorage 변경 구독 onLS (단일 정의)
// 형태 A) onLS(callback)  → 모든 키 변경 시 콜백
// 형태 B) onLS([LS_KEYS.notices, LS_KEYS.messages], callback) → 특정 키만
export function onLS(cb: () => void): () => void;
export function onLS(keys: AnyKey[], cb: () => void): () => void;
export function onLS(a: any, b?: any): () => void {
  const hasKeys = Array.isArray(a);
  const keys: string[] = hasKeys
    ? (a as AnyKey[]).map((k) => (typeof k === 'string' ? k : LS_KEYS[k as keyof typeof LS_KEYS]))
    : [];
  const cb = (hasKeys ? b : a) as () => void;

  const onStorage = (e: StorageEvent) => {
    if (!e.key) return;
    if (!hasKeys || keys.includes(e.key)) cb();
  };
  const onCustom = (e: Event) => {
    const detail = (e as CustomEvent).detail as { key?: string };
    if (!detail?.key) return;
    if (!hasKeys || keys.includes(detail.key)) cb();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
    window.addEventListener('ls:update', onCustom as EventListener);
  }
  return () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('ls:update', onCustom as EventListener);
    }
  };
}