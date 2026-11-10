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
      care_plans: {
        Row: {
          clinician_name: string | null
          clinician_verification: Database["public"]["Enums"]["clinician_verification"]
          created_at: string
          id: string
          mode: Database["public"]["Enums"]["plan_mode"]
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
          item_id: string
          item_version: number
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
          item_id: string
          item_version: number
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
          item_id?: string
          item_version?: number
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
      documents: {
        Row: {
          bucket: string
          created_at: string
          extraction: Json | null
          extraction_status: string
          id: string
          mime_type: string
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
      outbound_messages: {
        Row: {
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
          provenance: Database["public"]["Enums"]["item_provenance"]
          schedule_kind: Database["public"]["Enums"]["schedule_kind"]
          source_document_id: string | null
          source_page: number | null
          source_snippet: string | null
          status: Database["public"]["Enums"]["item_status"]
          times: string[]
          title: string
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
          provenance?: Database["public"]["Enums"]["item_provenance"]
          schedule_kind?: Database["public"]["Enums"]["schedule_kind"]
          source_document_id?: string | null
          source_page?: number | null
          source_snippet?: string | null
          status?: Database["public"]["Enums"]["item_status"]
          times?: string[]
          title: string
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
          provenance?: Database["public"]["Enums"]["item_provenance"]
          schedule_kind?: Database["public"]["Enums"]["schedule_kind"]
          source_document_id?: string | null
          source_page?: number | null
          source_snippet?: string | null
          status?: Database["public"]["Enums"]["item_status"]
          times?: string[]
          title?: string
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
          accessibility: Json
          care_notes: string | null
          checkin_times: string[]
          created_at: string
          display_name: string | null
          id: string
          limitations: string | null
          locale: Database["public"]["Enums"]["app_locale"]
          onboarded_at: string | null
          quiet_end: string
          quiet_start: string
          reminder_frequency: string
          timezone: string
          updated_at: string
        }
        Insert: {
          accessibility?: Json
          care_notes?: string | null
          checkin_times?: string[]
          created_at?: string
          display_name?: string | null
          id: string
          limitations?: string | null
          locale?: Database["public"]["Enums"]["app_locale"]
          onboarded_at?: string | null
          quiet_end?: string
          quiet_start?: string
          reminder_frequency?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          accessibility?: Json
          care_notes?: string | null
          checkin_times?: string[]
          created_at?: string
          display_name?: string | null
          id?: string
          limitations?: string | null
          locale?: Database["public"]["Enums"]["app_locale"]
          onboarded_at?: string | null
          quiet_end?: string
          quiet_start?: string
          reminder_frequency?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      review_requests: {
        Row: {
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
      evidence_kind: "photo" | "audio" | "text" | "document"
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
      evidence_kind: ["photo", "audio", "text", "document"],
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

