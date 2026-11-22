/* Home page: hero and registration, matches, results, top 4, players, championship, rules. */
EF.boot(async function homePage() {
  'use strict';
  const { qs, escapeHtml: e, formatDate, formatTime } = EF.utils;
  const ui = EF.ui;

  const el = {
    season: qs('#hero-season'),
    regChip: qs('#hero-reg-chip'),
    title: qs('#hero-title'),
    desc: qs('#hero-desc'),
    countdown: qs('#hero-countdown'),
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
  let countdownInterval = null;
  let playersInterval = null;
  let playersResetTimeout = null;
  let playersAdvance = null;
  let playersCanRotate = false;
  let playersHovered = false;
  let playersFocused = false;
  let playersVisibleCount = 0;
  let latestPlayers = [];

  function renderCountdown(startDate) {
    if (countdownInterval) window.clearInterval(countdownInterval);
    countdownInterval = null;

    const target = startDate ? new Date(`${startDate}T00:00:00`) : null;
    if (!target || Number.isNaN(target.getTime())) {
      el.countdown.hidden = true;
      el.countdown.innerHTML = '';
      return;
    }

    el.countdown.hidden = false;
    const update = () => {
      const remaining = target.getTime() - Date.now();
      if (remaining <= 0) {
        el.countdown.innerHTML = '<p role="status" class="font-display text-xl sm:text-2xl font-extrabold italic text-neon">Tournament has started</p>';
        if (countdownInterval) window.clearInterval(countdownInterval);
        countdownInterval = null;
        return;
      }

      const days = Math.floor(remaining / 86400000);
      const hours = Math.floor((remaining % 86400000) / 3600000);
      const minutes = Math.floor((remaining % 3600000) / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      const units = [['Days', days], ['Hours', hours], ['Minutes', minutes], ['Seconds', seconds]];
      el.countdown.innerHTML = `
        <p class="text-xs font-bold uppercase tracking-[.22em] text-neon mb-2">Tournament starts in</p>
        <div class="flex flex-wrap gap-2 sm:gap-3" role="timer" aria-label="Time until tournament starts">
          ${units.map(([label, value]) => `
            <div class="min-w-[66px] rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-center">
              <span class="block font-display text-2xl sm:text-3xl font-black tabular-nums text-white">${String(value).padStart(2, '0')}</span>
              <span class="block text-[10px] font-bold uppercase tracking-wider text-soft">${label}</span>
            </div>`).join('')}
        </div>`;
    };

    update();
    if (target.getTime() > Date.now()) countdownInterval = window.setInterval(update, 1000);
  }

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
    clearPlayersCarousel();
    el.title.textContent = 'Tournament';
    el.joinPanel.innerHTML = ui.state.error({ message, retry: false });
    [el.upcoming, el.results].forEach((c) => { c.innerHTML = ui.state.error({ message }); });
    el.table.innerHTML = ui.state.error({ message, retry: false });
    el.players.innerHTML = ui.state.error({ message, retry: false });
    ui.icons();
  }

  function renderNoTournament() {
    clearPlayersCarousel();
    renderCountdown(null);
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
    el.players.innerHTML = ui.state.empty({ icon: 'users', title: 'No players yet', message: 'Registrations open when the tournament is published.' });
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
    renderCountdown(t.start_date);

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
    clearPlayersCarousel();
    latestPlayers = [...d.players].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    if (!latestPlayers.length) {
      el.players.innerHTML = ui.state.empty({ icon: 'user-plus', title: 'Be the first to join', message: 'Registered players will appear here.' });
      return;
    }
    playersVisibleCount = window.matchMedia('(min-width: 640px)').matches ? 4 : 2;

    const slide = (p, index, clone = false) => `
      <div class="player-carousel__slide" role="group" aria-label="Player ${index + 1} of ${latestPlayers.length}"${clone ? ' aria-hidden="true" inert' : ''}>
        <a href="players.html" class="player-card"${clone ? ' tabindex="-1"' : ''}>
          ${ui.avatar(p, 'lg')}
          <p class="font-display text-lg font-extrabold text-white mt-3 truncate">${e(p.player_name)}</p>
          <p class="text-sm text-soft truncate">${e(p.team_name)}</p>
          <p class="status-dot mt-2 ${p.status === 'approved' ? 'text-[#4ade80]' : 'text-warn'}">${p.status === 'approved' ? 'Active' : 'Pending'}</p>
        </a>
      </div>`;
    const slides = latestPlayers.map((p, index) => slide(p, index));
    if (latestPlayers.length > playersVisibleCount) {
      slides.push(...latestPlayers.slice(0, playersVisibleCount).map((p, index) => slide(p, index, true)));
    }

    el.players.innerHTML = `
      <div class="player-carousel__viewport">
        <div class="player-carousel__track">${slides.join('')}</div>
      </div>`;

    if (latestPlayers.length <= playersVisibleCount || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const track = el.players.querySelector('.player-carousel__track');
    const gap = Number.parseFloat(window.getComputedStyle(track).columnGap) || 0;
    const step = track.firstElementChild.getBoundingClientRect().width + gap;
    let index = 0;

    const updateSlides = () => {
      Array.from(track.children).forEach((item, itemIndex) => {
        const visible = itemIndex >= index && itemIndex < index + playersVisibleCount && itemIndex < latestPlayers.length;
        item.setAttribute('aria-hidden', String(!visible));
        item.inert = !visible;
      });
    };
    const moveTo = (animate) => {
      track.style.transition = animate ? '' : 'none';
      track.style.transform = `translateX(-${step * index}px)`;
      if (!animate) {
        track.offsetWidth;
        track.style.transition = '';
      }
      updateSlides();
    };

    playersAdvance = () => {
      index += 1;
      moveTo(true);
      if (index === latestPlayers.length) {
        playersResetTimeout = window.setTimeout(() => {
          index = 0;
          moveTo(false);
          playersResetTimeout = null;
        }, 550);
      }
    };
    playersCanRotate = true;
    updateSlides();
    startPlayersCarousel();
  }

  function stopPlayersCarousel() {
    if (playersInterval) window.clearInterval(playersInterval);
    playersInterval = null;
  }

  function clearPlayersCarousel() {
    stopPlayersCarousel();
    if (playersResetTimeout) window.clearTimeout(playersResetTimeout);
    playersResetTimeout = null;
    playersAdvance = null;
    playersCanRotate = false;
    playersVisibleCount = 0;
    latestPlayers = [];
  }

  function startPlayersCarousel() {
    if (!playersCanRotate || !playersAdvance || playersInterval || playersHovered || playersFocused || document.hidden) return;
    playersInterval = window.setInterval(playersAdvance, 3500);
  }

  function syncPlayersCarousel() {
    if (playersHovered || playersFocused || document.hidden) stopPlayersCarousel();
    else startPlayersCarousel();
  }

  el.players.addEventListener('mouseenter', () => {
    playersHovered = true;
    syncPlayersCarousel();
  });
  el.players.addEventListener('mouseleave', () => {
    playersHovered = false;
    syncPlayersCarousel();
  });
  el.players.addEventListener('focusin', () => {
    playersFocused = true;
    syncPlayersCarousel();
  });
  el.players.addEventListener('focusout', (event) => {
    if (!el.players.contains(event.relatedTarget)) {
      playersFocused = false;
      syncPlayersCarousel();
    }
  });
  document.addEventListener('visibilitychange', syncPlayersCarousel);
  let playersResizeTimeout = null;
  window.addEventListener('resize', () => {
    window.clearTimeout(playersResizeTimeout);
    playersResizeTimeout = window.setTimeout(() => {
      if (latestPlayers.length) renderPlayers({ players: latestPlayers });
    }, 150);
  });

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
