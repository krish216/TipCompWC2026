-- ============================================================
-- Migration 011 — organisation profile (logo, contact, owner)
-- ============================================================

-- 1. Add profile columns to organisations
alter table public.organisations
  add column if not exists logo_url        text,
  add column if not exists owner_phone     text,
  add column if not exists owner_email     text,
  add column if not exists owner_name      text,
  add column if not exists is_self_created boolean not null default false,
  add column if not exists approved        boolean not null default true;

-- 2. Create Supabase Storage bucket for org logos
-- Run this in the Supabase dashboard → Storage → New bucket
-- Name: org-logos, Public: true
-- OR run via SQL:
insert into storage.buckets (id, name, public)
values ('org-logos', 'org-logos', true)
on conflict (id) do nothing;

-- 3. Storage RLS — anyone can read, authenticated users can upload their own org logo
create policy "org_logos_public_read"
  on storage.objects for select
  using (bucket_id = 'org-logos');

create policy "org_logos_upload"
  on storage.objects for insert
  with check (
    bucket_id = 'org-logos'
    and auth.role() = 'authenticated'
  );

create policy "org_logos_update"
  on storage.objects for update
  using (
    bucket_id = 'org-logos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- 4. Verify
select id, name, slug, invite_code, is_self_created, owner_name, owner_phone
from public.organisations
order by name;
