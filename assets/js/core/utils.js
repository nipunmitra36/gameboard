/* Generic helpers: escaping, dates, validation, DOM shortcuts. */
(function () {
  'use strict';
  window.EF = window.EF || {};

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  const utils = {
    escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
      })[c]);
    },

    qs(selector, root = document) { return root.querySelector(selector); },
    qsa(selector, root = document) { return Array.from(root.querySelectorAll(selector)); },

    debounce(fn, wait = 250) {
      let timer;
      return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), wait);
      };
    },

    clean(value) { return String(value ?? '').replace(/\s+/g, ' ').trim(); },

    nullable(value) {
      const v = typeof value === 'string' ? value.trim() : value;
      return v === '' || v === undefined ? null : v;
    },

    toInt(value) {
      if (value === '' || value === null || value === undefined) return null;
      const n = Number(value);
      return Number.isInteger(n) ? n : NaN;
    },

    plural(count, singular, pluralWord) {
      return `${count} ${count === 1 ? singular : (pluralWord || singular + 's')}`;
    },

    /* ---------- Dates ---------- */
    parseDate(value) {
      if (!value) return null;
      const d = value instanceof Date ? value : new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    },

    formatDate(value, options = { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) {
      const d = utils.parseDate(value);
      return d ? new Intl.DateTimeFormat(undefined, options).format(d) : '—';
    },

    formatShortDate(value) {
      return utils.formatDate(value, { day: '2-digit', month: 'short' });
    },

    formatTime(value) {
      const d = utils.parseDate(value);
      return d ? new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(d) : '—';
    },

    formatDateTime(value) {
      const d = utils.parseDate(value);
      return d ? `${utils.formatDate(d, { day: '2-digit', month: 'short', year: 'numeric' })}, ${utils.formatTime(d)}` : '—';
    },

    /** Local calendar day key, e.g. 2026-11-24. */
    dayKey(value) {
      const d = utils.parseDate(value);
      if (!d) return '';
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    },

    relativeDay(value) {
      const d = utils.parseDate(value);
      if (!d) return null;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const day = new Date(d);
      day.setHours(0, 0, 0, 0);
      const diff = Math.round((day - today) / 86400000);
      if (diff === 0) return 'Today';
      if (diff === 1) return 'Tomorrow';
      if (diff === -1) return 'Yesterday';
      return null;
    },

    toDateInput(value) { return utils.dayKey(value); },

    toTimeInput(value) {
      const d = utils.parseDate(value);
      if (!d) return '';
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    },

    /** Combine local date + time inputs into an ISO timestamp (UTC). */
    combineDateTime(date, time) {
      if (!date) return null;
      const d = new Date(`${date}T${time || '00:00'}`);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    },

    /* ---------- Display helpers ---------- */
    initials(name) {
      const parts = utils.clean(name).split(' ').filter(Boolean);
      if (!parts.length) return '?';
      return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : (parts[0][1] || ''))).toUpperCase();
    },

    hue(text) {
      let h = 0;
      const s = String(text || '');
      for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) % 360;
      return h;
    },

    isEmail(value) { return EMAIL_RE.test(String(value || '').trim()); },

    /* ---------- Profile photos ---------- */
    AVATAR_RE: /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/,

    /** True only for small, well-formed image data URLs (safe to put in <img src>). */
    isAvatarData(value) {
      return typeof value === 'string' && value.length <= 300000 && utils.AVATAR_RE.test(value);
    },

    /** Read an image file, centre-crop it to a square and compress it to a small JPEG data URL. */
    imageToAvatar(file, size = 192) {
      return new Promise((resolve, reject) => {
        if (!file) { reject(new Error('No file selected.')); return; }
        if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) { reject(new Error('Choose a JPG, PNG or WebP image.')); return; }
        if (file.size > 5 * 1024 * 1024) { reject(new Error('Image must be 5 MB or smaller.')); return; }
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('That image could not be read.'));
        reader.onload = () => {
          const img = new Image();
          img.onerror = () => reject(new Error('That image could not be read.'));
          img.onload = () => {
            const side = Math.min(img.naturalWidth, img.naturalHeight);
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingQuality = 'high';
            ctx.fillStyle = '#0b1645';
            ctx.fillRect(0, 0, size, size);
            ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
            resolve(canvas.toDataURL('image/jpeg', 0.82));
          };
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
    },

    PROOF_MAX_CHARS: 1500000,

    /** True for a well-formed proof image data URL within the database limit. */
    isProofData(value) {
      return typeof value === 'string' && value.length <= utils.PROOF_MAX_CHARS && utils.AVATAR_RE.test(value);
    },

    /** Does this match have a proof image? (has_proof from Supabase, proof_url from local storage). */
    hasProof(m) {
      return Boolean(m && (m.has_proof || m.proof_url));
    },

    /**
     * Read a screenshot, scale it down (keeping its shape) and compress it to a JPEG data URL
     * that fits the database limit. Tries smaller sizes / lower quality until it fits.
     */
    imageToProof(file) {
      return new Promise((resolve, reject) => {
        if (!file) { reject(new Error('No file selected.')); return; }
        if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) { reject(new Error('Choose a JPG, PNG or WebP image.')); return; }
        if (file.size > 15 * 1024 * 1024) { reject(new Error('Image must be 15 MB or smaller.')); return; }
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That image could not be read.')); };
        img.onload = () => {
          URL.revokeObjectURL(url);
          const attempts = [[1600, 0.82], [1400, 0.75], [1200, 0.7], [1000, 0.65], [800, 0.6]];
          for (const [maxSide, quality] of attempts) {
            const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingQuality = 'high';
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const data = canvas.toDataURL('image/jpeg', quality);
            if (data.length <= utils.PROOF_MAX_CHARS) { resolve(data); return; }
          }
          reject(new Error('That image is too detailed to store. Try a smaller screenshot.'));
        };
        img.src = url;
      });
    },

    /* ---------- Validation ---------- */
    rules: {
      required: (label) => ({
        test: (v) => String(v ?? '').trim().length > 0,
        message: `${label} is required.`,
      }),
      length: (label, min, max) => ({
        test: (v) => {
          const len = String(v ?? '').trim().length;
          return len === 0 || (len >= min && len <= max);
        },
        message: `${label} must be between ${min} and ${max} characters.`,
      }),
      maxLength: (label, max) => ({
        test: (v) => String(v ?? '').trim().length <= max,
        message: `${label} must be ${max} characters or fewer.`,
      }),
      email: () => ({
        test: (v) => !String(v ?? '').trim() || utils.isEmail(v),
        message: 'Enter a valid email address.',
      }),
      intRange: (label, min, max, { optional = true } = {}) => ({
        test: (v) => {
          if (v === '' || v === null || v === undefined) return optional;
          const n = Number(v);
          return Number.isInteger(n) && n >= min && n <= max;
        },
        message: `${label} must be a whole number between ${min} and ${max}.`,
      }),
      custom: (test, message) => ({ test, message }),
    },

    /** Run a schema of rules. Returns { field: message } for failing fields. */
    validate(data, schema) {
      const errors = {};
      Object.entries(schema).forEach(([field, rules]) => {
        for (const rule of rules) {
          if (!rule.test(data[field], data)) {
            errors[field] = rule.message;
            break;
          }
        }
      });
      return errors;
    },

    validatePlayer(values) {
      const r = utils.rules;
      return utils.validate(values, {
        player_name: [r.required('Player name'), r.length('Player name', 2, 60)],
        team_name: [r.required('Team name'), r.length('Team name', 2, 60)],
        efootball_username: [r.required('eFootball username'), r.length('eFootball username', 3, 40)],
        email: [r.required('Email address'), r.email(), r.maxLength('Email address', 254)],
      });
    },
  };

  window.EF.utils = utils;
})();
