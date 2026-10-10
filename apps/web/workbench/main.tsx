import { useEffect, useMemo, useState } from 'react';
import type { AtlasIndex } from '../../../scripts/workbench/atlas';
import type { readAudio } from '../../../scripts/workbench/audio';
import type { Entry, Reference } from '../../../scripts/workbench/catalog';
import { GameIcon } from '../src/components/ui/GameIcon';
import AudioOverview from './AudioOverview';
import { AudioPreview } from './AudioPreview';
import MapOverview from './MapOverview';
import './style.css';

type Asset = {
  path: string;
  url: string;
  names: string[];
  bytes: number;
  references: Reference[];
};
type Catalog = {
  entries: Entry[];
  assets: Asset[];
  issues: { name: string; source: string; message: string }[];
  references: Record<string, Reference[]>;
  generatedAt: string;
  scannedFiles: number;
  registryRevision: string;
  undoAvailable: boolean;
  atlas: AtlasIndex;
  audio: Awaited<ReturnType<typeof readAudio>>;
};
const categories = [
  '灵兽',
  '灵兽技能',
  '技能家族',
  '个人功法',
  '宗门',
  '宗门心法',
  '宗门技能',
  '宗门配置',
  '物品定义',
  '地图节点',
  '图标',
  '其他内容',
];
const sections = [
  '项目总览',
  '内容目录',
  '资产资源',
  '地图世界',
  '宗门体系',
  '背景音乐',
  '检查报告',
];
const imagePattern = /\.(png|webp|svg|jpe?g|gif)$/i;
async function request<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(
    `/__workbench/${url}`,
    body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? '请求失败');
  return result;
}
function size(bytes: number) {
  return bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.ceil(bytes / 1024)} KB`;
}
function References({
  items,
  select,
}: {
  items: Reference[];
  select: (file: string) => void;
}) {
  const unique = [
    ...new Map(
      items.map((item) => [`${item.file}:${item.line}`, item]),
    ).values(),
  ];
  return (
    <div className="reference-list">
      {unique.length ? (
        unique.map((r) => (
          <button
            key={`${r.file}:${r.line}`}
            onClick={() => select(r.file)}
            title="按来源文件筛选内容"
          >
            <code>
              {r.file}:{r.line}
            </code>
          </button>
        ))
      ) : (
        <p className="muted">未发现静态引用</p>
      )}
    </div>
  );
}
export default function Workbench() {
  const [catalog, setCatalog] = useState<Catalog>();
  const [section, setSection] = useState('项目总览');
  const [mapSession, setMapSession] = useState(0);
  const [category, setCategory] = useState('全部');
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('全部');
  const [assetFilter, setAssetFilter] = useState('全部');
  const [selectedKey, setSelectedKey] = useState('');
  const [selectedAsset, setSelectedAsset] = useState('');
  const [tab, setTab] = useState('预览');
  const [patch, setPatch] = useState<Record<string, string>>({});
  const [candidate, setCandidate] = useState('');
  const [upload, setUpload] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState<'content' | 'icon' | null>(null);
  const [dirty, setDirty] = useState(false);
  const refresh = async () => {
    setBusy(true);
    setError('');
    try {
      setCatalog(await request<Catalog>('catalog'));
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void request<Catalog>('catalog')
      .then(setCatalog)
      .catch((cause) => setError(String(cause)));
  }, []);
  useEffect(() => {
    const onUnload = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty]);
  const selected = catalog?.entries.find((e) => e.key === selectedKey);
  const asset = catalog?.assets.find((a) => a.url === selectedAsset);
  const counts = useMemo(
    () =>
      Object.fromEntries(
        categories.map((c) => [
          c,
          catalog?.entries.filter((e) => e.category === c).length ?? 0,
        ]),
      ),
    [catalog],
  );
  const dirtyGuard = () => !dirty || window.confirm('放弃尚未保存的修改？');
  const reset = () => {
    setPatch({});
    setCandidate('');
    setUpload('');
    setDirty(false);
    setConfirm(null);
    setTab('预览');
  };
  const choose = (entry: Entry) => {
    if (entry.key === selectedKey) return;
    if (!dirtyGuard()) return;
    reset();
    setSelectedKey(entry.key);
    setSelectedAsset('');
  };
  const navigate = (next: string, nextCategory = '全部') => {
    if (!dirtyGuard()) return;
    reset();
    setMapSession((value) => value + 1);
    setSection(next);
    setCategory(nextCategory);
    setGroup('全部');
    setQuery('');
    setSelectedKey('');
    setSelectedAsset('');
  };
  const bySource = (file: string) => {
    if (!dirtyGuard()) return;
    reset();
    setSection('内容目录');
    setCategory('全部');
    setGroup('全部');
    setQuery(file);
    setSelectedAsset('');
  };
  const filtered =
    catalog?.entries.filter((e) => {
      if (section === '宗门体系' && !e.category.startsWith('宗门'))
        return false;
      if (section === '地图世界' && e.category !== '地图节点') return false;
      return (
        (category === '全部' || e.category === category) &&
        (group === '全部' || e.group === group) &&
        `${e.name} ${e.id} ${e.source} ${e.icon ?? ''} ${JSON.stringify(e.data)}`
          .toLowerCase()
          .includes(query.toLowerCase())
      );
    }) ?? [];
  const groups = [
    ...new Set(
      catalog?.entries
        .filter((e) =>
          section === '地图世界'
            ? e.category === '地图节点'
            : section === '宗门体系'
              ? e.category.startsWith('宗门')
              : category === '全部' || e.category === category,
        )
        .map((e) => e.group),
    ),
  ].sort();
  const filteredAssets =
    catalog?.assets.filter(
      (a) =>
        `${a.path} ${a.names.join(' ')}`
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (assetFilter === '全部' ||
          (assetFilter === '已注册图标' && a.names.length > 0) ||
          (assetFilter === '未发现引用' && a.references.length === 0) ||
          (assetFilter === '地图' && a.path.includes('/maps/')) ||
          (assetFilter === '音频' && /\.(mp3|ogg|wav|m4a)$/i.test(a.path))),
    ) ?? [];
  const iconValue =
    typeof patch.icon === 'string' ? patch.icon : selected?.icon;
  const iconEntry = catalog?.entries.find(
    (e) => e.category === '图标' && e.id === iconValue,
  );
  const actualImage = candidate || iconEntry?.image || selected?.image;
  const save = async () => {
    if (!selected || !confirm) return;
    setBusy(true);
    setError('');
    try {
      const result = await request<{ saved: string }>(
        confirm,
        confirm === 'content'
          ? { key: selected.key, revision: selected.revision, patch }
          : {
              name: selected.id.slice(5),
              revision: catalog?.registryRevision,
              image: candidate,
              ...(upload ? { upload } : {}),
            },
      );
      reset();
      setNotice(
        `已写入 ${result.saved}。内容修改需重建内容包并重启 API；图标修改由 Vite 更新。`,
      );
      setCatalog(await request<Catalog>('catalog'));
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };
  const previewUpload = async (file?: File) => {
    if (!file) return;
    if (
      !['image/png', 'image/webp'].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setError('请选择 5 MiB 以内的 PNG / WebP');
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setError('图片读取失败，请重新选择');
    reader.onload = async () => {
      const data = String(reader.result);
      const image = new Image();
      image.src = data;
      try {
        await image.decode();
        setCandidate(data);
        setUpload(data.split(',')[1]);
        setDirty(true);
      } catch {
        setError('图片无法解码，请选择有效的 PNG / WebP');
      }
    };
    reader.readAsDataURL(file);
  };
  const checkDraft = (field: string, value: string) => {
    setPatch((current) => ({ ...current, [field]: value }));
    setDirty(true);
  };
  return (
    <div className="workbench">
      <aside className="sidebar">
        <div className="brand">
          道友<span>项目工作台</span>
        </div>
        <nav>
          {sections.map((s, i) => (
            <button
              key={s}
              className={section === s ? 'active' : ''}
              onClick={() => navigate(s)}
            >
              <span className="nav-index">0{i + 1}</span>
              {s}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="status-dot" />
          本地源码工作区<small>127.0.0.1 · 5180</small>
        </div>
      </aside>
      <div className="workspace">
        <header>
          <div>
            <span className="eyebrow">DAOYOU / DEVELOPMENT</span>
            <h1>{section}</h1>
          </div>
          <div className="header-actions">
            <span className="muted">
              {catalog ? `${catalog.scannedFiles} 个源文件` : '正在索引'}
            </span>
            <button
              disabled={busy || dirty}
              title="重新扫描源码与素材"
              onClick={() => void refresh()}
            >
              刷新索引
            </button>
            <button
              disabled={busy || dirty || !catalog?.undoAvailable}
              onClick={() => {
                if (
                  window.confirm('撤销最近一次工作台保存？外部修改不会被覆盖。')
                )
                  void request('undo', {})
                    .then(() => refresh())
                    .catch((cause) => setError(String(cause)));
              }}
            >
              撤销上次保存
            </button>
          </div>
        </header>
        {error && (
          <div role="alert" className="alert danger">
            {error}
            <button onClick={() => setError('')} aria-label="关闭错误">
              ×
            </button>
          </div>
        )}
        {notice && (
          <div role="status" className="alert">
            {notice}
            <button onClick={() => setNotice('')} aria-label="关闭通知">
              ×
            </button>
          </div>
        )}
        {!catalog ? (
          <div className="loading">
            {error ? '索引未加载' : '读取项目内容与资源…'}
          </div>
        ) : section === '项目总览' ? (
          <main className="overview">
            <div className="summary-strip">
              <div>
                <strong>{catalog.entries.length}</strong>
                <span>已索引内容条目</span>
              </div>
              <div>
                <strong>{catalog.assets.length}</strong>
                <span>资源文件</span>
              </div>
              <div>
                <strong>{counts['地图节点']}</strong>
                <span>地图节点</span>
              </div>
              <div>
                <strong>{catalog.issues.length}</strong>
                <span>引用检查问题</span>
              </div>
            </div>
            <div className="overview-columns">
              <section>
                <h2>内容版图</h2>
                <table>
                  <thead>
                    <tr>
                      <th>内容分类</th>
                      <th>数量</th>
                      <th>来源</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((c) => (
                      <tr
                        key={c}
                        onClick={() =>
                          navigate(
                            c.startsWith('宗门')
                              ? '宗门体系'
                              : c === '地图节点'
                                ? '地图世界'
                                : '内容目录',
                            c,
                          )
                        }
                      >
                        <td>{c}</td>
                        <td className="numeric">{counts[c]}</td>
                        <td>
                          <span className="muted">
                            {c === '图标'
                              ? 'Web 图标注册表'
                              : c === '物品定义' || c === '宗门'
                                ? '编译后的运行时目录'
                                : 'game-content 源文件'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
              <section>
                <h2>项目结构</h2>
                {[
                  {
                    name: '世界与区域',
                    count: new Set(
                      catalog.entries
                        .filter((e) => e.category === '地图节点')
                        .map((e) => e.group),
                    ).size,
                    section: '地图世界',
                    text: '区域 / 节点 / 坊市配置 / 出现地点',
                  },
                  {
                    name: '宗门体系',
                    count: counts['宗门'],
                    section: '宗门体系',
                    text: '宗门 / 心法 / 技能 / 分支与状态',
                  },
                  {
                    name: '素材资源',
                    count: catalog.assets.length,
                    section: '资产资源',
                    text: '图标 / 地图 / 立绘 / 音频 / 字体',
                  },
                ].map((item) => (
                  <button
                    className="structure-row"
                    key={item.name}
                    onClick={() => navigate(item.section)}
                  >
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.text}</small>
                    </span>
                    <b>{item.count} →</b>
                  </button>
                ))}
                <div className="index-note">
                  静态设定与编译目录，不包含玩家库存或数据库实例。嵌套技能、状态和分支按各自定义计数，不代表可学习技能总量。
                </div>
                <h2>检查摘要</h2>
                <button
                  className="structure-row"
                  onClick={() => navigate('检查报告')}
                >
                  <span>未发现静态引用的资源</span>
                  <b>
                    {catalog.assets.filter((a) => !a.references.length).length}{' '}
                    →
                  </b>
                </button>
                <button
                  className="structure-row"
                  onClick={() => navigate('检查报告')}
                >
                  <span>缺失文件 / 未注册图标</span>
                  <b>{catalog.issues.length} →</b>
                </button>
              </section>
            </div>
          </main>
        ) : section === '背景音乐' ? (
          <AudioOverview
            key={catalog.audio.revision}
            audio={catalog.audio}
            assets={catalog.assets}
            onDirty={setDirty}
            save={async (manifest) => {
              await request('audio', {
                revision: catalog.audio.revision,
                manifest,
              });
              setDirty(false);
              await refresh();
              setNotice('背景音乐配置已保存，可撤销');
            }}
          />
        ) : section === '检查报告' ? (
          <main className="overview">
            <h2>引用与文件检查 · {catalog.issues.length} 项</h2>
            {catalog.issues.length ? (
              catalog.issues.map((issue, i) => (
                <div className="issue" key={i}>
                  <strong>{issue.message}</strong>
                  <code>{issue.name}</code>
                  <code>{issue.source}</code>
                </div>
              ))
            ) : (
              <p className="success">未发现缺失素材或未注册图标。</p>
            )}
            <h2>地图坐标检查 · {catalog.atlas.issues.length} 项</h2>
            {catalog.atlas.issues.length ? (
              catalog.atlas.issues.map((issue) => (
                <p className="issue" key={issue}>
                  {issue}
                </p>
              ))
            ) : (
              <p className="success">节点归属、锚点覆盖与坐标范围检查通过。</p>
            )}
            <h2>背景音乐检查 · {catalog.audio.issues.length} 项</h2>
            {catalog.audio.issues.length ? (
              catalog.audio.issues.map((issue) => (
                <p className="issue" key={issue}>
                  {issue}
                </p>
              ))
            ) : (
              <p className="success">音乐配置检查通过。</p>
            )}
            <h2>
              未发现静态引用 ·{' '}
              {catalog.assets.filter((a) => !a.references.length).length} 个资源
            </h2>
            <p className="muted">
              仅扫描字符串字面量引用。动态路径、Canvas
              加载和外部引用可能未识别，这不是删除依据。
            </p>
            <div className="asset-grid audit-grid">
              {catalog.assets
                .filter((a) => !a.references.length)
                .map((a) => (
                  <button
                    key={a.url}
                    className="asset-tile"
                    title="查看资源大图与引用详情"
                    onClick={() => {
                      navigate('资产资源');
                      setSelectedAsset(a.url);
                    }}
                  >
                    <div className="asset-thumb">
                      {imagePattern.test(a.url) ? (
                        <img
                          src={a.url}
                          loading="lazy"
                          alt={a.path.split('/').at(-1)}
                        />
                      ) : (
                        <span>{a.url.split('.').at(-1)?.toUpperCase()}</span>
                      )}
                    </div>
                    <strong>{a.path.split('/').at(-1)}</strong>
                    <code className="audit-path">{a.path}</code>
                    <span>{size(a.bytes)}</span>
                  </button>
                ))}
            </div>
          </main>
        ) : (
          <>
            {section === '地图世界' && (
              <MapOverview
                key={mapSession}
                assets={catalog.assets}
                atlas={catalog.atlas}
                selectedId={selected?.id}
                onSelect={(id) => {
                  if (!id) {
                    setSelectedKey('');
                    return;
                  }
                  const entry = catalog.entries.find(
                    (e) => e.category === '地图节点' && e.id === id,
                  );
                  if (entry) choose(entry);
                }}
                onDirty={setDirty}
                onSaved={async () => {
                  setDirty(false);
                  await refresh();
                }}
              />
            )}
            {section === '宗门体系' && (
              <div className="sect-strip">
                {catalog.entries
                  .filter((e) => e.category === '宗门')
                  .map((e) => (
                    <button
                      key={e.key}
                      className={group === e.group ? 'selected' : ''}
                      onClick={() => {
                        if (!dirtyGuard()) return;
                        choose(e);
                        setGroup(e.group);
                      }}
                    >
                      <strong>{e.name}</strong>
                      <small>
                        {Array.isArray(e.data.methods)
                          ? e.data.methods.length
                          : 0}{' '}
                        心法 ·{' '}
                        {Array.isArray(e.data.paths) ? e.data.paths.length : 0}{' '}
                        分支
                      </small>
                    </button>
                  ))}
              </div>
            )}
            <div className="toolbar">
              <input
                aria-label="搜索内容或资源"
                placeholder="搜索名称、ID、源文件或图标"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {section === '资产资源' ? (
                <select
                  aria-label="资源类型"
                  value={assetFilter}
                  onChange={(e) => setAssetFilter(e.target.value)}
                >
                  {['全部', '已注册图标', '地图', '音频', '未发现引用'].map(
                    (c) => (
                      <option key={c}>{c}</option>
                    ),
                  )}
                </select>
              ) : (
                <>
                  <select
                    aria-label="内容分类"
                    value={category}
                    onChange={(e) => {
                      setCategory(e.target.value);
                      setGroup('全部');
                    }}
                  >
                    <option>全部</option>
                    {categories
                      .filter((c) =>
                        section === '宗门体系'
                          ? c.startsWith('宗门')
                          : section === '地图世界'
                            ? c === '地图节点'
                            : true,
                      )
                      .map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                  </select>
                  <select
                    aria-label="区域或所属"
                    value={group}
                    onChange={(e) => setGroup(e.target.value)}
                  >
                    <option>全部</option>
                    {groups.map((g) => (
                      <option key={g}>{g}</option>
                    ))}
                  </select>
                </>
              )}
              <span className="muted">
                {section === '资产资源'
                  ? filteredAssets.length
                  : filtered.length}{' '}
                条
              </span>
            </div>
            <div className="catalog-layout">
              <section className="results">
                {section === '资产资源' ? (
                  <div className="asset-grid">
                    {filteredAssets.map((a) => (
                      <button
                        key={a.url}
                        className={
                          selectedAsset === a.url
                            ? 'asset-tile selected'
                            : 'asset-tile'
                        }
                        onClick={() => {
                          if (!dirtyGuard()) return;
                          reset();
                          setSelectedAsset(a.url);
                          setSelectedKey('');
                        }}
                      >
                        <div className="asset-thumb">
                          {imagePattern.test(a.url) ? (
                            <img src={a.url} loading="lazy" alt="" />
                          ) : (
                            <span>
                              {a.url.split('.').at(-1)?.toUpperCase()}
                            </span>
                          )}
                        </div>
                        <strong>{a.path.split('/').at(-1)}</strong>
                        <span>
                          {size(a.bytes)} · {a.references.length} 处静态引用
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>内容</th>
                        <th>类型 / 所属</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((e) => (
                        <tr
                          key={e.key}
                          className={selectedKey === e.key ? 'selected' : ''}
                        >
                          <td>
                            <button
                              className="entry-button"
                              onClick={() => choose(e)}
                            >
                              {e.icon && (
                                <GameIcon
                                  value={e.icon}
                                  className="entry-icon"
                                />
                              )}
                              <span>
                                <strong>{e.name}</strong>
                                <code>{e.id}</code>
                              </span>
                            </button>
                          </td>
                          <td>
                            <small>{e.category}</small>
                            <small className="muted">{e.group}</small>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {!(section === '资产资源'
                  ? filteredAssets.length
                  : filtered.length) && (
                  <div className="empty">没有匹配的条目</div>
                )}
              </section>
              <aside className="details">
                {asset ? (
                  <>
                    <div className="detail-heading">
                      <h2>{asset.path.split('/').at(-1)}</h2>
                      <span className="badge">{size(asset.bytes)}</span>
                    </div>
                    {imagePattern.test(asset.url) ? (
                      <div className="image-stage">
                        <img src={asset.url} alt={asset.path} />
                      </div>
                    ) : /\.(mp3|wav|ogg|m4a)$/i.test(asset.url) ? (
                      <AudioPreview key={asset.url} src={asset.url} />
                    ) : (
                      <p>字体资源</p>
                    )}
                    <code className="source">{asset.path}</code>
                    <h3>图标绑定</h3>
                    {asset.names.length ? (
                      asset.names.map((name) => (
                        <button
                          className="binding"
                          key={name}
                          onClick={() => {
                            const e = catalog.entries.find(
                              (e) => e.id === `icon:${name}`,
                            );
                            if (e) choose(e);
                          }}
                        >
                          icon:{name} →
                        </button>
                      ))
                    ) : (
                      <p className="muted">未绑定图标名称</p>
                    )}
                    <h3>静态引用 · {asset.references.length}</h3>
                    <References items={asset.references} select={bySource} />
                  </>
                ) : selected ? (
                  <>
                    <div className="detail-heading">
                      <h2>{selected.name}</h2>
                      <span className="badge">{selected.category}</span>
                    </div>
                    <code>{selected.id}</code>
                    <code className="source">
                      {selected.source}
                      {selected.pointer.length
                        ? `#/${selected.pointer.join('/')}`
                        : ''}
                    </code>
                    <div className="tabs" role="tablist">
                      {['预览', '设定', '引用', '修改'].map((t) => (
                        <button
                          role="tab"
                          aria-selected={tab === t}
                          className={tab === t ? 'active' : ''}
                          key={t}
                          onClick={() => setTab(t)}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                    {tab === '预览' ? (
                      <>
                        {actualImage ? (
                          <>
                            <div className="image-stage">
                              <img src={actualImage} alt={selected.name} />
                            </div>
                            <div className="small-previews">
                              {[24, 32, 40, 64].map((px) => (
                                <div key={px}>
                                  <img
                                    src={actualImage}
                                    style={{ width: px, height: px }}
                                    alt={`${px}px 预览`}
                                  />
                                  <small>{px}px</small>
                                </div>
                              ))}
                            </div>
                          </>
                        ) : iconValue ? (
                          <div className="image-stage">
                            <GameIcon
                              value={iconValue}
                              className="large-icon"
                            />
                          </div>
                        ) : (
                          <div className="definition-title">
                            {selected.name}
                            <small>{selected.group}</small>
                          </div>
                        )}
                        <p>
                          {String(
                            selected.data.description ??
                              selected.data.flavorText ??
                              selected.data.hint ??
                              '',
                          )}
                        </p>
                        {selected.icon && (
                          <button
                            className="binding"
                            onClick={() => {
                              if (iconEntry) choose(iconEntry);
                            }}
                          >
                            {selected.icon} · 查看共用素材 →
                          </button>
                        )}
                        <h3>关联内容</h3>
                        <div className="related">
                          {catalog.entries
                            .filter(
                              (e) =>
                                e.key !== selected.key &&
                                (JSON.stringify(selected.data).includes(
                                  `"${e.id}"`,
                                ) ||
                                  JSON.stringify(e.data).includes(
                                    `"${selected.id}"`,
                                  )),
                            )
                            .slice(0, 100)
                            .map((e) => (
                              <button key={e.key} onClick={() => choose(e)}>
                                {e.name}
                                <small>{e.category}</small>
                              </button>
                            ))}
                        </div>
                      </>
                    ) : tab === '设定' ? (
                      <pre>{JSON.stringify(selected.data, null, 2)}</pre>
                    ) : tab === '引用' ? (
                      <>
                        <References
                          items={catalog.references[selected.id] ?? []}
                          select={bySource}
                        />
                        <h3>同图标内容</h3>
                        {catalog.entries
                          .filter(
                            (e) =>
                              e.key !== selected.key &&
                              e.icon === selected.icon &&
                              selected.icon,
                          )
                          .map((e) => (
                            <button
                              className="binding"
                              key={e.key}
                              onClick={() => choose(e)}
                            >
                              {e.name} · {e.category}
                            </button>
                          ))}
                      </>
                    ) : selected.category === '图标' ? (
                      <>
                        <h3>替换共用素材</h3>
                        <p className="muted">
                          图标名称不变；所有使用 {selected.id} 的内容一起更新。
                        </p>
                        <select
                          aria-label="选择已有图标素材"
                          value={upload ? '' : candidate}
                          onChange={(e) => {
                            setCandidate(e.target.value);
                            setUpload('');
                            setDirty(!!e.target.value);
                          }}
                        >
                          <option value="">选择已有素材</option>
                          {catalog.assets
                            .filter(
                              (a) =>
                                a.url.startsWith('/assets/icons/') &&
                                imagePattern.test(a.url),
                            )
                            .map((a) => (
                              <option key={a.url} value={a.url}>
                                {a.path.split('/').at(-1)}
                              </option>
                            ))}
                        </select>
                        <label className="upload">
                          上传 PNG / WebP
                          <input
                            type="file"
                            accept="image/png,image/webp"
                            onChange={(e) =>
                              void previewUpload(e.target.files?.[0])
                            }
                          />
                        </label>
                        {candidate && (
                          <div className="compare">
                            <div>
                              <small>当前</small>
                              <img src={selected.image} alt="当前素材" />
                            </div>
                            <div>
                              <small>候选</small>
                              <img src={candidate} alt="候选素材" />
                            </div>
                          </div>
                        )}
                        <p className="muted">
                          {catalog.references[selected.id]?.length ?? 0}{' '}
                          处静态引用
                        </p>
                        <button
                          className="primary"
                          disabled={!dirty || !candidate || busy}
                          onClick={() => setConfirm('icon')}
                        >
                          检查并保存替换
                        </button>
                      </>
                    ) : selected.editable ? (
                      <>
                        <h3>基础字段</h3>
                        {['name', 'description', 'flavorText']
                          .filter(
                            (field) => typeof selected.data[field] === 'string',
                          )
                          .map((field) => (
                            <label className="field" key={field}>
                              {field}
                              <textarea
                                value={
                                  patch[field] ?? String(selected.data[field])
                                }
                                onChange={(e) =>
                                  checkDraft(field, e.target.value)
                                }
                              />
                            </label>
                          ))}
                        {selected.icon && (
                          <label className="field">
                            icon
                            <select
                              value={patch.icon ?? selected.icon}
                              onChange={(e) =>
                                checkDraft('icon', e.target.value)
                              }
                            >
                              {catalog.entries
                                .filter((e) => e.category === '图标')
                                .map((e) => (
                                  <option key={e.key} value={e.id}>
                                    {e.id}
                                  </option>
                                ))}
                            </select>
                          </label>
                        )}
                        <button
                          className="primary"
                          disabled={!dirty || busy}
                          onClick={() => setConfirm('content')}
                        >
                          检查并保存设定
                        </button>
                      </>
                    ) : (
                      <p className="muted">
                        当前条目只读。复杂规则和派生目录请在显示的源文件中修改，再刷新索引。
                      </p>
                    )}
                  </>
                ) : (
                  <div className="empty">选择条目查看详情</div>
                )}
              </aside>
            </div>
          </>
        )}
        <footer>
          <span>
            {catalog &&
              `索引时间 ${new Date(catalog.generatedAt).toLocaleTimeString()}`}
          </span>
          <span>{dirty ? '有未保存草稿' : '源文件为唯一事实来源'}</span>
        </footer>
      </div>
      {confirm && selected && (
        <div className="modal-backdrop">
          <section
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="确认写入源文件"
          >
            <h2>确认写入源文件</h2>
            <code>
              {confirm === 'icon' ? selected.source : selected.source}
            </code>
            {confirm === 'icon' ? (
              <>
                <p>
                  替换 {selected.id} 的共用素材，影响{' '}
                  {catalog?.references[selected.id]?.length ?? 0} 处静态引用。
                </p>
                <References
                  items={catalog?.references[selected.id] ?? []}
                  select={() => {}}
                />
                <div className="compare">
                  <img src={selected.image} alt="旧图标" />
                  <img src={candidate} alt="新图标" />
                </div>
              </>
            ) : (
              <pre>
                {Object.entries(patch)
                  .map(
                    ([key, value]) =>
                      `- ${key}: ${String(selected.data[key])}\n+ ${key}: ${value}`,
                  )
                  .join('\n\n')}
              </pre>
            )}
            <p className="muted">
              保存前检查源文件版本；设定使用现有内容包校验。撤销仅作用于本次工作台会话。
            </p>
            <div className="dialog-actions">
              <button disabled={busy} onClick={() => setConfirm(null)}>
                取消
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={() => void save()}
              >
                {busy ? '校验并保存…' : '确认保存'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
