"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Article {
  id: string;
  title: string;
  subtitle: string;
  pubDate: string;
  link: string;
  imageUrl: string;
  contentSnippet: string;
}

export default function ArticlesPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchArticles() {
      try {
        const res = await fetch("/api/substack");
        if (!res.ok) throw new Error("Failed to fetch articles");
        const data = await res.json();
        setArticles(data.articles);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load articles");
      } finally {
        setLoading(false);
      }
    }
    fetchArticles();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen pb-20">
        <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur border-b border-[#E7ECF2] dark:border-slate-800">
          <div className="px-4 py-4">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">NIAC Insights</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">News & Analysis</p>
          </div>
        </header>
        <div className="flex items-center justify-center py-20">
          <div className="animate-pulse text-slate-500">Loading articles...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen pb-20">
        <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur border-b border-[#E7ECF2] dark:border-slate-800">
          <div className="px-4 py-4">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">NIAC Insights</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">News & Analysis</p>
          </div>
        </header>
        <div className="flex flex-col items-center justify-center py-20 px-4">
          <p className="text-red-500 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-[#30558C] text-white rounded-lg hover:bg-[#254470] transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20">
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur border-b border-[#E7ECF2] dark:border-slate-800">
        <div className="px-4 py-4">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">NIAC Insights</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">News & Analysis</p>
        </div>
      </header>

      <div className="divide-y divide-[#E7ECF2] dark:divide-slate-800">
        {articles.map((article) => (
          <Link
            key={article.id}
            href={`/articles/${article.id}`}
            className="block hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
          >
            <article className="p-4 flex gap-4">
              {article.imageUrl && (
                <div className="flex-shrink-0">
                  <img
                    src={article.imageUrl}
                    alt=""
                    className="w-24 h-24 object-cover rounded-lg"
                  />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-slate-900 dark:text-white line-clamp-2 mb-1">
                  {article.title}
                </h2>
                {article.subtitle && (
                  <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-2 mb-2">
                    {article.subtitle}
                  </p>
                )}
                <time className="text-xs text-slate-500 dark:text-slate-400">
                  {new Date(article.pubDate).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </time>
              </div>
            </article>
          </Link>
        ))}
      </div>

      {articles.length === 0 && (
        <div className="flex items-center justify-center py-20">
          <p className="text-slate-500">No articles found</p>
        </div>
      )}
    </div>
  );
}
