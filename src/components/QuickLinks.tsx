"use client";

const links = [
  {
    name: "NIAC on Substack",
    shortName: "Substack",
    url: "https://insights.niacouncil.org",
  },
  {
    name: "Immigrant Justice Center",
    shortName: "Immigration",
    url: "https://niacouncil.org/travelban",
  },
  {
    name: "Iranian American Poll",
    shortName: "IA Poll",
    url: "https://iranianamericanpoll.org",
  },
  {
    name: "Congressional Scorecard",
    shortName: "Scorecard",
    url: "https://scorecard.niacaction.org",
    active: true,
  },
];

export default function QuickLinks() {
  return (
    <div className="bg-[#1a1a2e] text-white text-xs">
      <div className="max-w-7xl mx-auto flex items-center justify-center gap-1 md:gap-4 px-2 py-1.5">
        {links.map((link, i) => (
          <a
            key={link.url}
            href={link.url}
            target={link.active ? undefined : "_blank"}
            rel={link.active ? undefined : "noopener noreferrer"}
            className={`px-2 py-0.5 rounded transition-colors whitespace-nowrap ${
              link.active
                ? "bg-white/20 font-medium"
                : "hover:bg-white/10"
            }`}
          >
            <span className="hidden md:inline">{link.name}</span>
            <span className="md:hidden">{link.shortName}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
