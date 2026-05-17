-- =============================================================================
-- Status pembayaran peserta match & sesi program + notifikasi ke pembuat
-- - payment_status: unpaid | paid | payout
-- - paid: pemain sudah bayar (notifikasi ke creator match / creator program)
-- - payout: dana dianggap sudah kembali ke pembuat; hanya diset setelah
--   akhir match/sesi + 30 menit (lewat apply_eligible_participant_payouts)
-- =============================================================================
-- Integrasi app mobile / RPC:
-- - Set `payment_status = 'paid'` saat pembayaran selesai (selain roster).
-- - Tambahkan kolom `mp.payment_status` ke SELECT di fungsi
--   `get_match_roster_for_viewer` bila dipakai untuk UI roster.
-- =============================================================================
-- Pasca-migrasi: jadwalkan di Supabase (Dashboard → Database → Cron/pgcron) atau
-- panggillah rutin:
--   SELECT public.apply_eligible_participant_payouts();
-- minimal tiap ~5–10 menit agar status payout naik tepat waktu.
-- =============================================================================

-- ---------- Kolom ----------
ALTER TABLE public.match_participants
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid';

ALTER TABLE public.program_session_participants
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'match_participants_payment_status_check'
  ) THEN
    ALTER TABLE public.match_participants
      ADD CONSTRAINT match_participants_payment_status_check
      CHECK (payment_status IN ('unpaid', 'paid', 'payout'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'program_session_participants_payment_status_check'
  ) THEN
    ALTER TABLE public.program_session_participants
      ADD CONSTRAINT program_session_participants_payment_status_check
      CHECK (payment_status IN ('unpaid', 'paid', 'payout'));
  END IF;
END
$$;

-- Sinkron dari roster lama: roster_status = paid → payment_status paid
UPDATE public.match_participants
SET payment_status = 'paid'
WHERE roster_status = 'paid'
  AND payment_status = 'unpaid';

-- ---------- BEFORE: roster paid → payment_status paid ----------
CREATE OR REPLACE FUNCTION public.match_participants_sync_paid_from_roster()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.roster_status = 'paid' AND (TG_OP = 'INSERT' OR OLD.roster_status IS DISTINCT FROM 'paid') THEN
    IF NEW.payment_status = 'unpaid' THEN
      NEW.payment_status := 'paid';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_match_participants_sync_paid_from_roster ON public.match_participants;

CREATE TRIGGER trg_match_participants_sync_paid_from_roster
  BEFORE INSERT OR UPDATE OF roster_status ON public.match_participants
  FOR EACH ROW
  EXECUTE PROCEDURE public.match_participants_sync_paid_from_roster();

-- ---------- AFTER: beri tahu pembuat match ----------
CREATE OR REPLACE FUNCTION public.notify_match_creator_on_participant_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_creator uuid;
  v_username text;
  v_display text;
  v_label text;
BEGIN
  IF NEW.payment_status IS DISTINCT FROM 'paid' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.payment_status IS NOT DISTINCT FROM NEW.payment_status THEN
    RETURN NEW;
  END IF;

  SELECT m.creator_id INTO v_creator FROM public.matches AS m WHERE m.id = NEW.match_id;
  IF v_creator IS NULL OR v_creator = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT p.username, p.display_name
  INTO v_username, v_display
  FROM public.profiles AS p
  WHERE p.user_id = NEW.user_id;

  v_label := coalesce(nullif(trim(v_username), ''), nullif(trim(v_display), ''), 'Seorang pemain');

  PERFORM public.notify_user(
    p_title := 'Pembayaran dari pemain',
    p_body := format('%s sudah membayar biaya match.', v_label),
    p_type := 'match_participant_paid',
    p_user_id := v_creator,
    p_data := jsonb_build_object(
      'match_id', NEW.match_id,
      'payer_user_id', NEW.user_id,
      'username', v_username
    )
  );

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_notify_match_creator_participant_paid ON public.match_participants;

CREATE TRIGGER trg_notify_match_creator_participant_paid
  AFTER INSERT OR UPDATE OF payment_status ON public.match_participants
  FOR EACH ROW
  EXECUTE PROCEDURE public.notify_match_creator_on_participant_paid();

-- ---------- AFTER: beri tahu pembuat program (sesi) ----------
CREATE OR REPLACE FUNCTION public.notify_program_creator_on_session_participant_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_creator uuid;
  v_username text;
  v_display text;
  v_label text;
  v_program_name text;
BEGIN
  IF NEW.payment_status IS DISTINCT FROM 'paid' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.payment_status IS NOT DISTINCT FROM NEW.payment_status THEN
    RETURN NEW;
  END IF;

  SELECT pr.creator_id, pr.name
  INTO v_creator, v_program_name
  FROM public.program_sessions AS ps
  JOIN public.programs AS pr ON pr.id = ps.program_id
  WHERE ps.id = NEW.program_session_id;

  IF v_creator IS NULL OR v_creator = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT p.username, p.display_name
  INTO v_username, v_display
  FROM public.profiles AS p
  WHERE p.user_id = NEW.user_id;

  v_label := coalesce(nullif(trim(v_username), ''), nullif(trim(v_display), ''), 'Seorang pemain');

  PERFORM public.notify_user(
    p_title := 'Pembayaran sesi program',
    p_body := format(
      '%s sudah membayar untuk sesi program%s.',
      v_label,
      CASE
        WHEN v_program_name IS NOT NULL AND length(trim(v_program_name)) > 0 THEN format(' «%s»', v_program_name)
        ELSE ''
      END
    ),
    p_type := 'program_session_participant_paid',
    p_user_id := v_creator,
    p_data := jsonb_build_object(
      'program_session_id', NEW.program_session_id,
      'payer_user_id', NEW.user_id,
      'username', v_username
    )
  );

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_notify_program_creator_session_participant_paid
  ON public.program_session_participants;

CREATE TRIGGER trg_notify_program_creator_session_participant_paid
  AFTER INSERT OR UPDATE OF payment_status ON public.program_session_participants
  FOR EACH ROW
  EXECUTE PROCEDURE public.notify_program_creator_on_session_participant_paid();

-- ---------- Naikkan paid → payout setelah jeda 30 menit pasca akhir ----------
CREATE OR REPLACE FUNCTION public.apply_eligible_participant_payouts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_match_n integer;
  v_session_n integer;
BEGIN
  WITH due AS (
    SELECT mp.id
    FROM public.match_participants AS mp
    JOIN public.matches AS m ON m.id = mp.match_id
    WHERE mp.payment_status = 'paid'
      AND now() >= m.scheduled_at
        + (coalesce(nullif(m.duration_hours, 0), 1) * interval '1 hour')
        + interval '30 minutes'
  )
  UPDATE public.match_participants AS mp
  SET payment_status = 'payout'
  FROM due
  WHERE mp.id = due.id;
  GET DIAGNOSTICS v_match_n = ROW_COUNT;

  WITH due AS (
    SELECT psp.id
    FROM public.program_session_participants AS psp
    JOIN public.program_sessions AS ps ON ps.id = psp.program_session_id
    WHERE psp.payment_status = 'paid'
      AND now() >= (
        (
          CASE
            WHEN ps.end_time IS NOT NULL THEN ps.session_date::timestamp + ps.end_time::time
            ELSE
              ps.session_date::timestamp + ps.start_time::time
              + (coalesce(ps.duration_hours, 2) * interval '1 hour')
          END
          AT TIME ZONE 'Asia/Jakarta'
        ) + interval '30 minutes'
      )
  )
  UPDATE public.program_session_participants AS psp
  SET payment_status = 'payout'
  FROM due
  WHERE psp.id = due.id;
  GET DIAGNOSTICS v_session_n = ROW_COUNT;

  RETURN coalesce(v_match_n, 0) + coalesce(v_session_n, 0);
END;
$fn$;

REVOKE ALL ON FUNCTION public.apply_eligible_participant_payouts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_eligible_participant_payouts() TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_eligible_participant_payouts() TO postgres;

COMMENT ON FUNCTION public.apply_eligible_participant_payouts IS
  'Set payment_status=payout untuk peserta yang paid setelah (akhir match/sesi + 30 menit). Panggil berkala (pg_cron / edge).';
