// Renderer integration for Tauri Updater (minimal)
// Dynamically imports @tauri-apps/api from CDN when available (works in dev).
// Listens for updater events and shows a simple modal/banner to the user.

(async function(){
  // Only run when Tauri API is available
  try {
    if (!window.__TAURI__) return;
    const mod = await import('https://cdn.jsdelivr.net/npm/@tauri-apps/api/+esm');
    const { updater, event } = mod;

    function showNativeBanner(title, msg, actions = []){
      try{
        if (document.getElementById('tauriUpdateBanner')) return;
        const banner = document.createElement('div');
        banner.id = 'tauriUpdateBanner';
        banner.style.position = 'fixed';
        banner.style.bottom = '12px';
        banner.style.right = '12px';
        banner.style.zIndex = '10000';
        banner.style.background = '#0b6b6b';
        banner.style.color = '#fff';
        banner.style.padding = '12px';
        banner.style.borderRadius = '8px';
        banner.style.boxShadow = '0 6px 18px rgba(0,0,0,0.15)';
        banner.innerHTML = `<div style="font-weight:700;margin-bottom:6px">${title}</div><div style="margin-bottom:8px">${msg}</div><div id="tauriUpdateActions" style="display:flex;gap:8px"></div>`;
        document.body.appendChild(banner);
        const actionsContainer = document.getElementById('tauriUpdateActions');
        actions.forEach(a => {
          const el = document.createElement(a.tag || 'button');
          el.textContent = a.label;
          if (a.tag === 'a') {
            el.href = a.href || '#';
            el.target = a.target || '_blank';
            el.style.textDecoration = 'none';
            el.style.background = '#2aa198';
            el.style.color = '#062f2b';
            el.style.borderRadius = '6px';
            el.style.padding = '6px 10px';
            el.style.fontWeight = '600';
          } else {
            el.onclick = a.onClick || (()=>{});
            el.style.background = a.primary ? '#2aa198' : 'transparent';
            el.style.color = a.primary ? '#062f2b' : '#fff';
            el.style.border = a.primary ? 'none' : '1px solid rgba(255,255,255,0.2)';
            el.style.padding = '6px 8px';
            el.style.borderRadius = '6px';
          }
          actionsContainer.appendChild(el);
        });
      } catch (e) { console.warn('showNativeBanner failed', e); }
    }

    // Event handlers
    try {
      event.listen('tauri://update-available', async (r) => {
        showNativeBanner('Actualización disponible', 'Hay una nueva versión lista para descargar.', [
          { label: 'Instalar ahora', primary: true, onClick: async () => { try { await updater.installUpdate(); } catch(e){ console.error(e); } } },
          { label: 'Cerrar', onClick: () => { const b = document.getElementById('tauriUpdateBanner'); if (b) b.remove(); } }
        ]);
      });

      event.listen('tauri://update-not-available', () => {
        console.log('No hay actualizaciones disponibles');
      });

      event.listen('tauri://update-error', (e) => {
        console.warn('Updater error', e);
      });

      event.listen('tauri://update-download-progress', (p) => {
        console.log('Download progress', p);
      });

      event.listen('tauri://updated', () => {
        showNativeBanner('Actualización instalada', 'La aplicación se actualizó. Reinicia para aplicar cambios.', [
          { label: 'Reiniciar', primary: true, onClick: async () => { try { await mod.app.relaunch(); } catch(e){ console.error(e); } } }
        ]);
      });
    } catch (e) {
      console.warn('Could not attach updater events', e);
    }

    // Expose manual trigger
    window.tauriCheckForUpdates = async function(){
      try { const res = await updater.checkUpdate(); return res; } catch(e){ console.warn('checkUpdate failed', e); throw e; }
    };

  } catch (e) {
    // Not fatal — running outside Tauri or CDN blocked
    console.warn('tauri-updater init failed or not running in Tauri:', e);
  }
})();
