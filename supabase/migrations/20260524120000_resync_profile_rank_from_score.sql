-- Re-sync profile.rank from total_score (e.g. after seed scripts that set rank directly).

UPDATE public.profiles
SET
  rank = public.calculate_rank(total_score),
  updated_at = now()
WHERE rank IS DISTINCT FROM public.calculate_rank(total_score);
