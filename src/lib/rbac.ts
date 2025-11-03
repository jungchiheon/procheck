// 10-1 역할 라벨 및 권한 확인 도우미
export type Role = 'super_admin' | 'manager' | 'staff';
export const roleLabel = (r: Role) => ({
  super_admin: '총관리자',
  manager: '부관리자',
  staff: '직원'
}[r]);

export const canSeeManagerMenus = (role: Role) => role !== 'staff';
export const isSuperAdmin = (role: Role) => role === 'super_admin';
