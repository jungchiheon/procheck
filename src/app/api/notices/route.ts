// /api/notices
// GET  ?limit=100
// POST multipart/form-data 또는 JSON {title, content, userId}
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Number(searchParams.get('limit') || '100');
    const { data, error } = await supabaseAdmin
      .from('notices')
      .select('id,title,content,created_by,created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return NextResponse.json({ rows: data || [] });
  } catch (e:any) {
    console.error('[GET /api/notices]', e);
    return NextResponse.json({ error: e?.message || '공지 조회 실패' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    let title = '';
    let content = '';
    let userId = 0;

    // 멀티파트 또는 JSON 모두 허용
    const ctype = req.headers.get('content-type') || '';
    if (ctype.includes('multipart/form-data')) {
      const form = await req.formData();
      title = String(form.get('title') || '').trim();
      content = String(form.get('content') || '').trim();
      userId = Number(form.get('userId') || '0');
    } else {
      const body = await req.json();
      title = String(body?.title || '').trim();
      content = String(body?.content || '').trim();
      userId = Number(body?.userId || '0');
    }

    if (!title || !content) {
      return NextResponse.json({ error: 'title/content 필요' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('notices')
      .insert({ title, content, created_by: userId || null })
      .select('id')
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, id: data?.id });
  } catch (e:any) {
    console.error('[POST /api/notices]', e);
    return NextResponse.json({ error: e?.message || '공지 등록 실패' }, { status: 500 });
  }
}