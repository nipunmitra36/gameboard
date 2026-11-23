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

  /* ---------------- Auto-generate (round robin) ---------------- */

  /**
   * Circle-method round robin. Returns rounds of [home, away] pairs.
   * Odd player counts get a bye (that player sits out the round).
   * legs = 2 adds the return fixtures with home and away swapped.
   */
  function roundRobin(players, legs) {
    const list = players.slice();
    if (list.length % 2) list.push(null);
    const n = list.length;
    const firstLeg = [];
    for (let r = 0; r < n - 1; r += 1) {
      const pairs = [];
      for (let i = 0; i < n / 2; i += 1) {
        let home = list[i];
        let away = list[n - 1 - i];
        // Alternate home/away so nobody plays every match at home.
        if ((i === 0 && r % 2 === 1) || (i > 0 && i % 2 === 1)) [home, away] = [away, home];
        if (home && away) pairs.push([home, away]);
      }
      firstLeg.push(pairs);
      // Keep the first player fixed and rotate everyone else one place.
      list.splice(1, 0, list.pop());
    }
    if (legs === 1) return firstLeg;
    return [...firstLeg, ...firstLeg.map((pairs) => pairs.map(([h, a]) => [a, h]))];
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  admin.openFixtureGenerator = function () {
    const approved = admin.approvedPlayers();
    if (approved.length < 2) {
      ui.toast('You need at least two approved players to generate fixtures.', 'warning');
      return;
    }
    const t = admin.state.tournament;
    const defaultLegs = /single|^round robin$/i.test(String(t.format || '')) ? '1' : '2';
    const existing = admin.state.matches;
    const lastRound = Math.max(0, ...existing.map((m) => m.round || 0));
    const tomorrow = new Date(Date.now() + 86400000);

    const modal = ui.modal({
      title: 'Auto-generate fixtures',
      size: 'lg',
      body: `
        <form novalidate class="grid gap-5" data-gen-form>
          <div data-form-alert hidden></div>
          <div class="grid sm:grid-cols-2 gap-4">
            ${ui.field({ name: 'legs', label: 'Format', as: 'select', value: defaultLegs, options: [
              { value: '2', label: 'Double round robin (home & away)' },
              { value: '1', label: 'Single round robin (play once)' },
            ] })}
            ${ui.field({ name: 'order', label: 'Player order', as: 'select', value: 'shuffle', options: [
              { value: 'shuffle', label: 'Random draw' },
              { value: 'name', label: 'Alphabetical' },
            ] })}
          </div>
          <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            ${ui.field({ name: 'start_date', label: 'First match day', type: 'date', value: toDateInput(tomorrow), required: true })}
            ${ui.field({ name: 'kickoff', label: 'First kickoff', type: 'time', value: '20:00', required: true, hint: 'Your local time' })}
            ${ui.field({ name: 'gap_minutes', label: 'Minutes between matches', type: 'number', min: 0, max: 720, value: 30, hint: 'Same day, one after another' })}
            ${ui.field({ name: 'gap_days', label: 'Days between rounds', type: 'number', min: 0, max: 60, value: 1, hint: '0 = all rounds on one day' })}
          </div>
          ${ui.field({ name: 'venue', label: 'Venue / Lobby (optional)', maxlength: 80, placeholder: 'e.g. Online' })}
          <div class="rounded-xl border border-white/10 bg-white/[.03] p-4" data-gen-summary></div>
          <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
            <button type="button" class="btn btn-ghost" data-close>Cancel</button>
            <button type="button" class="btn btn-secondary" data-reshuffle>${ui.icon('shuffle', '')}Re-draw</button>
            <button type="submit" class="btn btn-primary" data-submit>${ui.icon('wand-sparkles', '')}Create fixtures</button>
          </div>
        </form>`,
    });

    const form = modal.body.querySelector('[data-gen-form]');
    const summary = form.querySelector('[data-gen-summary]');
    const submit = form.querySelector('[data-submit]');
    let drawOrder = shuffle(approved);
    let plan = [];

    // Pairings that already have a fixture are skipped, so re-running never duplicates.
    const taken = new Set(existing.map((m) => `${m.home_player_id}>${m.away_player_id}`));
    const pairTaken = (h, a, legs) => taken.has(`${h.id}>${a.id}`) || (legs === 1 && taken.has(`${a.id}>${h.id}`));

    function build() {
      const v = ui.readForm(form);
      const legs = Number(v.legs) === 1 ? 1 : 2;
      const players = v.order === 'name' ? approved : drawOrder;
      const gapMin = Math.max(0, toInt(v.gap_minutes) ?? 30);
      const gapDays = Math.max(0, toInt(v.gap_days) ?? 1);
      const first = combineDateTime(v.start_date, v.kickoff);
      const rounds = roundRobin(players, legs);

      plan = [];
      let skipped = 0;
      let slot = 0;
      rounds.forEach((pairs, r) => {
        if (gapDays > 0) slot = 0;
        pairs.forEach(([home, away]) => {
          if (pairTaken(home, away, legs)) { skipped += 1; return; }
          let when = null;
          if (first) {
            const d = new Date(first);
            d.setDate(d.getDate() + r * gapDays);
            d.setMinutes(d.getMinutes() + slot * gapMin);
            when = d;
          }
          slot += 1;
          plan.push({ round: lastRound + r + 1, home, away, when });
        });
      });

      const n = approved.length;
      const perPlayer = (n - 1) * legs;
      const total = (n * (n - 1) / 2) * legs;
      const byRound = new Map();
      plan.forEach((m) => { if (!byRound.has(m.round)) byRound.set(m.round, []); byRound.get(m.round).push(m); });

      summary.innerHTML = `
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          ${[['Players', n], ['Rounds', rounds.length], ['Matches each', perPlayer], ['Total matches', total]].map(([l, val]) => `
            <div class="rounded-lg bg-white/[.04] p-2.5"><p class="text-[11px] uppercase tracking-wider text-muted">${l}</p><p class="font-display text-2xl font-bold text-white">${val}</p></div>`).join('')}
        </div>
        ${n % 2 ? '<p class="text-xs text-muted mt-3">Odd number of players: one player rests each round.</p>' : ''}
        ${skipped ? `<p class="text-xs text-warn mt-2">${skipped} pairing${skipped === 1 ? '' : 's'} already have a fixture and will be skipped.</p>` : ''}
        <div class="mt-4 max-h-[300px] overflow-y-auto pr-1 grid gap-3">
          ${plan.length ? [...byRound.entries()].map(([round, ms]) => `
            <div>
              <p class="text-xs font-bold uppercase tracking-wider text-neon mb-1.5">Round ${round}${ms[0].when ? ` · ${e(formatDate(ms[0].when, { weekday: 'short', day: 'numeric', month: 'short' }))}` : ''}</p>
              <div class="grid gap-1">
                ${ms.map((m) => `
                  <div class="flex items-center gap-2 text-sm rounded-md bg-white/[.03] px-2.5 py-1.5">
                    <span class="text-muted w-[64px] shrink-0">${m.when ? e(formatTime(m.when)) : '—'}</span>
                    <span class="text-white truncate flex-1 text-right">${e(m.home.player_name)}</span>
                    <span class="text-neon font-bold text-xs">VS</span>
                    <span class="text-white truncate flex-1">${e(m.away.player_name)}</span>
                  </div>`).join('')}
              </div>
            </div>`).join('') : '<p class="text-sm text-muted">Every pairing already has a fixture. Nothing new to create.</p>'}
        </div>`;
      submit.disabled = !plan.length;
      form.querySelector('[data-reshuffle]').hidden = v.order !== 'shuffle';
    }

    form.addEventListener('input', build);
    form.addEventListener('change', build);
    form.querySelector('[data-reshuffle]').addEventListener('click', () => { drawOrder = shuffle(approved); build(); });
    build();

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const v = ui.readForm(form);
      if (!combineDateTime(v.start_date, v.kickoff)) {
        ui.showErrors(form, { start_date: 'Enter a valid date and time.' });
        return;
      }
      if (!plan.length) return;
      const ok = await ui.confirm({
        title: `Create ${plan.length} fixtures?`,
        message: 'They will be published on the public fixtures page straight away. You can still edit or delete any match afterwards.',
        confirmText: 'Create fixtures',
        tone: 'primary',
      });
      if (!ok) return;

      const venue = nullable(v.venue);
      let done = 0;
      const created = await admin.mutate(async () => {
        for (const m of plan) {
          await api.admin.createMatch(t.id, {
            home_player_id: m.home.id,
            away_player_id: m.away.id,
            scheduled_at: m.when.toISOString(),
            round: m.round,
            status: 'upcoming',
            home_score: null,
            away_score: null,
            venue,
            notes: null,
          });
          done += 1;
          if (submit.isConnected) ui.setLoading(submit, true, `Creating ${done}/${plan.length}`);
        }
      }, { success: `${plan.length} fixtures created.`, button: submit, label: `Creating 0/${plan.length}` });
      if (created) modal.close();
      else if (done) ui.toast(`${done} of ${plan.length} fixtures were created before the error. Re-open the generator to add the rest; existing pairings are skipped.`, 'warning');
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
            <div class="flex flex-wrap gap-2 lg:ml-auto">
              <button type="button" class="btn btn-secondary btn-sm" data-generate ${approvedCount < 2 ? 'disabled' : ''}>${ui.icon('wand-sparkles', '')}Auto-generate</button>
              <button type="button" class="btn btn-primary btn-sm" data-add ${approvedCount < 2 ? 'disabled' : ''}>${ui.icon('calendar-plus', '')}Create fixture</button>
            </div>
          </div>
          <div data-list></div>
        </section>`;

      const list = el.querySelector('[data-list]');
      const draw = () => {
        const q = view.q.trim().toLowerCase();
        const rows = s.matches.filter((m) => (view.status === 'all' || m.status === view.status)
          && (!q || [m.home, m.away].some((p) => p && `${p.player_name} ${p.team_name}`.toLowerCase().includes(q))));

        if (!s.matches.length) {
          list.innerHTML = ui.state.empty({ icon: 'calendar-plus', title: 'No fixtures yet', message: 'Create your first match by selecting two approved players.', action: approvedCount >= 2 ? '<div class="flex flex-wrap justify-center gap-2"><button type="button" class="btn btn-primary btn-sm" data-generate>Auto-generate all fixtures</button><button type="button" class="btn btn-ghost btn-sm" data-add>Create one fixture</button></div>' : '' });
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
        if (ev.target.closest('[data-generate]')) { admin.openFixtureGenerator(); return; }
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
