# ArziBaaz — Product & Technical Specification

## 1. Product Overview
ArziBaaz is a Chrome extension that helps job seekers complete repetitive and lengthy job application forms faster.

Many job application forms ask for the same information repeatedly:
- Personal and contact details
- Education and professional experience
- Skills and technical knowledge
- Work authorization and relocation details
- Custom questions such as:
  - Tell us about yourself.
  - Why are you interested in this position?
  - Why should we hire you?
  - Describe a challenging project.
  - What makes you a good fit for this role?
  - Why do you want to join our company?

ArziBaaz should detect these fields, understand what information they require, retrieve relevant information from the user's profile, generate personalized answers where necessary, and help fill the form.

### Core principle
**ArziBaaz assists users. It never submits job applications automatically.**

Users must be able to review, edit, approve, and fill every answer themselves.

The product should support multiple users. Every user has their own profile, CV, professional history, preferences, and saved answers.

---

## 2. Product Goals

### Primary goals
1. Detect job application forms on supported websites.
2. Identify what information each field requires.
3. Match detected fields against the user's profile.
4. Generate personalized answers using AI.
5. Use the job description to tailor answers to the position.
6. Reduce repetitive typing through controlled autofill.
7. Allow users to review and edit generated answers.
8. Remember useful answers and corrections for future applications.
9. Protect user information and prevent cross-user data access.

### Non-goals
The initial version will not:
- Submit applications automatically.
- Solve CAPTCHAs.
- Bypass application website restrictions.
- Automatically create accounts on job portals.
- Invent professional experience or achievements.
- Automatically answer ambiguous legal declarations.
- Store passwords or sensitive authentication information.

---

## 3. Technology Stack

| Component | Technology |
|---|---|
| Browser extension UI | Angular + TypeScript |
| Extension platform | Chrome Manifest V3 |
| Content scripts | TypeScript |
| Background service worker | TypeScript |
| Backend | NestJS |
| Database | Supabase PostgreSQL |
| Authentication | Supabase Auth |
| File storage | Supabase Storage |
| AI provider | xAI Grok API |
| API validation | class-validator or Zod |
| Shared types | TypeScript package |
| Monorepo | pnpm workspaces |
| Unit testing | Vitest or Jest |
| Browser testing | Playwright |

### Architectural decisions
- Angular is used for the extension interface.
- Content scripts and background service workers use plain TypeScript, not Angular.
- NestJS handles business logic and AI orchestration.
- Supabase handles authentication, PostgreSQL, and document storage.
- Grok API keys remain exclusively on the backend.
- The extension must never contain an AI provider API key.
- All user data must be isolated by authenticated user identity.

---

## 4. High-Level Architecture

```
                         USER
                           |
                           |
                    Chrome Browser
                           |
                           |
                Angular Chrome Extension
                           |
             +-------------+-------------+
             |                           |
       Extension UI                Content Scripts
             |                           |
             |                     Form Detection
             |                     Field Extraction
             |                     Field Classification
             |                     Autofill
             |                           |
             +-------------+-------------+
                           |
                           |
                       NestJS API
                           |
          +----------------+----------------+
          |                |                |
       Auth Module     Profile Module    AI Module
          |                |                |
          |                |                |
          +----------------+----------------+
                           |
                +----------+----------+
                |                     |
             Supabase              Grok API
                |
        +-------+-------+
        |       |       |
       Auth   PostgreSQL Storage
```

### Responsibilities
#### Chrome Extension
Responsible for:
- Detecting application forms.
- Extracting field information.
- Displaying the side panel.
- Sending relevant information to the backend.
- Showing generated answers.
- Allowing answer editing and approval.
- Filling approved fields.

#### NestJS Backend
Responsible for:
- Authentication verification.
- User profile management.
- CV and document processing.
- Job description analysis.
- Question classification.
- Retrieving relevant professional facts.
- AI answer generation.
- Answer refinement.
- Eligibility matching.
- Rate limiting and usage management.

#### Supabase
Responsible for:
- User authentication.
- User-specific profile data.
- Professional facts.
- Application history.
- Saved answers.
- Private CV and document storage.

#### Grok API
Responsible for:
- Understanding custom application questions.
- Generating personalized answers.
- Refining answers based on user instructions.
- Producing structured output.

---

## 5. Multi-User Architecture
This is a product intended for multiple users.

The application must never contain hardcoded personal information belonging to its developer.

Every user must configure their own profile.

### Authentication
Use Supabase Auth.

Initial authentication methods:
- Email and password.
- Google OAuth.

The extension should authenticate users and maintain their session.
The NestJS backend must verify Supabase access tokens before processing protected requests.

### Important security rules
1. Never trust `user_id` supplied in a request body.
2. Derive the user identity from the verified access token.
3. Apply Row Level Security (RLS) to user-owned database tables.
4. Never expose the Supabase service-role key in the extension.
5. Never expose Grok API credentials in frontend code.
6. Test that one user cannot access another user's records.

---

## 6. User Profile and Knowledge Base
The quality of AI-generated answers depends heavily on the information available about the user. We need a structured professional knowledge base.

### 6.1 Personal Information
```typescript
interface PersonalProfile {
  fullName: string;
  email: string;
  phone?: string;
  location?: string;
  country?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
}
```

### 6.2 Professional Information
```typescript
interface ProfessionalProfile {
  headline?: string;
  summary?: string;
  totalExperienceMonths?: number;
  currentStatus?: "employed" | "unemployed" | "freelancing" | "student";
  skills: string[];
  experiences: WorkExperience[];
  projects: Project[];
  education: Education[];
}
```

### 6.3 Work Experience
```typescript
interface WorkExperience {
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
```

### 6.4 Projects
```typescript
interface Project {
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
```

### 6.5 Education
```typescript
interface Education {
  institution: string;
  degree: string;
  fieldOfStudy?: string;
  startDate?: string;
  endDate?: string;
}
```

### 6.6 Professional Facts
In addition to structured profile information, maintain a collection of professional facts.

```typescript
interface ProfessionalFact {
  id: string;
  userId: string;
  category: "skill" | "achievement" | "responsibility" | "project" | "experience" | "education" | "preference";
  content: string;
  source: "cv" | "manual" | "portfolio" | "github" | "user_confirmed";
  confidence: number;
  verified: boolean;
}
```

These facts will be used to ground AI-generated answers.
**Important:** AI must not invent facts that are missing from the knowledge base. If insufficient information exists, the system should ask the user for clarification or mark the answer for review.

---

## 7. Job Application Question Classification
Not every application question should be answered using the same strategy. We need a question classification system.

### 7.1 Question Categories
- **A. Personal Information**: Full name, email, phone number, location, LinkedIn, GitHub. *Strategy*: Match directly against profile.
- **B. Education**: Highest qualification, university, degree, graduation year, field of study. *Strategy*: Match against education records.
- **C. Professional Experience**: Current company, designation, total experience, notice period, salary. *Strategy*: Match against professional profile.
- **D. Technical Skills**: Which programming languages, years with tech stack. *Strategy*: Match against skills and verified experience. Do not infer years simply from project mentions.
- **E. Introduction**: Tell us about yourself, introduce yourself. *Strategy*: Generate concise intro based on profile and job description.
- **F. Job Fit**: Why are you a good fit, why should we hire you? *Strategy*: Analyze job description requirements, retrieve matching facts, tailor personalized answer.
- **G. Company Motivation**: Why do you want to join our company, what excites you about us? *Strategy*: Connect genuine interests without inventing admirations.
- **H. Project Experience**: Challenging project, difficult technical problem, significant achievement. *Strategy*: Retrieve project facts and generate structured response.
- **I. Career Goals**: Where do you see yourself in five years? *Strategy*: Use explicitly configured preferences and professional goals.
- **J. Legal and Work Eligibility**: Authorized to work, visa sponsorship, willing to relocate. *Strategy*: Use explicit, jurisdiction-specific user information only. Never assume eligibility across countries.
- **K. Unknown Questions**: If unclassifiable, display original question and ask user to map or answer.

---

## 8. Canonical Field Mapping System
Different companies use different wording for the same information.

| Field variations | Canonical field |
|---|---|
| First name, Given name, Legal first name | firstName |
| Last name, Surname, Legal last name | lastName |
| Full name, Legal name | fullName |
| Email, Email address | email |
| Mobile, Phone, Contact number | phone |
| Current city, Location | location |
| LinkedIn URL, LinkedIn profile | linkedinUrl |
| GitHub URL, GitHub profile | githubUrl |
| Total experience, Years of experience | totalExperience |
| Current employer, Current company | currentCompany |
| Expected CTC, Expected salary | expectedSalary |
| Notice period, Joining availability | noticePeriod |
| Highest qualification, Degree | highestQualification |

### Classification Confidence
| Confidence | Behavior |
|---|---|
| 0.90–1.00 | Suggest direct autofill |
| 0.70–0.89 | Show for review |
| Below 0.70 | Ask user to map or clarify |

The system learns from user-approved manual mappings, but learned mappings must never override sensitive legal eligibility decisions.

---

## 9. Job Description Analysis
The system identifies the job description before generating custom answers:
- Extract required and preferred skills
- Extract responsibilities and experience requirements
- Prioritize relevant facts for question answering

```typescript
interface JobContext {
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
```

---

## 10. AI Answer Generation Architecture
Targeted retrieval sends only relevant facts to the AI, not the entire user profile.

### Generation Flow
```
Application Question -> Question Classification -> Job Context Retrieval
  -> Relevant Professional Fact Retrieval -> Strategy Selection -> Grok API
  -> Structured Output -> Fact Validation -> User Review -> Approved Answer
```

### 10.2 Answer Settings
- **Length**: Short (30–50 words), Medium (75–100 words), Detailed (150–200 words)
- **Tone**: Natural professional, Formal, Conversational, Confident
- **Style**: First person, Bullet points, Paragraph

### 10.3 Answer Output Structure
```typescript
interface GeneratedAnswer {
  questionId: string;
  answer: string;
  category: string;
  confidence: number;
  supportingFacts: {
    factId: string;
    reason: string;
  }[];
  missingInformation: string[];
  requiresReview: boolean;
}
```

### 10.4 Hallucination Prevention
1. Never invent employment history, technologies, achievements, metrics, or outcomes.
2. Never invent company-specific motivations or claim ungrounded expertise.
3. If information is missing, explicitly report it and request clarification.

---

## 11. Eligibility and Legal Declarations
```typescript
interface WorkEligibility {
  country: string;
  legallyAuthorized: boolean | null;
  requiresSponsorship: boolean | null;
  remoteWorkAllowed: boolean | null;
  willingToRelocate: boolean | null;
}
```
Authorization is strictly jurisdiction-specific. Never make legal declarations on behalf of a user based on assumptions.

---

## 12. Chrome Extension Architecture
- **Chrome Manifest V3**
- Angular Side Panel UI (`index.html`)
- Content Scripts (plain TypeScript):
  - `scanner.ts`, `field-extractor.ts`, `classifier.ts`, `autofill.ts`, `form-observer.ts`
- Background Service Worker:
  - Extension lifecycle, message routing, session token storage. Never rely on in-memory global state.

---

## 13. Form Detection and Field Extraction
### Supported Elements
`input`, `textarea`, `select`, radio buttons, checkboxes, fieldsets, custom dropdowns.

### Label Detection Strategy (Priority Order)
1. Associated `<label for="...">`
2. `aria-label`
3. `aria-labelledby`
4. `placeholder`
5. `name` attribute
6. `id` attribute
7. `<fieldset>` `<legend>`
8. Nearby descriptive text / parent container text

### Dynamic Forms
Use `MutationObserver` with debouncing to detect dynamic sections and new fields without re-scanning the entire page.

---

## 14. Autofill Engine
### Framework Compatibility
Many modern sites use controlled components (React, Vue, Angular). Simply setting `element.value` does not update internal component state. The engine uses native property descriptors and dispatches bubbling events:
```typescript
element.dispatchEvent(new Event("input", { bubbles: true }));
element.dispatchEvent(new Event("change", { bubbles: true }));
```

### Autofill Rules
- Never fill passwords or CAPTCHA fields.
- Never upload files automatically.
- Never fill ambiguous sensitive fields with guessed values.
- Require user approval before filling.
- **Never submit the form automatically.**

---

## 15. ATS Support Strategy
Support generic HTML forms first, followed by specialized adapters:
- Greenhouse
- Lever
- Ashby
- Workday

```typescript
interface ATSAdapter {
  detect(): boolean;
  scanForm(): Promise<ApplicationQuestion[]>;
  extractJobContext(): Promise<JobContext | null>;
  fillField(fieldId: string, value: string): Promise<boolean>;
}
```

---

## 16. Application History and Answer Library
- **Application History**: Saves application records, questions asked, and approved answers.
- **Answer Library**: Allows saving favorite answers across categories (Introduction, Why this company, Technical challenge, etc.) for adaptive reuse.

---

## 17. User Interface
- **Main Extension Side Panel**:
  - Current Application info & status
  - Analyze Application button
  - Detected questions list with generated answers
  - Per-question Edit, Regenerate, and Copy controls
  - Fill Approved Fields action button
- **Regeneration Controls**:
  - Shorter / Longer, More natural / More formal, Emphasize specific project or skill, Custom user instruction prompt.

---

## 18. Database Design
PostgreSQL tables with Row Level Security (RLS) on all user-owned tables:
- `profiles`
- `professional_facts`
- `work_experiences`
- `projects`
- `education`
- `skills`
- `work_eligibility`
- `documents`
- `job_applications`
- `application_questions`
- `generated_answers`
- `saved_answers`
- `user_preferences`

All queries and policies verify `auth.uid() = user_id` (or `auth.uid() = id`).

---

## 19. API Design
- **Auth**: Handled by Supabase Auth; NestJS verifies JWT on every protected route.
- **Profile**: `GET/PATCH /api/v1/profile`, `GET /api/v1/profile/full`, sub-resource CRUD.
- **Document Processing**: `POST /api/v1/profile/extract`, `POST /api/v1/profile/confirm-extracted`.
- **Job Analysis**: `POST /api/v1/jobs/analyze`.
- **Answer Generation**: `POST /api/v1/answers/generate`.
- **Answer Refinement**: `POST /api/v1/answers/refine`.
- **Health**: `GET /api/v1/health`.

---

## 20. Grok API Integration
- Backend-only integration using `OpenAI` client pointing to `https://api.x.ai/v1`.
- API keys reside exclusively in server-side environment variables.

---

## 21. Prompt Engineering & Protection
- Strict anti-hallucination system prompt.
- Prompt injection defense: treat all job description text and webpage content as untrusted data, never instructions.

---

## 22. Privacy and Security
- Verify Supabase JWTs on all protected endpoints.
- RLS database isolation.
- Private Supabase Storage buckets for CVs.
- No personal data cached permanently in insecure extension storage.

---

## 23. Chrome Manifest V3
Minimal required permissions: `activeTab`, `scripting`, `storage`, `sidePanel`.

---

## 24. Monorepo Structure
```
arzi-baaz/
├── apps/
│   ├── extension/          # Angular side panel UI + Content scripts + Service worker
│   └── api/                # NestJS backend
├── packages/
│   └── contracts/          # Shared TypeScript types
├── supabase/
│   └── migrations/         # PostgreSQL schema + RLS policies
└── tests/
    ├── fixtures/           # HTML forms test fixtures
    └── integration/        # Integration test suites
```

---

## 25. Testing Strategy
- **Unit Tests**: Field extraction, question classification, fact retrieval, answer validation, auth guard.
- **Integration Tests**: Token verification, Profile CRUD, Document extraction, Grok integration, RLS isolation.
- **Browser Tests**: Playwright fixtures testing basic forms, controlled inputs, dynamic forms, radio/checkbox groups.
- **Security Tests**: Multi-user isolation verification (User A cannot access User B data).

---

## 26. Implementation Roadmap
- **Milestone 1 — Project Foundation** (✅ Done)
- **Milestone 2 — Authentication and Profile** (✅ Done)
- **Milestone 3 — CV Ingestion** (✅ Done)
- **Milestone 4 — AI Integration** (✅ Done)
- **Milestone 5 — Form Detection** (✅ Done)
- **Milestone 6 — Autofill** (✅ Done)
- **Milestone 7 — Review and Answer Library** (✅ Done — migration `002` must be applied; see `docs/m7-m8-open-items.md`)
- **Milestone 8 — ATS Compatibility** (✅ Done — Lever verified live; Greenhouse/Ashby/LinkedIn unverified; see `docs/m7-m8-open-items.md`)
- **Milestone 9 — Production Readiness** (🟡 In progress — code changes done; release inputs needed, see `docs/m9-production-readiness.md`)

---

## 27. Initial MVP Scope
- User authentication & profile creation.
- CV upload, extraction, and editable professional facts.
- Job description input & question classification.
- AI-generated answers with manual candidate review and regeneration.
- Generic form scanning and controlled text/textarea autofill.
- Manual approval before filling; **no automatic submission**.

---

## 28. Important Product Decisions
1. **Accuracy over automation**: An incorrect answer is worse than manual typing.
2. **User control**: Users review answers before filling them.
3. **Evidence-based generation**: Answers are grounded in verified professional facts.
4. **Personalization**: Answers reflect the actual job description.
5. **Privacy**: Each user's data remains strictly private.
6. **No automatic submission**: Permanent product rule.
7. **Multi-user from day one**: Never build around hardcoded developer info.
