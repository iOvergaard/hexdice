/** Seeded PRNG (mulberry32). Its state is a single uint32, so it round-trips through GameState.rngState. */
export class Rng {
  #state: number;

  constructor(seed: number) {
    this.#state = seed >>> 0;
  }

  get state(): number {
    return this.#state;
  }

  /** Float in [0, 1). */
  next(): number {
    this.#state = (this.#state + 0x6d2b79f5) >>> 0;
    let t = this.#state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  /** 1..6 */
  die(): number {
    return this.int(6) + 1;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick from empty array');
    return items[this.int(items.length)]!;
  }

  /** Fisher–Yates, in place. Returns the same array. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [items[i], items[j]] = [items[j]!, items[i]!];
    }
    return items;
  }
}
