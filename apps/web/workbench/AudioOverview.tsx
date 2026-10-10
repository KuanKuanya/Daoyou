import { useEffect, useState } from 'react';
import type { readAudio } from '../../../scripts/workbench/audio';
import {
  BGM_PROFILE_LABELS,
  type BgmManifest,
  type BgmProfile,
  type BgmTrack,
} from '../src/lib/audio/bgm';
import { AudioPreview } from './AudioPreview';

type AudioIndex = Awaited<ReturnType<typeof readAudio>>;
export default function AudioOverview({
  audio,
  assets,
  onDirty,
  save,
}: {
  audio: AudioIndex;
  assets: { url: string; bytes: number }[];
  onDirty: (dirty: boolean) => void;
  save: (manifest: BgmManifest) => Promise<void>;
}) {
  const [draft, setDraft] = useState(() => structuredClone(audio.manifest));
  const [selected, setSelected] = useState(audio.manifest.tracks[0]?.id ?? '');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const track = draft.tracks.find((item) => item.id === selected);
  const dirty = JSON.stringify(draft) !== JSON.stringify(audio.manifest);
  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  const update = (patch: Partial<BgmTrack>) =>
    setDraft({
      ...draft,
      tracks: draft.tracks.map((item) =>
        item.id === selected ? { ...item, ...patch } : item,
      ),
    });
  const audioAssets = assets.filter((asset) =>
    /^\/assets\/audio\/bgm\/.*\.(mp3|ogg|wav|m4a)$/i.test(asset.url),
  );
  const commit = async () => {
    setBusy(true);
    setError('');
    try {
      await save(draft);
      setConfirm(false);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="overview">
      <h2>背景音乐 · {draft.tracks.length} 首</h2>
      <div className="overview-columns">
        <section>
          <h3>场景绑定</h3>
          {(Object.keys(BGM_PROFILE_LABELS) as BgmProfile[]).map((profile) => (
            <label className="audio-field" key={profile}>
              <span>{BGM_PROFILE_LABELS[profile]}</span>
              <select
                disabled={busy}
                value={draft.profiles[profile]}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    profiles: {
                      ...draft.profiles,
                      [profile]: event.target.value,
                    },
                  })
                }
              >
                {draft.tracks.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <h3>曲目</h3>
          {draft.tracks.map((item) => (
            <button
              key={item.id}
              className="structure-row"
              aria-pressed={item.id === selected}
              onClick={() => setSelected(item.id)}
            >
              <span>
                {item.name}
                <small>{item.id}</small>
              </span>
              <span>
                {Object.entries(draft.profiles)
                  .filter(([, id]) => id === item.id)
                  .map(([profile]) => BGM_PROFILE_LABELS[profile as BgmProfile])
                  .join(' / ') || '未绑定'}
              </span>
            </button>
          ))}
          <button
            disabled={busy}
            onClick={() => {
              let index = draft.tracks.length + 1;
              while (draft.tracks.some((item) => item.id === `track-${index}`))
                index += 1;
              const id = `track-${index}`;
              setDraft({
                ...draft,
                tracks: [
                  ...draft.tracks,
                  {
                    id,
                    name: '新曲目',
                    src: audioAssets[0]?.url ?? '',
                    gain: 1,
                    source: '项目作者提供',
                    license: '待确认发行授权',
                  },
                ],
              });
              setSelected(id);
            }}
          >
            新增曲目
          </button>
          <h3>检查</h3>
          {audio.issues.length ? (
            audio.issues.map((issue) => (
              <p className="issue" key={issue}>
                {issue}
              </p>
            ))
          ) : (
            <p className="success">音乐配置检查通过</p>
          )}
          <code className="source">apps/web/src/lib/audio/bgm.json</code>
        </section>
        {track ? (
          <section>
            <h3>{track.name}</h3>
            <AudioPreview key={track.src} src={track.src} volume={track.gain} />
            <p className="muted">
              {(
                (assets.find((asset) => asset.url === track.src)?.bytes ?? 0) /
                1024 /
                1024
              ).toFixed(1)}{' '}
              MB
            </p>
            <label className="audio-field">
              曲目名称
              <input
                disabled={busy}
                value={track.name}
                onChange={(event) => update({ name: event.target.value })}
              />
            </label>
            <label className="audio-field">
              音频文件
              <select
                disabled={busy}
                value={track.src}
                onChange={(event) => update({ src: event.target.value })}
              >
                {!audioAssets.some((asset) => asset.url === track.src) ? (
                  <option value={track.src}>
                    {track.src || '请选择音频文件'}
                  </option>
                ) : null}
                {audioAssets.map((asset) => (
                  <option key={asset.url} value={asset.url}>
                    {asset.url.split('/').at(-1)}
                  </option>
                ))}
              </select>
            </label>
            <label className="audio-field">
              音量校准 · {Math.round(track.gain * 100)}%
              <input
                disabled={busy}
                type="range"
                min={0}
                max={100}
                value={Math.round(track.gain * 100)}
                onChange={(event) =>
                  update({ gain: event.target.valueAsNumber / 100 })
                }
              />
            </label>
            <label className="audio-field">
              素材来源
              <input
                disabled={busy}
                value={track.source}
                onChange={(event) => update({ source: event.target.value })}
              />
            </label>
            <label className="audio-field">
              发行授权
              <input
                disabled={busy}
                value={track.license}
                onChange={(event) => update({ license: event.target.value })}
              />
            </label>
            {error ? <p className="issue">{error}</p> : null}
            <div className="audio-actions">
              <button
                disabled={
                  busy ||
                  draft.tracks.length === 1 ||
                  Object.values(draft.profiles).includes(track.id)
                }
                title="已绑定场景的曲目需先解除绑定"
                onClick={() => {
                  const tracks = draft.tracks.filter(
                    (item) => item.id !== selected,
                  );
                  setDraft({ ...draft, tracks });
                  setSelected(tracks[0]?.id ?? '');
                }}
              >
                移除曲目
              </button>
              <button
                disabled={!dirty || busy}
                onClick={() => setConfirm(true)}
              >
                确认保存
              </button>
              <button
                disabled={!dirty || busy}
                onClick={() => {
                  setDraft(structuredClone(audio.manifest));
                  setSelected(audio.manifest.tracks[0]?.id ?? '');
                  setError('');
                }}
              >
                放弃修改
              </button>
            </div>
          </section>
        ) : (
          <section>
            <p className="issue">没有有效曲目</p>
          </section>
        )}
      </div>
      {confirm ? (
        <div className="modal-backdrop">
          <div
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="audio-save-title"
          >
            <h2 id="audio-save-title">确认音乐配置</h2>
            <code className="source">apps/web/src/lib/audio/bgm.json</code>
            {(Object.keys(BGM_PROFILE_LABELS) as BgmProfile[]).map(
              (profile) => (
                <p key={profile}>
                  {BGM_PROFILE_LABELS[profile]}：
                  {audio.manifest.tracks.find(
                    (item) => item.id === audio.manifest.profiles[profile],
                  )?.name ?? '未绑定'}{' '}
                  →{' '}
                  {draft.tracks.find(
                    (item) => item.id === draft.profiles[profile],
                  )?.name ?? '未绑定'}
                </p>
              ),
            )}
            {draft.tracks
              .filter(
                (item) =>
                  JSON.stringify(item) !==
                  JSON.stringify(
                    audio.manifest.tracks.find((old) => old.id === item.id),
                  ),
              )
              .map((item) => (
                <div key={item.id}>
                  <h3>{item.name}</h3>
                  <code className="source">{item.src}</code>
                  <p>
                    音量校准：
                    {Math.round(
                      (audio.manifest.tracks.find((old) => old.id === item.id)
                        ?.gain ?? 1) * 100,
                    )}
                    % → {Math.round(item.gain * 100)}%
                  </p>
                </div>
              ))}
            {error ? <p className="issue">{error}</p> : null}
            <div className="audio-actions">
              <button disabled={busy} onClick={() => void commit()}>
                写入配置
              </button>
              <button disabled={busy} onClick={() => setConfirm(false)}>
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
