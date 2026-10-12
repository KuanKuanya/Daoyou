import type { InventoryItem } from '@daoyou/game-domain/inventory';
import { expect, it } from 'vitest';
import { generateForgedEquipment } from '../equipment/forging.js';
import { sortBag } from './index.js';
import { planAutoStore } from './management.js';
import {
  compareRecycleCandidates,
  matchesRecycleConditions,
} from './recycle-conditions.js';

function material(
  id: string,
  rank = '凡品',
  isFavorite = false,
): InventoryItem {
  return {
    id,
    definitionId: 'material.v1',
    location: 'bag',
    slotIndex: 0,
    quantity: 500,
    instanceData: { name: '试用矿石', rank, type: 'ore' },
    stackKey: rank,
    isFavorite,
    revision: 0,
  };
}
function equipment(id: string, equipmentLevel: 10 | 30 | 50): InventoryItem {
  const generated = generateForgedEquipment({
    id,
    createdAt: '2026-10-12T00:00:00Z',
    seed: 42,
    templateId: 'dao_equipment.standard.weapon.v1',
    equipmentLevel,
    boosts: { ore: 1, essence: 0, attributes: 0 },
  });
  if (!generated.ok) throw new Error('equipment fixture');
  return {
    id,
    definitionId: 'equipment.v6',
    location: 'bag',
    slotIndex: 1,
    quantity: 1,
    instanceData: generated.instance,
    stackKey: null,
    isFavorite: false,
    revision: 0,
  };
}
it('归仓保留收藏、同大境界道装与穿戴物品，低境界整堆入库', () => {
  const low = equipment('low', 30),
    same = equipment('same', 50);
  const items = [
    material('ordinary'),
    material('favorite', '凡品', true),
    low,
    same,
    {
      ...equipment('equipped', 10),
      location: 'equipped' as const,
      slotIndex: null,
    },
  ];
  expect(
    planAutoStore(items, '金丹', {
      materialsToStorage: true,
      lowRealmEquipmentToStorage: true,
    }).map((item) => item.id),
  ).toEqual(['ordinary', 'low']);
  expect(
    planAutoStore(items, '金丹', {
      materialsToStorage: false,
      lowRealmEquipmentToStorage: false,
    }),
  ).toEqual([]);
  expect(items[0].quantity).toBe(500);
});
it('回收条件排除收藏和未知品质，器阶按真实大境界判断', () => {
  const blade = equipment('blade', 30);
  expect(
    matchesRecycleConditions(material('favorite', '凡品', true), {
      category: 'material',
    }),
  ).toBe(false);
  expect(
    matchesRecycleConditions(blade, {
      category: 'equipment',
      maxQuality: '玄品',
    }),
  ).toBe(false);
  expect(
    matchesRecycleConditions(blade, {
      category: 'equipment',
      maxRealm: '筑基',
    }),
  ).toBe(true);
  expect(
    matchesRecycleConditions(blade, {
      category: 'equipment',
      maxRealm: '炼气',
    }),
  ).toBe(false);
});
it('条件选取顺序由品质和稳定 id决定，与扫描顺序无关', () => {
  const items = [material('z', '灵品'), material('b'), material('a')];
  expect(items.sort(compareRecycleCandidates).map((item) => item.id)).toEqual([
    'a',
    'b',
    'z',
  ]);
});
it('背包整理按既有分类顺序排格并合并守恒', () => {
  const blade = equipment('blade', 10),
    a = material('a'),
    b = { ...material('b'), quantity: 200 };
  const after = sortBag([a, blade, b]);
  expect(after.map((item) => item.id)).toEqual(['blade', 'a']);
  expect(after.map((item) => item.slotIndex)).toEqual([0, 1]);
  expect(after.find((item) => item.id === 'a')?.quantity).toBe(700);
});
