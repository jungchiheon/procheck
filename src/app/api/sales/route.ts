import { NextRequest, NextResponse } from 'next/server';
import { supaSrv } from '@/lib/supabase-server';

const isUuid = (v: any) =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

function ensureDate(d: any): string {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    throw new Error('date must be YYYY-MM-DD');
  }
  return d;
}
function ensureStoreUuid(storeId: any): string {
  if (!isUuid(storeId)) throw new Error('storeId must be uuid');
  return String(storeId);
}

const fields =
  'id,user_id,store_id,sale_date,amount,cnt,incentive,note,created_at,updated_at';

async function resolveUserUuid(idOrUuid: any): Promise<string> {
  if (isUuid(idOrUuid)) return String(idOrUuid);
  const legacy = Number(idOrUuid);
  if (!Number.isFinite(legacy) || legacy <= 0) throw new Error('invalid userId');

  const got = await supaSrv
    .from('user_uuid_map')
    .select('user_uuid')
    .eq('legacy_id', legacy)
    .maybeSingle();
  if (got.error) throw got.error;

  if (got.data?.user_uuid) return String(got.data.user_uuid);

  const gen =
    (globalThis.crypto?.randomUUID?.() ?? require('crypto').randomUUID()).toString();
  const ins = await supaSrv
    .from('user_uuid_map')
    .insert({ legacy_id: legacy, user_uuid: gen })
    .select('user_uuid')
    .single();
  if (ins.error) throw ins.error;

  return String(ins.data.user_uuid);
}

/** ---------- GET ---------- */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const role = (url.searchParams.get('role') || 'staff') as 'staff'|'manager'|'super_admin';
    const userIdLegacy = Number(url.searchParams.get('userId') || '0');
    const managerIdLegacy = Number(url.searchParams.get('managerId') || '0');
    const storeId = url.searchParams.get('storeId');
    const dateFrom = ensureDate(url.searchParams.get('dateFrom') || '');
    const dateTo   = ensureDate(url.searchParams.get('dateTo') || '');

    let q = supaSrv
      .from('sales')
      .select(fields)
      .gte('sale_date', dateFrom)
      .lte('sale_date', dateTo)
      .order('sale_date', { ascending: false });

    if (storeId) {
      if (!isUuid(storeId)) {
        return NextResponse.json({ error: 'storeId must be uuid' }, { status: 400 });
      }
      q = q.eq('store_id', storeId);
    }

    if (role === 'staff') {
      if (!userIdLegacy) return NextResponse.json({ rows: [] }, { status: 200 });
      const userUuid = await resolveUserUuid(userIdLegacy);
      q = q.eq('user_id', userUuid);
    } else if (role === 'manager') {
      if (!managerIdLegacy) return NextResponse.json({ rows: [] }, { status: 200 });
      const stores = await supaSrv
        .from('stores')
        .select('id')
        .eq('manager_id', managerIdLegacy);
      if (stores.error) throw stores.error;
      const ids = (stores.data ?? []).map(s => s.id);
      if (!ids.length) return NextResponse.json({ rows: [] }, { status: 200 });
      q = q.in('store_id', ids);
    }

    const r = await q;
    if (r.error) throw r.error;
    const rows = (r.data ?? []) as Array<{ user_id: string }>;

    // ---- 여기서 uuid -> legacy 매핑 붙여준다 ----
    const uuids = Array.from(new Set(rows.map(x => x.user_id).filter(isUuid)));
    let legacyMap: Record<string, number> = {};
    if (uuids.length) {
      const mapRes = await supaSrv
        .from('user_uuid_map')
        .select('legacy_id,user_uuid')
        .in('user_uuid', uuids);
      if (mapRes.error) throw mapRes.error;
      legacyMap = (mapRes.data ?? []).reduce<Record<string, number>>((acc, cur:any) => {
        acc[String(cur.user_uuid)] = Number(cur.legacy_id);
        return acc;
      }, {});
    }

    const enriched = rows.map(row => ({
      ...row,
      legacy_user_id: legacyMap[row.user_id] ?? null, // ← 프론트에서 이름 매칭용
    }));

    return NextResponse.json({ rows: enriched }, { status: 200 });
  } catch (e: any) {
    console.error('[GET /api/sales] err:', e?.message, e);
    return NextResponse.json({ error: e?.message || 'sales get failed' }, { status: 500 });
  }
}

/** ---------- POST / PATCH / DELETE (변경 없음) ---------- */
export async function POST() { /* ... 기존 그대로 ... */ throw new Error('keep your existing POST/PATCH/DELETE here'); }
export async function PATCH() { /* ... 기존 그대로 ... */ throw new Error('keep your existing POST/PATCH/DELETE here'); }
export async function DELETE() { /* ... 기존 그대로 ... */ throw new Error('keep your existing POST/PATCH/DELETE here'); }
