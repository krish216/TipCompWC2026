-- ============================================================
-- Migration 013 — onboarding_complete flag on users
-- ============================================================

alter table public.users
  add column if not exists onboarding_complete boolean not null default false;

-- Existing users are already onboarded
update public.users set onboarding_complete = true where onboarding_complete = false;

-- Update registration trigger to set false for new users
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  public_org_id uuid;
begin
  select id into public_org_id from public.organisations where slug = 'public';
  insert into public.users (id, email, display_name, org_id, onboarding_complete)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)),
    public_org_id,
    false    -- must complete org setup on first login
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Verify
select id, display_name, onboarding_complete from public.users order by created_at desc limit 5;
