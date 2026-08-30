# MeterFlow — Frontend PRD

## Why build a frontend at all

The backend's differentiators — idempotent ingestion, config-driven pricing, a balanced double-entry ledger — are currently provable only by reading code or running curl commands. A frontend's job here isn't to make MeterFlow "look like a product"; it's to turn those differentiators into something a person can watch happen in 10 seconds. Built right, this becomes the centerpiece of your Zapier craft deep-dive, not just a portfolio nicety.

## Core Screens (in priority order)

### 1. Usage Dashboard
Per-customer, per-feature usage totals for the current period, with a simple chart over time. Proves the aggregation pipeline works and is legible.

### 2. Live Pricing Config Editor — the standout feature
Let a viewer edit a plan's `pricing_config` (either raw JSON or a friendlier tier-builder UI) and see a cost preview recalculate instantly, with **no redeploy**. This is the single most compelling, literal proof of "configuration-driven pricing" — it turns an abstract claim from the PRD into something you watch happen live.

### 3. Invoice & Ledger Viewer
Show a generated invoice's line items next to the underlying journal entries, with a visible balance check (sum of debits == sum of credits, shown as a clear pass/fail indicator). Makes the correctness claim tangible instead of asserted.

### 4. Idempotency Playground
A button that fires the same `event_id` twice — or N times concurrently — against the live API, and shows the database only ever recorded it once. Turns your hardest non-negotiable into a 10-second demo anyone can trigger themselves.

### 5. (Stretch) Event Timeline / Audit Trail
A visual trace from raw event → aggregation → invoice line → ledger entry, answering "why does this invoice say $X" without touching a database console.

## Suggested Stack

- **React + TypeScript + Vite** — lightweight and fast for a portfolio project; Next.js is fine too if you want SSR, but isn't necessary here.
- **Tailwind CSS**, customized rather than left at defaults — see the accompanying design brief.
- **Recharts** (or similar lightweight charting library) for the usage graphs.
- **TanStack Query** for API calls and polling the live counters.
- Simple polling (every 1-2s) is enough for the "live" feel on the idempotency playground and usage counter — no need for WebSockets unless you specifically want to demonstrate that skill too.

## Non-Goals

- No auth/login flows — a simple customer switcher dropdown is enough for demo purposes.
- No deep mobile polish beyond "doesn't visibly break" — this is a demo tool, not a shipped product.
- No sprawling design-system/component library — a small, deliberate set of components.

## Staged Build (mirrors the backend's staging approach)

1. Usage dashboard, reading from the existing API.
2. Pricing config editor + live cost preview.
3. Invoice/ledger viewer with the balance indicator.
4. Idempotency playground.
5. Polish pass against the design brief.

Each stage should be demoable on its own before moving to the next — same discipline as the backend's BUILD-STAGES doc.
