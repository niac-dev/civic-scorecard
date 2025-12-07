import { openDB, IDBPDatabase } from "idb";
import type { Row, Meta } from "./types";
import type { PacData } from "./pacData";

const DB_NAME = "niac-scorecard";
const DB_VERSION = 1;

interface ScorecardDB {
  members: {
    key: string;
    value: Row;
  };
  legislation: {
    key: string;
    value: Meta;
  };
  pacData: {
    key: string;
    value: PacData;
  };
  articles: {
    key: string;
    value: CachedArticle;
  };
  metadata: {
    key: string;
    value: { key: string; value: unknown; timestamp: number };
  };
}

export interface CachedArticle {
  id: string;
  title: string;
  subtitle: string;
  author: string;
  pubDate: string;
  content: string;
  contentSnippet: string;
  link: string;
  imageUrl: string;
  cachedAt: number;
}

export interface CachedScorecardData {
  rows: Row[];
  cols: string[];
  metaByCol: Map<string, Meta>;
  categories: string[];
  pacData: PacData[];
  cachedAt: number;
}

let db: IDBPDatabase<ScorecardDB> | null = null;

async function getDB(): Promise<IDBPDatabase<ScorecardDB>> {
  if (db) return db;

  db = await openDB<ScorecardDB>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      // Members store
      if (!database.objectStoreNames.contains("members")) {
        database.createObjectStore("members", { keyPath: "bioguide_id" });
      }

      // Legislation store
      if (!database.objectStoreNames.contains("legislation")) {
        database.createObjectStore("legislation", { keyPath: "Column" });
      }

      // PAC data store
      if (!database.objectStoreNames.contains("pacData")) {
        database.createObjectStore("pacData", { keyPath: "bioguide_id" });
      }

      // Articles store
      if (!database.objectStoreNames.contains("articles")) {
        database.createObjectStore("articles", { keyPath: "id" });
      }

      // Metadata store (for sync timestamps, etc.)
      if (!database.objectStoreNames.contains("metadata")) {
        database.createObjectStore("metadata", { keyPath: "key" });
      }
    },
  });

  return db;
}

// Cache scorecard data
export async function cacheScorecard(data: {
  rows: Row[];
  cols: string[];
  metaByCol: Map<string, Meta>;
  categories: string[];
  pacData: PacData[];
}): Promise<void> {
  const database = await getDB();

  // Clear old data
  await database.clear("members");
  await database.clear("legislation");
  await database.clear("pacData");

  // Store members
  const tx1 = database.transaction("members", "readwrite");
  for (const row of data.rows) {
    await tx1.store.put(row);
  }
  await tx1.done;

  // Store legislation metadata
  const tx2 = database.transaction("legislation", "readwrite");
  for (const [, meta] of data.metaByCol) {
    await tx2.store.put(meta);
  }
  await tx2.done;

  // Store PAC data
  const tx3 = database.transaction("pacData", "readwrite");
  for (const pac of data.pacData) {
    await tx3.store.put(pac);
  }
  await tx3.done;

  // Update sync timestamp
  await database.put("metadata", {
    key: "lastSync",
    value: Date.now(),
    timestamp: Date.now(),
  });

  // Store cols and categories in metadata
  await database.put("metadata", {
    key: "cols",
    value: data.cols,
    timestamp: Date.now(),
  });
  await database.put("metadata", {
    key: "categories",
    value: data.categories,
    timestamp: Date.now(),
  });
}

// Load scorecard data from cache
export async function loadCachedScorecard(): Promise<CachedScorecardData | null> {
  try {
    const database = await getDB();

    const rows = await database.getAll("members");
    const legislation = await database.getAll("legislation");
    const pacData = await database.getAll("pacData");
    const colsMeta = await database.get("metadata", "cols");
    const categoriesMeta = await database.get("metadata", "categories");
    const lastSyncMeta = await database.get("metadata", "lastSync");

    if (!rows.length || !legislation.length) {
      return null;
    }

    const metaByCol = new Map<string, Meta>();
    for (const meta of legislation) {
      metaByCol.set(meta.Column, meta);
    }

    return {
      rows,
      cols: (colsMeta?.value as string[]) || [],
      metaByCol,
      categories: (categoriesMeta?.value as string[]) || [],
      pacData,
      cachedAt: (lastSyncMeta?.value as number) || 0,
    };
  } catch (error) {
    console.error("Error loading cached scorecard:", error);
    return null;
  }
}

// Cache articles
export async function cacheArticles(articles: CachedArticle[]): Promise<void> {
  const database = await getDB();
  const tx = database.transaction("articles", "readwrite");

  for (const article of articles) {
    await tx.store.put({
      ...article,
      cachedAt: Date.now(),
    });
  }

  await tx.done;

  // Cleanup old articles (keep only 50 most recent)
  const allArticles = await database.getAll("articles");
  if (allArticles.length > 50) {
    const sorted = allArticles.sort((a, b) => b.cachedAt - a.cachedAt);
    const toDelete = sorted.slice(50);
    const deleteTx = database.transaction("articles", "readwrite");
    for (const article of toDelete) {
      await deleteTx.store.delete(article.id);
    }
    await deleteTx.done;
  }
}

// Load cached articles
export async function loadCachedArticles(): Promise<CachedArticle[]> {
  try {
    const database = await getDB();
    const articles = await database.getAll("articles");
    return articles.sort(
      (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
    );
  } catch (error) {
    console.error("Error loading cached articles:", error);
    return [];
  }
}

// Get a single cached article
export async function getCachedArticle(id: string): Promise<CachedArticle | null> {
  try {
    const database = await getDB();
    const article = await database.get("articles", id);
    return article || null;
  } catch (error) {
    console.error("Error loading cached article:", error);
    return null;
  }
}

// Get last sync timestamp
export async function getLastSyncTime(): Promise<number | null> {
  try {
    const database = await getDB();
    const meta = await database.get("metadata", "lastSync");
    return (meta?.value as number) || null;
  } catch {
    return null;
  }
}

// Clear all cached data
export async function clearAllCache(): Promise<void> {
  const database = await getDB();
  await database.clear("members");
  await database.clear("legislation");
  await database.clear("pacData");
  await database.clear("articles");
  await database.clear("metadata");
}

// Check if we have cached data
export async function hasCachedData(): Promise<boolean> {
  try {
    const database = await getDB();
    const count = await database.count("members");
    return count > 0;
  } catch {
    return false;
  }
}
