import type { BlackMarketNpcId } from '@daoyou/game-domain/black-market';

export const BLACK_MARKET_NPC_ARTWORK = {
  'smiling-keeper': 'icon:npc-smiling-keeper',
  'silent-elder': 'icon:npc-silent-elder',
  'urgent-cultivator': 'icon:npc-urgent-cultivator',
} as const satisfies Record<BlackMarketNpcId, string>;
