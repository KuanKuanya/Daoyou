import type {
  RecycleCondition,
  RecycleSelection,
} from '@daoyou/contracts/recycle';
import { Inject, Injectable } from '@nestjs/common';
import { DRIZZLE_DATABASE } from '@server/database/database.service.js';
import type { DbClient } from '@server/lib/drizzle/db.js';
import { PlayerCommandExecutor } from '@server/player/application/state/CommandExecutors.js';
import {
  confirmBagRecycle,
  previewBagRecycle,
  previewRecycleByCondition,
} from './application/BagRecycleService.js';

/** Public inventory recycling use cases; quotations and writes keep their owner. */
@Injectable()
export class InventoryRecycleService {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly database: DbClient,
    @Inject(PlayerCommandExecutor)
    private readonly commands: PlayerCommandExecutor,
  ) {}

  preview(owner: string, selection: RecycleSelection[]) {
    return previewBagRecycle(owner, selection, this.database);
  }
  select(owner: string, conditions: RecycleCondition) {
    return this.database.transaction(
      (tx) => previewRecycleByCondition(owner, conditions, tx),
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  confirm(actor: { userId: string; cultivatorId: string }, quoteId: string) {
    return confirmBagRecycle(actor, quoteId, this.commands);
  }
}
