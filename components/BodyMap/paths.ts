/**
 * Hand-authored body diagram geometry.
 *
 * Deliberately stylised rather than anatomically exact: the job is to answer
 * "have I hit my hamstrings this week" at a glance on a phone, so regions are
 * chunky and clearly separated. Every muscle slug here exists in lib/muscles.ts.
 *
 * Both figures share a 100 x 220 viewBox, centred on x = 50.
 */

import type { MuscleSlug } from "@/lib/muscles";

export interface MusclePath {
  muscle: MuscleSlug;
  /** Left/right halves of the same muscle are separate paths, one entry each. */
  d: string;
}

/** Head, hands, feet and joints: drawn in a neutral tone, never shaded. */
export const FRONT_NEUTRAL: string[] = [
  // head
  "M50,7 C57,7 62,13 62,22 C62,31 57,37 50,37 C43,37 38,31 38,22 C38,13 43,7 50,7 Z",
  // pelvis
  "M36,119 Q50,124 64,119 L66,133 Q50,139 34,133 Z",
  // knees
  "M34,175 Q40,179 46,176 L46,186 Q40,189 34,186 Z",
  "M66,175 Q60,179 54,176 L54,186 Q60,189 66,186 Z",
  // hands
  "M12,128 Q19,127 21,131 Q20,140 15,141 Q11,139 12,128 Z",
  "M88,128 Q81,127 79,131 Q80,140 85,141 Q89,139 88,128 Z",
  // feet
  "M35,207 Q40,210 44,208 L45,215 Q39,217 34,215 Z",
  "M65,207 Q60,210 56,208 L55,215 Q61,217 66,215 Z",
];

export const BACK_NEUTRAL: string[] = [
  "M50,7 C57,7 62,13 62,22 C62,31 57,37 50,37 C43,37 38,31 38,22 C38,13 43,7 50,7 Z",
  "M34,175 Q40,179 46,176 L46,184 Q40,187 34,184 Z",
  "M66,175 Q60,179 54,176 L54,184 Q60,187 66,184 Z",
  "M12,128 Q19,127 21,131 Q20,140 15,141 Q11,139 12,128 Z",
  "M88,128 Q81,127 79,131 Q80,140 85,141 Q89,139 88,128 Z",
  "M35,207 Q40,210 44,208 L45,215 Q39,217 34,215 Z",
  "M65,207 Q60,210 56,208 L55,215 Q61,217 66,215 Z",
];

export const FRONT_PATHS: MusclePath[] = [
  { muscle: "neck", d: "M43,34 Q50,37 57,34 L58,41 Q50,44 42,41 Z" },

  { muscle: "traps", d: "M42,40 Q50,43 58,40 L71,50 Q66,54 60,52 Q50,49 40,52 Q34,54 29,50 Z" },

  { muscle: "front-delts", d: "M30,51 Q22,55 21,65 Q22,72 27,73 Q31,64 33,55 Z" },
  { muscle: "front-delts", d: "M70,51 Q78,55 79,65 Q78,72 73,73 Q69,64 67,55 Z" },

  { muscle: "side-delts", d: "M21,64 Q18,70 20,77 Q24,79 26,74 Q23,70 24,64 Z" },
  { muscle: "side-delts", d: "M79,64 Q82,70 80,77 Q76,79 74,74 Q77,70 76,64 Z" },

  { muscle: "chest", d: "M34,55 Q43,52 48,57 L48,73 Q40,78 33,71 Q31,62 34,55 Z" },
  { muscle: "chest", d: "M66,55 Q57,52 52,57 L52,73 Q60,78 67,71 Q69,62 66,55 Z" },

  { muscle: "biceps", d: "M23,78 Q18,86 18,98 Q21,104 26,100 Q28,89 28,79 Z" },
  { muscle: "biceps", d: "M77,78 Q82,86 82,98 Q79,104 74,100 Q72,89 72,79 Z" },

  { muscle: "forearms", d: "M18,101 Q14,112 13,126 Q17,130 21,127 Q24,114 25,102 Z" },
  { muscle: "forearms", d: "M82,101 Q86,112 87,126 Q83,130 79,127 Q76,114 75,102 Z" },

  { muscle: "abs", d: "M43,76 Q50,74 57,76 L56,117 Q50,121 44,117 Z" },

  { muscle: "obliques", d: "M35,75 Q39,77 42,78 L43,116 Q38,112 35,103 Q33,89 35,75 Z" },
  { muscle: "obliques", d: "M65,75 Q61,77 58,78 L57,116 Q62,112 65,103 Q67,89 65,75 Z" },

  { muscle: "quads", d: "M34,133 Q40,137 45,136 L44,174 Q38,177 34,173 Q31,153 34,133 Z" },
  { muscle: "quads", d: "M66,133 Q60,137 55,136 L56,174 Q62,177 66,173 Q69,153 66,133 Z" },

  { muscle: "adductors", d: "M45,136 Q49,139 49,143 L48,166 Q44,168 43,161 Q42,147 45,136 Z" },
  { muscle: "adductors", d: "M55,136 Q51,139 51,143 L52,166 Q56,168 57,161 Q58,147 55,136 Z" },

  { muscle: "calves", d: "M36,187 Q41,190 45,187 L44,206 Q39,209 36,205 Z" },
  { muscle: "calves", d: "M64,187 Q59,190 55,187 L56,206 Q61,209 64,205 Z" },
];

export const BACK_PATHS: MusclePath[] = [
  { muscle: "neck", d: "M43,34 Q50,37 57,34 L58,42 Q50,45 42,42 Z" },

  {
    muscle: "traps",
    d: "M42,40 Q50,43 58,40 L71,50 Q64,55 57,57 L50,69 L43,57 Q36,55 29,50 Z",
  },

  { muscle: "rear-delts", d: "M28,51 Q21,55 20,65 Q21,72 26,73 Q30,64 32,55 Z" },
  { muscle: "rear-delts", d: "M72,51 Q79,55 80,65 Q79,72 74,73 Q70,64 68,55 Z" },

  { muscle: "side-delts", d: "M20,64 Q17,70 19,77 Q23,79 25,74 Q22,70 23,64 Z" },
  { muscle: "side-delts", d: "M80,64 Q83,70 81,77 Q77,79 75,74 Q78,70 77,64 Z" },

  { muscle: "mid-back", d: "M42,58 Q47,64 49,71 L49,90 L42,87 Q38,72 42,58 Z" },
  { muscle: "mid-back", d: "M58,58 Q53,64 51,71 L51,90 L58,87 Q62,72 58,58 Z" },

  { muscle: "lats", d: "M32,55 Q37,62 41,68 Q40,79 41,89 L35,95 Q27,78 30,58 Z" },
  { muscle: "lats", d: "M68,55 Q63,62 59,68 Q60,79 59,89 L65,95 Q73,78 70,58 Z" },

  { muscle: "lower-back", d: "M40,93 Q50,91 60,93 L62,117 Q50,121 38,117 Z" },

  { muscle: "triceps", d: "M23,78 Q18,86 18,98 Q21,104 26,100 Q28,89 28,79 Z" },
  { muscle: "triceps", d: "M77,78 Q82,86 82,98 Q79,104 74,100 Q72,89 72,79 Z" },

  { muscle: "forearms", d: "M18,101 Q14,112 13,126 Q17,130 21,127 Q24,114 25,102 Z" },
  { muscle: "forearms", d: "M82,101 Q86,112 87,126 Q83,130 79,127 Q76,114 75,102 Z" },

  { muscle: "glutes", d: "M36,119 Q44,117 49,122 L49,140 Q42,144 36,138 Q33,128 36,119 Z" },
  { muscle: "glutes", d: "M64,119 Q56,117 51,122 L51,140 Q58,144 64,138 Q67,128 64,119 Z" },

  { muscle: "hamstrings", d: "M35,142 Q41,146 46,143 L45,174 Q39,177 34,173 Q32,157 35,142 Z" },
  { muscle: "hamstrings", d: "M65,142 Q59,146 54,143 L55,174 Q61,177 66,173 Q68,157 65,142 Z" },

  { muscle: "calves", d: "M35,185 Q41,190 46,186 L44,206 Q39,209 35,205 Q33,195 35,185 Z" },
  { muscle: "calves", d: "M65,185 Q59,190 54,186 L56,206 Q61,209 65,205 Q67,195 65,185 Z" },
];

export const VIEWBOX = "0 0 100 220";
