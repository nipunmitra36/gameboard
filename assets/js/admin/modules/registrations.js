/* Admin module 3: Registration management (review queue, bulk approval, intake settings). */
(function () {
  'use strict';
  const { escapeHtml: e, formatDateTime } = EF.utils;
  const ui = EF.ui;
  const admin = EF.admin;
  const api = EF.api;

  const view = { tab: 'pending' };

  admin.register('registrations', {
    title: 'Registration Management',

    render(el, s) {
      const t = s.tournament;
      const by = (status) => s.players.filter((p) => p.status === status);
      const groups = { pending: by('pending'), approved: by('approved'), rejected: by('rejected') };
      const list = [...groups[view.tab]].sort((a, b) => (view.tab === 'pending'
        ? new Date(a.created_at) - new Date(b.created_at)
        : new Date(b.created_at) - new Date(a.created_at)));
      const active = s.players.filter((p) => p.status !== 'rejected').length;

      el.innerHTML = `
        <div class="grid xl:grid-cols-[1fr_340px] gap-6 items-start">
          <section class="glass">
            <div class="p-4 sm:p-5 border-b border-white/5 flex flex-col sm:flex-row sm:items-center gap-3">
              <div class="scroll-x" role="tablist" aria-label="Registration status">
                ${['pending', 'approved', 'rejected'].map((id) => `
                  <button type="button" class="chip ${view.tab === id ? 'is-active' : ''}" data-tab="${id}" role="tab" aria-selected="${view.tab === id}">
                    ${ui.PLAYER_STATUS[id].label}<span class="chip__count">${groups[id].length}</span>
                  </button>`).join('')}
              </div>
              ${view.tab === 'pending' && groups.pending.length > 1
                ? `<button type="button" class="btn btn-primary btn-sm sm:ml-auto" data-approve-all>${ui.icon('check-check', '')}Approve all (${groups.pending.length})</button>` : ''}
            </div>
            <div class="p-3 sm:p-4">
              ${list.length ? `<ul class="grid gap-3">${list.map((p) => `
                <li class="rounded-2xl border border-white/5 bg-black/20 p-4 flex flex-col md:flex-row md:items-center gap-4">
                  <div class="flex items-center gap-3 min-w-0 flex-1">
                    ${ui.avatar(p)}
                    <div class="min-w-0">
                      <p class="font-semibold text-white truncate">${e(p.player_name)} <span class="text-muted font-normal">· ${e(p.team_name)}</span></p>
                      <p class="text-xs text-muted truncate mt-0.5">
                        <span class="text-volt font-mono">${e(p.efootball_username)}</span> · <a href="mailto:${e(p.email)}" class="hover:text-white">${e(p.email)}</a>
                      </p>
                      <p class="text-[11px] text-subtle mt-1">Registered ${e(formatDateTime(p.created_at))}${p.approved_at ? ` · Approved ${e(formatDateTime(p.approved_at))}` : ''}</p>
                    </div>
                  </div>
                  <div class="flex flex-wrap gap-2 md:justify-end shrink-0">
                    ${p.status !== 'approved' ? `<button type="button" class="btn btn-primary btn-xs" data-set="approved" data-id="${e(p.id)}">${ui.icon('check', '')}Approve</button>` : ''}
                    ${p.status !== 'rejected' ? `<button type="button" class="btn btn-ghost btn-xs" data-set="rejected" data-id="${e(p.id)}">${ui.icon('x', '')}Reject</button>` : ''}
                    ${p.status !== 'pending' ? `<button type="button" class="btn btn-ghost btn-xs" data-set="pending" data-id="${e(p.id)}">${ui.icon('rotate-ccw', '')}Mark pending</button>` : ''}
                    <button type="button" class="icon-btn icon-btn--sm" data-edit="${e(p.id)}" aria-label="Edit ${e(p.player_name)}" title="Edit">${ui.icon('pencil', '')}</button>
                  </div>
                </li>`).join('')}</ul>`
              : ui.state.empty({
                icon: view.tab === 'pending' ? 'inbox' : 'users',
                title: view.tab === 'pending' ? 'Inbox zero' : `No ${view.tab} players`,
                message: view.tab === 'pending' ? 'No registrations are waiting for review.' : 'Players with this status will be listed here.',
              })}
            </div>
          </section>

          <aside class="glass p-5 grid gap-4">
            ${admin.panelHead('Intake settings', 'Changes apply to the public site immediately')}
            <form class="grid gap-3" data-intake>
              ${ui.switchField({ name: 'registration_open', label: 'Registration open', description: 'Allow new players to register on the website.', checked: t.registration_open })}
              ${ui.switchField({ name: 'auto_approve', label: 'Auto-approve', description: 'Approve new registrations instantly without review.', checked: t.auto_approve })}
            </form>
            <div class="rounded-2xl border border-white/5 bg-black/20 p-4 text-sm grid gap-2">
              <div class="flex justify-between"><span class="text-muted">Active players</span><span class="font-semibold text-white">${active}</span></div>
              <div class="flex justify-between"><span class="text-muted">Capacity</span><span class="font-semibold text-white">${t.max_players ? e(t.max_players) : 'Unlimited'}</span></div>
              ${t.max_players ? `
                <div class="h-2 rounded-full bg-white/5 overflow-hidden mt-1" role="progressbar" aria-valuemin="0" aria-valuemax="${e(t.max_players)}" aria-valuenow="${active}">
                  <div class="h-full bg-gradient-to-r from-[#d4ff1a] to-[#3d6bff]" style="width:${Math.min(100, Math.round((active / t.max_players) * 100))}%"></div>
                </div>` : ''}
            </div>
          </aside>
        </div>`;

      el.addEventListener('click', async (ev) => {
        const tab = ev.target.closest('[data-tab]');
        if (tab) { view.tab = tab.dataset.tab; admin.rerender(); return; }

        const set = ev.target.closest('[data-set]');
        if (set) {
          const labels = { approved: 'Player approved.', rejected: 'Registration rejected.', pending: 'Moved back to pending.' };
          await admin.mutate(() => api.admin.setPlayerStatus(set.dataset.id, set.dataset.set), { success: labels[set.dataset.set], button: set, label: '' });
          return;
        }

        const edit = ev.target.closest('[data-edit]');
        if (edit) { admin.openPlayerForm(admin.playerById(edit.dataset.edit)); return; }

        const all = ev.target.closest('[data-approve-all]');
        if (all) {
          const ids = groups.pending.map((p) => p.id);
          const ok = await ui.confirm({ title: 'Approve all pending?', message: `${EF.utils.plural(ids.length, 'registration')} will be approved and become eligible for fixtures.`, confirmText: 'Approve all', tone: 'primary' });
          if (ok) await admin.mutate(() => api.admin.setPlayerStatus(ids, 'approved'), { success: `${EF.utils.plural(ids.length, 'player')} approved.` });
        }
      });

      el.querySelector('[data-intake]').addEventListener('change', async (ev) => {
        const input = ev.target;
        if (!input.name) return;
        input.disabled = true;
        const ok = await admin.mutate(
          () => api.admin.saveTournament(t.id, { [input.name]: input.checked }),
          { success: input.name === 'registration_open'
            ? (input.checked ? 'Registration is now open.' : 'Registration is now closed.')
            : (input.checked ? 'Auto-approve enabled.' : 'Auto-approve disabled.') },
        );
        if (!ok && input.isConnected) { input.checked = !input.checked; input.disabled = false; }
      });
    },
  });
})();
