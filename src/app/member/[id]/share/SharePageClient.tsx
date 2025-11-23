"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";

export default function SharePageClient() {
  const params = useParams();
  const searchParams = useSearchParams();
  const [imageUrl, setImageUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const memberId = params.id as string;
  const name = searchParams.get("name") || "Member";

  // Build the OG image URL from search params
  useEffect(() => {
    const ogParams = new URLSearchParams();
    searchParams.forEach((value, key) => {
      ogParams.set(key, value);
    });
    setImageUrl(`/api/og/member/${memberId}?${ogParams.toString()}`);
  }, [memberId, searchParams]);

  const handleDownload = useCallback(async () => {
    if (!imageUrl) return;
    setDownloading(true);
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name.replace(/\s+/g, "-")}-scorecard.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download failed:", error);
    }
    setDownloading(false);
  }, [imageUrl, name]);

  const handleCopyImage = useCallback(async () => {
    if (!imageUrl) return;
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Copy failed:", error);
    }
  }, [imageUrl]);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (error) {
      console.error("Copy link failed:", error);
    }
  }, []);

  const handleShareTwitter = useCallback(() => {
    const text = `Check out ${name}'s Congressional Scorecard on issues important to Iranian Americans`;
    // Share the member page URL - cleaner and Twitter will use the OG image from that page
    const shareUrl = `${window.location.origin}/member/${memberId}`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(url, "_blank", "width=550,height=420");
  }, [name, memberId]);

  const handleShareFacebook = useCallback(() => {
    // Share the member page URL - cleaner and Facebook will use the OG image from that page
    const shareUrl = `${window.location.origin}/member/${memberId}`;
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
    window.open(url, "_blank", "width=550,height=420");
  }, [memberId]);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Back link */}
        <Link
          href={`/member/${memberId}`}
          className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 mb-6"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to {name}
        </Link>

        {/* Image preview */}
        <div className="flex justify-center mb-6">
          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={`${name} Scorecard`}
              width={574}
              height={459}
              className="rounded-xl shadow-lg"
            />
          )}
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-[#4B8CFB] hover:bg-[#3a7de8] text-white rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {downloading ? "Downloading..." : "Download Image"}
          </button>

          <button
            onClick={handleCopyImage}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {copied ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
              )}
            </svg>
            {copied ? "Copied!" : "Copy Image"}
          </button>
        </div>

        {/* Share buttons */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 mb-4">
          <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Share on social media</h3>
          <div className="flex gap-3">
            <button
              onClick={handleShareTwitter}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-black hover:bg-gray-800 text-white rounded-lg font-medium transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              Share on X
            </button>

            <button
              onClick={handleShareFacebook}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1877F2] hover:bg-[#166FE5] text-white rounded-lg font-medium transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              Share on Facebook
            </button>
          </div>
        </div>

        {/* Copy link button */}
        <button
          onClick={handleCopyLink}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-medium transition-colors border border-slate-200 dark:border-slate-700"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {linkCopied ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            )}
          </svg>
          {linkCopied ? "Link Copied!" : "Copy Share Link"}
        </button>

        {/* Instructions */}
        <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-4">
          The image will appear automatically when you share this link on social media.
        </p>
      </div>
    </div>
  );
}
