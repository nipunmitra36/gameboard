/* Data-access layer. Every database call in the app goes through here. */
(function () {
  'use strict';
  window.EF = window.EF || {};

  const MESSAGES = {
    NOT_CONFIGURED: 'The selected data backend is not configured yet. Check assets/js/config.js.',
    NO_ACTIVE_TOURNAMENT: 'There is no tournament open right now. Please check back soon.',
    REGISTRATION_CLOSED: 'Registration for this tournament is currently closed.',
    TOURNAMENT_FULL: 'This tournament has reached its maximum number of players.',
    DUPLICATE_EMAIL: 'This email address is already registered for this tournament.',
    DUPLICATE_USERNAME: 'This eFootball username is already registered for this tournament.',
    INVALID_PLAYER_NAME: 'Player name must be between 2 and 60 characters.',
    INVALID_TEAM_NAME: 'Team name must be between 2 and 60 characters.',
    INVALID_USERNAME: 'eFootball username must be between 3 and 40 characters.',
    INVALID_EMAIL: 'Enter a valid email address.',
    INVALID_AVATAR: 'That profile photo could not be used. Upload a JPG, PNG or WebP image.',
    MATCH_PLAYERS_INVALID: 'Both players must be approved players in this tournament.',
    ADJUSTMENT_PLAYER_INVALID: 'The selected player does not belong to this tournament.',
    IMPORT_REQUIRES_EMPTY_DATABASE: 'Backup import only works when the Supabase tournament tables are empty. No existing records were changed.',
    INVALID_BACKUP: 'This file is not a valid eFootball tournament backup.',
  };

  class AppError extends Error {
    constructor(code, message) {
      super(message || MESSAGES[code] || code);
      this.code = code;
    }
  }

  /** Convert any backend/network error into a sentence a user can act on. */
  function friendlyError(err) {
    if (!err) return 'Something went wrong. Please try again.';
    if (typeof err === 'string') return MESSAGES[err] || err;
    if (err instanceof AppError) return err.message;

    const msg = String(err.message || '');
    const known = Object.keys(MESSAGES).find((code) => msg.includes(code));
    if (known) return MESSAGES[known];

    switch (err.code) {
      case '23505':
        if (/email/i.test(msg)) return MESSAGES.DUPLICATE_EMAIL;
        if (/username/i.test(msg)) return MESSAGES.DUPLICATE_USERNAME;
        return 'A record with these details already exists.';
      case '23503':
        return 'This record is linked to other data (for example fixtures) and cannot be removed. Delete the related records first.';
      case '23514':
        if (/completed_scores/i.test(msg)) return 'Completed matches need a score for both players.';
        if (/distinct_players/i.test(msg)) return 'A player cannot play against themselves.';
        if (/dates_chk/i.test(msg)) return 'The end date must be on or after the start date.';
        return 'Some values are not valid. Please review the form.';
      case '42501':
      case 'PGRST301':
        return 'You do not have permission to perform this action.';
      case 'PGRST116':
        return 'The requested record was not found.';
      default:
        break;
    }
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Network error. Check your connection and try again.';
    if (/Invalid login credentials/i.test(msg)) return EF.backend === 'local' ? 'Incorrect username or password.' : 'Incorrect email or password.';
    if (/Email not confirmed/i.test(msg)) return 'This account has not been confirmed yet.';
    if (/rate limit/i.test(msg)) return 'Too many attempts. Please wait a moment and try again.';
    return msg || 'Something went wrong. Please try again.';
  }

  const db = () => {
    if (!EF.db) throw new AppError('NOT_CONFIGURED');
    return EF.db;
  };

  async function run(query) {
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  const MATCH_COLUMNS = 'id,tournament_id,round,scheduled_at,status,home_player_id,away_player_id,home_score,away_score,venue,notes,created_at,updated_at';
  const PUBLIC_PLAYER_COLUMNS = 'id,tournament_id,player_name,team_name,efootball_username,status,avatar_url,created_at';

  const api = {
    AppError,
    friendlyError,
    MESSAGES,

    /* ---------------- Public ---------------- */
    async getPublishedTournament() {
      return run(db().from('tournaments').select('*')
        .eq('is_active', true).eq('is_published', true)
        .limit(1).maybeSingle());
    },

    async getPublicPlayers(tournamentId) {
      return (await run(db().from('players_public').select(PUBLIC_PLAYER_COLUMNS)
        .eq('tournament_id', tournamentId)
        .order('created_at', { ascending: true }))) || [];
    },

    async getMatches(tournamentId) {
      return (await run(db().from('matches').select(MATCH_COLUMNS)
        .eq('tournament_id', tournamentId)
        .order('scheduled_at', { ascending: true }))) || [];
    },

    async getAdjustmentTotals(tournamentId) {
      return (await run(db().from('player_adjustment_totals').select('player_id,points')
        .eq('tournament_id', tournamentId))) || [];
    },

    /** Attach player objects (home / away) to match rows. */
    attachPlayers(matches, players) {
      const byId = new Map(players.map((p) => [p.id, p]));
      return matches.map((m) => ({
        ...m,
        home: byId.get(m.home_player_id) || null,
        away: byId.get(m.away_player_id) || null,
      }));
    },

    /** Everything a public page needs, in parallel, with standings computed. */
    async loadPublicData() {
      const tournament = await api.getPublishedTournament();
      EF.state.tournament = tournament;
      if (EF.layout) EF.layout.setTournament(tournament);

      if (!tournament) {
        const empty = { tournament: null, players: [], matches: [], adjustments: [], standings: [], loadedAt: new Date() };
        EF.state.data = empty;
        return empty;
      }

      const [players, matches, adjustments] = await Promise.all([
        api.getPublicPlayers(tournament.id),
        api.getMatches(tournament.id),
        api.getAdjustmentTotals(tournament.id),
      ]);

      const data = {
        tournament,
        players,
        matches: api.attachPlayers(matches, players),
        adjustments,
        standings: EF.standings.compute({
          players: players.filter((p) => p.status === 'approved'),
          matches,
          adjustments,
          tournament,
        }),
        loadedAt: new Date(),
      };
      EF.state.data = data;
      return data;
    },

    async registerPlayer(values) {
      return run(db().rpc('register_player', {
        p_player_name: EF.utils.clean(values.player_name),
        p_team_name: EF.utils.clean(values.team_name),
        p_efootball_username: String(values.efootball_username || '').trim(),
        p_email: String(values.email || '').trim().toLowerCase(),
        p_avatar_url: EF.utils.isAvatarData(values.avatar_url) ? values.avatar_url : null,
      }));
    },

    /**
     * Live updates: Supabase Realtime + refresh when a tab regains focus.
     * Returns an unsubscribe function.
     */
    watch({ tables = ['matches', 'tournaments'], onChange, key = 'public' }) {
      const cleanups = [];
      const fire = EF.utils.debounce(() => onChange(), 600);

      if (EF.db && (window.EF_CONFIG || {}).REALTIME !== false) {
        const channel = EF.db.channel(`ef-${key}-${Math.random().toString(36).slice(2, 8)}`);
        tables.forEach((table) => {
          channel.on('postgres_changes', { event: '*', schema: 'public', table }, fire);
        });
        channel.subscribe();
        cleanups.push(() => EF.db.removeChannel(channel));
      }

      let hiddenAt = 0;
      const onVisibility = () => {
        if (document.hidden) hiddenAt = Date.now();
        else if (hiddenAt && Date.now() - hiddenAt > 30000) fire();
      };
      document.addEventListener('visibilitychange', onVisibility);
      cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility));

      return () => cleanups.forEach((fn) => fn());
    },

    /* ---------------- Auth ---------------- */
    async getSession() {
      const { data, error } = await db().auth.getSession();
      if (error) throw error;
      return data.session;
    },

    async signIn(email, password) {
      const { data, error } = await db().auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      return data.session;
    },

    async signOut() {
      if (EF.db) await EF.db.auth.signOut();
    },

    onAuthChange(callback) {
      if (!EF.db) return () => {};
      const { data } = EF.db.auth.onAuthStateChange((event, session) => callback(event, session));
      return () => data.subscription.unsubscribe();
    },

    async isAdmin() {
      return Boolean(await run(db().rpc('is_admin')));
    },
  };

  /* ---------------- Admin (RLS: admins only) ---------------- */
  api.admin = {
    async importBackup(backup) {
      return run(db().rpc('import_backup', { p_backup: backup }));
    },

    async getProfile(userId) {
      return run(db().from('admin_users').select('*').eq('user_id', userId).maybeSingle());
    },

    async getTournament() {
      const rows = await run(db().from('tournaments').select('*')
        .order('is_active', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1));
      return (rows && rows[0]) || null;
    },

    async saveTournament(id, values) {
      if (id) {
        return run(db().from('tournaments').update(values).eq('id', id).select().single());
      }
      return run(db().from('tournaments').insert({ ...values, is_active: true }).select().single());
    },

    async listPlayers(tournamentId) {
      return (await run(db().from('players').select('*')
        .eq('tournament_id', tournamentId)
        .order('created_at', { ascending: true }))) || [];
    },

    async createPlayer(tournamentId, values) {
      return run(db().from('players').insert({ ...values, tournament_id: tournamentId }).select().single());
    },

    async updatePlayer(id, values) {
      return run(db().from('players').update(values).eq('id', id).select().single());
    },

    async setPlayerStatus(ids, status) {
      const list = Array.isArray(ids) ? ids : [ids];
      return run(db().from('players').update({ status }).in('id', list).select('id'));
    },

    async deletePlayer(id) {
      return run(db().from('players').delete().eq('id', id));
    },

    async createMatch(tournamentId, values) {
      return run(db().from('matches').insert({ ...values, tournament_id: tournamentId }).select(MATCH_COLUMNS).single());
    },

    async updateMatch(id, values) {
      return run(db().from('matches').update(values).eq('id', id).select(MATCH_COLUMNS).single());
    },

    async deleteMatch(id) {
      return run(db().from('matches').delete().eq('id', id));
    },

    async listAdjustments(tournamentId) {
      return (await run(db().from('point_adjustments').select('*')
        .eq('tournament_id', tournamentId)
        .order('created_at', { ascending: false }))) || [];
    },

    async createAdjustment(tournamentId, values) {
      return run(db().from('point_adjustments').insert({ ...values, tournament_id: tournamentId }).select().single());
    },
  };

  EF.api = api;
})();
