/**
 * Personal and contact information for a user profile.
 */
export interface PersonalProfile {
  id?: string;
  fullName: string;
  email: string;
  phone?: string;
  location?: string;
  country?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  headline?: string;
  summary?: string;
  currentStatus?: 'employed' | 'unemployed' | 'freelancing' | 'student';
  createdAt?: string;
  updatedAt?: string;
}

/**
 * A single work experience entry.
 */
export interface WorkExperience {
  id?: string;
  company: string;
  role: string;
  employmentType?: string;
  startDate?: string;
  endDate?: string;
  isCurrent: boolean;
  responsibilities: string[];
  technologies: string[];
  achievements: string[];
}

/**
 * A project entry in the user's professional profile.
 */
export interface Project {
  id?: string;
  name: string;
  description: string;
  technologies: string[];
  responsibilities: string[];
  challenges?: string[];
  solutions?: string[];
  outcomes?: string[];
  projectUrl?: string;
  githubUrl?: string;
}

/**
 * An education entry.
 */
export interface Education {
  id?: string;
  institution: string;
  degree: string;
  fieldOfStudy?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Skill record in the database.
 */
export interface SkillRecord {
  id?: string;
  name: string;
  years?: number;
  proficiency?: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  verified?: boolean;
}

/**
 * Aggregated professional information for a user.
 */
export interface ProfessionalProfile {
  headline?: string;
  summary?: string;
  totalExperienceMonths?: number;
  currentStatus?: 'employed' | 'unemployed' | 'freelancing' | 'student';
  skills: string[];
  experiences: WorkExperience[];
  projects: Project[];
  education: Education[];
}

/**
 * A granular professional fact used to ground AI-generated answers.
 * Facts are retrieved selectively — only relevant facts are sent to the AI.
 */
export interface ProfessionalFact {
  id: string;
  userId: string;
  category: 'skill' | 'achievement' | 'responsibility' | 'project' | 'experience' | 'education' | 'preference';
  content: string;
  source: 'cv' | 'manual' | 'portfolio' | 'github' | 'user_confirmed';
  confidence: number;
  verified: boolean;
}

/**
 * Jurisdiction-specific work eligibility information.
 * Never infer eligibility across countries.
 */
export interface WorkEligibility {
  id?: string;
  country: string;
  legallyAuthorized: boolean | null;
  requiresSponsorship: boolean | null;
  remoteWorkAllowed: boolean | null;
  willingToRelocate: boolean | null;
}

/**
 * User answer-generation preferences.
 */
export interface AnswerPreferences {
  length: 'short' | 'medium' | 'detailed';
  tone: 'natural_professional' | 'formal' | 'conversational' | 'confident';
  style: 'first_person' | 'bullet_points' | 'paragraph';
  additionalInstructions?: string;
}

/**
 * Full aggregated profile response for the client UI.
 */
export interface FullProfileResponse {
  profile: PersonalProfile | null;
  experiences: WorkExperience[];
  education: Education[];
  projects: Project[];
  skills: SkillRecord[];
  eligibility: WorkEligibility[];
  preferences: AnswerPreferences | null;
}

/**
 * Document record referencing files stored privately in Supabase Storage.
 */
export interface DocumentRecord {
  id: string;
  userId: string;
  type: 'cv' | 'cover_letter' | 'portfolio' | 'other';
  storagePath: string;
  originalName: string;
  mimeType: string;
  extractedAt?: string;
  createdAt: string;
}

/**
 * Structured information extracted from a candidate's CV.
 * Must be reviewed and confirmed by the user before committing to verified facts.
 */
export interface ExtractedProfileData {
  documentId?: string;
  rawText: string;
  personal: Partial<PersonalProfile>;
  experiences: Array<Omit<WorkExperience, 'id'>>;
  education: Array<Omit<Education, 'id'>>;
  projects: Array<Omit<Project, 'id'>>;
  skills: Array<Omit<SkillRecord, 'id'>>;
  facts: Array<{
    category: 'skill' | 'achievement' | 'responsibility' | 'project' | 'experience' | 'education' | 'preference';
    content: string;
    confidence: number;
  }>;
}

/**
 * Payload sent by candidate to confirm and commit extracted CV data into the database.
 */
export interface ConfirmExtractedDataRequest {
  documentId?: string;
  personal?: Partial<PersonalProfile>;
  experiences?: Array<Omit<WorkExperience, 'id'>>;
  education?: Array<Omit<Education, 'id'>>;
  projects?: Array<Omit<Project, 'id'>>;
  skills?: Array<Omit<SkillRecord, 'id'>>;
  facts?: Array<{
    category: 'skill' | 'achievement' | 'responsibility' | 'project' | 'experience' | 'education' | 'preference';
    content: string;
    confidence: number;
  }>;
}
