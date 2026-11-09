import { Injectable, NgZone, inject, signal } from '@angular/core';
import type { ApplicationQuestion, ExtensionMessage, FieldFillResult } from '@arzi-baaz/contracts';
import { isExtensionMessage } from '@arzi-baaz/contracts';

interface FillRequest {
  fieldId: string;
  value: string;
  label: string;
}

const SCAN_QUIET_MS = 1500;
const SCAN_MAX_MS = 3000;
const FILL_TIMEOUT_MS = 20_000;

/**
 * Coordinates form detection and autofill between the side panel and the
 * content scripts. A page can have several frames, each running its own content
 * script, so scan and fill results arrive as multiple messages and are merged here.
 */
@Injectable({ providedIn: 'root' })
export class FormFillService {
  private readonly zone = inject(NgZone);

  /** Fields detected on the current page, merged across frames. */
  readonly detectedFields = signal<ApplicationQuestion[]>([]);

  /** Latest fill result per field id. */
  readonly fillResults = signal<Map<string, FieldFillResult>>(new Map());

  readonly scanning = signal(false);
  readonly isFilling = signal(false);

  private scanQuietTimer: ReturnType<typeof setTimeout> | null = null;
  private scanMaxTimer: ReturnType<typeof setTimeout> | null = null;

  private pendingFill: {
    expected: Map<string, FillRequest>;
    collected: Map<string, FieldFillResult>;
    resolve: (results: FieldFillResult[]) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;

  constructor() {
    chrome.runtime.onMessage.addListener((message: unknown) => {
      if (!isExtensionMessage(message)) return;
      this.zone.run(() => this.handleMessage(message as ExtensionMessage));
    });
  }

  /** Scans the active tab (all frames). Results stream into `detectedFields`. */
  triggerFormScan(): void {
    this.detectedFields.set([]);
    this.scanning.set(true);
    this.armScanTimers(true);

    chrome.runtime.sendMessage({ type: 'SCAN_FORM' } satisfies ExtensionMessage).catch((error) => {
      console.error('[ArziBaaz UI] Failed to trigger form scan:', error);
      this.endScan();
    });
  }

  /**
   * Fills the given fields and resolves once every field has reported back,
   * or after a timeout (unreported fields are marked failed).
   */
  fillApprovedFields(fields: FillRequest[]): Promise<FieldFillResult[]> {
    if (fields.length === 0) return Promise.resolve([]);

    this.finishFill(); // settle any earlier request first
    this.isFilling.set(true);

    return new Promise<FieldFillResult[]>((resolve) => {
      this.pendingFill = {
        expected: new Map(fields.map((f) => [f.fieldId, f])),
        collected: new Map(),
        resolve,
        timer: setTimeout(() => this.zone.run(() => this.finishFill()), FILL_TIMEOUT_MS),
      };

      chrome.runtime
        .sendMessage({ type: 'FILL_APPROVED_FIELDS', payload: fields } satisfies ExtensionMessage)
        .catch((error) => {
          console.error('[ArziBaaz UI] Failed to send fill request:', error);
          this.finishFill();
        });
    });
  }

  private handleMessage(msg: ExtensionMessage): void {
    switch (msg.type) {
      case 'FORM_SCAN_RESULT': {
        const known = new Set(this.detectedFields().map((f) => f.id));
        const added = msg.payload.filter((f) => !known.has(f.id));
        if (added.length > 0) this.detectedFields.update((current) => [...current, ...added]);
        this.armScanTimers(false);
        break;
      }

      case 'FILL_RESULTS': {
        this.fillResults.update((current) => {
          const next = new Map(current);
          msg.payload.forEach((r) => next.set(r.fieldId, r));
          return next;
        });

        const pending = this.pendingFill;
        if (pending) {
          msg.payload.forEach((r) => {
            if (pending.expected.has(r.fieldId)) pending.collected.set(r.fieldId, r);
          });
          if (pending.collected.size >= pending.expected.size) this.finishFill();
        }
        break;
      }

      case 'ERROR': {
        console.error('[ArziBaaz UI] Received error:', msg.payload);
        this.endScan();
        break;
      }
    }
  }

  private finishFill(): void {
    const pending = this.pendingFill;
    if (!pending) {
      this.isFilling.set(false);
      return;
    }

    clearTimeout(pending.timer);
    this.pendingFill = null;

    const results = Array.from(pending.expected.values()).map(
      (req): FieldFillResult =>
        pending.collected.get(req.fieldId) ?? {
          fieldId: req.fieldId,
          label: req.label,
          success: false,
          error: 'No response from the page. Reload it and scan again.',
        },
    );

    this.fillResults.update((current) => {
      const next = new Map(current);
      results.forEach((r) => next.set(r.fieldId, r));
      return next;
    });
    this.isFilling.set(false);
    pending.resolve(results);
  }

  /** Scanning ends shortly after the last result, or at a hard cap. */
  private armScanTimers(initial: boolean): void {
    if (this.scanQuietTimer) clearTimeout(this.scanQuietTimer);
    this.scanQuietTimer = setTimeout(() => this.zone.run(() => this.endScan()), SCAN_QUIET_MS);

    if (initial) {
      if (this.scanMaxTimer) clearTimeout(this.scanMaxTimer);
      this.scanMaxTimer = setTimeout(() => this.zone.run(() => this.endScan()), SCAN_MAX_MS);
    }
  }

  private endScan(): void {
    if (this.scanQuietTimer) clearTimeout(this.scanQuietTimer);
    if (this.scanMaxTimer) clearTimeout(this.scanMaxTimer);
    this.scanQuietTimer = null;
    this.scanMaxTimer = null;
    this.scanning.set(false);
  }
}
