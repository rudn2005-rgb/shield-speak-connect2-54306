-- Create a secure function to create chats with members
CREATE OR REPLACE FUNCTION public.create_chat_with_members(
  other_user_id uuid,
  is_group_chat boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_chat_id uuid;
BEGIN
  -- Verify both users exist
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = other_user_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  -- Create chat
  INSERT INTO chats (is_group) 
  VALUES (is_group_chat)
  RETURNING id INTO new_chat_id;
  
  -- Add both members
  INSERT INTO chat_members (chat_id, user_id) VALUES
    (new_chat_id, auth.uid()),
    (new_chat_id, other_user_id);
  
  RETURN new_chat_id;
END;
$$;