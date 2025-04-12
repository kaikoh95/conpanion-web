-- Create Statuses table
create table if not exists public.statuses (
    id serial primary key,
    project_id integer not null, -- Will be referenced when we create the projects table
    name text not null,
    color text, -- For UI customization
    position integer not null default 0, -- For custom ordering
    is_default boolean not null default false,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    created_by uuid not null references auth.users(id),
    
    -- Ensure unique status names within a project
    unique(project_id, name)
);

-- Create Priorities table
create table if not exists public.priorities (
    id serial primary key,
    project_id integer not null, -- Will be referenced when we create the projects table
    name text not null,
    color text, -- For UI customization
    position integer not null default 0, -- For custom ordering
    is_default boolean not null default false,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    created_by uuid not null references auth.users(id),
    
    -- Ensure unique priority names within a project
    unique(project_id, name)
);

-- Create Labels table
create table if not exists public.labels (
    id serial primary key,
    project_id integer not null, -- Will be referenced when we create the projects table
    name text not null,
    color text, -- For UI customization
    description text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    created_by uuid not null references auth.users(id),
    
    -- Ensure unique label names within a project
    unique(project_id, name)
);

-- Create Tasks table
create table if not exists public.tasks (
    id serial primary key,
    title text not null,
    description text,
    status_id integer not null references public.statuses(id),
    priority_id integer not null references public.priorities(id),
    
    -- Time tracking
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    due_date timestamp with time zone,
    
    -- Ownership
    created_by uuid not null references auth.users(id),
    
    -- Project organization
    project_id integer, -- Will be referenced when we create the projects table
    parent_task_id integer references public.tasks(id), -- For subtasks
    
    -- Additional metadata
    estimated_hours numeric(5,2), -- Estimated hours to complete
    actual_hours numeric(5,2) -- Actual hours spent
);

-- Create Entity Assignees junction table
create table if not exists public.entity_assignees (
    id serial primary key,
    entity_type text not null, -- 'task', 'project', etc.
    entity_id integer not null,
    user_id uuid not null references auth.users(id) on delete cascade,
    assigned_at timestamp with time zone default timezone('utc'::text, now()) not null,
    assigned_by uuid not null references auth.users(id),
    
    -- Prevent duplicate assignments per entity
    unique(entity_type, entity_id, user_id)
);

-- Create Entity Labels junction table
create table if not exists public.entity_labels (
    id serial primary key,
    entity_type text not null, -- 'task', 'project', etc.
    entity_id integer not null,
    label_id integer not null references public.labels(id) on delete cascade,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    created_by uuid not null references auth.users(id),
    
    -- Prevent duplicate label assignments per entity
    unique(entity_type, entity_id, label_id)
);

-- Create Entity Positions table for custom ordering in different contexts
create table if not exists public.entity_positions (
    id serial primary key,
    entity_type text not null, -- 'task', 'project', etc.
    entity_id integer not null,
    context text not null, -- 'kanban', 'list', 'custom_view_1', etc.
    position float not null, -- Using float for easy reordering without shifting all items
    user_id uuid references auth.users(id), -- NULL means global/shared order
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    
    -- Prevent duplicate positions in the same context
    unique(entity_type, context, user_id, entity_id)
);

-- Enable Row Level Security (RLS)
alter table public.tasks enable row level security;
alter table public.entity_assignees enable row level security;
alter table public.entity_positions enable row level security;
alter table public.statuses enable row level security;
alter table public.priorities enable row level security;
alter table public.labels enable row level security;
alter table public.entity_labels enable row level security;

-- Create indexes for better query performance
create index tasks_created_by_idx on public.tasks(created_by);
create index tasks_project_id_idx on public.tasks(project_id);
create index tasks_parent_task_id_idx on public.tasks(parent_task_id);
create index tasks_status_id_idx on public.tasks(status_id);
create index tasks_priority_id_idx on public.tasks(priority_id);

create index entity_assignees_composite_idx on public.entity_assignees(entity_type, entity_id);
create index entity_assignees_user_id_idx on public.entity_assignees(user_id);

create index statuses_project_id_idx on public.statuses(project_id);
create index priorities_project_id_idx on public.priorities(project_id);
create index labels_project_id_idx on public.labels(project_id);

create index entity_labels_composite_idx on public.entity_labels(entity_type, entity_id);
create index entity_labels_label_id_idx on public.entity_labels(label_id);

create index entity_positions_composite_idx on public.entity_positions(entity_type, context, user_id);
create index entity_positions_entity_idx on public.entity_positions(entity_type, entity_id);

-- Add updated_at trigger
create or replace function public.handle_updated_at()
returns trigger as $$
begin
    new.updated_at = timezone('utc'::text, now());
    return new;
end;
$$ language plpgsql;

create trigger handle_tasks_updated_at
    before update on public.tasks
    for each row
    execute function public.handle_updated_at();

-- Add updated_at trigger for entity_positions
create trigger handle_entity_positions_updated_at
    before update on public.entity_positions
    for each row
    execute function public.handle_updated_at();

-- RLS Policies that avoid infinite recursion

-- Base policies for statuses
create policy "Users can read statuses they have access to" 
on public.statuses for select 
using (
  created_by = auth.uid()
);

create policy "Users can insert their own statuses" 
on public.statuses for insert 
with check (created_by = auth.uid());

create policy "Users can update statuses they own" 
on public.statuses for update 
using (created_by = auth.uid());

create policy "Users can delete statuses they own" 
on public.statuses for delete 
using (created_by = auth.uid());

-- Base policies for priorities
create policy "Users can read priorities they have access to" 
on public.priorities for select 
using (
  created_by = auth.uid()
);

create policy "Users can insert their own priorities" 
on public.priorities for insert 
with check (created_by = auth.uid());

create policy "Users can update priorities they own" 
on public.priorities for update 
using (created_by = auth.uid());

create policy "Users can delete priorities they own" 
on public.priorities for delete 
using (created_by = auth.uid());

-- Base policies for labels
create policy "Users can read labels they have access to" 
on public.labels for select 
using (
  created_by = auth.uid()
);

create policy "Users can insert their own labels" 
on public.labels for insert 
with check (created_by = auth.uid());

create policy "Users can update labels they own" 
on public.labels for update 
using (created_by = auth.uid());

create policy "Users can delete labels they own" 
on public.labels for delete 
using (created_by = auth.uid());

-- Policies for tasks
create policy "Users can read tasks they have access to" 
on public.tasks for select 
using (
  created_by = auth.uid()
);

create policy "Users can insert their own tasks" 
on public.tasks for insert 
with check (created_by = auth.uid());

create policy "Users can update tasks they own" 
on public.tasks for update 
using (
  created_by = auth.uid()
);

create policy "Users can delete tasks they own" 
on public.tasks for delete 
using (created_by = auth.uid());

-- Policies for entity_assignees - FIXED to avoid self-references
create policy "Users can view their assignments" 
on public.entity_assignees for select 
using (
  user_id = auth.uid() OR
  assigned_by = auth.uid()
);

create policy "Users can assign others to tasks they created" 
on public.entity_assignees for insert 
with check (
  assigned_by = auth.uid() AND
  (
    -- Can assign to tasks they created
    (entity_type = 'task' AND 
     exists (
       select 1 from public.tasks 
       where id = entity_id AND created_by = auth.uid()
     )
    )
  )
);

create policy "Users can remove assignees from their tasks" 
on public.entity_assignees for delete 
using (
  assigned_by = auth.uid() OR
  (
    -- Can remove from tasks they created
    (entity_type = 'task' AND 
     exists (
       select 1 from public.tasks 
       where id = entity_id AND created_by = auth.uid()
     )
    )
  )
);

-- Policies for entity_labels - FIXED to avoid self-references
create policy "Users can view all entity labels" 
on public.entity_labels for select 
using (true);

create policy "Users can add labels to their tasks" 
on public.entity_labels for insert 
with check (
  created_by = auth.uid() AND
  (
    -- Can label tasks they created
    (entity_type = 'task' AND 
     exists (
       select 1 from public.tasks 
       where id = entity_id AND created_by = auth.uid()
     )
    )
  )
);

create policy "Users can remove labels from their tasks" 
on public.entity_labels for delete 
using (
  created_by = auth.uid() OR
  (
    -- Can remove labels from tasks they created
    (entity_type = 'task' AND 
     exists (
       select 1 from public.tasks 
       where id = entity_id AND created_by = auth.uid()
     )
    )
  )
);

-- Policies for entity_positions
create policy "Users can view positions" 
on public.entity_positions for select 
using (
  user_id = auth.uid() OR user_id IS NULL
);

create policy "Users can create their own positions" 
on public.entity_positions for insert 
with check (
  user_id = auth.uid() OR 
  (user_id IS NULL AND
   (
     -- Only task creators can set global positions
     (entity_type = 'task' AND 
      exists (
        select 1 from public.tasks 
        where id = entity_id AND created_by = auth.uid()
      )
     )
   )
  )
);

create policy "Users can update their own positions" 
on public.entity_positions for update 
using (
  user_id = auth.uid() OR 
  (user_id IS NULL AND
   (
     -- Only task creators can update global positions
     (entity_type = 'task' AND 
      exists (
        select 1 from public.tasks 
        where id = entity_id AND created_by = auth.uid()
      )
     )
   )
  )
);

create policy "Users can delete their own positions" 
on public.entity_positions for delete 
using (
  user_id = auth.uid() OR 
  (user_id IS NULL AND
   (
     -- Only task creators can delete global positions
     (entity_type = 'task' AND 
      exists (
        select 1 from public.tasks 
        where id = entity_id AND created_by = auth.uid()
      )
     )
   )
  )
);

