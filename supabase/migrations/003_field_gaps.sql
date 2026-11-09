SET search_path = public;

-- ============================================================
-- FIELD GAPS: form fields the extension could not fill from the user's data.
-- One row per (user, normalized label, site). Drives the in-app "add it once" prompts and
-- gives developers a backlog of the most common missing fields.
-- Stores form labels only, never answers.
-- ============================================================
CREATE TABLE IF NOT EXISTS field_gaps (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    label           TEXT NOT NULL,
    label_key       TEXT NOT NULL,
    canonical_field TEXT,
    input_type      TEXT,
    host            TEXT NOT NULL DEFAULT '',
    reason          TEXT NOT NULL CHECK (reason IN ('no_answer', 'fill_failed', 'profile_missing')),
    times_seen      INTEGER NOT NULL DEFAULT 1,
    first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ,
    UNIQUE (user_id, label_key, host)
);

CREATE INDEX IF NOT EXISTS field_gaps_open_label_idx
    ON field_gaps (label_key) WHERE resolved_at IS NULL;

ALTER TABLE field_gaps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "field_gaps: users own their rows" ON field_gaps;
CREATE POLICY "field_gaps: users own their rows"
    ON field_gaps FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Developer backlog (run with the service role / SQL editor; RLS hides other users' rows from normal clients):
--
-- SELECT label_key,
--        min(label)                                        AS example_label,
--        count(DISTINCT user_id)                           AS users,
--        sum(times_seen)                                   AS times_seen,
--        mode() WITHIN GROUP (ORDER BY canonical_field)    AS canonical_field,
--        mode() WITHIN GROUP (ORDER BY reason)             AS main_reason,
--        array_agg(DISTINCT host)                          AS sites
-- FROM field_gaps
-- WHERE resolved_at IS NULL
-- GROUP BY label_key
-- ORDER BY users DESC, times_seen DESC
-- LIMIT 50;
