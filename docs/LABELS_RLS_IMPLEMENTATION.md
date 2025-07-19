# Labels RLS Implementation

## Overview

This document describes the Row Level Security (RLS) implementation for labels in the project management system.

## Database Structure

- **labels table**: Stores label definitions with project_id and created_by fields
- **entity_labels table**: Junction table linking labels to entities (tasks/forms)
- **projects_users table**: Stores project membership with roles (owner, admin, member)

## RLS Policies

### Labels Table

1. **SELECT**: Only users who are active members of the project can view labels
2. **INSERT**: Only project members can create labels, and created_by must match auth.uid()
3. **UPDATE**: Users can update labels if they created them OR have project membership
4. **DELETE**: Users can delete labels if they created them OR have project membership

### Entity_labels Table

1. **SELECT**: Users can view entity labels if they have access to the project (via tasks/forms)
2. **INSERT**: Only project members can associate labels with entities
3. **DELETE**: Only project members can remove labels from entities

## UI Implementation

### Label Fetching

All label queries in the UI now filter by `project_id` to ensure users only see labels from their current project:

```typescript
const { data, error } = await supabase
  .from('labels')
  .select('*')
  .eq('project_id', user?.activeProjectId ?? 0)
  .order('name');
```

### Error Handling

The UI components handle RLS policy violations (error code '42501') gracefully with user-friendly messages:

- "You don't have permission to create new labels. Please contact an administrator."
- "You don't have permission to create new labels"

### Components Updated

- `app/components/tasks/AddTaskDrawer.tsx`: Label fetching and creation
- `app/components/tasks/TaskDrawer.tsx`: Label creation and association
- `app/protected/tasks/hooks.ts`: Task fetching with labels through entity_labels

## Migration File

- `supabase/migrations/20250714051733_fix_labels_rls_project_membership.sql`

## Security Considerations

- Users can only interact with labels in projects where they are active members
- The `created_by` field ensures accountability for label creation
- Project isolation is maintained through project_id filtering
- RLS policies prevent unauthorized access at the database level
