export const ERROR_STATUS = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  MODULE_DISABLED: 404,
  NOT_FOUND: 404,
  VALIDATION: 400,
  CONFLICT: 409,
  CURRENCY_MISMATCH: 400,
  RATE_LIMITED: 429,
  INVALID_STATE: 409,
  INTERNAL: 500,
} as const;

export type AppErrorCode = keyof typeof ERROR_STATUS;

export class AppError extends Error {
  readonly status: number;

  constructor(
    public readonly code: AppErrorCode,
    message: string,
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AppError';
    this.status = ERROR_STATUS[code];
  }
}
