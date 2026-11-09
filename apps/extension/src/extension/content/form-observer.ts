/**
 * FormObserver — watches for dynamic DOM changes on job application pages.
 *
 * Many ATS forms add fields after user interaction (dropdowns, Continue buttons).
 * We use MutationObserver to detect relevant additions without rescanning the
 * entire DOM excessively.
 *
 * Full integration in Milestone 5.
 */

type FieldAddedCallback = (addedNodes: NodeList) => void;

export class FormObserver {
  private observer: MutationObserver | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly debounceMs = 500;

  /**
   * Start observing the document for new form elements.
   * Calls `onFieldsAdded` with the new nodes when relevant changes are detected.
   * Debounced to avoid excessive callbacks during rapid DOM updates.
   */
  start(onFieldsAdded: FieldAddedCallback): void {
    if (this.observer) {
      console.warn('[ArziBaaz] FormObserver already running');
      return;
    }

    this.observer = new MutationObserver((mutations) => {
      const hasNewFormElements = mutations.some((m) =>
        Array.from(m.addedNodes).some((node) => this.isRelevantNode(node)),
      );

      if (!hasNewFormElements) return;

      // Debounce to batch rapid mutations
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        const addedNodes = mutations.flatMap((m) => Array.from(m.addedNodes));
        const relevantNodes = addedNodes.filter((n) => this.isRelevantNode(n));
        if (relevantNodes.length > 0) {
          onFieldsAdded(relevantNodes as unknown as NodeList);
        }
      }, this.debounceMs);
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    console.log('[ArziBaaz] FormObserver started');
  }

  stop(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.observer?.disconnect();
    this.observer = null;
    console.log('[ArziBaaz] FormObserver stopped');
  }

  private isRelevantNode(node: Node): boolean {
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    const el = node as Element;
    return (
      el.matches('input, textarea, select, fieldset, [role="combobox"]') ||
      el.querySelector('input, textarea, select, [role="combobox"]') !== null
    );
  }
}
