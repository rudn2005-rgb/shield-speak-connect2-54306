-- Создаем таблицу для отслеживания прочитанных сообщений
CREATE TABLE IF NOT EXISTS public.message_reads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id)
);

-- Включаем RLS
ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;

-- Политики для message_reads
CREATE POLICY "Users can view their own read status"
  ON public.message_reads
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can mark messages as read"
  ON public.message_reads
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.chat_members cm ON m.chat_id = cm.chat_id
      WHERE m.id = message_reads.message_id
        AND cm.user_id = auth.uid()
    )
  );

-- Добавляем индексы для производительности
CREATE INDEX idx_message_reads_message_id ON public.message_reads(message_id);
CREATE INDEX idx_message_reads_user_id ON public.message_reads(user_id);

-- Включаем realtime для таблицы
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reads;