-- Create a new task_metadata table to store generic metadata
CREATE TABLE IF NOT EXISTS public.task_metadata (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL, -- Metadata key/type (e.g., 'estimated_hours', 'actual_hours', etc.)
  value TEXT, -- Metadata value as text, can be parsed by the application
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  
  -- Ensure one metadata value per task and title
  UNIQUE(task_id, title)
);

-- Create index for better query performance
CREATE INDEX task_metadata_task_id_idx ON public.task_metadata(task_id);
CREATE INDEX task_metadata_title_idx ON public.task_metadata(title);
CREATE INDEX task_metadata_created_by_idx ON public.task_metadata(created_by);

-- Enable Row Level Security
ALTER TABLE public.task_metadata ENABLE ROW LEVEL SECURITY;

-- Add updated_at trigger
CREATE TRIGGER handle_task_metadata_updated_at
    BEFORE UPDATE ON public.task_metadata
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- Migrate existing data from tasks table to task_metadata
INSERT INTO public.task_metadata (task_id, title, value, created_by)
SELECT id, 'estimated_hours', estimated_hours::text, created_by
FROM public.tasks
WHERE estimated_hours IS NOT NULL;

INSERT INTO public.task_metadata (task_id, title, value, created_by)
SELECT id, 'actual_hours', actual_hours::text, created_by
FROM public.tasks
WHERE actual_hours IS NOT NULL;

-- RLS Policies for task_metadata

-- SELECT policy: Users can view metadata for tasks they have access to
CREATE POLICY "Users can view task metadata they have access to"
ON public.task_metadata
FOR SELECT
TO authenticated
USING (
  task_id IN (
    SELECT id FROM public.tasks WHERE created_by = auth.uid()
  )
);

-- INSERT policy: Users can create metadata for their tasks
CREATE POLICY "Users can create metadata for their tasks"
ON public.task_metadata
FOR INSERT
TO authenticated
WITH CHECK (
  task_id IN (
    SELECT id FROM public.tasks WHERE created_by = auth.uid()
  )
);

-- UPDATE policy: Users can update metadata for their tasks
CREATE POLICY "Users can update metadata for their tasks"
ON public.task_metadata
FOR UPDATE
TO authenticated
USING (
  task_id IN (
    SELECT id FROM public.tasks WHERE created_by = auth.uid()
  )
)
WITH CHECK (
  task_id IN (
    SELECT id FROM public.tasks WHERE created_by = auth.uid()
  )
);

-- DELETE policy: Users can delete metadata for their tasks
CREATE POLICY "Users can delete metadata for their tasks"
ON public.task_metadata
FOR DELETE
TO authenticated
USING (
  task_id IN (
    SELECT id FROM public.tasks WHERE created_by = auth.uid()
  )
);

-- Remove columns from tasks table after data migration
ALTER TABLE public.tasks 
DROP COLUMN IF EXISTS estimated_hours,
DROP COLUMN IF EXISTS actual_hours; 