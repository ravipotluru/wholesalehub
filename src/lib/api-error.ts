import { NextResponse } from 'next/server';
import { logger } from './logger';

/**
 * Stable error response envelope for API routes. Frontend code should match
 * on `code`, never on `message` (messages may be reworded; codes are part of
 * the contract). `requestId` lets a user copy a value when filing a bug.
 *
 * Codes use SCREAMING_SNAKE_CASE namespaced by feature, e.g.
 * `ORDER_CREDIT_LIMIT_EXCEEDED`, `WEBHOOK_INVALID_SIGNATURE`.
 */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId: string;
  };
}

/** Generate a short opaque request id we attach to logs and error responses. */
export function newRequestId(): string {
  return 'req_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export interface ApiErrorOptions {
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
  /** Pre-existing request id (e.g. from middleware). Generated if absent. */
  requestId?: string;
  /** Free-form context for the log line (NOT returned to the client). */
  logContext?: Record<string, unknown>;
}

/**
 * Build a JSON `NextResponse` with the standard envelope. Always logs via
 * the structured pino logger so we can correlate user-facing errors with
 * the server log via `requestId`.
 */
export function apiError(opts: ApiErrorOptions): NextResponse<ApiErrorBody> {
  const requestId = opts.requestId ?? newRequestId();
  const body: ApiErrorBody = {
    error: {
      code: opts.code,
      message: opts.message,
      details: opts.details,
      requestId,
    },
  };
  logger.warn({
    event: 'api_error',
    requestId,
    code: opts.code,
    status: opts.status,
    ...opts.logContext,
  });
  return NextResponse.json(body, {
    status: opts.status,
    headers: { 'X-Request-Id': requestId },
  });
}
