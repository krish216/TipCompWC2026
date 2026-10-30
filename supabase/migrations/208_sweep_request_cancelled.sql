-- 208_sweep_request_cancelled.sql
-- A buyer can cancel their own ticket request while it's still pending and nothing's been
-- paid by transfer (no receipt attached) — PATCH /api/tribes/:id/sweep/requests/:reqId
-- { action: 'cancel' }. A pending request holds its tickets, so cancelling frees them for
-- the pool straight away. Kept as status 'cancelled' rather than deleted, so there's a record
-- if the organiser had taken cash for it; the organiser is notified.
--
-- No new table, so no new PostgREST grants are needed.

ALTER TABLE public.sweep_payment_requests DROP CONSTRAINT IF EXISTS sweep_payment_requests_status_check;
ALTER TABLE public.sweep_payment_requests
  ADD CONSTRAINT sweep_payment_requests_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'));
