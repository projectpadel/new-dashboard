-- Rank (beginner/bronze/...) must follow total_score via calculate_rank().
-- _apply_total_score_delta previously only updated total_score.

CREATE OR REPLACE FUNCTION public._apply_total_score_delta(p_user_id uuid, p_delta integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_new int;
BEGIN
  IF p_delta = 0 THEN RETURN; END IF;
  PERFORM set_config('app.bypass_profile_guard', 'on', true);
  SELECT LEAST(100, GREATEST(0, total_score + p_delta))
  INTO v_new
  FROM public.profiles
  WHERE user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE public.profiles
  SET
    total_score = v_new,
    rank = public.calculate_rank(v_new),
    updated_at = now()
  WHERE user_id = p_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_profiles_sync_rank_from_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.total_score IS DISTINCT FROM OLD.total_score THEN
    NEW.rank := public.calculate_rank(NEW.total_score);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS profiles_sync_rank_from_score ON public.profiles;
CREATE TRIGGER profiles_sync_rank_from_score
  BEFORE UPDATE OF total_score ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_profiles_sync_rank_from_score();

-- Backfill profiles where rank drifted (e.g. score 100 but rank still beginner).
UPDATE public.profiles
SET
  rank = public.calculate_rank(total_score),
  updated_at = now()
WHERE rank IS DISTINCT FROM public.calculate_rank(total_score);

-- Grant superadmin for boss@gmail.com
UPDATE public.profiles
SET
  role = 'superadmin',
  updated_at = now()
WHERE user_id IN (
  SELECT id FROM auth.users WHERE lower(email) = lower('boss@gmail.com')
);
