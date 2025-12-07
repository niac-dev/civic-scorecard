"use client";

import { useState, useEffect, useCallback } from "react";
import { getLastSyncTime } from "@/lib/offlineStorage";

interface OfflineStatus {
  isOnline: boolean;
  lastSync: Date | null;
  isSyncing: boolean;
  setIsSyncing: (syncing: boolean) => void;
  refresh: () => void;
}

export function useOfflineStatus(): OfflineStatus {
  const [isOnline, setIsOnline] = useState(true);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const refresh = useCallback(async () => {
    const syncTime = await getLastSyncTime();
    if (syncTime) {
      setLastSync(new Date(syncTime));
    }
  }, []);

  useEffect(() => {
    // Check initial online status
    setIsOnline(navigator.onLine);

    // Listen for online/offline events
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Load last sync time
    refresh();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [refresh]);

  return {
    isOnline,
    lastSync,
    isSyncing,
    setIsSyncing,
    refresh,
  };
}
