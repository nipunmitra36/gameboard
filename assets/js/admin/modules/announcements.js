/* Admin module: image + title announcements shown under the home page marquee. */
(function () {
  'use strict';
  const { escapeHtml: e, formatDateTime } = EF.utils;
  const ui = EF.ui;
  const admin = EF.admin;
  const api = EF.api;

  const MAX_TITLE = 120;

  function openEditor(item) {
    let image = item ? item.image_url : null;
    const modal = ui.modal({
      title: item ? 'Edit announcement' : 'New announcement',
      size: 'md',
      body: `
        <form novalidate class="grid gap-4" data-ann-form>
          <div data-form-alert hidden></div>
          <div>
            <p class="text-sm font-semibold text-white mb-2">Image <span class="text-neon">*</span></p>
            <label class="ann-drop" data-drop>
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="sr-only" data-file>
              <span data-preview></span>
            </label>
            <p class="text-xs text-danger mt-1.5" data-image-error hidden></p>
          </div>
          ${ui.field({ name: 'title', label: 'Title', value: item && item.title, required: true, maxlength: MAX_TITLE, placeholder: 'e.g. Final match this Friday at 9 PM' })}
          ${ui.switchField({ name: 'is_active', label: 'Show on home page', description: 'Turn off to hide it without deleting.', checked: item ? item.is_active !== false : true })}
          <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
            <button type="button" class="btn btn-ghost" data-close>Cancel</button>
            <button type="submit" class="btn btn-primary" data-submit>${ui.icon(item ? 'save' : 'megaphone', '')}${item ? 'Save changes' : 'Publish'}</button>
          </div>
        </form>`,
    });

    const form = modal.body.querySelector('[data-ann-form]');
    const drop = form.querySelector('[data-drop]');
    const fileInput = form.querySelector('[data-file]');
    const preview = form.querySelector('[data-preview]');
    const imageError = form.querySelector('[data-image-error]');

    const showPreview = () => {
      preview.innerHTML = image
        ? `<img src="${image}" alt="Announcement image preview"><span class="text-xs text-muted inline-flex items-center gap-1.5">${ui.icon('refresh-cw', 'w-3.5 h-3.5')}Click or drop to replace</span>`
        : `<span class="inline-grid place-items-center w-12 h-12 rounded-xl bg-white/5 text-neon">${ui.icon('image-plus', 'w-6 h-6')}</span>
           <span class="font-semibold text-white">Click to upload or drop an image</span>
           <span class="text-xs text-muted">JPG, PNG or WebP · up to 15 MB · resized automatically</span>`;
      ui.icons();
    };
    const setError = (msg) => { imageError.textContent = msg || ''; imageError.hidden = !msg; };

    async function useFile(file) {
      if (!file) return;
      setError('');
      preview.innerHTML = ui.state.loading('Preparing image');
      ui.icons();
      try {
        image = await EF.utils.imageToProof(file);
      } catch (err) {
        setError(err.message || 'That image could not be read.');
      }
      showPreview();
    }

    fileInput.addEventListener('change', () => { useFile(fileInput.files[0]); fileInput.value = ''; });
    ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (ev) => { ev.preventDefault(); drop.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (ev) => { ev.preventDefault(); drop.classList.remove('is-over'); }));
    drop.addEventListener('drop', (ev) => useFile(ev.dataTransfer && ev.dataTransfer.files[0]));
    showPreview();
    ui.liveClear(form);

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const values = ui.readForm(form);
      const r = EF.utils.rules;
      const errors = EF.utils.validate(values, { title: [r.required('Title'), r.length('Title', 2, MAX_TITLE)] });
      if (!EF.utils.isProofData(image)) setError('Add an image.');
      if (Object.keys(errors).length) ui.showErrors(form, errors);
      if (Object.keys(errors).length || !EF.utils.isProofData(image)) return;

      const payload = { title: String(values.title).trim(), image_url: image, is_active: Boolean(values.is_active) };
      const ok = await admin.mutate(
        () => (item ? api.admin.updateAnnouncement(item.id, payload) : api.admin.createAnnouncement(payload)),
        { success: item ? 'Announcement updated.' : 'Announcement published.', button: form.querySelector('[data-submit]'), label: 'Saving' },
      );
      if (ok) modal.close();
    });
  }

  function renderList(host, items) {
    if (!items.length) {
      host.innerHTML = ui.state.empty({
        icon: 'megaphone',
        title: 'No announcements yet',
        message: 'Add an image with a title. It shows on the home page under the updates marquee. With none, that section stays hidden.',
      });
      ui.icons();
      return;
    }
    host.innerHTML = `<div class="ann-grid">${items.map((a) => `
      <article class="ann-card${a.is_active === false ? ' is-off' : ''}">
        <img class="ann-card__img" src="${EF.utils.isProofData(a.image_url) ? a.image_url : ''}" alt="${e(a.title)}">
        <div class="ann-card__body">
          <div class="flex flex-wrap items-center gap-2">
            ${a.is_active === false
              ? `<span class="badge badge--neutral">${ui.icon('eye-off', '')}Hidden</span>`
              : `<span class="badge badge--approved">${ui.icon('eye', '')}Live</span>`}
            <span class="text-xs text-muted">${e(formatDateTime(a.created_at))}</span>
          </div>
          <h3 class="font-display text-lg font-bold text-white mt-2 clamp-2">${e(a.title)}</h3>
          <div class="flex flex-wrap gap-2 mt-3">
            <button type="button" class="btn btn-ghost btn-xs" data-edit="${e(a.id)}">${ui.icon('pencil', '')}Edit</button>
            <button type="button" class="btn btn-ghost btn-xs" data-toggle="${e(a.id)}">${ui.icon(a.is_active === false ? 'eye' : 'eye-off', '')}${a.is_active === false ? 'Show' : 'Hide'}</button>
            <button type="button" class="btn btn-ghost btn-xs !text-[#ff8399]" data-delete="${e(a.id)}">${ui.icon('trash-2', '')}Delete</button>
          </div>
        </div>
      </article>`).join('')}</div>`;
    ui.icons();
  }

  admin.register('announcements', {
    title: 'Announcements',

    render(el) {
      el.innerHTML = `
        <section class="glass p-5 sm:p-6">
          ${admin.panelHead('Announcements', 'Image + title · shown on the home page under the marquee',
            `<a href="../index.html" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">${ui.icon('external-link', '')}Preview</a>
             <button type="button" class="btn btn-primary btn-sm" data-add>${ui.icon('plus', '')}New announcement</button>`)}
          <div data-ann-list>${ui.state.skeleton(2, 'h-40')}</div>
        </section>`;

      const host = el.querySelector('[data-ann-list]');
      let items = [];
      api.admin.listAnnouncements().then((rows) => {
        if (!host.isConnected) return;
        items = rows;
        renderList(host, items);
      }).catch((err) => {
        console.error(err);
        if (!host.isConnected) return;
        const missing = /announcements/i.test(String(err && (err.message || err))) && /(find|exist|relation|schema)/i.test(String(err && (err.message || err)));
        host.innerHTML = ui.state.error({
          message: missing ? 'The announcements table is missing. Run supabase/setup_all.sql in the Supabase SQL Editor, then reload.' : api.friendlyError(err),
          retry: false,
        });
        ui.icons();
      });

      el.addEventListener('click', async (ev) => {
        if (ev.target.closest('[data-add]')) { openEditor(null); return; }
        const find = (btn, key) => items.find((a) => a.id === btn.dataset[key]);

        const edit = ev.target.closest('[data-edit]');
        if (edit) { const a = find(edit, 'edit'); if (a) openEditor(a); return; }

        const toggle = ev.target.closest('[data-toggle]');
        if (toggle) {
          const a = find(toggle, 'toggle');
          if (!a) return;
          const show = a.is_active === false;
          await admin.mutate(() => api.admin.updateAnnouncement(a.id, { is_active: show }),
            { success: show ? 'Announcement is live.' : 'Announcement hidden.', button: toggle, label: 'Saving' });
          return;
        }

        const del = ev.target.closest('[data-delete]');
        if (!del) return;
        const a = find(del, 'delete');
        if (!a) return;
        const ok = await ui.confirm({
          title: 'Delete announcement?',
          message: `"${a.title}" will be removed from the home page.`,
          confirmText: 'Delete',
        });
        if (ok) await admin.mutate(() => api.admin.deleteAnnouncement(a.id), { success: 'Announcement deleted.' });
      });
    },
  });
})();
