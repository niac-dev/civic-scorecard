import { Metadata } from "next";
import SharePageClient from "./SharePageClient";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;

  const memberId = resolvedParams.id;
  const name = (resolvedSearchParams.name as string) || "Member";
  const grade = (resolvedSearchParams.grade as string) || "N/A";

  // Build the OG image URL with all the params
  const ogParams = new URLSearchParams();
  Object.entries(resolvedSearchParams).forEach(([key, value]) => {
    if (typeof value === "string") {
      ogParams.set(key, value);
    }
  });

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://scorecard.niacaction.org";
  const ogImageUrl = `${baseUrl}/api/og/member/${memberId}?${ogParams.toString()}`;

  return {
    title: `${name} - Congressional Scorecard | NIAC Action`,
    description: `${name} received a grade of ${grade} on the NIAC Action Congressional Scorecard. See their voting record on issues important to Iranian Americans.`,
    openGraph: {
      title: `${name} - Grade: ${grade}`,
      description: `${name} received a grade of ${grade} on the NIAC Action Congressional Scorecard.`,
      images: [
        {
          url: ogImageUrl,
          width: 574,
          height: 574,
          alt: `${name} Congressional Scorecard`,
        },
      ],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${name} - Grade: ${grade}`,
      description: `${name} received a grade of ${grade} on the NIAC Action Congressional Scorecard.`,
      images: [ogImageUrl],
    },
  };
}

export default function SharePage() {
  return <SharePageClient />;
}
