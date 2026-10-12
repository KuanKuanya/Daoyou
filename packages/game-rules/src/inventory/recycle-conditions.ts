import { QUALITY_ORDER, type Quality } from '@daoyou/constants/qualities';
import { REALM_ORDER, type RealmType } from '@daoyou/constants/realms';
import { findItemDefinition } from '@daoyou/game-content/items';
import { CHARACTER_MANUALS_V1 } from '@daoyou/game-content/manuals';
import type { InventoryItem } from '@daoyou/game-domain/inventory';
import {
  ConsumableFactsSchema,
  materialFactsOf,
  SeedFactsSchema,
} from '@daoyou/game-domain/inventory';
import { getLevelRealmStage } from '@daoyou/game-domain/progression';
import { InventoryEquipmentSchema } from './equipment.js';
import { recycleBlockingReason } from './recycle.js';

export type RecycleConditions = {
  category:
    | 'all'
    | 'material'
    | 'seed'
    | 'equipment'
    | 'blueprint'
    | 'manual_jade'
    | 'pill'
    | 'fruit';
  minQuality?: Quality;
  maxQuality?: Quality;
  materialType?: string;
  maxRealm?: RealmType;
};
export function recycleConditionFacts(item: InventoryItem) {
  const definition = findItemDefinition(item.definitionId);
  let category: string | undefined = definition?.kind;
  let quality: Quality | undefined;
  let realm: RealmType | undefined;
  let materialType: string | undefined;
  if (item.definitionId === 'material.v1') {
    const facts = materialFactsOf(item.instanceData);
    quality = facts.rank;
    materialType = facts.type;
  } else if (item.definitionId === 'seed.v1')
    quality = SeedFactsSchema.parse(item.instanceData).seedSpec.plant.quality;
  else if (item.definitionId === 'consumable.v1') {
    const facts = ConsumableFactsSchema.parse(item.instanceData);
    quality = facts.quality;
    category =
      facts.spec.kind === 'pill'
        ? 'pill'
        : facts.spec.kind === 'spirit_fruit'
          ? 'fruit'
          : undefined;
  } else if (definition?.kind === 'equipment')
    realm = getLevelRealmStage(
      InventoryEquipmentSchema.parse(item.instanceData).equipmentLevel,
    ).realm;
  else if (definition?.kind === 'blueprint' && definition.level)
    realm = getLevelRealmStage(definition.level).realm;
  else if (definition?.kind === 'manual_jade')
    realm = CHARACTER_MANUALS_V1.find(
      (manual) => manual.id === definition.manualId,
    )?.realm;
  return { category, quality, realm, materialType };
}
export function matchesRecycleConditions(
  item: InventoryItem,
  conditions: RecycleConditions,
) {
  if (recycleBlockingReason(item)) return false;
  const facts = recycleConditionFacts(item);
  if (conditions.category !== 'all' && facts.category !== conditions.category)
    return false;
  if (
    conditions.materialType &&
    (facts.category !== 'material' ||
      facts.materialType !== conditions.materialType)
  )
    return false;
  if (
    (conditions.minQuality || conditions.maxQuality) &&
    (!facts.quality ||
      (conditions.minQuality &&
        QUALITY_ORDER[facts.quality] < QUALITY_ORDER[conditions.minQuality]) ||
      (conditions.maxQuality &&
        QUALITY_ORDER[facts.quality] > QUALITY_ORDER[conditions.maxQuality]))
  )
    return false;
  if (
    conditions.maxRealm &&
    (!facts.realm ||
      REALM_ORDER[facts.realm] > REALM_ORDER[conditions.maxRealm])
  )
    return false;
  return true;
}
export function compareRecycleCandidates(a: InventoryItem, b: InventoryItem) {
  const af = recycleConditionFacts(a),
    bf = recycleConditionFacts(b);
  return (
    (af.quality
      ? QUALITY_ORDER[af.quality]
      : af.realm
        ? REALM_ORDER[af.realm]
        : 0) -
      (bf.quality
        ? QUALITY_ORDER[bf.quality]
        : bf.realm
          ? REALM_ORDER[bf.realm]
          : 0) || a.id.localeCompare(b.id)
  );
}
