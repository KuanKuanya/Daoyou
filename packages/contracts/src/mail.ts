import { z } from 'zod';

export const MailDestinationSchema = z.enum(['bag', 'storage']);
export type MailDestination = z.infer<typeof MailDestinationSchema>;

export const ClaimMailSchema = z
  .object({
    mailId: z.uuid(),
    destination: MailDestinationSchema.default('bag'),
  })
  .strict();
export type ClaimMailRequest = z.infer<typeof ClaimMailSchema>;

export const ClaimAllMailSchema = z
  .object({
    requestId: z.uuid(),
    destination: MailDestinationSchema.default('bag'),
  })
  .strict();
export type ClaimAllMailRequest = z.infer<typeof ClaimAllMailSchema>;

export const SendMailSchema = z
  .object({
    requestId: z.string().min(1).max(120),
    recipientCultivatorId: z.uuid(),
    content: z.string().trim().min(1).max(1000),
    attachment: z
      .object({
        itemId: z.uuid(),
        revision: z.number().int().nonnegative(),
        quantity: z.number().int().min(1).max(99),
      })
      .strict()
      .optional(),
  })
  .strict();

export type SendMailRequest = z.infer<typeof SendMailSchema>;
