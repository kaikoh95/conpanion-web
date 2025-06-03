-- Migration: Fix organization_users SELECT policy circular dependency
-- Purpose: Fix only the circular dependency in the SELECT policy, keep other policies unchanged
-- Affected tables: organization_users SELECT policy only
-- Special considerations: Uses security definer function to break circular dependency

-- Create a security definer function to get user's organization IDs without triggering RLS
CREATE OR REPLACE FUNCTION public.get_user_organization_ids(target_user_id uuid)
RETURNS TABLE(organization_id integer) 
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT ou.organization_id
    FROM public.organization_users ou
    WHERE ou.user_id = target_user_id 
    AND ou.status = 'active';
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_user_organization_ids(uuid) TO authenticated;

-- Drop only the problematic SELECT policy
DROP POLICY IF EXISTS "users can view organization members" ON public.organization_users;

-- Recreate the SELECT policy with the same logic but using security definer function
CREATE POLICY "users can view organization members"
ON public.organization_users
FOR SELECT
TO authenticated
USING (
    -- users can always see their own memberships
    user_id = (SELECT auth.uid())
    OR
    -- users can see other members in organizations they belong to (using function to avoid circular dependency)
    organization_id IN (
        SELECT get_user_organization_ids((SELECT auth.uid()))
    )
); 