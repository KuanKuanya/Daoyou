import {
  ClaimAllMailSchema,
  ClaimMailSchema,
  SendMailSchema,
  type ClaimAllMailRequest,
  type ClaimMailRequest,
  type SendMailRequest,
} from '@daoyou/contracts/mail';
import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  UseFilters,
} from '@nestjs/common';
import { BeastError } from '@server/combat/application/BeastMutationGuard.js';
import { InventoryError } from '@server/inventory/operations.js';
import type { ActiveCultivatorRef } from '@server/lib/auth/types.js';
import { redisLockErrorResponse } from '@server/lib/http/errors.js';
import { JournalIdempotencyError } from '@server/lib/repositories/playerJournalRepository.js';
import { PlayerMailCommandError } from '@server/mail/application/PlayerMailApplicationService.js';
import { PlayerMailServiceError } from '@server/mail/application/PlayerMailService.js';
import { PlayerCommandIdempotencyError } from '@server/player/application/state/CommandExecutors.js';
import { z } from 'zod';
import { Access, CurrentCultivator } from '../auth/access.js';
import { apiErrorFilter } from '../http/error-filter.js';
import { FirstQuery } from '../http/first-query.js';
import { JsonBody } from '../http/json-body.js';
import { ZodPipe } from '../http/zod.pipe.js';
import { MailService } from './mail.service.js';

const MailIdSchema = z.object({ mailId: z.string() });
const SendErrors = apiErrorFilter((error) => {
  const lock = redisLockErrorResponse(error);
  if (lock) return lock;
  if (error instanceof z.ZodError)
    return Response.json(
      { error: '参数错误', details: error.issues },
      { status: 400 },
    );
  if (
    error instanceof InventoryError ||
    error instanceof PlayerCommandIdempotencyError
  )
    return Response.json({ error: error.message }, { status: 409 });
  if (error instanceof PlayerMailServiceError)
    return Response.json({ error: error.message }, { status: error.status });
  console.error('mail send api error:', error);
  return Response.json({ error: '发送传音失败' }, { status: 500 });
});
const ClaimAllErrors = apiErrorFilter((error) => {
  if (error instanceof z.ZodError)
    return Response.json(
      { error: '参数错误', details: error.issues },
      { status: 400 },
    );
  if (
    error instanceof BeastError ||
    error instanceof PlayerCommandIdempotencyError ||
    error instanceof JournalIdempotencyError
  )
    return Response.json({ error: error.message }, { status: 409 });
  return redisLockErrorResponse(error) ?? undefined;
});
const ClaimErrors = apiErrorFilter((error) => {
  if (error instanceof z.ZodError)
    return Response.json(
      { error: '参数错误', details: error.issues },
      { status: 400 },
    );
  if (
    error instanceof BeastError ||
    error instanceof PlayerCommandIdempotencyError ||
    error instanceof JournalIdempotencyError
  )
    return Response.json({ error: error.message }, { status: 409 });
  const lock = redisLockErrorResponse(error);
  if (lock) return lock;
  if (error instanceof PlayerMailCommandError)
    return Response.json({ error: error.message }, { status: error.status });
});
const ReadErrors = apiErrorFilter((error) => {
  if (error instanceof PlayerMailCommandError)
    return Response.json({ error: error.message }, { status: error.status });
});

@Controller('api/cultivator/mail')
@Access('active')
export class MailController {
  constructor(@Inject(MailService) private readonly mail: MailService) {}

  @Get()
  list(
    @CurrentCultivator() actor: ActiveCultivatorRef,
    @FirstQuery('page') page?: string,
    @FirstQuery('pageSize') pageSize?: string,
  ) {
    return this.mail.list(actor.cultivatorId, page, pageSize);
  }

  @Get('unread-count')
  unreadCount(@CurrentCultivator() actor: ActiveCultivatorRef) {
    return this.mail.unreadCount(actor.cultivatorId);
  }

  @Post('send')
  @HttpCode(200)
  @UseFilters(SendErrors)
  send(
    @CurrentCultivator() actor: ActiveCultivatorRef,
    @JsonBody(new ZodPipe(SendMailSchema)) input: SendMailRequest,
  ) {
    return this.mail.send(actor, input);
  }

  @Post('claim')
  @HttpCode(200)
  @UseFilters(ClaimErrors)
  claim(
    @CurrentCultivator() actor: ActiveCultivatorRef,
    @JsonBody(new ZodPipe(ClaimMailSchema)) input: ClaimMailRequest,
  ) {
    return this.mail.claim(actor, input);
  }

  @Post('claim-all')
  @HttpCode(200)
  @UseFilters(ClaimAllErrors)
  claimAll(
    @CurrentCultivator() actor: ActiveCultivatorRef,
    @JsonBody(new ZodPipe(ClaimAllMailSchema)) input: ClaimAllMailRequest,
  ) {
    return this.mail.claimAll(actor, input);
  }

  @Post('read')
  @HttpCode(200)
  @UseFilters(ReadErrors)
  read(
    @CurrentCultivator() actor: ActiveCultivatorRef,
    @JsonBody(new ZodPipe(MailIdSchema)) input: z.infer<typeof MailIdSchema>,
  ) {
    return this.mail.read(actor, input.mailId);
  }

  @Post('read-all')
  @HttpCode(200)
  readAll(@CurrentCultivator() actor: ActiveCultivatorRef) {
    return this.mail.readAll(actor);
  }
}
