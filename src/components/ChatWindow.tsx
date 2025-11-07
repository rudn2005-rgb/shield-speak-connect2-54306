import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Send, Phone, Video, MoreVertical } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { toast } from "sonner";
import { z } from "zod";
import { getUserFriendlyError } from "@/lib/errorHandler";
import VideoCall from "./VideoCall";

const messageSchema = z.string()
  .trim()
  .min(1, "Сообщение не может быть пустым")
  .max(2000, "Сообщение слишком длинное (максимум 2000 символов)")
  .refine(
    (msg) => !/[\x00-\x08\x0B-\x0C\x0E-\x1F]/.test(msg),
    "Сообщение содержит недопустимые символы"
  )
  .refine(
    (msg) => !/<script|<iframe|javascript:|onerror=|onload=/i.test(msg),
    "Сообщение содержит потенциально опасный контент"
  )
  .refine(
    (msg) => {
      // Prevent HTML entity injection
      const htmlEntityPattern = /&#x?[0-9a-f]+;|&[a-z]+;/i;
      const entities = msg.match(new RegExp(htmlEntityPattern, 'gi'));
      if (entities) {
        // Allow common safe entities only
        const safeEntities = ['&amp;', '&lt;', '&gt;', '&quot;', '&#39;'];
        return entities.every(entity => safeEntities.includes(entity.toLowerCase()));
      }
      return true;
    },
    "Сообщение содержит подозрительные HTML-сущности"
  );

interface Message {
  id: string;
  content: string;
  sender_id: string;
  created_at: string;
  sender?: {
    display_name: string;
    avatar_url: string | null;
  };
}

interface ChatWindowProps {
  chatId: string;
}

const ChatWindow = ({ chatId }: ChatWindowProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [chatName, setChatName] = useState<string | null>(null);
  const [otherUserId, setOtherUserId] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [isVideoCallOpen, setIsVideoCallOpen] = useState(false);
  const [isIncomingCall, setIsIncomingCall] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadMessages();
    loadChatInfo();

    const messagesChannel = supabase
      .channel(`messages-${chatId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => {
          loadMessages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
    };
  }, [chatId]);

  // Отслеживание онлайн статуса собеседника
  useEffect(() => {
    if (!otherUserId) return;

    const loadStatus = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("status")
        .eq("id", otherUserId)
        .single();
      
      if (data) {
        setIsOnline(data.status === "online");
      }
    };

    loadStatus();

    const statusChannel = supabase
      .channel(`status-${otherUserId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${otherUserId}`,
        },
        (payload: any) => {
          setIsOnline(payload.new.status === "online");
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(statusChannel);
    };
  }, [otherUserId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const loadChatInfo = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);

      const { data: chat } = await (supabase as any)
        .from("chats")
        .select("name, is_group")
        .eq("id", chatId)
        .single();

      if (chat && !chat.is_group) {
        const { data: members } = await (supabase as any)
          .from("chat_members")
          .select("user_id")
          .eq("chat_id", chatId)
          .neq("user_id", user.id)
          .single();

        if (members) {
          setOtherUserId(members.user_id);
          const { data: profile } = await (supabase as any)
            .from("profiles")
            .select("display_name, status")
            .eq("id", members.user_id)
            .single();

          if (profile) {
            setChatName(profile.display_name);
            setIsOnline(profile.status === "online");
          }
        }
      } else if (chat) {
        setChatName(chat.name || "Группа");
      }
    } catch (error) {
      console.error("Error loading chat info:", error);
    }
  };

  const loadMessages = async () => {
    try {
      const { data: messagesData } = await (supabase as any)
        .from("messages")
        .select("*")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true });

      if (!messagesData) return;

      const messagesWithSenders = await Promise.all(
        messagesData.map(async (message) => {
          const { data: profile } = await (supabase as any)
            .from("profiles")
            .select("display_name, avatar_url")
            .eq("id", message.sender_id)
            .single();

          return { ...message, sender: profile };
        })
      );

      setMessages(messagesWithSenders);
      
      // Помечаем все непрочитанные сообщения как прочитанные
      await markMessagesAsRead(messagesData);
    } catch (error) {
      console.error("Error loading messages:", error);
    } finally {
      setLoading(false);
    }
  };

  const markMessagesAsRead = async (messages: any[]) => {
    if (!currentUserId) return;

    try {
      // Получаем сообщения, которые не отправлены текущим пользователем
      const otherUserMessages = messages.filter(m => m.sender_id !== currentUserId);
      
      if (otherUserMessages.length === 0) return;

      // Получаем уже прочитанные сообщения
      const { data: existingReads } = await (supabase as any)
        .from("message_reads")
        .select("message_id")
        .in("message_id", otherUserMessages.map(m => m.id))
        .eq("user_id", currentUserId);

      const readMessageIds = new Set(existingReads?.map((r: any) => r.message_id) || []);
      
      // Отмечаем непрочитанные сообщения
      const unreadMessages = otherUserMessages.filter(m => !readMessageIds.has(m.id));
      
      if (unreadMessages.length > 0) {
        const readRecords = unreadMessages.map(m => ({
          message_id: m.id,
          user_id: currentUserId
        }));

        await (supabase as any)
          .from("message_reads")
          .insert(readRecords);
      }
    } catch (error) {
      console.error("Error marking messages as read:", error);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserId) return;

    try {
      const validatedContent = messageSchema.parse(newMessage);

      const { error } = await (supabase as any).from("messages").insert({
        chat_id: chatId,
        sender_id: currentUserId,
        content: validatedContent,
      });

      if (error) throw error;

      await (supabase as any)
        .from("chats")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", chatId);

      setNewMessage("");
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      } else {
        toast.error(getUserFriendlyError(error));
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Загрузка сообщений...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback className="bg-primary/10 text-primary">
              {(chatName && chatName.charAt(0).toUpperCase()) || "?"}
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="font-semibold">{chatName || "Неизвестный контакт"}</h2>
            <p className="text-xs text-muted-foreground">
              {isOnline ? "онлайн" : "не в сети"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => toast.info("Голосовые звонки будут доступны в следующей версии")}
          >
            <Phone className="w-5 h-5" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => {
              if (!otherUserId) {
                toast.error("Не удалось определить собеседника");
                return;
              }
              setIsVideoCallOpen(true);
            }}
          >
            <Video className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon">
            <MoreVertical className="w-5 h-5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => {
          const isOwn = message.sender_id === currentUserId;
          return (
            <div
              key={message.id}
              className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`flex gap-2 max-w-[70%] ${
                  isOwn ? "flex-row-reverse" : "flex-row"
                }`}
              >
                {!isOwn && (
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={message.sender?.avatar_url || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {(message.sender?.display_name && message.sender.display_name.charAt(0).toUpperCase()) || "?"}
                    </AvatarFallback>
                  </Avatar>
                )}
                <div>
                  <div
                    className={`rounded-2xl px-4 py-2 ${
                      isOwn
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground"
                    }`}
                  >
                    <p className="text-sm">{message.content}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 px-2">
                    {formatDistanceToNow(new Date(message.created_at), {
                      addSuffix: true,
                      locale: ru,
                    })}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={sendMessage} className="p-4 border-t border-border bg-card">
        <div className="flex gap-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Введите сообщение..."
            className="flex-1"
          />
          <Button type="submit" disabled={!newMessage.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </form>

      {currentUserId && otherUserId && (
        <VideoCall
          isOpen={isVideoCallOpen}
          onClose={() => setIsVideoCallOpen(false)}
          chatId={chatId}
          currentUserId={currentUserId}
          otherUserId={otherUserId}
          isInitiator={true}
        />
      )}
    </div>
  );
};

export default ChatWindow;