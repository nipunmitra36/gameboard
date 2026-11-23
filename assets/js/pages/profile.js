/* Supabase email-verified player profile and tournament statistics. */
EF.boot(async function profilePage() {
  'use strict';
  const { qs, escapeHtml: e, plural } = EF.utils;
  const ui = EF.ui;
  const root = qs('#profile-content');
  const state = { email: '', session: null };

  function renderEmailForm(email = '', message = '') {
    root.innerHTML = `
      <div class="max-w-xl">
        <h2 class="font-display text-2xl font-bold uppercase text-white">View your profile</h2>
        <p class="text-sm text-muted mt-2">Enter the email you registered with to see your profile and statistics.</p>
        <form class="mt-6 grid gap-4" data-profile-email-form novalidate>
          ${ui.field({
            name: 'email',
            label: 'Registration email',
            type: 'email',
            icon: 'mail',
            placeholder: 'you@example.com',
            value: email,
            required: true,
            maxlength: 254,
            autocomplete: 'email',
          })}
          <div data-form-alert hidden></div>
          <div class="flex flex-wrap items-center gap-x-5 gap-y-3">
            <button type="submit" class="btn btn-primary w-full sm:w-auto">${ui.icon('search')}View profile</button>
            <button type="button" class="text-sm text-soft hover:text-neon" data-profile-send-link>Want to edit? Email me a sign-in link</button>
          </div>
        </form>
      </div>`;
    const form = root.querySelector('[data-profile-email-form]');
    ui.liveClear(form);
    form.addEventListener('input', () => ui.formAlert(form, ''));
    if (message) ui.formAlert(form, message);
    function readEmail() {
      const email = String(form.elements.email.value || '').trim().toLowerCase();
      if (!EF.utils.isEmail(email)) {
        ui.showErrors(form, { email: 'Enter a valid email address.' });
        return '';
      }
      return email;
    }
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const email = readEmail();
      if (!email) return;
      state.email = email;
      loadDashboard();
    });
    form.querySelector('[data-profile-send-link]').addEventListener('click', async (event) => {
      const email = readEmail();
      if (!email) return;
      const button = event.currentTarget;
      ui.setLoading(button, true, 'Sending sign-in link');
      try {
        await EF.api.sendPlayerLoginLink(email);
        state.email = email;
        renderLinkSent();
        ui.toast('A secure sign-in link was sent to your email.', 'success');
      } catch (err) {
        ui.setLoading(button, false);
        ui.formAlert(form, EF.api.friendlyError(err));
      }
    });
    ui.icons();
  }

  function renderLinkSent() {
    root.innerHTML = `
      <div class="max-w-xl">
        <h2 class="font-display text-2xl font-bold uppercase text-white">Check your inbox</h2>
        <p class="text-sm text-muted mt-2">We sent a secure sign-in link to <strong class="text-white">${e(state.email)}</strong>. Open the email and click the link to return here. Check your spam folder if it doesn’t arrive.</p>
        <div class="flex flex-wrap gap-x-5 gap-y-2 text-sm mt-5">
          <button type="button" class="text-soft hover:text-neon" data-profile-resend>Email me another link</button>
          <button type="button" class="text-soft hover:text-neon" data-profile-change-email>Use a different email</button>
        </div>
      </div>`;
    root.querySelector('[data-profile-resend]').addEventListener('click', async (event) => {
      const button = event.currentTarget;
      ui.setLoading(button, true, 'Sending link');
      try {
        await EF.api.sendPlayerLoginLink(state.email);
        ui.toast('A new sign-in link was sent.', 'success');
      } catch (err) {
        ui.toast(EF.api.friendlyError(err), 'error');
      } finally {
        ui.setLoading(button, false);
      }
    });
    root.querySelector('[data-profile-change-email]').addEventListener('click', () => renderEmailForm(state.email));
    ui.icons();
  }

  function statTile(label, value) {
    return `<div class="stat-tile"><p class="stat-tile__label !mt-0">${e(label)}</p><p class="font-display text-xl sm:text-2xl font-bold text-white mt-2">${e(value)}</p></div>`;
  }

  function tournamentCard(record, tournament, standing) {
    const season = tournament.season ? ` · ${tournament.season}` : '';
    const stats = standing
      ? `<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 mt-5">
          ${statTile('Position', standing.played ? `#${standing.position}` : '—')}
          ${statTile('Played', standing.played)}
          ${statTile('Wins', standing.wins)}
          ${statTile('Draws', standing.draws)}
          ${statTile('Losses', standing.losses)}
          ${statTile('Goals for', standing.gf)}
          ${statTile('Goals against', standing.ga)}
          ${statTile('Goal difference', standing.gd)}
          ${statTile('Points', standing.points)}
        </div>`
      : `<p class="text-sm text-muted mt-4">${record.status === 'approved'
        ? 'Tournament statistics are not available yet.'
        : 'Statistics will be available after your registration is approved.'}</p>`;
    return `
      <article class="rounded-2xl border border-white/10 bg-white/[.025] p-4 sm:p-5">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <h3 class="font-display text-xl font-bold text-white">${e(tournament.name)}${e(season)}</h3>
            <p class="text-sm text-muted mt-1">${e(record.player_name)} · ${e(record.team_name)}</p>
          </div>
          ${ui.playerStatusBadge(record.status)}
        </div>
        ${stats}
      </article>`;
  }

  async function loadDashboard() {
    const signedIn = Boolean(state.session);
    root.innerHTML = ui.state.loading('Loading your player profile');
    try {
      const [records, tournaments] = await Promise.all([
        signedIn ? EF.api.getMyPlayerProfile() : EF.api.lookupPlayerProfile(state.email),
        EF.api.getProfileTournaments(),
      ]);
      if (!records.length) {
        const email = state.session && state.session.user ? state.session.user.email : state.email;
        root.innerHTML = `
          <div class="max-w-xl">
            <div class="state__icon">${ui.icon('user-round-x')}</div>
            <h2 class="font-display text-2xl font-bold uppercase text-white mt-4">No player registration found</h2>
            <p class="text-sm text-muted mt-2">The email <strong class="text-white">${e(email || '')}</strong> does not match a player registration. Use the email address you registered with.</p>
            <button type="button" class="btn btn-outline mt-5" data-profile-signout>${ui.icon(signedIn ? 'log-out' : 'arrow-left')}${signedIn ? 'Sign out' : 'Try another email'}</button>
          </div>`;
        root.querySelector('[data-profile-signout]').addEventListener('click', signOut);
        ui.icons();
        return;
      }

      const tournamentById = new Map(tournaments.map((tournament) => [tournament.id, tournament]));
      const publicRecords = records.filter((record) => tournamentById.has(record.tournament_id));
      const tournamentIds = [...new Set(publicRecords.map((record) => record.tournament_id))];
      const data = await EF.api.getProfileStatsData(tournamentIds);
      const standingsByTournament = new Map();
      tournamentIds.forEach((tournamentId) => {
        const tournament = tournamentById.get(tournamentId);
        const standings = EF.standings.compute({
          players: data.players.filter((player) => player.tournament_id === tournamentId && player.status === 'approved'),
          matches: data.matches.filter((match) => match.tournament_id === tournamentId),
          adjustments: data.adjustments.filter((adjustment) => adjustment.tournament_id === tournamentId),
          tournament,
        });
        standingsByTournament.set(tournamentId, new Map(standings.map((standing) => [standing.id, standing])));
      });

      const activeRecord = records.find((record) => {
        const tournament = tournamentById.get(record.tournament_id);
        return tournament && tournament.is_active;
      }) || publicRecords[0] || records[0];
      const cards = publicRecords.length
        ? publicRecords.map((record) => tournamentCard(
          record,
          tournamentById.get(record.tournament_id),
          standingsByTournament.get(record.tournament_id).get(record.id) || null,
        )).join('')
        : `<div class="rounded-xl border border-white/10 p-4 text-sm text-muted">There are no published tournament statistics for your registrations yet.</div>`;

      root.innerHTML = `
        <div class="grid gap-8">
          <section class="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5">
            ${ui.avatar(activeRecord, 'xl')}
            <div class="min-w-0 flex-1">
              <p class="eyebrow eyebrow--volt">${signedIn ? 'Verified player' : 'Player profile'}</p>
              <h2 class="font-display text-2xl sm:text-3xl font-bold text-white mt-1">${e(activeRecord.player_name)}</h2>
              <p class="text-sm text-muted mt-1">${e(activeRecord.team_name)} <span class="text-subtle">·</span> ${e(signedIn ? state.session.user.email : state.email)}</p>
            </div>
            <button type="button" class="btn btn-outline" data-profile-signout>${ui.icon(signedIn ? 'log-out' : 'arrow-left')}${signedIn ? 'Sign out' : 'Change email'}</button>
          </section>

          ${signedIn ? `<form class="border-t border-white/10 pt-6 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end" data-profile-update-form novalidate>
            <div>
              <h3 class="font-display text-xl font-bold uppercase text-white">Player details</h3>
              <p class="text-xs text-muted mt-1">Name, eFootball username and DP update across all registrations linked to this verified email.</p>
              <div class="grid gap-4 md:grid-cols-2 mt-4">
                ${ui.field({
                  name: 'player_name',
                  label: 'Player name',
                  icon: 'user-round',
                  placeholder: 'Your player name',
                  value: activeRecord.player_name,
                  required: true,
                  maxlength: 60,
                  autocomplete: 'name',
                })}
                ${ui.field({
                  name: 'efootball_username',
                  label: 'In-game username',
                  icon: 'gamepad-2',
                  placeholder: 'Your eFootball username',
                  value: activeRecord.efootball_username,
                  required: true,
                  maxlength: 40,
                  autocomplete: 'nickname',
                })}
              </div>
              <div class="mt-4">${ui.photoField({
                name: 'avatar_url',
                value: activeRecord.avatar_url || '',
                label: 'Profile photo (DP)',
                playerName: activeRecord.player_name,
              })}</div>
              <div data-form-alert hidden></div>
            </div>
            <button type="submit" class="btn btn-primary">${ui.icon('save')}Save profile</button>
          </form>` : `<div class="border-t border-white/10 pt-6 flex flex-wrap items-center justify-between gap-3">
            <p class="text-sm text-muted">To change your name, username or photo, sign in with a link sent to your email.</p>
            <button type="button" class="btn btn-outline" data-profile-edit-link>${ui.icon('send')}Email me a sign-in link</button>
          </div>`}

          <section class="border-t border-white/10 pt-6">
            <div class="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p class="eyebrow">Across published tournaments</p>
                <h3 class="font-display text-2xl font-bold uppercase text-white mt-1">Your statistics</h3>
              </div>
              <span class="text-xs text-subtle">${e(plural(publicRecords.length, 'tournament'))}</span>
            </div>
            <div class="grid gap-4 mt-5">${cards}</div>
          </section>
        </div>`;

      root.querySelector('[data-profile-signout]').addEventListener('click', signOut);
      if (!signedIn) {
        root.querySelector('[data-profile-edit-link]').addEventListener('click', async (event) => {
          const button = event.currentTarget;
          ui.setLoading(button, true, 'Sending sign-in link');
          try {
            await EF.api.sendPlayerLoginLink(state.email);
            renderLinkSent();
            ui.toast('A secure sign-in link was sent to your email.', 'success');
          } catch (err) {
            ui.setLoading(button, false);
            ui.toast(EF.api.friendlyError(err), 'error');
          }
        });
        ui.icons();
        return;
      }
      const form = root.querySelector('[data-profile-update-form]');
      ui.liveClear(form);
      ui.bindPhotoFields(form);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const values = ui.readForm(form);
        const errors = EF.utils.validate(values, {
          player_name: [
            EF.utils.rules.required('Player name'),
            EF.utils.rules.length('Player name', 2, 60),
          ],
          efootball_username: [
            EF.utils.rules.required('eFootball username'),
            EF.utils.rules.length('eFootball username', 3, 40),
          ],
        });
        if (Object.keys(errors).length) {
          ui.showErrors(form, errors);
          return;
        }
        const button = form.querySelector('[type="submit"]');
        ui.setLoading(button, true, 'Saving profile');
        try {
          const updatedCount = await EF.api.updateMyPlayerProfile(values);
          ui.toast(`Profile updated for ${plural(Number(updatedCount), 'registration')}.`, 'success');
          await loadDashboard();
        } catch (err) {
          ui.setLoading(button, false);
          ui.formAlert(form, EF.api.friendlyError(err));
        }
      });
      ui.icons();
    } catch (err) {
      console.error(err);
      root.innerHTML = ui.state.error({ message: EF.api.friendlyError(err) });
      ui.icons();
    }
  }

  async function signOut() {
    try {
      if (state.session) await EF.api.signOut();
      state.session = null;
      state.email = '';
      renderEmailForm();
    } catch (err) {
      ui.toast(EF.api.friendlyError(err), 'error');
    }
  }

  document.addEventListener('ef:retry', loadDashboard);

  if (EF.backend !== 'supabase') {
    root.innerHTML = ui.state.empty({
      icon: 'shield-alert',
      title: 'Supabase required',
      message: 'Player profiles use Supabase. Select the Supabase backend in assets/js/config.js to continue.',
    });
    ui.icons();
    return;
  }
  if (!EF.isConfigured) {
    root.innerHTML = ui.state.error({ message: 'Add your Supabase URL and anon key to assets/js/config.js before using player profiles.', retry: false });
    ui.icons();
    return;
  }

  try {
    state.session = await EF.api.getSession();
    if (state.session) await loadDashboard();
    else renderEmailForm();
  } catch (err) {
    console.error(err);
    root.innerHTML = ui.state.error({ message: EF.api.friendlyError(err) });
    ui.icons();
  }
});
