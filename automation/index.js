const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const XLSX = require('xlsx');
const { Readable } = require('stream');
const { checkLicense } = require('./license');
const { humanDelay, randomDelay, humanClick, humanType, fastType } = require('./utils');

// (moved) helper defined above near imports

// Log critical environment info on startup
console.error('DEBUG: NODE_ENV =', process.env.NODE_ENV);
console.error('DEBUG: PLAYWRIGHT_BROWSERS_PATH =', process.env.PLAYWRIGHT_BROWSERS_PATH);
console.error('DEBUG: LOCALAPPDATA =', process.env.LOCALAPPDATA);
console.error('DEBUG: Current working directory:', process.cwd());
console.error('DEBUG: __dirname:', __dirname);

// Configuración: perfil persistente en carpeta de sistema por plataforma
const APP_NAME = 'CN IngenIT';
function profilePath() {
  const home = require('os').homedir();
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', APP_NAME, 'profile');
  }
  if (process.platform === 'win32') {
    const appdata = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(appdata, APP_NAME, 'profile');
  }
  // Linux / other
  return path.join(home, '.' + APP_NAME.replace(/\s+/g, '-').toLowerCase(), 'profile');
}

const TARGET_URL = 'https://homer.sii.cl/'; // Página principal
// URL final del formulario al que hay que llegar (puede incluir path). Si no se define,
// por defecto intentamos usar la misma TARGET_URL.
const TARGET_FORM_URL = process.env.TARGET_FORM_URL || TARGET_URL;

async function ensureOnForm(page) {
  // Intentar acceder primero a la home
  emitLog('info','step',`Navegando a inicio: ${TARGET_URL}`);
  try {
    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 20000 });
  } catch (e) {
    emitLog('warning','step',`No se pudo cargar inicio: ${e.message}`);
  }

  // Intentar ir directamente al formulario
  if (TARGET_FORM_URL !== TARGET_URL) {
    emitLog('info','step',`Intentando navegar al formulario: ${TARGET_FORM_URL}`);
    try {
      await page.goto(TARGET_FORM_URL, { waitUntil: 'networkidle', timeout: 15000 });
    } catch (e) {
      emitLog('warning','step',`No se pudo navegar directamente al formulario: ${e.message}`);
    }
  }

  // Si la URL actual no es la del formulario, hacer una espera corta y devolver false
  // para que el llamador pueda decidir entrar en modo manual persistente.
  if (!page.url().startsWith(TARGET_FORM_URL)) {
    emitLog('warning','step',`No se alcanzó la URL de formulario. URL actual: ${page.url()}`);
    emitLog('info','step','Espera de 30s para login manual si es necesario...');
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1000));
      if (page.url().startsWith(TARGET_FORM_URL)) break;
    }
    if (!page.url().startsWith(TARGET_FORM_URL)) {
      emitLog('warning','step',`No se pudo alcanzar la URL del formulario tras esperar. URL actual: ${page.url()}`);
      return false;
    }
  }
  emitLog('info','step',`Formulario accesible en: ${page.url()}`);
  return true;
}

function emitLog(level, type, message, meta = {}) {
  const payload = { level, type, message, ts: new Date().toISOString(), meta };
  // Make stats fields available at root for the UI which expects them there
  try {
    if (type === 'stats' && meta && typeof meta === 'object') {
      if (typeof meta.processed !== 'undefined') payload.processed = meta.processed;
      if (typeof meta.success !== 'undefined') payload.success = meta.success;
      if (typeof meta.failed !== 'undefined') payload.failed = meta.failed;
    }
  } catch (e) {
    // ignore
  }
  try {
    process.stdout.write(JSON.stringify(payload) + '\n');
  } catch (e) {
    console.log(JSON.stringify(payload));
  }
}

class FormAutomation {
  constructor(csvPath) {
    this.csvPath = csvPath;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.running = false;
    this.inserting = false;
    this.paused = false;
    this.rows = null;
    this.currentIndex = 0;
    this.processed = 0; // total processed (success + failed)
    this.success = 0;
    this.failed = 0;
    this.lastUsedCsvPath = null;
    this.lastInsertionCompleted = false;
    // If currentIndex is already past the end (previous run finished), reset to 0 to allow re-run
    if (this.currentIndex >= (this.rows ? this.rows.length : 0)) {
      this.currentIndex = 0;
    }
    this._resumeWait = null;
    this.awaitingConfirmation = false;
  }

  async initialize() {
    emitLog('info','step','Verificando licencia...');
    const licenseValid = await checkLicense();
    if (!licenseValid) {
      emitLog('error','step','Licencia inválida');
      throw new Error('Licencia inválida');
    }

    // Validate and log Playwright browsers location
    const pbPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
    if (pbPath) {
      const pbExists = fs.existsSync(pbPath);
      console.error(`DEBUG: PLAYWRIGHT_BROWSERS_PATH set to: ${pbPath}`);
      console.error(`DEBUG:   - exists: ${pbExists}`);
      if (pbExists) {
        const contents = fs.readdirSync(pbPath);
        console.error(`DEBUG:   - contents: ${contents.join(', ')}`);
      }
    } else {
      console.error('DEBUG: PLAYWRIGHT_BROWSERS_PATH is NOT set');
    }

    const PROFILE_PATH = profilePath();
    emitLog('info','step','Perfil persistente en', { path: PROFILE_PATH });

    // path para guardar storageState (cookies/localStorage) en caso de fallback
    this.storagePath = path.join(PROFILE_PATH, 'storageState.json');

    if (!fs.existsSync(PROFILE_PATH)) {
      fs.mkdirSync(PROFILE_PATH, { recursive: true });
    }

      try {
        emitLog('info','step',`Intentando lanzar navegador con perfil persistente: ${PROFILE_PATH}`);
        try {
          // Intentar usar el Chrome/Chromium del sistema si existe (canal 'chrome')
          this.browser = await chromium.launchPersistentContext(PROFILE_PATH, {
            headless: false,
            channel: 'chrome',
            slowMo: 0,
            viewport: null,
            args: [
              '--disable-blink-features=AutomationControlled',
              '--no-sandbox'
            ]
          });
          emitLog('info','step','Navegador (persistent) lanzado con canal system chrome');
        } catch (channelErr) {
          emitLog('warning','step',`Canal 'chrome' no disponible o falló: ${channelErr.message}; reintentando sin canal`);
            this.browser = await chromium.launchPersistentContext(PROFILE_PATH, {
              headless: false,
              slowMo: 0,
              viewport: null,
              args: [
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox'
              ]
            });
        }
        // launchPersistentContext devuelve un BrowserContext
        this.context = this.browser;
        emitLog('info','step','Navegador (persistent) lanzado correctamente');
      } catch (e) {
      const msg = (e && e.message) ? e.message : String(e);
      emitLog('warning','step',`Falló launchPersistentContext: ${msg}`);
      if (msg.includes('ProcessSingleton') || msg.includes('SingletonLock')) {
        emitLog('warning','step','Perfil en uso. Creando perfil temporal y reintentando...');
        const os = require('os');
        const tmpDir = path.join(os.tmpdir(), `form-automation-profile-${Date.now()}`);
          try {
          fs.mkdirSync(tmpDir, { recursive: true });
          try {
            this.browser = await chromium.launchPersistentContext(tmpDir, {
              headless: false,
              channel: 'chrome',
              slowMo: 0,
              viewport: null,
              args: [
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox'
              ]
            });
            emitLog('info','step',`Usando perfil temporal con canal chrome: ${tmpDir}`, { path: tmpDir });
          } catch (chErr) {
            emitLog('warning','step',`Canal 'chrome' no disponible para perfil temporal: ${chErr.message}; reintentando sin canal`);
            this.browser = await chromium.launchPersistentContext(tmpDir, {
              headless: false,
              slowMo: 0,
              viewport: null,
              args: [
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox'
              ]
            });
          }
          this.context = this.browser;
          emitLog('info','step',`Usando perfil temporal: ${tmpDir}`, { path: tmpDir });
        } catch (ee) {
          emitLog('warning','step',`Fallo al crear perfil temporal: ${ee.message}; intentando lanzar navegador sin perfil...`);
          try {
            try {
              const browserStandalone = await chromium.launch({ headless: false, channel: 'chrome', slowMo: 0, args: ['--disable-blink-features=AutomationControlled','--no-sandbox'] });
              this.browser = browserStandalone;
            } catch (chErr) {
              emitLog('warning','step',`Canal 'chrome' no disponible para standalone: ${chErr.message}; reintentando sin canal`);
              const browserStandalone = await chromium.launch({ headless: false, slowMo: 0, args: ['--disable-blink-features=AutomationControlled','--no-sandbox'] });
              this.browser = browserStandalone;
            }
            // browserStandalone is a Browser; create a context that can load storageState if exists
            const ctxOptions = { viewport: null };
            if (fs.existsSync(this.storagePath)) ctxOptions.storageState = this.storagePath;
            this.context = await this.browser.newContext(ctxOptions);
            emitLog('info','step','Navegador (standalone) lanzado correctamente (context con storageState si existía)');
          } catch (eee) {
            emitLog('error','step',`Fallo al lanzar navegador standalone: ${eee.message}`);
            throw e;
          }
        }
      } else {
        // If not a profile lock error, try launching a standalone browser as fallback
        try {
          try {
              const browserStandalone = await chromium.launch({ headless: false, channel: 'chrome', slowMo: 0, args: ['--disable-blink-features=AutomationControlled','--no-sandbox'] });
            this.browser = browserStandalone;
          } catch (chErr) {
            emitLog('warning','step',`Canal 'chrome' no disponible para standalone: ${chErr.message}; reintentando sin canal`);
              const browserStandalone = await chromium.launch({ headless: false, slowMo: 0, args: ['--disable-blink-features=AutomationControlled','--no-sandbox'] });
            this.browser = browserStandalone;
          }
          const ctxOptions = { viewport: null };
          if (fs.existsSync(this.storagePath)) ctxOptions.storageState = this.storagePath;
          this.context = await this.browser.newContext(ctxOptions);
          emitLog('info','step','Navegador (standalone) lanzado correctamente (context con storageState si existía)');
        } catch (eee) {
          emitLog('error','step',`Fallo al lanzar navegador standalone: ${eee.message}`);
          throw e;
        }
      }
    }

    // Ensure we have a page: prefer this.context (BrowserContext) to create pages
    try {
      if (!this.context && this.browser && typeof this.browser.newContext === 'function') {
        // create a context and load storageState if exists
        const ctxOptions = {};
        if (fs.existsSync(this.storagePath)) ctxOptions.storageState = this.storagePath;
        this.context = await this.browser.newContext(ctxOptions);
      }
      if (!this.context && this.browser && typeof this.browser.newPage === 'function') {
        // older code path: browser is a BrowserContext
        this.context = this.browser;
      }
      // Prefer an existing useful page (restored session). Reuse about:blank and
      // navigate it immediately to TARGET_FORM_URL to avoid a visible about:blank flash.
      try {
        const existingPages = (this.context && typeof this.context.pages === 'function') ? this.context.pages() : [];
        let pageToUse = null;
        // 1) Prefer a page already at the target URL
        for (const p of existingPages) {
          try {
            const u = p.url();
            if (u && u.startsWith(TARGET_FORM_URL)) { pageToUse = p; break; }
          } catch (e) {}
        }
        // 2) If not found, prefer an about:blank page and navigate it immediately
        if (!pageToUse) {
          for (const p of existingPages) {
            try {
              const u = p.url();
              if (!u || u === 'about:blank') { pageToUse = p; break; }
            } catch (e) {}
          }
        }

        if (pageToUse) {
          try {
            // Navigate the reused page to the target as soon as possible
            await pageToUse.goto(TARGET_FORM_URL, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
            this.page = pageToUse;
          } catch (e) {
            try { await pageToUse.close(); } catch (ee) {}
            this.page = await this.context.newPage();
            await this.page.goto(TARGET_FORM_URL, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
          }
        } else {
          // No reusable page: create one and navigate immediately to reduce blank flash
          this.page = await this.context.newPage();
          try { await this.page.goto(TARGET_FORM_URL, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}); } catch (e) {}
        }
      } catch (e) {
        // Fallback: create a new page if anything fails
        try { this.page = await this.context.newPage(); await this.page.goto(TARGET_FORM_URL, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}); } catch (ee) { throw ee; }
      }
      emitLog('info','step','Página creada en el navegador correctamente');
      emitLog('info','step','Navegador iniciado correctamente');
    } catch (e) {
      emitLog('error','step',`Fallo al crear página en el navegador: ${e.message}`);
      throw e;
    }
  }

  async readCSV() {
    return new Promise((resolve, reject) => {
      const rows = [];
      if (!fs.existsSync(this.csvPath)) {
        reject(new Error(`CSV no encontrado: ${this.csvPath}`));
        return;
      }
      // If the file is an Excel workbook, parse first sheet to JSON
      const ext = path.extname(this.csvPath).toLowerCase();
      if (ext === '.xlsx' || ext === '.xls') {
        try {
          const wb = XLSX.readFile(this.csvPath);
          const sheet = wb.SheetNames && wb.SheetNames[0];
          if (!sheet) return resolve([]);
          const data = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { defval: '' });
          return resolve(data);
        } catch (e) {
          return reject(e);
        }
      }

      // Detect separator from a small sample of the file (handles ";" in Windows locales)
      try {
        const sample = fs.readFileSync(this.csvPath, { encoding: 'utf8' }).slice(0, 64 * 1024);
        const sep = detectSeparatorFromString(sample);
        emitLog('debug','step',`Usando separador '${sep}' para CSV: ${this.csvPath}`);
        // first attempt
        fs.createReadStream(this.csvPath)
          .pipe(csv({ separator: sep }))
          .on('data', (row) => rows.push(row))
          .on('end', () => {
            // If parsing produced rows but each row has a single key, retry with opposite separator
            if (rows.length > 0) {
              const keys = Object.keys(rows[0] || {});
              if (keys.length === 1) {
                const otherSep = sep === ',' ? ';' : ',';
                emitLog('debug','step',`Parsed single-column with '${sep}', retrying with '${otherSep}'`);
                const rows2 = [];
                fs.createReadStream(this.csvPath)
                  .pipe(csv({ separator: otherSep }))
                  .on('data', (r) => rows2.push(r))
                  .on('end', () => resolve(rows2.length ? rows2 : rows))
                  .on('error', () => resolve(rows));
                return;
              }
            }
            resolve(rows);
          })
          .on('error', reject);
      } catch (e) {
        // fallback to default parser
        fs.createReadStream(this.csvPath)
          .pipe(csv())
          .on('data', (row) => rows.push(row))
          .on('end', () => resolve(rows))
          .on('error', reject);
      }
    });
  }

  async loadRowsFromContent(content) {
    return new Promise((resolve, reject) => {
      const rows = [];
      try {
        // Detect separator from content and parse
        const sep = detectSeparatorFromString(content);
        const s = Readable.from([content]);
        s.pipe(csv({ separator: sep }))
          .on('data', (row) => rows.push(row))
          .on('end', () => {
            if (rows.length > 0) {
              const keys = Object.keys(rows[0] || {});
              if (keys.length === 1) {
                const otherSep = sep === ',' ? ';' : ',';
                emitLog('debug','step',`Content parsed single-column with '${sep}', retrying with '${otherSep}'`);
                const rows2 = [];
                const s2 = Readable.from([content]);
                s2.pipe(csv({ separator: otherSep }))
                  .on('data', (r) => rows2.push(r))
                  .on('end', () => resolve(rows2.length ? rows2 : rows))
                  .on('error', (e) => reject(e));
                return;
              }
            }
            resolve(rows);
          })
          .on('error', (e) => reject(e));
      } catch (e) {
        reject(e);
      }
    });
  }

// Heuristic: inspect first non-empty line and choose ';' if more semicolons than commas
function detectSeparatorFromString(str) {
  if (!str || typeof str !== 'string') return ',';
  // remove BOM and trim leading whitespace
  if (str.charCodeAt(0) === 0xFEFF) str = str.slice(1);
  const lines = str.split(/\r?\n/);
  let first = '';
  for (const l of lines) {
    if (l && l.trim()) { first = l; break; }
  }
  if (!first) return ',';
  const commaCount = (first.match(/,/g) || []).length;
  const semiCount = (first.match(/;/g) || []).length;
  return semiCount > commaCount ? ';' : ',';
}

  async processRow(rowData, index) {
    emitLog('info','step',`Procesando fila ${index + 1}`, { index });
    try {
      // Assume already at the form; minimal delay before interacting
      await randomDelay(10, 30);

      if (rowData.nombre) {
        await fastType(this.page, 'input[name="nombre"]', rowData.nombre);
      }
      if (rowData.email) {
        await fastType(this.page, 'input[name="email"]', rowData.email);
      }
      if (rowData.telefono) {
        await fastType(this.page, 'input[name="telefono"]', rowData.telefono);
      }
      // Module-specific fields (807-813, selects, Agregar) were extracted to form modules.
      // If you need the original behavior for form 3561, create automation/forms/form3561.js
      emitLog('debug','step',`Fallback processRow: no form-specific fields processed for fila ${index + 1}`);
      return true;
    } catch (error) {
      emitLog('error','error',`Fila ${index + 1} falló: ${error.message}`, { index });
      return false;
    }
  }

  async start() {
    this.running = true;
    try {
      await this.initialize();
      // Navigate once to the form (handle login/redirects) before processing rows
      const formReady = await ensureOnForm(this.page);
      if (!formReady) {
        emitLog('warning','error','No autenticado o formulario inaccesible; entrando en modo manual persistente. Por favor, haga login manual en la ventana del navegador. Esperaré detección automática.');
      }
      // Load CSV rows (if any) but do NOT auto-process—enter manual mode.
      if (this.csvPath) {
        try {
          this.rows = await this.readCSV();
          emitLog('info','step',`CSV cargado: ${this.rows.length} filas`, { count: this.rows.length });
        } catch (e) {
          emitLog('warning','step',`No se pudo leer CSV: ${e.message}`);
          this.rows = [];
        }
      } else {
        this.rows = [];
      }

      emitLog('info','manual','Entrando en modo manual: esperando comandos de inserción');
      this._manualPromise = new Promise((resolve) => { this._manualResolve = resolve; });
      // Detección automática del formulario en segundo plano mientras estamos en modo manual
      const detectPromise = (async () => {
        while (true) {
          await new Promise((r) => setTimeout(r, 3000));
          try {
            if (this.page && this.page.url && this.page.url().startsWith(TARGET_FORM_URL)) {
              emitLog('info','manual','Login/formulario detectado automáticamente.');
              return 'detected';
            }
          } catch (e) {
            // ignore
          }
        }
      })();

      const race = await Promise.race([detectPromise, this._manualPromise]);
      if (race === 'detected') {
        emitLog('info','manual','Formulario accesible — permanece en modo manual hasta iniciar inserción o detener.');
      }
      // Esperar resolución explícita para finalizar (stop() llamará a _manualResolve)
      if (this._manualPromise) await this._manualPromise;
      emitLog('info','manual','Saliendo de modo manual');
    } catch (error) {
      emitLog('error','error',`Error en automatización: ${error.message}`);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  async beginInsertion() {
    if (this.inserting) return;
    // Prevent starting same CSV twice
    if (this.csvPath && this.csvPath === this.lastUsedCsvPath && this.lastInsertionCompleted) {
      // mark that we're awaiting user confirmation to re-run the same CSV
      this.awaitingConfirmation = true;
      emitLog('debug','ipc',`awaitingConfirmation set true for path: ${this.csvPath}`);
      emitLog('warning','ui','file_already_used', { path: this.csvPath });
      return;
    }
    this.inserting = true;
    this.paused = false;
    this.processed = 0;
    this.success = 0;
    this.failed = 0;
    this.lastInsertionCompleted = false;
    // If no rows are loaded yet, wait a short time for the UI to send CSV (avoid immediate stop)
    if ((!this.rows || this.rows.length === 0) && this.inserting) {
      emitLog('info','insertion','No hay filas cargadas: esperando hasta 10s por filas antes de iniciar...');
      const deadline = Date.now() + 10000;
      while ((!this.rows || this.rows.length === 0) && Date.now() < deadline && this.inserting) {
        await new Promise((r) => setTimeout(r, 500));
      }
      if ((!this.rows || this.rows.length === 0) && this.inserting) {
        emitLog('warning','insertion','No se recibieron filas para insertar tras esperar. Abortando inicio de inserción.');
        this.inserting = false;
        // Notify UI that insertion did not start
        emitLog('info','ui_buttons','update', { startEnabled: true, pauseEnabled: false, stopEnabled: false });
        return;
      }
    }

    // Verify that the expected form UI is present before processing rows.
    try {
      // Look for a known container used by the existing automation
      const SECTION_SELECTOR = '.fw-seccionFormulario';
      let found = false;
      try {
        const cnt = await this.page.locator(SECTION_SELECTOR).count();
        if (cnt && cnt > 0) found = true;
      } catch (e) {
        found = false;
      }
      // Wait a short time for the form UI to appear if not yet found
      const startWait = Date.now();
      const waitTimeout = 10000;
      while (!found && Date.now() - startWait < waitTimeout) {
        await new Promise(r => setTimeout(r, 500));
        try {
          const cnt2 = await this.page.locator(SECTION_SELECTOR).count();
          if (cnt2 && cnt2 > 0) { found = true; break; }
        } catch (e) {}
      }
      if (!found) {
        emitLog('warning','insertion',`No se detectó la estructura del formulario en la página. Manteniendo navegador abierto para navegación manual.`);
        emitLog('info','ui_alert','No se detectó el formulario. Por favor navegue manualmente y reintente.');
        // Do not proceed with insertion; keep browser open and reset inserting flag
        this.inserting = false;
        emitLog('info','ui_buttons','update', { startEnabled: true, pauseEnabled: false, stopEnabled: false });
        return;
      }
    } catch (e) {
      // if any error when checking, abort to avoid false-positive processing
      emitLog('warning','insertion',`Error comprobando la presencia del formulario: ${e.message}`);
      this.inserting = false;
      emitLog('info','ui_buttons','update', { startEnabled: true, pauseEnabled: false, stopEnabled: false });
      return;
    }
    // Notify UI: start disabled, pause/stop enabled
    emitLog('info','ui_buttons','update', { startEnabled: false, pauseEnabled: true, stopEnabled: true });
    // Try to load a form-specific module if a form was selected (e.g. automation/forms/form3561.js)
    let formModule = null;
    try {
      if (this.selectedForm) {
        try {
          formModule = require(path.join(__dirname, 'forms', `form${String(this.selectedForm)}.js`));
          emitLog('info','step',`Módulo de formulario cargado: form${this.selectedForm}`);
        } catch (e) {
          emitLog('debug','step',`No existe módulo específico para form${this.selectedForm}: ${e.message}`);
          formModule = null;
        }
      }
    } catch (e) { formModule = null; }

    while (this.currentIndex < (this.rows ? this.rows.length : 0) && this.inserting) {
      if (this.paused) {
        // wait until resumed
        await new Promise((resolve) => { this._resumeWait = resolve; });
      }
      const row = this.rows[this.currentIndex];
      let success = false;
      if (formModule && typeof formModule.processRow === 'function') {
        try {
          success = await formModule.processRow(this.page, row, this.currentIndex, { emitLog, fastType, randomDelay });
        } catch (e) {
          emitLog('error','insertion',`form module error: ${e.message}`);
          success = false;
        }
      } else {
        const internal = this.processRow.bind(this);
        success = await internal(row, this.currentIndex);
      }
      if (success) this.success++; else this.failed++;
      this.processed = this.success + this.failed;
      this.currentIndex++;
      // emit stats update (processed, success, failed at root via emitLog special-case)
      emitLog('info','stats','', { processed: this.processed, success: this.success, failed: this.failed });
      // extra debug emission to help frontend debugging
      emitLog('debug','stats_debug',`stats emitted`, { processed: this.processed, success: this.success, failed: this.failed });
      if (this.inserting && this.currentIndex < this.rows.length) await randomDelay(50, 150);
    }
    this.inserting = false;
    emitLog('info','done',`Inserción finalizada: ${this.processed} éxitos, ${this.failed} fallos`, { processed: this.processed, failed: this.failed });
    // Mark last used CSV and that insertion completed
    if (this.csvPath) {
      this.lastUsedCsvPath = this.csvPath;
      this.lastInsertionCompleted = true;
    }
    // Notify UI: all inserted alert and update buttons (disable pause/stop, enable start)
    emitLog('info','ui_alert','Se insertaron todos los datos del CSV');
    emitLog('info','ui_buttons','update', { startEnabled: true, pauseEnabled: false, stopEnabled: false });
    // Attempt to remove temp CSV if it was a tmp file and then clear selection state
    try {
      const os = require('os');
      const tmpdir = os.tmpdir();
      const csvPathToClear = this.csvPath;
      if (csvPathToClear) {
        // If the CSV was created in temp dir by the launcher, remove it
        try {
          const bn = path.basename(csvPathToClear);
          if (csvPathToClear.indexOf(tmpdir) === 0 && bn.startsWith('form-automation-')) {
            try { fs.unlinkSync(csvPathToClear); emitLog('info','step',`Temp CSV eliminado: ${csvPathToClear}`); } catch (e) { emitLog('warning','step',`No se pudo eliminar temp CSV: ${e.message}`); }
          }
        } catch (e) {}
      }
      // Clear selection/state so UI can reset
      this.csvPath = null;
      this.rows = [];
      this.currentIndex = 0;
      emitLog('info','ui_reset','reset_csv', { path: csvPathToClear });
    } catch (e) {
      // ignore
    }
  }

  pauseInsertion() {
    if (!this.inserting) return;
    this.paused = true;
    emitLog('info','insertion','Inserción en pausa');
    // Notify UI: pause now inactive, start/stop accordingly
    emitLog('info','ui_buttons','update', { startEnabled: false, pauseEnabled: false, stopEnabled: true });
  }

  async resumeInsertion() {
    if (!this.inserting) {
      // start from currentIndex
      this.beginInsertion().catch(e => emitLog('error','error',`Error al iniciar inserción: ${e.message}`));
      return;
    }
    this.paused = false;
    if (this._resumeWait) {
      try { this._resumeWait(); } catch (e) {}
      this._resumeWait = null;
    }
    // If rows are not yet loaded, wait a short time for them (e.g., after load_csv_content)
    if (!this.rows || this.rows.length === 0) {
      emitLog('info','insertion','No hay filas cargadas: esperando hasta 10s por filas...');
      const deadline = Date.now() + 10000;
      while ((!this.rows || this.rows.length === 0) && Date.now() < deadline && this.inserting) {
        await new Promise((r) => setTimeout(r, 500));
      }
      if (!this.rows || this.rows.length === 0) {
        emitLog('warning','insertion','No se recibieron filas para insertar tras esperar. Abortando inicio de inserción.');
        this.inserting = false;
        return;
      }
    }
    emitLog('info','insertion','Inserción reanudada');
  }

  stopInsertion() {
    if (!this.inserting && !this.paused) return;
    this.inserting = false;
    this.paused = false;
    if (this._resumeWait) {
      try { this._resumeWait(); } catch (e) {}
      this._resumeWait = null;
    }
    emitLog('info','insertion','Inserción detenida por comando');
    // Notify UI: after stop, enable start, disable pause/stop
    emitLog('info','ui_buttons','update', { startEnabled: true, pauseEnabled: false, stopEnabled: false });
  }

  async stop() {
    emitLog('info','step','Deteniendo automatización...');
    this.running = false;
    // If in manual wait, resolve it so start() can finish
    if (this._manualResolve) {
      try { this._manualResolve(); } catch (e) {}
      this._manualResolve = null;
    }
    await this.cleanup();
  }

  async cleanup() {
    try {
      // Guardar storageState para restaurar sesión en futuros inicios
      const ctxToSave = this.context || (this.browser && typeof this.browser.storageState === 'function' ? this.browser : null);
      if (ctxToSave && typeof ctxToSave.storageState === 'function') {
        try {
          await ctxToSave.storageState({ path: this.storagePath });
          emitLog('info','step',`StorageState guardado en ${this.storagePath}`);
        } catch (e) {
          emitLog('warning','step',`No se pudo guardar storageState: ${e.message}`);
        }
      }
    } catch (e) {
      // ignore
    }
    if (this.browser) {
      try { await this.browser.close(); } catch (e) {}
      this.browser = null;
    }
    emitLog('info','step','Recursos liberados');
  }
}

// Señales
let automation = null;
process.on('SIGINT', async () => {
  emitLog('info','step','Recibida señal de interrupción');
  if (automation) await automation.stop();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  emitLog('info','step','Recibida señal de terminación');
  if (automation) await automation.stop();
  process.exit(0);
});

// Listen for stdin commands (JSON lines)
function handleCommand(cmd) {
  try {
    const obj = typeof cmd === 'string' ? JSON.parse(cmd) : cmd;
    if (!automation) {
      emitLog('warning','ipc','Comando recibido pero automation no inicializada');
      return;
    }
    const c = obj.cmd;
    if (c === 'start_insertion') {
      // Accept optional form identifier and store it for the run
      try {
        const formId = obj.form || null;
        if (formId) {
          automation.selectedForm = String(formId);
          emitLog('info','ipc',`start_insertion recibido para form=${automation.selectedForm}`);
        }
      } catch (e) {}
      if (automation.awaitingConfirmation) {
        emitLog('warning','ipc','start_insertion ignorado: esperando confirmación del usuario');
        return;
      }
      automation.resumeInsertion();
    } else if (c === 'pause_insertion') {
      automation.pauseInsertion();
    } else if (c === 'stop_insertion') {
      automation.stopInsertion();
    } else if (c === 'resume_after_confirm') {
      if (automation.awaitingConfirmation) {
        emitLog('debug','ipc','resume_after_confirm recibido: procediendo a iniciar inserción');
        automation.awaitingConfirmation = false;
        try { automation.beginInsertion(); } catch (e) { emitLog('error','ipc',`resume_after_confirm error: ${e.message}`); }
      } else {
        emitLog('warning','ipc','resume_after_confirm recibido pero no se esperaba confirmación');
      }
    } else if (c === 'cancel_after_confirm') {
      if (automation.awaitingConfirmation) {
        automation.awaitingConfirmation = false;
        emitLog('debug','ipc','cancel_after_confirm recibido: se canceló la re-ejecución');
        // Inform UI to re-enable start
        emitLog('info','ui_buttons','update', { startEnabled: true, pauseEnabled: false, stopEnabled: false });
      } else {
        emitLog('warning','ipc','cancel_after_confirm recibido pero no se esperaba confirmación');
      }
    } else {
      emitLog('warning','ipc',`Comando desconocido: ${c}`);
    }
    if (c === 'load_csv_content') {
      const csvText = obj.csv || '';
      automation.loadRowsFromContent(csvText)
        .then((rows) => {
          automation.rows = rows;
          automation.currentIndex = 0;
          automation.lastInsertionCompleted = false;
          emitLog('info','step',`CSV cargado: ${rows.length} filas (currentIndex reiniciado)`, { count: rows.length });
        })
        .catch((e) => emitLog('error','ipc',`load_csv_content failed: ${e.message}`));
    } else if (c === 'load_csv_path') {
      const p = obj.path || '';
      automation.csvPath = p;
      automation.readCSV()
        .then((rows) => {
          automation.rows = rows;
          automation.currentIndex = 0;
          automation.lastInsertionCompleted = false;
          emitLog('info','step',`CSV cargado desde path: ${rows.length} filas (currentIndex reiniciado)`, { count: rows.length, path: p });
        })
        .catch((e) => emitLog('error','ipc',`load_csv_path failed: ${e.message}`));
    }
  } catch (e) {
    emitLog('error','ipc',`Error parseando comando stdin: ${e.message}`);
  }
}

// setup stdin stream
if (process.stdin && process.stdin.setEncoding) {
  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line) handleCommand(line);
    }
  });
  process.stdin.on('end', () => {
    if (buffer.trim()) handleCommand(buffer.trim());
  });
}

async function main() {
  const csvPath = process.argv[2] || '';
  automation = new FormAutomation(csvPath);

  // Start the automation background flow (initialization + manual detection)
  automation.start().catch((error) => {
    emitLog('error','error',`Fallo crítico en background start: ${error.message}`);
    process.exit(1);
  });

  // If a CSV path was provided as arg, wait for the browser/page to be ready,
  // load the CSV and run insertion automatically until completion.
  if (csvPath) {
    try {
      const waitForReady = async (timeoutMs = 30000) => {
        const start = Date.now();
        while (!automation.page) {
          if (Date.now() - start > timeoutMs) throw new Error('Timeout esperando navegador listo');
          await new Promise(r => setTimeout(r, 500));
        }
      };
      await waitForReady(30000);

      // Load CSV rows and reset index
      const rows = await automation.readCSV();
      automation.rows = rows;
      automation.currentIndex = 0;
      emitLog('info','step',`CSV cargado desde path: ${rows.length} filas (auto)`, { count: rows.length, path: csvPath });

      // Begin insertion and wait until it finishes
      await automation.beginInsertion();

      // After insertion complete, stop automation gracefully
      await automation.stop();
      emitLog('info','done','Inserción automática completada');
      process.exit(0);
    } catch (e) {
      emitLog('error','error',`Error en inserción automática: ${e.message}`);
      try { await automation.stop(); } catch (_) {}
      process.exit(1);
    }
  } else {
    // No CSV path provided: keep the background start() running (manual mode)
    // start() will keep the process alive until stop() is called.
  }
}

if (require.main === module) {
  main();
}
