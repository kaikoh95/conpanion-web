-- Create a helper function to get user details from the auth schema
CREATE OR REPLACE FUNCTION public.get_user_details(user_ids uuid[])
RETURNS TABLE (
  id uuid,
  raw_user_meta_data jsonb
) 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.raw_user_meta_data
  FROM auth.users u
  WHERE u.id = ANY(user_ids);
END;
$$;

-- Set permissions for the function
GRANT EXECUTE ON FUNCTION public.get_user_details(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_details(uuid[]) TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_details(uuid[]) TO service_role; 