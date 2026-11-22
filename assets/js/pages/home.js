/* Home page: hero, footer registration, matches, results, top 4, players, championship, rules. */
EF.boot(async function homePage() {
  'use strict';
  const { qs, escapeHtml: e, formatDate, formatTime } = EF.utils;
  const ui = EF.ui;

  const el = {
    season: qs('#hero-season'),
    regChip: qs('#hero-reg-chip'),
    title: qs('#hero-title'),
    desc: qs('#hero-desc'),
    join: qs('#hero-join'),
    meta: qs('#hero-meta'),
    joinPanel: qs('#home-join-panel'),
    slots: qs('#home-slots'),
    announcements: qs('#home-announcements'),
    upcoming: qs('#home-upcoming'),
    results: qs('#home-results'),
    table: qs('#home-table'),
    players: qs('#home-players'),
    playersTotal: qs('#players-total'),
    champ: qs('#champ-name'),
    rules: qs('#rules'),
    rulesList: qs('#rules-list'),
    rulesPoints: qs('#rules-points'),
  };

  const rowsSkeleton = (n) => Array.from({ length: n }, () => '<div class="skeleton h-[62px]"></div>').join('');
  const panelEmpty = (icon, title, message) => `<div class="py-2">${ui.state.empty({ icon, title, message })}</div>`;

  function initHeroVideo() {
    const hero = qs('[data-hero]');
    const video = qs('[data-hero-video]', hero);
    const toggle = qs('[data-hero-video-toggle]', hero);
    const source = window.EF_CONFIG && window.EF_CONFIG.HERO_VIDEO;
    if (!hero || !video || !toggle || !source) return;

    video.src = source;

    const updateToggle = () => {
      const paused = video.paused;
      toggle.setAttribute('aria-label', paused ? 'Play background video' : 'Pause background video');
      toggle.innerHTML = ui.icon(paused ? 'play' : 'pause', '');
      ui.icons();
    };

    video.play().then(() => {
      hero.classList.add('has-video');
      toggle.hidden = false;
      updateToggle();
    }).catch((err) => {
      console.warn('Hero background video could not autoplay; showing the static fallback.', err);
    });

    toggle.addEventListener('click', () => {
      if (video.paused) {
        video.play().then(() => {
          hero.classList.add('has-video');
          updateToggle();
        }).catch((err) => {
          console.error('Hero background video could not start.', err);
        });
      } else {
        video.pause();
        updateToggle();
      }
    });
  }

  function showLoading() {
    el.upcoming.innerHTML = rowsSkeleton(3);
    el.results.innerHTML = rowsSkeleton(3);
    el.table.innerHTML = `<div class="p-3 grid gap-2">${Array.from({ length: 4 }, () => '<div class="skeleton h-10"></div>').join('')}</div>`;
    el.players.innerHTML = Array.from({ length: 4 }, () => '<div class="skeleton h-[150px]"></div>').join('');
    el.announcements.innerHTML = rowsSkeleton(3);
  }

  async function loadAnnouncements() {
    try {
      const posts = (await EF.api.getPublicNews()).slice(0, 3);
      el.announcements.innerHTML = posts.length ? posts.map((post) => `
        <article class="glass p-4 sm:p-5">
          <div class="flex flex-wrap items-center gap-2">
            <span class="badge ${post.post_type === 'notice' ? 'badge--upcoming' : 'badge--neutral'}">${post.post_type === 'notice' ? 'Notice' : 'News'}</span>
            ${post.is_pinned ? `<span class="badge badge--approved">${ui.icon('pin', '')}Pinned</span>` : ''}
            <time class="text-xs text-muted">${e(EF.utils.formatDateTime(post.created_at))}</time>
          </div>
          <h3 class="font-display text-xl font-bold text-white mt-3">${e(post.title)}</h3>
          <p class="text-sm text-soft leading-relaxed whitespace-pre-line mt-2">${e(String(post.content).slice(0, 220))}${post.content.length > 220 ? '…' : ''}</p>
        </article>`).join('')
        : `<div class="col-span-full glass">${ui.state.empty({ icon: 'newspaper', title: 'No updates yet', message: 'Tournament news and notices will appear here.' })}</div>`;
      ui.icons();
    } catch (err) {
      console.error(err);
      el.announcements.innerHTML = `<div class="col-span-full">${ui.state.error({ message: EF.api.friendlyError(err), retry: false })}</div>`;
      ui.icons();
    }
  }

  function showError(message) {
    el.title.textContent = 'Tournament';
    el.joinPanel.innerHTML = ui.state.error({ message, retry: false });
    [el.upcoming, el.results].forEach((c) => { c.innerHTML = ui.state.error({ message }); });
    el.table.innerHTML = ui.state.error({ message, retry: false });
    el.players.innerHTML = `<div class="col-span-full">${ui.state.error({ message, retry: false })}</div>`;
    ui.icons();
  }

  function renderNoTournament() {
    el.title.innerHTML = 'Season<br><span class="text-white">Loading</span>';
    el.season.textContent = 'Coming soon';
    el.desc.textContent = 'The next tournament has not been published yet. Check back soon for registration, fixtures and live results.';
    el.regChip.innerHTML = '';
    el.meta.innerHTML = '';
    el.slots.textContent = '';
    el.playersTotal.textContent = 'Total: 0 Players';
    EF.registration.mountInline(el.joinPanel, null);
    el.upcoming.innerHTML = panelEmpty('calendar-clock', 'No fixtures yet', 'Fixtures appear once the tournament is published.');
    el.results.innerHTML = panelEmpty('flag', 'No results yet', 'Completed matches will show up here.');
    el.table.innerHTML = panelEmpty('list-ordered', 'Table not available', 'The point table goes live with the tournament.');
    el.players.innerHTML = `<div class="col-span-full">${ui.state.empty({ icon: 'users', title: 'No players yet', message: 'Registrations open when the tournament is published.' })}</div>`;
    el.rules.hidden = true;
    ui.icons();
  }

  function renderHero(d) {
    const t = d.tournament;
    const words = String(t.name).trim().split(/\s+/);
    // Split the name over two lines like a game title card.
    const cut = Math.ceil(words.length / 2);
    el.title.innerHTML = words.length > 1
      ? `<span class="block">${e(words.slice(0, cut).join(' '))}</span><span class="block text-white">${e(words.slice(cut).join(' '))}</span>`
      : e(t.name);
    el.season.textContent = t.season || 'Tournament Season';
    el.desc.textContent = t.description || 'Register your squad, follow every fixture and watch the point table update the moment results land.';
    el.champ.textContent = t.name;

    el.regChip.innerHTML = t.registration_open
      ? '<span class="badge badge--approved"><span class="live-dot !bg-[#d4ff1a] !shadow-none"></span>Registration open</span>'
      : `<span class="badge badge--neutral">${ui.icon('lock', '')}Registration closed</span>`;
    el.join.innerHTML = t.registration_open
      ? `Join Now${ui.icon('chevron-right', '')}`
      : `${ui.icon('lock', '')}Registration Closed`;

    const next = d.matches.find((m) => m.status === 'live')
      || d.matches.find((m) => m.status === 'upcoming' && new Date(m.scheduled_at) >= Date.now() - 3 * 3600 * 1000);
    const startDate = t.start_date ? new Date(`${t.start_date}T00:00`) : (next ? next.scheduled_at : null);

    const items = [];
    if (startDate) items.push(['calendar-days', 'Start Date', formatDate(startDate, { day: '2-digit', month: 'short', year: 'numeric' })]);
    if (next) items.push(['clock', next.status === 'live' ? 'Live Now' : 'Next Kickoff', formatTime(next.scheduled_at)]);
    if (t.prize) items.push(['trophy', 'Total Prize', t.prize]);
    else items.push(['users', 'Players', `${d.players.length}${t.max_players ? ` / ${t.max_players}` : ''}`]);
    el.meta.innerHTML = items.map(([icon, label, value], i) => `
      ${i ? '<span class="info-divider hidden sm:block"></span>' : ''}
      <div class="info-item">${ui.icon(icon, '')}<div class="min-w-0"><p class="info-item__label">${e(label)}</p><p class="info-item__value">${e(value)}</p></div></div>`).join('');

    el.slots.textContent = t.max_players ? `${Math.max(0, t.max_players - d.players.length)} slots left` : '';
    EF.registration.mountInline(el.joinPanel, t);
  }

  function renderMatches(d) {
    const upcoming = d.matches
      .filter((m) => m.status === 'live' || m.status === 'upcoming')
      .sort((a, b) => (a.status === 'live' ? -1 : 0) - (b.status === 'live' ? -1 : 0) || new Date(a.scheduled_at) - new Date(b.scheduled_at))
      .slice(0, 3);
    const results = d.matches
      .filter((m) => m.status === 'completed')
      .sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at))
      .slice(0, 3);

    el.upcoming.innerHTML = upcoming.length
      ? upcoming.map(ui.miniMatchRow).join('')
      : panelEmpty('calendar-clock', 'No upcoming matches', 'New fixtures appear here as soon as they are scheduled.');
    el.results.innerHTML = results.length
      ? results.map(ui.miniMatchRow).join('')
      : panelEmpty('flag', 'No results yet', 'Final scores appear here after each match.');
  }

  function renderTable(d) {
    el.table.innerHTML = d.standings.length
      ? ui.miniStandingsTable(d.standings, { limit: 4 })
      : panelEmpty('list-ordered', 'No approved players yet', 'The table fills up as registrations are approved.');
  }

  function renderPlayers(d) {
    el.playersTotal.textContent = `Total: ${EF.utils.plural(d.players.length, 'Player')}`;
    const latest = [...d.players].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 4);
    if (!latest.length) {
      el.players.innerHTML = `<div class="col-span-full">${ui.state.empty({ icon: 'user-plus', title: 'Be the first to join', message: 'Registered players will appear here.' })}</div>`;
      return;
    }
    el.players.innerHTML = latest.map((p) => `
      <a href="players.html" class="player-card">
        ${ui.avatar(p, 'lg')}
        <p class="font-display text-lg font-extrabold text-white mt-3 truncate">${e(p.player_name)}</p>
        <p class="text-sm text-soft truncate">${e(p.team_name)}</p>
        <p class="status-dot mt-2 ${p.status === 'approved' ? 'text-[#4ade80]' : 'text-warn'}">${p.status === 'approved' ? 'Active' : 'Pending'}</p>
      </a>`).join('');
  }

  function renderRules(t) {
    const lines = String(t.rules || '')
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
      .filter(Boolean);
    el.rulesPoints.innerHTML = [['Win', t.points_win], ['Draw', t.points_draw], ['Loss', t.points_loss]]
      .map(([label, pts]) => `<span class="meta-chip"><strong class="text-neon font-display text-lg">${e(pts)}</strong> pts · ${label}</span>`).join('');
    el.rulesList.innerHTML = lines.length
      ? lines.map((line, i) => `<li class="rule-item"><span class="rule-item__num">${i + 1}</span><span>${e(line)}</span></li>`).join('')
      : '<li class="text-muted">Rules will be announced by the tournament admin.</li>';
    el.rules.hidden = false;
  }

  async function load({ silent = false } = {}) {
    if (!silent) showLoading();
    const announcements = loadAnnouncements();
    try {
      const d = await EF.api.loadPublicData();
      if (!d.tournament) { renderNoTournament(); await announcements; return d; }
      renderHero(d);
      renderMatches(d);
      renderTable(d);
      renderPlayers(d);
      renderRules(d.tournament);
      ui.icons();
      await announcements;
      return d;
    } catch (err) {
      console.error(err);
      showError(EF.api.friendlyError(err));
      await announcements;
      return null;
    }
  }

  document.addEventListener('ef:retry', () => load());
  window.addEventListener('ef:player-registered', () => load({ silent: true }));

  initHeroVideo();
  const data = await load();
  if (data) EF.api.watch({ key: 'home', tables: ['matches', 'tournaments', 'news_posts'], onChange: () => load({ silent: true }) });
});
