-- 203_sweep_request_auto_draw.sql
-- A buyer can ask for their horse to be drawn for them, instead of spinning the wheel.
-- When the request's tickets are granted (organiser approval, auto-approval on a receipt, or
-- an IOU straight away) the server draws at random for that buyer's unspun tickets — the
-- same draw as the wheel (lib/sweep/draw.ts). Granted before the draw opens → drawn the
-- moment an admin opens it (/api/admin/sweep-draw). Off by default: the wheel is the fun part.
-- Column on an existing table, so no new PostgREST grants are needed.

ALTER TABLE public.sweep_payment_requests
  ADD COLUMN IF NOT EXISTS auto_draw boolean NOT NULL DEFAULT false;
