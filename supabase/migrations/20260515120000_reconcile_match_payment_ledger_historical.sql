-- =============================================================================
-- Reconcile matches.scheduled_at vs payment_ledger untuk reference_id = match
-- =============================================================================
-- Menyisipkan baris payment_ledger bila:
--   (A) Belum ada satupun baris ledger dengan reference_id = matches.id
--   (B) Ada baris non-historical yang menyimpan metadata.match_scheduled_at
--       dan nilainya berbeda dari matches.scheduled_at saat ini
--
-- kind: historical_match_ledger (filter laporan: hindari double-count —
--       cabang (B) memakai amount_idr = 0; cabang (A) memakai total_cost_idr)
-- status: settled
-- reference_type: match
--
-- Catatan: jika aplikasi tidak pernah menulis match_scheduled_at di metadata,
--          hanya cabang (A) yang akan berjalan. Sesuaikan app ke depan agar
--          metadata menyimpan jadwal saat pembayaran dicatat.
-- =============================================================================

-- Pratinjau (opsional, jalankan terpisah di SQL editor):
-- SELECT m.id, m.scheduled_at, m.total_cost_idr,
--        EXISTS (SELECT 1 FROM public.payment_ledger pl WHERE pl.reference_id::text = m.id::text) AS has_ledger
-- FROM public.matches m;

INSERT INTO public.payment_ledger (
  id,
  amount_idr,
  kind,
  metadata,
  payee_user_id,
  payer_user_id,
  reference_id,
  reference_type,
  status,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  CASE src.reason
    WHEN 'no_ledger' THEN COALESCE(m.total_cost_idr, 0)
    ELSE 0
  END,
  'historical_match_ledger',
  jsonb_build_object(
    'reason', src.reason,
    'match_scheduled_at', m.scheduled_at,
    'match_status', m.status,
    'total_cost_idr', m.total_cost_idr,
    'migration', '20260515120000_reconcile_match_payment_ledger_historical.sql'
  ),
  NULL,
  m.creator_id,
  m.id::text,
  'match',
  'settled',
  COALESCE(m.scheduled_at::timestamptz, m.created_at::timestamptz, now()),
  now()
FROM public.matches AS m
INNER JOIN LATERAL (
  SELECT 'no_ledger'::text AS reason
  WHERE NOT EXISTS (
      SELECT 1
      FROM public.payment_ledger AS pl
      WHERE pl.reference_id IS NOT NULL
        AND pl.reference_id::text = m.id::text
    )
    AND COALESCE(m.total_cost_idr, 0) > 0

  UNION ALL

  SELECT 'schedule_mismatch'::text
  WHERE EXISTS (
      SELECT 1
      FROM public.payment_ledger AS pl
      WHERE pl.reference_id IS NOT NULL
        AND pl.reference_id::text = m.id::text
        AND pl.kind NOT ILIKE 'historical%'
        AND (pl.metadata ->> 'match_scheduled_at') IS NOT NULL
        AND (pl.metadata ->> 'match_scheduled_at')::timestamptz IS DISTINCT FROM m.scheduled_at::timestamptz
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.payment_ledger AS h
      WHERE h.reference_id::text = m.id::text
        AND h.kind = 'historical_match_ledger'
        AND h.metadata ->> 'reason' = 'schedule_mismatch'
        AND (h.metadata ->> 'match_scheduled_at')::timestamptz IS NOT DISTINCT FROM m.scheduled_at::timestamptz
    )
) AS src ON true;
