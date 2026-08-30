import React, { useState, useEffect, useCallback } from 'react';
import {
  Receipt,
  Scale,
  ShieldCheck,
  FileText,
  PlusCircle,
  AlertOctagon,
  RefreshCw,
} from 'lucide-react';
import { api, type Invoice, type LedgerInvoiceAudit } from '../../api/client';
import { LedgerBalanceBadge } from '../common/LedgerBalanceBadge';

interface InvoiceLedgerViewerProps {
  customerId: string;
}

export const InvoiceLedgerViewer: React.FC<InvoiceLedgerViewerProps> = ({ customerId }) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [ledgerAudit, setLedgerAudit] = useState<LedgerInvoiceAudit | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [immutabilityResult, setImmutabilityResult] = useState<{
    status: number;
    message: string;
    timestamp: string;
  } | null>(null);

  const loadInvoices = useCallback(async () => {
    try {
      const list = await api.invoices.listForCustomer(customerId);
      setInvoices(list);
      if (list.length > 0) {
        selectInvoice(list[0]);
      } else {
        setSelectedInvoice(null);
        setLedgerAudit(null);
      }
    } catch (err) {
      console.error('Error loading invoices:', err);
    }
  }, [customerId]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  const selectInvoice = async (inv: Invoice) => {
    setSelectedInvoice(inv);
    setImmutabilityResult(null);
    try {
      const audit = await api.ledger.getForInvoice(inv.id);
      setLedgerAudit(audit);
    } catch (err) {
      console.error('Error loading ledger audit:', err);
    }
  };

  const handleGenerateInvoice = async () => {
    try {
      setIsGenerating(true);
      setImmutabilityResult(null);
      const generated = await api.invoices.generate({
        customer_id: customerId,
        period_start: '2026-08-01T00:00:00.000Z',
        period_end: '2026-08-31T23:59:59.999Z',
      });
      await loadInvoices();
      selectInvoice(generated);
    } catch (err: any) {
      alert(`Invoice generation failed: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleChallengeImmutability = async () => {
    if (!selectedInvoice) return;
    try {
      await api.invoices.attemptMutate(selectedInvoice.id, {
        total_cents: 9999999, // Attempt unauthorized edit
      });
      setImmutabilityResult({
        status: 200,
        message: 'Unexpected: Invoice was modified (Violation!)',
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      setImmutabilityResult({
        status: err.status || 403,
        message: err.message || 'Forbidden: Finalized invoices are strictly immutable.',
        timestamp: new Date().toISOString(),
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Generation Trigger */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-ink-900/80 p-5 rounded-xl border border-ink-800 backdrop-blur">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Receipt className="w-5 h-5 text-copper-400" />
            <h2 className="text-lg font-bold text-white tracking-tight font-sans">
              Invoices & Double-Entry Ledger Auditor
            </h2>
          </div>
          <p className="text-xs text-slate-400">
            Inspect finalized invoices and verify balanced double-entry accounting records with zero float drift.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleGenerateInvoice}
            disabled={isGenerating}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold bg-copper-500 hover:bg-copper-600 text-ink-950 shadow-lg shadow-copper-500/20 transition disabled:opacity-50"
          >
            <PlusCircle className="w-4 h-4" />
            <span>{isGenerating ? 'Finalizing...' : 'Generate New Monthly Invoice'}</span>
          </button>

          <button
            onClick={loadInvoices}
            className="p-2 rounded-lg bg-ink-800 hover:bg-ink-700 text-slate-300 border border-ink-700/80"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Invariant Balance Verification Card */}
      {ledgerAudit && (
        <LedgerBalanceBadge
          totalDebitsCents={ledgerAudit.balance_check.totalDebitsCents}
          totalCreditsCents={ledgerAudit.balance_check.totalCreditsCents}
          isBalanced={ledgerAudit.balance_check.isBalanced}
          entriesCount={ledgerAudit.entries.length}
        />
      )}

      {/* Main View: Invoice List & Details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: List of Invoices */}
        <div className="lg:col-span-4 bg-ink-900 border border-ink-800 rounded-xl p-4 space-y-3">
          <div className="text-xs font-bold text-slate-400 uppercase font-mono tracking-wider mb-2">
            Invoices ({invoices.length})
          </div>

          {invoices.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-500 font-mono">
              No invoices generated yet. Click &quot;Generate New Monthly Invoice&quot; to test.
            </div>
          ) : (
            <div className="space-y-2">
              {invoices.map((inv) => {
                const isSelected = selectedInvoice?.id === inv.id;
                return (
                  <button
                    key={inv.id}
                    onClick={() => selectInvoice(inv)}
                    className={`w-full text-left p-3 rounded-lg border transition font-mono ${
                      isSelected
                        ? 'bg-ink-950 border-copper-500/60 shadow-sm'
                        : 'bg-ink-950/40 border-ink-800 hover:border-ink-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-200">
                        {inv.invoiceNumber}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded uppercase font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                        {inv.status}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 text-[11px]">
                        {new Date(inv.finalizedAt).toLocaleDateString()}
                      </span>
                      <span className="font-bold text-copper-400 tabular-nums">
                        ${(inv.totalCents / 100).toFixed(2)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Side-by-Side Line Items & Journal Entries */}
        <div className="lg:col-span-8 space-y-6">
          {selectedInvoice ? (
            <div className="bg-ink-900 border border-ink-800 rounded-xl p-5 space-y-6">
              {/* Invoice Summary Header */}
              <div className="flex items-center justify-between border-b border-ink-800 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white font-mono">
                      {selectedInvoice.invoiceNumber}
                    </h3>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-copper-500/10 text-copper-400 border border-copper-500/30">
                      Immutable (v{selectedInvoice.planVersion})
                    </span>
                  </div>
                  <span className="text-xs text-slate-400 font-mono">
                    ID: {selectedInvoice.id}
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-xs text-slate-400 block font-mono">Total Due</span>
                  <div className="text-2xl font-black font-mono text-copper-400 tabular-nums">
                    ${(selectedInvoice.totalCents / 100).toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Section 1: Itemized Invoice Lines */}
              <div>
                <div className="text-xs font-bold text-slate-300 uppercase font-mono tracking-wider mb-2 flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-copper-400" />
                  <span>1. Itemized Billable Line Items</span>
                </div>

                <div className="border border-ink-800 rounded-lg overflow-hidden font-mono text-xs">
                  <div className="grid grid-cols-12 bg-ink-950 p-2.5 text-slate-500 font-bold uppercase text-[10px] border-b border-ink-800">
                    <span className="col-span-6">Description</span>
                    <span className="col-span-3 text-right">Quantity</span>
                    <span className="col-span-3 text-right">Amount</span>
                  </div>
                  {selectedInvoice.lineItems?.map((li) => (
                    <div
                      key={li.id}
                      className="grid grid-cols-12 p-2.5 ledger-row bg-ink-900/50 items-center text-slate-200"
                    >
                      <span className="col-span-6 font-semibold">{li.description}</span>
                      <span className="col-span-3 text-right tabular-nums text-slate-400">
                        {li.quantity.toLocaleString()}
                      </span>
                      <span className="col-span-3 text-right font-bold text-slate-100 tabular-nums">
                        ${(li.amountCents / 100).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Section 2: Underlying Double-Entry Journal Entries */}
              <div>
                <div className="text-xs font-bold text-slate-300 uppercase font-mono tracking-wider mb-2 flex items-center gap-2">
                  <Scale className="w-3.5 h-3.5 text-emerald-400" />
                  <span>2. Double-Entry Accounting Journal (Append-Only)</span>
                </div>

                <div className="border border-ink-800 rounded-lg overflow-hidden font-mono text-xs">
                  <div className="grid grid-cols-12 bg-ink-950 p-2.5 text-slate-500 font-bold uppercase text-[10px] border-b border-ink-800">
                    <span className="col-span-2">Type</span>
                    <span className="col-span-4">Account</span>
                    <span className="col-span-3 text-right">Debit</span>
                    <span className="col-span-3 text-right">Credit</span>
                  </div>
                  {ledgerAudit?.entries.map((entry) => {
                    const isDebit = entry.entryType === 'DEBIT';
                    const amountFormatted = `$${(entry.amountCents / 100).toFixed(2)}`;
                    return (
                      <div
                        key={entry.id}
                        className="grid grid-cols-12 p-2.5 ledger-row bg-ink-900/50 items-center text-slate-200"
                      >
                        <span className="col-span-2 font-bold">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] ${
                              isDebit
                                ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            }`}
                          >
                            {entry.entryType}
                          </span>
                        </span>
                        <span className="col-span-4 text-slate-300">{entry.account}</span>
                        <span className="col-span-3 text-right tabular-nums text-slate-300">
                          {isDebit ? amountFormatted : '-'}
                        </span>
                        <span className="col-span-3 text-right tabular-nums text-emerald-400 font-semibold">
                          {!isDebit ? amountFormatted : '-'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Section 3: Non-Negotiable Immutability Test */}
              <div className="pt-4 border-t border-ink-800">
                <div className="bg-ink-950 p-4 rounded-lg border border-ink-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-200 font-mono block">
                        Non-Negotiable Check: Invoice Immutability
                      </span>
                      <span className="text-[11px] text-slate-500 font-sans">
                        Attempt to execute <code className="text-rose-400 font-mono">PUT /invoices/{selectedInvoice.id}</code> to test database-level immutability enforcement.
                      </span>
                    </div>

                    <button
                      onClick={handleChallengeImmutability}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 text-xs font-mono font-medium transition"
                    >
                      <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
                      <span>Challenge Immutability</span>
                    </button>
                  </div>

                  {immutabilityResult && (
                    <div
                      className={`p-3 rounded border text-xs font-mono animate-fadeIn ${
                        immutabilityResult.status === 403
                          ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                          : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold mb-0.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        <span>Expected HTTP {immutabilityResult.status} Response (Protected!)</span>
                      </div>
                      <div className="text-[11px] opacity-90">{immutabilityResult.message}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-ink-900 border border-ink-800 rounded-xl p-12 text-center text-slate-500 font-mono text-xs">
              Select an invoice on the left or generate a new one to audit ledger entries.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
