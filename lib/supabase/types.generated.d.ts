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
          operationName?: string
          query?: string
          variables?: Json
          extensions?: Json
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
      approval_approver_responses: {
        Row: {
          approval_id: number
          approver_id: string
          comment: string | null
          id: number
          responded_at: string | null
          status: Database["public"]["Enums"]["approval_status"]
        }
        Insert: {
          approval_id: number
          approver_id: string
          comment?: string | null
          id?: number
          responded_at?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
        }
        Update: {
          approval_id?: number
          approver_id?: string
          comment?: string | null
          id?: number
          responded_at?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
        }
        Relationships: [
          {
            foreignKeyName: "approval_approver_responses_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "approvals"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_approvers: {
        Row: {
          approval_id: number
          approver_id: string
        }
        Insert: {
          approval_id: number
          approver_id: string
        }
        Update: {
          approval_id?: number
          approver_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_approvers_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "approvals"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_comments: {
        Row: {
          approval_id: number
          comment: string
          created_at: string | null
          id: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          approval_id: number
          comment: string
          created_at?: string | null
          id?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          approval_id?: number
          comment?: string
          created_at?: string | null
          id?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_comments_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "approvals"
            referencedColumns: ["id"]
          },
        ]
      }
      approvals: {
        Row: {
          action_comment: string | null
          action_taken_at: string | null
          action_taken_by: string | null
          created_at: string
          entity_id: number
          entity_type: Database["public"]["Enums"]["entity_type"]
          id: number
          last_updated: string
          requester_id: string | null
          status: Database["public"]["Enums"]["approval_status"]
          user_id: string | null
        }
        Insert: {
          action_comment?: string | null
          action_taken_at?: string | null
          action_taken_by?: string | null
          created_at?: string
          entity_id?: number
          entity_type: Database["public"]["Enums"]["entity_type"]
          id?: number
          last_updated?: string
          requester_id?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          user_id?: string | null
        }
        Update: {
          action_comment?: string | null
          action_taken_at?: string | null
          action_taken_by?: string | null
          created_at?: string
          entity_id?: number
          entity_type?: Database["public"]["Enums"]["entity_type"]
          id?: number
          last_updated?: string
          requester_id?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          user_id?: string | null
        }
        Relationships: []
      }
      attachments: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          entity_id: string
          entity_type: string
          file_name: string
          file_size: number
          file_type: Database["public"]["Enums"]["attachment_file_type"]
          id: string
          project_id: number
          storage_path: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          entity_id: string
          entity_type: string
          file_name: string
          file_size: number
          file_type: Database["public"]["Enums"]["attachment_file_type"]
          id?: string
          project_id: number
          storage_path: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          entity_id?: string
          entity_type?: string
          file_name?: string
          file_size?: number
          file_type?: Database["public"]["Enums"]["attachment_file_type"]
          id?: string
          project_id?: number
          storage_path?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attachments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      email_queue: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          notification_id: string | null
          priority: Database["public"]["Enums"]["notification_priority"]
          retry_count: number
          scheduled_for: string
          sent_at: string | null
          status: Database["public"]["Enums"]["email_status"]
          subject: string
          template_data: Json
          template_id: string
          to_email: string
          to_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          notification_id?: string | null
          priority?: Database["public"]["Enums"]["notification_priority"]
          retry_count?: number
          scheduled_for?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_status"]
          subject: string
          template_data?: Json
          template_id: string
          to_email: string
          to_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          notification_id?: string | null
          priority?: Database["public"]["Enums"]["notification_priority"]
          retry_count?: number
          scheduled_for?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_status"]
          subject?: string
          template_data?: Json
          template_id?: string
          to_email?: string
          to_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_queue_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_assignees: {
        Row: {
          assigned_at: string
          assigned_by: string
          entity_id: number
          entity_type: string
          id: number
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by: string
          entity_id: number
          entity_type: string
          id?: number
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string
          entity_id?: number
          entity_type?: string
          id?: number
          user_id?: string
        }
        Relationships: []
      }
      entity_labels: {
        Row: {
          created_at: string
          created_by: string
          entity_id: number
          entity_type: string
          id: number
          label_id: number
        }
        Insert: {
          created_at?: string
          created_by: string
          entity_id: number
          entity_type: string
          id?: number
          label_id: number
        }
        Update: {
          created_at?: string
          created_by?: string
          entity_id?: number
          entity_type?: string
          id?: number
          label_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "entity_labels_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "labels"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_positions: {
        Row: {
          context: string
          created_at: string
          entity_id: number
          entity_type: string
          id: number
          position: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          context: string
          created_at?: string
          entity_id: number
          entity_type: string
          id?: number
          position: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          context?: string
          created_at?: string
          entity_id?: number
          entity_type?: string
          id?: number
          position?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      form_entries: {
        Row: {
          created_at: string
          deleted_at: string | null
          form_id: number
          id: number
          is_synced: boolean
          last_synced_at: string | null
          name: string | null
          project_id: number
          submitted_by_user_id: string
          team_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          form_id: number
          id?: never
          is_synced?: boolean
          last_synced_at?: string | null
          name?: string | null
          project_id: number
          submitted_by_user_id: string
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          form_id?: number
          id?: never
          is_synced?: boolean
          last_synced_at?: string | null
          name?: string | null
          project_id?: number
          submitted_by_user_id?: string
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_entries_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      form_entry_answers: {
        Row: {
          answer_value: Json | null
          created_at: string
          entry_id: number
          id: number
          item_id: number
        }
        Insert: {
          answer_value?: Json | null
          created_at?: string
          entry_id: number
          id?: never
          item_id: number
        }
        Update: {
          answer_value?: Json | null
          created_at?: string
          entry_id?: number
          id?: never
          item_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "form_entry_answers_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "form_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_entry_answers_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "form_items"
            referencedColumns: ["id"]
          },
        ]
      }
      form_items: {
        Row: {
          display_order: number
          form_id: number
          id: number
          is_required: boolean | null
          item_type: Database["public"]["Enums"]["item_type"]
          options: Json | null
          question_value: string | null
        }
        Insert: {
          display_order: number
          form_id: number
          id?: never
          is_required?: boolean | null
          item_type: Database["public"]["Enums"]["item_type"]
          options?: Json | null
          question_value?: string | null
        }
        Update: {
          display_order?: number
          form_id?: number
          id?: never
          is_required?: boolean | null
          item_type?: Database["public"]["Enums"]["item_type"]
          options?: Json | null
          question_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_items_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      forms: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: number
          is_synced: boolean
          last_synced_at: string | null
          name: string
          owner_id: string
          project_id: number | null
          team_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: never
          is_synced?: boolean
          last_synced_at?: string | null
          name: string
          owner_id: string
          project_id?: number | null
          team_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: never
          is_synced?: boolean
          last_synced_at?: string | null
          name?: string
          owner_id?: string
          project_id?: number | null
          team_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "forms_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      labels: {
        Row: {
          color: string | null
          created_at: string
          created_by: string
          description: string | null
          id: number
          name: string
          project_id: number
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: number
          name: string
          project_id: number
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: number
          name?: string
          project_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "labels_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_deliveries: {
        Row: {
          channel: string
          created_at: string
          delivered_at: string | null
          error_message: string | null
          id: string
          metadata: Json
          notification_id: string
          retry_count: number
          status: Database["public"]["Enums"]["delivery_status"]
        }
        Insert: {
          channel: string
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json
          notification_id: string
          retry_count?: number
          status?: Database["public"]["Enums"]["delivery_status"]
        }
        Update: {
          channel?: string
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json
          notification_id?: string
          retry_count?: number
          status?: Database["public"]["Enums"]["delivery_status"]
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string
          email_enabled: boolean
          id: string
          in_app_enabled: boolean
          push_enabled: boolean
          type: Database["public"]["Enums"]["notification_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_enabled?: boolean
          id?: string
          in_app_enabled?: boolean
          push_enabled?: boolean
          type: Database["public"]["Enums"]["notification_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_enabled?: boolean
          id?: string
          in_app_enabled?: boolean
          push_enabled?: boolean
          type?: Database["public"]["Enums"]["notification_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          message_template: string
          name: string
          placeholders: string[] | null
          subject_template: string
          type: Database["public"]["Enums"]["notification_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          message_template: string
          name: string
          placeholders?: string[] | null
          subject_template: string
          type: Database["public"]["Enums"]["notification_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          message_template?: string
          name?: string
          placeholders?: string[] | null
          subject_template?: string
          type?: Database["public"]["Enums"]["notification_type"]
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          created_by: string | null
          data: Json
          entity_id: string | null
          entity_type: string | null
          id: string
          is_read: boolean
          message: string
          priority: Database["public"]["Enums"]["notification_priority"]
          read_at: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data?: Json
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          message: string
          priority?: Database["public"]["Enums"]["notification_priority"]
          read_at?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: Json
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          message?: string
          priority?: Database["public"]["Enums"]["notification_priority"]
          read_at?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      organization_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          declined_at: string | null
          email: string
          expires_at: string
          id: number
          invited_at: string
          invited_by: string
          last_resend_at: string | null
          organization_id: number
          resend_count: number
          role: string
          status: string
          token: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          declined_at?: string | null
          email: string
          expires_at?: string
          id?: number
          invited_at?: string
          invited_by: string
          last_resend_at?: string | null
          organization_id: number
          resend_count?: number
          role: string
          status?: string
          token?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          declined_at?: string | null
          email?: string
          expires_at?: string
          id?: number
          invited_at?: string
          invited_by?: string
          last_resend_at?: string | null
          organization_id?: number
          resend_count?: number
          role?: string
          status?: string
          token?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_users: {
        Row: {
          current_project_id: number | null
          default_project_id: number | null
          email: string | null
          id: number
          invited_at: string | null
          invited_by: string | null
          joined_at: string
          last_accessed_at: string | null
          left_at: string | null
          notifications_enabled: boolean | null
          organization_id: number
          role: string
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          current_project_id?: number | null
          default_project_id?: number | null
          email?: string | null
          id?: number
          invited_at?: string | null
          invited_by?: string | null
          joined_at?: string
          last_accessed_at?: string | null
          left_at?: string | null
          notifications_enabled?: boolean | null
          organization_id: number
          role: string
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          current_project_id?: number | null
          default_project_id?: number | null
          email?: string | null
          id?: number
          invited_at?: string | null
          invited_by?: string | null
          joined_at?: string
          last_accessed_at?: string | null
          left_at?: string | null
          notifications_enabled?: boolean | null
          organization_id?: number
          role?: string
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_users_current_project_id_fkey"
            columns: ["current_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_users_default_project_id_fkey"
            columns: ["default_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: number
          is_active: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: number
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: number
          is_active?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      priorities: {
        Row: {
          color: string | null
          created_at: string
          created_by: string
          id: number
          is_default: boolean
          name: string
          position: number
          project_id: number
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by: string
          id?: number
          is_default?: boolean
          name: string
          position?: number
          project_id: number
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string
          id?: number
          is_default?: boolean
          name?: string
          position?: number
          project_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "priorities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          created_at: string
          created_by: string
          description: string | null
          id: number
          is_archived: boolean
          name: string
          organization_id: number | null
          owner_id: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: number
          is_archived?: boolean
          name: string
          organization_id?: number | null
          owner_id: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: number
          is_archived?: boolean
          name?: string
          organization_id?: number | null
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      projects_users: {
        Row: {
          created_at: string
          created_by: string
          email: string | null
          id: number
          invited_at: string | null
          invited_by: string | null
          left_at: string | null
          project_id: number
          role: string
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          email?: string | null
          id?: number
          invited_at?: string | null
          invited_by?: string | null
          left_at?: string | null
          project_id: number
          role: string
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          email?: string | null
          id?: number
          invited_at?: string | null
          invited_by?: string | null
          left_at?: string | null
          project_id?: number
          role?: string
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_users_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      push_queue: {
        Row: {
          created_at: string
          device_id: string
          error_message: string | null
          id: string
          notification_id: string | null
          payload: Json
          platform: string
          priority: Database["public"]["Enums"]["notification_priority"]
          retry_count: number
          scheduled_for: string
          sent_at: string | null
          status: Database["public"]["Enums"]["delivery_status"]
          token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          device_id: string
          error_message?: string | null
          id?: string
          notification_id?: string | null
          payload: Json
          platform: string
          priority?: Database["public"]["Enums"]["notification_priority"]
          retry_count?: number
          scheduled_for?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          token: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          device_id?: string
          error_message?: string | null
          id?: string
          notification_id?: string | null
          payload?: Json
          platform?: string
          priority?: Database["public"]["Enums"]["notification_priority"]
          retry_count?: number
          scheduled_for?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_queue_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "user_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_queue_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      site_diaries: {
        Row: {
          created_at: string
          date: string
          deleted_at: string | null
          id: number
          metadata: Json | null
          name: string
          project_id: number
          submitted_by_user_id: string
          template_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          date?: string
          deleted_at?: string | null
          id?: never
          metadata?: Json | null
          name: string
          project_id: number
          submitted_by_user_id: string
          template_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          deleted_at?: string | null
          id?: never
          metadata?: Json | null
          name?: string
          project_id?: number
          submitted_by_user_id?: string
          template_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_diaries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_diaries_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "site_diary_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      site_diary_answers: {
        Row: {
          answer_value: Json | null
          created_at: string
          diary_id: number
          id: number
          item_id: number
        }
        Insert: {
          answer_value?: Json | null
          created_at?: string
          diary_id: number
          id?: never
          item_id: number
        }
        Update: {
          answer_value?: Json | null
          created_at?: string
          diary_id?: number
          id?: never
          item_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "site_diary_answers_diary_id_fkey"
            columns: ["diary_id"]
            isOneToOne: false
            referencedRelation: "site_diaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_diary_answers_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "site_diary_template_items"
            referencedColumns: ["id"]
          },
        ]
      }
      site_diary_template_items: {
        Row: {
          display_order: number
          id: number
          is_required: boolean | null
          item_type: Database["public"]["Enums"]["item_type"]
          metadata: Json | null
          options: Json | null
          question_value: string | null
          template_id: number
        }
        Insert: {
          display_order: number
          id?: never
          is_required?: boolean | null
          item_type: Database["public"]["Enums"]["item_type"]
          metadata?: Json | null
          options?: Json | null
          question_value?: string | null
          template_id: number
        }
        Update: {
          display_order?: number
          id?: never
          is_required?: boolean | null
          item_type?: Database["public"]["Enums"]["item_type"]
          metadata?: Json | null
          options?: Json | null
          question_value?: string | null
          template_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "site_diary_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "site_diary_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      site_diary_templates: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          description: string | null
          id: number
          metadata: Json | null
          name: string
          project_id: number
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by: string
          deleted_at?: string | null
          description?: string | null
          id?: never
          metadata?: Json | null
          name: string
          project_id: number
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          description?: string | null
          id?: never
          metadata?: Json | null
          name?: string
          project_id?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "site_diary_templates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      statuses: {
        Row: {
          color: string | null
          created_at: string
          created_by: string
          id: number
          is_default: boolean
          name: string
          position: number
          project_id: number
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by: string
          id?: number
          is_default?: boolean
          name: string
          position?: number
          project_id: number
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string
          id?: number
          is_default?: boolean
          name?: string
          position?: number
          project_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "statuses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          content: string
          created_at: string
          id: number
          task_id: number
          user_avatar: string | null
          user_id: string
          user_name: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: number
          task_id: number
          user_avatar?: string | null
          user_id: string
          user_name: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: number
          task_id?: number
          user_avatar?: string | null
          user_id?: string
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_metadata: {
        Row: {
          created_at: string
          created_by: string
          id: number
          task_id: number
          title: string
          updated_at: string
          value: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: number
          task_id: number
          title: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: number
          task_id?: number
          title?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_metadata_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          id: number
          parent_task_id: number | null
          priority_id: number
          project_id: number | null
          status_id: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          id?: number
          parent_task_id?: number | null
          priority_id: number
          project_id?: number | null
          status_id: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          id?: number
          parent_task_id?: number | null
          priority_id?: number
          project_id?: number | null
          status_id?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_priority_id_fkey"
            columns: ["priority_id"]
            isOneToOne: false
            referencedRelation: "priorities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "statuses"
            referencedColumns: ["id"]
          },
        ]
      }
      user_devices: {
        Row: {
          created_at: string
          device_name: string | null
          id: string
          last_used: string
          platform: string
          push_enabled: boolean
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_name?: string | null
          id?: string
          last_used?: string
          platform: string
          push_enabled?: boolean
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_name?: string | null
          id?: string
          last_used?: string
          platform?: string
          push_enabled?: boolean
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          created_at: string
          current_organization_id: number | null
          default_organization_id: number | null
          email: string | null
          failed_login_attempts: number | null
          first_name: string | null
          global_avatar_url: string | null
          global_display_name: string | null
          id: string
          last_name: string | null
          last_organization_switch_at: string | null
          locked_until: string | null
          preferred_language: string | null
          preferred_timezone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_organization_id?: number | null
          default_organization_id?: number | null
          email?: string | null
          failed_login_attempts?: number | null
          first_name?: string | null
          global_avatar_url?: string | null
          global_display_name?: string | null
          id: string
          last_name?: string | null
          last_organization_switch_at?: string | null
          locked_until?: string | null
          preferred_language?: string | null
          preferred_timezone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_organization_id?: number | null
          default_organization_id?: number | null
          email?: string | null
          failed_login_attempts?: number | null
          first_name?: string | null
          global_avatar_url?: string | null
          global_display_name?: string | null
          id?: string
          last_name?: string | null
          last_organization_switch_at?: string | null
          locked_until?: string | null
          preferred_language?: string | null
          preferred_timezone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_current_organization_id_fkey"
            columns: ["current_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_profiles_default_organization_id_fkey"
            columns: ["default_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_requests: {
        Row: {
          created_at: string
          error_message: string | null
          function_name: string
          id: string
          payload: Json | null
          processed_at: string | null
          response: Json | null
          retry_count: number | null
          scheduled_for: string
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          function_name: string
          id?: string
          payload?: Json | null
          processed_at?: string | null
          response?: Json | null
          retry_count?: number | null
          scheduled_for?: string
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          function_name?: string
          id?: string
          payload?: Json | null
          processed_at?: string | null
          response?: Json | null
          retry_count?: number | null
          scheduled_for?: string
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_organization_invitation: {
        Args: {
          p_token: string
        }
        Returns: Json
      }
      calculate_approval_status: {
        Args: {
          approval_id_param: number
        }
        Returns: Database["public"]["Enums"]["approval_status"]
      }
      call_edge_function_safe: {
        Args: {
          function_name: string
        }
        Returns: Json
      }
      call_send_email_notification: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      call_send_push_notification: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      can_change_member_role: {
        Args: {
          changer_user_id: string
          target_member_id: number
          new_role: string
          org_id: number
        }
        Returns: boolean
      }
      cancel_organization_invitation: {
        Args: {
          p_invitation_id: number
        }
        Returns: Json
      }
      check_user_exists_by_email: {
        Args: {
          user_email: string
        }
        Returns: boolean
      }
      cleanup_duplicate_organization_memberships: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      cleanup_duplicate_project_memberships: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      cleanup_expired_invitations: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      cleanup_notification_queues: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      cleanup_old_notifications: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      convert_slugs_to_hash: {
        Args: Record<PropertyKey, never>
        Returns: {
          org_id: number
          old_slug: string
          new_slug: string
          updated: boolean
        }[]
      }
      create_default_notification_preferences: {
        Args: {
          p_user_id: string
        }
        Returns: undefined
      }
      create_notification: {
        Args: {
          p_user_id: string
          p_type: Database["public"]["Enums"]["notification_type"]
          p_template_name?: string
          p_template_data?: string[]
          p_data?: Json
          p_entity_type?: string
          p_entity_id?: string
          p_priority?: Database["public"]["Enums"]["notification_priority"]
          p_created_by?: string
        }
        Returns: string
      }
      create_organization: {
        Args: {
          org_name: string
          org_description?: string
        }
        Returns: number
      }
      create_organization_for_existing_user: {
        Args: {
          target_user_id: string
        }
        Returns: number
      }
      create_task_attachment: {
        Args: {
          p_task_id: number
          p_file_name: string
          p_file_size: number
          p_file_type: string
          p_storage_path: string
        }
        Returns: string
      }
      create_webhook_request: {
        Args: {
          p_function_name: string
          p_payload?: Json
        }
        Returns: string
      }
      debug_invite_process: {
        Args: {
          org_id: number
          user_email: string
          user_role?: string
        }
        Returns: Json
      }
      debug_pg_net_setup: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      decline_organization_invitation: {
        Args: {
          p_token: string
        }
        Returns: Json
      }
      ensure_all_notification_preferences: {
        Args: {
          p_user_id: string
        }
        Returns: {
          created_count: number
          notification_types: string[]
        }[]
      }
      ensure_user_has_organization: {
        Args: {
          target_user_id: string
        }
        Returns: number
      }
      fix_user_notification_preferences: {
        Args: {
          p_user_email: string
        }
        Returns: string
      }
      generate_attachment_path: {
        Args: {
          project_id: number
          entity_type: string
          entity_id: string
          file_name: string
        }
        Returns: string
      }
      generate_invitation_token: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      generate_organization_slug: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_attachment_type: {
        Args: {
          file_type: string
          file_name: string
        }
        Returns: Database["public"]["Enums"]["attachment_file_type"]
      }
      get_current_organization_id: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      get_email_queue_status: {
        Args: Record<PropertyKey, never>
        Returns: {
          status: string
          count: number
          oldest_created_at: string
          newest_created_at: string
        }[]
      }
      get_invitation_by_token: {
        Args: {
          p_token: string
        }
        Returns: Json
      }
      get_notification_preference_summary: {
        Args: Record<PropertyKey, never>
        Returns: {
          total_users: number
          users_with_complete_preferences: number
          users_with_missing_preferences: number
          total_preferences: number
          avg_preferences_per_user: number
        }[]
      }
      get_notification_template: {
        Args: {
          p_type: Database["public"]["Enums"]["notification_type"]
          p_template_name?: string
          p_template_data?: string[]
        }
        Returns: {
          subject: string
          message: string
        }[]
      }
      get_or_create_default_organization: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      get_organization_members: {
        Args: {
          org_id: number
        }
        Returns: {
          membership_id: number
          user_id: string
          role: string
          status: string
          joined_at: string
          invited_by: string
          display_name: string
          user_email: string
        }[]
      }
      get_pending_organization_invitations: {
        Args: {
          p_organization_id: number
        }
        Returns: Json
      }
      get_project_members: {
        Args: {
          p_project_id: number
        }
        Returns: {
          id: number
          project_id: number
          user_id: string
          role: string
          status: string
          created_at: string
          invited_at: string
          invited_by: string
          left_at: string
          updated_at: string
          email: string
          user_email: string
          user_name: string
          user_avatar_url: string
        }[]
      }
      get_push_queue_status: {
        Args: Record<PropertyKey, never>
        Returns: {
          status: string
          count: number
          oldest_created_at: string
          newest_created_at: string
        }[]
      }
      get_task_attachments: {
        Args: {
          p_task_id: number
        }
        Returns: {
          id: string
          file_name: string
          file_size: number
          file_type: string
          storage_path: string
          created_at: string
          created_by: string
        }[]
      }
      get_unread_notification_count: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      get_user_details: {
        Args: {
          user_ids: string[]
        }
        Returns: {
          id: string
          raw_user_meta_data: Json
          global_avatar_url: string
          global_display_name: string
        }[]
      }
      get_user_id_by_email: {
        Args: {
          user_email: string
        }
        Returns: string
      }
      get_user_organization_ids: {
        Args: {
          target_user_id: string
        }
        Returns: {
          organization_id: number
        }[]
      }
      get_user_organizations: {
        Args: Record<PropertyKey, never>
        Returns: {
          organization_id: number
          organization_name: string
          organization_slug: string
          user_role: string
          user_status: string
          joined_at: string
          last_accessed_at: string
          is_current: boolean
        }[]
      }
      get_user_pending_invitations: {
        Args: {
          p_user_id: string
        }
        Returns: Json
      }
      get_user_project_context: {
        Args: Record<PropertyKey, never>
        Returns: {
          organization_id: number
          current_project_id: number
          default_project_id: number
          current_project_name: string
          default_project_name: string
        }[]
      }
      get_vault_secret: {
        Args: {
          secret_name: string
        }
        Returns: string
      }
      initialize_notification_preferences: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      invite_existing_user_to_organization: {
        Args: {
          p_organization_id: number
          p_user_id: string
          p_role: string
        }
        Returns: Json
      }
      invite_user_to_organization: {
        Args: {
          org_id: number
          user_email: string
          user_role?: string
        }
        Returns: Json
      }
      invite_user_to_organization_by_email: {
        Args: {
          p_organization_id: number
          p_email: string
          p_role: string
        }
        Returns: Json
      }
      invite_user_to_project: {
        Args: {
          p_project_id: number
          p_user_id: string
          p_role?: string
        }
        Returns: Json
      }
      is_invitation_token_valid: {
        Args: {
          token: string
        }
        Returns: boolean
      }
      link_user_to_pending_invitations: {
        Args: {
          p_user_id: string
          p_email: string
        }
        Returns: Json
      }
      mark_all_notifications_read: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      mark_notification_delivery_failed: {
        Args: {
          p_notification_id: string
          p_channel: string
          p_error_message: string
        }
        Returns: boolean
      }
      mark_notification_delivery_sent: {
        Args: {
          p_notification_id: string
          p_channel: string
        }
        Returns: boolean
      }
      mark_notification_read: {
        Args: {
          p_notification_id: string
        }
        Returns: undefined
      }
      process_email_queue: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      process_push_queue: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      queue_email_notification: {
        Args: {
          p_notification_id: string
        }
        Returns: Json
      }
      queue_push_notification: {
        Args: {
          p_notification_id: string
        }
        Returns: Json
      }
      remove_organization_member: {
        Args: {
          membership_id: number
        }
        Returns: Json
      }
      remove_project_member: {
        Args: {
          p_membership_id: number
        }
        Returns: Json
      }
      rerun_slug_conversion: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      retry_failed_notifications: {
        Args: {
          p_max_retries?: number
        }
        Returns: Json
      }
      set_user_current_project: {
        Args: {
          p_project_id: number
        }
        Returns: boolean
      }
      set_user_default_project: {
        Args: {
          p_project_id: number
        }
        Returns: boolean
      }
      switch_organization_context: {
        Args: {
          new_org_id: number
        }
        Returns: boolean
      }
      test_email_queue: {
        Args: {
          p_user_email?: string
        }
        Returns: Json
      }
      test_notification_self_prevention: {
        Args: Record<PropertyKey, never>
        Returns: {
          entity_type: string
          trigger_name: string
          has_self_check: boolean
          notes: string
        }[]
      }
      test_user_signup_process: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      update_organization_member_role: {
        Args: {
          member_id: number
          new_role: string
        }
        Returns: boolean
      }
      update_project_member_role: {
        Args: {
          p_membership_id: number
          p_new_role: string
        }
        Returns: Json
      }
      user_has_org_permission: {
        Args: {
          org_id: number
          required_roles?: string[]
        }
        Returns: boolean
      }
      user_has_pending_invitations: {
        Args: {
          p_user_id: string
        }
        Returns: boolean
      }
      validate_notification_preferences: {
        Args: Record<PropertyKey, never>
        Returns: {
          user_id: string
          email: string
          missing_types: string[]
          preference_count: number
        }[]
      }
    }
    Enums: {
      approval_status:
        | "draft"
        | "submitted"
        | "approved"
        | "declined"
        | "revision_requested"
      attachment_file_type:
        | "image"
        | "document"
        | "spreadsheet"
        | "presentation"
        | "pdf"
        | "video"
        | "audio"
        | "archive"
        | "text"
        | "other"
      delivery_status:
        | "pending"
        | "processing"
        | "sent"
        | "failed"
        | "queued_for_delivery"
      email_status:
        | "pending"
        | "processing"
        | "sent"
        | "failed"
        | "queued_for_delivery"
      entity_type: "site_diary" | "form" | "entries" | "tasks"
      item_type: "question" | "checklist" | "radio_box" | "photo"
      notification_priority: "low" | "medium" | "high" | "critical"
      notification_type:
        | "system"
        | "organization_added"
        | "project_added"
        | "task_assigned"
        | "task_updated"
        | "task_comment"
        | "comment_mention"
        | "task_unassigned"
        | "form_assigned"
        | "form_unassigned"
        | "approval_requested"
        | "approval_status_changed"
        | "entity_assigned"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

