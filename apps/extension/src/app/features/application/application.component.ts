import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { AiApiService } from '../../core/services/ai-api.service';
import { FormFillService } from '../../core/services/form-fill.service';
import { ProfileApiService } from '../../core/services/profile-api.service';
import { ApplicationStateService, type QuestionItem } from '../../core/services/application-state.service';
import { AuthComponent } from '../auth/auth.component';
import type { GenerateAnswerRequest, JobContext, LibrarySuggestion } from '@arzi-baaz/contracts';

@Component({
  selector: 'ab-application',
  standalone: true,
  imports: [CommonModule, FormsModule, AuthComponent],
  template: `
    <div class="application-container">
      @if (!auth.isAuthenticated()) {
        <ab-auth />
      } @else {
        <!-- Job Context Card -->
        <div class="card job-card">
          <div class="card-header">
            <div>
              <span class="badge">Target Opportunity</span>
              <h3 class="role-title">{{ jobContext?.jobTitle || 'Job Application' }}</h3>
              <p class="company-name">{{ jobContext?.companyName || 'Context from active page or pasted description' }}</p>
            </div>
            <button class="toggle-btn" (click)="toggleJobInput()">
              {{ showJobInput() ? 'Hide Description' : 'Edit Description' }}
            </button>
          </div>

          @if (showJobInput()) {
            <div class="job-input-area">
              <textarea
                rows="4"
                [(ngModel)]="rawJobDescription"
                placeholder="Paste the job description here..."
              ></textarea>
              <button
                class="primary-btn"
                (click)="analyzeJob()"
                [disabled]="analyzingJob() || !rawJobDescription.trim()"
              >
                @if (analyzingJob()) {
                  <span class="spinner-sm"></span> Analyzing with Grok...
                } @else {
                  Analyze Job Requirements
                }
              </button>
            </div>
          }

          @if (jobContext?.requiredSkills && jobContext!.requiredSkills.length > 0) {
            <div class="skills-preview">
              <span class="label">Target Skills:</span>
              @for (skill of jobContext!.requiredSkills; track skill) {
                <span class="skill-tag">{{ skill }}</span>
              }
            </div>
          }
        </div>

        @if (feedbackMessage()) {
          <div class="feedback-toast" [class.error]="isError()">
            {{ feedbackMessage() }}
          </div>
        }

        <!-- Detect form fields on the active page -->
        <div class="detect-card">
          <div class="detect-text">
            <p class="detect-title">Fill the form on this page</p>
            <p class="detect-hint">
              @if (formFill.scanning()) {
                Scanning the page and its frames...
              } @else {
                Detect the application form's fields and answer them from your profile.
              }
            </p>
          </div>
          <button class="primary-btn" (click)="detectFields()" [disabled]="formFill.scanning()">
            @if (formFill.scanning()) {
              <span class="spinner-sm"></span>
            } @else {
              🔍 Detect fields
            }
          </button>
        </div>

        <!-- Add Question Input -->
        <div class="add-q-card">
          <div class="input-row">
            <input
              type="text"
              [(ngModel)]="newQuestionText"
              placeholder="Enter or paste an application question..."
              (keyup.enter)="addQuestion()"
            />
            <button class="primary-btn" (click)="addQuestion()" [disabled]="!newQuestionText.trim()">
              + Add
            </button>
          </div>
        </div>

        <!-- M7 Workflow Gate: Review Button -->
        @if (hasAnyAnswers()) {
          <div class="review-gate-card">
            <div class="gate-content">
              <span class="gate-icon">🎯</span>
              <div class="gate-text">
                <p class="gate-title">Ready to Review?</p>
                <p class="gate-hint">Review and approve answers before autofilling the form</p>
              </div>
            </div>
            <button class="gate-btn" (click)="proceedToReview()">
              Review Answers →
            </button>
          </div>
        }

        <!-- Questions List -->
        <div class="questions-section">
          <div class="section-title-row">
            <h4>Application Questions ({{ questions.length }})</h4>
            <span class="sub-hint">Grounds answers in your verified facts</span>
          </div>

          @if (questions.length === 0) {
            <div class="empty-state">
              <p class="empty-icon">📝</p>
              <p class="empty-text">No application questions added yet.</p>
              <p class="empty-sub">Type a question above or navigate to a supported job form to detect fields.</p>
            </div>
          } @else {
            <div class="q-list">
              @for (q of questions; track q.id; let idx = $index) {
                <div class="q-card" [class.approved]="q.approved">
                  <div class="q-header">
                    <span class="q-number">{{ idx + 1 }}</span>
                    <span class="q-text">{{ q.question }}</span>
                    <button class="icon-btn danger" (click)="removeQuestion(q.id)" title="Remove">✕</button>
                  </div>

                  @if (q.fieldId) {
                    <div class="field-meta">
                      <span class="field-chip">{{ q.options?.length ? 'choice · ' + q.options!.length : q.inputType || q.elementType }}</span>
                      @if (q.required) {
                        <span class="field-chip required">required</span>
                      }
                      @if (q.fromProfile) {
                        <span class="field-chip ok">from your profile</span>
                      }
                      @if (q.currentValue && !q.generatedAnswer) {
                        <span class="field-chip ok" [title]="q.currentValue">already filled: {{ q.currentValue.length > 28 ? q.currentValue.slice(0, 28) + '...' : q.currentValue }}</span>
                      }
                      @if (q.fillResult) {
                        <span class="field-chip" [class.ok]="q.fillResult.success" [class.err]="!q.fillResult.success"
                              [title]="q.fillResult.error || ''">
                          {{ q.fillResult.success ? '✓ filled' : '✕ ' + (q.fillResult.error || 'not filled') }}
                        </span>
                      }
                    </div>
                  }

                  <!-- Generated Answer Box -->
                  @if (q.generatedAnswer) {
                    <div class="answer-box">
                      <div class="meta-row">
                        <span class="category-pill">{{ q.generatedAnswer.category }}</span>
                        <span
                          class="conf-pill"
                          [class.high]="q.generatedAnswer.confidence >= 0.85"
                          [class.medium]="q.generatedAnswer.confidence >= 0.7 && q.generatedAnswer.confidence < 0.85"
                          [class.low]="q.generatedAnswer.confidence < 0.7"
                        >
                          {{ (q.generatedAnswer.confidence * 100).toFixed(0) }}% confidence
                        </span>
                        @if (q.generatedAnswer.requiresReview) {
                          <span class="review-warn">⚠️ Needs Review</span>
                        }
                      </div>

                      @if (q.generatedAnswer.missingInformation && q.generatedAnswer.missingInformation.length > 0) {
                        <div class="missing-alert">
                          <strong>Missing Context:</strong>
                          <ul>
                            @for (item of q.generatedAnswer.missingInformation; track item) {
                              <li>{{ item }}</li>
                            }
                          </ul>
                        </div>
                      }

                      @if (q.isEditing) {
                        <textarea rows="4" [(ngModel)]="q.generatedAnswer.answer" class="edit-textarea"></textarea>
                        <div class="edit-actions">
                          <button class="save-sm-btn" (click)="q.isEditing = false">Done Editing</button>
                        </div>
                      } @else {
                        <p class="answer-text">{{ q.generatedAnswer.answer }}</p>
                      }

                      <!-- Supporting Grounded Facts -->
                      @if (q.generatedAnswer.supportingFacts && q.generatedAnswer.supportingFacts.length > 0) {
                        <div class="supporting-facts">
                          <span class="facts-label">Grounded in verified facts:</span>
                          @for (fact of q.generatedAnswer.supportingFacts; track fact.factId) {
                            <span class="fact-tag" [title]="fact.reason">✓ {{ fact.reason }}</span>
                          }
                        </div>
                      }

                      <!-- Refinement Controls -->
                      <div class="refine-row">
                        <input
                          type="text"
                          [(ngModel)]="q.refinementInstruction"
                          placeholder="Refine (e.g. 'Make it shorter', 'Emphasize scale')..."
                          (keyup.enter)="refineAnswer(q)"
                        />
                        <button
                          class="refine-btn"
                          (click)="refineAnswer(q)"
                          [disabled]="q.isRefining || !q.refinementInstruction?.trim()"
                        >
                          @if (q.isRefining) {
                            <span class="spinner-sm"></span>
                          } @else {
                            Refine
                          }
                        </button>
                      </div>

                      <!-- Answer Actions -->
                      <div class="actions-row">
                        <label class="approve-check">
                          <input type="checkbox" [(ngModel)]="q.approved" />
                          <span>Approve for Autofill</span>
                        </label>
                        @if (!q.fieldId) {
                          <span class="unlinked-hint" title="Detect fields to link answers to the page's form">not linked to a field</span>
                        }
                        <div class="btn-group">
                          <button class="text-btn" (click)="q.isEditing = !q.isEditing">
                            {{ q.isEditing ? 'Cancel Edit' : 'Edit' }}
                          </button>
                          <button class="text-btn" (click)="copyAnswer(q.generatedAnswer.answer)">
                            Copy
                          </button>
                        </div>
                      </div>
                    </div>
                  } @else {
                    @if (q.suggestions && q.suggestions.length > 0) {
                      <div class="suggestion-box">
                        <span class="suggestion-title">📚 Similar answer in your library</span>
                        @for (s of q.suggestions; track s.answerId) {
                          <div class="suggestion-row">
                            <p class="suggestion-text">{{ s.content }}</p>
                            <button class="text-btn" (click)="useSuggestion(q, s)" [disabled]="q.isGenerating">Use</button>
                          </div>
                        }
                      </div>
                    }
                    <div class="generate-prompt">
                      <button
                        class="generate-btn"
                        (click)="generateOne(q)"
                        [disabled]="q.isGenerating"
                      >
                        @if (q.isGenerating) {
                          <span class="spinner-sm"></span> Generating grounded answer...
                        } @else {
                          ✨ Generate Grounded Answer
                        }
                      </button>
                    </div>
                  }
                </div>
              }
            </div>

            <div class="bulk-bar">
              @if (hasAnyAnswers()) {
                <button class="generate-btn" (click)="approveReviewed()" title="Approve answers that are not flagged for review">✓ Approve reviewed</button>
              }
              @if (unansweredFieldCount() > 0) {
                <button class="generate-btn" (click)="generateAll()" [disabled]="generatingAll()">
                  @if (generatingAll()) {
                    <span class="spinner-sm"></span> Generating...
                  } @else {
                    ✨ Generate all ({{ unansweredFieldCount() }})
                  }
                </button>
              }
              <button
                class="primary-btn"
                (click)="autofillApproved()"
                [disabled]="autofilling() || fillableCount() === 0"
                title="Approve answers linked to form fields, then autofill them into the page. The form is never submitted."
              >
                @if (autofilling()) {
                  <span class="spinner-sm"></span> Filling...
                } @else {
                  Autofill approved ({{ fillableCount() }})
                }
              </button>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .application-container {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .card {
      background: #ffffff;
      border: 1px solid #dadce0;
      border-radius: 8px;
      padding: 12px;
    }

    .job-card {
      background: #f8f9fa;
      border-color: #c2e7ff;
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
    }

    .badge {
      font-size: 9px;
      text-transform: uppercase;
      font-weight: 700;
      color: #1a73e8;
      background: #e8f0fe;
      padding: 2px 6px;
      border-radius: 4px;
    }

    .role-title {
      font-size: 14px;
      font-weight: 700;
      color: #202124;
      margin-top: 2px;
    }

    .company-name {
      font-size: 11px;
      color: #5f6368;
    }

    .toggle-btn {
      background: transparent;
      border: 1px solid #dadce0;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 10px;
      cursor: pointer;
      color: #5f6368;
      white-space: nowrap;
    }

    .toggle-btn:hover {
      background: #e8eaed;
    }

    .job-input-area {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid #e8eaed;
    }

    textarea {
      width: 100%;
      padding: 8px;
      border: 1px solid #dadce0;
      border-radius: 4px;
      font-size: 11px;
      font-family: inherit;
      resize: vertical;
    }

    .primary-btn {
      background: #1a73e8;
      color: white;
      border: none;
      padding: 7px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }

    .primary-btn:hover:not(:disabled) {
      background: #1557b0;
    }

    .primary-btn:disabled {
      opacity: 0.6;
    }

    .skills-preview {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
      margin-top: 8px;
      font-size: 10px;
    }

    .skills-preview .label {
      color: #5f6368;
      font-weight: 600;
    }

    .skill-tag {
      background: #e8f0fe;
      color: #1a73e8;
      padding: 1px 6px;
      border-radius: 8px;
      font-size: 10px;
    }

    .feedback-toast {
      padding: 8px 12px;
      border-radius: 6px;
      background: #e6f4ea;
      color: #137333;
      font-size: 12px;
      font-weight: 500;
    }

    .feedback-toast.error {
      background: #fce8e6;
      color: #c5221f;
    }

    .add-q-card {
      background: #ffffff;
      border: 1px solid #dadce0;
      border-radius: 6px;
      padding: 8px;
    }

    .input-row {
      display: flex;
      gap: 6px;
    }

    .input-row input {
      flex: 1;
      padding: 7px 10px;
      border: 1px solid #dadce0;
      border-radius: 4px;
      font-size: 12px;
      outline: none;
    }

    .questions-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .section-title-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }

    .section-title-row h4 {
      font-size: 13px;
      font-weight: 700;
      color: #202124;
    }

    .sub-hint {
      font-size: 10px;
      color: #5f6368;
    }

    .q-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .q-card {
      background: #ffffff;
      border: 1px solid #dadce0;
      border-radius: 6px;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      transition: border-color 150ms;
    }

    .q-card.approved {
      border-color: #34a853;
      box-shadow: 0 0 0 1px #34a853;
    }

    .q-header {
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }

    .q-number {
      font-size: 11px;
      font-weight: 700;
      color: #5f6368;
      background: #f1f3f4;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .q-text {
      flex: 1;
      font-size: 12px;
      font-weight: 600;
      color: #202124;
      line-height: 1.4;
    }

    .icon-btn {
      background: transparent;
      border: none;
      cursor: pointer;
      font-size: 11px;
      color: #80868b;
    }

    .icon-btn.danger:hover {
      color: #d93025;
    }

    .answer-box {
      background: #f8f9fa;
      border: 1px solid #e8eaed;
      border-radius: 6px;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .meta-row {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 10px;
    }

    .category-pill {
      background: #e8eaed;
      color: #3c4043;
      padding: 1px 6px;
      border-radius: 4px;
      text-transform: capitalize;
    }

    .conf-pill {
      padding: 1px 6px;
      border-radius: 4px;
      font-weight: 600;
    }

    .conf-pill.high { background: #e6f4ea; color: #137333; }
    .conf-pill.medium { background: #fef7e0; color: #b06000; }
    .conf-pill.low { background: #fce8e6; color: #c5221f; }

    .review-warn {
      background: #fef7e0;
      color: #b06000;
      padding: 1px 6px;
      border-radius: 4px;
      font-weight: 600;
    }

    .missing-alert {
      background: #fce8e6;
      border-left: 3px solid #d93025;
      padding: 6px 8px;
      font-size: 11px;
      color: #c5221f;
    }

    .missing-alert ul {
      margin-left: 14px;
      margin-top: 2px;
    }

    .answer-text {
      font-size: 12px;
      color: #202124;
      line-height: 1.5;
      white-space: pre-line;
    }

    .edit-textarea {
      width: 100%;
      font-size: 12px;
      border: 1px solid #1a73e8;
      border-radius: 4px;
      padding: 6px;
    }

    .edit-actions {
      display: flex;
      justify-content: flex-end;
    }

    .save-sm-btn {
      background: #1a73e8;
      color: white;
      border: none;
      padding: 4px 8px;
      font-size: 11px;
      border-radius: 4px;
      cursor: pointer;
    }

    .supporting-facts {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
      padding-top: 4px;
      border-top: 1px solid #e8eaed;
    }

    .facts-label {
      font-size: 9px;
      color: #5f6368;
      font-weight: 600;
    }

    .fact-tag {
      font-size: 9px;
      background: #ffffff;
      border: 1px solid #dadce0;
      color: #137333;
      padding: 1px 5px;
      border-radius: 3px;
    }

    .refine-row {
      display: flex;
      gap: 6px;
      margin-top: 4px;
    }

    .refine-row input {
      flex: 1;
      padding: 5px 8px;
      border: 1px solid #dadce0;
      border-radius: 4px;
      font-size: 11px;
      outline: none;
    }

    .refine-btn {
      background: #f1f3f4;
      border: 1px solid #dadce0;
      padding: 5px 10px;
      font-size: 11px;
      border-radius: 4px;
      cursor: pointer;
      color: #3c4043;
      font-weight: 500;
    }

    .refine-btn:hover:not(:disabled) {
      background: #e8eaed;
    }

    .actions-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 6px;
      border-top: 1px solid #e8eaed;
    }

    .approve-check {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 600;
      color: #1e8e3e;
      cursor: pointer;
    }

    .btn-group {
      display: flex;
      gap: 8px;
    }

    .text-btn {
      background: transparent;
      border: none;
      font-size: 11px;
      color: #1a73e8;
      cursor: pointer;
      padding: 0;
    }

    .text-btn:hover {
      text-decoration: underline;
    }

    .generate-prompt {
      display: flex;
      justify-content: flex-start;
    }

    .generate-btn {
      background: #e8f0fe;
      color: #1a73e8;
      border: 1px solid #d2e3fc;
      border-radius: 4px;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .generate-btn:hover:not(:disabled) {
      background: #d2e3fc;
    }

    .empty-state {
      text-align: center;
      padding: 24px 12px;
      color: #5f6368;
    }

    .empty-icon {
      font-size: 32px;
      margin-bottom: 4px;
    }

    .empty-text {
      font-size: 12px;
      font-weight: 600;
      color: #202124;
    }

    .empty-sub {
      font-size: 11px;
      color: #5f6368;
      margin-top: 2px;
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

    .detect-card {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      background: #ffffff;
      border: 1px solid #dadce0;
      border-radius: 8px;
      padding: 10px 12px;
    }

    .detect-title { font-size: 13px; font-weight: 700; color: #202124; margin: 0; }
    .detect-hint { font-size: 11px; color: #5f6368; margin: 2px 0 0; }

    .field-meta { display: flex; flex-wrap: wrap; gap: 4px; }

    .field-chip {
      font-size: 10px;
      background: #f1f3f4;
      color: #5f6368;
      padding: 1px 6px;
      border-radius: 4px;
    }
    .field-chip.required { background: #fef7e0; color: #b06000; }
    .field-chip.ok { background: #e6f4ea; color: #137333; }
    .field-chip.err { background: #fce8e6; color: #c5221f; }

    .suggestion-box {
      background: #f8f9fa;
      border: 1px dashed #c2e7ff;
      border-radius: 6px;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .suggestion-title { font-size: 10px; font-weight: 700; color: #1a73e8; }
    .suggestion-row { display: flex; gap: 8px; align-items: flex-start; }
    .suggestion-text {
      flex: 1;
      font-size: 11px;
      color: #3c4043;
      margin: 0;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .unlinked-hint { font-size: 10px; color: #80868b; }

    .bulk-bar {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      position: sticky;
      bottom: 0;
      background: #ffffff;
      padding: 8px 0;
      border-top: 1px solid #e8eaed;
    }

    .review-gate-card {
      background: linear-gradient(135deg, #e8f0fe 0%, #f0f7ff 100%);
      border: 2px solid #1a73e8;
      border-radius: 8px;
      padding: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }

    .gate-content {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      flex: 1;
    }

    .gate-icon {
      font-size: 20px;
      flex-shrink: 0;
    }

    .gate-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .gate-title {
      font-size: 13px;
      font-weight: 700;
      color: #1a73e8;
      margin: 0;
    }

    .gate-hint {
      font-size: 11px;
      color: #1a73e8;
      opacity: 0.8;
      margin: 0;
    }

    .gate-btn {
      background: #1a73e8;
      color: white;
      border: none;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .gate-btn:hover {
      background: #1557b0;
    }
  `],
})

export class ApplicationComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly state = inject(ApplicationStateService);
  readonly formFill = inject(FormFillService);
  private readonly aiApi = inject(AiApiService);
  private readonly profileApi = inject(ProfileApiService);
  private readonly router = inject(Router);

  readonly showJobInput = signal<boolean>(false);
  readonly analyzingJob = signal<boolean>(false);
  readonly feedbackMessage = signal<string | null>(null);
  readonly isError = signal<boolean>(false);
  readonly autofilling = signal<boolean>(false);
  readonly generatingAll = signal<boolean>(false);

  newQuestionText = '';

  // The template reads these directly; the data lives in the shared state service.
  get questions(): QuestionItem[] {
    return this.state.questions;
  }

  get jobContext(): JobContext | null {
    return this.state.jobContext;
  }

  get rawJobDescription(): string {
    return this.state.rawJobDescription;
  }

  set rawJobDescription(value: string) {
    this.state.rawJobDescription = value;
  }

  constructor() {
    // Fields arrive asynchronously and per frame; turn them into questions as they come in.
    effect(() => {
      const added = this.state.addDetectedFields(this.formFill.detectedFields());
      if (added > 0) {
        this.showToast(`Found ${added} form field${added === 1 ? '' : 's'} on this page.`);
        void this.applyProfileValues().then(() => this.loadSuggestions());
      }
    });
  }

  ngOnInit() {
    void this.loadSuggestions();

    // Returning from Answer Review with "Proceed to Autofill".
    if (this.state.autofillOnReturn) {
      this.state.autofillOnReturn = false;
      void this.autofillApproved();
    }
  }

  hasAnyAnswers(): boolean {
    return this.state.hasAnyAnswers();
  }

  fillableCount(): number {
    return this.state.fillable().length;
  }

  unansweredFieldCount(): number {
    return this.questions.filter((q) => q.fieldId && !q.generatedAnswer && !q.currentValue).length;
  }

  toggleJobInput() {
    this.showJobInput.set(!this.showJobInput());
  }

  showToast(msg: string, isErr = false) {
    this.feedbackMessage.set(msg);
    this.isError.set(isErr);
    setTimeout(() => this.feedbackMessage.set(null), 4000);
  }

  async analyzeJob() {
    if (!this.rawJobDescription.trim()) return;

    this.analyzingJob.set(true);
    try {
      this.state.jobContext = await this.aiApi.analyzeJob(this.rawJobDescription);
      this.showJobInput.set(false);
      this.showToast('Job requirements analyzed with Grok!');
    } catch {
      this.showToast('Could not analyze job description.', true);
    } finally {
      this.analyzingJob.set(false);
    }
  }

  detectFields() {
    this.formFill.triggerFormScan();
  }

  addQuestion() {
    const text = this.newQuestionText.trim();
    if (!text) return;

    this.questions.push({ id: `q-${Date.now()}`, question: text });
    this.newQuestionText = '';
    void this.loadSuggestions();
  }

  removeQuestion(id: string) {
    this.state.questions = this.questions.filter((q) => q.id !== id);
  }

  /** Looks up similar library answers for questions that have none yet, one at a time. */
  private async loadSuggestions() {
    if (!this.auth.isAuthenticated()) return;

    for (const q of this.questions) {
      if (q.generatedAnswer || q.suggestionsLoaded) continue;
      q.suggestionsLoaded = true;
      try {
        q.suggestions = await this.aiApi.suggestLibraryAnswers(q.question);
      } catch {
        q.suggestions = [];
      }
    }
  }

  /**
   * Fills personal fields (name, email, links, education) straight from the profile instead of asking
   * the AI, which only sees professional facts. Fields the user already filled on the page are left alone.
   */
  private async applyProfileValues() {
    if (!this.auth.isAuthenticated()) return;

    if (!this.state.profileLoaded) {
      try {
        const full = await this.profileApi.getFullProfile();
        this.state.profile = full.profile ?? null;
        this.state.education = full.education ?? [];
        this.state.profileLoaded = true;
      } catch {
        return; // fall back to AI generation
      }
    }

    // The sign-in email is always known, even before the profile is filled in.
    const accountEmail = this.auth.user()?.email;
    if (accountEmail && !this.state.profile?.email) {
      this.state.profile = { ...(this.state.profile ?? { fullName: '', email: '' }), email: accountEmail };
    }

    for (const q of this.questions) {
      if (!q.fieldId || q.generatedAnswer || q.currentValue) continue;
      const value = this.state.profileValueFor(q.canonicalField);
      if (!value) continue;

      q.generatedAnswer = {
        questionId: q.id,
        answer: value,
        category: 'personal_information',
        confidence: 1,
        supportingFacts: [],
        missingInformation: [],
        requiresReview: false,
      };
      q.fromProfile = true;
    }
  }

  /** Approves every answer that is non-empty and does not need review, so only the doubtful ones stay manual. */
  approveReviewed() {
    let count = 0;
    for (const q of this.questions) {
      if (q.generatedAnswer?.answer.trim() && !q.generatedAnswer.requiresReview && !q.approved) {
        q.approved = true;
        count++;
      }
    }
    this.showToast(count ? `Approved ${count} answer${count === 1 ? '' : 's'} that did not need review.` : 'Nothing to approve: the rest need your review.', count === 0);
  }

  async useSuggestion(q: QuestionItem, suggestion: LibrarySuggestion) {
    q.isGenerating = true;
    try {
      q.generatedAnswer = await this.aiApi.useLibraryAnswer(suggestion.answerId, q.question, q.id);
      q.suggestions = [];
      this.showToast('Library answer added. Review it before autofill.');
    } catch {
      this.showToast('Could not use that library answer.', true);
    } finally {
      q.isGenerating = false;
    }
  }

  /** Tells the model what the field accepts so it answers with a value, not an essay. */
  private buildRequest(q: QuestionItem): GenerateAnswerRequest {
    const request: GenerateAnswerRequest = {
      question: q.question,
      questionId: q.id,
      jobContext: this.jobContext || undefined,
    };

    if (q.fieldId) {
      if (q.options?.length) request.fieldConstraints = { options: q.options };
      else if (q.elementType !== 'textarea') request.fieldConstraints = { shortAnswer: true };
    }

    return request;
  }

  async generateAnswer(q: QuestionItem): Promise<boolean> {
    q.isGenerating = true;
    try {
      q.generatedAnswer = await this.aiApi.generateAnswer(this.buildRequest(q));
      q.suggestions = [];
      return true;
    } catch {
      return false;
    } finally {
      q.isGenerating = false;
    }
  }

  async generateOne(q: QuestionItem) {
    const ok = await this.generateAnswer(q);
    this.showToast(ok ? 'Answer generated from verified facts.' : 'Failed to generate answer. Check backend connection.', !ok);
  }

  /** Generates answers for every detected field that has none. */
  async generateAll() {
    const targets = this.questions.filter((q) => q.fieldId && !q.generatedAnswer && !q.currentValue);
    if (targets.length === 0) return;

    this.generatingAll.set(true);
    let ok = 0;
    for (const q of targets) {
      if (await this.generateAnswer(q)) ok++;
    }
    this.generatingAll.set(false);
    this.showToast(`Generated ${ok} of ${targets.length} answers.`, ok < targets.length);
  }

  async refineAnswer(q: QuestionItem) {
    const instruction = q.refinementInstruction?.trim();
    if (!instruction || !q.generatedAnswer) return;

    q.isRefining = true;
    try {
      const result = await this.aiApi.refineAnswer({
        answerId: q.generatedAnswer.id || q.id,
        instruction,
      });
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

  copyAnswer(text: string) {
    navigator.clipboard.writeText(text);
    this.showToast('Answer copied to clipboard!');
  }

  /** Opens Answer Review, which edits the same question objects (shared state). */
  proceedToReview() {
    if (!this.hasAnyAnswers()) {
      this.showToast('Generate at least one answer first.', true);
      return;
    }
    this.router.navigate(['/answer-review']);
  }

  /** Fills the approved answers into the page's form fields. Never submits the form. */
  async autofillApproved() {
    const targets = this.state.fillable();
    if (targets.length === 0) {
      this.showToast('Approve at least one answer that is linked to a form field.', true);
      return;
    }

    this.autofilling.set(true);
    try {
      const results = await this.formFill.fillApprovedFields(
        targets.map((q) => ({ fieldId: q.fieldId!, value: q.generatedAnswer!.answer, label: q.question })),
      );

      for (const r of results) {
        const q = targets.find((t) => t.fieldId === r.fieldId);
        if (q) q.fillResult = r;
      }

      const filled = targets.filter((q) => q.fillResult?.success);
      this.showToast(
        `Filled ${filled.length} of ${results.length} fields. Review the page before submitting.`,
        filled.length < results.length,
      );

      if (filled.length > 0) await this.recordApplication(filled);
    } finally {
      this.autofilling.set(false);
    }
  }

  /** Saves the application to history once per page, linking the answers that were filled. */
  private async recordApplication(filled: QuestionItem[]) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = tab?.url;
      if (url && this.state.recordedUrls.has(url)) return;

      const host = url ? new URL(url).hostname.replace(/^www\./, '') : 'Unknown site';
      const answerIds = filled.map((q) => q.generatedAnswer?.id).filter((id): id is string => !!id);

      await this.aiApi.saveApplicationHistory(
        this.jobContext?.jobTitle || tab?.title || 'Job application',
        this.jobContext?.companyName || host,
        url,
        answerIds,
      );
      if (url) this.state.recordedUrls.add(url);
    } catch (error) {
      // History is a convenience; never block or alarm the user over it.
      console.warn('[ArziBaaz] Could not save application history:', error);
    }
  }
}
