// src/lib/types.ts

export type Chamber = "HOUSE" | "SENATE" | "";

/** Per-column metadata coming from scores_columns_meta.csv */
export type Meta = {
  bill_number?: string;
  position_to_score?: string;
  short_title?: string;
  notes?: string;
  sponsor?: string;
  categories?: string; // semicolon-delimited: "Iran; War Powers"
  chamber?: Chamber;   // optional explicit chamber override
  /** original column key in scores_wide.csv (optional but handy) */
  column: string;
  /** optional type tag if you use it ("BILL" | "MANUAL") */
  type?: "BILL" | "MANUAL";
  preferred?: boolean | number | string; // tolerate csv typing
  pair_key?: string;
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
  aipac_supported?: string | number | boolean;
  dmfi_supported?: string | number | boolean;
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
  /** mark the “better” one in the pair */
  preferred?: boolean;
};