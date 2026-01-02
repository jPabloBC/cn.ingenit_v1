import supabase from '../../../../lib/supabaseClient'
import { Request, Response } from 'express'

// Express route handler for POST /api/session/check-email
export async function checkEmailHandler(req: Request, res: Response) {
  const body = req.body || {}
  const { email } = body
  
  console.log('[check-email] email:', email, 'supabase:', !!supabase)
  
  if (!email) return res.status(400).json({ error: 'missing email' })

  if (!supabase || !(supabase as any).auth) {
    console.log('[check-email] supabase unavailable')
    return res.status(501).json({ error: 'supabase_unavailable' })
  }

  try {
    // Use resetPasswordForEmail (anon key) to detect if email exists.
    // If email doesn't exist, Supabase will reject it with a specific error.
    const sup = supabase as any;
    console.log('[check-email] calling resetPasswordForEmail for:', email)
    const { error } = await sup.auth.resetPasswordForEmail(email, {
      redirectTo: 'about:blank' // dummy redirect; we only care about detecting email existence
    });
    
    console.log('[check-email] resetPasswordForEmail error:', error?.message || 'no error')
    
    // If no error, email exists (reset email was sent or enqueued)
    if (!error) {
      console.log('[check-email] returning exists: true')
      return res.json({ exists: true })
    }
    
    // Heuristic: if error mentions "user", "not found", "doesn't exist", etc., the email likely doesn't exist
    const errMsg = (error && error.message) ? String(error.message).toLowerCase() : '';
    const doesNotExist = /user.*not.*found|doesn't exist|not registered|no user|invalid|not found/i.test(errMsg);
    
    console.log('[check-email] errMsg:', errMsg, 'doesNotExist:', doesNotExist)
    
    if (doesNotExist) {
      console.log('[check-email] returning exists: false')
      return res.json({ exists: false })
    } else {
      // Ambiguous error; assume email exists (better to say wrong password than user doesn't exist)
      console.log('[check-email] returning exists: true (ambiguous)')
      return res.json({ exists: true })
    }
  } catch (e) {
    // On network/other error, assume email exists to avoid false negatives
    console.log('[check-email] catch error:', e)
    return res.json({ exists: true })
  }
}
