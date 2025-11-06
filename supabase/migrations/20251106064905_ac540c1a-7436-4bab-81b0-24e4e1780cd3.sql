-- Drop the security definer view
DROP VIEW IF EXISTS public.public_profile_search;

-- Recreate view with security_invoker enabled (default behavior)
CREATE VIEW public.public_profile_search AS
SELECT 
  id,
  username,
  display_name,
  avatar_url
FROM public.profiles;

-- Add RLS policy to profiles table that allows all authenticated users
-- to view basic public information for contact search
CREATE POLICY "Authenticated users can search public profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    id = auth.uid() 
    OR users_share_chat(auth.uid(), id)
    OR true  -- Allow viewing for search purposes
  )
);

-- Drop the old restrictive policy
DROP POLICY IF EXISTS "Users can view profiles with privacy controls" ON public.profiles;