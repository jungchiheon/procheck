import { NextResponse } from 'next/server'
import { envClients, getProfile, getUserFromBearer, serviceClient } from '@/app/api/_lib/authSupabase'

export const runtime = 'nodejs'

type RowInput = {
  settleId: number
  paymentId: number | null
  staffPay: number
  gabulAmount: number
  adminPay: number
  lineText: string
  memoObj: Record<string, unknown> | null
}

type Body = {
  staffId?: string
  rows?: RowInput[]
}

export async function POST(req: Request) {
  try {
    const env = envClients()
    if (!env) return NextResponse.json({ error: 'server config' }, { status: 500 })

    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!token) return NextResponse.json({ error: 'missing bearer token' }, { status: 401 })

    const { user, error: uErr } = await getUserFromBearer(env.url, env.anon, token)
    if (!user) return NextResponse.json({ error: uErr ?? 'invalid session' }, { status: 401 })

    const svc = serviceClient(env.url, env.service)
    const profile = await getProfile(svc, user.id)
    if (!profile?.is_active || profile.role !== 'admin') {
      return NextResponse.json({ error: 'admin only' }, { status: 403 })
    }

    const body = (await req.json().catch(() => null)) as Body | null
    const staffId = String(body?.staffId ?? '')
    const rows = Array.isArray(body?.rows) ? body!.rows! : []
    if (!staffId) return NextResponse.json({ error: 'staffId required' }, { status: 400 })
    if (!rows.length) return NextResponse.json({ error: 'rows required' }, { status: 400 })

    for (const row of rows) {
      const settleId = Number(row?.settleId ?? 0)
      if (!settleId) return NextResponse.json({ error: 'invalid settleId' }, { status: 400 })

      let paymentId = Number(row?.paymentId ?? 0) || null
      if (!paymentId) {
        const { data: guessed, error: gErr } = await svc
          .from('staff_payment_logs')
          .select('id')
          .eq('work_log_id', settleId)
          .eq('staff_id', staffId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 })
        paymentId = Number((guessed as { id?: number } | null)?.id ?? 0) || null
      }

      if (!paymentId) {
        return NextResponse.json({ error: `payment log not found (work_log_id=${settleId})` }, { status: 404 })
      }

      const memoObj = row.memoObj && typeof row.memoObj === 'object' ? { ...row.memoObj } : {}
      const staffPay = Math.max(0, Number(row.staffPay ?? 0))
      const gabulAmount = Math.max(0, Number(row.gabulAmount ?? 0))
      const adminPay = Math.max(0, Number(row.adminPay ?? 0))
      const lineText = String(row.lineText ?? '').trim()
      ;(memoObj as Record<string, unknown>).staffPay = staffPay
      ;(memoObj as Record<string, unknown>).gabulAmount = gabulAmount
      ;(memoObj as Record<string, unknown>).adminPay = adminPay
      if (lineText) (memoObj as Record<string, unknown>).manualSettleLine = lineText
      else delete (memoObj as Record<string, unknown>).manualSettleLine

      const { error: upErr } = await svc
        .from('staff_payment_logs')
        .update({
          amount: Math.max(0, staffPay - gabulAmount),
          memo: JSON.stringify(memoObj),
        })
        .eq('id', paymentId)
      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'error' }, { status: 500 })
  }
}
