/* Admin shell: authentication, authorisation, data store, routing, shared helpers. */
(function () {
  'use strict';
  const { qs, qsa, escapeHtml: e } = EF.utils;
  const ui = EF.ui;
  const api = EF.api;

  const NAV = [
    { id: 'overview', label: 'Dashboard', icon: 'layout-dashboard' },
    { id: 'players', label: 'Players', icon: 'users' },
    { id: 'registrations', label: 'Registrations', icon: 'user-check', badge: (s) => s.players.filter((p) => p.status === 'pending').length },
    { id: 'fixtures', label: 'Fixtures', icon: 'calendar-days' },
    { id: 'results', label: 'Results', icon: 'goal', badge: (s) => s.matches.filter((m) => m.status === 'live').length },
    { id: 'points', label: 'Point Table', icon: 'list-ordered' },
    { id: 'rules', label: 'Rules', icon: 'book-open' },
    { id: 'news', label: 'News & Notices', icon: 'newspaper' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
  ];

  const state = {
    session: null,
    profile: null,
    tournament: null,
    players: [],
    matches: [],
    adjustments: [],
    standings: [],
  };

  const admin = {
    NAV,
    state,
    modules: {},
    current: 'overview',
    lastMutation: 0,
  };

  /* ---------------- Module registry & helpers ---------------- */
  admin.register = (id, mod) => { admin.modules[id] = mod; };
  admin.go = (id) => { location.hash = `#/${id}`; };

  admin.approvedPlayers = () => state.players
    .filter((p) => p.status === 'approved')
    .sort((a, b) => a.player_name.localeCompare(b.player_name));

  admin.playerById = (id) => state.players.find((p) => p.id === id) || null;

  admin.playerOptions = (placeholder = 'Select a player') => [
    { value: '', label: placeholder },
    ...admin.approvedPlayers().map((p) => ({ value: p.id, label: `${p.player_name} (${p.team_name})` })),
  ];

  /** Run a write, show feedback, then reload data and re-render the view. */
  admin.mutate = async function (fn, { success, button, label = 'Saving' } = {}) {
    if (button) ui.setLoading(button, true, label);
    admin.lastMutation = Date.now();
    try {
      await fn();
      if (success) ui.toast(success, 'success');
      await admin.refresh();
      return true;
    } catch (err) {
      console.error(err);
      ui.toast(api.friendlyError(err), 'error');
      return false;
    } finally {
      if (button && button.isConnected) ui.setLoading(button, false);
    }
  };

  admin.stat = (icon, label, value, meta = '', tone = '') => `
    <div class="stat-tile ${tone ? `stat-tile--${tone}` : ''}">
      <div class="stat-tile__icon">${ui.icon(icon, '')}</div>
      <p class="stat-tile__value">${e(value)}</p>
      <p class="stat-tile__label">${e(label)}</p>
      ${meta ? `<p class="text-xs text-muted mt-1.5 truncate">${e(meta)}</p>` : ''}
    </div>`;

  admin.panelHead = (title, subtitle = '', actions = '') => `
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
      <div class="min-w-0">
        <h2 class="font-display text-lg font-bold uppercase tracking-wide text-white">${e(title)}</h2>
        ${subtitle ? `<p class="text-xs text-muted mt-0.5">${e(subtitle)}</p>` : ''}
      </div>
      ${actions ? `<div class="flex flex-wrap gap-2 shrink-0">${actions}</div>` : ''}
    </div>`;

  /** Checkbox used for row selection in admin tables. */
  admin.check = (attrs, checked = false, label = 'Select') => `
    <label class="ef-check"><input type="checkbox" ${attrs} ${checked ? 'checked' : ''} aria-label="${e(label)}"><span></span></label>`;

  /** Sticky bar shown while rows are selected. `actions` is trusted HTML. */
  admin.bulkBar = (count, actions) => (count ? `
    <div class="bulk-bar" role="region" aria-label="Bulk actions">
      <span class="bulk-bar__count"><b>${count}</b> selected</span>
      <div class="bulk-bar__actions">${actions}
        <button type="button" class="btn btn-ghost btn-xs" data-bulk="clear">${ui.icon('x', '')}Clear</button>
      </div>
    </div>` : '');

  admin.searchInput = (id, placeholder, value = '') => `
    <div class="relative flex-1 min-w-[200px]">
      <span class="input-icon">${ui.icon('search', '')}</span>
      <label for="${id}" class="sr-only">${e(placeholder)}</label>
      <input id="${id}" type="search" class="input has-icon" placeholder="${e(placeholder)}" value="${e(value)}" autocomplete="off">
    </div>`;

  /* ---------------- Data ---------------- */
  admin.reload = async function () {
    const tournament = await api.admin.getTournament();
    state.tournament = tournament;
    if (!tournament) {
      Object.assign(state, { players: [], matches: [], adjustments: [], standings: [] });
    } else {
      const [players, matches, adjustments] = await Promise.all([
        api.admin.listPlayers(tournament.id),
        api.getMatches(tournament.id),
        api.admin.listAdjustments(tournament.id),
      ]);
      state.players = players;
      state.matches = api.attachPlayers(matches, players);
      state.adjustments = adjustments;
      state.standings = EF.standings.compute({
        players: players.filter((p) => p.status === 'approved'),
        matches,
        adjustments,
        tournament,
      });
    }
    renderChrome();
  };

  admin.refresh = async function () {
    try {
      await admin.reload();
    } catch (err) {
      console.error(err);
      ui.toast(api.friendlyError(err), 'error');
    }
    renderView();
  };

  /* ---------------- Chrome ---------------- */
  function renderChrome() {
    const nav = qs('#admin-nav');
    nav.innerHTML = NAV.map((n) => {
      const count = n.badge ? n.badge(state) : 0;
      return `
        <a href="#/${n.id}" class="side-link ${admin.current === n.id ? 'is-active' : ''}" ${admin.current === n.id ? 'aria-current="page"' : ''}>
          ${ui.icon(n.icon, '')}<span>${e(n.label)}</span>
          ${count ? `<span class="side-link__badge" aria-label="${count} need attention">${count}</span>` : ''}
        </a>`;
    }).join('');

    const t = state.tournament;
    qs('#topbar-status').innerHTML = t ? `
      <span class="badge ${t.is_published ? 'badge--approved' : 'badge--neutral'}">${ui.icon(t.is_published ? 'globe' : 'eye-off', '')}${t.is_published ? 'Published' : 'Draft'}</span>
      <span class="badge ${t.registration_open ? 'badge--upcoming' : 'badge--neutral'}">${ui.icon(t.registration_open ? 'door-open' : 'lock', '')}${t.registration_open ? 'Registration open' : 'Registration closed'}</span>`
      : '<span class="badge badge--pending">No tournament</span>';

    qs('#admin-email').textContent = (state.profile && state.profile.email) || (state.session && state.session.user.email) || '—';
    ui.icons();
  }

  function renderView() {
    const view = qs('#admin-view');
    const mod = admin.modules[admin.current];
    const navItem = NAV.find((n) => n.id === admin.current);

    qs('#view-title').textContent = (mod && mod.title) || (navItem && navItem.label) || 'Dashboard';
    qs('#view-subtitle').textContent = state.tournament
      ? `${state.tournament.name}${state.tournament.season ? ` · ${state.tournament.season}` : ''}`
      : 'Create a tournament to get started';
    qsa('.side-link', qs('#admin-nav')).forEach((a) => {
      const active = a.getAttribute('href') === `#/${admin.current}`;
      a.classList.toggle('is-active', active);
      if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });

    if (!state.tournament && !['settings', 'news'].includes(admin.current)) {
      view.innerHTML = `<div class="glass">${ui.state.empty({
        icon: 'trophy',
        title: 'No tournament yet',
        message: 'Create your tournament in Settings. Players, fixtures and the point table are managed per tournament.',
        action: '<a href="#/settings" class="btn btn-primary btn-sm"><i data-lucide="plus"></i>Create tournament</a>',
      })}</div>`;
      ui.icons();
      return;
    }

    try {
      // A fresh host per render so module event listeners never accumulate.
      const host = document.createElement('div');
      view.replaceChildren(host);
      mod.render(host, state);
    } catch (err) {
      console.error(err);
      view.innerHTML = `<div class="glass">${ui.state.error({ message: 'This section failed to render. Refresh the page and try again.', retry: false })}</div>`;
    }
    ui.icons();
  }

  /** Re-render the current module from in-memory state (no network). */
  admin.rerender = () => renderView();

  function route() {
    const id = location.hash.replace(/^#\/?/, '') || 'overview';
    admin.current = admin.modules[id] ? id : 'overview';
    setSidebar(false);
    renderView();
    qs('#admin-view').focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }

  function setSidebar(open) {
    qs('#admin-sidebar').classList.toggle('is-open', open);
    qs('.admin-overlay').classList.toggle('is-open', open);
  }

  /* ---------------- Auth flow ---------------- */
  function show(section) {
    qs('#admin-boot').hidden = section !== 'boot';
    qs('#admin-login').hidden = section !== 'login';
    qs('#admin-app').hidden = section !== 'app';
  }

  /** Local mode with no admin yet: the login screen becomes "create admin account". */
  const isSetupMode = () => EF.backend === 'local' && EF.local && !EF.local.hasAdmin();
  const usesUsername = () => EF.backend === 'local' && EF.local && EF.local.usesUsername();

  function applyLoginMode() {
    const creating = isSetupMode();
    qs('#login-title').textContent = creating ? 'Create Admin Account' : 'Admin Sign In';
    qs('#login-intro').textContent = creating
      ? 'First-time setup: choose the email and password you will use to manage this tournament. Stored securely (hashed) in this browser.'
      : 'Restricted area. Authorised tournament administrators only.';
    qs('#confirm-field').hidden = !creating;
    const form = qs('#login-form');
    const byUsername = usesUsername();
    const idInput = form.elements.email;
    qs('label[for="login-email"]').textContent = byUsername ? 'Username' : 'Email address';
    idInput.type = byUsername ? 'text' : 'email';
    idInput.placeholder = byUsername ? 'admin' : 'admin@yourdomain.com';
    idInput.autocapitalize = 'off';
    idInput.spellcheck = false;
    const icon = idInput.parentElement.querySelector('.input-icon');
    if (icon) { icon.innerHTML = ui.icon(byUsername ? 'user' : 'mail', ''); ui.icons(); }
    form.elements.password.setAttribute('autocomplete', creating ? 'new-password' : 'current-password');
    const submit = form.querySelector('[data-submit]');
    if (!submit.disabled) submit.innerHTML = `${ui.icon(creating ? 'user-plus' : 'log-in', '')}${creating ? 'Create Account' : 'Sign In'}`;
  }

  function showLogin(message, type = 'error') {
    show('login');
    applyLoginMode();
    const form = qs('#login-form');
    ui.formAlert(form, message || null, type);
    if (!EF.isConfigured) {
      ui.formAlert(form, api.MESSAGES.NOT_CONFIGURED, 'error');
      form.querySelector('[data-submit]').disabled = true;
    }
    ui.icons();
  }

  let unwatch = null;

  async function enter(session) {
    show('boot');
    let allowed = false;
    try {
      allowed = await api.isAdmin();
    } catch (err) {
      console.error(err);
      await api.signOut();
      showLogin(api.friendlyError(err));
      return;
    }
    if (!allowed) {
      await api.signOut();
      showLogin('This account is not authorised to access the admin panel.');
      return;
    }

    state.session = session;
    try { state.profile = await api.admin.getProfile(session.user.id); } catch (_) { state.profile = null; }

    try {
      await admin.reload();
    } catch (err) {
      console.error(err);
      ui.toast(api.friendlyError(err), 'error');
    }
    show('app');
    route();

    if (!unwatch) {
      unwatch = api.watch({
        key: 'admin',
        tables: ['players', 'matches', 'point_adjustments', 'tournaments', 'news_posts'],
        onChange: onRemoteChange,
      });
    }
  }

  /** Realtime change from another device: refresh without clobbering edits in progress. */
  async function onRemoteChange() {
    if (Date.now() - admin.lastMutation < 2000) return;
    const busy = document.querySelector('.ef-modal') || document.querySelector('#admin-view [data-dirty="true"]');
    try {
      await admin.reload();
    } catch (err) {
      console.error(err);
      return;
    }
    if (!busy) renderView();
  }

  function bindLogin() {
    const form = qs('#login-form');
    const submit = form.querySelector('[data-submit]');
    ui.liveClear(form);

    form.querySelector('[data-toggle-password]').addEventListener('click', (ev) => {
      const input = form.elements.password;
      const btn = ev.currentTarget;
      const visible = input.type === 'text';
      input.type = visible ? 'password' : 'text';
      btn.setAttribute('aria-label', visible ? 'Show password' : 'Hide password');
      btn.innerHTML = ui.icon(visible ? 'eye' : 'eye-off', '');
      ui.icons();
    });

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const values = ui.readForm(form);
      const creating = isSetupMode();
      const r = EF.utils.rules;
      const errors = EF.utils.validate(values, {
        email: usesUsername() ? [r.required('Username')] : [r.required('Email'), r.email()],
        password: creating
          ? [r.required('Password'), r.custom((v) => String(v).length >= 8, 'Use at least 8 characters.')]
          : [r.required('Password')],
        password_confirm: creating ? [r.custom((v, all) => v === all.password, 'Passwords do not match.')] : [],
      });
      if (Object.keys(errors).length) { ui.showErrors(form, errors); return; }
      ui.formAlert(form, null);
      ui.setLoading(submit, true, creating ? 'Creating account' : 'Signing in');
      try {
        if (creating) await EF.local.createAdmin(values.email, values.password);
        const session = await api.signIn(values.email, values.password);
        form.reset();
        await enter(session);
      } catch (err) {
        ui.formAlert(form, api.friendlyError(err));
      } finally {
        ui.setLoading(submit, false);
      }
    });
  }

  function bindShell() {
    qs('#login-brand').innerHTML = `${ui.logo(44)}<span class="font-display font-bold text-xl uppercase tracking-wider text-white">${e((window.EF_CONFIG || {}).SITE_NAME || 'Game Board')}</span>`;
    qs('#sidebar-brand').innerHTML = `${ui.logo(34)}<span class="min-w-0 leading-none"><span class="block font-display font-bold uppercase tracking-wider text-white truncate">Control Center</span><span class="block text-[10px] uppercase tracking-[.28em] text-neon mt-1">Admin</span></span>`;

    document.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-sidebar-open]')) setSidebar(true);
      if (ev.target.closest('[data-sidebar-close]')) setSidebar(false);
      if (ev.target.closest('[data-refresh]')) {
        const btn = ev.target.closest('[data-refresh]');
        btn.disabled = true;
        admin.refresh().then(() => { btn.disabled = false; ui.toast('Data refreshed.', 'info', { timeout: 2000 }); });
      }
    });

    qs('[data-sign-out]').addEventListener('click', async () => {
      const ok = await ui.confirm({ title: 'Sign out?', message: 'You will need to sign in again to manage the tournament.', confirmText: 'Sign out', tone: 'primary' });
      if (!ok) return;
      if (unwatch) { unwatch(); unwatch = null; }
      Object.assign(state, { session: null, profile: null, tournament: null, players: [], matches: [], adjustments: [], standings: [] });
      await api.signOut();
      showLogin('You have been signed out.', 'info');
    });

    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') setSidebar(false); });
    window.addEventListener('hashchange', () => { if (state.session) route(); });
  }

  admin.start = async function () {
    bindShell();
    bindLogin();
    ui.icons();

    if (!EF.isConfigured) { showLogin(); return; }

    api.onAuthChange((event) => {
      if (event === 'SIGNED_OUT' && state.session) {
        state.session = null;
        showLogin('Your session has ended. Please sign in again.', 'info');
      }
    });

    try {
      const session = await api.getSession();
      if (session) await enter(session);
      else showLogin();
    } catch (err) {
      console.error(err);
      showLogin(api.friendlyError(err));
    }
  };

  EF.admin = admin;

  // Start once every module script below has registered itself.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => admin.start());
  else setTimeout(() => admin.start(), 0);
})();
