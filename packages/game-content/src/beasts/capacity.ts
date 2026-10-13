import type { Quality } from '@daoyou/constants/qualities';

// Version 2 changes expansion from total ownership to warehouse slots.
export const BEAST_CAPACITY_RECIPE_VERSION = 2;
/** Warehouse slots unlocked by each expansion level; the carried bag stays at eight. */
export const BEAST_WAREHOUSE_CAPACITY_STAGES = [50, 70, 90, 120, 160] as const;
/** @deprecated Use BEAST_WAREHOUSE_CAPACITY_STAGES for new code. */
export const BEAST_CAPACITY_STAGES = BEAST_WAREHOUSE_CAPACITY_STAGES;

export const BEAST_CAPACITY_RECIPES: readonly {
  rank: Quality;
  monster: number;
  ore: number;
  spiritStones: number;
}[] = [
  { rank: '凡品', monster: 2, ore: 2, spiritStones: 1000 },
  { rank: '灵品', monster: 6, ore: 3, spiritStones: 5000 },
  { rank: '玄品', monster: 8, ore: 4, spiritStones: 15000 },
  { rank: '真品', monster: 8, ore: 4, spiritStones: 50000 },
];
