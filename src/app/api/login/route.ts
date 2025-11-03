// 2-1 /api/login — 평문 비번 검증 (다음 단계에서 bcrypt로 교체 예정)
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json();
    if (!username || !password) {
      return NextResponse.json({ error: '아이디/비밀번호가 필요합니다.' }, { status: 400 });
    }

    // 2-2 DB에서 사용자 조회 (username은 유니크)
    const { data: rows, error } = await supabaseAdmin
      .from('users')
      .select('id, username, nickname, role, manager_id, password')
      .eq('username', username)
      .limit(1);

    if (error) throw error;
    const u = rows?.[0];
    if (!u) return NextResponse.json({ error: '존재하지 않는 아이디입니다.' }, { status: 404 });
    if (u.password !== password) {
      return NextResponse.json({ error: '비밀번호가 올바르지 않습니다.' }, { status: 401 });
    }

    // 2-3 클라이언트에 저장할 세션 형태(비번 제외)
    const user = {
      id: u.id,
      username: u.username,
      nickname: u.nickname ?? u.username,
      role: u.role as 'super_admin' | 'manager' | 'staff',
      managerId: u.manager_id as number | null
    };

    return NextResponse.json({ user });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: '로그인 실패' }, { status: 500 });
  }
}