import type { Quality } from '@daoyou/constants/qualities';

export const BEAST_CAPACITY_RECIPE_VERSION = 1;
export const BEAST_CAPACITY_STAGES = [24, 40, 60, 80, 100] as const;

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
