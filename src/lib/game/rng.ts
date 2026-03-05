/**
 * Deterministic seeded pseudo-random number generator (Mulberry32).
 * Given the same seed + call sequence, always returns the same numbers.
 */
export function createRng(seed: number) {
  let s = seed >>> 0;

  return function next(): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Advance the RNG n times (useful for skipping to a specific turn). */
export function advanceRng(seed: number, steps: number): number {
  const rng = createRng(seed);
  for (let i = 0; i < steps; i++) rng();
  // Return current state as a new "seed"
  // We do this by using the next call as a seed offset
  return Math.floor(rng() * 2147483647);
}

/** Create an RNG seeded for a specific turn within a simulation. */
export function turnRng(simSeed: number, turnNumber: number) {
  // Derive a per-turn seed that is deterministic
  const turnSeed = (simSeed * 1000003 + turnNumber * 999983) >>> 0;
  return createRng(turnSeed);
}

/** Clamp a number to [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Random integer in [min, max] using a provided rng function. */
export function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/** Random float in [min, max] using a provided rng function. */
export function randFloat(rng: () => number, min: number, max: number): number {
  return rng() * (max - min) + min;
}
