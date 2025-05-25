-- Add missing insert policy for site diary template items
-- This migration adds INSERT, UPDATE, and DELETE policies for site_diary_template_items table to allow template creation

-- Create an insert policy that allows authenticated users to insert template items for templates they own
create policy "Project members can create site diary template items" 
on site_diary_template_items for insert
to authenticated with check (
    exists (
        select 1 
        from site_diary_templates 
        where site_diary_templates.id = template_id 
        and site_diary_templates.created_by = auth.uid()
    )
);

-- Create a policy for updating template items
create policy "Project members can update site diary template items" 
on site_diary_template_items for update
to authenticated using (
    exists (
        select 1 
        from site_diary_templates 
        where site_diary_templates.id = template_id 
        and site_diary_templates.created_by = auth.uid()
    )
);

-- Create a policy for deleting template items
create policy "Project members can delete site diary template items" 
on site_diary_template_items for delete
to authenticated using (
    exists (
        select 1 
        from site_diary_templates 
        where site_diary_templates.id = template_id 
        and site_diary_templates.created_by = auth.uid()
    )
); 