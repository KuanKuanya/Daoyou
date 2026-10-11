import { Inject, Injectable } from '@nestjs/common';
import { DRIZZLE_DATABASE } from '@server/database/database.service.js';
import type { DbClient } from '@server/lib/drizzle/db.js';
import {
  adminFeedbackCases,
  cultivators,
  feedbacks,
  mails,
  sponsorshipOrders,
  systemMailCampaigns,
} from '@server/lib/drizzle/schema.js';
import {
  and,
  desc,
  eq,
  gte,
  ilike,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { z } from 'zod';
import {
  AdminOperationsDiagnosticsQuerySchema,
  AdminOperationsFeedbackQuerySchema,
} from './admin-operations-input.js';

type FeedbackQuery = z.infer<typeof AdminOperationsFeedbackQuerySchema>;
type DiagnosticsQuery = z.infer<typeof AdminOperationsDiagnosticsQuerySchema>;

type CountRow = { key: string | null; count: number };

function toCountMap(rows: CountRow[]): Record<string, number> {
  return Object.fromEntries(
    rows
      .filter((row): row is { key: string; count: number } => row.key !== null)
      .map((row) => [row.key, Number(row.count)]),
  );
}

@Injectable()
export class AdminOperationsService {
  constructor(@Inject(DRIZZLE_DATABASE) private readonly database: DbClient) {}

  async listFeedbacks(query: FeedbackQuery) {
    const conditions: SQL<unknown>[] = [];
    if (query.status) conditions.push(eq(feedbacks.status, query.status));
    if (query.type) conditions.push(eq(feedbacks.type, query.type));
    if (query.search) {
      conditions.push(ilike(feedbacks.content, `%${query.search}%`));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const offset = (query.page - 1) * query.limit;

    const [rows, countRows] = await Promise.all([
      this.database
        .select({
          id: feedbacks.id,
          userId: feedbacks.userId,
          cultivatorId: feedbacks.cultivatorId,
          type: feedbacks.type,
          content: feedbacks.content,
          status: feedbacks.status,
          createdAt: feedbacks.createdAt,
          updatedAt: feedbacks.updatedAt,
          cultivatorName: cultivators.name,
          cultivatorRealm: cultivators.realm,
          adminCaseId: adminFeedbackCases.id,
          assigneeId: adminFeedbackCases.assigneeId,
          priority: adminFeedbackCases.priority,
          revision: adminFeedbackCases.revision,
          resolutionReason: adminFeedbackCases.resolutionReason,
        })
        .from(feedbacks)
        .leftJoin(cultivators, eq(feedbacks.cultivatorId, cultivators.id))
        .leftJoin(
          adminFeedbackCases,
          eq(feedbacks.id, adminFeedbackCases.feedbackId),
        )
        .where(where)
        .orderBy(desc(feedbacks.createdAt), desc(feedbacks.id))
        .limit(query.limit)
        .offset(offset),
      this.database
        .select({ count: sql<number>`count(*)::int` })
        .from(feedbacks)
        .where(where),
    ]);

    const total = Number(countRows[0]?.count ?? 0);
    return {
      success: true,
      data: {
          items: rows.map((row) => ({
            id: row.id,
            userId: row.userId,
            cultivatorId: row.cultivatorId,
            type: row.type,
            content: row.content,
            status: row.status,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            cultivatorName: row.cultivatorName,
            cultivatorRealm: row.cultivatorRealm,
            adminCase: row.adminCaseId
              ? {
                  id: row.adminCaseId,
                  assigneeId: row.assigneeId,
                  priority: row.priority,
                  revision: row.revision,
                  resolutionReason: row.resolutionReason,
                }
              : null,
          })),
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
        },
        filters: {
          status: query.status ?? null,
          type: query.type ?? null,
          search: query.search || null,
        },
      },
    };
  }

  async diagnostics(query: DiagnosticsQuery) {
    const windowStart = new Date(
      Date.now() - query.windowHours * 60 * 60 * 1000,
    );
    const healthStartedAt = Date.now();
    await this.database.execute(sql`select 1`);
    const databaseLatencyMs = Date.now() - healthStartedAt;

    const [
      feedbackTotals,
      feedbackRecent,
      campaignTotals,
      mailReceipts,
      sponsorshipVerification,
      sponsorshipFulfillment,
    ] = await Promise.all([
      this.database
        .select({
          key: feedbacks.status,
          count: sql<number>`count(*)::int`,
        })
        .from(feedbacks)
        .groupBy(feedbacks.status),
      this.database
        .select({
          key: feedbacks.status,
          count: sql<number>`count(*)::int`,
        })
        .from(feedbacks)
        .where(gte(feedbacks.createdAt, windowStart))
        .groupBy(feedbacks.status),
      this.database
        .select({
          key: systemMailCampaigns.status,
          count: sql<number>`count(*)::int`,
        })
        .from(systemMailCampaigns)
        .groupBy(systemMailCampaigns.status),
      this.database
        .select({
          total: sql<number>`count(*)::int`,
          unread: sql<number>`count(*) filter (where ${mails.isRead} = false)::int`,
          unclaimed: sql<number>`count(*) filter (where ${mails.isClaimed} = false)::int`,
          recent: sql<number>`count(*) filter (where ${mails.createdAt} >= ${windowStart})::int`,
        })
        .from(mails),
      this.database
        .select({
          key: sponsorshipOrders.verificationStatus,
          count: sql<number>`count(*)::int`,
        })
        .from(sponsorshipOrders)
        .groupBy(sponsorshipOrders.verificationStatus),
      this.database
        .select({
          key: sponsorshipOrders.fulfillmentStatus,
          count: sql<number>`count(*)::int`,
        })
        .from(sponsorshipOrders)
        .groupBy(sponsorshipOrders.fulfillmentStatus),
    ]);

    const mailReceipt = mailReceipts[0] ?? {
      total: 0,
      unread: 0,
      unclaimed: 0,
      recent: 0,
    };
    return {
      success: true,
      data: {
        generatedAt: new Date().toISOString(),
        windowHours: query.windowHours,
        windowStart: windowStart.toISOString(),
        database: { ok: true, latencyMs: databaseLatencyMs },
        feedbacks: {
          totalsByStatus: toCountMap(feedbackTotals),
          recentByStatus: toCountMap(feedbackRecent),
        },
        systemMailCampaigns: {
          totalsByStatus: toCountMap(campaignTotals),
          deliveryReceipts: {
            total: Number(mailReceipt.total),
            unread: Number(mailReceipt.unread),
            unclaimed: Number(mailReceipt.unclaimed),
            recent: Number(mailReceipt.recent),
          },
        },
        sponsorshipOrders: {
          totalsByVerificationStatus: toCountMap(sponsorshipVerification),
          totalsByFulfillmentStatus: toCountMap(sponsorshipFulfillment),
        },
      },
    };
  }
}
