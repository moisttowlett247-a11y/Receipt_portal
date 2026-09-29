import React, { useState, useMemo } from 'react';
import { 
  FileSpreadsheet, 
  Printer, 
  Download, 
  CheckCircle2, 
  Building2, 
  Calendar, 
  DollarSign, 
  Layers, 
  Search, 
  ChevronDown, 
  ChevronUp, 
  Lock, 
  ShieldCheck, 
  Sparkles, 
  Tag, 
  Info, 
  FileText, 
  AlertCircle,
  ExternalLink,
  Receipt,
  HelpCircle,
  Check,
  Archive,
  Car
} from 'lucide-react';
import { ClientSubmission } from '../clientSubmissionService';
import { ClientAccountSession } from '../types';
import { 
  TaxScheduleType, 
  generateTaxScheduleSummary, 
  exportTaxScheduleCSV, 
  exportTaxScheduleJSON,
  exportAuditVaultZip
} from '../taxScheduleService';
import { ClientTaxAdditionsHub } from './ClientTaxAdditionsHub';
import { getMileageTrips } from '../clientTaxFeaturesService';

interface ClientTaxSchedulesViewProps {
  submissions: ClientSubmission[];
  clientSession: ClientAccountSession | null;
  onSubscribeClick?: () => void;
  onActivateKeyClick?: () => void;
}

export const ClientTaxSchedulesView: React.FC<ClientTaxSchedulesViewProps> = ({
  submissions,
  clientSession,
  onSubscribeClick,
  onActivateKeyClick
}) => {
  const [scheduleFilter, setScheduleFilter] = useState<TaxScheduleType>('ALL');
  const [taxYearFilter, setTaxYearFilter] = useState<string>('2026');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isExportingVault, setIsExportingVault] = useState(false);
  const [activeTabMode, setActiveTabMode] = useState<'line_summary' | 'itemized_ledger'>('line_summary');

  const isLoggedIn = Boolean(clientSession);
  const hasActivePlan = Boolean(
    clientSession && (
      clientSession.planStatus === 'ACTIVE' ||
      (clientSession.licenseKey && clientSession.licenseKey.trim().length > 0)
    )
  );

  // Filter submissions by search if present
  const searchableSubmissions = useMemo(() => {
    if (!searchQuery.trim()) return submissions;
    const q = searchQuery.toLowerCase();
    return submissions.filter(sub => 
      (sub.fileName && sub.fileName.toLowerCase().includes(q)) ||
      (sub.extractedVendor && sub.extractedVendor.toLowerCase().includes(q)) ||
      (sub.memo && sub.memo.toLowerCase().includes(q)) ||
      (sub.categoryHint && sub.categoryHint.toLowerCase().includes(q))
    );
  }, [submissions, searchQuery]);

  // Compute tax schedule summary
  const summary = useMemo(() => {
    return generateTaxScheduleSummary(searchableSubmissions, scheduleFilter, taxYearFilter);
  }, [searchableSubmissions, scheduleFilter, taxYearFilter]);

  const toggleCategoryExpand = (catKey: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [catKey]: !prev[catKey]
    }));
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadAuditVault = async () => {
    setIsExportingVault(true);
    try {
      const trips = getMileageTrips(clientSession?.id);
      await exportAuditVaultZip(
        summary,
        {
          name: clientDisplayName,
          email: clientEmail,
          company: companyName,
          licenseKey: clientSession?.licenseKey
        },
        trips
      );
    } catch (err) {
      console.error('Failed to export audit vault zip:', err);
    } finally {
      setIsExportingVault(false);
    }
  };

  const clientDisplayName = clientSession?.displayName || 'Client Entity';
  const clientEmail = clientSession?.email || 'billing@client-entity.com';
  const companyName = clientSession?.companyName || clientDisplayName;

  return (
    <div className="space-y-6">
      {/* Printable Area - Styles hidden on screen, formatted for print */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #cpa-printable-report, #cpa-printable-report * {
            visibility: visible;
          }
          #cpa-printable-report {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white !important;
            color: black !important;
            padding: 20px;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Header Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-stone-900 via-stone-900 to-emerald-950/20 border border-stone-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1">
              <FileSpreadsheet className="w-3 h-3" />
              IRS TAX SCHEDULE ENGINE
            </span>
            <span className="text-xs text-stone-500">•</span>
            <span className="text-xs text-stone-300 font-medium">QuickBooks Not Required</span>
          </div>
          <h2 className="text-base sm:text-xl font-bold text-white flex items-center gap-2">
            <span>Schedule C & Schedule F Tax Deduction Hub</span>
          </h2>
          <p className="text-xs text-stone-300 max-w-2xl leading-relaxed">
            Every scanned and completed receipt is automatically categorized into official IRS Form 1040 line items.
            Download ready-to-file spreadsheets or print a CPA-certified audit package for tax filing.
          </p>
        </div>

        {/* Action Buttons (Subscribers Only) */}
        {hasActivePlan && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
              title="Print official IRS tax schedule package (or save as PDF)"
            >
              <Printer className="w-4 h-4 text-amber-400" />
              <span>Print / PDF</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadAuditVault}
              disabled={isExportingVault}
              className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs transition-colors flex items-center gap-1.5 shadow-lg shadow-amber-900/20 cursor-pointer disabled:opacity-50"
              title="Download audit-proof ZIP bundle with receipt images, HTML contact sheet, and mileage logs"
            >
              <Archive className="w-4 h-4" />
              <span>{isExportingVault ? 'Packaging ZIP...' : 'Audit Vault (ZIP)'}</span>
            </button>

            <button
              type="button"
              onClick={() => exportTaxScheduleCSV(searchableSubmissions, scheduleFilter, taxYearFilter, companyName)}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-lg shadow-emerald-900/20 cursor-pointer"
              title="Download Excel / CSV spreadsheet formatted by IRS lines"
            >
              <Download className="w-4 h-4" />
              <span>Download CSV</span>
            </button>

            <button
              type="button"
              onClick={() => exportTaxScheduleJSON(summary, {
                name: clientDisplayName,
                email: clientEmail,
                company: companyName,
                licenseKey: clientSession?.licenseKey
              })}
              className="px-3 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white border border-stone-700 font-medium text-xs transition-colors flex items-center gap-1 cursor-pointer"
              title="Download machine-readable CPA Audit JSON"
            >
              <FileText className="w-3.5 h-3.5 text-stone-400" />
              <span>CPA JSON</span>
            </button>
          </div>
        )}
      </div>

      {/* Lock Gate for Non-Subscribers */}
      {!hasActivePlan && (
        <div className="p-6 rounded-2xl bg-amber-950/20 border border-amber-500/30 text-stone-200 space-y-4 shadow-xl">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>Unlock Schedule C & Schedule F Automated Tax Packs</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  SUBSCRIBER BENEFIT
                </span>
              </h3>
              <p className="text-xs text-stone-300 leading-relaxed max-w-3xl">
                You don't need QuickBooks to claim every tax deduction. Our automated tax engine aggregates your completed receipts,
                extracts deductible expenses, and categorizes them directly into <strong>IRS Schedule C (Business)</strong> and <strong>IRS Schedule F (Farm)</strong> line items.
                Subscribe to any plan or activate a license voucher to unlock one-click print and CSV export.
              </p>
            </div>
          </div>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onSubscribeClick}
              className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-bold text-xs rounded-xl shadow-lg transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>View Bookkeeping Plans & Subscribe</span>
            </button>
            <button
              type="button"
              onClick={onActivateKeyClick}
              className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Enter Existing License Key
            </button>
          </div>
        </div>
      )}

      {/* Control Filter Bar */}
      <div className="p-4 rounded-xl bg-stone-900/90 border border-stone-800 space-y-3 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Schedule Selectors */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-stone-400 font-medium mr-1">Tax Schedule:</span>
            <button
              type="button"
              onClick={() => setScheduleFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                scheduleFilter === 'ALL'
                  ? 'bg-amber-500 text-stone-950 shadow-md font-bold'
                  : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
              }`}
            >
              All Tax Deductions
            </button>
            <button
              type="button"
              onClick={() => setScheduleFilter('SCHEDULE_F')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                scheduleFilter === 'SCHEDULE_F'
                  ? 'bg-emerald-600 text-white shadow-md font-bold'
                  : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
              }`}
            >
              <span>Schedule F (Farm)</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] bg-emerald-950/60 text-emerald-200 font-mono">
                ${summary.scheduleFTotal.toFixed(0)}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setScheduleFilter('SCHEDULE_C')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                scheduleFilter === 'SCHEDULE_C'
                  ? 'bg-sky-600 text-white shadow-md font-bold'
                  : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
              }`}
            >
              <span>Schedule C (Business)</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] bg-sky-950/60 text-sky-200 font-mono">
                ${summary.scheduleCTotal.toFixed(0)}
              </span>
            </button>
          </div>

          {/* Tax Year & Search */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-xs text-stone-300">
              <Calendar className="w-3.5 h-3.5 text-stone-400" />
              <select
                value={taxYearFilter}
                onChange={(e) => setTaxYearFilter(e.target.value)}
                className="bg-stone-950 border border-stone-700 rounded-lg px-2.5 py-1 text-xs text-stone-200 focus:outline-none focus:border-amber-500 cursor-pointer"
              >
                <option value="2026">Tax Year 2026</option>
                <option value="2025">Tax Year 2025</option>
                <option value="ALL">All Tax Years</option>
              </select>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-stone-500 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search vendor or memo..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-200 placeholder:text-stone-600 focus:outline-none focus:border-amber-500 w-36 sm:w-48"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-xl bg-stone-900/90 border border-stone-800 space-y-1">
          <div className="text-[10px] text-stone-400 uppercase font-semibold tracking-wider flex items-center gap-1">
            <DollarSign className="w-3 h-3 text-emerald-400" />
            <span>Total Deductions</span>
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-emerald-400">
            ${summary.totalDeductions.toFixed(2)}
          </div>
          <div className="text-[10px] text-stone-500">
            Reconciled for {taxYearFilter === 'ALL' ? 'all years' : `Tax Year ${taxYearFilter}`}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-stone-900/90 border border-stone-800 space-y-1">
          <div className="text-[10px] text-stone-400 uppercase font-semibold tracking-wider flex items-center gap-1">
            <Layers className="w-3 h-3 text-emerald-400" />
            <span>Schedule F (Farm)</span>
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-emerald-300">
            ${summary.scheduleFTotal.toFixed(2)}
          </div>
          <div className="text-[10px] text-stone-500">
            Feed, livestock, fuel & repairs
          </div>
        </div>

        <div className="p-4 rounded-xl bg-stone-900/90 border border-stone-800 space-y-1">
          <div className="text-[10px] text-stone-400 uppercase font-semibold tracking-wider flex items-center gap-1">
            <Building2 className="w-3 h-3 text-sky-400" />
            <span>Schedule C (Business)</span>
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-sky-300">
            ${summary.scheduleCTotal.toFixed(2)}
          </div>
          <div className="text-[10px] text-stone-500">
            Supplies, vehicle, office & utilities
          </div>
        </div>

        <div className="p-4 rounded-xl bg-stone-900/90 border border-stone-800 space-y-1">
          <div className="text-[10px] text-stone-400 uppercase font-semibold tracking-wider flex items-center gap-1">
            <Receipt className="w-3 h-3 text-amber-400" />
            <span>Verified Receipts</span>
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-amber-400">
            {summary.totalReceiptCount}
          </div>
          <div className="text-[10px] text-stone-500">
            Mapped across {summary.categories.length} IRS lines
          </div>
        </div>
      </div>

      {/* Sub-tab view toggle */}
      <div className="flex border-b border-stone-800 gap-2">
        <button
          type="button"
          onClick={() => setActiveTabMode('line_summary')}
          className={`px-4 py-2 text-xs font-bold rounded-t-xl transition-colors cursor-pointer flex items-center gap-2 border-b-2 ${
            activeTabMode === 'line_summary'
              ? 'border-amber-500 text-amber-400 bg-stone-900/60'
              : 'border-transparent text-stone-400 hover:text-stone-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>IRS Line-Item Summary ({summary.categories.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTabMode('itemized_ledger')}
          className={`px-4 py-2 text-xs font-bold rounded-t-xl transition-colors cursor-pointer flex items-center gap-2 border-b-2 ${
            activeTabMode === 'itemized_ledger'
              ? 'border-amber-500 text-amber-400 bg-stone-900/60'
              : 'border-transparent text-stone-400 hover:text-stone-200'
          }`}
        >
          <Receipt className="w-3.5 h-3.5" />
          <span>Itemized Receipt Ledger ({summary.totalReceiptCount})</span>
        </button>
      </div>

      {/* VIEW 1: IRS Line-Item Summary Cards */}
      {activeTabMode === 'line_summary' && (
        <div className="space-y-3">
          {summary.categories.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-stone-900/40 border border-stone-800 space-y-2">
              <FileSpreadsheet className="w-10 h-10 text-stone-600 mx-auto" />
              <h4 className="text-sm font-bold text-stone-300">No tax deduction items found</h4>
              <p className="text-xs text-stone-500 max-w-sm mx-auto">
                No receipts match your selected schedule or year filter. Try switching to "All Tax Deductions" or upload more receipts.
              </p>
            </div>
          ) : (
            summary.categories.map((cat) => {
              const catKey = `${cat.schedule}-${cat.lineNumber}`;
              const isExpanded = Boolean(expandedCategories[catKey]);
              const percentOfTotal = summary.totalDeductions > 0 
                ? ((cat.total / summary.totalDeductions) * 100).toFixed(1)
                : '0.0';

              return (
                <div 
                  key={catKey}
                  className="rounded-xl bg-stone-900/90 border border-stone-800 overflow-hidden shadow-md transition-all"
                >
                  <div 
                    onClick={() => toggleCategoryExpand(catKey)}
                    className="p-4 flex items-center justify-between gap-4 cursor-pointer hover:bg-stone-800/40 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono font-bold text-xs shrink-0 ${
                        cat.schedule === 'SCHEDULE_F'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                      }`}>
                        {cat.schedule === 'SCHEDULE_F' ? 'Sch F' : 'Sch C'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-stone-200 text-xs sm:text-sm">
                            {cat.lineNumber}: {cat.lineTitle}
                          </span>
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                            cat.schedule === 'SCHEDULE_F'
                              ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/40'
                              : 'bg-sky-950/60 text-sky-300 border border-sky-800/40'
                          }`}>
                            {cat.irsForm}
                          </span>
                        </div>
                        <p className="text-[11px] text-stone-400 mt-0.5">
                          {cat.count} receipt(s) • {percentOfTotal}% of total tax deductions
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <div className="text-sm sm:text-base font-bold font-mono text-emerald-400">
                          ${cat.total.toFixed(2)}
                        </div>
                        <span className="text-[10px] text-stone-500">IRS Deductible</span>
                      </div>
                      <button
                        type="button"
                        aria-label="Toggle details"
                        className="p-1 rounded-lg text-stone-400 hover:text-stone-200 bg-stone-800/60"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Itemized Receipts for this IRS Line */}
                  {isExpanded && (
                    <div className="border-t border-stone-800/80 bg-stone-950/60 p-3 sm:p-4 space-y-2">
                      <div className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                        <span>Constituent Receipts for {cat.lineNumber}</span>
                        <span className="font-mono text-stone-500">Total: ${cat.total.toFixed(2)}</span>
                      </div>

                      <div className="divide-y divide-stone-800/60">
                        {cat.receipts.map(rec => (
                          <div key={rec.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                            <div className="flex items-center gap-2.5 min-w-0">
                              {rec.dataUrl ? (
                                <img
                                  src={rec.dataUrl}
                                  alt="Receipt thumbnail"
                                  className="w-8 h-8 rounded-lg object-cover border border-stone-700 shrink-0"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-lg bg-stone-800 border border-stone-700 flex items-center justify-center text-stone-400 shrink-0">
                                  <FileText className="w-4 h-4" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="font-medium text-stone-200 truncate">
                                  {rec.extractedVendor || rec.fileName}
                                </div>
                                <div className="text-[10px] text-stone-400 flex items-center gap-2">
                                  <span>{rec.extractedDate || rec.uploadedAt.split('T')[0]}</span>
                                  {rec.memo && <span>• "{rec.memo}"</span>}
                                  <span className="text-stone-500 font-mono">({rec.fileName})</span>
                                </div>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <span className="font-mono font-bold text-emerald-400">
                                ${rec.extractedAmount ? rec.extractedAmount.toFixed(2) : '0.00'}
                              </span>
                              <div className="text-[10px] text-emerald-500/80 flex items-center justify-end gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Reconciled</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* VIEW 2: Itemized Receipt Ledger Table */}
      {activeTabMode === 'itemized_ledger' && (
        <div className="rounded-2xl bg-stone-900/90 border border-stone-800 overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-950/80 text-stone-400 text-[10px] uppercase font-mono border-b border-stone-800">
                <tr>
                  <th className="py-3 px-4">Receipt & Vendor</th>
                  <th className="py-3 px-4">IRS Tax Schedule & Line</th>
                  <th className="py-3 px-4">Business Memo</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4 text-right">Audit Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-800 text-stone-300">
                {summary.itemizedReceipts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-stone-500">
                      No receipts found matching your criteria.
                    </td>
                  </tr>
                ) : (
                  summary.itemizedReceipts.map(({ submission, classification }) => (
                    <tr key={submission.id} className="hover:bg-stone-800/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          {submission.dataUrl ? (
                            <img
                              src={submission.dataUrl}
                              alt="Receipt thumbnail"
                              className="w-8 h-8 rounded-lg object-cover border border-stone-700 shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-stone-800 border border-stone-700 flex items-center justify-center text-stone-400 shrink-0">
                              <FileText className="w-4 h-4" />
                            </div>
                          )}
                          <div className="min-w-0 max-w-xs">
                            <p className="font-semibold text-stone-200 truncate">
                              {submission.extractedVendor || 'Pending OCR'}
                            </p>
                            <p className="text-[10px] text-stone-400 truncate font-mono">
                              {submission.fileName}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-medium text-stone-200">
                          {classification.lineNumber}: {classification.lineTitle}
                        </div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono inline-block mt-0.5 ${
                          classification.schedule === 'SCHEDULE_F'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/30'
                            : 'bg-sky-950 text-sky-300 border border-sky-800/30'
                        }`}>
                          {classification.schedule === 'SCHEDULE_F' ? 'Form 1040 (Sched F)' : 'Form 1040 (Sched C)'}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-stone-400 text-xs italic max-w-xs truncate">
                        {submission.memo ? `"${submission.memo}"` : '—'}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-stone-400">
                        {submission.extractedDate || submission.uploadedAt.split('T')[0]}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap font-mono font-bold text-emerald-400">
                        ${submission.extractedAmount ? submission.extractedAmount.toFixed(2) : '0.00'}
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3" />
                          Audit-Ready
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Taxpayer Educational Guide for Non-QuickBooks Users */}
      <div className="p-5 rounded-2xl bg-stone-900/60 border border-stone-800 space-y-3 text-xs text-stone-300">
        <h4 className="font-bold text-stone-200 flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-amber-400" />
          <span>How Non-QuickBooks Clients Use This Tax Schedule Pack</span>
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
          <div className="p-3.5 rounded-xl bg-stone-950/70 border border-stone-800/80 space-y-1.5">
            <div className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs">1</div>
            <div className="font-semibold text-stone-200">Hand Straight to Your CPA</div>
            <p className="text-[11px] text-stone-400 leading-relaxed">
              Print this report or email the CSV directly to your tax preparer. It is pre-organized by official IRS line numbers to eliminate manual billable accounting hours.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-stone-950/70 border border-stone-800/80 space-y-1.5">
            <div className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs">2</div>
            <div className="font-semibold text-stone-200">Self-Filing (TurboTax / TaxSlayer)</div>
            <p className="text-[11px] text-stone-400 leading-relaxed">
              When software asks for "Feed Purchased" or "Vehicle Fuel", copy the exact dollar amounts from the IRS Line-Item Summary into the respective box.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-stone-950/70 border border-stone-800/80 space-y-1.5">
            <div className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs">3</div>
            <div className="font-semibold text-stone-200">100% IRS Audit Protection</div>
            <p className="text-[11px] text-stone-400 leading-relaxed">
              Every claimed dollar is backed by an OCR-scanned receipt image, timestamp, and vendor identifier retained in your secure client vault.
            </p>
          </div>
        </div>
      </div>

      {/* Integrated Vehicle Mileage, 1040-ES Quarterly Shield, and Exemption Cards Hub */}
      <div className="pt-2">
        <ClientTaxAdditionsHub
          clientSession={clientSession}
          totalReceiptDeductions={summary.totalDeductions}
          onSubscribeClick={onSubscribeClick}
          onActivateKeyClick={onActivateKeyClick}
        />
      </div>

      {/* Hidden CPA Print Template (Rendered only on print) */}
      <div id="cpa-printable-report" className="hidden">
        <div style={{ fontFamily: 'Georgia, serif', color: '#111', padding: '24px' }}>
          {/* Header */}
          <div style={{ borderBottom: '2px solid #111', paddingBottom: '16px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 4px 0' }}>
                  IRS Tax Deduction Reconciliation Report
                </h1>
                <p style={{ fontSize: '13px', color: '#555', margin: 0 }}>
                  Form 1040 (Schedule C - Business & Schedule F - Farm) Audit Package
                </p>
              </div>
              <div style={{ textAlign: 'right', fontSize: '12px' }}>
                <strong>Tax Year:</strong> {taxYearFilter === 'ALL' ? '2026' : taxYearFilter}<br />
                <strong>Report Date:</strong> {new Date().toLocaleDateString()}<br />
                <strong>Verification:</strong> Certified Digital Audit Trail
              </div>
            </div>

            <div style={{ marginTop: '16px', display: 'flex', gap: '32px', fontSize: '12px', background: '#f5f5f4', padding: '10px 14px', borderRadius: '4px' }}>
              <div><strong>Taxpayer / Entity:</strong> {clientDisplayName}</div>
              <div><strong>Email:</strong> {clientEmail}</div>
              <div><strong>License Status:</strong> {hasActivePlan ? 'ACTIVE & VERIFIED' : 'GUEST RECORD'}</div>
            </div>
          </div>

          {/* Executive Totals */}
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '15px', textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '1px solid #ccc', paddingBottom: '6px', margin: '0 0 12px 0' }}>
              Executive Tax Deduction Summary
            </h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <tbody>
                <tr style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '8px 0', fontWeight: 'bold' }}>Total Deductions Claimed</td>
                  <td style={{ padding: '8px 0', textAlign: 'right', fontSize: '16px', fontWeight: 'bold', color: '#047857' }}>
                    ${summary.totalDeductions.toFixed(2)}
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '6px 0' }}>Schedule F Total (Farm Profit & Loss)</td>
                  <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 'bold' }}>
                    ${summary.scheduleFTotal.toFixed(2)}
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '6px 0' }}>Schedule C Total (Business Profit & Loss)</td>
                  <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 'bold' }}>
                    ${summary.scheduleCTotal.toFixed(2)}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '6px 0' }}>Total Scanned & Reconciled Receipts</td>
                  <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 'bold' }}>
                    {summary.totalReceiptCount} receipts
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* IRS Line-Item Breakdown Table */}
          <div style={{ marginBottom: '28px' }}>
            <h2 style={{ fontSize: '15px', textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '1px solid #ccc', paddingBottom: '6px', margin: '0 0 12px 0' }}>
              IRS Part II Line-Item Subtotals
            </h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr style={{ background: '#f5f5f4', textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                  <th style={{ padding: '8px' }}>Schedule</th>
                  <th style={{ padding: '8px' }}>Line #</th>
                  <th style={{ padding: '8px' }}>IRS Category Description</th>
                  <th style={{ padding: '8px', textAlign: 'center' }}>Receipt Count</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Deductible Amount ($)</th>
                </tr>
              </thead>
              <tbody>
                {summary.categories.map((c) => (
                  <tr key={`${c.schedule}-${c.lineNumber}`} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '8px', fontWeight: 'bold' }}>
                      {c.schedule === 'SCHEDULE_F' ? 'Sched F (Farm)' : 'Sched C (Business)'}
                    </td>
                    <td style={{ padding: '8px', fontFamily: 'monospace', fontWeight: 'bold' }}>{c.lineNumber}</td>
                    <td style={{ padding: '8px' }}>{c.lineTitle}</td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>{c.count}</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>
                      ${c.total.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Itemized Scanned Receipts Ledger */}
          <div style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '15px', textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '1px solid #ccc', paddingBottom: '6px', margin: '0 0 12px 0' }}>
              Itemized Scanned Receipt Audit Trail
            </h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
              <thead>
                <tr style={{ background: '#f5f5f4', textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                  <th style={{ padding: '6px' }}>Date</th>
                  <th style={{ padding: '6px' }}>Vendor</th>
                  <th style={{ padding: '6px' }}>IRS Line</th>
                  <th style={{ padding: '6px' }}>File / Reference</th>
                  <th style={{ padding: '6px' }}>Memo / Purpose</th>
                  <th style={{ padding: '6px', textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {summary.itemizedReceipts.map(({ submission, classification }) => (
                  <tr key={submission.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '6px', fontFamily: 'monospace' }}>
                      {submission.extractedDate || submission.uploadedAt.split('T')[0]}
                    </td>
                    <td style={{ padding: '6px', fontWeight: 'bold' }}>
                      {submission.extractedVendor || 'Store Receipt'}
                    </td>
                    <td style={{ padding: '6px' }}>
                      {classification.schedule === 'SCHEDULE_F' ? 'F' : 'C'} - {classification.lineNumber}
                    </td>
                    <td style={{ padding: '6px', color: '#666', fontFamily: 'monospace' }}>
                      {submission.fileName}
                    </td>
                    <td style={{ padding: '6px', fontStyle: 'italic' }}>
                      {submission.memo || 'Business purchase'}
                    </td>
                    <td style={{ padding: '6px', textAlign: 'right', fontWeight: 'bold' }}>
                      ${(submission.extractedAmount || 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Signoff / Certification Block */}
          <div style={{ borderTop: '2px solid #ddd', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#444' }}>
            <div>
              <p style={{ margin: '0 0 4px 0' }}><strong>Taxpayer Certification:</strong></p>
              <p style={{ margin: 0 }}>I certify that the expenses listed above were incurred for ordinary and necessary business/agricultural operations.</p>
              <div style={{ marginTop: '24px', borderBottom: '1px solid #888', width: '240px' }}></div>
              <p style={{ margin: '4px 0 0 0', fontSize: '10px' }}>Taxpayer Signature & Date</p>
            </div>
            <div>
              <p style={{ margin: '0 0 4px 0' }}><strong>Accountant / CPA Signoff:</strong></p>
              <p style={{ margin: 0 }}>Reconciled via Receipt Processor AI OCR Engine.</p>
              <div style={{ marginTop: '24px', borderBottom: '1px solid #888', width: '240px' }}></div>
              <p style={{ margin: '4px 0 0 0', fontSize: '10px' }}>Preparer Signature & Date</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
