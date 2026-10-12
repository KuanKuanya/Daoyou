import type { Quality } from '@daoyou/constants/qualities';
import type { createBeastAllocationSchema } from '@daoyou/game-domain/beasts';
import {
  BeastLineupSchema,
  type BeastRoster,
  type SummonedBeast,
} from '@daoyou/game-domain/beasts';
import type { InventoryItem } from '@daoyou/game-domain/inventory';
import { z } from 'zod';

export const BeastCapacityExpandSchema = z
  .strictObject({
    requestId: z.uuid(),
    expectedCapacityLevel: z.number().int().min(0).max(3),
    expectedCapacityRevision: z.number().int().nonnegative().max(2147483646),
    recipeVersion: z.number().int().positive().max(2147483647),
    maxSpiritStones: z.number().int().positive().max(2147483647),
    materials: z
      .array(
        z.strictObject({
          id: z.string().min(1).max(160),
          expectedRevision: z.number().int().nonnegative().max(2147483646),
          quantity: z.number().int().min(1).max(12),
        }),
      )
      .min(1)
      .max(12),
  })
  .refine(
    ({ materials }) =>
      new Set(materials.map((item) => item.id)).size === materials.length,
    '扩容材料不能重复选择',
  );
export type BeastCapacityExpandRequest = z.infer<
  typeof BeastCapacityExpandSchema
>;
export type BeastCapacityPreview = {
  capacityLevel: number;
  capacityRevision: number;
  capacity: number;
  recipeVersion: number;
  nextCapacity: number | null;
  recipe: {
    rank: Quality;
    monster: number;
    ore: number;
    spiritStones: number;
  } | null;
  materials: { item: InventoryItem; quantity: number }[];
  missing: { monster: number; ore: number };
  spiritStones: number;
};
export type BeastCapacityExpandResponse = {
  view: BeastManagementView;
  capacity: number;
};
export const BeastClaimSchema = z
  .object({ speciesId: z.string().min(1).max(160) })
  .strict();
export const BeastLineupRequestSchema = BeastLineupSchema;
export const BeastRestSchema = z
  .object({
    beastId: z.uuid(),
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();
export function createBeastAllocateSchema(
  BeastAllocationSchema: ReturnType<typeof createBeastAllocationSchema>,
) {
  return BeastRestSchema.extend({ points: BeastAllocationSchema });
}
export type BeastAllocateRequest = z.infer<
  ReturnType<typeof createBeastAllocateSchema>
>;
export const BeastFusionRequestSchema = z
  .strictObject({
    requestId: z.uuid(),
    parents: z.tuple([BeastRestSchema, BeastRestSchema]),
  })
  .refine(
    ({ parents }) => parents[0].beastId !== parents[1].beastId,
    '请选择两只不同的灵兽',
  );
export type BeastFusionRequest = z.infer<typeof BeastFusionRequestSchema>;
export type BeastFusionResponse = {
  view: BeastManagementView;
  result: SummonedBeast;
};
export type BeastManagementView = BeastRoster & {
  starterClaimed: boolean;
  ownerLevel: number;
  spiritStones: number;
  capacity: number;
  capacityLevel: number;
  capacityRevision: number;
};
export const BEAST_NAME_MAX_LENGTH = 7;
export const BeastNameSchema = z
  .string()
  .trim()
  .superRefine((name, ctx) => {
    const length = Array.from(name).length;
    if (length < 1 || length > BEAST_NAME_MAX_LENGTH)
      ctx.addIssue({ code: 'custom', message: '灵兽名字需为 1～7 字' });
    if (/[\s\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]/u.test(name))
      ctx.addIssue({
        code: 'custom',
        message: '名字不能包含空白、控制或不可见字符',
      });
  });
export const BeastRenameSchema = BeastRestSchema.extend({
  name: BeastNameSchema,
});
