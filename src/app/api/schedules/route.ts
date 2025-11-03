import { NextRequest, NextResponse } from 'next/server';
import { supaSrv } from '@/lib/supabase-server';

// GET /api/schedules?role=&userId=&managerId=&dateFrom=&dateTo=
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const role = (url.searchParams.get('role') || 'staff') as 'staff'|'manager'|'super_admin';
    const userId = Number(url.searchParams.get('userId') || '0');
    const managerId = Number(url.searchParams.get('managerId') || '0');
    const dateFrom = url.searchParams.get('dateFrom')!;
    const dateTo   = url.searchParams.get('dateTo')!;

    let q = supaSrv
      .from('schedules')
      .select('id,user_id,store_id,start_at,end_at,work_date')
      .gte('work_date', dateFrom)
      .lte('work_date', dateTo)
      .order('start_at', { ascending: true })
      .limit(500);

    if (role === 'staff') {
      if (!userId) return NextResponse.json({ rows: [] }, { status: 200 });
      q = q.eq('user_id', userId);
    } else if (role === 'manager') {
      const stores = await supaSrv.from('stores').select('id').eq('manager_id', managerId);
      if (stores.error) throw stores.error;
      const ids = (stores.data ?? []).map(s => s.id);
      if (ids.length === 0) return NextResponse.json({ rows: [] }, { status: 200 });
      q = q.in('store_id', ids);
    }
    const r = await q;
    if (r.error) throw r.error;
    return NextResponse.json({ rows: r.data ?? [] }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'schedules get failed', detail: String(e) }, { status: 500 });
  }
}

// POST /api/schedules { userId, storeId, startAt, endAt }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userId  = Number(body.userId);
    const storeId = (body.storeId ?? '').toString().trim();
    const startAt = (body.startAt ?? '').toString();
    const endAt   = (body.endAt ?? '').toString();
    if (!userId || !storeId || !startAt || !endAt) {
      return NextResponse.json({ error: 'userId/storeId/startAt/endAt required' }, { status: 400 });
    }
    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      return NextResponse.json({ error: 'endAt must be after startAt' }, { status: 400 });
    }

    // ⚠ work_date는 DB DEFAULT/GNERATED 컬럼이면 넣지 않는다.
    const ins = await supaSrv
      .from('schedules')
      .insert({ user_id: userId, store_id: storeId, start_at: startAt, end_at: endAt })
      .select('id,user_id,store_id,start_at,end_at,work_date')
      .single();

    if (ins.error) throw ins.error;
    return NextResponse.json({ row: ins.data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'schedules post failed', detail: String(e) }, { status: 500 });
  }
}

// PATCH /api/schedules { id, storeId?, startAt?, endAt? }
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const id = body.id?.toString();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const updates: any = {};
    if (body.storeId !== undefined) updates.store_id = body.storeId.toString().trim();
    if (body.startAt !== undefined) updates.start_at = body.startAt.toString();
    if (body.endAt !== undefined)   updates.end_at   = body.endAt.toString();

    if (updates.start_at && updates.end_at) {
      if (new Date(updates.end_at).getTime() <= new Date(updates.start_at).getTime()) {
        return NextResponse.json({ error: 'endAt must be after startAt' }, { status: 400 });
      }
    }

    const upd = await supaSrv
      .from('schedules')
      .update(updates)
      .eq('id', id)
      .select('id,user_id,store_id,start_at,end_at,work_date')
      .single();

    if (upd.error) throw upd.error;
    return NextResponse.json({ row: upd.data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'schedules patch failed', detail: String(e) }, { status: 500 });
  }
}

// DELETE /api/schedules { id }
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const id = body.id?.toString();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const del = await supaSrv.from('schedules').delete().eq('id', id);
    if (del.error) throw del.error;
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'schedules delete failed', detail: String(e) }, { status: 500 });
  }
}