/* Pure leaderboard calculation from completed matches + manual adjustments. */
(function () {
  'use strict';
  window.EF = window.EF || {};

  const pointsOr = (value, fallback) => (Number.isInteger(Number(value)) && value !== null ? Number(value) : fallback);

  const isScored = (m) => m.status === 'completed'
    && Number.isInteger(m.home_score) && Number.isInteger(m.away_score);

  /**
   * @param {object} input
   * @param {Array} input.players      Approved players [{ id, player_name, team_name, ... }]
   * @param {Array} input.matches      Matches with status + scores
   * @param {Array} input.adjustments  [{ player_id, points }] (raw log rows or totals)
   * @param {object} input.tournament  Scoring rules (points_win / points_draw / points_loss)
   * @returns {Array} Sorted rows with position, stats, form (most recent first)
   */
  function compute({ players = [], matches = [], adjustments = [], tournament = {} } = {}) {
    const W = pointsOr(tournament && tournament.points_win, 3);
    const D = pointsOr(tournament && tournament.points_draw, 1);
    const L = pointsOr(tournament && tournament.points_loss, 0);

    const rows = new Map();
    players.forEach((player) => {
      rows.set(player.id, {
        id: player.id,
        player,
        played: 0, wins: 0, draws: 0, losses: 0,
        gf: 0, ga: 0, gd: 0,
        base: 0, adjustment: 0, points: 0,
        form: [],
      });
    });

    const record = (row, scored, conceded) => {
      if (!row) return;
      row.played += 1;
      row.gf += scored;
      row.ga += conceded;
      if (scored > conceded) { row.wins += 1; row.form.push('W'); }
      else if (scored === conceded) { row.draws += 1; row.form.push('D'); }
      else { row.losses += 1; row.form.push('L'); }
    };

    matches
      .filter(isScored)
      .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
      .forEach((m) => {
        record(rows.get(m.home_player_id), m.home_score, m.away_score);
        record(rows.get(m.away_player_id), m.away_score, m.home_score);
      });

    adjustments.forEach((a) => {
      const row = rows.get(a.player_id);
      if (row) row.adjustment += Number(a.points) || 0;
    });

    const list = Array.from(rows.values()).map((row) => {
      row.gd = row.gf - row.ga;
      row.base = row.wins * W + row.draws * D + row.losses * L;
      row.points = row.base + row.adjustment;
      row.form = row.form.slice(-5).reverse();
      return row;
    });

    // Tie-breakers: points, goal difference, goals for, wins, then name.
    list.sort((a, b) => (
      b.points - a.points
      || b.gd - a.gd
      || b.gf - a.gf
      || b.wins - a.wins
      || String(a.player.player_name).localeCompare(String(b.player.player_name))
    ));

    list.forEach((row, index) => { row.position = index + 1; });
    return list;
  }

  EF.standings = { compute, isScored };
})();
