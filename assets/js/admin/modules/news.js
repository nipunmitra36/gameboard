/* Admin module: publish news and manage pinned, expiring notices. */
(function () {
  'use strict';
  const { escapeHtml: e, formatDateTime } = EF.utils;
  const ui = EF.ui;
  const admin = EF.admin;
  const api = EF.api;

  const MAX_TITLE = 120;
  const MAX_CONTENT = 5000;

  function localDateTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  }

  function openEditor(post) {
    const modal = ui.modal({
      title: post ? 'Edit post' : 'Create news or notice',
      size: 'md',
      body: `
        <form novalidate class="grid gap-4" data-news-form>
          <div data-form-alert hidden></div>
          ${ui.field({
            name: 'post_type',
            label: 'Post type',
            as: 'select',
            value: post ? post.post_type : 'news',
            options: [{ value: 'news', label: 'News' }, { value: 'notice', label: 'Notice' }],
          })}
          ${ui.field({ name: 'title', label: 'Title', value: post && post.title, required: true, maxlength: MAX_TITLE, placeholder: 'Write a clear headline' })}
          ${ui.field({ name: 'content', label: 'Content', as: 'textarea', rows: 7, value: post && post.content, required: true, maxlength: MAX_CONTENT, placeholder: 'Share the details. Plain text is supported.' })}
          <div class="grid sm:grid-cols-2 gap-4" data-notice-options>
            ${ui.switchField({ name: 'is_pinned', label: 'Pin notice', description: 'Pinned notices appear first.', checked: Boolean(post && post.is_pinned) })}
            ${ui.field({ name: 'expires_at', label: 'Expiry date and time', type: 'datetime-local', value: localDateTime(post && post.expires_at), hint: 'Optional. Expired notices are hidden from visitors.' })}
          </div>
          <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
            <button type="button" class="btn btn-ghost" data-close>Cancel</button>
            <button type="submit" class="btn btn-primary" data-submit>${ui.icon(post ? 'save' : 'plus', '')}${post ? 'Save changes' : 'Publish'}</button>
          </div>
        </form>`,
    });

    const form = modal.body.querySelector('[data-news-form]');
    const type = form.elements.post_type;
    const noticeOptions = form.querySelector('[data-notice-options]');
    const updateNoticeOptions = () => { noticeOptions.hidden = type.value !== 'notice'; };
    type.addEventListener('change', updateNoticeOptions);
    updateNoticeOptions();
    ui.liveClear(form);

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const values = ui.readForm(form);
      const r = EF.utils.rules;
      const errors = EF.utils.validate(values, {
        post_type: [r.required('Post type')],
        title: [r.required('Title'), r.length('Title', 3, MAX_TITLE)],
        content: [r.required('Content'), r.length('Content', 1, MAX_CONTENT)],
      });
      if (Object.keys(errors).length) { ui.showErrors(form, errors); return; }

      let expiresAt = null;
      if (values.post_type === 'notice' && values.expires_at) {
        const expiry = new Date(values.expires_at);
        if (Number.isNaN(expiry.getTime())) {
          ui.showErrors(form, { expires_at: 'Enter a valid expiry date and time.' });
          return;
        }
        expiresAt = expiry.toISOString();
      }

      const payload = {
        post_type: values.post_type,
        title: String(values.title).trim(),
        content: String(values.content).trim(),
        is_pinned: values.post_type === 'notice' && Boolean(values.is_pinned),
        expires_at: expiresAt,
      };
      const ok = await admin.mutate(
        () => post ? api.admin.updateNewsPost(post.id, payload) : api.admin.createNewsPost(payload),
        { success: post ? 'Post updated.' : 'Post published.', button: form.querySelector('[data-submit]'), label: 'Publishing' },
      );
      if (ok) modal.close();
    });
  }

  function renderPosts(host, posts) {
    if (!posts.length) {
      host.innerHTML = ui.state.empty({
        icon: 'newspaper',
        title: 'No news or notices yet',
        message: 'Publish an update and it will appear on the public homepage and News page.',
      });
      ui.icons();
      return;
    }

    host.innerHTML = posts.map((post) => {
      const expired = post.post_type === 'notice' && post.expires_at && new Date(post.expires_at) <= new Date();
      return `
        <article class="rounded-xl border border-white/5 bg-black/20 p-4 sm:p-5">
          <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="badge ${post.post_type === 'notice' ? 'badge--upcoming' : 'badge--neutral'}">${post.post_type === 'notice' ? 'Notice' : 'News'}</span>
                ${post.is_pinned ? `<span class="badge badge--approved">${ui.icon('pin', '')}Pinned</span>` : ''}
                ${expired ? '<span class="badge badge--rejected">Expired</span>' : ''}
                <span class="text-xs text-muted">${e(formatDateTime(post.created_at))}</span>
              </div>
              <h3 class="font-display text-xl font-bold text-white mt-3">${e(post.title)}</h3>
              <p class="text-sm text-soft leading-relaxed whitespace-pre-line mt-2">${e(String(post.content).slice(0, 700))}${post.content.length > 700 ? '…' : ''}</p>
              ${post.expires_at ? `<p class="text-xs text-muted mt-3">Expires ${e(formatDateTime(post.expires_at))}</p>` : ''}
            </div>
            <div class="flex shrink-0 gap-2">
              <button type="button" class="btn btn-ghost btn-xs" data-edit="${e(post.id)}">${ui.icon('pencil', '')}Edit</button>
              <button type="button" class="btn btn-ghost btn-xs !text-[#ff8399]" data-delete="${e(post.id)}">${ui.icon('trash-2', '')}Delete</button>
            </div>
          </div>
        </article>`;
    }).join('');
    ui.icons();
  }

  admin.register('news', {
    title: 'News & Notices',

    render(el) {
      el.innerHTML = `
        <section class="glass p-5 sm:p-6">
          ${admin.panelHead('News & Notices', 'Public updates · pin notices or set an optional expiry date',
            `<a href="../news.html" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">${ui.icon('external-link', '')}Preview</a>
             <button type="button" class="btn btn-primary btn-sm" data-add>${ui.icon('plus', '')}New post</button>`)}
          <div class="grid gap-3" data-post-list>${ui.state.skeleton(3, 'h-24')}</div>
        </section>`;

      const host = el.querySelector('[data-post-list]');
      let posts = [];
      api.admin.listNewsPosts().then((rows) => {
        if (!host.isConnected) return;
        posts = rows;
        renderPosts(host, posts);
      }).catch((err) => {
        console.error(err);
        if (host.isConnected) {
          host.innerHTML = ui.state.error({ message: api.friendlyError(err), retry: false });
          ui.icons();
        }
      });

      el.addEventListener('click', async (ev) => {
        if (ev.target.closest('[data-add]')) { openEditor(null); return; }
        const edit = ev.target.closest('[data-edit]');
        if (edit) {
          const post = posts.find((item) => item.id === edit.dataset.edit);
          if (post) openEditor(post);
          return;
        }
        const del = ev.target.closest('[data-delete]');
        if (!del) return;
        const post = posts.find((item) => item.id === del.dataset.delete);
        if (!post) return;
        const ok = await ui.confirm({
          title: 'Delete post?',
          message: `"${post.title}" will be removed from the News page.`,
          confirmText: 'Delete post',
        });
        if (ok) await admin.mutate(() => api.admin.deleteNewsPost(post.id), { success: 'Post deleted.' });
      });
    },
  });
})();
