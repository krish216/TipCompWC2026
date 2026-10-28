-- 194: private storage bucket for payment-receipt images. Unlike the app's one existing
-- upload bucket (org-logos, public-read — fine for logos/avatars), a bank-transfer receipt
-- is financial proof and must not be publicly readable. Uploads happen via the service-role
-- admin client from the receipt API route (never directly from the browser), so the owner
-- policy below is a backstop, not the only mechanism — real reads happen via signed URLs
-- minted by that same route for the buyer and that comp's organisers.
insert into storage.buckets (id, name, public)
values ('sweep-receipts', 'sweep-receipts', false)
on conflict (id) do nothing;

-- Path convention: sweep-receipts/{user_id}/{request_id}.{ext} — the uploader can manage
-- their own folder directly if ever needed client-side.
drop policy if exists "sweep_receipts_owner_rw" on storage.objects;
create policy "sweep_receipts_owner_rw" on storage.objects for all
  using (bucket_id = 'sweep-receipts' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'sweep-receipts' and auth.uid()::text = (storage.foldername(name))[1]);

SELECT 'Migration 194 complete — sweep-receipts private bucket added' AS status;
