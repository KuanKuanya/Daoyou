import { describe, expect, it } from 'vitest';
import { DomainEventDataSchemas } from './events.js';
const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const CULTIVATOR_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '55555555-5555-4555-8555-555555555555';
describe('domain event payloads', () => {
  it('preserves an old-week tower reach time for delayed projection and rejects invalid actor fields', () => {
    const data = {
      cultivatorId: CULTIVATOR_ID,
      seasonKey: '2026-W40@Asia/Shanghai',
      seasonEndAt: '2026-10-04T16:00:00.000Z',
      recordedRealm: '金丹',
      highestFloor: 5,
      firstReachedAt: '2026-10-04T15:59:59.000Z',
    };
    const schema = DomainEventDataSchemas['tower.floor.cleared'];
    expect(schema.parse(data)).toEqual(data);
    expect(schema.safeParse({ ...data, highestFloor: 0 }).success).toBe(false);
    expect(schema.safeParse({ ...data, highestFloor: 1.5 }).success).toBe(false);
    expect(schema.safeParse({ ...data, firstReachedAt: 'invalid' }).success).toBe(
      false,
    );
    expect(schema.safeParse({ ...data, status: 'active' }).success).toBe(false);
  });
  it('accepts frozen yield rewards and rejects extra items or stacked quantities', () => {
    const data = {
      cultivatorId: CULTIVATOR_ID,
      actionInstanceId: EVENT_ID,
      realm: '炼气',
      materialCount: 1,
      rewardSnapshot: {
        poolId: 'yield',
        poolVersion: 1,
        items: [{ definitionId: 'blueprint.head.10', quantity: 1 }],
      },
    };
    const schema = DomainEventDataSchemas['yield.claimed'];
    expect(schema.parse(data)).toEqual(data);
    expect(schema.safeParse({ ...data, materialCount: 2 }).success).toBe(false);
    expect(
      schema.safeParse({
        ...data,
        rewardSnapshot: {
          ...data.rewardSnapshot,
          items: [{ definitionId: 'blueprint.head.10', quantity: 2 }],
        },
      }).success,
    ).toBe(false);
  });
});
