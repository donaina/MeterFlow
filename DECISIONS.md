# Architectural Decisions Log (DECISIONS.md)

This log records the core architectural decisions, alternatives evaluated, and rationales for the Usage-Based Billing & Metering Engine.

---

## ADR-001: Architecture Style — Modular Monolith

- **Status:** Accepted
- **Context:** The billing engine must handle event ingestion, usage aggregation, dynamic pricing evaluation, immutable invoicing, and double-entry ledger journal writes.
- **Alternatives Considered:**
  1. *Microservices (separate services for Ingestion, Aggregation, Pricing, Invoicing, Ledger)*: High operational complexity, distributed transaction overhead, network latency, and consistency challenges when maintaining strict ledger invariants across boundaries.
  2. *Single unstructured monolith*: Prone to tight coupling and leaky abstractions across domain boundaries.
- **Decision:** Build as a **Modular Monolith** using **NestJS (TypeScript)**. Modules are strictly isolated by domain (`IngestionModule`, `AggregationModule`, `PricingModule`, `BillingModule`, `LedgerModule`).
- **Rationale:** Preserves atomic ACID transactions across invoice generation and double-entry ledger writes while enabling clean separation of concerns and simplified local/VPS operations via Docker Compose.

---

## ADR-002: Financial Correctness — Double-Entry Ledger & Integer Money

- **Status:** Accepted
- **Context:** Financial records require absolute auditability and reconciliation. Inaccurate calculations or silent balance mutations create revenue drift and audit failures.
- **Alternatives Considered:**
  1. *Mutable Customer Balance Field (`UPDATE customers SET balance = balance + 100`)*: Vulnerable to lost updates, race conditions under concurrency, and lacks an audit trail of why a balance changed.
  2. *Floating-point representation (`Float` / `number`)*: Causes IEEE 754 binary floating-point rounding errors (e.g. `0.1 + 0.2 !== 0.3`).
- **Decision:**
  - Every financial transaction produces balanced journal entries in an append-only `journal_entries` table (`sum(debits) == sum(credits)` at all times).
  - All monetary values and usage quantities feeding pricing are stored and calculated strictly as **integers (smallest currency unit, e.g. cents)** or fixed-precision decimals.
- **Rationale:** Guarantees cryptographic/accounting auditability and eliminates floating-point drift.

---

## ADR-003: Storage & Ingestion Tiering — PostgreSQL + Redis & BullMQ

- **Status:** Accepted
- **Context:** Ingesting high-throughput usage events while guaranteeing zero event loss, duplicate suppression, and durable aggregation.
- **Alternatives Considered:**
  1. *Direct synchronous DB writes for every single raw event aggregation*: Creates severe lock contention on hot customer/feature aggregation rows under high event volume.
  2. *NoSQL Database (e.g. DynamoDB/MongoDB) for billing*: Lacks strict relational constraints and ACID transactions required for multi-row ledger balancing and invoice immutability.
- **Decision:**
  - **PostgreSQL** as the primary source of truth for durable entities (`customers`, `plans`, `usage_events`, `invoices`, `journal_entries`).
  - **Redis + BullMQ** for fast in-memory atomic counters (`INCRBY`) on the hot ingestion path, buffered and periodically flushed to PostgreSQL `usage_records`.
- **Rationale:** Combines the raw throughput of in-memory key-value operations with the relational ACID guarantees of PostgreSQL.

---

## ADR-004: Config-Driven Pricing Engine via JSONB and Strategy Pattern

- **Status:** Accepted
- **Context:** SaaS pricing models (flat fees, free allowances, per-unit rates, tiered graduated pricing) evolve rapidly and must change without requiring code deployments.
- **Alternatives Considered:**
  1. *Hardcoded Pricing Logic in Service Code*: Requires code changes, pull requests, testing cycles, and deployments for every pricing tweak.
  2. *Relational Multi-Table Tier Schemas*: Rigid schema that is cumbersome to query and evolve for novel pricing shapes (e.g. tiered vs matrix vs package).
- **Decision:** Store plan pricing rules in a `pricing_config` JSONB column on `plans`, evaluated through a Strategy Pattern. Historical invoices reference immutable snapshots/versions of the pricing config.
- **Rationale:** Enables instant, zero-downtime pricing changes while ensuring historical invoices remain 100% reproducible.

---

## ADR-005: Database-Enforced Idempotency & Append-Only Usage Log

- **Status:** Accepted
- **Context:** Network retries, consumer crashes, and concurrent producer retries will emit duplicate events with the same `event_id`. Double-counting events causes erroneous over-billing.
- **Alternatives Considered:**
  1. *Application-level `SELECT ... WHERE event_id = ?` check before insert*: Inherently vulnerable to race conditions under concurrent retries (time-of-check to time-of-use flaw).
  2. *Redis-only cache dedup key (`SETNX event_id` with TTL)*: If Redis restarts or the TTL expires before a late retry arrives, duplicates will pass through and cause double billing.
- **Decision:**
  - Enforce uniqueness with a hard database-level unique constraint (`@unique` on `event_id` in `usage_events`).
  - The application attempts atomic insertion and catches unique constraint violations (Postgres code `23505` / Prisma `P2002`), returning `200 OK` with `{ status: "duplicate" }` instead of an error or a second row.
  - The `usage_events` table is strictly append-only: zero `UPDATE` or `DELETE` operations are implemented.
- **Rationale:** Guarantees absolute deduplication even under high-concurrency race conditions and retains a permanent, tamper-evident raw event audit log.

---

## ADR-006: Hybrid In-Memory Counter with Durable Periodic Flush & Fallback

- **Status:** Accepted
- **Context:** Aggregating billions of raw events per billing cycle into per-customer, per-feature, per-period usage totals without creating a write-bottleneck on database rows.
- **Alternatives Considered:**
  1. *Pure batch aggregation via periodic SQL `SUM()` over raw `usage_events`*: Becomes extremely slow and expensive as `usage_events` scales into millions/billions of rows.
  2. *Pure in-memory Redis counting without fallback*: Risk of data loss if Redis crashes or is evicted prior to invoice generation.
- **Decision:**
  - Fast in-memory aggregation via Redis atomic `INCRBY` keyed by `usage:{customerId}:{featureKey}:{periodKey}` with dirty-key tracking.
  - Periodic flush worker syncs accumulated totals into PostgreSQL `usage_records` table using atomic SQL upserts.
  - If Redis is unavailable or fails, worker falls back immediately to direct PostgreSQL atomic upsert (`INSERT ... ON CONFLICT DO UPDATE SET quantity = usage_records.quantity + EXCLUDED.quantity`), ensuring zero event loss.
  - Late/out-of-order events compute period boundaries from their event `timestamp` (not arrival time), ensuring historical period usage accuracy.
- **Rationale:** Delivers sub-millisecond aggregation throughput while preserving 100% durable financial correctness and resilient fault tolerance.

---

## ADR-007: Strategy Pattern for Dynamic JSONB Pricing Rules & Plan Versioning

- **Status:** Accepted
- **Context:** Revenue models combine hybrid base subscriptions with dynamic consumption models (free allowances, per-unit rates, graduated tiered brackets, volume discounts). Modifications must be instantaneous without risking historical invoice discrepancies.
- **Alternatives Considered:**
  1. *Class-inheritance based pricing hierarchies*: Hard to serialize, rigid to extend, requires code modifications for each new pricing rule variation.
  2. *Unversioned Plan rows*: Overwriting plan pricing alters calculations for historical audits and past billing disputes.
- **Decision:**
  - Pluggable Strategy Pattern with `PricingStrategy` interface (`calculate(quantity, config)`).
  - Supported strategies: `flat_fee`, `per_unit` (with allowance thresholds), `tiered_graduated` (multi-tier progressive bracket allocation), and `volume` (volume-wide threshold discount).
  - All amounts evaluated in **integer cents** to prevent binary floating-point drift.
  - Every update to a plan's `pricing_config` automatically increments the plan `version`. Invoices store an immutable snapshot of the active version.
- **Rationale:** Delivers zero-downtime pricing agility, complete tier boundary precision, and audit reproducibility.

---

## ADR-008: Immutable Finalized Invoicing and Atomic Double-Entry Ledger

- **Status:** Accepted
- **Context:** Invoices and financial ledger entries must never silently drift or be corrupted by partial failure. Every charge must have matching credit and debit entries that balance at all times.
- **Alternatives Considered:**
  1. *Two-phase separate invoice creation and ledger write*: If the application crashes between invoice insertion and ledger entry insertion, orphaned invoices exist without accounting records.
  2. *In-place invoice mutation (e.g. updating amounts on a finalized invoice)*: Violates audit trails and breaks accounting reconciliation with payment processors and general ledgers.
- **Decision:**
  - Single atomic ACID database transaction (`prisma.$transaction`) executes invoice creation, line items insertion, and balanced journal entry creation (`sum(debits) == sum(credits)`).
  - Debit: `ACCOUNTS_RECEIVABLE` (Asset), Credit: `USAGE_REVENUE` and `SUBSCRIPTION_REVENUE` (Income).
  - Finalized invoices are strictly immutable. Any attempt to mutate a finalized invoice's amounts is rejected (`403 Forbidden`).
  - Historical invoices store an exact snapshot of the plan's `pricing_config` and `plan_version` for audit reproducibility.
- **Rationale:** Ensures 100% financial correctness, zero ledger drift, and bulletproof compliance auditability.

---

## ADR-009: Production Hardening, Invariant Property-Based Testing, and Structured Tracing

- **Status:** Accepted
- **Context:** Edge-case bugs, concurrency races under traffic spikes, and opaque distributed errors can corrupt billing pipelines without immediate detection.
- **Alternatives Considered:**
  1. *Sample-only unit testing*: Hand-written tests easily miss subtle edge cases (e.g. extreme integers, empty allowances, zero rates, off-by-one tier boundaries).
  2. *Unstructured string console logging*: Difficult to parse in log aggregators (e.g. Datadog, CloudWatch, Loki) and lacks request correlation.
- **Decision:**
  - Property-based testing with `fast-check` asserting mathematical monotonicity (`cost(q+1) >= cost(q)`), ledger balance invariant preservation, and integer boundary guarantees across 4,000+ generated test permutations.
  - Structured correlation ID middleware (`CorrelationIdMiddleware`) propagating `x-request-id` headers across all HTTP lifecycles and background jobs.
  - Structured JSON logging interceptor (`StructuredLoggingInterceptor`) recording method, path, status, latency, and client details.
- **Rationale:** Guarantees absolute mathematical correctness under any input space and gives operators sub-millisecond trace visibility in production.
