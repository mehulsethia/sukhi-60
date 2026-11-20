export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      action_occurrences: {
        Row: {
          proof_level: string | null
          completed_count: number
          created_at: string
          due_at: string
          id: string
          item_id: string
          item_version: number
          local_date: string
          local_time: string | null
          plan_id: string
          snooze_until: string | null
          status: Database["public"]["Enums"]["occurrence_status"]
          status_changed_at: string
          target_count: number
          timezone: string
          user_id: string
          window_end_at: string
        }
        Insert: {
          proof_level?: string | null
          completed_count?: number
          created_at?: string
          due_at: string
          id?: string
          item_id: string
          item_version: number
          local_date: string
          local_time?: string | null
          plan_id: string
          snooze_until?: string | null
          status?: Database["public"]["Enums"]["occurrence_status"]
          status_changed_at?: string
          target_count?: number
          timezone: string
          user_id: string
          window_end_at: string
        }
        Update: {
          proof_level?: string | null
          completed_count?: number
          created_at?: string
          due_at?: string
          id?: string
          item_id?: string
          item_version?: number
          local_date?: string
          local_time?: string | null
          plan_id?: string
          snooze_until?: string | null
          status?: Database["public"]["Enums"]["occurrence_status"]
          status_changed_at?: string
          target_count?: number
          timezone?: string
          user_id?: string
          window_end_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_occurrences_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "plan_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_occurrences_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "care_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          channel: Database["public"]["Enums"]["channel_kind"]
          created_at: string
          error_code: string | null
          id: string
          latency_ms: number
          model_id: string | null
          outcome: string
          route: string
          tools: Json
          user_id: string
        }
        Insert: {
          channel: Database["public"]["Enums"]["channel_kind"]
          created_at?: string
          error_code?: string | null
          id?: string
          latency_ms?: number
          model_id?: string | null
          outcome: string
          route: string
          tools?: Json
          user_id: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["channel_kind"]
          created_at?: string
          error_code?: string | null
          id?: string
          latency_ms?: number
          model_id?: string | null
          outcome?: string
          route?: string
          tools?: Json
          user_id?: string
        }
        Relationships: []
      }
      app_activity: {
        Row: {
          day: string
          first_at: string
          hits: number
          last_at: string
          user_id: string
        }
        Insert: {
          day: string
          first_at?: string
          hits?: number
          last_at?: string
          user_id: string
        }
        Update: {
          day?: string
          first_at?: string
          hits?: number
          last_at?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_events: {
        Row: {
          action: string
          actor: string
          created_at: string
          details: Json
          entity: string
          entity_id: string | null
          id: number
          user_id: string | null
        }
        Insert: {
          action: string
          actor: string
          created_at?: string
          details?: Json
          entity: string
          entity_id?: string | null
          id?: never
          user_id?: string | null
        }
        Update: {
          action?: string
          actor?: string
          created_at?: string
          details?: Json
          entity?: string
          entity_id?: string | null
          id?: never
          user_id?: string | null
        }
        Relationships: []
      }
      barrier_reports: {
        Row: {
          barrier_code: string
          channel: Database["public"]["Enums"]["channel_kind"]
          check_in_id: string | null
          created_at: string
          id: string
          idempotency_key: string
          item_id: string
          nudge_event_id: string | null
          occurrence_id: string | null
          user_id: string
        }
        Insert: {
          barrier_code: string
          channel?: Database["public"]["Enums"]["channel_kind"]
          check_in_id?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          item_id: string
          nudge_event_id?: string | null
          occurrence_id?: string | null
          user_id: string
        }
        Update: {
          barrier_code?: string
          channel?: Database["public"]["Enums"]["channel_kind"]
          check_in_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          item_id?: string
          nudge_event_id?: string | null
          occurrence_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "barrier_reports_check_in_id_fkey"
            columns: ["check_in_id"]
            isOneToOne: false
            referencedRelation: "check_ins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barrier_reports_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "plan_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barrier_reports_nudge_fk"
            columns: ["nudge_event_id"]
            isOneToOne: false
            referencedRelation: "nudge_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barrier_reports_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "action_occurrences"
            referencedColumns: ["id"]
          },
        ]
      }
      care_plans: {
        Row: {
          clinician_name: string | null
          clinician_verification: Database["public"]["Enums"]["clinician_verification"]
          created_at: string
          id: string
          mode: Database["public"]["Enums"]["plan_mode"]
          pause_reason: string | null
          paused_until: string | null
          source_description: string | null
          source_document_id: string | null
          status: Database["public"]["Enums"]["plan_status"]
          title: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          clinician_name?: string | null
          clinician_verification?: Database["public"]["Enums"]["clinician_verification"]
          created_at?: string
          id?: string
          mode: Database["public"]["Enums"]["plan_mode"]
          pause_reason?: string | null
          paused_until?: string | null
          source_description?: string | null
          source_document_id?: string | null
          status?: Database["public"]["Enums"]["plan_status"]
          title: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          clinician_name?: string | null
          clinician_verification?: Database["public"]["Enums"]["clinician_verification"]
          created_at?: string
          id?: string
          mode?: Database["public"]["Enums"]["plan_mode"]
          pause_reason?: string | null
          paused_until?: string | null
          source_description?: string | null
          source_document_id?: string | null
          status?: Database["public"]["Enums"]["plan_status"]
          title?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "care_plans_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      change_proposals: {
        Row: {
          change: Json
          confirm_code: string
          created_at: string
          decided_at: string | null
          expires_at: string
          id: string
          item_id: string | null
          item_version: number | null
          plan_id: string | null
          status: string
          summary: string
          user_id: string
        }
        Insert: {
          change: Json
          confirm_code: string
          created_at?: string
          decided_at?: string | null
          expires_at?: string
          id?: string
          item_id?: string | null
          item_version?: number | null
          plan_id?: string | null
          status?: string
          summary: string
          user_id: string
        }
        Update: {
          change?: Json
          confirm_code?: string
          created_at?: string
          decided_at?: string | null
          expires_at?: string
          id?: string
          item_id?: string | null
          item_version?: number | null
          plan_id?: string | null
          status?: string
          summary?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "change_proposals_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "plan_items"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_bindings: {
        Row: {
          wa_state: string | null
          wa_state_at: string | null
          wa_state_data: Json
          channel: string
          created_at: string
          external_id: string
          id: string
          last_inbound_at: string | null
          opted_in_at: string
          opted_out_at: string | null
          status: Database["public"]["Enums"]["binding_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          wa_state?: string | null
          wa_state_at?: string | null
          wa_state_data?: Json
          channel?: string
          created_at?: string
          external_id: string
          id?: string
          last_inbound_at?: string | null
          opted_in_at?: string
          opted_out_at?: string | null
          status?: Database["public"]["Enums"]["binding_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          wa_state?: string | null
          wa_state_at?: string | null
          wa_state_data?: Json
          channel?: string
          created_at?: string
          external_id?: string
          id?: string
          last_inbound_at?: string | null
          opted_in_at?: string
          opted_out_at?: string | null
          status?: Database["public"]["Enums"]["binding_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      check_ins: {
        Row: {
          channel: Database["public"]["Enums"]["channel_kind"]
          created_at: string
          id: string
          idempotency_key: string
          kind: Database["public"]["Enums"]["check_in_kind"]
          local_date: string
          note: string | null
          occurrence_id: string
          reason: string | null
          user_id: string
        }
        Insert: {
          channel?: Database["public"]["Enums"]["channel_kind"]
          created_at?: string
          id?: string
          idempotency_key: string
          kind: Database["public"]["Enums"]["check_in_kind"]
          local_date: string
          note?: string | null
          occurrence_id: string
          reason?: string | null
          user_id: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["channel_kind"]
          created_at?: string
          id?: string
          idempotency_key?: string
          kind?: Database["public"]["Enums"]["check_in_kind"]
          local_date?: string
          note?: string | null
          occurrence_id?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "check_ins_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "action_occurrences"
            referencedColumns: ["id"]
          },
        ]
      }
      circle_members: {
        Row: {
          circle_id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          circle_id: string
          joined_at?: string
          user_id: string
        }
        Update: {
          circle_id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "circle_members_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
        ]
      }
      circle_posts: {
        Row: {
          body: string | null
          circle_id: string
          created_at: string
          dedupe_key: string | null
          id: string
          kind: string
          meta: Json
          user_id: string | null
        }
        Insert: {
          body?: string | null
          circle_id: string
          created_at?: string
          dedupe_key?: string | null
          id?: string
          kind: string
          meta?: Json
          user_id?: string | null
        }
        Update: {
          body?: string | null
          circle_id?: string
          created_at?: string
          dedupe_key?: string | null
          id?: string
          kind?: string
          meta?: Json
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "circle_posts_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
        ]
      }
      circle_reactions: {
        Row: {
          created_at: string
          kind: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          kind: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          kind?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "circle_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "circle_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      circles: {
        Row: {
          created_at: string
          ends_on: string | null
          id: string
          invite_code: string
          kind: string
          name: string
          owner_id: string | null
          prize: string | null
          starts_on: string | null
        }
        Insert: {
          created_at?: string
          ends_on?: string | null
          id?: string
          invite_code: string
          kind?: string
          name?: string
          owner_id?: string | null
          prize?: string | null
          starts_on?: string | null
        }
        Update: {
          created_at?: string
          ends_on?: string | null
          id?: string
          invite_code?: string
          kind?: string
          name?: string
          owner_id?: string | null
          prize?: string | null
          starts_on?: string | null
        }
        Relationships: []
      }
      consents: {
        Row: {
          granted: boolean
          granted_at: string | null
          id: string
          kind: Database["public"]["Enums"]["consent_kind"]
          policy_version: string
          revoked_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          granted: boolean
          granted_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["consent_kind"]
          policy_version?: string
          revoked_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          granted?: boolean
          granted_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["consent_kind"]
          policy_version?: string
          revoked_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wa_connect_requests: {
        Row: {
          token_hash: string
          external_id: string
          expires_at: string
          used_at: string | null
          used_by: string | null
          created_at: string
        }
        Insert: {
          token_hash: string
          external_id: string
          expires_at: string
          used_at?: string | null
          used_by?: string | null
          created_at?: string
        }
        Update: {
          token_hash?: string
          external_id?: string
          expires_at?: string
          used_at?: string | null
          used_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      proof_challenges: {
        Row: {
          id: string
          user_id: string
          occurrence_id: string
          kind: string
          value: string
          created_at: string
          expires_at: string
        }
        Insert: {
          id?: string
          user_id: string
          occurrence_id: string
          kind: string
          value: string
          created_at?: string
          expires_at: string
        }
        Update: {
          id?: string
          user_id?: string
          occurrence_id?: string
          kind?: string
          value?: string
          created_at?: string
          expires_at?: string
        }
        Relationships: []
      }
      readings: {
        Row: {
          id: string
          user_id: string
          occurrence_id: string | null
          item_id: string | null
          evidence_id: string | null
          kind: string
          value: number
          value2: number | null
          pulse: number | null
          unit: string
          source: string
          read_as: Json | null
          measured_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          occurrence_id?: string | null
          item_id?: string | null
          evidence_id?: string | null
          kind: string
          value: number
          value2?: number | null
          pulse?: number | null
          unit: string
          source?: string
          read_as?: Json | null
          measured_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          occurrence_id?: string | null
          item_id?: string | null
          evidence_id?: string | null
          kind?: string
          value?: number
          value2?: number | null
          pulse?: number | null
          unit?: string
          source?: string
          read_as?: Json | null
          measured_at?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      doctor_patients: {
        Row: {
          id: string
          doctor_id: string
          patient_id: string
          status: string
          consented_at: string
          revoked_at: string | null
          period_start: string
          created_at: string
        }
        Insert: {
          id?: string
          doctor_id: string
          patient_id: string
          status?: string
          consented_at?: string
          revoked_at?: string | null
          period_start?: string
          created_at?: string
        }
        Update: {
          id?: string
          doctor_id?: string
          patient_id?: string
          status?: string
          consented_at?: string
          revoked_at?: string | null
          period_start?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_patients_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["user_id"]
          },
        ]
      }
      doctor_rewards: {
        Row: {
          id: string
          link_id: string
          doctor_id: string
          patient_id: string
          code: string
          reward_text: string
          adherence_pct: number
          period_start: string
          period_end: string
          status: string
          redeemed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          link_id: string
          doctor_id: string
          patient_id: string
          code: string
          reward_text: string
          adherence_pct: number
          period_start: string
          period_end: string
          status?: string
          redeemed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          link_id?: string
          doctor_id?: string
          patient_id?: string
          code?: string
          reward_text?: string
          adherence_pct?: number
          period_start?: string
          period_end?: string
          status?: string
          redeemed_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      doctors: {
        Row: {
          user_id: string
          name: string
          clinic: string | null
          code: string
          reward_text: string | null
          reward_target_pct: number
          reward_days: number
          created_at: string
        }
        Insert: {
          user_id: string
          name: string
          clinic?: string | null
          code: string
          reward_text?: string | null
          reward_target_pct?: number
          reward_days?: number
          created_at?: string
        }
        Update: {
          user_id?: string
          name?: string
          clinic?: string | null
          code?: string
          reward_text?: string | null
          reward_target_pct?: number
          reward_days?: number
          created_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          bucket: string
          created_at: string
          extraction: Json | null
          extraction_status: string
          id: string
          mime_type: string
          purged_at: string | null
          original_name: string | null
          sha256: string
          size_bytes: number
          storage_path: string
          user_id: string
        }
        Insert: {
          bucket: string
          created_at?: string
          extraction?: Json | null
          extraction_status?: string
          id?: string
          mime_type: string
          purged_at?: string | null
          original_name?: string | null
          sha256: string
          size_bytes: number
          storage_path: string
          user_id: string
        }
        Update: {
          bucket?: string
          created_at?: string
          extraction?: Json | null
          extraction_status?: string
          id?: string
          mime_type?: string
          purged_at?: string | null
          original_name?: string | null
          sha256?: string
          size_bytes?: number
          storage_path?: string
          user_id?: string
        }
        Relationships: []
      }
      evaluations: {
        Row: {
          flags: string[]
          flag_detail: Json
          challenge_met: boolean | null
          label_match: string | null
          blister_empty: number | null
          proof_level: string | null
          reviewer: string | null
          cannot_confirm: string[]
          created_at: string
          evidence_id: string | null
          explanation: string
          id: string
          method: Database["public"]["Enums"]["evaluation_method"]
          model_id: string | null
          needs_review: boolean
          observed: string[]
          occurrence_id: string
          outcome: Database["public"]["Enums"]["evaluation_outcome"]
          user_id: string
        }
        Insert: {
          flags?: string[]
          flag_detail?: Json
          challenge_met?: boolean | null
          label_match?: string | null
          blister_empty?: number | null
          proof_level?: string | null
          reviewer?: string | null
          cannot_confirm?: string[]
          created_at?: string
          evidence_id?: string | null
          explanation: string
          id?: string
          method: Database["public"]["Enums"]["evaluation_method"]
          model_id?: string | null
          needs_review?: boolean
          observed?: string[]
          occurrence_id: string
          outcome: Database["public"]["Enums"]["evaluation_outcome"]
          user_id: string
        }
        Update: {
          flags?: string[]
          flag_detail?: Json
          challenge_met?: boolean | null
          label_match?: string | null
          blister_empty?: number | null
          proof_level?: string | null
          reviewer?: string | null
          cannot_confirm?: string[]
          created_at?: string
          evidence_id?: string | null
          explanation?: string
          id?: string
          method?: Database["public"]["Enums"]["evaluation_method"]
          model_id?: string | null
          needs_review?: boolean
          observed?: string[]
          occurrence_id?: string
          outcome?: Database["public"]["Enums"]["evaluation_outcome"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluations_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "action_occurrences"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence: {
        Row: {
          phash: string | null
          taken_at: string | null
          challenge_id: string | null
          channel: Database["public"]["Enums"]["channel_kind"]
          check_in_id: string | null
          content_hash: string
          created_at: string
          document_id: string | null
          id: string
          kind: Database["public"]["Enums"]["evidence_kind"]
          occurrence_id: string
          text_content: string | null
          transcript: string | null
          user_id: string
        }
        Insert: {
          phash?: string | null
          taken_at?: string | null
          challenge_id?: string | null
          channel?: Database["public"]["Enums"]["channel_kind"]
          check_in_id?: string | null
          content_hash: string
          created_at?: string
          document_id?: string | null
          id?: string
          kind: Database["public"]["Enums"]["evidence_kind"]
          occurrence_id: string
          text_content?: string | null
          transcript?: string | null
          user_id: string
        }
        Update: {
          phash?: string | null
          taken_at?: string | null
          challenge_id?: string | null
          channel?: Database["public"]["Enums"]["channel_kind"]
          check_in_id?: string | null
          content_hash?: string
          created_at?: string
          document_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["evidence_kind"]
          occurrence_id?: string
          text_content?: string | null
          transcript?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_check_in_id_fkey"
            columns: ["check_in_id"]
            isOneToOne: false
            referencedRelation: "check_ins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "action_occurrences"
            referencedColumns: ["id"]
          },
        ]
      }
      family_access: {
        Row: {
          accepted_at: string | null
          created_at: string
          expires_at: string
          id: string
          invite_token_hash: string
          invitee_label: string
          member_user_id: string | null
          patient_id: string
          revoked_at: string | null
          scopes: string[]
          status: Database["public"]["Enums"]["family_status"]
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          invite_token_hash: string
          invitee_label: string
          member_user_id?: string | null
          patient_id: string
          revoked_at?: string | null
          scopes?: string[]
          status?: Database["public"]["Enums"]["family_status"]
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          invite_token_hash?: string
          invitee_label?: string
          member_user_id?: string | null
          patient_id?: string
          revoked_at?: string | null
          scopes?: string[]
          status?: Database["public"]["Enums"]["family_status"]
        }
        Relationships: []
      }
      family_alerts: {
        Row: {
          access_id: string
          created_at: string
          dedupe_key: string
          id: string
          kind: string
          member_user_id: string
          patient_id: string
          seen_at: string | null
        }
        Insert: {
          access_id: string
          created_at?: string
          dedupe_key: string
          id?: string
          kind: string
          member_user_id: string
          patient_id: string
          seen_at?: string | null
        }
        Update: {
          access_id?: string
          created_at?: string
          dedupe_key?: string
          id?: string
          kind?: string
          member_user_id?: string
          patient_id?: string
          seen_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "family_alerts_access_id_fkey"
            columns: ["access_id"]
            isOneToOne: false
            referencedRelation: "family_access"
            referencedColumns: ["id"]
          },
        ]
      }
      habit_confidence: {
        Row: {
          confidence: number | null
          id: string
          item_id: string | null
          plan_id: string | null
          recorded_at: string
          user_id: string
        }
        Insert: {
          confidence?: number | null
          id?: string
          item_id?: string | null
          plan_id?: string | null
          recorded_at?: string
          user_id: string
        }
        Update: {
          confidence?: number | null
          id?: string
          item_id?: string | null
          plan_id?: string | null
          recorded_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "habit_confidence_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "plan_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "habit_confidence_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "care_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      inbound_events: {
        Row: {
          event_type: string
          from_external_id: string | null
          id: string
          payload: Json
          processed_at: string | null
          provider: string
          provider_event_id: string
          received_at: string
          status: string
        }
        Insert: {
          event_type: string
          from_external_id?: string | null
          id?: string
          payload: Json
          processed_at?: string | null
          provider?: string
          provider_event_id: string
          received_at?: string
          status?: string
        }
        Update: {
          event_type?: string
          from_external_id?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          provider?: string
          provider_event_id?: string
          received_at?: string
          status?: string
        }
        Relationships: []
      }
      jobs: {
        Row: {
          attempts: number
          created_at: string
          dedupe_key: string | null
          id: string
          kind: Database["public"]["Enums"]["job_kind"]
          last_error: string | null
          locked_by: string | null
          locked_until: string | null
          max_attempts: number
          payload: Json
          plan_item_version: number | null
          run_at: string
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          dedupe_key?: string | null
          id?: string
          kind: Database["public"]["Enums"]["job_kind"]
          last_error?: string | null
          locked_by?: string | null
          locked_until?: string | null
          max_attempts?: number
          payload?: Json
          plan_item_version?: number | null
          run_at?: string
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          dedupe_key?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["job_kind"]
          last_error?: string | null
          locked_by?: string | null
          locked_until?: string | null
          max_attempts?: number
          payload?: Json
          plan_item_version?: number | null
          run_at?: string
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      link_codes: {
        Row: {
          code_hash: string
          created_at: string
          expires_at: string
          id: string
          purpose: string
          used_at: string | null
          used_by_external_hash: string | null
          user_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          expires_at: string
          id?: string
          purpose?: string
          used_at?: string | null
          used_by_external_hash?: string | null
          user_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          expires_at?: string
          id?: string
          purpose?: string
          used_at?: string | null
          used_by_external_hash?: string | null
          user_id?: string
        }
        Relationships: []
      }
      memory_facts: {
        Row: {
          content: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["memory_kind"]
          source_id: string | null
          source_type: string
          status: Database["public"]["Enums"]["memory_status"]
          superseded_by: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["memory_kind"]
          source_id?: string | null
          source_type: string
          status?: Database["public"]["Enums"]["memory_status"]
          superseded_by?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["memory_kind"]
          source_id?: string | null
          source_type?: string
          status?: Database["public"]["Enums"]["memory_status"]
          superseded_by?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memory_facts_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "memory_facts"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          channel: Database["public"]["Enums"]["channel_kind"]
          content: string
          created_at: string
          id: string
          provider_message_id: string | null
          role: Database["public"]["Enums"]["message_role"]
          safety_flag: string | null
          source_refs: Json
          user_id: string
        }
        Insert: {
          channel: Database["public"]["Enums"]["channel_kind"]
          content: string
          created_at?: string
          id?: string
          provider_message_id?: string | null
          role: Database["public"]["Enums"]["message_role"]
          safety_flag?: string | null
          source_refs?: Json
          user_id: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["channel_kind"]
          content?: string
          created_at?: string
          id?: string
          provider_message_id?: string | null
          role?: Database["public"]["Enums"]["message_role"]
          safety_flag?: string | null
          source_refs?: Json
          user_id?: string
        }
        Relationships: []
      }
      mood_checkins: {
        Row: {
          created_at: string
          id: string
          local_date: string
          mood: number
          sleep_hours: number | null
          sleep_quality: number | null
          stress: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          local_date: string
          mood: number
          sleep_hours?: number | null
          sleep_quality?: number | null
          stress?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          local_date?: string
          mood?: number
          sleep_hours?: number | null
          sleep_quality?: number | null
          stress?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      nudge_events: {
        Row: {
          acknowledged_at: string | null
          channel: Database["public"]["Enums"]["channel_kind"]
          created_at: string
          dedupe_key: string | null
          delivered_at: string | null
          id: string
          item_id: string | null
          kind: string
          occurrence_id: string | null
          outcome: string | null
          strategy_id: string
          style_used: string
          template_or_variant_id: string
          user_id: string
          user_initiated: boolean
          wording_source: string
        }
        Insert: {
          acknowledged_at?: string | null
          channel?: Database["public"]["Enums"]["channel_kind"]
          created_at?: string
          dedupe_key?: string | null
          delivered_at?: string | null
          id?: string
          item_id?: string | null
          kind: string
          occurrence_id?: string | null
          outcome?: string | null
          strategy_id: string
          style_used: string
          template_or_variant_id: string
          user_id: string
          user_initiated?: boolean
          wording_source?: string
        }
        Update: {
          acknowledged_at?: string | null
          channel?: Database["public"]["Enums"]["channel_kind"]
          created_at?: string
          dedupe_key?: string | null
          delivered_at?: string | null
          id?: string
          item_id?: string | null
          kind?: string
          occurrence_id?: string | null
          outcome?: string | null
          strategy_id?: string
          style_used?: string
          template_or_variant_id?: string
          user_id?: string
          user_initiated?: boolean
          wording_source?: string
        }
        Relationships: [
          {
            foreignKeyName: "nudge_events_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "plan_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nudge_events_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "action_occurrences"
            referencedColumns: ["id"]
          },
        ]
      }
      outbound_messages: {
        Row: {
          payload: Json | null
          attempts: number
          binding_id: string | null
          body: string
          channel: string
          created_at: string
          dedupe_key: string
          error_code: string | null
          id: string
          kind: string
          provider_message_id: string | null
          status: Database["public"]["Enums"]["outbound_status"]
          template_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          payload?: Json | null
          attempts?: number
          binding_id?: string | null
          body: string
          channel?: string
          created_at?: string
          dedupe_key: string
          error_code?: string | null
          id?: string
          kind: string
          provider_message_id?: string | null
          status?: Database["public"]["Enums"]["outbound_status"]
          template_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          payload?: Json | null
          attempts?: number
          binding_id?: string | null
          body?: string
          channel?: string
          created_at?: string
          dedupe_key?: string
          error_code?: string | null
          id?: string
          kind?: string
          provider_message_id?: string | null
          status?: Database["public"]["Enums"]["outbound_status"]
          template_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outbound_messages_binding_id_fkey"
            columns: ["binding_id"]
            isOneToOne: false
            referencedRelation: "channel_bindings"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_item_versions: {
        Row: {
          change_kind: string
          changed_via: string
          created_at: string
          id: number
          item_id: string
          reason: string | null
          snapshot: Json
          user_id: string
          version: number
        }
        Insert: {
          change_kind: string
          changed_via?: string
          created_at?: string
          id?: never
          item_id: string
          reason?: string | null
          snapshot: Json
          user_id: string
          version: number
        }
        Update: {
          change_kind?: string
          changed_via?: string
          created_at?: string
          id?: never
          item_id?: string
          reason?: string | null
          snapshot?: Json
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_item_versions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "plan_items"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_items: {
        Row: {
          allowed_alternatives: string | null
          category: Database["public"]["Enums"]["item_category"]
          confirmed_at: string | null
          created_at: string
          evidence_hint: Database["public"]["Enums"]["evidence_hint"]
          id: string
          instructions: string | null
          once_date: string | null
          plan_id: string
          proof_required: boolean
          proof_required_at: string | null
          proof_required_by: string | null
          provenance: Database["public"]["Enums"]["item_provenance"]
          schedule_kind: Database["public"]["Enums"]["schedule_kind"]
          source_document_id: string | null
          source_page: number | null
          source_snippet: string | null
          status: Database["public"]["Enums"]["item_status"]
          stock_count: number | null
          stock_updated_at: string | null
          times: string[]
          title: string
          units_per_dose: number
          unresolved_fields: string[]
          updated_at: string
          user_id: string
          version: number
          weekdays: number[]
          weekly_target: number | null
          window_minutes: number
        }
        Insert: {
          allowed_alternatives?: string | null
          category?: Database["public"]["Enums"]["item_category"]
          confirmed_at?: string | null
          created_at?: string
          evidence_hint?: Database["public"]["Enums"]["evidence_hint"]
          id?: string
          instructions?: string | null
          once_date?: string | null
          plan_id: string
          proof_required?: boolean
          proof_required_at?: string | null
          proof_required_by?: string | null
          provenance?: Database["public"]["Enums"]["item_provenance"]
          schedule_kind?: Database["public"]["Enums"]["schedule_kind"]
          source_document_id?: string | null
          source_page?: number | null
          source_snippet?: string | null
          status?: Database["public"]["Enums"]["item_status"]
          stock_count?: number | null
          stock_updated_at?: string | null
          times?: string[]
          title: string
          units_per_dose?: number
          unresolved_fields?: string[]
          updated_at?: string
          user_id: string
          version?: number
          weekdays?: number[]
          weekly_target?: number | null
          window_minutes?: number
        }
        Update: {
          allowed_alternatives?: string | null
          category?: Database["public"]["Enums"]["item_category"]
          confirmed_at?: string | null
          created_at?: string
          evidence_hint?: Database["public"]["Enums"]["evidence_hint"]
          id?: string
          instructions?: string | null
          once_date?: string | null
          plan_id?: string
          proof_required?: boolean
          proof_required_at?: string | null
          proof_required_by?: string | null
          provenance?: Database["public"]["Enums"]["item_provenance"]
          schedule_kind?: Database["public"]["Enums"]["schedule_kind"]
          source_document_id?: string | null
          source_page?: number | null
          source_snippet?: string | null
          status?: Database["public"]["Enums"]["item_status"]
          stock_count?: number | null
          stock_updated_at?: string | null
          times?: string[]
          title?: string
          units_per_dose?: number
          unresolved_fields?: string[]
          updated_at?: string
          user_id?: string
          version?: number
          weekdays?: number[]
          weekly_target?: number | null
          window_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "care_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_items_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          phone: string | null
          phone_verified_at: string | null
          signup_channel: string
          primary_role: string
          accessibility: Json
          behaviour_prefs_updated_at: string | null
          behaviour_schema_version: number
          care_notes: string | null
          care_recipient_name: string | null
          care_recipient_relation: string | null
          care_situation: string | null
          checkin_times: string[]
          communication_styles: string[]
          conditions: string[]
          created_at: string
          display_name: string | null
          health_context: string | null
          id: string
          is_internal: boolean
          learning_reset_at: string | null
          limitations: string | null
          locale: Database["public"]["Enums"]["app_locale"]
          onboarded_at: string | null
          personal_motivation: string | null
          points_total: number
          quiet_end: string
          quiet_start: string
          reminder_frequency: string
          restart_preference: string | null
          setup_for: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          phone?: string | null
          phone_verified_at?: string | null
          signup_channel?: string
          primary_role?: string
          accessibility?: Json
          behaviour_prefs_updated_at?: string | null
          behaviour_schema_version?: number
          care_notes?: string | null
          care_recipient_name?: string | null
          care_recipient_relation?: string | null
          care_situation?: string | null
          checkin_times?: string[]
          communication_styles?: string[]
          conditions?: string[]
          created_at?: string
          display_name?: string | null
          health_context?: string | null
          id: string
          is_internal?: boolean
          learning_reset_at?: string | null
          limitations?: string | null
          locale?: Database["public"]["Enums"]["app_locale"]
          onboarded_at?: string | null
          personal_motivation?: string | null
          points_total?: number
          quiet_end?: string
          quiet_start?: string
          reminder_frequency?: string
          restart_preference?: string | null
          setup_for?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          phone?: string | null
          phone_verified_at?: string | null
          signup_channel?: string
          primary_role?: string
          accessibility?: Json
          behaviour_prefs_updated_at?: string | null
          behaviour_schema_version?: number
          care_notes?: string | null
          care_recipient_name?: string | null
          care_recipient_relation?: string | null
          care_situation?: string | null
          checkin_times?: string[]
          communication_styles?: string[]
          conditions?: string[]
          created_at?: string
          display_name?: string | null
          health_context?: string | null
          id?: string
          is_internal?: boolean
          learning_reset_at?: string | null
          limitations?: string | null
          locale?: Database["public"]["Enums"]["app_locale"]
          onboarded_at?: string | null
          personal_motivation?: string | null
          points_total?: number
          quiet_end?: string
          quiet_start?: string
          reminder_frequency?: string
          restart_preference?: string | null
          setup_for?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          failures: number
          id: string
          last_success_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          failures?: number
          id?: string
          last_success_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          failures?: number
          id?: string
          last_success_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      review_requests: {
        Row: {
          evidence_id: string | null
          patient_note: string | null
          decision: string | null
          decision_note: string | null
          decided_by: string | null
          decided_at: string | null
          created_at: string
          evaluation_id: string | null
          id: string
          item_id: string | null
          occurrence_id: string | null
          reason: string
          source: string
          status: string
          user_id: string
        }
        Insert: {
          evidence_id?: string | null
          patient_note?: string | null
          decision?: string | null
          decision_note?: string | null
          decided_by?: string | null
          decided_at?: string | null
          created_at?: string
          evaluation_id?: string | null
          id?: string
          item_id?: string | null
          occurrence_id?: string | null
          reason: string
          source?: string
          status?: string
          user_id: string
        }
        Update: {
          evidence_id?: string | null
          patient_note?: string | null
          decision?: string | null
          decision_note?: string | null
          decided_by?: string | null
          decided_at?: string | null
          created_at?: string
          evaluation_id?: string | null
          id?: string
          item_id?: string | null
          occurrence_id?: string | null
          reason?: string
          source?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_requests_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_requests_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "plan_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_requests_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "action_occurrences"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_events: {
        Row: {
          created_at: string
          dedupe_key: string
          id: string
          kind: Database["public"]["Enums"]["reward_kind"]
          label: string
          local_date: string
          occurrence_id: string | null
          points: number
          user_id: string
          week_start: string
        }
        Insert: {
          created_at?: string
          dedupe_key: string
          id?: string
          kind: Database["public"]["Enums"]["reward_kind"]
          label: string
          local_date: string
          occurrence_id?: string | null
          points: number
          user_id: string
          week_start: string
        }
        Update: {
          created_at?: string
          dedupe_key?: string
          id?: string
          kind?: Database["public"]["Enums"]["reward_kind"]
          label?: string
          local_date?: string
          occurrence_id?: string | null
          points?: number
          user_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_events_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "action_occurrences"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_goals: {
        Row: {
          achieved_at: string | null
          active: boolean
          baseline_points: number
          created_at: string
          id: string
          target_points: number
          title: string
          user_id: string
        }
        Insert: {
          achieved_at?: string | null
          active?: boolean
          baseline_points?: number
          created_at?: string
          id?: string
          target_points: number
          title: string
          user_id: string
        }
        Update: {
          achieved_at?: string | null
          active?: boolean
          baseline_points?: number
          created_at?: string
          id?: string
          target_points?: number
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      support_suggestions: {
        Row: {
          applied: Json | null
          barrier_report_id: string | null
          created_at: string
          decided_at: string | null
          expires_at: string
          id: string
          item_id: string
          item_version: number
          kind: string
          nudge_event_id: string | null
          proposal: Json
          status: string
          strategy_id: string
          user_id: string
        }
        Insert: {
          applied?: Json | null
          barrier_report_id?: string | null
          created_at?: string
          decided_at?: string | null
          expires_at?: string
          id?: string
          item_id: string
          item_version: number
          kind: string
          nudge_event_id?: string | null
          proposal?: Json
          status?: string
          strategy_id: string
          user_id: string
        }
        Update: {
          applied?: Json | null
          barrier_report_id?: string | null
          created_at?: string
          decided_at?: string | null
          expires_at?: string
          id?: string
          item_id?: string
          item_version?: number
          kind?: string
          nudge_event_id?: string | null
          proposal?: Json
          status?: string
          strategy_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_suggestions_barrier_report_id_fkey"
            columns: ["barrier_report_id"]
            isOneToOne: false
            referencedRelation: "barrier_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_suggestions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "plan_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_suggestions_nudge_event_id_fkey"
            columns: ["nudge_event_id"]
            isOneToOne: false
            referencedRelation: "nudge_events"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      job_health: {
        Row: {
          expired_leases: number | null
          jobs: number | null
          kind: Database["public"]["Enums"]["job_kind"] | null
          last_update: string | null
          oldest_run_at: string | null
          status: Database["public"]["Enums"]["job_status"] | null
        }
        Relationships: []
      }
    }
    Functions: {
      _award: {
        Args: {
          p_capped: boolean
          p_dedupe: string
          p_kind: Database["public"]["Enums"]["reward_kind"]
          p_label: string
          p_local_date: string
          p_occurrence: string
          p_points: number
          p_user: string
        }
        Returns: Json
      }
      _completion_followups: {
        Args: { p_local_date: string; p_occurrence: string; p_user: string }
        Returns: Json
      }
      accept_family_invite: { Args: { p_token: string }; Returns: Json }
      admin_behaviour_metrics: {
        Args: {
          p_days?: number
          p_exclude_emails?: string[]
          p_include_internal?: boolean
        }
        Returns: Json
      }
      admin_metrics: {
        Args: {
          p_days?: number
          p_exclude_emails?: string[]
          p_include_internal?: boolean
        }
        Returns: Json
      }
      admin_set_internal: {
        Args: { p_internal: boolean; p_user: string }
        Returns: undefined
      }
      apply_check_in_internal: {
        Args: {
          p_channel: Database["public"]["Enums"]["channel_kind"]
          p_idempotency_key: string
          p_kind: Database["public"]["Enums"]["check_in_kind"]
          p_note?: string
          p_occurrence: string
          p_reason?: string
          p_snooze_minutes?: number
          p_user: string
        }
        Returns: Json
      }
      apply_evaluation_internal: {
        Args: { p_evaluation: string }
        Returns: Json
      }
      apply_silence_rule: { Args: { p_limit?: number }; Returns: number }
      cancel_job: {
        Args: { p_job: string; p_reason: string; p_worker: string }
        Returns: boolean
      }
      claim_job: {
        Args: { p_job: string; p_lease_seconds?: number; p_worker: string }
        Returns: {
          attempts: number
          created_at: string
          dedupe_key: string | null
          id: string
          kind: Database["public"]["Enums"]["job_kind"]
          last_error: string | null
          locked_by: string | null
          locked_until: string | null
          max_attempts: number
          payload: Json
          plan_item_version: number | null
          run_at: string
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_jobs: {
        Args: { p_lease_seconds?: number; p_limit?: number; p_worker: string }
        Returns: {
          attempts: number
          created_at: string
          dedupe_key: string | null
          id: string
          kind: Database["public"]["Enums"]["job_kind"]
          last_error: string | null
          locked_by: string | null
          locked_until: string | null
          max_attempts: number
          payload: Json
          plan_item_version: number | null
          run_at: string
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      complete_job: {
        Args: { p_job: string; p_worker: string }
        Returns: boolean
      }
      merge_phone_after_link: {
        Args: { p_phone: string; p_user: string }
        Returns: undefined
      }
      merge_whatsapp_account: {
        Args: { p_dst: string; p_src: string }
        Returns: Json
      }
      consume_link_code: {
        Args: { p_code_hash: string; p_external_id: string }
        Returns: Json
      }
      fail_job: {
        Args: {
          p_error: string
          p_job: string
          p_permanent?: boolean
          p_worker: string
        }
        Returns: Database["public"]["Enums"]["job_status"]
      }
      family_summary: { Args: { p_access: string }; Returns: Json }
      my_circle_ids: { Args: never; Returns: string[] }
      expired_evidence_files: {
        Args: { p_hold_max?: string; p_limit?: number; p_older_than?: string }
        Returns: {
          document_id: string
          name: string
        }[]
      }
      orphan_evidence_videos: {
        Args: { p_limit?: number; p_older_than?: string }
        Returns: {
          name: string
        }[]
      }
      record_check_in: {
        Args: {
          p_idempotency_key: string
          p_kind: Database["public"]["Enums"]["check_in_kind"]
          p_note?: string
          p_occurrence: string
          p_reason?: string
          p_snooze_minutes?: number
        }
        Returns: Json
      }
      touch_activity: { Args: never; Returns: undefined }
    }
    Enums: {
      app_locale: "en" | "hi" | "mr"
      binding_status: "active" | "paused" | "revoked"
      channel_kind: "web" | "whatsapp" | "assistant" | "system"
      check_in_kind: "done" | "later" | "skipped" | "unable" | "missed" | "note"
      clinician_verification: "user_transcribed" | "clinician_verified"
      consent_kind:
        | "ai_processing"
        | "reminders"
        | "whatsapp"
        | "family_sharing"
        | "voice_processing"
      evaluation_method: "rule" | "model" | "manual_review"
      evaluation_outcome:
        | "supports"
        | "partially_supports"
        | "does_not_support"
        | "unclear"
        | "not_applicable"
      evidence_hint: "none" | "photo" | "text" | "any"
      evidence_kind: "photo" | "audio" | "text" | "document" | "video"
      family_status: "invited" | "active" | "revoked" | "expired"
      item_category:
        | "medication"
        | "activity"
        | "measurement"
        | "nutrition"
        | "appointment"
        | "rest"
        | "other"
      item_provenance: "manual" | "extracted" | "template"
      item_status: "draft" | "confirmed" | "paused" | "retired"
      job_kind:
        | "reminder"
        | "process_inbound"
        | "evaluate_evidence"
        | "send_outbound"
        | "generate_occurrences"
        | "apply_silence_rule"
      job_status:
        | "queued"
        | "running"
        | "done"
        | "failed"
        | "dead"
        | "cancelled"
      memory_kind:
        | "preference"
        | "barrier"
        | "context"
        | "open_question"
        | "summary"
      memory_status: "proposed" | "confirmed" | "superseded" | "rejected"
      message_role: "user" | "assistant" | "notice"
      occurrence_status:
        | "pending"
        | "due"
        | "awaiting_response"
        | "later"
        | "self_reported"
        | "evidence_supported"
        | "needs_review"
        | "skipped"
        | "unable"
        | "missed"
        | "paused"
        | "no_response"
      outbound_status:
        | "queued"
        | "sending"
        | "sent"
        | "delivered"
        | "read"
        | "failed"
        | "uncertain"
        | "cancelled"
      plan_mode: "clinician_instructions" | "personal_goal"
      plan_status: "draft" | "active" | "paused" | "archived"
      reward_kind:
        | "participation"
        | "completion"
        | "evidence_bonus"
        | "return"
        | "milestone"
      schedule_kind: "daily" | "weekdays" | "weekly_target" | "once"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_locale: ["en", "hi", "mr"],
      binding_status: ["active", "paused", "revoked"],
      channel_kind: ["web", "whatsapp", "assistant", "system"],
      check_in_kind: ["done", "later", "skipped", "unable", "missed", "note"],
      clinician_verification: ["user_transcribed", "clinician_verified"],
      consent_kind: [
        "ai_processing",
        "reminders",
        "whatsapp",
        "family_sharing",
        "voice_processing",
      ],
      evaluation_method: ["rule", "model", "manual_review"],
      evaluation_outcome: [
        "supports",
        "partially_supports",
        "does_not_support",
        "unclear",
        "not_applicable",
      ],
      evidence_hint: ["none", "photo", "text", "any"],
      evidence_kind: ["photo", "audio", "text", "document", "video"],
      family_status: ["invited", "active", "revoked", "expired"],
      item_category: [
        "medication",
        "activity",
        "measurement",
        "nutrition",
        "appointment",
        "rest",
        "other",
      ],
      item_provenance: ["manual", "extracted", "template"],
      item_status: ["draft", "confirmed", "paused", "retired"],
      job_kind: [
        "reminder",
        "process_inbound",
        "evaluate_evidence",
        "send_outbound",
        "generate_occurrences",
        "apply_silence_rule",
      ],
      job_status: ["queued", "running", "done", "failed", "dead", "cancelled"],
      memory_kind: [
        "preference",
        "barrier",
        "context",
        "open_question",
        "summary",
      ],
      memory_status: ["proposed", "confirmed", "superseded", "rejected"],
      message_role: ["user", "assistant", "notice"],
      occurrence_status: [
        "pending",
        "due",
        "awaiting_response",
        "later",
        "self_reported",
        "evidence_supported",
        "needs_review",
        "skipped",
        "unable",
        "missed",
        "paused",
        "no_response",
      ],
      outbound_status: [
        "queued",
        "sending",
        "sent",
        "delivered",
        "read",
        "failed",
        "uncertain",
        "cancelled",
      ],
      plan_mode: ["clinician_instructions", "personal_goal"],
      plan_status: ["draft", "active", "paused", "archived"],
      reward_kind: [
        "participation",
        "completion",
        "evidence_bonus",
        "return",
        "milestone",
      ],
      schedule_kind: ["daily", "weekdays", "weekly_target", "once"],
    },
  },
} as const

