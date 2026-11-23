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

  /** Step 0: choose how to create fixtures. */
  admin.openFixtureChooser = function () {
    const approved = admin.approvedPlayers();
    if (approved.length < 2) {
      ui.toast('You need at least two approved players before creating fixtures.', 'warning');
      return;
    }
    const n = approved.length;
    const modal = ui.modal({
      title: 'Create fixtures',
      size: 'md',
      body: `
        <div class="grid gap-3">
          <p class="text-sm text-muted">You have <strong class="text-white">${n} approved players</strong>. How do you want to create the fixtures?</p>
          <button type="button" class="fx-choice is-recommended" data-mode="auto">
            <span class="fx-choice__icon">${ui.icon('wand-sparkles', '')}</span>
            <span class="fx-choice__text">
              <span class="fx-choice__title">Automatic <span class="fx-choice__tag">Recommended</span></span>
              <span class="fx-choice__desc">Generate a full round robin (single or double) in one click. Preview it, then change dates, times, home/away or remove matches before saving.</span>
              <span class="fx-choice__meta">Double round robin: ${n * (n - 1)} matches · Single: ${n * (n - 1) / 2} matches</span>
            </span>
            ${ui.icon('chevron-right', 'fx-choice__arrow')}
          </button>
          <button type="button" class="fx-choice" data-mode="manual">
            <span class="fx-choice__icon">${ui.icon('pencil-line', '')}</span>
            <span class="fx-choice__text">
              <span class="fx-choice__title">Manual</span>
              <span class="fx-choice__desc">Pick two players and set the date, time and round for a single match yourself.</span>
            </span>
            ${ui.icon('chevron-right', 'fx-choice__arrow')}
          </button>
        </div>`,
    });
    modal.body.addEventListener('click', (ev) => {
      const choice = ev.target.closest('[data-mode]');
      if (!choice) return;
      modal.close();
      if (choice.dataset.mode === 'auto') admin.openFixtureGenerator();
      else admin.openFixtureForm();
    });
    ui.icons();
  };

  /** Automatic: settings on top, an editable match list below. */
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
      title: 'Automatic fixtures',
      size: 'xl',
      body: `
        <form novalidate class="grid gap-5" data-gen-form>
          <div data-form-alert hidden></div>
          <section class="fx-step">
            <p class="fx-step__title"><span>1</span>Settings</p>
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
            <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
              ${ui.field({ name: 'start_date', label: 'First match day', type: 'date', value: toDateInput(tomorrow), required: true })}
              ${ui.field({ name: 'kickoff', label: 'First kickoff', type: 'time', value: '20:00', required: true, hint: 'Your local time' })}
              ${ui.field({ name: 'gap_minutes', label: 'Minutes between matches', type: 'number', min: 0, max: 720, value: 30 })}
              ${ui.field({ name: 'gap_days', label: 'Days between rounds', type: 'number', min: 0, max: 60, value: 1, hint: '0 = all rounds on one day' })}
            </div>
            <div class="mt-4">${ui.field({ name: 'venue', label: 'Venue / Lobby (optional)', maxlength: 80, placeholder: 'e.g. Online' })}</div>
          </section>
          <section class="fx-step">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="fx-step__title"><span>2</span>Review &amp; customize</p>
              <div class="flex flex-wrap gap-2">
                <button type="button" class="btn btn-ghost btn-xs" data-reshuffle>${ui.icon('shuffle', '')}Re-draw</button>
                <button type="button" class="btn btn-ghost btn-xs" data-reset hidden>${ui.icon('rotate-ccw', '')}Undo my changes</button>
              </div>
            </div>
            <div data-gen-summary></div>
          </section>
          <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
            <button type="button" class="btn btn-ghost" data-back>${ui.icon('arrow-left', '')}Back</button>
            <button type="submit" class="btn btn-primary" data-submit>${ui.icon('check', '')}Create fixtures</button>
          </div>
        </form>`,
    });

    const form = modal.body.querySelector('[data-gen-form]');
    const summary = form.querySelector('[data-gen-summary]');
    const submit = form.querySelector('[data-submit]');
    const resetBtn = form.querySelector('[data-reset]');
    let drawOrder = shuffle(approved);
    let plan = [];
    // Admin edits, keyed by the generated pairing: { swap, removed, date, time }.
    let overrides = new Map();

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
            when = new Date(first);
            when.setDate(when.getDate() + r * gapDays);
            when.setMinutes(when.getMinutes() + slot * gapMin);
          }
          slot += 1;
          const key = `${home.id}>${away.id}`;
          const o = overrides.get(key) || {};
          const date = o.date || (when ? toDateInput(when) : '');
          const time = o.time || (when ? toTimeInput(when) : '');
          plan.push({
            key,
            round: lastRound + r + 1,
            home: o.swap ? away : home,
            away: o.swap ? home : away,
            date,
            time,
            edited: Boolean(o.swap || o.date || o.time),
            removed: Boolean(o.removed),
          });
        });
      });

      const n = approved.length;
      const active = plan.filter((m) => !m.removed);
      const byRound = new Map();
      plan.forEach((m) => { if (!byRound.has(m.round)) byRound.set(m.round, []); byRound.get(m.round).push(m); });

      summary.innerHTML = `
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-3">
          ${[['Players', n], ['Rounds', rounds.length], ['Matches each', (n - 1) * legs], ['To create', active.length]].map(([l, val]) => `
            <div class="fx-stat"><p>${l}</p><b>${val}</b></div>`).join('')}
        </div>
        ${n % 2 ? `<p class="text-xs text-muted mt-3">${ui.icon('info', 'w-3.5 h-3.5 inline -mt-0.5')} Odd number of players: one player rests each round.</p>` : ''}
        ${skipped ? `<p class="text-xs text-warn mt-2">${skipped} pairing${skipped === 1 ? '' : 's'} already have a fixture and will be skipped.</p>` : ''}
        <p class="text-xs text-muted mt-3">Change any match's date or time, ${ui.icon('arrow-left-right', 'w-3.5 h-3.5 inline -mt-0.5')} swap home/away, or ${ui.icon('x', 'w-3.5 h-3.5 inline -mt-0.5')} leave it out.</p>
        <div class="fx-list mt-3">
          ${plan.length ? [...byRound.entries()].map(([round, ms]) => `
            <div class="fx-round">
              <p class="fx-round__title">Round ${round}${ms[0].date ? ` <span>${e(formatDate(combineDateTime(ms[0].date, ms[0].time || '00:00') || new Date(), { weekday: 'short', day: 'numeric', month: 'short' }))}</span>` : ''}</p>
              ${ms.map((m) => `
                <div class="fx-row${m.removed ? ' is-removed' : ''}${m.edited ? ' is-edited' : ''}" data-key="${e(m.key)}">
                  <div class="fx-row__when">
                    <input type="date" class="input fx-input" value="${e(m.date)}" data-edit="date" aria-label="Date" ${m.removed ? 'disabled' : ''}>
                    <input type="time" class="input fx-input" value="${e(m.time)}" data-edit="time" aria-label="Kickoff time" ${m.removed ? 'disabled' : ''}>
                  </div>
                  <div class="fx-row__teams">
                    <span class="fx-row__p">${ui.avatar(m.home, 'sm')}<span>${e(m.home.player_name)}</span></span>
                    <span class="fx-row__vs">VS</span>
                    <span class="fx-row__p fx-row__p--away"><span>${e(m.away.player_name)}</span>${ui.avatar(m.away, 'sm')}</span>
                  </div>
                  <div class="fx-row__actions">
                    <button type="button" class="icon-btn icon-btn--sm" data-swap title="Swap home and away" aria-label="Swap home and away" ${m.removed ? 'disabled' : ''}>${ui.icon('arrow-left-right', '')}</button>
                    <button type="button" class="icon-btn icon-btn--sm ${m.removed ? '' : 'icon-btn--danger'}" data-remove title="${m.removed ? 'Add back' : 'Leave out'}" aria-label="${m.removed ? 'Add this match back' : 'Leave this match out'}">${ui.icon(m.removed ? 'undo-2' : 'x', '')}</button>
                  </div>
                </div>`).join('')}
            </div>`).join('') : '<p class="text-sm text-muted p-3">Every pairing already has a fixture. Nothing new to create.</p>'}
        </div>`;
      submit.disabled = !active.length;
      submit.innerHTML = `${ui.icon('check', '')}Create ${active.length} fixture${active.length === 1 ? '' : 's'}`;
      submit.dataset.originalHtml = submit.innerHTML;
      form.querySelector('[data-reshuffle]').hidden = v.order !== 'shuffle';
      resetBtn.hidden = !overrides.size;
      ui.icons();
    }

    const edit = (key, patch) => {
      const next = { ...(overrides.get(key) || {}), ...patch };
      if (!next.swap && !next.removed && !next.date && !next.time) overrides.delete(key);
      else overrides.set(key, next);
      build();
    };

    // Settings change → regenerate. Per-match inputs are handled separately below.
    form.addEventListener('change', (ev) => {
      const row = ev.target.closest('[data-key]');
      if (row && ev.target.dataset.edit) { edit(row.dataset.key, { [ev.target.dataset.edit]: ev.target.value }); return; }
      if (!row) build();
    });
    form.addEventListener('input', (ev) => {
      if (!ev.target.closest('[data-key]') && ev.target.type === 'number') build();
    });
    form.addEventListener('click', (ev) => {
      const row = ev.target.closest('[data-key]');
      if (row && ev.target.closest('[data-swap]')) {
        const o = overrides.get(row.dataset.key) || {};
        edit(row.dataset.key, { swap: !o.swap });
      } else if (row && ev.target.closest('[data-remove]')) {
        const o = overrides.get(row.dataset.key) || {};
        edit(row.dataset.key, { removed: !o.removed });
      }
    });
    form.querySelector('[data-reshuffle]').addEventListener('click', async () => {
      if (overrides.size && !(await ui.confirm({ title: 'Re-draw fixtures?', message: 'A new random draw replaces your match changes.', confirmText: 'Re-draw', tone: 'primary' }))) return;
      overrides = new Map();
      drawOrder = shuffle(approved);
      build();
    });
    resetBtn.addEventListener('click', () => { overrides = new Map(); build(); });
    form.querySelector('[data-back]').addEventListener('click', () => { modal.close(); admin.openFixtureChooser(); });
    build();

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const active = plan.filter((m) => !m.removed);
      if (!active.length) return;
      const bad = active.find((m) => !combineDateTime(m.date, m.time));
      if (bad) {
        ui.formAlert(form, `Set a valid date and time for ${bad.home.player_name} vs ${bad.away.player_name}.`);
        form.querySelector(`[data-key="${CSS.escape(bad.key)}"] [data-edit="date"]`)?.focus();
        return;
      }
      ui.formAlert(form, null);
      const ok = await ui.confirm({
        title: `Create ${active.length} fixtures?`,
        message: 'They will be published on the public fixtures page straight away. You can still edit or delete any match afterwards.',
        confirmText: 'Create fixtures',
        tone: 'primary',
      });
      if (!ok) return;

      const venue = nullable(ui.readForm(form).venue);
      let done = 0;
      const created = await admin.mutate(async () => {
        for (const m of active) {
          await api.admin.createMatch(t.id, {
            home_player_id: m.home.id,
            away_player_id: m.away.id,
            scheduled_at: combineDateTime(m.date, m.time),
            round: m.round,
            status: 'upcoming',
            home_score: null,
            away_score: null,
            venue,
            notes: null,
          });
          done += 1;
          if (submit.isConnected) ui.setLoading(submit, true, `Creating ${done}/${active.length}`);
        }
      }, { success: `${active.length} fixtures created.`, button: submit, label: `Creating 0/${active.length}` });
      if (created) modal.close();
      else if (done) ui.toast(`${done} of ${active.length} fixtures were created before the error. Open Automatic again to add the rest; existing pairings are skipped.`, 'warning');
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
            <button type="button" class="btn btn-primary btn-sm lg:ml-auto" data-choose ${approvedCount < 2 ? 'disabled' : ''}>${ui.icon('calendar-plus', '')}Create fixtures</button>
          </div>
          <div data-list></div>
        </section>`;

      const list = el.querySelector('[data-list]');
      const draw = () => {
        const q = view.q.trim().toLowerCase();
        const rows = s.matches.filter((m) => (view.status === 'all' || m.status === view.status)
          && (!q || [m.home, m.away].some((p) => p && `${p.player_name} ${p.team_name}`.toLowerCase().includes(q))));

        if (!s.matches.length) {
          list.innerHTML = ui.state.empty({ icon: 'calendar-plus', title: 'No fixtures yet', message: 'Create your first match by selecting two approved players.', action: approvedCount >= 2 ? `<div class="flex flex-wrap justify-center gap-2"><button type="button" class="btn btn-primary btn-sm" data-generate>${ui.icon('wand-sparkles', '')}Generate automatically</button><button type="button" class="btn btn-ghost btn-sm" data-add>Add one manually</button></div>` : '' });
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
        if (ev.target.closest('[data-choose]')) { admin.openFixtureChooser(); return; }
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
        admin.openFixtureChooser();
      }
    },
  });
})();
