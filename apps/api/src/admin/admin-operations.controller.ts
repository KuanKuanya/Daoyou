import { Controller, Get, Inject, UseFilters } from '@nestjs/common';
import type { z } from 'zod';
import { Access } from '../auth/access.js';
import { FirstQuery } from '../http/first-query.js';
import { ZodPipe } from '../http/zod.pipe.js';
import { AdminErrors } from './admin-errors.js';
import {
  AdminOperationsDiagnosticsQuerySchema,
  AdminOperationsFeedbackQuerySchema,
} from './admin-operations-input.js';
import { AdminOperationsService } from './admin-operations.service.js';

@Controller('api/admin/operations')
@Access('admin')
@UseFilters(AdminErrors)
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
}
