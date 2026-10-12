import { findItemDefinition } from '@daoyou/game-content/items';
import { isEquipmentLevel } from '@daoyou/game-domain/equipment';
import type { InventoryItem } from '@daoyou/game-domain/inventory';
import {
  ConsumableFactsSchema,
  SeedFactsSchema,
} from '@daoyou/game-domain/inventory';
import { InventoryEquipmentSchema } from './equipment.js';

export function recycleBlockingReason(
  item: Pick<
    InventoryItem,
    'id' | 'location' | 'definitionId' | 'instanceData'
  > &
    Partial<Pick<InventoryItem, 'isFavorite'>>,
): string | null {
  if (item.isFavorite) return '请先取消收藏，再回收这件物品。';
  if (item.location === 'equipped') return '请先卸下道装。';
  const definition = findItemDefinition(item.definitionId);
  if (definition?.kind === 'material') return null;
  if (
    definition?.kind === 'seed' &&
    SeedFactsSchema.safeParse(item.instanceData).success
  )
    return null;
  if (definition?.kind === 'manual_jade' && item.instanceData === null)
    return null;
  if (
    definition?.kind === 'blueprint' &&
    definition.level &&
    item.instanceData === null
  )
    return null;
  if (definition?.kind === 'equipment') {
    const parsed = InventoryEquipmentSchema.safeParse(item.instanceData);
    if (
      parsed.success &&
      parsed.data.id === item.id &&
      isEquipmentLevel(parsed.data.equipmentLevel)
    )
      return null;
  }
  if (item.definitionId === 'consumable.v1') {
    const parsed = ConsumableFactsSchema.safeParse(item.instanceData);
    if (
      parsed.success &&
      ((parsed.data.type === '丹药' && parsed.data.spec.kind === 'pill') ||
        (parsed.data.type === '灵果' &&
          parsed.data.spec.kind === 'spirit_fruit'))
    )
      return null;
  }
  return '这里只收购材料、灵种、道装、道装图纸、功法玉简、丹药与灵果，这件物品请先留好。';
}
