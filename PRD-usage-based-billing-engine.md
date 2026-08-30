# PRD — Usage-Based Billing & Metering Engine

**Project type:** Portfolio project (Staff Backend Engineer, Revenue — Zapier positioning)
**Owner:** Ayoola
**Status:** Draft v1.0

---

## 1. Problem Statement

SaaS products increasingly charge based on consumption (API calls, tasks run, emails sent, credits used) rather than flat seats alone. This requires infrastructure that can:

- Ingest usage events reliably, at volume, without losing or double-counting them.
- Aggregate raw events into meaningful usage totals per customer, per feature, per billing period.
- Apply pricing rules — flat fees, free allowances, per-unit rates, tiered pricing — without requiring a code deploy for every pricing change.
- Turn aggregated usage into invoices that are accurate, auditable, and cannot silently drift from the underlying ledger.
- Do all of the above at a scale where a single hot counter or a single lock can't become the bottleneck.

This project builds that system end-to-end, as a standalone modular monolith, to demonstrate the kind of revenue-critical, configuration-driven infrastructure a Revenue/Platform team owns.

## 2. Goals

1. Prove idempotent, high-throughput event ingestion under concurrency and retries.
2. Prove a pricing engine that is genuinely configuration-driven (new pricing shapes require no code change).
3. Prove financial correctness via a double-entry ledger, not a mutable balance field.
4. Produce documentation (README + DECISIONS.md) that reads like a real engineering design doc, explicitly mapped to the target job description.

## 3. Non-Goals (Out of Scope for v1)

- Authentication/authorization beyond a simple API key (or none, for the local demo).
- Multi-tenancy beyond a `customer_id` column.
- Proration, refunds, dunning/collections, tax calculation.
- Multi-currency support.
- Production-grade ops (autoscaling, multi-region, managed HA Postgres/Redis) — a single self-hosted VPS with Docker Compose, a reverse proxy, and TLS is the deployment target, not a scaled production setup.

Explicitly write these into the README as "Future Enhancements" — do not silently drop them, name them as deliberate scope cuts.

## 4. Users / Consumers of This System

- **Producer services** — internal systems (e.g., a Zap execution engine) that emit usage events via the ingestion API.
- **Billing/finance operators** — trigger or review invoice generation, inspect the ledger.
- **Plan administrators** — edit `pricing_config` JSON to change pricing without a deploy.

## 5. Functional Requirements

### 5.1 Event Ingestion API
- `POST /events` accepts `{ event_id, customer_id, feature_key, quantity, timestamp, metadata }`.
- Idempotent on `event_id`: a retried event with the same `event_id` must not be double-counted.
- Returns `202 Accepted` immediately; processing is asynchronous.
- Rejects negative quantities and malformed payloads with a clear 4xx.

### 5.2 Usage Aggregation
- Background worker consumes events from a queue and aggregates into `usage_records` (per customer, per feature, per billing period).
- Uses a fast in-memory counter (e.g., Redis `INCRBY`) for the hot path, periodically flushed to Postgres for durability.
- Correctly attributes **late/out-of-order events** to the billing period implied by their timestamp, not the period they arrived in.
- If the in-memory counter store is unavailable, falls back to a durable path (direct DB write with locking, or a retry queue) rather than dropping events.

### 5.3 Pricing Engine
- Given `(customer_id, feature_key, quantity, period)`, returns a cost breakdown.
- Pricing rules are read from a JSON config attached to the customer's plan — not hardcoded in application logic.
- Supports, at minimum: flat monthly fee, free allowance, flat per-unit rate, and tiered/graduated pricing.
- Adding a new pricing shape must not require touching the core engine — use a strategy pattern or equivalent extension point.
- Documents (in DECISIONS.md) how it would extend to hybrid seat+usage pricing and how `pricing_config` would be versioned so historical invoices remain reproducible after a pricing change.

### 5.4 Invoice Generation
- Scheduled or manually triggered job generates invoices for active subscriptions at period end.
- Pulls aggregated usage → pricing engine → produces an invoice with line items per feature.
- Once finalized, an invoice is immutable — corrections happen via new entries, never by editing a finalized invoice.

### 5.5 Ledger (Double-Entry)
- Every invoice produces balanced journal entries (e.g., debit Accounts Receivable, credit Revenue).
- `sum(debits) == sum(credits)` must hold at all times, system-wide, not just per invoice.
- Ledger entries are append-only.

## 6. Data Model (summary — see DECISIONS.md for rationale)

| Table | Purpose |
|---|---|
| `customers` | Basic customer info |
| `plans` | Pricing plan definitions, `pricing_config` as JSONB |
| `subscriptions` | Links a customer to a plan over a date range |
| `usage_events` | Raw, append-only, immutable event log |
| `usage_records` | Aggregated usage per customer/feature/period |
| `invoices` | Generated invoices |
| `invoice_line_items` | Per-feature charges on an invoice |
| `journal_entries` | Double-entry ledger rows |
| `idempotency_keys` | Dedup table for event ingestion |

## 7. Non-Functional Requirements

- **Correctness over speed** — every design tradeoff favors not losing or double-counting money, even at the cost of latency.
- **Auditability** — any invoice total must be traceable back to the raw events and the pricing config version that produced it.
- **Extensibility** — new features (feature keys), new pricing shapes, and new billing cycles should be config, not code, changes.
- **Observability** — enough logging/metrics to explain "why does this invoice say $X" after the fact.

## 8. Tech Stack

NestJS (TypeScript) · PostgreSQL · Redis + BullMQ · Docker Compose · Jest (+ optionally fast-check for property-based tests).

## 9. Testing Requirements

- Unit tests: pricing engine tier boundaries, zero usage, rejected negative quantities, overage past the last tier.
- Integration tests: duplicate-event idempotency, concurrent identical events.
- End-to-end test: simulate a month of usage → generate invoice → assert ledger balances and total matches expected usage × rate.
- Stretch: property-based test asserting invoiced total always equals the sum implied by the pricing config for any random event sequence.

## 10. Documentation Deliverables

- `README.md` — problem statement, architecture diagram (Mermaid), data model, how to run (Docker Compose + sample `curl`), testing, future enhancements, and an explicit section mapping features to the target job description's language.
- `DECISIONS.md` — one entry per major decision (Postgres vs NoSQL, Redis for counters, double-entry ledger, async processing), each with the alternative considered and why it was rejected.

## 11. Milestones

Delivery is staged — see `BUILD-STAGES-usage-based-billing-engine.md` for the full breakdown, acceptance criteria, and per-stage demo script. Each stage ends in a working, demoable increment deployed to the project VPS — deployment is not a final step, it's set up in Stage 0 and every subsequent stage redeploys onto it.

## 12. Success Criteria

- A fake customer's month of simulated usage produces a correct, ledger-balanced invoice, reproducible by re-running the same event stream.
- Duplicate/concurrent events never change the final invoice total.
- A pricing change (edit `pricing_config`) changes future invoices without a code deploy.
- README and DECISIONS.md are legible to someone unfamiliar with the project and explicitly tie back to the Zapier Staff Backend Engineer, Revenue job description.
