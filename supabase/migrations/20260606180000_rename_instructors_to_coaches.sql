-- Rename instructors → coaches; sync profiles.role; update admin coach RPCs.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'instructors' AND table_type = 'BASE TABLE'
  ) THEN
    ALTER TABLE public.instructors RENAME TO coaches;
  END IF;
END $$;

-- Backward-compatible view for legacy RPC / mobile clients.
CREATE OR REPLACE VIEW public.instructors AS
  SELECT * FROM public.coaches;

COMMENT ON VIEW public.instructors IS 'Backward-compatible alias for coaches (legacy RPC / clients).';

-- Backfill role for users who are already coaches.
UPDATE public.profiles p
SET role = 'coach', updated_at = now()
FROM public.coaches c
WHERE c.user_id = p.user_id
  AND c.deleted_at IS NULL
  AND p.role = 'user';

CREATE OR REPLACE FUNCTION public.sync_coach_profile_role_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.profiles
  SET role = 'coach', updated_at = now()
  WHERE user_id = NEW.user_id
    AND role = 'user';
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_coach_profile_role_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.profiles
  SET role = 'user', updated_at = now()
  WHERE user_id = OLD.user_id
    AND role = 'coach';
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_coaches_sync_profile_role_insert ON public.coaches;
CREATE TRIGGER trg_coaches_sync_profile_role_insert
  AFTER INSERT ON public.coaches
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_coach_profile_role_on_insert();

DROP TRIGGER IF EXISTS trg_coaches_sync_profile_role_delete ON public.coaches;
CREATE TRIGGER trg_coaches_sync_profile_role_delete
  AFTER DELETE ON public.coaches
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_coach_profile_role_on_delete();

CREATE OR REPLACE FUNCTION public.is_instructor(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.coaches c
    WHERE c.user_id = _user_id
      AND c.deleted_at IS NULL
  );
$$;

-- Admin RPC (references coaches table after rename).
CREATE OR REPLACE FUNCTION public.admin_get_coach_hub_grid(
  p_instructor_id uuid,
  p_booking_date date
)
RETURNS TABLE(
  court_number integer,
  start_time time without time zone,
  end_time time without time zone,
  status text,
  coach_booking_id uuid,
  booker_name text,
  booker_username text,
  duration_hours numeric,
  coach_fee_idr bigint,
  court_label text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_hours text[] := ARRAY['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00'];
  v_court int;
  v_idx int;
  v_start time;
  v_end time;
  v_dow smallint;
  v_wh record;
  v_has_weekly_hours boolean := false;
  v_daily_break_start time;
  v_daily_break_end time;
  v_slot_override text;
  v_coach_booking record;
  v_court_booked boolean;
  v_in_break boolean;
  v_in_hours boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.coaches i WHERE i.id = p_instructor_id) THEN
    RETURN;
  END IF;

  SELECT i.daily_break_start, i.daily_break_end
  INTO v_daily_break_start, v_daily_break_end
  FROM public.coaches i
  WHERE i.id = p_instructor_id;

  v_dow := public.date_to_day_of_week(p_booking_date);

  SELECT * INTO v_wh FROM public.coach_weekly_hours w
  WHERE w.instructor_id = p_instructor_id AND w.day_of_week = v_dow;
  v_has_weekly_hours := FOUND;

  FOR v_court IN 1..4 LOOP
    FOR v_idx IN 1..array_length(v_hours, 1) - 1 LOOP
      v_start := v_hours[v_idx]::time;
      v_end := v_hours[v_idx + 1]::time;

      court_number := v_court;
      start_time := v_start;
      end_time := v_end;
      coach_booking_id := NULL;
      booker_name := NULL;
      booker_username := NULL;
      duration_hours := NULL;
      coach_fee_idr := NULL;
      court_label := 'LAP ' || v_court;

      SELECT override_type INTO v_slot_override
      FROM public.coach_slot_overrides cso
      WHERE cso.instructor_id = p_instructor_id
        AND cso.override_date = p_booking_date AND cso.start_time = v_start;

      SELECT cb.id, cb.duration_hours, cb.coach_fee_idr, p.display_name, p.username
      INTO v_coach_booking
      FROM public.coach_bookings cb
      JOIN public.court_bookings court ON court.id = cb.court_booking_id
      CROSS JOIN LATERAL unnest(court.court_numbers) AS cn(court_number)
      LEFT JOIN public.profiles p ON p.user_id = cb.user_id
      WHERE cb.instructor_id = p_instructor_id
        AND cb.booking_date = p_booking_date
        AND cb.status = 'confirmed'
        AND cn.court_number = v_court
        AND (v_start, v_end) OVERLAPS (cb.start_time, cb.start_time + make_interval(secs => round(cb.duration_hours * 3600)))
      LIMIT 1;

      IF FOUND THEN
        status := 'booked';
        coach_booking_id := v_coach_booking.id;
        booker_name := v_coach_booking.display_name;
        booker_username := v_coach_booking.username;
        duration_hours := v_coach_booking.duration_hours;
        coach_fee_idr := v_coach_booking.coach_fee_idr;
        RETURN NEXT;
        CONTINUE;
      END IF;

      IF v_slot_override = 'block' THEN
        status := 'blocked';
        RETURN NEXT;
        CONTINUE;
      END IF;

      v_in_break := false;
      IF v_daily_break_start IS NOT NULL AND v_daily_break_end IS NOT NULL THEN
        IF (v_start, v_end) OVERLAPS (v_daily_break_start, v_daily_break_end) THEN
          v_in_break := true;
        END IF;
      END IF;

      IF v_in_break THEN
        status := 'break';
        RETURN NEXT;
        CONTINUE;
      END IF;

      v_in_hours := v_has_weekly_hours
        AND v_start >= v_wh.start_time
        AND v_end <= v_wh.end_time;

      IF NOT v_in_hours AND v_slot_override IS DISTINCT FROM 'open' THEN
        status := 'unavailable';
        RETURN NEXT;
        CONTINUE;
      END IF;

      SELECT EXISTS (
        SELECT 1 FROM public.court_bookings cb
        CROSS JOIN LATERAL unnest(cb.court_numbers) AS cn(court_number)
        WHERE cb.booking_date = p_booking_date
          AND cn.court_number = v_court
          AND (v_start, v_end) OVERLAPS (cb.start_time, cb.start_time + make_interval(secs => round(cb.duration_hours * 3600)))
      ) INTO v_court_booked;

      IF v_court_booked THEN
        status := 'court_taken';
        RETURN NEXT;
        CONTINUE;
      END IF;

      status := 'available';
      RETURN NEXT;
    END LOOP;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_toggle_coach_slot_override(
  p_instructor_id uuid,
  p_override_date date,
  p_start_time time without time zone,
  p_override_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.coaches i WHERE i.id = p_instructor_id) THEN
    RAISE EXCEPTION 'Coach not found';
  END IF;

  IF p_override_type = 'clear' THEN
    DELETE FROM public.coach_slot_overrides
    WHERE instructor_id = p_instructor_id
      AND override_date = p_override_date
      AND start_time = p_start_time;
    RETURN;
  END IF;

  IF p_override_type NOT IN ('block', 'open') THEN
    RAISE EXCEPTION 'Invalid override type';
  END IF;

  INSERT INTO public.coach_slot_overrides (instructor_id, override_date, start_time, override_type)
  VALUES (p_instructor_id, p_override_date, p_start_time, p_override_type)
  ON CONFLICT (instructor_id, override_date, start_time)
  DO UPDATE SET override_type = EXCLUDED.override_type;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_coach_weekly_schedule(
  p_instructor_id uuid,
  p_weekly_hours jsonb,
  p_breaks jsonb DEFAULT '[]'::jsonb,
  p_daily_break_start time without time zone DEFAULT NULL,
  p_daily_break_end time without time zone DEFAULT NULL,
  p_complete_setup boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.coaches i WHERE i.id = p_instructor_id) THEN
    RAISE EXCEPTION 'Coach not found';
  END IF;

  UPDATE public.coaches
  SET
    daily_break_start = p_daily_break_start,
    daily_break_end = p_daily_break_end,
    hub_setup_at = CASE
      WHEN p_complete_setup OR hub_setup_at IS NOT NULL THEN COALESCE(hub_setup_at, now())
      ELSE hub_setup_at
    END
  WHERE id = p_instructor_id;

  DELETE FROM public.coach_weekly_hours WHERE instructor_id = p_instructor_id;
  DELETE FROM public.coach_breaks WHERE instructor_id = p_instructor_id;

  FOR v_row IN SELECT * FROM jsonb_array_elements(COALESCE(p_weekly_hours, '[]'::jsonb))
  LOOP
    INSERT INTO public.coach_weekly_hours (instructor_id, day_of_week, start_time, end_time)
    VALUES (
      p_instructor_id,
      (v_row->>'day_of_week')::smallint,
      (v_row->>'start_time')::time,
      (v_row->>'end_time')::time
    );
  END LOOP;

  IF p_daily_break_start IS NOT NULL AND p_daily_break_end IS NOT NULL THEN
    INSERT INTO public.coach_breaks (instructor_id, day_of_week, start_time, end_time)
    VALUES (p_instructor_id, NULL, p_daily_break_start, p_daily_break_end);
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(COALESCE(p_breaks, '[]'::jsonb))
  LOOP
    INSERT INTO public.coach_breaks (instructor_id, day_of_week, start_time, end_time)
    VALUES (
      p_instructor_id,
      NULLIF(v_row->>'day_of_week', '')::smallint,
      (v_row->>'start_time')::time,
      (v_row->>'end_time')::time
    );
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.admin_get_coach_hub_grid IS 'Grid jadwal coach untuk admin dashboard.';
COMMENT ON FUNCTION public.admin_toggle_coach_slot_override IS 'Blokir/buka slot coach (admin).';
COMMENT ON FUNCTION public.admin_upsert_coach_weekly_schedule IS 'Simpan jadwal mingguan coach (admin).';
