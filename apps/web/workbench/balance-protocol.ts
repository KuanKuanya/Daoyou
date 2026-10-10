import type {
  BalanceConfig,
  BalanceDetail,
  BalanceJob,
  BalanceOptions,
  BalanceReport,
} from '@daoyou/game-rules/combat/balance';

export type BalanceRequest =
  | { type: 'run'; config: BalanceConfig }
  | { type: 'detail'; config: BalanceConfig; job: BalanceJob };
export type BalanceResponse =
  | { type: 'ready'; options: BalanceOptions }
  | { type: 'progress'; done: number; total: number }
  | { type: 'complete'; report: BalanceReport }
  | { type: 'detail'; detail: BalanceDetail }
  | { type: 'error'; error: string };
