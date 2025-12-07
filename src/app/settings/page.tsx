"use client";

import { useState, useEffect } from "react";
import {
  isPushSupported,
  getNotificationStatus,
  requestNotificationPermission,
} from "@/lib/pushNotifications";

export default function SettingsPage() {
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState<"granted" | "denied" | "prompt">("prompt");
  const [offlineDataSize, setOfflineDataSize] = useState<string | null>(null);
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    // Check if running as native app
    setIsNative(isPushSupported());

    // Check notification permission
    async function checkNotifications() {
      const status = await getNotificationStatus();
      setNotificationStatus(status);
      setNotificationsEnabled(status === "granted");
    }
    checkNotifications();

    // Estimate offline data size
    if ("storage" in navigator && "estimate" in navigator.storage) {
      navigator.storage.estimate().then((estimate) => {
        if (estimate.usage) {
          const mb = (estimate.usage / (1024 * 1024)).toFixed(2);
          setOfflineDataSize(`${mb} MB`);
        }
      });
    }
  }, []);

  const handleNotificationToggle = async () => {
    if (notificationStatus === "granted") {
      // Can't revoke - inform user
      alert("To disable notifications, please update your device settings for the NIAC Action app.");
      return;
    }

    if (notificationStatus === "denied") {
      alert("Notifications are blocked. Please enable them in your device settings for the NIAC Action app.");
      return;
    }

    // Request permission
    const granted = await requestNotificationPermission();
    if (granted) {
      setNotificationsEnabled(true);
      setNotificationStatus("granted");
    } else {
      setNotificationStatus("denied");
    }
  };

  const handleClearCache = async () => {
    if (confirm("Clear all offline data? You will need to reload data next time.")) {
      // Clear IndexedDB
      const dbs = await indexedDB.databases();
      for (const db of dbs) {
        if (db.name) indexedDB.deleteDatabase(db.name);
      }

      // Clear localStorage (except push token)
      const pushToken = localStorage.getItem("niac-push-token");
      localStorage.clear();
      if (pushToken) {
        localStorage.setItem("niac-push-token", pushToken);
      }

      // Clear cache storage
      if ("caches" in window) {
        const names = await caches.keys();
        for (const name of names) {
          await caches.delete(name);
        }
      }

      alert("Cache cleared!");
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen pb-20">
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur border-b border-[#E7ECF2] dark:border-slate-800">
        <div className="px-4 py-4">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Settings</h1>
        </div>
      </header>

      <div className="p-4 space-y-6">
        {/* Notifications Section */}
        <section className="card p-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            Notifications
          </h2>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-slate-900 dark:text-white">Push Notifications</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {notificationStatus === "granted"
                  ? "Enabled - you'll receive alerts"
                  : notificationStatus === "denied"
                  ? "Blocked in device settings"
                  : "Get alerts for new content"}
              </p>
            </div>
            <button
              onClick={handleNotificationToggle}
              className={`relative w-12 h-7 rounded-full transition-colors ${
                notificationsEnabled ? "bg-[#30558C]" : "bg-slate-300 dark:bg-slate-600"
              }`}
            >
              <span
                className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  notificationsEnabled ? "left-6" : "left-1"
                }`}
              />
            </button>
          </div>
          {!isNative && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-3">
              Install the NIAC Action app for full push notification support
            </p>
          )}
        </section>

        {/* Storage Section */}
        <section className="card p-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            Storage & Data
          </h2>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-slate-900 dark:text-white">Offline Data</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {offlineDataSize || "Calculating..."}
                </p>
              </div>
            </div>

            <button
              onClick={handleClearCache}
              className="w-full py-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg border border-red-200 dark:border-red-500/20 transition-colors"
            >
              Clear Offline Data
            </button>
          </div>
        </section>

        {/* About Section */}
        <section className="card p-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            About
          </h2>

          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-400">App</span>
              <span className="text-slate-900 dark:text-white">NIAC Action v1.0.0</span>
            </div>

            <a
              href="https://www.niacaction.org"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between py-2"
            >
              <span className="text-slate-900 dark:text-white">NIAC Action Website</span>
              <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>

            <a
              href="https://insights.niacouncil.org"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between py-2"
            >
              <span className="text-slate-900 dark:text-white">NIAC Insights</span>
              <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>

            <a
              href="https://scorecard.niacaction.org"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between py-2"
            >
              <span className="text-slate-900 dark:text-white">Scorecard Website</span>
              <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </section>

        {/* Privacy */}
        <section className="card p-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            Privacy
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
            This app does not collect personal data. Your address is stored locally on your device
            only to remember your representatives. No account is required.
          </p>
          <a
            href="https://www.niacaction.org/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#30558C] dark:text-blue-400 text-sm font-medium"
          >
            Read Privacy Policy →
          </a>
        </section>
      </div>
    </div>
  );
}
