export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string = 'ERROR',
    public readonly details: unknown = null,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, message, 'BAD_REQUEST', details ?? null);

export const unauthorized = (message = 'Authentication required') =>
  new AppError(401, message, 'UNAUTHORIZED');

export const forbidden = (message = 'You do not have access to this resource') =>
  new AppError(403, message, 'FORBIDDEN');

export const notFound = (message = 'Resource not found') =>
  new AppError(404, message, 'NOT_FOUND');

export const conflict = (message: string) => new AppError(409, message, 'CONFLICT');

export const tooManyRequests = (message = 'Too many requests') =>
  new AppError(429, message, 'RATE_LIMITED');

export const serviceUnavailable = (message: string) =>
  new AppError(503, message, 'UNAVAILABLE');

export const internal = (message = 'Internal server error') =>
  new AppError(500, message, 'INTERNAL');
