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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      achievements: {
        Row: {
          achieved_at: string
          created_at: string
          id: string
          profile_id: string
          rating: number | null
          task_id: string | null
          title: string
          title_ar: string | null
          workspace_id: string | null
        }
        Insert: {
          achieved_at?: string
          created_at?: string
          id?: string
          profile_id: string
          rating?: number | null
          task_id?: string | null
          title: string
          title_ar?: string | null
          workspace_id?: string | null
        }
        Update: {
          achieved_at?: string
          created_at?: string
          id?: string
          profile_id?: string
          rating?: number | null
          task_id?: string | null
          title?: string
          title_ar?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "achievements_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "achievements_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "achievements_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_type: Database["public"]["Enums"]["actor_type"]
          agent_run_id: string | null
          created_at: string
          id: string
          reason: string | null
          subject_id: string | null
          summary: string
          summary_ar: string | null
          task_id: string | null
          undo_payload: Json | null
          undoable: boolean
          undone_at: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_type?: Database["public"]["Enums"]["actor_type"]
          agent_run_id?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          subject_id?: string | null
          summary: string
          summary_ar?: string | null
          task_id?: string | null
          undo_payload?: Json | null
          undoable?: boolean
          undone_at?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_type?: Database["public"]["Enums"]["actor_type"]
          agent_run_id?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          subject_id?: string | null
          summary?: string
          summary_ar?: string | null
          task_id?: string | null
          undo_payload?: Json | null
          undoable?: boolean
          undone_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_agent_run_fk"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          agent_id: string
          dry_run: boolean
          finished_at: string | null
          id: string
          output: Json
          started_at: string
          status: Database["public"]["Enums"]["agent_run_status"]
          undone_at: string | null
        }
        Insert: {
          agent_id: string
          dry_run?: boolean
          finished_at?: string | null
          id?: string
          output?: Json
          started_at?: string
          status?: Database["public"]["Enums"]["agent_run_status"]
          undone_at?: string | null
        }
        Update: {
          agent_id?: string
          dry_run?: boolean
          finished_at?: string | null
          id?: string
          output?: Json
          started_at?: string
          status?: Database["public"]["Enums"]["agent_run_status"]
          undone_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          autonomy: Database["public"]["Enums"]["agent_autonomy"]
          created_at: string
          enabled: boolean
          id: string
          last_run_at: string | null
          name: string
          owner_id: string
          prompt: string
          recipe: Json
          run_count: number
          schedule: string | null
          updated_at: string
        }
        Insert: {
          autonomy?: Database["public"]["Enums"]["agent_autonomy"]
          created_at?: string
          enabled?: boolean
          id?: string
          last_run_at?: string | null
          name: string
          owner_id: string
          prompt: string
          recipe?: Json
          run_count?: number
          schedule?: string | null
          updated_at?: string
        }
        Update: {
          autonomy?: Database["public"]["Enums"]["agent_autonomy"]
          created_at?: string
          enabled?: boolean
          id?: string
          last_run_at?: string | null
          name?: string
          owner_id?: string
          prompt?: string
          recipe?: Json
          run_count?: number
          schedule?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agents_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      decisions: {
        Row: {
          created_at: string
          details: Json
          id: string
          manager_id: string
          recommendation: string | null
          recommendation_ar: string | null
          recommendation_reason: string | null
          requested_by: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["decision_status"]
          task_id: string | null
          title: string
          title_ar: string | null
          type: Database["public"]["Enums"]["decision_type"]
        }
        Insert: {
          created_at?: string
          details?: Json
          id?: string
          manager_id: string
          recommendation?: string | null
          recommendation_ar?: string | null
          recommendation_reason?: string | null
          requested_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["decision_status"]
          task_id?: string | null
          title: string
          title_ar?: string | null
          type: Database["public"]["Enums"]["decision_type"]
        }
        Update: {
          created_at?: string
          details?: Json
          id?: string
          manager_id?: string
          recommendation?: string | null
          recommendation_ar?: string | null
          recommendation_reason?: string | null
          requested_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["decision_status"]
          task_id?: string | null
          title?: string
          title_ar?: string | null
          type?: Database["public"]["Enums"]["decision_type"]
        }
        Relationships: [
          {
            foreignKeyName: "decisions_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence: {
        Row: {
          created_at: string
          duration_seconds: number | null
          id: string
          mime_type: string | null
          storage_path: string | null
          task_id: string
          title: string | null
          type: Database["public"]["Enums"]["evidence_type"]
          uploaded_by: string | null
          url: string | null
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          id?: string
          mime_type?: string | null
          storage_path?: string | null
          task_id: string
          title?: string | null
          type: Database["public"]["Enums"]["evidence_type"]
          uploaded_by?: string | null
          url?: string | null
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          id?: string
          mime_type?: string | null
          storage_path?: string | null
          task_id?: string
          title?: string | null
          type?: Database["public"]["Enums"]["evidence_type"]
          uploaded_by?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evidence_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      followups: {
        Row: {
          channel: Database["public"]["Enums"]["followup_channel"]
          created_at: string
          id: string
          message: string
          message_ar: string | null
          recipient_id: string | null
          scheduled_at: string
          sent_at: string | null
          status: Database["public"]["Enums"]["followup_status"]
          task_id: string
        }
        Insert: {
          channel?: Database["public"]["Enums"]["followup_channel"]
          created_at?: string
          id?: string
          message: string
          message_ar?: string | null
          recipient_id?: string | null
          scheduled_at: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["followup_status"]
          task_id: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["followup_channel"]
          created_at?: string
          id?: string
          message?: string
          message_ar?: string | null
          recipient_id?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["followup_status"]
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "followups_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followups_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_prefs: {
        Row: {
          channels: Json
          escalation: Json
          profile_id: string
          quiet_hours: Json
          rules: Json
          updated_at: string
        }
        Insert: {
          channels?: Json
          escalation?: Json
          profile_id: string
          quiet_hours?: Json
          rules?: Json
          updated_at?: string
        }
        Update: {
          channels?: Json
          escalation?: Json
          profile_id?: string
          quiet_hours?: Json
          rules?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_prefs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_color: string | null
          created_at: string
          full_name: string
          full_name_ar: string | null
          id: string
          locale: string
          manager_id: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          skills: string[]
          title: string | null
          title_ar: string | null
          updated_at: string
          user_id: string | null
          weekly_capacity_hours: number
        }
        Insert: {
          avatar_color?: string | null
          created_at?: string
          full_name: string
          full_name_ar?: string | null
          id?: string
          locale?: string
          manager_id?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          skills?: string[]
          title?: string | null
          title_ar?: string | null
          updated_at?: string
          user_id?: string | null
          weekly_capacity_hours?: number
        }
        Update: {
          avatar_color?: string | null
          created_at?: string
          full_name?: string
          full_name_ar?: string | null
          id?: string
          locale?: string
          manager_id?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          skills?: string[]
          title?: string | null
          title_ar?: string | null
          updated_at?: string
          user_id?: string | null
          weekly_capacity_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "profiles_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          created_at: string
          criteria: string[]
          decided_at: string | null
          decision: Database["public"]["Enums"]["review_decision"] | null
          id: string
          note: string | null
          rating: number | null
          reviewer_id: string | null
          round: number
          submission_note: string | null
          submitted_by: string | null
          task_id: string
        }
        Insert: {
          created_at?: string
          criteria?: string[]
          decided_at?: string | null
          decision?: Database["public"]["Enums"]["review_decision"] | null
          id?: string
          note?: string | null
          rating?: number | null
          reviewer_id?: string | null
          round?: number
          submission_note?: string | null
          submitted_by?: string | null
          task_id: string
        }
        Update: {
          created_at?: string
          criteria?: string[]
          decided_at?: string | null
          decision?: Database["public"]["Enums"]["review_decision"] | null
          id?: string
          note?: string | null
          rating?: number | null
          reviewer_id?: string | null
          round?: number
          submission_note?: string | null
          submitted_by?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          config: Json
          created_at: string
          id: string
          owner_id: string
          status: Database["public"]["Enums"]["source_status"]
          today_count: number
          type: Database["public"]["Enums"]["source_type"]
          updated_at: string
          waitlist: boolean
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          owner_id: string
          status?: Database["public"]["Enums"]["source_status"]
          today_count?: number
          type: Database["public"]["Enums"]["source_type"]
          updated_at?: string
          waitlist?: boolean
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          owner_id?: string
          status?: Database["public"]["Enums"]["source_status"]
          today_count?: number
          type?: Database["public"]["Enums"]["source_type"]
          updated_at?: string
          waitlist?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "sources_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subtasks: {
        Row: {
          created_at: string
          done: boolean
          id: string
          owner_id: string | null
          position: number
          task_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          done?: boolean
          id?: string
          owner_id?: string | null
          position?: number
          task_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          done?: boolean
          id?: string
          owner_id?: string | null
          position?: number
          task_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subtasks_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subtasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigner_id: string
          budget: string | null
          clarity_score: number
          closed_at: string | null
          created_at: string
          definition_of_done: string | null
          description: string | null
          due_at: string | null
          estimate_hours: number | null
          expected_close_at: string | null
          goal: string | null
          helper_id: string | null
          id: string
          owner_id: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          progress: number
          source: Database["public"]["Enums"]["task_source"]
          source_ref: string | null
          start_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          assigner_id: string
          budget?: string | null
          clarity_score?: number
          closed_at?: string | null
          created_at?: string
          definition_of_done?: string | null
          description?: string | null
          due_at?: string | null
          estimate_hours?: number | null
          expected_close_at?: string | null
          goal?: string | null
          helper_id?: string | null
          id?: string
          owner_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          progress?: number
          source?: Database["public"]["Enums"]["task_source"]
          source_ref?: string | null
          start_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          assigner_id?: string
          budget?: string | null
          clarity_score?: number
          closed_at?: string | null
          created_at?: string
          definition_of_done?: string | null
          description?: string | null
          due_at?: string | null
          estimate_hours?: number | null
          expected_close_at?: string | null
          goal?: string | null
          helper_id?: string | null
          id?: string
          owner_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          progress?: number
          source?: Database["public"]["Enums"]["task_source"]
          source_ref?: string | null
          start_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigner_id_fkey"
            columns: ["assigner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_helper_id_fkey"
            columns: ["helper_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          profile_id: string
          role: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          profile_id: string
          role?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          profile_id?: string
          role?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          color: string | null
          created_at: string
          goal: string | null
          id: string
          name: string
          name_ar: string | null
          owner_id: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          goal?: string | null
          id?: string
          name: string
          name_ar?: string | null
          owner_id: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          goal?: string | null
          id?: string
          name?: string
          name_ar?: string | null
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_see_profile: { Args: { target: string }; Returns: boolean }
      can_see_task: { Args: { t_id: string }; Returns: boolean }
      can_see_workspace: { Args: { w_id: string }; Returns: boolean }
      current_profile_id: { Args: never; Returns: string }
      evidence_task_id: { Args: { object_name: string }; Returns: string }
      is_manager_of: { Args: { target: string }; Returns: boolean }
    }
    Enums: {
      actor_type: "muntej" | "user" | "agent"
      agent_autonomy: "ask_first" | "always_run"
      agent_run_status: "running" | "success" | "failed" | "dry_run"
      decision_status: "pending" | "approved" | "declined" | "expired"
      decision_type:
        | "extension_request"
        | "delay_risk"
        | "ambiguous_reply"
        | "reassignment"
        | "priority_question"
      evidence_type: "file" | "image" | "voice" | "link"
      followup_channel: "push" | "in_app" | "whatsapp" | "email"
      followup_status:
        | "scheduled"
        | "sent"
        | "replied"
        | "skipped"
        | "cancelled"
        | "failed"
      review_decision: "approved" | "sent_back"
      source_status: "connected" | "disconnected" | "coming_soon" | "error"
      source_type:
        | "whatsapp"
        | "email"
        | "meeting"
        | "teams"
        | "slack"
        | "google_chat"
        | "jira"
        | "azure_devops"
        | "sticky_note"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_source:
        | "voice"
        | "text"
        | "whatsapp"
        | "email"
        | "meeting"
        | "teams"
        | "slack"
        | "google_chat"
        | "jira"
        | "azure_devops"
        | "sticky_note"
        | "agent"
      task_status:
        | "draft"
        | "assigned"
        | "in_progress"
        | "blocked"
        | "submitted"
        | "returned"
        | "done"
        | "cancelled"
      user_role: "manager" | "employee"
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
      actor_type: ["muntej", "user", "agent"],
      agent_autonomy: ["ask_first", "always_run"],
      agent_run_status: ["running", "success", "failed", "dry_run"],
      decision_status: ["pending", "approved", "declined", "expired"],
      decision_type: [
        "extension_request",
        "delay_risk",
        "ambiguous_reply",
        "reassignment",
        "priority_question",
      ],
      evidence_type: ["file", "image", "voice", "link"],
      followup_channel: ["push", "in_app", "whatsapp", "email"],
      followup_status: [
        "scheduled",
        "sent",
        "replied",
        "skipped",
        "cancelled",
        "failed",
      ],
      review_decision: ["approved", "sent_back"],
      source_status: ["connected", "disconnected", "coming_soon", "error"],
      source_type: [
        "whatsapp",
        "email",
        "meeting",
        "teams",
        "slack",
        "google_chat",
        "jira",
        "azure_devops",
        "sticky_note",
      ],
      task_priority: ["low", "medium", "high", "urgent"],
      task_source: [
        "voice",
        "text",
        "whatsapp",
        "email",
        "meeting",
        "teams",
        "slack",
        "google_chat",
        "jira",
        "azure_devops",
        "sticky_note",
        "agent",
      ],
      task_status: [
        "draft",
        "assigned",
        "in_progress",
        "blocked",
        "submitted",
        "returned",
        "done",
        "cancelled",
      ],
      user_role: ["manager", "employee"],
    },
  },
} as const
