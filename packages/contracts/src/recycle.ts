import { QUALITY_VALUES } from '@daoyou/constants/qualities';
import { REALM_VALUES } from '@daoyou/constants/realms';
import { INVENTORY_MATERIAL_TYPES } from '@daoyou/game-domain/inventory';
import { z } from 'zod';

export const MAX_RECYCLE_SELECTION = 200;

export const RecycleSelectionSchema = z
  .object({
    id: z.string().min(1).max(160),
    revision: z.number().int().nonnegative(),
    quantity: z.number().int().min(1).max(999),
  })
  .strict();
export const RecycleRequestSchema = z.discriminatedUnion('phase', [
  z
    .object({
      phase: z.literal('select'),
      location: z.enum(['bag', 'storage']),
      category: z.enum([
        'all',
        'material',
        'seed',
        'equipment',
        'blueprint',
        'manual_jade',
        'pill',
        'fruit',
      ]),
      minQuality: z.enum(QUALITY_VALUES).optional(),
      maxQuality: z.enum(QUALITY_VALUES).optional(),
      materialType: z.enum(INVENTORY_MATERIAL_TYPES).optional(),
      maxRealm: z.enum(REALM_VALUES).optional(),
      onePerStack: z.boolean().default(false),
    })
    .strict()
    .refine(
      (input) =>
        !input.minQuality ||
        !input.maxQuality ||
        QUALITY_VALUES.indexOf(input.minQuality) <=
          QUALITY_VALUES.indexOf(input.maxQuality),
      '品质范围无效',
    ),
  z
    .object({
      phase: z.literal('preview'),
      items: z
        .array(RecycleSelectionSchema)
        .min(1)
        .max(MAX_RECYCLE_SELECTION)
        .refine(
          (items) =>
            new Set(items.map((item) => item.id)).size === items.length,
          '同一物品不可重复选择',
        ),
    })
    .strict(),
  z.object({ phase: z.literal('confirm'), quoteId: z.uuid() }).strict(),
]);
export type RecycleSelection = z.infer<typeof RecycleSelectionSchema>;
export type RecycleCondition = Extract<
  z.infer<typeof RecycleRequestSchema>,
  { phase: 'select' }
>;
export type RecycleQuote = {
  id: string;
  expiresAt: number;
  items: (RecycleSelection & {
    name: string;
    unitPrice: number;
    availableQuantity?: number;
    comment?: string;
  })[];
  total: number;
  matchingCount?: number;
  remainingCount?: number;
};
export type RecycleResult = {
  total: number;
  quantity: number;
  remainingSpiritStones: number;
};
