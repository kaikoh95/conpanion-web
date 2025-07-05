import { createClient } from '@/utils/supabase/client';
import { Database } from '@/lib/supabase/types.generated';

// Use generated types from database
type ApprovalComment = Database['public']['Tables']['approval_comments']['Row'];
type ApprovalApproverResponse = Database['public']['Tables']['approval_approver_responses']['Row'];
type Approval = Database['public']['Tables']['approvals']['Row'];

// Enhanced interfaces for API responses
export interface ApprovalWithDetails {
  id: number;
  status: string;
  created_at: string;
  entity_type: string;
  entity_id: number;
  requester_name: string;
  entity_title: string; // Dynamic based on entity type
  entity_summary: string; // Brief description
  last_updated: string;
}

export interface ApprovalWithEntityDetails extends ApprovalWithDetails {
  entity_data: any; // Will be typed based on entity type
  comments: ApprovalCommentWithUser[];
  approvers: any[]; // Will be enhanced with user details
  approver_responses: ApprovalApproverResponseWithUser[];
}

export interface ApprovalCommentWithUser extends ApprovalComment {
  user_name: string;
}

export interface ApprovalApproverResponseWithUser extends ApprovalApproverResponse {
  approver_name: string;
}

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

// =============================================================================
// NEW ENHANCED APPROVAL WORKFLOW FUNCTIONS
// =============================================================================

/**
 * Get pending approvals for current user (as approver)
 */
export async function getPendingApprovalsForUser(): Promise<ApprovalWithDetails[]> {
  const supabase = createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('No active session');
  }

  // Get approvals where current user is an approver and hasn't responded yet
  const { data: approvals, error } = await supabase
    .from('approvals')
    .select(
      `
      id,
      status,
      created_at,
      entity_type,
      entity_id,
      last_updated,
      requester_id,
      approval_approvers!inner(approver_id)
    `,
    )
    .eq('approval_approvers.approver_id', session.user.id)
    .in('status', ['submitted']) // Only show submitted approvals
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  // Filter out approvals where user has already responded
  const pendingApprovals = [];

  for (const approval of approvals || []) {
    const { data: existingResponse } = await supabase
      .from('approval_approver_responses')
      .select('id')
      .eq('approval_id', approval.id)
      .eq('approver_id', session.user.id)
      .maybeSingle();

    // Only include if user hasn't responded yet
    if (!existingResponse) {
      // Get requester name
      const { data: requesterData } = await supabase.rpc('get_user_details', {
        user_ids: [approval.requester_id],
      });

      const requesterName = requesterData?.[0]?.raw_user_meta_data?.email || 'Unknown';

      // Get entity title based on type (for now, just use ID)
      const entityTitle = await getEntityTitle(approval.entity_type, approval.entity_id);

      pendingApprovals.push({
        ...approval,
        requester_name: requesterName,
        entity_title: entityTitle,
        entity_summary: `${approval.entity_type} #${approval.entity_id}`,
      });
    }
  }

  return pendingApprovals;
}

/**
 * Get approval requests made by current user (as requester)
 */
export async function getMyApprovalRequests(): Promise<ApprovalWithDetails[]> {
  const supabase = createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('No active session');
  }

  const { data: approvals, error } = await supabase
    .from('approvals')
    .select(
      `
      id,
      status,
      created_at,
      entity_type,
      entity_id,
      last_updated,
      requester_id
    `,
    )
    .eq('requester_id', session.user.id)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  // Enhance with entity titles
  const enhancedApprovals = await Promise.all(
    (approvals || []).map(async (approval) => {
      const entityTitle = await getEntityTitle(approval.entity_type, approval.entity_id);

      return {
        ...approval,
        requester_name: 'You',
        entity_title: entityTitle,
        entity_summary: `${approval.entity_type} #${approval.entity_id}`,
      };
    }),
  );

  return enhancedApprovals;
}

/**
 * Get approval details with entity information
 */
export async function getApprovalWithEntityDetails(
  approvalId: number,
): Promise<ApprovalWithEntityDetails> {
  const supabase = createClient();

  // Get basic approval data
  const { data: approval, error: approvalError } = await supabase
    .from('approvals')
    .select(
      `
      *,
      approval_approvers(approver_id)
    `,
    )
    .eq('id', approvalId)
    .single();

  if (approvalError || !approval) {
    throw new Error('Approval not found');
  }

  // Get requester name
  const { data: requesterData } = await supabase.rpc('get_user_details', {
    user_ids: [approval.requester_id],
  });

  const requesterName = requesterData?.[0]?.raw_user_meta_data?.email || 'Unknown';

  // Get entity title and data
  const entityTitle = await getEntityTitle(approval.entity_type, approval.entity_id);
  const entityData = await getEntityData(approval.entity_type, approval.entity_id);

  // Get comments
  const comments = await getApprovalComments(approvalId);

  // Get approver responses
  const approverResponses = await getApproverResponses(approvalId);

  // Get approver details
  const approverIds = approval.approval_approvers?.map((a: any) => a.approver_id) || [];
  const { data: approversData } = await supabase.rpc('get_user_details', {
    user_ids: approverIds,
  });

  const approvers = approversData || [];

  return {
    id: approval.id,
    status: approval.status,
    created_at: approval.created_at,
    entity_type: approval.entity_type,
    entity_id: approval.entity_id,
    requester_name: requesterName,
    entity_title: entityTitle,
    entity_summary: `${approval.entity_type} #${approval.entity_id}`,
    last_updated: approval.last_updated,
    entity_data: entityData,
    comments,
    approvers,
    approver_responses: approverResponses,
  };
}

/**
 * Add comment to approval
 */
export async function addApprovalComment(
  approvalId: number,
  comment: string,
): Promise<ApprovalComment> {
  const supabase = createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('No active session');
  }

  const { data, error } = await supabase
    .from('approval_comments')
    .insert({
      approval_id: approvalId,
      user_id: session.user.id,
      comment: comment.trim(),
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Get comments for approval
 */
export async function getApprovalComments(approvalId: number): Promise<ApprovalCommentWithUser[]> {
  const supabase = createClient();

  const { data: comments, error } = await supabase
    .from('approval_comments')
    .select('*')
    .eq('approval_id', approvalId)
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  // Get user details for comments
  const userIds = Array.from(new Set(comments?.map((c) => c.user_id) || []));
  const { data: usersData } = await supabase.rpc('get_user_details', {
    user_ids: userIds,
  });

  const usersMap = new Map(
    usersData?.map((u: any) => [u.id, u.raw_user_meta_data?.email || 'Unknown']) || [],
  );

  return (comments || []).map((comment) => ({
    ...comment,
    user_name: usersMap.get(comment.user_id) || 'Unknown',
  }));
}

/**
 * Individual approver response (for multiple approver workflow)
 */
export async function submitApproverResponse(
  approvalId: number,
  action: 'approved' | 'declined' | 'revision_requested',
  comment?: string,
): Promise<ApprovalApproverResponse> {
  const supabase = createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('No active session');
  }

  // Verify user is an approver
  const { data: approverCheck } = await supabase
    .from('approval_approvers')
    .select('*')
    .eq('approval_id', approvalId)
    .eq('approver_id', session.user.id)
    .single();

  if (!approverCheck) {
    throw new Error('You are not authorized to approve this request');
  }

  // Insert or update approver response
  const { data, error } = await supabase
    .from('approval_approver_responses')
    .upsert({
      approval_id: approvalId,
      approver_id: session.user.id,
      status: action,
      comment: comment?.trim() || null,
      responded_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  // The trigger will automatically update the overall approval status
  return data;
}

/**
 * Get approver responses for an approval
 */
export async function getApproverResponses(
  approvalId: number,
): Promise<ApprovalApproverResponseWithUser[]> {
  const supabase = createClient();

  const { data: responses, error } = await supabase
    .from('approval_approver_responses')
    .select('*')
    .eq('approval_id', approvalId)
    .order('responded_at', { ascending: true });

  if (error) {
    throw error;
  }

  // Get approver names
  const approverIds = Array.from(new Set(responses?.map((r) => r.approver_id) || []));
  const { data: approversData } = await supabase.rpc('get_user_details', {
    user_ids: approverIds,
  });

  const approversMap = new Map(
    approversData?.map((u: any) => [u.id, u.raw_user_meta_data?.email || 'Unknown']) || [],
  );

  return (responses || []).map((response) => ({
    ...response,
    approver_name: approversMap.get(response.approver_id) || 'Unknown',
  }));
}

/**
 * Check if current user can approve (is an approver and hasn't responded yet)
 */
export async function canUserApprove(approvalId: number): Promise<boolean> {
  const supabase = createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return false;
  }

  // Check if user is an approver
  const { data: approverCheck } = await supabase
    .from('approval_approvers')
    .select('*')
    .eq('approval_id', approvalId)
    .eq('approver_id', session.user.id)
    .single();

  if (!approverCheck) {
    return false;
  }

  // Check if user has already responded
  const { data: existingResponse } = await supabase
    .from('approval_approver_responses')
    .select('id')
    .eq('approval_id', approvalId)
    .eq('approver_id', session.user.id)
    .maybeSingle();

  return !existingResponse;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get entity title for display in lists
 */
async function getEntityTitle(entityType: string, entityId: number): Promise<string> {
  const supabase = createClient();

  try {
    switch (entityType) {
      case 'site_diary':
        const { data: diary } = await supabase
          .from('site_diaries')
          .select('name')
          .eq('id', entityId)
          .single();
        return diary?.name || `Site Diary #${entityId}`;

      case 'form':
        const { data: form } = await supabase
          .from('forms')
          .select('name')
          .eq('id', entityId)
          .single();
        return form?.name || `Form #${entityId}`;

      case 'entries':
        const { data: entry } = await supabase
          .from('form_entries')
          .select('name')
          .eq('id', entityId)
          .single();
        return entry?.name || `Entry #${entityId}`;

      case 'tasks':
        const { data: task } = await supabase
          .from('tasks')
          .select('title')
          .eq('id', entityId)
          .single();
        return task?.title || `Task #${entityId}`;

      default:
        return `${entityType} #${entityId}`;
    }
  } catch (error) {
    console.error('Error getting entity title:', error);
    return `${entityType} #${entityId}`;
  }
}

/**
 * Get entity data for approval detail view
 */
async function getEntityData(entityType: string, entityId: number): Promise<any> {
  const supabase = createClient();

  try {
    switch (entityType) {
      case 'site_diary':
        // Import getSiteDiaryById for complete data
        const { getSiteDiaryById } = await import('@/lib/api/site-diaries');
        const diaryData = await getSiteDiaryById(entityId);
        return diaryData;

      case 'form':
        const { data: form } = await supabase.from('forms').select('*').eq('id', entityId).single();
        return form;

      case 'entries':
        const { data: entry } = await supabase
          .from('form_entries')
          .select('*')
          .eq('id', entityId)
          .single();
        return entry;

      case 'tasks':
        const { data: task } = await supabase.from('tasks').select('*').eq('id', entityId).single();
        return task;

      default:
        return null;
    }
  } catch (error) {
    console.error('Error getting entity data:', error);
    return null;
  }
}
