import { supabaseClient } from '@/lib/supabaseClient'

/** 직원 목록 — `affiliation` 컬럼이 없는 DB에서도 동작하도록 조회에 포함하지 않음(추가 후엔 여기에 affiliation 붙이면 됨) */
export function fetchStaffListForAdmin() {
  return supabaseClient
    .from('user_profiles')
    .select('id, login_id, nickname, last_checkin_at, last_checkout_at, work_status')
    .eq('role', 'staff')
    .eq('is_active', true)
}
