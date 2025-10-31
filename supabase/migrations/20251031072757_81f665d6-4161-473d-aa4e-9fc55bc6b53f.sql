-- Fix infinite recursion by using security definer function
-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can view profiles with privacy controls" ON profiles;

-- Create security definer function to check if users share a chat
CREATE OR REPLACE FUNCTION public.users_share_chat(_user_id uuid, _profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM chat_members cm1
    INNER JOIN chat_members cm2 ON cm1.chat_id = cm2.chat_id
    WHERE cm1.user_id = _user_id
    AND cm2.user_id = _profile_id
  );
$$;

-- Create new policy using the security definer function
CREATE POLICY "Users can view profiles with privacy controls" 
ON profiles 
FOR SELECT 
USING (
  auth.uid() IS NOT NULL AND (
    id = auth.uid() OR
    public.users_share_chat(auth.uid(), id)
  )
);