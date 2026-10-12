import { REALM_VALUES } from '@daoyou/constants/realms';
import type {
  AutoStorePreview,
  InventoryManagementAction,
  StorageCompactResult,
} from '@daoyou/contracts/inventory';
import { ITEM_DEFINITIONS } from '@daoyou/game-content/items';
import {
  compactStorage,
  itemDefinition,
  planAutoStore,
} from '@daoyou/game-rules/inventory';
import type {
  DbClient,
  DbExecutor,
  DbTransaction,
} from '@server/lib/drizzle/db.js';
import { cultivators, inventoryItems } from '@server/lib/drizzle/schema.js';
import { lockCultivatorForStateMutation } from '@server/lib/repositories/playerStateRepository.js';
import { playerCommandExecutor } from '@server/player/application/state/CommandExecutors.js';
import { and, asc, eq, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  assertInventoryIdle,
  InventoryError,
  inventoryItemOf,
  saveInventoryPlan,
  transferInventoryItem,
} from './InventoryService.js';

const change = {
  resourceTopic: 'inventory.bag' as const,
  eventType: 'inventory.bag.changed',
  operation: 'invalidate' as const,
};
async function bagState(owner: string, tx: DbExecutor) {
  const [character] = await tx
    .select({ realm: cultivators.realm })
    .from(cultivators)
    .where(eq(cultivators.id, owner));
  if (!character) throw new InventoryError('角色不存在');
  const items = (
    await tx
      .select()
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.cultivatorId, owner),
          eq(inventoryItems.location, 'bag'),
        ),
      )
      .orderBy(asc(inventoryItems.id))
  ).map(inventoryItemOf);
  return { realm: z.enum(REALM_VALUES).parse(character.realm), items };
}
async function compactCandidates(owner: string, tx: DbExecutor) {
  const stackLimits = ITEM_DEFINITIONS.filter((entry) => entry.stackLimit > 1);
  const filter = and(
    eq(inventoryItems.cultivatorId, owner),
    eq(inventoryItems.location, 'storage'),
    or(
      ...stackLimits.map((definition) =>
        and(
          eq(inventoryItems.definitionId, definition.id),
          sql`${inventoryItems.quantity} < ${definition.stackLimit}`,
        ),
      ),
    ),
    sql`${inventoryItems.stackKey} is not null`,
    sql`exists (select 1 from ${inventoryItems} as partner where partner.cultivator_id = ${owner} and partner.location = 'storage' and partner.id <> ${inventoryItems.id} and partner.definition_id = ${inventoryItems.definitionId} and partner.stack_key = ${inventoryItems.stackKey} and partner.is_favorite = ${inventoryItems.isFavorite} and partner.quantity < (case ${sql.join(
      stackLimits.map(
        (entry) =>
          sql`when partner.definition_id = ${entry.id} then ${entry.stackLimit}`,
      ),
      sql` `,
    )} else 1 end))`,
  );
  const items = (
    await tx
      .select()
      .from(inventoryItems)
      .where(filter)
      .orderBy(
        asc(inventoryItems.definitionId),
        asc(inventoryItems.stackKey),
        asc(inventoryItems.isFavorite),
        asc(inventoryItems.id),
      )
      .limit(200)
  ).map(inventoryItemOf);
  // A group cut at the batch boundary must not turn into a useless single-row write.
  return items.filter((item) =>
    items.some(
      (other) =>
        other.id !== item.id &&
        other.definitionId === item.definitionId &&
        other.stackKey === item.stackKey &&
        other.isFavorite === item.isFavorite,
    ),
  );
}
async function storePlan(
  owner: string,
  before: Awaited<ReturnType<typeof bagState>>['items'],
  selected: typeof before,
  tx: DbTransaction,
) {
  if (!selected.length) return;
  const stacks = selected.filter((item) => item.stackKey !== null);
  const targets = stacks.length
    ? (
        await tx
          .select()
          .from(inventoryItems)
          .where(
            and(
              eq(inventoryItems.cultivatorId, owner),
              eq(inventoryItems.location, 'storage'),
              or(
                ...stacks.map((item) =>
                  and(
                    eq(inventoryItems.definitionId, item.definitionId),
                    eq(inventoryItems.stackKey, item.stackKey!),
                    eq(inventoryItems.isFavorite, item.isFavorite),
                    sql`${inventoryItems.quantity} < ${itemDefinition(item.definitionId).stackLimit}`,
                  ),
                ),
              ),
            ),
          )
          .orderBy(asc(inventoryItems.id))
          .limit(200)
      ).map(inventoryItemOf)
    : [];
  const complete = [...before, ...targets];
  let after = complete;
  for (const source of selected)
    after = transferInventoryItem(
      after,
      after.find((item) => item.id === source.id)!,
      'storage',
    );
  await saveInventoryPlan(owner, complete, after, tx);
}
export async function manageInventory(
  actor: { userId: string; cultivatorId: string },
  input: InventoryManagementAction,
  database: DbClient,
) {
  const owner = actor.cultivatorId;
  if (input.action === 'auto_store_preview') {
    const data = await database.transaction(
      async (tx): Promise<AutoStorePreview> => {
        await lockCultivatorForStateMutation(tx, owner);
        await assertInventoryIdle(owner, tx);
        const { realm, items } = await bagState(owner, tx);
        return {
          realm,
          rules: input.rules,
          items: items.map(({ id, revision }) => ({ id, revision })),
          selected: planAutoStore(items, realm, input.rules).map((item) => ({
            id: item.id,
            revision: item.revision,
            quantity: item.quantity,
            name:
              typeof item.instanceData === 'object' &&
              item.instanceData &&
              'name' in item.instanceData
                ? String(item.instanceData.name)
                : itemDefinition(item.definitionId).name,
          })),
        };
      },
    );
    return { success: true, data };
  }
  const committed = await playerCommandExecutor.executeWithLock<
    StorageCompactResult | { transferred: number }
  >({
    ...actor,
    source: 'inventory_management',
    idempotency: {
      key: `inventory-management:${input.requestId}`,
      fingerprint: JSON.stringify(input),
    },
    command: async (tx) => {
      await assertInventoryIdle(owner, tx);
      if (input.action === 'compact_storage') {
        const before = await compactCandidates(owner, tx);
        const after = compactStorage(before);
        await saveInventoryPlan(owner, before, after, tx);
        const result: StorageCompactResult = {
          processed: before.length,
          removed: before.length - after.length,
          hasMore: (await compactCandidates(owner, tx)).length > 1,
        };
        return { result, resourceChanges: [change] };
      }
      const current = await bagState(owner, tx);
      if (
        current.realm !== input.realm ||
        current.items.length !== input.items.length ||
        input.items.some(
          (ref) =>
            !current.items.some(
              (item) => item.id === ref.id && item.revision === ref.revision,
            ),
        )
      )
        throw new InventoryError('背包或境界已变化，请重新预览归仓');
      const selected = planAutoStore(current.items, current.realm, input.rules);
      if (
        selected.length !== input.selected.length ||
        input.selected.some(
          (ref) =>
            !selected.some(
              (item) => item.id === ref.id && item.revision === ref.revision,
            ),
        )
      )
        throw new InventoryError('归仓清单已变化，请重新预览');
      await storePlan(owner, current.items, selected, tx);
      return {
        result: { transferred: selected.length },
        resourceChanges: [change],
      };
    },
  });
  return { success: true, data: committed.result, state: committed.state };
}
