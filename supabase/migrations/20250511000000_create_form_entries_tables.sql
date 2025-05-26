-- Create form_entries table
create table form_entries (
    id bigint primary key generated always as identity,
    form_id bigint references forms(id) not null,
    name text null, -- Added entry name column
    submitted_by_user_id uuid references auth.users(id) not null,
    team_id uuid references auth.users(id), -- Nullable as requested, references auth.users like in forms table
    created_at timestamptz default now() not null,
    updated_at timestamptz default now() not null,
    deleted_at timestamptz,
    is_synced boolean default false not null,
    last_synced_at timestamptz
);

comment on column form_entries.name is 'Optional name for the specific form entry'; -- Added comment
comment on column form_entries.team_id is 'Optional reference to a team (currently points to auth.users)';
comment on column form_entries.created_at is 'Entry creation timestamp in UTC';
comment on column form_entries.updated_at is 'Entry last update timestamp in UTC';
comment on column form_entries.deleted_at is 'Entry soft delete timestamp in UTC';
comment on column form_entries.last_synced_at is 'Timestamp of last sync in UTC';

-- Add indexes for form_entries
create index idx_form_entries_form_id on form_entries(form_id);
create index idx_form_entries_submitted_by_user_id on form_entries(submitted_by_user_id);
create index idx_form_entries_team_id on form_entries(team_id);

-- Apply the existing updated_at trigger function to form_entries
-- Assumes 'update_updated_at_column' function exists from 20250402153700_create_forms_scheme.sql
create trigger set_form_entries_updated_at
    before update on form_entries
    for each row
    execute function update_updated_at_column();

-- Create form_entry_answers table
create table form_entry_answers (
    id bigint primary key generated always as identity,
    entry_id bigint references form_entries(id) on delete cascade not null,
    item_id bigint references form_items(id) on delete cascade not null,
    answer_value jsonb, -- Storing answer flexibly as JSONB
    created_at timestamptz default now() not null
    -- No updated_at needed per user request
);

comment on column form_entry_answers.entry_id is 'Link to the specific form entry submission';
comment on column form_entry_answers.item_id is 'Link to the specific item (question/field) in the form definition';
comment on column form_entry_answers.answer_value is 'The actual answer provided by the user for the item';
comment on column form_entry_answers.created_at is 'Answer creation timestamp in UTC';

-- Add indexes for form_entry_answers
create index idx_form_entry_answers_entry_id on form_entry_answers(entry_id);
create index idx_form_entry_answers_item_id on form_entry_answers(item_id);

-- Note: Row Level Security (RLS) policies for these tables should be added separately.
-- Note: Linking to the 'approvals' table happens externally by creating an 'approvals' row
-- with entity_type = 'entries' and entity_id = form_entries.id when needed. 