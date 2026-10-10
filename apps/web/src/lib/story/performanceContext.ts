import { getSectPresentation } from '@app/lib/sect/sectPresentation';
import type {
  PerformanceContext,
  PerformanceScript,
} from '@daoyou/game-domain/performance';

/** Story teachers share the resolved sect-room artwork, including theme overrides. */
export function storyPerformanceArtwork(
  script: PerformanceScript,
  cultivator: { gender?: string | null },
  sectId?: string | null,
): PerformanceScript {
  const rooms = sectId ? getSectPresentation(sectId).rooms : undefined;
  const roles: Readonly<Record<string, readonly [string, string]>> = {
    '{instructor}': ['arena', 'instructor'],
    '{alchemy_teacher}': ['alchemy', 'keeper'],
    '{forge_teacher}': ['refinery', 'keeper'],
  };
  return {
    ...script,
    cast: Object.fromEntries(
      Object.entries(script.cast).map(([key, actor]) => {
        const role = roles[actor.name];
        const portrait =
          key === 'player'
            ? `icon:cultivator-${cultivator.gender === '女' ? 'female' : 'male'}-avatar`
            : role
              ? (rooms?.[role[0]]?.actors.find(
                  (entry) => entry.roleKey === role[1],
                )?.sigil ?? actor.portrait)
              : actor.portrait;
        return [key, { ...actor, portrait }];
      }),
    ),
  };
}

export function storyPerformanceContext(
  cultivator: { name: string; background?: string | null },
  sectId?: string | null,
): PerformanceContext {
  const rooms = sectId ? getSectPresentation(sectId).rooms : undefined;
  const actorName = (room: string, role: string, fallback: string) =>
    rooms?.[room]?.actors.find((actor) => actor.roleKey === role)?.name ??
    fallback;
  return {
    name: cultivator.name,
    background: cultivator.background?.trim() || '尚无来处',
    receptionist: actorName('hall', 'registry', '接引师兄'),
    alchemy_teacher: actorName('alchemy', 'keeper', '丹房执事'),
    forge_teacher: actorName('refinery', 'keeper', '器坊执事'),
    instructor: actorName('arena', 'instructor', '演武教习'),
  };
}
