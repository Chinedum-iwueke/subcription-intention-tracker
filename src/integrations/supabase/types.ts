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
      commit_profiles: {
        Row: {
          owner_id: string
          reminder_governance: Json
          settings: Json
          updated_at: string
          version: number
        }
        Insert: {
          owner_id: string
          reminder_governance?: Json
          settings?: Json
          updated_at?: string
          version?: number
        }
        Update: {
          owner_id?: string
          reminder_governance?: Json
          settings?: Json
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      commit_reminder_jobs: {
        Row: {
          action_date: string
          action_kind: string
          attempts: number
          channel: string
          commitment_id: string
          commitment_version: number
          created_at: string
          delivered_at: string | null
          id: string
          last_error: string | null
          lease_expires_at: string | null
          owner_id: string
          sent_at: string | null
          status: Database["public"]["Enums"]["commit_reminder_status"]
          updated_at: string
        }
        Insert: {
          action_date: string
          action_kind: string
          attempts?: number
          channel: string
          commitment_id: string
          commitment_version: number
          created_at?: string
          delivered_at?: string | null
          id?: string
          last_error?: string | null
          lease_expires_at?: string | null
          owner_id: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["commit_reminder_status"]
          updated_at?: string
        }
        Update: {
          action_date?: string
          action_kind?: string
          attempts?: number
          channel?: string
          commitment_id?: string
          commitment_version?: number
          created_at?: string
          delivered_at?: string | null
          id?: string
          last_error?: string | null
          lease_expires_at?: string | null
          owner_id?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["commit_reminder_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commit_reminder_jobs_owner_id_commitment_id_fkey"
            columns: ["owner_id", "commitment_id"]
            isOneToOne: false
            referencedRelation: "commitments"
            referencedColumns: ["owner_id", "id"]
          },
        ]
      }
      commit_reminder_webhook_events: {
        Row: {
          event_type: string
          id: string
          message_id: string | null
          payload: Json
          provider: string
          received_at: string
        }
        Insert: {
          event_type: string
          id?: string
          message_id?: string | null
          payload: Json
          provider: string
          received_at?: string
        }
        Update: {
          event_type?: string
          id?: string
          message_id?: string | null
          payload?: Json
          provider?: string
          received_at?: string
        }
        Relationships: []
      }
      commitments: {
        Row: {
          body: Json
          id: string
          owner_id: string
          updated_at: string
          version: number
        }
        Insert: {
          body: Json
          id: string
          owner_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          body?: Json
          id?: string
          owner_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      evidence_artifacts: {
        Row: {
          captured_at: string
          commitment_id: string | null
          deleted_at: string | null
          id: string
          object_path: string
          origin: string
          owner_id: string
          retain_until: string | null
          sha256: string | null
        }
        Insert: {
          captured_at?: string
          commitment_id?: string | null
          deleted_at?: string | null
          id?: string
          object_path: string
          origin: string
          owner_id: string
          retain_until?: string | null
          sha256?: string | null
        }
        Update: {
          captured_at?: string
          commitment_id?: string | null
          deleted_at?: string | null
          id?: string
          object_path?: string
          origin?: string
          owner_id?: string
          retain_until?: string | null
          sha256?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evidence_artifacts_owner_id_commitment_id_fkey"
            columns: ["owner_id", "commitment_id"]
            isOneToOne: false
            referencedRelation: "commitments"
            referencedColumns: ["owner_id", "id"]
          },
        ]
      }
      review_candidates: {
        Row: {
          body: Json
          id: string
          owner_id: string
          updated_at: string
          version: number
        }
        Insert: {
          body: Json
          id: string
          owner_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          body?: Json
          id?: string
          owner_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_commit_candidate: {
        Args: {
          p_candidate_body: Json
          p_candidate_id: string
          p_commitment_body: Json
          p_commitment_id: string
          p_expected_candidate_version: number
        }
        Returns: undefined
      }
      apply_commit_candidate_update: {
        Args: {
          p_candidate_body: Json
          p_candidate_id: string
          p_commitment_body: Json
          p_commitment_id: string
          p_expected_candidate_version: number
          p_expected_commitment_version: number
        }
        Returns: undefined
      }
      apply_commit_extraction: {
        Args: { p_items: Json; p_source_path: string }
        Returns: number
      }
      cancel_commit_extraction: {
        Args: { p_source_path: string }
        Returns: undefined
      }
      claim_commit_reminders: {
        Args: { p_batch_size?: number }
        Returns: {
          action_date: string
          action_kind: string
          channel: string
          commitment_id: string
          commitment_version: number
          id: string
          owner_id: string
        }[]
      }
      commit_preserves_tail: {
        Args: { p_new: Json; p_old: Json }
        Returns: boolean
      }
      delete_my_commit_account: { Args: never; Returns: undefined }
      delete_unreviewed_commit_evidence: {
        Args: { p_candidate_id: string; p_path: string }
        Returns: undefined
      }
      mark_commit_evidence_expired: { Args: never; Returns: number }
      rebuild_commit_reminders_for: {
        Args: {
          p_body: Json
          p_commitment_id: string
          p_owner: string
          p_version: number
        }
        Returns: undefined
      }
      register_commit_evidence: {
        Args: {
          p_candidate_body: Json
          p_candidate_id: string
          p_origin: string
          p_path: string
          p_retention_days: number
          p_sha256: string
        }
        Returns: string
      }
      save_commit_profile: {
        Args: { p_expected_version: number; p_settings: Json }
        Returns: number
      }
      save_commitment: {
        Args: { p_body: Json; p_expected_version: number; p_id: string }
        Returns: number
      }
      save_review_candidate: {
        Args: { p_body: Json; p_expected_version: number; p_id: string }
        Returns: number
      }
      snooze_commit_reminder: {
        Args: { p_days: number; p_job_id: string }
        Returns: string
      }
    }
    Enums: {
      commit_reminder_status:
        | "queued"
        | "leased"
        | "provider_accepted"
        | "delivered"
        | "delivery_delayed"
        | "bounced"
        | "complained"
        | "failed"
        | "suppressed"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      commit_reminder_status: [
        "queued",
        "leased",
        "provider_accepted",
        "delivered",
        "delivery_delayed",
        "bounced",
        "complained",
        "failed",
        "suppressed",
      ],
    },
  },
} as const
