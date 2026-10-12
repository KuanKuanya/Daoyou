import { hasActiveCombat } from '@server/combat/application/CombatOccupancy.js';
import type { DbExecutor } from '@server/lib/drizzle/db.js';

export class BeastError extends Error {
  readonly status = 409;
}
export async function beastMutationOccupied(
  cultivatorId: string,
  executor?: DbExecutor,
): Promise<boolean> {
  return hasActiveCombat(cultivatorId, { executor });
}
export async function assertBeastIdle(
  cultivatorId: string,
  executor?: DbExecutor,
) {
  if (await beastMutationOccupied(cultivatorId, executor))
    throw new BeastError('请先结束战斗与结算，再调整灵兽');
}
