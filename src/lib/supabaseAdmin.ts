import { createClient } from '@supabase/supabase-js'

export function createSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  // 누락 방지
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing')
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing')

  return createClient(url, serviceKey, {
    auth: { persistSession: false }, // 서버는 세션 저장x
  })
}
