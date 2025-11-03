// 1-1 Supabase Admin Client (서버 전용)
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) throw new Error('ENV NEXT_PUBLIC_SUPABASE_URL missing');
if (!serviceKey) throw new Error('ENV SUPABASE_SERVICE_ROLE_KEY missing');

export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false },
});