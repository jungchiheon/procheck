// 2-1 최초 실행 시 더미 데이터 주입 + 공지/읽음 초기화
import { LS_KEYS, save, load } from './storage';

export function ensureSeed() {
  if (!load(LS_KEYS.users)) {
    const users = [
      { id: 1, username: 'admin', password: 'admin123', nickname: '총관리자', role: 'super_admin' },
      { id: 2, username: 'mgr',   password: 'mgr123',   nickname: '부관리자A', role: 'manager' },
      { id: 3, username: 'kim',   password: 'kim123',   nickname: '김직원',   role: 'staff', managerId: 2 },
    ];
    save(LS_KEYS.users, users);
  }
  if (!load(LS_KEYS.stores)) {
    const stores = [
      { id: 1, name: '강남점', location: '서울 강남구', managerId: 2 },
      { id: 2, name: '홍대점', location: '서울 마포구', managerId: 2 },
    ];
    save(LS_KEYS.stores, stores);
  }

  // 2-2 컬렉션 초기화
  [LS_KEYS.attendance, LS_KEYS.schedules, LS_KEYS.calls, LS_KEYS.debts, LS_KEYS.sales, LS_KEYS.lostFound].forEach(k => { if (!load(k)) save(k, []); });

  // 2-3 공지 읽음/점프 맵
  if (!load(LS_KEYS.annReads)) save(LS_KEYS.annReads, {});         // { [userId]: number[] }
  if (!load(LS_KEYS.navJump)) save(LS_KEYS.navJump, {});           // { messageUserId?, announcementId? }

  // 2-4 데모 공지
  const anns = load<any[]>(LS_KEYS.announcements) || [];
  if (anns.length === 0) {
    save(LS_KEYS.announcements, [
      { id: 10001, title: '시스템 오픈', body: 'ProCheck 베타가 시작되었습니다.', createdAt: new Date().toISOString(), createdBy: 1 },
      { id: 10002, title: '근무 수칙', body: '출근/퇴근은 반드시 앱에서 체크해주세요.', createdAt: new Date().toISOString(), createdBy: 2 },
    ]);
  }
}