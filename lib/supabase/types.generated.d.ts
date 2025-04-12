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
      approvals: {
        Row: {
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
          assigned_to: string[] | null
          created_at: string
          deleted_at: string | null
          id: number
          is_synced: boolean
          last_synced_at: string | null
          name: string
          owner_id: string
          team_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          assigned_to?: string[] | null
          created_at?: string
          deleted_at?: string | null
          id?: never
          is_synced?: boolean
          last_synced_at?: string | null
          name: string
          owner_id: string
          team_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          assigned_to?: string[] | null
          created_at?: string
          deleted_at?: string | null
          id?: never
          is_synced?: boolean
          last_synced_at?: string | null
          name?: string
          owner_id?: string
          team_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
            foreignKeyName: "tasks_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "statuses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_details: {
        Args: {
          user_ids: string[]
        }
        Returns: {
          id: string
          raw_user_meta_data: Json
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
      entity_type: "site_diary" | "form" | "entries" | "tasks"
      item_type: "question" | "checklist" | "radio_box" | "photo"
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

