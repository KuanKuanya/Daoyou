import type { GameSceneGroup } from '@app/lib/router/routeTitle';

export interface GameSceneNavItem {
  id: string;
  sceneLabel: string;
  href?: string;
  coreDockLabel?: string;
  expandedDockLabel?: string;
  expandedDockIcon?: string;
}

export interface GameNavGroup {
  key: GameSceneGroup;
  title: string;
  scenes: GameSceneNavItem[];
}

export interface GameSceneMeta {
  id: string;
  label: string;
  group: GameSceneGroup;
}

export interface GameDockLink {
  id: string;
  label: string;
  icon?: string;
  href: string;
}

export interface GameDockGroupLinks {
  key: GameSceneGroup;
  title: string;
  actions: GameDockLink[];
}

const coreDockSceneOrder = ['cultivator', 'inventory', 'cave', 'mail'] as const;

export const gameDockGroups: GameNavGroup[] = [
  {
    key: 'cultivation',
    title: '修行',
    scenes: [
      {
        id: 'cave',
        sceneLabel: '洞府',
        href: '/game',
        coreDockLabel: '洞府',
      },
      {
        id: 'storage',
        sceneLabel: '洞府储藏室',
        href: '/game/cave/storage/new?location=storage',
      },
      {
        id: 'legacy-storage',
        sceneLabel: '洞府宝库',
        href: '/game/cave/storage',
      },
      {
        id: 'cultivator',
        sceneLabel: '道身',
        href: '/game/cultivator',
        coreDockLabel: '角色',
      },
      {
        id: 'cultivator-attributes',
        sceneLabel: '根基属性',
      },
      {
        id: 'body-cultivation',
        sceneLabel: '肉身炼体',
      },
      {
        id: 'marrow-wash',
        sceneLabel: '洗髓池',
      },
      {
        id: 'retreat',
        sceneLabel: '修炼室',
        href: '/game/retreat',
      },
      {
        id: 'divination',
        sceneLabel: '每日占卜',
        href: '/game/divination',
        expandedDockLabel: '每日占卜',
        expandedDockIcon: 'icon:ui-divination',
      },
      {
        id: 'inn',
        sceneLabel: '灵眼之泉',
        href: '/game/inn',
      },
      {
        id: 'spirit-field',
        sceneLabel: '洞府灵田',
        href: '/game/spirit-field',
        expandedDockLabel: '洞府灵田',
        expandedDockIcon: 'icon:ui-spirit-herb',
      },
      {
        id: 'enlightenment',
        sceneLabel: '悟道室',
        href: '/game/enlightenment',
        expandedDockLabel: '悟道室',
        expandedDockIcon: 'icon:ui-scroll',
      },
      {
        id: 'inscriptions',
        sceneLabel: '阵纹室',
        href: '/game/inscriptions',
        expandedDockLabel: '阵纹室',
        expandedDockIcon: 'icon:ui-compass',
      },
      {
        id: 'artifact-migration',
        sceneLabel: '旧法宝焕新',
        href: '/game/artifact-migration',
      },
      {
        id: 'manual-migration',
        sceneLabel: '旧功法传承',
        href: '/game/manual-migration',
      },
      {
        id: 'sect-abilities',
        sceneLabel: '宗门演武',
        href: '/game/sect/arena?workspace=loadout&npc=instructor',
        expandedDockLabel: '宗门神通',
        expandedDockIcon: 'icon:ui-scroll',
      },
      {
        id: 'sect',
        sceneLabel: '宗门',
        href: '/game/sect',
        expandedDockLabel: '宗门',
        expandedDockIcon: 'icon:map-landmark',
      },
      { id: 'sect-onboarding', sceneLabel: '诸宗山门' },
      { id: 'story', sceneLabel: '入世' },
      { id: 'story-preview', sceneLabel: '看演出' },
      { id: 'sect-transfer', sceneLabel: '欺天台 · 转宗' },
      { id: 'identity-reshape', sceneLabel: '改天换地' },
      { id: 'sect-visit', sceneLabel: '访宗舆图' },
      { id: 'sect-foreign-gate', sceneLabel: '外宗山门' },
      { id: 'sect-hall', sceneLabel: '宗门大殿' },
      { id: 'sect-affairs', sceneLabel: '宗门事务' },
      { id: 'sect-archive', sceneLabel: '宗门传承' },
      { id: 'sect-enlightenment-cliff', sceneLabel: '宗门悟道' },
      { id: 'sect-treasury', sceneLabel: '宗门宝库' },
      { id: 'sect-industries', sceneLabel: '宗门建设' },
      { id: 'sect-cultivation-room', sceneLabel: '宗门修炼室' },
      { id: 'sect-alchemy', sceneLabel: '宗门丹房' },
      { id: 'sect-refinery', sceneLabel: '宗门器坊' },
      { id: 'sect-spirit-vein', sceneLabel: '宗门灵脉' },
      { id: 'sect-herb-garden', sceneLabel: '宗门药田' },
      { id: 'sect-cave', sceneLabel: '弟子居所' },
      { id: 'sect-gate', sceneLabel: '宗门山门' },
      { id: 'sect-gate-sweep', sceneLabel: '清扫山门' },
      { id: 'sect-spirit-vein-mining', sceneLabel: '灵矿采掘' },
      { id: 'sect-task-battle', sceneLabel: '宗门战局' },
      {
        id: 'training-room',
        sceneLabel: '练功房',
        href: '/game/training-room',
      },
      { id: 'wild', sceneLabel: '野外寻觅', href: '/game/map-v2' },
      {
        id: 'beast-room',
        sceneLabel: '育兽室',
        href: '/game/beast-room',
      },
      {
        id: 'beasts',
        sceneLabel: '灵兽袋',
        href: '/game/beasts',
        expandedDockLabel: '灵兽袋',
        expandedDockIcon: 'icon:beast-nether-tiger',
      },
      {
        id: 'beast-fusion',
        sceneLabel: '灵兽融合',
        href: '/game/beasts/fusion',
      },
      { id: 'beast-codex', sceneLabel: '灵兽图鉴', href: '/game/beasts/codex' },
      {
        id: 'inventory',
        sceneLabel: '储物袋',
        href: '/game/inventory',
        coreDockLabel: '储物袋',
      },
      {
        id: 'battle-history',
        sceneLabel: '全部战绩',
        href: '/game/battle/history',
        expandedDockLabel: '全部战绩',
        expandedDockIcon: 'icon:ui-sword',
      },
      {
        id: 'journal',
        sceneLabel: '修仙日志',
        href: '/game/journal',
        expandedDockLabel: '修仙日志',
        expandedDockIcon: 'icon:ui-scroll',
      },
      {
        id: 'dungeon-history',
        sceneLabel: '探险札记',
        href: '/game/dungeon/history',
        expandedDockLabel: '探险札记',
        expandedDockIcon: 'icon:ui-scroll',
      },
      {
        id: 'gongfa-enlightenment',
        sceneLabel: '功法参悟',
      },
    ],
  },
  {
    key: 'craft',
    title: '造化',
    scenes: [
      {
        id: 'dungeon',
        sceneLabel: '云游探秘',
        href: '/game/dungeon',
        expandedDockLabel: '云游探秘',
        expandedDockIcon: 'icon:map-landmark',
      },
      {
        id: 'tower',
        sceneLabel: '蜃楼幻境',
        href: '/game/tower',
        expandedDockLabel: '蜃楼幻境',
        expandedDockIcon: 'icon:ui-mirror',
      },
      {
        id: 'fate-reshape',
        sceneLabel: '重塑命格',
        href: '/game/fate-reshape',
        expandedDockLabel: '重塑命格',
        expandedDockIcon: 'icon:ui-divination',
      },
      {
        id: 'tasks',
        sceneLabel: '任务中心',
        href: '/game/tasks',
        expandedDockLabel: '任务中心',
        expandedDockIcon: 'icon:ui-scroll',
      },
      {
        id: 'alchemy',
        sceneLabel: '炼丹房',
      },
      {
        id: 'refine',
        sceneLabel: '炼器室',
      },
      {
        id: 'map',
        sceneLabel: '山河舆图',
        href: '/game/map-v2',
        expandedDockLabel: '修仙界地图',
        expandedDockIcon: 'icon:ui-compass',
      },
    ],
  },
  {
    key: 'trade',
    title: '交易',
    scenes: [
      {
        id: 'market',
        sceneLabel: '修仙坊市',
        href: '/game/map-v2?intent=market',
        expandedDockLabel: '修仙坊市',
        expandedDockIcon: 'icon:map-market',
      },
      {
        id: 'black-market',
        sceneLabel: '暗巷黑市',
      },
      {
        id: 'market-recycle',
        sceneLabel: '鉴宝回收',
        href: '/game/market/recycle',
        expandedDockLabel: '鉴宝回收',
        expandedDockIcon: 'icon:ui-mechanism',
      },
      {
        id: 'tianjiao-vault',
        sceneLabel: '万界商行',
        href: '/game/tianjiao-vault',
        expandedDockLabel: '万界商行',
        expandedDockIcon: 'icon:ui-merit-medal',
      },
      {
        id: 'auction',
        sceneLabel: '拍卖行',
        href: '/game/auction',
        expandedDockLabel: '拍卖行',
        expandedDockIcon: 'icon:ui-mechanism',
      },
    ],
  },
  {
    key: 'message',
    title: '见闻',
    scenes: [
      {
        id: 'mail',
        sceneLabel: '道友传音',
        href: '/game/mail',
        coreDockLabel: '道友传音',
      },
      {
        id: 'world-chat',
        sceneLabel: '世界传音',
        href: '/game/world-chat',
        expandedDockLabel: '世界传音',
        expandedDockIcon: 'icon:ui-letter',
      },
    ],
  },
  {
    key: 'combat',
    title: '争锋',
    scenes: [
      {
        id: 'rankings',
        sceneLabel: '天骄榜',
        href: '/game/rankings',
        expandedDockLabel: '天骄榜',
        expandedDockIcon: 'icon:ui-merit-medal',
      },
      {
        id: 'hunt',
        sceneLabel: '结伴讨伐',
      },
      {
        id: 'hunt-team',
        sceneLabel: '组队讨伐',
        href: '/game/hunt-team',
      },
      {
        id: 'arena-sparring',
        sceneLabel: '擂台切磋',
        href: '/game/arena',
        expandedDockLabel: '擂台切磋',
        expandedDockIcon: 'icon:ui-bell',
      },
      {
        id: 'battle-challenge',
        sceneLabel: '挑战天骄',
      },
      {
        id: 'battle-replay',
        sceneLabel: '战斗回放',
      },
      {
        id: 'tower-battle',
        sceneLabel: '蜃楼战局',
      },
      {
        id: 'task-challenge',
        sceneLabel: '破境试炼',
      },
    ],
  },
  {
    key: 'service',
    title: '玩家服务',
    scenes: [
      {
        id: 'redeem',
        sceneLabel: '兑换码',
        href: '/game/redeem',
        expandedDockLabel: '兑换码',
        expandedDockIcon: 'icon:ui-treasure-chest',
      },
      {
        id: 'merit-ledger',
        sceneLabel: '功德簿',
        href: '/game/merit-ledger',
        expandedDockLabel: '功德簿',
        expandedDockIcon: 'icon:ui-scroll',
      },
      {
        id: 'community',
        sceneLabel: '玩家交流群',
        href: '/game/community',
        expandedDockLabel: '玩家交流群',
        expandedDockIcon: 'icon:cultivator-male-avatar',
      },
      {
        id: 'feedback',
        sceneLabel: '意见反馈',
        href: '/game/settings/feedback',
        expandedDockLabel: '意见反馈',
        expandedDockIcon: 'icon:ui-brush',
      },
      {
        id: 'settings',
        sceneLabel: '系统设置',
        href: '/game/settings',
        expandedDockLabel: '系统设置',
        expandedDockIcon: 'icon:ui-mechanism',
      },
    ],
  },
];

const gameSceneRegistry = gameDockGroups.flatMap((group) =>
  group.scenes.map((scene) => ({
    ...scene,
    group: group.key,
    groupTitle: group.title,
  })),
);

const gameSceneMetaById = new Map(
  gameSceneRegistry.map((scene) => [
    scene.id,
    {
      id: scene.id,
      label: scene.sceneLabel,
      group: scene.group,
    } satisfies GameSceneMeta,
  ]),
);

const gameSceneRegistryById = new Map(
  gameSceneRegistry.map((scene) => [scene.id, scene]),
);

const gameSceneGroupTitleByKey = new Map(
  gameDockGroups.map((group) => [group.key, group.title] as const),
);

function requireGameSceneRegistryItem(id: string) {
  const scene = gameSceneRegistryById.get(id);

  if (!scene) {
    throw new Error(`Missing game scene registry item for "${id}"`);
  }

  return scene;
}

export function getGameSceneMeta(id: string) {
  return gameSceneMetaById.get(id) ?? null;
}

export function getGameSceneGroupTitle(group: GameSceneGroup) {
  return gameSceneGroupTitleByKey.get(group) ?? null;
}

export function getCoreDockItems(): GameDockLink[] {
  return coreDockSceneOrder.map((id) => {
    const scene = requireGameSceneRegistryItem(id);

    if (!scene.href || !scene.coreDockLabel) {
      throw new Error(`Core dock scene "${id}" is missing href or label`);
    }

    return {
      id: scene.id,
      label: scene.coreDockLabel,
      href: scene.href,
    };
  });
}

export function getExpandedDockGroups(): GameDockGroupLinks[] {
  return gameDockGroups
    .map((group) => ({
      key: group.key,
      title: group.title,
      actions: group.scenes.flatMap((scene) => {
        if (!scene.href || !scene.expandedDockLabel) {
          return [];
        }

        return [
          {
            id: scene.id,
            label: scene.expandedDockLabel,
            icon: scene.expandedDockIcon,
            href: scene.href,
          },
        ];
      }),
    }))
    .filter((group) => group.actions.length > 0);
}
