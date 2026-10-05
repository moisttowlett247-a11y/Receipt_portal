import React, { useState, useEffect } from 'react';
import {
  FileText,
  DollarSign,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Download,
  Filter,
  Search,
  Building,
  MapPin,
  HelpCircle,
  ExternalLink,
  Sparkles,
  Info,
  Calendar,
  Check,
  X,
  FileSpreadsheet,
  Clock,
  Layers,
  ArrowRight,
  Eye
} from 'lucide-react';
import { 
  W2Record, 
  Form1099Record, 
  NO_INCOME_TAX_STATES, 
  US_STATES_MAP 
} from '../taxDocumentTypes';
import { 
  getW2Records, 
  get1099Records, 
  saveW2Record, 
  deleteW2Record, 
  save1099Record, 
  delete1099Record, 
  seedSampleIllinoisW2, 
  seedSampleTexasW2, 
  seedSample1099NEC, 
  exportTaxDocumentsCSV,
  subscribeToTaxDocuments,
  fetchServerTaxDocs
} from '../taxDocumentService';

interface AdminTaxDocumentsCenterProps {
  onToast?: (message: string) => void;
}

export const AdminTaxDocumentsCenter: React.FC<AdminTaxDocumentsCenterProps> = ({
  onToast
}) => {
  const [w2s, setW2s] = useState<W2Record[]>(() => getW2Records());
  const [form1099s, setForm1099s] = useState<Form1099Record[]>(() => get1099Records());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'W2' | '1099'>('ALL');
  const [filterState, setFilterState] = useState<string>('ALL');
  const [filterReturnReq, setFilterReturnReq] = useState<string>('ALL');
  const [selectedDocDetails, setSelectedDocDetails] = useState<W2Record | null>(null);

  const refreshData = () => {
    setW2s(getW2Records());
    setForm1099s(get1099Records());
  };

  useEffect(() => {
    refreshData();
    fetchServerTaxDocs().then(() => refreshData());
    const unsub = subscribeToTaxDocuments(() => refreshData());
    return () => unsub();
  }, []);

  // Financial aggregates
  const totalW2Wages = w2s.reduce((acc, w) => acc + (w.box1Wages || 0), 0);
  const total1099Gross = form1099s.reduce((acc, f) => acc + (f.box1Amount || 0), 0);
  const totalGrossEarnings = totalW2Wages + total1099Gross;

  const totalFedWithheld = w2s.reduce((acc, w) => acc + (w.box2FedTaxWithheld || 0), 0) +
    form1099s.reduce((acc, f) => acc + (f.box4FedTaxWithheld || 0), 0);

  const totalStateWithheld = w2s.reduce((acc, w) => acc + (w.box17StateTaxWithheld || 0), 0) +
    form1099s.reduce((acc, f) => acc + (f.box5StateTaxWithheld || 0), 0);

  // States analysis
  const statesSet = new Set<string>();
  w2s.forEach(w => {
    if (w.box15State) statesSet.add(w.box15State.toUpperCase().trim());
  });
  form1099s.forEach(f => {
    if (f.box6State) statesSet.add(f.box6State.toUpperCase().trim());
  });
  const allStates = Array.from(statesSet).sort();

  // Filtered W2s
  const filteredW2s = w2s.filter(w => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q ||
      w.employerName.toLowerCase().includes(q) ||
      w.clientName.toLowerCase().includes(q) ||
      w.box15State.toLowerCase().includes(q) ||
      w.employerEin.toLowerCase().includes(q);

    const matchesState = filterState === 'ALL' || w.box15State.toUpperCase() === filterState;
    const matchesReturn = filterReturnReq === 'ALL' ||
      (filterReturnReq === 'REQUIRED' && w.stateAssessment?.stateReturnRequired) ||
      (filterReturnReq === 'NO_RETURN' && !w.stateAssessment?.stateReturnRequired);

    return matchesSearch && matchesState && matchesReturn;
  });

  // Filtered 1099s
  const filtered1099s = form1099s.filter(f => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q ||
      f.payerName.toLowerCase().includes(q) ||
      f.clientName.toLowerCase().includes(q) ||
      f.box6State.toLowerCase().includes(q);

    const matchesState = filterState === 'ALL' || f.box6State.toUpperCase() === filterState;
    const matchesReturn = filterReturnReq === 'ALL' ||
      (filterReturnReq === 'REQUIRED' && f.stateAssessment?.stateReturnRequired) ||
      (filterReturnReq === 'NO_RETURN' && !f.stateAssessment?.stateReturnRequired);

    return matchesSearch && matchesState && matchesReturn;
  });

  const handleToggleVerifyW2 = (w2: W2Record) => {
    saveW2Record({
      ...w2,
      verifiedByAdmin: !w2.verifiedByAdmin,
      verifiedAt: !w2.verifiedByAdmin ? new Date().toISOString() : undefined
    });
    refreshData();
    if (onToast) onToast(`Updated verification status for ${w2.employerName}`);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-stone-900 via-stone-900 to-stone-950 border border-stone-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-semibold">
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Admin Review • Individual Income, W-2 &amp; 1099 Tax Documents</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Centralized W-2, 1099 &amp; State Tax Compliance Hub
          </h2>
          <p className="text-xs sm:text-sm text-stone-300 leading-relaxed">
            Review and audit individual tax forms submitted by non-business filers, employees, and sole proprietors. 
            The engine automatically determines state tax filing obligations across all 50 states, isolates zero-tax states 
            like Texas and Florida, and formats documents for Form 1040 preparation.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => exportTaxDocumentsCSV()}
            disabled={w2s.length === 0 && form1099s.length === 0}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-xs transition-all flex items-center gap-2 cursor-pointer shadow-md shadow-emerald-600/10"
          >
            <Download className="w-4 h-4" />
            <span>Export Master Tax Schedule (CSV)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              seedSampleIllinoisW2('client_corp', 'Alice Johnson');
              seedSampleTexasW2('client_corp', 'Bob Davis');
              seedSample1099NEC('client_corp', 'Carol Smith');
              refreshData();
              if (onToast) onToast('Seeded diverse multi-state tax documents (IL, TX, CA)');
            }}
            className="px-3.5 py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 font-semibold text-xs transition-all flex items-center gap-2 cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Seed Multi-State Batch</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-stone-900/80 border border-stone-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-stone-400">
            <span>Total Gross Compensation</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-white font-mono">
            ${totalGrossEarnings.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-stone-500">
            {w2s.length} W-2 forms • {form1099s.length} 1099 forms
          </p>
        </div>

        <div className="p-4 rounded-xl bg-stone-900/80 border border-stone-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-stone-400">
            <span>Total Federal Withholding</span>
            <ShieldCheck className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-300 font-mono">
            ${totalFedWithheld.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-stone-500">
            Reported in Box 2 &amp; Box 4
          </p>
        </div>

        <div className="p-4 rounded-xl bg-stone-900/80 border border-stone-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-stone-400">
            <span>Total State Withholding</span>
            <MapPin className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-sky-300 font-mono">
            ${totalStateWithheld.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-stone-500">
            {allStates.length > 0 ? `Across ${allStates.join(', ')}` : 'No state tax'}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-stone-900/80 border border-stone-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-stone-400">
            <span>Active State Jurisdictions</span>
            <Building className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-white font-mono">
            {allStates.length} State(s)
          </div>
          <p className="text-[11px] text-stone-500">
            {allStates.filter(s => NO_INCOME_TAX_STATES[s]).length} Zero-Tax states represented
          </p>
        </div>
      </div>

      {/* State Breakdown Matrix */}
      {allStates.length > 0 && (
        <div className="p-4 rounded-xl bg-stone-900/60 border border-stone-800 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-stone-200 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-amber-400" />
              <span>Multi-State Income &amp; Withholding Roster</span>
            </h3>
            <span className="text-[11px] text-stone-400 font-mono">
              Auto-differentiates state returns vs zero-tax states
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {allStates.map(st => {
              const isNoTax = Boolean(NO_INCOME_TAX_STATES[st]);
              const stName = US_STATES_MAP[st] || st;
              const w2InState = w2s.filter(w => (w.box15State || '').toUpperCase() === st);
              const fInState = form1099s.filter(f => (f.box6State || '').toUpperCase() === st);
              const totalWages = w2InState.reduce((a, b) => a + (b.box16StateWages || b.box1Wages || 0), 0) +
                fInState.reduce((a, b) => a + (b.box7StateIncome || b.box1Amount || 0), 0);
              const totalWithheld = w2InState.reduce((a, b) => a + (b.box17StateTaxWithheld || 0), 0) +
                fInState.reduce((a, b) => a + (b.box5StateTaxWithheld || 0), 0);

              return (
                <div
                  key={st}
                  className={`p-3.5 rounded-xl border text-xs space-y-1.5 ${
                    isNoTax
                      ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-200'
                      : totalWithheld > 0
                      ? 'bg-amber-950/20 border-amber-800/40 text-amber-200'
                      : 'bg-stone-950 border-stone-800 text-stone-300'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold">
                    <span className="text-sm">{stName} ({st})</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                      isNoTax ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                    }`}>
                      {isNoTax ? 'ZERO STATE TAX' : 'RETURN REQUIRED'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
                    <div>
                      <span className="text-stone-400 block text-[10px]">Reported Wages</span>
                      <span className="font-bold">${totalWages.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-stone-400 block text-[10px]">Tax Withheld</span>
                      <span className="font-bold text-sky-400">${totalWithheld.toLocaleString()}</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-stone-400 pt-1">
                    {isNoTax
                      ? 'No personal state income tax levied on wages.'
                      : `${w2InState.length + fInState.length} document(s) requiring state tax schedule.`}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Search & Filters */}
      <div className="p-4 rounded-xl bg-stone-900/90 border border-stone-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-stone-400 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by employer, client name, EIN, or state..."
            className="w-full px-3 py-1.5 bg-stone-950 border border-stone-800 rounded-lg text-stone-200 focus:outline-none focus:border-amber-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Document Type Filter */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="px-2.5 py-1.5 bg-stone-950 border border-stone-800 rounded-lg text-stone-300 focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">All Types (W-2 &amp; 1099)</option>
            <option value="W2">W-2 Wage Statements</option>
            <option value="1099">1099-NEC / MISC</option>
          </select>

          {/* State Filter */}
          <select
            value={filterState}
            onChange={(e) => setFilterState(e.target.value)}
            className="px-2.5 py-1.5 bg-stone-950 border border-stone-800 rounded-lg text-stone-300 focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">All States</option>
            {allStates.map(st => (
              <option key={st} value={st}>{st} - {US_STATES_MAP[st] || st}</option>
            ))}
          </select>

          {/* Return Required Filter */}
          <select
            value={filterReturnReq}
            onChange={(e) => setFilterReturnReq(e.target.value)}
            className="px-2.5 py-1.5 bg-stone-950 border border-stone-800 rounded-lg text-stone-300 focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">All Return Statuses</option>
            <option value="REQUIRED">State Return Required</option>
            <option value="NO_RETURN">No State Return (Zero Tax)</option>
          </select>
        </div>
      </div>

      {/* Main Table */}
      <div className="rounded-2xl bg-stone-900/90 border border-stone-800 overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-950/80 border-b border-stone-800 text-stone-400 font-mono">
              <tr>
                <th className="py-3 px-4">Form</th>
                <th className="py-3 px-4">Client / Taxpayer</th>
                <th className="py-3 px-4">Employer / Payer</th>
                <th className="py-3 px-4">Year</th>
                <th className="py-3 px-4 text-right">Box 1 Wages / Comp</th>
                <th className="py-3 px-4 text-right">Box 2/4 Fed Tax</th>
                <th className="py-3 px-4">Box 15 State</th>
                <th className="py-3 px-4 text-right">Box 17 State Tax</th>
                <th className="py-3 px-4">State Compliance Status</th>
                <th className="py-3 px-4 text-center">Audit</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-800/60 font-sans">
              {/* Render W-2s */}
              {(filterType === 'ALL' || filterType === 'W2') && filteredW2s.map((w) => {
                const assessment = w.stateAssessment;
                const isNoTax = assessment?.statusBadge === 'NO_TAX_STATE';

                return (
                  <tr key={w.id} className="hover:bg-stone-850/50 transition-colors">
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-500/10 text-purple-300 border border-purple-500/20 font-bold">
                        W-2
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-white">
                      {w.clientName}
                      <div className="text-[10px] text-stone-500 font-mono">{w.employeeSsnMasked}</div>
                    </td>
                    <td className="py-3 px-4 text-stone-300">
                      <div className="font-medium text-stone-200">{w.employerName}</div>
                      <div className="text-[10px] text-stone-500 font-mono">EIN: {w.employerEin}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-stone-400">{w.taxYear}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-white">
                      ${w.box1Wages.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-amber-300">
                      ${w.box2FedTaxWithheld.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold">
                      <span className={`px-2 py-0.5 rounded ${
                        isNoTax ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-stone-800 text-stone-200'
                      }`}>
                        {w.box15State || 'N/A'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-sky-300">
                      ${w.box17StateTaxWithheld.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border ${
                        isNoTax
                          ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                          : 'bg-amber-950/40 border-amber-500/30 text-amber-300'
                      }`}>
                        {isNoTax ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                        <span>{assessment?.summaryMessage || `${w.box15State} Analysis`}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleVerifyW2(w)}
                        className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                          w.verifiedByAdmin
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-stone-800 text-stone-400 hover:text-white'
                        }`}
                      >
                        {w.verifiedByAdmin ? 'Verified' : 'Verify'}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedDocDetails(w)}
                          className="p-1.5 rounded-lg text-stone-400 hover:text-amber-400 hover:bg-stone-800 transition-colors cursor-pointer"
                          title="View Box Breakdown"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            deleteW2Record(w.id);
                            refreshData();
                            if (onToast) onToast(`Deleted W-2 for ${w.employerName}`);
                          }}
                          className="p-1.5 rounded-lg text-stone-400 hover:text-rose-400 hover:bg-stone-800 transition-colors cursor-pointer"
                          title="Delete Record"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {/* Render 1099s */}
              {(filterType === 'ALL' || filterType === '1099') && filtered1099s.map((f) => {
                const assessment = f.stateAssessment;
                const isNoTax = assessment?.statusBadge === 'NO_TAX_STATE';

                return (
                  <tr key={f.id} className="hover:bg-stone-850/50 transition-colors">
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-sky-500/10 text-sky-300 border border-sky-500/20 font-bold">
                        {f.formType === '1099_NEC' ? '1099-NEC' : '1099-MISC'}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-white">
                      {f.clientName}
                    </td>
                    <td className="py-3 px-4 text-stone-300">
                      <div className="font-medium text-stone-200">{f.payerName}</div>
                      <div className="text-[10px] text-stone-500 font-mono">TIN: {f.payerTin}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-stone-400">{f.taxYear}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-white">
                      ${f.box1Amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-amber-300">
                      ${f.box4FedTaxWithheld.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold">
                      <span className="px-2 py-0.5 rounded bg-stone-800 text-stone-200">
                        {f.box6State || 'N/A'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-sky-300">
                      ${f.box5StateTaxWithheld.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border bg-stone-950 border-stone-800 text-stone-300">
                        <span>{assessment?.summaryMessage || `${f.box6State} Analysis`}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-[10px] font-mono text-stone-500">Auto-Verified</span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          delete1099Record(f.id);
                          refreshData();
                          if (onToast) onToast(`Deleted 1099 for ${f.payerName}`);
                        }}
                        className="p-1.5 rounded-lg text-stone-400 hover:text-rose-400 hover:bg-stone-800 transition-colors cursor-pointer"
                        title="Delete Record"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filteredW2s.length === 0 && filtered1099s.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-stone-500 text-xs">
                    No individual tax documents found matching current filter parameters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedDocDetails && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">
                  Form W-2 Complete Box Audit: {selectedDocDetails.employerName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDocDetails(null)}
                className="p-1 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-stone-950 border border-stone-800 space-y-1">
                <div className="font-bold text-stone-200">State Filing Recommendation</div>
                <p className="text-stone-400">{selectedDocDetails.stateAssessment?.filingAdvice}</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-2.5 rounded-xl bg-stone-950 border border-stone-800">
                  <div className="text-[10px] text-stone-500 font-mono">Box 1 • Wages</div>
                  <div className="font-bold font-mono text-white">${selectedDocDetails.box1Wages.toLocaleString()}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-stone-950 border border-stone-800">
                  <div className="text-[10px] text-amber-400 font-mono">Box 2 • Fed Tax</div>
                  <div className="font-bold font-mono text-amber-300">${selectedDocDetails.box2FedTaxWithheld.toLocaleString()}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-stone-950 border border-stone-800">
                  <div className="text-[10px] text-stone-500 font-mono">Box 3 • SS Wages</div>
                  <div className="font-bold font-mono text-stone-300">${selectedDocDetails.box3SocialSecurityWages.toLocaleString()}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-stone-950 border border-stone-800">
                  <div className="text-[10px] text-stone-500 font-mono">Box 4 • SS Tax</div>
                  <div className="font-bold font-mono text-stone-300">${selectedDocDetails.box4SocialSecurityTax.toLocaleString()}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-stone-950 border border-stone-800">
                  <div className="text-[10px] text-stone-500 font-mono">Box 5 • Medicare Wages</div>
                  <div className="font-bold font-mono text-stone-300">${selectedDocDetails.box5MedicareWages.toLocaleString()}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-stone-950 border border-stone-800">
                  <div className="text-[10px] text-stone-500 font-mono">Box 6 • Medicare Tax</div>
                  <div className="font-bold font-mono text-stone-300">${selectedDocDetails.box6MedicareTax.toLocaleString()}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-stone-950 border border-stone-800">
                  <div className="text-[10px] text-stone-500 font-mono">Box 15 • State Code</div>
                  <div className="font-bold font-mono text-white">{selectedDocDetails.box15State}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-stone-950 border border-stone-800">
                  <div className="text-[10px] text-stone-500 font-mono">Box 16 • State Wages</div>
                  <div className="font-bold font-mono text-stone-300">${selectedDocDetails.box16StateWages.toLocaleString()}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-stone-950 border border-stone-800">
                  <div className="text-[10px] text-sky-400 font-mono">Box 17 • State Withheld</div>
                  <div className="font-bold font-mono text-sky-300">${selectedDocDetails.box17StateTaxWithheld.toLocaleString()}</div>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-stone-800">
              <button
                type="button"
                onClick={() => setSelectedDocDetails(null)}
                className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold cursor-pointer"
              >
                Close Audit View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
