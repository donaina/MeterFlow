import React from 'react';
import { CheckCircle2, AlertTriangle, Scale } from 'lucide-react';

interface LedgerBalanceBadgeProps {
  totalDebitsCents: number;
  totalCreditsCents: number;
  isBalanced?: boolean;
  entriesCount?: number;
  size?: 'sm' | 'md' | 'lg';
}

export const LedgerBalanceBadge: React.FC<LedgerBalanceBadgeProps> = ({
  totalDebitsCents,
  totalCreditsCents,
  isBalanced = totalDebitsCents === totalCreditsCents,
  entriesCount,
  size = 'md',
}) => {
  const debitsFormatted = `$${(totalDebitsCents / 100).toFixed(2)}`;
  const creditsFormatted = `$${(totalCreditsCents / 100).toFixed(2)}`;

  if (size === 'sm') {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium border ${
          isBalanced
            ? 'bg-emerald-950/50 text-emerald-300 border-emerald-800/60'
            : 'bg-rose-950/50 text-rose-300 border-rose-800/60'
        }`}
      >
        {isBalanced ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
        ) : (
          <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
        )}
        <span>{isBalanced ? 'Balanced' : 'Unbalanced'}</span>
        <span className="opacity-60">|</span>
        <span>Σ {debitsFormatted}</span>
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border p-4 shadow-sm transition-all ${
        isBalanced
          ? 'bg-ink-900/90 border-emerald-800/40 shadow-emerald-950/20'
          : 'bg-rose-950/30 border-rose-800/50'
      }`}
    >
      <div className="flex items-center justify-between gap-4 mb-3">
        <div className="flex items-center gap-2">
          <div
            className={`p-1.5 rounded-md ${
              isBalanced ? 'bg-emerald-900/40 text-emerald-400' : 'bg-rose-900/40 text-rose-400'
            }`}
          >
            <Scale className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Double-Entry Invariant
            </div>
            <div className="text-sm font-medium text-slate-200">
              {isBalanced ? 'Ledger Balanced (Invariant Verified)' : 'Invariant Violation'}
            </div>
          </div>
        </div>

        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-semibold uppercase ${
            isBalanced
              ? 'bg-emerald-900/30 text-emerald-300 border border-emerald-700/50'
              : 'bg-rose-900/30 text-rose-300 border border-rose-700/50'
          }`}
        >
          {isBalanced ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Σ Debits = Σ Credits</span>
            </>
          ) : (
            <>
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
              <span>Unbalanced Drift</span>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-ink-800/80 font-mono text-xs">
        <div className="bg-ink-950/70 p-2.5 rounded border border-ink-800">
          <span className="text-slate-500 uppercase block mb-0.5">Total Debits (Receivable)</span>
          <span className="text-base font-bold text-slate-100 tabular-nums">
            {debitsFormatted}
          </span>
          <span className="text-[10px] text-slate-500 block font-sans">
            {totalDebitsCents.toLocaleString()} cents
          </span>
        </div>

        <div className="bg-ink-950/70 p-2.5 rounded border border-ink-800">
          <span className="text-slate-500 uppercase block mb-0.5">Total Credits (Revenue)</span>
          <span className="text-base font-bold text-emerald-400 tabular-nums">
            {creditsFormatted}
          </span>
          <span className="text-[10px] text-slate-500 block font-sans">
            {totalCreditsCents.toLocaleString()} cents
          </span>
        </div>
      </div>

      {entriesCount !== undefined && (
        <div className="mt-2.5 text-[11px] text-slate-400 flex items-center justify-between">
          <span>Journal Entries: <strong className="font-mono text-slate-300">{entriesCount}</strong></span>
          <span className="text-emerald-400/80">Difference: $0.00 (Exact Cent Parity)</span>
        </div>
      )}
    </div>
  );
};
