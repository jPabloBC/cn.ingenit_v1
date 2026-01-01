// Minimal update checker (polling) - free option
// Configuration: set window.UPDATE_CHECK_URL to the full URL of your latest.json
// latest.json should be: { "version": "1.2.3", "url": "https://.../download" }
(function(){
  const DEFAULT_REMOTE = '/latest.json';
  const CHECK_INTERVAL_MS = 1000 * 60 * 60; // 1 hour

  async function fetchJson(url) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) { return null; }
  }

  function parseVersion(v){
    if (!v) return [0];
    return String(v).split('.').map(n => parseInt(n||'0',10));
  }
  function isRemoteNewer(localV, remoteV){
    const a = parseVersion(localV);
    const b = parseVersion(remoteV);
    for (let i=0;i<Math.max(a.length,b.length);i++){
      const ai = a[i]||0, bi = b[i]||0;
      if (bi>ai) return true;
      if (bi<ai) return false;
    }
    return false;
  }

  function showBanner(remote){
    try{
      if (document.getElementById('updateBanner')) return; // already shown
      const banner = document.createElement('div');
      banner.id = 'updateBanner';
      banner.style.position = 'fixed';
      banner.style.left = '0';
      banner.style.right = '0';
      banner.style.top = '0';
      banner.style.zIndex = '9999';
      banner.style.background = '#073642';
      banner.style.color = '#fff';
      banner.style.padding = '10px 12px';
      banner.style.display = 'flex';
      banner.style.alignItems = 'center';
      banner.style.justifyContent = 'space-between';
      banner.style.boxShadow = '0 2px 6px rgba(0,0,0,0.2)';
      banner.innerHTML = `
          <div style="font-weight:600">Nueva versión disponible: ${remote.version}</div>
          <div style="display:flex;gap:8px;align-items:center">
            <button id="updateDismissBtn" style="background:transparent;border:1px solid rgba(255,255,255,0.2);color:#fff;padding:6px 8px;border-radius:4px;">Cerrar</button>
            <a id="updateActionLink" href="#" style="background:#2aa198;border:none;color:#062f2b;padding:6px 10px;border-radius:4px;font-weight:600;text-decoration:none;display:inline-block;">Descargar</a>
          </div>
        `;
        document.body.appendChild(banner);
        document.getElementById('updateDismissBtn').onclick = () => { banner.remove(); };
        // configure link href/target to avoid popup blockers
        try {
          const link = document.getElementById('updateActionLink');
          const url = (remote && remote.url) ? remote.url : (window.UPDATE_DOWNLOAD_URL || window.UPDATE_CHECK_URL || DEFAULT_REMOTE);
          link.href = url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
        } catch (e) {
          console.warn('Could not set download link', e);
        }
    }catch(e){ console.warn('showBanner error', e); }
  }

  async function checkOnce(){
    try{
      // Read local version from /version.json
      const localObj = await fetchJson('/version.json');
      const localV = (localObj && localObj.version) ? localObj.version : '0.0.0';

      // If local is a prerelease (contains a hyphen like -beta), skip notifying
      // unless explicitly overridden by window.ALLOW_PRERELEASE_UPDATE_CHECK
      if (String(localV).includes('-') && !window.ALLOW_PRERELEASE_UPDATE_CHECK) {
        console.log('Local version is prerelease; skipping update banner (local:', localV, ')');
        return;
      }

      // remote URL configurable via window.UPDATE_CHECK_URL
      const remoteUrl = window.UPDATE_CHECK_URL || DEFAULT_REMOTE;
      const remoteObj = await fetchJson(remoteUrl);
      if (!remoteObj || !remoteObj.version) return;
      if (isRemoteNewer(localV, remoteObj.version)) showBanner(remoteObj);
    }catch(e){ console.warn('update check failed', e); }
  }

  // Expose manual trigger
  window.checkForUpdatesNow = checkOnce;

  // Initial check after DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { checkOnce(); setInterval(checkOnce, CHECK_INTERVAL_MS); });
  } else {
    checkOnce(); setInterval(checkOnce, CHECK_INTERVAL_MS);
  }
})();

// Update any `.version` placeholders in views with the current local version
(async function updateDisplayedVersion(){
  try{
    const resp = await fetch('/version.json', { cache: 'no-cache' });
    if (!resp.ok) return;
    const j = await resp.json();
    const v = j && j.version ? j.version : null;
    if (!v) return;
    const apply = () => {
      const els = document.querySelectorAll('.version');
      els.forEach(e => { e.textContent = `v${v} | Local Automation`; });
    };
    // Apply immediately if possible
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply); else apply();

    // Watch for dynamically added .version elements (views are loaded later)
    try {
      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.type === 'childList' && m.addedNodes && m.addedNodes.length) {
            for (const n of m.addedNodes) {
              if (!(n instanceof HTMLElement)) continue;
              if (n.classList && n.classList.contains('version')) {
                n.textContent = `v${v} | Local Automation`;
              }
              // also update any .version descendants
              const found = n.querySelectorAll && n.querySelectorAll('.version');
              if (found && found.length) {
                found.forEach(el => el.textContent = `v${v} | Local Automation`);
              }
            }
          }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    } catch (e) { /* ignore observer errors */ }
  }catch(e){ /* ignore */ }
})();
