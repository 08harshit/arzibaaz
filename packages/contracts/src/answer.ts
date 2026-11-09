import type { ApplicationQuestion, QuestionCategory } from './application';
import type { AnswerPreferences } from './profile';

/**
 * A generated answer returned by the AI module.
 * The answer is grounded in the user's verified professional facts.
 */
export interface GeneratedAnswer {
  questionId: string;
  answer: string;
  category: QuestionCategory;
  /** 0–1 confidence in the answer's accuracy and relevance. */
  confidence: number;
  /** References to the professional facts that support this answer. */
  supportingFacts: Array<{
    factId: string;
    reason: string;
  }>;
  /** Information that is missing and would improve the answer. */
  missingInformation: string[];
  /** True if the answer should be manually reviewed before use. */
  requiresReview: boolean;
}

/**
 * Request body for answer generation.
 */
export interface GenerateAnswerRequest {
  question: string;
  questionId: string;
  /** Present when the question comes from a detected form field. */
  fieldConstraints?: {
    /** Exact choices the field accepts (select, radio group, combobox). */
    options?: string[];
    /** True when the field takes a bare value rather than prose. */
    shortAnswer?: boolean;
  };
  jobContext?: JobContext;
  preferences?: Partial<AnswerPreferences>;
}

/**
 * Request body for answer refinement.
 */
export interface RefineAnswerRequest {
  answerId: string;
  instruction: string;
}

/**
 * A saved answer that a user can reuse across applications.
 */
export interface SavedAnswer {
  id: string;
  userId: string;
  category: QuestionCategory;
  title: string;
  content: string;
  tags?: string[];
  /** The question this answer was originally written for. */
  questionText?: string;
  createdAt: string;
  updatedAt: string;
}

/** A library answer matched to a new question. */
export interface LibrarySuggestion {
  answerId: string;
  title: string;
  content: string;
  category: QuestionCategory;
  questionText?: string;
  /** 0–1 similarity to the new question. */
  score: number;
}

export type ApplicationStatus = 'draft' | 'submitted';

/** A row in the application history list. */
export interface ApplicationHistoryItem {
  id: string;
  jobTitle: string;
  company: string;
  jobUrl?: string;
  status: ApplicationStatus;
  appliedAt: string;
}

/** An application with the answers that were used for it. */
export interface ApplicationHistoryDetail extends ApplicationHistoryItem {
  answers: Array<{
    id: string;
    questionText: string;
    answer: string;
    category: QuestionCategory | null;
  }>;
}

/**
 * Application history record linking questions and answers for a session.
 */
export interface ApplicationHistory {
  id: string;
  userId: string;
  companyName?: string;
  jobTitle?: string;
  jobUrl?: string;
  appliedAt?: string;
  questions: ApplicationQuestion[];
  answers: GeneratedAnswer[];
}

/**
 * Job description context extracted from the page or pasted by the user.
 */
export interface JobContext {
  companyName?: string;
  jobTitle?: string;
  location?: string;
  employmentType?: string;
  experienceRequired?: string;
  requiredSkills: string[];
  preferredSkills: string[];
  responsibilities: string[];
  description: string;
}
