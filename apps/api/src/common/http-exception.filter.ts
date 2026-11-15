import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { type ApiErrorBody, ERROR_CODES, type ErrorCode } from '@teamboard/shared';
import type { Response } from 'express';
import { STATUS_CODES } from 'node:http';
import { AppException } from './app.exception';

const DEFAULT_CODES: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ERROR_CODES.validationFailed,
  [HttpStatus.UNAUTHORIZED]: ERROR_CODES.unauthorized,
  [HttpStatus.NOT_FOUND]: ERROR_CODES.notFound,
  [HttpStatus.TOO_MANY_REQUESTS]: ERROR_CODES.rateLimited,
};

function messageOf(exception: HttpException): string {
  const response = exception.getResponse();
  if (typeof response === 'string') return response;
  if (typeof response === 'object' && 'message' in response) {
    const { message } = response;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.join('; ');
  }
  return exception.message;
}

export function toErrorBody(exception: unknown): ApiErrorBody {
  if (exception instanceof HttpException) {
    const statusCode = exception.getStatus();
    const code =
      exception instanceof AppException ? exception.code : (DEFAULT_CODES[statusCode] ?? 'http_error');
    const body: ApiErrorBody = {
      statusCode,
      error: STATUS_CODES[statusCode] ?? 'Error',
      code,
      message: messageOf(exception),
    };
    if (exception instanceof AppException && exception.details !== undefined) {
      body.details = exception.details;
    }
    return body;
  }
  return {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    error: 'Internal Server Error',
    code: ERROR_CODES.internal,
    message: 'Something went wrong',
  };
}

/** Formats every error as the shared `ApiErrorBody` shape. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const body = toErrorBody(exception);
    if (body.statusCode >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }
    response.status(body.statusCode).json(body);
  }
}
