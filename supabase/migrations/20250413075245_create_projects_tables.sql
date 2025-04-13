-- Create projects table
create table if not exists public.projects (
    id serial primary key,
    name text not null,
    description text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    created_by uuid not null references auth.users(id),
    owner_id uuid not null references auth.users(id),
    is_archived boolean default false not null,
    archived_at timestamp with time zone,
    archived_by uuid references auth.users(id)
);

-- Create projects_users junction table
create table if not exists public.projects_users (
    id serial primary key,
    project_id integer not null references public.projects(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null check (role in ('owner', 'admin', 'member')),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    created_by uuid not null references auth.users(id),
    
    -- Prevent duplicate project-user combinations
    unique(project_id, user_id)
);

-- Add updated_at trigger for projects
create trigger handle_projects_updated_at
    before update on public.projects
    for each row
    execute function public.handle_updated_at();

-- Create indexes
create index projects_owner_id_idx on public.projects(owner_id);
create index projects_created_by_idx on public.projects(created_by);
create index projects_users_project_id_idx on public.projects_users(project_id);
create index projects_users_user_id_idx on public.projects_users(user_id);

-- Add project_id foreign key to existing tables that reference projects
alter table public.statuses
    add constraint statuses_project_id_fkey
    foreign key (project_id)
    references public.projects(id)
    on delete cascade;

alter table public.priorities
    add constraint priorities_project_id_fkey
    foreign key (project_id)
    references public.projects(id)
    on delete cascade;

alter table public.labels
    add constraint labels_project_id_fkey
    foreign key (project_id)
    references public.projects(id)
    on delete cascade;

alter table public.tasks
    add constraint tasks_project_id_fkey
    foreign key (project_id)
    references public.projects(id)
    on delete cascade;
