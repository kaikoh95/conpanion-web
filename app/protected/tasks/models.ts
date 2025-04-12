import { Database } from "@/lib/supabase/types.generated"

export type TaskWithRelations = {
  // Basic task data (from the DB)
  id: number;
  created_at: string;
  created_by: string;
  updated_at: string;
  title: string;
  description: string;
  status_id: number;
  priority_id: number;
  project_id: number;
  due_date: string | null;
  
  // Relations
  priorities: {
    id: number;
    name: string;
    color: string | null;
    position: number;
    is_default: boolean;
    project_id: number;
    created_at: string;
    created_by: string;
  } | null;
  
  statuses: {
    id: number;
    name: string;
    color: string | null;
    position: number;
    is_default: boolean;
    project_id: number;
    created_at: string;
    created_by: string;
  } | null;
  
  // Metadata and computed fields
  metadata: TaskMetadata[];
  metadataObj: Record<string, string>;
  estimated_hours: number | null;
  actual_hours: number | null;
  
  // Arrays of related entities
  entity_assignees: {
    entity_id: number;
    user_id: string;
    users: UserData;
  }[];
  
  entity_labels: {
    entity_id: number;
    label_id: number;
    labels: {
      id: number;
      name: string;
      color: string | null;
      description: string | null;
      project_id: number;
      created_at: string;
      created_by: string;
    };
  }[];
  
  // Position for ordering (from entity_positions table)
  position?: number | null;
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
