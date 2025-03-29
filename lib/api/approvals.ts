import { createClient } from "@/utils/supabase/client";

export interface CreateApprovalParams {
  entity_type: string;
  entity_id: number;
  approvers_id: string[];
}

export async function createApproval(params: CreateApprovalParams) {
  const supabase = createClient();
  
  // Get the current session to access the auth token
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    throw new Error("No active session");
  }

  console.log("Current user ID:", session.user.id);

  // First, create the approval
  const { data: approval, error: approvalError } = await supabase
    .from('approvals')
    .insert({
      entity_type: params.entity_type,
      entity_id: params.entity_id,
      requester_id: session.user.id,
    })
    .select()
    .single();

  if (approvalError) {
    console.error("Error creating approval:", approvalError);
    throw approvalError;
  }

  // Then, create the approval_approvers entries
  const approvalApprovers = params.approvers_id.map(approver_id => ({
    approval_id: approval.id,
    approver_id: approver_id
  }));

  const { error: approversError } = await supabase
    .from('approval_approvers')
    .insert(approvalApprovers);

  if (approversError) {
    console.error("Error creating approval approvers:", approversError);
    throw approversError;
  }

  return approval;
}

export async function approveApproval(approvalId: number) {
  const supabase = createClient();
  
  // Get the current session to access the auth token
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    throw new Error("No active session");
  }

  // Verify that the current user is an approver
  const { data: approverCheck, error: approverError } = await supabase
    .from('approval_approvers')
    .select('*')
    .eq('approval_id', approvalId)
    .eq('approver_id', session.user.id)
    .single();

  if (approverError || !approverCheck) {
    throw new Error("You are not authorized to approve this request");
  }

  // Update the approval status
  const { data: approval, error: updateError } = await supabase
    .from('approvals')
    .update({ status: 'approved' })
    .eq('id', approvalId)
    .select()
    .single();

  if (updateError) {
    throw updateError;
  }

  return approval;
} 

