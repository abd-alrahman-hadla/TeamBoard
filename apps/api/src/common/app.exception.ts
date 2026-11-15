import { HttpException } from '@nestjs/common';
import type { ErrorCode } from '@teamboard/shared';

/** An HTTP error with a stable machine-readable `code` that clients can switch on. */
export class AppException extends HttpException {
  constructor(
    status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message, status);
  }
}
