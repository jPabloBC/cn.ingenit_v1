// Supabase config for the renderer (edit these values before running the app)
// You can also inject these at build time or via a secure Tauri API.
window.SUPABASE_URL = window.SUPABASE_URL || 'https://juupotamdjqzpxuqdtco.supabase.co'; // e.g. https://xyzcompany.supabase.co
window.SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1dXBvdGFtZGpxenB4dXFkdGNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk3MDIyMTgsImV4cCI6MjA2NTI3ODIxOH0.8aXgTBg4vhs0DmTKPg9WGTvQ9hHBd_uCGHgt89ZfM_E'; // public anon key

// Minimal guard to avoid undefined errors
window.supabaseClient = window.supabaseClient || null;
