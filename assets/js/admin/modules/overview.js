/* Admin module 1: Dashboard overview. */
(function () {
  'use strict';
  const { escapeHtml: e, formatDate, formatTime, formatDateTime, relativeDay } = EF.utils;
  const ui = EF.ui;
  const admin = EF.admin;

  admin.register('overview', {
    title: 'Dashboard Overview',

    render(el, s) {
      const t = s.tournament;
      const active = s.players.filter((p) => p.status !== 'rejected');
      const approved = s.players.filter((p) => p.status === 'approved');
      const pending = s.players.filter((p) => p.status === 'pending');
      const completed = s.matches.filter((m) => m.status === 'completed');
      const live = s.matches.filter((m) => m.status === 'live');
      const upcoming = s.matches
        .filter((m) => m.status === 'upcoming' || m.status === 'live')
        .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
      const needsResult = s.matches.filter((m) => m.status !== 'completed' && new Date(m.scheduled_at) < Date.now() && m.status !== 'postponed');
      const goals = completed.reduce((n, m) => n + (m.home_score || 0) + (m.away_score || 0), 0);
      const recent = [...s.players].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 6);

      const capacity = t.max_players ? `${active.length} / ${t.max_players} slots filled` : `${approved.length} approved`;

      const alerts = [];
      if (!t.is_published) alerts.push(['eye-off', 'The tournament is a draft and hidden from the public website.', 'settings', 'Publish']);
      if (pending.length) alerts.push(['hourglass', `${EF.utils.plural(pending.length, 'registration')} waiting for approval.`, 'registrations', 'Review']);
      if (needsResult.length) alerts.push(['circle-alert', `${EF.utils.plural(needsResult.length, 'match', 'matches')} past kickoff without a final result.`, 'results', 'Update']);

      el.innerHTML = `
        ${alerts.length ? `
          <div class="grid gap-2 mb-6">
            ${alerts.map(([icon, text, go, cta]) => `
              <div class="form-alert form-alert--info !items-center">
                ${ui.icon(icon, '')}<span class="flex-1">${e(text)}</span>
                <a href="#/${go}" class="btn btn-secondary btn-xs shrink-0">${e(cta)}</a>
              </div>`).join('')}
          </div>` : ''}

        <div class="grid grid-cols-2 xl:grid-cols-4 gap-4">
          ${admin.stat('users', 'Registered players', active.length, capacity)}
          ${admin.stat('hourglass', 'Pending approvals', pending.length, pending.length ? 'Action required' : 'All clear', pending.length ? 'warn' : '')}
          ${admin.stat('calendar-days', 'Fixtures', s.matches.length, `${upcoming.length} upcoming · ${live.length} live`, 'volt')}
          ${admin.stat('goal', 'Goals scored', goals, `${EF.utils.plural(completed.length, 'match', 'matches')} completed`, 'volt')}
        </div>

        <div class="grid xl:grid-cols-3 gap-6 mt-6">
          <section class="glass p-5 xl:col-span-2">
            ${admin.panelHead('Upcoming fixtures', 'Next matches on the schedule', '<a href="#/fixtures" class="btn btn-ghost btn-xs">Manage<i data-lucide="arrow-right"></i></a>')}
            ${upcoming.length ? `<div>${upcoming.slice(0, 6).map((m) => `
              <div class="list-row">
                <div class="w-16 shrink-0 text-center">
                  <p class="font-display font-bold text-white">${e(formatTime(m.scheduled_at))}</p>
                  <p class="text-[11px] text-muted">${e(relativeDay(m.scheduled_at) || formatDate(m.scheduled_at, { day: '2-digit', month: 'short' }))}</p>
                </div>
                <div class="min-w-0 flex-1">
                  <p class="font-semibold text-white truncate flex items-center gap-2"><span class="avatar-pair">${ui.avatar(m.home || 'TBD', 'sm')}${ui.avatar(m.away || 'TBD', 'sm')}</span><span class="truncate">${e(m.home ? m.home.player_name : 'TBD')} <span class="text-volt font-display mx-1">vs</span> ${e(m.away ? m.away.player_name : 'TBD')}</span></p>
                  <p class="text-xs text-muted truncate">${m.round ? `Round ${e(m.round)}` : 'Fixture'}${m.venue ? ` · ${e(m.venue)}` : ''}</p>
                </div>
                ${ui.matchStatusBadge(m.status)}
              </div>`).join('')}</div>`
            : ui.state.empty({ icon: 'calendar-plus', title: 'No upcoming fixtures', message: 'Schedule matches between approved players.', action: '<a href="#/fixtures" class="btn btn-primary btn-sm">Create fixture</a>' })}
          </section>

          <section class="glass p-5">
            ${admin.panelHead('Quick actions')}
            <div class="grid gap-2">
              <button type="button" class="btn btn-ghost justify-start" data-go="players" data-action="add-player">${ui.icon('user-plus', '')}Add player</button>
              <button type="button" class="btn btn-ghost justify-start" data-go="fixtures" data-action="add-fixture">${ui.icon('calendar-plus', '')}Create fixture</button>
              <button type="button" class="btn btn-ghost justify-start" data-go="results">${ui.icon('goal', '')}Update results</button>
              <button type="button" class="btn btn-ghost justify-start" data-go="points">${ui.icon('list-ordered', '')}Adjust points</button>
              <button type="button" class="btn btn-ghost justify-start" data-go="settings">${ui.icon('settings', '')}Tournament settings</button>
            </div>
            <hr class="divider my-5">
            <div class="grid gap-2 text-sm">
              <div class="flex justify-between gap-3"><span class="text-muted">Visibility</span><span class="font-semibold ${t.is_published ? 'text-neon' : 'text-warn'}">${t.is_published ? 'Published' : 'Draft'}</span></div>
              <div class="flex justify-between gap-3"><span class="text-muted">Registration</span><span class="font-semibold ${t.registration_open ? 'text-neon' : 'text-muted'}">${t.registration_open ? 'Open' : 'Closed'}</span></div>
              <div class="flex justify-between gap-3"><span class="text-muted">Approval</span><span class="font-semibold text-white">${t.auto_approve ? 'Automatic' : 'Manual review'}</span></div>
              <div class="flex justify-between gap-3"><span class="text-muted">Scoring</span><span class="font-semibold text-white">W ${e(t.points_win)} · D ${e(t.points_draw)} · L ${e(t.points_loss)}</span></div>
            </div>
          </section>

          <section class="glass overflow-hidden xl:col-span-2">
            <div class="p-5 pb-0">${admin.panelHead('Top of the table', 'Calculated live from completed matches', '<a href="#/points" class="btn btn-ghost btn-xs">Full table<i data-lucide="arrow-right"></i></a>')}</div>
            ${s.standings.length ? ui.standingsTable(s.standings, { limit: 5, compact: true }) : ui.state.empty({ icon: 'list-ordered', title: 'No approved players', message: 'Approve registrations to populate the table.' })}
          </section>

          <section class="glass p-5">
            ${admin.panelHead('Latest registrations', '', '<a href="#/registrations" class="btn btn-ghost btn-xs">All<i data-lucide="arrow-right"></i></a>')}
            ${recent.length ? `<div>${recent.map((p) => `
              <div class="list-row">
                ${ui.avatar(p, 'sm')}
                <div class="min-w-0 flex-1">
                  <p class="font-semibold text-white truncate text-sm">${e(p.player_name)}</p>
                  <p class="text-[11px] text-muted truncate">${e(p.team_name)} · ${e(formatDateTime(p.created_at))}</p>
                </div>
                ${p.status === 'pending'
                  ? `<button type="button" class="icon-btn icon-btn--sm icon-btn--success" data-approve="${e(p.id)}" aria-label="Approve ${e(p.player_name)}" title="Approve">${ui.icon('check', '')}</button>`
                  : ui.playerStatusBadge(p.status)}
              </div>`).join('')}</div>`
            : ui.state.empty({ icon: 'user-plus', title: 'No registrations yet', message: 'Share the website so players can join.' })}
          </section>
        </div>`;

      el.addEventListener('click', async (ev) => {
        const approve = ev.target.closest('[data-approve]');
        if (approve) {
          await admin.mutate(() => EF.api.admin.setPlayerStatus(approve.dataset.approve, 'approved'), { success: 'Player approved.', button: approve, label: '' });
          return;
        }
        const go = ev.target.closest('[data-go]');
        if (go) {
          if (go.dataset.action) admin.pendingAction = go.dataset.action;
          admin.go(go.dataset.go);
        }
      });
    },
  });
})();
