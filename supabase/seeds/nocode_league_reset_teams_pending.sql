-- Reset NoCode League dummy teams to pending (remove auto-approval + transaksi before superadmin review)

DO $$
DECLARE
  v_tournament_id uuid := '7429f431-0b1d-449f-bf32-ce9a5af9bc5d';
BEGIN
  DELETE FROM public.transaksi t
  USING public.tournament_teams tt
  WHERE t.reference_id = tt.id
    AND t.kategori = 'tournament_team'
    AND tt.tournament_id = v_tournament_id;

  UPDATE public.tournament_teams
  SET
    status = 'pending',
    reviewed_by = NULL,
    reviewed_at = NULL,
    masked_rejection_until = NULL
  WHERE tournament_id = v_tournament_id
    AND status = 'approved';
END;
$$;
