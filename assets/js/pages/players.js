/* Player list: searchable, filterable, sortable; refreshes after registration. */
EF.boot(async function playersPage() {
  'use strict';
  const { qs, qsa, escapeHtml: e, debounce, formatDate } = EF.utils;
  const ui = EF.ui;

  const el = {
    search: qs('#player-search'),
    status: qs('#player-status'),
    sort: qs('#player-sort'),
    list: qs('#player-list'),
    count: qs('#player-count'),
  };

  const view = { players: [], q: '', status: 'all', sort: 'position', highlight: null, loaded: false };

  const params = new URLSearchParams(location.search);
  if (params.get('q')) { view.q = params.get('q'); el.search.value = view.q; }

  function setCounts() {
    const approved = view.players.filter((p) => p.status === 'approved').length;
    const pending = view.players.filter((p) => p.status === 'pending').length;
    qs('[data-count="total"]').textContent = view.players.length;
    qs('[data-count="approved"]').textContent = approved;
    qs('[data-count="pending"]').textContent = pending;
  }

  function filtered() {
    const q = view.q.trim().toLowerCase();
    let list = view.players.filter((p) => (view.status === 'all' || p.status === view.status)
      && (!q || [p.player_name, p.team_name, p.efootball_username].some((v) => String(v).toLowerCase().includes(q))));
    if (view.sort === 'name') list = [...list].sort((a, b) => a.player_name.localeCompare(b.player_name));
    if (view.sort === 'team') list = [...list].sort((a, b) => a.team_name.localeCompare(b.team_name) || a.player_name.localeCompare(b.player_name));
    return list;
  }

  function render() {
    if (!view.loaded) return;
    setCounts();
    const list = filtered();
    el.count.textContent = view.players.length
      ? `Showing ${list.length} of ${EF.utils.plural(view.players.length, 'player')}`
      : '';

    if (!view.players.length) {
      el.list.innerHTML = ui.state.empty({
        icon: 'users',
        title: 'No players registered yet',
        message: 'Be the first to claim a spot in the tournament.',
        action: '<button type="button" class="btn btn-primary btn-sm" data-action="join">Join Now</button>',
      });
      ui.icons();
      return;
    }
    if (!list.length) {
      el.list.innerHTML = ui.state.empty({
        icon: 'search-x',
        title: 'No matching players',
        message: 'Try a different search term or status filter.',
        action: '<button type="button" class="btn btn-ghost btn-sm" data-clear-filters>Clear filters</button>',
      });
      ui.icons();
      return;
    }

    const rowClass = (p) => (p.id === view.highlight ? 'is-new' : '');

    el.list.innerHTML = `
      <div class="hidden md:block table-wrap mt-2">
        <table class="ef-table">
          <thead>
            <tr>
              <th class="num" scope="col">Position</th>
              <th scope="col">Player Name</th>
              <th scope="col">Team Name</th>
              <th scope="col">eFootball Username</th>
              <th scope="col">Registration Status</th>
              <th scope="col">Registered</th>
            </tr>
          </thead>
          <tbody>
            ${list.map((p) => `
              <tr class="${rowClass(p)}">
                <td class="num"><span class="pos-chip">${p.position}</span></td>
                <td><div class="flex items-center gap-3">${ui.avatar(p, 'sm')}<span class="font-semibold text-white">${e(p.player_name)}</span></div></td>
                <td>${e(p.team_name)}</td>
                <td><span class="inline-flex items-center gap-2 font-mono text-[13px] text-volt">${ui.icon('gamepad-2', 'w-3.5 h-3.5')}${e(p.efootball_username)}</span></td>
                <td>${ui.playerStatusBadge(p.status)}</td>
                <td class="text-muted text-[13px]">${e(formatDate(p.created_at, { day: '2-digit', month: 'short', year: 'numeric' }))}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <ul class="md:hidden grid gap-2 p-3">
        ${list.map((p) => `
          <li class="min-w-0 rounded-2xl border border-white/5 bg-black/20 p-3 sm:p-3.5 flex items-center gap-2.5 sm:gap-3 ${rowClass(p) ? 'ring-1 ring-[#d4ff1a]/50' : ''}">
            <span class="pos-chip shrink-0">${p.position}</span>
            ${ui.avatar(p)}
            <div class="min-w-0 flex-1">
              <p class="font-semibold text-white truncate">${e(p.player_name)}</p>
              <p class="text-xs text-muted truncate">${e(p.team_name)} · <span class="text-volt">${e(p.efootball_username)}</span></p>
            </div>
            <span class="shrink-0">${ui.playerStatusBadge(p.status)}</span>
          </li>`).join('')}
      </ul>`;
    ui.icons();
  }

  async function load({ silent = false } = {}) {
    if (!silent) el.list.innerHTML = `<div class="p-4">${ui.state.skeleton(6, 'h-12')}</div>`;
    try {
      const d = await EF.api.loadPublicData();
      if (!d.tournament) {
        view.loaded = false;
        el.count.textContent = '';
        qsa('[data-count]').forEach((n) => { n.textContent = '0'; });
        el.list.innerHTML = ui.state.empty({ icon: 'calendar-x', title: 'No active tournament', message: 'The player list opens when a tournament is published.' });
        ui.icons();
        return d;
      }
      view.players = d.players.map((p, i) => ({ ...p, position: i + 1 }));
      view.loaded = true;
      render();
      return d;
    } catch (err) {
      console.error(err);
      el.list.innerHTML = ui.state.error({ message: EF.api.friendlyError(err) });
      ui.icons();
      return null;
    }
  }

  el.search.addEventListener('input', debounce(() => { view.q = el.search.value; render(); }, 150));
  el.status.addEventListener('change', () => { view.status = el.status.value; render(); });
  el.sort.addEventListener('change', () => { view.sort = el.sort.value; render(); });
  el.list.addEventListener('click', (ev) => {
    if (!ev.target.closest('[data-clear-filters]')) return;
    view.q = ''; view.status = 'all';
    el.search.value = ''; el.status.value = 'all';
    render();
  });

  document.addEventListener('ef:retry', () => load());
  window.addEventListener('ef:player-registered', async (ev) => {
    view.highlight = ev.detail && ev.detail.id;
    await load({ silent: true });
  });

  const data = await load();
  if (data) {
    EF.api.watch({ key: 'players', tables: ['tournaments'], onChange: () => load({ silent: true }) });
  }
});
