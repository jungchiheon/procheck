// /api/users — GET, POST, PATCH, DELETE
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';

/** GET: 전체 사용자(민감정보 제외) */
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id,username,nickname,role,manager_id')
      .order('id', { ascending: true });
    if (error) throw error;
    return NextResponse.json({ rows: data || [] });
  } catch (e:any) {
    console.error(e);
    return NextResponse.json({ error: '사용자 목록 조회 실패' }, { status: 500 });
  }
}

/** POST: 사용자 추가 { username, password, nickname, role, manager_id } */
export async function POST(req: Request) {
  try {
    const { username, password, nickname, role, manager_id } = await req.json();
    if (!username || !password) return NextResponse.json({ error: '아이디/비밀번호 필요' }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from('users')
      .insert({
        username, password, nickname: nickname || username,
        role: role || 'staff', manager_id: manager_id ?? null
      })
      .select('id,username,nickname,role,manager_id')
      .single();
    if (error) throw error;

    return NextResponse.json({ row: data });
  } catch (e:any) {
    // unique 위반 등
    const msg = e?.message?.includes('duplicate key') ? '이미 존재하는 아이디입니다.' : '사용자 생성 실패';
    console.error(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** PATCH: 사용자 수정 { id, username?, password?, nickname?, role?, manager_id? } */
export async function PATCH(req: Request) {
  try {
    const { id, username, password, nickname, role, manager_id } = await req.json();
    if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 });

    const updates: any = {};
    if (username !== undefined) updates.username = username;
    if (password !== undefined) updates.password = password;
    if (nickname !== undefined) updates.nickname = nickname;
    if (role !== undefined)     updates.role = role;
    if (manager_id !== undefined) updates.manager_id = manager_id;

    const { data, error } = await supabaseAdmin
      .from('users')
      .update(updates)
      .eq('id', id)
      .select('id,username,nickname,role,manager_id')
      .single();
    if (error) throw error;

    return NextResponse.json({ row: data });
  } catch (e:any) {
    console.error(e);
    return NextResponse.json({ error: '사용자 수정 실패' }, { status: 500 });
  }
}

/** DELETE: 사용자 삭제 { id } */
export async function DELETE(req: Request) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 });

    const { error } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e:any) {
    console.error(e);
    return NextResponse.json({ error: '사용자 삭제 실패' }, { status: 500 });
  }
}