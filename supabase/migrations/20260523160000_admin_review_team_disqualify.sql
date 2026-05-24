-- Allow superadmin to disqualify approved teams and re-approve rejected teams

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
  v_tournament public.tournaments%ROWTYPE;
BEGIN
  IF NOT public.is_superadmin(p_actor_user_id) THEN
    RAISE EXCEPTION 'Forbidden: superadmin only';
  END IF;

  SELECT * INTO v_team FROM public.tournament_teams WHERE id = p_team_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Team not found'; END IF;

  SELECT * INTO v_tournament FROM public.tournaments WHERE id = v_team.tournament_id;

  IF p_approve THEN
    IF v_team.status = 'approved' THEN
      RETURN;
    END IF;

    UPDATE public.tournament_teams
    SET status = 'approved', reviewed_by = p_actor_user_id, reviewed_at = now(), masked_rejection_until = NULL
    WHERE id = p_team_id;

    IF COALESCE(v_tournament.entry_fee, 0) > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.transaksi t
        WHERE t.reference_id = p_team_id AND t.kategori = 'tournament_team'
      )
    THEN
      PERFORM public.record_transaksi(
        v_team.leader_user_id, NULL, 'tournament_team', p_team_id, NULL,
        v_tournament.entry_fee, 'tournament_team',
        jsonb_build_object('tournament_id', v_team.tournament_id)
      );
    END IF;
  ELSE
    IF v_team.status = 'rejected' THEN
      RETURN;
    END IF;

    IF v_team.status NOT IN ('pending', 'approved') THEN
      RAISE EXCEPTION 'Cannot reject team with status %', v_team.status;
    END IF;

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
          v_member.user_id,
          'tournament_team_rejected',
          CASE WHEN v_team.status = 'approved' THEN 'Tim didiskualifikasi' ELSE 'Pendaftaran turnamen ditolak' END,
          CASE WHEN v_team.status = 'approved' THEN
            'Tim Anda dikeluarkan dari turnamen oleh admin.'
          ELSE
            'Tim tidak disetujui. Hubungi admin jika sudah membayar biaya pendaftaran.'
          END,
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
