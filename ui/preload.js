// Preload script: ensure Tauri API is available to app.js
// This runs in the context before any other scripts

if (!window.__TAURI__) {
  // Create a promise that resolves when Tauri API is injected
  window.__tauriReady = new Promise((resolve) => {
    const checkApi = () => {
      if (window.__TAURI__) {
        console.log('[preload] Tauri API ready:', Object.keys(window.__TAURI__).join(', '));
        resolve(window.__TAURI__);
      } else {
        setTimeout(checkApi, 50);
      }
    };
    checkApi();
  });
} else {
  window.__tauriReady = Promise.resolve(window.__TAURI__);
  console.log('[preload] Tauri API already available');
}
