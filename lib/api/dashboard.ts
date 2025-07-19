import { createClient } from '@/utils/supabase/client';

export interface DashboardTask {
  id: number;
  title: string;
  status: {
    id: number;
    name: string;
    color: string | null;
  } | null;
  priority: {
    id: number;
    name: string;
    color: string | null;
  } | null;
  due_date: string | null;
  created_at: string;
  project?: {
    id: number;
    name: string;
  } | null;
}

export interface DashboardForm {
  id: number;
  name: string;
  created_at: string;
  project?: {
    id: number;
    name: string;
  } | null;
  assigned_by?: {
    name: string;
  } | null;
}

export interface DashboardEntry {
  id: number;
  name: string | null;
  form_name: string;
  created_at: string;
  approval_status: 'draft' | 'submitted' | 'approved' | 'declined' | 'revision_requested' | null;
}

export interface DashboardApproval {
  id: number;
  entity_title: string;
  entity_type: string;
  status: 'draft' | 'submitted' | 'approved' | 'declined' | 'revision_requested';
  created_at: string;
  approvers_count: number;
  pending_count: number;
}

export interface DashboardSiteDiary {
  id: number;
  name: string | null;
  template_name: string;
  created_at: string;
  approval_status: 'draft' | 'submitted' | 'approved' | 'declined' | 'revision_requested' | null;
  project?: {
    id: number;
    name: string;
  } | null;
}

/**
 * Fetch tasks assigned to a user (or current user) in the current project
 */
export async function getUserAssignedTasks(
  projectId?: number,
  limit = 5,
  filterUserId?: string,
  searchTerm?: string,
): Promise<DashboardTask[]> {
  const supabase = createClient();
  const currentUser = (await supabase.auth.getUser()).data.user;

  if (!currentUser || !projectId) return [];

  let taskIds: number[] = [];

  if (filterUserId === undefined) {
    // Show ALL tasks in the project when no specific user is selected
    const { data: allTasks, error: allTasksError } = await supabase
      .from('tasks')
      .select('id')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (allTasksError || !allTasks?.length) {
      return [];
    }

    taskIds = allTasks.map((task) => task.id);
  } else {
    // Show tasks assigned to specific user
    const targetUserId = filterUserId || currentUser.id;

    // Get user's assigned task IDs first
    const { data: assignedTasks, error: assignError } = await supabase
      .from('entity_assignees')
      .select('entity_id')
      .eq('entity_type', 'task')
      .eq('user_id', targetUserId)
      .order('assigned_at', { ascending: false })
      .limit(limit);

    if (assignError || !assignedTasks?.length) {
      return [];
    }

    taskIds = assignedTasks.map((item) => item.entity_id);
  }

  // Get full task details filtered by project
  let tasksQuery = supabase.from('tasks').select('*').in('id', taskIds).eq('project_id', projectId);

  // Add search filter if provided
  if (searchTerm && searchTerm.trim() !== '') {
    tasksQuery = tasksQuery.ilike('title', `%${searchTerm.trim()}%`);
  }

  const { data: tasks, error } = await tasksQuery;

  if (error || !tasks) {
    return [];
  }

  // Get related data separately to avoid complex joins
  const results: DashboardTask[] = [];

  for (const task of tasks) {
    // Get status
    const { data: status } = await supabase
      .from('statuses')
      .select('id, name, color')
      .eq('id', task.status_id)
      .single();

    // Get priority
    const { data: priority } = await supabase
      .from('priorities')
      .select('id, name, color')
      .eq('id', task.priority_id)
      .single();

    // Get project
    let project = null;
    if (task.project_id) {
      const { data: projectData } = await supabase
        .from('projects')
        .select('id, name')
        .eq('id', task.project_id)
        .single();
      project = projectData;
    }

    results.push({
      id: task.id,
      title: task.title,
      status,
      priority,
      due_date: task.due_date,
      created_at: task.created_at,
      project,
    });
  }

  return results;
}

/**
 * Fetch forms assigned to a user (or current user) in the current project
 */
export async function getUserAssignedForms(
  projectId?: number,
  limit = 5,
  filterUserId?: string,
  searchTerm?: string,
): Promise<DashboardForm[]> {
  const supabase = createClient();
  const currentUser = (await supabase.auth.getUser()).data.user;

  if (!currentUser || !projectId) return [];

  const results: DashboardForm[] = [];

  if (filterUserId === undefined) {
    // Show ALL forms in the project when no specific user is selected
    let formsQuery = supabase
      .from('forms')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(limit);

    // Add search filter if provided
    if (searchTerm && searchTerm.trim() !== '') {
      formsQuery = formsQuery.ilike('name', `%${searchTerm.trim()}%`);
    }

    const { data: allForms, error: allFormsError } = await formsQuery;

    if (allFormsError || !allForms?.length) {
      return [];
    }

    for (const form of allForms) {
      // Get project
      let project = null;
      if (form.project_id) {
        const { data: projectData } = await supabase
          .from('projects')
          .select('id, name')
          .eq('id', form.project_id)
          .single();
        project = projectData;
      }

      results.push({
        id: form.id,
        name: form.name,
        created_at: form.created_at,
        project,
        assigned_by: null, // No specific assignment for "all" view
      });
    }
  } else {
    // Show forms assigned to specific user
    const targetUserId = filterUserId || currentUser.id;

    // Get user's assigned form IDs
    const { data: assignedForms, error: assignError } = await supabase
      .from('entity_assignees')
      .select('entity_id, assigned_by')
      .eq('entity_type', 'form')
      .eq('user_id', targetUserId)
      .order('assigned_at', { ascending: false })
      .limit(limit);

    if (assignError || !assignedForms?.length) {
      return [];
    }

    for (const assignment of assignedForms) {
      // Get form details filtered by project
      let formQuery = supabase
        .from('forms')
        .select('*')
        .eq('id', assignment.entity_id)
        .eq('project_id', projectId);

      // Add search filter if provided
      if (searchTerm && searchTerm.trim() !== '') {
        formQuery = formQuery.ilike('name', `%${searchTerm.trim()}%`);
      }

      const { data: form } = await formQuery.single();

      if (!form) continue;

      // Get project
      let project = null;
      if (form.project_id) {
        const { data: projectData } = await supabase
          .from('projects')
          .select('id, name')
          .eq('id', form.project_id)
          .single();
        project = projectData;
      }

      // Get assigner info
      let assigned_by = null;
      if (assignment.assigned_by) {
        const { data: userProfile } = await supabase
          .from('user_profiles')
          .select('first_name, last_name, global_display_name')
          .eq('id', assignment.assigned_by)
          .single();

        if (userProfile) {
          const name =
            userProfile.global_display_name ||
            (userProfile.first_name && userProfile.last_name
              ? `${userProfile.first_name} ${userProfile.last_name}`
              : 'Someone');
          assigned_by = { name };
        }
      }

      results.push({
        id: form.id,
        name: form.name,
        created_at: form.created_at,
        project,
        assigned_by,
      });
    }
  }

  return results;
}

/**
 * Fetch entries submitted by a user (or current user) in the current project
 */
export async function getUserSubmittedEntries(
  projectId?: number,
  limit = 5,
  filterUserId?: string,
  searchTerm?: string,
): Promise<DashboardEntry[]> {
  const supabase = createClient();
  const currentUser = (await supabase.auth.getUser()).data.user;

  if (!currentUser || !projectId) return [];

  let entriesQuery;

  if (filterUserId === undefined) {
    // Show ALL entries in the project when no specific user is selected
    entriesQuery = supabase
      .from('form_entries')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(limit);
  } else {
    // Show entries submitted by specific user
    const targetUserId = filterUserId || currentUser.id;

    entriesQuery = supabase
      .from('form_entries')
      .select('*')
      .eq('submitted_by_user_id', targetUserId)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(limit);
  }

  // Add search filter if provided
  if (searchTerm && searchTerm.trim() !== '') {
    entriesQuery = entriesQuery.ilike('name', `%${searchTerm.trim()}%`);
  }

  const { data: entries, error } = await entriesQuery;

  if (error || !entries) {
    return [];
  }

  const results: DashboardEntry[] = [];

  for (const entry of entries) {
    // Get form name
    const { data: form } = await supabase
      .from('forms')
      .select('name')
      .eq('id', entry.form_id)
      .single();

    // Get approval status
    const { data: approval } = await supabase
      .from('approvals')
      .select('status')
      .eq('entity_type', 'entries')
      .eq('entity_id', entry.id)
      .single();

    results.push({
      id: entry.id,
      name: entry.name,
      form_name: form?.name || 'Unknown Form',
      created_at: entry.created_at,
      approval_status: approval?.status || null,
    });
  }

  return results;
}

/**
 * Fetch site diaries submitted by a user (or current user) in the current project
 */
export async function getUserSubmittedSiteDiaries(
  projectId?: number,
  limit = 5,
  filterUserId?: string,
  searchTerm?: string,
): Promise<DashboardSiteDiary[]> {
  const supabase = createClient();
  const currentUser = (await supabase.auth.getUser()).data.user;

  if (!currentUser || !projectId) return [];

  let siteDiariesQuery;

  if (filterUserId === undefined) {
    // Show ALL site diaries in the project when no specific user is selected
    siteDiariesQuery = supabase
      .from('site_diaries')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(limit);
  } else {
    // Show site diaries submitted by specific user
    const targetUserId = filterUserId || currentUser.id;

    siteDiariesQuery = supabase
      .from('site_diaries')
      .select('*')
      .eq('submitted_by_user_id', targetUserId)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(limit);
  }

  // Add search filter if provided
  if (searchTerm && searchTerm.trim() !== '') {
    siteDiariesQuery = siteDiariesQuery.ilike('name', `%${searchTerm.trim()}%`);
  }

  const { data: siteDiaries, error } = await siteDiariesQuery;

  if (error || !siteDiaries) {
    return [];
  }

  const results: DashboardSiteDiary[] = [];

  for (const diary of siteDiaries) {
    // Get template name
    const { data: template } = await supabase
      .from('site_diary_templates')
      .select('name')
      .eq('id', diary.template_id)
      .single();

    // Get project
    let project = null;
    if (diary.project_id) {
      const { data: projectData } = await supabase
        .from('projects')
        .select('id, name')
        .eq('id', diary.project_id)
        .single();
      project = projectData;
    }

    // Get approval status
    const { data: approval } = await supabase
      .from('approvals')
      .select('status')
      .eq('entity_type', 'site_diary')
      .eq('entity_id', diary.id)
      .single();

    results.push({
      id: diary.id,
      name: diary.name,
      template_name: template?.name || 'Unknown Template',
      created_at: diary.created_at,
      approval_status: approval?.status || null,
      project,
    });
  }

  return results;
}

/**
 * Fetch approvals requested by a user (or current user) in the current project
 */
export async function getUserRequestedApprovals(
  projectId?: number,
  limit = 5,
  filterUserId?: string,
  searchTerm?: string,
): Promise<DashboardApproval[]> {
  const supabase = createClient();
  const currentUser = (await supabase.auth.getUser()).data.user;

  if (!currentUser || !projectId) return [];

  let approvalsQuery;

  if (filterUserId === undefined) {
    // Show ALL approvals in the project when no specific user is selected
    approvalsQuery = supabase
      .from('approvals')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(limit);
  } else {
    // Show approvals requested by specific user
    const targetUserId = filterUserId || currentUser.id;

    approvalsQuery = supabase
      .from('approvals')
      .select('*')
      .eq('requester_id', targetUserId)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(limit);
  }

  // Note: Search functionality for approvals is limited since entity_title is constructed from related entities
  const { data: approvals, error } = await approvalsQuery;

  if (error || !approvals) {
    return [];
  }

  const results: DashboardApproval[] = [];

  for (const approval of approvals) {
    // Get entity title
    let entityTitle = 'Unknown Item';

    try {
      switch (approval.entity_type) {
        case 'tasks':
          const { data: task } = await supabase
            .from('tasks')
            .select('title')
            .eq('id', approval.entity_id)
            .single();
          entityTitle = task?.title || 'Unknown Task';
          break;
        case 'form':
          const { data: form } = await supabase
            .from('forms')
            .select('name')
            .eq('id', approval.entity_id)
            .single();
          entityTitle = form?.name || 'Unknown Form';
          break;
        case 'entries':
          const { data: entry } = await supabase
            .from('form_entries')
            .select('name')
            .eq('id', approval.entity_id)
            .single();
          entityTitle = entry?.name || 'Unknown Entry';
          break;
        case 'site_diary':
          const { data: diary } = await supabase
            .from('site_diaries')
            .select('name')
            .eq('id', approval.entity_id)
            .single();
          entityTitle = diary?.name || 'Unknown Site Diary';
          break;
      }
    } catch (error) {
      console.error('Error fetching entity title:', error);
    }

    // Get approvers count
    const { count: approversCount } = await supabase
      .from('approval_approvers')
      .select('*', { count: 'exact' })
      .eq('approval_id', approval.id);

    // Get responses count
    const { count: responsesCount } = await supabase
      .from('approval_approver_responses')
      .select('*', { count: 'exact' })
      .eq('approval_id', approval.id);

    results.push({
      id: approval.id,
      entity_title: entityTitle,
      entity_type: approval.entity_type,
      status: approval.status,
      created_at: approval.created_at,
      approvers_count: approversCount || 0,
      pending_count: (approversCount || 0) - (responsesCount || 0),
    });
  }

  return results;
}

/**
 * Fetch summary statistics for the user's dashboard in the current project
 */
export async function getDashboardStats(
  projectId?: number,
  filterUserId?: string,
  searchTerm?: string,
) {
  const supabase = createClient();
  const currentUser = (await supabase.auth.getUser()).data.user;

  if (!currentUser || !projectId) return null;

  if (filterUserId === undefined) {
    // Show ALL counts in the project when no specific user is selected
    let tasksQuery = supabase
      .from('tasks')
      .select('id', { count: 'exact' })
      .eq('project_id', projectId);

    let formsQuery = supabase
      .from('forms')
      .select('id', { count: 'exact' })
      .eq('project_id', projectId);

    let entriesQuery = supabase
      .from('form_entries')
      .select('id', { count: 'exact' })
      .eq('project_id', projectId);

    let approvalsQuery = supabase
      .from('approvals')
      .select('id', { count: 'exact' })
      .eq('project_id', projectId);

    let siteDiariesQuery = supabase
      .from('site_diaries')
      .select('id', { count: 'exact' })
      .eq('project_id', projectId);

    // Apply search filters if provided
    if (searchTerm && searchTerm.trim() !== '') {
      const trimmedSearch = searchTerm.trim();
      tasksQuery = tasksQuery.ilike('title', `%${trimmedSearch}%`);
      formsQuery = formsQuery.ilike('name', `%${trimmedSearch}%`);
      entriesQuery = entriesQuery.ilike('name', `%${trimmedSearch}%`);
      siteDiariesQuery = siteDiariesQuery.ilike('name', `%${trimmedSearch}%`);
      // Note: Skipping search for approvals due to complex entity_title construction
    }

    const [tasksResult, formsResult, entriesResult, approvalsResult, siteDiariesResult] =
      await Promise.all([tasksQuery, formsQuery, entriesQuery, approvalsQuery, siteDiariesQuery]);

    return {
      totalTasks: tasksResult.count || 0,
      totalForms: formsResult.count || 0,
      totalEntries: entriesResult.count || 0,
      totalApprovals: approvalsResult.count || 0,
      totalSiteDiaries: siteDiariesResult.count || 0,
    };
  } else {
    // Show counts for specific user
    const targetUserId = filterUserId || currentUser.id;

    // For entity_assignees, we need to join to get the actual entity's project
    const [tasksResult, formsResult, entriesResult, approvalsResult, siteDiariesResult] =
      await Promise.all([
        // Count tasks by joining with tasks table
        supabase
          .from('entity_assignees')
          .select('entity_id', { count: 'exact' })
          .eq('entity_type', 'task')
          .eq('user_id', targetUserId)
          .then(async (result) => {
            if (result.error || !result.data?.length) return { count: 0 };

            const taskIds = result.data.map((item) => item.entity_id);
            let tasksQuery = supabase
              .from('tasks')
              .select('id', { count: 'exact' })
              .in('id', taskIds)
              .eq('project_id', projectId);

            // Apply search filter if provided
            if (searchTerm && searchTerm.trim() !== '') {
              tasksQuery = tasksQuery.ilike('title', `%${searchTerm.trim()}%`);
            }

            const tasksInProject = await tasksQuery;
            return { count: tasksInProject.count || 0 };
          }),

        // Count forms by joining with forms table
        supabase
          .from('entity_assignees')
          .select('entity_id', { count: 'exact' })
          .eq('entity_type', 'form')
          .eq('user_id', targetUserId)
          .then(async (result) => {
            if (result.error || !result.data?.length) return { count: 0 };

            const formIds = result.data.map((item) => item.entity_id);
            let formsQuery = supabase
              .from('forms')
              .select('id', { count: 'exact' })
              .in('id', formIds)
              .eq('project_id', projectId);

            // Apply search filter if provided
            if (searchTerm && searchTerm.trim() !== '') {
              formsQuery = formsQuery.ilike('name', `%${searchTerm.trim()}%`);
            }

            const formsInProject = await formsQuery;
            return { count: formsInProject.count || 0 };
          }),

        // Count entries with search filter
        (async () => {
          let entriesQuery = supabase
            .from('form_entries')
            .select('id', { count: 'exact' })
            .eq('submitted_by_user_id', targetUserId)
            .eq('project_id', projectId);

          // Apply search filter if provided
          if (searchTerm && searchTerm.trim() !== '') {
            entriesQuery = entriesQuery.ilike('name', `%${searchTerm.trim()}%`);
          }

          return await entriesQuery;
        })(),

        // Count approvals (no search filter due to complex entity_title)
        supabase
          .from('approvals')
          .select('id', { count: 'exact' })
          .eq('requester_id', targetUserId)
          .eq('project_id', projectId),

        // Count site diaries with search filter
        (async () => {
          let siteDiariesQuery = supabase
            .from('site_diaries')
            .select('id', { count: 'exact' })
            .eq('submitted_by_user_id', targetUserId)
            .eq('project_id', projectId);

          // Apply search filter if provided
          if (searchTerm && searchTerm.trim() !== '') {
            siteDiariesQuery = siteDiariesQuery.ilike('name', `%${searchTerm.trim()}%`);
          }

          return await siteDiariesQuery;
        })(),
      ]);

    return {
      totalTasks: tasksResult.count || 0,
      totalForms: formsResult.count || 0,
      totalEntries: entriesResult.count || 0,
      totalApprovals: approvalsResult.count || 0,
      totalSiteDiaries: siteDiariesResult.count || 0,
    };
  }
}
