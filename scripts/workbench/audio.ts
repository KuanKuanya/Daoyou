import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { BgmManifest } from '../../apps/web/src/lib/audio/bgm';
import { digest, publicDirectory } from './catalog.ts';

export const audioFile = 'apps/web/src/lib/audio/bgm.json';
export const audioProfiles = ['cultivation', 'exploration', 'combat'] as const;

export function parseAudioManifest(value: unknown): BgmManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('音乐配置无效');
  const data = value as BgmManifest;
  if (
    !Array.isArray(data.tracks) ||
    !data.tracks.length ||
    data.tracks.length > 100
  )
    throw new Error('曲目必须为 1–100 首');
  const ids = new Set<string>();
  for (const track of data.tracks) {
    if (
      !track ||
      typeof track !== 'object' ||
      !['id', 'name', 'src', 'source', 'license'].every(
        (key) =>
          typeof track[key as keyof typeof track] === 'string' &&
          (track[key as keyof typeof track] as string).trim().length > 0 &&
          (track[key as keyof typeof track] as string).length <= 500,
      ) ||
      !/^[a-z0-9-]+$/.test(track.id) ||
      ids.has(track.id) ||
      !/^\/assets\/audio\/bgm\/[a-zA-Z0-9_-]+\.(mp3|ogg|wav|m4a)$/.test(
        track.src,
      ) ||
      typeof track.gain !== 'number' ||
      !Number.isFinite(track.gain) ||
      track.gain < 0 ||
      track.gain > 1
    )
      throw new Error('曲目字段、路径、音量校准值或 ID 无效');
    ids.add(track.id);
  }
  if (
    !data.profiles ||
    typeof data.profiles !== 'object' ||
    Object.keys(data.profiles).length !== audioProfiles.length ||
    audioProfiles.some((profile) => !ids.has(data.profiles[profile]))
  )
    throw new Error('每种场景必须绑定一个已注册曲目');
  return {
    tracks: data.tracks.map(({ id, name, src, gain, source, license }) => ({
      id,
      name,
      src,
      gain,
      source,
      license,
    })),
    profiles: {
      cultivation: data.profiles.cultivation,
      exploration: data.profiles.exploration,
      combat: data.profiles.combat,
    },
  };
}

export async function readAudio(root: string) {
  const source = await readFile(path.join(root, audioFile), 'utf8');
  let manifest: BgmManifest;
  try {
    manifest = parseAudioManifest(JSON.parse(source));
  } catch (error) {
    return {
      manifest: {
        tracks: [],
        profiles: { cultivation: '', exploration: '', combat: '' },
      },
      revision: digest(source),
      issues: [`音乐配置无法解析：${String(error)}`],
    };
  }
  const issues: string[] = [];
  for (const track of manifest.tracks) {
    try {
      const file = await stat(
        path.join(root, publicDirectory, track.src.slice(1)),
      );
      if (!file.isFile()) throw new Error('Not a file');
    } catch {
      issues.push(`${track.name}：音频文件不存在`);
    }
    if (!Object.values(manifest.profiles).includes(track.id))
      issues.push(`${track.name}：未绑定任何场景`);
    if (track.license.includes('待确认'))
      issues.push(`${track.name}：发行授权待确认`);
  }
  return { manifest, revision: digest(source), issues };
}
