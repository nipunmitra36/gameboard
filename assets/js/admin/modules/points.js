/* Admin module 6: Point table management (live standings, manual adjustments, audit log). */
(function () {
  'use strict';
  const { escapeHtml: e, formatDateTime, toInt } = EF.utils;
  const ui = EF.ui;
  const admin = EF.admin;
  const api = EF.api;

  const signed = (n) => (n > 0 ? `+${n}` : String(n));

  admin.register('points', {
    title: 'Point Table Management',

    render(el, s) {
      const t = s.tournament;
      const players = admin.approvedPlayers();
      const nameOf = (id) => { const p = admin.playerById(id); return p ? p.player_name : 'Removed player'; };

      el.innerHTML = `
        <div class="grid 2xl:grid-cols-[1fr_360px] gap-6 items-start">
          <section class="glass overflow-hidden">
            <div class="p-5 pb-0">
              ${admin.panelHead('Live standings', `Win ${t.points_win} · Draw ${t.points_draw} · Loss ${t.points_loss}. Recalculated automatically from completed matches plus adjustments.`,
                `<button type="button" class="btn btn-ghost btn-xs" data-recalc>${ui.icon('refresh-cw', '')}Recalculate</button>`)}
            </div>
            ${s.standings.length
              ? ui.standingsTable(s.standings, { showForm: true, showAdjustment: true })
              : ui.state.empty({ icon: 'users', title: 'No approved players', message: 'Approve registrations to build the table.' })}
          </section>

          <aside class="glass p-5">
            ${admin.panelHead('Manual adjustment', 'Every change is recorded in the audit log')}
            ${players.length ? `
              <form class="grid gap-4" data-adjust novalidate>
                <div data-form-alert hidden></div>
                ${ui.field({ name: 'player_id', label: 'Player', as: 'select', options: admin.playerOptions(), required: true })}
                ${ui.field({ name: 'points', label: 'Points (+/-)', type: 'number', min: -100, max: 100, step: 1, placeholder: 'e.g. -3 or 2', required: true, hint: 'Use a negative number to deduct points.' })}
                ${ui.field({ name: 'reason', label: 'Reason', as: 'textarea', rows: 3, maxlength: 500, required: true, placeholder: 'e.g. Deduction for no-show in Round 2' })}
                <button type="submit" class="btn btn-primary" data-submit>${ui.icon('scale', '')}Apply adjustment</button>
              </form>`
            : ui.state.empty({ icon: 'user-x', title: 'No approved players', message: 'Adjustments can be applied to approved players only.' })}
          </aside>
        </div>

        <section class="glass mt-6">
          <div class="p-5 pb-0">${admin.panelHead('Audit log', `${EF.utils.plural(s.adjustments.length, 'adjustment')} · append-only. Reverse an entry to undo it.`)}</div>
          ${s.adjustments.length ? `
            <div class="table-wrap">
              <table class="ef-table">
                <thead><tr><th>Date</th><th>Player</th><th class="num">Change</th><th>Reason</th><th>By</th><th class="actions">Actions</th></tr></thead>
                <tbody>
                  ${s.adjustments.map((a) => `
                    <tr>
                      <td class="text-muted text-[13px]">${e(formatDateTime(a.created_at))}</td>
                      <td><div class="admin-player">${ui.avatar(admin.playerById(a.player_id) || nameOf(a.player_id), 'sm')}<span class="admin-player__name">${e(nameOf(a.player_id))}</span></div></td>
                      <td class="num"><span class="font-display text-lg font-bold ${a.points > 0 ? 'text-neon' : 'text-danger'}">${signed(a.points)}</span></td>
                      <td class="!whitespace-normal min-w-[240px] max-w-[420px]">${e(a.reason)}</td>
                      <td class="text-muted text-[13px]">${e(a.created_by_email || 'System')}</td>
                      <td class="actions"><button type="button" class="btn btn-ghost btn-xs" data-reverse="${e(a.id)}">${ui.icon('undo-2', '')}Reverse</button></td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>`
          : ui.state.empty({ icon: 'scroll-text', title: 'No adjustments recorded', message: 'Manual point changes and their reasons will be listed here.' })}
        </section>`;

      el.addEventListener('click', async (ev) => {
        const recalc = ev.target.closest('[data-recalc]');
        if (recalc) {
          ui.setLoading(recalc, true, 'Recalculating');
          await admin.refresh();
          ui.toast('Point table recalculated from the latest results.', 'success');
          return;
        }
        const rev = ev.target.closest('[data-reverse]');
        if (rev) {
          const entry = s.adjustments.find((a) => a.id === rev.dataset.reverse);
          if (!entry) return;
          const ok = await ui.confirm({
            title: 'Reverse adjustment?',
            message: `A new entry of ${signed(-entry.points)} points will be recorded for ${nameOf(entry.player_id)} to cancel this adjustment.`,
            confirmText: 'Record reversal',
            tone: 'primary',
          });
          if (!ok) return;
          const reason = `Reversal of ${signed(entry.points)} from ${formatDateTime(entry.created_at)}: ${entry.reason}`.slice(0, 500);
          await admin.mutate(
            () => api.admin.createAdjustment(t.id, { player_id: entry.player_id, points: -entry.points, reason }),
            { success: 'Reversal recorded.' },
          );
        }
      });

      const form = el.querySelector('[data-adjust]');
      if (!form) return;
      const submit = form.querySelector('[data-submit]');
      ui.liveClear(form);

      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const values = ui.readForm(form);
        const r = EF.utils.rules;
        const errors = EF.utils.validate(values, {
          player_id: [r.required('Player')],
          points: [r.required('Points'), r.intRange('Points', -100, 100, { optional: false }), r.custom((v) => Number(v) !== 0, 'Points cannot be zero.')],
          reason: [r.required('Reason'), r.length('Reason', 3, 500)],
        });
        if (Object.keys(errors).length) { ui.showErrors(form, errors); return; }

        const points = toInt(values.points);
        const player = admin.playerById(values.player_id);
        const ok = await ui.confirm({
          title: 'Apply adjustment?',
          message: `${signed(points)} points for ${player ? player.player_name : 'this player'}. This will be permanently recorded in the audit log.`,
          confirmText: 'Apply',
          tone: 'primary',
        });
        if (!ok) return;

        await admin.mutate(
          () => api.admin.createAdjustment(t.id, { player_id: values.player_id, points, reason: values.reason.trim() }),
          { success: `Adjustment applied (${signed(points)} pts).`, button: submit, label: 'Applying' },
        );
      });
    },
  });
})();
