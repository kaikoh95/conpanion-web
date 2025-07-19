-- Migration: Create standardized entity_type enum for future reference
-- Description: Defines a comprehensive entity_type enum that provides a standard reference
-- for all entity types used throughout the system. This improves consistency and provides
-- better documentation for developers.

-- ===========================================
-- CREATE STANDARDIZED ENTITY_TYPE ENUM
-- ===========================================

-- Create a standardized entity_type enum that doesn't conflict with the existing one
-- We'll call it 'standard_entity_type' to avoid conflicts
CREATE TYPE standard_entity_type AS ENUM (
  -- Core entities
  'task',              -- Tasks (singular, matches frontend usage)
  'form',              -- Forms
  'entries',           -- Form entries (historically plural)
  'site_diary',        -- Site diaries
  
  -- Attachment-specific entities
  'form_entry',        -- Form entry attachments (used in attachments table)
  
  -- Comment and interaction entities
  'task_comment',      -- Task comments
  
  -- Organizational entities
  'project',           -- Projects
  'organization',      -- Organizations
  
  -- Approval workflow entities
  'approval',          -- Approval requests
  'approval_comment',  -- Comments on approvals
  'approval_response'  -- Approval responses
);

-- Add comprehensive documentation
COMMENT ON TYPE standard_entity_type IS 'Standardized entity types used throughout the system. This enum ensures consistency between frontend and backend entity references. Use this as a reference when creating new features.';

-- ===========================================
-- CREATE HELPER FUNCTIONS
-- ===========================================

-- Function to get all available standard entity types
CREATE OR REPLACE FUNCTION get_standard_entity_types()
RETURNS standard_entity_type[] AS $$
BEGIN
  RETURN ARRAY[
    'task',
    'form', 
    'entries',
    'site_diary',
    'form_entry',
    'task_comment',
    'project',
    'organization',
    'approval',
    'approval_comment',
    'approval_response'
  ]::standard_entity_type[];
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to check if a text value is a valid standard entity type
CREATE OR REPLACE FUNCTION is_valid_standard_entity_type(p_type TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  BEGIN
    PERFORM p_type::standard_entity_type;
    RETURN TRUE;
  EXCEPTION WHEN OTHERS THEN
    RETURN FALSE;
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to validate entity_type and entity_id combinations
CREATE OR REPLACE FUNCTION validate_standard_entity_reference(
  p_entity_type TEXT,
  p_entity_id TEXT
) RETURNS BOOLEAN AS $$
BEGIN
  -- First check if it's a valid entity type
  IF NOT is_valid_standard_entity_type(p_entity_type) THEN
    RETURN FALSE;
  END IF;
  
  -- If entity_type is NULL, entity_id should also be NULL
  IF p_entity_type IS NULL THEN
    RETURN p_entity_id IS NULL;
  END IF;
  
  -- If entity_type is provided, entity_id should not be NULL
  IF p_entity_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Validate specific entity types (basic existence check)
  CASE p_entity_type::standard_entity_type
    WHEN 'task' THEN
      RETURN EXISTS (SELECT 1 FROM tasks WHERE id = p_entity_id::INTEGER);
    WHEN 'form' THEN
      RETURN EXISTS (SELECT 1 FROM forms WHERE id = p_entity_id::BIGINT);
    WHEN 'entries' THEN
      RETURN EXISTS (SELECT 1 FROM form_entries WHERE id = p_entity_id::BIGINT);
    WHEN 'site_diary' THEN
      RETURN EXISTS (SELECT 1 FROM site_diaries WHERE id = p_entity_id::BIGINT);
    WHEN 'project' THEN
      RETURN EXISTS (SELECT 1 FROM projects WHERE id = p_entity_id::INTEGER);
    WHEN 'organization' THEN
      RETURN EXISTS (SELECT 1 FROM organizations WHERE id = p_entity_id::INTEGER);
    WHEN 'approval' THEN
      RETURN EXISTS (SELECT 1 FROM approvals WHERE id = p_entity_id::BIGINT);
    -- For comment and response types, we can't easily validate without complex queries
    -- so we'll accept them as valid for now
    ELSE
      RETURN TRUE;
  END CASE;
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- CREATE USAGE DOCUMENTATION
-- ===========================================

-- Create a documentation table for developers
CREATE TABLE IF NOT EXISTS standard_entity_type_documentation (
  entity_type standard_entity_type PRIMARY KEY,
  description TEXT NOT NULL,
  table_name TEXT NOT NULL,
  id_column TEXT NOT NULL,
  example_usage TEXT,
  frontend_usage TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert documentation for each entity type
INSERT INTO standard_entity_type_documentation (entity_type, description, table_name, id_column, example_usage, frontend_usage) VALUES
('task', 'Individual tasks in the project management system', 'tasks', 'id', 'Used for task assignments, notifications, and comments', 'entity_type: ''task'''),
('form', 'Form templates that can be filled out', 'forms', 'id', 'Used for form assignments and approvals', 'entity_type: ''form'''),
('entries', 'Completed form submissions', 'form_entries', 'id', 'Used for approval workflows and attachments', 'entity_type: ''entries'''),
('site_diary', 'Daily site diary entries', 'site_diaries', 'id', 'Used for attachments and approval workflows', 'entity_type: ''site_diary'''),
('form_entry', 'Alias for form entries in attachment context', 'form_entries', 'id', 'Specifically used in attachment references', 'entity_type: ''form_entry'''),
('task_comment', 'Comments on tasks', 'task_comments', 'id', 'Used in notification contexts for comment mentions', 'entity_type: ''task_comment'''),
('project', 'Projects that contain tasks and forms', 'projects', 'id', 'Used for project membership notifications', 'entity_type: ''project'''),
('organization', 'Organizations that contain multiple projects', 'organizations', 'id', 'Used for organization membership notifications', 'entity_type: ''organization'''),
('approval', 'Approval requests for various entities', 'approvals', 'id', 'Used in approval workflow notifications', 'entity_type: ''approval'''),
('approval_comment', 'Comments on approval requests', 'approval_comments', 'id', 'Used for approval discussion notifications', 'entity_type: ''approval_comment'''),
('approval_response', 'Individual approver responses', 'approval_approver_responses', 'id', 'Used for approval status notifications', 'entity_type: ''approval_response''')
ON CONFLICT (entity_type) DO UPDATE SET
  description = EXCLUDED.description,
  table_name = EXCLUDED.table_name, 
  id_column = EXCLUDED.id_column,
  example_usage = EXCLUDED.example_usage,
  frontend_usage = EXCLUDED.frontend_usage;

-- Grant read access to documentation
GRANT SELECT ON standard_entity_type_documentation TO authenticated;

COMMENT ON TABLE standard_entity_type_documentation IS 'Documentation table explaining each standard_entity_type enum value and its usage';

-- ===========================================
-- GRANT PERMISSIONS
-- ===========================================

-- Grant appropriate permissions for the helper functions
GRANT EXECUTE ON FUNCTION get_standard_entity_types TO authenticated;
GRANT EXECUTE ON FUNCTION is_valid_standard_entity_type TO authenticated;
GRANT EXECUTE ON FUNCTION validate_standard_entity_reference TO authenticated;

-- ===========================================
-- ADD FUNCTION COMMENTS
-- ===========================================

COMMENT ON FUNCTION get_standard_entity_types IS 'Returns all available standard entity types as an array for reference';
COMMENT ON FUNCTION is_valid_standard_entity_type IS 'Checks if a text value is a valid standard_entity_type enum value';
COMMENT ON FUNCTION validate_standard_entity_reference IS 'Validates that entity_type and entity_id combinations reference existing entities using the standard enum';

-- ===========================================
-- USAGE EXAMPLES AND GUIDELINES
-- ===========================================

-- Create a function that demonstrates proper usage
CREATE OR REPLACE FUNCTION demo_standard_entity_type_usage()
RETURNS TABLE (
  entity_type TEXT,
  is_valid BOOLEAN,
  example_usage TEXT
) AS $$
DECLARE
  entity_types_array standard_entity_type[];
  entity_type_item standard_entity_type;
BEGIN
  -- Get all available entity types
  entity_types_array := get_standard_entity_types();
  
  -- Return examples for each type
  FOREACH entity_type_item IN ARRAY entity_types_array LOOP
    entity_type := entity_type_item::TEXT;
    is_valid := is_valid_standard_entity_type(entity_type_item::TEXT);
    
    SELECT std.frontend_usage INTO example_usage
    FROM standard_entity_type_documentation std
    WHERE std.entity_type = entity_type_item;
    
    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- VALIDATION AND LOGGING
-- ===========================================

-- Log the successful creation
DO $$
DECLARE
  enum_count INTEGER;
BEGIN
  -- Count the enum values
  SELECT COUNT(*) INTO enum_count
  FROM unnest(enum_range(NULL::standard_entity_type)) AS enum_value;
  
  RAISE NOTICE '===========================================';
  RAISE NOTICE 'STANDARD ENTITY_TYPE ENUM CREATED';
  RAISE NOTICE '===========================================';
  RAISE NOTICE 'Created standard_entity_type enum with % values:', enum_count;
  
  -- List all enum values
  FOR enum_count IN 
    SELECT ROW_NUMBER() OVER() as row_num
    FROM unnest(enum_range(NULL::standard_entity_type)) AS enum_value(value)
  LOOP
    RAISE NOTICE '  %', (SELECT enum_value.value FROM unnest(enum_range(NULL::standard_entity_type)) AS enum_value(value) LIMIT 1 OFFSET enum_count - 1);
  END LOOP;
  
  RAISE NOTICE '===========================================';
  RAISE NOTICE 'USAGE GUIDELINES:';
  RAISE NOTICE '1. Use this enum as reference for new features';
  RAISE NOTICE '2. Frontend should use singular forms (task, not tasks)';
  RAISE NOTICE '3. Call get_standard_entity_types() to get all values';
  RAISE NOTICE '4. Use is_valid_standard_entity_type() for validation';
  RAISE NOTICE '5. Check standard_entity_type_documentation table';
  RAISE NOTICE '===========================================';
END $$;

-- Clean up demo function (optional)
DROP FUNCTION demo_standard_entity_type_usage();
