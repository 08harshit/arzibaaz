import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';

const toCamelKey = (key: string): string => key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

/** Recursively converts object keys from snake_case (database rows) to camelCase (the shared contracts). */
export function toCamelCase(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toCamelCase);
  if (!isPlainObject(value)) return value;

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) out[toCamelKey(key)] = toCamelCase(val);

  // The preferences contract uses short names (length/tone/style) while the table uses answer_*.
  if ('answerLength' in out) {
    out['length'] = out['answerLength'];
    out['tone'] = out['answerTone'];
    out['style'] = out['answerStyle'];
  }
  return out;
}

/** Makes API responses match the camelCase types in @arzi-baaz/contracts. */
@Injectable()
export class CamelCaseInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map(toCamelCase));
  }
}
