-- ArziBaaz Database Schema — Migration 001
-- Milestone 1: Core tables with Row Level Security
-- Apply to your Supabase project via the Supabase CLI or dashboard SQL editor.

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name   TEXT,
    email       TEXT,
    phone       TEXT,
    location    TEXT,
    country     TEXT,
    linkedin_url TEXT,
    github_url  TEXT,
    portfolio_url TEXT,
    headline    TEXT,
    summary     TEXT,
    current_status TEXT CHECK (
        current_status IN ('employed', 'unemployed', 'freelancing', 'student')
    ),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles: users own their row"
    ON profiles FOR ALL
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- ============================================================
-- PROFESSIONAL FACTS
-- ============================================================
CREATE TABLE IF NOT EXISTS professional_facts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    category    TEXT NOT NULL CHECK (
        category IN ('skill', 'achievement', 'responsibility', 'project', 'experience', 'education', 'preference')
    ),
    content     TEXT NOT NULL,
    source      TEXT NOT NULL CHECK (
        source IN ('cv', 'manual', 'portfolio', 'github', 'user_confirmed')
    ),
    confidence  NUMERIC(4,3) CHECK (confidence BETWEEN 0 AND 1),
    verified    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE professional_facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "professional_facts: users own their rows"
    ON professional_facts FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- WORK EXPERIENCES
-- ============================================================
CREATE TABLE IF NOT EXISTS work_experiences (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    company         TEXT NOT NULL,
    role            TEXT NOT NULL,
    employment_type TEXT,
    start_date      TEXT,
    end_date        TEXT,
    is_current      BOOLEAN NOT NULL DEFAULT FALSE,
    responsibilities TEXT[] NOT NULL DEFAULT '{}',
    technologies    TEXT[] NOT NULL DEFAULT '{}',
    achievements    TEXT[] NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE work_experiences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "work_experiences: users own their rows"
    ON work_experiences FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- PROJECTS
-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT NOT NULL,
    technologies    TEXT[] NOT NULL DEFAULT '{}',
    responsibilities TEXT[] NOT NULL DEFAULT '{}',
    challenges      TEXT[],
    solutions       TEXT[],
    outcomes        TEXT[],
    project_url     TEXT,
    github_url      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "projects: users own their rows"
    ON projects FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- EDUCATION
-- ============================================================
CREATE TABLE IF NOT EXISTS education (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    institution     TEXT NOT NULL,
    degree          TEXT NOT NULL,
    field_of_study  TEXT,
    start_date      TEXT,
    end_date        TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE education ENABLE ROW LEVEL SECURITY;

CREATE POLICY "education: users own their rows"
    ON education FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- SKILLS
-- ============================================================
CREATE TABLE IF NOT EXISTS skills (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    years       NUMERIC(4,1),
    proficiency TEXT CHECK (proficiency IN ('beginner', 'intermediate', 'advanced', 'expert')),
    verified    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "skills: users own their rows"
    ON skills FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- WORK ELIGIBILITY
-- ============================================================
CREATE TABLE IF NOT EXISTS work_eligibility (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    country                 TEXT NOT NULL,
    legally_authorized      BOOLEAN,
    requires_sponsorship    BOOLEAN,
    remote_work_allowed     BOOLEAN,
    willing_to_relocate     BOOLEAN,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, country)
);

ALTER TABLE work_eligibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY "work_eligibility: users own their rows"
    ON work_eligibility FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- DOCUMENTS (CV storage references)
-- ============================================================
CREATE TABLE IF NOT EXISTS documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type            TEXT NOT NULL CHECK (type IN ('cv', 'cover_letter', 'portfolio', 'other')),
    storage_path    TEXT NOT NULL,
    original_name   TEXT,
    mime_type       TEXT,
    extracted_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "documents: users own their rows"
    ON documents FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- JOB APPLICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS job_applications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    company_name    TEXT,
    job_title       TEXT,
    job_url         TEXT,
    applied_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_applications: users own their rows"
    ON job_applications FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- GENERATED ANSWERS
-- ============================================================
CREATE TABLE IF NOT EXISTS generated_answers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    application_id      UUID REFERENCES job_applications(id) ON DELETE SET NULL,
    question_text       TEXT NOT NULL,
    category            TEXT,
    answer              TEXT NOT NULL,
    confidence          NUMERIC(4,3) CHECK (confidence BETWEEN 0 AND 1),
    supporting_facts    JSONB NOT NULL DEFAULT '[]',
    missing_information TEXT[] NOT NULL DEFAULT '{}',
    requires_review     BOOLEAN NOT NULL DEFAULT TRUE,
    approved_by_user    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE generated_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "generated_answers: users own their rows"
    ON generated_answers FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- SAVED ANSWERS
-- ============================================================
CREATE TABLE IF NOT EXISTS saved_answers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    category    TEXT,
    title       TEXT NOT NULL,
    content     TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE saved_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saved_answers: users own their rows"
    ON saved_answers FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- USER PREFERENCES
-- ============================================================
CREATE TABLE IF NOT EXISTS user_preferences (
    user_id                 UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    answer_length           TEXT NOT NULL DEFAULT 'medium'
                            CHECK (answer_length IN ('short', 'medium', 'detailed')),
    answer_tone             TEXT NOT NULL DEFAULT 'natural_professional'
                            CHECK (answer_tone IN ('natural_professional', 'formal', 'conversational', 'confident')),
    answer_style            TEXT NOT NULL DEFAULT 'first_person'
                            CHECK (answer_style IN ('first_person', 'bullet_points', 'paragraph')),
    additional_instructions TEXT,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_preferences: users own their row"
    ON user_preferences FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
