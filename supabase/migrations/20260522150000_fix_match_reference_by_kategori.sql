-- Koreksi reference_type match: Patungan_Match hanya untuk kategori match_player;
-- match_court → court_booking_match.

ALTER TABLE public.transaksi DROP CONSTRAINT IF EXISTS transaksi_reference_type_check;

UPDATE public.transaksi
SET reference_type = 'court_booking_match',
    updated_at = COALESCE(updated_at, now())
WHERE lower(trim(coalesce(kategori, ''))) = 'match_court'
  AND reference_type IS DISTINCT FROM 'court_booking_match';

UPDATE public.transaksi
SET reference_type = 'Patungan_Match',
    updated_at = COALESCE(updated_at, now())
WHERE lower(trim(coalesce(kategori, ''))) = 'match_player'
  AND lower(trim(coalesce(reference_type, ''))) IN ('match', 'court_booking_match');

ALTER TABLE public.transaksi ADD CONSTRAINT transaksi_reference_type_check CHECK (
  reference_type = ANY (
    ARRAY[
      'Patungan_Match'::text,
      'court_booking_match'::text,
      'program'::text,
      'court_booking'::text,
      'tournament_team'::text
    ]
  )
);

COMMENT ON COLUMN public.transaksi.reference_type IS
  'Jenis referensi pembayaran. match_player → Patungan_Match; match_court → court_booking_match.';

DROP TRIGGER IF EXISTS trg_transaksi_reference_patungan_match ON public.transaksi;
DROP FUNCTION IF EXISTS public.normalize_tx_reference_patungan_match();

CREATE OR REPLACE FUNCTION public.normalize_tx_reference_by_kategori()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF lower(trim(coalesce(NEW.kategori, ''))) = 'match_player' THEN
    IF NEW.reference_type IS NULL
       OR lower(trim(NEW.reference_type)) IN ('', 'match', 'court_booking_match') THEN
      NEW.reference_type := 'Patungan_Match';
    END IF;
  ELSIF lower(trim(coalesce(NEW.kategori, ''))) = 'match_court' THEN
    IF NEW.reference_type IS NULL
       OR lower(trim(NEW.reference_type)) IN ('', 'match', 'patungan_match') THEN
      NEW.reference_type := 'court_booking_match';
    END IF;
  ELSIF lower(trim(coalesce(NEW.reference_type, ''))) = 'match' THEN
    IF lower(trim(coalesce(NEW.kategori, ''))) = 'match_court' THEN
      NEW.reference_type := 'court_booking_match';
    ELSIF lower(trim(coalesce(NEW.kategori, ''))) = 'match_player' THEN
      NEW.reference_type := 'Patungan_Match';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_transaksi_reference_by_kategori
  BEFORE INSERT OR UPDATE OF reference_type, reference_id, kategori ON public.transaksi
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_tx_reference_by_kategori();
