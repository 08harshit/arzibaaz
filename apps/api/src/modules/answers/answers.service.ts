import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { ProfileService } from '../profile/profile.service';
import { SupabaseService } from '../auth/supabase.service';
import { GenerateAnswerDto, RefineAnswerDto } from './dto/answer.dto';
import type {
  ApplicationHistoryDetail,
  ApplicationHistoryItem,
  GeneratedAnswer,
  JobContext,
  LibrarySuggestion,
  QuestionCategory,
  SavedAnswer,
} from '@arzi-baaz/contracts';

@Injectable()
export class AnswersService {
  private readonly logger = new Logger(AnswersService.name);

  constructor(
    private readonly ai: AiService,
    private readonly profileService: ProfileService,
    private readonly supabase: SupabaseService,
  ) {}

  /**
   * Generates a personalized answer grounded in the user's verified facts.
   *
   * SECURITY & GROUNDING:
   * 1. Retrieves user's verified professional facts from the DB using their token.
   * 2. Classifies the question to select an answer strategy.
   * 3. Selectively retrieves only relevant facts (minimizing context pollution and token waste).
   * 4. Synthesizes a factual answer via Grok with strict anti-hallucination rules.
   * 5. Saves the answer record in `generated_answers` scoped to `user_id`.
   */
  async generateAnswer(
    userId: string,
    accessToken: string,
    dto: GenerateAnswerDto,
  ): Promise<GeneratedAnswer & { id?: string }> {
    this.logger.log(`Generating answer for user ${userId}, questionId: ${dto.questionId}`);

    // 1. Fetch user profile, preferences, and verified facts
    const [profile, preferences, facts] = await Promise.all([
      this.profileService.getProfile(userId, accessToken),
      this.profileService.getPreferences(userId, accessToken),
      this.profileService.getFacts(userId, accessToken),
    ]);

    // 2. Classify question category
    const classification = await this.ai.classifyQuestion(dto.question);

    // 3. Filter targeted facts for this question category
    const relevantFacts = this.ai.filterRelevantFacts(
      classification.category,
      dto.question,
      facts,
    );

    // 4. Generate answer via Grok
    const generated = await this.ai.generateAnswer({
      question: dto.question,
      questionId: dto.questionId,
      category: classification.category,
      jobContext: dto.jobContext as JobContext | undefined,
      facts: relevantFacts,
      preferences: dto.preferences || preferences || undefined,
      candidateName: profile?.full_name,
      candidateHeadline: profile?.headline,
      fieldConstraints: dto.fieldConstraints,
    });

    // 5. Store generated answer in database for review and future reuse
    const client = this.supabase.getAuthenticatedClient(accessToken);
    const { data: savedRecord, error: saveErr } = await client
      .from('generated_answers')
      .insert({
        user_id: userId,
        question_text: dto.question,
        category: classification.category,
        answer: generated.answer,
        confidence: generated.confidence,
        supporting_facts: generated.supportingFacts,
        missing_information: generated.missingInformation,
        requires_review: generated.requiresReview,
        approved_by_user: false,
      })
      .select('id')
      .maybeSingle();

    if (saveErr) {
      this.logger.warn(`Could not save generated answer to DB: ${saveErr.message}`);
    }

    return {
      ...generated,
      id: savedRecord?.id,
    };
  }

  /**
   * Refines an existing answer based on candidate instructions.
   */
  async refineAnswer(userId: string, accessToken: string, dto: RefineAnswerDto) {
    this.logger.log(`Refining answer ${dto.answerId} for user ${userId}`);

    const client = this.supabase.getAuthenticatedClient(accessToken);

    // Fetch existing answer
    const { data: existing, error } = await client
      .from('generated_answers')
      .select('*')
      .eq('id', dto.answerId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !existing) {
      throw new NotFoundException('Generated answer record not found');
    }

    // Refine answer via Grok
    const refined = await this.ai.refineAnswer({
      answer: existing.answer,
      instruction: dto.instruction,
    });

    // Update stored record
    await client
      .from('generated_answers')
      .update({
        answer: refined.answer,
        confidence: refined.confidence,
        requires_review: refined.requiresReview,
      })
      .eq('id', dto.answerId)
      .eq('user_id', userId);

    return {
      answerId: dto.answerId,
      answer: refined.answer,
      confidence: refined.confidence,
      changesSummary: refined.changesSummary,
      requiresReview: refined.requiresReview,
    };
  }


  // ─────────────────────────────────────────────────────────────
  // Milestone 7: Answer library + application history
  // ─────────────────────────────────────────────────────────────

  private toSavedAnswer(row: Record<string, any>): SavedAnswer {
    return {
      id: row.id,
      userId: row.user_id,
      content: row.content,
      title: row.title,
      tags: row.tags ?? [],
      questionText: row.question_text ?? undefined,
      category: row.category,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Save a generated answer to the user's answer library.
   * Remembers the original question so similar questions can be matched later.
   */
  async saveAnswerToLibrary(
    userId: string,
    accessToken: string,
    generatedAnswerId: string,
    category: QuestionCategory,
    tags?: string[],
  ): Promise<SavedAnswer> {
    this.logger.log(`Saving answer ${generatedAnswerId} to library for user ${userId}`);

    const client = this.supabase.getAuthenticatedClient(accessToken);

    const { data: generated, error: fetchErr } = await client
      .from('generated_answers')
      .select('answer, question_text')
      .eq('id', generatedAnswerId)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchErr || !generated) {
      throw new NotFoundException('Generated answer not found');
    }

    const { data: saved, error: saveErr } = await client
      .from('saved_answers')
      .insert({
        user_id: userId,
        content: generated.answer,
        question_text: generated.question_text,
        category,
        tags: tags || [],
        title: `${category} - ${new Date().toISOString().split('T')[0]}`,
      })
      .select('*')
      .maybeSingle();

    if (saveErr || !saved) {
      this.logger.error(`Failed to save answer to library: ${saveErr?.message}`);
      throw new Error('Could not save answer to library');
    }

    return this.toSavedAnswer(saved);
  }

  /**
   * Retrieve the user's saved answers (soft-deleted rows excluded),
   * optionally filtered by category and a keyword search.
   */
  async getSavedAnswers(
    userId: string,
    accessToken: string,
    category?: QuestionCategory,
    search?: string,
  ): Promise<SavedAnswer[]> {
    const client = this.supabase.getAuthenticatedClient(accessToken);

    let query = client
      .from('saved_answers')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (category) {
      query = query.eq('category', category);
    }

    // Strip characters that have meaning in PostgREST filter syntax.
    const term = search?.replace(/[,()%*\\]/g, ' ').trim();
    if (term) {
      query = query.or(
        `content.ilike.%${term}%,title.ilike.%${term}%,question_text.ilike.%${term}%`,
      );
    }

    const { data: answers, error } = await query;

    if (error) {
      this.logger.error(`Failed to fetch saved answers: ${error.message}`);
      throw error;
    }

    return (answers || []).map((a) => this.toSavedAnswer(a));
  }

  async getSavedAnswer(userId: string, accessToken: string, answerId: string): Promise<SavedAnswer> {
    const client = this.supabase.getAuthenticatedClient(accessToken);

    const { data: answer, error } = await client
      .from('saved_answers')
      .select('*')
      .eq('id', answerId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error || !answer) {
      throw new NotFoundException('Saved answer not found');
    }

    return this.toSavedAnswer(answer);
  }

  /** Soft delete: the row stays but is hidden from the library. */
  async deleteSavedAnswer(userId: string, accessToken: string, answerId: string): Promise<void> {
    this.logger.log(`Deleting saved answer ${answerId} for user ${userId}`);

    const client = this.supabase.getAuthenticatedClient(accessToken);

    const { error } = await client
      .from('saved_answers')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', answerId)
      .eq('user_id', userId)
      .is('deleted_at', null);

    if (error) {
      this.logger.error(`Failed to delete saved answer: ${error.message}`);
      throw error;
    }
  }

  /**
   * Suggest library answers for a new question by word overlap with the
   * question each answer was originally written for.
   */
  async suggestSavedAnswers(
    userId: string,
    accessToken: string,
    question: string,
    category?: QuestionCategory,
  ): Promise<LibrarySuggestion[]> {
    const client = this.supabase.getAuthenticatedClient(accessToken);

    const { data: rows, error } = await client
      .from('saved_answers')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      this.logger.error(`Failed to fetch saved answers for suggestions: ${error.message}`);
      throw error;
    }

    const wanted = tokenize(question);
    if (wanted.size === 0) return [];

    return (rows || [])
      .map((row) => {
        const source = tokenize(row.question_text || row.title || '');
        let overlap = 0;
        for (const w of wanted) if (source.has(w)) overlap++;
        const union = wanted.size + source.size - overlap;
        let score = union === 0 ? 0 : overlap / union;
        if (category && row.category === category) score += 0.15;
        return { row, score };
      })
      .filter((x) => x.score >= 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(({ row, score }) => ({
        answerId: row.id,
        title: row.title,
        content: row.content,
        category: row.category,
        questionText: row.question_text ?? undefined,
        score: Math.round(score * 100) / 100,
      }));
  }

  /**
   * Adopt a library answer for a concrete question: stores it as a generated
   * answer so it can be refined, reviewed and linked to an application.
   */
  async useLibraryAnswer(
    userId: string,
    accessToken: string,
    savedAnswerId: string,
    question: string,
    questionId: string,
  ): Promise<GeneratedAnswer & { id?: string }> {
    const saved = await this.getSavedAnswer(userId, accessToken, savedAnswerId);
    const client = this.supabase.getAuthenticatedClient(accessToken);

    const { data: record, error } = await client
      .from('generated_answers')
      .insert({
        user_id: userId,
        question_text: question,
        category: saved.category,
        answer: saved.content,
        confidence: 1,
        supporting_facts: [],
        missing_information: [],
        requires_review: true,
        approved_by_user: false,
      })
      .select('id')
      .maybeSingle();

    if (error || !record) {
      this.logger.error(`Failed to adopt library answer: ${error?.message}`);
      throw new Error('Could not use library answer');
    }

    return {
      id: record.id,
      questionId,
      answer: saved.content,
      category: saved.category,
      confidence: 1,
      supportingFacts: [],
      missingInformation: [],
      requiresReview: true,
    };
  }

  /**
   * Record an application and link the answers that were used for it.
   */
  async saveApplicationHistory(
    userId: string,
    accessToken: string,
    jobTitle: string,
    company: string,
    jobUrl?: string,
    generatedAnswerIds: string[] = [],
  ): Promise<{ id: string }> {
    this.logger.log(`Saving application history for user ${userId}: ${company} - ${jobTitle}`);

    const client = this.supabase.getAuthenticatedClient(accessToken);

    const { data: saved, error } = await client
      .from('job_applications')
      .insert({
        user_id: userId,
        job_title: jobTitle,
        company_name: company,
        job_url: jobUrl,
        status: 'draft',
        applied_at: new Date().toISOString(),
      })
      .select('id')
      .maybeSingle();

    if (error || !saved) {
      this.logger.error(`Failed to save application history: ${error?.message}`);
      throw new Error('Could not save application to history');
    }

    if (generatedAnswerIds.length > 0) {
      const { error: linkErr } = await client
        .from('generated_answers')
        .update({ application_id: saved.id, approved_by_user: true })
        .in('id', generatedAnswerIds)
        .eq('user_id', userId);

      if (linkErr) {
        this.logger.warn(`Could not link answers to application ${saved.id}: ${linkErr.message}`);
      }
    }

    return { id: saved.id };
  }

  async getApplicationHistory(
    userId: string,
    accessToken: string,
    limit: number = 20,
    offset: number = 0,
  ): Promise<ApplicationHistoryItem[]> {
    const client = this.supabase.getAuthenticatedClient(accessToken);

    const { data: apps, error } = await client
      .from('job_applications')
      .select('id, job_title, company_name, job_url, status, applied_at')
      .eq('user_id', userId)
      .order('applied_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      this.logger.error(`Failed to fetch application history: ${error.message}`);
      throw error;
    }

    return (apps || []).map((a) => this.toHistoryItem(a));
  }

  /** One application with the answers that were used for it. */
  async getApplicationDetail(
    userId: string,
    accessToken: string,
    applicationId: string,
  ): Promise<ApplicationHistoryDetail> {
    const client = this.supabase.getAuthenticatedClient(accessToken);

    const { data: app, error } = await client
      .from('job_applications')
      .select('id, job_title, company_name, job_url, status, applied_at')
      .eq('id', applicationId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !app) {
      throw new NotFoundException('Application not found');
    }

    const { data: answers, error: answersErr } = await client
      .from('generated_answers')
      .select('id, question_text, answer, category')
      .eq('application_id', applicationId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (answersErr) {
      this.logger.error(`Failed to fetch application answers: ${answersErr.message}`);
      throw answersErr;
    }

    return {
      ...this.toHistoryItem(app),
      answers: (answers || []).map((a) => ({
        id: a.id,
        questionText: a.question_text,
        answer: a.answer,
        category: a.category,
      })),
    };
  }

  /** Status is the only field of a history record that may change. */
  async updateApplicationStatus(
    userId: string,
    accessToken: string,
    applicationId: string,
    status: 'draft' | 'submitted',
  ): Promise<ApplicationHistoryItem> {
    const client = this.supabase.getAuthenticatedClient(accessToken);

    const { data: app, error } = await client
      .from('job_applications')
      .update({ status })
      .eq('id', applicationId)
      .eq('user_id', userId)
      .select('id, job_title, company_name, job_url, status, applied_at')
      .maybeSingle();

    if (error || !app) {
      throw new NotFoundException('Application not found');
    }

    return this.toHistoryItem(app);
  }

  private toHistoryItem(a: Record<string, any>): ApplicationHistoryItem {
    return {
      id: a.id,
      jobTitle: a.job_title,
      company: a.company_name,
      jobUrl: a.job_url ?? undefined,
      status: a.status,
      appliedAt: a.applied_at,
    };
  }
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'you', 'your', 'our', 'with', 'this', 'that', 'have', 'has',
  'what', 'why', 'how', 'who', 'when', 'where', 'would', 'could', 'should', 'about', 'tell',
  'please', 'describe', 'explain', 'any', 'from', 'was', 'were', 'will', 'can', 'did', 'does',
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
  );
}
