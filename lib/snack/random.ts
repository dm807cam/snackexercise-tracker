/**
 * Seeded randomness for the planner. Pure.
 *
 * The planner samples — that is how it keeps proposing things the user has not
 * tried often enough to have an opinion about — but a plan must be
 * REPRODUCIBLE: the same situation reloaded must propose the same snack, or the
 * "Start" button would start something other than what was on the card, and no
 * test could pin the behaviour down. So every draw comes from a generator
 * seeded by the situation (lib/snack/service.ts builds the seed), never from
 * Math.random.
 */

/** mulberry32: small, fast, and good enough for choosing between push-up variants. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a over the parts, so a seed can be built from ids and dates. */
export function hashSeed(...parts: (string | number)[]): number {
  let hash = 0x811c9dc5;
  for (const char of parts.join("|")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** A standard normal draw (Box-Muller). */
function normal(random: () => number): number {
  let u = 0;
  while (u === 0) u = random();
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * A Gamma(shape, 1) draw — Marsaglia and Tsang (2000), with the standard boost
 * for shape < 1.
 */
export function sampleGamma(shape: number, random: () => number): number {
  if (shape < 1) {
    const u = Math.max(random(), Number.EPSILON);
    return sampleGamma(shape + 1, random) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = normal(random);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = random();
    if (u < 1 - 0.0331 * x ** 4) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** A Beta(alpha, beta) draw, as the ratio of two Gammas. */
export function sampleBeta(alpha: number, beta: number, random: () => number): number {
  const x = sampleGamma(alpha, random);
  const y = sampleGamma(beta, random);
  return x + y > 0 ? x / (x + y) : 0.5;
}
