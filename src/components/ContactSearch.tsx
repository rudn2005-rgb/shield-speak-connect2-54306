import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, User } from "lucide-react";
import { z } from "zod";

// Input validation schema for search queries
const searchSchema = z.string()
  .max(50, "Поисковый запрос слишком длинный")
  .regex(/^[a-zA-Zа-яА-ЯёЁ0-9@.\-+\s]*$/, "Недопустимые символы в запросе");

interface Profile {
  id: string;
  username: string | null;
  phone_number: string | null;
  avatar_url: string | null;
}

interface ContactSearchProps {
  onSelectContact: (profile: Profile) => void;
  currentUserId: string;
}

const ContactSearch = ({ onSelectContact, currentUserId }: ContactSearchProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());

  useEffect(() => {
    const loadSentRequests = async () => {
      try {
        const { data } = await supabase
          .from("chat_requests")
          .select("receiver_id")
          .eq("sender_id", currentUserId)
          .eq("status", "pending");

        if (data) {
          setSentRequests(new Set(data.map((r) => r.receiver_id)));
        }
      } catch (error) {
        console.error("Error loading sent requests:", error);
      }
    };

    loadSentRequests();
  }, [currentUserId]);

  useEffect(() => {
    const searchContacts = async () => {
      if (!searchQuery.trim()) {
        setResults([]);
        return;
      }

      setLoading(true);
      try {
        // Validate input
        const validatedQuery = searchSchema.parse(searchQuery.trim());
        
        // Escape special characters for ILIKE pattern matching
        const escapedQuery = validatedQuery.replace(/[%_]/g, '\\$&');
        
        const { data, error } = await supabase
          .from("profiles")
          .select("id, username, phone_number, avatar_url")
          .or(`username.ilike.%${escapedQuery}%,phone_number.ilike.%${escapedQuery}%`)
          .neq("id", currentUserId)
          .limit(10);

        if (error) throw error;
        setResults(data || []);
      } catch (error) {
        if (error instanceof z.ZodError) {
          console.error("Invalid search input:", error.errors[0].message);
        } else {
          console.error("Search error:", error);
        }
        setResults([]);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(searchContacts, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery, currentUserId]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Поиск по имени или номеру телефона..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {searchQuery && (
        <ScrollArea className="h-[300px] border rounded-md">
          {loading ? (
            <div className="p-4 text-center text-muted-foreground">
              Поиск...
            </div>
          ) : results.length > 0 ? (
            <div className="p-2">
              {results.map((profile) => {
                const alreadyRequested = sentRequests.has(profile.id);
                return (
                  <button
                    key={profile.id}
                    onClick={() => !alreadyRequested && onSelectContact(profile)}
                    disabled={alreadyRequested}
                    className="w-full flex items-center gap-3 p-3 hover:bg-accent rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Avatar>
                      <AvatarImage src={profile.avatar_url || undefined} />
                      <AvatarFallback>
                        <User className="w-4 h-4" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 text-left">
                      <p className="font-medium">
                        {profile.username || "Без имени"}
                      </p>
                      {profile.phone_number && (
                        <p className="text-sm text-muted-foreground">
                          {profile.phone_number}
                        </p>
                      )}
                      {alreadyRequested && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Запрос отправлен
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-4 text-center text-muted-foreground">
              Пользователи не найдены
            </div>
          )}
        </ScrollArea>
      )}
    </div>
  );
};

export default ContactSearch;
