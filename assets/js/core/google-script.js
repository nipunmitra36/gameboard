/* Apps Script transport and Supabase-compatible data client. */
(function () {
  'use strict';
  window.EF = window.EF || {};

  const SESSION_KEY = 'ef_google_script_session_v1';
  const cfg = () => window.EF_CONFIG || {};
  const token = () => {
    try {
      const session = JSON.parse(localStorage.getItem(SESSION_KEY));
      return session && session.access_token;
    } catch (_) {
      return null;
    }
  };
  const saveSession = (session) => {
    try {
      if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      else localStorage.removeItem(SESSION_KEY);
    } catch (err) {
      throw new Error('Browser storage is blocked; the admin session cannot be saved.');
    }
  };

  let requestId = 0;
  function request(action, payload = {}) {
    const url = String(cfg().APPS_SCRIPT_URL || '').trim();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(url)) {
      return Promise.reject(new Error('Set the deployed Google Apps Script /exec URL in assets/js/config.js.'));
    }

    return new Promise((resolve, reject) => {
      const id = `ef-gas-${Date.now()}-${++requestId}`;
      const nonce = `${id}-${Math.random().toString(36).slice(2)}`;
      const frame = document.createElement('iframe');
      const form = document.createElement('form');
      const payloadInput = document.createElement('input');
      const nonceInput = document.createElement('input');
      const timeout = window.setTimeout(() => finish(new Error('Google Sheets request timed out. Try again.')), 45000);

      frame.name = id;
      frame.hidden = true;
      form.hidden = true;
      form.method = 'post';
      form.action = url;
      form.target = id;
      payloadInput.type = 'hidden';
      payloadInput.name = 'payload';
      payloadInput.value = JSON.stringify({ action, ...payload });
      nonceInput.type = 'hidden';
      nonceInput.name = 'nonce';
      nonceInput.value = nonce;
      form.append(payloadInput, nonceInput);

      const onMessage = (event) => {
        if (event.source !== frame.contentWindow || !event.data || event.data.nonce !== nonce) return;
        if (event.data.error) {
          const error = new Error(event.data.error.message || 'Google Sheets request failed.');
          error.code = event.data.error.code || 'GOOGLE_SCRIPT';
          finish(error);
        } else {
          finish(null, event.data.data);
        }
      };
      function finish(error, data) {
        window.clearTimeout(timeout);
        window.removeEventListener('message', onMessage);
        form.remove();
        frame.remove();
        if (error) reject(error);
        else resolve(data);
      }

      window.addEventListener('message', onMessage);
      document.body.append(frame, form);
      form.submit();
    });
  }

  function dbError(message, code) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  class Query {
    constructor(table) {
      this.table = table;
      this.filters = [];
      this.orders = [];
      this.max = null;
      this.mode = 'many';
      this.op = 'select';
      this.values = null;
    }
    select() { return this; }
    eq(field, value) { this.filters.push({ field, op: 'eq', value }); return this; }
    in(field, values) { this.filters.push({ field, op: 'in', value: values }); return this; }
    order(field, options = {}) { this.orders.push({ field, ascending: options.ascending !== false }); return this; }
    limit(count) { this.max = count; return this; }
    single() { this.mode = 'single'; return this; }
    maybeSingle() { this.mode = 'maybe'; return this; }
    insert(values) { this.op = 'insert'; this.values = values; return this; }
    update(values) { this.op = 'update'; this.values = values; return this; }
    delete() { this.op = 'delete'; return this; }
    then(resolve, reject) { return this.run().then(resolve, reject); }

    async run() {
      try {
        const rows = await request('query', {
          token: token(),
          table: this.table,
          op: this.op,
          values: this.values,
          filters: this.filters,
          orders: this.orders,
          max: this.max,
        });
        if (this.mode === 'single') {
          if (!Array.isArray(rows) || rows.length !== 1) {
            throw dbError('JSON object requested, multiple (or no) rows returned', 'PGRST116');
          }
          return { data: rows[0], error: null };
        }
        if (this.mode === 'maybe') return { data: (rows && rows[0]) || null, error: null };
        return { data: rows, error: null };
      } catch (error) {
        return { data: null, error: { message: error.message, code: error.code || 'GOOGLE_SCRIPT' } };
      }
    }
  }

  const listeners = new Set();
  const notifyAuth = (event, session) => listeners.forEach((callback) => callback(event, session));

  EF.createGoogleScriptClient = function () {
    return {
      from: (table) => new Query(table),
      rpc: async (name, args = {}) => {
        try {
          return { data: await request('rpc', { token: token(), name, args }), error: null };
        } catch (error) {
          return { data: null, error: { message: error.message, code: error.code || 'GOOGLE_SCRIPT' } };
        }
      },
      auth: {
        async getSession() {
          const session = await request('auth_session', { token: token() });
          saveSession(session);
          return { data: { session }, error: null };
        },
        async signInWithPassword({ email, password }) {
          const session = await request('auth_login', { email, password });
          saveSession(session);
          notifyAuth('SIGNED_IN', session);
          return { data: { session }, error: null };
        },
        async signOut() {
          const currentToken = token();
          try {
            if (currentToken) await request('auth_logout', { token: currentToken });
          } finally {
            saveSession(null);
            notifyAuth('SIGNED_OUT', null);
          }
          return { error: null };
        },
        onAuthStateChange(callback) {
          listeners.add(callback);
          return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
        },
      },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel() {},
    };
  };
})();
