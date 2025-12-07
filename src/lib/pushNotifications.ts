"use client";

import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";

export interface NotificationData {
  type?: "article" | "legislation" | "alert";
  id?: string;
  url?: string;
}

/**
 * Check if push notifications are supported
 */
export function isPushSupported(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Check current notification permission status
 */
export async function getNotificationStatus(): Promise<"granted" | "denied" | "prompt"> {
  if (!isPushSupported()) {
    // Web fallback
    if ("Notification" in window) {
      return Notification.permission as "granted" | "denied" | "prompt";
    }
    return "denied";
  }

  try {
    const status = await PushNotifications.checkPermissions();
    if (status.receive === "granted") return "granted";
    if (status.receive === "denied") return "denied";
    return "prompt";
  } catch {
    return "denied";
  }
}

/**
 * Request notification permission and register for push
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isPushSupported()) {
    // Web fallback
    if ("Notification" in window) {
      const permission = await Notification.requestPermission();
      return permission === "granted";
    }
    return false;
  }

  try {
    // Request permission
    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== "granted") {
      return false;
    }

    // Register for push notifications
    await PushNotifications.register();
    return true;
  } catch (error) {
    console.error("Error requesting notification permission:", error);
    return false;
  }
}

/**
 * Initialize push notification listeners
 */
export async function initializePushNotifications(
  onNotificationReceived?: (data: NotificationData) => void,
  onNotificationAction?: (data: NotificationData) => void
): Promise<string | null> {
  if (!isPushSupported()) {
    return null;
  }

  let deviceToken: string | null = null;

  // Handle registration success
  await PushNotifications.addListener("registration", (token) => {
    console.log("Push registration success, token:", token.value);
    deviceToken = token.value;

    // Store token for later use (e.g., send to server)
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("niac-push-token", token.value);
    }
  });

  // Handle registration error
  await PushNotifications.addListener("registrationError", (error) => {
    console.error("Push registration error:", error.error);
  });

  // Handle notification received while app is in foreground
  await PushNotifications.addListener("pushNotificationReceived", (notification) => {
    console.log("Push notification received:", notification);

    const data: NotificationData = {
      type: notification.data?.type,
      id: notification.data?.id,
      url: notification.data?.url,
    };

    if (onNotificationReceived) {
      onNotificationReceived(data);
    }
  });

  // Handle notification tap/action
  await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    console.log("Push notification action:", action);

    const data: NotificationData = {
      type: action.notification.data?.type,
      id: action.notification.data?.id,
      url: action.notification.data?.url,
    };

    if (onNotificationAction) {
      onNotificationAction(data);
    }
  });

  return deviceToken;
}

/**
 * Remove all notification listeners
 */
export async function removePushListeners(): Promise<void> {
  if (!isPushSupported()) return;

  await PushNotifications.removeAllListeners();
}

/**
 * Get stored device token
 */
export function getStoredToken(): string | null {
  if (typeof localStorage !== "undefined") {
    return localStorage.getItem("niac-push-token");
  }
  return null;
}

/**
 * Get delivered notifications (iOS only)
 */
export async function getDeliveredNotifications() {
  if (!isPushSupported()) return [];

  try {
    const result = await PushNotifications.getDeliveredNotifications();
    return result.notifications;
  } catch {
    return [];
  }
}

/**
 * Remove all delivered notifications
 */
export async function clearNotifications(): Promise<void> {
  if (!isPushSupported()) return;

  try {
    await PushNotifications.removeAllDeliveredNotifications();
  } catch (error) {
    console.error("Error clearing notifications:", error);
  }
}
