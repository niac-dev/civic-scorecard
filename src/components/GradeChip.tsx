// src/components/GradeChip.tsx

import { GRADE_COLORS } from "@/lib/utils";

interface GradeChipProps {
  grade: string;
  isOverall?: boolean;
}

export function GradeChip({ grade, isOverall }: GradeChipProps) {
  const color = grade.startsWith("A") ? GRADE_COLORS.A
    : grade.startsWith("B") ? GRADE_COLORS.B
    : grade.startsWith("C") ? GRADE_COLORS.C
    : grade.startsWith("D") ? GRADE_COLORS.D
    : grade.startsWith("F") ? GRADE_COLORS.F
    : GRADE_COLORS.default;
  const opacity = isOverall ? "FF" : "E6"; // fully opaque for overall, 90% opaque (10% transparent) for others
  const textColor = grade.startsWith("A") ? "#ffffff" // white for A (vibrant green)
    : grade.startsWith("B") ? "#4b5563" // dark grey for B (light green)
    : grade.startsWith("C") ? "#4b5563" // dark grey for C (pale sage)
    : grade.startsWith("D") ? "#4b5563" // dark grey for D (mid-grey)
    : grade.startsWith("F") ? "#ffffff" // white for F (deep stone grey)
    : "#4b5563"; // dark grey for unknown
  const border = isOverall ? "2px solid #000000" : "none"; // black border for overall grades
  return (
    <span
      className="inline-flex items-center justify-center rounded-full px-3 py-1.5 text-xs font-bold min-w-[3rem]"
      style={{ background: `${color}${opacity}`, color: textColor, border }}
    >
      {grade}
    </span>
  );
}

export function VoteIcon({ ok }: { ok: boolean }) {
  if (ok) {
    return (
      <svg viewBox="0 0 20 20" className="h-10 w-10" aria-hidden="true" role="img">
        <circle cx="10" cy="10" r="10" fill={GRADE_COLORS.A} />
        <path d="M7.5 13.0l-2.5-2.5  -1.5 1.5 4 4 8-8 -1.5-1.5 -6.5 6.5z" fill="#FFFFFF" transform="translate(0, -2)" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" className="h-10 w-10" aria-hidden="true" role="img">
      <circle cx="10" cy="10" r="10" fill={GRADE_COLORS.F} />
      <path d="M5 6.5L6.5 5 10 8.5 13.5 5 15 6.5 11.5 10 15 13.5 13.5 15 10 11.5 6.5 15 5 13.5 8.5 10z" fill="#FFFFFF" />
    </svg>
  );
}
