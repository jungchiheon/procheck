import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function envClients() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !service) return null
  return { url, anon, service }
}

export function serviceClient(url: string, service: string) {
  return createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function getUserFromBearer(url: string, anon: string, token: string) {
  const supabaseAnon = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await supabaseAnon.auth.getUser(token)
  if (error || !data.user) return { user: null as null, error: error?.message ?? 'no user' }
  return { user: data.user, error: null as null }
}

export async function getProfile(
  svc: SupabaseClient,
  uid: string
): Promise<{ id: string; role: string; is_active: boolean; nickname: string | null } | null> {
  const { data, error } = await svc.from('user_profiles').select('id, role, is_active, nickname').eq('id', uid).maybeSingle()
  if (error || !data) return null
  return data as { id: string; role: string; is_active: boolean; nickname: string | null }
}
