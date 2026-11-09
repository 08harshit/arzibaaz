/**
 * Autofill engine — fills approved form fields.
 *
 * AUTOFILL RULES (from spec §14):
 * - Never fill passwords.
 * - Never fill CAPTCHA fields.
 * - Never upload files automatically.
 * - Never fill unknown fields with guessed values.
 * - Require user approval before filling (enforced by the side panel).
 * - Never submit the form.
 *
 * React/Angular/Vue compatibility:
 * Simply setting element.value does not update framework internal state.
 * We use the native value setter and dispatch bubbling events; radios and
 * checkboxes are toggled with click() so framework onChange handlers run.
 */

export interface FillOutcome {
  success: boolean;
  error?: string;
}

const OK: FillOutcome = { success: true };
const fail = (error: string): FillOutcome => ({ success: false, error });

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function norm(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

const TRUE_WORDS = new Set(['true', 'yes', 'y', '1', 'checked', 'agree', 'i agree']);
const FALSE_WORDS = new Set(['false', 'no', 'n', '0', 'unchecked']);

export const isTruthy = (value: string) => TRUE_WORDS.has(norm(value));
export const isFalsy = (value: string) => FALSE_WORDS.has(norm(value));

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(element, value);
  else element.value = value;
}

/** Fills a text-based input or textarea. */
export function fillTextField(element: HTMLInputElement | HTMLTextAreaElement, value: string): FillOutcome {
  try {
    element.focus();
    setNativeValue(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    // Some validators only run on blur.
    element.blur();

    return element.value === value ? OK : fail('Value not retained after filling');
  } catch (err) {
    return fail(String(err));
  }
}

/** Selects an option of a native <select> by value, exact text, or partial text. */
export function fillSelectField(element: HTMLSelectElement, value: string): FillOutcome {
  try {
    const wanted = norm(value);
    const options = Array.from(element.options).filter((o) => !o.disabled);

    const option =
      options.find((o) => o.value === value) ??
      options.find((o) => norm(o.text) === wanted) ??
      (wanted.length >= 3 ? options.find((o) => norm(o.text).includes(wanted) || wanted.includes(norm(o.text))) : undefined);

    if (!option || option.value === '') return fail(`Option "${value}" not found in select`);

    element.value = option.value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return element.value === option.value ? OK : fail('Selection not retained');
  } catch (err) {
    return fail(String(err));
  }
}

/** All inputs of the same type and name as `first`, scoped to its form. */
export function groupOf(first: HTMLInputElement): HTMLInputElement[] {
  if (!first.name) return [first];
  const scope: ParentNode = first.form ?? document;
  return Array.from(
    scope.querySelectorAll<HTMLInputElement>(`input[type="${first.type}"][name="${CSS.escape(first.name)}"]`),
  );
}

/** Visible text of the label belonging to a radio/checkbox option (original case). */
export function optionLabelText(input: HTMLInputElement): string {
  let text = '';
  if (input.id) {
    const forLabel = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(input.id)}"]`);
    if (forLabel) text = forLabel.textContent ?? '';
  }
  if (!text) {
    const wrapping = input.closest('label');
    if (wrapping) text = wrapping.textContent ?? '';
  }
  if (!text) text = input.getAttribute('aria-label') ?? '';
  return text.replace(/\s+/g, ' ').trim();
}

const optionLabel = (input: HTMLInputElement): string => norm(optionLabelText(input));

function clickIfNeeded(input: HTMLInputElement, checked: boolean): void {
  if (input.checked !== checked) input.click();
}

/** Picks the radio in a group whose label or value matches `value`. */
export function fillRadioGroup(first: HTMLInputElement, value: string): FillOutcome {
  try {
    const group = groupOf(first).filter((r) => !r.disabled);
    const wanted = norm(value);

    const labelOf = (r: HTMLInputElement) => optionLabel(r);
    let match =
      group.find((r) => norm(r.value) === wanted || labelOf(r) === wanted) ??
      group.find((r) => labelOf(r).startsWith(wanted) && wanted.length >= 2) ??
      (wanted.length >= 3 ? group.find((r) => labelOf(r).includes(wanted) || (labelOf(r).length >= 3 && wanted.includes(labelOf(r)))) : undefined);

    if (!match && (isTruthy(value) || isFalsy(value))) {
      const target = isTruthy(value) ? 'yes' : 'no';
      match = group.find((r) => norm(r.value) === target || labelOf(r) === target);
    }

    if (!match) return fail(`No option matching "${value}" in radio group`);

    clickIfNeeded(match, true);
    return match.checked ? OK : fail('Radio selection not retained');
  } catch (err) {
    return fail(String(err));
  }
}

/**
 * Checkbox handling:
 * - single checkbox: yes/true checks it, no/false unchecks it
 * - group: value is a comma-separated list of option labels to check
 */
export function fillCheckboxField(first: HTMLInputElement, value: string): FillOutcome {
  try {
    const group = groupOf(first).filter((c) => !c.disabled);

    if (group.length <= 1) {
      if (!isTruthy(value) && !isFalsy(value)) return fail(`Cannot interpret "${value}" as yes/no for a checkbox`);
      clickIfNeeded(first, isTruthy(value));
      return first.checked === isTruthy(value) ? OK : fail('Checkbox state not retained');
    }

    const wanted = value.split(',').map(norm).filter(Boolean);
    const unmatched = wanted.filter((w) => !group.some((c) => optionLabel(c) === w || norm(c.value) === w));
    if (unmatched.length === wanted.length) return fail(`No checkbox options matching "${value}"`);

    for (const box of group) {
      const hit = wanted.some((w) => optionLabel(box) === w || norm(box.value) === w);
      if (hit) clickIfNeeded(box, true);
    }
    return OK;
  } catch (err) {
    return fail(String(err));
  }
}

export function isCombobox(element: HTMLElement): boolean {
  return element.tagName !== 'SELECT' && element.getAttribute('role') === 'combobox';
}

function listboxFor(element: HTMLElement): ParentNode {
  const ids = (element.getAttribute('aria-controls') || element.getAttribute('aria-owns') || '').split(/\s+/).filter(Boolean);
  for (const id of ids) {
    const found = document.getElementById(id);
    if (found) return found;
  }
  return document;
}

function findOption(root: ParentNode, value: string): HTMLElement | undefined {
  const wanted = norm(value);
  const options = Array.from(root.querySelectorAll<HTMLElement>('[role="option"]')).filter(
    (o) => o.getAttribute('aria-disabled') !== 'true',
  );
  return (
    options.find((o) => norm(o.textContent ?? '') === wanted) ??
    options.find((o) => norm(o.textContent ?? '').startsWith(wanted)) ??
    (wanted.length >= 3 ? options.find((o) => norm(o.textContent ?? '').includes(wanted)) : undefined)
  );
}

function pointerClick(target: HTMLElement): void {
  for (const type of ['mousedown', 'mouseup', 'click']) {
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
  }
}

/**
 * Fills an ARIA combobox (React-Select, Radix select, custom dropdowns).
 * Options usually do not exist until the control is opened, so this opens it,
 * optionally types to filter, waits for a matching [role=option], then clicks it.
 */
export async function fillCombobox(element: HTMLElement, value: string): Promise<FillOutcome> {
  try {
    const textInput = element instanceof HTMLInputElement ? element : null;

    element.focus();
    pointerClick(element);

    if (textInput && !textInput.readOnly) {
      setNativeValue(textInput, value);
      textInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    let option: HTMLElement | undefined;
    for (let waited = 0; waited < 1500 && !option; waited += 50) {
      option = findOption(listboxFor(element), value);
      if (!option) await sleep(50);
    }

    if (!option) {
      element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      if (textInput && !textInput.readOnly) {
        setNativeValue(textInput, '');
        textInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return fail(`No dropdown option matching "${value}"`);
    }

    pointerClick(option);
    await sleep(60);
    return OK;
  } catch (err) {
    return fail(String(err));
  }
}

/** Fills any supported field type. Never submits the form. */
export async function fillElement(element: HTMLElement, value: string): Promise<FillOutcome> {
  if (isCombobox(element)) return fillCombobox(element, value);

  if (element instanceof HTMLSelectElement) return fillSelectField(element, value);

  if (element instanceof HTMLInputElement) {
    if (element.type === 'radio') return fillRadioGroup(element, value);
    if (element.type === 'checkbox') return fillCheckboxField(element, value);
    return fillTextField(element, value);
  }

  if (element instanceof HTMLTextAreaElement) return fillTextField(element, value);

  return fail(`Unsupported element <${element.tagName.toLowerCase()}>`);
}
