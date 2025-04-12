-- Drop existing policies related to labels
DROP POLICY IF EXISTS "Users can read labels they have access to" ON public.labels;
DROP POLICY IF EXISTS "Users can insert their own labels" ON public.labels;
DROP POLICY IF EXISTS "Users can update labels they own" ON public.labels;
DROP POLICY IF EXISTS "Users can delete labels they own" ON public.labels;

-- Create updated RLS policies

-- READ policy: Allow users to read labels they created OR labels used in tasks they have access to
CREATE POLICY "Users can view labels they created or have access to"
ON public.labels
FOR SELECT
TO authenticated
USING (
  created_by = auth.uid() OR
  id IN (
    SELECT el.label_id 
    FROM public.entity_labels el
    JOIN public.tasks t ON el.entity_id = t.id AND el.entity_type = 'task'
    WHERE t.created_by = auth.uid()
  )
);

-- INSERT policy: Allow users to create labels, but require project_id and name
CREATE POLICY "Users can create labels"
ON public.labels
FOR INSERT
TO authenticated
WITH CHECK (
  TRUE  -- Allow all authenticated users to create labels
);

-- UPDATE policy: Allow users to update labels they've created
CREATE POLICY "Users can update labels they created"
ON public.labels
FOR UPDATE
TO authenticated
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

-- DELETE policy: Allow users to delete labels they've created
CREATE POLICY "Users can delete labels they created"
ON public.labels
FOR DELETE
TO authenticated
USING (created_by = auth.uid());

-- Ensure task_labels junction table has proper policies

-- For task_labels: Drop any existing policies if they exist
DROP POLICY IF EXISTS "Users can view task labels they have access to" ON public.entity_labels;
DROP POLICY IF EXISTS "Users can associate labels with their tasks" ON public.entity_labels;
DROP POLICY IF EXISTS "Users can remove labels from their tasks" ON public.entity_labels;

-- READ policy: Allow users to view labels associated with tasks they have access to
CREATE POLICY "Users can view task labels they have access to"
ON public.entity_labels
FOR SELECT
TO authenticated
USING (
  entity_type = 'task' AND
  entity_id IN (
    SELECT id FROM public.tasks WHERE created_by = auth.uid()
  )
);

-- INSERT policy: Allow users to associate labels with their tasks
CREATE POLICY "Users can associate labels with their tasks"
ON public.entity_labels
FOR INSERT
TO authenticated
WITH CHECK (
  entity_type = 'task' AND
  entity_id IN (
    SELECT id FROM public.tasks WHERE created_by = auth.uid()
  )
);

-- DELETE policy: Allow users to remove labels from their tasks
CREATE POLICY "Users can remove labels from their tasks"
ON public.entity_labels
FOR DELETE
TO authenticated
USING (
  entity_type = 'task' AND
  entity_id IN (
    SELECT id FROM public.tasks WHERE created_by = auth.uid()
  )
); 