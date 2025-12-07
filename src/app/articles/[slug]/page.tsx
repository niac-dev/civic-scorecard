"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import DOMPurify from "dompurify";
import { shareArticle } from "@/lib/nativeShare";

interface Article {
  id: string;
  title: string;
  subtitle: string;
  author: string;
  pubDate: string;
  content: string;
  link: string;
  imageUrl: string;
}

export default function ArticlePage() {
  const params = useParams();
  const router = useRouter();
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchArticle() {
      try {
        const res = await fetch(`/api/substack?id=${params.slug}`);
        if (!res.ok) throw new Error("Failed to fetch article");
        const data = await res.json();
        setArticle(data.article);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load article");
      } finally {
        setLoading(false);
      }
    }
    fetchArticle();
  }, [params.slug]);

  const handleShare = async () => {
    if (!article) return;

    const success = await shareArticle({
      title: article.title,
      subtitle: article.subtitle,
      link: article.link,
    });

    // Show feedback if clipboard was used (no native share)
    if (success && !navigator.share) {
      alert("Link copied to clipboard!");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur border-b border-[#E7ECF2] dark:border-slate-800">
          <div className="flex items-center gap-3 px-4 py-3">
            <button
              onClick={() => router.back()}
              className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-sm text-slate-500">Back</span>
          </div>
        </header>
        <div className="flex items-center justify-center py-20">
          <div className="animate-pulse text-slate-500">Loading article...</div>
        </div>
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="min-h-screen">
        <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur border-b border-[#E7ECF2] dark:border-slate-800">
          <div className="flex items-center gap-3 px-4 py-3">
            <button
              onClick={() => router.back()}
              className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-sm text-slate-500">Back</span>
          </div>
        </header>
        <div className="flex flex-col items-center justify-center py-20 px-4">
          <p className="text-red-500 mb-4">{error || "Article not found"}</p>
          <button
            onClick={() => router.push("/articles")}
            className="px-4 py-2 bg-[#30558C] text-white rounded-lg hover:bg-[#254470] transition-colors"
          >
            Back to Articles
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-8">
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur border-b border-[#E7ECF2] dark:border-slate-800">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex gap-2">
            <button
              onClick={handleShare}
              className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors"
              title="Share"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
            </button>
            <a
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors"
              title="Open in browser"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>
      </header>

      <article className="px-4 py-6">
        {article.imageUrl && (
          <img
            src={article.imageUrl}
            alt=""
            className="w-full aspect-video object-cover rounded-xl mb-6"
          />
        )}

        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          {article.title}
        </h1>

        {article.subtitle && (
          <p className="text-lg text-slate-600 dark:text-slate-300 mb-4">
            {article.subtitle}
          </p>
        )}

        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-6 pb-6 border-b border-[#E7ECF2] dark:border-slate-800">
          <span>{article.author}</span>
          <span>·</span>
          <time>
            {new Date(article.pubDate).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </time>
        </div>

        <div
          className="prose prose-slate dark:prose-invert max-w-none prose-img:rounded-lg prose-a:text-[#30558C] dark:prose-a:text-blue-400"
          dangerouslySetInnerHTML={{
            __html: DOMPurify.sanitize(article.content, {
              ADD_TAGS: ["iframe"],
              ADD_ATTR: ["allow", "allowfullscreen", "frameborder", "scrolling"],
            }),
          }}
        />
      </article>
    </div>
  );
}
