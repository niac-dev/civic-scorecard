import { Metadata } from "next";
import MemberPageClient from "./MemberPageClient";
import { promises as fs } from "fs";
import path from "path";
import Papa from "papaparse";

type Props = {
  params: Promise<{ id: string }>;
};

// Load member data server-side for metadata
async function getMemberData(id: string) {
  try {
    const csvPath = path.join(process.cwd(), "public/data/House_Senate_Merged_2.csv");
    const csvContent = await fs.readFile(csvPath, "utf-8");
    const parsed = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
    const rows = parsed.data as Record<string, unknown>[];
    return rows.find((r) => r.bioguide_id === id) || null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolvedParams = await params;
  const memberId = resolvedParams.id;
  const member = await getMemberData(memberId);

  if (!member) {
    return {
      title: "Member Not Found | NIAC Action Congressional Scorecard",
    };
  }

  // Format name
  const fullName = String(member.full_name || "");
  const commaIdx = fullName.indexOf(",");
  const displayName = commaIdx > -1
    ? `${fullName.slice(commaIdx + 1).trim()} ${fullName.slice(0, commaIdx).trim()}`
    : fullName;

  const grade = String(member.Grade || "N/A");
  const chamber = member.chamber === "SENATE" ? "Senator" : "Representative";
  const party = member.party === "Democratic" ? "D" : member.party === "Republican" ? "R" : "I";
  const location = member.chamber === "SENATE"
    ? member.state
    : member.district
      ? `${member.state}-${member.district}`
      : member.state;

  // Build OG image URL
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://scorecard.niacaction.org";
  const ogParams = new URLSearchParams({
    name: displayName,
    grade,
    total: String(Math.round(Number(member.Total || 0))),
    max: String(Math.round(Number(member.Max_Possible || 0))),
    chamber,
    party,
    location: String(location || ""),
    photo: String(member.photo_url || ""),
  });
  const ogImageUrl = `${baseUrl}/api/og/member/${memberId}?${ogParams.toString()}`;

  return {
    title: `${displayName} - Congressional Scorecard | NIAC Action`,
    description: `${displayName} received a grade of ${grade} on the NIAC Action Congressional Scorecard. See their voting record on issues important to Iranian Americans.`,
    openGraph: {
      title: `${displayName} - Grade: ${grade}`,
      description: `${chamber} ${displayName} (${party}-${location}) received a grade of ${grade} on the NIAC Action Congressional Scorecard.`,
      images: [
        {
          url: ogImageUrl,
          width: 574,
          height: 459,
          alt: `${displayName} Congressional Scorecard`,
        },
      ],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${displayName} - Grade: ${grade}`,
      description: `${chamber} ${displayName} (${party}-${location}) received a grade of ${grade}.`,
      images: [ogImageUrl],
    },
  };
}

export default function MemberPage() {
  return <MemberPageClient />;
}
