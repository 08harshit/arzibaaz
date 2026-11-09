/**
 * ATS Adapter interface.
 * Each adapter implements platform-specific form scanning and filling.
 * Milestone 8 adds concrete implementations beyond the generic adapter.
 */

import type { ApplicationQuestion, JobContext } from '@arzi-baaz/contracts';

export interface ATSAdapter {
  /** Returns true if this adapter recognizes the current page. */
  detect(): boolean;

  /** Scans the form and returns detected questions. */
  scanForm(): Promise<ApplicationQuestion[]>;

  /** Extracts job context from the page, if available. */
  extractJobContext(): Promise<JobContext | null>;

  /** Fills a specific field. Returns true if successful. */
  fillField(fieldId: string, value: string): Promise<boolean>;
}
