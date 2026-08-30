import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Zap,
  Flame,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { api } from '../../api/client';

interface IdempotencyPlaygroundProps {
  customerId: string;
}

interface EventLogEntry {
  id: string;
  requestId: number;
  eventId: string;
  status: 'accepted' | 'duplicate' | 'error';
  httpCode: number;
  responseTimeMs: number;
  timestamp: string;
}

export const IdempotencyPlayground: React.FC<IdempotencyPlaygroundProps> = ({
  customerId,
}) => {
  const [logs, setLogs] = useState<EventLogEntry[]>([]);
  const [isRunningSingle, setIsRunningSingle] = useState(false);
  const [isRunningDuplicate, setIsRunningDuplicate] = useState(false);
  const [isRunningStorm, setIsRunningStorm] = useState(false);
  const [activeEventId, setActiveEventId] = useState<string>(
    `evt_idemp_${Math.floor(Date.now() / 1000)}`,
  );

  const generateNewId = () => {
    setActiveEventId(`evt_idemp_${Date.now()}`);
  };

  const sendEventWithId = async (
    eventId: string,
    reqIdx: number,
    qty: number = 100,
  ): Promise<EventLogEntry> => {
    const startTime = performance.now();
    try {
      const res = await api.ingestion.ingest({
        event_id: eventId,
        customer_id: customerId,
        feature_key: 'api_calls',
        quantity: qty,
        timestamp: new Date().toISOString(),
      });
      const duration = Math.round(performance.now() - startTime);

      return {
        id: `${eventId}_req_${reqIdx}_${Math.random()}`,
        requestId: reqIdx,
        eventId,
        status: res.status,
        httpCode: res.status === 'accepted' ? 202 : 200,
        responseTimeMs: duration,
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      const duration = Math.round(performance.now() - startTime);
      return {
        id: `${eventId}_req_${reqIdx}_err`,
        requestId: reqIdx,
        eventId,
        status: 'error',
        httpCode: err.status || 500,
        responseTimeMs: duration,
        timestamp: new Date().toISOString(),
      };
    }
  };

  // Test 1: Send Single Event
  const handleSendInitial = async () => {
    setIsRunningSingle(true);
    const log = await sendEventWithId(activeEventId, 1, 100);
    setLogs((prev) => [log, ...prev]);
    setIsRunningSingle(false);
  };

  // Test 2: Send Duplicate of Active Event ID
  const handleSendDuplicate = async () => {
    setIsRunningDuplicate(true);
    const log = await sendEventWithId(activeEventId, 2, 100);
    setLogs((prev) => [log, ...prev]);
    setIsRunningDuplicate(false);
  };

  // Test 3: Launch Concurrent Storm (20 requests with same event_id in parallel)
  const handleLaunchStorm = async () => {
    setIsRunningStorm(true);
    const stormEventId = `evt_storm_${Date.now()}`;
    setActiveEventId(stormEventId);

    // Dispatch 20 concurrent requests
    const promises = Array.from({ length: 20 }, (_, idx) =>
      sendEventWithId(stormEventId, idx + 1, 50),
    );

    const results = await Promise.all(promises);
    setLogs((prev) => [...results, ...prev]);
    setIsRunningStorm(false);
  };

  const totalAccepted = logs.filter((l) => l.status === 'accepted').length;
  const totalDuplicates = logs.filter((l) => l.status === 'duplicate').length;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-ink-900/80 p-5 rounded-xl border border-ink-800 backdrop-blur">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert className="w-5 h-5 text-copper-400" />
            <h2 className="text-lg font-bold text-white tracking-tight font-sans">
              Database-Enforced Idempotency Playground
            </h2>
          </div>
          <p className="text-xs text-slate-400">
            Verify duplicate event suppression in 10 seconds. MeterFlow guarantees zero double-counting via database-level <code className="text-copper-300 font-mono">@unique(event_id)</code> constraints.
          </p>
        </div>

        <button
          onClick={() => setLogs([])}
          className="p-2 rounded-lg bg-ink-800 hover:bg-ink-700 text-slate-300 border border-ink-700 text-xs font-mono"
        >
          Clear Log
        </button>
      </div>

      {/* Target Event ID Card */}
      <div className="bg-ink-900 border border-ink-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-xs font-mono font-semibold text-slate-400 uppercase block mb-1">
              Active Test Event ID (Deduplication Key)
            </span>
            <div className="flex items-center gap-2">
              <code className="px-3 py-1.5 rounded-lg bg-ink-950 border border-ink-700 font-mono text-sm text-copper-400 font-bold">
                {activeEventId}
              </code>
              <button
                onClick={generateNewId}
                className="px-2.5 py-1.5 rounded-lg bg-ink-800 hover:bg-ink-700 text-xs text-slate-300 border border-ink-700 font-mono"
              >
                Generate New Key
              </button>
            </div>
          </div>

          {/* Verification Metrics */}
          <div className="flex items-center gap-4 font-mono text-xs">
            <div className="bg-ink-950 p-3 rounded-lg border border-ink-800 text-center">
              <span className="text-slate-500 uppercase block text-[10px]">Total Sent</span>
              <span className="text-base font-bold text-slate-200">{logs.length}</span>
            </div>
            <div className="bg-ink-950 p-3 rounded-lg border border-emerald-800/40 text-center">
              <span className="text-emerald-400 uppercase block text-[10px]">Ingested (202)</span>
              <span className="text-base font-bold text-emerald-400">{totalAccepted}</span>
            </div>
            <div className="bg-ink-950 p-3 rounded-lg border border-copper-800/40 text-center">
              <span className="text-copper-400 uppercase block text-[10px]">Suppressed (200)</span>
              <span className="text-base font-bold text-copper-400">{totalDuplicates}</span>
            </div>
          </div>
        </div>

        {/* Action Triggers */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t border-ink-800">
          <button
            onClick={handleSendInitial}
            disabled={isRunningSingle || isRunningStorm}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-ink-950 hover:bg-ink-800 text-slate-200 border border-ink-700 text-xs font-semibold transition disabled:opacity-50"
          >
            <Zap className="w-4 h-4 text-emerald-400" />
            <span>1. Send First Event (202 Accepted)</span>
          </button>

          <button
            onClick={handleSendDuplicate}
            disabled={isRunningDuplicate || isRunningStorm}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-ink-950 hover:bg-ink-800 text-copper-300 border border-copper-500/40 text-xs font-semibold transition disabled:opacity-50"
          >
            <RefreshCw className="w-4 h-4 text-copper-400" />
            <span>2. Replay Duplicate ID (200 OK)</span>
          </button>

          <button
            onClick={handleLaunchStorm}
            disabled={isRunningStorm}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-copper-500 hover:bg-copper-600 text-ink-950 text-xs font-bold shadow-lg shadow-copper-500/20 transition disabled:opacity-50"
          >
            <Flame className={`w-4 h-4 ${isRunningStorm ? 'animate-bounce' : ''}`} />
            <span>{isRunningStorm ? 'Firing 20 Storm Requests...' : '3. Launch 20x Concurrent Storm'}</span>
          </button>
        </div>
      </div>

      {/* Live Response Audit Table */}
      <div className="bg-ink-900 border border-ink-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-300 uppercase font-mono tracking-wider">
            Live Request & Deduplication Log
          </h3>
          <span className="text-[11px] text-slate-500 font-mono">
            Audit count: {logs.length} entries
          </span>
        </div>

        <div className="border border-ink-800 rounded-lg overflow-hidden font-mono text-xs">
          <div className="grid grid-cols-12 bg-ink-950 p-2.5 text-slate-500 font-bold uppercase text-[10px] border-b border-ink-800">
            <span className="col-span-2">HTTP Status</span>
            <span className="col-span-4">Event ID</span>
            <span className="col-span-3">Deduplication Result</span>
            <span className="col-span-3 text-right">Latency</span>
          </div>

          {logs.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-xs">
              No events fired yet. Click one of the buttons above to test idempotency live.
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto divide-y divide-ink-800/60">
              {logs.map((log) => {
                const isAccepted = log.status === 'accepted';
                return (
                  <div
                    key={log.id}
                    className="grid grid-cols-12 p-2.5 ledger-row bg-ink-900/40 items-center text-slate-200"
                  >
                    <span className="col-span-2 font-bold">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-mono ${
                          isAccepted
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : 'bg-copper-950 text-copper-300 border border-copper-800'
                        }`}
                      >
                        {log.httpCode} {isAccepted ? 'Accepted' : 'OK'}
                      </span>
                    </span>

                    <span className="col-span-4 text-slate-300 truncate text-[11px]">
                      {log.eventId}
                    </span>

                    <span className="col-span-3 flex items-center gap-1.5">
                      {isAccepted ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-300 text-[11px]">New Event Recorded</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-3.5 h-3.5 text-copper-400" />
                          <span className="text-copper-300 text-[11px]">Duplicate Suppressed</span>
                        </>
                      )}
                    </span>

                    <span className="col-span-3 text-right text-slate-400 tabular-nums">
                      {log.responseTimeMs} ms
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
