export type { JobContext } from './answer';

/**
 * Request body for the job description analysis endpoint.
 */
export interface AnalyzeJobRequest {
  description: string;
}

/**
 * Response from the job analysis endpoint.
 */
export interface AnalyzeJobResponse {
  jobTitle?: string;
  companyName?: string;
  location?: string;
  employmentType?: string;
  experienceRequired?: string;
  requiredSkills: string[];
  preferredSkills: string[];
  responsibilities: string[];
}
