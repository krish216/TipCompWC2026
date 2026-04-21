-- ============================================================
-- Migration 018 — monetisation, announcements, prizes
-- ============================================================

-- 1. App-wide settings (tournament admin controls)
create table if not exists public.app_settings (
  key    text primary key,
  value  text not null,
  updated_at timestamptz default now()
);

-- Monetisation off by default — tournament admin switches on
insert into public.app_settings (key, value)
values ('monetisation_enabled', 'false')
on conflict (key) do nothing;

-- 2. Subscription tiers
DO $$ BEGIN
  CREATE TYPE public.subscription_tier AS ENUM ('trial','starter','business','enterprise','public');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Org subscriptions
create table if not exists public.org_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organisations(id) on delete cascade,
  tier            public.subscription_tier not null default 'trial',
  trial_ends_at   timestamptz,                          -- null = not on trial
  paid_at         timestamptz,                          -- null = unpaid
  payment_ref     text,                                 -- Stripe payment intent or manual ref
  max_players     int not null default 50,
  max_tribes      int not null default 3,               -- -1 = unlimited
  price_paid_aud  numeric(8,2),
  expires_at      timestamptz,                          -- end of competition licence
  created_at      timestamptz not null default now()
);

create unique index if not exists idx_org_subscriptions_org_id on public.org_subscriptions(org_id);

-- Auto-create trial subscription when org is created
create or replace function public.create_org_trial()
returns trigger language plpgsql security definer as $$
begin
  insert into public.org_subscriptions (org_id, tier, trial_ends_at, max_players, max_tribes)
  values (new.id, 'trial', now() + interval '14 days', 50, 1);
  return new;
end;
$$;

drop trigger if exists on_org_created_trial on public.organisations;
create trigger on_org_created_trial
  after insert on public.organisations
  for each row
  when (new.slug != 'public')
  execute function public.create_org_trial();

-- RLS
alter table public.app_settings     enable row level security;
alter table public.org_subscriptions enable row level security;

create policy "app_settings_public_read" on public.app_settings for select using (true);
create policy "org_sub_read" on public.org_subscriptions for select
  using (
    org_id in (select org_id from public.org_admins where user_id = auth.uid())
    or exists (select 1 from public.admin_users where user_id = auth.uid())
  );

-- 4. Org announcements (org admins post to PUBLIC org members)
create table if not exists public.org_announcements (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisations(id) on delete cascade,
  author_id   uuid not null references public.users(id) on delete cascade,
  title       text not null,
  body        text not null,
  published   boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists idx_announcements_created on public.org_announcements(created_at desc);

alter table public.org_announcements enable row level security;
create policy "announcements_public_read" on public.org_announcements for select using (published = true);
create policy "announcements_insert" on public.org_announcements for insert
  with check (exists (select 1 from public.org_admins where user_id = auth.uid() and org_id = org_announcements.org_id));

-- 5. Org prizes
create table if not exists public.org_prizes (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisations(id) on delete cascade,
  place       int not null,          -- 1 = 1st, 2 = 2nd, etc.
  description text not null,        -- "Gift voucher $100"
  sponsor     text,                 -- optional sponsor name
  created_at  timestamptz not null default now(),
  unique (org_id, place)
);

alter table public.org_prizes enable row level security;
create policy "prizes_public_read" on public.org_prizes for select using (true);
create policy "prizes_insert" on public.org_prizes for insert
  with check (exists (select 1 from public.org_admins where user_id = auth.uid() and org_id = org_prizes.org_id));
create policy "prizes_delete" on public.org_prizes for delete
  using (exists (select 1 from public.org_admins where user_id = auth.uid() and org_id = org_prizes.org_id));

-- Verify
select key, value from public.app_settings;
