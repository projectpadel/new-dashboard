-- Rename reference_type "match" menurut kategori transaksi (bukan blanket ke Patungan_Match).
-- Lanjutan koreksi: 20260522150000_fix_match_reference_by_kategori.sql

ALTER TABLE public.transaksi DROP CONSTRAINT IF EXISTS transaksi_reference_type_check;

UPDATE public.transaksi
SET reference_type = 'Patungan_Match',
    updated_at = COALESCE(updated_at, now())
WHERE lower(trim(coalesce(reference_type, ''))) = 'match'
  AND lower(trim(coalesce(kategori, ''))) = 'match_player';

UPDATE public.transaksi
SET reference_type = 'court_booking_match',
    updated_at = COALESCE(updated_at, now())
WHERE lower(trim(coalesce(reference_type, ''))) = 'match'
  AND lower(trim(coalesce(kategori, ''))) = 'match_court';
