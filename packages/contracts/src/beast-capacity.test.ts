import { expect, it } from 'vitest';
import { BeastCapacityExpandSchema } from './combatV6Beasts.js';

it('validates bounded capacity, spending budget and immutable material references', () => {
  const payload = {
    requestId: '9c4f6c53-7afd-4d06-9f91-271130c09ca1',
    expectedCapacityLevel: 0,
    expectedCapacityRevision: 0,
    recipeVersion: 1,
    maxSpiritStones: 1000,
    materials: [{ id: 'material-a', expectedRevision: 5, quantity: 2 }],
  };
  expect(BeastCapacityExpandSchema.safeParse(payload).success).toBe(true);
  for (const invalid of [
    { ...payload, expectedCapacityLevel: 4 },
    { ...payload, maxSpiritStones: -1 },
    { ...payload, capacity: 100 },
    { ...payload, materials: [payload.materials[0], payload.materials[0]] },
    { ...payload, materials: [{ ...payload.materials[0], quantity: 13 }] },
    { ...payload, materials: [] },
  ])
    expect(BeastCapacityExpandSchema.safeParse(invalid).success).toBe(false);
});
