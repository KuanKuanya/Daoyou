import { InkButton } from '@app/components/ui/InkButton';
import { InkCard } from '@app/components/ui/InkCard';
import { InkNotice } from '@app/components/ui/InkNotice';
import type { RealmType } from '@daoyou/constants/realms';
import { MapNodeInfo } from '@daoyou/game-domain/world/map';
import { dungeonReadiness } from '@daoyou/game-rules/dungeon';
import { MapNodeCard } from '../MapNodeCard';
type NoviceDungeonReadiness = ReturnType<typeof dungeonReadiness>;

interface DungeonMapSelectorProps {
  selectedNode: MapNodeInfo | null;
  onStart: (nodeId: string) => Promise<void>;
  isStarting: boolean;
  readiness: NoviceDungeonReadiness | null;
  realmBlockReason?: string | null;
  playerRealm?: RealmType;
}

/**
 * 副本地图选择组件
 * 显示地图信息并提供启动按钮
 */
export function DungeonMapSelector({
  selectedNode,
  onStart,
  isStarting,
  readiness,
  realmBlockReason,
  playerRealm,
}: DungeonMapSelectorProps) {
  if (!selectedNode) {
    return (
      <InkCard className="p-8 text-center">
        <p className="text-ink-secondary">
          选择秘境历练，积累修为、灵石，寻获材料等物品。离开时统一结算。
        </p>
        <InkButton href="/game/map-v2" variant="primary" className="mt-4">
          前往地图
        </InkButton>
      </InkCard>
    );
  }

  return (
    <div className="space-y-4">
      <MapNodeCard node={selectedNode} playerRealm={playerRealm} />
      <p className="text-ink-secondary text-sm leading-6">
        探索与遭遇战胜利可积累修为、灵石，并有机会获得材料等物品；离开时统一结算。
      </p>
      {realmBlockReason ? (
        <InkNotice tone="warning">{realmBlockReason}</InkNotice>
      ) : null}
      {readiness?.shouldBlock ? (
        <InkNotice tone="warning">
          {readiness.reasons[0] ?? '首次探秘前还需准备。'}
        </InkNotice>
      ) : null}
      <div className="flex justify-center gap-4">
        <InkButton href="/game/map-v2" disabled={isStarting}>
          重新选择
        </InkButton>
        <InkButton
          variant="primary"
          onClick={() => onStart(selectedNode.id)}
          disabled={Boolean(realmBlockReason) || readiness?.shouldBlock}
          pending={isStarting}
          pendingLabel="启动中……"
        >
          {realmBlockReason
            ? '境界不足'
            : readiness?.shouldBlock
              ? '准备未足'
              : '开始探索'}
        </InkButton>
      </div>
    </div>
  );
}
