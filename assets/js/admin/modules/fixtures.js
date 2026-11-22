/* Admin module 4: Match fixture management (create, edit, delete, schedule). */
(function () {
  'use strict';
  const { escapeHtml: e, formatDate, formatTime, toDateInput, toTimeInput, combineDateTime, toInt, nullable } = EF.utils;
  const ui = EF.ui;
  const admin = EF.admin;
  const api = EF.api;

  const view = { status: 'all', q: '' };

  const STATUS_OPTIONS = [
    { value: 'upcoming', label: 'Upcoming' },
    { value: 'live', label: 'Live' },
    { value: 'completed', label: 'Completed' },
    { value: 'postponed', label: 'Postponed' },
  ];

  /** Validate fixture form values; returns { errors, payload }. */
  function parseFixture(values) {
    const r = EF.utils.rules;
    const errors = EF.utils.validate(values, {
      home_player_id: [r.required('Player 1')],
      away_player_id: [r.required('Player 2'), r.custom((v, all) => !v || v !== all.home_player_id, 'Player 2 must be different from Player 1.')],
      match_date: [r.required('Match date')],
      match_time: [r.required('Kickoff time')],
      round: [r.intRange('Round', 1, 999)],
      home_score: [r.intRange('Score', 0, 99)],
      away_score: [r.intRange('Score', 0, 99)],
      venue: [r.maxLength('Venue', 80)],
      notes: [r.maxLength('Notes', 500)],
    });

    const home = toInt(values.home_score);
    const away = toInt(values.away_score);
    if (values.status === 'completed' && (home === null || away === null)) {
      if (home === null) errors.home_score = errors.home_score || 'Enter both scores to complete a match.';
      if (away === null) errors.away_score = errors.away_score || 'Enter both scores to complete a match.';
    }
    if ((home === null) !== (away === null) && !errors.home_score && !errors.away_score) {
      errors[home === null ? 'home_score' : 'away_score'] = 'Enter both scores or leave both empty.';
    }

    const scheduledAt = combineDateTime(values.match_date, values.match_time);
    if (!errors.match_date && !scheduledAt) errors.match_date = 'Enter a valid date.';

    return {
      errors,
      payload: {
        home_player_id: values.home_player_id,
        away_player_id: values.away_player_id,
        scheduled_at: scheduledAt,
        round: toInt(values.round),
        status: values.status,
        home_score: home,
        away_score: away,
        venue: nullable(values.venue),
        notes: nullable(values.notes),
      },
    };
  }

  admin.openFixtureForm = function (match = null) {
    const isEdit = Boolean(match);
    const approved = admin.approvedPlayers();

    if (!isEdit && approved.length < 2) {
      ui.toast('You need at least two approved players before creating a fixture.', 'warning');
      return;
    }

    // When editing, keep the current players selectable even if no longer approved.
    const options = admin.playerOptions();
    if (isEdit) {
      [match.home, match.away].forEach((p) => {
        if (p && !options.some((o) => o.value === p.id)) options.push({ value: p.id, label: `${p.player_name} (${p.team_name}) · ${p.status}` });
      });
    }

    const defaults = match || {};
    const lastRound = Math.max(0, ...admin.state.matches.map((m) => m.round || 0));
    const modal = ui.modal({
      title: isEdit ? 'Edit fixture' : 'Create fixture',
      size: 'lg',
      body: `
        <form novalidate class="grid gap-5" data-fixture-form>
          <div data-form-alert hidden></div>
          <div class="grid md:grid-cols-[1fr_auto_1fr] gap-4 items-start">
            ${ui.field({ name: 'home_player_id', label: 'Player 1 (Home)', as: 'select', options, value: defaults.home_player_id, required: true })}
            <div class="hidden md:flex items-center justify-center h-[46px] mt-[29px]"><span class="vs !text-lg">VS</span></div>
            ${ui.field({ name: 'away_player_id', label: 'Player 2 (Away)', as: 'select', options, value: defaults.away_player_id, required: true })}
          </div>
          <div class="grid sm:grid-cols-3 gap-4">
            ${ui.field({ name: 'match_date', label: 'Match Date', type: 'date', value: defaults.scheduled_at ? toDateInput(defaults.scheduled_at) : toDateInput(new Date()), required: true })}
            ${ui.field({ name: 'match_time', label: 'Kickoff Time', type: 'time', value: defaults.scheduled_at ? toTimeInput(defaults.scheduled_at) : '20:00', required: true, hint: 'Your local time' })}
            ${ui.field({ name: 'round', label: 'Round', type: 'number', min: 1, max: 999, value: defaults.round ?? (lastRound || 1) })}
          </div>
          <div class="grid sm:grid-cols-3 gap-4">
            ${ui.field({ name: 'status', label: 'Match Status', as: 'select', options: STATUS_OPTIONS, value: defaults.status || 'upcoming' })}
            ${ui.field({ name: 'home_score', label: 'Player 1 Score', type: 'number', min: 0, max: 99, value: defaults.home_score ?? '', placeholder: '—' })}
            ${ui.field({ name: 'away_score', label: 'Player 2 Score', type: 'number', min: 0, max: 99, value: defaults.away_score ?? '', placeholder: '—' })}
          </div>
          <div class="grid sm:grid-cols-2 gap-4">
            ${ui.field({ name: 'venue', label: 'Venue / Lobby', value: defaults.venue, maxlength: 80, placeholder: 'e.g. Online · Room 3' })}
            ${ui.field({ name: 'notes', label: 'Notes', value: defaults.notes, maxlength: 500, placeholder: 'Optional' })}
          </div>
          <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
            <button type="button" class="btn btn-ghost" data-close>Cancel</button>
            <button type="submit" class="btn btn-primary" data-submit>${ui.icon(isEdit ? 'save' : 'calendar-plus', '')}${isEdit ? 'Save fixture' : 'Create fixture'}</button>
          </div>
        </form>`,
    });

    const form = modal.body.querySelector('[data-fixture-form]');
    const submit = form.querySelector('[data-submit]');
    ui.liveClear(form);

    // Entering both scores on an upcoming fixture implies it was played.
    form.addEventListener('input', (ev) => {
      if (!['home_score', 'away_score'].includes(ev.target.name)) return;
      if (form.elements.home_score.value !== '' && form.elements.away_score.value !== '' && form.elements.status.value === 'upcoming') {
        form.elements.status.value = 'completed';
      }
    });

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const { errors, payload } = parseFixture(ui.readForm(form));
      if (Object.keys(errors).length) {
        ui.showErrors(form, errors);
        ui.formAlert(form, 'Please fix the highlighted fields.');
        return;
      }
      ui.formAlert(form, null);

      const duplicate = admin.state.matches.find((m) => m.id !== (match && match.id)
        && ((m.home_player_id === payload.home_player_id && m.away_player_id === payload.away_player_id)
          || (m.home_player_id === payload.away_player_id && m.away_player_id === payload.home_player_id))
        && (payload.round === null || m.round === payload.round));
      if (duplicate) {
        const ok = await ui.confirm({
          title: 'Possible duplicate',
          message: `These players already meet${duplicate.round ? ` in round ${duplicate.round}` : ''} on ${formatDate(duplicate.scheduled_at)}. Create this fixture anyway?`,
          confirmText: 'Save anyway',
          tone: 'primary',
        });
        if (!ok) return;
      }

      const ok = await admin.mutate(
        () => (isEdit ? api.admin.updateMatch(match.id, payload) : api.admin.createMatch(admin.state.tournament.id, payload)),
        { success: isEdit ? 'Fixture updated.' : 'Fixture created and published.', button: submit },
      );
      if (ok) modal.close();
    });
  };

  admin.deleteFixture = async function (match) {
    const ok = await ui.confirm({
      title: 'Delete fixture?',
      message: `${match.home ? match.home.player_name : 'TBD'} vs ${match.away ? match.away.player_name : 'TBD'} will be removed${match.status === 'completed' ? ' and its result will no longer count towards the point table' : ''}.`,
      confirmText: 'Delete fixture',
    });
    if (ok) await admin.mutate(() => api.admin.deleteMatch(match.id), { success: 'Fixture deleted.' });
  };

  admin.register('fixtures', {
    title: 'Match Fixture Management',

    render(el, s) {
      const count = (id) => (id === 'all' ? s.matches.length : s.matches.filter((m) => m.status === id).length);
      const approvedCount = admin.approvedPlayers().length;

      el.innerHTML = `
        ${approvedCount < 2 ? `<div class="form-alert form-alert--info mb-5">${ui.icon('info', '')}<span>Fixtures need at least two approved players. You currently have ${approvedCount}. <a href="#/registrations" class="underline text-white">Review registrations</a>.</span></div>` : ''}
        <section class="glass">
          <div class="p-4 sm:p-5 border-b border-white/5 flex flex-col lg:flex-row gap-3 lg:items-center">
            ${admin.searchInput('admin-fixture-search', 'Search by player or team', view.q)}
            <div class="scroll-x" role="tablist" aria-label="Filter by status">
              ${['all', 'upcoming', 'live', 'completed', 'postponed'].map((id) => `
                <button type="button" class="chip ${view.status === id ? 'is-active' : ''}" data-filter="${id}" role="tab" aria-selected="${view.status === id}">
                  ${id === 'all' ? 'All' : ui.MATCH_STATUS[id].label}<span class="chip__count">${count(id)}</span>
                </button>`).join('')}
            </div>
            <button type="button" class="btn btn-primary btn-sm lg:ml-auto" data-add ${approvedCount < 2 ? 'disabled' : ''}>${ui.icon('calendar-plus', '')}Create fixture</button>
          </div>
          <div data-list></div>
        </section>`;

      const list = el.querySelector('[data-list]');
      const draw = () => {
        const q = view.q.trim().toLowerCase();
        const rows = s.matches.filter((m) => (view.status === 'all' || m.status === view.status)
          && (!q || [m.home, m.away].some((p) => p && `${p.player_name} ${p.team_name}`.toLowerCase().includes(q))));

        if (!s.matches.length) {
          list.innerHTML = ui.state.empty({ icon: 'calendar-plus', title: 'No fixtures yet', message: 'Create your first match by selecting two approved players.', action: approvedCount >= 2 ? '<button type="button" class="btn btn-primary btn-sm" data-add>Create fixture</button>' : '' });
        } else if (!rows.length) {
          list.innerHTML = ui.state.empty({ icon: 'search-x', title: 'No matching fixtures', message: 'Adjust the search or status filter.' });
        } else {
          list.innerHTML = `
            <div class="table-wrap">
              <table class="ef-table">
                <thead><tr><th class="num">Rd</th><th>Date</th><th>Time</th><th>Player 1</th><th class="num">Result</th><th>Player 2</th><th>Status</th><th class="actions">Actions</th></tr></thead>
                <tbody>
                  ${rows.map((m) => {
                    const scored = Number.isInteger(m.home_score) && Number.isInteger(m.away_score);
                    return `
                      <tr>
                        <td class="num text-muted">${m.round ? e(m.round) : '—'}</td>
                        <td>${e(formatDate(m.scheduled_at, { weekday: 'short', day: '2-digit', month: 'short' }))}</td>
                        <td class="font-semibold text-white">${e(formatTime(m.scheduled_at))}</td>
                        <td><span class="font-semibold text-white">${e(m.home ? m.home.player_name : 'Unknown')}</span><span class="block text-xs text-muted">${e(m.home ? m.home.team_name : '')}</span></td>
                        <td class="num"><span class="font-display text-lg font-bold ${scored ? 'text-white' : 'text-subtle'}">${scored ? `${m.home_score} : ${m.away_score}` : '– : –'}</span></td>
                        <td><span class="font-semibold text-white">${e(m.away ? m.away.player_name : 'Unknown')}</span><span class="block text-xs text-muted">${e(m.away ? m.away.team_name : '')}</span></td>
                        <td>${ui.matchStatusBadge(m.status)}</td>
                        <td class="actions">
                          <div class="inline-flex gap-1.5">
                            <button type="button" class="icon-btn icon-btn--sm" data-edit="${e(m.id)}" title="Edit" aria-label="Edit fixture">${ui.icon('pencil', '')}</button>
                            <button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-delete="${e(m.id)}" title="Delete" aria-label="Delete fixture">${ui.icon('trash-2', '')}</button>
                          </div>
                        </td>
                      </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>
            <p class="px-5 py-3 text-xs text-muted border-t border-white/5">Times shown in your local time zone (${e(Intl.DateTimeFormat().resolvedOptions().timeZone || 'local')}).</p>`;
        }
        ui.icons();
      };
      draw();

      el.querySelector('#admin-fixture-search').addEventListener('input', EF.utils.debounce((ev) => { view.q = ev.target.value; draw(); }, 150));
      el.addEventListener('click', (ev) => {
        const filter = ev.target.closest('[data-filter]');
        if (filter) {
          view.status = filter.dataset.filter;
          el.querySelectorAll('[data-filter]').forEach((b) => { b.classList.toggle('is-active', b === filter); b.setAttribute('aria-selected', String(b === filter)); });
          draw();
          return;
        }
        if (ev.target.closest('[data-add]')) { admin.openFixtureForm(); return; }
        const find = (id) => s.matches.find((m) => m.id === id);
        const edit = ev.target.closest('[data-edit]');
        if (edit) { admin.openFixtureForm(find(edit.dataset.edit)); return; }
        const del = ev.target.closest('[data-delete]');
        if (del) admin.deleteFixture(find(del.dataset.delete));
      });

      if (admin.pendingAction === 'add-fixture') {
        admin.pendingAction = null;
        admin.openFixtureForm();
      }
    },
  });
})();
