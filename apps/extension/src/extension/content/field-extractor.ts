/**
 * FieldExtractor — extracts metadata from DOM form elements.
 *
 * Content scripts run in every frame, so each frame extracts only its own
 * document. Field ids carry a per-frame token to stay unique across frames,
 * and are stable across rescans so dynamic updates can be deduplicated by id.
 */

import type { ApplicationQuestion } from '@arzi-baaz/contracts';
import { cleanLabel, detectATS, findPlatformLabel, ownText, type ATSPlatform } from './ats-detector';
import { groupOf, optionLabelText } from './autofill';

const FRAME_TOKEN = Math.random().toString(36).slice(2, 7);
const CANDIDATE_SELECTOR = 'input, textarea, select, [role="combobox"]';
const SKIPPED_INPUT_TYPES = new Set(['password', 'hidden', 'file', 'submit', 'button', 'reset', 'image', 'search']);

const elementIds = new WeakMap<HTMLElement, string>();
const registry = new Map<string, HTMLElement>();
let idCounter = 0;

function stableId(el: HTMLElement): string {
  let id = elementIds.get(el);
  if (!id) {
    id = `arzibaaz-${FRAME_TOKEN}-${idCounter++}`;
    elementIds.set(el, id);
  }
  registry.set(id, el);
  return id;
}

/** The live element for a detected field id, if this frame owns it and it is still on the page. */
export function getRegisteredElement(id: string): HTMLElement | null {
  const el = registry.get(id);
  return el?.isConnected ? el : null;
}

/** True if this frame detected the field (even if it has since left the page). */
export function ownsField(id: string): boolean {
  return registry.has(id);
}

/**
 * Extracts all fillable form fields from this frame's document.
 * Radio/checkbox inputs sharing a name are returned as ONE question.
 */
export function extractFields(): ApplicationQuestion[] {
  const platform = detectATS();
  const candidates = Array.from(new Set(Array.from(document.querySelectorAll<HTMLElement>(CANDIDATE_SELECTOR))));
  const fields = groupRadioCheckboxFields(candidates.filter((el) => !shouldSkip(el)));
  return fields.map((el) => extractField(el, platform));
}

function isCombobox(el: HTMLElement): boolean {
  return el.getAttribute('role') === 'combobox';
}

function shouldSkip(el: HTMLElement): boolean {
  const input = el as HTMLInputElement;
  const combo = isCombobox(el);

  // A <button role="combobox"> has type "submit"; only judge types of real inputs.
  if (!combo && SKIPPED_INPUT_TYPES.has(input.type)) return true;
  // Search boxes inside widgets (e.g. a phone field's country picker) are role=combobox but not form fields.
  if (input.type === 'search') return true;
  if (input.disabled) return true;
  if (el.closest('[role="search"], #goog-gt-votingForm')) return true;

  // Custom-styled radios/checkboxes are often visually hidden, so only test other fields.
  const isChoice = input.type === 'radio' || input.type === 'checkbox';
  if (!isChoice) {
    if (typeof el.checkVisibility === 'function' && !el.checkVisibility()) return true;
    if (el.getAttribute('aria-hidden') === 'true') return true;
    if (input.readOnly && !combo) return true;
  }

  return false;
}

/** Keeps only the first element of each radio/checkbox group. */
function groupRadioCheckboxFields(elements: HTMLElement[]): HTMLElement[] {
  const result: HTMLElement[] = [];
  const seen = new Set<string>();

  for (const el of elements) {
    const input = el as HTMLInputElement;
    if (input.type !== 'radio' && input.type !== 'checkbox') {
      result.push(el);
      continue;
    }

    const scope = input.form ? `form:${input.form.id || input.form.name || 'anon'}` : 'doc';
    const key = input.name
      ? `${scope}|${input.type}|${input.name}`
      : `${scope}|${input.type}|fieldset:${el.closest('fieldset')?.id || stableId(el)}`;

    if (!seen.has(key)) {
      seen.add(key);
      result.push(el);
    }
  }

  return result;
}

function detectFramework(el: HTMLElement): 'react' | 'vue' | 'angular' | 'none' {
  const keys = Object.keys(el);
  if (el.hasAttribute('data-reactroot') || keys.some((k) => k.startsWith('__reactFiber') || k.startsWith('__reactProps'))) {
    return 'react';
  }
  if (el.hasAttribute('ng-model') || Array.from(el.classList).some((c) => c.startsWith('ng-'))) return 'angular';
  if (el.hasAttribute('v-model') || Array.from(el.attributes).some((a) => a.name.startsWith('data-v-'))) return 'vue';
  return 'none';
}

function extractField(el: HTMLElement, platform: ATSPlatform): ApplicationQuestion {
  const input = el as HTMLInputElement;
  const label = detectLabel(el, platform);
  const isChoice = input.type === 'radio' || input.type === 'checkbox';
  const group = isChoice ? groupOf(input) : [];

  return {
    id: stableId(el),
    elementType: el.tagName.toLowerCase(),
    inputType: isCombobox(el) ? 'combobox' : input.type,
    label,
    placeholder: input.placeholder || undefined,
    name: input.name || undefined,
    elementId: el.id || undefined,
    ariaLabel: el.getAttribute('aria-label') || undefined,
    required:
      el.hasAttribute('required') ||
      el.getAttribute('aria-required') === 'true' ||
      group.some((g) => g.required),
    options: extractOptions(el, group),
    currentValue: readCurrentValue(el, group),
    nearbyText: getNearbyText(el),
    detectedQuestion: label,
    framework: detectFramework(el),
  };
}

/**
 * Question text for a field. Radio groups and checkbox groups are labelled by
 * their heading, never by an individual option.
 */
function detectLabel(el: HTMLElement, platform: ATSPlatform): string | undefined {
  const input = el as HTMLInputElement;
  const isChoice = input.type === 'radio' || input.type === 'checkbox';
  const isGroup = isChoice && (input.type === 'radio' || groupOf(input).length > 1);

  if (isGroup) {
    const heading = groupHeading(el, platform);
    if (heading) return heading;
  } else {
    const platformLabel = findPlatformLabel(el, platform);
    if (platformLabel && !isChoice) return platformLabel;
  }

  // Option labels describe the option, not the question, so skip them for groups.
  if (!isGroup) {
    if (el.id) {
      const forLabel = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(el.id)}"]`);
      const text = forLabel ? ownText(forLabel) : '';
      if (text) return text;
    }
  }

  const labelledBy = textOfIds(el.getAttribute('aria-labelledby'));
  if (labelledBy) return labelledBy;

  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel?.trim()) return cleanLabel(ariaLabel);

  if (!isGroup) {
    const wrapping = el.closest('label');
    const text = wrapping ? ownText(wrapping) : '';
    if (text) return text;
  }

  const placeholder = input.placeholder;
  if (placeholder?.trim()) return cleanLabel(placeholder);

  const legend = el.closest('fieldset')?.querySelector('legend');
  const legendText = legend ? ownText(legend) : '';
  if (legendText) return legendText;

  const sibling = el.previousElementSibling;
  if (sibling && sibling.tagName !== 'INPUT') {
    const text = ownText(sibling);
    if (text && text.length <= 200) return text;
  }

  const nearby = getNearbyText(el);
  if (nearby) return cleanLabel(nearby);

  const name = el.getAttribute('name');
  if (name && !/[0-9a-f]{8}-[0-9a-f]{4}/i.test(name)) return name.replace(/[_\-.[\]]+/g, ' ').trim() || undefined;

  return undefined;
}

function groupHeading(el: HTMLElement, platform: ATSPlatform): string | undefined {
  const platformLabel = findPlatformLabel(el, platform);
  if (platformLabel) return platformLabel;

  const legend = el.closest('fieldset')?.querySelector('legend');
  const legendText = legend ? ownText(legend) : '';
  if (legendText) return legendText;

  const group = el.closest('[role="radiogroup"], [role="group"]');
  if (group) {
    const byIds = textOfIds(group.getAttribute('aria-labelledby'));
    if (byIds) return byIds;
    const ariaLabel = group.getAttribute('aria-label');
    if (ariaLabel?.trim()) return cleanLabel(ariaLabel);
  }

  return undefined;
}

function textOfIds(ids: string | null): string | undefined {
  if (!ids) return undefined;
  const text = ids
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id))
    .filter((n): n is HTMLElement => n !== null)
    .map((n) => ownText(n))
    .filter(Boolean)
    .join(' ');
  return text || undefined;
}

function extractOptions(el: HTMLElement, group: HTMLInputElement[]): string[] | undefined {
  if (el instanceof HTMLSelectElement) {
    const texts = Array.from(el.options)
      .filter((o) => o.value !== '')
      .map((o) => o.text.trim())
      .filter(Boolean);
    return texts.length ? texts : undefined;
  }

  // A lone checkbox is a yes/no toggle, not a choice list.
  if (group.length > 1 || (group.length === 1 && (el as HTMLInputElement).type === 'radio')) {
    const labels = group.map((option) => optionLabelText(option) || option.value).filter(Boolean);
    return labels.length ? labels : undefined;
  }

  return undefined;
}

/** The value already in the field (typed by the user or pre-filled by the page), if any. */
function readCurrentValue(el: HTMLElement, group: HTMLInputElement[]): string | undefined {
  const clean = (text: string | null | undefined) => {
    const t = (text ?? '').replace(/\s+/g, ' ').trim();
    return t || undefined;
  };

  if (el instanceof HTMLSelectElement) {
    const selected = el.selectedOptions[0];
    return selected && selected.value !== '' ? clean(selected.text) : undefined;
  }

  if (el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox')) {
    const checked = group.filter((g) => g.checked);
    if (checked.length === 0) return undefined;
    // A lone checkbox is a yes/no toggle; groups report the chosen option labels.
    if (group.length === 1 && el.type === 'checkbox') return 'Yes';
    return clean(checked.map((c) => optionLabelText(c) || c.value).join(', '));
  }

  // Custom dropdowns (React-Select etc.) show the choice in a sibling element, not in the input.
  if (isCombobox(el)) {
    const typed = el instanceof HTMLInputElement ? clean(el.value) : undefined;
    if (typed) return typed;
    const shown = el
      .closest('.select__container, [class*="-container"], [class*="select"]')
      ?.querySelector('[class*="single-value"], [class*="singleValue"], [class*="multi-value"]');
    return clean(shown?.textContent);
  }

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return clean(el.value);
  return undefined;
}

function getNearbyText(el: HTMLElement): string | undefined {
  const parent = el.parentElement;
  if (!parent) return undefined;
  const text = Array.from(parent.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent?.trim())
    .filter(Boolean)
    .join(' ');
  return text || undefined;
}
