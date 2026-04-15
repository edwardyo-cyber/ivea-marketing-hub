# Hermes iMedia Marketing Hub — Code Review & Recommendations

Reviewed: April 12, 2026

---

## Table of Contents

1. [Security (Critical)](#1-security-critical)
2. [File Size & Refactoring](#2-file-size--refactoring)
3. [Code Readability](#3-code-readability)
4. [Architecture & Data Flow](#4-architecture--data-flow)
5. [Error Handling & Reliability](#5-error-handling--reliability)
6. [Functionality & Bugs](#6-functionality--bugs)
7. [.gitignore & Repo Hygiene](#7-gitignore--repo-hygiene)
8. [Frontend Best Practices](#8-frontend-best-practices)
9. [Suggested Action Plan](#9-suggested-action-plan)

---

## 1. Security (Critical)

### 1.1 API Keys Hardcoded in Public JavaScript

**Files:** `public/app.js:6-11`, `public/location.js:7-8`

```js
const SUPABASE_URL = 'https://zmdubmumgdyuyjajjxjs.supabase.co';
const SUPABASE_KEY = 'eyJhbG...';
const MANUS_API_KEY = 'sk-95B0KGqdc-...';
```

**Problem:** These values are served to every visitor's browser. Anyone can open DevTools and copy them. The Supabase anon key grants read access (and potentially write access depending on your RLS policies). The Manus API key lets anyone make AI calls billed to your account.

**Recommendation:**
- **Supabase anon key**: This is *designed* to be public, but only if you have strict Row Level Security (RLS) policies enforced in Supabase. Verify that every table has RLS enabled and that policies restrict access by authenticated user. If RLS is not configured, this is a critical exposure.
- **Manus API key**: Move all AI calls to a server-side API route (e.g., `/api/ai`). The frontend should call your API, which calls Manus on the backend using `process.env.MANUS_API_KEY`. This key should never appear in client code.
- **Action:** Rotate the Manus API key immediately after moving it server-side. Audit your Supabase RLS policies.

### 1.2 Weak Authentication

**File:** `public/app.js:185-197`

The login system uses a 4-digit numeric code looked up against the `employees` table. There is no rate limiting, no account lockout, no session expiration, and the user object is stored as plain JSON in `localStorage`.

**Problems:**
- 4-digit PINs have only 10,000 combinations — trivially brute-forced.
- No server-side session; the client decides who it is via `localStorage`.
- `user_id` is sent with every API request, but it's just an ID the client provides — if someone guesses a valid UUID, they can impersonate that user.

**Recommendation:**
- Use Supabase Auth (email/password or magic link) for real authentication. This gives you JWT tokens, session expiration, and server-side validation.
- If PINs must stay for simplicity, add rate limiting (e.g., 5 attempts per minute per IP) on the server side and lock accounts after repeated failures.
- Validate sessions server-side with a signed token, not a client-provided `user_id`.

### 1.3 CORS Policy Is Wide Open

**File:** `api/data.js:120`

```js
res.setHeader('Access-Control-Allow-Origin', '*');
```

**Problem:** Any website can make requests to your API. If combined with a valid `user_id`, a malicious site could read/write your data.

**Recommendation:** Restrict `Access-Control-Allow-Origin` to your actual domain(s), e.g., `https://yourdomain.com`.

### 1.4 Potential SQL/PostgREST Injection in Filter Values

**File:** `api/data.js:86-98`

Filter values from the client are interpolated directly into PostgREST query strings:

```js
params.push(`${key}=eq.${val}`);
```

If `val` contains PostgREST operators or special characters, it could manipulate query behavior.

**Recommendation:** Sanitize and validate all filter keys and values before building query strings. Ensure keys only match known column names and values are properly encoded.

### 1.5 `.gitignore` Is Too Minimal

**File:** `.gitignore`

Currently only ignores `.vercel/`. Missing entries for common sensitive files.

**Recommendation:** Expand to at minimum:
```
.vercel
node_modules/
.env
.env.*
.DS_Store
*.log
```

---

## 2. File Size & Refactoring

### 2.1 `app.js` Is 7,598 Lines

This is the single biggest issue for maintainability. Every page, modal, form, helper, and event handler lives in one file. This makes it hard to:
- Find anything quickly
- Work on one feature without risk of breaking another
- Test individual pieces
- Onboard new developers

**Recommendation — Split by Page/Feature:**

A practical approach that doesn't require a build tool:

```
public/
  js/
    app.js           ← Core: auth, routing, helpers, state (~300 lines)
    pages/
      dashboard.js
      content.js
      influencers.js
      campaigns.js
      reviews.js
      seo.js
      ads.js
      competitors.js
      loyalty.js
      gifting.js
      events.js
      settings.js
      team.js
      ...
    shared/
      modal.js        ← Reusable modal/confirm logic
      forms.js        ← Shared form building patterns
      table.js        ← Shared table rendering
      charts.js       ← Chart.js wrapper
      ai.js           ← AI assistant logic
      search.js       ← Global search
      notifications.js
```

Load them with `<script>` tags or, better, adopt a simple bundler like **Vite** (zero-config, fast). This would also let you use ES modules (`import`/`export`) for proper scope isolation.

### 2.2 `location.js` Is 4,400+ Lines

Same problem as `app.js` but for the location-specific view. Apply the same splitting strategy.

### 2.3 `styles.css` at 56 KB

Consider splitting styles per page/component as well, or at minimum adding clear section comments. A CSS preprocessor (or just CSS custom properties, which you're likely already using) would help with variable management.

### 2.4 `mock-data.js` at 12,270 Lines

This file is very large and gets loaded on every page load in production.

**Recommendation:** Only load it conditionally in development, or remove it from the production build entirely. At minimum, add a guard:

```js
// In index.html, only load in dev:
if (location.hostname === 'localhost') {
  const s = document.createElement('script');
  s.src = 'mock-data.js';
  document.body.appendChild(s);
}
```

---

## 3. Code Readability

### 3.1 Global State Pollution

**File:** `public/app.js:18-25`

Seven global variables manage app state:

```js
let currentUser = null;
let currentPage = 'dashboard';
let aiMessages = [];
let notifications = [];
let chartInstances = {};
let selectedRestaurantId = null;
let restaurantLocationsCache = {};
```

Plus `$`, `$$`, `el`, `toast`, and dozens of render functions all on the global scope.

**Problem:** Any function can mutate any state at any time. No encapsulation means bugs are hard to trace.

**Recommendation:** Consolidate state into a single `AppState` object or a simple store pattern:

```js
const state = {
  user: null,
  page: 'dashboard',
  restaurantId: null,
  // ...
};
```

This makes state changes searchable (grep for `state.`) and easier to debug.

### 3.2 `$` and `$$` Override Common Conventions

```js
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
```

These shadow jQuery conventions, which could confuse developers who see `$('#foo')` and assume jQuery is in play. This is a minor style issue, but worth noting if the team grows.

### 3.3 Magic Numbers and Strings

Throughout the code, values like pipeline stages, engagement rate thresholds, toast durations (4000ms), and outlet types are hardcoded inline.

**Recommendation:** Extract to a constants object:

```js
const CONSTANTS = {
  TOAST_DURATION: 4000,
  PIPELINE_STAGES: ['prospect', 'outreach', 'negotiation', 'contracted', 'completed'],
  // ...
};
```

### 3.4 Deeply Nested Template Literals

Many render functions build HTML via template literals that go 200+ lines deep. These are hard to read, hard to debug (one missing backtick breaks everything), and easy to introduce XSS in.

**Recommendation:** When you split into modules, consider small helper functions that return HTML fragments. This keeps each template short and testable.

---

## 4. Architecture & Data Flow

### 4.1 The `db.js` Proxy Pattern Is Clever but Fragile

The Supabase-compatible proxy (`_createDbChain`) intercepts `sb.from()` calls and reroutes them through `/api/data`. This is a smart migration strategy, but:

- The chain only supports a subset of Supabase query methods (no `in`, `contains`, `is`, `not`, `textSearch`, `range`, etc.)
- The `update` chain only supports a single `.eq()` — chaining multiple filters silently drops the first.
- The `delete` chain has the same limitation.

**Recommendation:** Document which Supabase methods are supported and which aren't. Consider moving fully to the `db.*` interface (which is cleaner) and removing the proxy layer once migration is complete.

### 4.2 No Input Sanitization on `db.*` Calls

The frontend `db.js` passes user-provided data directly to `/api/data`. While the server validates the table name against a whitelist, it does not validate or sanitize the data payload itself.

**Recommendation:** Add server-side validation for data payloads — at minimum, strip unexpected fields and validate data types for critical tables (e.g., `employees`, `restaurants`).

### 4.3 N+1 Query Pattern in Sync Functions

**File:** `public/app.js` (review sync, influencer operations)

Some operations loop over items and issue one database query per item (e.g., checking for duplicate reviews one at a time).

**Recommendation:** Use batch operations. For duplicate checking, fetch all existing records in one query and check locally, or use `upsert` with a unique constraint.

### 4.4 No Caching Layer

Every page navigation re-fetches all data from the server. There is a `restaurantLocationsCache` but no general-purpose caching.

**Recommendation:** For data that changes infrequently (restaurant list, settings, team members), cache results in memory with a TTL. This reduces API calls and improves perceived performance.

---

## 5. Error Handling & Reliability

### 5.1 Inconsistent try/catch Coverage

Only ~23% of async operations are wrapped in try/catch. Many `.catch()` handlers only log to console, leaving the user with a frozen UI and no feedback.

**Recommendation:** Wrap every `await` call (especially data operations) in try/catch with user-facing error feedback via `toast()`. Create a helper:

```js
async function safeAsync(fn, fallbackMsg = 'Something went wrong') {
  try {
    return await fn();
  } catch (err) {
    console.error(err);
    toast(fallbackMsg, 'error');
    return null;
  }
}
```

### 5.2 Auth State Parsing Crash

**File:** `public/app.js:159`

```js
currentUser = JSON.parse(saved);
```

If `localStorage` contains malformed JSON (which can happen from browser extensions, manual editing, or storage corruption), this crashes the entire app.

**Recommendation:** Wrap in try/catch, and clear the corrupted value:

```js
try {
  currentUser = JSON.parse(saved);
} catch {
  localStorage.removeItem('hermes_user');
  currentUser = null;
}
```

### 5.3 Division by Zero

**File:** `public/app.js` (engagement rate calculations)

```js
const eng = ((p.likes || 0) + (p.comments || 0) + (p.saves || 0)) / p.reach * 100;
```

If `p.reach` is `0` or `null`, this produces `Infinity` or `NaN`, which will display as "Infinity%" in the UI.

**Recommendation:** Guard the division:

```js
const eng = p.reach ? (((p.likes || 0) + (p.comments || 0) + (p.saves || 0)) / p.reach * 100) : 0;
```

### 5.4 Missing Event Listener Cleanup

**File:** `public/app.js` (tab switching, re-renders)

When pages re-render, new event listeners are attached via `.onclick = ...` but old ones are never removed. Over time (many tab switches), this can cause memory leaks and duplicate handler invocations.

**Recommendation:** Either use event delegation (attach one listener to a parent container) or explicitly remove listeners before re-attaching.

---

## 6. Functionality & Bugs

### 6.1 `parseInt` Without NaN Check

**File:** `public/app.js:2075`

```js
const infId = parseInt($('#li-inf').value);
if (!infId) return toast('Select an influencer', 'error');
```

`parseInt('')` returns `NaN`, and `!NaN` is `true`, so this works by accident. But `parseInt('0')` returns `0`, and `!0` is also `true` — a valid ID of `0` would be rejected.

**Recommendation:** Use explicit validation:

```js
const infId = parseInt($('#li-inf').value);
if (isNaN(infId)) return toast('Select an influencer', 'error');
```

### 6.2 XSS Risk in Event Form Fields

**File:** `public/app.js:7513`

```js
id="ee-name" value="${ev.name}"
```

If `ev.name` contains a double quote, the HTML attribute breaks and allows attribute injection. The codebase has an `escapeHtml()` function but it's not applied consistently in form value attributes.

**Recommendation:** Audit all template literals that inject data into HTML attributes and ensure `escapeHtml()` is used consistently, especially for `value="..."`, `title="..."`, and `placeholder="..."` attributes.

### 6.3 Race Condition on Tab Switches

**File:** `public/app.js:1321`

```js
infActiveTab = btn.dataset.tab;
renderInfluencers(container);
```

`renderInfluencers` is async but not awaited. If the user clicks tabs rapidly, multiple render passes can race and the final UI state may not match the active tab.

**Recommendation:** Use a render lock or cancellation token:

```js
let renderVersion = 0;
async function renderInfluencers(container) {
  const myVersion = ++renderVersion;
  const data = await fetchData();
  if (myVersion !== renderVersion) return; // stale render
  // proceed with rendering
}
```

### 6.4 CSV Export Edge Cases

**File:** `public/app.js:116`

The CSV exporter handles basic escaping but may not handle nested objects or arrays in JSONB columns correctly, which would produce `[object Object]` in the CSV output.

**Recommendation:** Flatten or JSON.stringify nested values before CSV formatting.

---

## 7. `.gitignore` & Repo Hygiene

### 7.1 Current `.gitignore` Is Insufficient

Only `.vercel` is ignored. This means:
- `node_modules/` would be committed if someone runs `npm install` and stages everything
- `.env` files could be accidentally committed
- `.DS_Store` files from macOS will clutter the repo

**Recommended `.gitignore`:**

```gitignore
# Dependencies
node_modules/

# Environment
.env
.env.*
.env.local

# Vercel
.vercel

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*

# IDE
.vscode/
.idea/
```

### 7.2 `mock-data.js` Is Untracked

This file appears in `git status` as untracked. If it contains only development data, either:
- Add it to `.gitignore` and keep it local, or
- Commit it but ensure it's not loaded in production (see Section 2.4)

---

## 8. Frontend Best Practices

### 8.1 No Build Step

The app currently loads raw JS files directly. While this keeps things simple, it means:
- No minification (408 KB for `app.js` is sent uncompressed)
- No tree-shaking (unused code is still shipped)
- No ES module support without `<script type="module">`
- No TypeScript or linting support

**Recommendation:** Adopt **Vite** as a lightweight build tool. It requires near-zero configuration, supports hot module reload for development, and outputs optimized bundles for production. This is the single biggest improvement for developer experience.

### 8.2 CDN Dependencies Without Pinned Versions

**File:** `public/index.html:25`

Lucide Icons is loaded as `latest`, meaning the library could change without warning and break your icon rendering.

**Recommendation:** Pin all CDN dependencies to specific versions:

```html
<script src="https://unpkg.com/lucide@0.263.1/dist/umd/lucide.min.js"></script>
```

### 8.3 No Accessibility (a11y) Support

- Interactive elements (icon buttons, toggles) have no `aria-label` attributes
- No skip-navigation links for keyboard users
- Search input has no associated `<label>`
- Modals don't trap focus or have proper ARIA roles

**Recommendation:** Add `aria-label` to all icon-only buttons, `role="dialog"` and `aria-modal="true"` to modals, and `<label>` elements (or `aria-label`) for all form inputs.

### 8.4 No Loading States

When data is being fetched, the UI shows no spinner or skeleton screen. Users may think the app is broken during slow loads.

**Recommendation:** Add a simple loading indicator to the `#page-content` container while data loads.

---

## 9. Suggested Action Plan

### Phase 1 — Security (Do Immediately)

| # | Task | Effort |
|---|------|--------|
| 1 | Move `MANUS_API_KEY` to a server-side `/api/ai` route | Small |
| 2 | Rotate the exposed Manus API key | Trivial |
| 3 | Audit Supabase RLS policies for every table | Medium |
| 4 | Restrict CORS to your actual domain | Trivial |
| 5 | Expand `.gitignore` | Trivial |
| 6 | Add rate limiting to login endpoint | Small |

### Phase 2 — Reliability (Next Sprint)

| # | Task | Effort |
|---|------|--------|
| 7 | Wrap all async operations in try/catch with user feedback | Medium |
| 8 | Fix division-by-zero in engagement calculations | Trivial |
| 9 | Fix `JSON.parse` crash on corrupt localStorage | Trivial |
| 10 | Audit all template literals for consistent `escapeHtml()` | Medium |
| 11 | Pin CDN dependency versions | Trivial |

### Phase 3 — Refactoring (Planned Work)

| # | Task | Effort |
|---|------|--------|
| 12 | Split `app.js` into per-page modules | Large |
| 13 | Split `location.js` similarly | Large |
| 14 | Extract reusable modal/form/table patterns | Medium |
| 15 | Consolidate global state into a state object | Medium |
| 16 | Add Vite (or similar) as a build tool | Medium |
| 17 | Conditionally load `mock-data.js` only in dev | Small |

### Phase 4 — Quality of Life

| # | Task | Effort |
|---|------|--------|
| 18 | Add loading spinners/skeletons | Small |
| 19 | Add accessibility attributes | Medium |
| 20 | Implement client-side data caching | Medium |
| 21 | Replace N+1 queries with batch operations | Medium |
| 22 | Add event delegation to prevent listener leaks | Medium |

---

*Generated by Claude Code — review with your team and prioritize based on your timeline and risk tolerance.*
