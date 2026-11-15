import { type ArgumentMetadata, HttpStatus, Injectable, type PipeTransform } from '@nestjs/common';
import { ERROR_CODES } from '@teamboard/shared';
import type { z } from 'zod';
import { AppException } from './app.exception';
import { getZodSchema } from './zod-dto';

export interface ValidationIssue {
  path: string;
  message: string;
  code: string;
}

export function toValidationIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
    code: issue.code,
  }));
}

/** Global pipe: validates any parameter whose type was made with `createZodDto`. Others pass through. */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    const schema = getZodSchema(metadata.metatype);
    if (!schema) return value;

    const result = schema.safeParse(value);
    if (!result.success) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.validationFailed,
        'Validation failed',
        toValidationIssues(result.error),
      );
    }
    return result.data;
  }
}
