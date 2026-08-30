import { useState } from 'react';
import { NavigationHeader, type ActiveTab } from './components/common/NavigationHeader';
import { UsageDashboard } from './components/dashboard/UsageDashboard';
import { PricingConfigEditor } from './components/pricing/PricingConfigEditor';
import { InvoiceLedgerViewer } from './components/ledger/InvoiceLedgerViewer';
import { IdempotencyPlayground } from './components/idempotency/IdempotencyPlayground';
import { AuditTrailViewer } from './components/audit/AuditTrailViewer';

export function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [currentCustomer, setCurrentCustomer] = useState<string>('cust_acme_corp');

  return (
    <div className="min-h-screen bg-ink-950 text-slate-100 flex flex-col font-sans selection:bg-copper-500/30 selection:text-copper-300">
      {/* Top Header with Brand, Customer Switcher & Health Indicator */}
      <NavigationHeader
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentCustomer={currentCustomer}
        setCurrentCustomer={setCurrentCustomer}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'dashboard' && <UsageDashboard customerId={currentCustomer} />}
        {activeTab === 'pricing' && <PricingConfigEditor />}
        {activeTab === 'invoices' && <InvoiceLedgerViewer customerId={currentCustomer} />}
        {activeTab === 'idempotency' && <IdempotencyPlayground customerId={currentCustomer} />}
        {activeTab === 'audit' && <AuditTrailViewer />}
      </main>

      {/* Industrial Footer */}
      <footer className="border-t border-ink-900 bg-ink-950 py-6 text-center text-xs font-mono text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>MeterFlow Engine — Usage-Based Billing & Double-Entry Ledger</span>
          <span className="text-copper-500/80">Integer Cents • Append-Only • Zero Float Drift</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
