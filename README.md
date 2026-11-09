# ArziBaaz — Multi-User Job Application Copilot

ArziBaaz is a Chrome extension that helps job seekers complete repetitive job application forms faster using AI-powered assistance.

**Core principle: ArziBaaz assists users. It never submits applications automatically.**

---

## Monorepo Structure

```
arzi-baaz/
├── apps/
│   ├── extension/          # Angular Chrome extension (side panel UI + content scripts)
│   └── api/                # NestJS backend
├── packages/
│   └── contracts/          # Shared TypeScript types (extension ↔ API)
├── supabase/
│   └── migrations/         # PostgreSQL schema with RLS
└── tests/
    ├── fixtures/            # HTML test fixtures for Playwright
    └── integration/         # Integration tests
```

## Tech Stack

| Component         | Technology                     |
|-------------------|---------------------------------|
| Extension UI      | Angular 19 + TypeScript         |
| Extension platform| Chrome Manifest V3              |
| Content scripts   | TypeScript (no framework)       |
| Backend           | NestJS                          |
| Database          | Supabase PostgreSQL + RLS       |
| Authentication    | Supabase Auth                   |
| File storage      | Supabase Storage                |
| AI provider       | xAI Grok API (backend only)     |
| Monorepo          | pnpm workspaces                 |
| Testing           | Vitest + Playwright             |

---

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 8+
- A Supabase project
- An xAI Grok API key

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure the API

```bash
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env with your Supabase and Grok credentials
```

### 3. Apply database migrations

```bash
# Using Supabase CLI
supabase db push

# Or paste supabase/migrations/001_initial_schema.sql into the Supabase SQL editor
```

### 4. Build shared contracts

```bash
pnpm build:contracts
```

### 5. Run the API

```bash
pnpm dev:api
# API available at http://localhost:3000
# Swagger docs at http://localhost:3000/api/docs
```

### 6. Build the extension

```bash
pnpm dev:extension
# Output in apps/extension/dist/
```

### 7. Load the extension in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `apps/extension/dist/`

---

## Implementation Milestones

| Milestone | Status      | Description                                   |
|-----------|-------------|-----------------------------------------------|
| 1         | ✅ Done      | Project foundation — monorepo, contracts, API skeleton, extension scaffold |
| 2         | ✅ Done      | Authentication and profile management (Supabase Auth, multi-sub-resource CRUD, isolation tests) |
| 3         | ✅ Done      | CV ingestion and professional knowledge base (PDF/text extraction, review & confirmation flow, verified facts) |
| 4         | ✅ Done      | AI answer generation (Grok integration, job analysis, question classification, fact-grounded synthesis, refinement) |
| 5         | 🔲 Planned  | Form detection and field extraction            |
| 5         | 🔲 Planned  | Form detection and field extraction            |
| 6         | 🔲 Planned  | Autofill engine                                |
| 7         | 🔲 Planned  | Answer review UI and answer library            |
| 8         | 🔲 Planned  | ATS platform adapters (Greenhouse, Lever, Ashby) |
| 9         | 🔲 Planned  | Production readiness — security, rate limiting, deletion |

---

## Security Principles

- All protected API endpoints require a valid Supabase JWT.
- User identity is **always** derived from the verified token — never from the request body.
- Row Level Security (RLS) is enabled on all user-owned tables.
- The Grok API key lives exclusively on the backend.
- The extension never contains API keys.
- One user cannot read or modify another user's data.

---

## Development Commands

```bash
pnpm build:contracts   # Build shared type package
pnpm dev:api           # Start NestJS in watch mode
pnpm dev:extension     # Build extension in watch mode
pnpm test              # Run all tests
pnpm lint              # Lint all packages
pnpm format            # Format all files with Prettier
```

---

## Contributing

See [arzi-baaz-spec.md](./arzi-baaz-spec.md) for the full product and technical specification.
