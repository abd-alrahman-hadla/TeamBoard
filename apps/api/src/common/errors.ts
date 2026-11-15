import { HttpStatus } from '@nestjs/common';
import { ERROR_CODES, type ErrorCode } from '@teamboard/shared';
import { Prisma } from '../generated/prisma/client';
import { AppException } from './app.exception';

/**
 * The one 404 for workspace-scoped resources. "Doesn't exist" and "exists but not yours" must be
 * indistinguishable, so every such path throws exactly this.
 */
export function notFound(): AppException {
  return new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.notFound, 'Not found');
}

export function forbidden(
  message = 'You do not have permission to do this',
  code: ErrorCode = ERROR_CODES.forbidden,
): AppException {
  return new AppException(HttpStatus.FORBIDDEN, code, message);
}

export function badRequest(code: ErrorCode, message: string): AppException {
  return new AppException(HttpStatus.BAD_REQUEST, code, message);
}

export function conflict(code: ErrorCode, message: string): AppException {
  return new AppException(HttpStatus.CONFLICT, code, message);
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
