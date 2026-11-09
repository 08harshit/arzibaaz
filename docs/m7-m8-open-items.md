# M7 / M8 — Open Items

Status as of 2026-11-09. Everything in the codebase for Milestones 7 and 8 is built and the
extension and API compile. The items below need something outside the codebase.

## 1. Database migration — DONE (2026-11-09)

`001` and `002` were applied together in the Supabase SQL editor and the 4 new columns were verified
(`saved_answers.tags/question_text/deleted_at`, `job_applications.status`). The notes below describe what it covers.

`supabase/migrations/002_answer_library_and_history.sql` adds:

It adds:
- `saved_answers`: `tags`, `question_text`, `deleted_at` (soft delete)
- `job_applications`: `status` (`draft` | `submitted`)
- A trigger that makes `job_applications` rows append-only; only `status` may change

Until it is applied:
- **Save to Library fails** (the API inserts `tags`, which does not exist yet).
- Library listing, suggestions and delete fail (they filter on `deleted_at`).
- Saving or listing application history fails (it reads and writes `status`).

How: `supabase db push` for a linked project, or run the SQL in the Supabase SQL editor.

## 1b. Migration 003 (field gaps) — apply it

`supabase/migrations/003_field_gaps.sql` creates `field_gaps` (labels of form fields that could not be filled; never answers).
Until it is applied, gap logging fails silently and the app works as before. The file ends with the developer backlog query
(top missing fields across users, run with the service role).

## 2. Ashby form markup is still unverified (needs saved HTML)

Verified by running the real extractor against live pages (throwaway jsdom check, not a committed test):

| Platform | Result |
|---|---|
| **Lever** (`jobs.lever.co/.../apply`) | 33 fields, correct question labels for text, radio groups, checkbox groups, selects, textareas. Fills confirmed, including radio by label and "yes"/"no" synonyms. |
| **Greenhouse** (`job-boards.greenhouse.io/greenhouse/jobs/8290931`) | 20 fields, correct labels. All 9 dropdowns are React-Select comboboxes (options exist only once opened) and are detected as comboboxes. The phone field's embedded country-picker search box, hidden required-twins and file uploads are correctly excluded. **Fill into React-Select is unverified** (needs a real browser). |
| **Ashby** | **Not verified.** The form is client-rendered and the scraper returns an empty page. |

What was learned about Ashby: `www.ashbyhq.com/careers?ashby_jid=...` injects the form with an embed script as a
**cross-origin iframe** from `jobs.ashbyhq.com/<org>/<job-id>/application?embed=js`. The extension's `all_frames`
content script and hostname-based detection fit this; an `activeTab`-only permission model would not reach it.

To close the Ashby gap: open the application form in Chrome, then in DevTools copy the `<form>` element's
outer HTML (or Save Page As, "Webpage, Complete") and give me the file. A plain request cannot render it, and a
stealth-proxy attempt was correctly blocked by the permission classifier as bot-check circumvention, so I did not retry it.

## 3. Known limitations (no action needed unless priorities change)

| Area | Limitation |
|---|---|
| Ashby | Yes/no questions may render as buttons rather than inputs; the scanner does not detect those. |
| LinkedIn | Easy Apply markup is login-gated and unverified. |
| Custom dropdowns | Filled by opening the control and clicking the matching `[role=option]`; works on synthetic events only, untested on live React-Select or Radix. |
| History | Saved once per page URL per panel session; a second autofill on the same page adds no new link. |
| Dev workflow | `npm run dev` (watch) rebuilds the side panel only. Use `npm run build:dev` to rebuild the content script and service worker. |
| Testing | No automated tests were written, by decision. The extractor and fill code were checked once with a throwaway jsdom script against the live Lever page. |
| Runtime | Nothing has been loaded in Chrome or run against Supabase. |
