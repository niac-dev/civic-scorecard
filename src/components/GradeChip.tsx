// src/components/GradeChip.tsx

import { GRADE_COLORS } from "@/lib/utils";

interface GradeChipProps {
  grade: string;
  isOverall?: boolean;
  scale?: number; // Multiplier for size (1 = default, 1.25 = 25% bigger, etc.)
}

// Responsive diameters - change these to resize at each breakpoint
const DIAMETER = {
  mobile: 48,  // < 768px
  md: 56,      // 768px - 1279px
  xl: 64,      // >= 1280px
};

// Fixed proportions - these stay constant, only diameter changes
const BORDER_RATIO = 0.10;
const TEXT_RATIO = 0.51;
const MODIFIER_RATIO = 0.21;

// Pre-calculate all values for each breakpoint (proportions locked)
const SIZES = {
  mobile: {
    diameter: DIAMETER.mobile,
    border: Math.round(DIAMETER.mobile * BORDER_RATIO),
    text: Math.round(DIAMETER.mobile * TEXT_RATIO),
    modifier: Math.round(DIAMETER.mobile * MODIFIER_RATIO),
  },
  md: {
    diameter: DIAMETER.md,
    border: Math.round(DIAMETER.md * BORDER_RATIO),
    text: Math.round(DIAMETER.md * TEXT_RATIO),
    modifier: Math.round(DIAMETER.md * MODIFIER_RATIO),
  },
  xl: {
    diameter: DIAMETER.xl,
    border: Math.round(DIAMETER.xl * BORDER_RATIO),
    text: Math.round(DIAMETER.xl * TEXT_RATIO),
    modifier: Math.round(DIAMETER.xl * MODIFIER_RATIO),
  },
};

// Responsive styles are in globals.css (.grade-chip class)
// SIZES is kept for scaled chips that use inline styles
export function GradeChip({ grade, scale = 1 }: GradeChipProps) {
  // Handle "Inc" (Incomplete) grade specially
  const isIncomplete = grade === 'Inc';
  // Show full "Incomplete" text on larger chips (scale > 1)
  const showFullIncomplete = isIncomplete && scale > 1;

  const color = isIncomplete ? GRADE_COLORS.default
    : grade.startsWith("A") ? GRADE_COLORS.A
    : grade.startsWith("B") ? GRADE_COLORS.B
    : grade.startsWith("C") ? GRADE_COLORS.C
    : grade.startsWith("D") ? GRADE_COLORS.D
    : grade.startsWith("F") ? GRADE_COLORS.F
    : GRADE_COLORS.default;

  const letter = showFullIncomplete ? 'Incomplete' : isIncomplete ? 'Inc' : grade.charAt(0);
  const modifier = isIncomplete ? '' : grade.slice(1);

  // For scale !== 1 or incomplete grade, use inline styles (proportions still locked)
  const useInlineStyles = scale !== 1 || isIncomplete;
  const scaledSize = Math.round(SIZES.mobile.diameter * scale);
  const scaledBorder = Math.round(SIZES.mobile.border * scale);
  // Smaller font for incomplete text: "Incomplete" (10 chars) needs ~0.28, "Inc" (3 chars) needs ~0.55
  const scaledText = Math.round(SIZES.mobile.text * scale * (showFullIncomplete ? 0.28 : isIncomplete ? 0.55 : 1));
  const scaledModifier = Math.round(SIZES.mobile.modifier * scale);

  return (
    <span
      className={`${useInlineStyles ? '' : 'grade-chip'} inline-flex items-center justify-center rounded-full font-extrabold bg-white dark:bg-white flex-shrink-0 border-solid`}
      style={useInlineStyles ? {
        width: scaledSize,
        height: scaledSize,
        borderWidth: scaledBorder,
        fontSize: scaledText,
        borderColor: color,
        color,
      } : { borderColor: color, color }}
    >
      {letter}
      {modifier && (
        <span
          className={useInlineStyles ? '' : 'grade-chip-modifier'}
          style={useInlineStyles ? { fontSize: scaledModifier } : undefined}
        >
          {modifier}
        </span>
      )}
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
    : effectiveSize === "chip" ? "vote-icon-chip flex-shrink-0"
    : "h-10 w-10 xl:h-12 xl:w-12 flex-shrink-0";

  if (ok) {
    return (
      <svg viewBox="0 0 20 20" className={sizeClass} aria-hidden="true" role="img">
        <circle cx="10" cy="10" r="8" fill="#FFFFFF" stroke={GRADE_COLORS.A} strokeWidth="2.5" />
        <path d="M8.5 13.5l-3-3 -1.5 1.5 4.5 4.5 7-7 -1.5-1.5z" fill={GRADE_COLORS.A} transform="translate(0, -1.5)" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" className={sizeClass} aria-hidden="true" role="img">
      <circle cx="10" cy="10" r="8" fill="#FFFFFF" stroke="#A96A63" strokeWidth="2.5" />
      <path d="M5 6.5L6.5 5 10 8.5 13.5 5 15 6.5 11.5 10 15 13.5 13.5 15 10 11.5 6.5 15 5 13.5 8.5 10z" fill="#A96A63" />
    </svg>
  );
}
