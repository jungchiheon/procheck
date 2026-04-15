import { supabaseClient } from '@/lib/supabaseClient'

/** 직원 목록 */
export function fetchStaffListForAdmin() {
  return supabaseClient
    .from('user_profiles')
    .select('id, login_id, nickname, last_checkin_at, last_checkout_at, work_status, affiliation')
    .eq('role', 'staff')
    .eq('is_active', true)
}
