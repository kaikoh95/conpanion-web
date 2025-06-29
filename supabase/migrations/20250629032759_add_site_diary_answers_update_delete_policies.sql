-- Add missing UPDATE and DELETE policies for site_diary_answers table
-- These policies allow users to update/delete answers for site diaries they own

-- Policy to allow updating site diary answers for diaries the user owns
create policy "Project members can update site diary answers for their own diaries" 
on site_diary_answers for update
to authenticated using (
    exists (
        select 1 
        from site_diaries 
        where site_diaries.id = diary_id 
        and site_diaries.submitted_by_user_id = auth.uid()
    )
);

-- Policy to allow deleting site diary answers for diaries the user owns
create policy "Project members can delete site diary answers for their own diaries" 
on site_diary_answers for delete
to authenticated using (
    exists (
        select 1 
        from site_diaries 
        where site_diaries.id = diary_id 
        and site_diaries.submitted_by_user_id = auth.uid()
    )
);
