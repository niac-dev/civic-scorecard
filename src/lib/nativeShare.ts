import { Share } from "@capacitor/share";
import { Capacitor } from "@capacitor/core";
import type { Row } from "./types";

/**
 * Check if native sharing is available
 */
export function canNativeShare(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Share a member's scorecard
 */
export async function shareMemberCard(
  member: Row,
  options?: { imageUrl?: string }
): Promise<boolean> {
  const title = `${member.full_name} - NIAC Scorecard`;
  const text = `Check out ${member.full_name}'s scorecard grade: ${member.Grade || "N/A"}`;
  const url = `https://scorecard.niacaction.org/member/${member.bioguide_id}`;

  if (Capacitor.isNativePlatform()) {
    try {
      await Share.share({
        title,
        text,
        url,
        dialogTitle: "Share this scorecard",
      });
      return true;
    } catch (error) {
      // User cancelled or error occurred
      console.log("Share cancelled or failed:", error);
      return false;
    }
  }

  // Web fallback
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return true;
    } catch {
      return false;
    }
  }

  // Clipboard fallback
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Share an article
 */
export async function shareArticle(article: {
  title: string;
  subtitle?: string;
  link: string;
}): Promise<boolean> {
  const title = article.title;
  const text = article.subtitle || article.title;
  const url = article.link;

  if (Capacitor.isNativePlatform()) {
    try {
      await Share.share({
        title,
        text,
        url,
        dialogTitle: "Share this article",
      });
      return true;
    } catch {
      return false;
    }
  }

  // Web fallback
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return true;
    } catch {
      return false;
    }
  }

  // Clipboard fallback
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Share a bill/legislation
 */
export async function shareBill(bill: {
  display_name?: string;
  short_title?: string;
  bill_number?: string;
  column: string;
}): Promise<boolean> {
  const title = bill.display_name || bill.short_title || bill.bill_number || "Legislation";
  const text = `Check out this legislation on the NIAC Action Scorecard`;
  const url = `https://scorecard.niacaction.org/bill/${encodeURIComponent(bill.column)}`;

  if (Capacitor.isNativePlatform()) {
    try {
      await Share.share({
        title,
        text,
        url,
        dialogTitle: "Share this legislation",
      });
      return true;
    } catch {
      return false;
    }
  }

  // Web fallback
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return true;
    } catch {
      return false;
    }
  }

  // Clipboard fallback
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generic share function
 */
export async function shareContent(options: {
  title: string;
  text?: string;
  url: string;
  dialogTitle?: string;
}): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      await Share.share({
        title: options.title,
        text: options.text,
        url: options.url,
        dialogTitle: options.dialogTitle || "Share",
      });
      return true;
    } catch {
      return false;
    }
  }

  // Web fallback
  if (navigator.share) {
    try {
      await navigator.share({
        title: options.title,
        text: options.text,
        url: options.url,
      });
      return true;
    } catch {
      return false;
    }
  }

  // Clipboard fallback
  try {
    await navigator.clipboard.writeText(options.url);
    return true;
  } catch {
    return false;
  }
}
