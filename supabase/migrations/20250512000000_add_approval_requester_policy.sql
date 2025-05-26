-- Migration: Add policy to allow requesters to submit their own approvals
-- Description: This migration adds a new RLS policy to the approvals table that allows users to submit their own approvals
-- when they are the requester and the approval is in draft or revision_requested status.

-- Drop the policy if it exists to ensure idempotency
drop policy if exists "Allow requesters to submit their own approvals" on public.approvals;

-- Create the policy to allow requesters to submit their own approvals
create policy "Allow requesters to submit their own approvals"
on public.approvals
as permissive
for update
to authenticated
using (
  requester_id = (select auth.uid()) AND
  status IN ('draft', 'revision_requested')
)
with check (
  status = 'submitted'
); 