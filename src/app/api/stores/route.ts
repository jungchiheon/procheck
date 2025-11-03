import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';

/** GET: 전체 매장 */
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('stores')
      .select('id,name,location,manager_id')
      .order('name', { ascending: true });
    if (error) throw error;
    return NextResponse.json({ rows: data || [] });
  } catch (e:any) {
    console.error(e);
    return NextResponse.json({ error: '가게 목록 조회 실패' }, { status: 500 });
  }
}

/** POST: 매장 추가 { name, location, manager_id } */
export async function POST(req: Request) {
  try {
    const { name, location, manager_id } = await req.json();
    if (!name) return NextResponse.json({ error: '이름 필요' }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from('stores')
      .insert({ name, location: location || null, manager_id: manager_id ?? null })
      .select('id,name,location,manager_id')
      .single();
    if (error) throw error;

    return NextResponse.json({ row: data });
  } catch (e:any) {
    console.error(e);
    return NextResponse.json({ error: '가게 생성 실패' }, { status: 500 });
  }
}

/** PATCH: 매장 수정 { id, name?, location?, manager_id? } */
export async function PATCH(req: Request) {
  try {
    const { id, name, location, manager_id } = await req.json();
    if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 });

    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (location !== undefined) updates.location = location;
    if (manager_id !== undefined) updates.manager_id = manager_id;

    const { data, error } = await supabaseAdmin
      .from('stores')
      .update(updates)
      .eq('id', id)
      .select('id,name,location,manager_id')
      .single();
    if (error) throw error;

    return NextResponse.json({ row: data });
  } catch (e:any) {
    console.error(e);
    return NextResponse.json({ error: '가게 수정 실패' }, { status: 500 });
  }
}

/** DELETE: 매장 삭제 { id } */
export async function DELETE(req: Request) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 });

    const { error } = await supabaseAdmin
      .from('stores')
      .delete()
      .eq('id', id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e:any) {
    console.error(e);
    return NextResponse.json({ error: '가게 삭제 실패' }, { status: 500 });
  }
}