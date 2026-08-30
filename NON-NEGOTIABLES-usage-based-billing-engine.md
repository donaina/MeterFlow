# NON-NEGOTIABLES — Usage-Based Billing & Metering Engine

Purpose: paste this alongside the PRD as IDE/agent context. These are hard constraints — if a suggested change violates one of these, stop and flag it instead of implementing it silently.

## Money & Correctness

1. **Never use floating point for money or quantities that feed pricing.** Use integers (smallest currency unit, e.g. cents) or a fixed-point/decimal type end to end — in the DB schema, in application code, and in any JSON serialization.
2. **`usage_events` is append-only.** No `UPDATE` or `DELETE` on this table, ever. Corrections are new events, not edits.
3. **Finalized invoices are immutable.** No code path may mutate a finalized invoice's totals or line items. Corrections happen via new invoices/credit notes, never in-place.
4. **Every invoice must produce balanced journal entries.** `sum(debits) == sum(credits)` must hold after every write to `journal_entries` — this is an invariant to test, not just an intention.
5. **No silent double-counting.** Every code path that touches `usage_events` must go through the idempotency check first. There is no "trusted internal caller" exception.

## Ingestion & Concurrency

6. **`event_id` idempotency is enforced at the database level** (unique constraint), not just in application logic. Application-level checks alone are a race condition under concurrent retries.
7. **Negative or zero-with-suspicious-metadata quantities are rejected at the API boundary**, not silently clamped or ignored downstream.
8. **Late events (timestamped for a closed-but-not-yet-invoiced period) must be attributed to their correct period.** If a period is already invoiced, a late event must trigger a visible reconciliation path — never a silent adjustment to a finalized invoice.

## Pricing Engine

9. **Pricing logic lives entirely in `pricing_config` (JSONB), never hardcoded in application code.** A new tier, a new flat fee, or a new free allowance must be achievable by editing config, not shipping code.
10. **Adding a new pricing shape (e.g., volume discount) must not require modifying the core pricing engine's call sites** — extend via a strategy/plugin pattern.
11. **Pricing config is versioned.** A historical invoice must always be reproducible using the pricing config version that was active when it was generated, even after the plan's pricing changes later.

## Scope Discipline

12. **Do not add auth, multi-tenancy beyond `customer_id`, multi-currency, proration, or dunning unless explicitly asked.** These are documented non-goals for v1 — if a "nice to have" starts creeping in, name it in the README's Future Enhancements section instead of building it.
13. **Do not swap the core stack** (NestJS/TypeScript, PostgreSQL, Redis+BullMQ) without flagging it first — the stack choice is part of what this project is meant to demonstrate.

## Testing

14. **No feature is "done" without a test for its failure/edge case**, at minimum: duplicate events, concurrent identical events, tier boundary values, zero usage, rejected negative quantities, and an end-to-end month-of-usage → invoice → ledger-balances check.
15. **A change that makes an existing correctness test pass by loosening the assertion, instead of fixing the underlying bug, is not acceptable** — flag it instead of doing it.

## Documentation

16. **Every non-obvious design decision gets an entry in `DECISIONS.md`** (what was chosen, what was considered, why the alternative was rejected) — don't just implement silently and skip the doc.
