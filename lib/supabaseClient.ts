import { createClient, SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // In dev the env may be missing; warn early so callers know why requests fail
  // Do not throw during module import to avoid breaking builds; export a guarded stub instead.
  console.warn('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

let supabaseClient: SupabaseClient | null = null
try {
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  }
} catch (err) {
  // If createClient unexpectedly fails, log and fall back to a guard stub
  console.error('Failed to create Supabase client:', err && (err as Error).message ? (err as Error).message : err)
  supabaseClient = null
}

// Guard proxy that throws descriptive errors when used without proper configuration.
const guard = new Proxy({}, {
  get() {
    throw new Error('Supabase client is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.')
  }
}) as unknown as SupabaseClient

export const supabase: SupabaseClient = supabaseClient ?? guard

export default supabase
