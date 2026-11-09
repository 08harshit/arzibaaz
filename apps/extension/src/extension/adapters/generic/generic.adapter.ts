/**
 * Generic ATS adapter — works on any standard HTML form.
 * This is the default adapter used when no platform-specific adapter matches.
 */

import type { ApplicationQuestion, JobContext } from '@arzi-baaz/contracts';
import type { ATSAdapter } from '../ats-adapter.interface';
import { extractFields, getRegisteredElement } from '../../content/field-extractor';
import { classify } from '../../content/classifier';
import { fillElement } from '../../content/autofill';

export class GenericAdapter implements ATSAdapter {
  detect(): boolean {
    // The generic adapter matches everything as a fallback
    return true;
  }

  async scanForm(): Promise<ApplicationQuestion[]> {
    const fields = extractFields();
    return fields.map((field) => {
      const classification = classify(field);
      return {
        ...field,
        canonicalField: classification.canonicalField,
        category: classification.category,
        confidence: classification.confidence,
      };
    });
  }

  async extractJobContext(): Promise<JobContext | null> {
    // Generic extraction — Milestone 5 adds more sophisticated detection
    return null;
  }

  async fillField(fieldId: string, value: string): Promise<boolean> {
    const el = getRegisteredElement(fieldId);
    if (!el) {
      console.warn('[ArziBaaz Generic] Element not found:', fieldId);
      return false;
    }
    return (await fillElement(el, value)).success;
  }
}
