import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import type {
  GeneratedAnswer,
  GenerateAnswerRequest,
  RefineAnswerRequest,
  JobContext,
  SavedAnswer,
  LibrarySuggestion,
  ApplicationStatus,
  ApplicationHistoryItem,
  ApplicationHistoryDetail,
  QuestionCategory,
} from '@arzi-baaz/contracts';

@Injectable({
  providedIn: 'root',
})
export class AiApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly baseUrl = environment.apiUrl;

  private getHeaders(): HttpHeaders {
    const token = this.auth.getAccessToken();
    return new HttpHeaders({
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    });
  }

  /**
   * Analyzes raw job description text via the NestJS AI module.
   */
  async analyzeJob(description: string): Promise<JobContext> {
    return firstValueFrom(
      this.http.post<JobContext>(
        `${this.baseUrl}/jobs/analyze`,
        { description },
        { headers: this.getHeaders() },
      ),
    );
  }

  /**
   * Generates a personalized answer grounded in the user's verified facts.
   */
  async generateAnswer(
    request: GenerateAnswerRequest,
  ): Promise<GeneratedAnswer & { id?: string }> {
    return firstValueFrom(
      this.http.post<GeneratedAnswer & { id?: string }>(
        `${this.baseUrl}/answers/generate`,
        request,
        { headers: this.getHeaders() },
      ),
    );
  }

  /**
   * Refines an existing draft answer with user instruction.
   */
  async refineAnswer(
    request: RefineAnswerRequest,
  ): Promise<{ answer: string; confidence: number; changesSummary: string; requiresReview: boolean }> {
    return firstValueFrom(
      this.http.post<{ answer: string; confidence: number; changesSummary: string; requiresReview: boolean }>(
        `${this.baseUrl}/answers/refine`,
        request,
        { headers: this.getHeaders() },
      ),
    );
  }

  // ── Milestone 7: answer library ────────────────────────────────

  async saveAnswerToLibrary(
    generatedAnswerId: string,
    category: QuestionCategory,
    tags?: string[],
  ): Promise<SavedAnswer> {
    return firstValueFrom(
      this.http.post<SavedAnswer>(
        `${this.baseUrl}/answers/library/save`,
        { generatedAnswerId, category, tags },
        { headers: this.getHeaders() },
      ),
    );
  }

  async getLibraryAnswers(category?: QuestionCategory, search?: string): Promise<SavedAnswer[]> {
    return firstValueFrom(
      this.http.get<SavedAnswer[]>(`${this.baseUrl}/answers/library${this.query({ category, search })}`, {
        headers: this.getHeaders(),
      }),
    );
  }

  /** Library answers written for questions similar to `question`. */
  async suggestLibraryAnswers(question: string, category?: QuestionCategory): Promise<LibrarySuggestion[]> {
    return firstValueFrom(
      this.http.get<LibrarySuggestion[]>(
        `${this.baseUrl}/answers/library/suggest${this.query({ question, category })}`,
        { headers: this.getHeaders() },
      ),
    );
  }

  /** Adopts a library answer for a concrete question so it can be refined and linked to an application. */
  async useLibraryAnswer(
    savedAnswerId: string,
    question: string,
    questionId: string,
  ): Promise<GeneratedAnswer & { id?: string }> {
    return firstValueFrom(
      this.http.post<GeneratedAnswer & { id?: string }>(
        `${this.baseUrl}/answers/library/${encodeURIComponent(savedAnswerId)}/use`,
        { question, questionId },
        { headers: this.getHeaders() },
      ),
    );
  }

  async deleteLibraryAnswer(answerId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${this.baseUrl}/answers/library/${encodeURIComponent(answerId)}`, {
        headers: this.getHeaders(),
      }),
    );
  }

  // ── Milestone 7: application history ───────────────────────────

  async saveApplicationHistory(
    jobTitle: string,
    company: string,
    jobUrl?: string,
    generatedAnswerIds?: string[],
  ): Promise<{ id: string }> {
    return firstValueFrom(
      this.http.post<{ id: string }>(
        `${this.baseUrl}/answers/applications/history`,
        { jobTitle, company, jobUrl, generatedAnswerIds },
        { headers: this.getHeaders() },
      ),
    );
  }

  async getApplicationHistory(limit?: number, offset?: number): Promise<ApplicationHistoryItem[]> {
    return firstValueFrom(
      this.http.get<ApplicationHistoryItem[]>(
        `${this.baseUrl}/answers/applications/history${this.query({ limit, offset })}`,
        { headers: this.getHeaders() },
      ),
    );
  }

  async getApplicationDetail(id: string): Promise<ApplicationHistoryDetail> {
    return firstValueFrom(
      this.http.get<ApplicationHistoryDetail>(
        `${this.baseUrl}/answers/applications/history/${encodeURIComponent(id)}`,
        { headers: this.getHeaders() },
      ),
    );
  }

  async updateApplicationStatus(id: string, status: ApplicationStatus): Promise<ApplicationHistoryItem> {
    return firstValueFrom(
      this.http.patch<ApplicationHistoryItem>(
        `${this.baseUrl}/answers/applications/history/${encodeURIComponent(id)}/status`,
        { status },
        { headers: this.getHeaders() },
      ),
    );
  }

  // ── Missing fields: answer once, reuse everywhere ──────────────

  /** Saves an answer the user typed for a question, so the same question is filled automatically next time. */
  async createLibraryAnswer(
    content: string,
    questionText: string,
    category: QuestionCategory = 'unknown',
  ): Promise<SavedAnswer> {
    return firstValueFrom(
      this.http.post<SavedAnswer>(
        `${this.baseUrl}/answers/library`,
        { content, questionText, category },
        { headers: this.getHeaders() },
      ),
    );
  }

  /** Remembers form fields that could not be filled (labels only, never answers). */
  async recordFieldGaps(
    gaps: Array<{
      label: string;
      canonicalField?: string;
      inputType?: string;
      host?: string;
      reason: 'no_answer' | 'fill_failed' | 'profile_missing';
    }>,
  ): Promise<void> {
    if (gaps.length === 0) return;
    await firstValueFrom(
      this.http.post(`${this.baseUrl}/field-gaps`, { gaps }, { headers: this.getHeaders() }),
    );
  }

  async resolveFieldGap(label: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${this.baseUrl}/field-gaps/resolve`, { label }, { headers: this.getHeaders() }),
    );
  }

  /** Builds an encoded query string, skipping empty values. */
  private query(params: Record<string, string | number | undefined>): string {
    const parts = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
    return parts.length ? `?${parts.join('&')}` : '';
  }
}
