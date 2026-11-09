/**
 * FormScanner — entry point for the content script.
 *
 * The content script runs in every frame (manifest `all_frames`), because many
 * ATS forms are embedded in iframes. A scan or fill request is broadcast to
 * all frames of the tab, so each frame:
 * - scans only its own document,
 * - stays silent when it has nothing to report (sub-frames),
 * - fills only fields it detected itself, reporting results only for those.
 * The side panel merges the per-frame messages.
 */

import type { ApplicationQuestion, ExtensionMessage, FieldFillResult } from '@arzi-baaz/contracts';
import { isExtensionMessage } from '@arzi-baaz/contracts';
import { extractFields, getRegisteredElement, ownsField } from './field-extractor';
import { classify } from './classifier';
import { FormObserver } from './form-observer';
import { fillElement, isCombobox, type FillOutcome } from './autofill';
import { applyMarks, clearMarks } from './highlighter';

const isTopFrame = window === window.top;

let formObserver: FormObserver | null = null;
let detectedFields: ApplicationQuestion[] = [];

function send(message: ExtensionMessage): void {
  chrome.runtime.sendMessage(message).catch(() => {
    // The side panel may be closed — that is fine.
  });
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isExtensionMessage(message)) return false;

  const msg = message as ExtensionMessage;

  switch (msg.type) {
    case 'SCAN_FORM': {
      handleScanForm()
        .then((fields) => {
          // A sub-frame without a form has nothing to add.
          if (!isTopFrame && fields.length === 0) return;
          const response: ExtensionMessage = { type: 'FORM_SCAN_RESULT', payload: fields };
          send(response);
          sendResponse(response);
        })
        .catch((error) => {
          console.error('[ArziBaaz] Form scan failed:', error);
          if (!isTopFrame) return;
          sendResponse({
            type: 'ERROR',
            payload: { code: 'FORM_SCAN_ERROR', message: 'Failed to scan form' },
          } satisfies ExtensionMessage);
        });
      return true; // keep the channel open for the async response
    }

    case 'SCAN_JOB_DESCRIPTION': {
      const description = extractJobDescriptionText();
      if (!isTopFrame && description === null) return false;
      const response: ExtensionMessage = { type: 'JOB_DESCRIPTION_RESULT', payload: description };
      send(response);
      sendResponse(response);
      return false;
    }

    case 'FILL_FIELD': {
      const { fieldId, value } = msg.payload;
      if (!ownsField(fieldId)) return false;
      fillField(fieldId, value).then((outcome) => {
        sendResponse({
          type: 'FIELD_FILL_RESULT',
          payload: { fieldId, success: outcome.success },
        } satisfies ExtensionMessage);
      });
      return true;
    }

    case 'FILL_APPROVED_FIELDS': {
      const owned = msg.payload.filter((f) => ownsField(f.fieldId));
      if (owned.length === 0) return false; // another frame owns these fields

      fillAll(owned).then((results) => {
        const response: ExtensionMessage = { type: 'FILL_RESULTS', payload: results };
        send(response);
        sendResponse(response);
      });
      return true;
    }

    case 'HIGHLIGHT_FIELDS': {
      const owned = msg.payload.filter((m) => ownsField(m.fieldId));
      if (owned.length === 0) return false;
      const resolve = (fieldId: string) => {
        const question = detectedFields.find((f) => f.id === fieldId);
        return getRegisteredElement(fieldId) ?? (question ? findFormElementByQuestion(question) : null);
      };
      // Bring the first field that needs attention into view; the rest are visible as the user scrolls.
      applyMarks(owned, resolve)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }

    case 'CLEAR_HIGHLIGHTS': {
      clearMarks();
      return false;
    }

    default:
      return false;
  }
});

/** Fills one field at a time: dropdowns open popups that would collide if run in parallel. */
async function fillAll(
  fields: Array<{ fieldId: string; value: string; label: string }>,
): Promise<FieldFillResult[]> {
  const results: FieldFillResult[] = [];
  for (const { fieldId, value, label } of fields) {
    const outcome = await fillField(fieldId, value);
    results.push({ fieldId, label, success: outcome.success, error: outcome.error });
  }
  return results;
}

async function handleScanForm(): Promise<ApplicationQuestion[]> {
  const fields = extractFields();
  const classified = fields.map(withClassification);

  detectedFields = classified;
  console.log(`[ArziBaaz] ${isTopFrame ? 'Top frame' : 'Sub-frame'}: detected ${classified.length} fields`);

  formObserver?.stop();
  formObserver = new FormObserver();
  formObserver.start(handleDynamicFieldAddition);

  return classified;
}

function withClassification(field: ApplicationQuestion): ApplicationQuestion {
  const classification = classify(field);
  return {
    ...field,
    category: classification.category,
    canonicalField: classification.canonicalField,
    confidence: classification.confidence,
  };
}

/** Reports fields that appeared after the initial scan (multi-step forms, lazy sections). */
function handleDynamicFieldAddition(): void {
  try {
    const newFields = extractFields().filter((f) => !detectedFields.some((d) => d.id === f.id));
    if (newFields.length === 0) return;

    const classified = newFields.map(withClassification);
    detectedFields.push(...classified);
    console.log(`[ArziBaaz] Detected ${classified.length} new dynamic field(s)`);

    send({ type: 'FORM_SCAN_RESULT', payload: classified });
  } catch (error) {
    console.error('[ArziBaaz] Dynamic field detection error:', error);
  }
}

function extractJobDescriptionText(): string | null {
  const selectors = [
    '[class*="job-description"]',
    '[class*="jobDescription"]',
    '[id*="job-description"]',
    '[class*="posting"]',
    'article',
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el?.textContent && el.textContent.trim().length > 200) {
      return el.textContent.trim().slice(0, 10_000);
    }
  }

  return null;
}

async function fillField(fieldId: string, value: string): Promise<FillOutcome> {
  try {
    const question = detectedFields.find((f) => f.id === fieldId);

    // The registered element is exact; re-lookup covers frameworks that re-mount inputs.
    const el = getRegisteredElement(fieldId) ?? (question ? findFormElementByQuestion(question) : null);
    if (!el) return { success: false, error: 'Form element no longer on page' };
    if (!isFormField(el)) return { success: false, error: 'Field type cannot be filled automatically' };

    return await fillElement(el, value);
  } catch (error) {
    console.error('[ArziBaaz] Fill field error:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Fallback lookup when the originally detected element was replaced:
 * 1. id attribute  2. name + type  3. label text  4. placeholder
 */
function findFormElementByQuestion(question: ApplicationQuestion): HTMLElement | null {
  try {
    if (question.elementId) {
      const el = document.getElementById(question.elementId);
      if (el && isFormField(el)) return el;
    }

    if (question.name && question.elementType) {
      const type = question.inputType && question.inputType !== 'combobox' ? `[type="${question.inputType}"]` : '';
      const el = document.querySelector<HTMLElement>(
        `${question.elementType}[name="${CSS.escape(question.name)}"]${question.elementType === 'input' ? type : ''}`,
      );
      if (el && isFormField(el)) return el;
    }

    if (question.label) {
      const wanted = question.label.toLowerCase();
      for (const label of Array.from(document.querySelectorAll('label'))) {
        if (label.textContent?.trim().toLowerCase() !== wanted) continue;
        const el = label.control ?? document.getElementById(label.getAttribute('for') || '');
        if (el && isFormField(el as HTMLElement)) return el as HTMLElement;
      }
    }

    if (question.placeholder && question.elementType === 'input') {
      const el = document.querySelector<HTMLElement>(`input[placeholder="${CSS.escape(question.placeholder)}"]`);
      if (el && isFormField(el)) return el;
    }

    return null;
  } catch (error) {
    console.error('[ArziBaaz] Error finding form element:', error);
    return null;
  }
}

/** Never fill password, hidden, file, or button-like inputs. */
function isFormField(el: HTMLElement): boolean {
  if (isCombobox(el)) return true;
  const input = el as HTMLInputElement;
  if (['password', 'hidden', 'file', 'submit', 'button', 'reset', 'image'].includes(input.type)) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select';
}
