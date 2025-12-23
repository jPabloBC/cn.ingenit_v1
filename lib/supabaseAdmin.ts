import { createClient } from '@supabase/supabase-js'

function sanitizeEnv(v?: string) {
  if (!v) return ''
  return v.replace(/^\s*"|"\s*$/g, '').trim()
}

const SUPABASE_URL_RAW = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE_KEY_RAW = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const SUPABASE_URL = sanitizeEnv(SUPABASE_URL_RAW)
const SUPABASE_SERVICE_ROLE_KEY = sanitizeEnv(SUPABASE_SERVICE_ROLE_KEY_RAW)

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  // If required envs missing, in production fail fast; in dev we'll fall back to a stub.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment')
  }
}

function createAdmin() {
  // In production, create the real client and let errors surface.
  if (process.env.NODE_ENV === 'production') {
    try {
      return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    } catch (err) {
      throw new Error(`Invalid SUPABASE_URL or SERVICE_ROLE_KEY — url="${SUPABASE_URL}" error=${String(err)}`)
    }
  }

  // In development, if the URL looks invalid, provide a lightweight stub so the app can run.
  try {
    // validate URL
    new URL(SUPABASE_URL)
    // if valid, attempt to create real client
    return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  } catch (err) {
    // Development fallback stub: implement `auth.getUser` used by the proxy.
    return {
      auth: {
        async getUser(_token: string) {
          return { data: { user: null } }
        }
      }
    } as any
  }
}

export const supabaseAdmin = createAdmin()
export default supabaseAdmin
