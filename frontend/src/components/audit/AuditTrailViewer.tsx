import React from 'react';
import {
  GitCommit,
  Database,
  Calculator,
  Receipt,
  Scale,
  CheckCircle2,
} from 'lucide-react';

export const AuditTrailViewer: React.FC = () => {
  const pipelineSteps = [
    {
      step: 1,
      title: '1. Append-Only Raw Usage Event',
      layer: 'Ingestion Layer (POST /events)',
      guarantee: 'Non-Negotiable #2 & #5',
      icon: <GitCommit className="w-5 h-5 text-copper-400" />,
      details: [
        'Immutable write to PostgreSQL `usage_events` table.',
        'Zero `UPDATE` or `DELETE` queries in the entire codebase.',
        'Database-level unique constraint on `event_id` provides tamper-evident idempotency.',
      ],
      codeSample: `{
  "event_id": "evt_api_1725039000",
  "customer_id": "cust_acme_corp",
  "feature_key": "api_calls",
  "quantity": 100
}`,
    },
    {
      step: 2,
      title: '2. High-Throughput Aggregation Buffer',
      layer: 'Aggregation Layer (Redis + PG Upsert)',
      guarantee: 'Zero Lost Updates Under Load',
      icon: <Database className="w-5 h-5 text-indigo-400" />,
      details: [
        'Atomic in-memory Redis `INCRBY` counter on `usage:{customerId}:{featureKey}:{period}`.',
        'Background cron or on-demand trigger flushes pending deltas to `usage_records`.',
        'Atomic composite SQL upsert `(customer_id, feature_key, period_start, period_end)`.',
      ],
      codeSample: `Redis: INCRBY usage:cust_acme:api_calls:2026-08 100
Postgres: INSERT INTO usage_records (...) 
          ON CONFLICT (...) DO UPDATE SET total_quantity = total_quantity + EXCLUDED.total_quantity`,
    },
    {
      step: 3,
      title: '3. Dynamic Config-Driven Pricing Engine',
      layer: 'Pricing Strategy Registry (JSONB)',
      guarantee: 'Non-Negotiable #1 & #6',
      icon: <Calculator className="w-5 h-5 text-cyan-400" />,
      details: [
        'Pluggable strategy pattern: FlatFee, PerUnit, TieredGraduated, Volume.',
        'All arithmetic executed strictly in integer cents (0 float drift).',
        'Evaluated dynamically against versioned `plans.pricing_config` without redeploying code.',
      ],
      codeSample: `// Graduated Tier Bracket Execution:
Tier 1 (0 -> 1,000):   1,000 * 0¢ = 0¢
Tier 2 (1,000 -> 5,000): 2,500 * 5¢ = 12,500¢ ($125.00)
Subtotal = 12,500 cents (Exact Integer)`,
    },
    {
      step: 4,
      title: '4. Atomic Invoice Finalization & Immutability',
      layer: 'Billing Service ($transaction)',
      guarantee: 'Non-Negotiable #3',
      icon: <Receipt className="w-5 h-5 text-emerald-400" />,
      details: [
        'Single ACID database transaction writes `invoices` and `invoice_line_items`.',
        'Snapshots the active plan version and pricing configuration.',
        'Marked `FINALIZED` — in-place mutations trigger `403 Forbidden`.',
      ],
      codeSample: `await prisma.$transaction([
  createInvoice(status: 'FINALIZED'),
  createLineItems(items),
  recordBalancedLedgerJournal(entries)
])`,
    },
    {
      step: 5,
      title: '5. Balanced Double-Entry Accounting Ledger',
      layer: 'Ledger Service (Balanced Entries)',
      guarantee: 'Non-Negotiable #4 (Σ Debits == Σ Credits)',
      icon: <Scale className="w-5 h-5 text-yellow-400" />,
      details: [
        'Every finalized invoice writes balanced journal entries.',
        'Debit `ACCOUNTS_RECEIVABLE` vs Credit `USAGE_REVENUE`.',
        'Mathematical invariant asserted on every finalize: `sum(debits) == sum(credits)`.',
      ],
      codeSample: `DEBIT  | ACCOUNTS_RECEIVABLE | $155.00 (15,500¢)
CREDIT | SUBSCRIPTION_REV   | $30.00  (3,000¢)
CREDIT | USAGE_REVENUE      | $125.00 (12,500¢)
Balance Check: 15,500¢ == 15,500¢ [PASS ✓]`,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-ink-900/80 p-5 rounded-xl border border-ink-800 backdrop-blur">
        <div className="flex items-center gap-2 mb-1">
          <GitCommit className="w-5 h-5 text-copper-400" />
          <h2 className="text-lg font-bold text-white tracking-tight font-sans">
            End-to-End Financial Audit Trail
          </h2>
        </div>
        <p className="text-xs text-slate-400">
          Visual trace from raw event ingestion through aggregation, dynamic pricing evaluation, invoice finalization, and double-entry ledger settlement.
        </p>
      </div>

      {/* Pipeline Steps */}
      <div className="space-y-4">
        {pipelineSteps.map((step) => (
          <div
            key={step.step}
            className="bg-ink-900 border border-ink-800 rounded-xl p-5 shadow-sm hover:border-ink-700 transition"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-ink-800/80 pb-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-ink-950 border border-ink-800">
                  {step.icon}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-200 font-mono">
                    {step.title}
                  </h3>
                  <span className="text-xs text-slate-400 font-sans">{step.layer}</span>
                </div>
              </div>

              <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded bg-copper-500/10 text-copper-300 border border-copper-500/30 self-start md:self-auto">
                {step.guarantee}
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-6 space-y-2">
                <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider block">
                  Invariant Safeguards:
                </span>
                <ul className="space-y-1.5 text-xs text-slate-300">
                  {step.details.map((d, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="lg:col-span-6">
                <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Engine Code & Telemetry:
                </span>
                <pre className="bg-ink-950 p-3 rounded-lg border border-ink-800 font-mono text-[11px] text-copper-300 overflow-x-auto">
                  {step.codeSample}
                </pre>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
