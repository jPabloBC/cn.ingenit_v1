// sessions-client.js
(function () {
  const API_URL = window.SESSIONS_API_URL || 'http://localhost:4000';
  let __heartbeat = { timer: null, sessionId: null, intervalMs: 5 * 60 * 1000 };

  async function acquire(userId, token = null, meta = {}, force = false) {
    const url = API_URL + '/sessions/acquire';
    const body = { user_id: userId, token, meta, force };
    const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (resp.status === 201 || resp.status === 200) return { ok: true, status: resp.status, data: await resp.json() };
    if (resp.status === 409) return { ok: false, status: 409, data: await resp.json() };
    return { ok: false, status: resp.status, data: await resp.json() };
  }

  async function heartbeat(sessionId) {
    const url = API_URL + '/sessions/heartbeat';
    const body = { session_id: sessionId };
    const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return resp.status === 200;
  }

  async function release(sessionId) {
    const url = API_URL + '/sessions/release';
    const body = { session_id: sessionId };
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }

  function startHeartbeat(sessionId, intervalMs = 5 * 60 * 1000) {
    stopHeartbeat();
    __heartbeat.sessionId = sessionId;
    __heartbeat.intervalMs = intervalMs;
    // immediate heartbeat
    (async () => { try { await heartbeat(sessionId); } catch (e) {} })();
    __heartbeat.timer = setInterval(async () => {
      try {
        const ok = await heartbeat(sessionId);
        if (!ok) {
          // notify renderer: session invalid
          window.dispatchEvent(new CustomEvent('cn-session-revoked', { detail: { sessionId } }));
          stopHeartbeat();
        }
      } catch (e) {
        // ignore network errors
      }
    }, __heartbeat.intervalMs);
  }

  function stopHeartbeat() {
    if (__heartbeat.timer) { clearInterval(__heartbeat.timer); __heartbeat.timer = null; }
    __heartbeat.sessionId = null;
  }

  window.SessionsClient = { acquire, heartbeat, release, startHeartbeat, stopHeartbeat };
})();
