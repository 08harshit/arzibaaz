import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AiApiService } from '../../core/services/ai-api.service';
import { ApplicationStateService, type QuestionItem } from '../../core/services/application-state.service';
import { QUESTION_CATEGORIES } from '../../core/question-categories';
import type { QuestionCategory } from '@arzi-baaz/contracts';

@Component({
  selector: 'ab-answer-review',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="header">
        <h2 class="page-title">Review & Save Answers</h2>
        <p class="page-hint">Approve answers before autofill or save them to your library for reuse.</p>
      </div>

      @if (!state.hasAnyAnswers()) {
        <div class="empty-state">
          <p class="empty-icon">✍️</p>
          <p class="empty-text">No answers to review yet.</p>
          <p class="empty-sub">Generate answers in the Application tab, then come back here.</p>
          <button class="proceed-btn" (click)="backToApplication()">← Back to Application</button>
        </div>
      } @else {
        <div class="review-list">
          @for (q of state.questions; track q.id) {
            @if (q.generatedAnswer; as a) {
              <div class="review-card" [class.skipped]="q.skipped">
                <div class="q-header">
                  <div class="q-content">
                    <p class="q-text">{{ q.question }}</p>
                    <div class="meta-pills">
                      <span class="category-pill">{{ a.category }}</span>
                      <span
                        class="conf-pill"
                        [class.high]="a.confidence >= 0.85"
                        [class.medium]="a.confidence >= 0.7 && a.confidence < 0.85"
                        [class.low]="a.confidence < 0.7"
                      >
                        {{ (a.confidence * 100).toFixed(0) }}% confidence
                      </span>
                      @if (a.requiresReview) {
                        <span class="review-badge">⚠️ Needs Review</span>
                      }
                      @if (!q.fieldId) {
                        <span class="unlinked-badge" title="Detect fields in the Application tab to link this answer to the form">not linked to a field</span>
                      }
                    </div>
                  </div>
                  <label class="approve-check">
                    <input type="checkbox" [ngModel]="q.approved" (ngModelChange)="setApproved(q, $event)" />
                    <span>Approve</span>
                  </label>
                </div>

                @if (a.missingInformation && a.missingInformation.length > 0) {
                  <div class="missing-alert">
                    <strong>Missing Information:</strong>
                    <ul>
                      @for (info of a.missingInformation; track info) {
                        <li>{{ info }}</li>
                      }
                    </ul>
                  </div>
                }

                <div class="answer-content">
                  @if (q.isEditing) {
                    <textarea rows="4" class="edit-textarea" [(ngModel)]="a.answer"></textarea>
                  } @else {
                    <p class="answer-text">{{ a.answer }}</p>
                  }
                </div>

                @if (a.supportingFacts && a.supportingFacts.length > 0) {
                  <div class="supporting-facts">
                    <span class="label">Grounded in:</span>
                    @for (fact of a.supportingFacts; track fact.factId) {
                      <span class="fact-badge">✓ {{ fact.reason }}</span>
                    }
                  </div>
                }

                <div class="refine-row">
                  <input
                    type="text"
                    [(ngModel)]="q.refinementInstruction"
                    placeholder="Refine (e.g. 'Make it shorter')..."
                    (keyup.enter)="refine(q)"
                  />
                  <button class="copy-btn" (click)="refine(q)" [disabled]="q.isRefining || !q.refinementInstruction?.trim()">
                    @if (q.isRefining) {
                      <span class="spinner-sm"></span>
                    } @else {
                      Refine
                    }
                  </button>
                </div>

                <div class="actions">
                  <button class="copy-btn" (click)="q.isEditing = !q.isEditing">
                    {{ q.isEditing ? 'Done' : 'Edit' }}
                  </button>
                  <button class="save-btn" (click)="openSaveDialog(q)" title="Save this answer to your library">
                    💾 Save to Library
                  </button>
                  <button class="copy-btn" (click)="copyAnswer(a.answer)" title="Copy answer to clipboard">Copy</button>
                  <button class="copy-btn" (click)="toggleSkip(q)">{{ q.skipped ? 'Undo skip' : 'Skip' }}</button>
                </div>
              </div>
            }
          }
        </div>

        <div class="summary-row">
          <span class="count">{{ approvedCount() }} approved{{ linkedApprovedCount() < approvedCount() ? ' (' + linkedApprovedCount() + ' linked to form fields)' : '' }}</span>
          <button class="proceed-btn" (click)="proceedToAutofill()" [disabled]="linkedApprovedCount() === 0"
                  title="Autofill needs approved answers that are linked to a detected form field">
            → Proceed to Autofill
          </button>
        </div>
      }

      <!-- Save Dialog -->
      @if (saveTarget(); as target) {
        <div class="dialog-overlay" (click)="closeSaveDialog()">
          <div class="dialog" (click)="$event.stopPropagation()">
            <div class="dialog-header">
              <h3>Save to Library</h3>
              <button class="close-btn" (click)="closeSaveDialog()">✕</button>
            </div>

            <div class="dialog-body">
              <label class="form-label">
                Category
                <select [(ngModel)]="selectedCategory" class="form-input">
                  <option value="">Select category...</option>
                  @for (c of categories; track c.value) {
                    <option [value]="c.value">{{ c.label }}</option>
                  }
                </select>
              </label>

              <label class="form-label">
                Tags (comma-separated)
                <input type="text" [(ngModel)]="tagsInput" placeholder="e.g., scala, distributed systems" class="form-input" />
              </label>

              <p class="preview-label">Preview:</p>
              <div class="preview">{{ target.generatedAnswer?.answer }}</div>
            </div>

            <div class="dialog-actions">
              <button class="cancel-btn" (click)="closeSaveDialog()">Cancel</button>
              <button class="confirm-btn" (click)="confirmSave()" [disabled]="!selectedCategory || savingToLibrary()">
                @if (savingToLibrary()) {
                  <span class="spinner-sm"></span> Saving...
                } @else {
                  Save to Library
                }
              </button>
            </div>
          </div>
        </div>
      }

      @if (feedbackMessage()) {
        <div class="feedback-toast" [class.error]="isError()">
          {{ feedbackMessage() }}
        </div>
      }
    </div>
  `,
  styles: [`
    .review-card.skipped { opacity: 0.55; }

    .unlinked-badge {
      font-size: 10px;
      background: #f1f3f4;
      color: #5f6368;
      padding: 2px 6px;
      border-radius: 4px;
    }

    .edit-textarea {
      width: 100%;
      font-size: 12px;
      font-family: inherit;
      border: 1px solid #1a73e8;
      border-radius: 4px;
      padding: 6px;
    }

    .refine-row { display: flex; gap: 6px; }
    .refine-row input {
      flex: 1;
      padding: 5px 8px;
      border: 1px solid #dadce0;
      border-radius: 4px;
      font-size: 11px;
      outline: none;
    }

    .actions { flex-wrap: wrap; }

    .page {
      padding: 12px 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .header {
      padding-bottom: 8px;
      border-bottom: 1px solid #e8eaed;
    }

    .page-title {
      font-size: 16px;
      font-weight: 600;
      color: #202124;
      margin: 0 0 4px 0;
    }

    .page-hint {
      font-size: 12px;
      color: #5f6368;
      margin: 0;
    }

    .empty-state {
      text-align: center;
      padding: 40px 16px;
      color: #5f6368;
    }

    .empty-icon {
      font-size: 48px;
      display: block;
      margin-bottom: 12px;
    }

    .empty-text {
      font-size: 14px;
      font-weight: 500;
      color: #202124;
      margin: 0 0 4px 0;
    }

    .empty-sub {
      font-size: 12px;
      color: #5f6368;
      margin: 0;
    }

    .review-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .review-card {
      background: #ffffff;
      border: 1px solid #dadce0;
      border-radius: 8px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .q-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
    }

    .q-content {
      flex: 1;
    }

    .q-text {
      font-size: 13px;
      font-weight: 600;
      color: #202124;
      margin: 0 0 6px 0;
      line-height: 1.4;
    }

    .meta-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }

    .category-pill {
      font-size: 10px;
      background: #e8eaed;
      color: #3c4043;
      padding: 2px 6px;
      border-radius: 4px;
      text-transform: capitalize;
    }

    .conf-pill {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 600;
    }

    .conf-pill.high {
      background: #e6f4ea;
      color: #137333;
    }

    .conf-pill.medium {
      background: #fef7e0;
      color: #b06000;
    }

    .conf-pill.low {
      background: #fce8e6;
      color: #c5221f;
    }

    .review-badge {
      font-size: 10px;
      background: #fef7e0;
      color: #b06000;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 600;
    }

    .approve-check {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      font-weight: 600;
      color: #1e8e3e;
      cursor: pointer;
      white-space: nowrap;
    }

    .approve-check input {
      cursor: pointer;
    }

    .missing-alert {
      background: #fce8e6;
      border-left: 3px solid #d93025;
      padding: 8px 10px;
      border-radius: 4px;
      font-size: 11px;
      color: #c5221f;
    }

    .missing-alert strong {
      display: block;
      margin-bottom: 4px;
    }

    .missing-alert ul {
      margin: 0;
      padding-left: 16px;
    }

    .missing-alert li {
      margin: 2px 0;
    }

    .answer-content {
      background: #f8f9fa;
      border: 1px solid #e8eaed;
      border-radius: 6px;
      padding: 10px;
    }

    .answer-text {
      font-size: 12px;
      color: #202124;
      line-height: 1.5;
      margin: 0;
      white-space: pre-line;
    }

    .supporting-facts {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
      padding-top: 6px;
      border-top: 1px solid #e8eaed;
      font-size: 10px;
    }

    .supporting-facts .label {
      color: #5f6368;
      font-weight: 600;
    }

    .fact-badge {
      background: #ffffff;
      border: 1px solid #dadce0;
      color: #137333;
      padding: 2px 5px;
      border-radius: 3px;
      font-size: 10px;
    }

    .actions {
      display: flex;
      gap: 6px;
      padding-top: 6px;
      border-top: 1px solid #e8eaed;
    }

    .save-btn {
      flex: 1;
      background: #34a853;
      color: white;
      border: none;
      padding: 6px 10px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
    }

    .save-btn:hover:not(:disabled) {
      background: #2d8645;
    }

    .save-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .copy-btn {
      background: #f1f3f4;
      color: #3c4043;
      border: 1px solid #dadce0;
      padding: 6px 10px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
    }

    .copy-btn:hover {
      background: #e8eaed;
    }

    .summary-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #e6f4ea;
      border: 1px solid #34a853;
      border-radius: 6px;
      padding: 10px 12px;
      margin-top: 8px;
    }

    .count {
      font-size: 12px;
      font-weight: 600;
      color: #137333;
    }

    .proceed-btn {
      background: #34a853;
      color: white;
      border: none;
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }

    .proceed-btn:hover:not(:disabled) {
      background: #2d8645;
    }

    .proceed-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    /* Dialog Styles */
    .dialog-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .dialog {
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
      max-width: 400px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
      z-index: 1001;
    }

    .dialog-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px;
      border-bottom: 1px solid #e8eaed;
    }

    .dialog-header h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: #202124;
    }

    .close-btn {
      background: transparent;
      border: none;
      font-size: 18px;
      color: #5f6368;
      cursor: pointer;
      padding: 0;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .close-btn:hover {
      color: #202124;
    }

    .dialog-body {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .form-label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 12px;
      font-weight: 600;
      color: #202124;
    }

    .form-input {
      padding: 8px;
      border: 1px solid #dadce0;
      border-radius: 4px;
      font-size: 12px;
      font-family: inherit;
    }

    .form-input:focus {
      outline: none;
      border-color: #1a73e8;
      box-shadow: 0 0 0 2px rgba(26, 115, 232, 0.2);
    }

    .preview-label {
      font-size: 12px;
      font-weight: 600;
      color: #202124;
      margin: 0;
    }

    .preview {
      background: #f8f9fa;
      border: 1px solid #dadce0;
      border-radius: 4px;
      padding: 8px;
      font-size: 11px;
      color: #202124;
      line-height: 1.4;
      max-height: 120px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 12px 16px;
      border-top: 1px solid #e8eaed;
    }

    .cancel-btn {
      background: #f1f3f4;
      color: #3c4043;
      border: 1px solid #dadce0;
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }

    .cancel-btn:hover {
      background: #e8eaed;
    }

    .confirm-btn {
      background: #34a853;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .confirm-btn:hover:not(:disabled) {
      background: #2d8645;
    }

    .confirm-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .feedback-toast {
      position: fixed;
      bottom: 12px;
      right: 12px;
      padding: 10px 14px;
      border-radius: 6px;
      background: #e6f4ea;
      color: #137333;
      font-size: 12px;
      font-weight: 500;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
      z-index: 999;
    }

    .feedback-toast.error {
      background: #fce8e6;
      color: #c5221f;
    }

    .spinner-sm {
      display: inline-block;
      width: 12px;
      height: 12px;
      border: 2px solid currentColor;
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 600ms linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `],
})


export class AnswerReviewComponent {
  private readonly aiApi = inject(AiApiService);
  private readonly router = inject(Router);
  readonly state = inject(ApplicationStateService);

  readonly categories = QUESTION_CATEGORIES;
  readonly saveTarget = signal<QuestionItem | null>(null);
  readonly savingToLibrary = signal<boolean>(false);
  readonly feedbackMessage = signal<string | null>(null);
  readonly isError = signal<boolean>(false);

  selectedCategory = '';
  tagsInput = '';

  approvedCount(): number {
    return this.state.questions.filter((q) => q.generatedAnswer && q.approved).length;
  }

  linkedApprovedCount(): number {
    return this.state.fillable().length;
  }

  setApproved(q: QuestionItem, approved: boolean) {
    q.approved = approved;
    if (approved) q.skipped = false;
  }

  toggleSkip(q: QuestionItem) {
    q.skipped = !q.skipped;
    if (q.skipped) q.approved = false;
  }

  async refine(q: QuestionItem) {
    const instruction = q.refinementInstruction?.trim();
    if (!instruction || !q.generatedAnswer) return;

    q.isRefining = true;
    try {
      const result = await this.aiApi.refineAnswer({ answerId: q.generatedAnswer.id || q.id, instruction });
      q.generatedAnswer.answer = result.answer;
      q.generatedAnswer.confidence = result.confidence;
      q.generatedAnswer.requiresReview = result.requiresReview;
      q.refinementInstruction = '';
      this.showToast(`Refined: ${result.changesSummary}`);
    } catch {
      this.showToast('Failed to refine answer.', true);
    } finally {
      q.isRefining = false;
    }
  }

  openSaveDialog(q: QuestionItem) {
    if (!q.generatedAnswer?.id) {
      this.showToast('This answer has no saved copy yet, so it cannot be added to the library.', true);
      return;
    }
    this.selectedCategory = q.generatedAnswer.category ?? '';
    this.tagsInput = '';
    this.saveTarget.set(q);
  }

  closeSaveDialog() {
    this.saveTarget.set(null);
    this.selectedCategory = '';
    this.tagsInput = '';
  }

  async confirmSave() {
    const target = this.saveTarget();
    const answerId = target?.generatedAnswer?.id;
    if (!target || !answerId || !this.selectedCategory) return;

    this.savingToLibrary.set(true);
    try {
      const tags = this.tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      await this.aiApi.saveAnswerToLibrary(answerId, this.selectedCategory as QuestionCategory, tags);
      this.showToast('Answer saved to library!');
      this.closeSaveDialog();
    } catch (error) {
      this.showToast('Failed to save answer. Try again.', true);
      console.error('Save error:', error);
    } finally {
      this.savingToLibrary.set(false);
    }
  }

  copyAnswer(text: string) {
    navigator.clipboard.writeText(text);
    this.showToast('Answer copied to clipboard!');
  }

  backToApplication() {
    this.router.navigate(['/application']);
  }

  /** Approvals are already shared via state; the Application tab runs the fill when we return. */
  proceedToAutofill() {
    if (this.linkedApprovedCount() === 0) {
      this.showToast('Approve at least one answer that is linked to a form field.', true);
      return;
    }
    this.state.autofillOnReturn = true;
    this.router.navigate(['/application']);
  }

  private showToast(msg: string, isErr = false) {
    this.feedbackMessage.set(msg);
    this.isError.set(isErr);
    setTimeout(() => this.feedbackMessage.set(null), 3500);
  }
}
