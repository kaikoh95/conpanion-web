-- Create Task Comments table
create table if not exists public.task_comments (
    id serial primary key,
    task_id integer not null references public.tasks(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    content text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    user_name text not null, -- Denormalized for performance
    user_avatar text -- Denormalized for performance
);

-- Create indexes for better performance
create index task_comments_task_id_idx on public.task_comments(task_id);
create index task_comments_user_id_idx on public.task_comments(user_id);
create index task_comments_created_at_idx on public.task_comments(created_at);

-- Enable Row Level Security (RLS)
alter table public.task_comments enable row level security;

-- Create RLS policies for task_comments
create policy "Users can view comments on tasks they have access to" 
on public.task_comments for select 
using (
  user_id = auth.uid() OR
  exists (
    select 1 from public.tasks
    where id = task_id AND (
      created_by = auth.uid() OR
      exists (
        select 1 from public.entity_assignees
        where entity_type = 'task' AND entity_id = tasks.id AND user_id = auth.uid()
      )
    )
  )
);

create policy "Users can add their own comments" 
on public.task_comments for insert 
with check (
  user_id = auth.uid()
);

create policy "Users can update their own comments" 
on public.task_comments for update 
using (
  user_id = auth.uid()
);

create policy "Users can delete their own comments" 
on public.task_comments for delete 
using (
  user_id = auth.uid()
); 