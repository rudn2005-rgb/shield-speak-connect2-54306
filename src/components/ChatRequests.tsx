import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Check, X, Clock } from "lucide-react";
import { toast } from "sonner";
import { getUserFriendlyError } from "@/lib/errorHandler";

interface Profile {
  id: string;
  username: string | null;
  phone_number: string | null;
  avatar_url: string | null;
}

interface ChatRequest {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: string;
  created_at: string;
  sender?: Profile;
  receiver?: Profile;
}

interface ChatRequestsProps {
  currentUserId: string;
  onRequestAccepted: () => void;
}

const ChatRequests = ({ currentUserId, onRequestAccepted }: ChatRequestsProps) => {
  const [incomingRequests, setIncomingRequests] = useState<ChatRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<ChatRequest[]>([]);
  const [loading, setLoading] = useState(false);

  const loadRequests = async () => {
    try {
      // Входящие запросы с данными отправителя
      const { data: incomingData } = await supabase
        .from("chat_requests")
        .select("*")
        .eq("receiver_id", currentUserId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (incomingData) {
        const incomingWithProfiles = await Promise.all(
          incomingData.map(async (request) => {
            const { data: sender } = await supabase
              .from("profiles")
              .select("id, username, phone_number, avatar_url")
              .eq("id", request.sender_id)
              .single();
            return { ...request, sender };
          })
        );
        setIncomingRequests(incomingWithProfiles);
      }

      // Исходящие запросы с данными получателя
      const { data: outgoingData } = await supabase
        .from("chat_requests")
        .select("*")
        .eq("sender_id", currentUserId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (outgoingData) {
        const outgoingWithProfiles = await Promise.all(
          outgoingData.map(async (request) => {
            const { data: receiver } = await supabase
              .from("profiles")
              .select("id, username, phone_number, avatar_url")
              .eq("id", request.receiver_id)
              .single();
            return { ...request, receiver };
          })
        );
        setOutgoingRequests(outgoingWithProfiles);
      }
    } catch (error) {
      console.error("Error loading requests:", error);
    }
  };

  useEffect(() => {
    loadRequests();

    // Подписка на изменения
    const channel = supabase
      .channel("chat_requests_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_requests",
          filter: `receiver_id=eq.${currentUserId}`,
        },
        () => loadRequests()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_requests",
          filter: `sender_id=eq.${currentUserId}`,
        },
        () => loadRequests()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  const acceptRequest = async (requestId: string, senderId: string) => {
    setLoading(true);
    try {
      // Use secure database function to create chat with both members
      const { data: newChatId, error: chatError } = await supabase
        .rpc("create_chat_with_members", {
          other_user_id: senderId,
          is_group_chat: false,
        });

      if (chatError) throw chatError;

      // Update request status to accepted
      const { error: updateError } = await supabase
        .from("chat_requests")
        .update({ status: "accepted" })
        .eq("id", requestId);

      if (updateError) throw updateError;

      toast.success("Запрос принят, чат создан!");
      onRequestAccepted();
    } catch (error: any) {
      toast.error(getUserFriendlyError(error));
    } finally {
      setLoading(false);
    }
  };

  const rejectRequest = async (requestId: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from("chat_requests")
        .update({ status: "rejected" })
        .eq("id", requestId);

      if (error) throw error;
      toast.success("Запрос отклонен");
    } catch (error: any) {
      toast.error(getUserFriendlyError(error));
    } finally {
      setLoading(false);
    }
  };

  const cancelRequest = async (requestId: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from("chat_requests")
        .delete()
        .eq("id", requestId);

      if (error) throw error;
      toast.success("Запрос отменен");
    } catch (error: any) {
      toast.error(getUserFriendlyError(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Tabs defaultValue="incoming" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="incoming">
          Входящие ({incomingRequests.length})
        </TabsTrigger>
        <TabsTrigger value="outgoing">
          Исходящие ({outgoingRequests.length})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="incoming">
        <ScrollArea className="h-[400px]">
          {incomingRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[300px] text-center p-4">
              <Clock className="w-12 h-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">Нет входящих запросов</p>
            </div>
          ) : (
            <div className="space-y-2 p-2">
              {incomingRequests.map((request) => (
                <div
                  key={request.id}
                  className="flex items-center gap-3 p-3 bg-card border rounded-lg"
                >
                  <Avatar>
                    <AvatarImage src={request.sender?.avatar_url || undefined} />
                    <AvatarFallback>
                      <User className="w-4 h-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-medium">
                      {request.sender?.username || "Без имени"}
                    </p>
                    {request.sender?.phone_number && (
                      <p className="text-sm text-muted-foreground">
                        {request.sender.phone_number}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="icon"
                      variant="default"
                      onClick={() => acceptRequest(request.id, request.sender_id)}
                      disabled={loading}
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="destructive"
                      onClick={() => rejectRequest(request.id)}
                      disabled={loading}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </TabsContent>

      <TabsContent value="outgoing">
        <ScrollArea className="h-[400px]">
          {outgoingRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[300px] text-center p-4">
              <Clock className="w-12 h-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">Нет исходящих запросов</p>
            </div>
          ) : (
            <div className="space-y-2 p-2">
              {outgoingRequests.map((request) => (
                <div
                  key={request.id}
                  className="flex items-center gap-3 p-3 bg-card border rounded-lg"
                >
                  <Avatar>
                    <AvatarImage src={request.receiver?.avatar_url || undefined} />
                    <AvatarFallback>
                      <User className="w-4 h-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-medium">
                      {request.receiver?.username || "Без имени"}
                    </p>
                    {request.receiver?.phone_number && (
                      <p className="text-sm text-muted-foreground">
                        {request.receiver.phone_number}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Ожидает подтверждения...
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => cancelRequest(request.id)}
                    disabled={loading}
                  >
                    Отменить
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </TabsContent>
    </Tabs>
  );
};

export default ChatRequests;
