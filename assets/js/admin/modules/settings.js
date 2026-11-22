/* Admin module 7: Tournament settings (information, rules, scoring, visibility). */
(function () {
  'use strict';
  const { escapeHtml: e, nullable, toInt } = EF.utils;
  const ui = EF.ui;
  const admin = EF.admin;
  const api = EF.api;

  const FORMATS = ['League', 'Round Robin', 'Double Round Robin', 'Group Stage', 'Cup'];

  function parse(values) {
    const r = EF.utils.rules;
    const errors = EF.utils.validate(values, {
      name: [r.required('Tournament name'), r.length('Tournament name', 3, 120)],
      season: [r.maxLength('Season', 60)],
      description: [r.maxLength('Description', 2000)],
      platform: [r.maxLength('Platform', 80)],
      prize: [r.maxLength('Total prize', 60)],
      max_players: [r.intRange('Max players', 2, 1024)],
      points_win: [r.intRange('Win points', 0, 10, { optional: false })],
      points_draw: [r.intRange('Draw points', 0, 10, { optional: false })],
      points_loss: [r.intRange('Loss points', 0, 10, { optional: false })],
      end_date: [r.custom((v, all) => !v || !all.start_date || v >= all.start_date, 'End date must be on or after the start date.')],
    });
    return {
      errors,
      payload: {
        name: EF.utils.clean(values.name),
        season: nullable(values.season),
        description: nullable(values.description),
        format: values.format || 'League',
        platform: nullable(values.platform),
        prize: nullable(values.prize),
        start_date: nullable(values.start_date),
        end_date: nullable(values.end_date),
        max_players: toInt(values.max_players),
        points_win: toInt(values.points_win),
        points_draw: toInt(values.points_draw),
        points_loss: toInt(values.points_loss),
        registration_open: Boolean(values.registration_open),
        auto_approve: Boolean(values.auto_approve),
        is_published: Boolean(values.is_published),
      },
    };
  }

  admin.register('settings', {
    title: 'Tournament Settings',

    render(el, s) {
      const t = s.tournament;
      const isNew = !t;
      const v = t || { format: 'League', points_win: 3, points_draw: 1, points_loss: 0, registration_open: true, auto_approve: false, is_published: false };
      const siteUrl = new URL('../index.html', location.href).href;

      el.innerHTML = `
        ${isNew ? `<div class="form-alert form-alert--info mb-6">${ui.icon('sparkles', '')}<span>Create your tournament to start accepting registrations. You can keep it as a draft until you are ready to publish.</span></div>` : ''}
        <form novalidate data-settings class="grid xl:grid-cols-[1fr_360px] gap-6 items-start">
          <div class="grid gap-6">
            <section class="glass p-5 sm:p-6">
              ${admin.panelHead('Tournament information', 'Shown on the public website')}
              <div data-form-alert hidden class="mb-4"></div>
              <div class="grid gap-4">
                <div class="grid sm:grid-cols-[1fr_220px] gap-4">
                  ${ui.field({ name: 'name', label: 'Tournament Name', value: v.name, required: true, maxlength: 120, placeholder: 'e.g. Winter Cup 2026' })}
                  ${ui.field({ name: 'season', label: 'Season', value: v.season, maxlength: 60, placeholder: 'e.g. Season 3' })}
                </div>
                ${ui.field({ name: 'description', label: 'Description', as: 'textarea', rows: 3, value: v.description, maxlength: 2000, placeholder: 'A short pitch shown in the home page hero.' })}
                <div class="grid sm:grid-cols-3 gap-4">
                  ${ui.field({ name: 'format', label: 'Format', as: 'select', value: v.format, options: FORMATS.map((f) => ({ value: f, label: f })) })}
                  ${ui.field({ name: 'platform', label: 'Platform', value: v.platform, maxlength: 80, placeholder: 'e.g. PS5 · Xbox · PC' })}
                  ${ui.field({ name: 'prize', label: 'Total Prize', value: v.prize, maxlength: 60, placeholder: 'e.g. ৳50,000' })}
                </div>
                <div class="grid sm:grid-cols-3 gap-4">
                  ${ui.field({ name: 'start_date', label: 'Start Date', type: 'date', value: v.start_date })}
                  ${ui.field({ name: 'end_date', label: 'End Date', type: 'date', value: v.end_date })}
                  ${ui.field({ name: 'max_players', label: 'Max Players', type: 'number', min: 2, max: 1024, value: v.max_players ?? '', placeholder: 'Unlimited' })}
                </div>
              </div>
            </section>

            <section class="glass p-5 sm:p-6">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 class="font-display text-lg font-bold uppercase tracking-wide text-white">Rules</h2>
                  <p class="text-xs text-muted mt-0.5">${isNew ? 'Create the tournament first, then add rules on the Rules page.' : `${EF.utils.plural(String(v.rules || '').split(/\r?\n/).filter((l) => l.trim()).length, 'rule')} · add, edit and reorder them on the Rules page.`}</p>
                </div>
                ${isNew ? '' : `<a href="#/rules" class="btn btn-secondary btn-sm shrink-0">${ui.icon('book-open', '')}Manage rules</a>`}
              </div>
            </section>
          </div>

          <div class="grid gap-6">
            <section class="glass p-5">
              ${admin.panelHead('Visibility & registration')}
              <div class="grid gap-3">
                ${ui.switchField({ name: 'is_published', label: 'Published', description: 'Show this tournament, its fixtures and table on the website.', checked: v.is_published })}
                ${ui.switchField({ name: 'registration_open', label: 'Registration open', description: 'Accept new player registrations.', checked: v.registration_open })}
                ${ui.switchField({ name: 'auto_approve', label: 'Auto-approve', description: 'Skip manual review of new registrations.', checked: v.auto_approve })}
              </div>
            </section>

            <section class="glass p-5">
              ${admin.panelHead('Scoring', 'Applied to the whole point table')}
              <div class="grid grid-cols-3 gap-3">
                ${ui.field({ name: 'points_win', label: 'Win', type: 'number', min: 0, max: 10, value: v.points_win, required: true })}
                ${ui.field({ name: 'points_draw', label: 'Draw', type: 'number', min: 0, max: 10, value: v.points_draw, required: true })}
                ${ui.field({ name: 'points_loss', label: 'Loss', type: 'number', min: 0, max: 10, value: v.points_loss, required: true })}
              </div>
            </section>

            <div class="glass p-5 grid gap-3 xl:sticky xl:top-[96px]">
              <button type="submit" class="btn btn-primary w-full" data-submit>${ui.icon(isNew ? 'plus' : 'save', '')}${isNew ? 'Create tournament' : 'Save settings'}</button>
              ${!isNew ? `<p class="text-xs text-muted text-center">Last updated ${e(EF.utils.formatDateTime(t.updated_at))}</p>` : ''}
              <a href="${e(siteUrl)}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm w-full">${ui.icon('external-link', '')}Open public site</a>
            </div>

            <section class="glass p-5 text-sm">
              ${admin.panelHead('Your account')}
              <div class="grid gap-2">
                <div class="flex justify-between gap-3"><span class="text-muted">${EF.backend === 'local' ? 'Username' : 'Email'}</span><span class="text-white truncate">${e((s.profile && s.profile.email) || (s.session && s.session.user.email) || '—')}</span></div>
                <div class="flex justify-between gap-3"><span class="text-muted">Role</span><span class="text-white capitalize">${e((s.profile && s.profile.role) || 'admin')}</span></div>
              </div>
              <p class="text-xs text-subtle mt-3 leading-relaxed">${EF.backend === 'local'
                ? 'Local mode: this admin account exists only in this browser.'
                : 'Administrators are managed in Supabase (see supabase/03_admin_setup.sql).'}</p>
            </section>
          </div>
        </form>

        ${EF.backend === 'local' ? `
          <section class="glass p-5 sm:p-6 mt-6">
            ${admin.panelHead('Data & backup', 'Local mode: all tournament data is saved in this browser (localStorage).')}
            <div class="form-alert form-alert--info mb-4">${ui.icon('info', '')}<span>Data stays on this device and browser only. Clearing browser data deletes it, so export a backup regularly. Registrations made on other devices are not received in local mode.</span></div>
            <div class="flex flex-wrap gap-3">
              <button type="button" class="btn btn-secondary btn-sm" data-export>${ui.icon('download', '')}Export backup (.json)</button>
              <label class="btn btn-ghost btn-sm cursor-pointer">${ui.icon('upload', '')}Import backup<input type="file" accept="application/json,.json" class="sr-only" data-import></label>
              <button type="button" class="btn btn-ghost btn-sm" data-demo>${ui.icon('sparkles', '')}Load demo data</button>
              <button type="button" class="btn btn-ghost btn-sm !text-[#ff8399]" data-reset>${ui.icon('trash-2', '')}Reset all data</button>
            </div>
          </section>` : ''}`;

      if (EF.backend === 'local') {
        const replaceAll = async (title, message, confirmText, action, success) => {
          const ok = await ui.confirm({ title, message, confirmText });
          if (ok) await admin.mutate(async () => action(), { success });
        };
        el.querySelector('[data-export]').addEventListener('click', () => {
          const blob = new Blob([EF.local.exportJson()], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `efootball-backup-${new Date().toISOString().slice(0, 10)}.json`;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
          ui.toast('Backup downloaded.', 'success');
        });
        el.querySelector('[data-import]').addEventListener('change', async (ev) => {
          const file = ev.target.files && ev.target.files[0];
          ev.target.value = '';
          if (!file) return;
          try {
            const text = await file.text();
            await replaceAll('Import backup?', 'This replaces the current tournament, players, fixtures and point adjustments with the backup file.', 'Import',
              () => EF.local.importJson(text), 'Backup imported.');
          } catch (err) {
            ui.toast(err.message || 'Could not read that file.', 'error');
          }
        });
        el.querySelector('[data-demo]').addEventListener('click', () => replaceAll(
          'Load demo data?', 'This replaces all current tournament data with a sample tournament, 8 players and 10 fixtures.', 'Load demo',
          () => EF.local.loadDemo(), 'Demo tournament loaded.',
        ));
        el.querySelector('[data-reset]').addEventListener('click', () => replaceAll(
          'Reset all data?', 'This permanently deletes the tournament, players, fixtures and point adjustments stored in this browser. Your admin account is kept.', 'Delete everything',
          () => EF.local.resetData(), 'All tournament data deleted.',
        ));
      }

      const form = el.querySelector('[data-settings]');
      const submit = form.querySelector('[data-submit]');
      ui.liveClear(form);

      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const { errors, payload } = parse(ui.readForm(form));
        if (Object.keys(errors).length) {
          ui.showErrors(form, errors);
          ui.formAlert(form, 'Please fix the highlighted fields.');
          return;
        }
        ui.formAlert(form, null);
        await admin.mutate(() => api.admin.saveTournament(t && t.id, payload), {
          success: isNew ? 'Tournament created.' : 'Settings saved.',
          button: submit,
        });
      });
    },
  });
})();
