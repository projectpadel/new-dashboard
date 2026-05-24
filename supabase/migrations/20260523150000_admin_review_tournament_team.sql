-- Admin wrapper for review_tournament_team (dashboard service_role has no auth.uid())

CREATE OR REPLACE FUNCTION public.admin_review_tournament_team(
  p_actor_user_id uuid,
  p_team_id uuid,
  p_approve boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_team public.tournament_teams%ROWTYPE;
  v_member record;
  v_reviewable boolean;
  v_tournament public.tournaments%ROWTYPE;
BEGIN
  IF NOT public.is_superadmin(p_actor_user_id) THEN
    RAISE EXCEPTION 'Forbidden: superadmin only';
  END IF;

  SELECT * INTO v_team FROM public.tournament_teams WHERE id = p_team_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Team not found'; END IF;

  v_reviewable := v_team.status = 'pending'
    OR (v_team.status = 'rejected' AND v_team.masked_rejection_until IS NOT NULL AND now() < v_team.masked_rejection_until);
  IF NOT v_reviewable THEN RAISE EXCEPTION 'Team already reviewed'; END IF;

  SELECT * INTO v_tournament FROM public.tournaments WHERE id = v_team.tournament_id;

  IF p_approve THEN
    UPDATE public.tournament_teams
    SET status = 'approved', reviewed_by = p_actor_user_id, reviewed_at = now(), masked_rejection_until = NULL
    WHERE id = p_team_id;

    IF COALESCE(v_tournament.entry_fee, 0) > 0 THEN
      PERFORM public.record_transaksi(
        v_team.leader_user_id, NULL, 'tournament_team', p_team_id, NULL,
        v_tournament.entry_fee, 'tournament_team',
        jsonb_build_object('tournament_id', v_team.tournament_id)
      );
    END IF;
  ELSE
    FOR v_member IN
      SELECT user_id FROM public.tournament_team_members WHERE team_id = p_team_id
    LOOP
      INSERT INTO public.tournament_user_announcements (tournament_id, user_id, team_id, announcement_kind)
      VALUES (v_team.tournament_id, v_member.user_id, p_team_id, 'rejected')
      ON CONFLICT (tournament_id, user_id)
      DO UPDATE SET team_id = EXCLUDED.team_id, announcement_kind = EXCLUDED.announcement_kind,
        shown_once = false, shown_at = null;

      IF COALESCE(v_tournament.entry_fee, 0) > 0 THEN
        PERFORM public.notify_user(
          v_member.user_id, 'tournament_team_rejected', 'Pendaftaran turnamen ditolak',
          'Tim tidak disetujui. Hubungi admin jika sudah membayar biaya pendaftaran.',
          jsonb_build_object('tournament_id', v_team.tournament_id, 'team_id', p_team_id, 'amount_idr', v_tournament.entry_fee)
        );
      END IF;
    END LOOP;

    UPDATE public.tournament_teams
    SET status = 'rejected', reviewed_by = p_actor_user_id, reviewed_at = now(), masked_rejection_until = NULL
    WHERE id = p_team_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_review_tournament_team(uuid, uuid, boolean)
  TO authenticated, service_role;
