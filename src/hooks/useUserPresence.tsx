import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const useUserPresence = (userId: string | null) => {
  useEffect(() => {
    if (!userId) return;

    const updateStatus = async (status: "online" | "offline") => {
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

    // Set status to "online" when component mounts
    updateStatus("online");

    // Update status every 30 seconds to maintain online presence
    const interval = setInterval(() => {
      updateStatus("online");
    }, 30000);

    // Set status to "offline" on cleanup
    // Note: beforeunload events with sendBeacon cannot include authentication headers,
    // so we rely on the 30-second heartbeat timeout to eventually mark users as offline
    return () => {
      clearInterval(interval);
      updateStatus("offline");
    };
  }, [userId]);
};
