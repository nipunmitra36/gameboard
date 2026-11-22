/* Public News & Notices page. */
EF.boot(async function newsPage() {
  'use strict';
  const { qs, escapeHtml: e, formatDateTime } = EF.utils;
  const ui = EF.ui;
  const list = qs('#news-list');

  function render(posts) {
    if (!posts.length) {
      list.innerHTML = `<div class="glass">${ui.state.empty({ icon: 'newspaper', title: 'No updates yet', message: 'Tournament news and notices will appear here.' })}</div>`;
      ui.icons();
      return;
    }

    list.innerHTML = posts.map((post) => `
      <article class="glass p-5 sm:p-7">
        <div class="flex flex-wrap items-center gap-2">
          <span class="badge ${post.post_type === 'notice' ? 'badge--upcoming' : 'badge--neutral'}">${post.post_type === 'notice' ? 'Notice' : 'News'}</span>
          ${post.is_pinned ? `<span class="badge badge--approved">${ui.icon('pin', '')}Pinned</span>` : ''}
          <time class="text-xs text-muted">${e(formatDateTime(post.created_at))}</time>
        </div>
        <h2 class="font-display text-2xl sm:text-3xl font-bold text-white mt-4">${e(post.title)}</h2>
        <p class="text-soft leading-relaxed whitespace-pre-line mt-3">${e(post.content)}</p>
      </article>`).join('');
    ui.icons();
  }

  async function load({ silent = false } = {}) {
    if (!silent) list.innerHTML = ui.state.skeleton(3, 'h-36');
    try {
      const posts = await EF.api.getPublicNews();
      render(posts);
      return true;
    } catch (err) {
      console.error(err);
      list.innerHTML = `<div class="glass">${ui.state.error({ message: EF.api.friendlyError(err) })}</div>`;
      ui.icons();
      return false;
    }
  }

  document.addEventListener('ef:retry', () => load());
  if (await load()) {
    EF.api.watch({ key: 'news', tables: ['news_posts'], onChange: () => load({ silent: true }) });
  }
});
