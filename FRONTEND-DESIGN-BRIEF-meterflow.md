# MeterFlow — Non-Generic Frontend Design Brief

Paste this into Antigravity alongside the Frontend PRD before generating any UI. Its purpose is to stop the design from defaulting to a generic dashboard template — the kind that could be re-skinned onto any SaaS product with a logo swap.

## The trap to avoid

AI-generated interfaces cluster around a small set of tells:
- Cream/off-white background + high-contrast serif + a warm terracotta/orange accent.
- Near-black background + a single neon or acid-green accent.
- Default shadcn/Tailwind styling — rounded-xl cards, soft drop shadows, Inter everywhere, sidebar + top-bar layout indistinguishable from every other SaaS template.

None of these are wrong in isolation, but if one shows up because it's the default rather than a decision made for MeterFlow specifically, that's the smell to catch and revise.

## Ground it in the actual subject

MeterFlow's world is metering, ledgers, and financial precision — not "generic SaaS dashboard." Let that vocabulary drive the design instead of a template:

- **Utility meters / odometers** — physical devices built to display a running count precisely and legibly.
- **Accounting ledgers** — ruled paper, columnar figures, tabular alignment, visible debit/credit balance.
- **Receipt tape / ticker displays** — sequential, timestamped, monospaced.

Pick **one** of these as a throughline rather than blending all three, and let it show up consistently — in the typography, in how numbers are laid out, and in one signature visual element.

## A concrete direction (adapt freely, but commit to an actual choice)

- **Color** — a small, named palette (4-6 hex values), not just "blue for primary." E.g. a deep ink navy for structure, a single warm amber/copper for "live" or "active" states (the pulse of a counter incrementing), an off-white paper background rather than pure white or default dark mode.
- **Type** — a monospaced or tabular-figure face for every number (invoice totals, usage counts, ledger entries) so figures always align — this isn't just decoration, it's how real ledgers and meters actually work. Pair it with a plain, restrained sans for labels and copy. Don't default to Inter for everything.
- **Signature element** — a usage counter that visibly ticks up in real time (even if simulated via polling), like watching a utility meter turn. This one moving element sells "metering engine" harder than any chart could.
- **The ledger view specifically** should look like a ledger — ruled rows, right-aligned tabular numbers, a visible running balance, debit/credit columns — not a generic "transaction list" card.
- **Structure as information** — only number things that are genuinely sequential (an event timeline, an invoice's line items in order). Don't add numbered badges or step markers decoratively.

## Process

1. Before writing any component, write down: the 4-6 named colors with hex values, the two typefaces being paired and why, and the one signature element. If any of these is "the default you'd reach for on any dashboard," replace it.
2. Build the signature element (the live meter/counter) first, then build the rest of the UI around it — not the reverse.
3. Self-critique before calling it done: could this exact UI be dropped onto any other SaaS product with just a logo swap? If yes, it isn't done yet.

## Copy and writing

- Name things the way someone using MeterFlow would, not the way the backend models it — "Usage this month," not "Aggregated Usage Records."
- Buttons say exactly what happens: "Recalculate invoice," not "Submit."
- Empty states give direction, not an apology: "No events yet — send a test event to see usage appear here," not "No data found."

## Quality floor (non-negotiable regardless of direction chosen)

- Responsive down to a reasonable mobile width.
- Visible keyboard focus states.
- Respects reduced-motion preferences for the live counter animation.
