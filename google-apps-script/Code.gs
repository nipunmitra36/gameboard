const TABLE_NAMES = ['tournaments', 'players', 'matches', 'point_adjustments', 'news_posts'];
const PRIVATE_TABLES = ['players', 'point_adjustments'];
const SCRIPT_PROPERTY_SHEET_ID = 'EF_SPREADSHEET_ID';
const SCRIPT_PROPERTY_ADMIN_EMAIL = 'EF_ADMIN_EMAIL';
const SCRIPT_PROPERTY_ADMIN_HASH = 'EF_ADMIN_PASSWORD_SHA256';
const SESSION_TTL_SECONDS = 21600;

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Tournament setup')
    .addItem('Initialize database', 'initializeDatabase')
    .addItem('Set admin credentials', 'setAdminCredentials')
    .addToUi();
}

function initializeDatabase() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('Open this script from the tournament Google Sheet.');
  PropertiesService.getScriptProperties().setProperty(SCRIPT_PROPERTY_SHEET_ID, spreadsheet.getId());
  TABLE_NAMES.forEach((name) => {
    const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
    if (!sheet.getLastRow()) sheet.appendRow(['id', 'record_json']);
  });
  SpreadsheetApp.getUi().alert('Database tabs are ready. Next, set admin credentials.');
}

function setAdminCredentials() {
  const ui = SpreadsheetApp.getUi();
  const emailResult = ui.prompt('Admin email', 'Enter the email used to sign into the control panel.', ui.ButtonSet.OK_CANCEL);
  if (emailResult.getSelectedButton() !== ui.Button.OK) return;
  const email = emailResult.getResponseText().trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');

  const passwordResult = ui.prompt('Admin password', 'Choose a strong password (at least 12 characters).', ui.ButtonSet.OK_CANCEL);
  if (passwordResult.getSelectedButton() !== ui.Button.OK) return;
  const password = passwordResult.getResponseText();
  if (password.length < 12) throw new Error('The admin password must be at least 12 characters.');

  const properties = PropertiesService.getScriptProperties();
  properties.setProperty(SCRIPT_PROPERTY_ADMIN_EMAIL, email);
  properties.setProperty(SCRIPT_PROPERTY_ADMIN_HASH, sha256_(password));
  SpreadsheetApp.getUi().alert('Admin credentials saved as a hash in Script Properties.');
}

function doPost(event) {
  const nonce = String((event && event.parameter && event.parameter.nonce) || '');
  let message;
  try {
    const payload = JSON.parse(String(event.parameter.payload || '{}'));
    message = { nonce: nonce, data: dispatch_(payload) };
  } catch (error) {
    message = {
      nonce: nonce,
      error: { message: String(error.message || error), code: error.code || 'GOOGLE_SCRIPT' },
    };
  }

  const serialized = JSON.stringify(message).replace(/</g, '\\u003c');
  return HtmlService.createHtmlOutput(
    '<!doctype html><meta charset="utf-8"><script>window.parent.postMessage(' + serialized + ',"*");</script>',
  ).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function dispatch_(request) {
  switch (request.action) {
    case 'auth_login': return login_(request.email, request.password);
    case 'auth_session': return session_(request.token);
    case 'auth_logout': logout_(request.token); return true;
    case 'rpc': return rpc_(request.name, request.args || {}, request.token);
    case 'query': return query_(request, request.token);
    default: throw apiError_('Unsupported operation.', 'BAD_REQUEST');
  }
}

function login_(email, password) {
  const properties = PropertiesService.getScriptProperties();
  const expectedEmail = String(properties.getProperty(SCRIPT_PROPERTY_ADMIN_EMAIL) || '').toLowerCase();
  const expectedHash = properties.getProperty(SCRIPT_PROPERTY_ADMIN_HASH) || '';
  if (!expectedEmail || !expectedHash) throw apiError_('Admin credentials are not configured in the Sheet.', 'SETUP_REQUIRED');

  const suppliedEmail = String(email || '').trim().toLowerCase();
  const suppliedHash = sha256_(String(password || ''));
  if (suppliedEmail !== expectedEmail || suppliedHash !== expectedHash) {
    throw apiError_('Invalid login credentials', 'invalid_credentials');
  }

  const accessToken = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put('ef-session-' + accessToken, expectedEmail + ':' + expectedHash, SESSION_TTL_SECONDS);
  return {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: SESSION_TTL_SECONDS,
    user: { id: expectedEmail, email: expectedEmail },
  };
}

function session_(accessToken) {
  const email = sessionEmail_(accessToken, false);
  if (!email) return null;
  return {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: SESSION_TTL_SECONDS,
    user: { id: email, email: email },
  };
}

function logout_(accessToken) {
  if (accessToken) CacheService.getScriptCache().remove('ef-session-' + accessToken);
}

function sessionEmail_(accessToken, required) {
  const cachedSession = accessToken
    ? CacheService.getScriptCache().get('ef-session-' + String(accessToken))
    : null;
  const configuredEmail = String(PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPERTY_ADMIN_EMAIL) || '').toLowerCase();
  const configuredHash = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPERTY_ADMIN_HASH) || '';
  const parts = cachedSession ? cachedSession.split(':') : [];
  const validEmail = parts.length === 2 && parts[0] === configuredEmail && parts[1] === configuredHash ? parts[0] : null;
  if (!validEmail && required) throw apiError_('Admin session expired. Sign in again.', 'AUTH_REQUIRED');
  return validEmail;
}

function rpc_(name, args, accessToken) {
  if (name === 'is_admin') return Boolean(sessionEmail_(accessToken, false));
  if (name === 'register_player') return registerPlayer_(args);
  if (name === 'import_backup') return importBackup_(args.p_backup, accessToken);
  throw apiError_("Could not find the function public." + name, 'PGRST202');
}

function importBackup_(backup, accessToken) {
  requireAdmin_(accessToken);
  if (!backup || backup.app !== 'efootball-tournament') {
    throw apiError_('This file is not an eFootball tournament backup.', 'INVALID');
  }
  const replacement = {};
  TABLE_NAMES.forEach((name) => {
    const rows = name === 'news_posts' && backup[name] === undefined ? [] : backup[name];
    if (!Array.isArray(rows) || rows.length > 5000 || rows.some((row) => !row || !row.id || typeof row !== 'object')) {
      throw apiError_('The backup contains invalid or too many records.', 'INVALID');
    }
    replacement[name] = rows;
  });

  return withLock_(function () {
    const previous = {};
    TABLE_NAMES.forEach((name) => { previous[name] = readTable_(name); });
    try {
      TABLE_NAMES.forEach((name) => writeTable_(name, replacement[name]));
    } catch (error) {
      TABLE_NAMES.forEach((name) => writeTable_(name, previous[name]));
      throw error;
    }
    return true;
  });
}

function registerPlayer_(args) {
  return withLock_(function () {
    const tournaments = readTable_('tournaments');
    const tournament = tournaments.find((row) => row.is_active && row.is_published);
    if (!tournament) throw apiError_('NO_ACTIVE_TOURNAMENT', 'P0001');
    if (!tournament.registration_open) throw apiError_('REGISTRATION_CLOSED', 'P0001');

    const name = clean_(args.p_player_name);
    const team = clean_(args.p_team_name);
    const username = String(args.p_efootball_username || '').trim();
    const email = String(args.p_email || '').trim().toLowerCase();
    if (name.length < 2 || name.length > 60) throw apiError_('INVALID_PLAYER_NAME', '23514');
    if (team.length < 2 || team.length > 60) throw apiError_('INVALID_TEAM_NAME', '23514');
    if (username.length < 3 || username.length > 40) throw apiError_('INVALID_USERNAME', '23514');
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw apiError_('INVALID_EMAIL', '23514');
    const avatar = String(args.p_avatar_url || '');
    if (avatar && (avatar.length > 300000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(avatar))) {
      throw apiError_('INVALID_AVATAR', '23514');
    }

    const players = readTable_('players');
    const members = players.filter((row) => row.tournament_id === tournament.id);
    if (members.some((row) => String(row.email || '').toLowerCase() === email)) throw apiError_('DUPLICATE_EMAIL', '23505');
    if (members.some((row) => String(row.efootball_username || '').toLowerCase() === username.toLowerCase())) {
      throw apiError_('DUPLICATE_USERNAME', '23505');
    }
    if (tournament.max_players && members.filter((row) => row.status !== 'rejected').length >= tournament.max_players) {
      throw apiError_('TOURNAMENT_FULL', 'P0001');
    }

    const now = new Date().toISOString();
    const player = {
      id: Utilities.getUuid(),
      tournament_id: tournament.id,
      player_name: name,
      team_name: team,
      efootball_username: username,
      email: email,
      avatar_url: avatar || null,
      status: tournament.auto_approve ? 'approved' : 'pending',
      approved_at: tournament.auto_approve ? now : null,
      notes: null,
      created_at: now,
      updated_at: now,
    };
    players.push(player);
    writeTable_('players', players);
    return { id: player.id, status: player.status, tournament_id: tournament.id };
  });
}

function query_(request, accessToken) {
  const table = String(request.table || '');
  if (!TABLE_NAMES.includes(table) && !['players_public', 'player_adjustment_totals', 'admin_users'].includes(table)) {
    throw apiError_("Could not find the table 'public." + table + "'", 'PGRST205');
  }

  const isAdmin = Boolean(sessionEmail_(accessToken, false));
  const op = request.op || 'select';
  if (op !== 'select' && !isAdmin) throw apiError_('permission denied (admin only)', '42501');
  if (PRIVATE_TABLES.includes(table) && !isAdmin) throw apiError_('permission denied', '42501');
  if (table === 'admin_users' && !isAdmin) throw apiError_('permission denied', '42501');
  if (table === 'point_adjustments' && op !== 'select' && op !== 'insert') {
    throw apiError_('Point adjustments are append-only.', '42501');
  }

  if (op === 'select') {
    return withLock_(function () {
      let rows = publicRows_(table, isAdmin, sessionEmail_(accessToken, false));
      rows = rows.filter((row) => (request.filters || []).every((filter) => {
        if (filter.op === 'in') return (filter.value || []).includes(row[filter.field]);
        return row[filter.field] === filter.value;
      }));
      (request.orders || []).slice().reverse().forEach((order) => {
        rows.sort((a, b) => {
          const x = a[order.field]; const y = b[order.field];
          if (x === y) return 0;
          if (x === null || x === undefined) return 1;
          if (y === null || y === undefined) return -1;
          return (x < y ? -1 : 1) * (order.ascending === false ? -1 : 1);
        });
      });
      if (request.max !== null && request.max !== undefined) rows = rows.slice(0, Math.max(0, Number(request.max)));
      return rows;
    });
  }

  return withLock_(function () {
    requireAdmin_(accessToken);
    if (table === 'players_public' || table === 'player_adjustment_totals' || table === 'admin_users') {
      throw apiError_('This view cannot be modified.', '42501');
    }
    const rows = readTable_(table);
    let result = [];
    if (op === 'insert') {
      const values = Array.isArray(request.values) ? request.values : [request.values];
      result = values.map((value) => {
        const row = Object.assign({ id: Utilities.getUuid(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, value || {});
        validateAdminRow_(table, row, accessToken);
        rows.push(row);
        if (table === 'tournaments' && row.is_active) {
          rows.forEach((other) => { if (other.id !== row.id) other.is_active = false; });
        }
        return row;
      });
      writeTable_(table, rows);
    } else if (op === 'update') {
      result = rows.filter((row) => matches_(row, request.filters)).map((row) => {
        const before = Object.assign({}, row);
        Object.assign(row, request.values || {}, { updated_at: new Date().toISOString() });
        validateAdminRow_(table, row, accessToken, before);
        if (table === 'tournaments' && row.is_active) {
          rows.forEach((other) => { if (other.id !== row.id) other.is_active = false; });
        }
        return row;
      });
      writeTable_(table, rows);
    } else if (op === 'delete') {
      const targets = rows.filter((row) => matches_(row, request.filters));
      if (table === 'players') {
        const used = readTable_('matches').some((match) => targets.some((row) =>
          match.home_player_id === row.id || match.away_player_id === row.id));
        if (used) throw apiError_('This record is linked to other data (for example fixtures) and cannot be removed. Delete the related records first.', '23503');
      }
      const ids = new Set(targets.map((row) => row.id));
      writeTable_(table, rows.filter((row) => !ids.has(row.id)));
      if (table === 'players') {
        writeTable_('point_adjustments', readTable_('point_adjustments').filter((row) => !ids.has(row.player_id)));
      }
      if (table === 'tournaments') {
        ['players', 'matches', 'point_adjustments'].forEach((child) =>
          writeTable_(child, readTable_(child).filter((row) => !ids.has(row.tournament_id))));
      }
    } else {
      throw apiError_('Unsupported database operation.', 'BAD_REQUEST');
    }
    return result;
  });
}

function publicRows_(table, isAdmin, adminEmail) {
  if (table === 'admin_users') {
    return [{ user_id: adminEmail || '', email: adminEmail || '', display_name: 'Tournament Admin', role: 'owner' }];
  }

  const tournaments = readTable_('tournaments');
  const visibleTournaments = tournaments.filter((row) => row.is_published || isAdmin);
  const visibleIds = new Set(visibleTournaments.map((row) => row.id));
  if (table === 'news_posts') {
    const posts = readTable_('news_posts');
    return isAdmin ? posts : posts.filter((row) => !row.expires_at || new Date(row.expires_at).getTime() > Date.now());
  }
  if (table === 'tournaments') return visibleTournaments;
  if (table === 'matches') return readTable_('matches').filter((row) => visibleIds.has(row.tournament_id));
  if (table === 'players' || table === 'point_adjustments') return readTable_(table);
  if (table === 'players_public') {
    return readTable_('players').filter((row) =>
      visibleIds.has(row.tournament_id) && row.status !== 'rejected').map((row) => ({
      id: row.id,
      tournament_id: row.tournament_id,
      player_name: row.player_name,
      team_name: row.team_name,
      efootball_username: row.efootball_username,
      status: row.status,
      avatar_url: row.avatar_url || null,
      created_at: row.created_at,
    }));
  }
  if (table === 'player_adjustment_totals') {
    const totals = {};
    readTable_('point_adjustments').filter((row) => visibleIds.has(row.tournament_id)).forEach((row) => {
      totals[row.player_id] = (totals[row.player_id] || 0) + Number(row.points || 0);
    });
    return Object.keys(totals).map((playerId) => ({ player_id: playerId, points: totals[playerId] }));
  }
  throw apiError_("Could not find the table 'public." + table + "'", 'PGRST205');
}

function validateAdminRow_(table, row, accessToken, before) {
  if (table === 'news_posts') {
    row.title = String(row.title || '').trim();
    row.content = String(row.content || '').trim();
    if (row.title.length < 3 || row.title.length > 120) throw apiError_('violates news_posts_title check', '23514');
    if (row.content.length < 1 || row.content.length > 5000) throw apiError_('violates news_posts_content check', '23514');
    if (!['news', 'notice'].includes(row.post_type)) throw apiError_('violates news_posts_post_type check', '23514');
    row.is_pinned = Boolean(row.is_pinned);
    if (row.post_type !== 'notice' && (row.is_pinned || row.expires_at)) {
      throw apiError_('violates news_posts_notice_options check', '23514');
    }
    if (row.expires_at) {
      const expiry = new Date(row.expires_at);
      if (Number.isNaN(expiry.getTime())) throw apiError_('violates news_posts_expires_at check', '23514');
      row.expires_at = expiry.toISOString();
    } else row.expires_at = null;
  }
  if (table === 'tournaments') {
    if (clean_(row.name).length < 3 || clean_(row.name).length > 120) throw apiError_('violates tournaments_name check', '23514');
    if (row.end_date && row.start_date && row.end_date < row.start_date) throw apiError_('violates tournaments_dates_chk', '23514');
    if (row.max_players !== null && row.max_players !== undefined && (Number(row.max_players) < 2 || Number(row.max_players) > 1024)) {
      throw apiError_('violates max_players check', '23514');
    }
    ['points_win', 'points_draw', 'points_loss'].forEach((field) => {
      const points = Number(row[field]);
      if (!Number.isInteger(points) || points < 0 || points > 10) throw apiError_('violates ' + field + ' check', '23514');
    });
  }
  if (table === 'players') {
    row.player_name = clean_(row.player_name);
    row.team_name = clean_(row.team_name);
    row.efootball_username = String(row.efootball_username || '').trim();
    row.email = String(row.email || '').trim().toLowerCase();
    if (row.player_name.length < 2 || row.player_name.length > 60) throw apiError_('INVALID_PLAYER_NAME', '23514');
    if (row.team_name.length < 2 || row.team_name.length > 60) throw apiError_('INVALID_TEAM_NAME', '23514');
    if (row.efootball_username.length < 3 || row.efootball_username.length > 40) throw apiError_('INVALID_USERNAME', '23514');
    if (row.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(row.email)) throw apiError_('INVALID_EMAIL', '23514');
    if (!['pending', 'approved', 'rejected'].includes(row.status)) throw apiError_('violates players_status check', '23514');
    const duplicate = readTable_('players').some((player) => player.id !== row.id
      && player.tournament_id === row.tournament_id
      && (String(player.email || '').toLowerCase() === row.email
        || String(player.efootball_username || '').toLowerCase() === row.efootball_username.toLowerCase()));
    if (duplicate) throw apiError_('A record with these details already exists.', '23505');
    if (row.status === 'approved' && (!before || before.status !== 'approved')) row.approved_at = new Date().toISOString();
    if (row.status !== 'approved') row.approved_at = null;
    const avatar = String(row.avatar_url || '');
    if (avatar && (avatar.length > 300000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(avatar))) {
      throw apiError_('INVALID_AVATAR', '23514');
    }
  }
  if (table === 'matches') {
    if (row.home_player_id === row.away_player_id) throw apiError_('violates matches_distinct_players_chk', '23514');
    if (!['upcoming', 'live', 'completed', 'postponed'].includes(row.status)) throw apiError_('violates matches_status check', '23514');
    if (!row.scheduled_at || Number.isNaN(new Date(row.scheduled_at).getTime())) throw apiError_('violates scheduled_at not null', '23502');
    if (row.status === 'completed' && (row.home_score === null || row.home_score === undefined || row.away_score === null || row.away_score === undefined)) {
      throw apiError_('violates matches_completed_scores_chk', '23514');
    }
    ['home_score', 'away_score'].forEach((field) => {
      if (row[field] !== null && row[field] !== undefined
        && (!Number.isInteger(Number(row[field])) || Number(row[field]) < 0 || Number(row[field]) > 99)) {
        throw apiError_('violates ' + field + ' check', '23514');
      }
    });
    const lineupChanged = !before || row.home_player_id !== before.home_player_id || row.away_player_id !== before.away_player_id;
    if (lineupChanged) {
      const players = readTable_('players');
      [row.home_player_id, row.away_player_id].forEach((id) => {
        if (!players.some((player) => player.id === id && player.tournament_id === row.tournament_id && player.status === 'approved')) {
          throw apiError_('MATCH_PLAYERS_INVALID', '23514');
        }
      });
    }
  }
  if (table === 'point_adjustments') {
    if (!Number.isInteger(Number(row.points)) || Number(row.points) === 0 || Number(row.points) < -100 || Number(row.points) > 100
      || clean_(row.reason).length < 3 || clean_(row.reason).length > 500) {
      throw apiError_('violates point_adjustments check', '23514');
    }
    if (!readTable_('players').some((player) => player.id === row.player_id && player.tournament_id === row.tournament_id)) {
      throw apiError_('ADJUSTMENT_PLAYER_INVALID', '23514');
    }
    row.created_by_email = sessionEmail_(accessToken, false) || null;
  }
}

function matches_(row, filters) {
  return (filters || []).every((filter) => filter.op === 'in'
    ? (filter.value || []).includes(row[filter.field])
    : row[filter.field] === filter.value);
}

function readTable_(name) {
  const sheet = spreadsheet_().getSheetByName(name);
  if (!sheet) throw apiError_('Database is not initialized. Run Initialize database from the Sheet menu.', 'SETUP_REQUIRED');
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 2, lastRow - 1, 1).getValues()
    .map((cell) => cell[0])
    .filter((value) => value)
    .map((value) => JSON.parse(String(value)));
}

function writeTable_(name, rows) {
  const sheet = spreadsheet_().getSheetByName(name);
  if (!sheet) throw apiError_('Database is not initialized. Run Initialize database from the Sheet menu.', 'SETUP_REQUIRED');
  sheet.clearContents();
  sheet.getRange(1, 1, 1, 2).setValues([['id', 'record_json']]);
  if (!rows.length) return;
  sheet.getRange(2, 1, rows.length, 2).setValues(rows.map((row) => [row.id, JSON.stringify(row)]));
}

function spreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPERTY_SHEET_ID);
  if (!id) throw apiError_('Database is not initialized. Run Initialize database from the Sheet menu.', 'SETUP_REQUIRED');
  return SpreadsheetApp.openById(id);
}

function requireAdmin_(accessToken) {
  if (!sessionEmail_(accessToken, false)) throw apiError_('permission denied (admin only)', '42501');
}

function withLock_(callback) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return callback(); } finally { lock.releaseLock(); }
}

function clean_(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function sha256_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8)
    .map((byte) => ('0' + ((byte + 256) % 256).toString(16)).slice(-2)).join('');
}

function apiError_(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}
