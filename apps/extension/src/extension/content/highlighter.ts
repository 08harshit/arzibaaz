/**
 * Marks fields on the page after autofill so the user can check the form at a glance:
 * green = filled, amber = double-check, red = still needs you.
 * Marks are outlines only (no layout change) and are fully reversible.
 */

import type { FieldMark, FieldMarkKind } from '@arzi-baaz/contracts';

const COLORS: Record<FieldMarkKind, string> = {
  filled: '#1e8e3e',
  check: '#f29900',
  missing: '#d93025',
};

interface SavedStyle {
  outline: string;
  outlineOffset: string;
  title: string | null;
}

const saved = new Map<HTMLElement, SavedStyle>();

/** The element that visually represents a field: radio/checkbox groups and custom dropdowns have a container. */
function visualTarget(el: HTMLElement): HTMLElement {
  const input = el as HTMLInputElement;
  const isChoice = input.type === 'radio' || input.type === 'checkbox';
  if (isChoice) {
    return (
      el.closest<HTMLElement>('fieldset, [role="radiogroup"], [role="group"], .application-field, li') ?? el
    );
  }
  if (el.getAttribute('role') === 'combobox') {
    return el.closest<HTMLElement>('.select__control, [class*="-control"]') ?? el;
  }
  return el;
}

function apply(target: HTMLElement, kind: FieldMarkKind, note?: string): void {
  if (!saved.has(target)) {
    saved.set(target, {
      outline: target.style.outline,
      outlineOffset: target.style.outlineOffset,
      title: target.getAttribute('title'),
    });
  }
  target.style.setProperty('outline', `2px solid ${COLORS[kind]}`, 'important');
  target.style.setProperty('outline-offset', '2px', 'important');
  if (note) target.setAttribute('title', note);
}

/** Applies marks; returns the first element that needs attention so the caller can scroll to it. */
export function applyMarks(
  marks: FieldMark[],
  resolve: (fieldId: string) => HTMLElement | null,
): HTMLElement | null {
  let firstMissing: HTMLElement | null = null;
  let firstCheck: HTMLElement | null = null;

  for (const mark of marks) {
    const el = resolve(mark.fieldId);
    if (!el) continue;
    const target = visualTarget(el);
    apply(target, mark.kind, mark.note);
    if (mark.kind === 'missing' && !firstMissing) firstMissing = target;
    if (mark.kind === 'check' && !firstCheck) firstCheck = target;
  }

  return firstMissing ?? firstCheck;
}

export function clearMarks(): void {
  for (const [target, original] of saved) {
    target.style.outline = original.outline;
    target.style.outlineOffset = original.outlineOffset;
    if (original.title === null) target.removeAttribute('title');
    else target.setAttribute('title', original.title);
  }
  saved.clear();
}
