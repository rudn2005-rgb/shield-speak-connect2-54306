-- Replace overly permissive profiles SELECT policy with privacy-focused policy
-- This allows: 
-- 1. Users to see their own full profile
-- 2. Users to search others by username/avatar (for contact search)
-- 3. Full profile details (including phone, status, last_seen) only for connected contacts

DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;

-- Create new policy that restricts PII to connected contacts only
CREATE POLICY "Users can view profiles with privacy controls"
ON profiles FOR SELECT
USING (
  auth.uid() IS NOT NULL AND (
    -- Users can always see their own profile
    id = auth.uid() OR
    -- Users can see full details of contacts they share chats with
    EXISTS (
      SELECT 1 FROM chat_members cm1
      JOIN chat_members cm2 ON cm1.chat_id = cm2.chat_id
      WHERE cm1.user_id = auth.uid()
      AND cm2.user_id = profiles.id
    )
  )
);

-- Create a separate view for public search (username and avatar only, no PII)
CREATE OR REPLACE VIEW public_profile_search AS
SELECT 
  id,
  username,
  avatar_url,
  display_name
FROM profiles;

-- Grant access to the public search view
GRANT SELECT ON public_profile_search TO authenticated;