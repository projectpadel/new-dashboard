-- =============================================================================
-- Backfill payment_ledger untuk match yang belum punya baris ledger terkait
-- =============================================================================
-- PENTING — baca sebelum menjalankan:
--
-- 1) Kenapa data beda?
--    - Tabel `matches` = jadwal / konfigurasi pertandingan (total_cost_idr, dll.).
--    - Tabel `payment_ledger` = mutasi uang (pembayaran/refund) saat aliran kas
--      benar-benar dicatat (biasanya saat user bayar, escrow settle, dll.).
--    Jadi TIDAK semua baris di `matches` wajib punya pasangan di `payment_ledger`.
--
-- 2) Risiko inject manual:
--    - Double counting jika sebagian pembayaran sudah ada dengan reference_id lain
--      (mis. ke court_booking id, bukan match id).
--    - Salah nominal / salah payer vs payee bisa merusak laporan keuangan.
--
-- 3) Skrip ini hanya untuk kasus Anda yakin: match tersebut belum pernah punya
--    SATU PUN baris ledger yang reference_id-nya = id match tersebut.
--    Sesuaikan `kind`, `reference_type`, `status`, payer/payee sebelum produksi.
--
-- Jalankan di Supabase SQL Editor (atau psql). Disarankan: backup dulu, lalu
-- BEGIN; ... SELECT hasil; -- ROLLBACK; atau COMMIT;
-- =============================================================================

BEGIN;

-- Pratinjau: match mana yang TIDAK punya ledger dengan reference_id = match.id
SELECT m.id,
       m.status,
       m.total_cost_idr,
       m.creator_id,
       m.created_at
FROM public.matches AS m
WHERE NOT EXISTS (
    SELECT 1
    FROM public.payment_ledger AS pl
    WHERE pl.reference_id IS NOT NULL
      AND pl.reference_id::text = m.id::text
);

-- ---------------------------------------------------------------------------
-- OPSI A — Satu baris per match (nominal = total_cost_idr)
-- Sesuaikan kind / reference_type agar konsisten dengan aplikasi Anda.
-- payer_user_id diisi creator_id hanya asumsi lemah — ubah jika perlu NULL.
-- ---------------------------------------------------------------------------
/*
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
SELECT gen_random_uuid(),
       m.total_cost_idr,
       'match_backfill_total',
       jsonb_build_object('source', 'sql_backfill', 'script', 'backfill-payment-ledger-from-matches.sql'),
       NULL,
       m.creator_id,
       m.id::text,
       'patungan_match',
       'settled',
       COALESCE(m.created_at, now()),
       now()
FROM public.matches AS m
WHERE NOT EXISTS (
    SELECT 1
    FROM public.payment_ledger AS pl
    WHERE pl.reference_id IS NOT NULL
      AND pl.reference_id::text = m.id::text
)
  AND m.total_cost_idr IS NOT NULL
  AND m.total_cost_idr > 0;
*/

-- ---------------------------------------------------------------------------
-- OPSI B (disarankan jika pembayaran court lewat court_booking) —
-- Backfill dari court_bookings (booking_type = match) yang belum punya ledger
-- dengan reference_id = court_bookings.id (bukan match id).
-- Uncomment dan sesuaikan jika alur app Anda memang mengikat ledger ke booking.
-- ---------------------------------------------------------------------------
/*
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
SELECT gen_random_uuid(),
       cb.total_amount_idr,
       'court_booking_backfill',
       jsonb_build_object('source', 'sql_backfill', 'match_id', cb.reference_id),
       NULL,
       cb.user_id,
       cb.id::text,
       'court_booking',
       'settled',
       COALESCE(cb.created_at, now()),
       now()
FROM public.court_bookings AS cb
WHERE cb.booking_type = 'match'
  AND cb.reference_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.payment_ledger AS pl
    WHERE pl.reference_id IS NOT NULL
      AND pl.reference_id::text = cb.id::text
  )
  AND cb.total_amount_idr > 0;
*/

ROLLBACK;
-- Ganti ROLLBACK menjadi COMMIT; setelah Anda memverifikasi hasil SELECT di atas.
