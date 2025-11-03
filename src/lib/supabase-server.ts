import 'server-only' // ← 이 한 줄로 클라이언트에서의 import를 막습니다.
import { createClient } from '@supabase/supabase-js'

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()

if (!/^https?:\/\//.test(url)) throw new Error('ENV NEXT_PUBLIC_SUPABASE_URL invalid')
if (!serviceKey) throw new Error('ENV SUPABASE_SERVICE_ROLE_KEY missing')

export const supaSrv = createClient(url, serviceKey, { auth: { persistSession: false } })
