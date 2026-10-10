import {
  QUALITY_ORDER,
  QUALITY_VALUES,
  type Quality,
} from '@daoyou/constants/qualities';
import { type RealmType } from '@daoyou/constants/realms';
import { getFallbackMaterialPreset } from '@daoyou/game-content/materials';
import type { Material } from '@daoyou/game-domain/character';
import {
  MATERIAL_TYPE_VALUES,
  type MaterialType,
} from '@daoyou/game-domain/inventory';
import { YieldCalculator } from '@daoyou/game-rules/yield';
import {
  materialLibraryEntryToMaterial,
  sampleMaterialLibraryEntryByPreferences,
} from '@server/admin/application/MaterialLibraryService.js';
import type { DbExecutor } from '@server/lib/drizzle/db.js';
import { MaterialGenerator } from '@server/lib/generation/MaterialGenerator.js';
import { computeItemLibrarySampleKey } from '@server/lib/utils/itemLibrarySampleKey.js';

function createDeterministicRng(seed: string): () => number {
  let index = 0;
  return () => computeItemLibrarySampleKey(`${seed}:${index++}`);
}

function buildMaterialTypePreferences(
  target: MaterialType,
  seed: string,
): MaterialType[] {
  return [
    target,
    ...MATERIAL_TYPE_VALUES.filter((type) => type !== target).sort(
      (left, right) =>
        computeItemLibrarySampleKey(`${seed}:${left}`) -
        computeItemLibrarySampleKey(`${seed}:${right}`),
    ),
  ];
}

function buildQualityPreferences(target: Quality): Quality[] {
  return [...QUALITY_VALUES].sort((left, right) => {
    const distance =
      Math.abs(QUALITY_ORDER[left] - QUALITY_ORDER[target]) -
      Math.abs(QUALITY_ORDER[right] - QUALITY_ORDER[target]);
    return distance || QUALITY_ORDER[left] - QUALITY_ORDER[right];
  });
}

export async function generateRealmMaterials(
  realm: RealmType,
  count: number,
  seed: string,
  unitQuantity = false,
  executor?: DbExecutor,
  qualityChanceMap?: Record<Quality, number>,
  preserveQuality = false,
): Promise<Material[]> {
  const chanceMap =
    qualityChanceMap ?? YieldCalculator.getMaterialQualityChanceMap(realm);
  const skeletons = MaterialGenerator.generateRandomSkeletons(
    count,
    {
      qualityChanceMap: chanceMap,
    },
    createDeterministicRng(`${seed}-plan`),
  );

  const materials: Material[] = [];
  const selectedItemIds = new Set<string>();
  for (const [index, skeleton] of skeletons.entries()) {
    const materialSeed = `${seed}:${index}`;
    const request = {
      materialTypes: buildMaterialTypePreferences(skeleton.type, materialSeed),
      qualities: preserveQuality
        ? [skeleton.rank]
        : buildQualityPreferences(skeleton.rank).filter(
            (quality) => !qualityChanceMap || qualityChanceMap[quality] > 0,
          ),
      seed: materialSeed,
    };
    let entry = await sampleMaterialLibraryEntryByPreferences(
      {
        ...request,
        excludeItemIds: selectedItemIds,
      },
      executor,
    );
    if (!entry) {
      entry = await sampleMaterialLibraryEntryByPreferences(request, executor);
    }
    if (!entry) {
      // The library is an optional content source for rewards. Keep the
      // settlement path available when an environment has not been seeded
      // yet (or a particular quality/type is temporarily empty), using the
      // same deterministic skeleton facts and the built-in content preset.
      const fallback = getFallbackMaterialPreset(skeleton.type, skeleton.rank);
      materials.push({
        name: fallback.name,
        type: skeleton.type,
        rank: skeleton.rank,
        element: skeleton.forcedElement ?? fallback.element,
        description: fallback.description,
        details: {},
        quantity: unitQuantity ? 1 : skeleton.quantity,
      });
      continue;
    }

    selectedItemIds.add(entry.itemId);
    const material = {
      ...materialLibraryEntryToMaterial(entry),
      quantity: unitQuantity ? 1 : skeleton.quantity,
    };
    materials.push(material);
  }
  return materials;
}
