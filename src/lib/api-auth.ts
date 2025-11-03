// API 라우트에서 요청한 사용자/역할을 검사
export type Role = 'super_admin'|'manager'|'staff';
export type SessionUser = { id: number; role: Role };

export function getSessionFromHeaders(headers: Headers): SessionUser {
  const id = Number(headers.get('x-user-id') || '0');
  const role = (headers.get('x-role') || 'staff') as Role;
  if (!id || !['super_admin','manager','staff'].includes(role)) {
    throw new Error('UNAUTHORIZED');
  }
  return { id, role };
}