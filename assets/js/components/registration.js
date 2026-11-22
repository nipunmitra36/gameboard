/* Player registration: one form, two mounts — the Join modal and the home page inline panel. */
(function () {
  'use strict';
  window.EF = window.EF || {};
  const { escapeHtml: e } = EF.utils;
  const ui = EF.ui;

  function formHtml(t, { compact = false } = {}) {
    const spots = t.max_players ? `<span class="meta-chip">${ui.icon('users', '')}Max ${e(t.max_players)} players</span>` : '';
    const intro = compact ? '' : `
        <div class="flex flex-wrap items-center gap-2">
          <span class="meta-chip">${ui.icon('trophy', '')}${e(t.name)}</span>
          ${t.season ? `<span class="meta-chip">${ui.icon('calendar', '')}${e(t.season)}</span>` : ''}
          ${spots}
        </div>
        <p class="text-sm text-muted leading-relaxed">
          ${t.auto_approve
            ? 'Complete the form to claim your place. Your registration is approved instantly.'
            : 'Complete the form to request a place. The tournament admin reviews every registration.'}
        </p>`;
    return `
      <form novalidate class="grid ${compact ? 'gap-3' : 'gap-4'}" data-reg-form>
        ${intro}
        <div data-form-alert hidden></div>
        <div class="grid ${compact ? '' : 'sm:grid-cols-2'} gap-${compact ? '3' : '4'}">
          ${ui.field({ name: 'player_name', label: 'Player Name', icon: 'user', placeholder: compact ? 'Your Name' : 'e.g. Alex Morgan', required: true, maxlength: 60, autocomplete: 'name' })}
          ${ui.field({ name: 'team_name', label: 'Team Name', icon: 'shield', placeholder: compact ? 'Team Name' : 'e.g. Northside FC', required: true, maxlength: 60, autocomplete: 'organization' })}
        </div>
        ${ui.field({ name: 'efootball_username', label: 'eFootball Username', icon: 'gamepad-2', placeholder: compact ? 'eFootball Username' : 'Your in-game name', required: true, maxlength: 40, autocomplete: 'nickname', hint: 'Exactly as it appears in eFootball, so opponents can find you.' })}
        ${ui.field({ name: 'email', label: 'Email Address', type: 'email', icon: 'mail', placeholder: compact ? 'Email Address' : 'you@example.com', required: true, maxlength: 254, autocomplete: 'email', hint: 'Used only by the admin to contact you. Never shown publicly.' })}
        ${ui.photoField({ label: compact ? 'Your DP' : 'Profile Photo (DP)' })}
        <div class="absolute -left-[9999px] w-px h-px overflow-hidden" aria-hidden="true">
          <label>Website <input type="text" name="website" tabindex="-1" autocomplete="off"></label>
        </div>
        <button type="submit" class="btn btn-primary btn-lg btn-arrow w-full mt-1" data-submit>${compact ? 'Register Now' : 'Complete Registration'}${ui.icon('chevron-right', '')}</button>
      </form>`;
  }

  function successHtml(values, status, { inline = false } = {}) {
    const approved = status === 'approved';
    return `
      <div class="text-center py-2">
        <div class="success-ring">${ui.icon('check', '')}</div>
        <h3 class="font-display text-3xl font-black italic uppercase text-white mt-6">You're in the draw</h3>
        <p class="text-soft mt-2 leading-relaxed">
          Welcome, <strong class="text-white">${e(values.player_name)}</strong> of <strong class="text-white">${e(values.team_name)}</strong>.
        </p>
        ${EF.utils.isAvatarData(values.avatar_url) ? `<div class="mt-4 flex justify-center">${ui.avatar(values, 'xl')}</div>` : ''}
        <div class="mt-4 flex justify-center">${ui.playerStatusBadge(status)}</div>
        <p class="text-sm text-muted mt-4 max-w-sm mx-auto leading-relaxed">
          ${approved
            ? 'Your place is confirmed. Watch the fixtures page for your first match.'
            : 'Your registration is pending admin approval. You will appear as approved on the player list once confirmed.'}
        </p>
        <div class="mt-7 grid ${inline ? '' : 'sm:grid-cols-2'} gap-3">
          <a href="players.html" class="btn btn-secondary">${ui.icon('users', '')}View Player List</a>
          ${inline
            ? '<button type="button" class="btn btn-ghost" data-register-another>Register another player</button>'
            : '<button type="button" class="btn btn-primary" data-close>Done</button>'}
        </div>
      </div>`;
  }

  /** host: { body: Element, setBody(html) } — a modal or an inline container. */
  function bindForm(host, t, { inline = false } = {}) {
    const form = host.body.querySelector('[data-reg-form]');
    const submit = form.querySelector('[data-submit]');
    ui.liveClear(form);
    ui.bindPhotoFields(form);

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (submit.disabled) return;
      const values = ui.readForm(form);
      ui.formAlert(form, null);

      // Bots fill hidden fields; humans never see this one.
      if (values.website) { host.setBody(successHtml(values, 'pending', { inline })); return; }

      const errors = EF.utils.validatePlayer(values);
      if (Object.keys(errors).length) {
        ui.showErrors(form, errors);
        ui.formAlert(form, 'Please fix the highlighted fields and try again.');
        return;
      }
      ui.clearErrors(form);
      ui.setLoading(submit, true, 'Registering');

      try {
        const result = await EF.api.registerPlayer(values);
        const status = (result && result.status) || (t.auto_approve ? 'approved' : 'pending');
        host.setBody(successHtml(values, status, { inline }));
        ui.toast('Registration submitted successfully.', 'success');
        window.dispatchEvent(new CustomEvent('ef:player-registered', {
          detail: { id: result && result.id, status, player_name: values.player_name },
        }));
      } catch (err) {
        const message = EF.api.friendlyError(err);
        const raw = String((err && err.message) || '');
        if (raw.includes('DUPLICATE_EMAIL') || raw.includes('INVALID_EMAIL')) ui.showErrors(form, { email: message });
        else if (raw.includes('DUPLICATE_USERNAME')) ui.showErrors(form, { efootball_username: message });
        else if (raw.includes('INVALID_AVATAR')) ui.showErrors(form, { avatar_url: message });
        ui.formAlert(form, message);
        ui.setLoading(submit, false);
      }
    });
  }

  function unavailableHtml(t, { inline = false } = {}) {
    if (!t) {
      return ui.state.empty({
        icon: 'calendar-x',
        title: 'No open tournament',
        message: 'There is no published tournament accepting registrations right now. Please check back soon.',
        action: inline ? '' : '<button type="button" class="btn btn-ghost btn-sm" data-close>Close</button>',
      });
    }
    return ui.state.empty({
      icon: 'lock',
      title: 'Registration closed',
      message: `Registration for ${t.name} is closed. Follow the fixtures and point table for the latest action.`,
      action: '<a href="fixtures.html" class="btn btn-secondary btn-sm">View Fixtures</a>',
    });
  }

  const registration = {
    async open() {
      const modal = ui.modal({ title: 'Join the Tournament', size: 'md', body: ui.state.loading('Checking registration') });
      let t = EF.state.tournament;
      try {
        if (t === undefined) {
          t = await EF.api.getPublishedTournament();
          EF.state.tournament = t;
        }
      } catch (err) {
        modal.setBody(ui.state.error({ message: EF.api.friendlyError(err), retry: false }));
        return;
      }
      if (!t || !t.registration_open) { modal.setBody(unavailableHtml(t)); return; }
      modal.setBody(formHtml(t));
      bindForm(modal, t);
    },

    /** Render the compact form inside a page element. */
    mountInline(container, t) {
      const host = {
        body: container,
        setBody(html) { container.innerHTML = html; ui.icons(); },
      };
      const render = () => {
        if (!t || !t.registration_open) { host.setBody(unavailableHtml(t, { inline: true })); return; }
        host.setBody(formHtml(t, { compact: true }));
        bindForm(host, t, { inline: true });
      };
      if (!container.dataset.bound) {
        container.dataset.bound = '1';
        container.addEventListener('click', (ev) => { if (ev.target.closest('[data-register-another]')) render(); });
      }
      // Don't wipe a form the visitor is typing into, or a success message, on live refresh.
      const form = container.querySelector('[data-reg-form]');
      const typing = form && Array.from(form.elements).some((el) => el.value && el.name !== 'website');
      const done = container.querySelector('.success-ring');
      if (typing || done) return;
      render();
    },

    bind() {
      if (registration.bound) return;
      registration.bound = true;
      document.addEventListener('click', (ev) => {
        const trigger = ev.target.closest('[data-action="join"]');
        if (!trigger) return;
        ev.preventDefault();
        // On the home page, focus the inline form instead of opening a dialog.
        const inline = document.querySelector('#home-join-panel [data-reg-form]');
        if (inline && inline.offsetParent !== null) {
          inline.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => inline.elements.player_name.focus({ preventScroll: true }), 350);
          return;
        }
        registration.open();
      });
      // Allow deep links such as index.html#join
      if (location.hash === '#join') registration.open();
    },
  };

  EF.registration = registration;
})();
