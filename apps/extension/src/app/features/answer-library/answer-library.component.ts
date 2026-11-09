import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApplicationStateService } from '../../core/services/application-state.service';
import { QUESTION_CATEGORIES } from '../../core/question-categories';
import { AiApiService } from '../../core/services/ai-api.service';
import type { SavedAnswer, QuestionCategory } from '@arzi-baaz/contracts';

@Component({
  selector: 'ab-answer-library',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="header">
        <h2 class="page-title">Answer Library</h2>
        <p class="page-hint">Your reusable answers organized by category.</p>
      </div>

      <!-- Filter & Search -->
      <div class="filter-bar">
        <select [(ngModel)]="selectedCategory" (change)="loadAnswers()" class="filter-input">
          <option value="">All Categories</option>
          @for (c of categories; track c.value) {
            <option [value]="c.value">{{ c.label }}</option>
          }
        </select>

        <input
          type="text"
          [(ngModel)]="searchQuery"
          (input)="onSearchInput()"
          placeholder="Search answers..."
          class="search-input"
        />

        <button class="refresh-btn" (click)="loadAnswers()" [disabled]="loading()">
          @if (loading()) {
            <span class="spinner-sm"></span>
          } @else {
            ↻ Refresh
          }
        </button>
      </div>

      <!-- Loading State -->
      @if (loading()) {
        <div class="loading-state">
          <p class="spinner-lg"></p>
          <p>Loading your library...</p>
        </div>
      }

      <!-- Empty State -->
      @if (!loading() && savedAnswers().length === 0 && !searchQuery && !selectedCategory) {
        <div class="empty-state">
          <p class="empty-icon">📚</p>
          <p class="empty-text">Your library is empty.</p>
          <p class="empty-sub">Save answers from the Application or Answer Review tabs to build your library.</p>
        </div>
      }

      <!-- No Search Results -->
      @if (!loading() && savedAnswers().length === 0 && (searchQuery || selectedCategory)) {
        <div class="empty-state">
          <p class="empty-icon">🔍</p>
          <p class="empty-text">No answers match your search or filter</p>
          <p class="empty-sub">Try a different search or filter.</p>
        </div>
      }

      <!-- Answers List -->
      @if (displayedAnswers().length > 0) {
        <div class="answers-grid">
          @for (answer of displayedAnswers(); track answer.id) {
            <div class="answer-card">
              <div class="card-header">
                <div class="header-content">
                  <span class="category-badge">{{ answer.category }}</span>
                  <span class="date-label">{{ formatDate(answer.createdAt) }}</span>
                </div>
                <button class="delete-btn" (click)="deleteAnswer(answer.id)" title="Delete">✕</button>
              </div>

              <p class="answer-text">{{ answer.content }}</p>

              @if (answer.tags && answer.tags.length > 0) {
                <div class="tags">
                  @for (tag of answer.tags; track tag) {
                    <span class="tag">{{ tag }}</span>
                  }
                </div>
              }

              <div class="card-actions">
                <button class="action-btn" (click)="copyAnswer(answer.content)" title="Copy to clipboard">
                  📋 Copy
                </button>
                <button class="action-btn" (click)="suggestAnswer(answer)" title="Suggest for current question">
                  ➜ Suggest
                </button>
              </div>
            </div>
          }
        </div>

        <p class="results-info">
          {{ displayedAnswers().length }} answer{{ displayedAnswers().length === 1 ? '' : 's' }}
        </p>
      }

      @if (feedbackMessage()) {
        <div class="feedback-toast" [class.error]="isError()">
          {{ feedbackMessage() }}
        </div>
      }
    </div>
  `,
  styles: [`
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

    .filter-bar {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .filter-input,
    .search-input {
      padding: 6px 8px;
      border: 1px solid #dadce0;
      border-radius: 4px;
      font-size: 12px;
      font-family: inherit;
    }

    .filter-input {
      flex: 0 0 auto;
      min-width: 150px;
    }

    .search-input {
      flex: 1;
    }

    .filter-input:focus,
    .search-input:focus {
      outline: none;
      border-color: #1a73e8;
      box-shadow: 0 0 0 2px rgba(26, 115, 232, 0.2);
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

    .answers-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
    }

    .answer-card {
      background: #ffffff;
      border: 1px solid #dadce0;
      border-radius: 8px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      transition: box-shadow 150ms;
    }

    .answer-card:hover {
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }

    .header-content {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .category-badge {
      font-size: 10px;
      text-transform: uppercase;
      font-weight: 700;
      background: #e8f0fe;
      color: #1a73e8;
      padding: 2px 6px;
      border-radius: 4px;
    }

    .date-label {
      font-size: 10px;
      color: #5f6368;
    }

    .delete-btn {
      background: transparent;
      border: none;
      font-size: 14px;
      color: #80868b;
      cursor: pointer;
      padding: 0;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .delete-btn:hover {
      color: #d93025;
    }

    .answer-text {
      font-size: 12px;
      color: #202124;
      line-height: 1.5;
      margin: 0;
      white-space: pre-line;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
    }

    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }

    .tag {
      font-size: 9px;
      background: #f1f3f4;
      color: #5f6368;
      padding: 2px 6px;
      border-radius: 4px;
      border: 1px solid #dadce0;
    }

    .card-actions {
      display: flex;
      gap: 6px;
      padding-top: 6px;
      border-top: 1px solid #e8eaed;
    }

    .action-btn {
      flex: 1;
      background: #f1f3f4;
      color: #3c4043;
      border: 1px solid #dadce0;
      padding: 5px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
    }

    .action-btn:hover {
      background: #e8eaed;
    }

    .results-info {
      font-size: 10px;
      color: #5f6368;
      text-align: center;
      margin: 0;
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
export class AnswerLibraryComponent {
  private readonly aiApi = inject(AiApiService);
  private readonly router = inject(Router);
  private readonly state = inject(ApplicationStateService);

  readonly categories = QUESTION_CATEGORIES;
  readonly savedAnswers = signal<SavedAnswer[]>([]);
  readonly displayedAnswers = this.savedAnswers;
  readonly loading = signal<boolean>(false);
  readonly feedbackMessage = signal<string | null>(null);
  readonly isError = signal<boolean>(false);

  selectedCategory = '';
  searchQuery = '';
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit() {
    this.loadAnswers();
  }

  async loadAnswers() {
    this.loading.set(true);
    try {
      const answers = await this.aiApi.getLibraryAnswers(
        this.selectedCategory ? (this.selectedCategory as QuestionCategory) : undefined,
        this.searchQuery.trim() || undefined,
      );
      this.savedAnswers.set(answers);
    } catch (error) {
      this.showToast('Failed to load library. Try again.', true);
      console.error('Load error:', error);
    } finally {
      this.loading.set(false);
    }
  }

  /** Searches on the server after the user pauses typing. */
  onSearchInput() {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.loadAnswers(), 300);
  }

  async deleteAnswer(id: string) {
    if (!confirm('Delete this answer from library?')) return;

    try {
      await this.aiApi.deleteLibraryAnswer(id);
      this.savedAnswers.set(this.savedAnswers().filter((a) => a.id !== id));
      this.showToast('Answer deleted from library.');
    } catch (error) {
      this.showToast('Failed to delete. Try again.', true);
      console.error('Delete error:', error);
    }
  }

  copyAnswer(text: string) {
    navigator.clipboard.writeText(text);
    this.showToast('Answer copied to clipboard!');
  }

  /** Uses this answer for the first question in the Application tab that has no answer yet. */
  async suggestAnswer(answer: SavedAnswer) {
    const target = this.state.firstUnanswered();
    if (!target) {
      this.showToast('Every question already has an answer. Add or detect a question first.', true);
      return;
    }

    try {
      target.generatedAnswer = await this.aiApi.useLibraryAnswer(answer.id, target.question, target.id);
      target.suggestions = [];
      this.router.navigate(['/application']);
    } catch {
      this.showToast('Could not use that answer. Try again.', true);
    }
  }

  formatDate(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
