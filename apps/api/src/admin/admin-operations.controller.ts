import { Controller, Get, Inject, UseFilters } from '@nestjs/common';
import type { z } from 'zod';
import { Access } from '../auth/access.js';
import { FirstQuery } from '../http/first-query.js';
import { ZodPipe } from '../http/zod.pipe.js';
import { AdminOperationsErrors } from './admin-errors.js';
import {
  AdminOperationsDiagnosticsQuerySchema,
  AdminOperationsAuditQuerySchema,
  AdminOperationsFeedbackQuerySchema,
} from './admin-operations-input.js';
import { AdminOperationsService } from './admin-operations.service.js';

@Controller('api/admin/operations')
@Access('admin')
@UseFilters(AdminOperationsErrors)
export class AdminOperationsController {
  constructor(
    @Inject(AdminOperationsService)
    private readonly operations: AdminOperationsService,
  ) {}

  @Get('feedbacks')
  feedbacks(
    @FirstQuery(new ZodPipe(AdminOperationsFeedbackQuerySchema))
    query: z.infer<typeof AdminOperationsFeedbackQuerySchema>,
  ) {
    return this.operations.listFeedbacks(query);
  }

  @Get('diagnostics')
  diagnostics(
    @FirstQuery(new ZodPipe(AdminOperationsDiagnosticsQuerySchema))
    query: z.infer<typeof AdminOperationsDiagnosticsQuerySchema>,
  ) {
    return this.operations.diagnostics(query);
  }

  @Get('audit')
  audit(
    @FirstQuery(new ZodPipe(AdminOperationsAuditQuerySchema))
    query: z.infer<typeof AdminOperationsAuditQuerySchema>,
  ) {
    return this.operations.audit(query);
  }
}
