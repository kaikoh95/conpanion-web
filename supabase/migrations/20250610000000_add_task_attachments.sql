-- Migration to add task as an entity type for attachments
-- This allows task attachments to be stored in the same way as site diary attachments

-- 1. Update the check constraint on entity_type to include 'task'
ALTER TABLE public.attachments 
DROP CONSTRAINT IF EXISTS attachments_entity_type_check;

ALTER TABLE public.attachments 
ADD CONSTRAINT attachments_entity_type_check 
CHECK (entity_type IN ('form', 'form_entry', 'site_diary', 'task'));

-- 2. Create a function to handle task attachments
CREATE OR REPLACE FUNCTION public.create_task_attachment(
    p_task_id INTEGER,
    p_file_name TEXT,
    p_file_size INTEGER,
    p_file_type TEXT,
    p_storage_path TEXT
)
RETURNS UUID AS $$
DECLARE
    v_project_id INTEGER;
    v_attachment_id UUID;
BEGIN
    -- Get the project_id from the task
    SELECT project_id INTO v_project_id
    FROM public.tasks
    WHERE id = p_task_id;
    
    IF v_project_id IS NULL THEN
        RAISE EXCEPTION 'Task not found or has no project_id';
    END IF;
    
    -- Insert the attachment record
    INSERT INTO public.attachments (
        project_id,
        entity_type,
        entity_id,
        file_name,
        file_size,
        file_type,
        storage_path
    ) VALUES (
        v_project_id,
        'task',
        p_task_id::TEXT,
        p_file_name,
        p_file_size,
        p_file_type,
        p_storage_path
    )
    RETURNING id INTO v_attachment_id;
    
    RETURN v_attachment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment to the function
COMMENT ON FUNCTION public.create_task_attachment IS 'Creates an attachment record for a task';

-- 3. Create a function to get attachments for a task
CREATE OR REPLACE FUNCTION public.get_task_attachments(p_task_id INTEGER)
RETURNS TABLE (
    id UUID,
    file_name TEXT,
    file_size INTEGER,
    file_type TEXT,
    storage_path TEXT,
    created_at TIMESTAMPTZ,
    created_by UUID
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.id,
        a.file_name,
        a.file_size,
        a.file_type::TEXT,
        a.storage_path,
        a.created_at,
        a.created_by
    FROM 
        public.attachments a
    WHERE 
        a.entity_type = 'task'
        AND a.entity_id = p_task_id::TEXT
        AND a.deleted_at IS NULL
    ORDER BY 
        a.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment to the function
COMMENT ON FUNCTION public.get_task_attachments IS 'Retrieves all attachments for a task';

-- 4. Update the task_metadata table directly
-- Check if the table exists before performing operations
DO $$
BEGIN
    -- Create an index entry for has_attachments in task_metadata if task_metadata table exists
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'task_metadata') THEN
        -- Only insert if not already present
        IF NOT EXISTS (SELECT FROM public.task_metadata WHERE title = 'has_attachments') THEN
            -- This is just a placeholder to initialize the metadata type
            -- Actual entries will be added per task when attachments are uploaded
            RAISE NOTICE 'Task metadata table exists, task_attachments metadata type can be used';
        END IF;
    ELSE
        RAISE NOTICE 'Task metadata table does not exist, skipping metadata setup';
    END IF;
END
$$;

-- 5. Update any necessary RLS policies
-- The existing policies for attachments should work as-is, but we'll ensure they're correct

-- Re-create storage policy for reading task attachments
DROP POLICY IF EXISTS "Users can read task attachments" ON storage.objects;
CREATE POLICY "Users can read task attachments"
ON storage.objects
FOR SELECT
USING (
    bucket_id = 'attachments'
    AND (
        -- Extract project ID from path (first segment)
        -- This allows users to access any files where they have project access
        (storage.foldername(name))[1]::integer IN (
            SELECT id FROM public.projects
            WHERE id IN (
                SELECT project_id FROM public.projects_users
                WHERE user_id = auth.uid()
                AND status = 'active'
            )
        )
    )
); 