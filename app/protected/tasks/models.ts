import { Database } from "@/lib/supabase/types.generated"

export type TaskWithRelations = Database['public']['Tables']['tasks']['Row'] & {
  // Relations
  priorities: Database['public']['Tables']['priorities']['Row'] | null;
  statuses: Database['public']['Tables']['statuses']['Row'] | null;
  
  // Arrays of related entities
  entity_assignees: {
    entity_id: number;
    user_id: string;
    users: {
      id: string;
      raw_user_meta_data: {
        name: string;
        avatar_url?: string;
      };
    };
  }[];
  
  entity_labels: {
    entity_id: number;
    label_id: number;
    labels: Database['public']['Tables']['labels']['Row'];
  }[];
  
  // Convenience arrays
  assignees: string[];
  labels: Database['public']['Tables']['labels']['Row'][];
  
  // Metadata
  metadata: Database['public']['Tables']['task_metadata']['Row'][];
  metadataObj: Record<string, string | null>;
  estimated_hours: number | null;
  actual_hours: number | null;
  
  // Position for ordering
  position: number | null;
};

// Define interface for user data
export type UserData = {
  id: string;
  raw_user_meta_data: {
    name: string;
    avatar_url?: string;
  };
};

export type TaskMetadata = {
  id: number;
  task_id: number;
  title: string;
  value: string;
  created_at: string;
  created_by: string;
  updated_at: string;
};
