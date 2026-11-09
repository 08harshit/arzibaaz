# Milestone 9 — Production Readiness

Status as of 2026-11-09. The spec gives M9 no detail, so scope here is what an audit of the code
found blocking a release. Items marked **Input needed** require a decision or a value only you have.

## Done

| Area | Problem found | Fix |
|---|---|---|
| Extension loads | Manifest referenced `icons/icon16/48/128.png`, which did not exist; Chrome refuses to load an extension with a missing icon. | Added placeholder icons (`src/icons/`, regenerate with `node scripts/generate-icons.mjs`). |
| Side panel under MV3 CSP | Production `index.html` used an inline `onload` stylesheet swap, which the extension CSP blocks. | `inlineCritical: false` in the production config. Verified: no inline handlers in the built `index.html`. |
| Production config | Only a dev `environment.ts` existed, so a production build shipped `localhost:3000` and placeholder Supabase keys. | Added `environment.prod.ts` with `fileReplacements`. `npm run build` now **fails** while any `REPLACE_WITH_` value or `localhost:3000` remains in the bundle. |
| Content script / worker | `content.js` and `background.js` were never built. | esbuild step (`scripts/build-extension.mjs`) runs after the Angular build. |
| Chrome version | Side panel API needs Chrome 114+. | `minimum_chrome_version: "114"`. |
| Rate limiting | `ThrottlerModule` was registered but no guard was attached, so nothing was limited. | Global `ThrottlerGuard` (100/min/IP). AI-cost routes (`answers/generate`, `answers/refine`, `jobs/analyze`, `profile/extract`) limited to 10/min. Health check exempt. |
| CORS | Production origin was `chrome-extension://*`; the `cors` package does not support wildcards, so every production browser call would be rejected. | Pattern match on extension ids; optional `EXTENSION_ID` pins a single id. |
| HTTP hardening | No security headers; no graceful shutdown. | `helmet()` and `enableShutdownHooks()`. |
| Build noise | `types` export condition ordered after `import`. | Reordered in `packages/contracts/package.json`. |

Already in place and unchanged: JWT verification on protected routes, RLS on all user tables, env validation
at startup, Swagger disabled in production, auth token kept in `chrome.storage.session`.

## Input needed

1. **Production values** in `apps/extension/src/environments/environment.prod.ts`: API base URL, Supabase URL,
   Supabase anon key (public key only). The production build will not complete until these are set.
2. **API hosting target.** Nothing in the repo defines how the API is deployed (no Dockerfile, no CI).
   Tell me the target (e.g. Fly.io, Railway, Render, Cloud Run, a VPS) and I will add the matching setup.
   If it runs behind a reverse proxy, the throttler needs `trust proxy` set so it limits real client IPs, not the proxy.
3. **Extension id.** After the first Web Store upload (or by adding a `key` to the manifest for a stable id),
   set `EXTENSION_ID` on the API to lock CORS to that one extension.
4. **Permission model.** The manifest injects the content script on `<all_urls>` in all frames. That is what lets it work
   in cross-origin ATS iframes, but it triggers Chrome's "read and change all your data on all websites" install
   warning and extra Web Store review. The alternative is `activeTab`-only injection (cleaner warning), but `activeTab` does
   not cover cross-origin iframes, so embedded Greenhouse forms would stop working unless host permissions are
   requested at runtime. Product decision: keep `<all_urls>` or move to least privilege.
5. **Store assets.** Real icon artwork (current icons are placeholders), listing text and screenshots,
   and a **privacy policy URL** (required because the extension handles personal and employment data).
6. **Account and data deletion.** Not implemented. The spec's privacy section does not require it, but Web Store policy
   and GDPR-style expectations usually do. Decide whether to add a "delete my data" flow.

## Not reviewed

- Supabase project settings (email confirmation, password policy, storage bucket privacy) and a live RLS isolation test.
- Dependency vulnerability audit.
- Automated tests and CI, by decision.
