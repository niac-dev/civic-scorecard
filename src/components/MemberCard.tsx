// src/components/MemberCard.tsx
import { Row } from "@/lib/types";
import { partyBadgeStyle, partyLabel, stateCodeOf, gradeColor, isTruthy, getPhotoUrl } from "@/lib/utils";

interface MemberCardProps {
  member: Row;
  onClick: () => void;
  showAipacBadges?: boolean;
}

export function MemberCard({ member, onClick, showAipacBadges = false }: MemberCardProps) {
  // Determine which grade field to use (different pages use different field names)
  const grade = member.Grade || member["Grade: Overall"];

  return (
    <div
      className="flex items-center gap-2 p-2 rounded-lg border border-[#E7ECF2] dark:border-slate-900 bg-slate-50 dark:bg-white/5 cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10 transition"
      onClick={onClick}
    >
      {member.bioguide_id ? (
        <img
          src={getPhotoUrl(String(member.bioguide_id), '225x275') || String(member.photo_url || '')}
          alt=""
          loading="lazy"
          className="h-8 w-8 flex-shrink-0 rounded-full object-cover bg-slate-200 dark:bg-white/10"
          onError={(e) => {
            const target = e.currentTarget;
            if (!target.dataset.fallback && member.photo_url) {
              target.dataset.fallback = '1';
              target.src = String(member.photo_url);
            }
          }}
        />
      ) : (
        <div className="h-8 w-8 flex-shrink-0 rounded-full bg-slate-300 dark:bg-white/10" />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 overflow-hidden">
          <span className="truncate">{member.full_name}</span>
          {grade && (() => {
            const gradeStr = String(grade);
            const letter = gradeStr.charAt(0);
            const modifier = gradeStr.slice(1);
            return (
              <span
                className="flex-shrink-0 inline-flex items-center justify-center rounded-full w-8 h-8 text-base font-extrabold bg-white dark:bg-white"
                style={{
                  color: gradeColor(gradeStr),
                  border: `4px solid ${gradeColor(gradeStr)}`
                }}
              >
                {letter}
                {modifier && <span className="text-[10px]">{modifier}</span>}
              </span>
            );
          })()}
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
          <span
            className="px-1 py-0.5 rounded text-[10px] font-medium"
            style={partyBadgeStyle(member.party)}
          >
            {partyLabel(member.party)}
          </span>
          {" "}{stateCodeOf(member.state)}
          {/* Show AIPAC/DMFI badges if requested */}
          {showAipacBadges && isTruthy(member.aipac_supported) && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-red-900 dark:bg-red-900 text-white dark:text-white">
              AIPAC
            </span>
          )}
          {showAipacBadges && isTruthy(member.dmfi_supported) && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-blue-900 dark:bg-blue-900 text-white dark:text-white">
              DMFI
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
