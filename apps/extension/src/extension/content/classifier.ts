/**
 * QuestionClassifier — maps detected form fields to canonical categories
 * and canonical field names.
 *
 * Milestone 5: Full implementation with comprehensive pattern matching
 * and confidence scoring per spec §8.
 */

import type { ApplicationQuestion, CanonicalField, QuestionCategory } from '@arzi-baaz/contracts';

export interface ClassificationResult {
  category: QuestionCategory;
  canonicalField: CanonicalField;
  confidence: number;
}

/**
 * Classify a form field question based on its detected label and metadata.
 * Concatenates all available text signals (label, placeholder, name, aria-label, nearby text),
 * normalizes to lowercase, and matches against comprehensive pattern library.
 *
 * Returns classification with confidence score per spec §8:
 * - ≥0.90: ready for direct autofill
 * - 0.70–0.89: should be reviewed by user
 * - <0.70: ask user to manually map or clarify
 */
export function classify(question: ApplicationQuestion): ClassificationResult {
  const text = [
    question.label,
    question.placeholder,
    question.name,
    question.ariaLabel,
    question.nearbyText,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return matchCanonicalField(text);
}

/**
 * Canonical field mapping.
 * Maps normalized label text to canonical fields and categories.
 * Thresholds per spec §8: ≥0.90 direct fill, 0.70–0.89 review, <0.70 ask.
 */
function matchCanonicalField(text: string): ClassificationResult {
  const matchers: Array<{
    patterns: string[];
    canonicalField: CanonicalField;
    category: QuestionCategory;
    confidence: number;
  }> = [
    {
      patterns: ['first name', 'given name', 'legal first name', 'candidate first name'],
      canonicalField: 'firstName',
      category: 'personal_information',
      confidence: 0.95,
    },
    {
      patterns: ['last name', 'surname', 'family name', 'legal last name'],
      canonicalField: 'lastName',
      category: 'personal_information',
      confidence: 0.95,
    },
    {
      patterns: ['full name', 'legal name', 'your name', 'candidate name'],
      canonicalField: 'fullName',
      category: 'personal_information',
      confidence: 0.92,
    },
    {
      patterns: ['email', 'email address', 'e-mail'],
      canonicalField: 'email',
      category: 'personal_information',
      confidence: 0.97,
    },
    {
      patterns: ['phone', 'mobile', 'telephone', 'contact number', 'cell'],
      canonicalField: 'phone',
      category: 'personal_information',
      confidence: 0.93,
    },
    {
      patterns: ['location', 'city', 'current city', 'current location'],
      canonicalField: 'location',
      category: 'personal_information',
      confidence: 0.88,
    },
    {
      patterns: ['country', 'country of residence'],
      canonicalField: 'country',
      category: 'personal_information',
      confidence: 0.90,
    },
    {
      patterns: ['linkedin', 'linkedin url', 'linkedin profile'],
      canonicalField: 'linkedinUrl',
      category: 'personal_information',
      confidence: 0.95,
    },
    {
      patterns: ['github', 'github url', 'github profile'],
      canonicalField: 'githubUrl',
      category: 'personal_information',
      confidence: 0.95,
    },
    {
      patterns: ['portfolio', 'portfolio url', 'personal website'],
      canonicalField: 'portfolioUrl',
      category: 'personal_information',
      confidence: 0.90,
    },
    {
      patterns: ['total experience', 'years of experience', 'work experience', 'years experience'],
      canonicalField: 'totalExperience',
      category: 'professional_experience',
      confidence: 0.88,
    },
    {
      patterns: ['current company', 'current employer', 'company name', 'employer'],
      canonicalField: 'currentCompany',
      category: 'professional_experience',
      confidence: 0.85,
    },
    {
      patterns: ['notice period', 'joining availability', 'available from'],
      canonicalField: 'noticePeriod',
      category: 'professional_experience',
      confidence: 0.87,
    },
    {
      patterns: ['expected salary', 'expected ctc', 'expected compensation'],
      canonicalField: 'expectedSalary',
      category: 'professional_experience',
      confidence: 0.85,
    },
    {
      patterns: ['highest qualification', 'education', 'degree', 'qualification'],
      canonicalField: 'highestQualification',
      category: 'education',
      confidence: 0.82,
    },
    {
      patterns: ['cover letter', 'tell us about yourself', 'about yourself', 'introduce yourself'],
      canonicalField: 'coverLetter',
      category: 'introduction',
      confidence: 0.80,
    },
    {
      patterns: ['resume', 'cv', 'curriculum vitae', 'upload resume'],
      canonicalField: 'resume',
      category: 'personal_information',
      confidence: 0.95,
    },
    {
      patterns: ['work authorization', 'right to work', 'legally authorized', 'authorized to work'],
      canonicalField: 'unknown',
      category: 'work_eligibility',
      confidence: 0.90,
    },
    {
      patterns: ['visa sponsorship', 'require sponsorship', 'sponsorship needed'],
      canonicalField: 'unknown',
      category: 'work_eligibility',
      confidence: 0.89,
    },
    {
      patterns: ['willing to relocate', 'relocation', 'willing to move', 'open to relocation'],
      canonicalField: 'unknown',
      category: 'work_eligibility',
      confidence: 0.87,
    },
    {
      patterns: ['skills', 'technical skills', 'core competencies', 'competencies'],
      canonicalField: 'skills',
      category: 'technical_skills',
      confidence: 0.85,
    },
    {
      patterns: ['programming language', 'languages', 'tech stack'],
      canonicalField: 'skills',
      category: 'technical_skills',
      confidence: 0.80,
    },
    {
      patterns: ['university', 'school name', 'institution', 'college'],
      canonicalField: 'university',
      category: 'education',
      confidence: 0.85,
    },
    {
      patterns: ['graduation year', 'graduation date', 'grad year', 'graduated'],
      canonicalField: 'graduationYear',
      category: 'education',
      confidence: 0.86,
    },
    {
      patterns: ['field of study', 'major', 'specialization', 'branch'],
      canonicalField: 'fieldOfStudy',
      category: 'education',
      confidence: 0.84,
    },
    {
      patterns: ['current role', 'current position', 'job title', 'designation'],
      canonicalField: 'currentRole',
      category: 'professional_experience',
      confidence: 0.83,
    },
    {
      patterns: ['current salary', 'current ctc', 'current compensation'],
      canonicalField: 'currentSalary',
      category: 'professional_experience',
      confidence: 0.82,
    },
    {
      patterns: ['summary', 'professional summary', 'about', 'bio'],
      canonicalField: 'summary',
      category: 'introduction',
      confidence: 0.78,
    },
  ];

  for (const matcher of matchers) {
    for (const pattern of matcher.patterns) {
      if (text.includes(pattern)) {
        return {
          canonicalField: matcher.canonicalField,
          category: matcher.category,
          confidence: matcher.confidence,
        };
      }
    }
  }

  return {
    canonicalField: 'unknown',
    category: 'unknown',
    confidence: 0.3,
  };
}
