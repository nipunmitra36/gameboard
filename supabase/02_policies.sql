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

-- ---------------------------------------------------------------------
--  Table privileges (defence in depth on top of RLS)
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

revoke insert, update, delete, truncate
  on public.tournaments, public.players, public.matches,
     public.admin_users, public.point_adjustments
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

revoke execute on function public.register_player(text, text, text, text, text) from public;
grant  execute on function public.register_player(text, text, text, text, text) to anon, authenticated;
revoke execute on function public.import_backup(jsonb) from public, anon;
grant  execute on function public.import_backup(jsonb) to authenticated;
grant  execute on function public.is_admin() to anon, authenticated;

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
--  Realtime: push fixture/result changes to open browsers.
--  Each table's RLS still applies to what subscribers receive.
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['matches', 'tournaments', 'players', 'point_adjustments'] loop
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
