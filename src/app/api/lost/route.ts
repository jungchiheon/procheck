// 2-1 /api/lost — 목록 + 작성(파일 업로드)
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Number(searchParams.get('limit') || 100);
    const { data, error } = await supabaseAdmin
      .from('lost_items')
      .select('id,title,content,image_url,author_id,created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return NextResponse.json({ rows: data || [] });
  } catch (e:any) {
    console.error(e);
    return NextResponse.json({ error: '분실물 조회 실패' }, { status: 500 });
  }
}

// multipart/form-data: title, content, authorId, file(optional)
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const title = String(form.get('title') || '').trim();
    const content = String(form.get('content') || '').trim();
    const authorIdRaw = form.get('authorId');
    const authorId = authorIdRaw ? Number(authorIdRaw) : null;
    const file = form.get('file') as File | null;

    if (!title) return NextResponse.json({ error: '제목이 필요합니다.' }, { status: 400 });

    let image_url: string | null = null;
    if (file && file.size > 0) {
      // 2-2 Supabase Storage 업로드
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const ext = (file.type?.split('/')?.[1] || 'bin').toLowerCase();
      const path = `lost/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: upErr } = await supabaseAdmin.storage
        .from('lost')
        .upload(path, buffer, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      const { data: pub } = supabaseAdmin.storage.from('lost').getPublicUrl(path);
      image_url = pub.publicUrl;
    }

    const { data, error } = await supabaseAdmin
      .from('lost_items')
      .insert({ title, content: content || null, image_url, author_id: authorId })
      .select('id,title,content,image_url,author_id,created_at')
      .single();
    if (error) throw error;

    return NextResponse.json({ row: data });
  } catch (e:any) {
    console.error(e);
    return NextResponse.json({ error: '분실물 등록 실패' }, { status: 500 });
  }
}