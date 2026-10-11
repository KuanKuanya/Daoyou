/** Per-operation limits and absolute balances enforced by resource writes. */
export const RESOURCE_SAFETY = {
  spirit_stones: { maxDelta: 10_000_000, ceiling: 1_000_000_000 },
  reputation: { maxDelta: 9999, ceiling: 1_000_000 },
  lifespan: { maxDelta: 100_000, ceiling: 10_000_000 },
  cultivation_exp: { maxDelta: 10_000_000, ceiling: 1_000_000_000 },
} as const;
