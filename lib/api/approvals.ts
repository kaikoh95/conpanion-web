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

export async function declineApproval(approvalId: number) {
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
    throw new Error("You are not authorized to decline this request");
  }

  // Update the approval status
  const { data: approval, error: updateError } = await supabase
    .from('approvals')
    .update({ status: 'declined' })
    .eq('id', approvalId)
    .select()
    .single();

  if (updateError) {
    throw updateError;
  }

  return approval;
}

export async function submitApproval(approvalId: number) {
  const supabase = createClient();
  
  // Get the current session to access the auth token
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    throw new Error("No active session");
  }

  // Verify that the current user is the requester
  const { data: approvalCheck, error: approvalError } = await supabase
    .from('approvals')
    .select('requester_id')
    .eq('id', approvalId)
    .single();

  if (approvalError || !approvalCheck) {
    throw new Error("Approval not found");
  }

  if (approvalCheck.requester_id !== session.user.id) {
    throw new Error("You are not authorized to submit this request");
  }

  // Update the approval status
  const { data: approval, error: updateError } = await supabase
    .from('approvals')
    .update({ status: 'submitted' })
    .eq('id', approvalId)
    .select()
    .single();

  if (updateError) {
    throw updateError;
  }

  return approval;
}

export async function updateApprovers(approvalId: number, approvers_id: string[]) {
  const supabase = createClient();
  
  // Get the current session to access the auth token
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    throw new Error("No active session");
  }

  // Get current approvers for this approval
  const { data: currentApprovers, error: fetchError } = await supabase
    .from('approval_approvers')
    .select('approver_id')
    .eq('approval_id', approvalId);

  if (fetchError) {
    throw fetchError;
  }

  const currentApproverIds = currentApprovers?.map(a => a.approver_id) || [];

  // Find approvers to remove (in current but not in new list)
  const approversToRemove = currentApproverIds.filter(id => !approvers_id.includes(id));

  // Find approvers to add (in new list but not in current)
  const approversToAdd = approvers_id.filter(id => !currentApproverIds.includes(id));

  // Remove approvers that are no longer needed
  if (approversToRemove.length > 0) {
    const { error: deleteError } = await supabase
      .from('approval_approvers')
      .delete()
      .eq('approval_id', approvalId)
      .in('approver_id', approversToRemove);

    if (deleteError) {
      throw deleteError;
    }
  }

  // Add new approvers
  if (approversToAdd.length > 0) {
    const newApprovers = approversToAdd.map(approver_id => ({
      approval_id: approvalId,
      approver_id: approver_id
    }));

    const { error: insertError } = await supabase
      .from('approval_approvers')
      .insert(newApprovers);

    if (insertError) {
      throw insertError;
    }
  }

  // Return the updated list of approvers
  const { data: updatedApprovers, error: finalFetchError } = await supabase
    .from('approval_approvers')
    .select('approver_id')
    .eq('approval_id', approvalId);

  if (finalFetchError) {
    throw finalFetchError;
  }

  return updatedApprovers;
} 

