/* Reusable UI building blocks: icons, toasts, modals, states, badges, forms, renderers. */
(function () {
  'use strict';
  window.EF = window.EF || {};
  const { escapeHtml: e, initials, hue, formatTime, formatDate, relativeDay } = EF.utils;

  const ui = {};

  /* ---------------- Icons ---------------- */
  ui.icons = function () {
    if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
  };
  ui.icon = (name, cls = 'w-4 h-4') => `<i data-lucide="${name}" class="${cls}" aria-hidden="true"></i>`;

  // Football geometry (viewBox 0 0 40 40), computed once: a central pentagon,
  // five edge pentagons that the ball outline clips, and the seams between them.
  const BALL = (() => {
    const pt = (cx, cy, r, deg) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];
    const pent = (cx, cy, r, rot) => Array.from({ length: 5 }, (_, k) => pt(cx, cy, r, rot + k * 72));
    const d = (pts) => `M${pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join('L')}Z`;
    const centre = pent(20, 20, 5.4, -90);
    const outer = [-54, 18, 90, 162, 234].map((a) => {
      const [cx, cy] = pt(20, 20, 16.2, a);
      return pent(cx, cy, 5.6, a + 180);
    });
    const seams = [];
    centre.forEach(([x, y], k) => {
      const v = -90 + k * 72;
      const [ex, ey] = pt(20, 20, 10.6, v);
      seams.push(`M${x.toFixed(2)} ${y.toFixed(2)}L${ex.toFixed(2)} ${ey.toFixed(2)}`);
      // Join the seam end to the nearest corner of each neighbouring edge pentagon.
      [outer[(k + 4) % 5], outer[k]].forEach((poly) => {
        const [nx, ny] = poly.reduce((best, q) => (Math.hypot(q[0] - ex, q[1] - ey) < Math.hypot(best[0] - ex, best[1] - ey) ? q : best));
        seams.push(`M${ex.toFixed(2)} ${ey.toFixed(2)}L${nx.toFixed(2)} ${ny.toFixed(2)}`);
      });
    });
    return { patches: [centre, ...outer].map(d).join(''), seams: seams.join('') };
  })();

  // Each logo gets its own gradient ids: a shared id breaks when the first copy is hidden.
  // Gold crown used for match winners (gradient id is shared; every copy is identical).
  const CROWN_SVG = `<svg viewBox="0 0 32 24" width="100%" height="100%"><defs><linearGradient id="ef-crown-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3a8"/><stop offset=".45" stop-color="#ffd23f"/><stop offset="1" stop-color="#e08a00"/></linearGradient></defs><path d="M3 8.5 9.5 13 16 3l6.5 10L29 8.5 26.5 20h-21z" fill="url(#ef-crown-g)" stroke="#8a4b00" stroke-width="1.3" stroke-linejoin="round"/><rect x="5.5" y="19.5" width="21" height="3" rx="1.2" fill="url(#ef-crown-g)" stroke="#8a4b00" stroke-width="1.1"/><circle cx="16" cy="3" r="2" fill="#ff4d6d" stroke="#8a4b00" stroke-width=".8"/><circle cx="3" cy="8.5" r="1.7" fill="#4ade80" stroke="#8a4b00" stroke-width=".8"/><circle cx="29" cy="8.5" r="1.7" fill="#4ade80" stroke="#8a4b00" stroke-width=".8"/><circle cx="16" cy="15" r="1.6" fill="#3d6bff"/></svg>`;

  let logoCount = 0;
  ui.logo = (size = 38) => {
    logoCount += 1;
    const id = `ef-logo${logoCount}`;
    return `
    <svg width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true" class="ef-logo shrink-0">
      <defs>
        <linearGradient id="${id}-ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d4ff1a"/><stop offset=".55" stop-color="#7df0c0"/><stop offset="1" stop-color="#3d6bff"/></linearGradient>
        <radialGradient id="${id}-ball" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#e4e9f7"/><stop offset="1" stop-color="#9aa6c8"/></radialGradient>
        <radialGradient id="${id}-shade" cx=".36" cy=".3" r=".8"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#050b26" stop-opacity=".55"/></radialGradient>
        <clipPath id="${id}-clip"><circle cx="20" cy="20" r="14.6"/></clipPath>
      </defs>
      <g class="ef-logo__ring"><circle cx="20" cy="20" r="18.6" fill="none" stroke="url(#${id}-ring)" stroke-width="1.8" stroke-dasharray="80 6 18 6" stroke-linecap="round"/></g>
      <circle cx="20" cy="20" r="14.6" fill="url(#${id}-ball)"/>
      <g clip-path="url(#${id}-clip)">
        <g class="ef-logo__ball">
          <path d="${BALL.patches}" fill="#0c1430"/>
          <path d="${BALL.seams}" fill="none" stroke="#2a3558" stroke-width=".9" stroke-linecap="round"/>
        </g>
      </g>
      <circle cx="20" cy="20" r="14.6" fill="url(#${id}-shade)"/>
      <ellipse cx="15.2" cy="12.6" rx="4.6" ry="2.6" fill="#fff" opacity=".55" transform="rotate(-28 15.2 12.6)"/>
      <circle cx="20" cy="20" r="14.6" fill="none" stroke="rgba(212,255,26,.55)" stroke-width=".6"/>
    </svg>`;
  };

  /* ---------------- Toasts ---------------- */
  let toastStack = null;
  ui.toast = function (message, type = 'info', { title, timeout = 4800 } = {}) {
    if (!toastStack) {
      toastStack = document.createElement('div');
      toastStack.className = 'toast-stack';
      toastStack.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastStack);
    }
    const iconFor = { success: 'circle-check', error: 'triangle-alert', warning: 'circle-alert', info: 'info' };
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML = `
      <span class="toast__icon">${ui.icon(iconFor[type] || 'info')}</span>
      <div class="flex-1 min-w-0">
        ${title ? `<p class="font-semibold text-white text-sm">${e(title)}</p>` : ''}
        <p class="text-sm text-soft break-words">${e(message)}</p>
      </div>
      <button type="button" class="toast__close" aria-label="Dismiss notification">${ui.icon('x')}</button>`;
    toastStack.appendChild(el);
    // Keep at most three toasts on screen.
    const live = toastStack.querySelectorAll('.toast:not(.is-leaving)');
    if (live.length > 3) live[0].remove();
    ui.icons();
    const remove = () => {
      if (el.classList.contains('is-leaving')) return;
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 260);
    };
    el.querySelector('.toast__close').addEventListener('click', remove);
    if (timeout) setTimeout(remove, timeout);
  };

  /* ---------------- Modal ---------------- */
  let openModals = 0;
  const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

  ui.modal = function ({ title = '', body = '', size = 'md', dismissible = true, onClose } = {}) {
    const id = `modal-${Math.random().toString(36).slice(2, 8)}`;
    const root = document.createElement('div');
    root.className = 'ef-modal';
    root.innerHTML = `
      <div class="ef-modal__backdrop" ${dismissible ? 'data-close' : ''}></div>
      <div class="ef-modal__panel ef-modal__panel--${size}" role="dialog" aria-modal="true" aria-labelledby="${id}-title" tabindex="-1">
        <div class="ef-modal__head">
          <h2 id="${id}-title" class="font-display text-xl sm:text-2xl font-bold uppercase tracking-wide text-white">${e(title)}</h2>
          ${dismissible ? `<button type="button" class="icon-btn" data-close aria-label="Close dialog">${ui.icon('x')}</button>` : ''}
        </div>
        <div class="ef-modal__body"></div>
      </div>`;

    const panel = root.querySelector('.ef-modal__panel');
    const bodyEl = root.querySelector('.ef-modal__body');
    if (typeof body === 'string') bodyEl.innerHTML = body;
    else if (body) bodyEl.appendChild(body);

    const previousFocus = document.activeElement;
    let closed = false;

    const onKey = (ev) => {
      if (ev.key === 'Escape' && dismissible) { ev.stopPropagation(); close(); }
      if (ev.key === 'Tab') {
        const items = Array.from(root.querySelectorAll(FOCUSABLE)).filter((x) => x.offsetParent !== null);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
        else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
      }
    };

    function close() {
      if (closed) return;
      closed = true;
      root.removeEventListener('keydown', onKey);
      root.classList.add('is-closing');
      setTimeout(() => {
        root.remove();
        openModals = Math.max(0, openModals - 1);
        if (!openModals) document.body.classList.remove('modal-open');
        if (previousFocus && typeof previousFocus.focus === 'function' && previousFocus.isConnected) previousFocus.focus();
        if (onClose) onClose();
      }, 170);
    }

    root.addEventListener('click', (ev) => { if (ev.target.closest('[data-close]')) close(); });
    root.addEventListener('keydown', onKey);
    document.body.appendChild(root);
    openModals += 1;
    document.body.classList.add('modal-open');
    ui.icons();

    const focusInitial = () => {
      const fine = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
      const firstInput = fine && root.querySelector('.ef-modal__body input:not([type="hidden"]):not([tabindex="-1"]), .ef-modal__body select, .ef-modal__body textarea');
      (firstInput || panel).focus();
    };
    requestAnimationFrame(focusInitial);

    return {
      el: root,
      body: bodyEl,
      close,
      isOpen: () => !closed,
      setBody(html) { bodyEl.innerHTML = html; ui.icons(); requestAnimationFrame(focusInitial); },
    };
  };

  ui.confirm = function ({ title = 'Are you sure?', message = '', confirmText = 'Confirm', cancelText = 'Cancel', tone = 'danger' } = {}) {
    return new Promise((resolve) => {
      let confirmed = false;
      const m = ui.modal({
        title,
        size: 'sm',
        onClose: () => resolve(confirmed),
        body: `
          <p class="text-soft leading-relaxed">${e(message)}</p>
          <div class="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
            <button type="button" class="btn btn-ghost" data-close>${e(cancelText)}</button>
            <button type="button" class="btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}" data-confirm>${e(confirmText)}</button>
          </div>`,
      });
      m.body.querySelector('[data-confirm]').addEventListener('click', () => { confirmed = true; m.close(); });
    });
  };

  /**
   * Destructive confirmation: the button stays disabled until the user types `word`.
   * `details` and `extra` are trusted HTML built by the caller (escape user data first).
   * Resolves to null when cancelled, otherwise to the values of any inputs in `extra`.
   */
  ui.confirmTyped = function ({ title = 'Delete permanently?', message = '', details = '', extra = '', word = 'delete', confirmText = 'Delete' } = {}) {
    return new Promise((resolve) => {
      let result = null;
      const m = ui.modal({
        title,
        size: 'sm',
        onClose: () => resolve(result),
        body: `
          <form class="grid gap-4" data-typed novalidate>
            <div class="danger-note">${ui.icon('triangle-alert', '')}<p>${e(message)}</p></div>
            ${details}
            ${extra}
            <div class="field">
              <label class="label" for="typed-confirm">Type <code class="typed-word">${e(word)}</code> to confirm</label>
              <input id="typed-confirm" class="input" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${e(word)}" data-typed-input>
            </div>
            <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
              <button type="button" class="btn btn-ghost" data-close>Cancel</button>
              <button type="submit" class="btn btn-danger" data-confirm disabled>${ui.icon('trash-2', '')}${e(confirmText)}</button>
            </div>
          </form>`,
      });
      const form = m.body.querySelector('[data-typed]');
      const input = form.querySelector('[data-typed-input]');
      const button = form.querySelector('[data-confirm]');
      const matches = () => input.value.trim().toLowerCase() === word.toLowerCase();
      input.addEventListener('input', () => {
        button.disabled = !matches();
        input.classList.toggle('is-match', matches());
      });
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        if (!matches()) return;
        const values = {};
        form.querySelectorAll('input[name]').forEach((el) => { values[el.name] = el.type === 'checkbox' ? el.checked : el.value; });
        result = values;
        m.close();
      });
      ui.icons();
      setTimeout(() => input.focus(), 50);
    });
  };

  /** Small avatar stack + names, used inside delete confirmations. */
  ui.whoList = (people, max = 6) => `
    <div class="who-list">
      ${people.slice(0, max).map((p) => `<span class="who-list__item">${ui.avatar(p, 'sm')}<span>${e(p.player_name)}</span></span>`).join('')}
      ${people.length > max ? `<span class="who-list__more">+${people.length - max} more</span>` : ''}
    </div>`;

  /* ---------------- Loading / empty / error states ---------------- */
  ui.state = {
    loading(label = 'Loading') {
      return `<div class="state" role="status"><span class="spinner"></span><p class="text-sm text-muted mt-3">${e(label)}…</p></div>`;
    },
    skeleton(count = 3, height = 'h-20') {
      return `<div class="grid gap-3" aria-hidden="true">${Array.from({ length: count }, () => `<div class="skeleton ${height}"></div>`).join('')}</div>`;
    },
    empty({ icon = 'inbox', title = 'Nothing here yet', message = '', action = '' } = {}) {
      return `
        <div class="state">
          <div class="state__icon">${ui.icon(icon)}</div>
          <p class="font-display text-lg font-bold uppercase tracking-wide text-white mt-4">${e(title)}</p>
          ${message ? `<p class="text-sm text-muted mt-1.5 max-w-sm mx-auto leading-relaxed">${e(message)}</p>` : ''}
          ${action ? `<div class="mt-5 flex justify-center">${action}</div>` : ''}
        </div>`;
    },
    error({ message = 'Something went wrong.', retry = true } = {}) {
      return `
        <div class="state state--error" role="alert">
          <div class="state__icon">${ui.icon('wifi-off')}</div>
          <p class="font-display text-lg font-bold uppercase tracking-wide text-white mt-4">Could not load data</p>
          <p class="text-sm text-muted mt-1.5 max-w-md mx-auto leading-relaxed">${e(message)}</p>
          ${retry ? `<button type="button" class="btn btn-ghost btn-sm mt-5" data-retry>${ui.icon('rotate-cw')}Try again</button>` : ''}
        </div>`;
    },
  };

  // Any [data-retry] button re-runs the current page's loader.
  document.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-retry]')) document.dispatchEvent(new CustomEvent('ef:retry'));
  });

  /* ---------------- Badges & avatars ---------------- */
  const MATCH_STATUS = {
    upcoming: { label: 'Upcoming', cls: 'badge--upcoming', icon: 'clock' },
    live: { label: 'Live', cls: 'badge--live' },
    completed: { label: 'Completed', cls: 'badge--completed', icon: 'check' },
    postponed: { label: 'Postponed', cls: 'badge--postponed', icon: 'pause' },
  };
  const PLAYER_STATUS = {
    pending: { label: 'Pending', cls: 'badge--pending', icon: 'hourglass' },
    approved: { label: 'Approved', cls: 'badge--approved', icon: 'badge-check' },
    rejected: { label: 'Rejected', cls: 'badge--rejected', icon: 'circle-x' },
  };
  ui.MATCH_STATUS = MATCH_STATUS;
  ui.PLAYER_STATUS = PLAYER_STATUS;

  ui.matchStatusBadge = (status) => {
    const s = MATCH_STATUS[status] || MATCH_STATUS.upcoming;
    return `<span class="badge ${s.cls}">${status === 'live' ? '<span class="live-dot"></span>' : ui.icon(s.icon, '')}${s.label}</span>`;
  };

  ui.playerStatusBadge = (status) => {
    const s = PLAYER_STATUS[status] || PLAYER_STATUS.pending;
    return `<span class="badge ${s.cls}">${ui.icon(s.icon, '')}${s.label}</span>`;
  };

  /** Player avatar: their uploaded photo (DP) when present, otherwise coloured initials. Accepts a player object or a name. */
  ui.avatar = (who, size = 'md') => {
    const sizes = { sm: 'w-8 h-8 text-xs rounded-[10px]', md: 'w-10 h-10 text-sm', lg: 'w-14 h-14 text-lg', xl: 'w-20 h-20 text-2xl rounded-2xl' };
    const isObj = who && typeof who === 'object';
    const name = isObj ? who.player_name : who;
    const photo = isObj ? who.avatar_url : null;
    if (EF.utils.isAvatarData(photo)) {
      return `<img src="${photo}" alt="" class="avatar avatar--photo ${sizes[size] || sizes.md}" loading="lazy" decoding="async">`;
    }
    return `<span class="avatar ${sizes[size] || sizes.md}" style="--h:${hue(name)}" aria-hidden="true">${e(initials(name))}</span>`;
  };

  /** Profile-photo picker: preview + upload/remove. Value lives in a hidden input named `name`. */
  /** Avatar with a floating crown + gold ring when `win` is true; dimmed when `lose` is true. */
  ui.winnerAvatar = (who, size = 'md', { win = false, lose = false } = {}) => `
    <span class="win-avatar${win ? ' is-win' : ''}${lose ? ' is-lose' : ''}">
      ${ui.avatar(who, size)}
      ${win ? `<span class="win-crown" aria-hidden="true">${CROWN_SVG}</span>` : ''}
    </span>`;

  /** Open a match's proof screenshot in a dialog (fetched on demand). */
  ui.openProof = async function (match) {
    const title = match && match.home && match.away ? `${match.home.player_name} vs ${match.away.player_name}` : 'Match proof';
    const modal = ui.modal({ title: 'Overview', size: 'lg', body: ui.state.loading('Loading overview') });
    try {
      const src = (match && match.proof_url) || await EF.api.getMatchProof(match.id);
      if (!EF.utils.isProofData(src)) {
        modal.setBody(ui.state.empty({ icon: 'image-off', title: 'No proof uploaded', message: 'There is no proof image for this match yet.' }));
        return;
      }
      const score = Number.isInteger(match.home_score) && Number.isInteger(match.away_score) ? ` · ${match.home_score} - ${match.away_score}` : '';
      modal.setBody(`
        <figure class="proof-view">
          <button type="button" class="proof-view__img" title="Click to zoom" data-proof-zoom><img src="${src}" alt="Overview for ${e(title)}"></button>
          <figcaption class="proof-view__cap">
            <span>${ui.icon('shield-check', '')}<b>${e(title)}</b>${e(score)}</span>
            <a href="${src}" download="match-proof-${e(String(match.id).slice(0, 8))}.jpg" class="btn btn-ghost btn-xs">${ui.icon('download', '')}Download</a>
          </figcaption>
        </figure>`);
      // Browsers block opening data: URLs in a new tab, so zoom in place instead.
      const zoom = modal.body.querySelector('[data-proof-zoom]');
      zoom.addEventListener('click', () => zoom.classList.toggle('is-zoomed'));
      ui.icons();
    } catch (err) {
      console.error(err);
      modal.setBody(ui.state.error({ message: EF.api.friendlyError(err), retry: false }));
      ui.icons();
    }
  };

  /** "Winner" ribbon shown under the winning player's name. */
  ui.winChip = (label = 'Winner') => `<span class="win-chip">${ui.icon('trophy', '')}${e(label)}</span>`;

  /** Winner / draw for a match: { homeWin, awayWin, draw } (only for completed matches with scores). */
  ui.matchOutcome = (m) => {
    const done = m && m.status === 'completed' && Number.isInteger(m.home_score) && Number.isInteger(m.away_score);
    return {
      homeWin: done && m.home_score > m.away_score,
      awayWin: done && m.away_score > m.home_score,
      draw: done && m.home_score === m.away_score,
    };
  };

  ui.photoField = ({ name = 'avatar_url', value = '', label = 'Profile Photo (DP)', playerName = '' } = {}) => {
    const has = EF.utils.isAvatarData(value);
    return `
      <div class="photo-field" data-photo-field>
        <span class="photo-field__preview" data-photo-preview>${has ? `<img src="${value}" alt="Profile photo preview">` : ui.icon('camera', '')}</span>
        <div class="min-w-0 flex-1">
          <p class="photo-field__label">${e(label)} <span class="text-subtle font-normal">(optional)</span></p>
          <div class="flex flex-wrap gap-2 mt-1.5">
            <label class="btn btn-ghost btn-xs cursor-pointer">${ui.icon('upload', '')}<span data-photo-cta>${has ? 'Change photo' : 'Upload photo'}</span>
              <input type="file" accept="image/png,image/jpeg,image/webp" class="sr-only" data-photo-input aria-label="Upload profile photo${playerName ? ` for ${e(playerName)}` : ''}">
            </label>
            <button type="button" class="btn btn-ghost btn-xs" data-photo-remove ${has ? '' : 'hidden'}>${ui.icon('x', '')}Remove</button>
          </div>
          <p class="text-[11px] text-subtle mt-1">JPG, PNG or WebP · max 5 MB · cropped to a square</p>
          <p class="field-error" data-error-for="${name}" hidden></p>
        </div>
        <input type="hidden" name="${name}" value="${has ? value : ''}">
      </div>`;
  };

  /** Wire up every photo field inside root (call after rendering a form). */
  ui.bindPhotoFields = (root) => {
    root.querySelectorAll('[data-photo-field]').forEach((field) => {
      const input = field.querySelector('[data-photo-input]');
      const hidden = field.querySelector('input[type="hidden"]');
      const preview = field.querySelector('[data-photo-preview]');
      const remove = field.querySelector('[data-photo-remove]');
      const cta = field.querySelector('[data-photo-cta]');
      const error = field.querySelector('.field-error');
      const set = (dataUrl) => {
        hidden.value = dataUrl || '';
        preview.innerHTML = dataUrl ? `<img src="${dataUrl}" alt="Profile photo preview">` : ui.icon('camera', '');
        remove.hidden = !dataUrl;
        cta.textContent = dataUrl ? 'Change photo' : 'Upload photo';
        ui.icons();
      };
      input.addEventListener('change', async () => {
        const file = input.files && input.files[0];
        input.value = '';
        if (!file) return;
        error.hidden = true;
        preview.innerHTML = '<span class="spinner spinner--sm"></span>';
        try {
          set(await EF.utils.imageToAvatar(file));
        } catch (err) {
          set(hidden.value);
          error.textContent = err.message;
          error.hidden = false;
        }
      });
      remove.addEventListener('click', () => set(''));
    });
  };

  /* ---------------- Forms ---------------- */
  ui.field = function ({
    name, label, type = 'text', icon, placeholder = '', value = '', required = false,
    maxlength, min, max, step, autocomplete, as = 'input', options = [], hint, rows = 4, attrs = '',
  }) {
    const id = `f-${name}-${Math.random().toString(36).slice(2, 7)}`;
    const common = `id="${id}" name="${name}" ${required ? 'required aria-required="true"' : ''} ${attrs}`;
    let control;
    if (as === 'select') {
      control = `<select ${common} class="select">${options.map((o) => `
        <option value="${e(o.value)}" ${String(o.value) === String(value ?? '') ? 'selected' : ''} ${o.disabled ? 'disabled' : ''}>${e(o.label)}</option>`).join('')}
      </select>`;
    } else if (as === 'textarea') {
      control = `<textarea ${common} class="textarea" rows="${rows}" placeholder="${e(placeholder)}" ${maxlength ? `maxlength="${maxlength}"` : ''}>${e(value ?? '')}</textarea>`;
    } else {
      control = `<input ${common} type="${type}" class="input ${icon ? 'has-icon' : ''}" value="${e(value ?? '')}" placeholder="${e(placeholder)}"
        ${maxlength ? `maxlength="${maxlength}"` : ''} ${min !== undefined ? `min="${min}"` : ''} ${max !== undefined ? `max="${max}"` : ''}
        ${step !== undefined ? `step="${step}"` : ''} ${autocomplete ? `autocomplete="${autocomplete}"` : ''}>`;
    }
    return `
      <div class="field" data-field="${name}">
        ${label ? `<label class="label" for="${id}">${e(label)}${required ? '<span class="text-neon ml-0.5">*</span>' : ''}</label>` : ''}
        <div class="relative">
          ${icon && as === 'input' ? `<span class="input-icon">${ui.icon(icon, '')}</span>` : ''}
          ${control}
        </div>
        ${hint ? `<p class="text-xs text-subtle mt-1.5">${e(hint)}</p>` : ''}
        <p class="field-error" id="${id}-error" data-error-for="${name}" hidden></p>
      </div>`;
  };

  ui.switchField = ({ name, label, description = '', checked = false }) => `
    <label class="switch-row">
      <span class="min-w-0">
        <span class="block font-semibold text-white text-sm">${e(label)}</span>
        ${description ? `<span class="block text-xs text-muted mt-1 leading-relaxed">${e(description)}</span>` : ''}
      </span>
      <span class="switch"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}><span class="switch__track"></span></span>
    </label>`;

  ui.readForm = function (form) {
    const out = {};
    Array.from(form.elements).forEach((el) => {
      if (!el.name) return;
      out[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    });
    return out;
  };

  ui.clearErrors = function (form) {
    form.querySelectorAll('.is-invalid').forEach((el) => {
      el.classList.remove('is-invalid');
      el.removeAttribute('aria-invalid');
    });
    form.querySelectorAll('[data-error-for]').forEach((slot) => { slot.hidden = true; slot.textContent = ''; });
  };

  ui.showErrors = function (form, errors) {
    ui.clearErrors(form);
    let first = null;
    Object.entries(errors).forEach(([name, message]) => {
      const control = form.elements[name];
      const slot = form.querySelector(`[data-error-for="${name}"]`);
      if (control && control.classList) {
        control.classList.add('is-invalid');
        control.setAttribute('aria-invalid', 'true');
        if (slot && slot.id) control.setAttribute('aria-describedby', slot.id);
        first = first || control;
      }
      if (slot) { slot.textContent = message; slot.hidden = false; }
    });
    if (first) first.focus();
  };

  /** Clear a field's error as soon as the user edits it. */
  ui.liveClear = function (form) {
    form.addEventListener('input', (ev) => {
      const el = ev.target;
      if (!el.name || !el.classList.contains('is-invalid')) return;
      el.classList.remove('is-invalid');
      el.removeAttribute('aria-invalid');
      const slot = form.querySelector(`[data-error-for="${el.name}"]`);
      if (slot) slot.hidden = true;
    });
  };

  ui.formAlert = function (form, message, type = 'error') {
    const box = form.querySelector('[data-form-alert]');
    if (!box) return;
    if (!message) { box.hidden = true; box.innerHTML = ''; return; }
    const icon = { error: 'triangle-alert', success: 'circle-check', info: 'info' }[type] || 'info';
    box.className = `form-alert form-alert--${type}`;
    box.setAttribute('role', type === 'error' ? 'alert' : 'status');
    box.innerHTML = `${ui.icon(icon, '')}<span>${e(message)}</span>`;
    box.hidden = false;
    ui.icons();
  };

  ui.setLoading = function (button, loading, label = 'Please wait') {
    if (!button) return;
    if (loading) {
      if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.innerHTML = `<span class="spinner spinner--sm"></span>${e(label)}`;
    } else {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      if (button.dataset.originalHtml) {
        button.innerHTML = button.dataset.originalHtml;
        delete button.dataset.originalHtml;
      }
      ui.icons();
    }
  };

  /* ---------------- Shared renderers ---------------- */
  const hasScore = (m) => Number.isInteger(m.home_score) && Number.isInteger(m.away_score)
    && (m.status === 'completed' || m.status === 'live');

  ui.matchResultText = function (m) {
    if (m.status === 'completed' && hasScore(m)) {
      if (m.home_score > m.away_score) return `${m.home ? m.home.player_name : 'Home'} won`;
      if (m.away_score > m.home_score) return `${m.away ? m.away.player_name : 'Away'} won`;
      return 'Draw';
    }
    if (m.status === 'live') return 'In progress';
    if (m.status === 'postponed') return 'Postponed';
    return 'Not played yet';
  };

  ui.matchCard = function (m) {
    const scored = hasScore(m);
    const { homeWin, awayWin, draw } = ui.matchOutcome(m);

    const side = (player, winner, loser, alignRight) => `
      <div class="match-side flex items-center gap-3 min-w-0 ${alignRight ? 'flex-row-reverse text-right' : ''}${winner ? ' is-win' : ''}${loser ? ' is-lose' : ''}">
        <span class="hidden min-[400px]:inline-flex">${ui.winnerAvatar(player || 'TBD', 'md', { win: winner, lose: loser })}</span>
        <div class="min-w-0">
          <p class="font-display text-[17px] sm:text-lg font-bold leading-tight truncate ${winner ? 'text-gold' : 'text-white'}">${winner ? `<span class="min-[400px]:hidden">👑 </span>` : ''}${e(player ? player.player_name : 'TBD')}</p>
          <p class="text-xs text-muted truncate">${e(player ? player.team_name : '—')}</p>
          ${player && player.efootball_username ? `<p class="match-user" title="eFootball username">${ui.icon('gamepad-2', '')}<span>${e(player.efootball_username)}</span></p>` : ''}
          ${winner ? ui.winChip() : ''}
        </div>
      </div>`;

    const centre = scored
      ? `<div class="text-center"><div class="scoreline ${m.status === 'live' ? 'is-live' : ''}" aria-label="Score ${m.home_score} to ${m.away_score}"><span class="${homeWin ? 'is-win' : ''}">${m.home_score}</span><span class="scoreline__sep">:</span><span class="${awayWin ? 'is-win' : ''}">${m.away_score}</span></div>${draw ? '<span class="draw-chip">Draw</span>' : ''}</div>`
      : `<div class="text-center px-1"><p class="vs">VS</p><p class="text-[11px] text-muted mt-0.5 whitespace-nowrap">${e(formatTime(m.scheduled_at))}</p></div>`;

    const resultTone = m.status === 'completed' ? 'text-neon' : m.status === 'live' ? 'text-danger' : m.status === 'postponed' ? 'text-warn' : 'text-muted';
    const day = relativeDay(m.scheduled_at) || formatDate(m.scheduled_at);

    return `
      <article class="match-card glass card p-4 sm:p-5 status-${e(m.status)}">
        <header class="flex items-center justify-between gap-3">
          <span class="text-[11px] font-semibold uppercase tracking-[.16em] text-muted truncate">
            ${m.round ? `Round ${e(m.round)}` : 'Fixture'}${m.venue ? ` · ${e(m.venue)}` : ''}
          </span>
          ${ui.matchStatusBadge(m.status)}
        </header>
        <div class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-4 mt-4">
          ${side(m.home, homeWin, awayWin, false)}
          ${centre}
          ${side(m.away, awayWin, homeWin, true)}
        </div>
        <footer class="mt-4 pt-3 border-t border-white/5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
          <span class="inline-flex items-center gap-1.5">${ui.icon('calendar', 'w-3.5 h-3.5')}<span>${e(day)}</span></span>
          <span class="inline-flex items-center gap-1.5">${ui.icon('clock', 'w-3.5 h-3.5')}<span>${e(formatTime(m.scheduled_at))}</span></span>
          <span class="inline-flex items-center gap-1.5 ml-auto font-semibold ${resultTone}">${ui.icon('flag', 'w-3.5 h-3.5')}<span>${e(ui.matchResultText(m))}</span></span>
          ${EF.utils.hasProof(m) ? `<button type="button" class="proof-btn" data-view-proof="${e(m.id)}" aria-label="Overview: view result proof">${ui.icon('image', '')}Overview</button>` : ''}
        </footer>
      </article>`;
  };

  ui.formPills = (form) => (form && form.length
    ? `<span class="form-pills">${form.map((r) => `<span class="form-pill form-${r}" title="${{ W: 'Win', D: 'Draw', L: 'Loss' }[r]}">${r}</span>`).join('')}</span>`
    : '<span class="text-subtle">—</span>');

  /** Tight table for narrow panels: Pos, Player, MP, W, D, L, GD, Pts. */
  /** Home "Top 4": ranked player rows with medal badges, photos and key stats. */
  ui.miniStandingsTable = function (rows, { limit = 4 } = {}) {
    const gd = (n) => (n > 0 ? `+${n}` : String(n));
    return `
      <ol class="top-list">
        ${rows.slice(0, limit).map((r) => `
          <li class="top-row rank-${r.position <= 3 ? r.position : 'n'}${r.position === 1 && r.played > 0 ? ' is-leader' : ''}">
            <span class="top-row__pos" aria-label="Position ${r.position}">${r.position}</span>
            <span class="top-row__dp">${ui.avatar(r.player, 'md')}</span>
            <div class="top-row__who">
              <p class="top-row__name">${e(r.player.player_name)}</p>
              <p class="top-row__line">
                <span title="Played">${r.played} MP</span>
                <span class="top-row__wdl" title="Wins / Draws / Losses"><b class="w">${r.wins}W</b><b class="d">${r.draws}D</b><b class="l">${r.losses}L</b></span>
                <span class="${r.gd > 0 ? 'text-neon' : r.gd < 0 ? 'text-danger' : ''}" title="Goal difference">${gd(r.gd)} GD</span>
              </p>
            </div>
            <div class="top-row__pts"><span>${r.points}</span><small>PTS</small></div>
          </li>`).join('')}
      </ol>`;
  };

  ui.standingsTable = function (rows, { limit, compact = false, showForm = true, showAdjustment = false } = {}) {
    const list = limit ? rows.slice(0, limit) : rows;
    const gdText = (gd) => (gd > 0 ? `+${gd}` : String(gd));
    const gdTone = (gd) => (gd > 0 ? 'text-neon' : gd < 0 ? 'text-danger' : '');
    const adjText = (n) => (n > 0 ? `+${n}` : String(n));

    return `
      <div class="table-wrap">
        <table class="ef-table">
          <thead>
            <tr>
              <th class="num" scope="col" title="Position">Pos</th>
              <th scope="col">Player</th>
              <th class="num" scope="col" title="Matches played">MP</th>
              <th class="num" scope="col" title="Wins">W</th>
              <th class="num" scope="col" title="Draws">D</th>
              <th class="num" scope="col" title="Losses">L</th>
              ${compact ? '' : '<th class="num" scope="col" title="Goals for">GF</th><th class="num" scope="col" title="Goals against">GA</th>'}
              <th class="num" scope="col" title="Goal difference">GD</th>
              ${showAdjustment ? '<th class="num" scope="col" title="Manual point adjustment">Adj</th>' : ''}
              <th class="num" scope="col" title="Points">Pts</th>
              ${showForm && !compact ? '<th scope="col" title="Last five matches, most recent first">Form</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${list.map((r) => `
              <tr class="${r.position <= 3 && r.played > 0 ? 'is-top' : ''} ${r.position === 1 && r.played > 0 ? 'is-leader' : ''}">
                <td class="num"><span class="pos-chip ${r.played > 0 && r.position <= 3 ? `pos-${r.position}` : ''}">${r.position}</span></td>
                <td>
                  <div class="flex items-center gap-3 min-w-[170px]">
                    ${ui.avatar(r.player, 'sm')}
                    <div class="min-w-0">
                      <p class="font-semibold text-white truncate max-w-[220px]">${e(r.player.player_name)}</p>
                      <p class="text-xs text-muted truncate max-w-[220px]">${e(r.player.team_name)}</p>
                    </div>
                  </div>
                </td>
                <td class="num">${r.played}</td>
                <td class="num">${r.wins}</td>
                <td class="num">${r.draws}</td>
                <td class="num">${r.losses}</td>
                ${compact ? '' : `<td class="num">${r.gf}</td><td class="num">${r.ga}</td>`}
                <td class="num font-semibold ${gdTone(r.gd)}">${gdText(r.gd)}</td>
                ${showAdjustment ? `<td class="num ${r.adjustment > 0 ? 'text-neon' : r.adjustment < 0 ? 'text-danger' : 'text-subtle'}">${r.adjustment ? adjText(r.adjustment) : '—'}</td>` : ''}
                <td class="num"><span class="pts">${r.points}</span></td>
                ${showForm && !compact ? `<td>${ui.formPills(r.form)}</td>` : ''}
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  };

  /** Generated team crest from the team name (original badge, no real club marks). */
  ui.crest = (team, size = '') => `<span class="crest ${size ? `crest--${size}` : ''}" style="--h:${hue(team || '?')}" title="${e(team || '')}" aria-hidden="true">${e(initials(team || '?'))}</span>`;

  /** Compact one-line fixture/result row used in home page panels. */
  /** Home match card: header (round + status/date), two players with photos, VS or the score. */
  ui.miniMatchRow = function (m) {
    const scored = Number.isInteger(m.home_score) && Number.isInteger(m.away_score) && (m.status === 'completed' || m.status === 'live');
    const day = relativeDay(m.scheduled_at) || formatDate(m.scheduled_at, { day: 'numeric', month: 'short' });
    const home = m.home || { player_name: 'TBD' };
    const away = m.away || { player_name: 'TBD' };
    const { homeWin, awayWin, draw } = ui.matchOutcome(m);
    const done = homeWin || awayWin || draw;
    const side = (p, win, lose, align) => `
      <div class="mcard__side mcard__side--${align}${win ? ' is-win' : ''}${lose ? ' is-lose' : ''}">
        <span class="mcard__dp">${ui.winnerAvatar(p, 'lg', { win, lose })}</span>
        <p class="mcard__name">${e(p.player_name || 'TBD')}</p>
        <p class="mcard__team">${e(p.team_name || '—')}</p>
        ${win ? ui.winChip() : ''}
      </div>`;
    const status = m.status === 'live'
      ? '<span class="mcard__chip mcard__chip--live"><span class="live-dot"></span>Live</span>'
      : done
        ? `<span class="mcard__chip mcard__chip--ft">${ui.icon('check', '')}Full time</span>`
        : m.status === 'postponed'
          ? `<span class="mcard__chip mcard__chip--warn">${ui.icon('clock', '')}Postponed</span>`
          : `<span class="mcard__chip">${ui.icon('calendar', '')}${e(day)}</span>`;
    const mid = scored
      ? `<div class="mcard__score${m.status === 'live' ? ' is-live' : ''}"><span class="${homeWin ? 'is-win' : ''}">${m.home_score}</span><i>:</i><span class="${awayWin ? 'is-win' : ''}">${m.away_score}</span></div>
         ${draw ? '<span class="draw-chip">Draw</span>' : `<p class="mcard__when">${e(done ? day : formatTime(m.scheduled_at))}</p>`}`
      : `<div class="mcard__vs">VS</div><p class="mcard__when">${ui.icon('clock', '')}${e(formatTime(m.scheduled_at))}</p>`;
    // A div (not a link) so the Overview button can sit inside; a stretched link keeps the whole card clickable.
    const overview = done && EF.utils.hasProof(m)
      ? `<button type="button" class="proof-btn mcard__proof" data-view-proof="${e(m.id)}" aria-label="Overview: view result proof">${ui.icon('image', '')}Overview</button>`
      : '';
    return `
      <div class="mcard mcard--${e(m.status)}">
        <a href="fixtures.html" class="mcard__link" aria-label="${e(home.player_name || 'TBD')} vs ${e(away.player_name || 'TBD')}: open fixtures"></a>
        <header class="mcard__head">
          <span class="mcard__round">${m.round ? `Round ${e(m.round)}` : 'Match'}${m.venue ? ` · ${e(m.venue)}` : ''}</span>
          ${status}
        </header>
        <div class="mcard__body">
          ${side(home, homeWin, awayWin, 'home')}
          <div class="mcard__mid">${mid}</div>
          ${side(away, awayWin, homeWin, 'away')}
        </div>
        ${overview ? `<div class="mcard__foot">${overview}</div>` : ''}
      </div>`;
  };

  EF.ui = ui;
})();
