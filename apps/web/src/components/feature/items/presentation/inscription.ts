import { tierColorMap } from '@app/components/ui/inkBadgeTiers';
import { daoFormationInscriptionOf } from '@daoyou/game-content/equipment/base';
import {
  EQUIPMENT_ATTRIBUTE_NAMES,
  EQUIPMENT_SLOT_NAMES,
  OPEN_EQUIPMENT_LEVELS,
} from '@daoyou/game-domain/equipment';
import { getLevelRealmStage } from '@daoyou/game-domain/progression';
import { daoFormationMaxLevel } from '@daoyou/game-rules/equipment/projection';
import { field, quantity } from './helpers';
import type { ItemAdapter } from './types';

export const inscriptionAdapter: ItemAdapter = (item, def) => {
  const pattern = daoFormationInscriptionOf(def.patternId!)!;
  const equipmentLevel = OPEN_EQUIPMENT_LEVELS.find(
    (level) => def.level! <= daoFormationMaxLevel(level),
  )!;
  const realm = getLevelRealmStage(equipmentLevel).realm;
  return {
    summary: {
      icon: 'icon:item-formation-inscription',
      color: tierColorMap[realm],
      tier: `${def.level}级`,
      type: '阵纹',
    },
    preview: (options) => ({
      header: [
        field('等级', `${def.level}级`),
        quantity(item, options),
        field(
          '适用部位',
          pattern.allowedSlots
            .map((slot) => EQUIPMENT_SLOT_NAMES[slot])
            .join('、'),
        ),
      ],
      sections: [
        {
          title: '烙印加成',
          entries: [
            {
              kind: 'line',
              label: EQUIPMENT_ATTRIBUTE_NAMES[pattern.attr],
              value: `+${pattern.valuePerLevel * def.level!}`,
              numeric: true,
              tone: 'positive',
            },
          ],
        },
      ],
    }),
  };
};
