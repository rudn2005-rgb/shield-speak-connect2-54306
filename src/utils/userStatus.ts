/**
 * Utility functions for determining user online status
 */

/**
 * Check if a user is online based on their last_seen timestamp
 * A user is considered online if their last_seen is within the last 60 seconds
 */
export const isUserOnline = (lastSeen: string | null, status: string | null): boolean => {
  if (!lastSeen) return false;
  
  const lastSeenDate = new Date(lastSeen);
  const now = new Date();
  const timeDifferenceMs = now.getTime() - lastSeenDate.getTime();
  const timeDifferenceSeconds = timeDifferenceMs / 1000;
  
  // User is online if they updated status within last 60 seconds
  // This accounts for the 30-second heartbeat interval plus some buffer
  return status === "online" && timeDifferenceSeconds < 60;
};

/**
 * Get formatted last seen text
 */
export const getLastSeenText = (lastSeen: string | null, status: string | null): string => {
  if (isUserOnline(lastSeen, status)) {
    return "онлайн";
  }
  
  if (!lastSeen) return "не в сети";
  
  const lastSeenDate = new Date(lastSeen);
  const now = new Date();
  const diffMs = now.getTime() - lastSeenDate.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  
  if (diffMinutes < 1) return "только что был(а)";
  if (diffMinutes < 60) return `был(а) ${diffMinutes} мин. назад`;
  
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `был(а) ${diffHours} ч. назад`;
  
  const diffDays = Math.floor(diffHours / 24);
  return `был(а) ${diffDays} д. назад`;
};
