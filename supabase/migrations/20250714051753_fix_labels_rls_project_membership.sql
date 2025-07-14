-- Fix labels RLS policies based on project membership
-- Requirements:
-- 1. Only users belonging to the project can view existing labels
-- 2. Users can create/update/delete labels if they're either:
--    - The creator of the label
--    - At least a member, admin, or owner of the project

-- First, drop any existing policies on labels table
DROP POLICY IF EXISTS "Users can read labels they have access to" ON public.labels;
DROP POLICY IF EXISTS "Users can insert their own labels" ON public.labels;
DROP POLICY IF EXISTS "Users can update labels they own" ON public.labels;
DROP POLICY IF EXISTS "Users can delete labels they own" ON public.labels;
DROP POLICY IF EXISTS "Users can create labels" ON public.labels;
DROP POLICY IF EXISTS "Users can view labels they created or have access to" ON public.labels;
DROP POLICY IF EXISTS "Users can update labels they created" ON public.labels;
DROP POLICY IF EXISTS "Users can delete labels they created" ON public.labels;

-- Enable RLS on labels table (it was disabled)
ALTER TABLE public.labels ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY: Only users belonging to the project can view labels
CREATE POLICY "Users can view labels if they belong to the project"
ON public.labels
FOR SELECT
USING (
    EXISTS (
        SELECT 1 
        FROM public.projects_users pu
        WHERE pu.project_id = labels.project_id
        AND pu.user_id = auth.uid()
        AND pu.status = 'active'
    )
);

-- CREATE POLICY: Users can create labels if they belong to the project
CREATE POLICY "Users can create labels if they belong to the project"
ON public.labels
FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 
        FROM public.projects_users pu
        WHERE pu.project_id = labels.project_id
        AND pu.user_id = auth.uid()
        AND pu.status = 'active'
        AND pu.role IN ('owner', 'admin', 'member')
    )
    AND labels.created_by = auth.uid()
);

-- UPDATE POLICY: Users can update labels if they created them or have project access
CREATE POLICY "Users can update labels if creator or project member"
ON public.labels
FOR UPDATE
USING (
    labels.created_by = auth.uid()
    OR EXISTS (
        SELECT 1 
        FROM public.projects_users pu
        WHERE pu.project_id = labels.project_id
        AND pu.user_id = auth.uid()
        AND pu.status = 'active'
        AND pu.role IN ('owner', 'admin', 'member')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 
        FROM public.projects_users pu
        WHERE pu.project_id = labels.project_id
        AND pu.user_id = auth.uid()
        AND pu.status = 'active'
        AND pu.role IN ('owner', 'admin', 'member')
    )
);

-- DELETE POLICY: Users can delete labels if they created them or have project access
CREATE POLICY "Users can delete labels if creator or project member"
ON public.labels
FOR DELETE
USING (
    labels.created_by = auth.uid()
    OR EXISTS (
        SELECT 1 
        FROM public.projects_users pu
        WHERE pu.project_id = labels.project_id
        AND pu.user_id = auth.uid()
        AND pu.status = 'active'
        AND pu.role IN ('owner', 'admin', 'member')
    )
);

-- Also fix entity_labels policies to ensure consistency
DROP POLICY IF EXISTS "Users can view task labels they have access to" ON public.entity_labels;
DROP POLICY IF EXISTS "Users can associate labels with their tasks" ON public.entity_labels;
DROP POLICY IF EXISTS "Users can remove labels from their tasks" ON public.entity_labels;
DROP POLICY IF EXISTS "Users can view all entity labels" ON public.entity_labels;
DROP POLICY IF EXISTS "Users can add labels to their tasks" ON public.entity_labels;
DROP POLICY IF EXISTS "Users can remove labels from their tasks" ON public.entity_labels;

-- Enable RLS on entity_labels table (it was disabled)
ALTER TABLE public.entity_labels ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY: Users can view entity labels if they have access to the project
CREATE POLICY "Users can view entity labels if they have project access"
ON public.entity_labels
FOR SELECT
USING (
    CASE 
        WHEN entity_type = 'task' THEN
            EXISTS (
                SELECT 1 
                FROM public.tasks t
                JOIN public.projects_users pu ON pu.project_id = t.project_id
                WHERE t.id = entity_labels.entity_id
                AND pu.user_id = auth.uid()
                AND pu.status = 'active'
            )
        WHEN entity_type = 'form' THEN
            EXISTS (
                SELECT 1 
                FROM public.forms f
                JOIN public.projects_users pu ON pu.project_id = f.project_id
                WHERE f.id = entity_labels.entity_id
                AND pu.user_id = auth.uid()
                AND pu.status = 'active'
            )
        ELSE false
    END
);

-- CREATE POLICY: Users can add labels to entities if they have project access
CREATE POLICY "Users can add labels to entities if they have project access"
ON public.entity_labels
FOR INSERT
WITH CHECK (
    CASE 
        WHEN entity_type = 'task' THEN
            EXISTS (
                SELECT 1 
                FROM public.tasks t
                JOIN public.projects_users pu ON pu.project_id = t.project_id
                WHERE t.id = entity_labels.entity_id
                AND pu.user_id = auth.uid()
                AND pu.status = 'active'
                AND pu.role IN ('owner', 'admin', 'member')
            )
        WHEN entity_type = 'form' THEN
            EXISTS (
                SELECT 1 
                FROM public.forms f
                JOIN public.projects_users pu ON pu.project_id = f.project_id
                WHERE f.id = entity_labels.entity_id
                AND pu.user_id = auth.uid()
                AND pu.status = 'active'
                AND pu.role IN ('owner', 'admin', 'member')
            )
        ELSE false
    END
);

-- DELETE POLICY: Users can remove labels from entities if they have project access
CREATE POLICY "Users can remove labels from entities if they have project access"
ON public.entity_labels
FOR DELETE
USING (
    CASE 
        WHEN entity_type = 'task' THEN
            EXISTS (
                SELECT 1 
                FROM public.tasks t
                JOIN public.projects_users pu ON pu.project_id = t.project_id
                WHERE t.id = entity_labels.entity_id
                AND pu.user_id = auth.uid()
                AND pu.status = 'active'
                AND pu.role IN ('owner', 'admin', 'member')
            )
        WHEN entity_type = 'form' THEN
            EXISTS (
                SELECT 1 
                FROM public.forms f
                JOIN public.projects_users pu ON pu.project_id = f.project_id
                WHERE f.id = entity_labels.entity_id
                AND pu.user_id = auth.uid()
                AND pu.status = 'active'
                AND pu.role IN ('owner', 'admin', 'member')
            )
        ELSE false
    END
);

-- Add a comment to clarify the RLS implementation
COMMENT ON TABLE public.labels IS 'Labels for tasks/forms with RLS enforced based on project membership';
COMMENT ON TABLE public.entity_labels IS 'Junction table for assigning labels to entities (tasks/forms) with RLS enforced';