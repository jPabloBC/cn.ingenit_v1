const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Middleware: validar token Supabase (Authorization: Bearer <access_token>)
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const tokenFromHeader = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const token = tokenFromHeader || req.body && req.body.token;
    if (!token) return res.status(401).json({ error: 'missing_token' });
    const supabaseUrl = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) return res.status(500).json({ error: 'supabase_not_configured' });
    const resp = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': anonKey }
    });
    if (!resp.ok) return res.status(401).json({ error: 'invalid_token' });
    const user = await resp.json();
    if (!user || !user.id) return res.status(401).json({ error: 'invalid_token' });
    req.authUser = user;
    req.accessToken = token;
    next();
  } catch (err) {
    console.error('authenticate error', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'auth_error' });
  }
}

app.post('/sessions/acquire', authenticate, async (req, res) => {
  try {
    const { token = null, meta = {}, force = false } = req.body;
    // prefer explicit user_id but default to authenticated user
    const user_id = req.body.user_id || req.authUser && req.authUser.id;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    // ensure the authenticated user matches the requested user_id
    if (req.authUser.id !== user_id) return res.status(403).json({ error: 'forbidden_user_mismatch' });

    if (force) {
      const qf = 'SELECT * FROM cn_sessions_force_acquire($1::uuid, $2::text, $3::jsonb)';
      const rf = await pool.query(qf, [user_id, token, JSON.stringify(meta)]);
      if (!rf.rows || rf.rows.length === 0) return res.status(500).json({ error: 'force_failed' });
      const out = rf.rows[0];
      return res.status(200).json({ previous_revoked: out.previous_revoked, id: out.id, issued_at: out.issued_at });
    } else {
      const q = 'SELECT * FROM cn_sessions_acquire($1::uuid, $2::text, $3::jsonb)';
      const r = await pool.query(q, [user_id, token, JSON.stringify(meta)]);
      if (!r.rows || r.rows.length === 0) {
        return res.status(409).json({ error: 'session_active', message: 'Sesión activa en otro dispositivo' });
      }
      return res.status(201).json(r.rows[0]);
    }
  } catch (err) {
    console.error('acquire error', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

app.post('/sessions/heartbeat', authenticate, async (req, res) => {
  try {
    const { session_id } = req.body;
    if (!session_id) return res.status(400).json({ error: 'session_id required' });
    // ensure session belongs to authenticated user
    const ownerQ = 'SELECT user_id FROM cn_sessions WHERE id = $1';
    const ownerR = await pool.query(ownerQ, [session_id]);
    if (!ownerR.rows || ownerR.rows.length === 0) return res.status(404).json({ error: 'not_found' });
    if (ownerR.rows[0].user_id !== req.authUser.id) return res.status(403).json({ error: 'forbidden' });
    const q = 'SELECT cn_sessions_heartbeat($1::uuid) AS ok';
    const r = await pool.query(q, [session_id]);
    const ok = r.rows[0] && r.rows[0].ok;
    if (ok) return res.status(200).json({ ok: true });
    return res.status(401).json({ error: 'invalid_or_revoked' });
  } catch (err) {
    console.error('heartbeat error', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

app.post('/sessions/release', authenticate, async (req, res) => {
  try {
    const { session_id } = req.body;
    if (!session_id) return res.status(400).json({ error: 'session_id required' });
    const ownerQ = 'SELECT user_id FROM cn_sessions WHERE id = $1';
    const ownerR = await pool.query(ownerQ, [session_id]);
    if (!ownerR.rows || ownerR.rows.length === 0) return res.status(404).json({ error: 'not_found' });
    if (ownerR.rows[0].user_id !== req.authUser.id) return res.status(403).json({ error: 'forbidden' });
    const q = 'SELECT cn_sessions_release($1::uuid)';
    await pool.query(q, [session_id]);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('release error', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

app.get('/sessions/validate', authenticate, async (req, res) => {
  try {
    const session_id = req.query.session_id;
    if (!session_id) return res.status(400).json({ error: 'session_id required' });
    const ownerQ = 'SELECT user_id FROM cn_sessions WHERE id = $1';
    const ownerR = await pool.query(ownerQ, [session_id]);
    if (!ownerR.rows || ownerR.rows.length === 0) return res.status(404).json({ error: 'not_found' });
    if (ownerR.rows[0].user_id !== req.authUser.id) return res.status(403).json({ error: 'forbidden' });
    const q = 'SELECT * FROM cn_sessions_validate($1::uuid)';
    const r = await pool.query(q, [session_id]);
    if (!r.rows || r.rows.length === 0) return res.status(404).json({ error: 'not_found' });
    return res.status(200).json(r.rows[0]);
  } catch (err) {
    console.error('validate error', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log('CN sessions example listening on', port));
