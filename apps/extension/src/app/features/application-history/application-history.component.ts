import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AiApiService } from '../../core/services/ai-api.service';
import type {
  ApplicationHistoryDetail,
  ApplicationHistoryItem,
  ApplicationStatus,
} from '@arzi-baaz/contracts';

@Component({
  selector: 'ab-application-history',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page">
      <div class="header">
        <h2 class="page-title">Application History</h2>
        <p class="page-hint">Applications you autofilled, with the answers you used.</p>
      </div>

      <div class="controls">
        <button class="refresh-btn" (click)="loadHistory()" [disabled]="loading()">
          @if (loading()) {
            <span class="spinner-sm"></span>
          } @else {
            ↻ Refresh
          }
        </button>
        <span class="count-label">{{ applications().length }} applications</span>
      </div>

      @if (loading() && applications().length === 0) {
        <div class="loading-state">
          <p class="spinner-lg"></p>
          <p>Loading history...</p>
        </div>
      }

      @if (!loading() && applications().length === 0) {
        <div class="empty-state">
          <p class="empty-icon">📋</p>
          <p class="empty-text">No applications recorded yet.</p>
          <p class="empty-sub">Autofill a form from the Application tab and it will be saved here.</p>
        </div>
      }

      @if (applications().length > 0) {
        <div class="history-list">
          @for (app of applications(); track app.id) {
            <div class="history-card" [class.expanded]="expandedId() === app.id">
              <div class="card-header" (click)="toggleExpanded(app.id)">
                <div class="header-content">
                  <p class="job-title">{{ app.jobTitle }}</p>
                  <p class="company-name">{{ app.company }}</p>
                  <p class="date">
                    {{ formatDate(app.appliedAt) }} ·
                    <span class="status" [class.submitted]="app.status === 'submitted'">{{ app.status }}</span>
                  </p>
                </div>
                <button class="expand-btn">{{ expandedId() === app.id ? '▼' : '▶' }}</button>
              </div>

              @if (expandedId() === app.id) {
                <div class="card-details">
                  <div class="detail-section">
                    <span class="label">Applied:</span>
                    <span class="value">{{ formatDateTime(app.appliedAt) }}</span>
                  </div>

                  @if (app.jobUrl) {
                    <div class="detail-section">
                      <span class="label">Page:</span>
                      <a class="value link" [href]="app.jobUrl" target="_blank" rel="noopener noreferrer">{{ app.jobUrl }}</a>
                    </div>
                  }

                  <div class="detail-section">
                    <span class="label">Status:</span>
                    <button class="action-link" (click)="setStatus(app, app.status === 'submitted' ? 'draft' : 'submitted')">
                      Mark as {{ app.status === 'submitted' ? 'draft' : 'submitted' }}
                    </button>
                  </div>

                  <div class="answers">
                    <span class="label">Answers used</span>
                    @if (detail(); as d) {
                      @if (d.answers.length === 0) {
                        <p class="muted">No answers were linked to this application.</p>
                      }
                      @for (a of d.answers; track a.id) {
                        <div class="answer-item">
                          <p class="answer-q">{{ a.questionText }}</p>
                          <p class="answer-a">{{ a.answer }}</p>
                        </div>
                      }
                    } @else if (detailLoading()) {
                      <span class="spinner-sm"></span>
                    }
                  </div>
                </div>
              }
            </div>
          }
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
    .status {
      text-transform: capitalize;
      font-weight: 600;
      color: #b06000;
    }
    .status.submitted { color: #137333; }

    .value.link { color: #1a73e8; text-decoration: none; }
    .value.link:hover { text-decoration: underline; }

    .answers { display: flex; flex-direction: column; gap: 6px; padding-top: 6px; border-top: 1px solid #e8eaed; }
    .answer-item { background: #ffffff; border: 1px solid #e8eaed; border-radius: 6px; padding: 8px; }
    .answer-q { font-size: 11px; font-weight: 600; color: #202124; margin: 0 0 4px; }
    .answer-a { font-size: 11px; color: #3c4043; margin: 0; white-space: pre-line; }
    .muted { font-size: 11px; color: #80868b; margin: 0; }

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

    .controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .refresh-btn {
      background: #f1f3f4;
      color: #3c4043;
      border: 1px solid #dadce0;
      padding: 6px 10px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
      white-space: nowrap;
    }

    .refresh-btn:hover:not(:disabled) {
      background: #e8eaed;
    }

    .refresh-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .count-label {
      font-size: 11px;
      color: #5f6368;
      margin-left: auto;
    }

    .loading-state,
    .empty-state {
      text-align: center;
      padding: 40px 16px;
      color: #5f6368;
    }

    .spinner-lg {
      display: inline-block;
      width: 32px;
      height: 32px;
      border: 3px solid #e8eaed;
      border-top-color: #1a73e8;
      border-radius: 50%;
      animation: spin 600ms linear infinite;
      margin-bottom: 12px;
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

    .history-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .history-card {
      background: #ffffff;
      border: 1px solid #dadce0;
      border-radius: 8px;
      overflow: hidden;
      transition: box-shadow 150ms;
    }

    .history-card:hover {
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px;
      cursor: pointer;
      user-select: none;
    }

    .card-header:hover {
      background: #f8f9fa;
    }

    .header-content {
      flex: 1;
    }

    .job-title {
      font-size: 13px;
      font-weight: 600;
      color: #202124;
      margin: 0 0 2px 0;
    }

    .company-name {
      font-size: 12px;
      color: #5f6368;
      margin: 0 0 4px 0;
    }

    .date {
      font-size: 10px;
      color: #80868b;
      margin: 0;
    }

    .expand-btn {
      background: transparent;
      border: none;
      font-size: 12px;
      color: #5f6368;
      cursor: pointer;
      padding: 4px 8px;
      transition: transform 150ms;
    }

    .expand-btn.expanded {
      transform: rotate(0deg);
    }

    .card-details {
      border-top: 1px solid #e8eaed;
      padding: 12px;
      background: #f8f9fa;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .detail-section {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 11px;
    }

    .label {
      font-weight: 600;
      color: #5f6368;
      min-width: 100px;
    }

    .value {
      color: #202124;
      flex: 1;
      word-break: break-all;
      font-family: monospace;
      font-size: 10px;
    }

    .copy-btn {
      background: transparent;
      border: none;
      font-size: 11px;
      color: #1a73e8;
      cursor: pointer;
      padding: 2px 4px;
    }

    .copy-btn:hover {
      text-decoration: underline;
    }

    .actions-footer {
      display: flex;
      justify-content: flex-end;
      padding-top: 6px;
      border-top: 1px solid #e8eaed;
      margin-top: 6px;
    }

    .action-link {
      background: transparent;
      border: none;
      color: #1a73e8;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      padding: 0;
    }

    .action-link:hover {
      text-decoration: underline;
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
export class ApplicationHistoryComponent {
  private readonly aiApi = inject(AiApiService);

  readonly applications = signal<ApplicationHistoryItem[]>([]);
  readonly loading = signal<boolean>(false);
  readonly expandedId = signal<string | null>(null);
  readonly detail = signal<ApplicationHistoryDetail | null>(null);
  readonly detailLoading = signal<boolean>(false);
  readonly feedbackMessage = signal<string | null>(null);
  readonly isError = signal<boolean>(false);

  ngOnInit() {
    this.loadHistory();
  }

  async loadHistory() {
    this.loading.set(true);
    try {
      this.applications.set(await this.aiApi.getApplicationHistory(50, 0));
    } catch (error) {
      this.showToast('Failed to load application history. Try again.', true);
      console.error('Load error:', error);
    } finally {
      this.loading.set(false);
    }
  }

  async toggleExpanded(id: string) {
    if (this.expandedId() === id) {
      this.expandedId.set(null);
      this.detail.set(null);
      return;
    }

    this.expandedId.set(id);
    this.detail.set(null);
    this.detailLoading.set(true);
    try {
      const loaded = await this.aiApi.getApplicationDetail(id);
      // Ignore the response if the user opened a different card meanwhile.
      if (this.expandedId() === id) this.detail.set(loaded);
    } catch (error) {
      this.showToast('Could not load the answers for this application.', true);
      console.error('Detail error:', error);
    } finally {
      this.detailLoading.set(false);
    }
  }

  async setStatus(app: ApplicationHistoryItem, status: ApplicationStatus) {
    try {
      const updated = await this.aiApi.updateApplicationStatus(app.id, status);
      this.applications.update((list) => list.map((a) => (a.id === app.id ? updated : a)));
    } catch (error) {
      this.showToast('Could not update the status.', true);
      console.error('Status error:', error);
    }
  }

  formatDate(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      if (date.toDateString() === today.toDateString()) return 'Today';
      if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
    } catch {
      return 'Unknown';
    }
  }

  formatDateTime(dateStr: string): string {
    try {
      return new Date(dateStr).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'Unknown';
    }
  }

  private showToast(msg: string, isErr = false) {
    this.feedbackMessage.set(msg);
    this.isError.set(isErr);
    setTimeout(() => this.feedbackMessage.set(null), 3500);
  }
}
