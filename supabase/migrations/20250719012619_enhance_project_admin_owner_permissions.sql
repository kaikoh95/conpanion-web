-- Migration: Enhance Project Admin and Owner Permissions
-- Purpose: Allow Project Admin and Owner roles to perform ALL operations in projects they have access to
-- Date: 2025-01-19
-- Requirements: Project Admin/Owners should have full access to all resources within their projects

-- Helper function to check if user is project admin or owner
CREATE OR REPLACE FUNCTION public.is_project_admin_or_owner(
  p_project_id INTEGER,
  p_user_id UUID DEFAULT auth.uid()
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.projects_users pu
    WHERE pu.project_id = p_project_id
    AND pu.user_id = p_user_id
    AND pu.status = 'active'
    AND pu.role IN ('owner', 'admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- UPDATE TASKS POLICIES
-- ========================================

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can read tasks they have access to" ON public.tasks;
DROP POLICY IF EXISTS "Users can insert their own tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can update tasks they own" ON public.tasks;
DROP POLICY IF EXISTS "Users can delete tasks they own" ON public.tasks;

-- Create enhanced policies for tasks
CREATE POLICY "Users can read tasks in their projects"
ON public.tasks
FOR SELECT
TO authenticated
USING (
  created_by = auth.uid() OR
  public.is_project_admin_or_owner(project_id) OR
  EXISTS (
    SELECT 1 
    FROM public.projects_users pu
    WHERE pu.project_id = tasks.project_id
    AND pu.user_id = auth.uid()
    AND pu.status = 'active'
  )
);

CREATE POLICY "Users can create tasks in their projects"
ON public.tasks
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid() AND
  (
    public.is_project_admin_or_owner(project_id) OR
    EXISTS (
      SELECT 1 
      FROM public.projects_users pu
      WHERE pu.project_id = tasks.project_id
      AND pu.user_id = auth.uid()
      AND pu.status = 'active'
    )
  )
);

CREATE POLICY "Project admins/owners and creators can update tasks"
ON public.tasks
FOR UPDATE
TO authenticated
USING (
  created_by = auth.uid() OR
  public.is_project_admin_or_owner(project_id)
)
WITH CHECK (
  public.is_project_admin_or_owner(project_id) OR
  EXISTS (
    SELECT 1 
    FROM public.projects_users pu
    WHERE pu.project_id = tasks.project_id
    AND pu.user_id = auth.uid()
    AND pu.status = 'active'
  )
);

CREATE POLICY "Project admins/owners and creators can delete tasks"
ON public.tasks
FOR DELETE
TO authenticated
USING (
  created_by = auth.uid() OR
  public.is_project_admin_or_owner(project_id)
);

-- ========================================
-- UPDATE LABELS POLICIES
-- ========================================

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can view labels if they belong to the project" ON public.labels;
DROP POLICY IF EXISTS "Users can create labels if they belong to the project" ON public.labels;
DROP POLICY IF EXISTS "Users can update labels if creator or project member" ON public.labels;
DROP POLICY IF EXISTS "Users can delete labels if creator or project member" ON public.labels;

-- Create enhanced policies for labels
CREATE POLICY "Users can view labels in their projects"
ON public.labels
FOR SELECT
TO authenticated
USING (
  created_by = auth.uid() OR
  public.is_project_admin_or_owner(project_id) OR
  EXISTS (
    SELECT 1 
    FROM public.projects_users pu
    WHERE pu.project_id = labels.project_id
    AND pu.user_id = auth.uid()
    AND pu.status = 'active'
  )
);

CREATE POLICY "Users can create labels in their projects"
ON public.labels
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid() AND
  (
    public.is_project_admin_or_owner(project_id) OR
    EXISTS (
      SELECT 1 
      FROM public.projects_users pu
      WHERE pu.project_id = labels.project_id
      AND pu.user_id = auth.uid()
      AND pu.status = 'active'
    )
  )
);

CREATE POLICY "Project admins/owners and creators can update labels"
ON public.labels
FOR UPDATE
TO authenticated
USING (
  created_by = auth.uid() OR
  public.is_project_admin_or_owner(project_id)
)
WITH CHECK (
  public.is_project_admin_or_owner(project_id) OR
  EXISTS (
    SELECT 1 
    FROM public.projects_users pu
    WHERE pu.project_id = labels.project_id
    AND pu.user_id = auth.uid()
    AND pu.status = 'active'
  )
);

CREATE POLICY "Project admins/owners and creators can delete labels"
ON public.labels
FOR DELETE
TO authenticated
USING (
  created_by = auth.uid() OR
  public.is_project_admin_or_owner(project_id)
);

-- ========================================
-- UPDATE FORMS POLICIES
-- ========================================

-- Drop existing restrictive policies if they exist
DROP POLICY IF EXISTS "Users can read forms they have access to" ON public.forms;
DROP POLICY IF EXISTS "Users can insert their own forms" ON public.forms;
DROP POLICY IF EXISTS "Users can update forms they own" ON public.forms;
DROP POLICY IF EXISTS "Users can delete forms they own" ON public.forms;

-- Create enhanced policies for forms
CREATE POLICY "Users can read forms in their projects"
ON public.forms
FOR SELECT
TO authenticated
USING (
  owner_id = auth.uid() OR
  public.is_project_admin_or_owner(project_id) OR
  EXISTS (
    SELECT 1 
    FROM public.projects_users pu
    WHERE pu.project_id = forms.project_id
    AND pu.user_id = auth.uid()
    AND pu.status = 'active'
  )
);

CREATE POLICY "Users can create forms in their projects"
ON public.forms
FOR INSERT
TO authenticated
WITH CHECK (
  owner_id = auth.uid() AND
  (
    public.is_project_admin_or_owner(project_id) OR
    EXISTS (
      SELECT 1 
      FROM public.projects_users pu
      WHERE pu.project_id = forms.project_id
      AND pu.user_id = auth.uid()
      AND pu.status = 'active'
    )
  )
);

CREATE POLICY "Project admins/owners and creators can update forms"
ON public.forms
FOR UPDATE
TO authenticated
USING (
  owner_id = auth.uid() OR
  public.is_project_admin_or_owner(project_id)
)
WITH CHECK (
  public.is_project_admin_or_owner(project_id) OR
  EXISTS (
    SELECT 1 
    FROM public.projects_users pu
    WHERE pu.project_id = forms.project_id
    AND pu.user_id = auth.uid()
    AND pu.status = 'active'
  )
);

CREATE POLICY "Project admins/owners and creators can delete forms"
ON public.forms
FOR DELETE
TO authenticated
USING (
  owner_id = auth.uid() OR
  public.is_project_admin_or_owner(project_id)
);

-- ========================================
-- UPDATE SITE DIARIES POLICIES
-- ========================================

-- Drop existing restrictive policies if they exist
DROP POLICY IF EXISTS "Users can read site diaries they created" ON public.site_diaries;
DROP POLICY IF EXISTS "Users can create site diaries" ON public.site_diaries;
DROP POLICY IF EXISTS "Users can update site diaries they created" ON public.site_diaries;
DROP POLICY IF EXISTS "Users can delete site diaries they created" ON public.site_diaries;

-- Create enhanced policies for site diaries
CREATE POLICY "Users can read site diaries in their projects"
ON public.site_diaries
FOR SELECT
TO authenticated
USING (
  submitted_by_user_id = auth.uid() OR
  public.is_project_admin_or_owner(project_id) OR
  EXISTS (
    SELECT 1 
    FROM public.projects_users pu
    WHERE pu.project_id = site_diaries.project_id
    AND pu.user_id = auth.uid()
    AND pu.status = 'active'
  )
);

CREATE POLICY "Users can create site diaries in their projects"
ON public.site_diaries
FOR INSERT
TO authenticated
WITH CHECK (
  submitted_by_user_id = auth.uid() AND
  (
    public.is_project_admin_or_owner(project_id) OR
    EXISTS (
      SELECT 1 
      FROM public.projects_users pu
      WHERE pu.project_id = site_diaries.project_id
      AND pu.user_id = auth.uid()
      AND pu.status = 'active'
    )
  )
);

CREATE POLICY "Project admins/owners and creators can update site diaries"
ON public.site_diaries
FOR UPDATE
TO authenticated
USING (
  submitted_by_user_id = auth.uid() OR
  public.is_project_admin_or_owner(project_id)
)
WITH CHECK (
  public.is_project_admin_or_owner(project_id) OR
  EXISTS (
    SELECT 1 
    FROM public.projects_users pu
    WHERE pu.project_id = site_diaries.project_id
    AND pu.user_id = auth.uid()
    AND pu.status = 'active'
  )
);

CREATE POLICY "Project admins/owners and creators can delete site diaries"
ON public.site_diaries
FOR DELETE
TO authenticated
USING (
  submitted_by_user_id = auth.uid() OR
  public.is_project_admin_or_owner(project_id)
);

-- ========================================
-- UPDATE SITE DIARY TEMPLATES POLICIES
-- ========================================

-- Drop existing restrictive policies if they exist
DROP POLICY IF EXISTS "Users can view templates they created" ON public.site_diary_templates;
DROP POLICY IF EXISTS "Users can create templates" ON public.site_diary_templates;
DROP POLICY IF EXISTS "Users can update templates they created" ON public.site_diary_templates;
DROP POLICY IF EXISTS "Users can delete templates they created" ON public.site_diary_templates;

-- Create enhanced policies for site diary templates
CREATE POLICY "Users can read templates in their projects"
ON public.site_diary_templates
FOR SELECT
TO authenticated
USING (
  created_by = auth.uid() OR
  public.is_project_admin_or_owner(project_id) OR
  EXISTS (
    SELECT 1 
    FROM public.projects_users pu
    WHERE pu.project_id = site_diary_templates.project_id
    AND pu.user_id = auth.uid()
    AND pu.status = 'active'
  )
);

CREATE POLICY "Users can create templates in their projects"
ON public.site_diary_templates
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid() AND
  (
    public.is_project_admin_or_owner(project_id) OR
    EXISTS (
      SELECT 1 
      FROM public.projects_users pu
      WHERE pu.project_id = site_diary_templates.project_id
      AND pu.user_id = auth.uid()
      AND pu.status = 'active'
    )
  )
);

CREATE POLICY "Project admins/owners and creators can update templates"
ON public.site_diary_templates
FOR UPDATE
TO authenticated
USING (
  created_by = auth.uid() OR
  public.is_project_admin_or_owner(project_id)
)
WITH CHECK (
  public.is_project_admin_or_owner(project_id) OR
  EXISTS (
    SELECT 1 
    FROM public.projects_users pu
    WHERE pu.project_id = site_diary_templates.project_id
    AND pu.user_id = auth.uid()
    AND pu.status = 'active'
  )
);

CREATE POLICY "Project admins/owners and creators can delete templates"
ON public.site_diary_templates
FOR DELETE
TO authenticated
USING (
  created_by = auth.uid() OR
  public.is_project_admin_or_owner(project_id)
);

-- ========================================
-- UPDATE FORM ENTRIES POLICIES
-- ========================================

-- Drop existing restrictive policies if they exist
DROP POLICY IF EXISTS "Users can read form entries they created" ON public.form_entries;
DROP POLICY IF EXISTS "Users can create form entries" ON public.form_entries;
DROP POLICY IF EXISTS "Users can update form entries they created" ON public.form_entries;
DROP POLICY IF EXISTS "Users can delete form entries they created" ON public.form_entries;

-- Create enhanced policies for form entries
CREATE POLICY "Users can read form entries in their projects"
ON public.form_entries
FOR SELECT
TO authenticated
USING (
  submitted_by_user_id = auth.uid() OR
  EXISTS (
    SELECT 1 
    FROM public.forms f
    JOIN public.projects_users pu ON pu.project_id = f.project_id
    WHERE f.id = form_entries.form_id
    AND pu.user_id = auth.uid()
    AND pu.status = 'active'
    AND (
      pu.role IN ('owner', 'admin') OR
      submitted_by_user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can create form entries in their projects"
ON public.form_entries
FOR INSERT
TO authenticated
WITH CHECK (
  submitted_by_user_id = auth.uid() AND
  EXISTS (
    SELECT 1 
    FROM public.forms f
    JOIN public.projects_users pu ON pu.project_id = f.project_id
    WHERE f.id = form_entries.form_id
    AND pu.user_id = auth.uid()
    AND pu.status = 'active'
  )
);

CREATE POLICY "Project admins/owners and creators can update form entries"
ON public.form_entries
FOR UPDATE
TO authenticated
USING (
  submitted_by_user_id = auth.uid() OR
  EXISTS (
    SELECT 1 
    FROM public.forms f
    WHERE f.id = form_entries.form_id
    AND public.is_project_admin_or_owner(f.project_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 
    FROM public.forms f
    JOIN public.projects_users pu ON pu.project_id = f.project_id
    WHERE f.id = form_entries.form_id
    AND pu.user_id = auth.uid()
    AND pu.status = 'active'
  )
);

CREATE POLICY "Project admins/owners and creators can delete form entries"
ON public.form_entries
FOR DELETE
TO authenticated
USING (
  submitted_by_user_id = auth.uid() OR
  EXISTS (
    SELECT 1 
    FROM public.forms f
    WHERE f.id = form_entries.form_id
    AND public.is_project_admin_or_owner(f.project_id)
  )
);

-- ========================================
-- UPDATE APPROVALS POLICIES
-- ========================================

-- Drop existing restrictive policies if they exist
DROP POLICY IF EXISTS "Users can read approvals they created or are assigned to" ON public.approvals;
DROP POLICY IF EXISTS "Users can create approvals" ON public.approvals;
DROP POLICY IF EXISTS "Users can update approvals they created or are assigned to" ON public.approvals;
DROP POLICY IF EXISTS "Users can delete approvals they created" ON public.approvals;

-- Create enhanced policies for approvals
CREATE POLICY "Users can read approvals in their projects"
ON public.approvals
FOR SELECT
TO authenticated
USING (
  requester_id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.approval_approvers aa
    WHERE aa.approval_id = approvals.id AND aa.approver_id = auth.uid()
  ) OR
  -- Allow project admins/owners to see all approvals in their projects
  (
    (entity_type = 'tasks' AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = approvals.entity_id
      AND public.is_project_admin_or_owner(t.project_id)
    )) OR
    (entity_type = 'form' AND EXISTS (
      SELECT 1 FROM public.forms f
      WHERE f.id = approvals.entity_id
      AND public.is_project_admin_or_owner(f.project_id)
    )) OR
    (entity_type = 'site_diary' AND EXISTS (
      SELECT 1 FROM public.site_diaries sd
      WHERE sd.id = approvals.entity_id
      AND public.is_project_admin_or_owner(sd.project_id)
    )) OR
    (entity_type = 'entries' AND EXISTS (
      SELECT 1 FROM public.form_entries fe
      JOIN public.forms f ON f.id = fe.form_id
      WHERE fe.id = approvals.entity_id
      AND public.is_project_admin_or_owner(f.project_id)
    ))
  )
);

CREATE POLICY "Users can create approvals in their projects"
ON public.approvals
FOR INSERT
TO authenticated
WITH CHECK (
  requester_id = auth.uid() AND
  (
    (entity_type = 'tasks' AND EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.projects_users pu ON pu.project_id = t.project_id
      WHERE t.id = approvals.entity_id
      AND pu.user_id = auth.uid()
      AND pu.status = 'active'
    )) OR
    (entity_type = 'form' AND EXISTS (
      SELECT 1 FROM public.forms f
      JOIN public.projects_users pu ON pu.project_id = f.project_id
      WHERE f.id = approvals.entity_id
      AND pu.user_id = auth.uid()
      AND pu.status = 'active'
    )) OR
    (entity_type = 'site_diary' AND EXISTS (
      SELECT 1 FROM public.site_diaries sd
      JOIN public.projects_users pu ON pu.project_id = sd.project_id
      WHERE sd.id = approvals.entity_id
      AND pu.user_id = auth.uid()
      AND pu.status = 'active'
    )) OR
    (entity_type = 'entries' AND EXISTS (
      SELECT 1 FROM public.form_entries fe
      JOIN public.forms f ON f.id = fe.form_id
      JOIN public.projects_users pu ON pu.project_id = f.project_id
      WHERE fe.id = approvals.entity_id
      AND pu.user_id = auth.uid()
      AND pu.status = 'active'
    ))
  )
);

CREATE POLICY "Project admins/owners and requesters can update approvals"
ON public.approvals
FOR UPDATE
TO authenticated
USING (
  requester_id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.approval_approvers aa
    WHERE aa.approval_id = approvals.id AND aa.approver_id = auth.uid()
  ) OR
  -- Allow project admins/owners to update approvals in their projects
  (
    (entity_type = 'tasks' AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = approvals.entity_id
      AND public.is_project_admin_or_owner(t.project_id)
    )) OR
    (entity_type = 'form' AND EXISTS (
      SELECT 1 FROM public.forms f
      WHERE f.id = approvals.entity_id
      AND public.is_project_admin_or_owner(f.project_id)
    )) OR
    (entity_type = 'site_diary' AND EXISTS (
      SELECT 1 FROM public.site_diaries sd
      WHERE sd.id = approvals.entity_id
      AND public.is_project_admin_or_owner(sd.project_id)
    )) OR
    (entity_type = 'entries' AND EXISTS (
      SELECT 1 FROM public.form_entries fe
      JOIN public.forms f ON f.id = fe.form_id
      WHERE fe.id = approvals.entity_id
      AND public.is_project_admin_or_owner(f.project_id)
    ))
  )
);

CREATE POLICY "Project admins/owners and requesters can delete approvals"
ON public.approvals
FOR DELETE
TO authenticated
USING (
  requester_id = auth.uid() OR
  -- Allow project admins/owners to delete approvals in their projects
  (
    (entity_type = 'tasks' AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = approvals.entity_id
      AND public.is_project_admin_or_owner(t.project_id)
    )) OR
    (entity_type = 'form' AND EXISTS (
      SELECT 1 FROM public.forms f
      WHERE f.id = approvals.entity_id
      AND public.is_project_admin_or_owner(f.project_id)
    )) OR
    (entity_type = 'site_diary' AND EXISTS (
      SELECT 1 FROM public.site_diaries sd
      WHERE sd.id = approvals.entity_id
      AND public.is_project_admin_or_owner(sd.project_id)
    )) OR
    (entity_type = 'entries' AND EXISTS (
      SELECT 1 FROM public.form_entries fe
      JOIN public.forms f ON f.id = fe.form_id
      WHERE fe.id = approvals.entity_id
      AND public.is_project_admin_or_owner(f.project_id)
    ))
  )
);

-- ========================================
-- GRANT PERMISSIONS
-- ========================================

-- Grant execute permission on the helper function
GRANT EXECUTE ON FUNCTION public.is_project_admin_or_owner(INTEGER, UUID) TO authenticated;

-- Add comments for documentation
COMMENT ON FUNCTION public.is_project_admin_or_owner(INTEGER, UUID) IS 'Helper function to check if a user is a project admin or owner';

-- Migration completed successfully
-- Project Admins and Owners now have full access to all operations within their projects
