import { NextRequest, NextResponse } from 'next/server';
import { supaSrv } from '@/lib/supabase-server';

// Asia/Seoul 기준 yyyy-mm-dd (조회 기본값에만 사용)
const todayKST = () => {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
};

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const role = (url.searchParams.get('role') || 'staff') as 'staff'|'manager'|'super_admin';
    const userId = Number(url.searchParams.get('userId') || '0');
    const managerId = Number(url.searchParams.get('managerId') || '0');
    const dateFrom = url.searchParams.get('dateFrom') || todayKST();
    const dateTo   = url.searchParams.get('dateTo')   || todayKST();

    let q = supaSrv
      .from('attendance')
      .select('id,user_id,store_id,check_in_at,check_out_at,total_hours,work_date')
      .gte('work_date', dateFrom)
      .lte('work_date', dateTo)
      .order('check_in_at', { ascending: false })
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
    return NextResponse.json({ error: e?.message || 'attendance get failed', detail: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userId = Number(body.userId);
    const storeId = (body.storeId ?? '').toString().trim(); // uuid면 문자열 그대로
    if (!userId || !storeId) {
      return NextResponse.json({ error: 'userId/storeId required' }, { status: 400 });
    }

    const now = new Date().toISOString();
    // ⚠ work_date는 DB DEFAULT/GNERATED 컬럼일 수 있으므로 넣지 않는다.
    const payload = {
      user_id: userId,
      store_id: storeId,
      check_in_at: now,
      total_hours: 0,
    };

    const ins = await supaSrv
      .from('attendance')
      .insert(payload)
      .select('id,user_id,store_id,check_in_at,check_out_at,total_hours,work_date')
      .single();

    if (ins.error) throw ins.error;
    return NextResponse.json({ row: ins.data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'attendance post failed', detail: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const id = Number(body.id);
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const found = await supaSrv
      .from('attendance')
      .select('id,check_in_at,check_out_at,total_hours')
      .eq('id', id)
      .single();
    if (found.error) throw found.error;
    if (!found.data) return NextResponse.json({ error: 'not found' }, { status: 404 });
    if (found.data.check_out_at) {
      return NextResponse.json({ error: 'already checked out' }, { status: 400 });
    }

    const out = new Date();
    const hours = Math.max(0, (out.getTime() - new Date(found.data.check_in_at).getTime()) / 36e5);

    const upd = await supaSrv
      .from('attendance')
      .update({
        check_out_at: out.toISOString(),
        total_hours: Number(hours.toFixed(2)),
      })
      .eq('id', id)
      .select('id,user_id,store_id,check_in_at,check_out_at,total_hours,work_date')
      .single();

    if (upd.error) throw upd.error;
    return NextResponse.json({ row: upd.data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'attendance patch failed', detail: String(e) }, { status: 500 });
  }
}