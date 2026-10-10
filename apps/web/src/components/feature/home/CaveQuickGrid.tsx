import { getGameSceneIcon } from '@app/components/game-shell/gameNavigation';
import { GameIcon } from '@app/components/ui/GameIcon';
import { InkButton } from '@app/components/ui/InkButton';

type CaveQuickArea = {
  label: string;
  href: string;
  icon?: string;
};

type CaveQuickGroup = {
  title: string;
  areas: CaveQuickArea[];
};

const CAVE_AREA_GROUPS: CaveQuickGroup[] = [
  {
    title: '洞府内',
    areas: [
      {
        label: '修炼室',
        icon: getGameSceneIcon('retreat'),
        href: '/game/retreat',
      },
      {
        label: '炼丹房',
        icon: getGameSceneIcon('alchemy'),
        href: '/game/craft/alchemy',
      },
      {
        label: '炼器室',
        icon: getGameSceneIcon('refine'),
        href: '/game/craft/refine',
      },
      {
        label: '悟道室',
        icon: getGameSceneIcon('enlightenment'),
        href: '/game/enlightenment',
      },
      {
        label: '阵纹室',
        icon: getGameSceneIcon('inscriptions'),
        href: '/game/inscriptions',
      },
      {
        label: '练功房',
        icon: getGameSceneIcon('training-room'),
        href: '/game/training-room',
      },
      { label: '灵眼之泉', icon: getGameSceneIcon('inn'), href: '/game/inn' },
      {
        label: '储藏室',
        icon: getGameSceneIcon('storage'),
        href: '/game/cave/storage/new?location=storage',
      },
      {
        label: '灵田',
        icon: getGameSceneIcon('spirit-field'),
        href: '/game/spirit-field',
      },
      {
        label: '育兽室',
        icon: getGameSceneIcon('beast-room'),
        href: '/game/beast-room',
      },
    ],
  },
  {
    title: '出洞府',
    areas: [
      {
        label: '外出云游',
        icon: getGameSceneIcon('dungeon'),
        href: '/game/dungeon',
      },
      {
        label: '坊市',
        icon: getGameSceneIcon('market'),
        href: '/game/map-v2?intent=market',
      },
      {
        label: '蜃楼幻境',
        icon: getGameSceneIcon('tower'),
        href: '/game/tower',
      },
      {
        label: '拍卖行',
        icon: getGameSceneIcon('auction'),
        href: '/game/auction',
      },
      {
        label: '组队讨伐',
        icon: getGameSceneIcon('hunt-team'),
        href: '/game/hunt-team',
      },
    ],
  },
];

export function CaveQuickGrid() {
  return (
    <div className="space-y-3">
      {CAVE_AREA_GROUPS.map((group) => (
        <section
          key={group.title}
          data-guide={
            group.title === '洞府内'
              ? 'cave.inside'
              : group.title === '出洞府'
                ? 'cave.out'
                : undefined
          }
          className="space-y-1.5"
        >
          <div className="text-battle-muted text-[0.68rem] tracking-[0.18em]">
            {group.title}
          </div>
          <div className="flex flex-wrap gap-x-1 gap-y-0.5">
            {group.areas.map((area) => (
              <span
                key={area.href}
                data-guide={
                  area.href === '/game/inn' ? 'cave.spring' : undefined
                }
                className="inline-flex"
              >
                <InkButton href={area.href}>
                  {area.icon && <GameIcon value={area.icon} className="mr-1" />}
                  {area.label}
                </InkButton>
              </span>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
