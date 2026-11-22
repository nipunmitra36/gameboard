-- =====================================================================
--  eFootball Tournament Manager — ONE-STEP SETUP
--  Paste this WHOLE file into Supabase SQL Editor and click Run.
--  (Same content as 01_schema.sql + 02_policies.sql.) Safe to re-run.
-- =====================================================================

-- =====================================================================
--  eFootball Tournament Manager — Database Schema (step 1 of 3)
--  Run this file in the Supabase SQL Editor, then 02_policies.sql,
--  then 03_admin_setup.sql. Every statement is safe to re-run.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
--  Shared helpers
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
--  admin_users — the people allowed to manage the tournament.
--  Rows are added from the SQL editor only (see 03_admin_setup.sql).
-- ---------------------------------------------------------------------
create table if not exists public.admin_users (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  display_name text,
  role         text not null default 'admin' check (role in ('admin', 'owner')),
  created_at   timestamptz not null default now()
);

-- Returns true when the calling user is a tournament administrator.
-- SECURITY DEFINER so it can read admin_users without RLS recursion.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------
--  tournaments
-- ---------------------------------------------------------------------
create table if not exists public.tournaments (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (char_length(btrim(name)) between 3 and 120),
  season            text check (season is null or char_length(season) <= 60),
  description       text check (description is null or char_length(description) <= 2000),
  rules             text check (rules is null or char_length(rules) <= 8000),
  format            text not null default 'League' check (char_length(format) <= 60),
  platform          text check (platform is null or char_length(platform) <= 80),
  prize             text check (prize is null or char_length(prize) <= 60),
  start_date        date,
  end_date          date,
  max_players       integer check (max_players is null or max_players between 2 and 1024),
  registration_open boolean not null default true,
  auto_approve      boolean not null default false,
  points_win        smallint not null default 3 check (points_win between 0 and 10),
  points_draw       smallint not null default 1 check (points_draw between 0 and 10),
  points_loss       smallint not null default 0 check (points_loss between 0 and 10),
  is_published      boolean not null default false,
  is_active         boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint tournaments_dates_chk check (end_date is null or start_date is null or end_date >= start_date)
);

-- Columns added after the first release (safe on existing databases).
alter table public.tournaments add column if not exists prize text;

-- Only one tournament can be the active one at any time.
create unique index if not exists tournaments_single_active_idx
  on public.tournaments ((true)) where is_active;

-- Activating a tournament automatically deactivates the previous one.
create or replace function public.tournaments_single_active()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_active then
    update public.tournaments set is_active = false
     where is_active and id <> new.id;
  end if;
  new.name := btrim(new.name);
  return new;
end;
$$;

drop trigger if exists tournaments_single_active_trg on public.tournaments;
create trigger tournaments_single_active_trg
  before insert or update of is_active, name on public.tournaments
  for each row execute function public.tournaments_single_active();

drop trigger if exists tournaments_updated_at_trg on public.tournaments;
create trigger tournaments_updated_at_trg
  before update on public.tournaments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
--  players
-- ---------------------------------------------------------------------
create table if not exists public.players (
  id                 uuid primary key default gen_random_uuid(),
  tournament_id      uuid not null references public.tournaments (id) on delete cascade,
  player_name        text not null check (char_length(btrim(player_name)) between 2 and 60),
  team_name          text not null check (char_length(btrim(team_name)) between 2 and 60),
  efootball_username text not null check (char_length(btrim(efootball_username)) between 3 and 40),
  email              text not null check (
                       char_length(email) <= 254
                       and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$'
                     ),
  status             text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  notes              text check (notes is null or char_length(notes) <= 1000),
  approved_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- One registration per email and per eFootball username in each tournament.
create unique index if not exists players_tournament_email_key
  on public.players (tournament_id, lower(email));
create unique index if not exists players_tournament_username_key
  on public.players (tournament_id, lower(efootball_username));
-- Profile photo (DP): a small square JPEG/PNG/WebP data URL, compressed in the browser.
alter table public.players add column if not exists avatar_url text;
alter table public.players drop constraint if exists players_avatar_url_chk;
alter table public.players add constraint players_avatar_url_chk check (
  avatar_url is null
  or (char_length(avatar_url) <= 300000 and avatar_url ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$')
);

create index if not exists players_tournament_status_idx
  on public.players (tournament_id, status, created_at);

-- Normalise input and keep approved_at in sync with status.
create or replace function public.players_before_write()
returns trigger
language plpgsql
as $$
begin
  new.player_name        := btrim(regexp_replace(new.player_name, '\s+', ' ', 'g'));
  new.team_name          := btrim(regexp_replace(new.team_name, '\s+', ' ', 'g'));
  new.efootball_username := btrim(new.efootball_username);
  new.email              := lower(btrim(new.email));

  if new.status = 'approved' then
    if tg_op = 'INSERT' or old.status is distinct from 'approved' then
      new.approved_at := now();
    end if;
  else
    new.approved_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists players_before_write_trg on public.players;
create trigger players_before_write_trg
  before insert or update on public.players
  for each row execute function public.players_before_write();

drop trigger if exists players_updated_at_trg on public.players;
create trigger players_updated_at_trg
  before update on public.players
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
--  matches
-- ---------------------------------------------------------------------
create table if not exists public.matches (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references public.tournaments (id) on delete cascade,
  home_player_id uuid not null references public.players (id) on delete restrict,
  away_player_id uuid not null references public.players (id) on delete restrict,
  round          integer check (round is null or round between 1 and 999),
  scheduled_at   timestamptz not null,
  status         text not null default 'upcoming'
                   check (status in ('upcoming', 'live', 'completed', 'postponed')),
  home_score     smallint check (home_score is null or home_score between 0 and 99),
  away_score     smallint check (away_score is null or away_score between 0 and 99),
  venue          text check (venue is null or char_length(venue) <= 80),
  notes          text check (notes is null or char_length(notes) <= 500),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint matches_distinct_players_chk check (home_player_id <> away_player_id),
  constraint matches_completed_scores_chk check (
    status <> 'completed' or (home_score is not null and away_score is not null)
  )
);

create index if not exists matches_tournament_schedule_idx
  on public.matches (tournament_id, scheduled_at);
create index if not exists matches_home_idx on public.matches (home_player_id);
create index if not exists matches_away_idx on public.matches (away_player_id);

-- Both players must be approved members of the match's tournament.
-- Checked only when the line-up changes, so later edits to a result
-- still work if a player's status changes afterwards.
create or replace function public.validate_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if tg_op = 'INSERT'
     or new.home_player_id is distinct from old.home_player_id
     or new.away_player_id is distinct from old.away_player_id
     or new.tournament_id  is distinct from old.tournament_id then
    select count(*) into v_count
      from public.players
     where id in (new.home_player_id, new.away_player_id)
       and tournament_id = new.tournament_id
       and status = 'approved';
    if v_count <> 2 then
      raise exception 'MATCH_PLAYERS_INVALID' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists matches_validate_trg on public.matches;
create trigger matches_validate_trg
  before insert or update on public.matches
  for each row execute function public.validate_match();

drop trigger if exists matches_updated_at_trg on public.matches;
create trigger matches_updated_at_trg
  before update on public.matches
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
--  point_adjustments — append-only audit log of manual point changes.
-- ---------------------------------------------------------------------
create table if not exists public.point_adjustments (
  id               uuid primary key default gen_random_uuid(),
  tournament_id    uuid not null references public.tournaments (id) on delete cascade,
  player_id        uuid not null references public.players (id) on delete cascade,
  points           smallint not null check (points <> 0 and points between -100 and 100),
  reason           text not null check (char_length(btrim(reason)) between 3 and 500),
  created_by       uuid references auth.users (id) on delete set null,
  created_by_email text,
  created_at       timestamptz not null default now()
);

create index if not exists point_adjustments_lookup_idx
  on public.point_adjustments (tournament_id, player_id);

-- ---------------------------------------------------------------------
--  news_posts — public news and time-limited tournament notices.
-- ---------------------------------------------------------------------
create table if not exists public.news_posts (
  id         uuid primary key default gen_random_uuid(),
  post_type  text not null check (post_type in ('news', 'notice')),
  title      text not null check (char_length(btrim(title)) between 3 and 120),
  content    text not null check (char_length(btrim(content)) between 1 and 5000),
  is_pinned  boolean not null default false,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint news_posts_pin_notice_chk check (not is_pinned or post_type = 'notice'),
  constraint news_posts_expiry_notice_chk check (expires_at is null or post_type = 'notice')
);

create index if not exists news_posts_listing_idx
  on public.news_posts (is_pinned desc, created_at desc);

drop trigger if exists news_posts_updated_at_trg on public.news_posts;
create trigger news_posts_updated_at_trg
  before update on public.news_posts
  for each row execute function public.set_updated_at();

-- Stamp the author server-side so it cannot be spoofed by the client.
create or replace function public.stamp_point_adjustment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.players
     where id = new.player_id and tournament_id = new.tournament_id
  ) then
    raise exception 'ADJUSTMENT_PLAYER_INVALID' using errcode = '23514';
  end if;

  new.reason           := btrim(new.reason);
  new.created_by       := auth.uid();
  new.created_by_email := (select email from public.admin_users where user_id = auth.uid());
  new.created_at       := now();
  return new;
end;
$$;

drop trigger if exists point_adjustments_stamp_trg on public.point_adjustments;
create trigger point_adjustments_stamp_trg
  before insert on public.point_adjustments
  for each row execute function public.stamp_point_adjustment();

-- ---------------------------------------------------------------------
--  Public read models
--  These views run with the owner's rights (they bypass table RLS) and
--  expose only safe columns of published tournaments. Email addresses
--  and admin identities never leave the database through them.
-- ---------------------------------------------------------------------
create or replace view public.players_public as
select p.id,
       p.tournament_id,
       p.player_name,
       p.team_name,
       p.efootball_username,
       p.status,
       p.created_at,
       p.avatar_url
  from public.players p
  join public.tournaments t on t.id = p.tournament_id
 where p.status <> 'rejected'
   and (t.is_published or public.is_admin());

create or replace view public.player_adjustment_totals as
select pa.tournament_id,
       pa.player_id,
       sum(pa.points)::integer as points,
       count(*)::integer       as entries
  from public.point_adjustments pa
  join public.tournaments t on t.id = pa.tournament_id
 where t.is_published or public.is_admin()
 group by pa.tournament_id, pa.player_id;

-- ---------------------------------------------------------------------
--  Public registration endpoint (called via supabase.rpc)
--  Validates input, enforces registration rules, and prevents duplicates.
-- ---------------------------------------------------------------------
-- Older 4-argument version (before profile photos) is replaced.
drop function if exists public.register_player(text, text, text, text);

create or replace function public.register_player(
  p_player_name        text,
  p_team_name          text,
  p_efootball_username text,
  p_email              text,
  p_avatar_url         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t          public.tournaments%rowtype;
  v_name       text := btrim(regexp_replace(coalesce(p_player_name, ''), '\s+', ' ', 'g'));
  v_team       text := btrim(regexp_replace(coalesce(p_team_name, ''), '\s+', ' ', 'g'));
  v_user       text := btrim(coalesce(p_efootball_username, ''));
  v_email      text := lower(btrim(coalesce(p_email, '')));
  v_status     text;
  v_id         uuid;
  v_constraint text;
begin
  -- Lock the active tournament row so capacity checks are race-free.
  select * into v_t
    from public.tournaments
   where is_active and is_published
   limit 1
   for update;

  if not found then
    raise exception 'NO_ACTIVE_TOURNAMENT' using errcode = 'P0001';
  end if;
  if not v_t.registration_open then
    raise exception 'REGISTRATION_CLOSED' using errcode = 'P0001';
  end if;

  if char_length(v_name) not between 2 and 60 then
    raise exception 'INVALID_PLAYER_NAME' using errcode = '22023';
  end if;
  if char_length(v_team) not between 2 and 60 then
    raise exception 'INVALID_TEAM_NAME' using errcode = '22023';
  end if;
  if char_length(v_user) not between 3 and 40 then
    raise exception 'INVALID_USERNAME' using errcode = '22023';
  end if;
  if char_length(v_email) > 254 or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then
    raise exception 'INVALID_EMAIL' using errcode = '22023';
  end if;
  if nullif(p_avatar_url, '') is not null and (
       char_length(p_avatar_url) > 300000
       or p_avatar_url !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$'
     ) then
    raise exception 'INVALID_AVATAR' using errcode = '22023';
  end if;

  if exists (select 1 from public.players
              where tournament_id = v_t.id and lower(email) = v_email) then
    raise exception 'DUPLICATE_EMAIL' using errcode = '23505';
  end if;
  if exists (select 1 from public.players
              where tournament_id = v_t.id and lower(efootball_username) = lower(v_user)) then
    raise exception 'DUPLICATE_USERNAME' using errcode = '23505';
  end if;

  if v_t.max_players is not null and (
    select count(*) from public.players
     where tournament_id = v_t.id and status <> 'rejected'
  ) >= v_t.max_players then
    raise exception 'TOURNAMENT_FULL' using errcode = 'P0001';
  end if;

  v_status := case when v_t.auto_approve then 'approved' else 'pending' end;

  begin
    insert into public.players (tournament_id, player_name, team_name, efootball_username, email, status, avatar_url)
    values (v_t.id, v_name, v_team, v_user, v_email, v_status, nullif(p_avatar_url, ''))
    returning id into v_id;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint like '%username%' then
      raise exception 'DUPLICATE_USERNAME' using errcode = '23505';
    end if;
    raise exception 'DUPLICATE_EMAIL' using errcode = '23505';
  end;

  return jsonb_build_object('id', v_id, 'status', v_status, 'tournament_id', v_t.id);
end;
$$;

create or replace function public.get_my_player_profile()
returns table (
  id uuid,
  tournament_id uuid,
  player_name text,
  team_name text,
  efootball_username text,
  status text,
  avatar_url text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  select lower(u.email) into v_email
    from auth.users as u
   where u.id = auth.uid()
     and u.email_confirmed_at is not null;

  if v_email is null then
    raise exception 'PLAYER_EMAIL_NOT_VERIFIED' using errcode = '42501';
  end if;

  return query
  select p.id, p.tournament_id, p.player_name, p.team_name,
         p.efootball_username, p.status, p.avatar_url, p.created_at
    from public.players as p
   where lower(p.email) = v_email
   order by p.created_at desc;
end;
$$;

drop function if exists public.update_player_efootball_username(text);

create or replace function public.update_my_player_profile(
  p_player_name text,
  p_efootball_username text,
  p_avatar_url text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_player_name text := btrim(regexp_replace(coalesce(p_player_name, ''), '\s+', ' ', 'g'));
  v_username text := btrim(coalesce(p_efootball_username, ''));
  v_updated integer;
begin
  select lower(u.email) into v_email
    from auth.users as u
   where u.id = auth.uid()
     and u.email_confirmed_at is not null;

  if v_email is null then
    raise exception 'PLAYER_EMAIL_NOT_VERIFIED' using errcode = '42501';
  end if;

  if char_length(v_player_name) not between 2 and 60 then
    raise exception 'INVALID_PLAYER_NAME' using errcode = '22023';
  end if;

  if char_length(v_username) not between 3 and 40 then
    raise exception 'INVALID_USERNAME' using errcode = '22023';
  end if;

  if p_avatar_url is not null and (
       char_length(p_avatar_url) > 300000
       or p_avatar_url !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$'
     ) then
    raise exception 'INVALID_AVATAR' using errcode = '22023';
  end if;

  update public.players
     set player_name = v_player_name,
         efootball_username = v_username,
         avatar_url = p_avatar_url
   where lower(email) = v_email;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'PLAYER_PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  return v_updated;
end;
$$;

revoke execute on function public.get_my_player_profile() from public, anon;
revoke execute on function public.update_my_player_profile(text, text, text) from public, anon;

-- Import a local-browser backup only into an empty database. The admin check
-- and table constraints still apply; the function never deletes remote data.
create or replace function public.import_backup(p_backup jsonb)
returns boolean
language plpgsql
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if p_backup is null or p_backup ->> 'app' is distinct from 'efootball-tournament' then
    raise exception 'INVALID_BACKUP' using errcode = '22023';
  end if;
  if jsonb_typeof(p_backup -> 'tournaments') is distinct from 'array'
     or jsonb_typeof(p_backup -> 'players') is distinct from 'array'
     or jsonb_typeof(p_backup -> 'matches') is distinct from 'array'
     or jsonb_typeof(p_backup -> 'point_adjustments') is distinct from 'array' then
    raise exception 'INVALID_BACKUP' using errcode = '22023';
  end if;
  if p_backup ? 'news_posts'
     and jsonb_typeof(p_backup -> 'news_posts') is distinct from 'array' then
    raise exception 'INVALID_BACKUP' using errcode = '22023';
  end if;
  if jsonb_array_length(p_backup -> 'tournaments') > 5000
     or jsonb_array_length(p_backup -> 'players') > 5000
     or jsonb_array_length(p_backup -> 'matches') > 5000
     or jsonb_array_length(p_backup -> 'point_adjustments') > 5000
     or (p_backup ? 'news_posts' and jsonb_array_length(p_backup -> 'news_posts') > 5000) then
    raise exception 'INVALID_BACKUP' using errcode = '22023';
  end if;
  if exists (select 1 from public.tournaments)
     or exists (select 1 from public.players)
     or exists (select 1 from public.matches)
     or exists (select 1 from public.point_adjustments)
     or exists (select 1 from public.news_posts) then
    raise exception 'IMPORT_REQUIRES_EMPTY_DATABASE' using errcode = 'P0001';
  end if;

  insert into public.tournaments (
    id, name, season, description, rules, format, platform, prize, start_date, end_date,
    max_players, registration_open, auto_approve, points_win, points_draw, points_loss,
    is_published, is_active, created_at, updated_at
  )
  select id, name, season, description, rules, format, platform, prize, start_date, end_date,
         max_players, registration_open, auto_approve, points_win, points_draw, points_loss,
         is_published, is_active, created_at, updated_at
    from jsonb_to_recordset(p_backup -> 'tournaments') as t(
      id uuid, name text, season text, description text, rules text, format text, platform text,
      prize text, start_date date, end_date date, max_players integer, registration_open boolean,
      auto_approve boolean, points_win smallint, points_draw smallint, points_loss smallint,
      is_published boolean, is_active boolean, created_at timestamptz, updated_at timestamptz
    );

  insert into public.players (
    id, tournament_id, player_name, team_name, efootball_username, email, status, notes,
    approved_at, created_at, updated_at, avatar_url
  )
  select id, tournament_id, player_name, team_name, efootball_username, email, status, notes,
         approved_at, created_at, updated_at, avatar_url
    from jsonb_to_recordset(p_backup -> 'players') as p(
      id uuid, tournament_id uuid, player_name text, team_name text, efootball_username text,
      email text, status text, notes text, approved_at timestamptz, created_at timestamptz,
      updated_at timestamptz, avatar_url text
    );

  insert into public.matches (
    id, tournament_id, round, scheduled_at, status, home_player_id, away_player_id,
    home_score, away_score, venue, notes, created_at, updated_at
  )
  select id, tournament_id, round, scheduled_at, status, home_player_id, away_player_id,
         home_score, away_score, venue, notes, created_at, updated_at
    from jsonb_to_recordset(p_backup -> 'matches') as m(
      id uuid, tournament_id uuid, round integer, scheduled_at timestamptz, status text,
      home_player_id uuid, away_player_id uuid, home_score smallint, away_score smallint,
      venue text, notes text, created_at timestamptz, updated_at timestamptz
    );

  insert into public.point_adjustments (id, tournament_id, player_id, points, reason)
  select id, tournament_id, player_id, points, reason
    from jsonb_to_recordset(p_backup -> 'point_adjustments') as a(
      id uuid, tournament_id uuid, player_id uuid, points smallint, reason text
    );

  insert into public.news_posts (id, post_type, title, content, is_pinned, expires_at, created_at, updated_at)
  select id, post_type, title, content, is_pinned, expires_at, created_at, updated_at
    from jsonb_to_recordset(coalesce(p_backup -> 'news_posts', '[]'::jsonb)) as n(
      id uuid, post_type text, title text, content text, is_pinned boolean,
      expires_at timestamptz, created_at timestamptz, updated_at timestamptz
    );

  return true;
end;
$$;
revoke execute on function public.import_backup(jsonb) from public, anon;

-- Make the new tables and functions visible to the API immediately.
notify pgrst, 'reload schema';


-- =====================================================================
--  eFootball Tournament Manager — Row Level Security (step 2 of 3)
--  Public visitors: read published tournament data, register via RPC.
--  Administrators (rows in admin_users): full management access.
-- =====================================================================

alter table public.tournaments       enable row level security;
alter table public.players           enable row level security;
alter table public.matches           enable row level security;
alter table public.admin_users       enable row level security;
alter table public.point_adjustments enable row level security;
alter table public.news_posts        enable row level security;

-- ---------------------------------------------------------------------
--  Table privileges (defence in depth on top of RLS)
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

revoke insert, update, delete, truncate
  on public.tournaments, public.players, public.matches,
     public.admin_users, public.point_adjustments, public.news_posts
  from anon;

-- Public visitors never read the raw players / adjustments tables;
-- they use the players_public and player_adjustment_totals views.
revoke select on public.players, public.point_adjustments, public.admin_users from anon;

-- The audit log is append-only, and admin accounts are managed in SQL only.
revoke update, delete, truncate on public.point_adjustments from authenticated;
revoke insert, update, delete, truncate on public.admin_users from authenticated;

grant select on public.players_public, public.player_adjustment_totals to anon, authenticated;
grant select on public.tournaments, public.matches to anon, authenticated;
grant select, insert, update, delete on public.tournaments, public.players, public.matches to authenticated;
grant select, insert on public.point_adjustments to authenticated;
grant select on public.admin_users to authenticated;
grant select on public.news_posts to anon, authenticated;
grant insert, update, delete on public.news_posts to authenticated;

revoke execute on function public.register_player(text, text, text, text, text) from public;
grant  execute on function public.register_player(text, text, text, text, text) to anon, authenticated;
revoke execute on function public.import_backup(jsonb) from public, anon;
grant  execute on function public.import_backup(jsonb) to authenticated;
grant  execute on function public.is_admin() to anon, authenticated;
revoke execute on function public.get_my_player_profile() from public, anon;
grant  execute on function public.get_my_player_profile() to authenticated;
revoke execute on function public.update_my_player_profile(text, text, text) from public, anon;
grant  execute on function public.update_my_player_profile(text, text, text) to authenticated;

-- ---------------------------------------------------------------------
--  tournaments
-- ---------------------------------------------------------------------
drop policy if exists tournaments_read         on public.tournaments;
drop policy if exists tournaments_admin_insert on public.tournaments;
drop policy if exists tournaments_admin_update on public.tournaments;
drop policy if exists tournaments_admin_delete on public.tournaments;

create policy tournaments_read on public.tournaments
  for select to anon, authenticated
  using (is_published or public.is_admin());

create policy tournaments_admin_insert on public.tournaments
  for insert to authenticated
  with check (public.is_admin());

create policy tournaments_admin_update on public.tournaments
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy tournaments_admin_delete on public.tournaments
  for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------
--  players (contains email addresses: admins only)
-- ---------------------------------------------------------------------
drop policy if exists players_admin_read   on public.players;
drop policy if exists players_admin_insert on public.players;
drop policy if exists players_admin_update on public.players;
drop policy if exists players_admin_delete on public.players;

create policy players_admin_read on public.players
  for select to authenticated
  using (public.is_admin());

create policy players_admin_insert on public.players
  for insert to authenticated
  with check (public.is_admin());

create policy players_admin_update on public.players
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy players_admin_delete on public.players
  for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------
--  matches
-- ---------------------------------------------------------------------
drop policy if exists matches_read         on public.matches;
drop policy if exists matches_admin_insert on public.matches;
drop policy if exists matches_admin_update on public.matches;
drop policy if exists matches_admin_delete on public.matches;

create policy matches_read on public.matches
  for select to anon, authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.tournaments t
       where t.id = matches.tournament_id and t.is_published
    )
  );

create policy matches_admin_insert on public.matches
  for insert to authenticated
  with check (public.is_admin());

create policy matches_admin_update on public.matches
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy matches_admin_delete on public.matches
  for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------
--  point_adjustments (append-only audit log)
-- ---------------------------------------------------------------------
drop policy if exists point_adjustments_admin_read   on public.point_adjustments;
drop policy if exists point_adjustments_admin_insert on public.point_adjustments;

create policy point_adjustments_admin_read on public.point_adjustments
  for select to authenticated
  using (public.is_admin());

create policy point_adjustments_admin_insert on public.point_adjustments
  for insert to authenticated
  with check (public.is_admin());

-- ---------------------------------------------------------------------
--  admin_users (read own row; admins can see the team)
-- ---------------------------------------------------------------------
drop policy if exists admin_users_read on public.admin_users;

create policy admin_users_read on public.admin_users
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------
--  news_posts (public read, admin-only writes)
-- ---------------------------------------------------------------------
drop policy if exists news_posts_public_read   on public.news_posts;
drop policy if exists news_posts_admin_insert on public.news_posts;
drop policy if exists news_posts_admin_update on public.news_posts;
drop policy if exists news_posts_admin_delete on public.news_posts;

create policy news_posts_public_read on public.news_posts
  for select to anon, authenticated
  using (
    public.is_admin()
    or post_type = 'news'
    or expires_at is null
    or expires_at > now()
  );

create policy news_posts_admin_insert on public.news_posts
  for insert to authenticated
  with check (public.is_admin());

create policy news_posts_admin_update on public.news_posts
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy news_posts_admin_delete on public.news_posts
  for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------
--  Realtime: push fixture/result changes to open browsers.
--  Each table's RLS still applies to what subscribers receive.
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['matches', 'tournaments', 'players', 'point_adjustments', 'news_posts'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;
      when undefined_object then null;
    end;
  end loop;
end;
$$;

-- Make the new tables and functions visible to the API immediately.
notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------
--  Confirmation: you should see 6 tables, 2 views and 5 functions below.
-- ---------------------------------------------------------------------
select 'table' as kind, table_name as name
  from information_schema.tables
 where table_schema = 'public' and table_type = 'BASE TABLE'
   and table_name in ('tournaments', 'players', 'matches', 'point_adjustments', 'admin_users', 'news_posts')
union all
select 'view', table_name
  from information_schema.views
 where table_schema = 'public' and table_name in ('players_public', 'player_adjustment_totals')
union all
select 'function', routine_name
  from information_schema.routines
 where routine_schema = 'public' and routine_name in (
   'register_player', 'is_admin', 'import_backup',
   'get_my_player_profile', 'update_my_player_profile'
 )
order by 1, 2;
