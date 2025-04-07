-- Enable UUID extension if not already enabled
create extension if not exists "uuid-ossp";

-- Drop existing enum if it exists
drop type if exists item_type;

-- Create enum for item types
create type item_type as enum ('question', 'checklist', 'radio_box', 'photo');

-- Create forms table
create table forms (
    id bigint primary key generated always as identity,
    name text not null,
    owner_id uuid references auth.users(id) not null,
    team_id uuid references auth.users(id),
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    deleted_at timestamp with time zone,
    assigned_to uuid[] default '{}',
    version integer default 1 not null,
    is_synced boolean default false not null,
    last_synced_at timestamp with time zone
);

-- Create form items table
create table form_items (
    id bigint primary key generated always as identity,
    form_id bigint references forms(id) on delete cascade not null,
    item_type item_type not null,
    question_value text,
    options jsonb default '[]'::jsonb,
    is_required boolean default false,
    display_order integer not null
);

-- Create indexes
create index forms_owner_id_idx on forms(owner_id);
create index forms_team_id_idx on forms(team_id);
create index form_items_form_id_idx on form_items(form_id);
create index form_items_display_order_idx on form_items(display_order);

-- Create updated_at trigger function
create or replace function update_updated_at_column()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

-- Create triggers
create trigger set_forms_updated_at
    before update on forms
    for each row
    execute function update_updated_at_column();