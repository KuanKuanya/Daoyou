import { ZodError } from 'zod';
import { apiErrorFilter } from '../http/error-filter.js';

export const SystemMailErrors = apiErrorFilter((error) => {
  if (error instanceof ZodError) {
    return Response.json(
      { success: false, error: error.issues[0]?.message ?? '请检查邮件配置' },
      { status: 400 },
    );
  }
  return undefined;
});
