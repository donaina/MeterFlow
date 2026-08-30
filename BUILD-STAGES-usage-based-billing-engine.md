# BUILD STAGES — Usage-Based Billing & Metering Engine

Purpose: paste this alongside the PRD and NON-NEGOTIABLES as IDE/agent context. Work through stages **in order**. Do not start a later stage's functionality while an earlier stage's tests and demo aren't passing. Each stage must end in a state that is (a) tested and (b) redeployed and demoable on the VPS — not just "code exists."

## Stage discipline (read first)

- One stage = one reviewable chunk of work. Don't bundle two stages into one pass.
- A stage isn't done until its **Definition of Done** is met, including the demo script running against the VPS deployment, not just localhost.
- If a stage's non-negotiable-relevant piece (idempotency constraint, ledger balance, immutability) isn't in place yet, don't fake it with a TODO and move on — that constraint has to be real from the stage that introduces it, per NON-NEGOTIABLES.md.
- If something in a later stage turns out to require reopening an earlier stage's schema/decisions, stop and flag it rather than silently patching around it.

---

## Stage 0 — Walking Skeleton, Deployed First

**Goal:** Establish the deployment pipeline before writing real features, so every later stage is just "redeploy."

- NestJS app boots with a `/health` endpoint.
- Postgres + Redis + app wired together via Docker Compose.
- Migration tooling in place (e.g. Prisma or TypeORM migrations) — even with zero real tables yet, prove migrations run against the VPS's Postgres.
- VPS setup: Docker + Docker Compose installed, a reverse proxy (Caddy is the simplest — automatic TLS) routing a subdomain to the app container, firewall (ufw) restricting inbound to 22/80/443.
- `.env`-based config, `.env` never committed.
- Simple redeploy path documented (e.g. `git pull && docker compose up -d --build`).

**Demo (must run against the VPS, not localhost):**
```
curl https://billing.yourdomain.tld/health
→ 200 OK
```

**Definition of Done:** health check passes over the public URL with TLS; a throwaway migration can be run and rolled back; redeploy steps are written down in README.

---

## Stage 1 — Data Model & Idempotent Ingestion

**Goal:** Prove the hardest correctness property — idempotency — before anything else is built on top of it.

- Migrations for `customers`, `plans`, `subscriptions`, `usage_events` (append-only), and the idempotency mechanism (unique constraint on `event_id`, whether that lives directly on `usage_events` or a dedicated dedup table — DB-enforced either way).
- `POST /events`: validates payload, rejects negative/zero-with-bad-metadata quantities at the boundary, inserts the raw event, returns `202`.
- A retried event with the same `event_id` returns `200` and does **not** create a second row.
- A concurrency test: fire the same `event_id` twice at once, assert exactly one row lands.

**Demo (against the VPS):**
```
curl -X POST https://billing.yourdomain.tld/events -d '{"event_id":"abc123", ...}'
curl -X POST https://billing.yourdomain.tld/events -d '{"event_id":"abc123", ...}'   # same id
→ second call returns 200, DB has exactly one row for abc123
```

**Definition of Done:** duplicate and concurrent-duplicate tests pass; `usage_events` has no UPDATE/DELETE code path anywhere in the codebase.

---

## Stage 2 — Aggregation

**Goal:** Turn raw events into per-customer, per-feature, per-period usage totals, correctly, including out-of-order events.

- Worker (BullMQ) consumes events, increments a Redis counter keyed by customer/feature/period.
- Periodic flush from Redis → `usage_records` (Postgres) for durability.
- Fallback path if Redis is unavailable (direct DB write with locking, or retry queue) — no silent event loss.
- Late-event handling: an event timestamped for an already-closed period updates that period's `usage_records`, not the current one.

**Demo:** post a batch of events spanning two periods, including one deliberately "late" event for the already-closed period, and show `usage_records` reflects the correct per-period totals.

**Definition of Done:** aggregation test suite covers on-time and late events; killing Redis mid-flow doesn't lose an event (verified by a test, not just an assumption).

---

## Stage 3 — Pricing Engine

**Goal:** Prove pricing is genuinely config-driven.

- `plans.pricing_config` (JSONB) holds flat fee, free allowance, per-unit, and tiered rules.
- Pricing service: `(customer_id, feature_key, quantity, period) → cost breakdown`, implemented so a new pricing shape plugs in without touching existing call sites (strategy pattern or equivalent).
- Unit tests: exact tier boundaries, zero usage, overage past the last tier, malformed config.

**Demo:** hit a debug/pricing-preview endpoint with a given quantity under one `pricing_config`, then edit the config (via a DB update or an admin endpoint) and hit it again — show the cost changes with **no redeploy**.

**Definition of Done:** all pricing unit tests pass; the demo above is reproducible on the VPS.

---

## Stage 4 — Invoice Generation & Double-Entry Ledger

**Goal:** Close the loop from usage to a correct, immutable, balanced invoice.

- `invoices`, `invoice_line_items`, `journal_entries` tables, ledger balance invariant enforced at the point of write (a transaction that writes an invoice always writes matching debit/credit rows, or none at all).
- Invoice generation job: pulls `usage_records` for a period → pricing engine → invoice + line items → journal entries, all in one transaction.
- Finalized invoices are immutable — attempt to mutate one via any code path should fail or simply not exist.

**Demo:** simulate a fake customer's month of usage (script that posts a realistic event stream), generate the invoice, and show:
1. the invoice total matches usage × pricing config,
2. `sum(debits) == sum(credits)` in `journal_entries` for that invoice,
3. attempting to edit the finalized invoice is rejected/impossible.

**Definition of Done:** end-to-end month-of-usage test passes; ledger balance is asserted as a test invariant, not just eyeballed.

---

## Stage 5 — Hardening

**Goal:** Stress the correctness properties, not just the happy path.

- Concurrency test: many identical events fired simultaneously → no lost updates, no double-counting.
- Stretch: property-based test (fast-check) asserting invoiced total always matches what the pricing config implies, for randomized event sequences.
- Basic observability: structured logs on ingestion/aggregation/invoicing, enough to answer "why does this invoice say $X" after the fact.

**Demo:** run the full test suite (including concurrency/property tests) against CI or locally; show a log trail for one invoice from raw event to ledger entry.

**Definition of Done:** test suite is green including concurrency tests; a sample "explain this invoice" trace can be reconstructed from logs alone.

---

## Stage 6 — Docs & Public Demo Polish

**Goal:** Make the project legible and easy to evaluate by someone who's never seen it.

- `README.md`: problem statement, Mermaid architecture diagram, data model, how to run locally (Docker Compose) and how it's deployed (VPS + Caddy), sample `curl`/Postman requests, testing instructions, future enhancements, and an explicit section mapping features to the Zapier Staff Backend Engineer, Revenue job description.
- `DECISIONS.md`: one entry per major decision with the rejected alternative and why.
- Postman or Swagger collection published alongside the repo.
- VPS polish: confirm TLS auto-renewal is working (Caddy handles this by default), basic uptime check, `.env.example` committed (never the real `.env`).

**Demo:** a stranger can open the README, hit the public VPS URL with the Postman collection, and walk through ingest → aggregate → price → invoice → ledger without asking you anything.

**Definition of Done:** README and DECISIONS.md exist and are accurate; public demo works end-to-end from a cold read of the docs.
