-- =====================================================================
--  eFootball Tournament Manager — Grant admin access (step 3 of 3)
--
--  1. Supabase Dashboard -> Authentication -> Users -> "Add user"
--     Create the admin account with an email + strong password
--     (tick "Auto Confirm User").
--  2. Replace the email below with that account's email and run this.
--  Re-running is safe. Repeat for every additional administrator.
-- =====================================================================

insert into public.admin_users (user_id, email, display_name, role)
select id, email, 'Tournament Admin', 'owner'
  from auth.users
 where lower(email) = lower('admin@example.com')   -- <-- change me
on conflict (user_id) do update
  set email = excluded.email,
      role  = excluded.role;

-- Verify:
select user_id, email, role, created_at from public.admin_users;

-- To revoke access later:
-- delete from public.admin_users where lower(email) = lower('admin@example.com');
