export type Row = {
  full_name: string;
  party: string;
  state: string;
  chamber: "HOUSE" | "SENATE" | string;
  bioguide_id: string;
  photo_url: string;
  Total: string | number;
  "Max_Possible": string | number;
  Percent: string | number;
  Grade: string;
  [col: string]: string | number; // bill/action columns
};

export type ColumnMeta = {
  column: string;              // exact header in scores_wide.csv
  type: "BILL" | "MANUAL";
  bill_number: string;
  categories: string;          // "; "-separated
  short_title: string;
  notes: string;
  sponsor: string;
  position_to_score: string;
};