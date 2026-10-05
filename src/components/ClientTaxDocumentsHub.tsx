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
  Building,
  MapPin,
  HelpCircle,
  ExternalLink,
  Sparkles,
  Info,
  Calendar,
  Lock,
  UploadCloud,
  FileCheck,
  ArrowRight,
  Eye,
  Check,
  X
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
import { ClientAccountSession } from '../types';

interface ClientTaxDocumentsHubProps {
  clientSession: ClientAccountSession | null;
  onToast?: (message: string) => void;
}

export const ClientTaxDocumentsHub: React.FC<ClientTaxDocumentsHubProps> = ({
  clientSession,
  onToast
}) => {
  const clientId = clientSession?.userId || 'client_default';
  const clientName = clientSession?.displayName || 'Client Taxpayer';

  const [w2s, setW2s] = useState<W2Record[]>(() => getW2Records(clientId));
  const [form1099s, setForm1099s] = useState<Form1099Record[]>(() => get1099Records(clientId));
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'W2' | '1099'>('ALL');
  const [showAddModal, setShowAddModal] = useState(false);
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);

  // Form State for Manual Add W-2
  const [w2Year, setW2Year] = useState<number>(new Date().getFullYear() - 1);
  const [employerName, setEmployerName] = useState('');
  const [employerEin, setEmployerEin] = useState('');
  const [box1Wages, setBox1Wages] = useState<string>('');
  const [box2FedTax, setBox2FedTax] = useState<string>('');
  const [box3SSWages, setBox3SSWages] = useState<string>('');
  const [box4SSTax, setBox4SSTax] = useState<string>('');
  const [box5MedWages, setBox5MedWages] = useState<string>('');
  const [box6MedTax, setBox6MedTax] = useState<string>('');
  const [box15State, setBox15State] = useState<string>('IL');
  const [box15StateId, setBox15StateId] = useState<string>('');
  const [box16StateWages, setBox16StateWages] = useState<string>('');
  const [box17StateTax, setBox17StateTax] = useState<string>('');
  const [box18LocalWages, setBox18LocalWages] = useState<string>('');
  const [box19LocalTax, setBox19LocalTax] = useState<string>('');
  const [box20Locality, setBox20Locality] = useState<string>('');
  const [w2Notes, setW2Notes] = useState<string>('');

  const refreshDocs = () => {
    setW2s(getW2Records(clientId));
    setForm1099s(get1099Records(clientId));
  };

  useEffect(() => {
    refreshDocs();
    fetchServerTaxDocs().then(() => refreshDocs());
    const unsub = subscribeToTaxDocuments(() => refreshDocs());
    return () => unsub();
  }, [clientId]);

  // Aggregate Calculations
  const totalW2Wages = w2s.reduce((acc, w) => acc + (w.box1Wages || 0), 0);
  const total1099Income = form1099s.reduce((acc, f) => acc + (f.box1Amount || 0), 0);
  const totalGrossIncome = totalW2Wages + total1099Income;

  const totalFedWithheld = w2s.reduce((acc, w) => acc + (w.box2FedTaxWithheld || 0), 0) +
    form1099s.reduce((acc, f) => acc + (f.box4FedTaxWithheld || 0), 0);

  const totalStateWithheld = w2s.reduce((acc, w) => acc + (w.box17StateTaxWithheld || 0), 0) +
    form1099s.reduce((acc, f) => acc + (f.box5StateTaxWithheld || 0), 0);

  // States Breakdown
  const statesEncountered = Array.from(new Set([
    ...w2s.map(w => (w.box15State || '').toUpperCase().trim()).filter(Boolean),
    ...form1099s.map(f => (f.box6State || '').toUpperCase().trim()).filter(Boolean)
  ]));

  const stateReturnsRequiredCount = w2s.filter(w => w.stateAssessment?.stateReturnRequired).length +
    form1099s.filter(f => f.stateAssessment?.stateReturnRequired).length;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setIsProcessingUpload(true);
    if (onToast) onToast(`Scanning ${file.name} for IRS W-2 / 1099 tax boxes...`);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Data = reader.result as string;
        try {
          const resp = await fetch('/api/scan/tax-document', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageBase64: base64Data,
              mimeType: file.type,
              fileName: file.name
            })
          });

          if (resp.ok) {
            const data = await resp.json();
            if (data.success && data.document) {
              const doc = data.document;
              if (doc.docType === 'W2') {
                saveW2Record({
                  clientId,
                  clientName,
                  taxYear: doc.taxYear || new Date().getFullYear() - 1,
                  employerName: doc.employerOrPayerName || 'Scanned Employer',
                  employerEin: doc.employerOrPayerEin || '00-0000000',
                  employeeName: clientName,
                  employeeSsnMasked: '***-**-8921',
                  box1Wages: doc.box1WagesOrAmount || 0,
                  box2FedTaxWithheld: doc.box2Or4FedTaxWithheld || 0,
                  box3SocialSecurityWages: doc.box3SocialSecurityWages || doc.box1WagesOrAmount || 0,
                  box4SocialSecurityTax: doc.box4SocialSecurityTax || (doc.box1WagesOrAmount ? doc.box1WagesOrAmount * 0.062 : 0),
                  box5MedicareWages: doc.box5MedicareWages || doc.box1WagesOrAmount || 0,
                  box6MedicareTax: doc.box6MedicareTax || (doc.box1WagesOrAmount ? doc.box1WagesOrAmount * 0.0145 : 0),
                  box15State: doc.box15StateCode || 'IL',
                  box15StateIdNumber: doc.box15StateIdNumber || '',
                  box16StateWages: doc.box16StateWages || doc.box1WagesOrAmount || 0,
                  box17StateTaxWithheld: doc.box17StateTaxWithheld || 0,
                  box18LocalWages: doc.box18LocalWages || 0,
                  box19LocalTaxWithheld: doc.box19LocalTaxWithheld || 0,
                  box20LocalityName: doc.box20LocalityName || '',
                  fileName: file.name,
                  notes: 'Extracted with automated IRS Tax Form OCR vision.'
                });
                if (onToast) onToast(`Successfully processed Form W-2 for ${doc.employerOrPayerName || 'employer'}!`);
              } else {
                save1099Record({
                  clientId,
                  clientName,
                  formType: doc.docType === '1099_MISC' ? '1099_MISC' : '1099_NEC',
                  taxYear: doc.taxYear || new Date().getFullYear() - 1,
                  payerName: doc.employerOrPayerName || 'Scanned Payer',
                  payerTin: doc.employerOrPayerEin || '00-0000000',
                  recipientName: clientName,
                  recipientTinMasked: '***-**-8921',
                  box1Amount: doc.box1WagesOrAmount || 0,
                  box4FedTaxWithheld: doc.box2Or4FedTaxWithheld || 0,
                  box6State: doc.box15StateCode || 'IL',
                  box7StateIncome: doc.box16StateWages || doc.box1WagesOrAmount || 0,
                  box5StateTaxWithheld: doc.box17StateTaxWithheld || 0,
                  fileName: file.name,
                  notes: 'Extracted with automated 1099 Form OCR vision.'
                });
                if (onToast) onToast(`Successfully processed Form ${doc.docType} for ${doc.employerOrPayerName || 'payer'}!`);
              }
              refreshDocs();
            }
          } else {
            // Fallback manual prompt
            if (onToast) onToast('Server processing unavailable; opening manual entry...');
            setShowAddModal(true);
          }
        } catch {
          if (onToast) onToast('Network error processing document. Please enter values manually.');
          setShowAddModal(true);
        } finally {
          setIsProcessingUpload(false);
        }
      };
      reader.readAsDataURL(file);
    } catch {
      setIsProcessingUpload(false);
    }
  };

  const handleSaveManualW2 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!employerName.trim()) {
      if (onToast) onToast('Employer name is required.');
      return;
    }

    const b1 = parseFloat(box1Wages) || 0;
    const b2 = parseFloat(box2FedTax) || 0;
    const b16 = parseFloat(box16StateWages) || b1;
    const b17 = parseFloat(box17StateTax) || 0;

    saveW2Record({
      clientId,
      clientName,
      taxYear: w2Year,
      employerName: employerName.trim(),
      employerEin: employerEin.trim() || '00-0000000',
      employeeName: clientName,
      employeeSsnMasked: '***-**-9481',
      box1Wages: b1,
      box2FedTaxWithheld: b2,
      box3SocialSecurityWages: parseFloat(box3SSWages) || b1,
      box4SocialSecurityTax: parseFloat(box4SSTax) || (b1 * 0.062),
      box5MedicareWages: parseFloat(box5MedWages) || b1,
      box6MedicareTax: parseFloat(box6MedTax) || (b1 * 0.0145),
      box15State: box15State.toUpperCase().trim(),
      box15StateIdNumber: box15StateId.trim(),
      box16StateWages: b16,
      box17StateTaxWithheld: b17,
      box18LocalWages: parseFloat(box18LocalWages) || 0,
      box19LocalTaxWithheld: parseFloat(box19LocalTax) || 0,
      box20LocalityName: box20Locality.trim(),
      notes: w2Notes.trim()
    });

    if (onToast) onToast(`Saved W-2 for ${employerName}! State analysis updated.`);
    setShowAddModal(false);
    resetForm();
    refreshDocs();
  };

  const resetForm = () => {
    setEmployerName('');
    setEmployerEin('');
    setBox1Wages('');
    setBox2FedTax('');
    setBox3SSWages('');
    setBox4SSTax('');
    setBox5MedWages('');
    setBox6MedTax('');
    setBox15State('IL');
    setBox15StateId('');
    setBox16StateWages('');
    setBox17StateTax('');
    setBox18LocalWages('');
    setBox19LocalTax('');
    setBox20Locality('');
    setW2Notes('');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Non-Business & Individual Taxpayer Guidance */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-stone-900 via-stone-900 to-stone-950 border border-stone-800 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Individual Tax Center • Form 1040, W-2 & 1099 Ingestion</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              W-2 & 1099 Income Vault with State Tax Intelligence
            </h2>
            <p className="text-xs sm:text-sm text-stone-300 leading-relaxed">
              Designed for individual filers, remote workers, and non-business wage earners. Upload your W-2 wage statements, 
              1099-NEC freelance compensation, and 1099-MISC docs. Our system automatically inspects 
              <strong className="text-amber-300"> Boxes 15–17</strong> to determine whether your state levies personal income tax, 
              calculates total state withholding, and detects zero-income-tax states like Texas and Florida.
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 shrink-0">
            <label className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold transition-all shadow-md shadow-amber-500/10 flex items-center gap-2 cursor-pointer">
              <UploadCloud className="w-4 h-4" />
              <span>{isProcessingUpload ? 'Scanning...' : 'Upload W-2 / 1099'}</span>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={handleFileUpload}
                disabled={isProcessingUpload}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-amber-400" />
              <span>Manual Entry</span>
            </button>

            <button
              type="button"
              onClick={() => exportTaxDocumentsCSV(clientId)}
              disabled={w2s.length === 0 && form1099s.length === 0}
              className="px-4 py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 disabled:opacity-40 text-stone-200 border border-stone-700 text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer"
              title="Export Form 1040 summary CSV"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* 1-Click Instant Demo Seed Bar */}
        <div className="mt-5 pt-4 border-t border-stone-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-stone-400">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-semibold text-stone-300">Quick Test Samples:</span>
            <span>Seed realistic tax documents with 1 click:</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                seedSampleIllinoisW2(clientId, clientName);
                refreshDocs();
                if (onToast) onToast('Seeded Illinois W-2 (State Withholding Active)');
              }}
              className="px-2.5 py-1 rounded-lg bg-stone-800/90 hover:bg-stone-700 text-[11px] text-amber-300 border border-stone-700 transition-colors cursor-pointer"
            >
              + Seed Illinois W-2 (Withholding)
            </button>
            <button
              type="button"
              onClick={() => {
                seedSampleTexasW2(clientId, clientName);
                refreshDocs();
                if (onToast) onToast('Seeded Texas W-2 (No State Tax)');
              }}
              className="px-2.5 py-1 rounded-lg bg-stone-800/90 hover:bg-stone-700 text-[11px] text-emerald-300 border border-stone-700 transition-colors cursor-pointer"
            >
              + Seed Texas W-2 (No State Tax)
            </button>
            <button
              type="button"
              onClick={() => {
                seedSample1099NEC(clientId, clientName);
                refreshDocs();
                if (onToast) onToast('Seeded 1099-NEC California freelance document');
              }}
              className="px-2.5 py-1 rounded-lg bg-stone-800/90 hover:bg-stone-700 text-[11px] text-sky-300 border border-stone-700 transition-colors cursor-pointer"
            >
              + Seed 1099-NEC (CA)
            </button>
          </div>
        </div>
      </div>

      {/* Aggregate Financial Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Wage / Compensation */}
        <div className="p-4 rounded-xl bg-stone-900/80 border border-stone-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-stone-400">
            <span>Total Gross Compensation</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-white font-mono">
            ${totalGrossIncome.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-stone-400">
            {w2s.length} W-2 Form(s) • {form1099s.length} 1099 Form(s)
          </p>
        </div>

        {/* Federal Tax Withheld */}
        <div className="p-4 rounded-xl bg-stone-900/80 border border-stone-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-stone-400">
            <span>Federal Tax Withheld (Box 2/4)</span>
            <ShieldCheck className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-300 font-mono">
            ${totalFedWithheld.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-stone-400">
            Directly credits your IRS Form 1040 tax liability
          </p>
        </div>

        {/* State Tax Withheld */}
        <div className="p-4 rounded-xl bg-stone-900/80 border border-stone-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-stone-400">
            <span>State Tax Withheld (Box 17/5)</span>
            <MapPin className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-sky-300 font-mono">
            ${totalStateWithheld.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-stone-400">
            {statesEncountered.length > 0 ? `Across ${statesEncountered.join(', ')}` : 'No state tax withheld'}
          </p>
        </div>

        {/* State Filing Analysis Status */}
        <div className="p-4 rounded-xl bg-stone-900/80 border border-stone-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-stone-400">
            <span>State Filing Requirement</span>
            <AlertCircle className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-lg font-bold text-white flex items-center gap-2">
            {stateReturnsRequiredCount > 0 ? (
              <span className="text-amber-400">Return Required</span>
            ) : statesEncountered.some(st => NO_INCOME_TAX_STATES[st]) ? (
              <span className="text-emerald-400">Zero State Tax State</span>
            ) : (
              <span className="text-stone-300">No Documents</span>
            )}
          </div>
          <p className="text-[11px] text-stone-400">
            {stateReturnsRequiredCount > 0
              ? `${stateReturnsRequiredCount} document(s) have state tax filings due`
              : 'Zero-tax states require no separate return'}
          </p>
        </div>
      </div>

      {/* State Tax Intelligence Callout Box */}
      {statesEncountered.length > 0 && (
        <div className="p-4 rounded-xl bg-stone-950 border border-stone-800 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-stone-200">
            <Info className="w-4 h-4 text-amber-400" />
            <span>State Income Tax Automated Analysis Breakdown</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
            {statesEncountered.map(st => {
              const isNoTax = Boolean(NO_INCOME_TAX_STATES[st]);
              const stName = US_STATES_MAP[st] || st;
              const w2InState = w2s.filter(w => (w.box15State || '').toUpperCase() === st);
              const withheldInState = w2InState.reduce((a, b) => a + (b.box17StateTaxWithheld || 0), 0);

              return (
                <div
                  key={st}
                  className={`p-3 rounded-lg border text-xs space-y-1 ${
                    isNoTax
                      ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-200'
                      : withheldInState > 0
                      ? 'bg-amber-950/20 border-amber-800/40 text-amber-200'
                      : 'bg-stone-900 border-stone-800 text-stone-300'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold">
                    <span>{stName} ({st})</span>
                    <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                      isNoTax ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                    }`}>
                      {isNoTax ? 'NO STATE INCOME TAX' : 'RETURN REQUIRED'}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-400 leading-snug">
                    {isNoTax
                      ? `${stName} does not levy personal income tax on wages. No state income tax return required.`
                      : `State income tax was withheld ($${withheldInState.toLocaleString()}). Individual state return must be prepared.`}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter and Tab Sub-bar */}
      <div className="flex items-center justify-between border-b border-stone-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              activeFilter === 'ALL'
                ? 'bg-amber-500 text-stone-950'
                : 'bg-stone-900 text-stone-400 hover:text-white'
            }`}
          >
            All Tax Documents ({w2s.length + form1099s.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('W2')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              activeFilter === 'W2'
                ? 'bg-amber-500 text-stone-950'
                : 'bg-stone-900 text-stone-400 hover:text-white'
            }`}
          >
            Form W-2 Wage Statements ({w2s.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('1099')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              activeFilter === '1099'
                ? 'bg-amber-500 text-stone-950'
                : 'bg-stone-900 text-stone-400 hover:text-white'
            }`}
          >
            Form 1099-NEC / MISC ({form1099s.length})
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            if (confirm('Clear all sample tax documents for this account?')) {
              w2s.forEach(w => deleteW2Record(w.id));
              form1099s.forEach(f => delete1099Record(f.id));
              refreshDocs();
              if (onToast) onToast('Cleared all tax documents.');
            }
          }}
          disabled={w2s.length === 0 && form1099s.length === 0}
          className="text-xs text-stone-500 hover:text-rose-400 transition-colors disabled:opacity-30 cursor-pointer"
        >
          Clear All Docs
        </button>
      </div>

      {/* Main List of Documents */}
      {w2s.length === 0 && form1099s.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-stone-900/60 border border-dashed border-stone-800 space-y-4">
          <div className="w-14 h-14 rounded-full bg-stone-800/80 border border-stone-700 text-stone-400 flex items-center justify-center mx-auto">
            <FileText className="w-7 h-7" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="text-base font-bold text-white">No Tax Documents Ingested Yet</h3>
            <p className="text-xs text-stone-400 leading-relaxed">
              Upload your Form W-2 or 1099 image/PDF, click &ldquo;Manual Entry&rdquo;, or use the &ldquo;Quick Test Samples&rdquo; 
              above to see automated state income tax detection in action.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                seedSampleIllinoisW2(clientId, clientName);
                refreshDocs();
                if (onToast) onToast('Seeded sample Illinois W-2');
              }}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs rounded-xl transition-all cursor-pointer"
            >
              Seed Sample W-2 (IL)
            </button>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 font-semibold text-xs rounded-xl transition-all cursor-pointer"
            >
              Manual Entry
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* W-2 Cards */}
          {(activeFilter === 'ALL' || activeFilter === 'W2') && w2s.map((w) => {
            const assessment = w.stateAssessment;
            const isNoTax = assessment?.statusBadge === 'NO_TAX_STATE';

            return (
              <div
                key={w.id}
                className="p-5 rounded-2xl bg-stone-900/90 border border-stone-800 hover:border-stone-700 transition-all shadow-md space-y-4"
              >
                {/* Header row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-800/80 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-white">{w.employerName}</h4>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-stone-800 text-stone-300">
                          Tax Year {w.taxYear}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-500/10 text-purple-300 border border-purple-500/20">
                          Form W-2
                        </span>
                      </div>
                      <p className="text-[11px] text-stone-400 font-mono">
                        EIN: {w.employerEin} • Employee: {w.employeeName} ({w.employeeSsnMasked})
                      </p>
                    </div>
                  </div>

                  {/* State Analysis Badge */}
                  <div className="flex items-center gap-3 self-start sm:self-auto">
                    <div className={`px-3 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5 border ${
                      isNoTax
                        ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                        : 'bg-amber-950/40 border-amber-500/30 text-amber-300'
                    }`}>
                      {isNoTax ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                      <span>{assessment?.summaryMessage || `${w.box15State} State Analysis`}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        deleteW2Record(w.id);
                        refreshDocs();
                        if (onToast) onToast(`Deleted W-2 for ${w.employerName}`);
                      }}
                      className="p-1.5 rounded-lg text-stone-500 hover:text-rose-400 hover:bg-stone-800 transition-colors cursor-pointer"
                      title="Delete W-2"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Box by Box Breakdown Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
                  {/* Box 1 */}
                  <div className="p-2.5 rounded-xl bg-stone-950 border border-stone-800/80 space-y-0.5">
                    <div className="text-[10px] text-stone-500 font-mono">Box 1 • Wages &amp; Tips</div>
                    <div className="text-sm font-bold text-white font-mono">
                      ${w.box1Wages.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                  </div>

                  {/* Box 2 */}
                  <div className="p-2.5 rounded-xl bg-stone-950 border border-stone-800/80 space-y-0.5">
                    <div className="text-[10px] text-amber-400/80 font-mono">Box 2 • Fed Tax Withheld</div>
                    <div className="text-sm font-bold text-amber-300 font-mono">
                      ${w.box2FedTaxWithheld.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                  </div>

                  {/* Box 3 & 4 */}
                  <div className="p-2.5 rounded-xl bg-stone-950 border border-stone-800/80 space-y-0.5">
                    <div className="text-[10px] text-stone-500 font-mono">Box 4 • Soc. Security Tax</div>
                    <div className="text-sm font-medium text-stone-300 font-mono">
                      ${w.box4SocialSecurityTax.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                  </div>

                  {/* Box 5 & 6 */}
                  <div className="p-2.5 rounded-xl bg-stone-950 border border-stone-800/80 space-y-0.5">
                    <div className="text-[10px] text-stone-500 font-mono">Box 6 • Medicare Tax</div>
                    <div className="text-sm font-medium text-stone-300 font-mono">
                      ${w.box6MedicareTax.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                  </div>

                  {/* Box 15 State */}
                  <div className={`p-2.5 rounded-xl border space-y-0.5 ${
                    isNoTax ? 'bg-emerald-950/20 border-emerald-800/40' : 'bg-stone-950 border-stone-800/80'
                  }`}>
                    <div className="text-[10px] text-stone-500 font-mono">Box 15 • State Code</div>
                    <div className="text-sm font-bold text-white font-mono flex items-center gap-1.5">
                      <span>{w.box15State || 'N/A'}</span>
                      <span className="text-[10px] font-normal text-stone-400">
                        ({assessment?.stateName || 'None'})
                      </span>
                    </div>
                  </div>

                  {/* Box 17 State Tax */}
                  <div className={`p-2.5 rounded-xl border space-y-0.5 ${
                    isNoTax
                      ? 'bg-emerald-950/20 border-emerald-800/40'
                      : w.box17StateTaxWithheld > 0
                      ? 'bg-amber-950/20 border-amber-800/40'
                      : 'bg-stone-950 border-stone-800/80'
                  }`}>
                    <div className="text-[10px] text-sky-400/80 font-mono">Box 17 • State Withheld</div>
                    <div className={`text-sm font-bold font-mono ${
                      isNoTax ? 'text-emerald-300' : 'text-sky-300'
                    }`}>
                      ${w.box17StateTaxWithheld.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>

                {/* State Tax Advisory Footer */}
                <div className="p-3 rounded-xl bg-stone-950/60 border border-stone-800/60 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-stone-400">
                  <div className="flex items-center gap-2">
                    <Info className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>{assessment?.filingAdvice || 'Verified with tax guidelines.'}</span>
                  </div>
                  {w.fileName && (
                    <div className="text-[11px] font-mono text-stone-500">
                      File: {w.fileName}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* 1099 Cards */}
          {(activeFilter === 'ALL' || activeFilter === '1099') && form1099s.map((f) => {
            const assessment = f.stateAssessment;
            return (
              <div
                key={f.id}
                className="p-5 rounded-2xl bg-stone-900/90 border border-stone-800 hover:border-stone-700 transition-all shadow-md space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-800/80 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
                      <FileCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-white">{f.payerName}</h4>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-stone-800 text-stone-300">
                          Tax Year {f.taxYear}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-sky-500/10 text-sky-300 border border-sky-500/20">
                          {f.formType === '1099_NEC' ? 'Form 1099-NEC' : 'Form 1099-MISC'}
                        </span>
                      </div>
                      <p className="text-[11px] text-stone-400 font-mono">
                        Payer TIN: {f.payerTin} • Recipient: {f.recipientName}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-start sm:self-auto">
                    <div className="px-3 py-1 rounded-xl text-xs font-semibold bg-stone-950 border border-stone-800 text-stone-300">
                      <span>{assessment?.summaryMessage || `${f.box6State} State Info`}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        delete1099Record(f.id);
                        refreshDocs();
                        if (onToast) onToast(`Deleted 1099 for ${f.payerName}`);
                      }}
                      className="p-1.5 rounded-lg text-stone-500 hover:text-rose-400 hover:bg-stone-800 transition-colors cursor-pointer"
                      title="Delete 1099"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-2.5 rounded-xl bg-stone-950 border border-stone-800/80 space-y-0.5">
                    <div className="text-[10px] text-stone-500 font-mono">Box 1 • Nonemployee Comp</div>
                    <div className="text-sm font-bold text-white font-mono">
                      ${f.box1Amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-stone-950 border border-stone-800/80 space-y-0.5">
                    <div className="text-[10px] text-amber-400/80 font-mono">Box 4 • Fed Tax Withheld</div>
                    <div className="text-sm font-bold text-amber-300 font-mono">
                      ${f.box4FedTaxWithheld.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-stone-950 border border-stone-800/80 space-y-0.5">
                    <div className="text-[10px] text-stone-500 font-mono">Box 6 • State Code</div>
                    <div className="text-sm font-bold text-white font-mono">
                      {f.box6State || 'N/A'}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-stone-950 border border-stone-800/80 space-y-0.5">
                    <div className="text-[10px] text-sky-400/80 font-mono">Box 5 • State Withheld</div>
                    <div className="text-sm font-bold text-sky-300 font-mono">
                      ${f.box5StateTaxWithheld.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Manual Add W-2 Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">Manual Form W-2 Entry</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveManualW2} className="space-y-4 text-xs">
              {/* Employer Details */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <label className="font-semibold text-stone-300">Employer Name *</label>
                  <input
                    type="text"
                    required
                    value={employerName}
                    onChange={(e) => setEmployerName(e.target.value)}
                    placeholder="e.g. Acme Health Systems Corp"
                    className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-stone-200 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-stone-300">Tax Year</label>
                  <input
                    type="number"
                    value={w2Year}
                    onChange={(e) => setW2Year(parseInt(e.target.value) || 2025)}
                    className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-stone-200 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-stone-300">Employer EIN (Optional)</label>
                <input
                  type="text"
                  value={employerEin}
                  onChange={(e) => setEmployerEin(e.target.value)}
                  placeholder="e.g. 12-3456789"
                  className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-stone-200 focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              {/* Federal Income Boxes */}
              <div className="p-3.5 rounded-xl bg-stone-950 border border-stone-800 space-y-3">
                <div className="font-bold text-amber-400">Federal Wage &amp; Withholding Boxes</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-stone-300">Box 1 • Wages, tips, other compensation ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={box1Wages}
                      onChange={(e) => setBox1Wages(e.target.value)}
                      placeholder="e.g. 65000.00"
                      className="w-full px-3 py-2 bg-stone-900 border border-stone-800 rounded-xl text-stone-200 focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-stone-300">Box 2 • Federal income tax withheld ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={box2FedTax}
                      onChange={(e) => setBox2FedTax(e.target.value)}
                      placeholder="e.g. 8200.00"
                      className="w-full px-3 py-2 bg-stone-900 border border-stone-800 rounded-xl text-stone-200 focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* State Income & Withholding Boxes (Boxes 15 - 17) */}
              <div className="p-3.5 rounded-xl bg-stone-950 border border-stone-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-sky-400">State &amp; Local Tax Boxes (Boxes 15–20)</div>
                  <span className="text-[11px] text-stone-400 font-mono">
                    Auto-evaluates state tax status
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-stone-300">Box 15 • State Code (2-Letters)</label>
                    <input
                      type="text"
                      maxLength={2}
                      value={box15State}
                      onChange={(e) => setBox15State(e.target.value.toUpperCase())}
                      placeholder="IL, TX, CA, FL..."
                      className="w-full px-3 py-2 bg-stone-900 border border-stone-800 rounded-xl text-stone-200 focus:outline-none focus:border-amber-500 font-mono uppercase"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-stone-300">Box 16 • State Wages ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={box16StateWages}
                      onChange={(e) => setBox16StateWages(e.target.value)}
                      placeholder="Leave blank to use Box 1"
                      className="w-full px-3 py-2 bg-stone-900 border border-stone-800 rounded-xl text-stone-200 focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-stone-300">Box 17 • State Tax Withheld ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={box17StateTax}
                      onChange={(e) => setBox17StateTax(e.target.value)}
                      placeholder="e.g. 3217.50 (0 for TX/FL)"
                      className="w-full px-3 py-2 bg-stone-900 border border-stone-800 rounded-xl text-stone-200 focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>
                </div>

                {/* Real-time State Tax Indicator Preview */}
                {box15State && (
                  <div className={`p-2.5 rounded-lg border text-[11px] flex items-center gap-2 ${
                    NO_INCOME_TAX_STATES[box15State]
                      ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-300'
                      : parseFloat(box17StateTax) > 0
                      ? 'bg-amber-950/30 border-amber-800/40 text-amber-300'
                      : 'bg-stone-900 border-stone-800 text-stone-400'
                  }`}>
                    <Info className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {NO_INCOME_TAX_STATES[box15State]
                        ? `${US_STATES_MAP[box15State]} (${box15State}) has NO state personal earned wage tax. State return is NOT required.`
                        : parseFloat(box17StateTax) > 0
                        ? `${US_STATES_MAP[box15State] || box15State} requires a state return with $${parseFloat(box17StateTax).toFixed(2)} withheld.`
                        : `Reporting ${US_STATES_MAP[box15State] || box15State} wages.`}
                    </span>
                  </div>
                )}
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold transition-all shadow-md shadow-amber-500/10 cursor-pointer"
                >
                  Save W-2 Statement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
