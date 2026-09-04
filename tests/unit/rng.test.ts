import { describe, expect, it } from 'vitest';

import { advanceRng, clamp, createRng, randFloat, randInt, turnRng } from '@/lib/game/rng';

function draw(rng: () => number, count: number): number[] {
  return Array.from({ length: count }, () => rng());
}

describe('createRng', () => {
  it('returns the identical sequence for the same seed', () => {
    expect(draw(createRng(12345), 20)).toEqual(draw(createRng(12345), 20));
  });

  it('diverges for different seeds', () => {
    const a = draw(createRng(1), 20);
    const b = draw(createRng(2), 20);
    expect(a).not.toEqual(b);
    // Not merely offset by one step either.
    expect(a.slice(1)).not.toEqual(b.slice(0, 19));
  });

  it('only produces values in [0, 1)', () => {
    for (const seed of [0, 1, 7, 999, 2_147_483_647]) {
      for (const value of draw(createRng(seed), 500)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    }
  });

  it('is not degenerate for seed 0', () => {
    const values = draw(createRng(0), 50);
    expect(new Set(values).size).toBe(50);
  });

  it('advances state between calls rather than repeating', () => {
    const rng = createRng(4242);
    const values = draw(rng, 200);
    expect(new Set(values).size).toBe(200);
  });

  it('coerces the seed to an unsigned 32-bit integer', () => {
    expect(draw(createRng(-1), 5)).toEqual(draw(createRng(4_294_967_295), 5));
    expect(draw(createRng(2 ** 32 + 9), 5)).toEqual(draw(createRng(9), 5));
  });
});

describe('turnRng', () => {
  it('is reproducible for the same simulation seed and turn', () => {
    expect(draw(turnRng(777, 3), 10)).toEqual(draw(turnRng(777, 3), 10));
  });

  it('gives each turn of a simulation its own stream', () => {
    const turn3 = draw(turnRng(777, 3), 10);
    const turn4 = draw(turnRng(777, 4), 10);
    expect(turn3).not.toEqual(turn4);
  });

  it('gives each simulation its own stream for the same turn', () => {
    expect(draw(turnRng(1, 1), 10)).not.toEqual(draw(turnRng(2, 1), 10));
  });

  it('stays in [0, 1) even for large seeds that overflow 32 bits', () => {
    for (const value of draw(turnRng(2_147_483_647, 10), 200)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('advanceRng', () => {
  it('is deterministic for the same seed and step count', () => {
    expect(advanceRng(99, 5)).toBe(advanceRng(99, 5));
  });

  it('returns a different value for a different number of steps', () => {
    expect(advanceRng(99, 5)).not.toBe(advanceRng(99, 6));
  });

  it('returns a non-negative integer below 2^31 - 1', () => {
    for (let steps = 0; steps < 25; steps++) {
      const value = advanceRng(31337, steps);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(2_147_483_647);
    }
  });
});

describe('clamp', () => {
  it('passes values inside the range through unchanged', () => {
    expect(clamp(50, 0, 100)).toBe(50);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });

  it('pins values outside the range to the nearest bound', () => {
    expect(clamp(-20, 0, 100)).toBe(0);
    expect(clamp(140, 0, 100)).toBe(100);
  });

  it('treats both bounds as inclusive', () => {
    expect(clamp(0, 0, 100)).toBe(0);
    expect(clamp(100, 0, 100)).toBe(100);
  });
});

describe('randInt', () => {
  it('includes both endpoints', () => {
    expect(randInt(() => 0, 3, 7)).toBe(3);
    expect(randInt(() => 0.999999, 3, 7)).toBe(7);
  });

  it('stays within the requested range for a real stream', () => {
    const rng = createRng(2024);
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const value = randInt(rng, 1, 6);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(6);
      seen.add(value);
    }
    expect(seen.size).toBe(6);
  });

  it('returns the only possible value when min equals max', () => {
    expect(randInt(createRng(5), 4, 4)).toBe(4);
  });
});

describe('randFloat', () => {
  it('maps the unit interval onto the requested range', () => {
    expect(randFloat(() => 0, 10, 20)).toBe(10);
    expect(randFloat(() => 0.5, 10, 20)).toBe(15);
  });

  it('never reaches the upper bound', () => {
    const rng = createRng(11);
    for (let i = 0; i < 200; i++) {
      const value = randFloat(rng, -5, 5);
      expect(value).toBeGreaterThanOrEqual(-5);
      expect(value).toBeLessThan(5);
    }
  });
});
