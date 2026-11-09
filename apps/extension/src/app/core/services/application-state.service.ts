import { Injectable } from '@angular/core';
import type {
  ApplicationQuestion,
  Education,
  FieldFillResult,
  GeneratedAnswer,
  JobContext,
  LibrarySuggestion,
  PersonalProfile,
} from '@arzi-baaz/contracts';

export interface QuestionItem {
  id: string;
  question: string;
  /** Detected form field this question fills; absent for hand-typed questions. */
  fieldId?: string;
  inputType?: string;
  elementType?: string;
  options?: string[];
  required?: boolean;
  canonicalField?: string;
  /** What the form field already contains when scanned (typed by the user or pre-filled). */
  currentValue?: string;
  /** The answer came straight from the user's profile, not the AI. */
  fromProfile?: boolean;
  generatedAnswer?: GeneratedAnswer & { id?: string };
  isGenerating?: boolean;
  isRefining?: boolean;
  isEditing?: boolean;
  refinementInstruction?: string;
  approved?: boolean;
  /** Set in Answer Review: excluded from autofill and dimmed. */
  skipped?: boolean;
  suggestions?: LibrarySuggestion[];
  suggestionsLoaded?: boolean;
  fillResult?: FieldFillResult;
}

/**
 * Application-tab state that must survive navigating to other tabs
 * (Answer Review, Library, ...). Components are destroyed on navigation;
 * this root service is not.
 */
@Injectable({ providedIn: 'root' })
export class ApplicationStateService {
  jobContext: JobContext | null = null;
  rawJobDescription = '';

  profile: PersonalProfile | null = null;
  education: Education[] = [];
  profileLoaded = false;

  /** Set by Answer Review so the Application tab autofills when the user returns. */
  autofillOnReturn = false;

  /** Page URLs already saved to history, so re-running autofill does not duplicate the record. */
  readonly recordedUrls = new Set<string>();

  questions: QuestionItem[] = [
    { id: 'q-default-1', question: 'Why are you a good fit for this role?' },
    { id: 'q-default-2', question: 'Tell us about a challenging technical problem you solved.' },
  ];

  /** Removes questions tied to form fields of a previous scan; hand-typed questions stay. */
  resetFieldQuestions(): void {
    this.questions = this.questions.filter((q) => !q.fieldId);
  }

  hasAnyAnswers(): boolean {
    return this.questions.some((q) => !!q.generatedAnswer);
  }

  firstUnanswered(): QuestionItem | undefined {
    return this.questions.find((q) => !q.generatedAnswer);
  }

  /** Approved questions that are linked to a form field and can be autofilled. */
  fillable(): QuestionItem[] {
    return this.questions.filter((q) => q.approved && q.generatedAnswer?.answer && q.fieldId);
  }

  /**
   * Adds newly detected form fields as questions. Untouched sample questions
   * are dropped the first time real fields arrive. Returns the number added.
   */
  addDetectedFields(fields: ApplicationQuestion[]): number {
    const known = new Set(this.questions.map((q) => q.fieldId).filter(Boolean));
    const fresh = fields.filter((f) => !known.has(f.id) && (f.label || f.ariaLabel || f.placeholder));
    if (fresh.length === 0) return 0;

    if (!this.questions.some((q) => q.fieldId)) {
      this.questions = this.questions.filter((q) => !q.id.startsWith('q-default-') || q.generatedAnswer);
    }

    for (const f of fresh) {
      this.questions.push({
        id: f.id,
        fieldId: f.id,
        question: (f.label || f.ariaLabel || f.placeholder) as string,
        inputType: f.inputType,
        elementType: f.elementType,
        options: f.options,
        required: f.required,
        canonicalField: f.canonicalField,
        currentValue: f.currentValue,
      });
    }
    return fresh.length;
  }

  /**
   * The user's own value for a canonical field (name, email, links, education), straight from the
   * profile. Returns undefined when the profile has nothing for it, so the AI path takes over.
   */
  profileValueFor(canonicalField: string | undefined): string | undefined {
    const p = this.profile;
    const edu = this.education[0];
    const words = (p?.fullName ?? '').trim().split(/\s+/).filter(Boolean);

    const values: Record<string, string | undefined> = {
      firstName: words[0],
      lastName: words.length > 1 ? words.slice(1).join(' ') : undefined,
      fullName: words.join(' '),
      email: p?.email,
      phone: p?.phone,
      location: p?.location,
      country: p?.country,
      linkedinUrl: p?.linkedinUrl,
      githubUrl: p?.githubUrl,
      portfolioUrl: p?.portfolioUrl,
      university: edu?.institution,
      highestQualification: edu?.degree,
      fieldOfStudy: edu?.fieldOfStudy,
      graduationYear: edu?.endDate,
    };

    const value = canonicalField ? values[canonicalField]?.trim() : undefined;
    return value || undefined;
  }
}
