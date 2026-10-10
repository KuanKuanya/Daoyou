import manifest from './bgm.json';

export type BgmProfile = 'cultivation' | 'exploration' | 'combat';
export interface BgmTrack {
  id: string;
  name: string;
  src: string;
  gain: number;
  source: string;
  license: string;
}
export interface BgmManifest {
  tracks: BgmTrack[];
  profiles: Record<BgmProfile, string>;
}

export const BGM_MANIFEST: BgmManifest = manifest;
export const BGM_PROFILE_LABELS: Record<BgmProfile, string> = {
  cultivation: '修行',
  exploration: '游历',
  combat: '战斗',
};

export function resolveBgmProfile(sceneId?: string): BgmProfile {
  if (sceneId === 'battle-replay') return 'combat';
  if (['map', 'wild', 'dungeon', 'sect-visit'].includes(sceneId ?? ''))
    return 'exploration';
  return 'cultivation';
}

export function getBgmTrack(profile: BgmProfile) {
  return BGM_MANIFEST.tracks.find(
    (track) => track.id === BGM_MANIFEST.profiles[profile],
  );
}
