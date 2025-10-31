-- Fix security definer view by using SECURITY INVOKER
-- This ensures the view uses the querying user's permissions, not the creator's

DROP VIEW IF EXISTS public_profile_search;

-- Recreate view with SECURITY INVOKER (RLS will be enforced per user)
CREATE VIEW public_profile_search 
WITH (security_invoker=true)
AS
SELECT 
  id,
  username,
  avatar_url,
  display_name
FROM profiles;

-- Grant access to authenticated users
GRANT SELECT ON public_profile_search TO authenticated;