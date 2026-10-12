import { createHash } from 'node:crypto';
import { HttpException, Inject, Injectable } from '@nestjs/common';
import { DRIZZLE_DATABASE } from '@server/database/database.service.js';
import type { DbClient, DbTransaction } from '@server/lib/drizzle/db.js';
import {
  adminFeedbackCases,
  adminFeedbackNotes,
  adminOperations,
  cultivators,
  feedbacks,
  type AdminOperationStatus,
} from '@server/lib/drizzle/schema.js';
import {
  findFeedbackById,
  findFeedbacks,
  type FeedbackStatus,
  type FeedbackType,
} from '@server/lib/repositories/feedbackRepository.js';
import { MailService } from '@server/mail/application/MailService.js';
import { updateSpiritStones } from '@server/cultivator/application/readers/CultivatorStateRepository.js';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

const VALID_STATUSES: FeedbackStatus[] = [
  'pending',
  'processing',
  'resolved',
  'closed',
];

const VALID_TYPES: FeedbackType[] = ['bug', 'feature', 'balance', 'other'];

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  pending: '待处理',
  processing: '处理中',
  resolved: '已解决',
  closed: '已关闭',
};

const TYPE_LABELS: Record<FeedbackType, string> = {
  bug: 'Bug 反馈',
  feature: '功能建议',
  balance: '游戏平衡',
  other: '其他意见',
};

const UpdateFeedbackStatusSchema = z
  .object({
    status: z.enum(['pending', 'processing', 'resolved', 'closed']),
    adminMessage: z.string().trim().max(1000).optional(),
    resolutionReason: z.string().trim().max(1000).optional(),
    expectedRevision: z.coerce.number().int().min(1).optional(),
    requestKey: z.string().trim().min(1).max(160).optional(),
  })
  .strict();

const FEEDBACK_RESOLVE_REWARD = 8000;
const OPERATION_ACTION = 'feedback.status.update';
const OPERATION_STALE_AFTER_MS = 5 * 60 * 1000;

type FeedbackOperationResult = {
  feedbackId: string;
  statusChanged: boolean;
  notifiedUser: boolean;
  rewardGranted: boolean;
  revision: number;
};

class FeedbackRevisionConflict extends Error {
  constructor(
    readonly expectedRevision: number,
    readonly currentRevision: number,
  ) {
    super('反馈工单已被其他管理员更新，请刷新后重试');
    this.name = 'FeedbackRevisionConflict';
  }
}

class FeedbackOperationBusy extends HttpException {
  constructor() {
    super(
      {
        success: false,
        error: '相同操作正在处理中，请稍后查询操作结果',
        code: 'OPERATION_IN_PROGRESS',
      },
      409,
    );
  }
}

function buildFeedbackStatusMailContent(params: {
  feedbackType: FeedbackType;
  status: FeedbackStatus;
  adminMessage?: string;
  feedbackContent: string;
  rewardGranted: boolean;
}) {
  const message = params.adminMessage?.trim();
  const lines = [
    '你提交的反馈工单状态已更新。',
    '',
    `反馈类型：${TYPE_LABELS[params.feedbackType]}`,
    `当前状态：${STATUS_LABELS[params.status]}`,
    '',
    '── 你的反馈内容 ──',
    params.feedbackContent,
    '──────────────',
    '',
    `管理员留言：${message || '感谢你的反馈，我们会持续跟进。'}`,
  ];
  if (params.rewardGranted && params.status === 'resolved') {
    lines.push(
      '',
      `奖励发放：你的问题已解决，特发放 ${FEEDBACK_RESOLVE_REWARD} 灵石作为奖励。`,
    );
  }
  return lines.join('\n');
}

function canonicalTarget(input: {
  feedbackId: string;
  status: FeedbackStatus;
  adminMessage?: string;
  resolutionReason?: string;
  expectedRevision: number;
}) {
  return {
    feedbackId: input.feedbackId,
    status: input.status,
    adminMessage: input.adminMessage?.trim() || null,
    resolutionReason: input.resolutionReason?.trim() || null,
    expectedRevision: input.expectedRevision,
  } satisfies Record<string, unknown>;
}

function targetFingerprint(target: Record<string, unknown>): string {
  const canonicalize = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map(canonicalize);
    }
    if (value !== null && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      return Object.fromEntries(
        Object.keys(record)
          .sort()
          .map((key) => [key, canonicalize(record[key])]),
      );
    }
    return value;
  };

  return JSON.stringify(canonicalize(target));
}

function deriveRequestKey(target: Record<string, unknown>): string {
  const digest = createHash('sha256')
    .update(targetFingerprint(target))
    .digest('hex');
  return `feedback-status:${target.feedbackId}:${digest}`.slice(0, 160);
}

function operationStatusError(operation: {
  status: AdminOperationStatus;
  reason: string | null;
  result: Record<string, unknown>;
}) {
  const status = operation.status === 'conflict' ? 409 : 500;
  return new HttpException(
    {
      success: false,
      error:
        operation.reason ||
        (status === 409
          ? '反馈工单已被其他管理员更新，请刷新后重试'
          : '反馈状态更新失败，请稍后重试'),
      code: status === 409 ? 'REVISION_CONFLICT' : 'OPERATION_FAILED',
      ...(operation.result ?? {}),
    },
    status,
  );
}

@Injectable()
export class AdminFeedbackService {
  constructor(@Inject(DRIZZLE_DATABASE) private readonly database: DbClient) {}

  async list(query: Record<string, string | undefined>) {
    const q = this.database;
    const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(query.limit ?? '20', 10) || 20),
    );
    const status = query.status as FeedbackStatus | undefined;
    const type = query.type as FeedbackType | undefined;
    const search = query.search?.trim() || undefined;

    const { feedbacks: rows, total } = await findFeedbacks({
      status: status && VALID_STATUSES.includes(status) ? status : undefined,
      type: type && VALID_TYPES.includes(type) ? type : undefined,
      search,
      page,
      limit,
    });
    const cultivatorIds = Array.from(
      new Set(
        rows
          .map((feedback) => feedback.cultivatorId)
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const feedbackIds = rows.map((feedback) => feedback.id);
    const cultivatorMap = new Map<
      string,
      { name: string | null; realm: string | null }
    >();
    if (cultivatorIds.length > 0) {
      const cultivatorRows = await q
        .select({
          id: cultivators.id,
          name: cultivators.name,
          realm: cultivators.realm,
        })
        .from(cultivators)
        .where(inArray(cultivators.id, cultivatorIds));
      for (const row of cultivatorRows) {
        cultivatorMap.set(row.id, { name: row.name, realm: row.realm });
      }
    }
    const cases = feedbackIds.length
      ? await q
          .select()
          .from(adminFeedbackCases)
          .where(inArray(adminFeedbackCases.feedbackId, feedbackIds))
      : [];
    const caseMap = new Map(cases.map((item) => [item.feedbackId, item]));

    return {
      feedbacks: rows.map((feedback) => {
        const cultivator = feedback.cultivatorId
          ? cultivatorMap.get(feedback.cultivatorId)
          : null;
        return {
          ...feedback,
          cultivatorName: cultivator?.name ?? null,
          cultivatorRealm: cultivator?.realm ?? null,
          adminCase: caseMap.get(feedback.id) ?? null,
        };
      }),
      total,
      page,
      limit,
    };
  }

  async update(id: string, input: unknown, actorId: string) {
    const parsed = UpdateFeedbackStatusSchema.safeParse(input);
    if (!parsed.success) {
      throw new HttpException(
        {
          success: false,
          error: parsed.error.issues[0]?.message ?? '参数错误',
        },
        400,
      );
    }
    const existing = await findFeedbackById(id);
    if (!existing) {
      throw new HttpException({ success: false, error: '反馈不存在' }, 404);
    }

    const caseBefore = await this.database.query.adminFeedbackCases.findFirst({
      where: eq(adminFeedbackCases.feedbackId, id),
      columns: { revision: true },
    });
    const expectedRevision =
      parsed.data.expectedRevision ?? caseBefore?.revision ?? 1;
    const target = canonicalTarget({
      feedbackId: id,
      status: parsed.data.status,
      adminMessage: parsed.data.adminMessage,
      resolutionReason: parsed.data.resolutionReason,
      expectedRevision,
    });
    const requestKey = parsed.data.requestKey ?? deriveRequestKey(target);
    const operation = await this.claimOperation({
      actorId,
      requestKey,
      target,
      expectedRevision,
    });
    if (operation.replayed) {
      const current = await findFeedbackById(id);
      if (!current) {
        throw new HttpException({ success: false, error: '反馈不存在' }, 404);
      }
      return {
        success: true,
        feedback: current,
        ...(operation.result as FeedbackOperationResult),
        replayed: true,
      };
    }

    try {
      const result = await this.database.transaction(async (tx) => {
        const [lockedFeedback] = await tx
          .select()
          .from(feedbacks)
          .where(eq(feedbacks.id, id))
          .for('update');
        if (!lockedFeedback) throw new HttpException({ success: false, error: '反馈不存在' }, 404);

        // A stale-operation retry can overlap the original transaction. Re-read
        // the operation after acquiring the feedback lock so a completed attempt
        // is replayed instead of being turned into a false revision conflict.
        const [operationRow] = await tx
          .select()
          .from(adminOperations)
          .where(eq(adminOperations.requestKey, requestKey))
          .for('update');
        if (!operationRow) throw new Error('管理操作记录不存在');
        if (operationRow.status === 'succeeded') {
          return {
            feedback: lockedFeedback,
            result: operationRow.result as FeedbackOperationResult,
          };
        }
        if (operationRow.status === 'conflict') {
          throw operationStatusError(operationRow);
        }

        await tx
          .insert(adminFeedbackCases)
          .values({
            feedbackId: id,
            updatedBy: actorId,
            lastResult:
              lockedFeedback.status === 'resolved'
                ? {
                    feedbackRewardGranted: true,
                    historicalResolution: true,
                  }
                : {},
          })
          .onConflictDoNothing({ target: adminFeedbackCases.feedbackId });
        const [currentCase] = await tx
          .select()
          .from(adminFeedbackCases)
          .where(eq(adminFeedbackCases.feedbackId, id))
          .for('update');
        if (!currentCase) throw new Error('反馈工单扩展记录创建失败');
        if (currentCase.revision !== expectedRevision) {
          throw new FeedbackRevisionConflict(expectedRevision, currentCase.revision);
        }

        const rawPreviousResult = currentCase.lastResult ?? {};
        // Cases created after this workflow was introduced carry an explicit
        // reward marker. A legacy feedback already in `resolved` state has no
        // reliable reward history, so conservatively treat it as processed to
        // prevent an accidental second grant on the first admin action.
        const historicalResolved =
          lockedFeedback.status === 'resolved' &&
          Object.keys(rawPreviousResult).length === 0;
        const previousResult = historicalResolved
          ? {
              ...rawPreviousResult,
              feedbackRewardGranted: true,
              historicalResolution: true,
            }
          : rawPreviousResult;
        const rewardPreviouslyGranted =
          previousResult.feedbackRewardGranted === true;

        const hasStatusChanged = lockedFeedback.status !== parsed.data.status;
        const message = parsed.data.adminMessage?.trim();
        const resolutionReason = parsed.data.resolutionReason?.trim();
        const shouldNotify = hasStatusChanged || Boolean(message);
        const recipientCultivatorId = await this.findRecipientCultivator(
          tx,
          lockedFeedback.userId,
          lockedFeedback.cultivatorId,
        );

        let rewardGranted = false;
        let notifiedUser = false;
        if (parsed.data.status === 'resolved' && !rewardPreviouslyGranted && recipientCultivatorId) {
          await updateSpiritStones(
            lockedFeedback.userId,
            recipientCultivatorId,
            FEEDBACK_RESOLVE_REWARD,
            tx,
          );
          rewardGranted = true;
        }
        if (shouldNotify && recipientCultivatorId) {
          await MailService.sendNewRewardMail(
            recipientCultivatorId,
            '反馈工单状态更新',
            buildFeedbackStatusMailContent({
              feedbackType: lockedFeedback.type as FeedbackType,
              status: parsed.data.status,
              adminMessage: message,
              feedbackContent: lockedFeedback.content,
              rewardGranted,
            }),
            [],
            'system',
            tx,
          );
          notifiedUser = true;
        }
        if (message) {
          await tx.insert(adminFeedbackNotes).values({
            feedbackId: id,
            kind: 'player_reply',
            actorId,
            body: message,
          });
        }
        if (resolutionReason) {
          await tx.insert(adminFeedbackNotes).values({
            feedbackId: id,
            kind: 'internal',
            actorId,
            body: resolutionReason,
          });
        }

        const nextResult: Record<string, unknown> = {
          ...previousResult,
          feedbackRewardGranted: rewardPreviouslyGranted || rewardGranted,
          rewardGranted,
          notifiedUser,
          lastStatus: parsed.data.status,
        };
        const [updatedCase] = await tx
          .update(adminFeedbackCases)
          .set({
            revision: currentCase.revision + 1,
            resolutionReason:
              parsed.data.status === 'resolved'
                ? resolutionReason ?? currentCase.resolutionReason
                : null,
            lastResult: nextResult,
            updatedBy: actorId,
          })
          .where(
            and(
              eq(adminFeedbackCases.id, currentCase.id),
              eq(adminFeedbackCases.revision, expectedRevision),
            ),
          )
          .returning({ revision: adminFeedbackCases.revision });
        if (!updatedCase) {
          throw new FeedbackRevisionConflict(expectedRevision, currentCase.revision + 1);
        }
        if (hasStatusChanged) {
          await tx
            .update(feedbacks)
            .set({ status: parsed.data.status })
            .where(eq(feedbacks.id, id));
        }

        const operationResult: FeedbackOperationResult = {
          feedbackId: id,
          statusChanged: hasStatusChanged,
          notifiedUser,
          rewardGranted,
          revision: updatedCase.revision,
        };
        await tx
          .update(adminOperations)
          .set({
            status: 'succeeded',
            result: operationResult,
            reason: null,
            completedAt: new Date(),
          })
          .where(eq(adminOperations.requestKey, requestKey));
        return { feedback: { ...lockedFeedback, status: parsed.data.status }, result: operationResult };
      });
      return { success: true, feedback: result.feedback, ...result.result };
    } catch (error) {
      if (error instanceof FeedbackRevisionConflict) {
        await this.finishOperation(requestKey, {
          status: 'conflict',
          reason: error.message,
          result: {
            expectedRevision: error.expectedRevision,
            currentRevision: error.currentRevision,
          },
        });
        throw new HttpException(
          {
            success: false,
            error: error.message,
            code: 'REVISION_CONFLICT',
            currentRevision: error.currentRevision,
          },
          409,
        );
      }
      if (error instanceof HttpException && error.getStatus() === 409) {
        throw error;
      }
      await this.finishOperation(requestKey, {
        status: 'failed',
        reason: error instanceof Error ? error.message : String(error),
        result: {},
      });
      throw error;
    }
  }

  private async findRecipientCultivator(
    tx: DbTransaction,
    userId: string,
    cultivatorId: string | null,
  ): Promise<string | null> {
    if (cultivatorId) {
      const [row] = await tx
        .select({ id: cultivators.id })
        .from(cultivators)
        .where(and(eq(cultivators.id, cultivatorId), eq(cultivators.userId, userId)))
        .for('update');
      return row?.id ?? null;
    }
    const [fallback] = await tx
      .select({ id: cultivators.id })
      .from(cultivators)
      .where(and(eq(cultivators.userId, userId), eq(cultivators.status, 'active')))
      .limit(1)
      .for('update');
    return fallback?.id ?? null;
  }

  private async claimOperation(args: {
    actorId: string;
    requestKey: string;
    target: Record<string, unknown>;
    expectedRevision: number;
  }): Promise<{ replayed: boolean; result: Record<string, unknown> }> {
    return this.database.transaction(async (tx) => {
      await tx
        .insert(adminOperations)
        .values({
          requestKey: args.requestKey,
          actorId: args.actorId,
          action: OPERATION_ACTION,
          target: args.target,
          expectedRevision: args.expectedRevision,
          status: 'pending',
        })
        .onConflictDoNothing({ target: adminOperations.requestKey });
      const [operation] = await tx
        .select()
        .from(adminOperations)
        .where(eq(adminOperations.requestKey, args.requestKey))
        .for('update');
      if (!operation) throw new Error('管理操作记录创建失败');
      if (targetFingerprint(operation.target) !== targetFingerprint(args.target)) {
        throw new HttpException(
          { success: false, error: 'requestKey 已用于其他反馈操作', code: 'IDEMPOTENCY_CONFLICT' },
          409,
        );
      }
      if (operation.status === 'succeeded') return { replayed: true, result: operation.result ?? {} };
      if (operation.status === 'conflict') throw operationStatusError(operation);
      if (
        operation.status === 'running' &&
        operation.updatedAt.getTime() > Date.now() - OPERATION_STALE_AFTER_MS
      ) {
        throw new FeedbackOperationBusy();
      }
      await tx
        .update(adminOperations)
        .set({
          status: 'running',
          actorId: args.actorId,
          startedAt: new Date(),
          reason: null,
          result: {},
        })
        .where(eq(adminOperations.id, operation.id));
      return { replayed: false, result: {} };
    });
  }

  private async finishOperation(
    requestKey: string,
    update: {
      status: Extract<AdminOperationStatus, 'failed' | 'conflict'>;
      reason: string;
      result: Record<string, unknown>;
    },
  ) {
    try {
      await this.database
        .update(adminOperations)
        .set({
          status: update.status,
          reason: update.reason,
          result: update.result,
          completedAt: new Date(),
        })
        .where(eq(adminOperations.requestKey, requestKey));
    } catch (auditError) {
      console.error('[admin-feedback] failed to persist operation result', {
        requestKey,
        auditError,
      });
    }
  }
}
