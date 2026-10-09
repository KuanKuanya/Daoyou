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
        icon: 'icon:beast-skill-meditation',
        href: '/game/retreat',
      },
      { label: '炼丹房', icon: 'icon:ui-elixir', href: '/game/craft/alchemy' },
      {
        label: '炼器室',
        icon: 'icon:earthfire-furnace',
        href: '/game/craft/refine',
      },
      { label: '悟道室', icon: 'icon:ui-scroll', href: '/game/enlightenment' },
      { label: '阵纹室', icon: 'icon:ui-compass', href: '/game/inscriptions' },
      {
        label: '练功房',
        icon: 'icon:beast-skill-strength',
        href: '/game/training-room',
      },
      { label: '灵眼之泉', icon: 'icon:ui-spirit-water', href: '/game/inn' },
      {
        label: '储藏室',
        icon: 'icon:ui-treasure-chest',
        href: '/game/cave/storage/new?location=storage',
      },
      {
        label: '灵田',
        icon: 'icon:ui-spirit-herb',
        href: '/game/spirit-field',
      },
      {
        label: '育兽室',
        icon: 'icon:beast-nether-tiger',
        href: '/game/beast-room',
      },
    ],
  },
  {
    title: '旧入口',
    areas: [
      {
        label: '旧藏宝库',
        icon: 'icon:ui-treasure-chest',
        href: '/game/cave/storage',
      },
      {
        label: '旧功法传承',
        icon: 'icon:ui-scroll',
        href: '/game/manual-migration',
      },
      {
        label: '旧法宝焕新',
        icon: 'icon:beast-skill-mountain-breaker',
        href: '/game/artifact-migration',
      },
    ],
  },
  {
    title: '出洞府',
    areas: [
      { label: '外出云游', icon: 'icon:map-landmark', href: '/game/dungeon' },
      {
        label: '坊市',
        icon: 'icon:map-market',
        href: '/game/map-v2?intent=market',
      },
      { label: '蜃楼幻境', icon: 'icon:ui-mirror', href: '/game/tower' },
      {
        label: '拍卖行',
        icon: 'icon:beast-skill-mountain-breaker',
        href: '/game/auction',
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
