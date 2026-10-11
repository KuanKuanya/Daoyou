import { redisLockErrorResponse } from '@server/lib/http/errors.js';
import { ZodError } from 'zod';
import { apiErrorFilter } from '../http/error-filter.js';

function adminErrorResponse(error: unknown): Response {
  const lock = redisLockErrorResponse(error);
  if (lock) return lock;
  console.error('Admin API error:', error);
  return Response.json(
    { success: false, error: '服务器内部错误' },
    { status: 500 },
  );
}

export const AdminErrors = apiErrorFilter(adminErrorResponse);

export const AdminOperationsErrors = apiErrorFilter((error) => {
  if (error instanceof ZodError) {
    return Response.json(
      { success: false, error: error.issues[0]?.message ?? '请求参数无效' },
      { status: 400 },
    );
  }
  return adminErrorResponse(error);
});
