import type { QuestionCategory } from '@arzi-baaz/contracts';

/** Every QuestionCategory with its display label. The Record type fails to compile if one is missing. */
const LABELS: Record<QuestionCategory, string> = {
  personal_information: 'Personal Information',
  education: 'Education',
  professional_experience: 'Professional Experience',
  technical_skills: 'Technical Skills',
  introduction: 'Introduction',
  job_fit: 'Job Fit',
  company_motivation: 'Company Motivation',
  project_experience: 'Project Experience',
  career_goals: 'Career Goals',
  work_eligibility: 'Work Eligibility',
  unknown: 'Other',
};

export const QUESTION_CATEGORIES = (Object.keys(LABELS) as QuestionCategory[]).map((value) => ({
  value,
  label: LABELS[value],
}));
