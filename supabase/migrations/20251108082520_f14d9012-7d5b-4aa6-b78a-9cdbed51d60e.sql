-- Add RLS policy for public search of all users
-- This allows authenticated users to search for new contacts

CREATE POLICY "Authenticated users can search all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
);

-- Note: This policy works alongside the existing "Users can view own profile and chat contacts" policy
-- PostgreSQL RLS policies with USING clauses are combined with OR logic
-- So users can now see:
-- 1. Their own profile (existing policy)
-- 2. Profiles of users they share chats with (existing policy)  
-- 3. All user profiles for search purposes (new policy)