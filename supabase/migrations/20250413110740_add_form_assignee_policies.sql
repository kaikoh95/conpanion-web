-- Add project_id column to forms table
alter table public.forms
add column project_id integer references public.projects(id) on delete cascade;

-- Drop assigned_to column from forms table
alter table public.forms
drop column if exists assigned_to;

-- Create index for better query performance
create index forms_project_id_idx on public.forms(project_id);

-- Drop existing policies
drop policy if exists "Users can assign others to tasks they created" on public.entity_assignees;
drop policy if exists "Users can view their assignments" on public.entity_assignees;
drop policy if exists "Users can remove assignees from their tasks" on public.entity_assignees;

-- Policy for viewing assignments
create policy "Users can view assignments in their projects"
on public.entity_assignees
for select
to authenticated
using (
  user_id = auth.uid() OR 
  assigned_by = auth.uid() OR
  (
    -- Can view task assignments for tasks in their projects
    (entity_type = 'task' AND 
     exists (
       select 1 from public.tasks t
       join public.projects_users pu on pu.project_id = t.project_id
       where t.id = entity_id 
       and pu.user_id = auth.uid()
     )
    ) OR
    -- Can view form assignments for forms in their projects
    (entity_type = 'form' AND 
     exists (
       select 1 from public.forms f
       join public.projects_users pu on pu.project_id = f.project_id
       where f.id = entity_id 
       and pu.user_id = auth.uid()
     )
    )
  )
);

-- Policy for creating assignments
create policy "Project admins and owners can create assignments"
on public.entity_assignees
for insert
to authenticated
with check (
  assigned_by = (select auth.uid()) AND
  (
    -- Can assign to tasks in projects where they are admin/owner
    (entity_type = 'task' AND 
     exists (
       select 1 from public.tasks t
       join public.projects_users pu on pu.project_id = t.project_id
       where t.id = entity_id 
       and pu.user_id = auth.uid()
       and pu.role in ('admin', 'owner')
     )
    ) OR
    -- Can assign to forms in projects where they are admin/owner
    (entity_type = 'form' AND 
     exists (
       select 1 from public.forms f
       join public.projects_users pu on pu.project_id = f.project_id
       where f.id = entity_id 
       and pu.user_id = auth.uid()
       and pu.role in ('admin', 'owner')
     )
    )
  )
);

-- Policy for removing assignments
create policy "Project admins and owners can remove assignments"
on public.entity_assignees
for delete
to authenticated
using (
  assigned_by = (select auth.uid()) OR
  (
    -- Can remove from tasks in projects where they are admin/owner
    (entity_type = 'task' AND 
     exists (
       select 1 from public.tasks t
       join public.projects_users pu on pu.project_id = t.project_id
       where t.id = entity_id 
       and pu.user_id = auth.uid()
       and pu.role in ('admin', 'owner')
     )
    ) OR
    -- Can remove from forms in projects where they are admin/owner
    (entity_type = 'form' AND 
     exists (
       select 1 from public.forms f
       join public.projects_users pu on pu.project_id = f.project_id
       where f.id = entity_id 
       and pu.user_id = auth.uid()
       and pu.role in ('admin', 'owner')
     )
    )
  )
);

-- Policy for updating assignments
create policy "Project admins and owners can update assignments"
on public.entity_assignees
for update
to authenticated
using (
  -- Can only update if they created the assignment or are admin/owner
  (assigned_by = (select auth.uid()) OR
  (
    -- Can update task assignments in projects where they are admin/owner
    (entity_type = 'task' AND 
     exists (
       select 1 from public.tasks t
       join public.projects_users pu on pu.project_id = t.project_id
       where t.id = entity_id 
       and pu.user_id = auth.uid()
       and pu.role in ('admin', 'owner')
     )
    ) OR
    -- Can update form assignments in projects where they are admin/owner
    (entity_type = 'form' AND 
     exists (
       select 1 from public.forms f
       join public.projects_users pu on pu.project_id = f.project_id
       where f.id = entity_id 
       and pu.user_id = auth.uid()
       and pu.role in ('admin', 'owner')
     )
    )
  ))
)
with check (
  -- Ensure they can't change the assigned_by field to someone else
  assigned_by = (select auth.uid())
); 