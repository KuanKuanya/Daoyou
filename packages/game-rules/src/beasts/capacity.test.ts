import type { InventoryItem } from '@daoyou/game-domain/inventory';
import { describe, expect, it } from 'vitest';
import {
  beastCapacityAt,
  selectBeastExpansionMaterials,
  validateBeastExpansionMaterials,
} from './capacity.js';
import { captureSkill } from './progression.js';

function material(
  id: string,
  type: 'monster' | 'ore',
  quantity: number,
  overrides: Partial<InventoryItem> = {},
): InventoryItem {
  return {
    id,
    definitionId: 'material.v1',
    quantity,
    location: 'bag',
    slotIndex: 0,
    instanceData: {
      name: id,
      type,
      rank: '凡品',
      element: null,
      description: '',
    },
    stackKey: id,
    isFavorite: false,
    revision: 0,
    ...overrides,
  };
}

describe('beast capacity expansion', () => {
  it('keeps initial capacity and resolves all paid stages without affecting carry slots', () => {
    expect([0, 1, 2, 3, 4].map(beastCapacityAt)).toEqual([24, 40, 60, 80, 100]);
    for (const invalid of [-1, 1.5, 5, NaN])
      expect(() => beastCapacityAt(invalid)).toThrow();
    expect(captureSkill([], 30, 24, 40).capture?.capacity).toBe(16);
    expect(captureSkill([], 30, 41, 40).capture?.capacity).toBe(0);
    expect(captureSkill([], 30, 24).capture?.capacity).toBe(0);
  });
  it('selects exact ranks from bag/storage and excludes favorite or equipped rows', () => {
    const monster = material('monster', 'monster', 500);
    const ore = material('ore', 'ore', 7, {
      location: 'storage',
      slotIndex: null,
    });
    const favorite = material('favorite', 'monster', 2, { isFavorite: true });
    const higherRank = material('higher', 'monster', 2, {
      instanceData: {
        name: 'higher',
        type: 'monster',
        rank: '灵品',
        element: null,
        description: '',
      },
    });
    const selected = selectBeastExpansionMaterials(0, [
      favorite,
      higherRank,
      monster,
      ore,
    ]);
    expect(
      selected.materials.map(({ item, quantity }) => [item.id, quantity]),
    ).toEqual([
      ['monster', 2],
      ['ore', 2],
    ]);
    expect(selected.missing).toEqual({ monster: 0, ore: 0 });
    expect(() =>
      validateBeastExpansionMaterials(0, selected.materials),
    ).not.toThrow();
    expect(monster.quantity).toBe(500);
    expect(ore.quantity).toBe(7);
    expect(selectBeastExpansionMaterials(4, [monster]).materials).toEqual([]);
  });
  it('rejects shortages, favorites, duplicate references, overpayment and wrong rank', () => {
    const monster = material('monster', 'monster', 10);
    const ore = material('ore', 'ore', 10);
    const valid = [
      { item: monster, quantity: 2 },
      { item: ore, quantity: 2 },
    ];
    for (const selection of [
      [{ item: monster, quantity: 1 }, valid[1]],
      [{ item: { ...monster, isFavorite: true }, quantity: 2 }, valid[1]],
      [valid[0], valid[0], valid[1]],
      [{ item: monster, quantity: 3 }, valid[1]],
      [{ item: monster, quantity: 11 }, valid[1]],
      [
        { item: { ...monster, location: 'equipped' as const }, quantity: 2 },
        valid[1],
      ],
    ])
      expect(() => validateBeastExpansionMaterials(0, selection)).toThrow();
    expect(() => validateBeastExpansionMaterials(1, valid)).toThrow();
    expect(() => validateBeastExpansionMaterials(4, valid)).toThrow();
  });
});
