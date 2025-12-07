import { NextRequest, NextResponse } from "next/server";
import { XMLParser } from "fast-xml-parser";

const SUBSTACK_FEED_URL = "https://insights.niacouncil.org/feed";

interface RSSItem {
  title: string;
  link: string;
  pubDate: string;
  "content:encoded"?: string;
  description?: string;
  "dc:creator"?: string;
  creator?: string;
  enclosure?: {
    "@_url"?: string;
    url?: string;
  };
  "media:content"?: {
    "@_url"?: string;
  };
}

interface RSSFeed {
  rss: {
    channel: {
      item: RSSItem[];
    };
  };
}

function extractImageUrl(item: RSSItem, content: string): string {
  // Try enclosure first
  if (item.enclosure?.["@_url"]) return item.enclosure["@_url"];
  if (item.enclosure?.url) return item.enclosure.url;

  // Try media:content
  if (item["media:content"]?.["@_url"]) return item["media:content"]["@_url"];

  // Extract first image from content
  const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch) return imgMatch[1];

  return "";
}

function extractSubtitle(content: string): string {
  // Try to extract subtitle from first paragraph or blockquote
  const subtitleMatch = content.match(/<p[^>]*class="[^"]*subtitle[^"]*"[^>]*>([^<]+)<\/p>/i);
  if (subtitleMatch) return subtitleMatch[1].trim();

  // Or get first paragraph text
  const firstP = content.match(/<p[^>]*>([^<]{20,200})/i);
  if (firstP) {
    const text = firstP[1].replace(/<[^>]+>/g, "").trim();
    return text.length > 150 ? text.substring(0, 147) + "..." : text;
  }

  return "";
}

function generateId(link: string): string {
  // Extract slug from URL
  const match = link.match(/\/p\/([^/?]+)/);
  return match ? match[1] : link.replace(/[^a-z0-9]/gi, "-").substring(0, 50);
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const articleId = searchParams.get("id");

  try {
    const response = await fetch(SUBSTACK_FEED_URL, {
      headers: {
        "User-Agent": "NIACScorecard/1.0",
      },
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch RSS: ${response.status}`);
    }

    const xml = await response.text();
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
    });
    const feed = parser.parse(xml) as RSSFeed;

    const items = Array.isArray(feed.rss.channel.item)
      ? feed.rss.channel.item
      : [feed.rss.channel.item];

    const articles = items.map((item) => {
      const content = item["content:encoded"] || item.description || "";
      const id = generateId(item.link);

      return {
        id,
        title: item.title,
        subtitle: extractSubtitle(content),
        author: item["dc:creator"] || item.creator || "NIAC",
        pubDate: item.pubDate,
        content,
        contentSnippet: stripHtml(content).substring(0, 300),
        link: item.link,
        imageUrl: extractImageUrl(item, content),
      };
    });

    // If requesting a specific article
    if (articleId) {
      const article = articles.find((a) => a.id === articleId);
      if (!article) {
        return NextResponse.json(
          { error: "Article not found" },
          { status: 404 }
        );
      }
      return NextResponse.json({ article });
    }

    // Return all articles
    return NextResponse.json({ articles });
  } catch (error) {
    console.error("Substack RSS error:", error);
    return NextResponse.json(
      { error: "Failed to fetch articles" },
      { status: 500 }
    );
  }
}
