/* Public site chrome (header, mobile menu, footer) and page bootstrap. */
(function () {
  'use strict';
  window.EF = window.EF || {};
  const { escapeHtml: e, qs, qsa } = EF.utils;
  const ui = EF.ui;

  const NAV = [
    { id: 'home', label: 'Home', href: 'index.html', icon: 'house' },
    { id: 'players', label: 'Player List', href: 'players.html', icon: 'users' },
    { id: 'fixtures', label: 'Fixtures', href: 'fixtures.html', icon: 'calendar-days' },
    { id: 'standings', label: 'Point Table', href: 'standings.html', icon: 'trophy' },
    { id: 'rules', label: 'Rules', href: 'index.html#rules', icon: 'book-open' },
  ];

  const siteName = () => (window.EF_CONFIG && window.EF_CONFIG.SITE_NAME) || 'Game Board';

  function headerHtml(page) {
    const links = NAV.map((n) => `
      <a href="${n.href}" class="nav-link ${n.id === page ? 'is-active' : ''}" ${n.id === page ? 'aria-current="page"' : ''}>${ui.icon(n.icon, '')}${e(n.label)}</a>`).join('');
    const mobileLinks = NAV.map((n) => `
      <a href="${n.href}" class="mobile-link ${n.id === page ? 'is-active' : ''}" ${n.id === page ? 'aria-current="page"' : ''}>${ui.icon(n.icon, '')}${e(n.label)}</a>`).join('');

    return `
      <header class="site-header" data-site-header>
        <div class="container-ef !max-w-[1400px] flex items-center justify-between gap-4 h-16 lg:h-[76px]">
          <a href="index.html" class="flex items-center gap-3 min-w-0" aria-label="${e(siteName())} home">
            ${ui.logo(40)}
            <span class="min-w-0 leading-none">
              <span class="block font-display font-black italic text-[22px] sm:text-[26px] uppercase text-neon truncate max-w-[52vw] sm:max-w-[300px]">${e(siteName())}</span>
              <span class="block text-[10px] font-semibold uppercase tracking-[.3em] text-[#cdd6fb] mt-0.5 truncate" data-brand-season>Tournament Hub</span>
            </span>
          </a>
          <nav class="hidden xl:flex items-center gap-1" aria-label="Primary">${links}</nav>
          <div class="flex items-center gap-2">
            <button type="button" class="btn btn-primary btn-sm hidden sm:inline-flex" data-action="join">${ui.icon('trophy', '')}Join Tournament</button>
            <a href="controlleradmin/index.html" class="btn btn-outline btn-sm hidden xl:inline-flex">${ui.icon('lock', '')}Admin Login</a>
            <button type="button" class="icon-btn xl:hidden" data-menu-toggle aria-expanded="false" aria-controls="mobile-nav" aria-label="Open menu">${ui.icon('menu', '')}</button>
          </div>
        </div>
        <div id="mobile-nav" class="mobile-nav xl:hidden" hidden>
          <nav class="container-ef py-4 grid gap-1" aria-label="Mobile">
            ${mobileLinks}
            <div class="grid grid-cols-2 gap-2 mt-3">
              <button type="button" class="btn btn-primary" data-action="join">${ui.icon('trophy', '')}Join</button>
              <a href="controlleradmin/index.html" class="btn btn-outline">${ui.icon('lock', '')}Admin</a>
            </div>
          </nav>
        </div>
      </header>`;
  }

  function footerHtml() {
    const year = new Date().getFullYear();
    return `
      <footer class="mt-24 border-t border-white/5 bg-black/20">
        <div class="container-ef py-12 grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div class="flex items-center gap-3">${ui.logo(34)}<span class="font-display font-bold text-lg uppercase tracking-wider text-white">${e(siteName())}</span></div>
            <p class="text-sm text-muted mt-4 max-w-sm leading-relaxed" data-brand-description>Competitive eFootball tournaments with live fixtures, results and an automatic point table.</p>
          </div>
          <div>
            <p class="font-display font-bold uppercase tracking-[.18em] text-xs text-subtle">Explore</p>
            <ul class="mt-4 grid gap-2.5 text-sm">
              ${NAV.map((n) => `<li><a class="text-soft hover:text-neon transition-colors" href="${n.href}">${e(n.label)}</a></li>`).join('')}
            </ul>
          </div>
          <div>
            <p class="font-display font-bold uppercase tracking-[.18em] text-xs text-subtle">Compete</p>
            <p class="text-sm text-muted mt-4 leading-relaxed">Register your squad and take your place on the leaderboard.</p>
            <button type="button" class="btn btn-secondary btn-sm mt-4" data-action="join">${ui.icon('user-plus', '')}Join Now</button>
          </div>
        </div>
        <div class="border-t border-white/5">
          <div class="container-ef py-5 flex flex-col lg:flex-row gap-2 lg:items-center justify-between text-xs text-subtle">
            <p>&copy; ${year} ${e(siteName())}. All rights reserved.</p>
            <p class="text-sm text-soft">Development by <span class="font-display font-extrabold italic text-neon text-base">Nipun Mitra</span></p>
            <p>Community tournament. Not affiliated with or endorsed by KONAMI.</p>
          </div>
        </div>
      </footer>`;
  }

  function bindHeader() {
    const header = qs('[data-site-header]');
    if (!header) return;
    const toggle = qs('[data-menu-toggle]', header);
    const menu = qs('#mobile-nav', header);

    const setOpen = (open) => {
      menu.hidden = !open;
      header.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      toggle.innerHTML = ui.icon(open ? 'x' : 'menu', '');
      ui.icons();
    };
    toggle.addEventListener('click', () => setOpen(menu.hidden));
    menu.addEventListener('click', (ev) => { if (ev.target.closest('a,button')) setOpen(false); });
    window.addEventListener('resize', () => { if (window.innerWidth >= 1280 && !menu.hidden) setOpen(false); });

    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  function configNotice() {
    return `
      <div class="notice-bar" role="status">
        ${ui.icon('circle-alert', '')}
        <p><strong>Setup required:</strong> add your Supabase URL and anon key to <code>assets/js/config.js</code>, then run the SQL files in <code>supabase/</code>. See README.md.</p>
      </div>`;
  }

  const layout = {
    NAV,

    render() {
      const page = document.body.dataset.page || '';
      const headerSlot = qs('#site-header');
      const footerSlot = qs('#site-footer');
      if (headerSlot) headerSlot.outerHTML = (EF.isConfigured ? '' : configNotice()) + headerHtml(page);
      if (footerSlot) footerSlot.outerHTML = footerHtml();
      bindHeader();
    },

    /** Update brand text everywhere once tournament data has loaded. */
    setTournament(t) {
      if (!t) return;
      qsa('[data-brand-season]').forEach((el) => { el.textContent = t.season || 'Tournament Hub'; });
      if (t.description) qsa('[data-brand-description]').forEach((el) => { el.textContent = t.description; });

      const label = document.body.dataset.pageTitle;
      document.title = label ? `${label} | ${t.name}` : t.name;

      // Join buttons reflect registration state.
      qsa('[data-action="join"]').forEach((btn) => {
        btn.classList.toggle('opacity-70', !t.registration_open);
        btn.title = t.registration_open ? '' : 'Registration is closed';
      });
    },
  };

  /** Page bootstrap: render chrome, bind global actions, run the page module. */
  EF.boot = function (pageFn) {
    const start = async () => {
      layout.render();
      if (EF.registration) EF.registration.bind();
      ui.icons();
      try {
        await pageFn();
      } catch (err) {
        console.error(err);
        ui.toast(EF.api.friendlyError(err), 'error');
      }
      ui.icons();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  };

  EF.layout = layout;
})();
