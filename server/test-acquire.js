// Simple test helper: sign in a user and call the local sessions API
// Usage:
// SUPABASE_URL=... SUPABASE_ANON_KEY=... TEST_USER_EMAIL=... TEST_USER_PASSWORD=... node test-acquire.js [--force]

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;
const FORCE = process.argv.includes('--force');

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
  console.error('Missing env vars. Required: SUPABASE_URL, SUPABASE_ANON_KEY, TEST_USER_EMAIL, TEST_USER_PASSWORD');
  process.exit(1);
}

async function signIn() {
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/token?grant_type=password`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD })
  });
  const bodyText = await res.text();
  let body
  try { body = JSON.parse(bodyText) } catch (e) { body = bodyText }
  if (!res.ok) {
    const err = new Error(`Sign-in failed: ${res.status} ${JSON.stringify(body)}`)
    err.response = { status: res.status, body }
    throw err
  }
  return body.access_token || body.access_token;
}

async function acquire(token, force) {
  try {
    const res = await fetch('http://127.0.0.1:4000/sessions/acquire', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ meta: { device: 'test-script' }, force: !!force })
    });
    const text = await res.text();
    let parsed
    try { parsed = JSON.parse(text) } catch (e) { parsed = text }
    console.log('HTTP', res.status);
    console.log(parsed);
  } catch (err) {
    console.error('Acquire fetch error:', err && err.stack ? err.stack : err);
    throw err
  }
}

(async () => {
  try {
    console.log('Signing in', TEST_USER_EMAIL);
    const token = await signIn();
    console.log('Got access token (length)', token?.length || 0);
    console.log('Calling /sessions/acquire (force=' + FORCE + ')');
    await acquire(token, FORCE);
  } catch (err) {
    console.error('Error:', err && err.message ? err.message : err);
    process.exit(2);
  }
})();
