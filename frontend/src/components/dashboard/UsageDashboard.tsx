import React, { useEffect, useState, useCallback } from 'react';
import {
  Zap,
  HardDrive,
  Cpu,
  Database,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { api, type CustomerUsageItem } from '../../api/client';
import { OdometerCounter } from '../common/OdometerCounter';

interface UsageDashboardProps {
  customerId: string;
}

export const UsageDashboard: React.FC<UsageDashboardProps> = ({ customerId }) => {
  const [usageItems, setUsageItems] = useState<CustomerUsageItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFlushing, setIsFlushing] = useState(false);
  const [isEmitting, setIsEmitting] = useState(false);
  const [flushMessage, setFlushMessage] = useState<string | null>(null);
  const [lastEmittedEvent, setLastEmittedEvent] = useState<string | null>(null);

  const fetchUsage = useCallback(async () => {
    try {
      const res = await api.aggregation.getUsage(customerId, '2026-08');
      setUsageItems(res.items || []);
    } catch (err: any) {
      console.error('Error fetching usage:', err);
    }
  }, [customerId]);

  useEffect(() => {
    fetchUsage();
    // Poll usage every 1.5 seconds for active real-time meter feel
    const interval = setInterval(fetchUsage, 1500);
    return () => clearInterval(interval);
  }, [fetchUsage]);

  const handleSendEvent = async (featureKey: string, quantity: number) => {
    try {
      setIsEmitting(true);
      const eventId = `evt_${featureKey}_${Date.now()}`;
      await api.ingestion.ingest({
        event_id: eventId,
        customer_id: customerId,
        feature_key: featureKey,
        quantity,
        timestamp: new Date().toISOString(),
      });
      setLastEmittedEvent(`Ingested +${quantity.toLocaleString()} for "${featureKey}" (ID: ${eventId})`);
      setTimeout(fetchUsage, 300);
    } catch (err: any) {
      console.error('Error emitting event:', err);
    } finally {
      setIsEmitting(false);
    }
  };

  const handleFlush = async () => {
    try {
      setIsFlushing(true);
      setFlushMessage(null);
      const res = await api.aggregation.flush();
      setFlushMessage(
        `Synced ${res.flushedKeysCount} counter keys (${res.syncedEventsCount.toLocaleString()} units) to PostgreSQL`,
      );
      fetchUsage();
    } catch (err: any) {
      setFlushMessage(`Flush failed: ${err.message}`);
    } finally {
      setIsFlushing(false);
    }
  };

  // Helper to extract feature quantity
  const getFeatureStats = (key: string) => {
    const item = usageItems.find((i) => i.featureKey === key);
    return {
      durable: item?.durableQuantity || 0,
      pending: item?.pendingQuantity || 0,
      total: item?.totalQuantity || 0,
    };
  };

  const standardFeatures = [
    {
      key: 'api_calls',
      name: 'API Calls',
      description: 'REST API invocations',
      icon: <Zap className="w-5 h-5 text-copper-400" />,
      unit: 'calls',
    },
    {
      key: 'ai_tokens',
      name: 'LLM Inference Tokens',
      description: 'Inference token consumption',
      icon: <Sparkles className="w-5 h-5 text-indigo-400" />,
      unit: 'tokens',
    },
    {
      key: 'storage_gb',
      name: 'Object Storage',
      description: 'Active persistent storage',
      icon: <HardDrive className="w-5 h-5 text-cyan-400" />,
      unit: 'GB',
    },
    {
      key: 'compute_hours',
      name: 'Compute Workloads',
      description: 'Worker container hours',
      icon: <Cpu className="w-5 h-5 text-emerald-400" />,
      unit: 'hours',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner: Metering Pipeline Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-ink-900/80 p-5 rounded-xl border border-ink-800 backdrop-blur shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="h-2.5 w-2.5 rounded-full bg-copper-400 animate-pulse-glow" />
            <h2 className="text-lg font-bold text-white tracking-tight font-sans">
              Live Consumption Meters (Period: 2026-08)
            </h2>
          </div>
          <p className="text-xs text-slate-400">
            Real-time hybrid aggregation tier: In-memory atomic Redis buffer synced durably into PostgreSQL.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleFlush}
            disabled={isFlushing}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-ink-800 hover:bg-ink-700 text-slate-200 border border-ink-700/80 shadow transition disabled:opacity-50"
          >
            <Database className={`w-3.5 h-3.5 text-copper-400 ${isFlushing ? 'animate-bounce' : ''}`} />
            <span>{isFlushing ? 'Flushing...' : 'Flush Redis Buffer to DB'}</span>
          </button>

          <button
            onClick={() => {
              setIsLoading(true);
              fetchUsage().finally(() => setIsLoading(false));
            }}
            className="p-2 rounded-lg bg-ink-800 hover:bg-ink-700 text-slate-300 border border-ink-700/80 transition"
            title="Refresh counters"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {flushMessage && (
        <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-lg text-xs text-emerald-300 flex items-center justify-between font-mono animate-fadeIn">
          <span>✓ {flushMessage}</span>
          <button onClick={() => setFlushMessage(null)} className="text-emerald-500 hover:text-emerald-300">
            ✕
          </button>
        </div>
      )}

      {/* Feature Meters Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {standardFeatures.map((feat) => {
          const stats = getFeatureStats(feat.key);
          return (
            <div
              key={feat.key}
              className="bg-ink-900 border border-ink-800 rounded-xl p-5 shadow-sm hover:border-ink-700 transition flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 rounded-lg bg-ink-950 border border-ink-800/80">
                    {feat.icon}
                  </div>
                  <span className="text-[10px] uppercase font-mono tracking-wider px-2 py-0.5 rounded bg-ink-950 text-slate-400 border border-ink-800">
                    {feat.unit}
                  </span>
                </div>

                <div className="text-sm font-semibold text-slate-200">{feat.name}</div>
                <div className="text-[11px] text-slate-500 mb-4">{feat.description}</div>

                {/* Signature Mechanical Odometer Counter */}
                <div className="mb-4">
                  <span className="text-[10px] text-slate-400 uppercase font-mono block mb-1">
                    Total Meter Reading
                  </span>
                  <OdometerCounter
                    value={stats.total}
                    size="lg"
                    className="w-full justify-start"
                  />
                </div>
              </div>

              {/* In-Memory vs Durable Breakdown */}
              <div className="pt-3 border-t border-ink-800/80 font-mono text-[11px] space-y-1.5">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-copper-400" />
                    Pending (Redis):
                  </span>
                  <span className="text-copper-400 font-semibold tabular-nums">
                    +{stats.pending.toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    Durable (Postgres):
                  </span>
                  <span className="text-slate-300 tabular-nums">
                    {stats.durable.toLocaleString()}
                  </span>
                </div>

                {/* Quick Ingestion Buttons */}
                <div className="grid grid-cols-2 gap-2 mt-3 pt-2">
                  <button
                    onClick={() => handleSendEvent(feat.key, 100)}
                    disabled={isEmitting}
                    className="px-2 py-1.5 rounded bg-ink-950 hover:bg-copper-500/10 hover:text-copper-400 text-[11px] font-sans font-medium text-slate-300 border border-ink-800 hover:border-copper-500/40 transition disabled:opacity-50"
                  >
                    +100
                  </button>
                  <button
                    onClick={() => handleSendEvent(feat.key, 500)}
                    disabled={isEmitting}
                    className="px-2 py-1.5 rounded bg-ink-950 hover:bg-copper-500/10 hover:text-copper-400 text-[11px] font-sans font-medium text-slate-300 border border-ink-800 hover:border-copper-500/40 transition disabled:opacity-50"
                  >
                    +500
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Event Simulation Card */}
      <div className="bg-ink-900 border border-ink-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-copper-400" />
            <h3 className="text-sm font-bold text-slate-200">Interactive Event Emitter</h3>
          </div>
          {lastEmittedEvent && (
            <span className="text-xs font-mono text-emerald-400 bg-emerald-950/40 px-2.5 py-1 rounded border border-emerald-800/50">
              ✓ {lastEmittedEvent}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Emit test usage events directly to <code className="text-copper-300 font-mono">POST /events</code> to watch the mechanical meters and Redis buffer tick up in real time.
        </p>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => handleSendEvent('api_calls', 250)}
            className="px-3 py-2 rounded-lg bg-ink-800 hover:bg-copper-500/20 hover:border-copper-500/50 text-slate-200 text-xs font-medium border border-ink-700 transition"
          >
            ⚡ Emit 250 API Calls
          </button>
          <button
            onClick={() => handleSendEvent('ai_tokens', 1500)}
            className="px-3 py-2 rounded-lg bg-ink-800 hover:bg-indigo-500/20 hover:border-indigo-500/50 text-slate-200 text-xs font-medium border border-ink-700 transition"
          >
            ✨ Emit 1,500 LLM Tokens
          </button>
          <button
            onClick={() => handleSendEvent('storage_gb', 25)}
            className="px-3 py-2 rounded-lg bg-ink-800 hover:bg-cyan-500/20 hover:border-cyan-500/50 text-slate-200 text-xs font-medium border border-ink-700 transition"
          >
            💾 Emit 25 GB Storage
          </button>
          <button
            onClick={() => handleSendEvent('compute_hours', 10)}
            className="px-3 py-2 rounded-lg bg-ink-800 hover:bg-emerald-500/20 hover:border-emerald-500/50 text-slate-200 text-xs font-medium border border-ink-700 transition"
          >
            ⚙️ Emit 10 Compute Hours
          </button>
        </div>
      </div>
    </div>
  );
};
