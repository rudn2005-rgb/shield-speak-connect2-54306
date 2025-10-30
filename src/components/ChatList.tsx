import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { MessageCircle } from "lucide-react";

interface Chat {
  id: string;
  name: string | null;
  is_group: boolean;
  avatar_url: string | null;
  updated_at: string;
  other_user?: {
    display_name: string;
    avatar_url: string | null;
    status: string;
  };
  last_message?: {
    content: string;
    created_at: string;
  };
}

interface ChatListProps {
  onSelectChat: (chatId: string) => void;
  selectedChatId: string | null;
}

const ChatList = ({ onSelectChat, selectedChatId }: ChatListProps) => {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadChats();

    const chatsChannel = supabase
      .channel("chats-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chats",
        },
        () => {
          loadChats();
        }
      )
      .subscribe();

    const membersChannel = supabase
      .channel("members-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_members",
        },
        () => {
          loadChats();
        }
      )
      .subscribe();

    const profilesChannel = supabase
      .channel("profiles-status")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
        },
        () => {
          loadChats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(chatsChannel);
      supabase.removeChannel(membersChannel);
      supabase.removeChannel(profilesChannel);
    };
  }, []);

  const loadChats = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: chatMembers } = await (supabase as any)
        .from("chat_members")
        .select("chat_id")
        .eq("user_id", user.id);

      if (!chatMembers) return;

      const chatIds = chatMembers.map((cm) => cm.chat_id);

      const { data: chatsData } = await (supabase as any)
        .from("chats")
        .select("*")
        .in("id", chatIds)
        .order("updated_at", { ascending: false });

      if (!chatsData) return;

      const chatsWithDetails = await Promise.all(
        chatsData.map(async (chat) => {
          if (!chat.is_group) {
            const { data: members } = await (supabase as any)
              .from("chat_members")
              .select("user_id")
              .eq("chat_id", chat.id)
              .neq("user_id", user.id)
              .single();

            if (members) {
              const { data: profile } = await (supabase as any)
                .from("profiles")
                .select("display_name, avatar_url, status")
                .eq("id", members.user_id)
                .single();

              if (profile) {
                return { ...chat, other_user: profile };
              }
            }
          }

          const { data: lastMessage } = await (supabase as any)
            .from("messages")
            .select("content, created_at")
            .eq("chat_id", chat.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          return { ...chat, last_message: lastMessage };
        })
      );

      setChats(chatsWithDetails);
    } catch (error) {
      console.error("Error loading chats:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Загрузка чатов...</div>
      </div>
    );
  }

  if (chats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <MessageCircle className="w-16 h-16 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">Нет чатов</h3>
        <p className="text-sm text-muted-foreground">
          Создайте новый чат, чтобы начать общение
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {chats.map((chat) => {
        const displayName = chat.is_group
          ? chat.name
          : chat.other_user?.display_name || "Unknown";
        const isOnline = chat.other_user?.status === "online";

        return (
          <button
            key={chat.id}
            onClick={() => onSelectChat(chat.id)}
            className={`flex items-center gap-3 p-4 hover:bg-secondary/50 transition-colors border-b border-border ${
              selectedChatId === chat.id ? "bg-secondary" : ""
            }`}
          >
            <div className="relative">
              <Avatar className="w-12 h-12">
                <AvatarImage src={chat.avatar_url || chat.other_user?.avatar_url || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary">
                  {displayName?.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {!chat.is_group && isOnline && (
                <div className="absolute bottom-0 right-0 w-3 h-3 bg-accent rounded-full border-2 border-background" />
              )}
            </div>

            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-semibold truncate">{displayName}</h3>
                {chat.last_message && (
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(chat.last_message.created_at), {
                      addSuffix: true,
                      locale: ru,
                    })}
                  </span>
                )}
              </div>
              {chat.last_message && (
                <p className="text-sm text-muted-foreground truncate">
                  {chat.last_message.content}
                </p>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default ChatList;