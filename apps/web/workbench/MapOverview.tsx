import { useEffect, useState, type PointerEvent } from 'react';
import type { AtlasIndex } from '../../../scripts/workbench/atlas';

type Points = Record<string, [number, number]>;
export default function MapOverview({
  assets,
  atlas,
  selectedId,
  onSelect,
  onDirty,
  onSaved,
}: {
  assets: { url: string; references: unknown[] }[];
  atlas: AtlasIndex;
  selectedId?: string;
  onSelect: (id: string) => void;
  onDirty: (dirty: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const [region, setRegion] = useState('world');
  const [points, setPoints] = useState<Points>(
    structuredClone(atlas.points.world),
  );
  const [image, setImage] = useState(atlas.images.world);
  const [active, setActive] = useState('');
  const [editing, setEditing] = useState(false);
  const [labels, setLabels] = useState(true);
  const [confirm, setConfirm] = useState<'points' | 'image' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [snapshot, setSnapshot] = useState(atlas);
  const [selection, setSelection] = useState(selectedId);
  if (snapshot !== atlas || selection !== selectedId) {
    const node = atlas.nodes.find((n) => n.id === selectedId);
    const nextRegion =
      selection !== selectedId && node?.atlasRegion ? node.atlasRegion : region;
    setSnapshot(atlas);
    setSelection(selectedId);
    setRegion(nextRegion);
    setPoints(structuredClone(atlas.points[nextRegion] ?? {}));
    setImage(atlas.images[nextRegion]);
    setActive(node?.id ?? '');
    setConfirm(null);
  }
  const original = atlas.points[region] ?? {};
  const pointDirty = JSON.stringify(points) !== JSON.stringify(original);
  const imageDirty = image !== atlas.images[region];
  const dirty = pointDirty || imageDirty;
  const maps = assets.filter(
    (a) => a.url.startsWith('/assets/maps/') && /\.(png|webp)$/i.test(a.url),
  );
  const nodes =
    region === 'world'
      ? atlas.regions.map((r) => ({ id: r.id, name: r.name }))
      : atlas.nodes.filter((n) => n.atlasRegion === region);
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);
  const changeRegion = (id: string, selected = '') => {
    onSelect('');
    setRegion(id);
    setPoints(structuredClone(atlas.points[id] ?? {}));
    setImage(atlas.images[id] ?? '');
    setActive(selected);
    setError('');
    setNotice('');
  };
  const select = (id: string) => {
    setActive(id);
    if (region !== 'world' && !dirty) onSelect(id);
  };
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    if (!editing || imageDirty || busy || !(event.buttons & 1)) return;
    const rect = event.currentTarget.parentElement!.getBoundingClientRect();
    const id = event.currentTarget.dataset.id!;
    const x = Math.max(
      0.001,
      Math.min(0.999, (event.clientX - rect.left) / rect.width),
    );
    const y = Math.max(
      0.001,
      Math.min(0.999, (event.clientY - rect.top) / rect.height),
    );
    setPoints((p) => ({
      ...p,
      [id]: [Number(x.toFixed(4)), Number(y.toFixed(4))],
    }));
  };
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        `/__workbench/${confirm === 'points' ? 'atlas' : 'atlas-image'}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            region,
            revision:
              confirm === 'points' ? atlas.revision : atlas.imageRevision,
            contentRevision: atlas.contentRevision,
            atlasRevision: atlas.revision,
            imageRevision: atlas.imageRevision,
            imageContentRevision: atlas.imageRevisions[region],
            ...(confirm === 'points' ? { points } : { image }),
          }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setConfirm(null);
      setNotice(
        `已写入 ${result.saved}。坐标修改需重建 game-rules；底图变更后须核对全部锚点。`,
      );
      await onSaved();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };
  const activePoint = points[active];
  const changes = Object.entries(points).filter(
    ([id, p]) => JSON.stringify(p) !== JSON.stringify(original[id]),
  );
  return (
    <section className="atlas-editor">
      <div className="atlas-editor-bar">
        <select
          aria-label="校准区域"
          value={region}
          disabled={dirty || busy}
          onChange={(e) => changeRegion(e.target.value)}
        >
          <option value="world">人界总览</option>
          {atlas.regions
            .filter((r) => atlas.images[r.id])
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
        </select>
        <label>
          <input
            type="checkbox"
            checked={editing}
            disabled={imageDirty || busy}
            onChange={(e) => setEditing(e.target.checked)}
          />
          调整锚点
        </label>
        <label>
          <input
            type="checkbox"
            checked={labels}
            onChange={(e) => setLabels(e.target.checked)}
          />
          地名
        </label>
        <span className="muted">
          {nodes.length} 个锚点 · {changes.length} 项调整
        </span>
        <button
          disabled={!dirty || busy}
          onClick={() => {
            setPoints(structuredClone(original));
            setImage(atlas.images[region]);
            setError('');
          }}
        >
          放弃调整
        </button>
        <button
          disabled={!pointDirty || imageDirty || busy}
          onClick={() => setConfirm('points')}
        >
          检查并保存坐标
        </button>
      </div>
      {error && (
        <p role="alert" className="issue">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="success">
          {notice}
        </p>
      )}
      <div className="atlas-editor-body">
        <div className="atlas-stage">
          <img src={image} alt="校准地图底图" draggable={false} />
          {nodes.map((n) => {
            const point = points[n.id];
            if (!point) return null;
            return (
              <button
                key={n.id}
                data-id={n.id}
                aria-label={`地图锚点 ${n.name}`}
                title={`${n.name} · ${n.id} · ${point.join(', ')}`}
                className={`atlas-anchor ${active === n.id ? 'selected' : ''} ${editing ? 'editable' : ''}`}
                style={{
                  left: `${point[0] * 100}%`,
                  top: `${point[1] * 100}%`,
                }}
                onClick={() => select(n.id)}
                onPointerDown={(e) => {
                  select(n.id);
                  if (editing) e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={move}
                onPointerUp={(e) => {
                  if (e.currentTarget.hasPointerCapture(e.pointerId))
                    e.currentTarget.releasePointerCapture(e.pointerId);
                }}
              >
                <span className="anchor-dot" />
                {labels && <span className="anchor-label">{n.name}</span>}
              </button>
            );
          })}
        </div>
        <aside className="atlas-inspector">
          <h2>底图与锚点</h2>
          <span className="badge">
            {imageDirty ? '候选底图 · 尚未接入' : '游戏正在使用'}
          </span>
          <code>{atlas.images[region]}</code>
          <select
            aria-label="候选地图底图"
            value={image}
            disabled={pointDirty || busy}
            onChange={(e) => setImage(e.target.value)}
          >
            {maps.map((a) => (
              <option key={a.url} value={a.url}>
                {a.url.split('/').at(-1)}
              </option>
            ))}
          </select>
          <button
            disabled={!imageDirty || pointDirty || busy}
            onClick={() => setConfirm('image')}
          >
            确认接入底图
          </button>
          <select
            aria-label="选中地图节点"
            value={active}
            onChange={(e) => select(e.target.value)}
          >
            <option value="">选择节点</option>
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name} · {n.id}
              </option>
            ))}
          </select>
          {active && (
            <>
              <code>{active}</code>
              <div className="anchor-inputs">
                {(['X', 'Y'] as const).map((label, i) => (
                  <label key={label}>
                    {label}
                    <input
                      aria-label={`锚点 ${label}`}
                      type="number"
                      min="0.001"
                      max="0.999"
                      step="0.001"
                      disabled={!editing || busy || imageDirty}
                      value={activePoint?.[i] ?? ''}
                      onChange={(e) => {
                        const v = e.target.valueAsNumber;
                        if (Number.isFinite(v) && v > 0 && v < 1)
                          setPoints((p) => {
                            const next: [number, number] = [
                              ...(p[active] ?? [0.5, 0.5]),
                            ];
                            next[i] = v;
                            return { ...p, [active]: next };
                          });
                      }}
                    />
                  </label>
                ))}
              </div>
              {activePoint && (
                <p className="muted">
                  画布像素：{Math.round(activePoint[0] * 1536)} /{' '}
                  {Math.round(activePoint[1] * 1024)}
                </p>
              )}
            </>
          )}
          <code>packages/game-rules/src/world/mapAtlas.ts</code>
        </aside>
      </div>
      {confirm && (
        <div className="modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="确认地图修改"
            className="confirm-dialog"
          >
            <h2>{confirm === 'points' ? '确认坐标调整' : '确认底图接入'}</h2>
            {confirm === 'points' ? (
              changes.map(([id, p]) => (
                <p key={id}>
                  <code>
                    {id}: {original[id]?.join(', ') ?? '缺失'} → {p.join(', ')}
                  </code>
                </p>
              ))
            ) : (
              <>
                <code>
                  {atlas.images[region]} → {image}
                </code>
                <img
                  className="atlas-confirm-image"
                  src={image}
                  alt="待接入地图"
                />
                <p className="issue">
                  底图按 1536 × 1024
                  画布显示。接入不会自动重算节点坐标，需逐点核对地貌位置。
                </p>
              </>
            )}
            <div className="dialog-actions">
              <button disabled={busy} onClick={() => setConfirm(null)}>
                取消
              </button>
              <button disabled={busy} onClick={save}>
                {busy ? '保存中…' : '确认保存地图'}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
