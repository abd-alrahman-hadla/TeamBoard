import { Injectable, type PipeTransform } from '@nestjs/common';
import { idSchema } from '@teamboard/shared';
import { notFound } from './errors';

export function isId(value: unknown): value is string {
  return idSchema.safeParse(value).success;
}

/** Route ids that aren't uuids can't exist: answer 404 (never let Postgres reject them with a 500). */
@Injectable()
export class ParseIdPipe implements PipeTransform<unknown, string> {
  transform(value: unknown): string {
    if (!isId(value)) throw notFound();
    return value;
  }
}
