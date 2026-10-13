import type { MailAttachment } from '@daoyou/game-domain/mail';
import {
  BEAST_BAG_CAPACITY,
  carriedBeastIds,
} from '@daoyou/game-rules/beasts/growth';
import {
  BeastTransferSchema,
  planBeastMailClaims,
  receiveTradedBeast,
} from '@daoyou/game-rules/beasts/trade';
import {
  assertBeastIdle,
  BeastError,
  beastMutationOccupied,
} from '@server/combat/application/BeastMutationGuard.js';
import type { DbTransaction } from '@server/lib/drizzle/db.js';
import { cultivatorBeasts } from '@server/lib/drizzle/schema.js';
import {
  beastIndividualData,
  readBeastRoster,
  saveBeastLineup,
} from '@server/lib/repositories/combatV6BeastRepository.js';

function beastTransfers(attachments: MailAttachment[]) {
  return attachments
    .filter((a) => a.type === 'beast_v1')
    .map((a) => {
      if (a.quantity !== 1) throw new Error('灵兽附件数量无效');
      return BeastTransferSchema.parse(a.beast);
    });
}
async function freeSlots(owner: string, tx: DbTransaction) {
  const roster = await readBeastRoster(owner, tx);
  return Math.max(
    0,
    BEAST_BAG_CAPACITY + roster.warehouseCapacity - roster.beasts.length,
  );
}

/** Called while the owning player command holds the character lock and transaction. */
export async function deliverMailBeasts(
  owner: string,
  attachments: MailAttachment[],
  tx: DbTransaction,
) {
  const transfers = beastTransfers(attachments);
  if (!transfers.length) return [];
  await assertBeastIdle(owner, tx);
  const roster = await readBeastRoster(owner, tx);
  if (
    transfers.length >
    BEAST_BAG_CAPACITY + roster.warehouseCapacity - roster.beasts.length
  )
    throw new BeastError(
      '灵兽袋与仓库空位不足，请腾出位置后再领取；附件仍会保留',
    );
  const carried = carriedBeastIds(roster.beasts, roster.lineup);
  const beforeBagCount = carried.length;
  // Mail uses free bag slots first, then warehouse slots, without changing the lead.
  for (const transfer of transfers) {
    const beast = receiveTradedBeast(transfer, owner);
    await tx.insert(cultivatorBeasts).values({
      id: beast.id,
      cultivatorId: owner,
      individual: beastIndividualData(beast),
      createdAt: new Date(transfer.createdAt),
    });
    if (carried.length < BEAST_BAG_CAPACITY) carried.push(beast.id);
  }
  if (carried.length !== beforeBagCount)
    await saveBeastLineup(
      owner,
      {
        carriedBeastIds: carried,
        leadBeastId: roster.lineup.leadBeastId,
        revision: roster.lineup.revision + 1,
      },
      tx,
    );
  return ['beasts'];
}

export async function selectClaimableBeastMails<
  T extends { id: string; createdAt: Date; attachments: unknown },
>(owner: string, mails: T[], tx: DbTransaction) {
  const candidates = mails.map((mail) => ({
    ...mail,
    beastCount: beastTransfers((mail.attachments ?? []) as MailAttachment[])
      .length,
  }));
  const hasBeasts = candidates.some((m) => m.beastCount > 0);
  return planBeastMailClaims(
    candidates,
    hasBeasts ? await freeSlots(owner, tx) : 0,
    hasBeasts && (await beastMutationOccupied(owner, tx)),
  );
}
