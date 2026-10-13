import type { InventoryItem } from '@daoyou/game-domain/inventory';
import { describe, expect, it } from 'vitest';
import {
  beastWarehouseCapacityAt,
  selectBeastExpansionMaterials,
  validateBeastExpansionMaterials,
} from './capacity.js';
import {
  BEAST_BAG_CAPACITY,
  captureSkill,
  receivedBeastPlacement,
} from './progression.js';

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
  it('expands warehouse capacity without increasing capture room in the carried bag', () => {
    expect([0, 1, 2, 3, 4].map(beastWarehouseCapacityAt)).toEqual([
      50, 70, 90, 120, 160,
    ]);
    for (const invalid of [-1, 1.5, 5, NaN])
      expect(() => beastWarehouseCapacityAt(invalid)).toThrow();
    const totalCapacity = BEAST_BAG_CAPACITY + beastWarehouseCapacityAt(1);
    expect(captureSkill([], 30, 77, totalCapacity, 7).capture?.capacity).toBe(
      1,
    );
    expect(captureSkill([], 30, 78, totalCapacity, 7).capture?.capacity).toBe(
      0,
    );
    expect(captureSkill([], 30, 8, totalCapacity, 8).capture?.capacity).toBe(0);
    expect(captureSkill([], 30, 7, totalCapacity, 7).capture?.capacity).toBe(1);
  });
  it('receives into the expanded warehouse and frees fusion parents before placement', () => {
    const bag = Array.from({ length: BEAST_BAG_CAPACITY }, (_, i) => ({
      id: `bag-${i}`,
    }));
    const stored = Array.from({ length: 70 }, (_, i) => ({
      id: `stored-${i}`,
    }));
    const lineup = { carriedBeastIds: bag.map((beast) => beast.id) };
    const beasts = [...bag, ...stored];
    expect(receivedBeastPlacement(beasts.slice(0, -1), lineup, [], 70)).toBe(
      'warehouse',
    );
    expect(receivedBeastPlacement(beasts, lineup, [], 70)).toBeNull();
    expect(
      receivedBeastPlacement(beasts, lineup, ['stored-0', 'stored-1'], 70),
    ).toBe('warehouse');
    expect(
      receivedBeastPlacement(beasts, lineup, ['bag-0', 'stored-0'], 70),
    ).toBe('bag');
    expect(receivedBeastPlacement(beasts, lineup, [], 90)).toBe('warehouse');
    expect(beasts).toHaveLength(78);
    expect(lineup.carriedBeastIds).toHaveLength(8);
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
