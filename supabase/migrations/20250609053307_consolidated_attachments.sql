-- CONSOLIDATED ATTACHMENTS MIGRATION
-- This migration combines all attachment-related functionality into a single file

-- Note: project_id column is handled in a separate migration (20250609100538_fix_form_entries_project_id.sql)
-- to ensure proper handling of existing records

-- Create a trigger to automatically populate project_id on new inserts
CREATE OR REPLACE FUNCTION set_form_entry_project_id()
RETURNS TRIGGER AS $$
BEGIN
    -- Get project_id from the referenced form
    SELECT project_id INTO NEW.project_id
    FROM public.forms
    WHERE id = NEW.form_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_form_entry_project_id ON public.form_entries;
CREATE TRIGGER trigger_set_form_entry_project_id
BEFORE INSERT ON public.form_entries
FOR EACH ROW
EXECUTE FUNCTION set_form_entry_project_id();

-- 2. Create attachment file type enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attachment_file_type') THEN
        CREATE TYPE public.attachment_file_type AS ENUM (
            'image', 
            'document', 
            'spreadsheet', 
            'presentation',
            'pdf',
            'video',
            'audio',
            'archive',
            'text',
            'other'
        );
    END IF;
END$$;

-- 3. Create attachments table
CREATE TABLE IF NOT EXISTS public.attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id INTEGER NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('form', 'form_entry', 'site_diary')),
    entity_id TEXT NOT NULL, -- Using TEXT to handle various ID types (bigint, uuid, etc.)
    file_name TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    file_type public.attachment_file_type NOT NULL,
    storage_path TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    
    -- Enforce file size limit of 30MB (30 * 1024 * 1024 bytes)
    CONSTRAINT attachment_file_size_limit CHECK (file_size <= 31457280)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_attachments_project_id ON public.attachments(project_id);
CREATE INDEX IF NOT EXISTS idx_attachments_entity_lookup ON public.attachments(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_attachments_created_by ON public.attachments(created_by) WHERE created_by IS NOT NULL;

-- Add comments
COMMENT ON TABLE public.attachments IS 'Stores metadata for files attached to various entities';
COMMENT ON COLUMN public.attachments.entity_type IS 'The type of entity this attachment belongs to (form, form_entry, or site_diary)';
COMMENT ON COLUMN public.attachments.entity_id IS 'The ID of the entity this attachment belongs to';
COMMENT ON COLUMN public.attachments.file_size IS 'File size in bytes, limited to 30MB';
COMMENT ON COLUMN public.attachments.storage_path IS 'Path to the file in storage buckets';

-- 4. Create helper functions for attachments

-- Function to determine file type based on mime type or extension
CREATE OR REPLACE FUNCTION public.get_attachment_type(file_type TEXT, file_name TEXT)
RETURNS public.attachment_file_type AS $$
DECLARE
    extension TEXT;
    mime_prefix TEXT;
BEGIN
    -- Extract mime type prefix if present
    mime_prefix := SPLIT_PART(file_type, '/', 1);
    
    -- Extract file extension from name
    extension := LOWER(SUBSTRING(file_name FROM '\.([^\.]+)$'));
    
    -- Categorize by mime type prefix first
    IF mime_prefix = 'image' THEN
        RETURN 'image'::public.attachment_file_type;
    ELSIF mime_prefix = 'video' THEN
        RETURN 'video'::public.attachment_file_type;
    ELSIF mime_prefix = 'audio' THEN
        RETURN 'audio'::public.attachment_file_type;
    ELSIF file_type = 'application/pdf' THEN
        RETURN 'pdf'::public.attachment_file_type;
    ELSIF file_type IN ('application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.oasis.opendocument.text') THEN
        RETURN 'document'::public.attachment_file_type;
    ELSIF file_type IN ('application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.oasis.opendocument.spreadsheet') THEN
        RETURN 'spreadsheet'::public.attachment_file_type;
    ELSIF file_type IN ('application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.oasis.opendocument.presentation') THEN
        RETURN 'presentation'::public.attachment_file_type;
    ELSIF file_type IN ('application/zip', 'application/x-rar-compressed', 'application/x-tar', 'application/gzip') THEN
        RETURN 'archive'::public.attachment_file_type;
    ELSIF file_type IN ('text/plain', 'text/csv', 'text/html', 'text/css', 'application/json', 'application/xml') THEN
        RETURN 'text'::public.attachment_file_type;
    END IF;
    
    -- Fall back to extension-based categorization
    IF extension IN ('jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp') THEN
        RETURN 'image'::public.attachment_file_type;
    ELSIF extension IN ('mp4', 'mov', 'avi', 'wmv', 'flv', 'webm') THEN
        RETURN 'video'::public.attachment_file_type;
    ELSIF extension IN ('mp3', 'wav', 'ogg', 'flac', 'aac') THEN
        RETURN 'audio'::public.attachment_file_type;
    ELSIF extension = 'pdf' THEN
        RETURN 'pdf'::public.attachment_file_type;
    ELSIF extension IN ('doc', 'docx', 'odt', 'rtf', 'txt') THEN
        RETURN 'document'::public.attachment_file_type;
    ELSIF extension IN ('xls', 'xlsx', 'ods', 'csv') THEN
        RETURN 'spreadsheet'::public.attachment_file_type;
    ELSIF extension IN ('ppt', 'pptx', 'odp') THEN
        RETURN 'presentation'::public.attachment_file_type;
    ELSIF extension IN ('zip', 'rar', 'tar', 'gz', '7z') THEN
        RETURN 'archive'::public.attachment_file_type;
    ELSIF extension IN ('txt', 'md', 'json', 'xml', 'html', 'css', 'js') THEN
        RETURN 'text'::public.attachment_file_type;
    END IF;
    
    -- Default if no match
    RETURN 'other'::public.attachment_file_type;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create a function to generate the storage path for an attachment
CREATE OR REPLACE FUNCTION public.generate_attachment_path(
    project_id INTEGER, 
    entity_type TEXT, 
    entity_id TEXT, 
    file_name TEXT
) 
RETURNS TEXT AS $$
BEGIN
    RETURN project_id || '/' || entity_type || '/' || entity_id || '/' || file_name;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 5. Create triggers for attachment management

-- Create function to auto-generate storage path
CREATE OR REPLACE FUNCTION generate_attachment_storage_path()
RETURNS TRIGGER AS $$
BEGIN
    -- Generate the storage path: project_id/entity_type/entity_id/filename
    NEW.storage_path := NEW.project_id || '/' || NEW.entity_type || '/' || NEW.entity_id || '/' || NEW.file_name;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to auto-generate storage path before insert
DROP TRIGGER IF EXISTS attachment_generate_storage_path ON public.attachments;
CREATE TRIGGER attachment_generate_storage_path
BEFORE INSERT ON public.attachments
FOR EACH ROW
EXECUTE FUNCTION generate_attachment_storage_path();

-- Create a trigger to automatically set the file_type column based on mime type and file name
CREATE OR REPLACE FUNCTION set_attachment_file_type()
RETURNS TRIGGER AS $$
BEGIN
    NEW.file_type := public.get_attachment_type(NEW.file_type::text, NEW.file_name);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add a trigger to the attachments table for file type
DROP TRIGGER IF EXISTS trigger_set_attachment_file_type ON public.attachments;
CREATE TRIGGER trigger_set_attachment_file_type
BEFORE INSERT ON public.attachments
FOR EACH ROW
EXECUTE FUNCTION set_attachment_file_type();

-- Create function to handle attachment deletion
CREATE OR REPLACE FUNCTION handle_attachment_deleted()
RETURNS TRIGGER AS $$
BEGIN
    -- Mark the record as deleted instead of removing it
    -- This allows us to keep track of deleted files and potentially restore them
    NEW.deleted_at := now();
    NEW.deleted_by := auth.uid();
    
    -- Return the modified record for soft deletion
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for soft delete
DROP TRIGGER IF EXISTS attachment_soft_delete ON public.attachments;
CREATE TRIGGER attachment_soft_delete
BEFORE DELETE ON public.attachments
FOR EACH ROW
WHEN (OLD.deleted_at IS NULL)
EXECUTE FUNCTION handle_attachment_deleted();

-- Add updated_at trigger for attachments
DROP TRIGGER IF EXISTS set_attachments_updated_at ON public.attachments;
CREATE TRIGGER set_attachments_updated_at
BEFORE UPDATE ON public.attachments
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Create function to populate created_by and updated_by on insert
CREATE OR REPLACE FUNCTION set_attachment_user_tracking()
RETURNS TRIGGER AS $$
BEGIN
    -- Set created_by and updated_by to current user on insert
    NEW.created_by := auth.uid();
    NEW.updated_by := auth.uid();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to set user tracking fields on insert
DROP TRIGGER IF EXISTS attachment_set_user_tracking ON public.attachments;
CREATE TRIGGER attachment_set_user_tracking
BEFORE INSERT ON public.attachments
FOR EACH ROW
EXECUTE FUNCTION set_attachment_user_tracking();

-- Create function to update the updated_by field
CREATE OR REPLACE FUNCTION update_attachment_updated_by()
RETURNS TRIGGER AS $$
BEGIN
    -- Only update the updated_by field
    NEW.updated_by := auth.uid();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update user tracking on update
DROP TRIGGER IF EXISTS attachment_update_user_tracking ON public.attachments;
CREATE TRIGGER attachment_update_user_tracking
BEFORE UPDATE ON public.attachments
FOR EACH ROW
EXECUTE FUNCTION update_attachment_updated_by();

-- 6. Create storage bucket for attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'attachments',
    'attachments',
    false,
    31457280, -- 30MB limit in bytes
    ARRAY[
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/svg+xml',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain',
        'text/csv'
    ]
)
ON CONFLICT (id) DO NOTHING;

-- 7. Enable Row Level Security
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

-- 8. Create RLS policies for the attachments table and storage
-- First, drop any existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view attachments for their projects" ON public.attachments;
DROP POLICY IF EXISTS "Users can insert attachments for their projects" ON public.attachments;
DROP POLICY IF EXISTS "Users can update attachments for their projects" ON public.attachments;
DROP POLICY IF EXISTS "Users can delete attachments for their projects" ON public.attachments;

DROP POLICY IF EXISTS "Users can read attachments for their projects" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload attachments for their projects" ON storage.objects;
DROP POLICY IF EXISTS "Users can update attachments for their projects" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete attachments for their projects" ON storage.objects;

-- Create database table policies
CREATE POLICY "Users can view attachments for their projects" 
ON public.attachments
FOR SELECT
USING (
    project_id IN (
        SELECT project_id FROM public.projects_users
        WHERE user_id = auth.uid()
        AND status = 'active'
    )
);

CREATE POLICY "Users can insert attachments for their projects" 
ON public.attachments
FOR INSERT
WITH CHECK (
    project_id IN (
        SELECT project_id FROM public.projects_users
        WHERE user_id = auth.uid()
        AND status = 'active'
    )
);

CREATE POLICY "Users can update attachments for their projects" 
ON public.attachments
FOR UPDATE
USING (
    project_id IN (
        SELECT project_id FROM public.projects_users
        WHERE user_id = auth.uid()
        AND status = 'active'
    )
)
WITH CHECK (
    project_id IN (
        SELECT project_id FROM public.projects_users
        WHERE user_id = auth.uid()
        AND status = 'active'
    )
);

CREATE POLICY "Users can delete attachments for their projects" 
ON public.attachments
FOR DELETE
USING (
    project_id IN (
        SELECT project_id FROM public.projects_users
        WHERE user_id = auth.uid()
        AND status = 'active'
    )
);

-- Create storage bucket policies
CREATE POLICY "Users can read attachments for their projects"
ON storage.objects
FOR SELECT
USING (
    bucket_id = 'attachments'
    AND (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.projects
        WHERE id IN (
            SELECT project_id FROM public.projects_users
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
    )
);

CREATE POLICY "Users can upload attachments for their projects"
ON storage.objects
FOR INSERT
WITH CHECK (
    bucket_id = 'attachments'
    AND (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.projects
        WHERE id IN (
            SELECT project_id FROM public.projects_users
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
    )
);

CREATE POLICY "Users can update attachments for their projects"
ON storage.objects
FOR UPDATE
USING (
    bucket_id = 'attachments'
    AND (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.projects
        WHERE id IN (
            SELECT project_id FROM public.projects_users
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
    )
)
WITH CHECK (
    bucket_id = 'attachments'
    AND (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.projects
        WHERE id IN (
            SELECT project_id FROM public.projects_users
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
    )
);

CREATE POLICY "Users can delete attachments for their projects"
ON storage.objects
FOR DELETE
USING (
    bucket_id = 'attachments'
    AND (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.projects
        WHERE id IN (
            SELECT project_id FROM public.projects_users
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
    )
);
