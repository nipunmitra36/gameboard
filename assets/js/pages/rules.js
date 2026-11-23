/* Public tournament rules page. */
EF.boot(async function rulesPage() {
  'use strict';
  const { qs, escapeHtml: e } = EF.utils;
  const ui = EF.ui;
  const points = qs('#rules-points');
  const list = qs('#rules-list');

  async function load({ silent = false } = {}) {
    if (!silent) {
      points.innerHTML = '<div class="skeleton h-10 w-28"></div><div class="skeleton h-10 w-28"></div><div class="skeleton h-10 w-28"></div>';
      list.innerHTML = ui.state.skeleton(4, 'h-16');
    }
    try {
      const tournament = await EF.api.getPublishedTournament();
      if (!tournament) {
        points.innerHTML = '';
        list.innerHTML = `<li class="text-muted">No published tournament rules are available yet.</li>`;
        ui.icons();
        return false;
      }

      points.innerHTML = [
        ['Win', tournament.points_win],
        ['Draw', tournament.points_draw],
        ['Loss', tournament.points_loss],
      ].map(([label, value]) => `
        <span class="meta-chip"><strong class="text-neon font-display text-lg">${e(value)}</strong> pts · ${e(label)}</span>
      `).join('');

      const lines = String(tournament.rules || '')
        .split(/\r?\n/)
        .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
        .filter(Boolean);

      list.innerHTML = lines.length
        ? lines.map((line, index) => `<li class="rule-item"><span class="rule-item__num">${index + 1}</span><span>${e(line)}</span></li>`).join('')
        : '<li class="text-muted">Rules will be announced by the tournament admin.</li>';
      ui.icons();
      return true;
    } catch (err) {
      console.error(err);
      points.innerHTML = '';
      list.innerHTML = `<li>${ui.state.error({ message: EF.api.friendlyError(err) })}</li>`;
      ui.icons();
      return false;
    }
  }

  document.addEventListener('ef:retry', () => load());
  if (await load()) {
    EF.api.watch({ key: 'rules', tables: ['tournaments'], onChange: () => load({ silent: true }) });
  }
});
