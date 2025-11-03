// DELETE /api/notices/[id]   body: { role: 'staff'|'manager'|'super_admin' }
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const id = params.id;
    const { role } = await req.json().catch(()=>({ role: 'staff' }));
    if (role !== 'manager' && role !== 'super_admin') {
      return NextResponse.json({ error: '삭제 권한이 없습니다.' }, { status: 403 });
    }
    const { error } = await supabaseAdmin.from('notices').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e:any) {
    console.error('[DELETE /api/notices/:id]', e);
    return NextResponse.json({ error: e?.message || '삭제 실패' }, { status: 500 });
  }
}