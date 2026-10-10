import { createBattle } from '@daoyou/combat-core/session';
import type {
  Attrs,
  BattleEvent,
  BattleResult,
  CreateBattleInput,
  LineupUnit,
  StatusDef,
} from '@daoyou/combat-core/types';
import { REALM_STAGE_VALUES, REALM_VALUES } from '@daoyou/constants/realms';
import { BEAST_SKILLS, BEAST_STATUS_DEFS } from '@daoyou/game-content/beasts';
import {
  HUNT_BOSSES,
  HUNT_SKILLS,
  HUNT_STATUSES,
} from '@daoyou/game-content/hunts';
import { COMBAT_V6_SECT_DEFINITIONS } from '@daoyou/game-content/sects';
import type {
  CombatV6SectId,
  CombatV6TrainingPlayerInput,
} from '@daoyou/game-domain/combat';
import { COMBAT_V6_CHARACTER_BUILD_VERSIONS } from '@daoyou/game-domain/combat';
import { AUTO_POLICY_VERSION } from '@daoyou/game-domain/combat/auto';
import type { HuntBossId } from '@daoyou/game-domain/hunts';
import { getRealmStageLevel } from '@daoyou/game-domain/progression';
import { z } from 'zod';
import { projectBeastRoster } from '../beasts/projection.js';
import { huntEventsAt } from '../hunts/config.js';
import { huntEnemies, huntNpcCommand } from '../hunts/content.js';
import { towerReferenceBuild } from '../tower/reference-fixtures.js';
import { automaticCommands } from './auto.js';
import { daoyouRulesetV6 } from './daoyou/index.js';
import { characterBattleSkills } from './projection/character-battle-skills.js';
import { projectCharacterToCombatV6 } from './projection/project-character.js';
import { compileRankingBattle } from './ranking/battle.js';

const sectIds = Object.keys(COMBAT_V6_SECT_DEFINITIONS) as CombatV6SectId[];
const bossIds = Object.keys(HUNT_BOSSES) as HuntBossId[];
const buildSchema = z
  .object({
    sect: z.enum(sectIds),
    path: z.union([z.literal(0), z.literal(1)]),
    equipment: z.enum(['ordinary', 'none']),
    beast: z.boolean(),
  })
  .strict();
export const BalanceConfigSchema = z
  .object({
    mode: z.enum(['duel', 'matrix', 'hunt']),
    realm: z.enum(REALM_VALUES),
    stage: z.enum(REALM_STAGE_VALUES),
    attacker: buildSchema,
    defender: buildSchema,
    trials: z.number().int().min(1).max(20),
    seed: z.number().int().min(0).max(2_147_483_600),
    boss: z.enum(bossIds),
    team: z.number().int().min(2).max(4),
  })
  .strict()
  .refine(
    (c) => c.mode !== 'hunt' || REALM_VALUES.indexOf(c.realm) >= 2,
    '讨伐只开放金丹及以上境界',
  );
export type BalanceConfig = z.infer<typeof BalanceConfigSchema>;
type Build = BalanceConfig['attacker'];
export const balanceOptions = {
  realms: [...REALM_VALUES],
  stages: [...REALM_STAGE_VALUES],
  sects: sectIds.map((id) => ({
    id,
    name: COMBAT_V6_SECT_DEFINITIONS[id].name,
    paths: COMBAT_V6_SECT_DEFINITIONS[id].paths.map((p) => p.name),
  })),
  bosses: bossIds.map((id) => ({ id, name: HUNT_BOSSES[id].name })),
  versions: {
    ...COMBAT_V6_CHARACTER_BUILD_VERSIONS,
    autoPolicyVersion: AUTO_POLICY_VERSION,
  },
  reference:
    'tower-reference-v1 / 普通成长、空个人功法、经脉深度 0；装备品质 0；固定磐石野猪（10 级起）；双方满血满蓝',
};
export type BalanceOptions = typeof balanceOptions;
export type BalanceCase = {
  id: string;
  label: string;
  attacker: Build;
  defender?: Build;
  boss?: HuntBossId;
};
export type BalanceJob = { match: BalanceCase; seed: number; swapped: boolean };
export type BalanceSideMetrics = {
  damage: number;
  healing: number;
  peakDamage: number;
  peakHpRatio: number;
  controlled: number;
  observed: number;
};
export type BalanceRun = {
  seed: number;
  swapped: boolean;
  rounds: number;
  result: BattleResult;
  winner: 'a' | 'b' | 'draw';
  sides: [BalanceSideMetrics, BalanceSideMetrics];
};
export type BalanceUnit = {
  id: string;
  name: string;
  group: 'a' | 'b';
  kind: LineupUnit['kind'];
  attrs: Partial<Attrs>;
};
export type BalanceDetail = {
  run: BalanceRun;
  units: BalanceUnit[];
  events: BattleEvent[];
  statuses: Pick<StatusDef, 'id' | 'name'>[];
};
export type BalanceSummary = {
  games: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  interval: [number, number];
  averageRounds: number;
  minRounds: number;
  maxRounds: number;
  limitRounds: number;
  sides: [BalanceSideMetrics, BalanceSideMetrics];
  flags: string[];
};
export type BalanceRow = {
  match: BalanceCase;
  runs: BalanceRun[];
  summary: BalanceSummary;
};
export type BalanceReport = {
  config: BalanceConfig;
  versions: BalanceOptions['versions'];
  reference: string;
  completedAt: string;
  rows: BalanceRow[];
};

export function balancePlan(raw: unknown): {
  config: BalanceConfig;
  cases: BalanceCase[];
  jobs: BalanceJob[];
} {
  const config = BalanceConfigSchema.parse(raw);
  const name = (b: Build) =>
    `${COMBAT_V6_SECT_DEFINITIONS[b.sect].name}·${COMBAT_V6_SECT_DEFINITIONS[b.sect].paths[b.path].name}`;
  const cases: BalanceCase[] =
    config.mode === 'matrix'
      ? sectIds.flatMap((a) =>
          sectIds.map((b) => ({
            id: `${a}/${b}`,
            label: `${name({ ...config.attacker, sect: a })} / ${name({ ...config.defender, sect: b })}`,
            attacker: { ...config.attacker, sect: a },
            defender: { ...config.defender, sect: b },
          })),
        )
      : config.mode === 'hunt'
        ? [
            {
              id: `hunt/${config.boss}`,
              label: `${name(config.attacker)}队 / ${HUNT_BOSSES[config.boss].name}`,
              attacker: config.attacker,
              boss: config.boss,
            },
          ]
        : [
            {
              id: 'duel',
              label: `${name(config.attacker)} / ${name(config.defender)}`,
              attacker: config.attacker,
              defender: config.defender,
            },
          ];
  const jobs = cases.flatMap((match) =>
    Array.from({ length: config.trials }, (_, i) =>
      (config.mode === 'hunt' ? [false] : [false, true]).map((swapped) => ({
        match,
        seed: config.seed + i,
        swapped,
      })),
    ).flat(),
  );
  return { config, cases, jobs };
}

function player(
  config: BalanceConfig,
  build: Build,
  index: number,
): CombatV6TrainingPlayerInput {
  const input = towerReferenceBuild(
    build.sect,
    config.realm,
    config.stage,
    build.path,
  );
  const id = `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
  input.cultivator.id = id;
  input.cultivator.name = COMBAT_V6_SECT_DEFINITIONS[build.sect].name;
  if (build.equipment === 'none') input.equipment = {};
  if (input.beasts) {
    const petId = `00000000-0000-4000-9000-${String(index + 1).padStart(12, '0')}`;
    for (const beast of input.beasts.beasts) {
      beast.ownerCultivatorId = id;
      beast.id = petId;
    }
    input.beasts.lineup.carriedBeastIds = [petId];
    input.beasts.lineup.leadBeastId = petId;
    if (!build.beast) input.beasts = undefined;
  }
  return input;
}

function encounter(config: BalanceConfig, job: BalanceJob): CreateBattleInput {
  if (job.match.defender) {
    const players: [CombatV6TrainingPlayerInput, CombatV6TrainingPlayerInput] =
      [
        player(config, job.match.attacker, 0),
        player(config, job.match.defender, 1),
      ];
    const compiled = compileRankingBattle(
      job.swapped ? [players[1], players[0]] : players,
      job.seed,
    );
    return { ...compiled, ruleset: daoyouRulesetV6 };
  }
  const event = huntEventsAt(100000).find((e) => e.realm === config.realm);
  if (!event || !job.match.boss) throw new Error('讨伐境界或首领无效');
  const skills = new Map(
    [...BEAST_SKILLS, ...HUNT_SKILLS].map((s) => [s.id, s]),
  );
  const statuses = new Map(
    [...BEAST_STATUS_DEFS, ...HUNT_STATUSES].map((s) => [s.id, s]),
  );
  const units: LineupUnit[] = [];
  for (let slot = 0; slot < config.team; slot++) {
    // Same build on every team member: no hidden support substitutions.
    const input = player(config, job.match.attacker, slot);
    const p = projectCharacterToCombatV6({
      ...input,
      side: 0,
      slot,
      resourcePolicy: 'full',
    });
    if (!p.ok) throw new Error(p.diagnostics.map((d) => d.message).join('\n'));
    units.push(
      characterBattleSkills(p.unit, p.skills, skills),
      ...projectBeastRoster(
        input.beasts,
        input.cultivator.id,
        0,
        slot,
        p.unit.level,
      ),
    );
    for (const status of p.statusDefs) statuses.set(status.id, status);
  }
  return {
    seed: job.seed,
    ruleset: daoyouRulesetV6,
    versions: {
      ...balanceOptions.versions,
      rulesetVersion: 'daoyou_rules_v11',
      contentVersion: 'daoyou_character_build_content_v5',
    },
    units: [
      ...units,
      ...huntEnemies(
        {
          ...event,
          bossId: job.match.boss,
          level: getRealmStageLevel(config.realm, config.stage),
        },
        config.team,
      ),
    ],
    skills: [...skills.values()],
    statusDefs: [...statuses.values()],
  };
}

function emptyMetrics(): BalanceSideMetrics {
  return {
    damage: 0,
    healing: 0,
    peakDamage: 0,
    peakHpRatio: 0,
    controlled: 0,
    observed: 0,
  };
}
export function simulateBalanceJob(
  config: BalanceConfig,
  job: BalanceJob,
  detail = false,
): BalanceDetail {
  const input = encounter(config, job);
  const battle = createBattle(input);
  const initial = battle.snapshot();
  const sides: [BalanceSideMetrics, BalanceSideMetrics] = [
    emptyMetrics(),
    emptyMetrics(),
  ];
  const controls = new Set(
    input.statusDefs?.filter((s) => s.category === 'control').map((s) => s.id),
  );
  const group = (side: number) => (job.swapped ? 1 - side : side) as 0 | 1;
  const allEvents: BattleEvent[] = [];
  let rounds = 0;
  function collect() {
    for (const event of battle.drain()) {
      if (detail) allEvents.push(event);
      if (event.type !== 'damage' && event.type !== 'heal') continue;
      const source = initial.units.find((u) => u.id === event.sourceId);
      const target = initial.units.find((u) => u.id === event.targetId);
      if (!source || !target) continue;
      if (!Number.isFinite(event.amount))
        throw new Error('战斗产生非有限伤害或治疗');
      const stats = sides[group(source.side)];
      if (event.type === 'heal') stats.healing += event.amount;
      else if (source.side !== target.side) {
        stats.damage += event.amount;
        stats.peakDamage = Math.max(stats.peakDamage, event.amount);
        stats.peakHpRatio = Math.max(
          stats.peakHpRatio,
          event.amount / target.attrs.maxHp,
        );
      }
    }
  }
  collect();
  while (!battle.finished && rounds < daoyouRulesetV6.maxRounds) {
    const state = battle.snapshot();
    for (const unit of state.units) {
      if (
        unit.attrs.hp <= 0 ||
        unit.flags.dead ||
        unit.flags.downed ||
        unit.flags.benched ||
        unit.flags.escaped
      )
        continue;
      const stats = sides[group(unit.side)];
      stats.observed++;
      if (unit.statuses.some((s) => controls.has(s.id))) stats.controlled++;
    }
    const commands = state.units
      .filter((u) => u.kind === 'player')
      .flatMap((unit) =>
        automaticCommands(
          state,
          unit.id,
          input.skills ?? [],
          (id) => battle.queryCommands(id),
          { statusDefs: input.statusDefs },
        ),
      );
    for (const entry of commands)
      if (battle.queryCommands(entry.unitId).canSubmit)
        battle.submit(entry.unitId, entry.command);
    if (config.mode === 'hunt')
      for (const unit of state.units.filter((u) => u.side === 1)) {
        if (battle.queryCommands(unit.id).canSubmit)
          battle.submit(unit.id, huntNpcCommand({ state }, unit.id));
      }
    battle.lockAndResolve();
    rounds++;
    collect();
  }
  const result = battle.snapshot().result;
  if (!result) throw new Error('引擎到达回合上限却未结算');
  return {
    run: {
      seed: job.seed,
      swapped: job.swapped,
      rounds,
      result,
      winner:
        result.winner === 'draw'
          ? 'draw'
          : group(result.winner) === 0
            ? 'a'
            : 'b',
      sides,
    },
    units: initial.units.map((u) => ({
      id: u.id,
      name: u.name,
      kind: u.kind,
      group: group(u.side) === 0 ? 'a' : 'b',
      attrs: u.attrs,
    })),
    events: allEvents,
    statuses: (input.statusDefs ?? []).map((s) => ({ id: s.id, name: s.name })),
  };
}

/** Wilson score interval, z=1.96; draws count as non-wins. */
export function balanceWinInterval(
  wins: number,
  games: number,
): [number, number] {
  if (games === 0) return [0, 1];
  const p = wins / games;
  const z2 = 1.96 ** 2;
  const center = (p + z2 / (2 * games)) / (1 + z2 / games);
  const span =
    (1.96 * Math.sqrt((p * (1 - p)) / games + z2 / (4 * games ** 2))) /
    (1 + z2 / games);
  return [Math.max(0, center - span), Math.min(1, center + span)];
}
export function summarizeBalance(runs: BalanceRun[]): BalanceSummary {
  const games = runs.length;
  const wins = runs.filter((r) => r.winner === 'a').length;
  const losses = runs.filter((r) => r.winner === 'b').length;
  const sides: [BalanceSideMetrics, BalanceSideMetrics] = [
    emptyMetrics(),
    emptyMetrics(),
  ];
  for (const run of runs)
    for (const index of [0, 1] as const) {
      const stats = sides[index];
      const next = run.sides[index];
      stats.damage += next.damage;
      stats.healing += next.healing;
      stats.controlled += next.controlled;
      stats.observed += next.observed;
      stats.peakDamage = Math.max(stats.peakDamage, next.peakDamage);
      stats.peakHpRatio = Math.max(stats.peakHpRatio, next.peakHpRatio);
    }
  const limitRounds = runs.filter(
    (r) => r.result.reason === 'round-limit',
  ).length;
  const flags: string[] = [];
  if (limitRounds) flags.push(`回合上限 ${limitRounds} 局`);
  if (runs.some((r) => r.rounds <= 2)) flags.push('存在两回合内结束');
  if (sides.some((s) => s.peakHpRatio >= 1))
    flags.push('单段伤害达到目标初始生命');
  if (sides.some((s) => s.observed > 0 && s.controlled / s.observed >= 0.6))
    flags.push('高控制覆盖');
  if (games >= 20 && (wins / games >= 0.8 || wins / games <= 0.2))
    flags.push('胜率偏向明显');
  return {
    games,
    wins,
    losses,
    draws: games - wins - losses,
    winRate: games ? wins / games : 0,
    interval: balanceWinInterval(wins, games),
    averageRounds: games ? runs.reduce((n, r) => n + r.rounds, 0) / games : 0,
    minRounds: games ? Math.min(...runs.map((r) => r.rounds)) : 0,
    maxRounds: games ? Math.max(...runs.map((r) => r.rounds)) : 0,
    limitRounds,
    sides,
    flags,
  };
}
