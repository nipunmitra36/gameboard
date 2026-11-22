/*
 * Runtime configuration.
 *
 * BACKEND
 *   'local'    — (default) everything is stored in this browser's localStorage.
 *                No SQL, no server, no setup. Data is per-browser: registrations
 *                made on another device will NOT reach the admin. Use the admin
 *                Settings page to export / import backups.
 *   'supabase' — shared online database. Run supabase/setup_all.sql once, then
 *                fill in SUPABASE_URL and SUPABASE_ANON_KEY below.
 *   'google_script' — shared Google Sheet through the bound Apps Script in
 *                google-apps-script/Code.gs. Deploy it as a web app first.
 *
 * ADMIN LOGIN (local mode)
 *   Admin page:  controlleradmin/index.html   (e.g. http://localhost:5500/controlleradmin/)
 *   Sign in with ADMIN_USERNAME + ADMIN_PASSWORD below. Change them here any time;
 *   the new values apply on the next login and old sessions are signed out.
 *   Note: in local mode this file is public, so anyone who opens it can read
 *   the password. That is acceptable only because local mode keeps all data in
 *   your own browser. Use Google Apps Script or Supabase for shared public data.
 *
 * The Supabase publishable/anon key is safe in the browser (RLS protects data).
 * NEVER put a secret / service_role key in this file.
 */
window.EF_CONFIG = {
  BACKEND: 'local',
  APPS_SCRIPT_URL: '',

  ADMIN_USERNAME: 'admin',
  ADMIN_PASSWORD: 'Admin@12345',

  // Name of the tournament created automatically on first visit (local mode).
  DEFAULT_TOURNAMENT_NAME: 'eFootball Tournament',

  SUPABASE_URL: 'https://psofagmxjcnjrthypgyi.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_hGqhvzpgryDEFO7csD_yJw_dV02b10J',

  // Brand shown in the header before tournament data loads.
  SITE_NAME: 'Game Board',

  // Background video for the home page hero.
  HERO_VIDEO: 'assets/img/Free Update Released on September 24, 2026.mp4',

  // Live updates (Supabase Realtime, or across tabs in local mode).
  REALTIME: true,
};
