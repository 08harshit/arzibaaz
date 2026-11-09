-- ============================================================
-- Milestone 7: answer library + application history
-- ============================================================

-- Saved answers: tags, soft delete, and the question the answer was written for
-- (used to suggest library answers for similar questions).
ALTER TABLE saved_answers
    ADD COLUMN IF NOT EXISTS tags          TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS question_text TEXT,
    ADD COLUMN IF NOT EXISTS deleted_at    TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS saved_answers_user_active_idx
    ON saved_answers (user_id, created_at DESC)
    WHERE deleted_at IS NULL;

-- Application history: draft/submitted status.
ALTER TABLE job_applications
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'submitted'));

-- History is append-only: only `status` may change after insert.
CREATE OR REPLACE FUNCTION job_applications_status_only()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.company_name IS DISTINCT FROM OLD.company_name
       OR NEW.job_title IS DISTINCT FROM OLD.job_title
       OR NEW.job_url IS DISTINCT FROM OLD.job_url
       OR NEW.applied_at IS DISTINCT FROM OLD.applied_at
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'job_applications rows are append-only; only status may change';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS job_applications_status_only_trg ON job_applications;
CREATE TRIGGER job_applications_status_only_trg
    BEFORE UPDATE ON job_applications
    FOR EACH ROW EXECUTE FUNCTION job_applications_status_only();
