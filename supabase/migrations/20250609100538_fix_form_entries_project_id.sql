-- FIX FORM ENTRIES PROJECT ID
-- This migration fixes the issue with adding project_id to form_entries

-- 1. First add the column without NOT NULL constraint
ALTER TABLE public.form_entries
ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES public.projects(id) ON DELETE CASCADE;

-- 2. Update existing form_entries with project_id from their associated forms
UPDATE public.form_entries fe
SET project_id = f.project_id
FROM public.forms f
WHERE fe.form_id = f.id AND fe.project_id IS NULL;

-- 3. Now add the NOT NULL constraint after data has been populated
ALTER TABLE public.form_entries
ALTER COLUMN project_id SET NOT NULL;

-- 4. Create index on project_id for performance
CREATE INDEX IF NOT EXISTS idx_form_entries_project_id ON public.form_entries(project_id);
