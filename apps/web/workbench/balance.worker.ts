import {
  balanceOptions,
  balancePlan,
  simulateBalanceJob,
  summarizeBalance,
  type BalanceRow,
} from '@daoyou/game-rules/combat/balance';
import type { BalanceRequest, BalanceResponse } from './balance-protocol';

const send = (message: BalanceResponse) => self.postMessage(message);
send({ type: 'ready', options: balanceOptions });
self.onmessage = (event: MessageEvent<BalanceRequest>) => {
  try {
    const plan = balancePlan(event.data.config);
    if (event.data.type === 'detail') {
      const job = event.data.job;
      const match = plan.cases.find((m) => m.id === job.match.id);
      if (
        !match ||
        !plan.jobs.some(
          (j) =>
            j.match.id === match.id &&
            j.seed === job.seed &&
            j.swapped === job.swapped,
        )
      )
        throw new Error('单局参数不属于当前报告');
      send({
        type: 'detail',
        detail: simulateBalanceJob(plan.config, { ...job, match }, true),
      });
      return;
    }
    const rows: BalanceRow[] = plan.cases.map((match) => ({
      match,
      runs: [],
      summary: summarizeBalance([]),
    }));
    send({ type: 'progress', done: 0, total: plan.jobs.length });
    for (let i = 0; i < plan.jobs.length; i++) {
      const job = plan.jobs[i];
      rows
        .find((r) => r.match.id === job.match.id)!
        .runs.push(simulateBalanceJob(plan.config, job).run);
      if ((i + 1) % 2 === 0 || i + 1 === plan.jobs.length)
        send({ type: 'progress', done: i + 1, total: plan.jobs.length });
    }
    for (const row of rows) row.summary = summarizeBalance(row.runs);
    send({
      type: 'complete',
      report: {
        config: plan.config,
        versions: balanceOptions.versions,
        reference: balanceOptions.reference,
        completedAt: new Date().toISOString(),
        rows,
      },
    });
  } catch (error) {
    send({
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
