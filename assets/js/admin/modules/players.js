/* Admin module 2: Player management (add, edit, approve, delete). */
(function () {
  'use strict';
  const { escapeHtml: e, debounce, formatDate } = EF.utils;
  const ui = EF.ui;
  const admin = EF.admin;
  const api = EF.api;

  const view = { q: '', status: 'all' };

  /** Shared add/edit player dialog (also used by the Registrations module). */
  admin.openPlayerForm = function (player = null) {
    const isEdit = Boolean(player);
    const p = player || { status: 'approved' };
    const modal = ui.modal({
      title: isEdit ? 'Edit player' : 'Add player',
      size: 'md',
      body: `
        <form novalidate class="grid gap-4" data-player-form>
          <div data-form-alert hidden></div>
          <div class="grid sm:grid-cols-2 gap-4">
            ${ui.field({ name: 'player_name', label: 'Player Name', icon: 'user', value: p.player_name, required: true, maxlength: 60 })}
            ${ui.field({ name: 'team_name', label: 'Team Name', icon: 'shield', value: p.team_name, required: true, maxlength: 60 })}
          </div>
          <div class="grid sm:grid-cols-2 gap-4">
            ${ui.field({ name: 'efootball_username', label: 'eFootball Username', icon: 'gamepad-2', value: p.efootball_username, required: true, maxlength: 40 })}
            ${ui.field({ name: 'email', label: 'Email Address', type: 'email', icon: 'mail', value: p.email, required: true, maxlength: 254 })}
          </div>
          ${ui.photoField({ value: p.avatar_url, playerName: p.player_name })}
          ${ui.field({
            name: 'status', label: 'Registration Status', as: 'select', value: p.status,
            options: [{ value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }],
          })}
          ${ui.field({ name: 'notes', label: 'Admin Notes', as: 'textarea', value: p.notes, rows: 3, maxlength: 1000, placeholder: 'Private notes (not shown publicly)' })}
          <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-1">
            <button type="button" class="btn btn-ghost" data-close>Cancel</button>
            <button type="submit" class="btn btn-primary" data-submit>${ui.icon(isEdit ? 'save' : 'user-plus', '')}${isEdit ? 'Save changes' : 'Add player'}</button>
          </div>
        </form>`,
    });

    const form = modal.body.querySelector('[data-player-form]');
    const submit = form.querySelector('[data-submit]');
    ui.liveClear(form);
    ui.bindPhotoFields(form);

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const values = ui.readForm(form);
      const errors = EF.utils.validatePlayer(values);
      if (Object.keys(errors).length) { ui.showErrors(form, errors); return; }

      const payload = {
        player_name: EF.utils.clean(values.player_name),
        team_name: EF.utils.clean(values.team_name),
        efootball_username: values.efootball_username.trim(),
        email: values.email.trim().toLowerCase(),
        status: values.status,
        notes: EF.utils.nullable(values.notes),
        avatar_url: EF.utils.isAvatarData(values.avatar_url) ? values.avatar_url : null,
      };

      ui.formAlert(form, null);
      const ok = await admin.mutate(
        () => (isEdit ? api.admin.updatePlayer(player.id, payload) : api.admin.createPlayer(admin.state.tournament.id, payload)),
        { success: isEdit ? 'Player updated.' : 'Player added.', button: submit },
      );
      if (ok) modal.close();
    });
  };

  admin.deletePlayer = async function (player) {
    const fixtures = admin.state.matches.filter((m) => m.home_player_id === player.id || m.away_player_id === player.id).length;
    if (fixtures) {
      ui.toast(`${player.player_name} has ${EF.utils.plural(fixtures, 'fixture')}. Delete or reassign those fixtures first, or set the player to Rejected.`, 'warning', { timeout: 7000 });
      return;
    }
    const ok = await ui.confirm({
      title: 'Delete player?',
      message: `${player.player_name} (${player.team_name}) will be permanently removed, including any point adjustments. This cannot be undone.`,
      confirmText: 'Delete player',
    });
    if (ok) await admin.mutate(() => api.admin.deletePlayer(player.id), { success: 'Player deleted.' });
  };

  admin.register('players', {
    title: 'Player Management',

    render(el, s) {
      const counts = {
        all: s.players.length,
        approved: s.players.filter((p) => p.status === 'approved').length,
        pending: s.players.filter((p) => p.status === 'pending').length,
        rejected: s.players.filter((p) => p.status === 'rejected').length,
      };

      el.innerHTML = `
        <section class="glass">
          <div class="p-4 sm:p-5 border-b border-white/5 flex flex-col lg:flex-row gap-3 lg:items-center">
            ${admin.searchInput('admin-player-search', 'Search name, team, username or email', view.q)}
            <div class="scroll-x" role="tablist" aria-label="Filter by status">
              ${['all', 'approved', 'pending', 'rejected'].map((id) => `
                <button type="button" class="chip ${view.status === id ? 'is-active' : ''}" data-filter="${id}" role="tab" aria-selected="${view.status === id}">
                  ${id === 'all' ? 'All' : ui.PLAYER_STATUS[id].label}<span class="chip__count">${counts[id]}</span>
                </button>`).join('')}
            </div>
            <button type="button" class="btn btn-primary btn-sm lg:ml-auto" data-add>${ui.icon('user-plus', '')}Add player</button>
          </div>
          <div data-list></div>
        </section>`;

      const list = el.querySelector('[data-list]');

      const draw = () => {
        const q = view.q.trim().toLowerCase();
        const rows = s.players
          .map((p, i) => ({ ...p, position: i + 1 }))
          .filter((p) => (view.status === 'all' || p.status === view.status)
            && (!q || [p.player_name, p.team_name, p.efootball_username, p.email].some((v) => String(v).toLowerCase().includes(q))));

        if (!s.players.length) {
          list.innerHTML = ui.state.empty({ icon: 'users', title: 'No players yet', message: 'Players appear here when they register on the website, or you can add them manually.', action: '<button type="button" class="btn btn-primary btn-sm" data-add>Add player</button>' });
        } else if (!rows.length) {
          list.innerHTML = ui.state.empty({ icon: 'search-x', title: 'No matching players', message: 'Adjust the search or status filter.' });
        } else {
          list.innerHTML = `
            <div class="table-wrap">
              <table class="ef-table">
                <thead><tr>
                  <th class="num">#</th><th>Player</th><th>Team</th><th>eFootball Username</th><th>Email</th><th>Status</th><th>Registered</th><th class="actions">Actions</th>
                </tr></thead>
                <tbody>
                  ${rows.map((p) => `
                    <tr>
                      <td class="num text-muted">${p.position}</td>
                      <td><div class="flex items-center gap-3">${ui.avatar(p, 'sm')}<span class="font-semibold text-white">${e(p.player_name)}</span>${p.notes ? `<span class="text-subtle" title="${e(p.notes)}">${ui.icon('sticky-note', 'w-3.5 h-3.5')}</span>` : ''}</div></td>
                      <td>${e(p.team_name)}</td>
                      <td class="text-volt font-mono text-[13px]">${e(p.efootball_username)}</td>
                      <td><a class="hover:text-white" href="mailto:${e(p.email)}">${e(p.email)}</a></td>
                      <td>${ui.playerStatusBadge(p.status)}</td>
                      <td class="text-muted text-[13px]">${e(formatDate(p.created_at, { day: '2-digit', month: 'short', year: 'numeric' }))}</td>
                      <td class="actions">
                        <div class="inline-flex gap-1.5">
                          ${p.status !== 'approved' ? `<button type="button" class="icon-btn icon-btn--sm icon-btn--success" data-approve="${e(p.id)}" title="Approve" aria-label="Approve ${e(p.player_name)}">${ui.icon('check', '')}</button>` : ''}
                          <button type="button" class="icon-btn icon-btn--sm" data-edit="${e(p.id)}" title="Edit" aria-label="Edit ${e(p.player_name)}">${ui.icon('pencil', '')}</button>
                          <button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-delete="${e(p.id)}" title="Delete" aria-label="Delete ${e(p.player_name)}">${ui.icon('trash-2', '')}</button>
                        </div>
                      </td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>
            <p class="px-5 py-3 text-xs text-muted border-t border-white/5">Showing ${rows.length} of ${EF.utils.plural(s.players.length, 'player')}</p>`;
        }
        ui.icons();
      };

      draw();

      el.querySelector('#admin-player-search').addEventListener('input', debounce((ev) => { view.q = ev.target.value; draw(); }, 150));
      el.addEventListener('click', async (ev) => {
        const t = ev.target;
        const filter = t.closest('[data-filter]');
        if (filter) {
          view.status = filter.dataset.filter;
          el.querySelectorAll('[data-filter]').forEach((b) => {
            b.classList.toggle('is-active', b === filter);
            b.setAttribute('aria-selected', String(b === filter));
          });
          draw();
          return;
        }
        if (t.closest('[data-add]')) { admin.openPlayerForm(); return; }
        const edit = t.closest('[data-edit]');
        if (edit) { admin.openPlayerForm(admin.playerById(edit.dataset.edit)); return; }
        const del = t.closest('[data-delete]');
        if (del) { admin.deletePlayer(admin.playerById(del.dataset.delete)); return; }
        const approve = t.closest('[data-approve]');
        if (approve) await admin.mutate(() => api.admin.setPlayerStatus(approve.dataset.approve, 'approved'), { success: 'Player approved.', button: approve, label: '' });
      });

      if (admin.pendingAction === 'add-player') {
        admin.pendingAction = null;
        admin.openPlayerForm();
      }
    },
  });
})();
