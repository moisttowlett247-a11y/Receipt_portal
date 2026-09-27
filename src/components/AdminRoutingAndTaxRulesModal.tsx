import React, { useState } from 'react';
import {
  GitMerge,
  Sliders,
  Plus,
  Trash2,
  CheckCircle2,
  ShieldCheck,
  Mail,
  Building2,
  Sparkles,
  ArrowRight,
  Info,
  Tag
} from 'lucide-react';
import {
  IngestionRoutingRule,
  TaxLineOverrideRule,
  getIngestionRoutingRules,
  saveIngestionRoutingRule,
  deleteIngestionRoutingRule,
  getTaxLineOverrides,
  saveTaxLineOverride,
  deleteTaxLineOverride
} from '../adminTaxRulesService';
import { IRS_SCHEDULE_C_LINES, IRS_SCHEDULE_F_LINES } from '../taxScheduleService';

interface AdminRoutingAndTaxRulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onToast?: (msg: string) => void;
}

export const AdminRoutingAndTaxRulesModal: React.FC<AdminRoutingAndTaxRulesModalProps> = ({
  isOpen,
  onClose,
  onToast
}) => {
  const [activeTab, setActiveTab] = useState<'routing' | 'overrides'>('routing');
  const [routingRules, setRoutingRules] = useState<IngestionRoutingRule[]>(() => getIngestionRoutingRules());
  const [taxOverrides, setTaxOverrides] = useState<TaxLineOverrideRule[]>(() => getTaxLineOverrides());

  // Form State: Ingestion Routing
  const [routePattern, setRoutePattern] = useState('');
  const [routeType, setRouteType] = useState<IngestionRoutingRule['matchType']>('DOMAIN');
  const [routeClientName, setRouteClientName] = useState('');
  const [routeClientId, setRouteClientId] = useState('');
  const [routeHint, setRouteHint] = useState('Farm:General');

  // Form State: Tax Override
  const [vendorPattern, setVendorPattern] = useState('');
  const [lineKeyword, setLineKeyword] = useState('');
  const [targetSchedule, setTargetSchedule] = useState<'SCHEDULE_C' | 'SCHEDULE_F'>('SCHEDULE_F');
  const [targetLine, setTargetLine] = useState('Line 24');

  if (!isOpen) return null;

  const handleCreateRouteRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!routePattern.trim() || !routeClientName.trim()) return;

    saveIngestionRoutingRule({
      matchPattern: routePattern.trim(),
      matchType: routeType,
      assignToClientId: routeClientId.trim() || `client-${routeClientName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      assignToClientName: routeClientName.trim(),
      defaultCategoryHint: routeHint.trim(),
      autoApprove: true,
      enabled: true
    });

    setRoutingRules(getIngestionRoutingRules());
    setRoutePattern('');
    setRouteClientName('');
    setRouteClientId('');
    if (onToast) onToast('Client ingestion routing rule saved!');
  };

  const handleDeleteRouteRule = (id: string) => {
    deleteIngestionRoutingRule(id);
    setRoutingRules(getIngestionRoutingRules());
  };

  const handleCreateTaxOverride = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorPattern.trim() && !lineKeyword.trim()) return;

    const lineDict = targetSchedule === 'SCHEDULE_F' ? IRS_SCHEDULE_F_LINES : IRS_SCHEDULE_C_LINES;
    const title = lineDict[targetLine] || 'Operating Expense';

    saveTaxLineOverride({
      vendorPattern: vendorPattern.trim(),
      lineKeyword: lineKeyword.trim(),
      targetSchedule,
      targetLineNumber: targetLine,
      targetLineTitle: title,
      priority: 10,
      enabled: true,
      notes: `Custom CPA classification rule for ${vendorPattern || 'keyword'}`
    });

    setTaxOverrides(getTaxLineOverrides());
    setVendorPattern('');
    setLineKeyword('');
    if (onToast) onToast('CPA tax line override saved!');
  };

  const handleDeleteTaxOverride = (id: string) => {
    deleteTaxLineOverride(id);
    setTaxOverrides(getTaxLineOverrides());
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-3xl w-full p-6 space-y-5 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-800 pb-3">
          <div className="space-y-0.5">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-amber-400" />
              <span>Ingestion Routing & Global CPA Tax Overrides</span>
            </h3>
            <p className="text-xs text-stone-400">
              Configure automatic client inbox assignment from receipts sent to <code className="text-amber-400 font-mono">receiptcheckerv@gmail.com</code> and override IRS tax schedule allocations.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-white text-sm font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-stone-800 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('routing')}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl transition-colors cursor-pointer flex items-center gap-2 border-b-2 ${
              activeTab === 'routing'
                ? 'border-amber-500 text-amber-400 bg-stone-950/60'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Email Intake Routing ({routingRules.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('overrides')}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl transition-colors cursor-pointer flex items-center gap-2 border-b-2 ${
              activeTab === 'overrides'
                ? 'border-amber-500 text-amber-400 bg-stone-950/60'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>CPA Tax Line Overrides ({taxOverrides.length})</span>
          </button>
        </div>

        <div className="overflow-y-auto space-y-4 flex-1 pr-1">
          {/* TAB 1: INGESTION ROUTING */}
          {activeTab === 'routing' && (
            <div className="space-y-4">
              <form onSubmit={handleCreateRouteRule} className="p-4 rounded-xl bg-stone-950 border border-stone-800 space-y-3 text-xs">
                <div className="font-semibold text-stone-200 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-amber-400" />
                  <span>Create Sender Intake Routing Rule</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-stone-400 mb-1">Match Type</label>
                    <select
                      value={routeType}
                      onChange={(e) => setRouteType(e.target.value as any)}
                      className="w-full bg-stone-900 border border-stone-700 rounded-lg px-2.5 py-1.5 text-stone-200"
                    >
                      <option value="DOMAIN">Email Domain (@prairiewind.com)</option>
                      <option value="EXACT_EMAIL">Exact Sender Address</option>
                      <option value="SUBJECT_KEYWORD">Email Subject Keyword</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-stone-400 mb-1">Pattern / Domain</label>
                    <input
                      type="text"
                      required
                      placeholder="@ranchcorp.com or john@ranch.com"
                      value={routePattern}
                      onChange={(e) => setRoutePattern(e.target.value)}
                      className="w-full bg-stone-900 border border-stone-700 rounded-lg px-2.5 py-1.5 text-stone-200 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-stone-400 mb-1">Assign to Client</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Silver Spur Ranch LLC"
                      value={routeClientName}
                      onChange={(e) => setRouteClientName(e.target.value)}
                      className="w-full bg-stone-900 border border-stone-700 rounded-lg px-2.5 py-1.5 text-stone-200"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold cursor-pointer"
                  >
                    Add Routing Rule
                  </button>
                </div>
              </form>

              {/* Rules List */}
              <div className="space-y-2">
                {routingRules.map((rule) => (
                  <div key={rule.id} className="p-3 rounded-xl bg-stone-950/70 border border-stone-800 flex items-center justify-between text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-amber-400">{rule.matchPattern}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-stone-800 text-stone-300 font-mono">
                          {rule.matchType}
                        </span>
                      </div>
                      <div className="text-[11px] text-stone-400 flex items-center gap-1.5">
                        <ArrowRight className="w-3 h-3 text-stone-500" />
                        <span>Routes to: <strong className="text-stone-200">{rule.assignToClientName}</strong></span>
                        <span>• Default: {rule.defaultCategoryHint || 'Auto'}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteRouteRule(rule.id)}
                      className="p-1.5 text-stone-500 hover:text-rose-400"
                      title="Delete rule"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: CPA TAX OVERRIDES */}
          {activeTab === 'overrides' && (
            <div className="space-y-4">
              <form onSubmit={handleCreateTaxOverride} className="p-4 rounded-xl bg-stone-950 border border-stone-800 space-y-3 text-xs">
                <div className="font-semibold text-stone-200 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-amber-400" />
                  <span>Create Vendor Tax Line Override</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-stone-400 mb-1">Vendor Contains</label>
                    <input
                      type="text"
                      placeholder="e.g. Tractor Supply, Agway, Shell"
                      value={vendorPattern}
                      onChange={(e) => setVendorPattern(e.target.value)}
                      className="w-full bg-stone-900 border border-stone-700 rounded-lg px-2.5 py-1.5 text-stone-200"
                    />
                  </div>

                  <div>
                    <label className="block text-stone-400 mb-1">Line Item / Memo Keyword (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Fencing, Oil, Fertilizer"
                      value={lineKeyword}
                      onChange={(e) => setLineKeyword(e.target.value)}
                      className="w-full bg-stone-900 border border-stone-700 rounded-lg px-2.5 py-1.5 text-stone-200"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-stone-400 mb-1">Target Tax Schedule</label>
                    <select
                      value={targetSchedule}
                      onChange={(e) => setTargetSchedule(e.target.value as any)}
                      className="w-full bg-stone-900 border border-stone-700 rounded-lg px-2.5 py-1.5 text-stone-200"
                    >
                      <option value="SCHEDULE_F">Schedule F (Farm - Form 1040)</option>
                      <option value="SCHEDULE_C">Schedule C (Small Business - Form 1040)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-stone-400 mb-1">Target IRS Line Item</label>
                    <select
                      value={targetLine}
                      onChange={(e) => setTargetLine(e.target.value)}
                      className="w-full bg-stone-900 border border-stone-700 rounded-lg px-2.5 py-1.5 text-stone-200"
                    >
                      {targetSchedule === 'SCHEDULE_F' ? (
                        Object.entries(IRS_SCHEDULE_F_LINES).map(([k, v]) => (
                          <option key={k} value={k}>{k}: {v}</option>
                        ))
                      ) : (
                        Object.entries(IRS_SCHEDULE_C_LINES).map(([k, v]) => (
                          <option key={k} value={k}>{k}: {v}</option>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer"
                  >
                    Save Tax Override Rule
                  </button>
                </div>
              </form>

              {/* Overrides List */}
              <div className="space-y-2">
                {taxOverrides.map((ov) => (
                  <div key={ov.id} className="p-3 rounded-xl bg-stone-950/70 border border-stone-800 flex items-center justify-between text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-stone-200">
                          {ov.vendorPattern || 'Any Vendor'}
                          {ov.lineKeyword && <span className="text-stone-400 font-normal"> (Keyword: "{ov.lineKeyword}")</span>}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                          ov.targetSchedule === 'SCHEDULE_F'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/30'
                            : 'bg-sky-950 text-sky-300 border border-sky-800/30'
                        }`}>
                          {ov.targetSchedule === 'SCHEDULE_F' ? 'Sched F' : 'Sched C'} {ov.targetLineNumber}
                        </span>
                      </div>
                      <div className="text-[11px] text-stone-400">
                        {ov.targetLineTitle}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteTaxOverride(ov.id)}
                      className="p-1.5 text-stone-500 hover:text-rose-400"
                      title="Delete override"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-stone-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg text-xs font-semibold cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
