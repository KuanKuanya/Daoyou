import { z } from 'zod';

export const AdminOperationsFeedbackQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(['pending', 'processing', 'resolved', 'closed']).optional(),
    type: z.enum(['bug', 'feature', 'balance', 'other']).optional(),
    search: z.string().trim().max(200).default(''),
  })
  .strict();

export const AdminOperationsDiagnosticsQuerySchema = z
  .object({
    windowHours: z.coerce.number().int().min(1).max(24 * 30).default(24),
  })
  .strict();

export const AdminOperationsAuditQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z
      .enum(['pending', 'running', 'succeeded', 'failed', 'partial', 'conflict'])
      .optional(),
    action: z.string().trim().max(64).optional(),
    requestKey: z.string().trim().max(160).optional(),
  })
  .strict();
