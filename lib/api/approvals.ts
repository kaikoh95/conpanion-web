import { createClient } from "@/utils/supabase/client";
import { API_ENDPOINTS } from "../config";

export interface CreateApprovalParams {
  entity_type: string;
  entity_id: number;
  requester_id: string;
}

export async function createApproval(params: CreateApprovalParams) {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    throw new Error("No active session");
  }

  const response = await fetch(API_ENDPOINTS.createApproval, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to create approval: ${response.status}`);
  }

  return response.json();
} 