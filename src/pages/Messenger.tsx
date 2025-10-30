import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import ChatList from "@/components/ChatList";
import ChatWindow from "@/components/ChatWindow";
import ContactSearch from "@/components/ContactSearch";
import ChatRequests from "@/components/ChatRequests";
import { useUserPresence } from "@/hooks/useUserPresence";
import { LogOut, Plus, Shield, MessageCircle, Bell } from "lucide-react";
import { toast } from "sonner";

const Messenger = () => {
  const navigate = useNavigate();
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isRequestsOpen, setIsRequestsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);

  // Отслеживаем статус пользователя
  useUserPresence(currentUserId || null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth");
      } else {
        setCurrentUserId(session.user.id);
        // Обновляем статус на "online" при входе
        updateUserStatus(session.user.id, "online");
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!session) {
          navigate("/auth");
        } else {
          setCurrentUserId(session.user.id);
          updateUserStatus(session.user.id, "online");
        }
      }
    );

    // Обновляем статус на "offline" при закрытии страницы
    const handleBeforeUnload = () => {
      if (currentUserId) {
        updateUserStatus(currentUserId, "offline");
      }
    };
    
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (currentUserId) {
        updateUserStatus(currentUserId, "offline");
      }
    };
  }, [navigate]);

  const updateUserStatus = async (userId: string, status: "online" | "offline") => {
    try {
      await supabase
        .from("profiles")
        .update({ 
          status,
          last_seen: new Date().toISOString()
        })
        .eq("id", userId);
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };

  useEffect(() => {
    if (!currentUserId) return;

    const loadPendingRequests = async () => {
      const { data, error } = await supabase
        .from("chat_requests")
        .select("id")
        .eq("receiver_id", currentUserId)
        .eq("status", "pending");

      if (!error && data) {
        setPendingRequestsCount(data.length);
      }
    };

    loadPendingRequests();

    const channel = supabase
      .channel("requests_count")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_requests",
          filter: `receiver_id=eq.${currentUserId}`,
        },
        () => loadPendingRequests()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const sendChatRequest = async (targetProfileId: string) => {
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (targetProfileId === user.id) {
        toast.error("Нельзя отправить запрос самому себе");
        return;
      }

      // Проверяем, существует ли уже чат
      const { data: existingMembers } = await supabase
        .from("chat_members")
        .select("chat_id")
        .eq("user_id", user.id);

      if (existingMembers) {
        for (const member of existingMembers) {
          const { data: otherMember } = await supabase
            .from("chat_members")
            .select("chat_id")
            .eq("chat_id", member.chat_id)
            .eq("user_id", targetProfileId)
            .maybeSingle();

          if (otherMember) {
            setSelectedChatId(member.chat_id);
            setIsDialogOpen(false);
            toast.success("Чат уже существует");
            return;
          }
        }
      }

      // Проверяем существующий запрос
      const { data: existingRequest } = await supabase
        .from("chat_requests")
        .select("id, status")
        .eq("sender_id", user.id)
        .eq("receiver_id", targetProfileId)
        .maybeSingle();

      if (existingRequest) {
        if (existingRequest.status === "pending") {
          toast.info("Запрос уже отправлен");
        } else {
          toast.info("Запрос был отклонен");
        }
        return;
      }

      // Отправляем запрос
      const { error } = await supabase
        .from("chat_requests")
        .insert({
          sender_id: user.id,
          receiver_id: targetProfileId,
        });

      if (error) throw error;

      setIsDialogOpen(false);
      toast.success("Запрос отправлен! Ожидайте подтверждения.");
    } catch (error: any) {
      toast.error(error.message || "Ошибка отправки запроса");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-background">
      <div className="w-80 border-r border-border flex flex-col bg-card">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold">SecureChat</h1>
          </div>
          <Button variant="ghost" size="icon" onClick={handleLogout}>
            <LogOut className="w-5 h-5" />
          </Button>
        </div>

        <div className="p-4 space-y-2">
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="w-full">
                <Plus className="w-4 h-4 mr-2" />
                Новый чат
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Отправить запрос на чат</DialogTitle>
              </DialogHeader>
              <ContactSearch
                onSelectContact={(profile) => sendChatRequest(profile.id)}
                currentUserId={currentUserId}
              />
            </DialogContent>
          </Dialog>

          <Dialog open={isRequestsOpen} onOpenChange={setIsRequestsOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full relative">
                <Bell className="w-4 h-4 mr-2" />
                Запросы
                {pendingRequestsCount > 0 && (
                  <Badge 
                    variant="destructive" 
                    className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
                  >
                    {pendingRequestsCount}
                  </Badge>
                )}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Запросы на чат</DialogTitle>
              </DialogHeader>
              <ChatRequests
                currentUserId={currentUserId}
                onRequestAccepted={() => {
                  setIsRequestsOpen(false);
                }}
              />
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex-1 overflow-hidden">
          <ChatList
            onSelectChat={setSelectedChatId}
            selectedChatId={selectedChatId}
          />
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {selectedChatId ? (
          <ChatWindow chatId={selectedChatId} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <MessageCircle className="w-24 h-24 text-muted-foreground mb-6" />
            <h2 className="text-2xl font-bold mb-2">Добро пожаловать в SecureChat</h2>
            <p className="text-muted-foreground max-w-md">
              Выберите чат слева или создайте новый, чтобы начать безопасное общение
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Messenger;
