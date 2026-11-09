import { Injectable, Logger } from '@nestjs/common';
import { GrokService } from './grok.service';
import { JOB_ANALYSIS_SYSTEM_PROMPT } from './prompts/job-analysis.prompt';
import { QUESTION_CLASSIFICATION_SYSTEM_PROMPT } from './prompts/question-classification.prompt';
import { ANSWER_GENERATION_SYSTEM_PROMPT } from './prompts/answer-generation.prompt';
import { ANSWER_REFINEMENT_SYSTEM_PROMPT } from './prompts/answer-refinement.prompt';
import { CV_EXTRACTION_SYSTEM_PROMPT } from './prompts/cv-extraction.prompt';
import type {
  AnalyzeJobResponse,
  AnswerPreferences,
  GeneratedAnswer,
  JobContext,
  ProfessionalFact,
  QuestionCategory,
  FullProfileResponse,
} from '@arzi-baaz/contracts';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(private readonly grok: GrokService) {}

  /**
   * ============================================================
   * 1. JOB DESCRIPTION ANALYSIS
   * ============================================================
   */
  async analyzeJob(description: string): Promise<AnalyzeJobResponse> {
    this.logger.log('Analyzing job description criteria');

    const promptPayload = JSON.stringify({
      jobDescription: description.slice(0, 15_000), // protect prompt window
    });

    try {
      const parsed = await this.grok.completeJson<AnalyzeJobResponse>(
        JOB_ANALYSIS_SYSTEM_PROMPT,
        promptPayload,
      );

      return {
        jobTitle: parsed.jobTitle ?? undefined,
        companyName: parsed.companyName ?? undefined,
        location: parsed.location ?? undefined,
        employmentType: parsed.employmentType ?? undefined,
        experienceRequired: parsed.experienceRequired ?? undefined,
        requiredSkills: parsed.requiredSkills ?? [],
        preferredSkills: parsed.preferredSkills ?? [],
        responsibilities: parsed.responsibilities ?? [],
      };
    } catch (err) {
      this.logger.error('Failed to parse job description with Grok', err);
      // Fallback heuristic if API fails or rate-limits
      return {
        jobTitle: undefined,
        companyName: undefined,
        location: undefined,
        employmentType: undefined,
        experienceRequired: undefined,
        requiredSkills: [],
        preferredSkills: [],
        responsibilities: [],
      };
    }
  }

  /**
   * ============================================================
   * 2. QUESTION CLASSIFICATION
   * ============================================================
   */
  async classifyQuestion(question: string): Promise<{
    category: QuestionCategory;
    canonicalField?: string;
    confidence: number;
    reasoning?: string;
  }> {
    const payload = JSON.stringify({ question });

    try {
      const result = await this.grok.completeJson<{
        category: QuestionCategory;
        canonicalField?: string;
        confidence: number;
        reasoning?: string;
      }>(QUESTION_CLASSIFICATION_SYSTEM_PROMPT, payload);

      return {
        category: result.category || 'unknown',
        canonicalField: result.canonicalField || undefined,
        confidence: typeof result.confidence === 'number' ? result.confidence : 0.7,
        reasoning: result.reasoning,
      };
    } catch (err) {
      this.logger.warn('Grok question classification fallback', err);
      return {
        category: 'unknown',
        confidence: 0.5,
      };
    }
  }

  /**
   * ============================================================
   * 3. SELECTIVE FACT RETRIEVAL (Section 10.1 of Spec)
   * ============================================================
   * Rather than sending the candidate's entire profile and documents,
   * targeted retrieval selects only facts relevant to the question category.
   */
  filterRelevantFacts(
    category: QuestionCategory,
    questionText: string,
    allFacts: ProfessionalFact[],
    fullProfile?: FullProfileResponse,
  ): ProfessionalFact[] {
    const qLower = questionText.toLowerCase();

    // 1. Direct category match
    let filtered = allFacts.filter((f) => {
      if (category === 'technical_skills' && f.category === 'skill') return true;
      if (category === 'project_experience' && (f.category === 'project' || f.category === 'achievement')) return true;
      if (category === 'professional_experience' && (f.category === 'experience' || f.category === 'achievement')) return true;
      if (category === 'education' && f.category === 'education') return true;
      return false;
    });

    // 2. Keyword relevancy check (if question mentions specific tech or domain)
    const keywordMatches = allFacts.filter((f) => {
      const words = f.content.toLowerCase().split(/\s+/);
      return words.some((w) => w.length > 3 && qLower.includes(w));
    });

    // 3. For introduction or job fit, take top achievements + skills + experiences
    if (category === 'introduction' || category === 'job_fit' || category === 'company_motivation' || filtered.length === 0) {
      filtered = [
        ...allFacts.filter((f) => f.category === 'achievement').slice(0, 4),
        ...allFacts.filter((f) => f.category === 'experience').slice(0, 3),
        ...allFacts.filter((f) => f.category === 'skill').slice(0, 5),
      ];
    }

    // Merge & deduplicate by fact id
    const combined = [...filtered, ...keywordMatches];
    const unique = Array.from(new Map(combined.map((f) => [f.id, f])).values());

    return unique.slice(0, 10); // Return up to 10 most relevant facts to maintain high density
  }

  /**
   * ============================================================
   * 4. ANSWER GENERATION (Grounded in Verified Facts)
   * ============================================================
   */
  async generateAnswer(params: {
    question: string;
    questionId: string;
    category: QuestionCategory;
    jobContext?: JobContext;
    facts: ProfessionalFact[];
    preferences?: AnswerPreferences;
    candidateName?: string;
    candidateHeadline?: string;
    fieldConstraints?: { options?: string[]; shortAnswer?: boolean };
  }): Promise<GeneratedAnswer> {
    this.logger.log(`Generating grounded answer for: "${params.question.slice(0, 60)}"`);

    // Build grounding payload
    const userPayload = JSON.stringify({
      question: params.question,
      questionCategory: params.category,
      fieldConstraints: params.fieldConstraints ?? null,
      jobContext: params.jobContext
        ? {
            jobTitle: params.jobContext.jobTitle,
            companyName: params.jobContext.companyName,
            requiredSkills: params.jobContext.requiredSkills,
            responsibilities: params.jobContext.responsibilities?.slice(0, 5),
          }
        : null,
      candidate: {
        name: params.candidateName || 'Candidate',
        headline: params.candidateHeadline || '',
      },
      verifiedFacts: params.facts.map((f) => ({
        factId: f.id,
        category: f.category,
        content: f.content,
      })),
      preferences: {
        length: params.preferences?.length || 'medium',
        tone: params.preferences?.tone || 'natural_professional',
        style: params.preferences?.style || 'first_person',
        additionalInstructions: params.preferences?.additionalInstructions || '',
      },
    });

    try {
      const generated = await this.grok.completeJson<{
        answer: string;
        category?: string;
        confidence?: number;
        supportingFacts?: Array<{ factId: string; reason: string }>;
        missingInformation?: string[];
        requiresReview?: boolean;
      }>(ANSWER_GENERATION_SYSTEM_PROMPT, userPayload);

      return {
        questionId: params.questionId,
        answer: generated.answer || '',
        category: params.category,
        confidence: typeof generated.confidence === 'number' ? generated.confidence : 0.85,
        supportingFacts: generated.supportingFacts || [],
        missingInformation: generated.missingInformation || [],
        requiresReview: generated.requiresReview ?? (params.facts.length === 0),
      };
    } catch (err) {
      this.logger.error('Error during answer generation with Grok', err);
      return {
        questionId: params.questionId,
        answer: 'Could not generate answer at this time. Please check your network and AI configuration.',
        category: params.category,
        confidence: 0,
        supportingFacts: [],
        missingInformation: ['AI service connection failed'],
        requiresReview: true,
      };
    }
  }

  /**
   * ============================================================
   * 5. ANSWER REFINEMENT
   * ============================================================
   */
  async refineAnswer(params: {
    answer: string;
    instruction: string;
    facts?: ProfessionalFact[];
  }): Promise<{ answer: string; confidence: number; changesSummary: string; requiresReview: boolean }> {
    this.logger.log(`Refining answer with instruction: "${params.instruction}"`);

    const payload = JSON.stringify({
      currentAnswer: params.answer,
      instruction: params.instruction,
      supportingFacts: params.facts?.map((f) => f.content) || [],
    });

    try {
      const result = await this.grok.completeJson<{
        answer: string;
        confidence?: number;
        changesSummary?: string;
        requiresReview?: boolean;
      }>(ANSWER_REFINEMENT_SYSTEM_PROMPT, payload);

      return {
        answer: result.answer,
        confidence: result.confidence ?? 0.9,
        changesSummary: result.changesSummary ?? 'Answer refined.',
        requiresReview: result.requiresReview ?? false,
      };
    } catch (err) {
      this.logger.error('Error refining answer with Grok', err);
      return {
        answer: params.answer,
        confidence: 0.5,
        changesSummary: 'Refinement failed; original answer retained.',
        requiresReview: true,
      };
    }
  }

  /**
   * Structures the text of a CV into profile sections using the AI provider.
   * Output is normalised defensively because the model's JSON is untrusted input.
   */
  async structureCv(rawText: string): Promise<CvStructure> {
    // Keep the request within small free-tier token limits; the start of a CV carries the key facts.
    const text = rawText.slice(0, 9_000);
    const raw = await this.grok.completeJson<Record<string, unknown>>(
      CV_EXTRACTION_SYSTEM_PROMPT,
      JSON.stringify({ cvText: text }),
    );

    const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
    const strs = (v: unknown, max = 30): string[] =>
      Array.isArray(v) ? v.map(str).filter((s): s is string => !!s).slice(0, max) : [];
    const list = (v: unknown, max: number): Record<string, unknown>[] =>
      Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object').slice(0, max) : [];

    const p = (raw.personal ?? {}) as Record<string, unknown>;
    const personal: CvStructure['personal'] = {};
    for (const key of ['fullName', 'email', 'phone', 'location', 'country', 'linkedinUrl', 'githubUrl', 'portfolioUrl', 'headline', 'summary'] as const) {
      const value = str(p[key]);
      if (value) personal[key] = value;
    }

    const experiences = list(raw.experiences, 12)
      .map((e) => ({
        company: str(e.company) ?? '',
        role: str(e.role) ?? '',
        employmentType: str(e.employmentType),
        startDate: str(e.startDate),
        endDate: str(e.endDate),
        isCurrent: e.isCurrent === true,
        responsibilities: strs(e.responsibilities),
        technologies: strs(e.technologies),
        achievements: strs(e.achievements),
      }))
      .filter((e) => e.company || e.role);

    const education = list(raw.education, 6)
      .map((e) => ({
        institution: str(e.institution) ?? '',
        degree: str(e.degree) ?? '',
        fieldOfStudy: str(e.fieldOfStudy),
        startDate: str(e.startDate),
        endDate: str(e.endDate),
      }))
      .filter((e) => e.institution || e.degree);

    const projects = list(raw.projects, 10)
      .map((e) => ({
        name: str(e.name) ?? '',
        description: str(e.description) ?? '',
        technologies: strs(e.technologies),
        responsibilities: strs(e.responsibilities),
        projectUrl: str(e.projectUrl),
        githubUrl: str(e.githubUrl),
      }))
      .filter((e) => e.name);

    const seen = new Set<string>();
    const skills = list(raw.skills, 80)
      .map((e) => str(e.name))
      .filter((n): n is string => !!n && !seen.has(n.toLowerCase()) && !!seen.add(n.toLowerCase()))
      .map((name) => ({ name, verified: false }));

    const categories = ['skill', 'achievement', 'responsibility', 'project', 'experience', 'education', 'preference'] as const;
    const facts = list(raw.facts, 40)
      .map((f) => {
        const category = categories.find((c) => c === f.category) ?? 'experience';
        const confidence = typeof f.confidence === 'number' ? Math.min(1, Math.max(0, f.confidence)) : 0.9;
        return { category, content: str(f.content) ?? '', confidence };
      })
      .filter((f) => f.content);

    return { personal, experiences, education, projects, skills, facts };
  }
}

/** CV content as structured by the AI provider (no raw text or document id). */
export type CvStructure = Pick<
  import('@arzi-baaz/contracts').ExtractedProfileData,
  'personal' | 'experiences' | 'education' | 'projects' | 'skills' | 'facts'
>;
