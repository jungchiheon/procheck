import { createClient } from '@supabase/supabase-js'

// 서비스키 사용 금지
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// 환경변수 누락 시 에러
if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing')
if (!anonKey) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is missing')

export const supabaseClient = createClient(url, anonKey)
