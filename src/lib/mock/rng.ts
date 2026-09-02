// Deterministic PRNG so the generated demo dataset is stable across restarts
// (mirrors the intent of the original migration's `SELECT setseed(0.4242)`).
export function makeRng(seed: number) {
  let a = seed >>> 0 || 1;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = () => number;

export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

export function int(rng: Rng, min: number, max: number): number {
  return Math.floor(min + rng() * (max - min + 1));
}

export function chance(rng: Rng, p: number): boolean {
  return rng() < p;
}

export function uuid(rng: Rng): string {
  // RFC4122-shaped v4 string, deterministic from the seeded rng.
  const hex = () => Math.floor(rng() * 16).toString(16);
  const s = (n: number) => Array.from({ length: n }, hex).join("");
  return `${s(8)}-${s(4)}-4${s(3)}-${(8 + Math.floor(rng() * 4)).toString(16)}${s(3)}-${s(12)}`;
}
