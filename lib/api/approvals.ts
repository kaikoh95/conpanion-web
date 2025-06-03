import { createClient } from '@/utils/supabase/client';

export interface CreateApprovalParams {
  entity_type: string;
  entity_id: number;
  approvers_id: string[];
}

export async function createApproval(params: CreateApprovalParams) {
  const supabase = createClient();

  // Get the current session to access the auth token
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('No active session');
  }

  console.log('Current user ID:', session.user.id);

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
    console.error('Error creating approval:', approvalError);
    throw approvalError;
  }

  // Then, create the approval_approvers entries
  const approvalApprovers = params.approvers_id.map((approver_id) => ({
    approval_id: approval.id,
    approver_id: approver_id,
  }));

  const { error: approversError } = await supabase
    .from('approval_approvers')
    .insert(approvalApprovers);

  if (approversError) {
    console.error('Error creating approval approvers:', approversError);
    throw approversError;
  }

  return approval;
}

export async function approveApproval(approvalId: number) {
  const supabase = createClient();

  // Get the current session to access the auth token
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('No active session');
  }

  // Verify that the current user is an approver
  const { data: approverCheck, error: approverError } = await supabase
    .from('approval_approvers')
    .select('*')
    .eq('approval_id', approvalId)
    .eq('approver_id', session.user.id)
    .single();

  if (approverError || !approverCheck) {
    throw new Error('You are not authorized to approve this request');
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
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('No active session');
  }

  // Verify that the current user is an approver
  const { data: approverCheck, error: approverError } = await supabase
    .from('approval_approvers')
    .select('*')
    .eq('approval_id', approvalId)
    .eq('approver_id', session.user.id)
    .single();

  if (approverError || !approverCheck) {
    throw new Error('You are not authorized to decline this request');
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

export interface SubmitApprovalRequest {
  entityId: number;
  entityType: string;
  status: 'submitted' | 'approved' | 'declined' | 'revision_requested';
  userId: string;
}

export async function submitApprovalForEntity(request: SubmitApprovalRequest) {
  const supabase = createClient();

  try {
    // First, check if there's an existing approval for this entity
    const { data: existingApproval, error: checkError } = await supabase
      .from('approvals')
      .select('id, status')
      .eq('entity_type', request.entityType)
      .eq('entity_id', request.entityId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (checkError) {
      console.error('Error checking existing approval:', checkError);
      throw new Error(`Failed to check existing approval: ${checkError.message}`);
    }

    if (existingApproval) {
      // Update existing approval
      const { data: updatedApproval, error: updateError } = await supabase
        .from('approvals')
        .update({
          status: request.status,
          user_id: request.userId,
          last_updated: new Date().toISOString(),
        })
        .eq('id', existingApproval.id)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating approval:', updateError);
        throw new Error(`Failed to update approval: ${updateError.message}`);
      }

      return updatedApproval;
    } else {
      // Create new approval
      const { data: newApproval, error: createError } = await supabase
        .from('approvals')
        .insert({
          entity_type: request.entityType,
          entity_id: request.entityId,
          status: request.status,
          user_id: request.userId,
          requester_id: request.userId,
          last_updated: new Date().toISOString(),
        })
        .select()
        .single();

      if (createError) {
        console.error('Error creating approval:', createError);
        throw new Error(`Failed to create approval: ${createError.message}`);
      }

      return newApproval;
    }
  } catch (error) {
    console.error('Error in submitApprovalForEntity:', error);
    throw error;
  }
}

// For backward compatibility
export async function submitApproval(request: SubmitApprovalRequest | number) {
  if (typeof request === 'number') {
    // Old function signature, handle for backward compatibility
    return submitApprovalLegacy(request);
  } else {
    // New function signature
    return submitApprovalForEntity(request);
  }
}

// Renamed old implementation to avoid conflicts
async function submitApprovalLegacy(approvalId: number) {
  const supabase = createClient();

  try {
    // Get the current session to access the auth token
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      console.error('Session error:', sessionError);
      throw new Error('Failed to get session');
    }

    if (!session) {
      throw new Error('No active session');
    }

    console.log('Submitting approval:', { approvalId, userId: session.user.id });

    // Get the approval details including the entity_id
    const { data: approvalCheck, error: approvalError } = await supabase
      .from('approvals')
      .select('entity_id, entity_type, status')
      .eq('id', approvalId)
      .maybeSingle();

    if (approvalError) {
      console.error('Error fetching approval:', approvalError);
      throw new Error(`Failed to fetch approval details: ${approvalError.message}`);
    }

    if (!approvalCheck) {
      console.error('No approval found for ID:', approvalId);
      throw new Error('No approval found with the provided ID');
    }

    console.log('Found approval:', approvalCheck);

    // Check if the approval is in a state that can be submitted
    if (approvalCheck.status !== 'draft' && approvalCheck.status !== 'revision_requested') {
      console.error('Invalid approval status:', approvalCheck.status);
      throw new Error(`Cannot submit approval in ${approvalCheck.status} status`);
    }

    // Get the entry details to check if the user is the requester
    const { data: entryData, error: entryError } = await supabase
      .from('form_entries')
      .select('submitted_by_user_id')
      .eq('id', approvalCheck.entity_id)
      .single();

    if (entryError) {
      console.error('Error fetching entry:', entryError);
      throw new Error(`Failed to fetch entry details: ${entryError.message}`);
    }

    if (!entryData) {
      console.error('No entry found for ID:', approvalCheck.entity_id);
      throw new Error('Entry not found');
    }

    console.log('Found entry:', entryData);

    if (entryData.submitted_by_user_id !== session.user.id) {
      console.error('Unauthorized submission attempt:', {
        entryUserId: entryData.submitted_by_user_id,
        currentUserId: session.user.id,
      });
      throw new Error('You are not authorized to submit this request');
    }

    // Update the approval status
    const { data: approval, error: updateError } = await supabase
      .from('approvals')
      .update({
        status: 'submitted',
        last_updated: new Date().toISOString(),
      })
      .eq('id', approvalId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating approval:', updateError);
      throw new Error(`Failed to update approval status: ${updateError.message}`);
    }

    if (!approval) {
      console.error('No approval returned after update for ID:', approvalId);
      throw new Error('Failed to update approval status');
    }

    console.log('Successfully updated approval:', approval);
    return approval;
  } catch (error) {
    console.error('Error in submitApproval:', error);
    throw error; // Re-throw the error to be handled by the caller
  }
}

export async function updateApprovers(approvalId: number, approvers_id: string[]) {
  const supabase = createClient();

  // Get the current session to access the auth token
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('No active session');
  }

  // Get current approvers for this approval
  const { data: currentApprovers, error: fetchError } = await supabase
    .from('approval_approvers')
    .select('approver_id')
    .eq('approval_id', approvalId);

  if (fetchError) {
    throw fetchError;
  }

  const currentApproverIds = currentApprovers?.map((a) => a.approver_id) || [];

  // Find approvers to remove (in current but not in new list)
  const approversToRemove = currentApproverIds.filter((id) => !approvers_id.includes(id));

  // Find approvers to add (in new list but not in current)
  const approversToAdd = approvers_id.filter((id) => !currentApproverIds.includes(id));

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
    const newApprovers = approversToAdd.map((approver_id) => ({
      approval_id: approvalId,
      approver_id: approver_id,
    }));

    const { error: insertError } = await supabase.from('approval_approvers').insert(newApprovers);

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
