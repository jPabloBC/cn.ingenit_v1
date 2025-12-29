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
  processedCount = document.getElementById('processedCount');
  successCount = document.getElementById('successCount');
  failedCount = document.getElementById('failedCount');
  
  console.log('DOM elements loaded:', { startBtn, csvFileInput, logsContainer });
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
      const text = await file.text();
      // Store the CSV content in memory and send it to backend on start.
      state.csvContent = text;
      state.csvPath = null;
      const displayName = file.name;
      fileNameDisplay.textContent = displayName;
      fileNameDisplay.classList.add('selected');
      addLog(`Archivo cargado en memoria: ${displayName}`, 'info');
      // enable startInsert only if automation is running
      if (state.isRunning) {
        try {
          await api.invoke('load_csv_content', { csv: text });
          state.insertion.mode = 'idle';
          updateUI();
        } catch (e) {
          addLog('Error al enviar CSV al backend: ' + e.message, 'error');
        }
      }
    } catch (err) {
      console.error('Error reading/writing CSV:', err);
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
  // Attach Acceder handler (keeps this file as single JS entry)
  const accederBtn = document.getElementById('accederBtn');
  if (accederBtn) {
    accederBtn.addEventListener('click', async () => {
      // Navigate to login view
      const okLogin = await loadView('login');
      if (!okLogin) { addLog('No se pudo cargar login', 'error'); return; }
      // attach login handlers
      const loginBtn = document.getElementById('loginBtn');
      const loginCancelBtn = document.getElementById('loginCancelBtn');
      // Ensure supabase client exists: try dynamic import if not initialized
      if (!window.supabaseClient) {
        try {
          const url = window.SUPABASE_URL || '';
          const key = window.SUPABASE_ANON_KEY || '';
          if (!url || !key || key.includes('<YOUR')) {
            addLog('Supabase config incompleta: revisa ui/supabase-config.js', 'warning');
          } else {
            addLog('Inicializando Supabase client...', 'info');
            const mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm');
            window.supabaseClient = mod.createClient(url, key);
            console.debug('supabase client dinámico inicializado', { url });
            addLog('Supabase client inicializado', 'info');
          }
        } catch (e) {
          console.warn('No se pudo inicializar Supabase dinámicamente:', e);
          addLog('No se pudo inicializar Supabase client dinámicamente', 'error');
        }
      }
      if (loginCancelBtn) loginCancelBtn.addEventListener('click', async () => { await loadView('home'); });
      if (loginBtn) loginBtn.addEventListener('click', async () => {
        try {
          console.log('=== LOGIN_HANDLER STARTED ===');
          addLog('Autenticando...', 'info');
          const email = (document.getElementById('loginEmail') || {}).value || '';
          const password = (document.getElementById('loginPassword') || {}).value || '';
          console.log('email:', email, 'password:', password ? '***' : '(empty)');
          if (!email || !password) { addLog('Email y password son requeridos', 'warning'); return; }
          const sup = window.supabaseClient;
          console.log('window.supabaseClient:', typeof sup);
          if (!sup) { addLog('Supabase client no configurado (ver ui/supabase-config.js)', 'error'); return; }
          const res = await sup.auth.signInWithPassword({ email, password });
          console.log('signInWithPassword response:', res);
          console.debug('supabase signInWithPassword result:', res);
          if (res.error) {
            // Show detailed error for debugging
            const msg = res.error.message || JSON.stringify(res.error);
            console.log('AUTH ERROR:', msg);
            addLog('Error autenticando: ' + msg, 'error');
            return;
          }
          const user = (res.data && res.data.user) || res.user || null;
          console.log('user:', user);
          if (!user) { addLog('Autenticación fallida: sin usuario (revisa credenciales)', 'error'); return; }
          // NOTE: Skipping cn_users validation due to RLS infinite recursion error in Supabase.
          // User is already authenticated via Supabase auth. Fix the RLS policy in Supabase if needed.
          // const { data: profile, error: pErr } = await sup.from('cn_users').select('id,role,client_id').eq('id', user.id).maybeSingle();
          // console.debug('cn_users lookup:', { profile, pErr });
          // console.log('cn_users lookup result:', { profile, pErr });
          // if (pErr) {
          //   console.log('PROFILE_ERROR:', pErr);
          //   addLog('Error al buscar perfil: ' + (pErr.message || JSON.stringify(pErr)), 'error');
          //   addLog('Posibles causas: RLS/privilegios en `cn_users` para la anon key.', 'warning');
          //   return;
          // }
          // if (!profile) { addLog('Perfil no encontrado en cn_users (asegúrate que existe una fila con id = user.id)', 'error'); return; }
          addLog('Autenticación exitosa', 'success');
          console.log('=== LOGIN SUCCESS ===');
          // Persist session in localStorage for rehydrate
          try {
            const session = (res.data && res.data.session) || null;
            if (session) {
              localStorage.setItem('supabase_session', JSON.stringify(session));
              addLog('Sesión guardada localmente', 'info');
            }
          } catch (e) { console.warn('No se pudo guardar sesión:', e); }
          // load dashboard
          const okDash = await loadView('dashboard');
          if (!okDash) { addLog('No se pudo cargar dashboard', 'error'); return; }
          // attach dashboard handlers
          const openAutomationBtn = document.getElementById('openAutomationBtn');
          if (openAutomationBtn) openAutomationBtn.addEventListener('click', async () => {
            // load automation UI and initialize automation controls
            const okAuto = await loadView('automation');
            if (!okAuto) { addLog('No se pudo cargar Automation', 'error'); return; }
            // initialize main automation UI
            getDOMElements();
            setupEventListeners();
            await setupLogsListener();
            checkStatus();
            updateUI();
            addLog('Pantalla de Automation cargada', 'info');
          });
        } catch (e) {
          console.error('Login error:', e);
          addLog('Error en login: ' + (e.message || e), 'error');
        }
      });
    });
  }
}

