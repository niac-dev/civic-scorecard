// src/components/GradeChip.tsx

import { GRADE_COLORS } from "@/lib/utils";

interface GradeChipProps {
  grade: string;
  isOverall?: boolean;
}

export function GradeChip({ grade }: GradeChipProps) {
  const color = grade.startsWith("A") ? GRADE_COLORS.A
    : grade.startsWith("B") ? GRADE_COLORS.B
    : grade.startsWith("C") ? GRADE_COLORS.C
    : grade.startsWith("D") ? GRADE_COLORS.D
    : grade.startsWith("F") ? GRADE_COLORS.F
    : GRADE_COLORS.default;
  const border = `8px solid ${color}`;

  // Split grade into letter and modifier (+/-)
  const letter = grade.charAt(0);
  const modifier = grade.slice(1);

  return (
    <span
      className="inline-flex items-center justify-center rounded-full w-12 h-12 xl:w-16 xl:h-16 text-2xl xl:text-3xl font-extrabold bg-white dark:bg-white"
      style={{ color: color, border: border }}
    >
      {letter}
      {modifier && <span className="text-sm xl:text-lg">{modifier}</span>}
    </span>
  );
}

export function VoteIcon({ ok, small = false, size = "large" }: { ok: boolean; small?: boolean; size?: "large" | "small" | "tiny" }) {
  // Support legacy 'small' prop for backwards compatibility
  const effectiveSize = small ? "small" : size;

  const sizeClass = effectiveSize === "tiny" ? "h-4 w-4 flex-shrink-0"
    : effectiveSize === "small" ? "h-5 w-5"
    : "h-10 w-10 xl:h-12 xl:w-12";

  if (ok) {
    return (
      <svg viewBox="0 0 20 20" className={sizeClass} aria-hidden="true" role="img">
        <circle cx="10" cy="10" r="10" fill={GRADE_COLORS.A} />
        <path d="M8.5 13.5l-3-3 -1.5 1.5 4.5 4.5 8-8 -1.5-1.5z" fill="#FFFFFF" transform="translate(0, -1.5)" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" className={sizeClass} aria-hidden="true" role="img">
      <circle cx="10" cy="10" r="10" fill="#A96A63" />
      <path d="M5 6.5L6.5 5 10 8.5 13.5 5 15 6.5 11.5 10 15 13.5 13.5 15 10 11.5 6.5 15 5 13.5 8.5 10z" fill="#FFFFFF" />
    </svg>
  );
}
