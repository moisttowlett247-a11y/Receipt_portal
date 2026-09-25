import React, { useState, useEffect, useRef } from 'react';
import { 
  ShieldCheck, 
  UploadCloud, 
  FileText, 
  CheckCircle2, 
  Clock, 
  Mail, 
  Sparkles, 
  User, 
  Building, 
  Send, 
  ExternalLink, 
  Check, 
  Building2, 
  Receipt, 
  AlertCircle,
  FileCheck2,
  Trash2,
  Calendar,
  DollarSign,
  Tag,
  Camera,
  Layers,
  HelpCircle,
  Lock,
  ChevronRight
} from 'lucide-react';
import { LicenseKeyRecord, ProductInquiry, ClientAccountSession } from '../types';
import { getCurrentClientSession, clearClientSession } from '../clientAccountService';
import { 
  getClientSubmissions, 
  addClientSubmission, 
  ClientSubmission, 
  deleteSubmission 
} from '../clientSubmissionService';
import { ClientAuthModal } from './ClientAuthModal';
import { ClientAccountModal } from './ClientAccountModal';

interface ClientPortalViewProps {
  licenseKeys: LicenseKeyRecord[];
  currentVersion: string;
  onInquirySubmitted?: (inquiry: ProductInquiry) => void;
  onOpenLegal?: (tab: 'privacy' | 'terms' | 'support') => void;
  onNavigateToAdmin?: () => void;
  onLicenseRevoked?: (key: string) => void;
}

export const ClientPortalView: React.FC<ClientPortalViewProps> = ({
  licenseKeys,
  currentVersion,
  onInquirySubmitted,
  onOpenLegal,
  onNavigateToAdmin
}) => {
  const [clientSession, setClientSession] = useState<ClientAccountSession | null>(() => getCurrentClientSession());
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');
  const [showAccountModal, setShowAccountModal] = useState(false);

  // Submissions state
  const [submissions, setSubmissions] = useState<ClientSubmission[]>(() => getClientSubmissions());
  const [selectedCategoryHint, setSelectedCategoryHint] = useState('Auto-Detect (AI)');
  const [submissionMemo, setSubmissionMemo] = useState('');
  const [clientEntityName, setClientEntityName] = useState(() => clientSession?.displayName || 'Prairie Wind Agriculture');
  const [clientEntityEmail, setClientEntityEmail] = useState(() => clientSession?.email || 'billing@prairiewind.example.com');

  // File upload state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccessCount, setUploadSuccessCount] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'upload' | 'history' | 'services'>('upload');

  // Service Request Form State
  const [inquiryName, setInquiryName] = useState(() => clientSession?.displayName || '');
  const [inquiryEmail, setInquiryEmail] = useState(() => clientSession?.email || '');
  const [inquiryCompany, setInquiryCompany] = useState(() => clientSession?.companyName || '');
  const [inquiryPlan, setInquiryPlan] = useState('Monthly Bookkeeping & Sync ($49/mo)');
  const [inquiryNotes, setInquiryNotes] = useState('');
  const [isSubmittingInquiry, setIsSubmittingInquiry] = useState(false);
  const [inquirySuccess, setInquirySuccess] = useState(false);

  // Filter state for history
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'QUEUED' | 'SYNCED_QBO'>('ALL');

  useEffect(() => {
    if (clientSession) {
      if (clientSession.displayName) {
        setClientEntityName(clientSession.displayName);
        setInquiryName(clientSession.displayName);
      }
      if (clientSession.email) {
        setClientEntityEmail(clientSession.email);
        setInquiryEmail(clientSession.email);
      }
      if (clientSession.companyName) {
        setInquiryCompany(clientSession.companyName);
      }
    }
  }, [clientSession]);

  const refreshSubmissions = () => {
    setSubmissions(getClientSubmissions());
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      setSelectedFiles(prev => [...prev, ...filesArray]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      const filesArray = Array.from(e.dataTransfer.files);
      setSelectedFiles(prev => [...prev, ...filesArray]);
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmitFiles = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedFiles.length === 0) return;

    setIsUploading(true);
    setUploadSuccessCount(null);

    try {
      let count = 0;
      for (const file of selectedFiles) {
        let dataUrl: string | undefined = undefined;
        if (file.type.startsWith('image/')) {
          try {
            dataUrl = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = () => resolve('');
              reader.readAsDataURL(file);
            });
          } catch {
            dataUrl = undefined;
          }
        }

        addClientSubmission({
          clientId: clientSession?.userId || `client-${clientEntityName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
          clientName: clientEntityName.trim() || 'Client Business',
          clientEmail: clientEntityEmail.trim() || 'client@example.com',
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type || 'application/octet-stream',
          dataUrl,
          categoryHint: selectedCategoryHint !== 'Auto-Detect (AI)' ? selectedCategoryHint : undefined,
          memo: submissionMemo.trim() || undefined
        });
        count++;
      }

      refreshSubmissions();
      setSelectedFiles([]);
      setSubmissionMemo('');
      setUploadSuccessCount(count);
      setActiveTab('history');
      setTimeout(() => setUploadSuccessCount(null), 5000);
    } finally {
      setIsUploading(false);
    }
  };

  const handleServiceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inquiryName.trim() || !inquiryEmail.trim()) return;

    setIsSubmittingInquiry(true);
    const newInquiry: ProductInquiry = {
      id: `service-req-${Date.now()}`,
      name: inquiryName.trim(),
      email: inquiryEmail.trim(),
      company: inquiryCompany.trim() || undefined,
      receiptVolume: 'Client Service Request',
      interestedPlan: inquiryPlan,
      notes: inquiryNotes.trim() || undefined,
      submittedAt: new Date().toISOString()
    };

    try {
      const existingRaw = localStorage.getItem('receipt_processor_inquiries');
      const existing: ProductInquiry[] = existingRaw ? JSON.parse(existingRaw) : [];
      localStorage.setItem('receipt_processor_inquiries', JSON.stringify([newInquiry, ...existing]));
    } catch {}

    if (onInquirySubmitted) {
      onInquirySubmitted(newInquiry);
    }

    setTimeout(() => {
      setIsSubmittingInquiry(false);
      setInquirySuccess(true);
    }, 400);
  };

  // Calculations
  const filteredSubmissions = submissions.filter(sub => {
    if (statusFilter === 'ALL') return true;
    return sub.status === statusFilter;
  });

  const totalAmountProcessed = submissions.reduce((sum, s) => sum + (s.extractedAmount || 0), 0);
  const syncedCount = submissions.filter(s => s.status === 'SYNCED_QBO').length;

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col font-sans antialiased selection:bg-amber-500 selection:text-stone-950">
      {/* Top Header */}
      <header className="border-b border-stone-800 bg-stone-900/90 backdrop-blur sticky top-0 z-30 px-4 sm:px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-bold tracking-tight text-stone-100">
                Client Receipt Submission Portal
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hidden sm:inline-flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Managed Bookkeeping Intake
              </span>
            </div>
            <p className="text-xs text-stone-400 hidden sm:block">
              Zero-friction receipt submission. Our central accounting team processes, categorizes, and reconciles your expenses into QuickBooks.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {clientSession ? (
            <button
              type="button"
              onClick={() => setShowAccountModal(true)}
              className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold bg-stone-800 hover:bg-stone-700 text-amber-400 border border-amber-500/30 rounded-lg shadow-sm transition-all cursor-pointer"
            >
              <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center text-[10px] font-bold text-amber-300">
                {clientSession.displayName.slice(0, 1).toUpperCase()}
              </div>
              <span className="hidden sm:inline font-medium text-stone-200">
                {clientSession.displayName}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-400 font-mono">
                My Account
              </span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setAuthModalMode('login');
                  setShowAuthModal(true);
                }}
                className="px-3 py-1.5 text-xs font-semibold text-stone-300 hover:text-white hover:bg-stone-800/80 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <User className="w-3.5 h-3.5 text-stone-400" />
                <span>Sign In</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthModalMode('register');
                  setShowAuthModal(true);
                }}
                className="px-3 py-1.5 text-xs font-semibold text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg transition-all cursor-pointer hidden sm:flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Create Client Account</span>
              </button>
            </div>
          )}

          {/* Admin shortcut button */}
          <button
            type="button"
            onClick={onNavigateToAdmin}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-stone-800/80 hover:bg-stone-700 text-stone-300 hover:text-white border border-stone-700 rounded-lg transition-colors cursor-pointer"
            title="Switch to Operator & Accounting Admin Console"
          >
            <Lock className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden md:inline">Accountant Console</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Welcome Client Card */}
        <div className="p-5 rounded-2xl bg-gradient-to-r from-stone-900 via-stone-900 to-amber-950/20 border border-stone-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                CENTRAL BOOKKEEPING SERVICE ACTIVE
              </span>
              <span className="text-xs text-stone-500">•</span>
              <span className="text-xs text-stone-400">Zero Local Scripts Required</span>
            </div>
            <h2 className="text-base sm:text-xl font-bold text-white">
              Effortless Receipt & Invoice Submission
            </h2>
            <p className="text-xs text-stone-300 max-w-2xl leading-relaxed">
              Snap receipts with your phone or drop invoices below. Your bookkeeping team reconciles every transaction, 
              detects tax deductions, and syncs directly into your QuickBooks Online account.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="px-4 py-2 rounded-xl bg-stone-950/80 border border-stone-800 text-center">
              <div className="text-[10px] text-stone-400 uppercase tracking-wider font-semibold">Total Reconciled</div>
              <div className="text-sm sm:text-base font-bold font-mono text-emerald-400">${totalAmountProcessed.toFixed(2)}</div>
            </div>
            <div className="px-4 py-2 rounded-xl bg-stone-950/80 border border-stone-800 text-center">
              <div className="text-[10px] text-stone-400 uppercase tracking-wider font-semibold">QBO Synced</div>
              <div className="text-sm sm:text-base font-bold font-mono text-amber-400">{syncedCount} Receipts</div>
            </div>
          </div>
        </div>

        {/* Option B Dedicated Email Intake Banner */}
        <div className="p-4 rounded-xl bg-sky-950/30 border border-sky-800/40 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-300 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-sky-200 flex items-center gap-1.5">
                <span>Want to submit via email? (Option B Sender Mapping)</span>
              </div>
              <p className="text-stone-300 text-[11px] leading-relaxed">
                Forward receipt photos or PDF invoices directly to <strong className="text-sky-300">receipts@yourfirm.com</strong> (or <strong className="text-stone-200">moisttowlett247@gmail.com</strong>).
                Send from your registered address (<strong className="text-amber-300">{clientEntityEmail}</strong>) and our system automatically routes them to your QuickBooks!
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText('moisttowlett247@gmail.com');
              alert('Copied intake address: moisttowlett247@gmail.com');
            }}
            className="px-3 py-1.5 bg-sky-900/60 hover:bg-sky-800 text-sky-200 font-medium rounded-lg transition-colors cursor-pointer text-xs shrink-0 self-start sm:self-auto border border-sky-700/50"
          >
            Copy Intake Email
          </button>
        </div>

        {/* Portal Navigation Tabs */}
        <div className="flex border-b border-stone-800 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-colors cursor-pointer flex items-center gap-2 border-b-2 ${
              activeTab === 'upload'
                ? 'border-amber-500 text-amber-400 bg-stone-900/60'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <UploadCloud className="w-4 h-4" />
            <span>Upload New Receipts</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-colors cursor-pointer flex items-center gap-2 border-b-2 ${
              activeTab === 'history'
                ? 'border-amber-500 text-amber-400 bg-stone-900/60'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>Submission Ledger & QBO Status</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-stone-800 font-mono text-stone-300">
              {submissions.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('services')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-colors cursor-pointer flex items-center gap-2 border-b-2 ${
              activeTab === 'services'
                ? 'border-amber-500 text-amber-400 bg-stone-900/60'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Bookkeeping Services</span>
          </button>
        </div>

        {/* TAB 1: Upload Receipts */}
        {activeTab === 'upload' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Cols: Dropzone & File Uploader */}
            <div className="lg:col-span-2 space-y-4">
              <form onSubmit={handleSubmitFiles} className="p-6 rounded-2xl bg-stone-900/90 border border-stone-800 space-y-5 shadow-lg">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Camera className="w-4 h-4 text-amber-400" />
                      <span>Upload Receipt Photos & Invoices</span>
                    </h3>
                    <p className="text-xs text-stone-400">
                      Supports JPG, PNG, HEIC, WebP, and PDF invoices
                    </p>
                  </div>

                  <span className="text-[11px] text-stone-400 font-mono">
                    {selectedFiles.length} file(s) selected
                  </span>
                </div>

                {/* Drag and Drop Zone */}
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-stone-700 hover:border-amber-500/70 bg-stone-950/60 hover:bg-stone-950/90 rounded-2xl p-8 text-center cursor-pointer transition-all space-y-3 group"
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    multiple
                    accept="image/*,application/pdf"
                    className="hidden"
                  />
                  <div className="w-12 h-12 rounded-full bg-amber-500/10 group-hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto transition-colors">
                    <UploadCloud className="w-6 h-6" />
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs sm:text-sm font-semibold text-stone-200">
                      Click to browse or drag and drop receipts here
                    </p>
                    <p className="text-[11px] text-stone-400">
                      Take a snapshot with your mobile camera or upload multi-page supplier statements
                    </p>
                  </div>

                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-stone-800 text-[10px] text-stone-300 font-mono">
                    <span>JPEG • PNG • PDF • WebP</span>
                  </div>
                </div>

                {/* Selected File Previews */}
                {selectedFiles.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-stone-300 flex items-center justify-between">
                      <span>Ready to Upload ({selectedFiles.length})</span>
                      <button
                        type="button"
                        onClick={() => setSelectedFiles([])}
                        className="text-[11px] text-rose-400 hover:underline cursor-pointer"
                      >
                        Clear All
                      </button>
                    </label>

                    <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                      {selectedFiles.map((file, idx) => (
                        <div
                          key={`${file.name}-${idx}`}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-stone-950 border border-stone-800 text-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <FileText className="w-4 h-4 text-amber-400 shrink-0" />
                            <div className="truncate">
                              <p className="font-medium text-stone-200 truncate">{file.name}</p>
                              <p className="text-[10px] text-stone-500 font-mono">{(file.size / 1024).toFixed(1)} KB</p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveFile(idx)}
                            className="p-1 text-stone-400 hover:text-rose-400 transition-colors cursor-pointer"
                            title="Remove file"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Optional Metadata Inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-stone-800/80">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-stone-300 flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-amber-400" />
                      <span>Category Hint (Optional)</span>
                    </label>
                    <select
                      value={selectedCategoryHint}
                      onChange={(e) => setSelectedCategoryHint(e.target.value)}
                      className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-xs text-stone-200 focus:outline-none focus:border-amber-500"
                    >
                      <option value="Auto-Detect (AI)">Auto-Detect (Bookkeeper AI)</option>
                      <option value="Supplies & Materials">Supplies & Materials</option>
                      <option value="Farm:Feed & Fertilizer">Farm: Feed & Fertilizer</option>
                      <option value="Farm:Livestock & Veterinary">Farm: Livestock & Veterinary</option>
                      <option value="Repairs & Maintenance">Repairs & Maintenance</option>
                      <option value="Automobile:Fuel & Diesel">Automobile: Fuel & Diesel</option>
                      <option value="Meals & Entertainment">Meals & Entertainment</option>
                      <option value="Office & Software">Office & Software</option>
                      <option value="Utilities & Cell">Utilities & Cell</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-stone-300 flex items-center gap-1.5">
                      <FileCheck2 className="w-3.5 h-3.5 text-amber-400" />
                      <span>Memo / Note for Accountant</span>
                    </label>
                    <input
                      type="text"
                      value={submissionMemo}
                      onChange={(e) => setSubmissionMemo(e.target.value)}
                      placeholder="e.g. John Deere part replacement, Field 4 fuel"
                      className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-xs text-stone-200 focus:outline-none focus:border-amber-500 placeholder:text-stone-600"
                    />
                  </div>
                </div>

                {/* Upload Button */}
                <button
                  type="submit"
                  disabled={selectedFiles.length === 0 || isUploading}
                  className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 text-stone-950 text-xs font-bold rounded-xl transition-all cursor-pointer shadow-lg shadow-amber-500/10 flex items-center justify-center gap-2"
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>{isUploading ? 'Securing & Queueing Receipts...' : `Submit ${selectedFiles.length > 0 ? selectedFiles.length : ''} Receipt(s) to Bookkeeper`}</span>
                </button>
              </form>
            </div>

            {/* Right Column: Account Profile & Submission Info */}
            <div className="space-y-4">
              <div className="p-5 rounded-2xl bg-stone-900/90 border border-stone-800 space-y-4 shadow-lg">
                <div className="flex items-center gap-2 font-bold text-xs text-stone-200">
                  <Building className="w-4 h-4 text-amber-400" />
                  <span>Your Business Account</span>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider">Business / Farm Name</label>
                    <input
                      type="text"
                      value={clientEntityName}
                      onChange={(e) => setClientEntityName(e.target.value)}
                      className="w-full mt-1 px-3 py-1.5 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-200 focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider">Registered Email (Option B)</label>
                    <input
                      type="email"
                      value={clientEntityEmail}
                      onChange={(e) => setClientEntityEmail(e.target.value)}
                      className="w-full mt-1 px-3 py-1.5 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-200 focus:border-amber-500"
                    />
                  </div>

                  <div className="p-3 rounded-xl bg-stone-950 border border-stone-800 space-y-1">
                    <div className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>QuickBooks Online Connected</span>
                    </div>
                    <p className="text-[11px] text-stone-400">
                      Expenses are reconciled directly into your linked company file by the central accounting engine.
                    </p>
                  </div>
                </div>
              </div>

              {/* How it works info card */}
              <div className="p-5 rounded-2xl bg-stone-900/40 border border-stone-800/80 space-y-3 text-xs">
                <h4 className="font-bold text-stone-200 flex items-center gap-1.5">
                  <HelpCircle className="w-4 h-4 text-amber-400" />
                  <span>How Your Receipts Are Handled</span>
                </h4>
                <ul className="space-y-2 text-[11px] text-stone-300">
                  <li className="flex items-start gap-2">
                    <div className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</div>
                    <span>You upload or email receipts when you make purchases.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</div>
                    <span>Our central AI vision engine reads the vendor, taxes, line items, and totals.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</div>
                    <span>Your bookkeeping team reconciles deductible business expenses and syncs them into QuickBooks Online.</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Submission History & Ledger */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            {uploadSuccessCount && (
              <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-xs text-emerald-200 flex items-center gap-2 animate-in fade-in duration-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Successfully queued <strong>{uploadSuccessCount} receipt(s)</strong>! Your bookkeeper's central engine will analyze and reconcile them shortly.</span>
              </div>
            )}

            {/* Filter bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-stone-900/90 border border-stone-800 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-stone-400 font-medium">Filter Status:</span>
                <button
                  type="button"
                  onClick={() => setStatusFilter('ALL')}
                  className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                    statusFilter === 'ALL'
                      ? 'bg-amber-500 text-stone-950 font-bold'
                      : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                  }`}
                >
                  All ({submissions.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('SYNCED_QBO')}
                  className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                    statusFilter === 'SYNCED_QBO'
                      ? 'bg-emerald-600 text-white font-bold'
                      : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                  }`}
                >
                  Synced to QBO ({syncedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('QUEUED')}
                  className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                    statusFilter === 'QUEUED'
                      ? 'bg-sky-600 text-white font-bold'
                      : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                  }`}
                >
                  In Intake Queue ({submissions.filter(s => s.status === 'QUEUED').length})
                </button>
              </div>

              <span className="text-[11px] text-stone-400">
                Showing {filteredSubmissions.length} of {submissions.length} receipts
              </span>
            </div>

            {/* Submissions List */}
            {filteredSubmissions.length === 0 ? (
              <div className="p-12 text-center rounded-2xl bg-stone-900/40 border border-stone-800 space-y-3">
                <Receipt className="w-10 h-10 text-stone-600 mx-auto" />
                <h4 className="text-sm font-bold text-stone-300">No receipts found for this filter</h4>
                <p className="text-xs text-stone-500 max-w-sm mx-auto">
                  Click 'Upload New Receipts' to add receipts or forward receipt attachments to your intake email address.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('upload')}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Upload First Receipt
                </button>
              </div>
            ) : (
              <div className="rounded-2xl bg-stone-900/90 border border-stone-800 overflow-hidden shadow-lg">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-stone-950/80 text-stone-400 text-[10px] uppercase font-mono border-b border-stone-800">
                      <tr>
                        <th className="py-3 px-4">Receipt / File</th>
                        <th className="py-3 px-4">Client / Entity</th>
                        <th className="py-3 px-4">Vendor & Category</th>
                        <th className="py-3 px-4">Amount</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Submitted</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-800 text-stone-300">
                      {filteredSubmissions.map((sub) => (
                        <tr key={sub.id} className="hover:bg-stone-800/40 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              {sub.dataUrl ? (
                                <img
                                  src={sub.dataUrl}
                                  alt="Receipt thumbnail"
                                  className="w-8 h-8 rounded-lg object-cover border border-stone-700 shrink-0"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-lg bg-stone-800 border border-stone-700 flex items-center justify-center text-stone-400 shrink-0">
                                  <FileText className="w-4 h-4" />
                                </div>
                              )}
                              <div className="min-w-0 max-w-xs">
                                <p className="font-medium text-stone-200 truncate">{sub.fileName}</p>
                                {sub.memo && (
                                  <p className="text-[10px] text-stone-400 truncate italic">Memo: "{sub.memo}"</p>
                                )}
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-4 font-medium text-stone-300 whitespace-nowrap">
                            {sub.clientName}
                          </td>

                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="font-semibold text-stone-200">
                              {sub.extractedVendor || 'Pending OCR'}
                            </div>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-800 text-amber-400/90 font-mono">
                              {sub.categoryHint || 'Auto-Deductible'}
                            </span>
                          </td>

                          <td className="py-3 px-4 whitespace-nowrap font-mono font-bold text-emerald-400">
                            {sub.extractedAmount ? `$${sub.extractedAmount.toFixed(2)}` : '—'}
                          </td>

                          <td className="py-3 px-4 whitespace-nowrap">
                            {sub.status === 'SYNCED_QBO' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                <CheckCircle2 className="w-3 h-3" />
                                Synced to QuickBooks
                              </span>
                            ) : sub.status === 'PROCESSING' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/30">
                                <Clock className="w-3 h-3 animate-spin" />
                                Analyzing (VM Worker)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-sky-500/10 text-sky-400 border border-sky-500/30">
                                <Clock className="w-3 h-3" />
                                Queued for Processing
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4 text-stone-400 text-[11px] whitespace-nowrap font-mono">
                            {new Date(sub.uploadedAt).toLocaleDateString()}
                          </td>

                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                deleteSubmission(sub.id);
                                refreshSubmissions();
                              }}
                              className="text-stone-500 hover:text-rose-400 p-1 transition-colors cursor-pointer"
                              title="Delete submission record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Bookkeeping Services & Request */}
        {activeTab === 'services' && (
          <div className="space-y-6">
            <div className="text-center max-w-xl mx-auto space-y-2">
              <h3 className="text-lg font-bold text-stone-100">
                Managed Receipt & Expense Accounting Packages
              </h3>
              <p className="text-xs text-stone-400 leading-relaxed">
                Choose the service tier that matches your monthly volume. Everything is managed locally and on our dedicated accounting engines.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Card 1 */}
              <div className="p-6 rounded-2xl bg-stone-900 border border-stone-800 space-y-4 flex flex-col justify-between hover:border-amber-500/40 transition-colors">
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider font-mono">Starter</span>
                  <h4 className="text-base font-bold text-white">Monthly Bookkeeping</h4>
                  <div className="text-2xl font-extrabold text-stone-100 font-mono">
                    $49<span className="text-xs text-stone-400 font-normal"> / month</span>
                  </div>
                  <p className="text-xs text-stone-400">
                    Up to 100 receipts/month. Full OCR line item breakdown and automated QuickBooks reconciliation.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setInquiryPlan('Monthly Bookkeeping & Sync ($49/mo)');
                    const el = document.getElementById('service-form');
                    el?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="w-full py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Select Monthly
                </button>
              </div>

              {/* Card 2 Recommended */}
              <div className="p-6 rounded-2xl bg-gradient-to-b from-stone-900 to-amber-950/20 border-2 border-amber-500 shadow-xl space-y-4 flex flex-col justify-between relative">
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-stone-950 font-mono">
                  MOST POPULAR
                </span>
                <div className="space-y-2 pt-1">
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider font-mono">Quarterly</span>
                  <h4 className="text-base font-bold text-white">Quarterly Tax & Expense Prep</h4>
                  <div className="text-2xl font-extrabold text-stone-100 font-mono">
                    $129<span className="text-xs text-stone-400 font-normal"> / quarter</span>
                  </div>
                  <p className="text-xs text-stone-300">
                    Up to 400 receipts. Schedule F & Schedule C deduction categorization, mileage logs, and accountant audit pack.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setInquiryPlan('Quarterly Tax & Expense Prep ($129/quarter)');
                    const el = document.getElementById('service-form');
                    el?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-lg shadow-amber-500/20"
                >
                  Select Quarterly
                </button>
              </div>

              {/* Card 3 */}
              <div className="p-6 rounded-2xl bg-stone-900 border border-stone-800 space-y-4 flex flex-col justify-between hover:border-amber-500/40 transition-colors">
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider font-mono">Year-End</span>
                  <h4 className="text-base font-bold text-white">Annual Farm & Tax Package</h4>
                  <div className="text-2xl font-extrabold text-stone-100 font-mono">
                    $349<span className="text-xs text-stone-400 font-normal"> / year</span>
                  </div>
                  <p className="text-xs text-stone-400">
                    Unlimited receipts. Year-end CPA ledger export, multi-company reconciliation, and continuous email intake.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setInquiryPlan('Annual Farm & Tax Package ($349/year)');
                    const el = document.getElementById('service-form');
                    el?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="w-full py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Select Annual
                </button>
              </div>
            </div>

            {/* Service Request Form */}
            <div id="service-form" className="max-w-xl mx-auto p-6 rounded-2xl bg-stone-900 border border-stone-800 space-y-4 shadow-lg">
              <h4 className="text-sm font-bold text-stone-100 flex items-center gap-2">
                <Send className="w-4 h-4 text-amber-400" />
                <span>Request Service Setup</span>
              </h4>

              {inquirySuccess ? (
                <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-xs text-emerald-200 space-y-2">
                  <div className="font-bold flex items-center gap-2 text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Request Received!</span>
                  </div>
                  <p className="text-stone-300">
                    Thank you, <strong className="text-white">{inquiryName}</strong>! Your request for the <strong className="text-amber-400">{inquiryPlan}</strong> has been routed to your central accounting operator. We will confirm your setup within 24 hours.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleServiceSubmit} className="space-y-3 text-xs">
                  <div>
                    <label className="text-[11px] font-medium text-stone-300">Full Name</label>
                    <input
                      type="text"
                      required
                      value={inquiryName}
                      onChange={(e) => setInquiryName(e.target.value)}
                      placeholder="Jane Doe"
                      className="w-full mt-1 px-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-stone-200 focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-stone-300">Contact Email Address</label>
                    <input
                      type="email"
                      required
                      value={inquiryEmail}
                      onChange={(e) => setInquiryEmail(e.target.value)}
                      placeholder="billing@yourfarm.com"
                      className="w-full mt-1 px-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-stone-200 focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-stone-300">Farm / Business Entity</label>
                    <input
                      type="text"
                      value={inquiryCompany}
                      onChange={(e) => setInquiryCompany(e.target.value)}
                      placeholder="Green Valley Farms LLC"
                      className="w-full mt-1 px-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-stone-200 focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-stone-300">Selected Service Plan</label>
                    <input
                      type="text"
                      readOnly
                      value={inquiryPlan}
                      className="w-full mt-1 px-3 py-2 bg-stone-950/60 border border-stone-800 rounded-xl text-amber-300 font-semibold cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-stone-300">Notes / QuickBooks Details</label>
                    <textarea
                      rows={2}
                      value={inquiryNotes}
                      onChange={(e) => setInquiryNotes(e.target.value)}
                      placeholder="Mention your QuickBooks company name or special receipt requirements..."
                      className="w-full mt-1 px-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-stone-200 focus:border-amber-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmittingInquiry}
                    className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-xl transition-colors cursor-pointer mt-2"
                  >
                    {isSubmittingInquiry ? 'Submitting Request...' : 'Send Request to Accounting Team'}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-800 bg-stone-900/60 py-6 px-6 mt-12 text-center text-xs text-stone-500 space-y-2">
        <p>
          Farm & Small Business Receipt Processor — Client Intake Portal v{currentVersion}
        </p>
        <div className="flex items-center justify-center gap-4 text-[11px]">
          <button type="button" onClick={() => onOpenLegal?.('privacy')} className="hover:text-stone-300 cursor-pointer">
            Privacy Policy
          </button>
          <span>•</span>
          <button type="button" onClick={() => onOpenLegal?.('terms')} className="hover:text-stone-300 cursor-pointer">
            Terms of Service
          </button>
          <span>•</span>
          <button type="button" onClick={() => onOpenLegal?.('support')} className="hover:text-stone-300 cursor-pointer">
            Support
          </button>
        </div>
      </footer>

      {/* Modals */}
      {showAuthModal && (
        <ClientAuthModal
          mode={authModalMode}
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onSuccess={(session) => {
            setClientSession(session);
            setShowAuthModal(false);
          }}
          onSwitchMode={(newMode) => setAuthModalMode(newMode)}
        />
      )}

      {showAccountModal && clientSession && (
        <ClientAccountModal
          session={clientSession}
          isOpen={showAccountModal}
          onClose={() => setShowAccountModal(false)}
          onSignOut={() => {
            clearClientSession();
            setClientSession(null);
            setShowAccountModal(false);
          }}
          onProfileUpdated={(updated) => setClientSession(updated)}
        />
      )}
    </div>
  );
};
