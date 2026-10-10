import type { BattleEvent } from '@daoyou/combat-core/types';
import type {
  BalanceConfig,
  BalanceDetail,
  BalanceOptions,
  BalanceReport,
  BalanceRow,
  BalanceRun,
} from '@daoyou/game-rules/combat/balance';
import { useEffect, useMemo, useRef, useState } from 'react';
import { GameIcon } from '../src/components/ui/GameIcon';
import type { BalanceRequest, BalanceResponse } from './balance-protocol';

const initialConfig: BalanceConfig = {
  mode: 'duel',
  realm: '金丹',
  stage: '中期',
  trials: 10,
  seed: 42,
  boss: 'heretic',
  team: 2,
  attacker: { sect: 'lingxiao', path: 0, equipment: 'ordinary', beast: true },
  defender: { sect: 'jiujie', path: 1, equipment: 'ordinary', beast: true },
};
const percent = (n: number) => `${(n * 100).toFixed(1)}%`;
const control = (s: BalanceRun['sides'][number]) =>
  s.observed ? percent(s.controlled / s.observed) : '—';
const number = (n: number) => Math.round(n).toLocaleString('zh-CN');
function configKey(config: BalanceConfig) {
  const build = (b: BalanceConfig['attacker']) => [
    b.sect,
    b.path,
    b.equipment,
    b.beast,
  ];
  return JSON.stringify([
    config.mode,
    config.realm,
    config.stage,
    build(config.attacker),
    build(config.defender),
    config.trials,
    config.seed,
    config.boss,
    config.team,
  ]);
}
function download(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function BuildFields({
  value,
  options,
  title,
  change,
  matrix,
}: {
  value: BalanceConfig['attacker'];
  options: BalanceOptions;
  title: string;
  change: (value: BalanceConfig['attacker']) => void;
  matrix: boolean;
}) {
  const sect = options.sects.find((s) => s.id === value.sect)!;
  return (
    <fieldset className="balance-build">
      <legend>{title}</legend>
      {!matrix && (
        <label>
          宗门
          <select
            value={value.sect}
            onChange={(e) =>
              change({ ...value, sect: e.target.value as typeof value.sect })
            }
          >
            {options.sects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        流派
        <select
          value={value.path}
          onChange={(e) =>
            change({ ...value, path: Number(e.target.value) as 0 | 1 })
          }
        >
          {[0, 1].map((p) => (
            <option key={p} value={p}>
              {matrix ? `各宗门第 ${p + 1} 流派` : sect.paths[p]}
            </option>
          ))}
        </select>
      </label>
      <label>
        装备
        <select
          value={value.equipment}
          onChange={(e) =>
            change({
              ...value,
              equipment: e.target.value as typeof value.equipment,
            })
          }
        >
          <option value="ordinary">普通道装 · 品质 0</option>
          <option value="none">裸装</option>
        </select>
      </label>
      <label className="balance-check">
        <input
          type="checkbox"
          checked={value.beast}
          onChange={(e) => change({ ...value, beast: e.target.checked })}
        />
        携带参考灵宠（10 级起）
      </label>
    </fieldset>
  );
}
function eventText(event: BattleEvent, detail: BalanceDetail) {
  const unit = (id: string) => {
    const u = detail.units.find((u) => u.id === id);
    return u ? `${u.group.toUpperCase()}·${u.name}` : id;
  };
  if (event.type === 'damage')
    return `${unit(event.sourceId)} → ${unit(event.targetId)} · ${event.kind}伤害 ${number(event.amount)} · 剩余生命 ${number(event.hpAfter)}`;
  if (event.type === 'heal')
    return `${unit(event.sourceId)} → ${unit(event.targetId)} · 治疗 ${number(event.amount)} · 生命 ${number(event.hpAfter)}`;
  if (event.type === 'statusApplied')
    return `${unit(event.unitId)} · ${detail.statuses.find((s) => s.id === event.statusId)?.name ?? event.statusId} · ${event.duration} 回合`;
  if (event.type === 'actionSkip' || event.type === 'actionFailed')
    return `${unit(event.unitId)} · ${event.reason}`;
  return JSON.stringify(event);
}

export default function BalanceOverview() {
  const [options, setOptions] = useState<BalanceOptions>();
  const [config, setConfig] = useState<BalanceConfig>(initialConfig);
  const [report, setReport] = useState<BalanceReport>();
  const [baseline, setBaseline] = useState<BalanceReport>();
  const [progress, setProgress] = useState<{ done: number; total: number }>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [epoch, setEpoch] = useState(0);
  const [selected, setSelected] = useState('');
  const [flagged, setFlagged] = useState(false);
  const [detail, setDetail] = useState<BalanceDetail>();
  const [runIndex, setRunIndex] = useState(0);
  const [round, setRound] = useState(1);
  const [workerReady, setWorkerReady] = useState(false);
  const worker = useRef<Worker | null>(null);
  useEffect(() => {
    const instance = new Worker(
      new URL('./balance.worker.ts', import.meta.url),
      { type: 'module' },
    );
    worker.current = instance;
    instance.onmessage = (event: MessageEvent<BalanceResponse>) => {
      const message = event.data;
      if (message.type === 'ready') {
        setOptions(message.options);
        setWorkerReady(true);
      }
      if (message.type === 'progress') setProgress(message);
      if (message.type === 'complete') {
        setReport(message.report);
        setSelected(message.report.rows[0]?.match.id ?? '');
        setRunIndex(0);
        setDetail(undefined);
        setLoading(false);
        setProgress(undefined);
      }
      if (message.type === 'detail') {
        setDetail(message.detail);
        setRound(1);
        setLoading(false);
      }
      if (message.type === 'error') {
        setError(message.error);
        setLoading(false);
        setProgress(undefined);
      }
    };
    instance.onerror = (event) => {
      setError(event.message || '模拟 Worker 加载失败，请重新加载工作台');
      setLoading(false);
      setProgress(undefined);
      setWorkerReady(false);
    };
    return () => {
      instance.terminate();
      worker.current = null;
    };
  }, [epoch]);
  const send = (message: BalanceRequest) => {
    setError('');
    setLoading(true);
    if (message.type === 'run')
      setProgress({
        done: 0,
        total:
          config.trials *
          (config.mode === 'matrix' ? (options?.sects.length ?? 5) ** 2 : 1) *
          (config.mode === 'hunt' ? 1 : 2),
      });
    worker.current?.postMessage(message);
  };
  const cancel = () => {
    worker.current?.terminate();
    setWorkerReady(false);
    setLoading(false);
    setProgress(undefined);
    setEpoch((n) => n + 1);
  };
  const choose = (row: BalanceRow) => {
    setSelected(row.match.id);
    setRunIndex(0);
    setDetail(undefined);
  };
  const row = report?.rows.find((r) => r.match.id === selected);
  const configChanged =
    report && configKey(report.config) !== configKey(config);
  const comparable =
    baseline &&
    report &&
    configKey(baseline.config) === configKey(report.config) &&
    JSON.stringify(baseline.versions) === JSON.stringify(report.versions);
  const counts = report?.rows.reduce(
    (a, r) => ({
      games: a.games + r.summary.games,
      flags: a.flags + Number(r.summary.flags.length > 0),
      limits: a.limits + r.summary.limitRounds,
    }),
    { games: 0, flags: 0, limits: 0 },
  );
  const events = useMemo(() => {
    let currentRound = 0;
    const selectedEvents: {
      event: BattleEvent;
      round: number;
      index: number;
    }[] = [];
    for (const [index, event] of (detail?.events ?? []).entries()) {
      if (event.type === 'roundStart') currentRound = event.round;
      if (currentRound === round)
        selectedEvents.push({ event, round: currentRound, index });
    }
    return selectedEvents;
  }, [detail, round]);
  return (
    <main className="balance-overview">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setDetail(undefined);
          send({ type: 'run', config });
        }}
      >
        <fieldset disabled={loading || !workerReady} className="balance-setup">
          <legend>模拟条件</legend>
          <div className="balance-fields">
            <label>
              场景
              <select
                value={config.mode}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    mode: e.target.value as BalanceConfig['mode'],
                    realm:
                      e.target.value === 'hunt' &&
                      ['炼气', '筑基'].includes(config.realm)
                        ? '金丹'
                        : config.realm,
                  })
                }
              >
                <option value="duel">单组对战</option>
                <option value="matrix">宗门对战矩阵</option>
                <option value="hunt">讨伐 · 同构筑队伍</option>
              </select>
            </label>
            <label>
              境界
              <select
                value={config.realm}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    realm: e.target.value as BalanceConfig['realm'],
                  })
                }
              >
                {options?.realms
                  .filter(
                    (r) =>
                      config.mode !== 'hunt' || !['炼气', '筑基'].includes(r),
                  )
                  .map((r) => (
                    <option key={r}>{r}</option>
                  ))}
              </select>
            </label>
            <label>
              阶段
              <select
                value={config.stage}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    stage: e.target.value as BalanceConfig['stage'],
                  })
                }
              >
                {options?.stages.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              每组种子数
              <input
                type="number"
                min={1}
                max={20}
                step={1}
                required
                value={config.trials}
                onChange={(e) =>
                  setConfig({ ...config, trials: e.target.valueAsNumber })
                }
              />
            </label>
            <label>
              起始种子
              <input
                type="number"
                min={0}
                max={2147483600}
                step={1}
                required
                value={config.seed}
                onChange={(e) =>
                  setConfig({ ...config, seed: e.target.valueAsNumber })
                }
              />
            </label>
            {config.mode === 'hunt' && (
              <>
                <label>
                  首领
                  <select
                    value={config.boss}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        boss: e.target.value as BalanceConfig['boss'],
                      })
                    }
                  >
                    {options?.bosses.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  队伍人数
                  <select
                    value={config.team}
                    onChange={(e) =>
                      setConfig({ ...config, team: Number(e.target.value) })
                    }
                  >
                    {[2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        {n} 人
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </div>
          {options && (
            <div className="balance-builds">
              <BuildFields
                title={config.mode === 'hunt' ? '全队参考构筑' : 'A 组构筑'}
                value={config.attacker}
                options={options}
                matrix={config.mode === 'matrix'}
                change={(attacker) => setConfig({ ...config, attacker })}
              />
              {config.mode !== 'hunt' && (
                <BuildFields
                  title="B 组构筑"
                  value={config.defender}
                  options={options}
                  matrix={config.mode === 'matrix'}
                  change={(defender) => setConfig({ ...config, defender })}
                />
              )}
            </div>
          )}
        </fieldset>
        <div className="balance-actions">
          <button
            className="primary"
            type="submit"
            disabled={loading || !workerReady}
          >
            <GameIcon value="▶" />
            运行模拟
          </button>
          {loading && (
            <button type="button" onClick={cancel} title="终止当前模拟">
              <GameIcon value="■" />
              取消
            </button>
          )}
          <span role="status" className="muted">
            {loading
              ? progress
                ? `${progress.done} / ${progress.total} 局`
                : '读取单局战报…'
              : options
                ? `${config.mode === 'matrix' ? options.sects.length ** 2 : 1} 组 · ${config.trials * (config.mode === 'matrix' ? options.sects.length ** 2 : 1) * (config.mode === 'hunt' ? 1 : 2)} 局`
                : '正在加载模拟器'}
          </span>
          <button
            type="button"
            disabled={!report || loading}
            onClick={() =>
              report && download(report, 'daoyou-balance-report.json')
            }
            title="导出当前报告"
          >
            <GameIcon value="↓" />
            导出报告
          </button>
          <button
            type="button"
            disabled={!report || loading}
            onClick={() => setBaseline(report)}
          >
            设为对照
          </button>
          {baseline && (
            <button type="button" onClick={() => setBaseline(undefined)}>
              清除对照
            </button>
          )}
        </div>
        {progress && (
          <progress
            max={progress.total}
            value={progress.done}
            aria-label="模拟进度"
          />
        )}
      </form>
      {error && (
        <div className="alert danger" role="alert">
          {error}
        </div>
      )}
      {report && (
        <>
          <div className="balance-report-heading">
            <h2>
              {report.config.realm}·{report.config.stage} /{' '}
              {report.config.mode === 'hunt'
                ? '讨伐'
                : report.config.mode === 'matrix'
                  ? '宗门矩阵'
                  : '单组对战'}
            </h2>
            <span className="muted">
              {new Date(report.completedAt).toLocaleString('zh-CN')}
            </span>
          </div>
          {configChanged && (
            <div className="alert">条件已改变，以下仍是上次运行的结果。</div>
          )}
          {baseline && (
            <div className="alert">
              {comparable
                ? `对照：${new Date(baseline.completedAt).toLocaleString('zh-CN')}`
                : '对照条件或版本不同，暂不计算差值。'}
            </div>
          )}
          <div className="summary-strip">
            <div>
              <strong>{report.rows.length}</strong>
              <span>对战组</span>
            </div>
            <div>
              <strong>{counts?.games}</strong>
              <span>已完成对局</span>
            </div>
            <div>
              <strong>{counts?.flags}</strong>
              <span>待核查组</span>
            </div>
            <div>
              <strong>{counts?.limits}</strong>
              <span>达到回合上限</span>
            </div>
          </div>
          <details className="balance-scope">
            <summary>构筑与统计口径</summary>
            <p>{report.reference}</p>
            <p>
              人物采用当前 V6 投影、流派与自动决策；PvP
              每个种子交换双方站位，讨伐全员使用相同构筑、敌方使用当前讨伐决策。胜率为
              A 胜局 / 全部局，平局不算胜；95% Wilson
              区间仅供小样本参考，交换站位的同种子样本并非完全独立。
            </p>
            <p>
              伤害统计仅计对敌的 damage
              事件，包含过量伤害、不含护盾吸收；峰值比例以目标开战时最大生命为分母。治疗按
              heal 事件统计。受控率为回合初仍存活、在场单位中带 control
              类状态的单位回合比例，含灵宠；不代表实际封印命中率。疑点是筛查提示，不是平衡结论。
            </p>
            <pre>
              {JSON.stringify(
                { config: report.config, versions: report.versions },
                null,
                2,
              )}
            </pre>
          </details>
          {report.config.mode === 'matrix' && options && (
            <div className="balance-table-scroll">
              <table className="balance-matrix">
                <caption>A 行对 B 列 · A 胜率</caption>
                <thead>
                  <tr>
                    <th>宗门</th>
                    {options.sects.map((s) => (
                      <th key={s.id}>{s.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {options.sects.map((a) => (
                    <tr key={a.id}>
                      <th>{a.name}</th>
                      {options.sects.map((b) => {
                        const r = report.rows.find(
                          (r) => r.match.id === `${a.id}/${b.id}`,
                        )!;
                        return (
                          <td key={b.id}>
                            <button
                              disabled={loading}
                              className={
                                r.summary.winRate >= 0.8
                                  ? 'balance-high'
                                  : r.summary.winRate <= 0.2
                                    ? 'balance-low'
                                    : ''
                              }
                              onClick={() => choose(r)}
                              title={r.match.label}
                            >
                              {percent(r.summary.winRate)}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="balance-report-heading">
            <h2>对战结果</h2>
            <label className="balance-check">
              <input
                type="checkbox"
                checked={flagged}
                onChange={(e) => setFlagged(e.target.checked)}
              />
              仅待核查
            </label>
          </div>
          <div className="balance-table-scroll">
            <table className="balance-results">
              <thead>
                <tr>
                  <th>对战组</th>
                  <th>A 胜 / 负 / 平</th>
                  <th>A 胜率 / 95% 区间</th>
                  {comparable && <th>胜率变化</th>}
                  <th>平均回合 / 范围</th>
                  <th>单段峰值 A / B</th>
                  <th>峰值生命比 A / B</th>
                  <th title="各自被控制的单位回合比例">受控率 A / B</th>
                  <th>待核查</th>
                </tr>
              </thead>
              <tbody>
                {report.rows
                  .filter((r) => !flagged || r.summary.flags.length > 0)
                  .map((r) => {
                    const s = r.summary;
                    const old = comparable
                      ? baseline?.rows.find((p) => p.match.id === r.match.id)
                      : undefined;
                    return (
                      <tr
                        key={r.match.id}
                        className={selected === r.match.id ? 'selected' : ''}
                      >
                        <td>
                          <button disabled={loading} onClick={() => choose(r)}>
                            {r.match.label}
                          </button>
                        </td>
                        <td className="font-mono">
                          {s.wins} / {s.losses} / {s.draws}
                        </td>
                        <td className="font-mono">
                          {percent(s.winRate)}
                          <small>
                            {percent(s.interval[0])}–{percent(s.interval[1])}
                          </small>
                        </td>
                        {comparable && (
                          <td className="font-mono">
                            {old
                              ? `${((s.winRate - old.summary.winRate) * 100).toFixed(1)} pp`
                              : '—'}
                          </td>
                        )}
                        <td className="font-mono">
                          {s.averageRounds.toFixed(1)}
                          <small>
                            {s.minRounds}–{s.maxRounds}
                          </small>
                        </td>
                        <td className="font-mono">
                          {number(s.sides[0].peakDamage)} /{' '}
                          {number(s.sides[1].peakDamage)}
                        </td>
                        <td className="font-mono">
                          {percent(s.sides[0].peakHpRatio)} /{' '}
                          {percent(s.sides[1].peakHpRatio)}
                        </td>
                        <td className="font-mono">
                          {control(s.sides[0])} / {control(s.sides[1])}
                        </td>
                        <td className="balance-flags">
                          {s.flags.join('；') || '—'}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          {flagged && !report.rows.some((r) => r.summary.flags.length) && (
            <p className="muted">当前样本没有触发筛查提示。</p>
          )}
          {row && (
            <section className="balance-inspector">
              <h2>{row.match.label}</h2>
              <div className="balance-fields">
                <div>
                  <span className="muted">每局平均气血伤害 A / B</span>
                  <p className="font-mono">
                    {number(row.summary.sides[0].damage / row.summary.games)} /{' '}
                    {number(row.summary.sides[1].damage / row.summary.games)}
                  </p>
                </div>
                <div>
                  <span className="muted">每局平均治疗 A / B</span>
                  <p className="font-mono">
                    {number(row.summary.sides[0].healing / row.summary.games)} /{' '}
                    {number(row.summary.sides[1].healing / row.summary.games)}
                  </p>
                </div>
              </div>
              <div className="balance-actions">
                <label>
                  单局
                  <select
                    disabled={loading}
                    value={runIndex}
                    onChange={(e) => {
                      setRunIndex(Number(e.target.value));
                      setDetail(undefined);
                    }}
                  >
                    {row.runs.map((r, i) => (
                      <option key={i} value={i}>
                        种子 {r.seed} · {r.swapped ? '交换站位' : '原站位'} ·{' '}
                        {r.winner === 'draw'
                          ? '平局'
                          : `${r.winner.toUpperCase()} 胜`}{' '}
                        · {r.rounds} 回合
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  disabled={loading || !workerReady}
                  onClick={() => {
                    const run = row.runs[runIndex];
                    setDetail(undefined);
                    send({
                      type: 'detail',
                      config: report.config,
                      job: {
                        match: row.match,
                        seed: run.seed,
                        swapped: run.swapped,
                      },
                    });
                  }}
                >
                  重现单局
                </button>
                {detail && (
                  <button
                    onClick={() =>
                      download(
                        {
                          config: report.config,
                          match: row.match,
                          versions: report.versions,
                          ...detail,
                        },
                        'daoyou-balance-battle.json',
                      )
                    }
                    title="导出完整单局战报"
                  >
                    <GameIcon value="↓" />
                    导出战报
                  </button>
                )}
              </div>
              {detail && (
                <>
                  <h3>开战面板</h3>
                  <div className="balance-table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>组 / 单位</th>
                          <th>生命</th>
                          <th>法力</th>
                          <th>物攻 / 法攻</th>
                          <th>物防 / 法防</th>
                          <th>速度</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.units.map((u) => (
                          <tr key={u.id}>
                            <td>
                              <span className={`balance-group ${u.group}`}>
                                {u.group.toUpperCase()}
                              </span>
                              {u.name}
                              <small>{u.id}</small>
                            </td>
                            <td className="font-mono">
                              {number(u.attrs.maxHp ?? 0)}
                            </td>
                            <td className="font-mono">
                              {number(u.attrs.maxMp ?? 0)}
                            </td>
                            <td className="font-mono">
                              {number(u.attrs.physicalAtk ?? 0)} /{' '}
                              {number(u.attrs.magicAtk ?? 0)}
                            </td>
                            <td className="font-mono">
                              {number(u.attrs.physicalDef ?? 0)} /{' '}
                              {number(u.attrs.magicDef ?? 0)}
                            </td>
                            <td className="font-mono">
                              {number(u.attrs.speed ?? 0)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="balance-report-heading">
                    <h3>逐回合事件</h3>
                    <select
                      aria-label="战报回合"
                      value={round}
                      onChange={(e) => setRound(Number(e.target.value))}
                    >
                      {Array.from({ length: detail.run.rounds + 1 }, (_, n) => (
                        <option key={n} value={n}>
                          {n === 0 ? '开战' : `第 ${n} 回合`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="balance-events">
                    {events.slice(0, 300).map(({ event, index }) => (
                      <div key={index}>
                        <code className="font-mono">{index}</code>
                        <b>{event.type}</b>
                        <span>{eventText(event, detail)}</span>
                      </div>
                    ))}
                  </div>
                  {events.length > 300 && (
                    <p className="muted">
                      本回合共 {events.length} 条，显示前 300
                      条；导出战报包含全部事件。
                    </p>
                  )}
                </>
              )}
            </section>
          )}
        </>
      )}
      {!report && !loading && options && (
        <div className="balance-empty">
          <h2>尚无模拟结果</h2>
          <span className="muted">{options.reference}</span>
        </div>
      )}
    </main>
  );
}
