export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      court_bookings: {
        Row: {
          booking_date: string
          booking_type: Database["public"]["Enums"]["booking_type"]
          court_numbers: number[]
          courts_count: number
          created_at: string
          duration_hours: number
          id: string
          reference_id: string | null
          start_time: string
          total_amount_idr: number
          user_id: string
        }
        Insert: {
          booking_date: string
          booking_type: Database["public"]["Enums"]["booking_type"]
          court_numbers?: number[]
          courts_count?: number
          created_at?: string
          duration_hours?: number
          id?: string
          reference_id?: string | null
          start_time: string
          total_amount_idr: number
          user_id: string
        }
        Update: {
          booking_date?: string
          booking_type?: Database["public"]["Enums"]["booking_type"]
          court_numbers?: number[]
          courts_count?: number
          created_at?: string
          duration_hours?: number
          id?: string
          reference_id?: string | null
          start_time?: string
          total_amount_idr?: number
          user_id?: string
        }
        Relationships: []
      }
      daily_signins: {
        Row: {
          coins_earned: number
          created_at: string
          id: string
          signed_in_date: string
          user_id: string
        }
        Insert: {
          coins_earned?: number
          created_at?: string
          id?: string
          signed_in_date?: string
          user_id: string
        }
        Update: {
          coins_earned?: number
          created_at?: string
          id?: string
          signed_in_date?: string
          user_id?: string
        }
        Relationships: []
      }
      instructors: {
        Row: {
          avatar_url: string | null
          avg_rating: number
          bio: string | null
          created_at: string
          display_name: string
          hourly_rate_idr: number
          id: string
          open_to_book: boolean
          total_raters: number
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          avg_rating?: number
          bio?: string | null
          created_at?: string
          display_name: string
          hourly_rate_idr: number
          id?: string
          open_to_book?: boolean
          total_raters?: number
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          avg_rating?: number
          bio?: string | null
          created_at?: string
          display_name?: string
          hourly_rate_idr?: number
          id?: string
          open_to_book?: boolean
          total_raters?: number
          user_id?: string
        }
        Relationships: []
      }
      match_join_requests: {
        Row: {
          applicant_user_id: string
          created_at: string
          id: string
          match_id: string
          preferred_team_side: string | null
          status: string
          updated_at: string
        }
        Insert: {
          applicant_user_id: string
          created_at?: string
          id?: string
          match_id: string
          preferred_team_side?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          applicant_user_id?: string
          created_at?: string
          id?: string
          match_id?: string
          preferred_team_side?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_join_requests_applicant_user_id_fkey"
            columns: ["applicant_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "match_join_requests_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_participants: {
        Row: {
          id: string
          invited_by_user_id: string | null
          joined_at: string
          match_id: string
          payment_status: string
          roster_status: string
          team_side: string | null
          user_id: string
        }
        Insert: {
          id?: string
          invited_by_user_id?: string | null
          joined_at?: string
          match_id: string
          payment_status?: string
          roster_status?: string
          team_side?: string | null
          user_id: string
        }
        Update: {
          id?: string
          invited_by_user_id?: string | null
          joined_at?: string
          match_id?: string
          payment_status?: string
          roster_status?: string
          team_side?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_participants_invited_by_user_id_fkey"
            columns: ["invited_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "match_participants_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_ratings: {
        Row: {
          created_at: string
          id: string
          match_id: string
          rated_id: string
          rater_id: string
          score_change: number
          stars: number
        }
        Insert: {
          created_at?: string
          id?: string
          match_id: string
          rated_id: string
          rater_id: string
          score_change: number
          stars: number
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string
          rated_id?: string
          rater_id?: string
          score_change?: number
          stars?: number
        }
        Relationships: [
          {
            foreignKeyName: "match_ratings_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_result_votes: {
        Row: {
          agreed: boolean
          created_at: string
          id: string
          match_result_id: string
          vote_attempt: number
          voter_user_id: string
        }
        Insert: {
          agreed: boolean
          created_at?: string
          id?: string
          match_result_id: string
          vote_attempt: number
          voter_user_id: string
        }
        Update: {
          agreed?: boolean
          created_at?: string
          id?: string
          match_result_id?: string
          vote_attempt?: number
          voter_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_result_votes_match_result_id_fkey"
            columns: ["match_result_id"]
            isOneToOne: false
            referencedRelation: "match_results"
            referencedColumns: ["id"]
          },
        ]
      }
      match_results: {
        Row: {
          created_at: string
          finalized_at: string | null
          id: string
          match_id: string
          sets_scores: Json
          status: Database["public"]["Enums"]["match_result_status"]
          updated_at: string
          vote_attempt: number
        }
        Insert: {
          created_at?: string
          finalized_at?: string | null
          id?: string
          match_id: string
          sets_scores?: Json
          status?: Database["public"]["Enums"]["match_result_status"]
          updated_at?: string
          vote_attempt?: number
        }
        Update: {
          created_at?: string
          finalized_at?: string | null
          id?: string
          match_id?: string
          sets_scores?: Json
          status?: Database["public"]["Enums"]["match_result_status"]
          updated_at?: string
          vote_attempt?: number
        }
        Relationships: [
          {
            foreignKeyName: "match_results_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          cost_per_player_idr: number
          court_numbers: number[]
          courts_count: number
          created_at: string
          creator_id: string
          duration_hours: number
          id: string
          is_public: boolean
          match_mode: string
          match_type: Database["public"]["Enums"]["match_type"]
          max_players: number
          max_rank: Database["public"]["Enums"]["app_rank"]
          min_rank: Database["public"]["Enums"]["app_rank"]
          scheduled_at: string
          status: Database["public"]["Enums"]["match_status"]
          total_cost_idr: number
        }
        Insert: {
          cost_per_player_idr?: number
          court_numbers?: number[]
          courts_count?: number
          created_at?: string
          creator_id: string
          duration_hours?: number
          id?: string
          is_public?: boolean
          match_mode?: string
          match_type?: Database["public"]["Enums"]["match_type"]
          max_players?: number
          max_rank?: Database["public"]["Enums"]["app_rank"]
          min_rank?: Database["public"]["Enums"]["app_rank"]
          scheduled_at: string
          status?: Database["public"]["Enums"]["match_status"]
          total_cost_idr?: number
        }
        Update: {
          cost_per_player_idr?: number
          court_numbers?: number[]
          courts_count?: number
          created_at?: string
          creator_id?: string
          duration_hours?: number
          id?: string
          is_public?: boolean
          match_mode?: string
          match_type?: Database["public"]["Enums"]["match_type"]
          max_players?: number
          max_rank?: Database["public"]["Enums"]["app_rank"]
          min_rank?: Database["public"]["Enums"]["app_rank"]
          scheduled_at?: string
          status?: Database["public"]["Enums"]["match_status"]
          total_cost_idr?: number
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          data: Json
          id: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_ledger: {
        Row: {
          amount_idr: number
          created_at: string
          id: string
          kind: string
          metadata: Json
          payee_user_id: string | null
          payer_user_id: string | null
          reference_id: string | null
          reference_type: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_idr: number
          created_at?: string
          id?: string
          kind: string
          metadata?: Json
          payee_user_id?: string | null
          payer_user_id?: string | null
          reference_id?: string | null
          reference_type?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          amount_idr?: number
          created_at?: string
          id?: string
          kind?: string
          metadata?: Json
          payee_user_id?: string | null
          payer_user_id?: string | null
          reference_id?: string | null
          reference_type?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_ledger_payee_user_id_fkey"
            columns: ["payee_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payment_ledger_payer_user_id_fkey"
            columns: ["payer_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      profiles: {
        Row: {
          age_range: string | null
          avatar_url: string | null
          bandeja_rating: string | null
          bio: string | null
          coins: number
          created_at: string
          display_name: string | null
          email: string | null
          gender: string | null
          id: string
          matches_completed: number
          membership_tier: string
          onboarded: boolean
          play_frequency: string | null
          programs_completed: number
          racket_sport_experience: string | null
          rank: Database["public"]["Enums"]["app_rank"] | null
          role: string
          skill_level: string | null
          total_score: number
          tournament_experience: string | null
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          age_range?: string | null
          avatar_url?: string | null
          bandeja_rating?: string | null
          bio?: string | null
          coins?: number
          created_at?: string
          display_name?: string | null
          email?: string | null
          gender?: string | null
          id?: string
          matches_completed?: number
          membership_tier?: string
          onboarded?: boolean
          play_frequency?: string | null
          programs_completed?: number
          racket_sport_experience?: string | null
          rank?: Database["public"]["Enums"]["app_rank"] | null
          role?: string
          skill_level?: string | null
          total_score?: number
          tournament_experience?: string | null
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          age_range?: string | null
          avatar_url?: string | null
          bandeja_rating?: string | null
          bio?: string | null
          coins?: number
          created_at?: string
          display_name?: string | null
          email?: string | null
          gender?: string | null
          id?: string
          matches_completed?: number
          membership_tier?: string
          onboarded?: boolean
          play_frequency?: string | null
          programs_completed?: number
          racket_sport_experience?: string | null
          rank?: Database["public"]["Enums"]["app_rank"] | null
          role?: string
          skill_level?: string | null
          total_score?: number
          tournament_experience?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      program_league_matches: {
        Row: {
          court_booking_id: string | null
          court_numbers: number[]
          created_at: string
          duration_hours: number | null
          id: string
          match_index: number
          player_a1_id: string
          player_a2_id: string
          player_b1_id: string
          player_b2_id: string
          program_id: string
          round_no: number
          scheduled_date: string | null
          scheduled_start_time: string | null
          score_team_a: number | null
          score_team_b: number | null
        }
        Insert: {
          court_booking_id?: string | null
          court_numbers?: number[]
          created_at?: string
          duration_hours?: number | null
          id?: string
          match_index: number
          player_a1_id: string
          player_a2_id: string
          player_b1_id: string
          player_b2_id: string
          program_id: string
          round_no: number
          scheduled_date?: string | null
          scheduled_start_time?: string | null
          score_team_a?: number | null
          score_team_b?: number | null
        }
        Update: {
          court_booking_id?: string | null
          court_numbers?: number[]
          created_at?: string
          duration_hours?: number | null
          id?: string
          match_index?: number
          player_a1_id?: string
          player_a2_id?: string
          player_b1_id?: string
          player_b2_id?: string
          program_id?: string
          round_no?: number
          scheduled_date?: string | null
          scheduled_start_time?: string | null
          score_team_a?: number | null
          score_team_b?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "program_league_matches_court_booking_id_fkey"
            columns: ["court_booking_id"]
            isOneToOne: false
            referencedRelation: "court_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_league_matches_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      program_participants: {
        Row: {
          id: string
          joined_at: string
          membership_status: Database["public"]["Enums"]["program_membership_status"]
          program_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          membership_status?: Database["public"]["Enums"]["program_membership_status"]
          program_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          membership_status?: Database["public"]["Enums"]["program_membership_status"]
          program_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_participants_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      program_session_feedback: {
        Row: {
          created_at: string
          feedback_note: string | null
          id: string
          instructor_user_id: string
          participant_user_id: string
          program_session_id: string
          rank_delta_applied: number
          stars: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          feedback_note?: string | null
          id?: string
          instructor_user_id: string
          participant_user_id: string
          program_session_id: string
          rank_delta_applied?: number
          stars?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          feedback_note?: string | null
          id?: string
          instructor_user_id?: string
          participant_user_id?: string
          program_session_id?: string
          rank_delta_applied?: number
          stars?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_session_feedback_program_session_id_fkey"
            columns: ["program_session_id"]
            isOneToOne: false
            referencedRelation: "program_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      program_session_participants: {
        Row: {
          id: string
          joined_at: string
          payment_status: string
          program_session_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          payment_status?: string
          program_session_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          payment_status?: string
          program_session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_session_participants_program_session_id_fkey"
            columns: ["program_session_id"]
            isOneToOne: false
            referencedRelation: "program_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      program_sessions: {
        Row: {
          court_numbers: number[]
          created_at: string
          duration_hours: number | null
          end_time: string
          id: string
          price_per_person: number
          program_id: string
          session_date: string
          start_time: string
        }
        Insert: {
          court_numbers?: number[]
          created_at?: string
          duration_hours?: number | null
          end_time: string
          id?: string
          price_per_person?: number
          program_id: string
          session_date: string
          start_time: string
        }
        Update: {
          court_numbers?: number[]
          created_at?: string
          duration_hours?: number | null
          end_time?: string
          id?: string
          price_per_person?: number
          program_id?: string
          session_date?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_sessions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      programs: {
        Row: {
          bracket_approved_at: string | null
          class_type: Database["public"]["Enums"]["program_class"]
          courts_needed: number
          created_at: string
          creator_id: string
          description: string | null
          id: string
          image_url: string | null
          instructor_fee_per_hour_idr: number
          instructor_id: string | null
          league_state: Database["public"]["Enums"]["program_league_state"]
          max_participants: number
          mini_league_match_type:
            | Database["public"]["Enums"]["mini_league_match_type"]
            | null
          name: string
          price_per_person: number
          program_mode: Database["public"]["Enums"]["program_mode"]
          rank_required: Database["public"]["Enums"]["app_rank"]
          roster_locked_at: string | null
          status: string
          total_price_idr: number
        }
        Insert: {
          bracket_approved_at?: string | null
          class_type: Database["public"]["Enums"]["program_class"]
          courts_needed?: number
          created_at?: string
          creator_id: string
          description?: string | null
          id?: string
          image_url?: string | null
          instructor_fee_per_hour_idr?: number
          instructor_id?: string | null
          league_state?: Database["public"]["Enums"]["program_league_state"]
          max_participants: number
          mini_league_match_type?:
            | Database["public"]["Enums"]["mini_league_match_type"]
            | null
          name: string
          price_per_person: number
          program_mode?: Database["public"]["Enums"]["program_mode"]
          rank_required?: Database["public"]["Enums"]["app_rank"]
          roster_locked_at?: string | null
          status?: string
          total_price_idr: number
        }
        Update: {
          bracket_approved_at?: string | null
          class_type?: Database["public"]["Enums"]["program_class"]
          courts_needed?: number
          created_at?: string
          creator_id?: string
          description?: string | null
          id?: string
          image_url?: string | null
          instructor_fee_per_hour_idr?: number
          instructor_id?: string | null
          league_state?: Database["public"]["Enums"]["program_league_state"]
          max_participants?: number
          mini_league_match_type?:
            | Database["public"]["Enums"]["mini_league_match_type"]
            | null
          name?: string
          price_per_person?: number
          program_mode?: Database["public"]["Enums"]["program_mode"]
          rank_required?: Database["public"]["Enums"]["app_rank"]
          roster_locked_at?: string | null
          status?: string
          total_price_idr?: number
        }
        Relationships: [
          {
            foreignKeyName: "programs_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_matches: {
        Row: {
          court_number: number | null
          created_at: string
          duration_hours: number | null
          id: string
          match_no: number
          result_locked: boolean
          round_no: number
          scheduled_at: string | null
          score_team_a: number | null
          score_team_b: number | null
          sets_scores: Json | null
          status: string
          team_a_id: string | null
          team_b_id: string | null
          tournament_id: string
          updated_at: string
          winner_team_id: string | null
        }
        Insert: {
          court_number?: number | null
          created_at?: string
          duration_hours?: number | null
          id?: string
          match_no: number
          result_locked?: boolean
          round_no: number
          scheduled_at?: string | null
          score_team_a?: number | null
          score_team_b?: number | null
          sets_scores?: Json | null
          status?: string
          team_a_id?: string | null
          team_b_id?: string | null
          tournament_id: string
          updated_at?: string
          winner_team_id?: string | null
        }
        Update: {
          court_number?: number | null
          created_at?: string
          duration_hours?: number | null
          id?: string
          match_no?: number
          result_locked?: boolean
          round_no?: number
          scheduled_at?: string | null
          score_team_a?: number | null
          score_team_b?: number | null
          sets_scores?: Json | null
          status?: string
          team_a_id?: string | null
          team_b_id?: string | null
          tournament_id?: string
          updated_at?: string
          winner_team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_matches_team_a_id_fkey"
            columns: ["team_a_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_team_b_id_fkey"
            columns: ["team_b_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_member_invites: {
        Row: {
          created_at: string
          id: string
          invited_by: string
          status: string
          team_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by: string
          status?: string
          team_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string
          status?: string
          team_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_member_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tournament_member_invites_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_member_invites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      tournament_team_members: {
        Row: {
          created_at: string
          id: string
          role: string
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: string
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      tournament_teams: {
        Row: {
          created_at: string
          id: string
          leader_user_id: string
          logo_storage_path: string | null
          logo_url: string | null
          masked_rejection_until: string | null
          name: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          tournament_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          leader_user_id: string
          logo_storage_path?: string | null
          logo_url?: string | null
          masked_rejection_until?: string | null
          name: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tournament_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          leader_user_id?: string
          logo_storage_path?: string | null
          logo_url?: string | null
          masked_rejection_until?: string | null
          name?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_teams_leader_user_id_fkey"
            columns: ["leader_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tournament_teams_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tournament_teams_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_user_announcements: {
        Row: {
          announcement_kind: string
          created_at: string
          id: string
          shown_at: string | null
          shown_once: boolean
          team_id: string
          tournament_id: string
          user_id: string
        }
        Insert: {
          announcement_kind: string
          created_at?: string
          id?: string
          shown_at?: string | null
          shown_once?: boolean
          team_id: string
          tournament_id: string
          user_id: string
        }
        Update: {
          announcement_kind?: string
          created_at?: string
          id?: string
          shown_at?: string | null
          shown_once?: boolean
          team_id?: string
          tournament_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_user_announcements_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_user_announcements_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_user_announcements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      tournaments: {
        Row: {
          bracket_finalized_at: string | null
          created_at: string
          creator_id: string
          description: string | null
          ends_at: string
          entry_fee: number
          id: string
          name: string
          poster_storage_path: string | null
          poster_url: string | null
          rank_class: Database["public"]["Enums"]["app_rank"]
          registration_deadline: string
          registration_early_closed_at: string | null
          schedule_finalized_at: string | null
          scoring_phase_started_at: string | null
          starts_at: string
          status: string
          team_slots: number
          updated_at: string
        }
        Insert: {
          bracket_finalized_at?: string | null
          created_at?: string
          creator_id: string
          description?: string | null
          ends_at: string
          entry_fee?: number
          id?: string
          name: string
          poster_storage_path?: string | null
          poster_url?: string | null
          rank_class: Database["public"]["Enums"]["app_rank"]
          registration_deadline: string
          registration_early_closed_at?: string | null
          schedule_finalized_at?: string | null
          scoring_phase_started_at?: string | null
          starts_at: string
          status?: string
          team_slots: number
          updated_at?: string
        }
        Update: {
          bracket_finalized_at?: string | null
          created_at?: string
          creator_id?: string
          description?: string | null
          ends_at?: string
          entry_fee?: number
          id?: string
          name?: string
          poster_storage_path?: string | null
          poster_url?: string | null
          rank_class?: Database["public"]["Enums"]["app_rank"]
          registration_deadline?: string
          registration_early_closed_at?: string | null
          schedule_finalized_at?: string | null
          scoring_phase_started_at?: string | null
          starts_at?: string
          status?: string
          team_slots?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournaments_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      refund: {
        Row: {
          amount_idr: number
          beneficiary_user_id: string | null
          created_at: string
          id: string
          match_id: string | null
          metadata: Json | null
          payer_user_id: string | null
          program_id: string | null
          reason: string | null
          status: string
          transaksi_id: string | null
        }
        Insert: {
          amount_idr?: number
          beneficiary_user_id?: string | null
          created_at?: string
          id?: string
          match_id?: string | null
          metadata?: Json | null
          payer_user_id?: string | null
          program_id?: string | null
          reason?: string | null
          status: string
          transaksi_id?: string | null
        }
        Update: {
          amount_idr?: number
          beneficiary_user_id?: string | null
          created_at?: string
          id?: string
          match_id?: string | null
          metadata?: Json | null
          payer_user_id?: string | null
          program_id?: string | null
          reason?: string | null
          status?: string
          transaksi_id?: string | null
        }
        Relationships: []
      }
      transaksi: {
        Row: {
          amount_idr: number
          booking_id: string | null
          court_booking_id: string | null
          created_at: string
          id: string
          match_id: string | null
          metadata: Json | null
          payer_user_id: string | null
          program_id: string | null
          reference_id: string | null
          reference_type: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          amount_idr?: number
          booking_id?: string | null
          court_booking_id?: string | null
          created_at?: string
          id?: string
          match_id?: string | null
          metadata?: Json | null
          payer_user_id?: string | null
          program_id?: string | null
          reference_id?: string | null
          reference_type?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          amount_idr?: number
          booking_id?: string | null
          court_booking_id?: string | null
          created_at?: string
          id?: string
          match_id?: string | null
          metadata?: Json | null
          payer_user_id?: string | null
          program_id?: string | null
          reference_id?: string | null
          reference_type?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount_idr: number
          created_at: string
          id: string
          metadata: Json | null
          reference_id: string | null
          reference_type: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_idr?: number
          created_at?: string
          id?: string
          metadata?: Json | null
          reference_id?: string | null
          reference_type?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_idr?: number
          created_at?: string
          id?: string
          metadata?: Json | null
          reference_id?: string | null
          reference_type?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_prizes: {
        Row: {
          claim_code: string
          created_at: string
          id: string
          prize_name: string
          source: string
          user_id: string
        }
        Insert: {
          claim_code: string
          created_at?: string
          id?: string
          prize_name: string
          source?: string
          user_id: string
        }
        Update: {
          claim_code?: string
          created_at?: string
          id?: string
          prize_name?: string
          source?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _apply_total_score_delta: {
        Args: { p_delta: number; p_user_id: string }
        Returns: undefined
      }
      _finalize_match_result_bo3: {
        Args: { p_match_id: string; p_result_id: string }
        Returns: undefined
      }
      _mini_league_generate_mexicano_round_after: {
        Args: { p_after_round: number; p_program_id: string }
        Returns: undefined
      }
      _mini_league_insert_random_round: {
        Args: { p_program_id: string; p_round_no: number }
        Returns: undefined
      }
      _validate_sets_scores: {
        Args: { p_expected: number; p_sets: Json }
        Returns: undefined
      }
      ack_tournament_announcement_once: {
        Args: { p_tournament_id: string }
        Returns: undefined
      }
      add_program_class_session: {
        Args: {
          p_court_numbers: number[]
          p_duration_hours: number
          p_end_time: string
          p_price_per_person: number
          p_program_id: string
          p_session_date: string
          p_start_time: string
        }
        Returns: string
      }
      approve_mini_league_bracket: {
        Args: { p_program_id: string }
        Returns: undefined
      }
      approve_program_join: {
        Args: { p_program_id: string; p_user_id: string }
        Returns: undefined
      }
      apply_eligible_participant_payouts: { Args: never; Returns: number }
      assert_courts_available: {
        Args: {
          p_booking_date: string
          p_court_numbers: number[]
          p_duration_hours: number
          p_exclude_booking_id?: string
          p_start_time: string
        }
        Returns: undefined
      }
      assert_tournament_schedule_slot_available: {
        Args: {
          p_court_number: number
          p_duration_hours: number
          p_match_id: string
          p_start_at: string
          p_tournament_id: string
        }
        Returns: undefined
      }
      assert_valid_court_numbers: {
        Args: { p_court_numbers: number[]; p_expected_count?: number }
        Returns: number[]
      }
      book_match_court: {
        Args: {
          p_booking_date: string
          p_court_numbers: number[]
          p_courts_count: number
          p_duration_hours: number
          p_start_time: string
        }
        Returns: string
      }
      booking_matches_for_user: {
        Args: never
        Returns: {
          courts_count: number
          duration_hours: number
          id: string
          match_type: Database["public"]["Enums"]["match_type"]
          scheduled_at: string
          status: Database["public"]["Enums"]["match_status"]
        }[]
      }
      calculate_rank: {
        Args: { score: number }
        Returns: Database["public"]["Enums"]["app_rank"]
      }
      calculate_score_change: {
        Args: { _rater_id: string; _stars: number }
        Returns: number
      }
      cast_match_score_vote: {
        Args: { p_agreed: boolean; p_match_id: string }
        Returns: string
      }
      claim_daily_signin: { Args: never; Returns: number }
      close_tournament_registration: {
        Args: { p_tournament_id: string }
        Returns: undefined
      }
      create_match_with_invites:
        | {
            Args: {
              p_court_numbers: number[]
              p_courts_count: number
              p_duration_hours: number
              p_is_public: boolean
              p_max_rank: Database["public"]["Enums"]["app_rank"]
              p_min_rank: Database["public"]["Enums"]["app_rank"]
              p_mode: string
              p_opponent1_username: string
              p_opponent2_username: string
              p_partner_username: string
              p_scheduled_at: string
            }
            Returns: string
          }
        | {
            Args: {
              p_courts_count: number
              p_duration_hours: number
              p_is_public: boolean
              p_max_rank: Database["public"]["Enums"]["app_rank"]
              p_min_rank: Database["public"]["Enums"]["app_rank"]
              p_mode: string
              p_opponent1_username: string
              p_opponent2_username: string
              p_partner_username: string
              p_scheduled_at: string
            }
            Returns: string
          }
      create_mini_league_program: {
        Args: {
          p_description: string
          p_image_url: string
          p_max_participants: number
          p_mini_league_match_type: Database["public"]["Enums"]["mini_league_match_type"]
          p_name: string
          p_price_per_person: number
          p_rank_required: Database["public"]["Enums"]["app_rank"]
        }
        Returns: string
      }
      create_program_full: {
        Args: {
          p_class_type: Database["public"]["Enums"]["program_class"]
          p_courts_needed: number
          p_description: string
          p_image_url: string
          p_instructor_fee_per_hour: number
          p_instructor_id: string
          p_max_participants: number
          p_name: string
          p_rank_required: Database["public"]["Enums"]["app_rank"]
          p_sessions: Json
        }
        Returns: string
      }
      create_tournament: {
        Args: {
          p_description: string
          p_ends_at: string
          p_entry_fee: number
          p_name: string
          p_poster_storage_path?: string
          p_poster_url: string
          p_rank_class: Database["public"]["Enums"]["app_rank"]
          p_registration_deadline: string
          p_starts_at: string
          p_team_slots: number
        }
        Returns: string
      }
      create_tournament_match_schedule: {
        Args: {
          p_courts?: number[]
          p_duration_hours?: number
          p_interval_minutes?: number
          p_start_at: string
          p_tournament_id: string
        }
        Returns: undefined
      }
      creator_respond_join_request: {
        Args: { p_approve: boolean; p_request_id: string }
        Returns: undefined
      }
      delete_match: { Args: { p_match_id: string }; Returns: undefined }
      delete_program: { Args: { p_program_id: string }; Returns: undefined }
      delete_tournament: {
        Args: { p_tournament_id: string }
        Returns: undefined
      }
      finalize_tournament_bracket: {
        Args: { p_tournament_id: string }
        Returns: undefined
      }
      finalize_tournament_schedule: {
        Args: { p_tournament_id: string }
        Returns: undefined
      }
      finish_tournament_schedule_setup: {
        Args: { p_tournament_id: string }
        Returns: undefined
      }
      generate_tournament_bracket: {
        Args: { p_tournament_id: string }
        Returns: undefined
      }
      get_match_post_state: { Args: { p_match_id: string }; Returns: Json }
      get_match_roster_for_viewer: {
        Args: { p_match_id: string }
        Returns: {
          avatar_url: string
          display_name: string
          id: string
          joined_at: string
          match_id: string
          rank: string
          roster_status: string
          team_side: string
          user_id: string
          username: string
        }[]
      }
      get_my_profile: {
        Args: never
        Returns: {
          age_range: string | null
          avatar_url: string | null
          bandeja_rating: string | null
          bio: string | null
          coins: number
          created_at: string
          display_name: string | null
          email: string | null
          gender: string | null
          id: string
          matches_completed: number
          onboarded: boolean
          play_frequency: string | null
          programs_completed: number
          racket_sport_experience: string | null
          rank: Database["public"]["Enums"]["app_rank"] | null
          role: string
          skill_level: string | null
          total_score: number
          tournament_experience: string | null
          updated_at: string
          user_id: string
          username: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_tournament_competition_state: {
        Args: { p_tournament_id: string }
        Returns: Json
      }
      get_tournament_state_for_viewer: {
        Args: { p_tournament_id: string }
        Returns: Json
      }
      invite_match_player: {
        Args: { p_match_id: string; p_team_side: string; p_username: string }
        Returns: undefined
      }
      invite_tournament_member: {
        Args: { p_team_id: string; p_username: string }
        Returns: undefined
      }
      is_instructor: { Args: { _user_id: string }; Returns: boolean }
      is_superadmin: { Args: { p_uid?: string }; Returns: boolean }
      is_tournament_member: {
        Args: { p_tournament_id: string; p_uid?: string }
        Returns: boolean
      }
      is_tournament_team_leader: {
        Args: { p_team_id: string; p_uid?: string }
        Returns: boolean
      }
      join_match:
        | { Args: { p_match_id: string }; Returns: undefined }
        | {
            Args: { p_match_id: string; p_team_side: string }
            Returns: undefined
          }
      join_program: { Args: { p_program_id: string }; Returns: undefined }
      join_program_session: {
        Args: { p_session_id: string }
        Returns: undefined
      }
      leave_match: { Args: { p_match_id: string }; Returns: undefined }
      leave_program_session: {
        Args: { p_session_id: string }
        Returns: undefined
      }
      mark_all_notifications_read: { Args: never; Returns: undefined }
      mark_notification_read: {
        Args: { p_notification_id: string }
        Returns: undefined
      }
      notify_user: {
        Args: {
          p_body: string
          p_data?: Json
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: undefined
      }
      pay_match_roster_slot: {
        Args: { p_match_id: string }
        Returns: undefined
      }
      publish_tournament: {
        Args: { p_tournament_id: string }
        Returns: undefined
      }
      record_payment_ledger: {
        Args: {
          p_amount_idr: number
          p_kind: string
          p_metadata?: Json
          p_payee_user_id: string
          p_payer_user_id: string
          p_reference_id: string
          p_reference_type: string
          p_status: string
        }
        Returns: string
      }
      register_tournament_team: {
        Args: {
          p_logo_storage_path?: string
          p_logo_url: string
          p_team_name: string
          p_tournament_id: string
        }
        Returns: string
      }
      register_tournament_team_with_member_invites: {
        Args: {
          p_invited_usernames: string[]
          p_logo_storage_path?: string
          p_logo_url: string
          p_team_name: string
          p_tournament_id: string
        }
        Returns: string
      }
      reject_program_join: {
        Args: { p_program_id: string; p_user_id: string }
        Returns: undefined
      }
      reopen_tournament_registration: {
        Args: { p_tournament_id: string }
        Returns: undefined
      }
      request_join_match: {
        Args: { p_match_id: string; p_team_side?: string }
        Returns: string
      }
      reset_tournament_bracket_from_zero: {
        Args: { p_tournament_id: string }
        Returns: undefined
      }
      respond_match_invitation: {
        Args: { p_accept: boolean; p_match_id: string }
        Returns: undefined
      }
      respond_tournament_member_invite: {
        Args: { p_accept: boolean; p_team_id: string }
        Returns: undefined
      }
      review_tournament_team: {
        Args: { p_approve: boolean; p_team_id: string }
        Returns: undefined
      }
      rls_match_public_open_or_locked: {
        Args: { p_match_id: string }
        Returns: boolean
      }
      rls_user_is_match_creator: {
        Args: { p_match_id: string; p_uid: string }
        Returns: boolean
      }
      rls_user_join_request_pending_or_declined: {
        Args: { p_match_id: string; p_uid: string }
        Returns: boolean
      }
      rls_user_on_match_roster: {
        Args: { p_match_id: string; p_uid: string }
        Returns: boolean
      }
      save_program_session_feedback: {
        Args: {
          p_note?: string
          p_participant_user_id: string
          p_session_id: string
          p_stars?: number
        }
        Returns: undefined
      }
      schedule_mini_league_match: {
        Args: {
          p_court_numbers: number[]
          p_duration_hours: number
          p_match_id: string
          p_session_date: string
          p_start_time: string
        }
        Returns: undefined
      }
      set_tournament_bracket_match_bo3: {
        Args: {
          p_match_id: string
          p_sets_scores: Json
          p_tournament_id: string
        }
        Returns: undefined
      }
      set_tournament_bracket_slot_team: {
        Args: {
          p_match_id: string
          p_slot: string
          p_team_id: string
          p_tournament_id: string
        }
        Returns: undefined
      }
      spin_wheel: {
        Args: { p_times: number }
        Returns: {
          claim_code: string
          prize_name: string
        }[]
      }
      start_mini_league: { Args: { p_program_id: string }; Returns: undefined }
      storage_delete_tournament_asset: {
        Args: { p_object_name: string }
        Returns: undefined
      }
      submit_bo3_and_start_voting: {
        Args: { p_match_id: string; p_sets_scores: Json }
        Returns: string
      }
      submit_instructor_rating: {
        Args: { p_instructor_id: string; p_stars: number }
        Returns: undefined
      }
      submit_mini_league_match_score: {
        Args: { p_match_id: string; p_score_a: number; p_score_b: number }
        Returns: undefined
      }
      submit_tournament_match_result: {
        Args: { p_confirm?: boolean; p_match_id: string; p_sets_scores: Json }
        Returns: undefined
      }
      superadmin_remove_tournament_team: {
        Args: { p_team_id: string }
        Returns: undefined
      }
      swap_mini_league_slots: {
        Args: {
          p_match_id_1: string
          p_match_id_2: string
          p_slot_1: string
          p_slot_2: string
        }
        Returns: undefined
      }
      swap_tournament_bracket_teams: {
        Args: {
          p_match_a: string
          p_match_b: string
          p_slot_a: string
          p_slot_b: string
          p_tournament_id: string
        }
        Returns: undefined
      }
      tournament_registration_tick: {
        Args: { p_tournament_id: string }
        Returns: undefined
      }
      update_tournament: {
        Args: {
          p_description: string
          p_ends_at: string
          p_entry_fee: number
          p_name: string
          p_poster_storage_path?: string
          p_poster_url: string
          p_rank_class: Database["public"]["Enums"]["app_rank"]
          p_registration_deadline: string
          p_starts_at: string
          p_team_slots: number
          p_tournament_id: string
        }
        Returns: undefined
      }
      update_tournament_match_schedule: {
        Args: {
          p_court_number: number
          p_duration_hours: number
          p_match_id: string
          p_scheduled_at: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_rank: "cupu" | "pemula" | "standard" | "ciamik" | "ndewo"
      booking_type: "match" | "program" | "program_league_match"
      match_result_status: "draft" | "voting" | "confirmed" | "invalid"
      match_status: "open" | "locked" | "completed" | "invalid"
      match_type: "public" | "double"
      mini_league_match_type: "americano" | "mexicano"
      program_class:
        | "group_class"
        | "private_class"
        | "social"
        | "kids_group_class"
      program_league_state:
        | "draft"
        | "bracket_setup"
        | "in_progress"
        | "completed"
      program_membership_status: "pending" | "approved" | "rejected"
      program_mode: "class" | "mini_league"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_rank: ["cupu", "pemula", "standard", "ciamik", "ndewo"],
      booking_type: ["match", "program", "program_league_match"],
      match_result_status: ["draft", "voting", "confirmed", "invalid"],
      match_status: ["open", "locked", "completed", "invalid"],
      match_type: ["public", "double"],
      mini_league_match_type: ["americano", "mexicano"],
      program_class: [
        "group_class",
        "private_class",
        "social",
        "kids_group_class",
      ],
      program_league_state: [
        "draft",
        "bracket_setup",
        "in_progress",
        "completed",
      ],
      program_membership_status: ["pending", "approved", "rejected"],
      program_mode: ["class", "mini_league"],
    },
  },
} as const
