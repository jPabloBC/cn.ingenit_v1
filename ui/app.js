console.log('UI app.js loaded');

// Wait for Tauri API (guaranteed by preload.js)
(async () => {
  await window.__tauriReady;
  console.log('Tauri ready, initializing app');
  initApp();
})();

// View loader: fetch fragment HTML from /views/<name>.html and inject into #view
async function loadView(name) {
  const container = document.getElementById('view');
  if (!container) throw new Error('No view container found');
  try {
    const resp = await fetch(`views/${name}.html`);
    if (!resp.ok) throw new Error(`Failed to load view: ${name}`);
    const html = await resp.text();
    // Insert HTML and execute any <script> tags contained in the fragment.
    container.innerHTML = html;
    try {
      // Move script tags out so they execute with preserved attributes.
      const scripts = Array.from(container.querySelectorAll('script'));
      for (const s of scripts) {
        const newScript = document.createElement('script');
        // Preserve type (module/non-module) so `import` statements work
        if (s.type) newScript.type = s.type;
        if (s.defer) newScript.defer = true;
        if (s.async) newScript.async = s.async;
        if (s.crossOrigin) newScript.crossOrigin = s.crossOrigin;
        if (s.integrity) newScript.integrity = s.integrity;
        if (s.src) {
          // Resolve relative URLs against current location
          try { newScript.src = new URL(s.getAttribute('src'), window.location.href).href; } catch (e) { newScript.src = s.src; }
        } else {
          newScript.textContent = s.textContent;
        }
        document.head.appendChild(newScript);
        // remove original to avoid duplicate execution
        s.parentNode && s.parentNode.removeChild(s);
      }
    } catch (e) {
      console.warn('Error executing view scripts:', e);
    }
    return true;
  } catch (e) {
    console.error('loadView error:', e);
    return false;
  }
}

// DOM references
let startBtn, stopBtn, clearLogsBtn, fileNameDisplay, csvFileInput, logsContainer;
let startInsertBtn, pauseInsertBtn, stopInsertBtn;
let form3561Btn, form3562Btn;
let backBtn;
let statusDot, statusText, processedCount, successCount, failedCount;

// App state
let state = {
  csvPath: null,
  csvContent: null,
  isRunning: false,
  selectedForm: null,
  stats: { processed: 0, success: 0, failed: 0 },
  insertion: { mode: 'idle' },
};

function getDOMElements() {
  startBtn = document.getElementById('startBtn');
  stopBtn = document.getElementById('stopBtn');
  startInsertBtn = document.getElementById('startInsertBtn');
  pauseInsertBtn = document.getElementById('pauseInsertBtn');
  stopInsertBtn = document.getElementById('stopInsertBtn');
  form3561Btn = document.getElementById('form3561Btn');
  form3562Btn = document.getElementById('form3562Btn');
  clearLogsBtn = document.getElementById('clearLogsBtn');
  fileNameDisplay = document.getElementById('fileName');
  csvFileInput = document.getElementById('csvFile'); // Match HTML id
  logsContainer = document.getElementById('logs');
  statusDot = document.getElementById('statusDot');
  statusText = document.getElementById('statusText');
  backBtn = document.getElementById('backBtn');
  processedCount = document.getElementById('processedCount');
  successCount = document.getElementById('successCount');
  failedCount = document.getElementById('failedCount');
  
  console.log('DOM elements loaded:', { startBtn, csvFileInput, logsContainer });
}

// Attach handlers used on the Home view (Acceder -> login flow)
function attachHomeHandlers() {
  const accederBtn = document.getElementById('accederBtn');
  if (!accederBtn) return;
  // update dev session status
  try { const statusEl = document.getElementById('cnSessionStatus'); if (statusEl) statusEl.textContent = localStorage.getItem('cn_session_id') || '(none)'; } catch (e) {}
  const forceBtn = document.getElementById('forceCheckBtn');
  if (forceBtn) {
    forceBtn.onclick = async () => {
      try { const ok = await checkInternetConnection(); alert('Conectividad: ' + (ok ? 'online' : 'offline')); } catch (e) { alert('Error comprobando conectividad'); }
    };
  }
  accederBtn.onclick = async () => {
    // Check connectivity at click time and block login when offline
    try {
      const online = await checkInternetConnection();
      if (!online) {
        showConnectionError();
        addLog('Sin conexión a internet — acceso bloqueado', 'error');
        return;
      }
    } catch (e) {
      console.warn('Connectivity check failed:', e);
      showConnectionError();
      addLog('Sin conexión a internet — acceso bloqueado', 'error');
      return;
    }

    const okLogin = await loadView('login');
    if (!okLogin) { addLog('No se pudo cargar login', 'error'); return; }
    const loginBtn = document.getElementById('loginBtn');
    const loginCancelBtn = document.getElementById('loginCancelBtn');

    // Ensure supabase client exists
    if (!window.supabaseClient) {
      try {
        const url = window.SUPABASE_URL || '';
        const key = window.SUPABASE_ANON_KEY || '';
        if (url && key && !key.includes('<YOUR')) {
          const mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm');
          window.supabaseClient = mod.createClient(url, key);
        }
      } catch (e) { console.warn('No se pudo inicializar Supabase dinámicamente:', e); }
    }

    if (loginCancelBtn) {
      loginCancelBtn.onclick = async () => {
        await loadView('home');
        attachHomeHandlers();
      };
    }

    if (loginBtn) {
      loginBtn.onclick = async () => {
        try {
          addLog('Autenticando...', 'info');
          const email = (document.getElementById('loginEmail') || {}).value || '';
          const password = (document.getElementById('loginPassword') || {}).value || '';
          const setLoginError = (msg) => {
            try {
              const el = document.getElementById('loginError');
              if (!el) return;
              if (msg) { el.style.display = 'block'; el.textContent = msg; } else { el.style.display = 'none'; el.textContent = ''; }
            } catch (e) {}
          };
          if (!email || !password) { addLog('Email y password son requeridos', 'warning'); try { setLoginError('Email y password son requeridos'); } catch (e) {} return; }
          const sup = window.supabaseClient;
          if (!sup) { addLog('Supabase client no configurado', 'error'); try { setLoginError('Supabase client no configurado'); } catch (e) {} return; }
          // clear previous UI error
          try { setLoginError(''); } catch (e) {}
          const res = await sup.auth.signInWithPassword({ email, password });
          if (res.error) {
            const rawMsg = (res.error && res.error.message) ? res.error.message : 'Error autenticando';
            // show raw error object for debugging so it's visible in UI
            try { setLoginError(typeof res.error === 'object' ? JSON.stringify(res.error) : String(res.error)); } catch (e) {}
            // Try to distinguish between "user not found" and "wrong password"
            try {
              const resp = await fetch('http://localhost:4000/check-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
              });
              let jb = await resp.json().catch(() => ({}));
              console.log('check-email response', resp.status, jb);
              
              if (resp.ok && typeof jb.exists === 'boolean') {
                if (jb.exists === false) {
                  const m = 'Usuario no existe';
                  addLog('Error autenticando: ' + m, 'error');
                  try { setLoginError(m); } catch (e) {}
                  return;
                } else {
                  const m = 'Contraseña incorrecta';
                  addLog('Error autenticando: ' + m, 'error');
                  try { setLoginError(m); } catch (e) {}
                  return;
                }
              } else {
                addLog('Error autenticando: ' + rawMsg, 'error');
                try { setLoginError(rawMsg); } catch (e) {}
                return;
              }
            } catch (e) {
              addLog('Error autenticando: ' + rawMsg, 'error');
              try { setLoginError(rawMsg); } catch (e) {}
              return;
            }
          }
          const user = (res.data && res.data.user) || res.user || null;
          if (!user) { addLog('Autenticación fallida', 'error'); return; }
          // clear any login error on success
          try { setLoginError(''); } catch (e) {}
          addLog('Autenticación exitosa', 'success');
          try {
            const session = (res.data && res.data.session) || null;
            if (session) localStorage.setItem('supabase_session', JSON.stringify(session));
            // Acquire RPC-based single session via Supabase
            try {
              const sessToken = session ? (session.access_token || null) : null;
              const acquireRPC = async (userId, token, meta, force) => {
                const fn = force ? 'cn_sessions_force_acquire' : 'cn_sessions_acquire';
                const { data, error } = await sup.rpc(fn, {
                  p_user_id: userId,
                  p_token: token,
                  p_meta: meta
                });
                if (error) throw error;
                if (!data || data.length === 0) {
                  const err = new Error('Session already active');
                  err.code = 'SESSION_CONFLICT';
                  throw err;
                }
                return data[0];
              };
              try {
                const acqResult = await acquireRPC(user.id, sessToken, { email: user.email }, false);
                addLog('Sesión adquirida: ' + acqResult.id, 'success');
                try { localStorage.setItem('cn_session_id', acqResult.id); } catch (e) {}
                try { if (typeof startCnHeartbeat === 'function') startCnHeartbeat(acqResult.id); } catch (e) {}
              } catch (e) {
                if (e.code === 'SESSION_CONFLICT' || e.message.includes('already active')) {
                  try {
                    const acqForce = await showForceModal(user.email, async () => {
                      return await acquireRPC(user.id, sessToken, { email: user.email }, true);
                    });
                    if (!acqForce) {
                      addLog('Login cancelado por sesión activa en otro equipo', 'warning');
                      return;
                    }
                    addLog('Sesión forzada: ' + acqForce.id, 'success');
                    try { localStorage.setItem('cn_session_id', acqForce.id); } catch (e2) {}
                    try { if (typeof startCnHeartbeat === 'function') startCnHeartbeat(acqForce.id); } catch (e2) {}
                  } catch (e2) {
                    addLog('No se pudo forzar cierre de sesiones: ' + (e2.message || e2), 'error');
                    alert('No se pudo cerrar las sesiones remotas. Intenta más tarde.');
                    return;
                  }
                } else {
                  addLog('Error al adquirir sesión: ' + (e.message || e), 'error');
                  throw e;
                }
              }
            } catch (e) { console.warn('RPC acquire failed', e); }
          } catch (e) {}
          const okDash = await loadView('dashboard');
          if (!okDash) { addLog('No se pudo cargar dashboard', 'error'); return; }
          attachDashboardHandlers();
        } catch (e) { console.error('Login error:', e); addLog('Error en login: ' + (e.message || e), 'error'); }
      };
    }
  };
}

// Attach handlers used on the dashboard view (called after loading the dashboard)
function attachDashboardHandlers() {
  const openAutomationBtn = document.getElementById('openAutomationBtn');
  const logoutBtn = document.getElementById('logoutBtn');

  if (openAutomationBtn) {
    openAutomationBtn.onclick = async () => {
      const okAuto = await loadView('automation');
      if (!okAuto) { addLog('No se pudo cargar Automation', 'error'); return; }
      // initialize main automation UI
      getDOMElements();
      setupEventListeners();
      try { await setupLogsListener(); } catch (e) {}
      checkStatus();
      updateUI();
      addLog('Pantalla de Automation cargada', 'info');
    };
  }

  if (logoutBtn) {
    logoutBtn.onclick = async () => {
      try {
        // Attempt to release cn_sessions row BEFORE signing out so the RPC runs with current auth
        const cnId = localStorage.getItem('cn_session_id');
        const sup = window.supabaseClient;
        if (cnId) {
          try {
            if (sup && typeof sup.rpc === 'function') {
              const resp = await sup.rpc('cn_sessions_release', { p_session_id: cnId });
              if (resp && resp.error) throw resp.error;
            } else if (window.SessionsClient && typeof window.SessionsClient.release === 'function') {
              await window.SessionsClient.release(cnId);
            }
          } catch (e) {
            // fallback to SessionsClient.release if direct RPC failed
            try {
              if (window.SessionsClient && typeof window.SessionsClient.release === 'function') {
                await window.SessionsClient.release(cnId);
              } else {
                console.warn('release failed and no fallback available', e);
              }
            } catch (e2) { console.warn('release fallback failed', e2); }
          } finally {
            try { if (window.SessionsClient && typeof window.SessionsClient.stopHeartbeat === 'function') window.SessionsClient.stopHeartbeat(); } catch (e) {}
            try { stopCnHeartbeat(); } catch (e) {}
            try { localStorage.removeItem('cn_session_id'); } catch (e) {}
          }
        }

        // Now sign out from Supabase auth (after release)
        try {
          if (sup && sup.auth && typeof sup.auth.signOut === 'function') {
            await sup.auth.signOut();
          }
        } catch (e) {
          console.warn('Error during signOut:', e);
        }

        try { localStorage.removeItem('supabase_session'); } catch (e) {}
      } catch (e) {
        console.warn('Error releasing cn session or signing out:', e);
      }
      await loadView('home');
      // reattach home handlers so Acceder works again
      try { attachHomeHandlers(); } catch (e) { console.warn('attachHomeHandlers failed after logout', e); }
      addLog('Sesión cerrada', 'info');
    };
  }
}

function addLog(message, type = 'info') {
  if (!logsContainer) return;
  const timestamp = new Date().toLocaleTimeString('es-ES');
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry ${type}`;
  logEntry.textContent = `[${timestamp}] ${message}`;
  logsContainer.appendChild(logEntry);
  logsContainer.scrollTop = logsContainer.scrollHeight;
}

// Client-side session handling: prefer Supabase Realtime subscription, fallback to polling validate
let __cn_session_heartbeat = { timer: null };
let __cn_realtime_sub = null;

function stopCnHeartbeat() {
  try {
    if (__cn_session_heartbeat.timer) { clearInterval(__cn_session_heartbeat.timer); __cn_session_heartbeat.timer = null; }
  } catch (e) {}
}

// Best-effort release on page unload (cannot guarantee network) — attempt RPC then fallback
window.addEventListener('beforeunload', (ev) => {
  try {
    const cnId = (function(){ try { return localStorage.getItem('cn_session_id'); } catch(e){ return null; } })();
    if (!cnId) return;
    const sup = window.supabaseClient;
    if (sup && typeof sup.rpc === 'function') {
      // fire-and-forget
      try { sup.rpc('cn_sessions_release', { p_session_id: cnId }).catch(() => {}); } catch (e) {}
    } else if (window.SessionsClient && typeof window.SessionsClient.release === 'function') {
      try { window.SessionsClient.release(cnId).catch(() => {}); } catch (e) {}
    }
  } catch (e) {}
});

function stopCnRealtime() {
  try {
    if (__cn_realtime_sub && typeof __cn_realtime_sub.unsubscribe === 'function') {
      __cn_realtime_sub.unsubscribe();
    }
  } catch (e) {}
  __cn_realtime_sub = null;
}

async function startCnRealtime(sessionId) {
  stopCnRealtime();
  const sup = window.supabaseClient;
  if (!sup || typeof sup.channel !== 'function') return false;
  try {
    const topic = `realtime:cn_sessions:${sessionId}`;
    const ch = sup.channel(topic);
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'cn_sessions', filter: `id=eq.${sessionId}` }, (payload) => {
      try {
        const newRow = (payload && payload.new) ? payload.new : null;
        if (newRow && newRow.revoked) {
          addLog('Sesión revocada remotamente (realtime) — cerrando sesión', 'warning');
          (async () => {
            try { await sup.auth.signOut(); } catch (e) {}
            try { localStorage.removeItem('cn_session_id'); localStorage.removeItem('supabase_session'); } catch (e) {}
            location.reload();
          })();
        }
      } catch (e) {}
    });
    await ch.subscribe();
    __cn_realtime_sub = ch;
    return true;
  } catch (e) {
    console.warn('startCnRealtime failed', e);
    __cn_realtime_sub = null;
    return false;
  }
}

async function startCnHeartbeat(sessionId, intervalMs = 30_000) {
  stopCnHeartbeat();
  stopCnRealtime();
  if (!sessionId) return;

  // Try realtime first
  try {
    const realtimeOk = await startCnRealtime(sessionId);
    if (realtimeOk) return; // realtime active, no polling needed
  } catch (e) {
    // ignore and fall back to polling
  }

  // immediate check + polling fallback
  (async () => {
    try {
      const sup = window.supabaseClient;
      if (!sup || !sup.rpc) return;
      const { data, error } = await sup.rpc('cn_sessions_validate', { p_session_id: sessionId });
      if (error) { console.warn('cn_sessions_validate error', error); return; }
      const row = Array.isArray(data) ? data[0] : data;
      if (row && row.revoked) {
        addLog('Sesión revocada remotamente — cerrando sesión', 'warning');
        try { await sup.auth.signOut(); } catch (e) {}
        try { localStorage.removeItem('cn_session_id'); localStorage.removeItem('supabase_session'); } catch (e) {}
        location.reload();
      }
    } catch (e) {}
  })();

  __cn_session_heartbeat.timer = setInterval(async () => {
    try {
      const sup = window.supabaseClient;
      if (!sup || !sup.rpc) return;
      const { data, error } = await sup.rpc('cn_sessions_validate', { p_session_id: sessionId });
      if (error) { console.warn('cn_sessions_validate error', error); return; }
      const row = Array.isArray(data) ? data[0] : data;
      if (row && row.revoked) {
        stopCnHeartbeat();
        addLog('Sesión revocada remotamente — cerrando sesión', 'warning');
        try { await sup.auth.signOut(); } catch (e) {}
        try { localStorage.removeItem('cn_session_id'); localStorage.removeItem('supabase_session'); } catch (e) {}
        location.reload();
      }
    } catch (e) {
      // ignore transient errors
    }
  }, intervalMs);
}

// Modal to confirm force-acquire action. onConfirm is an async function executed when user confirms.
function showForceModal(email, onConfirm) {
  return new Promise((resolve, reject) => {
    try {
      // create modal if not exists
      let modal = document.getElementById('forceSessionModal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'forceSessionModal';
        modal.innerHTML = `
          <div class="modal-overlay">
            <div class="modal-dialog">
              <div class="modal-header"><h3>Sesión activa encontrada</h3></div>
              <div class="modal-body">
                <p id="forceModalMessage">Se detectó una sesión activa en otro equipo.</p>
              </div>
              <div class="modal-footer">
                <button id="forceModalCancel" class="btn">Cancelar</button>
                <button id="forceModalConfirm" class="btn btn-primary">Forzar</button>
              </div>
              <div id="forceModalSpinner" class="modal-spinner" aria-hidden="true"></div>
            </div>
          </div>`;
        document.body.appendChild(modal);
      }

      const overlay = modal.querySelector('.modal-overlay');
      const msgEl = modal.querySelector('#forceModalMessage');
      const btnCancel = modal.querySelector('#forceModalCancel');
      const btnConfirm = modal.querySelector('#forceModalConfirm');
      const spinner = modal.querySelector('#forceModalSpinner');

      msgEl.textContent = `El usuario ${email} tiene una sesión activa en otro equipo. ¿Deseas cerrar las sesiones en otros equipos y usar esta ahora?`;

      const cleanup = () => {
        btnCancel.removeEventListener('click', onCancel);
        btnConfirm.removeEventListener('click', onConfirmClick);
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay.parentNode === modal ? modal : overlay.parentNode);
      };

      const setLoading = (isLoading) => {
        if (isLoading) {
          spinner.setAttribute('aria-hidden', 'false');
          btnConfirm.disabled = true;
          btnCancel.disabled = true;
          btnConfirm.textContent = 'Forzando...';
        } else {
          spinner.setAttribute('aria-hidden', 'true');
          btnConfirm.disabled = false;
          btnCancel.disabled = false;
          btnConfirm.textContent = 'Forzar';
        }
      };

      const onCancel = () => {
        try { if (modal && modal.parentNode) modal.parentNode.removeChild(modal); } catch (e) {}
        resolve(false);
      };

      const onConfirmClick = async () => {
        setLoading(true);
        try {
          const result = await onConfirm();
          try { if (modal && modal.parentNode) modal.parentNode.removeChild(modal); } catch (e) {}
          resolve(result);
        } catch (err) {
          setLoading(false);
          try { addLog('Error forzando sesión: ' + (err && err.message ? err.message : err), 'error'); } catch (e) {}
          try { if (modal && modal.parentNode) modal.parentNode.removeChild(modal); } catch (e) {}
          reject(err);
        }
      };

      btnCancel.addEventListener('click', onCancel);
      btnConfirm.addEventListener('click', onConfirmClick);
      // show modal (already in DOM)
    } catch (e) {
      reject(e);
    }
  });
}

// Health check: validate internet connection by testing connectivity to a reliable service
async function checkInternetConnection() {
  // Quick check using the browser's navigator where available
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      console.log('Internet check: navigator.onLine === false');
      return false;
    }

    // Primary probe: use a CORS-friendly, lightweight endpoint that reliably responds (no-cors ok)
    const pingUrl = 'https://www.gstatic.com/generate_204';
    const timeout = 3000;
    const ctl = new AbortController();
    const tid = setTimeout(() => ctl.abort(), timeout);
    try {
      // Use no-cors so the request succeeds as an opaque response when reachable
      await fetch(pingUrl, { method: 'GET', mode: 'no-cors', signal: ctl.signal });
      clearTimeout(tid);
      console.log('Internet check: OK (gstatic ping)');
      return true;
    } catch (e) {
      clearTimeout(tid);
      console.warn('Gstatic ping failed:', e && e.name, e && e.message);
      // Fall back to Supabase URL check if available (may be CORS-restricted)
      const url = window.SUPABASE_URL || '';
      if (!url) {
        console.warn('SUPABASE_URL not configured');
        return true; // keep old behavior when config missing
      }
      const ctl2 = new AbortController();
      const tid2 = setTimeout(() => ctl2.abort(), timeout);
      try {
        const resp = await fetch(url, {
          method: 'GET',
          signal: ctl2.signal,
          headers: { 'Authorization': 'Bearer NO_AUTH' }
        });
        clearTimeout(tid2);
        console.log('Internet check: OK (supabase response received)');
        return true;
      } catch (e2) {
        clearTimeout(tid2);
        console.warn('Supabase ping failed:', e2 && e2.name, e2 && e2.message);
        return false;
      }
    }
  } catch (e) {
    console.warn('Internet connectivity check error:', e && e.message);
    return false;
  }
}

// Show connection error banner and disable Acceder button
function showConnectionError() {
  const accederBtn = document.getElementById('accederBtn');
  if (accederBtn) {
    accederBtn.disabled = true;
    accederBtn.title = 'Sin conexión a internet. Verifica tu conexión e intenta de nuevo.';
    accederBtn.classList.add('disabled');
  }
  // Show error message in home view
  const homeContainer = document.getElementById('view');
  if (homeContainer) {
    const errorBanner = document.createElement('div');
    errorBanner.className = 'error-banner';
    errorBanner.id = 'connectionErrorBanner';
    errorBanner.innerHTML = `
      <div style="background: #fee; border: 1px solid #f00; color: #c00; padding: 12px; border-radius: 4px; margin-bottom: 16px; text-align: center;">
        <strong>⚠ Sin conexión a internet</strong><br>
        No se puede conectar a los servidores. Verifica tu conexión de red e intenta de nuevo.
      </div>
    `;
    const mainSection = homeContainer.querySelector('main') || homeContainer.querySelector('section');
    if (mainSection && !document.getElementById('connectionErrorBanner')) {
      mainSection.insertBefore(errorBanner, mainSection.firstChild);
    }
  }
}

// Hide connection error banner and re-enable Acceder
function hideConnectionError() {
  const banner = document.getElementById('connectionErrorBanner');
  if (banner) banner.remove();
  const accederBtn = document.getElementById('accederBtn');
  if (accederBtn) {
    accederBtn.disabled = false;
    accederBtn.title = '';
    accederBtn.classList.remove('disabled');
  }
}

// Monitor connectivity periodically and via browser online/offline events
function monitorConnectivity(pollInterval = 3000) {
  // avoid multiple monitors
  if (window.__cn_monitor_interval) return;

  // Handlers
  const goOnline = async () => {
    // Immediately assume online to update UI responsively,
    // then verify in background and revert if verification fails.
    try {
      hideConnectionError();
      // cancel any pending offline timers
      if (window.__cn_offline_timer) { clearTimeout(window.__cn_offline_timer); window.__cn_offline_timer = null; }
      const ok = await checkInternetConnection();
      if (!ok) {
        // If verification fails, wait a short grace period then show error if still failing
        if (window.__cn_offline_timer) clearTimeout(window.__cn_offline_timer);
        window.__cn_offline_timer = setTimeout(async () => {
          try {
            const stillOk = await checkInternetConnection();
            if (!stillOk) showConnectionError();
          } catch (e) { showConnectionError(); }
          window.__cn_offline_timer = null;
        }, 2000);
      }
    } catch (e) {
      showConnectionError();
    }
  };
  const goOffline = () => {
    showConnectionError();
  };

  // Listen to browser events for immediate feedback
  window.addEventListener('online', goOnline);
  window.addEventListener('offline', goOffline);

  // Initial quick sync using navigator.onLine for immediate UI update
  if (!navigator.onLine) {
    showConnectionError();
  } else {
    // run a connectivity check immediately but do not block
    (async () => { try { const ok = await checkInternetConnection(); if (!ok) showConnectionError(); else hideConnectionError(); } catch (e) { showConnectionError(); } })();
  }

  // periodic polling to correct edge cases
  window.__cn_monitor_interval = setInterval(async () => {
    try {
      const ok = await checkInternetConnection();
      if (ok) hideConnectionError(); else showConnectionError();
    } catch (e) {
      showConnectionError();
    }
  }, pollInterval);
}

function updateUI() {
  if (state.isRunning) {
    startBtn.disabled = true;
    stopBtn.disabled = false;
    statusDot.className = 'status-dot running';
    statusText.textContent = 'En ejecución';
    // insertion controls depend on CSV presence and insertion state
    const hasCsv = !!(state.csvContent || state.csvPath);
          if (!hasCsv || !state.selectedForm) {
          startInsertBtn.disabled = true;
          pauseInsertBtn.disabled = true;
          stopInsertBtn.disabled = true;
        } else {
      if (state.insertion.mode === 'idle') {
        startInsertBtn.disabled = false;
        pauseInsertBtn.disabled = true;
        stopInsertBtn.disabled = true;
      } else if (state.insertion.mode === 'inserting') {
        startInsertBtn.disabled = true;
        pauseInsertBtn.disabled = false;
        stopInsertBtn.disabled = false;
      } else if (state.insertion.mode === 'paused') {
        startInsertBtn.disabled = false; // resume
        pauseInsertBtn.disabled = true;
        stopInsertBtn.disabled = false;
      }
      // insertion buttons enabled per mode
    }
  } else {
    startBtn.disabled = false;
    stopBtn.disabled = true;
    // when stopped, insertion controls disabled
    startInsertBtn.disabled = true;
    pauseInsertBtn.disabled = true;
    stopInsertBtn.disabled = true;
    // clear selection highlight on form buttons
    try { if (form3561Btn) form3561Btn.classList.remove('selected'); if (form3562Btn) form3562Btn.classList.remove('selected'); } catch (e) {}
    statusDot.className = 'status-dot stopped';
    statusText.textContent = 'Detenido';
  }
  processedCount.textContent = state.stats.processed;
  successCount.textContent = state.stats.success;
  failedCount.textContent = state.stats.failed;
}

function updateStats(processed, success, failed) {
  state.stats.processed = processed;
  state.stats.success = success;
  state.stats.failed = failed;
  updateUI();
}

function setupEventListeners() {
  // CSV selector: try dialog first, fallback to file input
  fileNameDisplay.addEventListener('click', async () => {
    try {
      const api = window.__TAURI__;
      if (!api || !api.dialog) {
        csvFileInput.click();
        return;
      }
      const selected = await api.dialog.open({ 
        multiple: false, 
        filters: [{ name: 'CSV', extensions: ['csv'] }] 
      });
      if (!selected) return;
      
      state.csvPath = selected;
      const fname = selected.split(/\\|\//).pop();
      fileNameDisplay.textContent = fname;
      fileNameDisplay.classList.add('selected');
      startBtn.disabled = false;
      addLog(`Archivo seleccionado: ${fname}`, 'info');
      if (state.isRunning) {
        try {
          await api.invoke('load_csv_path', { path: selected });
          state.insertion.mode = 'idle';
          updateUI();
        } catch (e) {
          addLog('Error al cargar CSV en backend: ' + e.message, 'error');
        }
      }
    } catch (err) {
      console.warn('Dialog failed, using input fallback:', err);
      csvFileInput.click();
    }
  });

  // CSV file input: read and write to temp
  csvFileInput.addEventListener('change', async (e) => {
    const api = window.__TAURI__;
    const file = e.target.files[0];
    if (!file) return;
    
    try {
      const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
      
      if (isExcel) {
        // For Excel files, send the path to the backend for it to handle
        // Read as binary and convert to base64 for transmission
        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        state.csvContent = `EXCEL_BASE64:${base64}:${file.name}`;
      } else {
        // For CSV files, read as text
        const text = await file.text();
        state.csvContent = text;
      }
      
      state.csvPath = null;
      const displayName = file.name;
      fileNameDisplay.textContent = displayName;
      fileNameDisplay.classList.add('selected');
      addLog(`Archivo cargado en memoria: ${displayName}`, 'info');
      // enable startInsert only if automation is running
      if (state.isRunning) {
        try {
          await api.invoke('load_csv_content', { csv: state.csvContent });
          state.insertion.mode = 'idle';
          updateUI();
        } catch (e) {
          addLog('Error al enviar archivo al backend: ' + e.message, 'error');
        }
      }
    } catch (err) {
      console.error('Error reading/writing file:', err);
      addLog('Error al procesar el archivo', 'error');
    }
  });

  // Start button
  startBtn.addEventListener('click', async () => {
      // allow starting without CSV; arg will be empty string if none provided
    try {
      startBtn.disabled = true;
      addLog('Iniciando automatización...', 'info');
      const api = window.__TAURI__;
      if (!api || !api.invoke) {
        throw new Error('Tauri invoke no disponible');
      }
      // If we have CSV content in memory, send it as the argument; otherwise send the path
      let arg = state.csvContent ? state.csvContent : (state.csvPath ? state.csvPath : '');
      // Send both camelCase and snake_case keys for compatibility
      const result = await api.invoke('start_automation', { csvArg: arg, csv_arg: arg });
      state.isRunning = true;
      state.insertion.mode = 'idle';
      updateUI();
      addLog(String(result), 'success');
    } catch (error) {
      console.error('Start error:', error);
      addLog(`Error: ${error.message || error}`, 'error');
      startBtn.disabled = false;
    }
  });

  

  // Stop button
  stopBtn.addEventListener('click', async () => {
    try {
      stopBtn.disabled = true;
      addLog('Deteniendo automatización...', 'warning');
      const api = window.__TAURI__;
      if (!api || !api.invoke) {
        throw new Error('Tauri invoke no disponible');
      }
      const result = await api.invoke('stop_automation');
      state.isRunning = false;
      state.insertion.mode = 'idle';
      updateUI();
      addLog(String(result), 'info');
    } catch (error) {
      console.error('Stop error:', error);
      addLog(`Error: ${error.message || error}`, 'error');
      stopBtn.disabled = false;
    }
  });

  // Insertion controls
  startInsertBtn.addEventListener('click', async () => {
    try {
      addLog('Solicitando inicio de inserción...', 'info');
      const api = window.__TAURI__;
      // If a form was selected, use the form-specific command
      if (state.selectedForm) {
        addLog(`Iniciando inserción para formulario ${state.selectedForm}...`, 'info');
        const res = await api.invoke('insert_start_with_form', { form: state.selectedForm });
        if (res === 'command-sent') {
          state.insertion.mode = 'inserting';
          updateUI();
        }
      } else {
        const res = await api.invoke('insert_start');
        if (res === 'command-sent') {
          state.insertion.mode = 'inserting';
          updateUI();
        }
      }
    } catch (e) {
      addLog('Error al solicitar inicio de inserción', 'error');
    }
  });

  pauseInsertBtn.addEventListener('click', async () => {
    try {
      addLog('Solicitando pausa de inserción...', 'info');
      const api = window.__TAURI__;
      const res = await api.invoke('insert_pause');
      if (res === 'command-sent') {
        state.insertion.mode = 'paused';
        updateUI();
      }
    } catch (e) {
      addLog('Error al solicitar pausa de inserción', 'error');
    }
  });

  stopInsertBtn.addEventListener('click', async () => {
    try {
      addLog('Solicitando detención de inserción...', 'warning');
      const api = window.__TAURI__;
      const res = await api.invoke('insert_stop');
      if (res === 'command-sent') {
        state.insertion.mode = 'idle';
        updateUI();
      }
    } catch (e) {
      addLog('Error al solicitar detención de inserción', 'error');
    }
  });

  // Note: single-row Insert 807 button removed; all insertion handled via Iniciar Inserción

  // Clear logs
  clearLogsBtn.addEventListener('click', () => {
    logsContainer.innerHTML = '';
    addLog('Logs limpiados', 'info');
  });

  // (logs settings modal removed)

  // Form selection buttons
  if (form3561Btn) {
    form3561Btn.addEventListener('click', async () => {
      state.selectedForm = '3561';
      addLog('Formulario seleccionado: 3561', 'info');
      // Visual highlight
      try {
        if (form3561Btn) {
          form3561Btn.classList.add('selected');
          form3561Btn.classList.add('selected-3561');
        }
        if (form3562Btn) {
          form3562Btn.classList.remove('selected');
          form3562Btn.classList.remove('selected-3562');
        }
      } catch (e) {}
      // Mostrar la sección principal de automatización
      try { const main = document.getElementById('automationMain'); if (main) main.style.display = ''; } catch (e) {}
      updateUI();
    });
  }
  if (form3562Btn) {
    form3562Btn.addEventListener('click', async () => {
      state.selectedForm = '3562';
      addLog('Formulario seleccionado: 3562', 'info');
      try {
        if (form3562Btn) {
          form3562Btn.classList.add('selected');
          form3562Btn.classList.add('selected-3562');
        }
        if (form3561Btn) {
          form3561Btn.classList.remove('selected');
          form3561Btn.classList.remove('selected-3561');
        }
      } catch (e) {}
      try { const main = document.getElementById('automationMain'); if (main) main.style.display = ''; } catch (e) {}
      updateUI();
    });
  }

  // When automation view loads, ensure main section hidden until a form is chosen
  try { const main = document.getElementById('automationMain'); if (main && !state.selectedForm) main.style.display = 'none'; } catch (e) {}
  // Ensure any previous per-form selected classes are cleared if none selected
  try { if (!state.selectedForm) { if (form3561Btn) { form3561Btn.classList.remove('selected','selected-3561'); } if (form3562Btn) { form3562Btn.classList.remove('selected','selected-3562'); } } } catch (e) {}
  
    // Back button: return to dashboard and reattach openAutomation handler
    if (backBtn) {
      backBtn.addEventListener('click', async () => {
        try {
          const ok = await loadView('dashboard');
          if (!ok) { addLog('No se pudo cargar dashboard', 'error'); return; }
          // attach dashboard handlers (open automation, logout)
          attachDashboardHandlers();
        } catch (e) {
          addLog('Error al volver al dashboard: ' + (e.message || e), 'error');
        }
      });
    }
}

async function checkStatus() {
  try {
    const api = window.__TAURI__;
    if (!api || !api.invoke) return;
    const status = await api.invoke('get_automation_status');
    state.isRunning = status === 'running';
    updateUI();
  } catch (e) {
    console.error('Status check error:', e);
  }
  setTimeout(checkStatus, 2000);
}

// Listen for automation logs
async function setupLogsListener() {
  try {
    const api = window.__TAURI__;
    if (!api || !api.event || !api.event.listen) {
      console.warn('Tauri event API not available');
      return;
    }
    await api.event.listen('automation-log', (event) => {
      try {
        const payload = event.payload;
        console.debug('automation-log event received (raw):', event);
        console.debug('automation-log payload:', payload);
        let msg = payload;
        if (typeof payload === 'string') {
          try {
            msg = JSON.parse(payload);
          } catch (_) {}
        }
        
        if (msg && typeof msg === 'object' && msg.type === 'stats') {
          const p = typeof msg.processed !== 'undefined' ? msg.processed : (msg.meta && msg.meta.processed) || 0;
          const s = typeof msg.success !== 'undefined' ? msg.success : (msg.meta && msg.meta.success) || 0;
          const f = typeof msg.failed !== 'undefined' ? msg.failed : (msg.meta && msg.meta.failed) || 0;
          console.debug('Parsed stats -> processed:', p, 'success:', s, 'failed:', f);
          updateStats(p, s, f);
        }
        // handle insertion state logs
        if (msg && typeof msg === 'object' && msg.type === 'insertion') {
          const m = (msg.message || '').toLowerCase();
          if (m.includes('pausa')) state.insertion.mode = 'paused';
          else if (m.includes('reanud') || m.includes('inici')) state.insertion.mode = 'inserting';
          else if (m.includes('deten') || m.includes('finaliz')) state.insertion.mode = 'idle';
          updateUI();
        }
        // Show UI alert when backend signals completion
        if (msg && typeof msg === 'object' && msg.type === 'ui_alert') {
          const text = msg.message || 'Operación completada';
          addLog(text, 'success');
          try { alert(text); } catch (e) {}
          // Also reset CSV selection and buttons
          state.csvPath = null;
          state.csvContent = null;
          try { fileNameDisplay.textContent = 'Ningún archivo seleccionado'; fileNameDisplay.classList.remove('selected'); } catch (e) {}
          startInsertBtn.disabled = true;
          pauseInsertBtn.disabled = true;
          stopInsertBtn.disabled = true;
          updateUI();
        }
          // Reset CSV selection when backend signals completion
          if (msg && typeof msg === 'object' && msg.type === 'ui_reset' && (msg.message === 'reset_csv' || (msg.meta && msg.meta.path))) {
            addLog('Restableciendo selección de CSV tras finalización', 'info');
            state.csvPath = null;
            state.csvContent = null;
            try { fileNameDisplay.textContent = 'Ningún archivo seleccionado'; fileNameDisplay.classList.remove('selected'); } catch (e) {}
            // disable insertion controls until new CSV selected
            startInsertBtn.disabled = true;
            pauseInsertBtn.disabled = true;
            stopInsertBtn.disabled = true;
            updateUI();
          }
        
        const logMsg = typeof msg === 'object' ? (msg.message || JSON.stringify(msg)) : String(msg);
        const level = (msg && msg.level) || 'info';
        addLog(logMsg, level);
      } catch (e) {
        addLog('Log recibido (raw)', 'info');
      }
    });
  } catch (e) {
    console.warn('Event listener setup failed:', e);
  }
}

async function initApp() {
  console.log('Initializing app...');
  
  // Check internet connectivity before proceeding
  const hasInternet = await checkInternetConnection();
  if (!hasInternet) {
    console.warn('No internet connection detected');
  }
  
  // Rehydrate Supabase session if present
  try {
    const url = window.SUPABASE_URL || '';
    const key = window.SUPABASE_ANON_KEY || '';
    const sessRaw = localStorage.getItem('supabase_session');
    if (url && key) {
      if (!window.supabaseClient) {
        try {
          const mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm');
          window.supabaseClient = mod.createClient(url, key);
          console.debug('supabase client inicializado (rehydrate)', { url });
        } catch (e) {
          console.warn('No se pudo inicializar Supabase dinámicamente:', e);
        }
      }
      if (sessRaw && window.supabaseClient && window.supabaseClient.auth && typeof window.supabaseClient.auth.setSession === 'function') {
        try {
          const sess = JSON.parse(sessRaw);
          await window.supabaseClient.auth.setSession(sess);
          addLog('Sesión restaurada desde localStorage', 'info');
        } catch (e) {
          console.warn('No se pudo restaurar sesión:', e);
          localStorage.removeItem('supabase_session');
        }
      }
    }
  } catch (e) {
    console.warn('Rehydrate supabase failed:', e);
  }

  // Load the home/login view first
  const ok = await loadView('home');
  if (!ok) {
    addLog('No se pudo cargar la pantalla inicial', 'error');
    return;
  }
  // Start monitoring connectivity (polling + online/offline events)
  try { monitorConnectivity(); } catch (e) { console.warn('monitorConnectivity failed', e); }
  
  // Show connection error if internet is unavailable
  if (!hasInternet) {
    showConnectionError();
  }

  // Hide dev-only UI unless in development environment
  try {
    const isDev = (window.CN_ENV === 'development') || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!isDev) {
      const devEl = document.querySelector('.dev-info');
      if (devEl) devEl.remove();
    }
  } catch (e) { /* ignore */ }

  // Listen for server-side session revocation events dispatched by SessionsClient
  try {
    window.addEventListener('cn-session-revoked', async (ev) => {
      try {
        const sid = ev && ev.detail && ev.detail.sessionId;
        addLog('La sesión ha sido revocada en el servidor. Cerrando sesión...', 'warning');
        alert('Tu sesión ha sido cerrada desde otro dispositivo. Serás desconectado.');
        try { localStorage.removeItem('supabase_session'); } catch (e) {}
        try { localStorage.removeItem('cn_session_id'); } catch (e) {}
        try { if (window.SessionsClient) window.SessionsClient.stopHeartbeat(); } catch (e) {}
        try { await loadView('home'); attachHomeHandlers(); } catch (e) { console.warn('Error loading home after revoke', e); }
      } catch (e) { console.warn('cn-session-revoked handler error', e); }
    });
  } catch (e) {}
  
  // Attach home handlers so they can be reattached after view reloads
  attachHomeHandlers();
}

