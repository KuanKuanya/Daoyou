import { REALM_ORDER, type RealmType } from '@daoyou/constants/realms';
import type { InventoryItem } from '@daoyou/game-domain/inventory';
import { getLevelRealmStage } from '@daoyou/game-domain/progression';
import { InventoryEquipmentSchema } from './equipment.js';
import { itemDefinition } from './index.js';

/** Only explicitly supported cleanup rules select assets; favorites always stay. */
export function planAutoStore(
  items: readonly InventoryItem[],
  realm: RealmType,
  rules: { materialsToStorage: boolean; lowRealmEquipmentToStorage: boolean },
) {
  return items.filter((item) => {
    if (item.location !== 'bag' || item.isFavorite) return false;
    const kind = itemDefinition(item.definitionId).kind;
    if (kind === 'material') return rules.materialsToStorage;
    if (kind !== 'equipment' || !rules.lowRealmEquipmentToStorage) return false;
    const equipment = InventoryEquipmentSchema.parse(item.instanceData);
    return (
      REALM_ORDER[getLevelRealmStage(equipment.equipmentLevel).realm] <
      REALM_ORDER[realm]
    );
  });
}
