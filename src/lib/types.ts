// src/lib/types.ts

export type Chamber = "HOUSE" | "SENATE" | "";

/** Per-column metadata coming from scores_columns_meta.csv */
export type Meta = {
  bill_number?: string;
  position_to_score?: string;
  display_name?: string;
  short_title?: string;
  notes?: string;
  description?: string;
  analysis?: string;
  sponsor?: string;
  sponsor_bioguide_id?: string;
  sponsor_name?: string;
  categories?: string; // semicolon-delimited: "Iran; War Powers"
  action_types?: string;
  chamber?: Chamber;   // optional explicit chamber override
  congress_url?: string;
  learn_more_link?: string;
  /** original column key in scores_wide.csv (optional but handy) */
  column: string;
  /** optional type tag if you use it ("BILL" | "MANUAL") */
  type?: "BILL" | "MANUAL";
  preferred?: boolean | number | string; // tolerate csv typing
  pair_key?: string;
  points?: string | number; // total possible points for this action
  no_cosponsor_benefit?: boolean | number | string; // whether cosponsors can get positive points
};

/** One member row from scores_wide.csv */
export type Row = {
  full_name?: string;
  party?: string;
  state?: string;
  chamber: Chamber;
  bioguide_id?: string;
  photo_url?: string;
  district?: string;
  office_phone?: string;
  office_address?: string;
  district_offices?: string;
  committees?: string;
  aipac_supported?: string | number | boolean;
  dmfi_supported?: string | number | boolean;
  reject_aipac_commitment?: string;
  reject_aipac_link?: string;
  Total?: number | string;
  Max_Possible?: number | string;
  Percent?: number | string;
  Grade?: string;
  // per-category grades (dynamically generated):
  Total_Civil_Rights_Immigration?: number | string;
  Max_Possible_Civil_Rights_Immigration?: number | string;
  Percent_Civil_Rights_Immigration?: number | string;
  Grade_Civil_Rights_Immigration?: string;
  Total_Iran?: number | string;
  Max_Possible_Iran?: number | string;
  Percent_Iran?: number | string;
  Grade_Iran?: string;
  Total_Israel_Gaza?: number | string;
  Max_Possible_Israel_Gaza?: number | string;
  Percent_Israel_Gaza?: number | string;
  Grade_Israel_Gaza?: string;
  // dynamic bill/action columns:
  [billOrManual: string]: string | number | undefined | boolean;
};

/** Manual scoring metadata from manual_scoring_meta.csv */
export type ManualScoringMeta = {
  label: string; // Display name of the manual action
  score: number; // Score value (e.g., 4.0, 2.0, 0.0)
  custom_scoring_description: string; // Custom description for this score tier
};

// If other files still import ColumnMeta, keep this alias for backwards-compat:
export type ColumnMeta = {
  column: string;
  type: "BILL" | "MANUAL";
  bill_number: string;
  categories: string;
  short_title: string;
  notes: string;
  sponsor: string;
  position_to_score: string;
  /** same string for all items in the group (e.g. the two similar measures) */
  pair_key?: string;
  /** mark the "better" one in the pair */
  preferred?: boolean;
};