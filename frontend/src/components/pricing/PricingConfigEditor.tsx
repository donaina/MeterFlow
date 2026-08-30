import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  Calculator,
} from 'lucide-react';
import {
  api,
  type Plan,
  type PlanPricingConfig,
  type PreviewPricingResponse,
} from '../../api/client';

export const PricingConfigEditor: React.FC = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [activePlan, setActivePlan] = useState<Plan | null>(null);

  // Editor states
  const [editorMode, setEditorMode] = useState<'visual' | 'json'>('visual');
  const [jsonConfigStr, setJsonConfigStr] = useState<string>('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Visual form config
  const [flatFeeCents, setFlatFeeCents] = useState<number>(3000);
  const [flatFeeDesc, setFlatFeeDesc] = useState<string>('Base Subscription Fee');
  const [tiers, setTiers] = useState<
    Array<{ from: number; to: number | null; rate_cents: number }>
  >([
    { from: 0, to: 1000, rate_cents: 0 },
    { from: 1000, to: 5000, rate_cents: 5 },
    { from: 5000, to: null, rate_cents: 2 },
  ]);

  // Preview usage inputs
  const [previewUsage, setPreviewUsage] = useState<Record<string, number>>({
    api_calls: 3500,
    storage_gb: 60,
  });

  // Calculated preview
  const [previewResult, setPreviewResult] = useState<PreviewPricingResponse | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // Fetch available plans on mount
  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    try {
      const list = await api.plans.list();
      setPlans(list);
      if (list.length > 0 && !selectedPlanId) {
        selectPlan(list[0]);
      }
    } catch (err) {
      console.error('Error loading plans:', err);
    }
  };

  const selectPlan = (plan: Plan) => {
    setSelectedPlanId(plan.id);
    setActivePlan(plan);
    const cfg = plan.pricingConfig;
    setJsonConfigStr(JSON.stringify(cfg, null, 2));

    // Populate visual editor
    setFlatFeeCents(cfg.flat_fee?.amount_cents || 0);
    setFlatFeeDesc(cfg.flat_fee?.description || 'Base Subscription');

    const tieredRule = cfg.rules?.find((r) => r.type === 'tiered_graduated');
    if (tieredRule?.config?.tiers) {
      setTiers(tieredRule.config.tiers);
    }
  };

  // Recalculate preview whenever visual config or test usage changes
  useEffect(() => {
    calculateLivePreview();
  }, [flatFeeCents, flatFeeDesc, tiers, previewUsage, editorMode, jsonConfigStr]);

  const getCurrentConfig = (): PlanPricingConfig | null => {
    if (editorMode === 'json') {
      try {
        const parsed = JSON.parse(jsonConfigStr);
        setJsonError(null);
        return parsed;
      } catch (err: any) {
        setJsonError(err.message);
        return null;
      }
    }

    return {
      flat_fee: {
        amount_cents: flatFeeCents,
        description: flatFeeDesc,
      },
      rules: [
        {
          feature_key: 'api_calls',
          type: 'tiered_graduated',
          config: {
            description: 'Graduated API Invocations',
            tiers,
          },
        },
        {
          feature_key: 'storage_gb',
          type: 'per_unit',
          config: {
            description: 'Persistent Storage Volume',
            rate_cents: 10,
            free_allowance: 20,
          },
        },
      ],
    };
  };

  const calculateLivePreview = async () => {
    const config = getCurrentConfig();
    if (!config) return;

    try {
      const res = await api.pricing.preview({
        pricing_config: config,
        usage: previewUsage,
      });
      setPreviewResult(res);
    } catch (err) {
      console.error('Preview error:', err);
    }
  };

  const handleSavePlan = async () => {
    const config = getCurrentConfig();
    if (!config || !selectedPlanId) return;

    try {
      setIsSaving(true);
      setSaveSuccessMessage(null);
      const updated = await api.plans.update(selectedPlanId, {
        pricing_config: config,
      });
      setActivePlan(updated);
      setSaveSuccessMessage(
        `Plan updated to Version ${updated.version} with ZERO code redeployment!`,
      );
      loadPlans();
    } catch (err: any) {
      alert(`Save failed: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const addTier = () => {
    const lastTier = tiers[tiers.length - 1];
    const newFrom = lastTier ? (lastTier.to || (lastTier.from + 1000)) : 0;
    setTiers([...tiers, { from: newFrom, to: newFrom + 5000, rate_cents: 2 }]);
  };

  const updateTier = (index: number, field: string, value: any) => {
    const updated = [...tiers];
    updated[index] = { ...updated[index], [field]: value };
    setTiers(updated);
  };

  const removeTier = (index: number) => {
    if (tiers.length <= 1) return;
    setTiers(tiers.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-ink-900/80 p-5 rounded-xl border border-ink-800 backdrop-blur">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sliders className="w-5 h-5 text-copper-400" />
            <h2 className="text-lg font-bold text-white tracking-tight font-sans">
              Live Dynamic Pricing Config Editor
            </h2>
            {activePlan && (
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-copper-500/20 text-copper-300 border border-copper-500/40">
                Plan v{activePlan.version}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">
            Tweak base fees and graduated tiers below. The cost engine previews changes in real time with <strong>zero redeploy</strong>.
          </p>
        </div>

        {/* Plan Switcher */}
        <div className="flex items-center gap-3">
          <select
            value={selectedPlanId}
            onChange={(e) => {
              const p = plans.find((item) => item.id === e.target.value);
              if (p) selectPlan(p);
            }}
            className="bg-ink-950 border border-ink-700 text-slate-200 text-xs font-medium rounded-lg px-3 py-2 focus:outline-none focus:border-copper-500"
          >
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} (v{p.version})
              </option>
            ))}
          </select>

          <button
            onClick={handleSavePlan}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold bg-copper-500 hover:bg-copper-600 text-ink-950 shadow-lg shadow-copper-500/20 transition disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Saving v...' : 'Save Plan & Increment Version'}</span>
          </button>
        </div>
      </div>

      {saveSuccessMessage && (
        <div className="p-3.5 bg-emerald-950/50 border border-emerald-800/70 rounded-lg text-xs text-emerald-300 font-mono flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>✓ {saveSuccessMessage}</span>
        </div>
      )}

      {/* Main 2-Column Split: Config Editor vs Real-Time Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Config Builder */}
        <div className="lg:col-span-7 bg-ink-900 border border-ink-800 rounded-xl p-5 space-y-6">
          <div className="flex items-center justify-between border-b border-ink-800 pb-3">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider font-mono">
              1. Pricing Configuration Schema
            </h3>

            {/* Mode Switcher */}
            <div className="flex rounded-lg bg-ink-950 p-1 border border-ink-800 text-xs font-medium">
              <button
                onClick={() => setEditorMode('visual')}
                className={`px-3 py-1 rounded-md transition ${
                  editorMode === 'visual'
                    ? 'bg-ink-800 text-copper-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Visual Tier Builder
              </button>
              <button
                onClick={() => setEditorMode('json')}
                className={`px-3 py-1 rounded-md transition ${
                  editorMode === 'json'
                    ? 'bg-ink-800 text-copper-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Raw JSON Schema
              </button>
            </div>
          </div>

          {editorMode === 'visual' ? (
            <div className="space-y-5">
              {/* Flat Base Subscription Fee */}
              <div className="bg-ink-950/70 p-4 rounded-lg border border-ink-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300 uppercase font-mono">
                    Base Subscription Fee
                  </span>
                  <span className="text-xs font-mono text-copper-400 font-bold">
                    ${(flatFeeCents / 100).toFixed(2)}/mo
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Description</label>
                    <input
                      type="text"
                      value={flatFeeDesc}
                      onChange={(e) => setFlatFeeDesc(e.target.value)}
                      className="w-full bg-ink-900 border border-ink-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-copper-500 font-sans"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Amount (Cents)</label>
                    <input
                      type="number"
                      value={flatFeeCents}
                      onChange={(e) => setFlatFeeCents(parseInt(e.target.value || '0', 10))}
                      className="w-full bg-ink-900 border border-ink-700 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-copper-500"
                    />
                  </div>
                </div>
              </div>

              {/* Graduated Tier Rules for API Calls */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-slate-300 uppercase font-mono block">
                      Graduated Tiers for &quot;api_calls&quot;
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Multi-bracket progressive rate calculation in integer cents
                    </span>
                  </div>
                  <button
                    onClick={addTier}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-ink-800 hover:bg-ink-700 text-xs font-medium text-copper-400 border border-ink-700 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Tier</span>
                  </button>
                </div>

                <div className="space-y-2 font-mono text-xs">
                  {tiers.map((tier, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 bg-ink-950 p-2.5 rounded-lg border border-ink-800"
                    >
                      <span className="text-slate-500 font-bold w-6 text-center">#{idx + 1}</span>

                      <div className="flex items-center gap-1.5 flex-1">
                        <span className="text-slate-500 text-[11px]">From:</span>
                        <input
                          type="number"
                          value={tier.from}
                          onChange={(e) => updateTier(idx, 'from', parseInt(e.target.value || '0', 10))}
                          className="w-16 bg-ink-900 border border-ink-700 rounded px-2 py-1 text-slate-200 text-center"
                        />

                        <span className="text-slate-500 text-[11px]">To:</span>
                        <input
                          type="text"
                          value={tier.to === null ? '∞' : tier.to}
                          onChange={(e) => {
                            const val = e.target.value.trim();
                            updateTier(idx, 'to', val === '∞' || val === '' ? null : parseInt(val, 10));
                          }}
                          className="w-16 bg-ink-900 border border-ink-700 rounded px-2 py-1 text-slate-200 text-center"
                        />
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500 text-[11px]">Rate (¢):</span>
                        <input
                          type="number"
                          value={tier.rate_cents}
                          onChange={(e) => updateTier(idx, 'rate_cents', parseInt(e.target.value || '0', 10))}
                          className="w-16 bg-ink-900 border border-ink-700 rounded px-2 py-1 text-copper-400 font-bold text-center"
                        />
                        <span className="text-slate-500 text-[11px]">/unit</span>
                      </div>

                      <button
                        onClick={() => removeTier(idx)}
                        disabled={tiers.length <= 1}
                        className="p-1 text-slate-500 hover:text-rose-400 disabled:opacity-30"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <textarea
                value={jsonConfigStr}
                onChange={(e) => setJsonConfigStr(e.target.value)}
                rows={12}
                className="w-full bg-ink-950 border border-ink-800 rounded-lg p-3 font-mono text-xs text-slate-200 focus:outline-none focus:border-copper-500"
              />
              {jsonError && (
                <div className="text-xs font-mono text-rose-400 p-2 bg-rose-950/30 rounded border border-rose-800">
                  JSON Parse Error: {jsonError}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Real-Time Live Preview */}
        <div className="lg:col-span-5 bg-ink-900 border border-ink-800 rounded-xl p-5 space-y-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-ink-800 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-copper-400" />
                <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider font-mono">
                  2. Real-Time Cost Preview
                </h3>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                Live Calculation
              </span>
            </div>

            {/* Test Usage Adjuster */}
            <div className="bg-ink-950/70 p-3.5 rounded-lg border border-ink-800 mb-4 space-y-2">
              <span className="text-[11px] font-mono font-semibold text-slate-400 uppercase block">
                Simulated Customer Usage
              </span>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div>
                  <label className="text-[10px] text-slate-500 block">API Calls:</label>
                  <input
                    type="number"
                    value={previewUsage.api_calls || 0}
                    onChange={(e) =>
                      setPreviewUsage({
                        ...previewUsage,
                        api_calls: parseInt(e.target.value || '0', 10),
                      })
                    }
                    className="w-full bg-ink-900 border border-ink-700 rounded px-2 py-1 text-slate-200"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block">Storage GB:</label>
                  <input
                    type="number"
                    value={previewUsage.storage_gb || 0}
                    onChange={(e) =>
                      setPreviewUsage({
                        ...previewUsage,
                        storage_gb: parseInt(e.target.value || '0', 10),
                      })
                    }
                    className="w-full bg-ink-900 border border-ink-700 rounded px-2 py-1 text-slate-200"
                  />
                </div>
              </div>
            </div>

            {/* Total Estimated Cost */}
            {previewResult && (
              <div className="bg-gradient-to-br from-ink-950 to-ink-900 p-4 rounded-xl border border-copper-500/30 mb-4 text-center">
                <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 block mb-1">
                  Estimated Total Invoice Amount
                </span>
                <div className="text-4xl font-black font-mono text-copper-400 tracking-tight tabular-nums">
                  ${(previewResult.total_amount_cents / 100).toFixed(2)}
                </div>
                <span className="text-[11px] font-mono text-slate-500 block mt-1">
                  {previewResult.total_amount_cents.toLocaleString()} integer cents (0 float drift)
                </span>
              </div>
            )}

            {/* Line Items Breakdown Table */}
            <div className="space-y-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
                Itemized Line Items
              </span>
              <div className="border border-ink-800 rounded-lg overflow-hidden font-mono text-xs">
                {previewResult?.line_items.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-2.5 ledger-row bg-ink-950/40"
                  >
                    <div>
                      <div className="font-semibold text-slate-200">{item.description}</div>
                      <div className="text-[10px] text-slate-500">
                        Qty: {item.quantity.toLocaleString()}
                      </div>
                    </div>
                    <div className="text-right font-bold text-slate-200 tabular-nums">
                      ${(item.amountCents / 100).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 pt-3 border-t border-ink-800/80">
            💡 <em>Notice that changing rates instantly recalculates totals above without needing to redeploy or restart any backend service.</em>
          </div>
        </div>
      </div>
    </div>
  );
};
