import { createClient } from '@supabase/supabase-js';

// ⚠️ .env.local 에 있는 키 이름과 맞추세요.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;   // ← 중요: 공개 URL 사용
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supaSrv = createClient(url, serviceKey, {
  auth: { persistSession: false },
});
