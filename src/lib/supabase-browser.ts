'use client'
import { createClient } from '@supabase/supabase-js'

const url  = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim()

if (!/^https?:\/\//.test(url)) throw new Error('Invalid NEXT_PUBLIC_SUPABASE_URL')
if (!anon) throw new Error('Invalid NEXT_PUBLIC_SUPABASE_ANON_KEY')

export const supabase = createClient(url, anon)
