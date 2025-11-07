-- Fix critical security issue: Remove OR true from profiles SELECT policy
-- This prevents all authenticated users from viewing all profiles
DROP POLICY IF EXISTS "Authenticated users can search public profiles" ON public.profiles;

CREATE POLICY "Users can view own profile and chat contacts"
ON public.profiles
FOR SELECT
USING (
  (auth.uid() IS NOT NULL) AND 
  ((id = auth.uid()) OR users_share_chat(auth.uid(), id))
);