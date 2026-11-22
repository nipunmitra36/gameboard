/* Admin module: Tournament rules (add, edit, reorder, delete). Shown as a numbered list on the home page. */
(function () {
  'use strict';
  const { escapeHtml: e } = EF.utils;
  const ui = EF.ui;
  const admin = EF.admin;
  const api = EF.api;

  const MAX_RULE = 500;
  const MAX_TOTAL = 8000;

  /** Rules are stored one per line in tournaments.rules. */
  const parseRules = (text) => String(text || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);

  const cleanRule = (text) => String(text || '').replace(/\s+/g, ' ').trim();

  async function saveRules(list, success, button) {
    const joined = list.join('\n');
    if (joined.length > MAX_TOTAL) {
      ui.toast(`Rules are limited to ${MAX_TOTAL} characters in total.`, 'warning');
      return false;
    }
    return admin.mutate(
      () => api.admin.saveTournament(admin.state.tournament.id, { rules: joined || null }),
      { success, button },
    );
  }

  function openEditor(list, index) {
    const modal = ui.modal({
      title: `Edit rule ${index + 1}`,
      size: 'md',
      body: `
        <form novalidate class="grid gap-4" data-rule-form>
          ${ui.field({ name: 'rule', label: 'Rule', as: 'textarea', rows: 3, value: list[index], maxlength: MAX_RULE, required: true })}
          <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
            <button type="button" class="btn btn-ghost" data-close>Cancel</button>
            <button type="submit" class="btn btn-primary" data-submit>${ui.icon('save', '')}Save rule</button>
          </div>
        </form>`,
    });
    const form = modal.body.querySelector('[data-rule-form]');
    ui.liveClear(form);
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const text = cleanRule(form.elements.rule.value);
      if (text.length < 3) { ui.showErrors(form, { rule: 'A rule needs at least 3 characters.' }); return; }
      const next = [...list];
      next[index] = text;
      if (await saveRules(next, 'Rule updated.', form.querySelector('[data-submit]'))) modal.close();
    });
  }

  admin.register('rules', {
    title: 'Tournament Rules',

    render(el, s) {
      const t = s.tournament;
      const list = parseRules(t.rules);

      el.innerHTML = `
        <div class="grid xl:grid-cols-[1fr_360px] gap-6 items-start">
          <section class="glass p-5 sm:p-6">
            ${admin.panelHead('Rules list', `${EF.utils.plural(list.length, 'rule')} · shown as a numbered list on the home page`,
              list.length ? `<a href="../index.html#rules" target="_blank" rel="noopener" class="btn btn-ghost btn-xs">${ui.icon('external-link', '')}Preview</a>` : '')}
            ${list.length ? `
              <ol class="grid gap-2.5" data-rule-list>
                ${list.map((rule, i) => `
                  <li class="flex items-start gap-3 rounded-xl border border-white/5 bg-black/20 p-3 sm:p-4">
                    <span class="rule-item__num shrink-0">${i + 1}</span>
                    <p class="flex-1 min-w-0 text-soft leading-relaxed break-words pt-0.5">${e(rule)}</p>
                    <div class="flex shrink-0 gap-1">
                      <button type="button" class="icon-btn icon-btn--sm" data-move="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move rule ${i + 1} up" title="Move up">${ui.icon('arrow-up', '')}</button>
                      <button type="button" class="icon-btn icon-btn--sm" data-move="${i}" data-dir="1" ${i === list.length - 1 ? 'disabled' : ''} aria-label="Move rule ${i + 1} down" title="Move down">${ui.icon('arrow-down', '')}</button>
                      <button type="button" class="icon-btn icon-btn--sm" data-edit="${i}" aria-label="Edit rule ${i + 1}" title="Edit">${ui.icon('pencil', '')}</button>
                      <button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-delete="${i}" aria-label="Delete rule ${i + 1}" title="Delete">${ui.icon('trash-2', '')}</button>
                    </div>
                  </li>`).join('')}
              </ol>`
            : ui.state.empty({ icon: 'book-open', title: 'No rules yet', message: 'Add your first rule using the form. Rules appear on the home page as a numbered list.' })}
          </section>

          <aside class="glass p-5 xl:sticky xl:top-[96px]">
            ${admin.panelHead('Add a rule', 'Keep each rule short and clear')}
            <form novalidate class="grid gap-4" data-add-rule>
              ${ui.field({ name: 'rule', label: 'New rule', as: 'textarea', rows: 4, maxlength: MAX_RULE, required: true, placeholder: 'e.g. Matches are 10 minutes on Normal speed.' })}
              ${ui.field({ name: 'position', label: 'Position', as: 'select', value: 'end', options: [{ value: 'end', label: 'Add at the end' }, { value: 'start', label: 'Add at the top' }] })}
              <button type="submit" class="btn btn-primary" data-submit>${ui.icon('plus', '')}Add rule</button>
            </form>
            <hr class="divider my-5">
            <p class="text-xs font-semibold uppercase tracking-[.14em] text-subtle">Quick add</p>
            <div class="grid gap-2 mt-3" data-suggestions>
              ${[
                'Matches are 10 minutes on Normal speed.',
                'Send a screenshot of the final score to the admin.',
                'No-shows after 15 minutes forfeit 3-0.',
                'Disconnections: replay the remaining time with the same score.',
                'Respect opponents. Abuse leads to disqualification.',
              ].filter((r) => !list.includes(r)).map((r) => `
                <button type="button" class="text-left text-sm text-soft rounded-lg border border-white/5 bg-black/20 px-3 py-2 hover:border-[#d4ff1a]/50 hover:text-white transition-colors" data-suggest="${e(r)}">${ui.icon('plus', 'w-3.5 h-3.5 inline -mt-0.5 mr-1 text-neon')}${e(r)}</button>`).join('')}
            </div>
          </aside>
        </div>`;

      const addForm = el.querySelector('[data-add-rule]');
      ui.liveClear(addForm);
      addForm.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const text = cleanRule(addForm.elements.rule.value);
        if (text.length < 3) { ui.showErrors(addForm, { rule: 'A rule needs at least 3 characters.' }); return; }
        if (list.some((r) => r.toLowerCase() === text.toLowerCase())) { ui.showErrors(addForm, { rule: 'This rule is already in the list.' }); return; }
        const next = addForm.elements.position.value === 'start' ? [text, ...list] : [...list, text];
        await saveRules(next, 'Rule added.', addForm.querySelector('[data-submit]'));
      });

      el.addEventListener('click', async (ev) => {
        const suggest = ev.target.closest('[data-suggest]');
        if (suggest) { await saveRules([...list, suggest.dataset.suggest], 'Rule added.'); return; }

        const move = ev.target.closest('[data-move]');
        if (move) {
          const i = Number(move.dataset.move);
          const j = i + Number(move.dataset.dir);
          if (j < 0 || j >= list.length) return;
          const next = [...list];
          [next[i], next[j]] = [next[j], next[i]];
          await saveRules(next, 'Rule order updated.');
          return;
        }

        const edit = ev.target.closest('[data-edit]');
        if (edit) { openEditor(list, Number(edit.dataset.edit)); return; }

        const del = ev.target.closest('[data-delete]');
        if (del) {
          const i = Number(del.dataset.delete);
          const ok = await ui.confirm({ title: 'Delete rule?', message: `"${list[i]}" will be removed from the rules list.`, confirmText: 'Delete rule' });
          if (ok) await saveRules(list.filter((_, k) => k !== i), 'Rule deleted.');
        }
      });
    },
  });
})();
