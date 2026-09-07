export interface ExerciseOption {
  id: string;
  name: string;
  slug: string;
  category: string;
  bodyweight: boolean;
  /** 0 pure resistance, 1 pure cardio. Decides which fields the form offers. */
  cardioBias: number;
  mets: number | null;
  isCustom: boolean;
  muscles: { muscle: string; weight: number }[];
}
