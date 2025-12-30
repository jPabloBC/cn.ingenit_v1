// Wrapper to call Supabase RPC functions for session management
import { supabase } from '../lib/supabaseClient.js'

export async function acquireSession(userId, token, meta = {}, force = false) {
  const fn = force ? 'cn_sessions_force_acquire' : 'cn_sessions_acquire'
  const { data, error } = await supabase.rpc(fn, {
    p_user_id: userId,
    p_token: token,
    p_meta: meta
  })
  if (error) throw error
  if (!data || data.length === 0) {
    const err = new Error('Session already active')
    err.code = 'SESSION_CONFLICT'
    throw err
  }
  return data[0]
}

export async function heartbeatSession(sessionId) {
  const { data, error } = await supabase.rpc('cn_sessions_heartbeat', {
    p_session_id: sessionId
  })
  if (error) throw error
  return data
}

export async function releaseSession(sessionId) {
  const { error } = await supabase.rpc('cn_sessions_release', {
    p_session_id: sessionId
  })
  if (error) throw error
}

export async function validateSession(sessionId) {
  const { data, error } = await supabase.rpc('cn_sessions_validate', {
    p_session_id: sessionId
  })
  if (error) throw error
  return data && data.length > 0 ? data[0] : null
}
