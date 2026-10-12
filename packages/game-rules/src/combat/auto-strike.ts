import { BUILTIN_SKILL_ID } from '@daoyou/combat-core/constants';
import { evalExpr, skillLevelOf } from '@daoyou/combat-core/expr';
import type {
  EffectWhen,
  SkillDef,
  StatusDef,
  Unit,
} from '@daoyou/combat-core/types';
import { matchesWhen } from '@daoyou/combat-core/when';
import type { AutoObservation } from './auto-observation.js';
import { daoyouFormulas } from './daoyou/formulas.js';

type StrikeKind = 'physical' | 'spell' | 'fixed';

function knownDefinitions(
  source: Unit,
  skills: readonly SkillDef[],
  ids: readonly string[],
) {
  return [...new Set(ids)].flatMap((id) => {
    const definition =
      source.skillOverrides[id] ?? skills.find((entry) => entry.id === id);
    return definition ? [definition] : [];
  });
}

function limited(when: EffectWhen | undefined): boolean {
  return Boolean(
    when?.oncePerBattle || when?.oncePerRound || when?.oncePerActionTarget,
  );
}

/** Known caster facts only. Keep critical branches separate until capped combat benefits are valued. */
export function autoStrikeOutcomes(
  observation: AutoObservation,
  source: Unit,
  target: Unit,
  skill: SkillDef,
  kind: StrikeKind,
  damage: number,
  skills: readonly SkillDef[],
  statusDefs: readonly StatusDef[],
  isPrimary = true,
  critMultiplier?: number,
): readonly { damage: number; probability: number }[] {
  const definitions = new Map(statusDefs.map((status) => [status.id, status]));
  const context = {
    state: observation,
    statusDefs: definitions,
    skills: new Map(skills.map((entry) => [entry.id, entry])),
  };
  const known = knownDefinitions(source, skills, [
    ...source.passives,
    ...source.skills,
  ]).filter(
    (definition) =>
      !definition.conflicts?.some(
        (other) =>
          source.passives.includes(other) || source.skills.includes(other),
      ),
  );
  const modifierScope = {
    source,
    target,
    skill,
    skillId: skill.id,
    kind,
    isPrimary,
    origin: 'action-direct' as const,
  };
  const modifiers = [
    ...known.flatMap((definition) => definition.modifiers ?? []),
    ...(!known.some((definition) => definition.id === skill.id)
      ? (skill.modifiers ?? [])
      : []),
    ...source.statuses.flatMap(
      (status) =>
        status.snapshotModifiers ?? definitions.get(status.id)?.modifiers ?? [],
    ),
  ].filter(
    (modifier) =>
      !limited(modifier.when) &&
      matchesWhen(context, modifier.when, modifierScope),
  );
  const modifierValue = (key: 'critChanceAdd' | 'critMultiplierAdd') =>
    modifiers.reduce(
      (sum, modifier) =>
        sum +
        evalExpr(modifier[key] ?? 0, {
          state: observation,
          source,
          target,
          skillLevel: skillLevelOf(source, skill.id),
          targets: 1,
        }),
      0,
    );
  let chance =
    kind === 'fixed'
      ? 0
      : (kind === 'physical'
          ? source.attrs.critRate
          : source.attrs.spellCritRate) + modifierValue('critChanceAdd');
  let forcedCrit = false;

  function applyHooks(on: 'onCritRoll' | 'onHitCalc', initial: number): number {
    let result = initial;
    for (const ownerSkill of known)
      for (const [index, hook] of (ownerSkill.hooks ?? []).entries()) {
        // Only unconditional-probability scalar hooks can be valued without branching.
        // Public observations omit marks, so limited triggers cannot be assumed available.
        if (
          hook.on !== on ||
          !hook.sourceIsSelf ||
          hook.sourceIsOwnedPet ||
          hook.targeting ||
          hook.chance !== undefined ||
          limited(hook.when) ||
          (hook.targetIsSelf && source.id !== target.id) ||
          (hook.requireKind && hook.requireKind !== kind)
        )
          continue;
        if (
          kind === 'fixed' &&
          hook.requireKind !== 'fixed' &&
          hook.when?.requireKind !== 'fixed'
        )
          continue;
        const scope = {
          source,
          target,
          skill,
          skillId: skill.id,
          kind,
          isPrimary,
          origin: 'action-direct' as const,
          markKey: `${ownerSkill.id}:${index}`,
        };
        if (!matchesWhen(context, hook.when, scope)) continue;
        for (const [effectIndex, effect] of hook.effects.entries()) {
          if (
            effect.targeting ||
            limited(effect.when) ||
            !matchesWhen(context, effect.when, {
              ...scope,
              markKey: `${scope.markKey}:${effectIndex}`,
            })
          )
            continue;
          const env = {
            state: observation,
            source,
            target,
            damage: result,
            skillLevel: skillLevelOf(source, ownerSkill.id),
            targets: 1,
          };
          if (on === 'onCritRoll' && effect.type === 'modifyChance')
            result =
              result * evalExpr(effect.factor ?? 1, env) +
              evalExpr(effect.add ?? 0, env);
          if (on === 'onCritRoll' && effect.type === 'setCrit')
            forcedCrit = true;
          if (on === 'onHitCalc' && effect.type === 'modifyStrike')
            result =
              result * evalExpr(effect.factor ?? 1, env) +
              evalExpr(effect.add ?? 0, env);
        }
      }
    return result;
  }

  if (kind !== 'fixed') chance = applyHooks('onCritRoll', chance);
  const criticalProbability =
    kind === 'fixed' ? 0 : forcedCrit ? 1 : Math.max(0, Math.min(1, chance));
  const criticalFactor =
    (critMultiplier ?? daoyouFormulas.critMultiplier) +
    modifierValue('critMultiplierAdd');
  const fluctuation =
    kind === 'spell'
      ? knownDefinitions(source, skills, source.passives).find(
          (entry) => entry.innate?.spellFluctuation,
        )?.innate?.spellFluctuation
      : undefined;
  const fluctuationMean =
    kind === 'fixed'
      ? 1
      : fluctuation
        ? (fluctuation.min + fluctuation.max) / 2
        : kind === 'physical'
          ? (daoyouFormulas.physicalFluctuationMin +
              daoyouFormulas.physicalFluctuationMax) /
            2
          : (daoyouFormulas.fluctuationMin + daoyouFormulas.fluctuationMax) / 2;
  const branches = [
    { factor: 1, probability: 1 - criticalProbability },
    { factor: criticalFactor, probability: criticalProbability },
  ];
  return branches
    .filter((branch) => branch.probability > 0)
    .map((branch) => {
      const beforeHooks =
        damage *
        (critMultiplier === undefined ? branch.factor : 1) *
        fluctuationMean;
      let result = applyHooks('onHitCalc', beforeHooks);
      if (kind !== 'fixed')
        for (const status of source.statuses) {
          const definition = definitions.get(status.id);
          result *=
            (kind === 'physical'
              ? definition?.damageDealtPhysical
              : definition?.damageDealtSpell) ?? 1;
        }
      if (critMultiplier !== undefined) result *= branch.factor;
      return { damage: Math.max(0, result), probability: branch.probability };
    });
}

/** Average damage only; cap HP, barriers and knockout rewards on autoStrikeOutcomes instead. */
export function estimateAutoStrikeDamage(
  ...args: Parameters<typeof autoStrikeOutcomes>
): number {
  return autoStrikeOutcomes(...args).reduce(
    (sum, outcome) => sum + outcome.damage * outcome.probability,
    0,
  );
}

/** Same damaging-spell eligibility and first-passive precedence as the engine. No extra MP cost. */
export function autoSpellRepeat(
  skill: SkillDef,
  source: Unit,
  skills: readonly SkillDef[],
): { chance: number; factor: number } | undefined {
  if (
    !skill.tags.includes('spell') ||
    !skill.effects.length ||
    !skill.effects.every(
      (effect) => effect.type === 'spellHit' && !effect.targeting,
    )
  )
    return undefined;
  // Like the engine's innate lookup, this scans the projected passive list directly.
  // Hook conflicts are handled separately; projection has already resolved beast families.
  const repeat = knownDefinitions(source, skills, source.passives).find(
    (entry) => entry.innate?.spellRepeat,
  )?.innate?.spellRepeat;
  return repeat
    ? { chance: Math.max(0, Math.min(1, repeat.chance)), factor: repeat.factor }
    : undefined;
}

/** One declared normal-attack follow-up. Eligibility after actual HP damage belongs to the caller. */
export function autoNormalAttackRepeat(
  observation: AutoObservation,
  source: Unit,
  target: Unit,
  skills: readonly SkillDef[],
): { chance: number; factor: number } | undefined {
  const attack: SkillDef = {
    id: BUILTIN_SKILL_ID.Attack,
    name: '普攻',
    tags: ['physical'],
    targeting: { side: 'enemy' },
    effects: [{ type: 'physicalHit' }],
  };
  const context = {
    state: observation,
    statusDefs: new Map<string, StatusDef>(),
    skills: new Map(skills.map((entry) => [entry.id, entry])),
  };
  for (const definition of knownDefinitions(source, skills, [
    ...source.passives,
    ...source.skills,
  ])) {
    if (
      definition.conflicts?.some(
        (other) =>
          source.passives.includes(other) || source.skills.includes(other),
      )
    )
      continue;
    for (const hook of definition.hooks ?? []) {
      if (
        hook.on !== 'afterHit' ||
        !hook.sourceIsSelf ||
        hook.targetIsSelf ||
        hook.sourceIsOwnedPet ||
        (hook.requireKind && hook.requireKind !== 'physical') ||
        hook.targeting ||
        hook.aim !== 'hookTarget' ||
        !hook.when?.skillIds?.includes(BUILTIN_SKILL_ID.Attack) ||
        limited(hook.when) ||
        hook.effects.length !== 1
      )
        continue;
      const effect = hook.effects[0]!;
      if (
        effect.type !== 'physicalHit' ||
        typeof effect.coeff !== 'number' ||
        effect.targeting ||
        limited(effect.when) ||
        effect.hits !== undefined ||
        effect.power !== undefined ||
        effect.resultFactors ||
        effect.critMultiplier !== undefined ||
        effect.defenseIgnore !== undefined ||
        effect.defenseSubtract !== undefined ||
        effect.formula !== undefined ||
        effect.healInstead ||
        effect.trueDamage
      )
        continue;
      const scope = {
        source,
        target,
        skill: attack,
        skillId: attack.id,
        kind: 'physical' as const,
        origin: 'action-direct' as const,
        isPrimary: true,
      };
      if (
        !matchesWhen(context, hook.when, scope) ||
        !matchesWhen(context, effect.when, scope)
      )
        continue;
      const chance = evalExpr(hook.chance ?? 1, {
        state: observation,
        source,
        target,
        skillLevel: skillLevelOf(source, definition.id),
        targets: 1,
      });
      return { chance: Math.max(0, Math.min(1, chance)), factor: effect.coeff };
    }
  }
  return undefined;
}
