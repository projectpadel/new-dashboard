-- Patungan_Match → patungan_match (snake_case huruf kecil, selaras reference type lain).

ALTER TABLE public.transaksi DROP CONSTRAINT IF EXISTS transaksi_reference_type_check;

UPDATE public.transaksi
SET reference_type = 'patungan_match',
    updated_at = COALESCE(updated_at, now())
WHERE reference_type = 'Patungan_Match';

ALTER TABLE public.transaksi ADD CONSTRAINT transaksi_reference_type_check CHECK (
  reference_type = ANY (
    ARRAY[
      'patungan_match'::text,
      'court_booking_match'::text,
      'patungan_program'::text,
      'court_booking_program'::text,
      'program'::text,
      'court_booking'::text,
      'tournament_team'::text
    ]
  )
);

COMMENT ON COLUMN public.transaksi.reference_type IS
  'Jenis referensi pembayaran. match_player → patungan_match; match_court → court_booking_match; program_player → patungan_program; program_court → court_booking_program.';

CREATE OR REPLACE FUNCTION public.normalize_tx_reference_by_kategori()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF lower(trim(coalesce(NEW.kategori, ''))) = 'match_player' THEN
    IF NEW.reference_type IS NULL
       OR lower(trim(NEW.reference_type)) IN ('', 'match', 'court_booking_match')
       OR NEW.reference_type = 'Patungan_Match' THEN
      NEW.reference_type := 'patungan_match';
    END IF;
  ELSIF lower(trim(coalesce(NEW.kategori, ''))) = 'match_court' THEN
    IF NEW.reference_type IS NULL
       OR lower(trim(NEW.reference_type)) IN ('', 'match', 'patungan_match') THEN
      NEW.reference_type := 'court_booking_match';
    END IF;
  ELSIF lower(trim(coalesce(NEW.kategori, ''))) = 'program_player' THEN
    IF NEW.reference_type IS NULL
       OR lower(trim(NEW.reference_type)) IN ('', 'program', 'court_booking_program') THEN
      NEW.reference_type := 'patungan_program';
    END IF;
  ELSIF lower(trim(coalesce(NEW.kategori, ''))) = 'program_court' THEN
    IF NEW.reference_type IS NULL
       OR lower(trim(NEW.reference_type)) IN ('', 'program', 'patungan_program') THEN
      NEW.reference_type := 'court_booking_program';
    END IF;
  ELSIF lower(trim(coalesce(NEW.reference_type, ''))) = 'match'
     OR NEW.reference_type = 'Patungan_Match' THEN
    IF lower(trim(coalesce(NEW.kategori, ''))) = 'match_court' THEN
      NEW.reference_type := 'court_booking_match';
    ELSIF lower(trim(coalesce(NEW.kategori, ''))) = 'match_player' THEN
      NEW.reference_type := 'patungan_match';
    END IF;
  ELSIF lower(trim(coalesce(NEW.reference_type, ''))) = 'program' THEN
    IF lower(trim(coalesce(NEW.kategori, ''))) = 'program_court' THEN
      NEW.reference_type := 'court_booking_program';
    ELSIF lower(trim(coalesce(NEW.kategori, ''))) = 'program_player' THEN
      NEW.reference_type := 'patungan_program';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
