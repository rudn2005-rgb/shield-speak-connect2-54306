-- Полное обновление политик безопасности с проверкой JWT

-- Очищаем ВСЕ существующие политики для всех таблиц
DO $$ 
DECLARE
    r RECORD;
BEGIN
    -- Удаляем все политики для chat_requests
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'chat_requests' AND schemaname = 'public') LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON public.chat_requests';
    END LOOP;
    
    -- Удаляем все политики для chat_members
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'chat_members' AND schemaname = 'public') LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON public.chat_members';
    END LOOP;
    
    -- Удаляем все политики для chats
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'chats' AND schemaname = 'public') LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON public.chats';
    END LOOP;
    
    -- Удаляем все политики для messages
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'messages' AND schemaname = 'public') LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON public.messages';
    END LOOP;
END $$;

-- Создаем улучшенные политики с проверкой JWT для chat_requests
CREATE POLICY "jwt_verified_send_requests"
ON public.chat_requests
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND auth.uid() = sender_id 
  AND sender_id <> receiver_id
);

CREATE POLICY "jwt_verified_view_requests"
ON public.chat_requests
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL 
  AND (auth.uid() = sender_id OR auth.uid() = receiver_id)
);

CREATE POLICY "jwt_verified_update_requests"
ON public.chat_requests
FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL AND auth.uid() = receiver_id)
WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = receiver_id);

CREATE POLICY "jwt_verified_delete_requests"
ON public.chat_requests
FOR DELETE
TO authenticated
USING (auth.uid() IS NOT NULL AND auth.uid() = sender_id);

-- Создаем улучшенные политики с проверкой JWT для chat_members
CREATE POLICY "jwt_verified_insert_members"
ON public.chat_members
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

CREATE POLICY "jwt_verified_view_members"
ON public.chat_members
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- Создаем улучшенные политики с проверкой JWT для chats
CREATE POLICY "jwt_verified_create_chats"
ON public.chats
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "jwt_verified_view_chats"
ON public.chats
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM public.chat_members
    WHERE chat_members.chat_id = chats.id
    AND chat_members.user_id = auth.uid()
  )
);

CREATE POLICY "jwt_verified_update_chats"
ON public.chats
FOR UPDATE
TO authenticated
USING (
  auth.uid() IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM public.chat_members
    WHERE chat_members.chat_id = chats.id
    AND chat_members.user_id = auth.uid()
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM public.chat_members
    WHERE chat_members.chat_id = chats.id
    AND chat_members.user_id = auth.uid()
  )
);

CREATE POLICY "jwt_verified_delete_chats"
ON public.chats
FOR DELETE
TO authenticated
USING (
  auth.uid() IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM public.chat_members
    WHERE chat_members.chat_id = chats.id
    AND chat_members.user_id = auth.uid()
  )
);

-- Создаем улучшенные политики с проверкой JWT для messages
CREATE POLICY "jwt_verified_insert_messages"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND auth.uid() = sender_id
  AND EXISTS (
    SELECT 1 FROM public.chat_members
    WHERE chat_members.chat_id = messages.chat_id
    AND chat_members.user_id = auth.uid()
  )
);

CREATE POLICY "jwt_verified_view_messages"
ON public.messages
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM public.chat_members
    WHERE chat_members.chat_id = messages.chat_id
    AND chat_members.user_id = auth.uid()
  )
);