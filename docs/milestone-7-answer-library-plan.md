# Milestone 7 Implementation Plan: Review & Answer Library

**Date:** 2026-11-08  
**Status:** In Development Planning

---

## Context

Milestones 1-6 are complete:
- ✅ Users can detect form fields (M5)
- ✅ Users can autofill forms (M6)
- ✅ AI generates answers (M4)

**Milestone 7 solves workflow inefficiency:** Users currently generate answers for each application. With M7, they can:
1. **Review answers** before autofilling — refine or skip
2. **Save favorite answers** to personal library
3. **Reuse library answers** for similar questions
4. **Track application history** — companies, questions, answers used

---

## Goals

1. **Answer Review UI** — Display generated answers with refinement before approve/autofill
2. **Answer Library** — Persist user's best answers per category
3. **Library Suggestions** — Suggest matching library answers when similar question detected
4. **Application History** — Track completed applications with questions & approved answers
5. **Save to History** — Record successful applications

---

## Non-Goals

- Advanced answer ranking or ML similarity
- Bulk operations (save/delete multiple)
- Answer sharing between users
- Analytics on reuse patterns

---

## Constraints

1. All data user-isolated via RLS
2. Library answers searchable/filterable by category
3. Answer review happens *before* autofill (workflow gate)
4. Application history is immutable append-only
5. Works with existing answer generation (M4)

---

## Implementation Approach

### Phase 1: Backend API Endpoints (NestJS)

**New endpoints:**

1. **POST `/api/v1/answers/save-to-library`**
   - Save generated answer to user's library
   - Params: answerId, category, tags
   - Returns: SavedAnswer

2. **GET `/api/v1/answers/library`**
   - Query: category, search keyword
   - Returns: SavedAnswer[] filtered + RLS-isolated

3. **DELETE `/api/v1/answers/library/:id`**
   - Soft delete

4. **POST `/api/v1/applications/history`**
   - Save completed application record
   - Immutable append-only

5. **GET `/api/v1/applications/history`**
   - Paginated history list, RLS-isolated

### Phase 2: Database Schema

**Tables (already defined):**
- `saved_answers` — User's library answers per category
- `job_applications` — Application history records
- Both have RLS: `auth.uid() = user_id`

### Phase 3: Contract Types

Update `packages/contracts/src/answer.ts`:

```typescript
export interface SavedAnswer {
  id: string;
  answer: string;
  category: QuestionCategory;
  tags: string[];
  createdAt: string;
}

export interface ApplicationHistory {
  id: string;
  jobTitle: string;
  company: string;
  questions: ApplicationQuestion[];
  answers: GeneratedAnswer[];
  createdAt: string;
}
```

### Phase 4: Answer Review UI Component

**New:** `answer-review.component.ts`

Displays generated answers before autofill:
- Answer text, category badge, confidence
- Buttons: Edit, Refine, Save to Library, Approve, Skip
- Shows suggested library answers if available

Workflow:
1. Form detected → Fields approved
2. AI generates answers
3. **NEW:** Answer review shows each answer
4. User refines/saves/approves
5. Approved answers sent for autofill

### Phase 5: Answer Library UI Component

**New:** `answer-library.component.ts`

Browse/search saved answers:
- Category filter
- Keyword search
- List with delete option
- Copy or suggest for current question

### Phase 6: Application History UI Component

**New:** `application-history.component.ts`

View past applications:
- List: Company, Job Title, Date
- Detail: Questions, answers used
- Mark as "submitted" or "draft"

### Phase 7: Enhanced Services

**Update:** `ai-api.service.ts`

New methods:
- `saveAnswerToLibrary(answer, category, tags)`
- `getLibraryAnswers(category?)`
- `deleteLibraryAnswer(id)`
- `saveApplicationHistory(...)`
- `getApplicationHistory()`

### Phase 8: Workflow Integration

Wire answer review into `application.component.ts`:

**Current:** Detection → Generation → Autofill

**New:** Detection → Generation → **Review** → Autofill → **Save History**

---

## Critical Files to Modify

| File | Changes |
|------|---------|
| `apps/api/src/modules/answers/answers.controller.ts` | Add 5 new endpoints |
| `apps/api/src/modules/answers/answers.service.ts` | Library + history logic |
| `packages/contracts/src/answer.ts` | SavedAnswer, ApplicationHistory types |
| `apps/extension/src/app/core/services/ai-api.service.ts` | 5 new API methods |
| **NEW** answer-review.component.ts | Review UI before autofill |
| **NEW** answer-library.component.ts | Library browser |
| **NEW** application-history.component.ts | History tracker |
| `apps/extension/src/app/features/application/application.component.ts` | Integrate review |

---

## Verification

### Manual Testing
1. Generate answer for field
2. See review UI
3. Save to library
4. Go to new form
5. See library suggestions
6. Complete application
7. View in history

### Automated
- Library save/load/delete
- History immutability
- RLS isolation
- Category filtering

---

## Reusing Existing Code

✅ Answer generation (M4) unchanged
✅ Autofill engine (M6) unchanged
✅ API auth guard, RLS policies
✅ NestJS module structure, Angular patterns

