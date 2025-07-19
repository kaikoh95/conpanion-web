# Entity Type Standardization Solution

## Overview

This document explains the solution implemented to resolve entity_type inconsistencies and provide standardized reference for future development.

## Problems Solved

### 1. Entity Type Inconsistency Bug ✅ FIXED

**Problem**: Frontend used `'task'` (singular) while notification functions expected `'tasks'` (plural), causing entity title lookups to fail.

**Solution**:

- Fixed notification functions to use `'task'` consistently
- Updated all approval-related functions to use singular forms
- Entity titles now display correctly in notifications

### 2. Lack of Standardized Reference ✅ ADDED

**Problem**: No centralized reference for valid entity types, leading to potential inconsistencies.

**Solution**: Created `standard_entity_type` enum and comprehensive documentation system.

## What Was Implemented

### 1. Bug Fixes (Migration: `20250719084515_fix_entity_type_inconsistency_task_vs_tasks.sql`)

Fixed these functions to use `'task'` instead of `'tasks'`:

- `notify_approval_changes()`
- `notify_approval_comment()`
- `notify_approval_response()`

### 2. Standardized Enum (Migration: `20250719085618_create_simple_entity_type_enum.sql`)

Created `standard_entity_type` enum with 11 values:

```sql
CREATE TYPE standard_entity_type AS ENUM (
  'task',              -- Tasks (singular, matches frontend)
  'form',              -- Forms
  'entries',           -- Form entries (historically plural)
  'site_diary',        -- Site diaries
  'form_entry',        -- Form entry attachments
  'task_comment',      -- Task comments
  'project',           -- Projects
  'organization',      -- Organizations
  'approval',          -- Approval requests
  'approval_comment',  -- Comments on approvals
  'approval_response'  -- Approval responses
);
```

### 3. Helper Functions

**Available Functions:**

- `get_standard_entity_types()` - Returns all valid entity types
- `is_valid_standard_entity_type(text)` - Validates if a string is a valid entity type
- `validate_standard_entity_reference(entity_type, entity_id)` - Validates entity exists

**Usage Examples:**

```sql
-- Get all valid entity types
SELECT unnest(get_standard_entity_types());

-- Validate an entity type
SELECT is_valid_standard_entity_type('task'); -- Returns true
SELECT is_valid_standard_entity_type('tasks'); -- Returns false

-- Validate entity reference
SELECT validate_standard_entity_reference('task', '123');
```

### 4. Documentation Table

Created `standard_entity_type_documentation` table with:

- Entity type descriptions
- Associated table names
- ID column references
- Usage examples
- Frontend usage patterns

**Query Documentation:**

```sql
SELECT * FROM standard_entity_type_documentation
ORDER BY entity_type;
```

## Developer Guidelines

### Frontend Usage (TypeScript/React)

Always use singular forms that match the enum:

```typescript
// ✅ CORRECT
const entityType = 'task';
const labelData = {
  entity_type: 'task',
  entity_id: taskId,
};

// ❌ INCORRECT
const entityType = 'tasks'; // Don't use plural
```

### Backend Usage (SQL/Database)

Reference the standard enum for consistency:

```sql
-- ✅ CORRECT - Use the standard enum as reference
INSERT INTO entity_assignees (entity_type, entity_id, user_id)
VALUES ('task'::standard_entity_type::text, 123, user_uuid);

-- Validate before inserting
WHERE is_valid_standard_entity_type('task')
```

### New Feature Development

1. Check `standard_entity_type_documentation` table for valid types
2. Use helper functions for validation
3. Follow singular naming convention (`task`, not `tasks`)
4. Reference the enum when creating new entity types

## Migration Strategy

We chose a **non-breaking approach**:

- Fixed existing notification functions
- Created standardized enum alongside existing TEXT columns
- Provided helper functions for validation
- Created comprehensive documentation

**Why not migrate all tables?**

- Existing tables have RLS policies that reference entity_type columns
- Changing column types would require dropping/recreating all policies
- Non-breaking approach provides immediate value with minimal risk

## Benefits Achieved

### 1. Immediate Fixes ✅

- Task notifications now show proper titles
- Approval workflows work correctly for tasks
- Entity label associations function properly

### 2. Future Prevention ✅

- Standardized reference prevents inconsistencies
- Helper functions enable validation
- Documentation guides developers

### 3. Developer Experience ✅

- Clear documentation of all entity types
- Validation functions for error prevention
- Usage examples and guidelines

## Future Considerations

### Gradual Migration (Optional)

If desired, tables can be migrated to use the enum in future migrations:

1. Drop relevant RLS policies
2. Alter column types to use `standard_entity_type`
3. Recreate policies with enum references

### New Tables

All new tables with entity_type columns should use `standard_entity_type` enum directly.

## Verification

The solution is working correctly:

- ✅ Migration applied successfully
- ✅ No schema conflicts detected
- ✅ Entity types properly documented
- ✅ Helper functions available
- ✅ Bug fixes implemented

## Resources

- **Documentation Table**: `SELECT * FROM standard_entity_type_documentation;`
- **Helper Functions**: `get_standard_entity_types()`, `is_valid_standard_entity_type()`, `validate_standard_entity_reference()`
- **Migration Files**:
  - `20250719084515_fix_entity_type_inconsistency_task_vs_tasks.sql`
  - `20250719085618_create_simple_entity_type_enum.sql`
