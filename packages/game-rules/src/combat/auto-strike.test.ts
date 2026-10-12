import { BUILTIN_SKILL_ID } from '@daoyou/combat-core/constants';
import { createBattle } from '@daoyou/combat-core/session';
import type { SkillDef, StatusDef } from '@daoyou/combat-core/types';
import { BEAST_SKILLS } from '@daoyou/game-content/beasts';
import { COMBAT_V6_CHARACTER_BUILD_VERSIONS } from '@daoyou/game-domain/combat';
import { describe, expect, it } from 'vitest';
import {
  autoNormalAttackRepeat,
  autoSpellRepeat,
  autoStrikeOutcomes,
  estimateAutoStrikeDamage,
} from './auto-strike.js';
import { daoyouRulesetV6 } from './daoyou/index.js';

const flame = BEAST_SKILLS.find((skill) => skill.id === 'beast.spirit-flame')!;
const attack: SkillDef = {
  id: BUILTIN_SKILL_ID.Attack,
  name: '普攻',
  tags: ['physical'],
  targeting: { side: 'enemy' },
  effects: [{ type: 'physicalHit' }],
};
function fixture(passives: string[] = [], extra: SkillDef[] = []) {
  const skills = [...BEAST_SKILLS, ...extra];
  const battle = createBattle({
    seed: 42,
    versions: COMBAT_V6_CHARACTER_BUILD_VERSIONS,
    ruleset: daoyouRulesetV6,
    skills,
    units: [
      {
        id: 'pet',
        name: '灵兽',
        kind: 'pet',
        side: 0,
        level: 60,
        skills: [flame.id],
        passives,
        attrs: { hp: 1000, maxHp: 1000, mp: 100, maxMp: 100 },
      },
      {
        id: 'enemy',
        name: '敌人',
        kind: 'player',
        side: 1,
        level: 60,
        attrs: { hp: 1000, maxHp: 1000 },
      },
    ],
  });
  const source = battle.unit('pet');
  const target = battle.unit('enemy');
  const observation = { round: 1, units: [source, target] };
  const estimate = (
    skill = flame,
    kind: 'physical' | 'spell' | 'fixed' = 'spell',
    statusDefs: StatusDef[] = [],
    critMultiplier?: number,
  ) =>
    estimateAutoStrikeDamage(
      observation,
      source,
      target,
      skill,
      kind,
      100,
      skills,
      statusDefs,
      true,
      critMultiplier,
    );
  return { source, target, observation, skills, estimate };
}

describe('automatic strike estimates', () => {
  it('keeps critical damage and probabilities separate for capped damage and knockout scoring', () => {
    const { source, target, observation, skills } = fixture([
      'beast.spell-critical',
    ]);
    const outcomes = autoStrikeOutcomes(
      observation,
      source,
      target,
      flame,
      'spell',
      100,
      skills,
      [],
    );
    expect(outcomes).toEqual([
      { damage: 100, probability: 0.9 },
      { damage: 200, probability: 0.1 },
    ]);
    const expectedCapped = outcomes.reduce(
      (sum, outcome) =>
        sum + Math.min(105, outcome.damage) * outcome.probability,
      0,
    );
    const knockoutProbability = outcomes.reduce(
      (sum, outcome) =>
        sum + Number(outcome.damage >= 105) * outcome.probability,
      0,
    );
    expect(expectedCapped).toBeCloseTo(100.5);
    expect(knockoutProbability).toBeCloseTo(0.1);
  });
  it('counts actual spell mastery and spell-critical passives without changing the observation', () => {
    const { source, observation, estimate } = fixture([
      'beast.spell-mastery',
      'beast.spell-critical',
    ]);
    const before = structuredClone(observation);
    expect(estimate()).toBeCloseTo(121);
    expect(estimate(attack, 'physical')).toBe(100);
    expect(observation).toEqual(before);
    source.attrs.spellCritRate = 0.2;
    expect(estimate()).toBeCloseTo(143);
    expect(estimate(flame, 'spell', [], 3)).toBeCloseTo(176);
  });

  it('values physical penalties and bonuses on both ordinary attacks and physical arts', () => {
    const { estimate } = fixture([
      'beast.combo',
      'beast.concentration',
      'beast.sneak-attack',
    ]);
    expect(estimate(attack, 'physical')).toBeCloseTo(100 * 0.75 * 0.8 * 1.05);
    expect(estimate({ ...attack, id: 'physical-art' }, 'physical')).toBeCloseTo(
      100 * 0.75 * 0.8 * 1.05,
    );
    expect(estimate()).toBe(100);
  });

  it('uses declared conditions and excludes conflicting passives', () => {
    const conditional: SkillDef = {
      id: 'conditional',
      name: '条件加成',
      tags: ['passive'],
      targeting: { side: 'self' },
      effects: [],
      hooks: [
        {
          on: 'onHitCalc',
          sourceIsSelf: true,
          requireKind: 'spell',
          when: { skillIds: [flame.id], sourceHpRatioBelow: 0.5 },
          effects: [{ type: 'modifyStrike', factor: 2 }],
        },
      ],
    };
    const conflicting: SkillDef = {
      ...conditional,
      id: 'conflicting',
      conflicts: ['conditional'],
      hooks: [
        {
          on: 'onHitCalc',
          sourceIsSelf: true,
          effects: [{ type: 'modifyStrike', factor: 3 }],
        },
      ],
    };
    const { source, estimate } = fixture(
      ['conditional', 'conflicting'],
      [conditional, conflicting],
    );
    expect(estimate()).toBe(100);
    source.attrs.hp = 400;
    expect(estimate()).toBe(200);
    expect(estimate({ ...flame, id: 'other-spell' })).toBe(100);
  });

  it('uses the first spell fluctuation range and known dealt-damage statuses', () => {
    const { source, estimate } = fixture(['beast.spell-fluctuation']);
    source.statuses = [
      {
        id: 'boost',
        kind: 'boost',
        sourceId: source.id,
        appliedRound: 1,
        remainingRounds: 2,
        stacks: 1,
        speedMod: 0,
        attrMods: {},
        damageTakenPhysical: 1,
        damageTakenSpell: 1,
        healTaken: 1,
        healDealt: 1,
      },
    ];
    const status: StatusDef = {
      id: 'boost',
      name: '增益',
      kind: 'boost',
      damageDealtSpell: 1.2,
      damageDealtPhysical: 0.5,
    };
    expect(estimate(flame, 'spell', [status])).toBeCloseTo(123);
    expect(estimate(attack, 'physical', [status])).toBe(50);
    expect(estimate(flame, 'fixed', [status])).toBe(100);
  });

  it('supports forced critical hooks and clamps ordinary critical probability', () => {
    const forced: SkillDef = {
      id: 'forced',
      name: '必暴',
      tags: ['passive'],
      targeting: { side: 'self' },
      effects: [],
      hooks: [
        {
          on: 'onCritRoll',
          sourceIsSelf: true,
          requireKind: 'spell',
          effects: [{ type: 'setCrit' }],
        },
      ],
    };
    const { source, target, observation, skills, estimate } = fixture(
      ['forced'],
      [forced],
    );
    expect(estimate()).toBe(200);
    expect(
      autoStrikeOutcomes(
        observation,
        source,
        target,
        flame,
        'spell',
        100,
        skills,
        [],
      ),
    ).toEqual([{ damage: 200, probability: 1 }]);
    expect(estimate(flame, 'fixed')).toBe(100);
    source.passives = ['beast.spell-critical'];
    source.attrs.spellCritRate = 0.95;
    expect(estimate()).toBe(200);
  });

  it('adds known critical modifiers without applying their damage bonus a second time', () => {
    const mastery: SkillDef = {
      id: 'crit-modifiers',
      name: '会心精通',
      tags: ['passive'],
      targeting: { side: 'self' },
      effects: [],
      modifiers: [
        {
          when: { requireKind: 'spell' },
          critChanceAdd: 0.2,
          critMultiplierAdd: 0.5,
          damageBonus: 1,
        },
      ],
    };
    const { estimate } = fixture(
      ['beast.spell-critical', mastery.id],
      [mastery],
    );
    expect(estimate()).toBeCloseTo(145);
    expect(estimate(attack, 'physical')).toBe(100);
    expect(estimate(flame, 'spell', [], 3)).toBeCloseTo(175);
    expect(
      estimate({
        ...flame,
        id: 'authored-spell',
        modifiers: [{ critChanceAdd: 0.1 }],
      }),
    ).toBeCloseTo(160);
  });

  it('does not assume a limited scalar benefit is available when observation omits trigger marks', () => {
    const limited: SkillDef = {
      id: 'limited',
      name: '限次法术',
      tags: ['passive'],
      targeting: { side: 'self' },
      effects: [],
      hooks: [
        {
          on: 'onHitCalc',
          sourceIsSelf: true,
          when: { oncePerRound: true },
          effects: [{ type: 'modifyStrike', factor: 2 }],
        },
        {
          on: 'onCritRoll',
          sourceIsSelf: true,
          effects: [{ type: 'setCrit', when: { oncePerBattle: true } }],
        },
      ],
    };
    expect(fixture([limited.id], [limited]).estimate()).toBe(100);
  });
});

describe('automatic normal attack follow-ups', () => {
  it('reads the actual ordinary-attack combo and its observed target condition', () => {
    const { source, target, observation, skills, estimate } = fixture([
      'beast.combo',
    ]);
    expect(autoNormalAttackRepeat(observation, source, target, skills)).toEqual(
      { chance: 0.45, factor: 1 },
    );
    expect(estimate(attack, 'physical')).toBe(75);
    target.passives = ['beast.reflection'];
    expect(
      autoNormalAttackRepeat(observation, source, target, skills),
    ).toBeUndefined();
  });

  it('respects conflicts and does not treat reactive counters as caster follow-ups', () => {
    const { source, target, observation, skills } = fixture(['beast.counter']);
    expect(
      autoNormalAttackRepeat(observation, source, target, skills),
    ).toBeUndefined();
    source.passives = ['beast.advanced-combo'];
    expect(autoNormalAttackRepeat(observation, source, target, skills)).toEqual(
      { chance: 0.55, factor: 1 },
    );
    source.skillOverrides['beast.advanced-combo'] = {
      ...BEAST_SKILLS.find((skill) => skill.id === 'beast.advanced-combo')!,
      conflicts: [flame.id],
    };
    expect(
      autoNormalAttackRepeat(observation, source, target, skills),
    ).toBeUndefined();
  });
});

describe('automatic spell repeats', () => {
  it('returns actual repeat chance without charging MP or repeating utility effects', () => {
    const { source, skills } = fixture(['beast.spell-combo']);
    const before = structuredClone(source);
    expect(autoSpellRepeat(flame, source, skills)).toEqual({
      chance: 0.2,
      factor: 0.5,
    });
    const group = BEAST_SKILLS.find((skill) => skill.id === 'beast.wildfire')!;
    expect(autoSpellRepeat(group, source, skills)).toEqual({
      chance: 0.2,
      factor: 0.5,
    });
    expect(
      autoSpellRepeat(
        {
          ...flame,
          effects: [...flame.effects, { type: 'restoreMp', power: 20 }],
        },
        source,
        skills,
      ),
    ).toBeUndefined();
    expect(
      autoSpellRepeat(
        {
          ...flame,
          effects: [{ type: 'spellHit', targeting: { side: 'enemy' } }],
        },
        source,
        skills,
      ),
    ).toBeUndefined();
    expect(
      autoSpellRepeat({ ...flame, effects: [] }, source, skills),
    ).toBeUndefined();
    expect(
      autoSpellRepeat({ ...flame, tags: ['physical'] }, source, skills),
    ).toBeUndefined();
    expect(source).toEqual(before);
  });

  it('uses the first declared innate even when it declares hook conflicts, matching the engine', () => {
    const { source, skills } = fixture([
      'beast.spell-combo',
      'beast.advanced-spell-combo',
    ]);
    expect(autoSpellRepeat(flame, source, skills)).toEqual({
      chance: 0.2,
      factor: 0.5,
    });
    source.skillOverrides['beast.spell-combo'] = {
      ...BEAST_SKILLS.find((skill) => skill.id === 'beast.spell-combo')!,
      conflicts: ['beast.advanced-spell-combo'],
    };
    expect(autoSpellRepeat(flame, source, skills)).toEqual({
      chance: 0.2,
      factor: 0.5,
    });
    source.skillOverrides['beast.spell-combo'].innate = {
      spellRepeat: { chance: 0.6, factor: 0.4 },
    };
    expect(autoSpellRepeat(flame, source, skills)).toEqual({
      chance: 0.6,
      factor: 0.4,
    });
  });
});
