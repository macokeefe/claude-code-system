# CLAUDE.md — SaaS Project Guide

<!--
USAGE: Drop this file in your project root as `CLAUDE.md`.
Claude Code reads it automatically at the start of every session.
Customize every section for your specific product before using.
Replace all placeholder text in [brackets] with your actual details.
-->

## Product Description

**Product:** [Your SaaS Name]
**What it does:** [One sentence: e.g., "Automated invoice reconciliation for e-commerce brands."]
**Who it's for:** [Target user: e.g., "Finance teams at DTC brands doing $1M–$50M ARR."]
**Core value prop:** [What pain does it solve: e.g., "Eliminates 8 hours/week of manual spreadsheet work by auto-matching Stripe payouts to QuickBooks entries."]
**Pricing model:** [e.g., Flat $99/mo, usage-based, per-seat]
**Current stage:** [e.g., Private beta, 12 paying customers]

---

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js 14 (App Router) | TypeScript, Tailwind CSS |
| UI Components | shadcn/ui | Do not install competing component libraries |
| Backend | Next.js API Routes + tRPC | Type-safe end-to-end |
| Database | PostgreSQL via Supabase | Row-level security enabled |
| ORM | Prisma | Schema-first, migrations required |
| Auth | Clerk | JWT-based, middleware handles protection |
| Payments | Stripe | Subscriptions + webhooks |
| Email | Resend | Transactional only |
| File Storage | Supabase Storage | Signed URLs for private assets |
| Background Jobs | [Inngest / Trigger.dev / cron] | Async processing |
| Hosting | Vercel | Preview deployments per PR |
| Monitoring | [Sentry / Axiom / Datadog] | Error tracking + logs |

**Never introduce a new dependency without flagging it.** Ask before adding any package not already in `package.json`.

---

## Key Files

```
/
├── CLAUDE.md                        # This file
├── prisma/
│   └── schema.prisma                # Source of truth for data model — read this first
├── src/
│   ├── middleware.ts                 # Clerk auth — protects all /app/* routes
│   ├── app/
│   │   ├── (marketing)/             # Public pages (no auth)
│   │   ├── (app)/                   # Authenticated app shell
│   │   │   ├── layout.tsx           # App layout with nav/sidebar
│   │   │   └── [feature]/
│   │   │       ├── page.tsx         # Server component entry
│   │   │       └── _components/     # Feature-scoped client components
│   │   └── api/
│   │       ├── trpc/[trpc]/         # tRPC handler
│   │       └── webhooks/
│   │           └── stripe/          # Stripe webhook handler — DO NOT MODIFY without testing
│   ├── server/
│   │   ├── db.ts                    # Prisma client singleton
│   │   ├── auth.ts                  # Clerk server helpers
│   │   └── routers/                 # tRPC routers, one per domain
│   ├── lib/
│   │   ├── stripe.ts                # Stripe client + helpers
│   │   └── utils.ts                 # Shared utilities
│   └── components/
│       └── ui/                      # shadcn/ui components — do not edit directly
└── .env.local                       # Never commit. See Deployment Notes for required vars.
```

---

## Architecture

**Request flow:**
1. Browser → Next.js middleware (Clerk auth check)
2. Server component fetches data via tRPC server caller (no HTTP round-trip)
3. Client components call tRPC procedures via React Query hooks
4. tRPC procedures call Prisma → Postgres

**Multi-tenancy model:**
- Every resource belongs to an `Organization` (Clerk org)
- Every DB query MUST filter by `organizationId` — this is enforced by RLS but also done explicitly in queries as a defense-in-depth measure
- Users can belong to multiple organizations; always derive `organizationId` from Clerk session, never from request body

**Stripe integration:**
- Subscription status is cached in the `Organization` table (`stripeCustomerId`, `subscriptionStatus`, `currentPeriodEnd`)
- The webhook handler at `/api/webhooks/stripe` is the ONLY place that updates subscription status
- Feature gates check `organization.subscriptionStatus === 'active'`

---

## Feature Development Workflow

Follow this sequence every time. Do not skip steps.

1. **Read the schema** — Open `prisma/schema.prisma` before touching any data-related code. Understand the existing models, relations, and field names.

2. **Check existing patterns** — Find a similar feature already built. Match its file structure, naming, and patterns exactly. Use `grep` to find examples.

3. **Plan before coding** — Write out:
   - What DB changes are needed (if any)
   - What tRPC procedures are needed
   - What components are needed
   - Any edge cases (empty states, error states, loading states)

4. **Confirm the plan** — State the plan and wait for approval before writing code. Flag any ambiguity now.

5. **Build in order:**
   - DB migration (if needed) → run `npx prisma migrate dev --name [name]`
   - tRPC router + procedures
   - Server component (data fetching)
   - Client components (interactivity)
   - Loading/error/empty states

6. **Test before declaring done** — Run through the manual test checklist (see Testing Requirements).

---

## API Conventions

**We use tRPC** for all internal API calls. Raw Next.js API routes are only for:
- Stripe webhooks (`/api/webhooks/stripe`)
- OAuth callbacks
- Any third-party integration that requires a plain HTTP endpoint

**tRPC conventions:**
- One router file per domain: `users.ts`, `invoices.ts`, `billing.ts`
- All procedures that read or write org data start with: `const { organizationId } = await requireOrg(ctx)`
- Use `protectedProcedure` for anything requiring auth — never `publicProcedure` for data
- Zod schemas for all inputs, defined in the same file as the router
- Return plain objects; do not return Prisma model instances directly

**Error handling:**
- Throw `TRPCError` with appropriate codes: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `BAD_REQUEST`
- User-facing error messages go in the `message` field — keep them human-readable
- Log the underlying error server-side before throwing

**Auth middleware pattern:**
```typescript
// Every protected route — no exceptions
const { userId, organizationId } = await requireOrg(ctx);
// Then fetch the resource and verify it belongs to this org
const item = await db.item.findUniqueOrThrow({ where: { id: input.id, organizationId } });
```

---

## Database Conventions

**Migrations:**
- Every schema change requires a Prisma migration: `npx prisma migrate dev --name [descriptive-name]`
- Never edit migration files after they are committed
- Never use `prisma db push` in production — migrations only
- Migration names use snake_case and describe the change: `add_invoice_status_index`

**Naming:**
- Tables: plural snake_case (`invoices`, `stripe_events`)
- Columns: camelCase in Prisma schema (maps to snake_case in DB via `@map`)
- Foreign keys: `[table]Id` (e.g., `organizationId`, `userId`)
- Timestamps: every table has `createdAt` and `updatedAt` (use `@updatedAt`)
- Soft deletes: use `deletedAt DateTime?` — do NOT use hard deletes for user data

**Indexes:**
- Always index foreign keys
- Add indexes for any column used in a `WHERE` clause across a large table
- Add composite indexes for common query patterns: `@@index([organizationId, status])`

**Idempotency:**
- Stripe events: store `stripeEventId` with `@unique` to prevent double-processing
- Background jobs: design all handlers to be safely re-runnable

---

## Testing Requirements

The following MUST be tested before any PR is merged:

**Auth flows:**
- [ ] Unauthenticated user is redirected to login
- [ ] Authenticated user cannot access another org's data (test with two test orgs)
- [ ] Org member with wrong role cannot perform restricted actions

**Payment flows:**
- [ ] New subscription activates features immediately after webhook
- [ ] Cancelled subscription revokes access after `currentPeriodEnd`
- [ ] Failed payment puts account in grace period, not hard lock
- [ ] Stripe webhook rejects invalid signatures
- [ ] Duplicate webhook events are idempotent

**Core feature smoke tests:**
- [ ] Happy path works end-to-end
- [ ] Empty state renders (no data)
- [ ] Error state renders (simulate API failure)
- [ ] Form validation rejects invalid input

**Run before committing:**
```bash
npx tsc --noEmit        # Type check
npx eslint src/         # Lint
npx jest --passWithNoTests   # Unit tests
```

---

## Deployment Notes

**Required environment variables:**

```bash
# Database
DATABASE_URL=                    # Supabase connection string (pooled)
DIRECT_URL=                      # Supabase direct connection (for migrations)

# Auth
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=            # For Clerk webhook events

# Payments
STRIPE_SECRET_KEY=               # sk_live_... in production
STRIPE_WEBHOOK_SECRET=           # whsec_... from Stripe dashboard
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Email
RESEND_API_KEY=

# App
NEXT_PUBLIC_APP_URL=             # Full URL: https://app.yourproduct.com
```

**Deployment checklist:**
- [ ] All env vars set in Vercel dashboard (not just `.env.local`)
- [ ] Stripe webhook endpoint registered for the production domain
- [ ] Clerk webhook endpoint registered for the production domain
- [ ] Database migrations run: `npx prisma migrate deploy`
- [ ] Stripe products and prices created in production mode (not test mode)
- [ ] Smoke test auth, signup, and a payment in production before announcing

**Branch strategy:**
- `main` → production (auto-deploys to Vercel)
- `dev` → staging
- Feature branches → preview deployments (safe for QA)

---

## Security Rules

Claude MUST follow these rules without exception:

1. **Never log secrets.** No `console.log(req.headers)`, no logging of webhook payloads that include raw Stripe events.

2. **Never skip auth checks.** Every tRPC procedure that touches data uses `requireOrg()`. No exceptions, not even for "internal" endpoints.

3. **Never trust user input for organizationId.** Always derive `organizationId` from the verified Clerk session. If a client sends an `organizationId` in a request body, ignore it.

4. **Never expose internal errors to clients.** Catch errors, log them server-side, throw a generic `TRPCError` to the client.

5. **Never hard-delete billing records.** Invoices, subscriptions, and payment history are soft-deleted only.

6. **Never commit secrets.** `.env.local` is gitignored. If a secret appears in code, flag it immediately.

7. **Always verify Stripe webhook signatures.** Use `stripe.webhooks.constructEvent()` — do not process events without signature verification.

8. **Never expose Stripe secret key to the client.** Only `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` goes to the browser.

9. **Always scope database queries to the current org.** Every query on a multi-tenant resource must include `organizationId` in the `where` clause.

10. **Never modify shadcn/ui files in `src/components/ui/`.** Extend or wrap them instead.

---

## Session Kickoff Prompt

Use this at the start of a new Claude Code session:

```
Read CLAUDE.md fully before we start.

Today I'm working on: [feature name or bug description]

Context:
- [Any relevant recent changes or decisions]
- [Which part of the codebase this touches]
- [Any constraints I'm working within]

Before writing any code:
1. Read prisma/schema.prisma
2. Find the most similar existing feature and read those files
3. Propose a plan with the specific files you'll create or modify
4. Wait for my approval

Known gotchas for this session:
- [e.g., "The invoices router is being refactored — check with me before touching it"]
- [e.g., "We're mid-migration to the new billing model — old code uses planId, new code uses priceId"]
```

---

*Last updated: [date] by [author]*
*Stack version: Next.js 14, Prisma 5, Clerk 5, Stripe API 2024-06-20*
