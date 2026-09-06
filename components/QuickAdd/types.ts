export interface ExerciseOption {
  id: string;
  name: string;
  slug: string;
  category: string;
  bodyweight: boolean;
  isCustom: boolean;
  muscles: { muscle: string; weight: number }[];
}
