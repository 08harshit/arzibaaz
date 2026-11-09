import type { ApplicationQuestion } from './application';
import type { GeneratedAnswer } from './answer';

/**
 * Per-field autofill result with success/failure and error details.
 */
export interface FieldFillResult {
  fieldId: string;
  label: string;
  success: boolean;
  error?: string;
}

/**
 * Typed messages exchanged between the extension side-panel,
 * the background service worker, and content scripts.
 *
 * Keep this exhaustive — every message type must be declared here.
 */
export type ExtensionMessage =
  | { type: 'SCAN_FORM' }
  | { type: 'FORM_SCAN_RESULT'; payload: ApplicationQuestion[] }
  | { type: 'SCAN_JOB_DESCRIPTION' }
  | { type: 'JOB_DESCRIPTION_RESULT'; payload: string | null }
  | { type: 'FILL_FIELD'; payload: { fieldId: string; value: string } }
  | { type: 'FILL_APPROVED_FIELDS'; payload: Array<{ fieldId: string; value: string; label: string }> }
  | { type: 'FIELD_FILL_RESULT'; payload: { fieldId: string; success: boolean } }
  | { type: 'FILL_RESULTS'; payload: FieldFillResult[] }
  | { type: 'ANSWERS_GENERATED'; payload: GeneratedAnswer[] }
  | { type: 'AUTH_STATE_CHANGED'; payload: { isAuthenticated: boolean } }
  | { type: 'GET_AUTH_TOKEN' }
  | { type: 'AUTH_TOKEN_RESULT'; payload: { token: string | null } }
  | { type: 'ERROR'; payload: { code: string; message: string } };

/**
 * Type guard to check the shape of an incoming Chrome runtime message.
 */
export function isExtensionMessage(value: unknown): value is ExtensionMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof (value as Record<string, unknown>)['type'] === 'string'
  );
}
