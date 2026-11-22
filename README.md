# eFootball Tournament Manager

A responsive tournament website with player registration, fixtures, live results, an automatic point table, and a secure admin control panel at `/controlleradmin`.

**Stack:** HTML5 · Tailwind CSS (Play CDN) · Vanilla JavaScript · localStorage, Google Sheets + Apps Script, or Supabase · Lucide icons. No build step.

---

## 1. Project structure

```
efootball/
├── index.html                 Home: hero, stats, upcoming/recent matches, leaders, table preview, rules
├── players.html               Searchable / filterable player list
├── fixtures.html              Fixtures & results grouped by match day, status tabs, search
├── standings.html             Full point table with highlights and tie-breakers
├── controlleradmin/
│   └── index.html             Admin login + dashboard (hash routes: #/overview, #/players, ...)
├── assets/
│   ├── css/app.css            Design system (glass panels, buttons, badges, tables, modals, toasts)
│   ├── img/favicon.svg
│   └── js/
│       ├── config.js          ← backend and connection settings
│       ├── tailwind.config.js Shared Tailwind theme (colours, fonts)
│       ├── core/
│       │   ├── utils.js       Escaping, dates, validation rules
│       │   ├── supabase.js    Selects and creates the configured data client
│       │   ├── google-script.js Google Apps Script transport and client
│       │   ├── ui.js          Toasts, modals, states, badges, form helpers, match card, standings table
│       │   ├── standings.js   Pure leaderboard calculation
│       │   ├── api.js         All data access + friendly error messages + realtime
│       │   └── layout.js      Public header/footer + page bootstrap (EF.boot)
│       ├── components/registration.js   Join Now modal
│       ├── pages/             home.js, players.js, fixtures.js, standings.js
│       └── admin/
│           ├── app.js         Auth, authorisation, data store, routing
│           └── modules/       overview, players, registrations, fixtures, results, points, settings
├── supabase/
│   ├── 01_schema.sql          Tables, constraints, triggers, views, register_player RPC
│   ├── 02_policies.sql        Row Level Security, grants, realtime publication
│   └── 03_admin_setup.sql     Grant admin access to a user
├── google-apps-script/
│   └── Code.gs                Google Sheets API, validation and admin sessions
├── vercel.json / netlify.toml Hosting config + security headers
└── README.md
```

## 2. Local mode (optional, no SQL)

Set `BACKEND: 'local'` in `assets/js/config.js` to use browser-only storage, with no database or SQL. The current configuration uses Supabase.

1. Open `index.html`, either by double-clicking it or through a local server (see section 5). A published tournament is created automatically, so **Join Now** works straight away.
2. **Admin login:** click **Admin Login** in the header, or open `controlleradmin/index.html`.
   - Username: `admin`
   - Password: `Admin@12345`

   Change both in `assets/js/config.js` (`ADMIN_USERNAME`, `ADMIN_PASSWORD`). New values apply at the next login, and old sessions are signed out.
3. In **Settings**, rename the tournament and set dates, prize and rules, or click **Load demo data** to see a full sample tournament.
4. Registrations, fixtures, results and the point table all work, and open tabs update live.

**Limits of local mode:** data lives in one browser on one device. A visitor registering from their own phone saves to *their* browser, so the admin never sees it. Clearing browser data deletes everything; use **Settings → Export backup** regularly (backups never include the password). For shared data, use Google Sheets or Supabase below.

## 3. Google Sheets setup (shared data)

The Google Sheets backend uses `google-apps-script/Code.gs`. The website does not contain a spreadsheet API key or admin password.

1. Open the spreadsheet you want to use, then choose **Extensions → Apps Script**.
2. Replace the editor contents with `google-apps-script/Code.gs` and save.
3. Return to the Sheet and reload it. From **Tournament setup**, choose **Initialize database** and then **Set admin credentials**. Use a strong password of at least 12 characters.
4. In Apps Script, choose **Deploy → New deployment → Web app**. Set **Execute as** to your account and **Who has access** to **Anyone**, then deploy and authorize it. Public visitors can register; admin changes require the credentials configured in step 3.
5. Copy the deployment URL ending in `/exec` into `APPS_SCRIPT_URL` in `assets/js/config.js`, then set `BACKEND: 'google_script'`. Serve the site over HTTPS.
6. Deploy the site again and sign into `/controlleradmin`. In **Settings**, import the JSON backup from the browser that currently has your tournament data. Import replaces all data in the Sheet.

Keep the Sheet private because it stores registration email addresses. Apps Script runs under the Sheet owner's account and has Google Apps Script quotas; this is suitable for a small tournament, not high-volume traffic.

## 4. Supabase setup (shared online database)

Set `BACKEND: 'supabase'` in `assets/js/config.js`, then:

1. **Create a project** at [supabase.com](https://supabase.com).
2. **Run the SQL** in *SQL Editor*: paste the whole of `supabase/setup_all.sql` and click **Run**. It ends by listing the 5 tables, 2 views and 3 functions it created.
   (`setup_all.sql` is simply `01_schema.sql` + `02_policies.sql` combined; you can run those two in order instead.) All files are safe to re-run.
3. **Lock down sign-ups:** go to *Authentication → Sign In / Providers* and turn off **Allow new users to sign up**. Admin accounts are created by you, not by visitors.
4. **Create the admin user:** go to *Authentication → Users → Add user*, enter an email and a strong password, and tick **Auto Confirm User**.
5. **Grant admin rights:** edit the email in `supabase/03_admin_setup.sql` and run it. Repeat for each extra admin.
6. **Connect the frontend:** copy *Project Settings → API → Project URL* and the **anon public** key into `assets/js/config.js`:

   ```js
   window.EF_CONFIG = {
     SUPABASE_URL: 'https://abcd1234.supabase.co',
     SUPABASE_ANON_KEY: 'eyJhbGciOi...',
     SITE_NAME: 'Game Board',
     REALTIME: true,
   };
   ```
   The anon key is designed to be public. **Never** put the `service_role` key in the frontend.

7. **Create or migrate the tournament:** open `/controlleradmin` and sign in. To migrate this browser's data, use **Settings → Import browser backup to Supabase** before creating any records. The import is admin-only and refuses to run unless all tournament tables are empty; it never deletes existing Supabase data. Otherwise, create the tournament in **Settings**, switch on **Published**, and save.

Before switching from local mode, download **Settings → Export backup (.json)** in the browser that contains the current data. The import also offers **Export this browser's local data** after switching.

## 5. Run locally

Any static server works. From the project folder:

```bash
python -m http.server 5500      # or: npx serve .
```

Open <http://localhost:5500> for the site and <http://localhost:5500/controlleradmin/> for the admin panel. Opening the HTML files directly (`file://`) mostly works, but auth sessions are more reliable over `http://`.

## 6. Deploy

The site is fully static, so the project folder itself is the deployable output.

| Host | Steps |
|---|---|
| **Vercel** | Import the folder or repo. Framework preset: *Other*. No build command, output directory `.`. `vercel.json` adds clean URLs (`/players`, `/controlleradmin`) and security headers. |
| **Netlify** | Drag the folder into *Deploys*, or connect the repo with publish directory `.`. `netlify.toml` adds headers and the `/controlleradmin` redirect. |
| **Cloudflare Pages / GitHub Pages** | Publish the folder as-is. `/controlleradmin/` resolves to `controlleradmin/index.html`. |

After deploying:
- In Supabase, go to *Authentication → URL Configuration* and set **Site URL** to your production domain.
- If you use a custom Supabase domain, add it to `connect-src` in the Content-Security-Policy in `vercel.json` / `netlify.toml`.
- For production, consider replacing the Tailwind Play CDN with a compiled stylesheet (`npx tailwindcss -o assets/css/tailwind.css --minify`). Tailwind recommends this for speed, and nothing else needs to change.

## 7. How it works

### Data model

| Table | Purpose | Key rules |
|---|---|---|
| `tournaments` | Name, season, description, rules, format, dates, capacity, scoring, flags | Only one `is_active`; activating one deactivates the rest; end date ≥ start date; points 0–10 |
| `players` | Registrations | Unique email **and** eFootball username per tournament (case-insensitive); status `pending / approved / rejected`; `approved_at` maintained by trigger |
| `matches` | Fixtures and results | Players must differ and both be **approved** members of the tournament; `completed` requires both scores; scores 0–99; status `upcoming / live / completed / postponed` |
| `point_adjustments` | Manual point changes | **Append-only audit log**; reason required; author stamped server-side from the JWT (cannot be spoofed) |
| `admin_users` | Who may manage the site | Managed only from the SQL editor |

### Security (RLS)

- **Public visitors** can read published tournaments and matches, plus the `players_public` and `player_adjustment_totals` views. Email addresses and admin identities never leave the database for them.
- **Registration** goes through the `register_player()` RPC. It validates input, checks that registration is open and the tournament isn't full (locking the row, so it is race-safe), blocks duplicate emails and usernames, and sets the status from the auto-approve setting. Visitors have no direct insert access to any table.
- **Admins** are authenticated users listed in `admin_users`, checked by the `is_admin()` function. Every write policy requires it. A user who signs in but is not in `admin_users` is signed straight back out.
- Point adjustments cannot be edited or deleted through the API. A mistake is undone with a **Reverse** entry, which keeps the history intact.

### Point table

`assets/js/core/standings.js` calculates standings from completed matches only:
Win = `points_win` (default 3), Draw = `points_draw` (1), Loss = `points_loss` (0), plus the sum of manual adjustments.
Tie-breakers: points → goal difference → goals scored → wins → name.
Live, upcoming and postponed matches never count.

### Live updates

Supabase Realtime pushes changes to `matches` and `tournaments` to every open public page, so results and the table update without a reload. The admin panel also listens to `players` and `point_adjustments`, so new registrations appear live. With Google Sheets, pages refresh when opened or when a tab regains focus; reload to see another browser's latest changes. Realtime respects Supabase RLS, so anonymous visitors receive no player or adjustment rows.

## 8. Admin guide (`/controlleradmin`)

| Module | What you can do |
|---|---|
| **Dashboard** | Stats, alerts (draft mode, pending approvals, matches past kickoff without a result), upcoming fixtures, top 5, latest registrations with one-click approve |
| **Players** | Search and filter; add, edit, approve or delete; upload, change or remove a player's profile photo (DP); private admin notes. Players who have fixtures can't be deleted (set them to *Rejected* instead) |
| **Registrations** | Pending / approved / rejected queues, approve all, reject, revert; toggle *Registration open* and *Auto-approve*; capacity bar |
| **Fixtures** | Create by picking two approved players, date, kickoff time, round and venue; duplicate-pairing warning; edit and delete |
| **Results** | Enter scores inline and change status; both scores auto-switch an upcoming match to *Completed*; unsaved rows survive other saves |
| **Point Table** | Live standings with an adjustment column; apply ± points with a mandatory reason; audit log with *Reverse* |
| **Rules** | Add rules (at the end or the top), quick-add common rules, edit, reorder with ↑ ↓, delete. Shown as a numbered list on the home page |
| **Settings** | Name, season, description, format, platform, total prize (shown in the hero), dates, max players, scoring, publish / registration / auto-approve |

Times are entered and displayed in each viewer's local time zone and stored in UTC.

## 9. Profile photos (DP)

Players can add an optional photo when they join, and admins can set or remove it in **Players**. The image is cropped to a square and compressed in the browser to a small JPEG (about 10 KB), then saved with the player record. Only JPG, PNG or WebP images up to 5 MB are accepted, and photos are shown wherever the player appears. Players without a photo get coloured initials.

## 10. Design

The UI follows an eFootball-style game look: electric lime (`#d4ff1a`) on deep royal blue, heavy italic *Barlow Condensed* headlines, diagonal slashes and stadium-light glows. Colours live as CSS variables at the top of `assets/css/app.css` (`--neon`, `--volt`, `--ink-*`), and the "game theme layer" at the bottom of that file holds the overrides. All artwork (trophy, logo, team crests) is original. Team crests are generated from team names, so no club or KONAMI trademarks are used.

The home hero uses the background video at `assets/img/Free Update Released on September 24, 2026.mp4`, configured by `HERO_VIDEO` in `assets/js/config.js`. The key visual at `assets/img/efootball_v550_keyvisual_4k-1024x576.png` appears in the championship banner and remains as a poster and visual fallback if autoplay is unavailable.

## 11. Troubleshooting

| Symptom | Fix |
|---|---|
| Yellow "Setup required" bar | For Google Sheets, configure `APPS_SCRIPT_URL` and `BACKEND: 'google_script'` in `assets/js/config.js`; for Supabase, set its URL and anon key |
| `PGRST205` / table missing from schema cache | Run `supabase/setup_all.sql` in the Supabase SQL Editor. If it already succeeded, run `notify pgrst, 'reload schema';` and check that `public` is an exposed schema |
| "You do not have permission to perform this action" while loading public data | Re-run the updated `supabase/setup_all.sql` in the Supabase SQL Editor to grant the required table privileges, then hard-refresh the site |
| Other browsers do not show local-mode data | Local mode stores data in that browser only. Set up Google Sheets or Supabase for shared data |
| Site says "Season Loading" / no tournament | In admin **Settings**, make sure **Published** is on |
| "This account is not authorised" on login | Run `03_admin_setup.sql` with that user's email |
| "Both players must be approved…" | Approve both players in **Registrations** first |
| Results don't update live | Confirm `02_policies.sql` ran (it adds the tables to the `supabase_realtime` publication) |
| Registration error "permission denied for function" | Re-run `02_policies.sql` (grants `register_player` to `anon`) |
