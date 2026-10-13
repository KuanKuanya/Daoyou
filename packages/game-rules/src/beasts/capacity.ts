import {
  BEAST_CAPACITY_RECIPES,
  BEAST_WAREHOUSE_CAPACITY_STAGES,
} from '@daoyou/game-content/beasts';
import {
  MaterialFactsSchema,
  type InventoryItem,
} from '@daoyou/game-domain/inventory';

export function beastWarehouseCapacityAt(level: number): number {
  // The persisted expansion level controls warehouse slots. The carried bag is
  // a separate fixed combat container (BEAST_BAG_CAPACITY).
  const capacity = BEAST_WAREHOUSE_CAPACITY_STAGES[level];
  if (!Number.isInteger(level) || capacity === undefined)
    throw new Error('灵兽仓库扩容档位无效');
  return capacity;
}

/** @deprecated Use beastWarehouseCapacityAt to distinguish it from the carried bag. */
export const beastCapacityAt = beastWarehouseCapacityAt;

/** A preview uses concrete whole rows but consumes only each recipe's requested quantity. */
export function selectBeastExpansionMaterials(
  level: number,
  items: readonly InventoryItem[],
) {
  beastWarehouseCapacityAt(level);
  const recipe = BEAST_CAPACITY_RECIPES[level];
  const missing = { monster: recipe?.monster ?? 0, ore: recipe?.ore ?? 0 };
  const materials: { item: InventoryItem; quantity: number }[] = [];
  if (!recipe) return { materials, missing };
  for (const item of items) {
    if (
      item.definitionId !== 'material.v1' ||
      item.location === 'equipped' ||
      item.isFavorite
    )
      continue;
    const facts = MaterialFactsSchema.parse(item.instanceData);
    if (
      facts.rank !== recipe.rank ||
      (facts.type !== 'monster' && facts.type !== 'ore')
    )
      continue;
    const quantity = Math.min(item.quantity, missing[facts.type]);
    if (!quantity) continue;
    materials.push({ item, quantity });
    missing[facts.type] -= quantity;
  }
  return { materials, missing };
}

export function validateBeastExpansionMaterials(
  level: number,
  selections: readonly { item: InventoryItem; quantity: number }[],
): void {
  beastWarehouseCapacityAt(level);
  const recipe = BEAST_CAPACITY_RECIPES[level];
  if (!recipe) throw new Error('灵兽仓库已扩至上限');
  if (new Set(selections.map(({ item }) => item.id)).size !== selections.length)
    throw new Error('扩容材料不能重复选择');
  const supplied = { monster: 0, ore: 0 };
  for (const { item, quantity } of selections) {
    if (
      item.definitionId !== 'material.v1' ||
      item.location === 'equipped' ||
      item.isFavorite ||
      !Number.isSafeInteger(quantity) ||
      quantity <= 0 ||
      quantity > item.quantity
    )
      throw new Error('扩容材料已变化，请重新查看');
    const facts = MaterialFactsSchema.parse(item.instanceData);
    if (
      facts.rank !== recipe.rank ||
      (facts.type !== 'monster' && facts.type !== 'ore')
    )
      throw new Error('扩容材料类型或品阶不符');
    supplied[facts.type] += quantity;
  }
  if (supplied.monster !== recipe.monster || supplied.ore !== recipe.ore)
    throw new Error('扩容材料数量不符');
}
