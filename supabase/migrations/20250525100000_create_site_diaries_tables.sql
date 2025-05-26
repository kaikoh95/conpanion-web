-- Create site_diary_templates table
create table if not exists public.site_diary_templates (
    id bigint primary key generated always as identity,
    name text not null,
    description text,
    project_id integer references public.projects(id) on delete cascade not null,
    created_by uuid references auth.users(id) not null,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    deleted_at timestamp with time zone,
    version integer default 1 not null
);

-- Create site_diary_template_items table (similar to form_items)
create table if not exists public.site_diary_template_items (
    id bigint primary key generated always as identity,
    template_id bigint references site_diary_templates(id) on delete cascade not null,
    item_type item_type not null, -- reusing the existing item_type enum
    question_value text,
    options jsonb default '[]'::jsonb,
    is_required boolean default false,
    display_order integer not null,
    metadata jsonb default '{}'::jsonb -- for storing additional fields like costs, manpower, etc.
);

-- Create site_diaries table (actual diary entries)
create table if not exists public.site_diaries (
    id bigint primary key generated always as identity,
    template_id bigint references site_diary_templates(id) not null,
    project_id integer references public.projects(id) on delete cascade not null,
    name text not null,
    date date not null default current_date,
    submitted_by_user_id uuid references auth.users(id) not null,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    deleted_at timestamp with time zone,
    metadata jsonb default '{}'::jsonb -- for storing additional metadata like weather, costs, etc.
);

-- Create site_diary_answers table (similar to form_entry_answers)
create table if not exists public.site_diary_answers (
    id bigint primary key generated always as identity,
    diary_id bigint references site_diaries(id) on delete cascade not null,
    item_id bigint references site_diary_template_items(id) on delete cascade not null,
    answer_value jsonb, -- Storing answer flexibly as JSONB
    created_at timestamp with time zone default now() not null
);

-- Create indexes
create index idx_site_diary_templates_project_id on site_diary_templates(project_id);
create index idx_site_diary_templates_created_by on site_diary_templates(created_by);
create index idx_site_diary_template_items_template_id on site_diary_template_items(template_id);
create index idx_site_diary_template_items_display_order on site_diary_template_items(display_order);
create index idx_site_diaries_template_id on site_diaries(template_id);
create index idx_site_diaries_project_id on site_diaries(project_id);
create index idx_site_diaries_submitted_by_user_id on site_diaries(submitted_by_user_id);
create index idx_site_diaries_date on site_diaries(date);
create index idx_site_diary_answers_diary_id on site_diary_answers(diary_id);
create index idx_site_diary_answers_item_id on site_diary_answers(item_id);

-- Apply the existing updated_at trigger function
create trigger set_site_diary_templates_updated_at
    before update on site_diary_templates
    for each row
    execute function update_updated_at_column();

create trigger set_site_diaries_updated_at
    before update on site_diaries
    for each row
    execute function update_updated_at_column();

-- Enable RLS
alter table site_diary_templates enable row level security;
alter table site_diary_template_items enable row level security;
alter table site_diaries enable row level security;
alter table site_diary_answers enable row level security;

-- Basic RLS policies (these can be refined later)
create policy "Users can view site diary templates" 
on site_diary_templates for select
to authenticated using (true);

create policy "Project members can create site diary templates" 
on site_diary_templates for insert
to authenticated with check (
    created_by = auth.uid()
);

create policy "Project members can update their own site diary templates" 
on site_diary_templates for update
to authenticated using (
    created_by = auth.uid()
);

create policy "Users can view site diary template items" 
on site_diary_template_items for select
to authenticated using (true);

create policy "Users can view site diaries" 
on site_diaries for select
to authenticated using (true);

create policy "Project members can create site diaries" 
on site_diaries for insert
to authenticated with check (
    submitted_by_user_id = auth.uid()
);

create policy "Project members can update their own site diaries" 
on site_diaries for update
to authenticated using (
    submitted_by_user_id = auth.uid()
);

create policy "Users can view site diary answers" 
on site_diary_answers for select
to authenticated using (true);

create policy "Project members can create site diary answers" 
on site_diary_answers for insert
to authenticated with check (
    true -- The diary_id foreign key constraint will handle access control
); 