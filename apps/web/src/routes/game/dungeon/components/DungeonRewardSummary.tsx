import type { DungeonRewardEntry } from '@daoyou/game-domain/dungeon';
import { dungeonRewardItemName } from '@daoyou/game-rules/rewards/dungeon';

export function DungeonRewardSummary({
  rewards,
  title,
}: {
  rewards: DungeonRewardEntry[];
  title: string;
}) {
  const experience = rewards.reduce(
    (sum, reward) => sum + reward.experience,
    0,
  );
  const spiritStones = rewards.reduce(
    (sum, reward) => sum + reward.spiritStones,
    0,
  );
  const items = rewards.flatMap((reward) => reward.items);

  return (
    <div className="space-y-2 text-sm">
      <p className="font-medium">{title}</p>
      <dl className="grid grid-cols-2 gap-3">
        <div>
          <dt className="text-ink-secondary">修为</dt>
          <dd className="font-mono font-semibold tracking-tight">
            +{experience.toLocaleString()}
          </dd>
        </div>
        <div>
          <dt className="text-ink-secondary">灵石</dt>
          <dd className="font-mono font-semibold tracking-tight">
            +{spiritStones.toLocaleString()}
          </dd>
        </div>
      </dl>
      <p className="text-ink-secondary leading-6">
        {items.length
          ? items
              .map((item) => `${dungeonRewardItemName(item)} ×${item.quantity}`)
              .join('、')
          : '暂未获得物品'}
      </p>
    </div>
  );
}
