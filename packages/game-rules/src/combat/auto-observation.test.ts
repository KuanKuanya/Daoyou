import { describe, expect, it } from 'vitest';
import { createBattle } from '@daoyou/combat-core/session';
import { effectiveAttrs } from '@daoyou/combat-core/units';
import type { StatusDef } from '@daoyou/combat-core/types';
import { BEAST_SKILLS } from '@daoyou/game-content/beasts';
import { COMBAT_V6_CHARACTER_BUILD_VERSIONS } from '@daoyou/game-domain/combat';
import { automaticCommands, AUTO_POLICY_VERSION } from './auto.js';
import { observeAutoBattle } from './auto-observation.js';
import { daoyouRulesetV6 } from './daoyou/index.js';

function fixture() {
  const attrs = {
    hp: 3000,
    maxHp: 3000,
    mp: 800,
    maxMp: 800,
    physicalAtk: 150,
    physicalDef: 300,
    magicAtk: 500,
    magicDef: 50,
    speed: 50,
  };
  return createBattle({
    seed: 42,
    versions: {
      ...COMBAT_V6_CHARACTER_BUILD_VERSIONS,
      autoPolicyVersion: AUTO_POLICY_VERSION,
    },
    ruleset: daoyouRulesetV6,
    skills: BEAST_SKILLS,
    units: [
      { id: 'player', name: '主人', kind: 'player', side: 0, level: 60, attrs },
      {
        id: 'pet', name: '法宝宝', kind: 'pet', side: 0, ownerId: 'player', level: 60,
        attrs, skills: ['beast.spirit-flame'], skillLevels: { 'beast.spirit-flame': 60 },
      },
      {
        id: 'enemy', name: '敌人', kind: 'npc', side: 1, level: 60,
        attrs: { ...attrs, physicalDef: 100 },
      },
    ],
  });
}

describe('自动战斗中性观察基线', () => {
  it('主人同等级面板与临时状态不改变未知敌人的估计', () => {
    const battle = fixture();
    const before = observeAutoBattle(battle.snapshot(), 'player', []).units.find(unit => unit.id === 'enemy');
    const owner = battle.unit('player');
    owner.attrs = {
      ...owner.attrs, hp: 20000, maxHp: 20000, mp: 10000, maxMp: 10000,
      physicalAtk: 2000, physicalDef: 2000, magicAtk: 3000, magicDef: 4000,
      speed: 500, hit: 1000, dodge: 800, attackCultivate: 20, spellCultivate: 20,
    };
    owner.statuses.push({
      id: 'temporary', kind: 'temporary', remainingRounds: 2, stacks: 1,
      sourceId: 'player', appliedRound: 1, speedMod: 200,
      attrMods: { magicDef: 900, physicalDef: -100 },
      damageTakenPhysical: 1, damageTakenSpell: 1, healTaken: 1, healDealt: 1,
    });
    const after = observeAutoBattle(battle.snapshot(), 'player', []).units.find(unit => unit.id === 'enemy');
    expect(after).toEqual(before);
  });

  it('满蓝灵火宝宝不会因主人防御和生命提高而改成普攻', () => {
    const battle = fixture();
    battle.unit('player').command = { type: 'defend' };
    const choosePet = () => automaticCommands(
      battle.snapshot(), 'player', BEAST_SKILLS, id => battle.queryCommands(id),
    ).find(entry => entry.unitId === 'pet')!.command;
    expect(choosePet()).toMatchObject({ type: 'skill', skillId: 'beast.spirit-flame' });
    const owner = battle.unit('player');
    owner.attrs.magicDef = 600;
    owner.attrs.hp = owner.attrs.maxHp = 30000;
    expect(battle.queryCommands('pet').skills[0].ready).toBe(true);
    expect(choosePet()).toMatchObject({ type: 'skill', skillId: 'beast.spirit-flame' });
  });

  it('敌方隐藏等级、绝对生命法力和面板不影响观察', () => {
    const battle = fixture();
    const before = observeAutoBattle(battle.snapshot(), 'player', []);
    const enemy = battle.unit('enemy');
    enemy.level = 180;
    enemy.attrs = {
      ...enemy.attrs, hp: enemy.attrs.hp * 10, maxHp: enemy.attrs.maxHp * 10,
      mp: enemy.attrs.mp * 20, maxMp: enemy.attrs.maxMp * 20,
      magicDef: 9000, physicalDef: 10000, magicAtk: 8000, spellCultivate: 30,
    };
    expect(observeAutoBattle(battle.snapshot(), 'player', [])).toEqual(before);
    battle.unit('player').level = 90;
    expect(observeAutoBattle(battle.snapshot(), 'player', []).units.find(unit => unit.id === 'enemy')?.attrs)
      .not.toEqual(before.units.find(unit => unit.id === 'enemy')?.attrs);
  });

  it('所控面板保持真实，敌方血蓝和护盾只保留公开万分比', () => {
    const battle = fixture();
    const pet = battle.unit('pet');
    pet.statuses.push({
      id: 'guard', kind: 'guard', remainingRounds: 3, stacks: 1,
      sourceId: 'player', appliedRound: 1, speedMod: 20, attrMods: { magicAtk: 30 },
      damageTakenPhysical: 1, damageTakenSpell: 0.5, healTaken: 1, healDealt: 1,
    });
    pet.barriers.push({
      id: 'own-shield', kind: 'shield', name: '护盾', current: 123,
      remainingRounds: 2, sourceId: 'pet', appliedRound: 1,
    });
    const enemy = battle.unit('enemy');
    enemy.attrs.hp = 1234;
    enemy.attrs.mp = 333;
    enemy.barriers.push({
      id: 'shield', kind: 'shield', name: '护盾', current: 555,
      remainingRounds: 2, sourceId: 'enemy', appliedRound: 1,
    });
    enemy.statuses = [
      { ...pet.statuses[0], sourceId: 'pet' },
      { ...pet.statuses[0], id: 'hidden-source', sourceId: 'enemy' },
    ];
    const defs: StatusDef[] = [{ id: 'guard', name: '护体', kind: 'guard' }];
    const state = battle.snapshot();
    const observation = observeAutoBattle(state, 'player', defs);
    const own = observation.units.find(unit => unit.id === 'pet')!;
    const observed = observation.units.find(unit => unit.id === 'enemy')!;
    expect(own.attrs).toEqual(effectiveAttrs(pet));
    expect(own.barriers[0].current).toBe(123);
    expect(observed.attrs.hp / observed.attrs.maxHp).toBeCloseTo(0.4113);
    expect(observed.attrs.mp / observed.attrs.maxMp).toBeCloseTo(0.4162);
    expect(observed.barriers[0].current / observed.attrs.maxHp).toBeCloseTo(0.185);
    expect(observed.statuses.map(status => status.sourceId)).toEqual(['pet', '']);
    expect(battle.snapshot()).toEqual(state);
  });
});
