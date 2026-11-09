/**
 * ATS detection and platform-specific label lookup.
 *
 * Detection is hostname-first. Application forms are often embedded in an
 * iframe served from the ATS's own domain, and content scripts run in every
 * frame, so the frame's hostname is the most reliable signal.
 *
 * Label markup:
 * - Lever: verified against a live apply page (li.application-question > .application-label).
 * - Greenhouse: standard <label for> / aria-labelledby, handled by the generic detector.
 * - Ashby, LinkedIn: best-effort from known class names; not verified against live pages
 *   (Ashby renders client-side, LinkedIn requires login).
 */

export type ATSPlatform = 'linkedin' | 'greenhouse' | 'lever' | 'ashby' | 'generic';

const HOST_RULES: Array<[ATSPlatform, RegExp]> = [
  ['linkedin', /(^|\.)linkedin\.com$/],
  ['greenhouse', /(^|\.)greenhouse\.io$/],
  ['lever', /(^|\.)lever\.co$/],
  ['ashby', /(^|\.)ashbyhq\.com$/],
];

export function detectATS(): ATSPlatform {
  const host = window.location.hostname.toLowerCase();
  for (const [platform, pattern] of HOST_RULES) {
    if (pattern.test(host)) return platform;
  }

  // Company-hosted pages that embed an ATS directly in the page.
  if (document.querySelector('#grnhse_app, #grnhse_iframe, form#application_form')) return 'greenhouse';
  if (document.querySelector('.ashby-application-form-field-entry')) return 'ashby';

  return 'generic';
}

/** Text of an element without form controls or required-field markers. */
export function ownText(root: Element): string {
  const clone = root.cloneNode(true) as Element;
  clone
    .querySelectorAll(
      'input, select, textarea, button, option, script, style, ul, ol, [hidden], [aria-hidden="true"], [style*="display: none"], [style*="display:none"], .required, .asterisk',
    )
    .forEach((n) => n.remove());
  return cleanLabel(clone.textContent ?? '');
}

/** Collapse whitespace and strip trailing required markers such as "*" or "✱". */
export function cleanLabel(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s*[*✱✲]+\s*$/, '')
    .replace(/\s*\(required\)\s*$/i, '')
    .trim();
}

/**
 * Looks up the question text for a field using the platform's own markup.
 * Returns undefined to let the generic detector take over.
 */
export function findPlatformLabel(el: HTMLElement, platform: ATSPlatform): string | undefined {
  let container: Element | null = null;
  let labelSelector = '';

  switch (platform) {
    case 'lever':
      container = el.closest('li.application-question, label');
      labelSelector = '.application-label';
      break;
    case 'ashby':
      container = el.closest('.ashby-application-form-field-entry, [class*="fieldEntry"]');
      labelSelector = 'label, legend';
      break;
    case 'linkedin':
      container = el.closest(
        '.fb-dash-form-element, .jobs-easy-apply-form-element, .jobs-easy-apply-form-section__grouping',
      );
      labelSelector = 'legend, label, .fb-dash-form-element__label';
      break;
    default:
      return undefined;
  }

  const labelEl = container?.querySelector(labelSelector);
  const text = labelEl ? ownText(labelEl) : '';
  return text || undefined;
}
