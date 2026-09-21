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
          settings: Json
          updated_at: string
          version: number
        }
        Insert: {
          owner_id: string
          settings?: Json
          updated_at?: string
          version?: number
        }
        Update: {
          owner_id?: string
          settings?: Json
          updated_at?: string
          version?: number
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
      commit_preserves_tail: {
        Args: { p_new: Json; p_old: Json }
        Returns: boolean
      }
      delete_my_commit_account: { Args: never; Returns: undefined }
      delete_unreviewed_commit_evidence: {
        Args: { p_candidate_id: string; p_path: string }
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
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
