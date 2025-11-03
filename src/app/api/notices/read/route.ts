// POST /api/notices/read  { noticeId:string(uuid), userId:number }
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const { noticeId, userId } = await req.json();
    if (!noticeId || !userId) return NextResponse.json({ error: 'noticeId/userId 필요' }, { status: 400 });

    const { error } = await supabaseAdmin
      .from('notice_reads')
      .upsert({ notice_id: String(noticeId), user_id: Number(userId), read_at: new Date().toISOString() }, { onConflict: 'notice_id,user_id' });

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e:any) {
    console.error('[POST /api/notices/read]', e);
    return NextResponse.json({ error: e?.message || '읽음 처리 실패' }, { status: 500 });
  }
}