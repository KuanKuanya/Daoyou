import { describe, expect, it } from 'vitest';
import {
  balanceOptions,
  balancePlan,
  balanceWinInterval,
  simulateBalanceJob,
  summarizeBalance,
  type BalanceConfig,
} from './balance.js';

const config: BalanceConfig = {
  mode: 'duel',
  realm: '金丹',
  stage: '中期',
  trials: 2,
  seed: 42,
  boss: 'heretic',
  team: 2,
  attacker: { sect: 'lingxiao', path: 0, equipment: 'ordinary', beast: true },
  defender: { sect: 'jiujie', path: 1, equipment: 'ordinary', beast: true },
};
describe('开发平衡模拟', () => {
  it('所有开放境界、阶段及宗门流派的参考构筑都能结算', () => {
    for (const realm of balanceOptions.realms)
      for (const stage of balanceOptions.stages)
        for (const sect of balanceOptions.sects)
          for (const path of [0, 1] as const) {
            const plan = balancePlan({
              ...config,
              realm,
              stage,
              trials: 1,
              attacker: { ...config.attacker, sect: sect.id, path },
            });
            const result = simulateBalanceJob(plan.config, plan.jobs[0]);
            expect(
              result.run.rounds,
              `${realm}/${stage}/${sect.id}/${path}`,
            ).toBeLessThanOrEqual(100);
            expect(['a', 'b', 'draw']).toContain(result.run.winner);
          }
  }, 30000);
  it('每个种子交换两次站位，矩阵完整覆盖当前五宗门', () => {
    const plan = balancePlan(config);
    expect(plan.jobs.map((j) => [j.seed, j.swapped])).toEqual([
      [42, false],
      [42, true],
      [43, false],
      [43, true],
    ]);
    const matrix = balancePlan({ ...config, mode: 'matrix' });
    expect(matrix.cases).toHaveLength(25);
    expect(matrix.jobs).toHaveLength(100);
    expect(() => balancePlan({ ...config, trials: 21 })).toThrow();
    expect(() =>
      balancePlan({ ...config, mode: 'hunt', realm: '炼气' }),
    ).toThrow();
  });
  it('独立角色与灵宠 ID，固定种子可以精确重现战报', () => {
    const job = balancePlan(config).jobs[0];
    const a = simulateBalanceJob(config, job, true);
    const b = simulateBalanceJob(config, job, true);
    expect(a).toEqual(b);
    expect(new Set(a.units.map((u) => u.id)).size).toBe(a.units.length);
    expect(a.units.filter((u) => u.kind === 'pet')).toHaveLength(2);
    expect(a.run.rounds).toBeGreaterThan(0);
    expect(a.run.rounds).toBeLessThanOrEqual(100);
    expect(a.events.some((e) => e.type === 'battleEnd')).toBe(true);
    const swapped = simulateBalanceJob(config, { ...job, swapped: true }, true);
    expect(
      swapped.units.find((u) => u.group === 'a' && u.kind === 'player')?.id,
    ).toBe(a.units.find((u) => u.group === 'a' && u.kind === 'player')?.id);
    expect(swapped.run.winner).toBe(
      swapped.run.result.winner === 'draw'
        ? 'draw'
        : swapped.run.result.winner === 1
          ? 'a'
          : 'b',
    );
  });
  it('裸装无宠和同构筑讨伐都通过当前投影与引擎', () => {
    const bare = {
      ...config,
      attacker: {
        ...config.attacker,
        equipment: 'none' as const,
        beast: false,
      },
      defender: { ...config.defender, beast: false },
    };
    expect(
      simulateBalanceJob(bare, balancePlan(bare).jobs[0]).units.some(
        (u) => u.kind === 'pet',
      ),
    ).toBe(false);
    const hunt = balancePlan({ ...config, mode: 'hunt', team: 4 });
    expect(hunt.jobs).toHaveLength(2);
    const result = simulateBalanceJob(hunt.config, hunt.jobs[0], true);
    expect(result.units.filter((u) => u.kind === 'player')).toHaveLength(4);
    expect(new Set(result.units.map((u) => u.id)).size).toBe(
      result.units.length,
    );
    expect(result.events.some((e) => e.type === 'battleEnd')).toBe(true);
  });
  it('空样本不伪造胜率证据，Wilson 区间在边界仍反映不确定性', () => {
    expect(balanceWinInterval(0, 0)).toEqual([0, 1]);
    expect(balanceWinInterval(10, 10)[0]).toBeCloseTo(0.7225, 3);
    expect(balanceWinInterval(0, 10)[1]).toBeCloseTo(0.2775, 3);
    expect(summarizeBalance([]).averageRounds).toBe(0);
    const job = balancePlan(config).jobs[0];
    const run = simulateBalanceJob(config, job).run;
    const summary = summarizeBalance([run]);
    expect(summary.wins + summary.losses + summary.draws).toBe(1);
    expect(summary.sides[0].damage).toBe(run.sides[0].damage);
    expect(summary.sides[0].controlled).toBeLessThanOrEqual(
      summary.sides[0].observed,
    );
    expect(summary.averageRounds).toBe(run.rounds);
  });
});
