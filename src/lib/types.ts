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
};

/** One member row from scores_wide.csv */
export type Row = {
  full_name?: string;
  party?: string;
  state?: string;
  chamber: Chamber;
  bioguide_id?: string;
  photo_url?: string;
  Total?: number | string;
  Max_Possible?: number | string;
  Percent?: number | string;
  Grade?: string;
  // dynamic bill/action columns:
  [billOrManual: string]: string | number | undefined;
};

// If other files still import ColumnMeta, keep this alias for backwards-compat:
export type ColumnMeta = Meta;