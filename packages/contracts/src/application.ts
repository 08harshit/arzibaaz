/**
 * Canonical question categories used by the classifier.
 */
export type QuestionCategory =
  | 'personal_information'
  | 'education'
  | 'professional_experience'
  | 'technical_skills'
  | 'introduction'
  | 'job_fit'
  | 'company_motivation'
  | 'project_experience'
  | 'career_goals'
  | 'work_eligibility'
  | 'unknown';

/**
 * Canonical field identifiers. Different form labels map to these.
 */
export type CanonicalField =
  | 'firstName'
  | 'lastName'
  | 'fullName'
  | 'email'
  | 'phone'
  | 'location'
  | 'country'
  | 'linkedinUrl'
  | 'githubUrl'
  | 'portfolioUrl'
  | 'currentCompany'
  | 'currentRole'
  | 'totalExperience'
  | 'noticePeriod'
  | 'currentSalary'
  | 'expectedSalary'
  | 'highestQualification'
  | 'university'
  | 'graduationYear'
  | 'fieldOfStudy'
  | 'coverLetter'
  | 'summary'
  | 'skills'
  | 'resume'
  | 'unknown';

/**
 * Represents a detected form field on a job application page.
 */
export interface ApplicationQuestion {
  id: string;
  elementType: string;
  inputType?: string;
  label?: string;
  placeholder?: string;
  name?: string;
  elementId?: string;
  ariaLabel?: string;
  required: boolean;
  options?: string[];
  nearbyText?: string;
  detectedQuestion?: string;
  canonicalField?: CanonicalField;
  category?: QuestionCategory;
  confidence?: number;
  framework?: 'react' | 'vue' | 'angular' | 'none';
}
