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
      account_sessions: {
        Row: {
          account_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_sessions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          name_ar: string | null
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          name_ar?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          name_ar?: string | null
          status?: string
        }
        Relationships: []
      }
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
      alerts: {
        Row: {
          body: string
          body_ar: string | null
          created_at: string
          dedupe_key: string
          deliver_after: string | null
          delivered_at: string | null
          id: string
          kind: string
          profile_id: string
          read_at: string | null
          sent_push: boolean
          sent_whatsapp: boolean
          subject_id: string | null
          task_id: string | null
          title: string
          title_ar: string | null
          whatsapp_status: string | null
        }
        Insert: {
          body: string
          body_ar?: string | null
          created_at?: string
          dedupe_key: string
          deliver_after?: string | null
          delivered_at?: string | null
          id?: string
          kind: string
          profile_id: string
          read_at?: string | null
          sent_push?: boolean
          sent_whatsapp?: boolean
          subject_id?: string | null
          task_id?: string | null
          title: string
          title_ar?: string | null
          whatsapp_status?: string | null
        }
        Update: {
          body?: string
          body_ar?: string | null
          created_at?: string
          dedupe_key?: string
          deliver_after?: string | null
          delivered_at?: string | null
          id?: string
          kind?: string
          profile_id?: string
          read_at?: string | null
          sent_push?: boolean
          sent_whatsapp?: boolean
          subject_id?: string | null
          task_id?: string | null
          title?: string
          title_ar?: string | null
          whatsapp_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alerts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      autopilot_marks: {
        Row: {
          created_at: string
          key: string
          profile_id: string | null
          task_id: string | null
        }
        Insert: {
          created_at?: string
          key: string
          profile_id?: string | null
          task_id?: string | null
        }
        Update: {
          created_at?: string
          key?: string
          profile_id?: string | null
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "autopilot_marks_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "autopilot_marks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      autopilot_prefs: {
        Row: {
          auto_approve_days: number
          chase_reminders: number
          profile_id: string
          rules: Json
          updated_at: string
        }
        Insert: {
          auto_approve_days?: number
          chase_reminders?: number
          profile_id: string
          rules?: Json
          updated_at?: string
        }
        Update: {
          auto_approve_days?: number
          chase_reminders?: number
          profile_id?: string
          rules?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "autopilot_prefs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          action: string
          content: string
          created_at: string
          id: string
          payload: Json | null
          profile_id: string
          role: string
          task_id: string | null
        }
        Insert: {
          action?: string
          content: string
          created_at?: string
          id?: string
          payload?: Json | null
          profile_id: string
          role: string
          task_id?: string | null
        }
        Update: {
          action?: string
          content?: string
          created_at?: string
          id?: string
          payload?: Json | null
          profile_id?: string
          role?: string
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_moments: {
        Row: {
          acted: boolean
          key: string
          profile_id: string
          shown_at: string
        }
        Insert: {
          acted?: boolean
          key: string
          profile_id: string
          shown_at?: string
        }
        Update: {
          acted?: boolean
          key?: string
          profile_id?: string
          shown_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_moments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      connection_secrets: {
        Row: {
          connection_id: string
          data: string
          updated_at: string
        }
        Insert: {
          connection_id: string
          data: string
          updated_at?: string
        }
        Update: {
          connection_id?: string
          data?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "connection_secrets_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: true
            referencedRelation: "connections"
            referencedColumns: ["id"]
          },
        ]
      }
      connections: {
        Row: {
          account_label: string | null
          created_at: string
          cursor: Json
          export_on: boolean
          export_target: Json | null
          found_day: string | null
          found_today: number
          id: string
          import_on: boolean
          last_error: string | null
          last_sync_at: string | null
          profile_id: string
          provider: string
          status: string
          updated_at: string
        }
        Insert: {
          account_label?: string | null
          created_at?: string
          cursor?: Json
          export_on?: boolean
          export_target?: Json | null
          found_day?: string | null
          found_today?: number
          id?: string
          import_on?: boolean
          last_error?: string | null
          last_sync_at?: string | null
          profile_id: string
          provider: string
          status?: string
          updated_at?: string
        }
        Update: {
          account_label?: string | null
          created_at?: string
          cursor?: Json
          export_on?: boolean
          export_target?: Json | null
          found_day?: string | null
          found_today?: number
          id?: string
          import_on?: boolean
          last_error?: string | null
          last_sync_at?: string | null
          profile_id?: string
          provider?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "connections_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_summaries: {
        Row: {
          channels: string[]
          day: string
          kind: string
          profile_id: string
          sent_at: string
        }
        Insert: {
          channels?: string[]
          day: string
          kind?: string
          profile_id: string
          sent_at?: string
        }
        Update: {
          channels?: string[]
          day?: string
          kind?: string
          profile_id?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_summaries_profile_id_fkey"
            columns: ["profile_id"]
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
      feature_events: {
        Row: {
          adopted_at: string | null
          feature_key: string
          later_count: number
          profile_id: string
          seen_at: string | null
          state: string
          tried_at: string | null
          updated_at: string
        }
        Insert: {
          adopted_at?: string | null
          feature_key: string
          later_count?: number
          profile_id: string
          seen_at?: string | null
          state: string
          tried_at?: string | null
          updated_at?: string
        }
        Update: {
          adopted_at?: string | null
          feature_key?: string
          later_count?: number
          profile_id?: string
          seen_at?: string | null
          state?: string
          tried_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_events_feature_key_fkey"
            columns: ["feature_key"]
            isOneToOne: false
            referencedRelation: "features"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "feature_events_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      features: {
        Row: {
          audience: string
          benefit: string
          benefit_ar: string
          key: string
          released_at: string
          sort: number
          title: string
          title_ar: string
        }
        Insert: {
          audience?: string
          benefit: string
          benefit_ar: string
          key: string
          released_at?: string
          sort?: number
          title: string
          title_ar: string
        }
        Update: {
          audience?: string
          benefit?: string
          benefit_ar?: string
          key?: string
          released_at?: string
          sort?: number
          title?: string
          title_ar?: string
        }
        Relationships: []
      }
      feedback: {
        Row: {
          account_id: string
          comment: string | null
          created_at: string
          id: string
          moment: string
          profile_id: string
          rating: number | null
        }
        Insert: {
          account_id: string
          comment?: string | null
          created_at?: string
          id?: string
          moment: string
          profile_id: string
          rating?: number | null
        }
        Update: {
          account_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          moment?: string
          profile_id?: string
          rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_profile_id_fkey"
            columns: ["profile_id"]
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
      incoming_items: {
        Row: {
          body: string
          created_at: string
          decided_at: string | null
          external_id: string
          id: string
          owner_id: string
          received_at: string
          sender: string | null
          source: string
          status: string
          subject: string | null
          suggestions: Json
          summary: string | null
        }
        Insert: {
          body: string
          created_at?: string
          decided_at?: string | null
          external_id: string
          id?: string
          owner_id: string
          received_at?: string
          sender?: string | null
          source: string
          status?: string
          subject?: string | null
          suggestions?: Json
          summary?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          decided_at?: string | null
          external_id?: string
          id?: string
          owner_id?: string
          received_at?: string
          sender?: string | null
          source?: string
          status?: string
          subject?: string | null
          suggestions?: Json
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incoming_items_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      oauth_states: {
        Row: {
          created_at: string
          profile_id: string
          provider: string
          redirect: string
          state: string
          verifier: string | null
        }
        Insert: {
          created_at?: string
          profile_id: string
          provider: string
          redirect: string
          state: string
          verifier?: string | null
        }
        Update: {
          created_at?: string
          profile_id?: string
          provider?: string
          redirect?: string
          state?: string
          verifier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "oauth_states_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      objectives: {
        Row: {
          achieved_at: string | null
          created_at: string
          created_by: string
          description: string | null
          due_at: string
          id: string
          owner_id: string | null
          start_at: string
          status: Database["public"]["Enums"]["objective_status"]
          title: string
          title_ar: string | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          achieved_at?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          due_at: string
          id?: string
          owner_id?: string | null
          start_at?: string
          status?: Database["public"]["Enums"]["objective_status"]
          title: string
          title_ar?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          achieved_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_at?: string
          id?: string
          owner_id?: string | null
          start_at?: string
          status?: Database["public"]["Enums"]["objective_status"]
          title?: string
          title_ar?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objectives_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objectives_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objectives_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding: {
        Row: {
          account_named: boolean
          demo_seen: boolean
          dismissed: boolean
          finished_at: string | null
          profile_id: string
          started_at: string
        }
        Insert: {
          account_named?: boolean
          demo_seen?: boolean
          dismissed?: boolean
          finished_at?: string | null
          profile_id: string
          started_at?: string
        }
        Update: {
          account_named?: boolean
          demo_seen?: boolean
          dismissed?: boolean
          finished_at?: string | null
          profile_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_id: string
          avatar_color: string | null
          created_at: string
          email: string | null
          full_name: string
          full_name_ar: string | null
          hidden: boolean
          id: string
          locale: string
          manager_id: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          skills: string[]
          skills_detail: Json
          status: Database["public"]["Enums"]["person_status"]
          telegram_connected: boolean
          telegram_handle: string | null
          title: string | null
          title_ar: string | null
          updated_at: string
          user_id: string | null
          weekly_capacity_hours: number
          whatsapp_connected: boolean
          years_experience: number | null
        }
        Insert: {
          account_id: string
          avatar_color?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          full_name_ar?: string | null
          hidden?: boolean
          id?: string
          locale?: string
          manager_id?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          skills?: string[]
          skills_detail?: Json
          status?: Database["public"]["Enums"]["person_status"]
          telegram_connected?: boolean
          telegram_handle?: string | null
          title?: string | null
          title_ar?: string | null
          updated_at?: string
          user_id?: string | null
          weekly_capacity_hours?: number
          whatsapp_connected?: boolean
          years_experience?: number | null
        }
        Update: {
          account_id?: string
          avatar_color?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          full_name_ar?: string | null
          hidden?: boolean
          id?: string
          locale?: string
          manager_id?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          skills?: string[]
          skills_detail?: Json
          status?: Database["public"]["Enums"]["person_status"]
          telegram_connected?: boolean
          telegram_handle?: string | null
          title?: string | null
          title_ar?: string | null
          updated_at?: string
          user_id?: string | null
          weekly_capacity_hours?: number
          whatsapp_connected?: boolean
          years_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          device_name: string | null
          id: string
          platform: string
          profile_id: string
          token: string
          updated_at: string
        }
        Insert: {
          device_name?: string | null
          id?: string
          platform: string
          profile_id: string
          token: string
          updated_at?: string
        }
        Update: {
          device_name?: string | null
          id?: string
          platform?: string
          profile_id?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_tasks: {
        Row: {
          created_at: string
          created_by: string
          definition_of_done: string | null
          ends_on: string | null
          estimate_hours: number | null
          every: number
          freq: string
          goal: string | null
          helper_id: string | null
          id: string
          last_task_id: string | null
          month_day: number | null
          next_due_at: string | null
          objective_id: string | null
          owner_id: string | null
          paused_until: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          rot_index: number
          rotation: string[]
          skip_next: boolean
          starts_on: string
          status: string
          time_of_day: string
          title: string
          updated_at: string
          weekdays: number[]
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          definition_of_done?: string | null
          ends_on?: string | null
          estimate_hours?: number | null
          every?: number
          freq: string
          goal?: string | null
          helper_id?: string | null
          id?: string
          last_task_id?: string | null
          month_day?: number | null
          next_due_at?: string | null
          objective_id?: string | null
          owner_id?: string | null
          paused_until?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          rot_index?: number
          rotation?: string[]
          skip_next?: boolean
          starts_on?: string
          status?: string
          time_of_day?: string
          title: string
          updated_at?: string
          weekdays?: number[]
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          definition_of_done?: string | null
          ends_on?: string | null
          estimate_hours?: number | null
          every?: number
          freq?: string
          goal?: string | null
          helper_id?: string | null
          id?: string
          last_task_id?: string | null
          month_day?: number | null
          next_due_at?: string | null
          objective_id?: string | null
          owner_id?: string | null
          paused_until?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          rot_index?: number
          rotation?: string[]
          skip_next?: boolean
          starts_on?: string
          status?: string
          time_of_day?: string
          title?: string
          updated_at?: string
          weekdays?: number[]
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_tasks_helper_id_fkey"
            columns: ["helper_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_tasks_last_task_id_fkey"
            columns: ["last_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_tasks_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "objectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_tasks_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          ai_check: Json | null
          auto_approve_at: string | null
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
          ai_check?: Json | null
          auto_approve_at?: string | null
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
          ai_check?: Json | null
          auto_approve_at?: string | null
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
      step_suggestions: {
        Row: {
          created_at: string
          like_task_title: string | null
          source: string
          steps: Json
          task_id: string
        }
        Insert: {
          created_at?: string
          like_task_title?: string | null
          source?: string
          steps?: Json
          task_id: string
        }
        Update: {
          created_at?: string
          like_task_title?: string | null
          source?: string
          steps?: Json
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "step_suggestions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: true
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      subtasks: {
        Row: {
          created_at: string
          created_by: string | null
          done: boolean
          done_at: string | null
          due_at: string | null
          id: string
          owner_id: string | null
          position: number
          task_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          done?: boolean
          done_at?: string | null
          due_at?: string | null
          id?: string
          owner_id?: string | null
          position?: number
          task_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          done?: boolean
          done_at?: string | null
          due_at?: string | null
          id?: string
          owner_id?: string | null
          position?: number
          task_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subtasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
      task_links: {
        Row: {
          closed_there: boolean
          connection_id: string
          created_at: string
          direction: string
          external_id: string
          external_url: string | null
          id: string
          provider: string
          synced_at: string
          task_id: string
        }
        Insert: {
          closed_there?: boolean
          connection_id: string
          created_at?: string
          direction: string
          external_id: string
          external_url?: string | null
          id?: string
          provider: string
          synced_at?: string
          task_id: string
        }
        Update: {
          closed_there?: boolean
          connection_id?: string
          created_at?: string
          direction?: string
          external_id?: string
          external_url?: string | null
          id?: string
          provider?: string
          synced_at?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_links_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_links_task_id_fkey"
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
          manager_touches: number
          objective_id: string | null
          owner_id: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          progress: number
          proof_required: string
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
          manager_touches?: number
          objective_id?: string | null
          owner_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          progress?: number
          proof_required?: string
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
          manager_touches?: number
          objective_id?: string | null
          owner_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          progress?: number
          proof_required?: string
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
            foreignKeyName: "tasks_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "objectives"
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
      add_steps: {
        Args: {
          p_due?: string
          p_owner?: string
          p_task: string
          p_titles: string[]
        }
        Returns: number
      }
      bulk_update_tasks: {
        Args: { p_change: Json; p_ids: string[] }
        Returns: Json
      }
      can_edit_objective: { Args: { o_id: string }; Returns: boolean }
      can_lead: { Args: never; Returns: boolean }
      can_see_objective: { Args: { o_id: string }; Returns: boolean }
      can_see_profile: { Args: { target: string }; Returns: boolean }
      can_see_task: { Args: { t_id: string }; Returns: boolean }
      can_see_workspace: { Args: { w_id: string }; Returns: boolean }
      cancel_objective: { Args: { p_objective: string }; Returns: undefined }
      cancel_task: { Args: { p_task: string }; Returns: undefined }
      checkin_reply: {
        Args: { p_note?: string; p_reply: string; p_task: string }
        Returns: string
      }
      coach_seen: {
        Args: { p_acted?: boolean; p_key: string }
        Returns: undefined
      }
      create_account: {
        Args: {
          p_admin_email: string
          p_admin_name: string
          p_admin_name_ar: string
          p_name: string
          p_name_ar: string
        }
        Returns: Json
      }
      create_task_as: { Args: { actor: string; p: Json }; Returns: string }
      create_task_with_plan: { Args: { p: Json }; Returns: string }
      current_account_id: { Args: never; Returns: string }
      current_profile_id: { Args: never; Returns: string }
      delete_task: { Args: { p_task: string }; Returns: undefined }
      distribute_tasks: { Args: { p_objective: string }; Returns: number }
      evidence_task_id: { Args: { object_name: string }; Returns: string }
      give_feedback: {
        Args: { p_comment?: string; p_moment: string; p_rating: number }
        Returns: undefined
      }
      growth_overview: { Args: never; Returns: Json }
      is_admin: { Args: never; Returns: boolean }
      is_below: { Args: { boss: string; target: string }; Returns: boolean }
      is_manager_of: { Args: { target: string }; Returns: boolean }
      is_manager_touch: {
        Args: { p_action: string; p_summary: string }
        Returns: boolean
      }
      is_super_admin: { Args: never; Returns: boolean }
      link_task: {
        Args: { p_objective: string; p_task: string }
        Returns: undefined
      }
      mark_alerts_read: { Args: never; Returns: number }
      mark_feature: {
        Args: { p_key: string; p_state: string }
        Returns: string
      }
      my_accounts: {
        Args: never
        Returns: {
          active: boolean
          id: string
          member: boolean
          name: string
          name_ar: string
          people: number
          status: string
        }[]
      }
      my_steps: {
        Args: never
        Returns: {
          done: boolean
          due_at: string
          id: string
          task_id: string
          task_title: string
          title: string
        }[]
      }
      nudge_waiting: {
        Args: {
          p_decision: string
          p_message: string
          p_task: string
          p_to: string
        }
        Returns: undefined
      }
      onboarding_mark: { Args: { p: Json }; Returns: undefined }
      reannounce_feature: {
        Args: { p_key: string; p_profiles: string[] }
        Returns: number
      }
      recurring_action: {
        Args: { p_action: string; p_id: string; p_until?: string }
        Returns: undefined
      }
      recurring_next: {
        Args: {
          after: string
          r: Database["public"]["Tables"]["recurring_tasks"]["Row"]
        }
        Returns: string
      }
      refresh_objective: { Args: { p_objective: string }; Returns: undefined }
      same_account: { Args: { target: string }; Returns: boolean }
      save_push_token: {
        Args: { p_device_name?: string; p_platform: string; p_token: string }
        Returns: undefined
      }
      set_account_name: {
        Args: { p_name: string; p_name_ar?: string }
        Returns: undefined
      }
      set_step: { Args: { p: Json; p_id: string }; Returns: undefined }
      set_task_status: {
        Args: {
          p_log?: boolean
          p_note?: string
          p_status: string
          p_task: string
        }
        Returns: string
      }
      shift_task_due: {
        Args: { new_due: string; p_task: string }
        Returns: undefined
      }
      spawn_recurring_tasks: { Args: { p_only?: string }; Returns: number }
      switch_account: { Args: { p_account: string }; Returns: string }
      tick_my_step: {
        Args: { p_done?: boolean; p_id: string }
        Returns: undefined
      }
      undo_chat_task: { Args: { p_task: string }; Returns: undefined }
      undo_task_changes: { Args: { p_log: string }; Returns: number }
      update_task_from_chat: {
        Args: { p_task: string; patch: Json }
        Returns: undefined
      }
      upsert_objective: { Args: { p: Json }; Returns: string }
      upsert_person: { Args: { p: Json }; Returns: string }
      upsert_person_inner: { Args: { p: Json }; Returns: string }
      upsert_recurring: { Args: { p: Json }; Returns: string }
      working_mornings_after: {
        Args: { p_from: string; p_n: number }
        Returns: string
      }
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
      objective_status: "active" | "achieved" | "missed" | "cancelled"
      person_status: "active" | "pending" | "deleted"
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
      user_role: "manager" | "employee" | "admin" | "super_admin"
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
      objective_status: ["active", "achieved", "missed", "cancelled"],
      person_status: ["active", "pending", "deleted"],
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
      user_role: ["manager", "employee", "admin", "super_admin"],
    },
  },
} as const
