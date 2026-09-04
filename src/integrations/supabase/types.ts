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
      alerts: {
        Row: {
          created_at: string
          detail: string
          id: string
          island_code: string | null
          kind: string
          patient_id: string | null
          resolved: boolean
          severity: string
          title: string
        }
        Insert: {
          created_at?: string
          detail?: string
          id?: string
          island_code?: string | null
          kind: string
          patient_id?: string | null
          resolved?: boolean
          severity?: string
          title: string
        }
        Update: {
          created_at?: string
          detail?: string
          id?: string
          island_code?: string | null
          kind?: string
          patient_id?: string | null
          resolved?: boolean
          severity?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_island_code_fkey"
            columns: ["island_code"]
            isOneToOne: false
            referencedRelation: "islands"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "alerts_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      api_clients: {
        Row: {
          calls_30d: number
          created_at: string
          id: string
          island_code: string | null
          last_used_at: string | null
          name: string
          organisation: string
          scopes: string[]
          status: string
          system_kind: string
          token_prefix: string
        }
        Insert: {
          calls_30d?: number
          created_at?: string
          id?: string
          island_code?: string | null
          last_used_at?: string | null
          name: string
          organisation: string
          scopes?: string[]
          status?: string
          system_kind?: string
          token_prefix?: string
        }
        Update: {
          calls_30d?: number
          created_at?: string
          id?: string
          island_code?: string | null
          last_used_at?: string | null
          name?: string
          organisation?: string
          scopes?: string[]
          status?: string
          system_kind?: string
          token_prefix?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_clients_island_code_fkey"
            columns: ["island_code"]
            isOneToOne: false
            referencedRelation: "islands"
            referencedColumns: ["code"]
          },
        ]
      }
      availability_slots: {
        Row: {
          id: string
          minutes: number
          provider_id: string
          starts_at: string
          status: string
        }
        Insert: {
          id?: string
          minutes?: number
          provider_id: string
          starts_at: string
          status?: string
        }
        Update: {
          id?: string
          minutes?: number
          provider_id?: string
          starts_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_slots_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      break_glass_events: {
        Row: {
          actor_name: string
          actor_tier: string
          expires_at: string
          facility_id: string | null
          id: string
          patient_id: string
          patient_notified_at: string | null
          provider_id: string | null
          reason: string
          review_status: string
          reviewed_at: string | null
          reviewer_note: string
          started_at: string
          user_id: string | null
        }
        Insert: {
          actor_name?: string
          actor_tier?: string
          expires_at?: string
          facility_id?: string | null
          id?: string
          patient_id: string
          patient_notified_at?: string | null
          provider_id?: string | null
          reason: string
          review_status?: string
          reviewed_at?: string | null
          reviewer_note?: string
          started_at?: string
          user_id?: string | null
        }
        Update: {
          actor_name?: string
          actor_tier?: string
          expires_at?: string
          facility_id?: string | null
          id?: string
          patient_id?: string
          patient_notified_at?: string | null
          provider_id?: string | null
          reason?: string
          review_status?: string
          reviewed_at?: string | null
          reviewer_note?: string
          started_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "break_glass_events_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "break_glass_events_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "break_glass_events_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_targets: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          outcome: string
          patient_id: string
          reading_captured: boolean
          reason: string
          responded_at: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          outcome?: string
          patient_id: string
          reading_captured?: boolean
          reason?: string
          responded_at?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          outcome?: string
          patient_id?: string
          reading_captured?: boolean
          reason?: string
          responded_at?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_targets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "screening_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_targets_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      care_team_members: {
        Row: {
          active_from: string
          active_until: string | null
          created_at: string
          encounter_id: string | null
          facility_id: string
          id: string
          patient_id: string
          provider_id: string | null
          tier: string
          user_id: string | null
        }
        Insert: {
          active_from?: string
          active_until?: string | null
          created_at?: string
          encounter_id?: string | null
          facility_id: string
          id?: string
          patient_id: string
          provider_id?: string | null
          tier?: string
          user_id?: string | null
        }
        Update: {
          active_from?: string
          active_until?: string | null
          created_at?: string
          encounter_id?: string | null
          facility_id?: string
          id?: string
          patient_id?: string
          provider_id?: string | null
          tier?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "care_team_members_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_team_members_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_team_members_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_team_members_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_documents: {
        Row: {
          committed: boolean
          created_at: string
          doc_type: string
          extracted: Json
          extraction_note: string
          extraction_status: string
          facility_id: string | null
          id: string
          original_text: string
          record_date: string | null
          record_time: string | null
          patient_id: string | null
          source: string
          storage_path: string | null
          title: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          committed?: boolean
          created_at?: string
          doc_type?: string
          extracted?: Json
          extraction_note?: string
          extraction_status?: string
          facility_id?: string | null
          id?: string
          original_text?: string
          record_date?: string | null
          record_time?: string | null
          patient_id?: string | null
          source?: string
          storage_path?: string | null
          title: string
          updated_at?: string
          uploaded_by?: string
        }
        Update: {
          committed?: boolean
          created_at?: string
          doc_type?: string
          extracted?: Json
          extraction_note?: string
          extraction_status?: string
          facility_id?: string | null
          id?: string
          original_text?: string
          record_date?: string | null
          record_time?: string | null
          patient_id?: string | null
          source?: string
          storage_path?: string | null
          title?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinical_documents_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_documents_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      conditions: {
        Row: {
          diagnosed_on: string
          facility_id: string | null
          id: string
          name: string
          patient_id: string
          sensitivity: string
        }
        Insert: {
          diagnosed_on?: string
          facility_id?: string | null
          id?: string
          name: string
          patient_id: string
          sensitivity?: string
        }
        Update: {
          diagnosed_on?: string
          facility_id?: string | null
          id?: string
          name?: string
          patient_id?: string
          sensitivity?: string
        }
        Relationships: [
          {
            foreignKeyName: "conditions_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conditions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_access_log: {
        Row: {
          accessed_at: string
          actor_name: string | null
          agreement_id: string | null
          allowed: boolean
          basis: string
          break_glass_id: string | null
          facility_id: string | null
          grant_id: string | null
          id: string
          patient_id: string
          provider_id: string | null
          resource: string
          sensitive_category: string | null
          tier: string | null
        }
        Insert: {
          accessed_at?: string
          actor_name?: string | null
          agreement_id?: string | null
          allowed?: boolean
          basis?: string
          break_glass_id?: string | null
          facility_id?: string | null
          grant_id?: string | null
          id?: string
          patient_id: string
          provider_id?: string | null
          resource: string
          sensitive_category?: string | null
          tier?: string | null
        }
        Update: {
          accessed_at?: string
          actor_name?: string | null
          agreement_id?: string | null
          allowed?: boolean
          basis?: string
          break_glass_id?: string | null
          facility_id?: string | null
          grant_id?: string | null
          id?: string
          patient_id?: string
          provider_id?: string | null
          resource?: string
          sensitive_category?: string | null
          tier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consent_access_log_break_glass_id_fkey"
            columns: ["break_glass_id"]
            isOneToOne: false
            referencedRelation: "break_glass_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_access_log_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_access_log_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "consent_grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_access_log_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_access_log_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_grants: {
        Row: {
          created_at: string
          expires_at: string | null
          granted_at: string | null
          id: string
          patient_id: string
          provider_id: string | null
          purpose: string
          scope: string[]
          status: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          granted_at?: string | null
          id?: string
          patient_id: string
          provider_id?: string | null
          purpose?: string
          scope?: string[]
          status?: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          granted_at?: string | null
          id?: string
          patient_id?: string
          provider_id?: string | null
          purpose?: string
          scope?: string[]
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "consent_grants_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_grants_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      cooperative_members: {
        Row: {
          created_at: string
          id: string
          joined_at: string
          patient_id: string
          scope: string[]
          status: string
          withdrawn_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          joined_at?: string
          patient_id: string
          scope?: string[]
          status?: string
          withdrawn_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          joined_at?: string
          patient_id?: string
          scope?: string[]
          status?: string
          withdrawn_at?: string | null
        }
        Relationships: []
      }
      data_requests: {
        Row: {
          cohort: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string
          fee_usd: number
          id: string
          institution: string
          islands: string[]
          purpose: string
          requester_unit: string
          status: string
        }
        Insert: {
          cohort?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string
          fee_usd?: number
          id?: string
          institution: string
          islands?: string[]
          purpose?: string
          requester_unit?: string
          status?: string
        }
        Update: {
          cohort?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string
          fee_usd?: number
          id?: string
          institution?: string
          islands?: string[]
          purpose?: string
          requester_unit?: string
          status?: string
        }
        Relationships: []
      }
      consultations: {
        Row: {
          created_at: string
          escort_asked_at: string | null
          escort_confirmed_at: string | null
          escort_name: string
          escort_reason: string
          escort_relationship: string
          escort_required: boolean
          facility_id: string | null
          id: string
          kind: string
          notes: string
          patient_id: string
          plan: string
          provider_id: string | null
          referral_id: string | null
          scheduled_at: string
          sensitivity: string
          status: string
        }
        Insert: {
          escort_asked_at?: string | null
          escort_confirmed_at?: string | null
          escort_name?: string
          escort_reason?: string
          escort_relationship?: string
          escort_required?: boolean
          created_at?: string
          facility_id?: string | null
          id?: string
          kind?: string
          notes?: string
          patient_id: string
          plan?: string
          provider_id?: string | null
          referral_id?: string | null
          scheduled_at?: string
          sensitivity?: string
          status?: string
        }
        Update: {
          escort_asked_at?: string | null
          escort_confirmed_at?: string | null
          escort_name?: string
          escort_reason?: string
          escort_relationship?: string
          escort_required?: boolean
          created_at?: string
          facility_id?: string | null
          id?: string
          kind?: string
          notes?: string
          patient_id?: string
          plan?: string
          provider_id?: string | null
          referral_id?: string | null
          scheduled_at?: string
          sensitivity?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultations_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultations_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultations_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultations_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
        ]
      }
      data_sharing_agreements: {
        Row: {
          created_at: string
          executed_on: string
          expires_at: string
          from_facility_id: string
          id: string
          patient_opt_out_allowed: boolean
          purpose: string
          reference: string
          review_due_on: string
          scope: string[]
          status: string
          to_facility_id: string
        }
        Insert: {
          created_at?: string
          executed_on?: string
          expires_at: string
          from_facility_id: string
          id?: string
          patient_opt_out_allowed?: boolean
          purpose: string
          reference: string
          review_due_on: string
          scope?: string[]
          status?: string
          to_facility_id: string
        }
        Update: {
          created_at?: string
          executed_on?: string
          expires_at?: string
          from_facility_id?: string
          id?: string
          patient_opt_out_allowed?: boolean
          purpose?: string
          reference?: string
          review_due_on?: string
          scope?: string[]
          status?: string
          to_facility_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_sharing_agreements_from_facility_id_fkey"
            columns: ["from_facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_sharing_agreements_to_facility_id_fkey"
            columns: ["to_facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      detection_signals: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          baseline_value: number | null
          campaign_id: string | null
          current_value: number | null
          delta_pct: number | null
          detected_at: string
          facility_id: string | null
          id: string
          kind: string
          metric: string
          narrative: string
          patient_id: string
          recommended_action: string
          severity: string
          status: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          baseline_value?: number | null
          campaign_id?: string | null
          current_value?: number | null
          delta_pct?: number | null
          detected_at?: string
          facility_id?: string | null
          id?: string
          kind: string
          metric: string
          narrative?: string
          patient_id: string
          recommended_action?: string
          severity?: string
          status?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          baseline_value?: number | null
          campaign_id?: string | null
          current_value?: number | null
          delta_pct?: number | null
          detected_at?: string
          facility_id?: string | null
          id?: string
          kind?: string
          metric?: string
          narrative?: string
          patient_id?: string
          recommended_action?: string
          severity?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "detection_signals_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "screening_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "detection_signals_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "detection_signals_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      encounters: {
        Row: {
          consultation_id: string | null
          created_at: string
          ended_at: string | null
          facility_id: string
          id: string
          kind: string
          patient_id: string
          provider_id: string | null
          reason: string
          sensitivity: string
          started_at: string
          status: string
          summary: string
        }
        Insert: {
          consultation_id?: string | null
          created_at?: string
          ended_at?: string | null
          facility_id: string
          id?: string
          kind?: string
          patient_id: string
          provider_id?: string | null
          reason?: string
          sensitivity?: string
          started_at?: string
          status?: string
          summary?: string
        }
        Update: {
          consultation_id?: string | null
          created_at?: string
          ended_at?: string | null
          facility_id?: string
          id?: string
          kind?: string
          patient_id?: string
          provider_id?: string | null
          reason?: string
          sensitivity?: string
          started_at?: string
          status?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "encounters_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: false
            referencedRelation: "consultations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encounters_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encounters_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encounters_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      facilities: {
        Row: {
          has_imaging: boolean
          has_lab: boolean
          has_pharmacy: boolean
          session_capacity: number
          beds_occupied: number
          beds_total: number
          created_at: string
          continuity_note: string
          continuity_since: string | null
          continuity_status: string
          id: string
          island_code: string
          kind: string
          name: string
        }
        Insert: {
          has_imaging?: boolean
          has_lab?: boolean
          has_pharmacy?: boolean
          session_capacity?: number
          beds_occupied?: number
          beds_total?: number
          created_at?: string
          continuity_note?: string
          continuity_since?: string | null
          continuity_status?: string
          id?: string
          island_code: string
          kind?: string
          name: string
        }
        Update: {
          has_imaging?: boolean
          has_lab?: boolean
          has_pharmacy?: boolean
          session_capacity?: number
          beds_occupied?: number
          beds_total?: number
          created_at?: string
          continuity_note?: string
          continuity_since?: string | null
          continuity_status?: string
          id?: string
          island_code?: string
          kind?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "facilities_island_code_fkey"
            columns: ["island_code"]
            isOneToOne: false
            referencedRelation: "islands"
            referencedColumns: ["code"]
          },
        ]
      }
      facility_staff: {
        Row: {
          created_at: string
          facility_id: string
          full_name: string | null
          id: string
          staff_role: Database["public"]["Enums"]["staff_role"]
          title: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          facility_id: string
          full_name: string | null
          id?: string
          staff_role?: Database["public"]["Enums"]["staff_role"]
          title?: string
          user_id: string | null
        }
        Update: {
          created_at?: string
          facility_id?: string
          full_name?: string | null
          id?: string
          staff_role?: Database["public"]["Enums"]["staff_role"]
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "facility_staff_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      islands: {
        Row: {
          code: string
          country: string
          lat: number
          lng: number
          name: string
          population: number
        }
        Insert: {
          code: string
          country: string
          lat: number
          lng: number
          name: string
          population?: number
        }
        Update: {
          code?: string
          country?: string
          lat?: number
          lng?: number
          name?: string
          population?: number
        }
        Relationships: []
      }
      medications: {
        Row: {
          adherence_pct: number
          days_supply_left: number
          dosage: string
          facility_id: string | null
          frequency: string
          id: string
          last_refill_on: string | null
          name: string
          patient_id: string
          sensitivity: string
        }
        Insert: {
          adherence_pct?: number
          days_supply_left?: number
          dosage?: string
          facility_id?: string | null
          frequency?: string
          id?: string
          last_refill_on?: string | null
          name: string
          patient_id: string
          sensitivity?: string
        }
        Update: {
          adherence_pct?: number
          days_supply_left?: number
          dosage?: string
          facility_id?: string | null
          frequency?: string
          id?: string
          last_refill_on?: string | null
          name?: string
          patient_id?: string
          sensitivity?: string
        }
        Relationships: [
          {
            foreignKeyName: "medications_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medications_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          actions: Json | null
          body: string
          call_seconds: number | null
          channel: string
          created_at: string
          delivered_at: string | null
          direction: string
          id: string
          kind: string
          language: string
          patient_id: string
          queued_offline: boolean
        }
        Insert: {
          actions?: Json | null
          body: string
          call_seconds?: number | null
          channel?: string
          created_at?: string
          delivered_at?: string | null
          direction: string
          id?: string
          kind?: string
          language?: string
          patient_id: string
          queued_offline?: boolean
        }
        Update: {
          actions?: Json | null
          body?: string
          call_seconds?: number | null
          channel?: string
          created_at?: string
          delivered_at?: string | null
          direction?: string
          id?: string
          kind?: string
          language?: string
          patient_id?: string
          queued_offline?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "messages_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          age: number
          created_at: string
          date_of_birth: string | null
          allergies: string[]
          full_name: string
          id: string
          mrn: string | null
          insurer: string | null
          island_code: string
          km_to_facility: number
          language: string
          parish: string
          phone: string
          rural: boolean
          sex: string
        }
        Insert: {
          age: number
          created_at?: string
          date_of_birth?: string | null
          allergies?: string[]
          full_name: string
          id?: string
          mrn?: string | null
          insurer?: string | null
          island_code: string
          km_to_facility?: number
          language?: string
          parish: string
          phone: string
          rural?: boolean
          sex: string
        }
        Update: {
          age?: number
          created_at?: string
          date_of_birth?: string | null
          allergies?: string[]
          full_name?: string
          id?: string
          mrn?: string | null
          insurer?: string | null
          island_code?: string
          km_to_facility?: number
          language?: string
          parish?: string
          phone?: string
          rural?: boolean
          sex?: string
        }
        Relationships: [
          {
            foreignKeyName: "patients_island_code_fkey"
            columns: ["island_code"]
            isOneToOne: false
            referencedRelation: "islands"
            referencedColumns: ["code"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          licence_no: string | null
          verification_status: string | null
          facility_id: string | null
          full_name: string
          id: string
          is_demo: boolean
          island_code: string | null
          onboarded: boolean
          organisation: string | null
          patient_id: string | null
          primary_role: Database["public"]["Enums"]["app_role"]
          provider_id: string | null
          staff_role: Database["public"]["Enums"]["staff_role"] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          licence_no?: string | null
          verification_status?: string | null
          facility_id?: string | null
          full_name?: string
          id: string
          is_demo?: boolean
          island_code?: string | null
          onboarded?: boolean
          organisation?: string | null
          patient_id?: string | null
          primary_role?: Database["public"]["Enums"]["app_role"]
          provider_id?: string | null
          staff_role?: Database["public"]["Enums"]["staff_role"] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          licence_no?: string | null
          verification_status?: string | null
          facility_id?: string | null
          full_name?: string
          id?: string
          is_demo?: boolean
          island_code?: string | null
          onboarded?: boolean
          organisation?: string | null
          patient_id?: string | null
          primary_role?: Database["public"]["Enums"]["app_role"]
          provider_id?: string | null
          staff_role?: Database["public"]["Enums"]["staff_role"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      providers: {
        Row: {
          created_at: string
          facility_id: string | null
          full_name: string
          id: string
          island_code: string
          languages: string[]
          next_local_wait_days: number
          specialty: string
          teleconsult_rate_usd: number
        }
        Insert: {
          created_at?: string
          facility_id?: string | null
          full_name: string
          id?: string
          island_code: string
          languages?: string[]
          next_local_wait_days?: number
          specialty: string
          teleconsult_rate_usd?: number
        }
        Update: {
          created_at?: string
          facility_id?: string | null
          full_name?: string
          id?: string
          island_code?: string
          languages?: string[]
          next_local_wait_days?: number
          specialty?: string
          teleconsult_rate_usd?: number
        }
        Relationships: [
          {
            foreignKeyName: "providers_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "providers_island_code_fkey"
            columns: ["island_code"]
            isOneToOne: false
            referencedRelation: "islands"
            referencedColumns: ["code"]
          },
        ]
      }
      referrals: {
        Row: {
          created_at: string
          cross_island: boolean
          accepted_at: string | null
          accepted_by_provider_id: string | null
          from_facility_id: string | null
          from_provider_id: string | null
          id: string
          patient_id: string
          reason: string
          retained_value_usd: number
          specialty: string
          status: string
          to_provider_id: string | null
          triage_event_id: string | null
          wait_days_local: number
          wait_days_routed: number
        }
        Insert: {
          created_at?: string
          cross_island?: boolean
          accepted_at?: string | null
          accepted_by_provider_id?: string | null
          from_facility_id?: string | null
          from_provider_id?: string | null
          id?: string
          patient_id: string
          reason?: string
          retained_value_usd?: number
          specialty: string
          status?: string
          to_provider_id?: string | null
          triage_event_id?: string | null
          wait_days_local?: number
          wait_days_routed?: number
        }
        Update: {
          created_at?: string
          cross_island?: boolean
          accepted_at?: string | null
          accepted_by_provider_id?: string | null
          from_facility_id?: string | null
          from_provider_id?: string | null
          id?: string
          patient_id?: string
          reason?: string
          retained_value_usd?: number
          specialty?: string
          status?: string
          to_provider_id?: string | null
          triage_event_id?: string | null
          wait_days_local?: number
          wait_days_routed?: number
        }
        Relationships: [
          {
            foreignKeyName: "referrals_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_to_provider_id_fkey"
            columns: ["to_provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_triage_event_id_fkey"
            columns: ["triage_event_id"]
            isOneToOne: false
            referencedRelation: "triage_events"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_scores: {
        Row: {
          band: string
          computed_at: string
          drivers: Json
          id: string
          patient_id: string
          score: number
          trend: string
        }
        Insert: {
          band: string
          computed_at?: string
          drivers?: Json
          id?: string
          patient_id: string
          score: number
          trend?: string
        }
        Update: {
          band?: string
          computed_at?: string
          drivers?: Json
          id?: string
          patient_id?: string
          score?: number
          trend?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_scores_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      screening_campaigns: {
        Row: {
          channel: string
          cohort_rule: Json
          condition_focus: string
          created_at: string
          description: string
          facility_id: string | null
          id: string
          island_code: string | null
          message_template: string
          name: string
          starts_on: string
          status: string
          updated_at: string
        }
        Insert: {
          channel?: string
          cohort_rule?: Json
          condition_focus?: string
          created_at?: string
          description?: string
          facility_id?: string | null
          id?: string
          island_code?: string | null
          message_template?: string
          name: string
          starts_on?: string
          status?: string
          updated_at?: string
        }
        Update: {
          channel?: string
          cohort_rule?: Json
          condition_focus?: string
          created_at?: string
          description?: string
          facility_id?: string | null
          id?: string
          island_code?: string | null
          message_template?: string
          name?: string
          starts_on?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "screening_campaigns_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screening_campaigns_island_code_fkey"
            columns: ["island_code"]
            isOneToOne: false
            referencedRelation: "islands"
            referencedColumns: ["code"]
          },
        ]
      }
      sensitive_grants: {
        Row: {
          category: string
          created_at: string
          expires_at: string | null
          facility_id: string | null
          granted_at: string | null
          id: string
          patient_id: string
          provider_id: string | null
          purpose: string
          status: string
        }
        Insert: {
          category: string
          created_at?: string
          expires_at?: string | null
          facility_id?: string | null
          granted_at?: string | null
          id?: string
          patient_id: string
          provider_id?: string | null
          purpose?: string
          status?: string
        }
        Update: {
          category?: string
          created_at?: string
          expires_at?: string | null
          facility_id?: string | null
          granted_at?: string | null
          id?: string
          patient_id?: string
          provider_id?: string | null
          purpose?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sensitive_grants_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sensitive_grants_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sensitive_grants_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_reviews: {
        Row: {
          created_at: string
          decision: string | null
          detail: string
          evidence: string[]
          finding_key: string
          id: string
          kind: string
          note: string
          patient_id: string
          raised_at: string
          raised_by_id: string | null
          raised_by_name: string
          resolved_at: string | null
          reviewer_id: string | null
          reviewer_name: string | null
          status: string
          tier: string
          title: string
        }
        Insert: {
          created_at?: string
          decision?: string | null
          detail?: string
          evidence?: string[]
          finding_key: string
          id?: string
          kind?: string
          note?: string
          patient_id: string
          raised_at?: string
          raised_by_id?: string | null
          raised_by_name?: string
          resolved_at?: string | null
          reviewer_id?: string | null
          reviewer_name?: string | null
          status?: string
          tier?: string
          title?: string
        }
        Update: {
          created_at?: string
          decision?: string | null
          detail?: string
          evidence?: string[]
          finding_key?: string
          id?: string
          kind?: string
          note?: string
          patient_id?: string
          raised_at?: string
          raised_by_id?: string | null
          raised_by_name?: string
          resolved_at?: string | null
          reviewer_id?: string | null
          reviewer_name?: string | null
          status?: string
          tier?: string
          title?: string
        }
        Relationships: []
      }
      discharges: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by_provider_id: string | null
          created_at: string
          discharged_at: string
          discharged_by_provider_id: string | null
          encounter_id: string | null
          follow_up_days: number
          from_facility_id: string
          id: string
          medication_changes: string
          patient_id: string
          summary: string
          to_facility_id: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by_provider_id?: string | null
          created_at?: string
          discharged_at?: string
          discharged_by_provider_id?: string | null
          encounter_id?: string | null
          follow_up_days?: number
          from_facility_id?: string
          id?: string
          medication_changes?: string
          patient_id?: string
          summary?: string
          to_facility_id?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by_provider_id?: string | null
          created_at?: string
          discharged_at?: string
          discharged_by_provider_id?: string | null
          encounter_id?: string | null
          follow_up_days?: number
          from_facility_id?: string
          id?: string
          medication_changes?: string
          patient_id?: string
          summary?: string
          to_facility_id?: string | null
        }
        Relationships: []
      }
      lab_results: {
        Row: {
          collected_at: string
          created_at: string
          facility_id: string | null
          id: string
          abnormal: boolean
          ordered_by_provider_id: string | null
          patient_id: string
          test_code: string
          test_name: string
          unit: string
          value: string
        }
        Insert: {
          collected_at?: string
          created_at?: string
          facility_id?: string | null
          id?: string
          abnormal?: boolean
          ordered_by_provider_id?: string | null
          patient_id: string
          test_code: string
          test_name?: string
          unit?: string
          value?: string
        }
        Update: {
          collected_at?: string
          created_at?: string
          facility_id?: string | null
          id?: string
          abnormal?: boolean
          ordered_by_provider_id?: string | null
          patient_id?: string
          test_code?: string
          test_name?: string
          unit?: string
          value?: string
        }
        Relationships: []
      }
      stock_items: {
        Row: {
          days_cover: number
          facility_id: string
          id: string
          medication_name: string
          on_hand: number
          status: string
        }
        Insert: {
          days_cover?: number
          facility_id: string
          id?: string
          medication_name: string
          on_hand?: number
          status?: string
        }
        Update: {
          days_cover?: number
          facility_id?: string
          id?: string
          medication_name?: string
          on_hand?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_items_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      treating_window_policies: {
        Row: {
          days: number
          facility_kind: string
          label: string
          rationale: string
        }
        Insert: {
          days: number
          facility_kind: string
          label: string
          rationale?: string
        }
        Update: {
          days?: number
          facility_kind?: string
          label?: string
          rationale?: string
        }
        Relationships: []
      }
      triage_events: {
        Row: {
          category: string
          confidence: number
          created_at: string
          id: string
          message_id: string | null
          patient_id: string
          rationale: string
          recommended_level: string
          red_flags: string[]
          severity: string
        }
        Insert: {
          category: string
          confidence?: number
          created_at?: string
          id?: string
          message_id?: string | null
          patient_id: string
          rationale?: string
          recommended_level: string
          red_flags?: string[]
          severity: string
        }
        Update: {
          category?: string
          confidence?: number
          created_at?: string
          id?: string
          message_id?: string | null
          patient_id?: string
          rationale?: string
          recommended_level?: string
          red_flags?: string[]
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "triage_events_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "triage_events_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workflow_events: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          created_at: string
          detail: string | null
          id: string
          label: string | null
          patient_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          label?: string | null
          patient_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          label?: string | null
          patient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_events_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      vitals: {
        Row: {
          device: string | null
          diastolic: number | null
          facility_id: string | null
          glucose_mmol: number | null
          id: string
          measured_at: string
          patient_id: string
          pulse: number | null
          reported_by: string
          source: string
          systolic: number | null
          weight_kg: number | null
        }
        Insert: {
          device?: string | null
          diastolic?: number | null
          facility_id?: string | null
          glucose_mmol?: number | null
          id?: string
          measured_at?: string
          patient_id: string
          pulse?: number | null
          reported_by?: string
          source?: string
          systolic?: number | null
          weight_kg?: number | null
        }
        Update: {
          device?: string | null
          diastolic?: number | null
          facility_id?: string | null
          glucose_mmol?: number | null
          id?: string
          measured_at?: string
          patient_id?: string
          pulse?: number | null
          reported_by?: string
          source?: string
          systolic?: number | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vitals_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vitals_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_staff_see_patient: {
        Args: { _patient_id: string; _user_id: string }
        Returns: boolean
      }
      compute_risk: {
        Args: { p_patient: string }
        Returns: {
          band: string
          drivers: Json
          score: number
          trend: string
        }[]
      }
      detect_trend: {
        Args: { p_patient: string }
        Returns: {
          baseline_value: number
          current_value: number
          delta_pct: number
          metric: string
          narrative: string
          recommended_action: string
          severity: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      patient_facility_ids: { Args: { _patient_id: string }; Returns: string[] }
      staff_facility_ids: { Args: { _user_id: string }; Returns: string[] }
    }
    Enums: {
      app_role: "patient" | "clinician" | "ministry" | "insurer" | "admin"
      staff_role: "doctor" | "nurse" | "front_desk" | "org_admin"
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
      app_role: ["patient", "clinician", "ministry", "insurer", "admin"],
      staff_role: ["doctor", "nurse", "front_desk", "org_admin"],
    },
  },
} as const
