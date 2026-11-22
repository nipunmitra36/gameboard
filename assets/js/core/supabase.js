/* Creates the configured data client: localStorage, Google Apps Script, or Supabase. */
(function () {
  'use strict';
  window.EF = window.EF || {};
  const cfg = window.EF_CONFIG || {};

  const url = String(cfg.SUPABASE_URL || '');
  const key = String(cfg.SUPABASE_ANON_KEY || '');
  const supabaseReady = /^https:\/\/.+/.test(url) && !url.includes('YOUR_') && key.length > 20 && !key.includes('YOUR_')
    && !!(window.supabase && window.supabase.createClient);

  const requestedBackend = String(cfg.BACKEND || 'local').toLowerCase();
  EF.backend = ['supabase', 'google_script'].includes(requestedBackend) ? requestedBackend : 'local';

  if (EF.backend === 'supabase') {
    EF.isConfigured = supabaseReady;
    EF.db = supabaseReady
      ? window.supabase.createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
      : null;
  } else if (EF.backend === 'google_script') {
    const scriptUrl = String(cfg.APPS_SCRIPT_URL || '').trim();
    EF.isConfigured = /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(scriptUrl)
      && typeof EF.createGoogleScriptClient === 'function';
    EF.db = EF.isConfigured ? EF.createGoogleScriptClient() : null;
  } else {
    EF.isConfigured = typeof EF.createLocalClient === 'function';
    EF.db = EF.isConfigured ? EF.createLocalClient() : null;
  }

  // Shared runtime state for the public site.
  EF.state = { tournament: undefined, data: null };
})();
