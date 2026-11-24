/* Full point table with highlights and live recalculation. */
EF.boot(async function standingsPage() {
  'use strict';
  const { qs, escapeHtml: e, formatDateTime } = EF.utils;
  const ui = EF.ui;

  const el = {
    chips: qs('#scoring-chips'),
    highlights: qs('#standings-highlights'),
    table: qs('#standings-table'),
    updated: qs('#standings-updated'),
  };

  function tile(icon, label, value, sub, tone = '') {
    return `
      <div class="stat-tile ${tone}">
        <div class="stat-tile__icon">${ui.icon(icon, '')}</div>
        <p class="stat-tile__label !mt-0">${e(label)}</p>
        <p class="font-display text-xl sm:text-2xl font-bold text-white mt-2 clamp-2">${e(value)}</p>
        <p class="text-xs text-muted mt-1 truncate">${e(sub)}</p>
      </div>`;
  }

  function renderHighlights(d) {
    const played = d.standings.filter((r) => r.played > 0);
    const completed = d.matches.filter((m) => m.status === 'completed').length;
    if (!played.length) {
      el.highlights.innerHTML = [
        tile('crown', 'Leader', 'To be decided', 'After the first result'),
        tile('flame', 'Best attack', '—', 'Most goals scored', 'stat-tile--volt'),
        tile('shield', 'Best defence', '—', 'Fewest conceded', 'stat-tile--volt'),
        tile('check-check', 'Matches played', String(completed), `${d.standings.length} approved players`),
      ].join('');
      return;
    }
    const leader = played[0];
    const attack = [...played].sort((a, b) => b.gf - a.gf)[0];
    const defence = [...played].sort((a, b) => (a.ga / a.played) - (b.ga / b.played) || b.played - a.played)[0];
    el.highlights.innerHTML = [
      tile('crown', 'Leader', leader.player.player_name, `${leader.points} pts · ${leader.player.team_name}`),
      tile('flame', 'Best attack', attack.player.player_name, `${attack.gf} goals scored`, 'stat-tile--volt'),
      tile('shield', 'Best defence', defence.player.player_name, `${defence.ga} conceded in ${defence.played}`, 'stat-tile--volt'),
      tile('check-check', 'Matches played', String(completed), `${d.standings.length} approved players`),
    ].join('');
  }

  async function load({ silent = false } = {}) {
    if (!silent) {
      el.table.innerHTML = `<div class="p-4">${ui.state.skeleton(8, 'h-12')}</div>`;
      el.highlights.innerHTML = Array.from({ length: 4 }, () => '<div class="skeleton h-[108px]"></div>').join('');
    }
    try {
      const d = await EF.api.loadPublicData();
      if (!d.tournament) {
        el.highlights.innerHTML = '';
        el.chips.innerHTML = '';
        el.table.innerHTML = ui.state.empty({ icon: 'list-ordered', title: 'No active tournament', message: 'The point table goes live when a tournament is published.' });
        ui.icons();
        return d;
      }
      const t = d.tournament;
      el.chips.innerHTML = [['Win', t.points_win], ['Draw', t.points_draw], ['Loss', t.points_loss]]
        .map(([label, pts]) => `<span class="meta-chip"><strong class="text-white font-display text-base">${e(pts)}</strong> pts · ${label}</span>`).join('');
      renderHighlights(d);
      el.table.innerHTML = d.standings.length
        ? ui.standingsTable(d.standings, { showForm: true })
        : ui.state.empty({ icon: 'users', title: 'No approved players yet', message: 'Players appear in the table once their registration is approved.' });
      el.updated.textContent = `Last updated ${formatDateTime(d.loadedAt)}`;
      ui.icons();
      return d;
    } catch (err) {
      console.error(err);
      el.highlights.innerHTML = '';
      el.table.innerHTML = ui.state.error({ message: EF.api.friendlyError(err) });
      ui.icons();
      return null;
    }
  }

  document.addEventListener('ef:retry', () => load());
  const data = await load();
  if (data) EF.api.watch({ key: 'standings', onChange: () => load({ silent: true }) });
});
