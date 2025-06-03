-- Migration: Fix user_profiles RLS policy causing 500 errors
-- Purpose: Simplify user_profiles SELECT policy to prevent complex subquery issues
-- Affected tables: user_profiles RLS policies
-- Special considerations: Addresses performance and circular dependency issues

-- Drop the problematic policy with complex subqueries
DROP POLICY IF EXISTS "users can view relevant user profiles" ON public.user_profiles;

-- Create a simple policy allowing all authenticated users to view profiles
-- This eliminates circular dependencies and performance issues
CREATE POLICY "authenticated users can view user profiles"
ON public.user_profiles
FOR SELECT
TO authenticated
USING ( true );

-- Add an index to optimize the policy performance
CREATE INDEX IF NOT EXISTS user_profiles_auth_lookup_idx ON public.user_profiles(id) WHERE id IS NOT NULL; 