# CLAUDE.md — API Integration Template

<!--
USAGE: Copy this file to your project root as `CLAUDE.md`.
Fill in every section with specifics for your integration.
Delete sections that don't apply, and add project-specific sections as needed.
The more specific you are, the better Claude Code will assist you.
-->

# [Project Name] — API Integration

## Project Purpose

<!-- One paragraph: what does this project do, which APIs does it integrate, and why? -->
Example: "This service wraps the Stripe and Plaid APIs to provide a unified billing and bank-account-verification layer for our mobile app. It normalizes response shapes, handles retries, and exposes a single internal REST API to the frontend."

---

## API Overview

| API | Purpose | Version | Docs |
|-----|---------|---------|------|
| [API Name] | [What it does] | v2 | [https://docs.example.com](https://docs.example.com) |
| [API Name] | [What it does] | v1 | [https://docs.example.com](https://docs.example.com) |

**Integration approach:** [SDK / raw HTTP / GraphQL client / gRPC]

**Rate-limit tier:** [Free / Growth / Enterprise — affects limits below]

---

## Authentication

**Method:** [API Key / OAuth 2.0 / JWT / mTLS / HMAC signature]

### API Key Auth (if applicable)
- Keys are stored in: [`.env.local` / AWS Secrets Manager / Vault path]
- Key format: `sk_live_...` (production), `sk_test_...` (test)
- Header name: `Authorization: Bearer <key>` or `X-API-Key: <key>`
- **Never** interpolate keys into URLs (they appear in server logs).

### OAuth 2.0 (if applicable)
- Flow: [Authorization Code / Client Credentials / PKCE]
- Token endpoint: `POST https://api.example.com/oauth/token`
- Scopes required: `read:users write:transactions`
- Token storage: [Redis with TTL matching `expires_in` / encrypted DB column]
- Refresh strategy: refresh 60 seconds before expiry; use a mutex to prevent thundering herd on refresh.

### Key Rotation
1. Generate new key in vendor dashboard.
2. Update secret in [Secrets Manager / Vault].
3. Deploy — the app picks up the new value on next cold start / secret refresh.
4. Revoke old key after confirming zero errors in logs for 10 minutes.

---

## Key Endpoints

Document only the endpoints this project actually uses. For each:

### `GET /v2/users/{id}`
**Purpose:** Fetch a single user record by vendor ID.
**Auth:** Bearer token in header.
**Request:**
```
GET /v2/users/usr_abc123
Authorization: Bearer <token>
```
**Response (200):**
```json
{
  "id": "usr_abc123",
  "email": "user@example.com",
  "created_at": "2024-01-15T10:30:00Z",
  "status": "active"
}
```
**Known quirks:** `created_at` is UTC but lacks timezone suffix in some older records — always parse as UTC.

### `POST /v2/charges`
**Purpose:** Create a payment charge.
**Idempotency:** Send `Idempotency-Key` header (UUID v4 generated per logical operation, not per retry).
**Request:**
```json
{
  "amount": 2000,
  "currency": "usd",
  "customer_id": "cus_xyz"
}
```
**Response (201):** `{ "charge_id": "ch_...", "status": "pending" }`
**Async:** Status is `pending` immediately; final state delivered via webhook (`charge.completed` / `charge.failed`).

<!-- Add more endpoints as needed -->

---

## Rate Limits

| Endpoint / Scope | Limit | Window | Notes |
|-----------------|-------|--------|-------|
| Global | 1,000 req | per minute | Shared across all API keys in org |
| `POST /charges` | 100 req | per minute | Per customer |
| `GET /reports/*` | 10 req | per minute | Heavy endpoints; cache aggressively |

### Handling 429s
- The API returns `Retry-After: <seconds>` on 429 — **always respect it**.
- Retry strategy: exponential backoff with jitter.
  - Base delay: 1s, max delay: 32s, max attempts: 5.
  - Jitter: `delay = base * 2^attempt + random(0, 1000ms)`.
- Log every 429 with the endpoint, timestamp, and `Retry-After` value.
- Expose a metric/counter so rate-limit pressure is visible in dashboards.
- Never retry non-idempotent requests (e.g., `POST /charges`) without a stable `Idempotency-Key`.

---

## Error Handling Conventions

### Error Response Shape
```json
{
  "error": {
    "code": "insufficient_funds",
    "message": "The card has insufficient funds.",
    "request_id": "req_abc123"
  }
}
```
Always log `request_id` — it's the vendor's correlation ID for support tickets.

### Error Classification

| HTTP Status | Meaning | Action |
|-------------|---------|--------|
| 400 | Bad request (our bug) | Log full request, alert dev team, do NOT retry |
| 401 | Auth failure | Check/rotate credentials, alert ops |
| 403 | Permission denied | Check OAuth scopes, do NOT retry |
| 404 | Resource not found | Return `null` to caller, not an exception |
| 409 | Conflict / duplicate | Check idempotency key logic |
| 422 | Validation error | Surface `error.message` to the user |
| 429 | Rate limited | Retry with backoff (see above) |
| 5xx | Vendor outage | Retry with backoff; open circuit after 5 consecutive failures |

### Application-Level Conventions
- Catch API errors at the **integration layer** (never bubble raw vendor errors to the frontend).
- Transform to internal error types: `ApiAuthError`, `ApiRateLimitError`, `ApiValidationError`, `ApiServerError`.
- Log with structured fields: `{ vendor, endpoint, status, error_code, request_id, duration_ms }`.
- Never log request bodies that may contain PII or payment data — log only safe fields.

---

## Data Transformation

Raw API responses are transformed into internal domain models at a single boundary (the repository/adapter layer). Do not scatter transformation logic across the codebase.

### Example: User mapping
```
Vendor `UserResource` → Internal `User`

vendor.id           → user.vendorId
vendor.email        → user.email
vendor.created_at   → user.createdAt (parsed to Date/datetime, normalized to UTC)
vendor.status       → user.isActive (boolean: "active" → true, else false)
```

### Rules
- All date strings are parsed and stored as UTC datetimes — never store raw vendor date strings.
- Monetary amounts from this API are in **cents (integer)** — never expose raw integers to the UI; format at the presentation layer.
- Unknown/null fields from the vendor are mapped to `null` in the internal model, not omitted.
- Validation of transformed data happens after transformation, before the data enters the domain.

---

## Caching Strategy

### What to Cache
| Data | TTL | Invalidation Trigger |
|------|-----|---------------------|
| User profile | 5 min | Webhook `user.updated` event |
| Product catalog | 1 hour | Manual flush or deploy |
| Exchange rates | 10 min | Time-based only |
| Auth tokens | `expires_in - 60s` | Token refresh |

### What NOT to Cache
- Payment/transaction status (always fetch fresh — stale state = money bugs)
- Any response with a `Cache-Control: no-store` header from the vendor

### Implementation
- Cache key pattern: `{service}:{resource}:{id}` e.g., `stripe:customer:cus_abc`
- Cache layer: [Redis / in-memory LRU / CDN edge cache]
- On cache miss: fetch from API, store result, return result.
- On cache error: **log and fall through to API** — never fail a request because the cache is down.
- Stampede protection: use a lock (e.g., Redis `SET NX`) when a cache miss triggers a slow API call.

---

## Testing Approach

**Rule: No test should ever hit a live production API.**

### Hierarchy (prefer the highest level available)
1. **Vendor sandbox / test environment** — use for integration tests. Credentials in `.env.test`.
2. **Recorded fixtures** — record real API responses once, replay in tests (VCR pattern / `nock` / `responses` library).
3. **Mocks** — mock the HTTP client or the integration class boundary for unit tests.

### Fixture Management
- Fixtures live in `tests/fixtures/api/{vendor}/{endpoint}/`.
- File naming: `{scenario}.json` e.g., `charge_success.json`, `charge_insufficient_funds.json`.
- Refresh fixtures when the API schema changes: `make refresh-fixtures`.
- Fixtures must never contain real API keys, PII, or production IDs.

### What to Test
- Happy path: successful response → correct internal model.
- Error paths: each HTTP error code → correct internal exception type.
- Retry logic: 429 → backoff → success on second attempt.
- Idempotency: duplicate POST with same key → single side effect.
- Transformation edge cases: null fields, unexpected enum values, malformed dates.

---

## Environment Variables

All required environment variables. The app must fail fast on startup if any `required` variable is missing.

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key (`sk_live_` in prod, `sk_test_` in dev) | `sk_test_abc123` |
| `STRIPE_WEBHOOK_SECRET` | Yes | Webhook endpoint signing secret for signature verification | `whsec_xyz` |
| `PLAID_CLIENT_ID` | Yes | Plaid client ID | `abc123` |
| `PLAID_SECRET` | Yes | Plaid secret key | `xyz789` |
| `PLAID_ENV` | Yes | Plaid environment (`sandbox` / `development` / `production`) | `sandbox` |
| `API_RATE_LIMIT_BURST` | No | Override max burst requests (default: 100) | `200` |
| `REDIS_URL` | Yes | Redis connection string for caching and rate limiting | `redis://localhost:6379` |

**Loading:** Use a validated env schema (e.g., `zod`, `pydantic`, `envalid`). Parse and validate all vars at startup; crash with a clear error message listing missing vars.

---

## Security Rules

These are non-negotiable. Flag any PR that violates them.

1. **Never log API keys or secrets** — not in debug logs, not in error messages, not in analytics events.
2. **Never expose vendor API keys to the frontend** — all vendor API calls must go through the backend.
3. **Webhook signature verification is mandatory** — always verify the signature before processing any webhook payload. Reject unsigned or invalid-signature requests with 400.
4. **Treat webhook payloads as untrusted** — validate and sanitize all fields; fetch the authoritative resource from the API rather than trusting payload data for financial operations.
5. **Rotate keys on any suspected exposure** — if a key appears in a log, a commit, or a Slack message, rotate immediately.
6. **Use least-privilege scopes** — request only the OAuth scopes the integration actually needs.
7. **Rate limit inbound requests** — prevent abuse of your API endpoints that trigger outbound vendor calls. Apply per-user and per-IP limits.
8. **Store secrets in a secrets manager** — never in `.env` files committed to the repo, never in app config files.
9. **Audit log all mutating operations** — record who triggered what, when, with what parameters (minus sensitive values).

---

## Common Patterns

### Pagination
Most list endpoints use cursor-based pagination:
```
GET /v2/charges?limit=100&starting_after=ch_lastId
```
- Fetch all pages: loop until `has_more: false`, collecting results.
- For large datasets, process page-by-page rather than accumulating everything in memory.
- Never assume a stable sort order across pages — cursors, not offsets.

### Webhooks
- Register the webhook endpoint URL in the vendor dashboard.
- Endpoint must return `200` within 5 seconds — do minimal work synchronously, enqueue heavy processing.
- Deduplicate by event ID — vendors may deliver the same event more than once.
- Replay failed webhooks: keep a log of processed event IDs (with TTL of vendor's retry window).
- Webhook event types consumed by this project: [list them here]

### Polling vs. Webhooks
- Prefer webhooks for real-time state changes (payment status, user events).
- Use polling only when: webhooks are unavailable, or as a fallback for missed events.
- Polling interval: respect vendor rate limits; exponential backoff if the resource hasn't changed.

### Idempotency
- Generate idempotency keys at the **business operation level**, not the HTTP request level.
- Key format: `{operation_type}:{stable_business_id}` e.g., `charge:order_id_abc123`.
- Store the key and the outcome — if the same key is replayed, return the stored outcome without re-calling the API.
- Idempotency keys are not the same as retry UUIDs; a retry sends the same key, a new operation gets a new key.

### Circuit Breaker
- After [N=5] consecutive failures to a vendor endpoint, open the circuit.
- While open: fail fast with a `ServiceUnavailableError`, do not call the vendor.
- After [30s] in open state, move to half-open: allow one probe request.
- If probe succeeds, close the circuit. If it fails, re-open.

---

## Session Kickoff Prompt

Use this at the start of a Claude Code session for API integration work:

```
I'm working on [project name], which integrates [API names].

Current task: [describe the specific endpoint, feature, or bug you're working on]

Key constraints:
- All vendor calls go through the adapter layer in [src/adapters/ or equivalent]
- Never call vendor APIs directly from controllers or business logic
- Errors must be caught and transformed into internal error types before propagating
- Tests use fixtures in tests/fixtures/ — don't write tests that hit live APIs
- Idempotency keys are required for all POST/mutation requests

What I need help with: [specific question or task]

Relevant files to check first:
- [src/adapters/vendor_name.ts] — the integration adapter
- [src/models/] — internal domain models
- [tests/fixtures/vendor_name/] — test fixtures
```

---

## Runbook

### Debugging a failed API call
1. Find the `request_id` in logs.
2. Check vendor status page: [https://status.example.com](https://status.example.com)
3. Reproduce in sandbox: `make sandbox-replay REQUEST_ID=req_abc123`
4. Check if the issue is auth (401), bad payload (400/422), or vendor-side (5xx).

### Adding a new endpoint
1. Add the raw HTTP call in the adapter layer.
2. Add the response type and transformation function.
3. Record a fixture: `make record-fixture ENDPOINT=/v2/new-endpoint SCENARIO=success`
4. Write tests covering success, 4xx, and 5xx cases.
5. Add the new env vars (if any) to this file and to the deployment config.

### Rotating an API key
1. Generate new key in vendor dashboard.
2. Update in [Secrets Manager path / Vault path].
3. Trigger secret refresh or redeploy.
4. Monitor error rate for 5 minutes.
5. Revoke old key.
