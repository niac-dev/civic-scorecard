// src/components/GradeChip.tsx

import { GRADE_COLORS } from "@/lib/utils";

interface GradeChipProps {
  grade: string;
  isOverall?: boolean;
  size?: "small" | "medium" | "large";
}

export function GradeChip({ grade, size = "medium" }: GradeChipProps) {
  const color = grade.startsWith("A") ? GRADE_COLORS.A
    : grade.startsWith("B") ? GRADE_COLORS.B
    : grade.startsWith("C") ? GRADE_COLORS.C
    : grade.startsWith("D") ? GRADE_COLORS.D
    : grade.startsWith("F") ? GRADE_COLORS.F
    : GRADE_COLORS.default;

  // Size configurations: small for scorecard table, medium for modals, large for detail pages
  const sizeConfig = size === "small"
    ? { width: "w-12 h-12 md:w-14 md:h-14 xl:w-16 xl:h-16", text: "text-xl md:text-2xl xl:text-3xl", modifier: "text-xs md:text-sm xl:text-base", border: "8px" }
    : size === "large"
    ? { width: "w-14 h-14 md:w-16 md:h-16 xl:w-20 xl:h-20", text: "text-3xl md:text-4xl xl:text-5xl", modifier: "text-lg md:text-xl xl:text-2xl", border: "9px" }
    : { width: "w-12 h-12 md:w-16 md:h-16 xl:w-20 xl:h-20", text: "text-2xl md:text-3xl xl:text-4xl", modifier: "text-sm md:text-lg xl:text-xl", border: "11px" };

  const border = `${sizeConfig.border} solid ${color}`;

  // Split grade into letter and modifier (+/-)
  const letter = grade.charAt(0);
  const modifier = grade.slice(1);

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full ${sizeConfig.width} ${sizeConfig.text} font-extrabold bg-white dark:bg-white flex-shrink-0`}
      style={{ color: color, border: border, aspectRatio: '1' }}
    >
      {letter}
      {modifier && <span className={sizeConfig.modifier}>{modifier}</span>}
    </span>
  );
}

export function VoteIcon({ ok, small = false, size = "large" }: { ok: boolean; small?: boolean; size?: "large" | "chip" | "medium-large" | "medium" | "small" | "tiny" }) {
  // Support legacy 'small' prop for backwards compatibility
  const effectiveSize = small ? "small" : size;

  const sizeClass = effectiveSize === "tiny" ? "h-4 w-4 flex-shrink-0"
    : effectiveSize === "small" ? "h-4 w-4 flex-shrink-0"
    : effectiveSize === "medium" ? "h-8 w-8 flex-shrink-0"
    : effectiveSize === "medium-large" ? "h-12 w-12 flex-shrink-0"
    : effectiveSize === "chip" ? "w-12 h-12 md:w-16 md:h-16 xl:w-20 xl:h-20 flex-shrink-0"
    : "h-10 w-10 xl:h-12 xl:w-12";

  if (ok) {
    return (
      <svg viewBox="0 0 20 20" className={sizeClass} aria-hidden="true" role="img">
        <circle cx="10" cy="10" r="9" fill="#FFFFFF" stroke={GRADE_COLORS.A} strokeWidth="2" />
        <path d="M8.5 13.5l-3-3 -1.5 1.5 4.5 4.5 8-8 -1.5-1.5z" fill={GRADE_COLORS.A} transform="translate(0, -1.5)" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" className={sizeClass} aria-hidden="true" role="img">
      <circle cx="10" cy="10" r="9" fill="#FFFFFF" stroke="#A96A63" strokeWidth="2" />
      <path d="M5 6.5L6.5 5 10 8.5 13.5 5 15 6.5 11.5 10 15 13.5 13.5 15 10 11.5 6.5 15 5 13.5 8.5 10z" fill="#A96A63" />
    </svg>
  );
}
