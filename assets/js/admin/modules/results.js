/* Admin module 5: Match result management (inline score + status editing). */
(function () {
  'use strict';
  const { escapeHtml: e, formatDate, formatTime, relativeDay, toInt } = EF.utils;
  const ui = EF.ui;
  const admin = EF.admin;
  const api = EF.api;

  // drafts keep unsaved row edits alive across re-renders (e.g. after saving another row).
  const view = { filter: 'pending', drafts: {} };

  const FILTERS = [
    { id: 'pending', label: 'Needs result' },
    { id: 'live', label: 'Live' },
    { id: 'completed', label: 'Completed' },
    { id: 'all', label: 'All' },
  ];

  function sortForResults(list) {
    const rank = { live: 0, upcoming: 1, postponed: 2, completed: 3 };
    return [...list].sort((a, b) => rank[a.status] - rank[b.status]
      || (a.status === 'completed'
        ? new Date(b.scheduled_at) - new Date(a.scheduled_at)
        : new Date(a.scheduled_at) - new Date(b.scheduled_at)));
  }

  function rowHtml(m) {
    const statusSelect = `
      <label class="sr-only" for="st-${e(m.id)}">Match status</label>
      <select id="st-${e(m.id)}" name="status" class="select !h-10 !w-auto !text-sm">
        ${Object.entries(ui.MATCH_STATUS).map(([value, s]) => `<option value="${value}" ${m.status === value ? 'selected' : ''}>${s.label}</option>`).join('')}
      </select>`;
    const overdue = m.status === 'upcoming' && new Date(m.scheduled_at) < Date.now();

    const { homeWin, awayWin, draw } = ui.matchOutcome(m);
    return `
      <form class="result-row glass p-4 sm:p-5" data-result="${e(m.id)}" novalidate>
        <div class="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span class="font-semibold uppercase tracking-[.14em]">${m.round ? `Round ${e(m.round)}` : 'Fixture'}</span>
          <span>·</span><span>${e(relativeDay(m.scheduled_at) || formatDate(m.scheduled_at, { weekday: 'short', day: '2-digit', month: 'short' }))}, ${e(formatTime(m.scheduled_at))}</span>
          ${overdue ? `<span class="badge badge--pending !h-6">${ui.icon('circle-alert', '')}Past kickoff</span>` : ''}
          ${draw ? '<span class="draw-chip !mt-0">Draw</span>' : ''}
          <span class="ml-auto">${ui.matchStatusBadge(m.status)}</span>
        </div>
        <div class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-5 mt-4">
          <div class="flex items-center gap-3 justify-end text-right min-w-0">
            <div class="min-w-0"><p class="font-display text-lg font-bold truncate ${homeWin ? 'text-gold' : 'text-white'}">${e(m.home ? m.home.player_name : 'Unknown')}</p><p class="text-xs text-muted truncate">${e(m.home ? m.home.team_name : '')}</p>${homeWin ? ui.winChip() : ''}</div>
            <span class="hidden sm:inline-flex">${ui.winnerAvatar(m.home || '?', 'md', { win: homeWin, lose: awayWin })}</span>
          </div>
          <div class="flex items-center gap-2">
            <label class="sr-only" for="hs-${e(m.id)}">${e(m.home ? m.home.player_name : 'Home')} score</label>
            <input id="hs-${e(m.id)}" name="home_score" type="number" inputmode="numeric" min="0" max="99" class="input input-score" value="${m.home_score ?? ''}" placeholder="–">
            <span class="font-display text-2xl text-subtle">:</span>
            <label class="sr-only" for="as-${e(m.id)}">${e(m.away ? m.away.player_name : 'Away')} score</label>
            <input id="as-${e(m.id)}" name="away_score" type="number" inputmode="numeric" min="0" max="99" class="input input-score" value="${m.away_score ?? ''}" placeholder="–">
          </div>
          <div class="flex items-center gap-3 min-w-0">
            <span class="hidden sm:inline-flex">${ui.winnerAvatar(m.away || '?', 'md', { win: awayWin, lose: homeWin })}</span>
            <div class="min-w-0"><p class="font-display text-lg font-bold truncate ${awayWin ? 'text-gold' : 'text-white'}">${e(m.away ? m.away.player_name : 'Unknown')}</p><p class="text-xs text-muted truncate">${e(m.away ? m.away.team_name : '')}</p>${awayWin ? ui.winChip() : ''}</div>
          </div>
        </div>
        <div class="mt-4 flex flex-wrap items-center justify-end gap-2">
          <p class="text-xs text-danger mr-auto" data-row-error hidden></p>
          ${statusSelect}
          <button type="button" class="btn btn-ghost btn-sm" data-reset disabled>Reset</button>
          <button type="submit" class="btn btn-primary btn-sm" data-save disabled>${ui.icon('save', '')}Save result</button>
        </div>
      </form>`;
  }

  const readRow = (form) => ({
    home_score: form.elements.home_score.value,
    away_score: form.elements.away_score.value,
    status: form.elements.status.value,
  });

  admin.register('results', {
    title: 'Match Result Management',

    render(el, s) {
      const groups = {
        pending: s.matches.filter((m) => m.status === 'upcoming' || m.status === 'postponed' || m.status === 'live'),
        live: s.matches.filter((m) => m.status === 'live'),
        completed: s.matches.filter((m) => m.status === 'completed'),
        all: s.matches,
      };
      const list = sortForResults(groups[view.filter]);

      el.innerHTML = `
        <div class="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
          <div class="scroll-x" role="tablist" aria-label="Filter matches">
            ${FILTERS.map((f) => `
              <button type="button" class="chip ${view.filter === f.id ? 'is-active' : ''}" data-filter="${f.id}" role="tab" aria-selected="${view.filter === f.id}">
                ${f.id === 'live' && groups.live.length ? '<span class="live-dot"></span>' : ''}${f.label}<span class="chip__count">${groups[f.id].length}</span>
              </button>`).join('')}
          </div>
          <p class="text-xs text-muted sm:ml-auto">Saving a completed result recalculates the point table instantly.</p>
        </div>
        <div class="grid gap-4" data-list>
          ${list.length ? list.map(rowHtml).join('') : `<div class="glass">${ui.state.empty({
            icon: view.filter === 'completed' ? 'flag' : 'check-check',
            title: view.filter === 'pending' ? 'All results are in' : 'Nothing to show',
            message: view.filter === 'pending' ? 'Every scheduled match has a final result.' : 'Matches with this status will appear here.',
            action: !s.matches.length ? '<a href="#/fixtures" class="btn btn-primary btn-sm">Create fixtures</a>' : '',
          })}</div>`}
        </div>`;

      el.addEventListener('click', (ev) => {
        const filter = ev.target.closest('[data-filter]');
        if (filter) {
          if (Object.keys(view.drafts).length && !window.confirm('Discard unsaved result changes?')) return;
          view.drafts = {};
          view.filter = filter.dataset.filter;
          admin.rerender();
          return;
        }
        const reset = ev.target.closest('[data-reset]');
        if (reset) {
          const form = reset.closest('form');
          const m = s.matches.find((x) => x.id === form.dataset.result);
          form.elements.home_score.value = m.home_score ?? '';
          form.elements.away_score.value = m.away_score ?? '';
          form.elements.status.value = m.status;
          delete view.drafts[m.id];
          markDirty(form, false);
        }
      });

      const markDirty = (form, dirty) => {
        form.dataset.dirty = String(dirty);
        form.classList.toggle('is-dirty', dirty);
        form.querySelector('[data-save]').disabled = !dirty;
        form.querySelector('[data-reset]').disabled = !dirty;
        const err = form.querySelector('[data-row-error]');
        err.hidden = true;
        form.querySelectorAll('.is-invalid').forEach((x) => x.classList.remove('is-invalid'));
      };

      const onEdit = (ev) => {
        const form = ev.target.closest('form[data-result]');
        if (!form) return;
        if (ev.type === 'input' && ['home_score', 'away_score'].includes(ev.target.name)) {
          const both = form.elements.home_score.value !== '' && form.elements.away_score.value !== '';
          if (both && form.elements.status.value === 'upcoming') form.elements.status.value = 'completed';
        }
        markDirty(form, true);
        view.drafts[form.dataset.result] = readRow(form);
      };
      el.addEventListener('input', onEdit);
      el.addEventListener('change', onEdit);

      // Restore unsaved edits that survived a re-render.
      Object.entries(view.drafts).forEach(([id, d]) => {
        const form = el.querySelector(`form[data-result="${CSS.escape(id)}"]`);
        if (!form) { delete view.drafts[id]; return; }
        form.elements.home_score.value = d.home_score;
        form.elements.away_score.value = d.away_score;
        form.elements.status.value = d.status;
        markDirty(form, true);
      });

      el.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const form = ev.target.closest('form[data-result]');
        if (!form) return;
        const err = form.querySelector('[data-row-error]');
        const home = toInt(form.elements.home_score.value);
        const away = toInt(form.elements.away_score.value);
        const status = form.elements.status.value;

        const fail = (message, fields = []) => {
          err.textContent = message;
          err.hidden = false;
          fields.forEach((n) => form.elements[n].classList.add('is-invalid'));
        };
        if ([home, away].some((n) => n !== null && (Number.isNaN(n) || n < 0 || n > 99))) {
          fail('Scores must be whole numbers from 0 to 99.', ['home_score', 'away_score']);
          return;
        }
        if ((home === null) !== (away === null)) {
          fail('Enter both scores or leave both empty.', [home === null ? 'home_score' : 'away_score']);
          return;
        }
        if (status === 'completed' && home === null) {
          fail('A completed match needs a score for both players.', ['home_score', 'away_score']);
          return;
        }

        const id = form.dataset.result;
        const draft = view.drafts[id];
        delete view.drafts[id];
        form.dataset.dirty = 'false';
        const ok = await admin.mutate(
          () => api.admin.updateMatch(id, { home_score: home, away_score: away, status }),
          { success: status === 'completed' ? 'Result saved. Point table updated.' : 'Match updated.', button: form.querySelector('[data-save]') },
        );
        if (!ok && draft) {
          view.drafts[id] = draft;
          if (form.isConnected) markDirty(form, true);
        }
      });
    },
  });
})();
