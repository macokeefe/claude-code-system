# CLAUDE.md Starter Template
#
# HOW TO USE THIS FILE:
# 1. Copy this file to the root of your project and rename it CLAUDE.md
# 2. Fill in every section marked with [PLACEHOLDER] or [TODO]
# 3. Delete these instruction comments before committing
# 4. The more specific you are, the better Claude Code will perform
#
# WHY THIS MATTERS:
# Claude Code reads CLAUDE.md at the start of every session. It is your
# standing instruction set — your contract with the AI. A great CLAUDE.md
# eliminates repetitive corrections, enforces your standards automatically,
# and gives Claude the context it needs to make good decisions without asking.
#
# Keep it honest. If the project is a mess, say so. If there are landmines,
# document them. Claude works best with accurate context, not aspirational docs.

---

# [PROJECT NAME]

<!-- One sentence. What does this project do and who is it for? -->
[TODO: e.g., "A B2B SaaS dashboard that helps logistics teams track shipment KPIs in real time."]

## Project Overview

<!-- 3–5 sentences covering: what the product does, current state (v0.1? production?),
     who the users are, and any critical constraints Claude must know about. -->

**What it does:** [TODO]

**Current state:** [TODO — e.g., "Early-stage MVP. Core features are working but tests are sparse."]

**Users:** [TODO — e.g., "Internal ops team, ~20 people. Not public-facing yet."]

**Critical constraints:** [TODO — e.g., "Must support IE11. PII must never be logged. Free tier of Render — no background workers."]

---

## Tech Stack

<!-- Be specific. Version numbers matter. Vague entries produce vague code. -->

| Layer        | Technology                        |
|--------------|-----------------------------------|
| Language     | [e.g., TypeScript 5.4]            |
| Framework    | [e.g., Next.js 14 (App Router)]   |
| Styling      | [e.g., Tailwind CSS 3.4]          |
| Database     | [e.g., PostgreSQL 15 via Supabase]|
| ORM          | [e.g., Prisma 5]                  |
| Auth         | [e.g., Clerk]                     |
| Testing      | [e.g., Vitest + Playwright]       |
| Deployment   | [e.g., Vercel (prod), Render (staging)] |
| Package Mgr  | [e.g., pnpm]                      |

**Avoid introducing:** [TODO — e.g., "No new UI libraries. We use shadcn/ui exclusively. Do not add Chakra, MUI, or Radix directly."]

---

## Key Files

<!-- The first files Claude should read to understand the codebase.
     List them in order of importance. Paths relative to project root. -->

Read these before making any changes:

1. `README.md` — project setup and local dev instructions
2. `[src/lib/db.ts]` — database client and connection config
3. `[src/types/index.ts]` — shared TypeScript types
4. `[src/lib/auth.ts]` — authentication helpers and session logic
5. `[prisma/schema.prisma]` — full data model
6. `[.env.example]` — all required environment variables

**Landmines / gotchas:** [TODO — e.g., "The `users` table has a soft-delete pattern. Never use hard deletes. Always filter by `deleted_at IS NULL`."]

---

## Coding Standards

<!-- These are your non-negotiables. Claude will follow these exactly.
     Be explicit — "clean code" means nothing; "4-space indent, no semicolons" does. -->

### Style

- **Indentation:** [e.g., 2 spaces, no tabs]
- **Semicolons:** [e.g., yes / no]
- **Quotes:** [e.g., single quotes in JS/TS, double in JSX attributes]
- **Line length:** [e.g., 100 chars max]
- **Formatter:** [e.g., Prettier with config in `.prettierrc`]
- **Linter:** [e.g., ESLint with config in `.eslintrc.json`]

### Naming Conventions

- **Files/Folders:** [e.g., `kebab-case` for files, `PascalCase` for React components]
- **Variables/Functions:** [e.g., `camelCase`]
- **Types/Interfaces:** [e.g., `PascalCase`, prefix interfaces with `I` — or don't]
- **Constants:** [e.g., `SCREAMING_SNAKE_CASE`]
- **Database columns:** [e.g., `snake_case`]

### Patterns to Follow

- [e.g., Use server actions for all mutations, never client-side fetch to API routes]
- [e.g., All errors must be caught and surfaced to the user with a toast — never swallowed silently]
- [e.g., Every new component gets a co-located `.test.tsx` file]
- [e.g., Use `zod` for all input validation — no manual type guards]
- [e.g., Prefer composition over inheritance]

### Patterns to Avoid

- [e.g., No `any` types. Use `unknown` and narrow properly.]
- [e.g., No inline styles. Tailwind or nothing.]
- [e.g., No `console.log` in committed code. Use the project logger at `src/lib/logger.ts`.]
- [e.g., No direct DOM manipulation in React components.]

---

## Workflow

<!-- How Claude should approach tasks. This is the methodology section.
     Customize the steps to match how your team actually works. -->

For every task, follow this sequence. Do not skip steps.

### 1. Read First
Before writing any code, read the relevant files. Understand what already exists. Look for:
- Existing utilities that solve the problem
- Patterns used elsewhere in the codebase
- Potential conflicts or dependencies

### 2. State Your Plan
Before writing code, write a brief plan in plain English:
- What you're going to build or change
- Which files will be created or modified
- Any tradeoffs or risks

Wait for confirmation before proceeding if the change is large or destructive.

### 3. Build Incrementally
- Make the smallest change that delivers value
- One concern per commit
- Don't refactor while adding a feature (separate PRs)

### 4. Verify
- Run the relevant tests after every change
- If tests don't exist, write them
- Check for TypeScript errors before calling a task done

### 5. Report Back
When done, summarize:
- What was built
- What files were changed
- Any known limitations or follow-up tasks

---

## Common Commands

<!-- Fill in the exact commands for this project. Claude will use these. -->

```bash
# Install dependencies
[e.g., pnpm install]

# Run development server
[e.g., pnpm dev]

# Run tests
[e.g., pnpm test]

# Run tests in watch mode
[e.g., pnpm test:watch]

# Run end-to-end tests
[e.g., pnpm test:e2e]

# Type check
[e.g., pnpm typecheck]

# Lint
[e.g., pnpm lint]

# Format
[e.g., pnpm format]

# Build for production
[e.g., pnpm build]

# Run database migrations
[e.g., pnpm prisma migrate dev]

# Seed the database
[e.g., pnpm db:seed]

# Deploy (staging)
[e.g., git push origin staging]

# Deploy (production)
[e.g., pnpm deploy:prod]
```

---

## Session Kickoff Prompt

<!-- Copy-paste this at the start of every new Claude Code session.
     It orients Claude immediately without you having to re-explain context.
     Customize the [PLACEHOLDERS] to match your project. -->

```
Read CLAUDE.md and then read the key files listed in the Key Files section.

Once you've done that, here's what I need today:

[DESCRIBE YOUR TASK]

Before writing any code, confirm:
1. Which files you plan to touch
2. Your approach at a high level
3. Any questions you have before starting

Then wait for my go-ahead.
```

---

## The 5-Prompt Methodology

<!-- Reference guide for the five high-leverage prompt types.
     Use these as starting points — adapt them to your task. -->

### 1. Kickoff Prompt
Use at the start of any new feature or task.
```
Read CLAUDE.md and [relevant files].

I need to build [FEATURE]. Here's the spec:
[SPEC OR USER STORY]

Before writing code, give me your implementation plan: what you'll build,
which files you'll touch, and any concerns. Wait for approval before starting.
```

### 2. Debug Prompt
Use when something is broken.
```
Something is broken. Here's what's happening:

**Expected behavior:** [WHAT SHOULD HAPPEN]
**Actual behavior:** [WHAT IS HAPPENING]
**Error message:** [PASTE FULL ERROR]
**Steps to reproduce:** [HOW TO TRIGGER IT]

Read the relevant files and diagnose the root cause before proposing a fix.
Don't guess — explain your reasoning.
```

### 3. Code Review Prompt
Use before merging any significant change.
```
Review this code before I merge it. Look for:
- Logic errors or edge cases I missed
- Security issues (injection, auth bypass, data exposure)
- Performance problems
- Violations of the coding standards in CLAUDE.md
- Missing error handling

[PASTE CODE OR REFERENCE FILE]

Be direct. If something is wrong, say so and explain why.
```

### 4. Refactor Prompt
Use to clean up existing code without changing behavior.
```
Refactor [FILE/FUNCTION] to improve [readability / performance / maintainability].

Constraints:
- Do not change the external interface or behavior
- Do not add new features
- Follow the patterns in CLAUDE.md

Show me a diff of what you'd change and explain each change before applying it.
```

### 5. Feature from Spec Prompt
Use when you have a written spec and need code from it.
```
Build this feature from the spec below.

[PASTE SPEC]

Before building:
1. Flag any ambiguities in the spec
2. List the files you'll create or modify
3. Confirm the approach matches our tech stack and coding standards

Only start building after I confirm.
```

---

## Out of Scope

<!-- Things Claude must NEVER do without explicit written permission.
     This is your safety fence. Be specific about what requires a human decision. -->

Claude must not do any of the following without explicit permission in the current session:

- **Delete data** — no `DROP TABLE`, `DELETE FROM`, or destructive migrations
- **Push to production** — no `git push origin main` or deployment commands
- **Modify authentication logic** — auth changes require human review
- **Change environment variables or secrets** — never edit `.env` files in production
- **Install new dependencies** — all new packages require team approval before adding to `package.json`
- **Modify billing or payment code** — any Stripe or payment logic is off-limits without explicit sign-off
- **Send emails or notifications** — do not trigger real sends in development; use test mode
- **Access external APIs with real credentials** — use sandbox/test keys unless told otherwise
- **Refactor while building features** — keep concerns separate across PRs
- **Merge or resolve conflicts autonomously** — always surface conflicts for human resolution

---

<!-- END OF TEMPLATE

     Once you've filled this in, delete all the comment blocks (<!-- ... -->)
     and the instruction header at the top. What remains should be a clean,
     scannable document that Claude can act on immediately.

     Revisit this file whenever the project significantly changes.
     A stale CLAUDE.md is worse than no CLAUDE.md.
-->
