/* Fixtures & results: status tabs, search, grouped by match day, live updates. */
EF.boot(async function fixturesPage() {
  'use strict';
  const { qs, escapeHtml: e, debounce, dayKey, formatDate, formatTime, relativeDay } = EF.utils;
  const ui = EF.ui;

  const STATUSES = [
    { id: 'all', label: 'All' },
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'live', label: 'Live' },
    { id: 'completed', label: 'Completed' },
    { id: 'postponed', label: 'Postponed' },
  ];

  const el = {
    tabs: qs('#status-tabs'),
    search: qs('#fixture-search'),
    list: qs('#fixture-list'),
    updated: qs('#fixtures-updated'),
  };

  const fromHash = location.hash.replace('#', '');
  const view = {
    matches: [],
    status: STATUSES.some((s) => s.id === fromHash) ? fromHash : 'all',
    q: '',
    loaded: false,
  };

  function renderTabs() {
    const count = (id) => (id === 'all' ? view.matches.length : view.matches.filter((m) => m.status === id).length);
    el.tabs.innerHTML = STATUSES.map((s) => `
      <button type="button" role="tab" class="chip ${view.status === s.id ? 'is-active' : ''}" aria-selected="${view.status === s.id}" data-status="${s.id}">
        ${s.id === 'live' && count('live') ? '<span class="live-dot"></span>' : ''}${s.label}<span class="chip__count">${view.loaded ? count(s.id) : '·'}</span>
      </button>`).join('');
  }

  function filtered() {
    const q = view.q.trim().toLowerCase();
    const list = view.matches.filter((m) => (view.status === 'all' || m.status === view.status)
      && (!q || [m.home, m.away].some((p) => p && [p.player_name, p.team_name, p.efootball_username]
        .some((v) => String(v).toLowerCase().includes(q)))));
    // Results read newest-first; everything else chronologically.
    const desc = view.status === 'completed';
    return list.sort((a, b) => (desc ? -1 : 1) * (new Date(a.scheduled_at) - new Date(b.scheduled_at)));
  }

  function render() {
    renderTabs();
    if (!view.loaded) return;

    if (!view.matches.length) {
      el.list.innerHTML = `<div class="glass">${ui.state.empty({ icon: 'calendar-clock', title: 'No fixtures scheduled', message: 'The admin has not published any matches yet. Check back soon.' })}</div>`;
      ui.icons();
      return;
    }
    const list = filtered();
    if (!list.length) {
      const label = (STATUSES.find((s) => s.id === view.status) || {}).label || '';
      el.list.innerHTML = `<div class="glass">${ui.state.empty({
        icon: 'search-x',
        title: view.q ? 'No matching fixtures' : `No ${label.toLowerCase()} matches`,
        message: view.q ? 'Try another player or team name.' : 'Matches with this status will appear here.',
      })}</div>`;
      ui.icons();
      return;
    }

    const groups = [];
    const index = new Map();
    list.forEach((m) => {
      const key = dayKey(m.scheduled_at);
      if (!index.has(key)) { index.set(key, groups.length); groups.push({ key, date: m.scheduled_at, items: [] }); }
      groups[index.get(key)].items.push(m);
    });

    el.list.innerHTML = groups.map((g) => {
      const rel = relativeDay(g.date);
      return `
        <div>
          <h2 class="day-head">
            ${rel ? `<span class="text-neon">${e(rel)}</span><span class="text-subtle">·</span>` : ''}
            <span>${e(formatDate(g.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</span>
            <span class="badge badge--neutral !h-6">${EF.utils.plural(g.items.length, 'match', 'matches')}</span>
          </h2>
          <div class="grid md:grid-cols-2 gap-4 mt-4">${g.items.map(ui.matchCard).join('')}</div>
        </div>`;
    }).join('');
    ui.icons();
  }

  async function load({ silent = false } = {}) {
    if (!silent) el.list.innerHTML = `<div class="grid md:grid-cols-2 gap-4">${Array.from({ length: 4 }, () => '<div class="skeleton h-[150px]"></div>').join('')}</div>`;
    try {
      const d = await EF.api.loadPublicData();
      if (!d.tournament) {
        view.loaded = false;
        renderTabs();
        el.list.innerHTML = `<div class="glass">${ui.state.empty({ icon: 'calendar-x', title: 'No active tournament', message: 'Fixtures are published together with the tournament.' })}</div>`;
        ui.icons();
        return d;
      }
      view.matches = d.matches;
      view.loaded = true;
      el.updated.innerHTML = `${ui.icon('refresh-cw', 'w-3.5 h-3.5')}Updated ${e(formatTime(d.loadedAt))}`;
      render();
      return d;
    } catch (err) {
      console.error(err);
      el.list.innerHTML = `<div class="glass">${ui.state.error({ message: EF.api.friendlyError(err) })}</div>`;
      ui.icons();
      return null;
    }
  }

  el.tabs.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-status]');
    if (!btn) return;
    view.status = btn.dataset.status;
    history.replaceState(null, '', view.status === 'all' ? location.pathname + location.search : `#${view.status}`);
    render();
  });
  el.search.addEventListener('input', debounce(() => { view.q = el.search.value; render(); }, 150));
  document.addEventListener('ef:retry', () => load());

  renderTabs();
  const data = await load();
  if (data) EF.api.watch({ key: 'fixtures', onChange: () => load({ silent: true }) });
});
