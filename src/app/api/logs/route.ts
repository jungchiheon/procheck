// /app/api/logs/route.ts (App Router)
import { NextResponse } from 'next/server'
import { supaSrv } from '@/lib/supabase-server'

export async function POST(req: Request) {
  const body = await req.json()
  const { error } = await supaSrv.from('debug_logs').insert({ note: body.note })
  if (error) return NextResponse.json({ ok:false, error }, { status: 500 })
  return NextResponse.json({ ok:true })
}
