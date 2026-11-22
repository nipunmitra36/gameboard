/*
 * Local database backend (browser localStorage).
 * Implements the subset of the Supabase client API this app uses, with the
 * same rules as the SQL schema: validation, unique emails/usernames, approved
 * players only in fixtures, completed matches need scores, append-only audit
 * log, and admin-only writes. Data lives in THIS browser only.
 */
(function () {
  'use strict';
  window.EF = window.EF || {};

  const DB_KEY = 'ef_local_db_v1';
  const SESSION_KEY = 'ef_local_session_v1';
  const TABLES = ['tournaments', 'players', 'matches', 'point_adjustments', 'admin_users'];
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  /* ---------------- storage ---------------- */
  const empty = () => ({ version: 1, tournaments: [], players: [], matches: [], point_adjustments: [], admin_users: [], accounts: [] });

  function read() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      const data = raw ? JSON.parse(raw) : null;
      if (data && typeof data === 'object') {
        TABLES.concat('accounts').forEach((t) => { if (!Array.isArray(data[t])) data[t] = []; });
        return data;
      }
      if (raw === null) return seedFresh();
    } catch (err) { console.warn('Local DB unreadable, starting fresh.', err); }
    return empty();
  }

  /** First visit in this browser: create a published tournament so Join works immediately. */
  function seedFresh() {
    const data = empty();
    const cfg = window.EF_CONFIG || {};
    data.tournaments.push({
      ...DEFAULTS.tournaments(),
      id: uuid(), created_at: now(), updated_at: now(),
      name: clean(cfg.DEFAULT_TOURNAMENT_NAME) || 'eFootball Tournament',
      season: 'Season 1',
      description: 'Register your squad, follow every fixture and watch the point table update the moment results land.',
      is_active: true,
      is_published: true,
      registration_open: true,
    });
    try { localStorage.setItem(DB_KEY, JSON.stringify(data)); } catch (_) { /* storage blocked: stay in memory */ }
    return data;
  }

  function write(data) {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(data));
    } catch (err) {
      throw dbError('Browser storage is full or blocked. Export a backup and clear old data.', 'STORAGE');
    }
    notifyLocal();
  }

  const getSession = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; } catch (_) { return null; } };
  const setSession = (s) => { try { if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s)); else localStorage.removeItem(SESSION_KEY); } catch (_) { /* ignore */ } };

  const uuid = () => (crypto && crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }));
  const now = () => new Date().toISOString();
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

  function dbError(message, code) { const e = new Error(message); e.code = code; return e; }

  /* ---------------- auth helpers ---------------- */
  const isAdmin = () => {
    const s = getSession();
    if (!s) return false;
    return read().admin_users.some((a) => a.user_id === s.user.id);
  };

  async function hashPassword(password, salt) {
    const text = `${salt}:${password}`;
    if (window.crypto && crypto.subtle && window.isSecureContext !== false) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    // Fallback for non-secure contexts (FNV-1a based, weaker).
    let h1 = 0x811c9dc5; let h2 = 0x01000193;
    for (let i = 0; i < text.length; i += 1) { h1 = Math.imul(h1 ^ text.charCodeAt(i), 16777619); h2 = Math.imul(h2 ^ h1, 2246822519); }
    return `fnv${(h1 >>> 0).toString(16)}${(h2 >>> 0).toString(16)}`;
  }

  /* ---------------- read models (mirror RLS + views) ---------------- */
  function visibleRows(data, table) {
    const admin = isAdmin();
    const published = (tid) => { const t = data.tournaments.find((x) => x.id === tid); return Boolean(t && (t.is_published || admin)); };
    switch (table) {
      case 'tournaments': return data.tournaments.filter((t) => t.is_published || admin);
      case 'matches': return data.matches.filter((m) => published(m.tournament_id));
      case 'players_public':
        return data.players
          .filter((p) => p.status !== 'rejected' && published(p.tournament_id))
          .map(({ id, tournament_id, player_name, team_name, efootball_username, status, avatar_url, created_at }) => ({ id, tournament_id, player_name, team_name, efootball_username, status, avatar_url: avatar_url || null, created_at }));
      case 'player_adjustment_totals': {
        const totals = new Map();
        data.point_adjustments.filter((a) => published(a.tournament_id)).forEach((a) => {
          const row = totals.get(a.player_id) || { tournament_id: a.tournament_id, player_id: a.player_id, points: 0, entries: 0 };
          row.points += a.points; row.entries += 1;
          totals.set(a.player_id, row);
        });
        return Array.from(totals.values());
      }
      case 'players': case 'point_adjustments': return admin ? data[table] : [];
      case 'admin_users': { const s = getSession(); return s ? data.admin_users.filter((a) => a.user_id === s.user.id || admin) : []; }
      default: throw dbError(`Could not find the table 'public.${table}'`, 'PGRST205');
    }
  }

  /* ---------------- write rules (mirror constraints + triggers) ---------------- */
  const intOrNull = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

  function checkTournament(t) {
    if (clean(t.name).length < 3 || clean(t.name).length > 120) throw dbError('violates tournaments_name check', '23514');
    if (t.end_date && t.start_date && t.end_date < t.start_date) throw dbError('violates tournaments_dates_chk', '23514');
    if (t.max_players !== null && t.max_players !== undefined && (t.max_players < 2 || t.max_players > 1024)) throw dbError('violates max_players check', '23514');
    ['points_win', 'points_draw', 'points_loss'].forEach((k) => { if (!Number.isInteger(t[k]) || t[k] < 0 || t[k] > 10) throw dbError(`violates ${k} check`, '23514'); });
  }

  function normalisePlayer(p, data, isInsert, before) {
    p.player_name = clean(p.player_name);
    p.team_name = clean(p.team_name);
    p.efootball_username = String(p.efootball_username || '').trim();
    p.email = String(p.email || '').trim().toLowerCase();
    if (p.player_name.length < 2 || p.player_name.length > 60) throw dbError('INVALID_PLAYER_NAME', '23514');
    if (p.team_name.length < 2 || p.team_name.length > 60) throw dbError('INVALID_TEAM_NAME', '23514');
    if (p.efootball_username.length < 3 || p.efootball_username.length > 40) throw dbError('INVALID_USERNAME', '23514');
    if (!EMAIL_RE.test(p.email) || p.email.length > 254) throw dbError('INVALID_EMAIL', '23514');
    if (!['pending', 'approved', 'rejected'].includes(p.status)) throw dbError('violates players_status check', '23514');
    if (p.avatar_url === '' || p.avatar_url === undefined) p.avatar_url = null;
    if (p.avatar_url !== null && !EF.utils.isAvatarData(p.avatar_url)) throw dbError('INVALID_AVATAR', '23514');
    const others = data.players.filter((x) => x.id !== p.id && x.tournament_id === p.tournament_id);
    if (others.some((x) => x.email === p.email)) throw dbError('duplicate key value violates unique constraint "players_tournament_email_key"', '23505');
    if (others.some((x) => x.efootball_username.toLowerCase() === p.efootball_username.toLowerCase())) throw dbError('duplicate key value violates unique constraint "players_tournament_username_key"', '23505');
    if (p.status === 'approved') { if (isInsert || !before || before.status !== 'approved') p.approved_at = now(); }
    else p.approved_at = null;
  }

  function checkMatch(m, data, isInsert, before) {
    if (m.home_player_id === m.away_player_id) throw dbError('violates matches_distinct_players_chk', '23514');
    if (!['upcoming', 'live', 'completed', 'postponed'].includes(m.status)) throw dbError('violates matches_status check', '23514');
    ['home_score', 'away_score'].forEach((k) => {
      m[k] = intOrNull(m[k]);
      if (m[k] !== null && (!Number.isInteger(m[k]) || m[k] < 0 || m[k] > 99)) throw dbError(`violates ${k} check`, '23514');
    });
    if (m.status === 'completed' && (m.home_score === null || m.away_score === null)) throw dbError('violates matches_completed_scores_chk', '23514');
    if (!m.scheduled_at || Number.isNaN(new Date(m.scheduled_at).getTime())) throw dbError('violates scheduled_at not null', '23502');
    const lineupChanged = isInsert || m.home_player_id !== before.home_player_id || m.away_player_id !== before.away_player_id;
    if (lineupChanged) {
      const ok = data.players.filter((p) => [m.home_player_id, m.away_player_id].includes(p.id)
        && p.tournament_id === m.tournament_id && p.status === 'approved').length === 2;
      if (!ok) throw dbError('MATCH_PLAYERS_INVALID', '23514');
    }
  }

  const DEFAULTS = {
    tournaments: () => ({ format: 'League', registration_open: true, auto_approve: false, points_win: 3, points_draw: 1, points_loss: 0, is_published: false, is_active: false, season: null, description: null, rules: null, platform: null, prize: null, start_date: null, end_date: null, max_players: null }),
    players: () => ({ status: 'pending', notes: null, approved_at: null, avatar_url: null }),
    matches: () => ({ status: 'upcoming', round: null, home_score: null, away_score: null, venue: null, notes: null }),
    point_adjustments: () => ({}),
  };

  function applyInsert(data, table, values) {
    if (table === 'admin_users') throw dbError('permission denied for table admin_users', '42501');
    const row = { ...DEFAULTS[table](), ...clone(values), id: uuid(), created_at: now(), updated_at: now() };
    if (table === 'tournaments') {
      checkTournament(row);
      if (row.is_active) data.tournaments.forEach((t) => { t.is_active = false; });
    }
    if (table === 'players') normalisePlayer(row, data, true);
    if (table === 'matches') checkMatch(row, data, true);
    if (table === 'point_adjustments') {
      row.points = Number(row.points);
      row.reason = clean(row.reason);
      if (!Number.isInteger(row.points) || row.points === 0 || row.points < -100 || row.points > 100) throw dbError('violates points check', '23514');
      if (row.reason.length < 3 || row.reason.length > 500) throw dbError('violates reason check', '23514');
      if (!data.players.some((p) => p.id === row.player_id && p.tournament_id === row.tournament_id)) throw dbError('ADJUSTMENT_PLAYER_INVALID', '23514');
      const s = getSession();
      row.created_by = s ? s.user.id : null;
      row.created_by_email = s ? s.user.email : null;
      delete row.updated_at;
    }
    data[table].push(row);
    return row;
  }

  function applyUpdate(data, table, row, values) {
    if (table === 'point_adjustments' || table === 'admin_users') throw dbError(`permission denied for table ${table}`, '42501');
    const before = clone(row);
    const next = { ...row, ...clone(values), id: row.id, created_at: row.created_at, updated_at: now() };
    if (table === 'tournaments') {
      checkTournament(next);
      if (next.is_active) data.tournaments.forEach((t) => { if (t.id !== next.id) t.is_active = false; });
    }
    if (table === 'players') normalisePlayer(next, data, false, before);
    if (table === 'matches') checkMatch(next, data, false, before);
    Object.assign(row, next);
    return row;
  }

  function applyDelete(data, table, rows) {
    if (table === 'point_adjustments' || table === 'admin_users') throw dbError(`permission denied for table ${table}`, '42501');
    const ids = new Set(rows.map((r) => r.id));
    if (table === 'players') {
      if (data.matches.some((m) => ids.has(m.home_player_id) || ids.has(m.away_player_id))) {
        throw dbError('update or delete on table "players" violates foreign key constraint', '23503');
      }
      data.point_adjustments = data.point_adjustments.filter((a) => !ids.has(a.player_id));
    }
    if (table === 'tournaments') {
      ['players', 'matches', 'point_adjustments'].forEach((t) => { data[t] = data[t].filter((r) => !ids.has(r.tournament_id)); });
    }
    data[table] = data[table].filter((r) => !ids.has(r.id));
  }

  /* ---------------- query builder (Supabase-compatible subset) ---------------- */
  class Query {
    constructor(table) { this.table = table; this.filters = []; this.orders = []; this.max = null; this.mode = 'many'; this.op = 'select'; this.values = null; }
    select() { return this; }
    eq(col, val) { this.filters.push((r) => r[col] === val); return this; }
    in(col, vals) { this.filters.push((r) => vals.includes(r[col])); return this; }
    order(col, opts = {}) { this.orders.push([col, opts.ascending !== false]); return this; }
    limit(n) { this.max = n; return this; }
    single() { this.mode = 'single'; return this; }
    maybeSingle() { this.mode = 'maybe'; return this; }
    insert(values) { this.op = 'insert'; this.values = values; return this; }
    update(values) { this.op = 'update'; this.values = values; return this; }
    delete() { this.op = 'delete'; return this; }
    then(resolve, reject) { return Promise.resolve().then(() => this.run()).then(resolve, reject); }

    shape(rows) {
      if (this.mode === 'single') {
        if (rows.length !== 1) return { data: null, error: dbError('JSON object requested, multiple (or no) rows returned', 'PGRST116') };
        return { data: rows[0], error: null };
      }
      if (this.mode === 'maybe') return { data: rows[0] || null, error: null };
      return { data: rows, error: null };
    }

    run() {
      try {
        const data = read();
        if (this.op === 'select') {
          let rows = visibleRows(data, this.table).filter((r) => this.filters.every((f) => f(r)));
          if (this.orders.length) {
            rows = [...rows].sort((a, b) => {
              for (const [col, asc] of this.orders) {
                const x = a[col]; const y = b[col];
                if (x === y) continue;
                if (x === null || x === undefined) return 1;
                if (y === null || y === undefined) return -1;
                return (x < y ? -1 : 1) * (asc ? 1 : -1);
              }
              return 0;
            });
          }
          if (this.max !== null) rows = rows.slice(0, this.max);
          return this.shape(clone(rows));
        }

        if (!isAdmin()) return { data: null, error: dbError('permission denied (admin only)', '42501') };
        if (!data[this.table]) return { data: null, error: dbError(`Could not find the table 'public.${this.table}'`, 'PGRST205') };

        let out = [];
        if (this.op === 'insert') {
          out = (Array.isArray(this.values) ? this.values : [this.values]).map((v) => applyInsert(data, this.table, v));
        } else {
          const targets = data[this.table].filter((r) => this.filters.every((f) => f(r)));
          if (this.op === 'update') out = targets.map((r) => applyUpdate(data, this.table, r, this.values));
          if (this.op === 'delete') { applyDelete(data, this.table, targets); out = []; }
        }
        write(data);
        return this.shape(clone(out));
      } catch (err) {
        return { data: null, error: { message: err.message, code: err.code || 'LOCAL' } };
      }
    }
  }

  /* ---------------- RPC ---------------- */
  async function rpc(name, args = {}) {
    await Promise.resolve();
    try {
      if (name === 'is_admin') return { data: isAdmin(), error: null };
      if (name !== 'register_player') throw dbError(`Could not find the function public.${name}`, 'PGRST202');

      const data = read();
      const t = data.tournaments.find((x) => x.is_active && x.is_published);
      if (!t) throw dbError('NO_ACTIVE_TOURNAMENT', 'P0001');
      if (!t.registration_open) throw dbError('REGISTRATION_CLOSED', 'P0001');
      const row = {
        tournament_id: t.id,
        player_name: args.p_player_name,
        team_name: args.p_team_name,
        efootball_username: args.p_efootball_username,
        email: args.p_email,
        avatar_url: args.p_avatar_url || null,
        status: t.auto_approve ? 'approved' : 'pending',
      };
      const email = String(row.email || '').trim().toLowerCase();
      if (data.players.some((p) => p.tournament_id === t.id && p.email === email)) throw dbError('DUPLICATE_EMAIL', '23505');
      if (data.players.some((p) => p.tournament_id === t.id && p.efootball_username.toLowerCase() === String(row.efootball_username || '').trim().toLowerCase())) throw dbError('DUPLICATE_USERNAME', '23505');
      if (t.max_players && data.players.filter((p) => p.tournament_id === t.id && p.status !== 'rejected').length >= t.max_players) throw dbError('TOURNAMENT_FULL', 'P0001');
      const inserted = { ...DEFAULTS.players(), ...row, id: uuid(), created_at: now(), updated_at: now() };
      normalisePlayer(inserted, data, true);
      data.players.push(inserted);
      write(data);
      return { data: { id: inserted.id, status: inserted.status, tournament_id: t.id }, error: null };
    } catch (err) {
      return { data: null, error: { message: err.message, code: err.code || 'LOCAL' } };
    }
  }

  /* ---------------- auth ---------------- */
  const authListeners = new Set();
  const emitAuth = (event, session) => authListeners.forEach((cb) => { try { cb(event, session); } catch (_) { /* ignore */ } });

  const configuredAdmin = () => {
    const cfg = window.EF_CONFIG || {};
    const username = String(cfg.ADMIN_USERNAME || '').trim().toLowerCase();
    const password = String(cfg.ADMIN_PASSWORD || '');
    return username && password ? { username, password } : null;
  };

  /**
   * ADMIN_USERNAME / ADMIN_PASSWORD in config.js are authoritative: the single
   * admin account is created or updated to match them (stored hashed). Changing
   * either value in config.js signs out old sessions automatically.
   */
  async function syncConfiguredAdmin() {
    const creds = configuredAdmin();
    if (!creds) return;
    const data = read();
    let acc = data.accounts.find((a) => a.email === creds.username);
    const valid = acc && (await hashPassword(creds.password, acc.salt)) === acc.hash;
    if (valid && data.accounts.length === 1 && data.admin_users.length === 1) return;
    if (!acc) { acc = { id: uuid(), email: creds.username, created_at: now() }; }
    if (!valid) { acc.salt = uuid(); acc.hash = await hashPassword(creds.password, acc.salt); }
    data.accounts = [acc];
    data.admin_users = [{ user_id: acc.id, email: creds.username, display_name: 'Tournament Admin', role: 'owner', created_at: acc.created_at }];
    try { localStorage.setItem(DB_KEY, JSON.stringify(data)); } catch (_) { /* ignore */ }
  }

  const auth = {
    async getSession() {
      await syncConfiguredAdmin();
      const s = getSession();
      // Drop sessions whose account no longer exists (e.g. credentials changed in config.js).
      if (s && !read().admin_users.some((a) => a.user_id === s.user.id)) { setSession(null); return { data: { session: null }, error: null }; }
      return { data: { session: s }, error: null };
    },
    async signInWithPassword({ email, password }) {
      await syncConfiguredAdmin();
      const data = read();
      const account = data.accounts.find((a) => a.email === String(email || '').trim().toLowerCase());
      if (!account || (await hashPassword(password, account.salt)) !== account.hash) {
        return { data: {}, error: { message: 'Invalid login credentials', code: 'invalid_credentials' } };
      }
      const session = { user: { id: account.id, email: account.email }, created_at: now() };
      setSession(session);
      emitAuth('SIGNED_IN', session);
      return { data: { session }, error: null };
    },
    async signOut() { setSession(null); emitAuth('SIGNED_OUT', null); return { error: null }; },
    onAuthStateChange(cb) { authListeners.add(cb); return { data: { subscription: { unsubscribe: () => authListeners.delete(cb) } } }; },
  };

  /* ---------------- "realtime" across tabs of this browser ---------------- */
  const channels = new Set();
  function notifyLocal() { channels.forEach((c) => c.fire()); }
  window.addEventListener('storage', (ev) => { if (ev.key === DB_KEY) channels.forEach((c) => c.fire()); });

  function channel() {
    const handlers = [];
    const ch = {
      on(_type, _filter, cb) { handlers.push(cb); return ch; },
      subscribe() { channels.add(ch); return ch; },
      fire() { handlers.forEach((cb) => setTimeout(() => cb({}), 0)); },
    };
    return ch;
  }

  /* ---------------- public API ---------------- */
  EF.createLocalClient = function () {
    return {
      from: (table) => new Query(table),
      rpc,
      auth,
      channel,
      removeChannel: (ch) => channels.delete(ch),
    };
  };

  /** Local-only admin tools: first-run account, backup, restore, demo data, reset. */
  EF.local = {
    hasAdmin() { return Boolean(configuredAdmin()) || read().accounts.length > 0; },
    usesUsername() { return Boolean(configuredAdmin()); },

    async createAdmin(email, password) {
      const data = read();
      if (data.accounts.length) throw dbError('An admin account already exists. Sign in instead.', 'EXISTS');
      const cleanEmail = String(email || '').trim().toLowerCase();
      if (!EMAIL_RE.test(cleanEmail)) throw dbError('Enter a valid email address.', 'INVALID');
      if (String(password || '').length < 8) throw dbError('Password must be at least 8 characters.', 'INVALID');
      const salt = uuid();
      const id = uuid();
      data.accounts.push({ id, email: cleanEmail, salt, hash: await hashPassword(password, salt), created_at: now() });
      data.admin_users.push({ user_id: id, email: cleanEmail, display_name: 'Tournament Admin', role: 'owner', created_at: now() });
      write(data);
    },

    exportJson() {
      const data = read();
      const { accounts, ...rest } = data; // never export password hashes
      return JSON.stringify({ ...rest, exported_at: now(), app: 'efootball-tournament' }, null, 2);
    },

    importJson(text) {
      const incoming = JSON.parse(text);
      if (!incoming || incoming.app !== 'efootball-tournament') throw dbError('This file is not an eFootball tournament backup.', 'INVALID');
      const data = read();
      ['tournaments', 'players', 'matches', 'point_adjustments'].forEach((t) => { data[t] = Array.isArray(incoming[t]) ? incoming[t] : []; });
      write(data);
    },

    resetData() {
      const data = read();
      ['tournaments', 'players', 'matches', 'point_adjustments'].forEach((t) => { data[t] = []; });
      write(data);
    },

    loadDemo() {
      const data = read();
      ['tournaments', 'players', 'matches', 'point_adjustments'].forEach((t) => { data[t] = []; });
      const t = {
        ...DEFAULTS.tournaments(), id: uuid(), created_at: now(), updated_at: now(),
        name: 'eFootball Champions Cup', season: 'Season 1', is_active: true, is_published: true,
        description: 'Eight of the sharpest eFootball players battle across a full league season for the title.',
        platform: 'PS5 · Xbox · PC · Mobile', prize: '৳50,000', max_players: 16,
        start_date: new Date().toISOString().slice(0, 10),
        rules: 'Matches are 10 minutes on Normal speed.\nSend a screenshot of the final score to the admin.\nNo-shows after 15 minutes forfeit 3-0.\nDisconnections: replay the remaining time with the same score.',
      };
      data.tournaments.push(t);
      const roster = [
        ['Nipun Mitra', 'Dream FC', 'NipunM10'], ['Rafi Ahmed', 'Pro Gamers', 'RafiPro'],
        ['Siam Islam', 'eFootball BD', 'SiamIs'], ['Tanvir Hasan', 'Game Changer', 'TanvirGC'],
        ['Arif Khan', 'Royal Strikers', 'ArifK7'], ['Sabbir Rahman', 'Night Hawks', 'SabbirNH'],
        ['Fahim Chowdhury', 'Thunder XI', 'FahimT11'], ['Imran Hossain', 'Blue Tigers', 'ImranBT'],
      ];
      const players = roster.map(([n, team, u], i) => ({
        ...DEFAULTS.players(), id: uuid(), tournament_id: t.id, player_name: n, team_name: team, efootball_username: u,
        email: `${u.toLowerCase()}@example.com`, status: i < 7 ? 'approved' : 'pending',
        created_at: new Date(Date.now() - (10 - i) * 3600e3).toISOString(), updated_at: now(),
      }));
      players.forEach((p) => { if (p.status === 'approved') p.approved_at = now(); });
      data.players.push(...players);
      const at = (days, hh, mm = 0) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hh, mm, 0, 0); return d.toISOString(); };
      const fx = [
        [0, 1, -3, 20, 'completed', 3, 1, 1], [2, 3, -3, 21, 'completed', 2, 0, 1], [4, 5, -2, 20, 'completed', 1, 1, 1],
        [6, 0, -2, 21, 'completed', 0, 2, 1], [1, 2, -1, 20, 'completed', 2, 2, 2], [3, 4, 0, 20, 'live', 1, 0, 2],
        [5, 6, 1, 20, 'upcoming', null, null, 2], [0, 3, 1, 21, 'upcoming', null, null, 3], [2, 6, 2, 20, 'upcoming', null, null, 3],
        [1, 5, 3, 20, 'postponed', null, null, 3],
      ];
      fx.forEach(([h, a, day, hour, status, hs, as, round]) => data.matches.push({
        ...DEFAULTS.matches(), id: uuid(), tournament_id: t.id, home_player_id: players[h].id, away_player_id: players[a].id,
        scheduled_at: at(day, hour), status, home_score: hs, away_score: as, round, venue: 'Online',
        created_at: now(), updated_at: now(),
      }));
      write(data);
    },
  };
})();
