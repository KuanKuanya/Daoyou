import type {
  BeastCapacityExpandRequest,
  BeastCapacityPreview,
} from '@daoyou/contracts/beasts';
import {
  BEAST_CAPACITY_RECIPE_VERSION,
  BEAST_CAPACITY_RECIPES,
  BEAST_CAPACITY_STAGES,
} from '@daoyou/game-content/beasts';
import {
  selectBeastExpansionMaterials,
  validateBeastExpansionMaterials,
} from '@daoyou/game-rules/beasts/growth';
import {
  assertBeastIdle,
  BeastError,
} from '@server/combat/application/BeastMutationGuard.js';
import { updateSpiritStones } from '@server/cultivator/application/readers/CultivatorStateRepository.js';
import { inventoryItemOf } from '@server/inventory/operations.js';
import { db } from '@server/lib/drizzle/db.js';
import {
  cultivatorBeastLineups,
  inventoryItems,
} from '@server/lib/drizzle/schema.js';
import {
  readBeastCapacity,
  readBeastOwner,
  readBeastRoster,
} from '@server/lib/repositories/combatV6BeastRepository.js';
import {
  describeJournal,
  recordJournalItems,
} from '@server/player/application/JournalSettlement.js';
import { playerCommandExecutor } from '@server/player/application/state/CommandExecutors.js';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';

export async function readBeastCapacityPreview(
  cultivatorId: string,
): Promise<BeastCapacityPreview> {
  const state = await readBeastCapacity(cultivatorId, db);
  const owner = await readBeastOwner(cultivatorId, db);
  const recipe = BEAST_CAPACITY_RECIPES[state.capacityLevel] ?? null;
  const items = [];
  if (recipe) {
    for (const type of ['monster', 'ore'] as const) {
      const rows = await db
        .select()
        .from(inventoryItems)
        .where(
          and(
            eq(inventoryItems.cultivatorId, cultivatorId),
            eq(inventoryItems.definitionId, 'material.v1'),
            inArray(inventoryItems.location, ['bag', 'storage']),
            eq(inventoryItems.isFavorite, false),
            eq(sql<string>`${inventoryItems.instanceData}->>'type'`, type),
            eq(
              sql<string>`${inventoryItems.instanceData}->>'rank'`,
              recipe.rank,
            ),
          ),
        )
        .orderBy(
          sql`case when ${inventoryItems.location} = 'bag' then 0 else 1 end`,
          inventoryItems.id,
        )
        .limit(recipe[type]);
      items.push(...rows.map(inventoryItemOf));
    }
  }
  return {
    ...state,
    recipeVersion: BEAST_CAPACITY_RECIPE_VERSION,
    nextCapacity: BEAST_CAPACITY_STAGES[state.capacityLevel + 1] ?? null,
    recipe,
    ...selectBeastExpansionMaterials(state.capacityLevel, items),
    spiritStones: owner.spiritStones,
  };
}

export async function expandBeastCapacity(
  userId: string,
  cultivatorId: string,
  input: BeastCapacityExpandRequest,
) {
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        expectedCapacityLevel: input.expectedCapacityLevel,
        expectedCapacityRevision: input.expectedCapacityRevision,
        recipeVersion: input.recipeVersion,
        maxSpiritStones: input.maxSpiritStones,
        materials: [...input.materials].sort((a, b) =>
          a.id.localeCompare(b.id),
        ),
      }),
    )
    .digest('hex');
  const committed = await playerCommandExecutor.executeWithLock({
    userId,
    cultivatorId,
    source: 'beast_capacity_expand',
    requestId: input.requestId,
    idempotency: { key: input.requestId, fingerprint },
    command: async (tx) => {
      await assertBeastIdle(cultivatorId, tx);
      const state = await readBeastCapacity(cultivatorId, tx);
      if (
        state.capacityLevel !== input.expectedCapacityLevel ||
        state.capacityRevision !== input.expectedCapacityRevision ||
        input.recipeVersion !== BEAST_CAPACITY_RECIPE_VERSION
      )
        throw new BeastError('扩容方案已变化，请重新查看');
      const recipe = BEAST_CAPACITY_RECIPES[state.capacityLevel];
      if (!recipe) throw new BeastError('灵兽袋已扩至上限');
      const owner = await readBeastOwner(cultivatorId, tx);
      if (owner.userId !== userId) throw new BeastError('角色归属不符');
      if (recipe.spiritStones > input.maxSpiritStones)
        throw new BeastError('扩容费用超出确认预算，请重新查看');
      if (owner.spiritStones < recipe.spiritStones)
        throw new BeastError(`灵石不足，需要 ${recipe.spiritStones}`);
      const rows = await tx
        .select()
        .from(inventoryItems)
        .where(
          and(
            eq(inventoryItems.cultivatorId, cultivatorId),
            inArray(
              inventoryItems.id,
              input.materials.map((item) => item.id),
            ),
          ),
        );
      const selections = input.materials.map((ref) => {
        const row = rows.find((item) => item.id === ref.id);
        if (!row || row.revision !== ref.expectedRevision)
          throw new BeastError('扩容材料已变化，请重新查看');
        return { item: inventoryItemOf(row), quantity: ref.quantity };
      });
      try {
        validateBeastExpansionMaterials(state.capacityLevel, selections);
      } catch (error) {
        throw new BeastError(
          error instanceof Error ? error.message : '扩容材料无效',
        );
      }
      for (const { item, quantity } of selections) {
        const filter = and(
          eq(inventoryItems.cultivatorId, cultivatorId),
          eq(inventoryItems.id, item.id),
          eq(inventoryItems.revision, item.revision),
          eq(inventoryItems.isFavorite, false),
        );
        const changed =
          quantity === item.quantity
            ? await tx
                .delete(inventoryItems)
                .where(filter)
                .returning({ id: inventoryItems.id })
            : await tx
                .update(inventoryItems)
                .set({
                  quantity: item.quantity - quantity,
                  revision: item.revision + 1,
                })
                .where(filter)
                .returning({ id: inventoryItems.id });
        if (changed.length !== 1)
          throw new BeastError('扩容材料已变化，请重新查看');
      }
      recordJournalItems(
        tx,
        cultivatorId,
        selections.map(({ item }) => item),
        selections.flatMap(({ item, quantity }) =>
          quantity === item.quantity
            ? []
            : [
                {
                  ...item,
                  quantity: item.quantity - quantity,
                  revision: item.revision + 1,
                },
              ],
        ),
      );
      describeJournal(
        tx,
        cultivatorId,
        `灵兽袋 ${state.capacity} → ${BEAST_CAPACITY_STAGES[state.capacityLevel + 1]} 格`,
      );
      const spiritStones = await updateSpiritStones(
        userId,
        cultivatorId,
        -recipe.spiritStones,
        tx,
      );
      await tx
        .insert(cultivatorBeastLineups)
        .values({
          cultivatorId,
          lineup: { carriedBeastIds: [], revision: 0 },
          capacityLevel: state.capacityLevel + 1,
          capacityRevision: state.capacityRevision + 1,
        })
        .onConflictDoUpdate({
          target: cultivatorBeastLineups.cultivatorId,
          set: {
            capacityLevel: state.capacityLevel + 1,
            capacityRevision: state.capacityRevision + 1,
          },
        });
      return {
        result: { capacity: BEAST_CAPACITY_STAGES[state.capacityLevel + 1]! },
        resourceChanges: [
          {
            resourceTopic: 'inventory.bag' as const,
            operation: 'invalidate' as const,
            eventType: 'inventory.bag.changed',
          },
          {
            resourceTopic: 'player.currency' as const,
            operation: 'merge' as const,
            eventType: 'currency.spirit_stones.changed',
            payload: { spiritStones },
          },
        ],
      };
    },
  });
  // Receipts keep the expansion result; refreshing the roster avoids replaying old ownership state.
  return {
    ...committed,
    result: {
      ...committed.result,
      view: await readBeastRoster(cultivatorId, db),
    },
  };
}
