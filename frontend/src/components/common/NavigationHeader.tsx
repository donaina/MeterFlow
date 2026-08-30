import React, { useEffect, useState } from 'react';
import {
  Gauge,
  Sliders,
  Receipt,
  ShieldAlert,
  GitCommit,
  Activity,
  Users,
  RefreshCw,
} from 'lucide-react';
import { api, type HealthCheckResponse } from '../../api/client';

export type ActiveTab =
  | 'dashboard'
  | 'pricing'
  | 'invoices'
  | 'idempotency'
  | 'audit';

interface NavigationHeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  currentCustomer: string;
  setCurrentCustomer: (customerId: string) => void;
}

export const NavigationHeader: React.FC<NavigationHeaderProps> = ({
  activeTab,
  setActiveTab,
  currentCustomer,
  setCurrentCustomer,
}) => {
  const [health, setHealth] = useState<HealthCheckResponse | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const checkHealth = async () => {
    try {
      setIsRefreshing(true);
      const res = await api.health.check();
      setHealth(res);
    } catch {
      setHealth({
        status: 'error',
        timestamp: new Date().toISOString(),
        info: {
          database: { status: 'down' },
          redis: { status: 'down' },
        },
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  const tabs: Array<{ id: ActiveTab; label: string; icon: React.ReactNode; badge?: string }> = [
    { id: 'dashboard', label: 'Usage Meter', icon: <Gauge className="w-4 h-4" /> },
    { id: 'pricing', label: 'Pricing Editor', icon: <Sliders className="w-4 h-4" />, badge: 'Zero Redeploy' },
    { id: 'invoices', label: 'Invoices & Ledger', icon: <Receipt className="w-4 h-4" /> },
    { id: 'idempotency', label: 'Idempotency Playground', icon: <ShieldAlert className="w-4 h-4" /> },
    { id: 'audit', label: 'Audit Trail', icon: <GitCommit className="w-4 h-4" /> },
  ];

  const predefinedCustomers = [
    { id: 'cust_acme_corp', name: 'Acme Mega Corp' },
    { id: 'cust_demo_pro', name: 'Zapier Partner Demo' },
    { id: 'cust_cloud_scale', name: 'Scale Cloud Inc' },
  ];

  return (
    <header className="border-b border-ink-800 bg-ink-950/90 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-copper-500 to-copper-700 flex items-center justify-center shadow-lg shadow-copper-500/20 ring-1 ring-copper-400/30">
              <Activity className="w-5 h-5 text-ink-950 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight text-white font-sans">
                  MeterFlow
                </span>
                <span className="text-[10px] uppercase font-mono tracking-wider px-1.5 py-0.5 rounded bg-copper-500/10 text-copper-400 border border-copper-500/30">
                  Engine v1.0
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                High-Throughput Metering & Double-Entry Ledger
              </p>
            </div>
          </div>

          {/* Right Controls: Customer Switcher & Health Status */}
          <div className="flex items-center gap-4">
            {/* Customer Switcher */}
            <div className="flex items-center gap-2 bg-ink-900 border border-ink-800 px-3 py-1.5 rounded-lg">
              <Users className="w-3.5 h-3.5 text-slate-400" />
              <label htmlFor="customer-select" className="text-xs text-slate-400 font-medium">
                Customer:
              </label>
              <select
                id="customer-select"
                value={currentCustomer}
                onChange={(e) => setCurrentCustomer(e.target.value)}
                className="bg-transparent font-mono text-xs font-semibold text-copper-400 focus:outline-none cursor-pointer"
              >
                {predefinedCustomers.map((c) => (
                  <option key={c.id} value={c.id} className="bg-ink-900 text-slate-200">
                    {c.name} ({c.id})
                  </option>
                ))}
              </select>
            </div>

            {/* Health Status Pill */}
            <div className="flex items-center gap-2 bg-ink-900/80 border border-ink-800 px-3 py-1.5 rounded-lg text-xs font-mono">
              <div className="flex items-center gap-1.5">
                <span
                  className={`h-2 w-2 rounded-full ${
                    health?.status === 'ok'
                      ? 'bg-emerald-400 animate-pulse'
                      : 'bg-rose-500'
                  }`}
                />
                <span className="text-slate-300">
                  {health?.status === 'ok' ? 'PG + Redis' : 'Degraded'}
                </span>
              </div>
              <button
                onClick={checkHealth}
                title="Refresh Health"
                className="text-slate-500 hover:text-slate-300 ml-1"
              >
                <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="flex space-x-1 sm:space-x-4 border-t border-ink-800/60 -mb-px overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 py-3 px-3.5 border-b-2 text-xs font-medium whitespace-nowrap transition-all ${
                  isActive
                    ? 'border-copper-500 text-copper-400 font-semibold bg-copper-500/5'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className="ml-1 text-[9px] uppercase font-mono px-1.5 py-0.2 rounded bg-copper-500/20 text-copper-300 border border-copper-500/30">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
