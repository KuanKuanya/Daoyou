import { BOOKS } from '@daoyou/game-content/items/beasts';
import type { InventoryItem } from '@daoyou/game-domain/inventory';
import { describe, expect, it } from 'vitest';
import { addItems, compactStorage, sameStack, sortBag } from './index.js';

const definitionId = BOOKS[0].id;
const stackKey = `definition.v1:${definitionId}`;
function stack(
  id: string,
  quantity: number,
  isFavorite: boolean,
): InventoryItem {
  return {
    id,
    quantity,
    isFavorite,
    definitionId,
    stackKey,
    location: 'storage',
    slotIndex: null,
    instanceData: null,
    revision: 0,
  };
}

describe('收藏堆栈保护', () => {
  it('新奖励不会补进收藏堆，普通目标仍可补满', () => {
    const before = [stack('favorite', 80, true), stack('ordinary', 98, false)];
    const after = addItems(
      before,
      { definitionId, quantity: 4 },
      'storage',
      false,
      () => 'new',
      stackKey,
    );
    expect(
      after.map(({ id, quantity, isFavorite }) => ({
        id,
        quantity,
        isFavorite,
      })),
    ).toEqual([
      { id: 'favorite', quantity: 80, isFavorite: true },
      { id: 'ordinary', quantity: 99, isFavorite: false },
      { id: 'new', quantity: 3, isFavorite: false },
    ]);
    expect(before.map((item) => item.quantity)).toEqual([80, 98]);
  });

  it('仓库整理只合并相同收藏状态，保持总量和两类保护事实', () => {
    const before = [
      stack('f1', 80, true),
      stack('n1', 80, false),
      stack('f2', 30, true),
      stack('n2', 30, false),
    ];
    expect(sameStack(before[0], before[1])).toBe(false);
    const after = compactStorage(before);
    for (const isFavorite of [false, true]) {
      expect(
        after
          .filter((item) => item.isFavorite === isFavorite)
          .map((item) => item.quantity),
      ).toEqual([99, 11]);
    }
    expect(after.reduce((sum, item) => sum + item.quantity, 0)).toBe(220);
  });

  it('手动转存的收藏余项继承标记，不进入普通堆', () => {
    const after = addItems(
      [stack('ordinary', 80, false), stack('favorite', 98, true)],
      { definitionId, quantity: 4 },
      'storage',
      false,
      () => 'source',
      stackKey,
      [],
      true,
    );
    expect(
      after.map(({ id, quantity, isFavorite }) => ({
        id,
        quantity,
        isFavorite,
      })),
    ).toEqual([
      { id: 'ordinary', quantity: 80, isFavorite: false },
      { id: 'favorite', quantity: 99, isFavorite: true },
      { id: 'source', quantity: 3, isFavorite: true },
    ]);
  });

  it('背包合堆排格仍保持收藏与普通物品隔离', () => {
    const before = [
      stack('f1', 10, true),
      stack('n1', 10, false),
      stack('f2', 10, true),
    ].map((item, index) => ({
      ...item,
      location: 'bag' as const,
      slotIndex: index + 5,
    }));
    const after = sortBag(before);
    expect(after.map((item) => item.slotIndex)).toEqual([0, 1]);
    expect(after.find((item) => item.isFavorite)?.quantity).toBe(20);
    expect(after.find((item) => !item.isFavorite)?.quantity).toBe(10);
  });
});
