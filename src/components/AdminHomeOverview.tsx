import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Key, 
  RefreshCw, 
  Download, 
  CheckCircle2, 
  AlertTriangle, 
  FileCode2, 
  Copy, 
  Layers, 
  Lock, 
  ExternalLink, 
  ChevronRight, 
  Check, 
  Crown, 
  Radio, 
  Building2, 
  Mail, 
  Inbox, 
  Cpu, 
  FileSpreadsheet,
  Home,
  ArrowRight,
  TrendingUp,
  FileCheck2,
  Users,
  Zap,
  Activity,
  Server,
  FolderArchive,
  Eye,
  Calendar,
  DollarSign
} from 'lucide-react';
import { LicenseKeyRecord } from '../types';
import { getClientSubmissions, subscribeToClientSubmissions, ClientSubmission } from '../clientSubmissionService';
import { getW2Records, get1099Records, subscribeToTaxDocuments } from '../taxDocumentService';
import { W2Record, Form1099Record } from '../taxDocumentTypes';

interface AdminHomeOverviewProps {
  licenseKeys: LicenseKeyRecord[];
  currentVersion: string;
  pendingSubmissionsCount: number;
  onNavigateTab: (tab: 'scanner' | 'intake' | 'licensing' | 'devices' | 'qbo' | 'tax_hub' | 'updater' | 'code' | 'guide') => void;
  onOpenBundleModal: () => void;
  onOpenAccountModal: () => void;
  onOpenUpdateModal: () => void;
  onOpenInquiriesModal: () => void;
  onOpenGitHubModal: () => void;
  onDownloadBundle: () => void;
  isPackagingZip: boolean;
  onToast: (msg: string) => void;
}

export function AdminHomeOverview({
  licenseKeys,
  currentVersion,
  pendingSubmissionsCount,
  onNavigateTab,
  onOpenBundleModal,
  onOpenAccountModal,
  onOpenUpdateModal,
  onOpenInquiriesModal,
  onOpenGitHubModal,
  onDownloadBundle,
  isPackagingZip,
  onToast
}: AdminHomeOverviewProps) {
  const [submissions, setSubmissions] = useState<ClientSubmission[]>(() => {
    try {
      return getClientSubmissions();
    } catch {
      return [];
    }
  });

  const [w2s, setW2s] = useState<W2Record[]>(() => {
    try {
      return getW2Records();
    } catch {
      return [];
    }
  });

  const [f1099s, setF1099s] = useState<Form1099Record[]>(() => {
    try {
      return get1099Records();
    } catch {
      return [];
    }
  });

  const [qboConnectedCompany, setQboConnectedCompany] = useState<string | null>(null);
  const [qboSyncLogsCount, setQboSyncLogsCount] = useState<number>(0);

  // Subscribe to live client submissions
  useEffect(() => {
    const unsub = subscribeToClientSubmissions((newSubs) => {
      setSubmissions(newSubs || []);
    });
    return () => unsub();
  }, []);

  // Subscribe to tax document changes
  useEffect(() => {
    const unsub = subscribeToTaxDocuments(() => {
      setW2s(getW2Records());
      setF1099s(get1099Records());
    });
    return () => unsub();
  }, []);

  // Check QuickBooks config / company status
  useEffect(() => {
    async function checkQboStatus() {
      try {
        const res = await fetch('/api/qbo/companies');
        if (res.ok) {
          const data = await res.json();
          if (data.companies && data.companies.length > 0) {
            setQboConnectedCompany(data.companies[0].companyName || 'Connected Company');
          }
        }
      } catch {
        // quiet fallback
      }

      try {
        const resLog = await fetch('/api/qbo/sync-log');
        if (resLog.ok) {
          const logData = await resLog.json();
          if (logData.logs) {
            setQboSyncLogsCount(logData.logs.length);
          }
        }
      } catch {
        // quiet fallback
      }
    }
    checkQboStatus();
  }, []);

  // Computed metrics
  const activeKeysCount = licenseKeys.filter(k => k.status === 'ACTIVE').length;
  const adminKeysCount = licenseKeys.filter(k => k.plan === 'ADMIN').length;
  const inUseKeysCount = licenseKeys.filter(k => k.inUse).length;

  const totalWages = w2s.reduce((sum, w) => sum + (parseFloat(String(w.box1Wages || '0')) || 0), 0);
  const totalFederalWithheld = w2s.reduce((sum, w) => sum + (parseFloat(String(w.box2FederalTaxWithheld || '0')) || 0), 0);
  const totalStateWithheld = w2s.reduce((sum, w) => sum + (parseFloat(String(w.box17StateTaxWithheld || '0')) || 0), 0);
  const total1099Income = f1099s.reduce((sum, f) => sum + (parseFloat(String(f.box1NonemployeeCompensation || '0')) || 0), 0);

  const statesDetected = Array.from(new Set([
    ...w2s.map(w => w.box15State).filter(Boolean),
    ...f1099s.map(f => f.box6State).filter(Boolean)
  ]));

  const recentSubmissions = submissions.slice(0, 5);

  const copyIntuitUri = () => {
    try {
      const cleanPath = typeof window !== 'undefined'
        ? window.location.pathname.replace(/\/admin.*$/, '').replace(/\/$/, '')
        : '';
      const uri = `${typeof window !== 'undefined' ? window.location.origin : ''}${cleanPath}/api/qbo/callback`;
      navigator.clipboard.writeText(uri);
      onToast('Copied Intuit Redirect URI to clipboard!');
    } catch {
      onToast('Redirect URI: /api/qbo/callback');
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Hero Welcome & Executive Pulse */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-stone-900 via-stone-900 to-amber-950/30 border border-stone-800 p-6 md:p-8 shadow-xl">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2.5 text-xs">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-semibold font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                All Systems Operational
              </span>
              <span className="text-stone-400">·</span>
              <span className="text-stone-300 font-mono">v{currentVersion}</span>
              <span className="text-stone-400">·</span>
              <span className="text-amber-400 font-medium flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                AES-256 Vault Active
              </span>
            </div>

            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white">
              Admin Operations Center &amp; System Overview
            </h2>

            <p className="text-sm text-stone-300 leading-relaxed">
              Consolidated command view for client receipt OCR pipelines, individual W-2 / 1099 tax hubs, 
              live connected client telemetry, QuickBooks Online OAuth synchronization, and perpetual license management.
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap lg:flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
            <button
              onClick={() => onNavigateTab('scanner')}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50 transition-all cursor-pointer"
            >
              <Cpu className="w-4 h-4" />
              <span>Launch Parallel Engine</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => onNavigateTab('intake')}
              className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-950/50 transition-all cursor-pointer"
            >
              <Inbox className="w-4 h-4" />
              <span>Review Intake ({pendingSubmissionsCount})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={onDownloadBundle}
              disabled={isPackagingZip}
              className="px-4 py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <FolderArchive className="w-4 h-4 text-amber-400" />
              <span>{isPackagingZip ? 'Packaging Zip...' : 'Download Desktop .bat'}</span>
            </button>
          </div>
        </div>

        {/* Ambient subtle glow background */}
        <div className="absolute -top-24 -right-24 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      </section>

      {/* Vital Metric Statistics Grid (6 Cards) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs uppercase tracking-wider font-bold text-stone-400 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-amber-400" />
            Key Platform Metrics &amp; Live Telemetry
          </h3>
          <span className="text-[11px] text-stone-500 font-mono">Live In-Memory &amp; Redundant KV</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Card 1: Client Submissions Queue */}
          <div 
            onClick={() => onNavigateTab('intake')}
            className="p-5 rounded-xl bg-stone-900/90 border border-stone-800 hover:border-amber-500/50 transition-all cursor-pointer shadow-md group relative overflow-hidden"
          >
            <div className="flex items-start justify-between">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <Inbox className="w-5 h-5" />
              </div>
              {pendingSubmissionsCount > 0 ? (
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
                  {pendingSubmissionsCount} Pending
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[11px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
                  Queue Clean
                </span>
              )}
            </div>

            <div className="mt-4">
              <div className="text-2xl font-bold font-mono text-stone-100 group-hover:text-amber-400 transition-colors">
                {submissions.length}
              </div>
              <div className="text-xs font-semibold text-stone-300 mt-0.5">Total Client Submissions</div>
              <p className="text-[11px] text-stone-400 mt-1">
                {pendingSubmissionsCount} files awaiting processing · AES-256 local encrypted storage
              </p>
            </div>

            <div className="mt-3 pt-3 border-t border-stone-800/80 flex items-center justify-between text-xs text-amber-400 font-medium">
              <span>Open Intake Manager</span>
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Card 2: Subscriptions & License Keys */}
          <div 
            onClick={() => onNavigateTab('licensing')}
            className="p-5 rounded-xl bg-stone-900/90 border border-stone-800 hover:border-sky-500/50 transition-all cursor-pointer shadow-md group relative overflow-hidden"
          >
            <div className="flex items-start justify-between">
              <div className="w-10 h-10 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                <Key className="w-5 h-5" />
              </div>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono text-sky-300 bg-sky-500/10 border border-sky-500/20">
                {activeKeysCount} Active / {licenseKeys.length} Total
              </span>
            </div>

            <div className="mt-4">
              <div className="text-2xl font-bold font-mono text-stone-100 group-hover:text-sky-400 transition-colors">
                {activeKeysCount}
              </div>
              <div className="text-xs font-semibold text-stone-300 mt-0.5">Active Subscribers &amp; Keys</div>
              <p className="text-[11px] text-stone-400 mt-1">
                {adminKeysCount} perpetual admin keys · {inUseKeysCount} currently tied to hardware HWID
              </p>
            </div>

            <div className="mt-3 pt-3 border-t border-stone-800/80 flex items-center justify-between text-xs text-sky-400 font-medium">
              <span>View Key Registry</span>
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Card 3: W-2 & 1099 Tax Documents */}
          <div 
            onClick={() => onNavigateTab('tax_hub')}
            className="p-5 rounded-xl bg-stone-900/90 border border-stone-800 hover:border-purple-500/50 transition-all cursor-pointer shadow-md group relative overflow-hidden"
          >
            <div className="flex items-start justify-between">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono text-purple-300 bg-purple-500/10 border border-purple-500/20">
                {statesDetected.length} States Tracked
              </span>
            </div>

            <div className="mt-4">
              <div className="text-2xl font-bold font-mono text-stone-100 group-hover:text-purple-400 transition-colors">
                {w2s.length + f1099s.length}
              </div>
              <div className="text-xs font-semibold text-stone-300 mt-0.5">W-2 &amp; 1099 Income Records</div>
              <p className="text-[11px] text-stone-400 mt-1">
                ${totalWages.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} wages · Form 1040 packet export ready
              </p>
            </div>

            <div className="mt-3 pt-3 border-t border-stone-800/80 flex items-center justify-between text-xs text-purple-400 font-medium">
              <span>Open Tax Documents Hub</span>
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Card 4: QuickBooks Online Production */}
          <div 
            onClick={() => onNavigateTab('qbo')}
            className="p-5 rounded-xl bg-stone-900/90 border border-stone-800 hover:border-emerald-500/50 transition-all cursor-pointer shadow-md group relative overflow-hidden"
          >
            <div className="flex items-start justify-between">
              <div className="w-10 h-10 rounded-lg bg-[#2CA01C]/15 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Building2 className="w-5 h-5 text-[#2CA01C]" />
              </div>
              <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold ${
                qboConnectedCompany ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-stone-800 text-stone-400 border border-stone-700'
              }`}>
                {qboConnectedCompany ? 'OAuth 2.0 Connected' : 'Ready to Connect'}
              </span>
            </div>

            <div className="mt-4">
              <div className="text-2xl font-bold font-mono text-stone-100 group-hover:text-emerald-400 transition-colors truncate">
                {qboConnectedCompany || 'QuickBooks OAuth'}
              </div>
              <div className="text-xs font-semibold text-stone-300 mt-0.5">Accounting Sync Engine</div>
              <p className="text-[11px] text-stone-400 mt-1">
                {qboSyncLogsCount} sync history events recorded · Direct JSON batch push enabled
              </p>
            </div>

            <div className="mt-3 pt-3 border-t border-stone-800/80 flex items-center justify-between text-xs text-emerald-400 font-medium">
              <span>Open QuickBooks Center</span>
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Card 5: Live Connected Devices & Active IPs */}
          <div 
            onClick={() => onNavigateTab('devices')}
            className="p-5 rounded-xl bg-stone-900/90 border border-stone-800 hover:border-emerald-500/50 transition-all cursor-pointer shadow-md group relative overflow-hidden"
          >
            <div className="flex items-start justify-between">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Radio className="w-5 h-5 animate-pulse" />
              </div>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono text-emerald-300 bg-emerald-500/10 border border-emerald-500/20">
                Live Heartbeat Stream
              </span>
            </div>

            <div className="mt-4">
              <div className="text-2xl font-bold font-mono text-stone-100 group-hover:text-emerald-400 transition-colors">
                Active Telemetry
              </div>
              <div className="text-xs font-semibold text-stone-300 mt-0.5">Real-Time IP &amp; Client Presence</div>
              <p className="text-[11px] text-stone-400 mt-1">
                Multi-device heartbeat monitoring, IP geolocation &amp; concurrent session tracking
              </p>
            </div>

            <div className="mt-3 pt-3 border-t border-stone-800/80 flex items-center justify-between text-xs text-emerald-400 font-medium">
              <span>View Connected Devices</span>
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Card 6: Desktop Runtime Package */}
          <div 
            onClick={onOpenBundleModal}
            className="p-5 rounded-xl bg-stone-900/90 border border-stone-800 hover:border-amber-500/50 transition-all cursor-pointer shadow-md group relative overflow-hidden"
          >
            <div className="flex items-start justify-between">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <FolderArchive className="w-5 h-5" />
              </div>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono text-amber-300 bg-amber-500/10 border border-amber-500/20">
                Batch .bat Included
              </span>
            </div>

            <div className="mt-4">
              <div className="text-2xl font-bold font-mono text-stone-100 group-hover:text-amber-400 transition-colors">
                v{currentVersion} Bundle
              </div>
              <div className="text-xs font-semibold text-stone-300 mt-0.5">Desktop Runtime Package</div>
              <p className="text-[11px] text-stone-400 mt-1">
                receipt_processor.py, run_receipt_processor.bat, and requirements.txt bundle
              </p>
            </div>

            <div className="mt-3 pt-3 border-t border-stone-800/80 flex items-center justify-between text-xs text-amber-400 font-medium">
              <span>Inspect Package Files</span>
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </div>
      </section>

      {/* Complete Section Directory (All Sections Neatly Formatted) */}
      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-bold text-stone-100 flex items-center gap-2">
            <Layers className="w-4 h-4 text-amber-400" />
            All Admin Management Sections Directory
          </h3>
          <p className="text-xs text-stone-400 mt-0.5">
            Every section of the admin panel accessible at a glance. Select any module to jump directly to its dedicated workstation.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Section 1: Scanner */}
          <div className="p-5 rounded-xl bg-stone-900 border border-stone-800 flex flex-col justify-between hover:border-stone-700 transition-all">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Cpu className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  Parallel OCR
                </span>
              </div>
              <h4 className="text-sm font-bold text-stone-100">Receipt Processing &amp; Parallel Engine</h4>
              <p className="text-xs text-stone-400 leading-relaxed">
                Multi-worker OCR engine with parallel thread pooling, automatic receipt deduction categorization, 
                tax schedule classification, and ledger exports.
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('scanner')}
              className="mt-4 pt-3 border-t border-stone-800/80 w-full flex items-center justify-between text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
            >
              <span>Open Parallel Engine</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Section 2: Intake */}
          <div className="p-5 rounded-xl bg-stone-900 border border-stone-800 flex flex-col justify-between hover:border-stone-700 transition-all">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <Inbox className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  {pendingSubmissionsCount} In Queue
                </span>
              </div>
              <h4 className="text-sm font-bold text-stone-100">Client Intake &amp; Multi-VM Cluster</h4>
              <p className="text-xs text-stone-400 leading-relaxed">
                Central ingest inbox for incoming receipts, tax documents, and invoices from clients. Dispatches 
                batches to worker clusters with full verification status.
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('intake')}
              className="mt-4 pt-3 border-t border-stone-800/80 w-full flex items-center justify-between text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
            >
              <span>Open Client Intake</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Section 3: W-2 & 1099 Tax Hub */}
          <div className="p-5 rounded-xl bg-stone-900 border border-stone-800 flex flex-col justify-between hover:border-stone-700 transition-all">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20">
                  Form 1040 Packet
                </span>
              </div>
              <h4 className="text-sm font-bold text-stone-100">W-2 &amp; 1099 Tax Hub</h4>
              <p className="text-xs text-stone-400 leading-relaxed">
                Dedicated non-business and wage-earner filing hub. Auto-detects state and local income tax withholdings 
                (Boxes 15–20), masks PII/SSN, and generates CPA packets.
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('tax_hub')}
              className="mt-4 pt-3 border-t border-stone-800/80 w-full flex items-center justify-between text-xs font-semibold text-purple-400 hover:text-purple-300 transition-colors cursor-pointer"
            >
              <span>Open Tax Documents Hub</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Section 4: QuickBooks Online */}
          <div className="p-5 rounded-xl bg-stone-900 border border-stone-800 flex flex-col justify-between hover:border-stone-700 transition-all">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-[#2CA01C]/15 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Building2 className="w-4 h-4 text-[#2CA01C]" />
                </div>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  Intuit OAuth 2.0
                </span>
              </div>
              <h4 className="text-sm font-bold text-stone-100">QuickBooks Online Production</h4>
              <p className="text-xs text-stone-400 leading-relaxed">
                Official Intuit Developer OAuth 2.0 connection, realm ID company linking, automated expense journal 
                pushes, and 101-day token rolling renewals.
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('qbo')}
              className="mt-4 pt-3 border-t border-stone-800/80 w-full flex items-center justify-between text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
            >
              <span>Open QuickBooks Center</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Section 5: Subscription Licensing */}
          <div className="p-5 rounded-xl bg-stone-900 border border-stone-800 flex flex-col justify-between hover:border-stone-700 transition-all">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                  <Key className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20">
                  Cloudflare KV
                </span>
              </div>
              <h4 className="text-sm font-bold text-stone-100">Subscription &amp; Key Registry</h4>
              <p className="text-xs text-stone-400 leading-relaxed">
                Generate monthly/annual subscriber licenses, create perpetual non-expiring master admin keys, 
                enforce hardware HWID locks, and sync to Edge KV.
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('licensing')}
              className="mt-4 pt-3 border-t border-stone-800/80 w-full flex items-center justify-between text-xs font-semibold text-sky-400 hover:text-sky-300 transition-colors cursor-pointer"
            >
              <span>Manage Key Registry</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Section 6: Connected Devices */}
          <div className="p-5 rounded-xl bg-stone-900 border border-stone-800 flex flex-col justify-between hover:border-stone-700 transition-all">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Radio className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  Live IPs
                </span>
              </div>
              <h4 className="text-sm font-bold text-stone-100">Live Connected Devices &amp; Active IPs</h4>
              <p className="text-xs text-stone-400 leading-relaxed">
                Real-time active IP presence tracker, concurrent client connections monitor, ping heartbeats, 
                and network security logs.
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('devices')}
              className="mt-4 pt-3 border-t border-stone-800/80 w-full flex items-center justify-between text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
            >
              <span>View Connected Devices</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Section 7: Auto-Update System */}
          <div className="p-5 rounded-xl bg-stone-900 border border-stone-800 flex flex-col justify-between hover:border-stone-700 transition-all">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                  <RefreshCw className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20">
                  In-Place Update
                </span>
              </div>
              <h4 className="text-sm font-bold text-stone-100">Auto-Update System &amp; Versioning</h4>
              <p className="text-xs text-stone-400 leading-relaxed">
                In-place application updater, release manifest checks, SHA-256 binary validation, and changelog 
                distribution without requiring manual reinstallations.
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('updater')}
              className="mt-4 pt-3 border-t border-stone-800/80 w-full flex items-center justify-between text-xs font-semibold text-sky-400 hover:text-sky-300 transition-colors cursor-pointer"
            >
              <span>Open Update Center</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Section 8: Architecture Guide */}
          <div className="p-5 rounded-xl bg-stone-900 border border-stone-800 flex flex-col justify-between hover:border-stone-700 transition-all">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Layers className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  Architecture
                </span>
              </div>
              <h4 className="text-sm font-bold text-stone-100">Subscription Architecture Guide</h4>
              <p className="text-xs text-stone-400 leading-relaxed">
                Technical reference and security architecture guide explaining the subscription gating engine, 
                offline grace period caching, and hardware signature computation.
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('guide')}
              className="mt-4 pt-3 border-t border-stone-800/80 w-full flex items-center justify-between text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
            >
              <span>Read Architecture Guide</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Section 9: Integrated Python Code */}
          <div className="p-5 rounded-xl bg-stone-900 border border-stone-800 flex flex-col justify-between hover:border-stone-700 transition-all">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                  <FileCode2 className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20">
                  .py Source &amp; .bat
                </span>
              </div>
              <h4 className="text-sm font-bold text-stone-100">Integrated Python Code &amp; Runtime</h4>
              <p className="text-xs text-stone-400 leading-relaxed">
                Inspect and download the desktop application's Python source code (`receipt_processor.py`), 
                requirements list, and Windows one-click automated batch launcher.
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('code')}
              className="mt-4 pt-3 border-t border-stone-800/80 w-full flex items-center justify-between text-xs font-semibold text-purple-400 hover:text-purple-300 transition-colors cursor-pointer"
            >
              <span>View Python Source</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </section>

      {/* Quick Summary Tables (Recent Submissions & Key Stats) */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Client Submissions Inflow */}
        <div className="p-6 rounded-2xl bg-stone-900 border border-stone-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Inbox className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-bold text-stone-100">Recent Client Inflow Queue</h3>
            </div>
            <button
              onClick={() => onNavigateTab('intake')}
              className="text-xs font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
            >
              <span>View All ({submissions.length})</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {recentSubmissions.length === 0 ? (
            <div className="p-6 text-center rounded-xl bg-stone-950/60 border border-stone-850 text-xs text-stone-400">
              No pending client submissions. The intake inbox is completely up-to-date.
            </div>
          ) : (
            <div className="space-y-2">
              {recentSubmissions.map((sub) => (
                <div
                  key={sub.id}
                  onClick={() => onNavigateTab('intake')}
                  className="p-3 rounded-lg bg-stone-950/60 border border-stone-800/80 hover:border-amber-500/40 flex items-center justify-between gap-3 text-xs transition-colors cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-stone-200 truncate">{sub.fileName}</div>
                    <div className="text-[11px] text-stone-400 truncate">
                      {sub.clientName || 'Client'} · {sub.category || 'Receipt'} · {new Date(sub.submittedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold shrink-0 ${
                    sub.status === 'PROCESSED'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                  }`}>
                    {sub.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Security, Encryption & Integrity Verification */}
        <div className="p-6 rounded-2xl bg-stone-900 border border-stone-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-stone-100">Security &amp; Data Safeguards</h3>
            </div>
            <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              Protected
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-lg bg-stone-950/60 border border-stone-800/80 flex items-start gap-3">
              <div className="w-6 h-6 rounded bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                <Check className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="font-semibold text-stone-200">Sensitive Information Masking &amp; Redaction</div>
                <p className="text-[11px] text-stone-400 mt-0.5">
                  All Social Security Numbers (`***-**-XXXX`) and Employer IDs (`**-***XXXX`) are masked before 
                  render or display to protect client privacy.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-stone-950/60 border border-stone-800/80 flex items-start gap-3">
              <div className="w-6 h-6 rounded bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                <Check className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="font-semibold text-stone-200">AES-256 Hardware-Locked Vault Protection</div>
                <p className="text-[11px] text-stone-400 mt-0.5">
                  Client licenses and encrypted snapshots are bound to machine hardware IDs (HWID) to prevent 
                  unauthorized license sharing.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-stone-950/60 border border-stone-800/80 flex items-start gap-3">
              <div className="w-6 h-6 rounded bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                <Check className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="font-semibold text-stone-200">Redundant Multi-Cloud Edge Synchronization</div>
                <p className="text-[11px] text-stone-400 mt-0.5">
                  Real-time failover sync between Cloudflare Edge KV and local database prevents data loss during network interruptions.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Intuit OAuth Helper Footer */}
      <section className="p-5 rounded-xl bg-stone-900/60 border border-stone-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#2CA01C]/15 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
            <Building2 className="w-4.5 h-4.5 text-[#2CA01C]" />
          </div>
          <div>
            <div className="text-xs font-bold text-stone-200">Intuit Developer Redirect URI Configuration</div>
            <div className="text-[11px] text-stone-400 mt-0.5">
              Requires exact URI in your Intuit app keys dashboard for production OAuth 2.0 authorization.
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={copyIntuitUri}
            className="px-3.5 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-sky-300 border border-stone-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copy Redirect URI</span>
          </button>
          <button
            onClick={() => onNavigateTab('qbo')}
            className="px-3.5 py-1.5 rounded-lg bg-[#2CA01C] hover:bg-[#238016] text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <span>QBO Center &rarr;</span>
          </button>
        </div>
      </section>
    </div>
  );
}
