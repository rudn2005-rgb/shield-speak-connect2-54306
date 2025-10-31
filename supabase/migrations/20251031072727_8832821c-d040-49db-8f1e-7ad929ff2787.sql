-- Fix infinite recursion in profiles RLS policy
-- Drop the problematic policy and create a simpler one

DROP POLICY IF EXISTS "Users can view profiles with privacy controls" ON profiles;

-- Create a simpler policy that doesn't cause recursion
-- Users can view their own profile and profiles of users they share chats with
CREATE POLICY "Users can view profiles with privacy controls" 
ON profiles 
FOR SELECT 
USING (
  auth.uid() IS NOT NULL AND (
    id = auth.uid() OR
    EXISTS (
      SELECT 1
      FROM chat_members cm1
      WHERE cm1.user_id = auth.uid()
      AND EXISTS (
        SELECT 1
        FROM chat_members cm2
        WHERE cm2.chat_id = cm1.chat_id
        AND cm2.user_id = profiles.id
      )
    )
  )
);