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
import type {
  FieldMark,
  GenerateAnswerRequest,
  JobContext,
  LibrarySuggestion,
  PersonalProfile,
} from '@arzi-baaz/contracts';

/** Personal fields that live in the profile; answering one of these updates the profile. */
const PROFILE_FIELD_KEYS: Record<string, keyof PersonalProfile> = {
  phone: 'phone',
  location: 'location',
  country: 'country',
  linkedinUrl: 'linkedinUrl',
  githubUrl: 'githubUrl',
  portfolioUrl: 'portfolioUrl',
};

/** A field that is still empty after autofill, with the inline "answer once" input. */
interface SummaryItem {
  fieldId: string;
  label: string;
  reason: string;
  consent: boolean;
  failed: boolean;
  profileGap: boolean;
  canonicalField?: string;
  inputType?: string;
  options?: string[];
  draft: string;
  saving: boolean;
  error?: string;
}

interface FillSummary {
  total: number;
  filled: number;
  alreadyFilled: number;
  check: string[];
  todo: SummaryItem[];
}

@Component({
  selector: 'ab-application',
  standalone: true,
  imports: [CommonModule, FormsModule, AuthComponent],
  template: `
    <div class="application-container">
      @if (!auth.isAuthenticated()) {
        <ab-auth />
      } @else {
        @if (feedbackMessage()) {
          <div class="feedback-toast" [class.error]="isError()">
            {{ feedbackMessage() }}
          </div>
        }

        <!-- One-click fill -->
        <div class="fill-card">
          <div class="detect-text">
            <p class="detect-title">Fill this application form</p>
            <p class="detect-hint">
              @if (stage()) {
                {{ stage() }}
                @if (slowHint()) {
                  <br />The free server is waking up. The first request can take up to a minute.
                }
              } @else {
                One click: finds the fields, uses your profile and saved answers, writes the rest, and fills the page. Nothing is submitted.
              }
            </p>
            @if (readiness(); as r) {
              <p class="ready" [class.warn]="r.facts === 0">
                @if (r.facts === 0) {
                  Your profile has no facts yet, so answers will be empty.
                  <button class="text-btn" (click)="goToProfile()">Add them</button>
                } @else {
                  Profile ready: {{ r.facts }} facts, {{ r.skills }} skills
                }
              </p>
            }
          </div>
          <button class="primary-btn fill-btn" (click)="fillWholeForm()" [disabled]="filling()">
            @if (filling()) {
              <span class="spinner-sm"></span> Working...
            } @else {
              ⚡ Fill this form
            }
          </button>
        </div>

        @if (fillSummary(); as sum) {
          <div class="summary-card">
            <p class="sum-title">✓ Filled {{ sum.filled }} of {{ sum.total }} fields</p>
            <p class="legend">
              Marked on the page:
              <span class="dot g"></span>filled
              <span class="dot a"></span>double-check
              <span class="dot r"></span>needs you
            </p>
            @if (sum.alreadyFilled > 0) {
              <p class="sum-line">{{ sum.alreadyFilled }} already filled, left as they were.</p>
            }
            @if (sum.check.length > 0) {
              <p class="sum-line warn">Double-check these (the AI was unsure):</p>
              <ul>
                @for (c of sum.check; track c) {
                  <li>{{ c }}</li>
                }
              </ul>
            }
            @if (sum.todo.length > 0) {
              <p class="sum-line">Needs you. Answer once and it is filled automatically next time:</p>
              @for (m of sum.todo; track m.fieldId) {
                <div class="gap-row">
                  <p class="gap-label">{{ m.label }} <span class="why">- {{ m.reason }}</span></p>
                  @if (!m.consent) {
                    <div class="gap-input">
                      @if (m.options && m.options.length > 0) {
                        <select [(ngModel)]="m.draft">
                          <option value="">Choose...</option>
                          @for (o of m.options; track o) {
                            <option [value]="o">{{ o }}</option>
                          }
                        </select>
                      } @else {
                        <input type="text" [(ngModel)]="m.draft" placeholder="Your answer" (keyup.enter)="saveAndFill(m)" />
                      }
                      <button class="gap-btn" (click)="saveAndFill(m)" [disabled]="!m.draft.trim() || m.saving">
                        @if (m.saving) {
                          <span class="spinner-sm"></span>
                        } @else {
                          Save &amp; fill
                        }
                      </button>
                    </div>
                    @if (m.error) {
                      <p class="gap-err">{{ m.error }}</p>
                    }
                  }
                </div>
              }
            }
            <div class="sum-actions">
              <button class="text-btn" (click)="clearMarks()">Clear highlights</button>
            </div>
            <p class="sum-note">Check the page, then submit it yourself.</p>
          </div>
        }

        <div class="detail-toggle">
          <button class="text-btn" (click)="showDetails.set(!showDetails())">
            {{ showDetails() ? 'Hide' : 'Show' }} job details, fields and manual tools
          </button>
          <button class="text-btn" (click)="detectFields()" [disabled]="formFill.scanning()">Detect only</button>
        </div>

        @if (showDetails()) {
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
                      @if (q.fromLibrary) {
                        <span class="field-chip ok">from your saved answers</span>
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

    .ready { margin: 4px 0 0; font-size: 11px; color: #137333; }
    .ready.warn { color: #b06000; }
    .legend { margin: 0 0 6px; font-size: 10px; color: #5f6368; display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
    .dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-left: 6px; }
    .dot.g { background: #1e8e3e; }
    .dot.a { background: #f29900; }
    .dot.r { background: #d93025; }
    .gap-row { padding: 6px 0; border-top: 1px solid #f1f3f4; }
    .gap-label { margin: 0 0 4px; font-size: 12px; }
    .gap-input { display: flex; gap: 6px; }
    .gap-input input, .gap-input select {
      flex: 1;
      min-width: 0;
      padding: 5px 8px;
      border: 1px solid #dadce0;
      border-radius: 4px;
      font-size: 12px;
      font-family: inherit;
    }
    .gap-btn {
      background: #1a73e8;
      color: #fff;
      border: none;
      border-radius: 4px;
      padding: 5px 10px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
    }
    .gap-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .gap-err { margin: 4px 0 0; font-size: 11px; color: #c5221f; }
    .sum-actions { margin-top: 8px; }

    .fill-card {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      background: linear-gradient(135deg, #e8f0fe 0%, #f0f7ff 100%);
      border: 2px solid #1a73e8;
      border-radius: 8px;
      padding: 12px;
    }
    .fill-btn { padding: 9px 14px; font-size: 13px; white-space: nowrap; }

    .summary-card {
      background: #ffffff;
      border: 1px solid #dadce0;
      border-radius: 8px;
      padding: 12px;
      font-size: 12px;
      color: #202124;
    }
    .sum-title { font-size: 14px; font-weight: 700; color: #137333; margin: 0 0 6px; }
    .sum-line { margin: 6px 0 2px; font-weight: 600; }
    .sum-line.warn { color: #b06000; }
    .sum-line.err { color: #c5221f; }
    .summary-card ul { margin: 0 0 0 16px; padding: 0; }
    .summary-card li { margin: 2px 0; }
    .why { color: #80868b; }
    .sum-note { margin: 8px 0 0; color: #5f6368; font-size: 11px; }
    .detail-toggle { display: flex; justify-content: space-between; }

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
  readonly filling = signal<boolean>(false);
  readonly stage = signal<string | null>(null);
  readonly showDetails = signal<boolean>(false);
  readonly fillSummary = signal<FillSummary | null>(null);
  readonly slowHint = signal<boolean>(false);
  readonly readiness = signal<{ facts: number; skills: number } | null>(null);

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
        void this.applyProfileValues().then(() => (this.filling() ? undefined : this.loadSuggestions()));
      }
    });
  }

  ngOnInit() {
    void this.loadReadiness();
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
    this.state.resetFieldQuestions();
    this.fillSummary.set(null);
    this.showDetails.set(true);
    this.formFill.triggerFormScan();
  }

  /** Consent and legal checkboxes are never ticked automatically; the user decides those. */
  private isConsentField(q: QuestionItem): boolean {
    return (
      q.inputType === 'checkbox' &&
      !q.options?.length &&
      /(agree|consent|acknowledge|confirm|terms|privacy|policy|certify|authoriz|accept)/i.test(q.question)
    );
  }

  /**
   * One click: detect the form, take personal fields from the profile and exact saved answers from the
   * library, write the rest with the AI, approve everything that has an answer, fill the page, and mark
   * the result on the page. The form is never submitted.
   */
  async fillWholeForm() {
    if (this.filling()) return;
    this.filling.set(true);
    this.slowHint.set(false);
    this.fillSummary.set(null);
    this.formFill.clearHighlights();

    // The free hosting tier sleeps when idle; tell the user why the first step can take a while.
    const slowTimer = setTimeout(() => this.slowHint.set(true), 12_000);

    try {
      this.stage.set('Detecting fields...');
      this.state.resetFieldQuestions();
      await this.formFill.scanForm();
      this.state.addDetectedFields(this.formFill.detectedFields());

      const fieldQuestions = () => this.questions.filter((q) => q.fieldId);
      if (fieldQuestions().length === 0) {
        this.showToast('No form fields found on this page. Open the application form and try again.', true);
        return;
      }

      this.stage.set('Using your profile...');
      await this.applyProfileValues();

      const queue = fieldQuestions().filter((q) => !q.generatedAnswer && !q.currentValue && !this.isConsentField(q));
      const total = queue.length;
      let done = 0;
      this.stage.set(total ? `Writing answers 0/${total}...` : 'Filling the form...');

      // A few at a time: faster than one by one, gentle enough for the AI provider's rate limits.
      const worker = async () => {
        for (let q = queue.shift(); q; q = queue.shift()) {
          if (!(await this.useExactLibraryMatch(q))) await this.generateAnswer(q);
          done++;
          this.stage.set(`Writing answers ${done}/${total}...`);
        }
      };
      await Promise.all([worker(), worker(), worker()]);

      for (const q of fieldQuestions()) {
        if (q.generatedAnswer?.answer?.trim() && !this.isConsentField(q)) {
          q.approved = true;
          q.skipped = false;
        }
      }

      this.stage.set('Filling the form...');
      await this.autofillApproved();

      const summary = this.buildSummary();
      this.fillSummary.set(summary);
      this.formFill.highlight(this.buildMarks());
      void this.logGaps(summary);
    } finally {
      clearTimeout(slowTimer);
      this.slowHint.set(false);
      this.filling.set(false);
      this.stage.set(null);
    }
  }

  /** A saved answer for the very same question is the user's own text, so it is used without asking the AI. */
  private async useExactLibraryMatch(q: QuestionItem): Promise<boolean> {
    try {
      const [best] = await this.aiApi.suggestLibraryAnswers(q.question);
      if (!best || best.score < 0.95) return false;

      const answer = await this.aiApi.useLibraryAnswer(best.answerId, q.question, q.id);
      q.generatedAnswer = { ...answer, requiresReview: false };
      q.fromLibrary = true;
      return true;
    } catch {
      return false;
    }
  }

  private buildSummary(): FillSummary {
    const fields = this.questions.filter((q) => q.fieldId);
    const filled = fields.filter((q) => q.fillResult?.success);

    const todo: SummaryItem[] = fields
      .filter((q) => !q.fillResult?.success && !q.currentValue)
      .map((q) => {
        const consent = this.isConsentField(q);
        const failure = q.fillResult && !q.fillResult.success ? q.fillResult.error : undefined;
        const profileGap =
          !!q.canonicalField && q.canonicalField in PROFILE_FIELD_KEYS && !this.state.profileValueFor(q.canonicalField);
        return {
          fieldId: q.fieldId as string,
          label: q.question,
          reason: consent
            ? 'consent: tick it yourself'
            : failure
              ? `could not fill: ${failure}`
              : profileGap
                ? 'missing in your profile'
                : 'no answer available yet',
          consent,
          failed: !!failure,
          profileGap,
          canonicalField: q.canonicalField,
          inputType: q.inputType,
          options: q.options,
          draft: '',
          saving: false,
        };
      });

    return {
      total: fields.length,
      filled: filled.length,
      alreadyFilled: fields.filter((q) => q.currentValue && !q.generatedAnswer).length,
      check: filled.filter((q) => q.generatedAnswer?.requiresReview && !q.fromProfile).map((q) => q.question),
      todo,
    };
  }

  /** What to draw on the page: green filled, amber double-check, red for required fields that still need the user. */
  private buildMarks(): FieldMark[] {
    const marks: FieldMark[] = [];
    for (const q of this.questions) {
      if (!q.fieldId) continue;
      if (q.fillResult?.success) {
        const doubt = q.generatedAnswer?.requiresReview && !q.fromProfile;
        marks.push({
          fieldId: q.fieldId,
          kind: doubt ? 'check' : 'filled',
          note: doubt ? 'Filled by ArziBaaz - please double-check' : 'Filled by ArziBaaz',
        });
      } else if (!q.currentValue && (q.required || q.fillResult)) {
        marks.push({ fieldId: q.fieldId, kind: 'missing', note: 'ArziBaaz could not fill this - it needs you' });
      }
    }
    return marks;
  }

  /** Remembers what we could not fill (labels only) so the user can answer once and developers can see the gaps. */
  private async logGaps(summary: FillSummary) {
    const gaps = summary.todo
      .filter((t) => !t.consent)
      .map((t) => ({
        label: t.label,
        canonicalField: t.canonicalField,
        inputType: t.inputType,
        reason: t.failed ? ('fill_failed' as const) : t.profileGap ? ('profile_missing' as const) : ('no_answer' as const),
      }));
    if (gaps.length === 0) return;

    try {
      const host = await this.activeHost();
      await this.aiApi.recordFieldGaps(gaps.map((g) => ({ ...g, host })));
    } catch {
      // Gap logging is a convenience; never bother the user with it.
    }
  }

  private async activeHost(): Promise<string | undefined> {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return tab?.url ? new URL(tab.url).hostname.replace(/^www\./, '') : undefined;
    } catch {
      return undefined;
    }
  }

  /** The user answers a field we could not fill: put it on the page now and remember it for next time. */
  async saveAndFill(item: SummaryItem) {
    const value = item.draft.trim();
    const q = this.questions.find((x) => x.fieldId === item.fieldId);
    if (!value || !q || item.saving) return;

    item.saving = true;
    item.error = undefined;
    try {
      const [result] = await this.formFill.fillApprovedFields([{ fieldId: item.fieldId, value, label: item.label }]);
      if (!result?.success) {
        item.error = result?.error ?? 'Could not fill this field.';
        return;
      }

      q.fillResult = result;
      q.currentValue = undefined;
      q.generatedAnswer = {
        questionId: q.id,
        answer: value,
        category: q.generatedAnswer?.category ?? 'unknown',
        confidence: 1,
        supportingFacts: [],
        missingInformation: [],
        requiresReview: false,
      };
      q.approved = true;

      this.formFill.highlight([{ fieldId: item.fieldId, kind: 'filled', note: 'Filled by ArziBaaz' }]);
      this.fillSummary.update((s) =>
        s ? { ...s, filled: s.filled + 1, todo: s.todo.filter((t) => t !== item) } : s,
      );

      const saved = await this.rememberAnswer(q, value);
      this.showToast(saved ? 'Filled, and saved for next time.' : 'Filled, but it could not be saved for next time.', !saved);
    } finally {
      item.saving = false;
    }
  }

  /** Personal fields go to the profile; everything else becomes a saved answer matched by question text. */
  private async rememberAnswer(q: QuestionItem, value: string): Promise<boolean> {
    try {
      const profileKey = q.canonicalField ? PROFILE_FIELD_KEYS[q.canonicalField] : undefined;
      if (profileKey) {
        await this.profileApi.updatePersonalProfile({ [profileKey]: value } as Partial<PersonalProfile>);
        this.state.profile = { ...(this.state.profile ?? { fullName: '', email: '' }), [profileKey]: value } as PersonalProfile;
      } else {
        await this.aiApi.createLibraryAnswer(value, q.question, q.generatedAnswer?.category ?? 'unknown');
      }
      await this.aiApi.resolveFieldGap(q.question).catch(() => undefined);
      return true;
    } catch (error) {
      console.warn('[ArziBaaz] Could not save the answer for next time:', error);
      return false;
    }
  }

  clearMarks() {
    this.formFill.clearHighlights();
  }

  goToProfile() {
    this.router.navigate(['/profile']);
  }

  private async loadReadiness() {
    if (!this.auth.isAuthenticated()) return;
    try {
      const [full, facts] = await Promise.all([this.profileApi.getFullProfile(), this.profileApi.getFacts()]);
      this.readiness.set({ facts: facts.length, skills: (full.skills ?? []).length });
    } catch {
      // Hint only; stay silent if the API is asleep or unreachable.
    }
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
