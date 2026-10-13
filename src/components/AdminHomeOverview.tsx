import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  Users, 
  Zap, 
  Activity, 
  Server, 
  FolderArchive, 
  Eye, 
  Calendar, 
  DollarSign,
  Search,
  Wifi,
  Clock,
  Filter,
  AlertCircle,
  Shield,
  Globe,
  Terminal,
  Sparkles,
  ArrowUpRight,
  Sliders,
  X
} from 'lucide-react';
import { LicenseKeyRecord } from '../types';
import { getClientSubmissions, subscribeToClientSubmissions, ClientSubmission } from '../clientSubmissionService';
import { getW2Records, get1099Records, subscribeToTaxDocuments } from '../taxDocumentService';
import { W2Record, Form1099Record } from '../taxDocumentTypes';
import { getBackendApiUrl } from '../urlUtils';
import { fetchUnifiedIpTelemetry, TrackedIpSession, detectMyIp, IpOnlineState } from '../ipTrackerService';
import {
  QboAccountItem,
  getAllStandardQboAccounts,
  searchQboAccounts,
  QBO_CHART_CATEGORIES
} from '../quickbooksChartOfAccounts';

interface QboSyncLogItem {
  id?: string;
  timestamp: string;
  action: string;
  companyName?: string;
  realmId?: string;
  status: 'SUCCESS' | 'ERROR' | 'PENDING' | string;
  message?: string;
  receiptsCount?: number;
  total?: number;
  vendor?: string;
  accountName?: string;
  schedule?: string;
  irsLine?: string;
  docNumber?: string;
  details?: string;
}

export interface QboCompanyRecord {
  realmId: string;
  companyName: string;
  legalName?: string;
  email?: string;
  country?: string;
  connectedAt?: string;
  lastRefreshedAt?: string;
  environment: 'production' | 'sandbox';
  status: string;
  accessValidRemainingSec?: number;
  rollingDaysRemaining?: number;
  isActiveWorking?: boolean;
  syncedAccounts?: string[];
  selectedWorkingAccount?: string;
  targetChartOfAccounts?: string;
  chartOfAccountsCategory?: string;
}

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
  // Live Data States
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

  // Real-time Sessions & QuickBooks telemetry from backend
  const [deviceSessions, setDeviceSessions] = useState<TrackedIpSession[]>([]);
  const [onlineDevicesCount, setOnlineDevicesCount] = useState<number>(0);
  const [idleDevicesCount, setIdleDevicesCount] = useState<number>(0);
  const [offlineDevicesCount, setOfflineDevicesCount] = useState<number>(0);
  const [uniqueIpsCount, setUniqueIpsCount] = useState<number>(0);
  const [ipStatusFilter, setIpStatusFilter] = useState<'ALL' | 'ONLINE' | 'IDLE' | 'OFFLINE'>('ALL');
  const [myDetectedIp, setMyDetectedIp] = useState<string | null>(null);
  const [copiedIp, setCopiedIp] = useState<string | null>(null);

  const [qboCompanies, setQboCompanies] = useState<QboCompanyRecord[]>([]);
  const [selectedQboRealmId, setSelectedQboRealmId] = useState<string>('');
  const [qboConnectedCompany, setQboConnectedCompany] = useState<string | null>(null);
  const [qboRealmId, setQboRealmId] = useState<string | null>(null);
  const [qboEnvironment, setQboEnvironment] = useState<string>('sandbox');
  const [qboSyncLogs, setQboSyncLogs] = useState<QboSyncLogItem[]>([]);
  const [qboActiveAccount, setQboActiveAccount] = useState<string>('Operating Checking (Acct ****4120)');
  const [qboActiveChart, setQboActiveChart] = useState<string>('Schedule F Agricultural Standard (28 Accounts)');
  
  // Real-time synchronization states
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());
  const [activeWorkstationTab, setActiveWorkstationTab] = useState<'intake' | 'devices' | 'qbo' | 'taxes' | 'licenses'>('intake');
  const [searchQuery, setSearchQuery] = useState('');
  const [intakeFilter, setIntakeFilter] = useState<'ALL' | 'QUEUED' | 'PROCESSED'>('ALL');

  const [showAddAccountForRealm, setShowAddAccountForRealm] = useState<string | null>(null);
  const [newAccountInput, setNewAccountInput] = useState<string>('');

  // Chart of accounts search & directory states
  const [qboChartSearchQuery, setQboChartSearchQuery] = useState('');
  const [qboChartCategoryFilter, setQboChartCategoryFilter] = useState('ALL');
  const [qboAllAccounts, setQboAllAccounts] = useState<QboAccountItem[]>(() => {
    try {
      const raw = localStorage.getItem('receipt_processor_qbo_all_accounts_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return getAllStandardQboAccounts(parsed);
      }
    } catch {}
    return getAllStandardQboAccounts();
  });
  const STANDARD_SYNC_PRESETS = [
    'Operating Checking (Acct ****4120)',
    'Farm Operating & Expense Ledger',
    'Commercial Fleet & Fuel Account (Acct ****6021)',
    'Agricultural Payroll Reserve',
    'Commercial Equipment Financing (Acct ****8812)',
    'Grain & Crop Sales Settlement Acct',
    'Livestock & Cattle Trading Ledger',
    'General Business Operating Acct (Acct ****1092)'
  ];

  // Handle switching active working QuickBooks company and account
  const handleSwitchWorkingQboCompany = async (realmId: string, customAccount?: string) => {
    const target = qboCompanies.find(c => c.realmId === realmId);
    if (!target) return;

    const acc = customAccount || target.selectedWorkingAccount || (target.syncedAccounts && target.syncedAccounts[0]) || 'Operating Checking (Acct ****4120)';
    setSelectedQboRealmId(realmId);
    setQboConnectedCompany(target.companyName);
    setQboRealmId(realmId);
    setQboEnvironment(target.environment || 'sandbox');
    setQboActiveAccount(acc);
    setQboActiveChart(target.targetChartOfAccounts || 'Schedule F Agricultural Standard (28 Accounts)');

    const updated = qboCompanies.map(c => ({
      ...c,
      isActiveWorking: c.realmId === realmId,
      selectedWorkingAccount: c.realmId === realmId ? acc : c.selectedWorkingAccount
    }));
    setQboCompanies(updated);

    try {
      localStorage.setItem('receipt_processor_qbo_companies_v1', JSON.stringify(updated));
      localStorage.setItem('receipt_processor_qbo_active_realm_v1', realmId);
      localStorage.setItem('receipt_processor_qbo_active_account_v1', acc);
    } catch {}

    try {
      await fetch(`${getBackendApiUrl()}/api/qbo/company/active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ realmId, selectedWorkingAccount: acc })
      });
    } catch {}

    onToast(`Active QuickBooks Account set to: ${target.companyName} (${acc})`);
  };

  // Toggle or remove synced account from pipeline
  const handleToggleSyncedAccount = async (realmId: string, accountName: string) => {
    const comp = qboCompanies.find(c => c.realmId === realmId);
    if (!comp) return;

    const currentAccounts = comp.syncedAccounts || ['Operating Checking (Acct ****4120)', 'Farm Operating & Expense Ledger'];
    if (currentAccounts.length <= 1 && currentAccounts.includes(accountName)) {
      onToast('At least one account must remain synced in pipeline.');
      return;
    }

    let nextAccounts: string[];
    if (currentAccounts.includes(accountName)) {
      nextAccounts = currentAccounts.filter(a => a !== accountName);
      onToast(`Removed "${accountName}" from synced pipeline.`);
    } else {
      nextAccounts = [...currentAccounts, accountName];
      onToast(`Added "${accountName}" to synced pipeline.`);
    }

    const updated = qboCompanies.map(c => c.realmId === realmId ? { ...c, syncedAccounts: nextAccounts } : c);
    setQboCompanies(updated);

    try {
      localStorage.setItem('receipt_processor_qbo_companies_v1', JSON.stringify(updated));
    } catch {}

    try {
      await fetch(`${getBackendApiUrl()}/api/qbo/company/update-synced-accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ realmId, syncedAccounts: nextAccounts })
      });
    } catch {}
  };

  // Add account to synced list
  const handleAddSyncedAccount = async (realmId: string, accountName: string) => {
    if (!accountName.trim()) return;
    const comp = qboCompanies.find(c => c.realmId === realmId);
    if (!comp) return;

    const currentAccounts = comp.syncedAccounts || [];
    if (currentAccounts.includes(accountName.trim())) {
      onToast('Account is already synced.');
      return;
    }

    const nextAccounts = [...currentAccounts, accountName.trim()];
    const updated = qboCompanies.map(c => c.realmId === realmId ? { ...c, syncedAccounts: nextAccounts } : c);
    setQboCompanies(updated);

    try {
      localStorage.setItem('receipt_processor_qbo_companies_v1', JSON.stringify(updated));
    } catch {}

    try {
      await fetch(`${getBackendApiUrl()}/api/qbo/company/update-synced-accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ realmId, syncedAccounts: nextAccounts })
      });
    } catch {}

    setNewAccountInput('');
    setShowAddAccountForRealm(null);
    onToast(`Added "${accountName.trim()}" to synced accounts.`);
  };

  // Select target Chart of Accounts
  const handleSelectTargetChartOfAccounts = async (realmId: string, chartName: string, category: 'FARM' | 'COMMERCIAL') => {
    const comp = qboCompanies.find(c => c.realmId === realmId);
    if (!comp) return;

    setQboActiveChart(chartName);
    const updated = qboCompanies.map(c => 
      c.realmId === realmId ? { ...c, targetChartOfAccounts: chartName, chartOfAccountsCategory: category } : c
    );
    setQboCompanies(updated);

    try {
      localStorage.setItem('receipt_processor_qbo_companies_v1', JSON.stringify(updated));
    } catch {}

    try {
      await fetch(`${getBackendApiUrl()}/api/qbo/company/update-synced-accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ realmId, targetChartOfAccounts: chartName, chartOfAccountsCategory: category })
      });
    } catch {}

    onToast(`Target Chart of Accounts set to: ${chartName}`);
  };

  // Fetch live telemetry from server
  const fetchLiveTelemetry = useCallback(async () => {
    const backendBase = getBackendApiUrl();

    try {
      // 1. Fetch live active sessions & IP telemetry (unified, deduplicated strictly 1 entry per unique IP)
      const ipData = await fetchUnifiedIpTelemetry();
      setDeviceSessions(ipData.sessions);
      setOnlineDevicesCount(ipData.onlineCount);
      setIdleDevicesCount(ipData.idleCount);
      setOfflineDevicesCount(ipData.offlineCount);
      setUniqueIpsCount(ipData.uniqueIps);
      if (ipData.myIp) setMyDetectedIp(ipData.myIp);
    } catch {}

    try {
      // 2. Fetch QuickBooks companies & config
      let loadedComps: QboCompanyRecord[] = [];
      const resCompanies = await fetch(`${backendBase}/api/qbo/companies`);
      if (resCompanies.ok) {
        const compData = await resCompanies.json();
        if (compData.companies && compData.companies.length > 0) {
          loadedComps = compData.companies;
        }
      }

      if (loadedComps.length === 0) {
        try {
          const raw = localStorage.getItem('receipt_processor_qbo_companies_v1');
          if (raw) loadedComps = JSON.parse(raw);
        } catch {}
      }

      if (loadedComps.length > 0) {
        setQboCompanies(loadedComps);
        const storedActiveRealm = localStorage.getItem('receipt_processor_qbo_active_realm_v1');
        const active = (storedActiveRealm ? loadedComps.find(c => c.realmId === storedActiveRealm) : null)
          || loadedComps.find(c => c.isActiveWorking)
          || loadedComps[0];
        
        setSelectedQboRealmId(active.realmId);
        setQboConnectedCompany(active.companyName);
        setQboRealmId(active.realmId);
        setQboEnvironment(active.environment || 'sandbox');

        const storedActiveAccount = localStorage.getItem('receipt_processor_qbo_active_account_v1');
        const currentAcc = (storedActiveAccount && active.syncedAccounts?.includes(storedActiveAccount))
          ? storedActiveAccount
          : (active.selectedWorkingAccount || (active.syncedAccounts && active.syncedAccounts[0]) || 'Operating Checking (Acct ****4120)');
        
        setQboActiveAccount(currentAcc);
        setQboActiveChart(active.targetChartOfAccounts || 'Schedule F Agricultural Standard (28 Accounts)');
      }
    } catch {}

    try {
      // 2b. Fetch QuickBooks Chart of Accounts
      const resAccounts = await fetch(`${backendBase}/api/qbo/accounts`);
      if (resAccounts.ok) {
        const accData = await resAccounts.json();
        const incoming = Array.isArray(accData.allAccounts) ? accData.allAccounts : [];
        const merged = getAllStandardQboAccounts([
          ...incoming,
          ...(Array.isArray(accData.liveAccounts) ? accData.liveAccounts : [])
        ]);
        setQboAllAccounts(merged);
        try {
          localStorage.setItem('receipt_processor_qbo_all_accounts_v1', JSON.stringify(merged));
        } catch {}
      }
    } catch {}

    try {
      // 3. Fetch QuickBooks sync logs
      let loadedLogs: QboSyncLogItem[] = [];
      const resLogs = await fetch(`${backendBase}/api/qbo/sync-log`);
      if (resLogs.ok) {
        const logData = await resLogs.json();
        if (logData.logs && Array.isArray(logData.logs)) {
          loadedLogs = logData.logs;
        }
      }

      if (loadedLogs.length === 0) {
        try {
          const raw = localStorage.getItem('receipt_processor_qbo_sync_logs_v1');
          if (raw) loadedLogs = JSON.parse(raw);
        } catch {}
      }

      if (loadedLogs.length > 0) {
        setQboSyncLogs(loadedLogs);
      }
    } catch {}

    try {
      // 4. Fetch server submissions
      const resSubs = await fetch(`${backendBase}/api/client/submissions`);
      if (resSubs.ok) {
        const subData = await resSubs.json();
        if (subData.submissions && Array.isArray(subData.submissions) && subData.submissions.length > 0) {
          setSubmissions(subData.submissions);
        }
      }
    } catch {}

    try {
      // 5. Fetch server tax docs
      const resTax = await fetch(`${backendBase}/api/tax-docs`);
      if (resTax.ok) {
        const taxData = await resTax.json();
        if (taxData.w2s && Array.isArray(taxData.w2s)) {
          setW2s(taxData.w2s);
        }
        if (taxData.form1099s && Array.isArray(taxData.form1099s)) {
          setF1099s(taxData.form1099s);
        }
      }
    } catch {}

    setLastRefreshedAt(new Date());
  }, []);

  // Poll live telemetry every 4 seconds for real-time fidelity
  useEffect(() => {
    fetchLiveTelemetry();
    const interval = setInterval(() => {
      fetchLiveTelemetry();
    }, 4000);
    return () => clearInterval(interval);
  }, [fetchLiveTelemetry]);

  // Subscribe to live client submissions events
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

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await fetchLiveTelemetry();
    setSubmissions(getClientSubmissions());
    setW2s(getW2Records());
    setF1099s(get1099Records());
    setTimeout(() => {
      setIsRefreshing(false);
      onToast('All real-time platform telemetry refreshed.');
    }, 500);
  };

  // Aggregated Metrics Calculations
  const activeKeysCount = licenseKeys.filter(k => k.status === 'ACTIVE').length;
  const adminKeysCount = licenseKeys.filter(k => k.plan === 'ADMIN').length;
  const inUseKeysCount = licenseKeys.filter(k => k.inUse).length;
  const expiredKeysCount = licenseKeys.filter(k => k.status === 'EXPIRED').length;

  const totalWages = w2s.reduce((sum, w) => sum + (parseFloat(String(w.box1Wages || '0')) || 0), 0);
  const totalFederalWithheld = w2s.reduce((sum, w) => sum + (parseFloat(String(w.box2FederalTaxWithheld || '0')) || 0), 0);
  const totalStateWithheld = w2s.reduce((sum, w) => sum + (parseFloat(String(w.box17StateTaxWithheld || '0')) || 0), 0);
  const total1099Income = f1099s.reduce((sum, f) => sum + (parseFloat(String(f.box1NonemployeeCompensation || '0')) || 0), 0);

  const statesDetected = Array.from(new Set([
    ...w2s.map(w => w.box15State).filter(Boolean),
    ...f1099s.map(f => f.box6State).filter(Boolean)
  ]));

  const queuedSubmissionsCount = submissions.filter(s => s.status === 'QUEUED').length;
  const processedSubmissionsCount = submissions.filter(s => s.status === 'PROCESSED' || s.status === 'SYNCED_QBO').length;

  // Filtered Items for Interactive Workstation
  const filteredSubmissions = useMemo(() => {
    let list = submissions;
    if (intakeFilter === 'QUEUED') {
      list = list.filter(s => s.status === 'QUEUED');
    } else if (intakeFilter === 'PROCESSED') {
      list = list.filter(s => s.status === 'PROCESSED' || s.status === 'SYNCED_QBO');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(s => 
        (s.fileName && s.fileName.toLowerCase().includes(q)) ||
        (s.clientName && s.clientName.toLowerCase().includes(q)) ||
        (s.categoryHint && s.categoryHint.toLowerCase().includes(q)) ||
        (s.extractedVendor && s.extractedVendor.toLowerCase().includes(q))
      );
    }
    return list;
  }, [submissions, intakeFilter, searchQuery]);

  const filteredSessions = useMemo(() => {
    let list = deviceSessions;
    if (ipStatusFilter !== 'ALL') {
      list = list.filter(s => s.onlineState === ipStatusFilter);
    }
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(s => 
      (s.ip && s.ip.toLowerCase().includes(q)) ||
      (s.machineName && s.machineName.toLowerCase().includes(q)) ||
      (s.portalName && s.portalName.toLowerCase().includes(q)) ||
      (s.browserInfo && s.browserInfo.toLowerCase().includes(q)) ||
      (s.hwid && s.hwid.toLowerCase().includes(q)) ||
      (s.username && s.username.toLowerCase().includes(q))
    );
  }, [deviceSessions, ipStatusFilter, searchQuery]);

  const filteredLicenses = useMemo(() => {
    if (!searchQuery.trim()) return licenseKeys;
    const q = searchQuery.toLowerCase();
    return licenseKeys.filter(k => 
      (k.key && k.key.toLowerCase().includes(q)) ||
      (k.clientName && k.clientName.toLowerCase().includes(q)) ||
      (k.clientEmail && k.clientEmail.toLowerCase().includes(q)) ||
      (k.plan && k.plan.toLowerCase().includes(q))
    );
  }, [licenseKeys, searchQuery]);

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
    <div className="space-y-7 pb-16">
      {/* Real-Time Live Status Bar */}
      <section className="bg-stone-900/90 border border-stone-800 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            <span className="font-bold text-stone-100 font-mono tracking-tight">
              LIVE PLATFORM TELEMETRY
            </span>
          </div>

          <span className="text-stone-600 hidden sm:inline">|</span>

          <div className="flex items-center gap-2 text-stone-400">
            <span className="text-emerald-400 font-medium">● 4 Worker Threads Ready</span>
            <span>·</span>
            <span className="text-sky-400 font-medium">Cloudflare KV Synced</span>
            <span>·</span>
            <span className="text-amber-400 font-medium">AES-256 GCM Vault</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-[11px] text-stone-400 font-mono flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-stone-500" />
            <span>Updated: {lastRefreshedAt.toLocaleTimeString()}</span>
          </div>

          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 transition-colors cursor-pointer text-[11px] font-semibold"
            title="Immediately poll and refresh all live data streams"
          >
            <RefreshCw className={`w-3 h-3 text-amber-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </section>

      {/* Hero Executive Command Header */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-stone-900 via-stone-900 to-amber-950/25 border border-stone-800 p-6 md:p-8 shadow-xl">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-emerald-400 font-semibold font-mono flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                All Systems Operational
              </span>
              <span className="text-stone-500">·</span>
              <span className="text-stone-300 font-mono">Platform Release v{currentVersion}</span>
              <span className="text-stone-500">·</span>
              <span className="text-amber-300 font-medium">
                Lead Administrator Session
              </span>
            </div>

            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white">
              Executive Command &amp; Operations Center
            </h2>

            <p className="text-xs md:text-sm text-stone-300 leading-relaxed">
              Real-time monitoring across client document intake, parallel receipt OCR extraction, 
              W-2 / 1099 wage and state tax intelligence, live connected IPs, and QuickBooks Online production sync.
            </p>
          </div>

          {/* Quick Launch Action Center */}
          <div className="flex flex-wrap lg:flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
            <button
              onClick={() => onNavigateTab('scanner')}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 transition-all cursor-pointer"
            >
              <Cpu className="w-4 h-4" />
              <span>Launch Parallel Engine</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => onNavigateTab('intake')}
              className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-950/40 transition-all cursor-pointer"
            >
              <Inbox className="w-4 h-4" />
              <span>Client Intake ({queuedSubmissionsCount} Pending)</span>
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

      {/* 1-Click Direct Access Switchboard (All 9 Management Consoles) */}
      <section className="bg-stone-900/70 border border-stone-800 rounded-2xl p-4 shadow-md space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wider font-bold text-stone-400 flex items-center gap-1.5 font-mono">
            <Layers className="w-3.5 h-3.5 text-amber-400" />
            Direct Access Switchboard (Instant Section Navigation)
          </span>
          <span className="text-[11px] text-stone-500 hidden sm:inline">1-Click Jump to Any Console</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2">
          <button
            onClick={() => onNavigateTab('scanner')}
            className="p-2.5 rounded-xl bg-stone-950/80 hover:bg-stone-800 border border-stone-800/80 hover:border-emerald-500/50 flex flex-col items-center text-center transition-all cursor-pointer group"
          >
            <Cpu className="w-5 h-5 text-emerald-400 mb-1 group-hover:scale-110 transition-transform" />
            <span className="text-[11px] font-bold text-stone-200 group-hover:text-emerald-300">OCR Engine</span>
            <span className="text-[9px] text-stone-500 font-mono">Receipts</span>
          </button>

          <button
            onClick={() => onNavigateTab('intake')}
            className="p-2.5 rounded-xl bg-stone-950/80 hover:bg-stone-800 border border-stone-800/80 hover:border-amber-500/50 flex flex-col items-center text-center transition-all cursor-pointer group relative"
          >
            {queuedSubmissionsCount > 0 && (
              <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full bg-amber-500 text-stone-950 font-mono text-[9px] font-extrabold animate-pulse">
                {queuedSubmissionsCount}
              </span>
            )}
            <Inbox className="w-5 h-5 text-amber-400 mb-1 group-hover:scale-110 transition-transform" />
            <span className="text-[11px] font-bold text-stone-200 group-hover:text-amber-300">Client Intake</span>
            <span className="text-[9px] text-stone-500 font-mono">{submissions.length} Total</span>
          </button>

          <button
            onClick={() => onNavigateTab('tax_hub')}
            className="p-2.5 rounded-xl bg-stone-950/80 hover:bg-stone-800 border border-stone-800/80 hover:border-purple-500/50 flex flex-col items-center text-center transition-all cursor-pointer group"
          >
            <FileSpreadsheet className="w-5 h-5 text-purple-400 mb-1 group-hover:scale-110 transition-transform" />
            <span className="text-[11px] font-bold text-stone-200 group-hover:text-purple-300">Tax Hub</span>
            <span className="text-[9px] text-stone-500 font-mono">W-2 &amp; 1099</span>
          </button>

          <button
            onClick={() => onNavigateTab('qbo')}
            className="p-2.5 rounded-xl bg-stone-950/80 hover:bg-stone-800 border border-stone-800/80 hover:border-emerald-500/50 flex flex-col items-center text-center transition-all cursor-pointer group"
          >
            <Building2 className="w-5 h-5 text-[#2CA01C] mb-1 group-hover:scale-110 transition-transform" />
            <span className="text-[11px] font-bold text-stone-200 group-hover:text-emerald-300">QuickBooks</span>
            <span className="text-[9px] text-stone-500 font-mono">Intuit Sync</span>
          </button>

          <button
            onClick={() => onNavigateTab('devices')}
            className="p-2.5 rounded-xl bg-stone-950/80 hover:bg-stone-800 border border-stone-800/80 hover:border-emerald-500/50 flex flex-col items-center text-center transition-all cursor-pointer group relative"
          >
            {onlineDevicesCount > 0 && (
              <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full bg-emerald-500 text-stone-950 font-mono text-[9px] font-extrabold animate-pulse">
                {onlineDevicesCount}
              </span>
            )}
            <Radio className="w-5 h-5 text-emerald-400 mb-1 group-hover:scale-110 transition-transform" />
            <span className="text-[11px] font-bold text-stone-200 group-hover:text-emerald-300">IP Tracker</span>
            <span className="text-[9px] text-stone-500 font-mono">{uniqueIpsCount} IPs</span>
          </button>

          <button
            onClick={() => onNavigateTab('licensing')}
            className="p-2.5 rounded-xl bg-stone-950/80 hover:bg-stone-800 border border-stone-800/80 hover:border-sky-500/50 flex flex-col items-center text-center transition-all cursor-pointer group"
          >
            <Key className="w-5 h-5 text-sky-400 mb-1 group-hover:scale-110 transition-transform" />
            <span className="text-[11px] font-bold text-stone-200 group-hover:text-sky-300">Licensing</span>
            <span className="text-[9px] text-stone-500 font-mono">{activeKeysCount} Active</span>
          </button>

          <button
            onClick={() => onNavigateTab('updater')}
            className="p-2.5 rounded-xl bg-stone-950/80 hover:bg-stone-800 border border-stone-800/80 hover:border-sky-500/50 flex flex-col items-center text-center transition-all cursor-pointer group"
          >
            <RefreshCw className="w-5 h-5 text-sky-400 mb-1 group-hover:scale-110 transition-transform" />
            <span className="text-[11px] font-bold text-stone-200 group-hover:text-sky-300">Updater</span>
            <span className="text-[9px] text-stone-500 font-mono">v{currentVersion}</span>
          </button>

          <button
            onClick={() => onNavigateTab('guide')}
            className="p-2.5 rounded-xl bg-stone-950/80 hover:bg-stone-800 border border-stone-800/80 hover:border-emerald-500/50 flex flex-col items-center text-center transition-all cursor-pointer group"
          >
            <Layers className="w-5 h-5 text-emerald-400 mb-1 group-hover:scale-110 transition-transform" />
            <span className="text-[11px] font-bold text-stone-200 group-hover:text-emerald-300">Architecture</span>
            <span className="text-[9px] text-stone-500 font-mono">Tech Spec</span>
          </button>

          <button
            onClick={() => onNavigateTab('code')}
            className="p-2.5 rounded-xl bg-stone-950/80 hover:bg-stone-800 border border-stone-800/80 hover:border-purple-500/50 flex flex-col items-center text-center transition-all cursor-pointer group"
          >
            <FileCode2 className="w-5 h-5 text-purple-400 mb-1 group-hover:scale-110 transition-transform" />
            <span className="text-[11px] font-bold text-stone-200 group-hover:text-purple-300">Python Code</span>
            <span className="text-[9px] text-stone-500 font-mono">Source</span>
          </button>
        </div>
      </section>

      {/* Vital Metric Statistics Grid (6 High-Density KPI Cards) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs uppercase tracking-wider font-bold text-stone-400 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-amber-400" />
            Real-Time Platform Vital Statistics
          </h3>
          <span className="text-[11px] text-stone-500 font-mono">Continuous Multi-Source Feed</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Card 1: Client Submissions Queue */}
          <div 
            onClick={() => onNavigateTab('intake')}
            className="p-5 rounded-xl bg-stone-900 border border-stone-800 hover:border-amber-500/50 transition-all cursor-pointer shadow-md group relative overflow-hidden flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <Inbox className="w-5 h-5" />
                </div>
                {queuedSubmissionsCount > 0 ? (
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
                    {queuedSubmissionsCount} Pending Action
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
                    Queue Current
                  </span>
                )}
              </div>

              <div className="mt-4">
                <div className="text-3xl font-extrabold font-mono text-stone-100 group-hover:text-amber-400 transition-colors">
                  {submissions.length}
                </div>
                <div className="text-xs font-bold text-stone-200 mt-1">Client Ingest Submissions</div>
                <div className="flex items-center gap-2 text-[11px] text-stone-400 mt-1">
                  <span className="text-amber-400 font-semibold">{queuedSubmissionsCount} in queue</span>
                  <span>·</span>
                  <span className="text-emerald-400 font-semibold">{processedSubmissionsCount} processed</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-stone-800/80 flex items-center justify-between text-xs text-amber-400 font-semibold">
              <span>Inspect Intake Queue</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Card 2: Subscription & Key Registry */}
          <div 
            onClick={() => onNavigateTab('licensing')}
            className="p-5 rounded-xl bg-stone-900 border border-stone-800 hover:border-sky-500/50 transition-all cursor-pointer shadow-md group relative overflow-hidden flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                  <Key className="w-5 h-5" />
                </div>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono text-sky-300 bg-sky-500/10 border border-sky-500/20">
                  {activeKeysCount} Active / {licenseKeys.length} Total
                </span>
              </div>

              <div className="mt-4">
                <div className="text-3xl font-extrabold font-mono text-stone-100 group-hover:text-sky-400 transition-colors">
                  {activeKeysCount}
                </div>
                <div className="text-xs font-bold text-stone-200 mt-1">Active Subscribers &amp; Keys</div>
                <div className="flex items-center gap-2 text-[11px] text-stone-400 mt-1">
                  <span className="text-amber-400 font-semibold">{adminKeysCount} perpetual admin</span>
                  <span>·</span>
                  <span className="text-emerald-400 font-semibold">{inUseKeysCount} hardware bound</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-stone-800/80 flex items-center justify-between text-xs text-sky-400 font-semibold">
              <span>Manage Key Registry</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Card 3: W-2 & 1099 Individual Tax Vault */}
          <div 
            onClick={() => onNavigateTab('tax_hub')}
            className="p-5 rounded-xl bg-stone-900 border border-stone-800 hover:border-purple-500/50 transition-all cursor-pointer shadow-md group relative overflow-hidden flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono text-purple-300 bg-purple-500/10 border border-purple-500/20">
                  {statesDetected.length > 0 ? `${statesDetected.join(', ')}` : 'Form 1040 Vault'}
                </span>
              </div>

              <div className="mt-4">
                <div className="text-3xl font-extrabold font-mono text-stone-100 group-hover:text-purple-400 transition-colors">
                  {w2s.length + f1099s.length}
                </div>
                <div className="text-xs font-bold text-stone-200 mt-1">W-2 &amp; 1099 Tax Documents</div>
                <div className="flex items-center gap-2 text-[11px] text-stone-400 mt-1">
                  <span className="text-purple-300 font-semibold">
                    ${totalWages.toLocaleString('en-US', { maximumFractionDigits: 0 })} wages
                  </span>
                  <span>·</span>
                  <span className="text-emerald-400 font-semibold">
                    ${(totalFederalWithheld + totalStateWithheld).toLocaleString('en-US', { maximumFractionDigits: 0 })} withheld
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-stone-800/80 flex items-center justify-between text-xs text-purple-400 font-semibold">
              <span>Open Tax Documents Hub</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Card 4: QuickBooks Online Production Center */}
          <div 
            onClick={() => onNavigateTab('qbo')}
            className="p-5 rounded-xl bg-stone-900 border border-stone-800 hover:border-emerald-500/50 transition-all cursor-pointer shadow-md group relative overflow-hidden flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-lg bg-[#2CA01C]/15 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Building2 className="w-5 h-5 text-[#2CA01C]" />
                </div>
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold flex items-center gap-1 ${
                    qboConnectedCompany 
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                      : 'bg-stone-800 text-stone-400 border border-stone-700'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${qboConnectedCompany ? 'bg-emerald-400 animate-pulse' : 'bg-stone-500'}`} />
                    {qboConnectedCompany ? 'Connected OAuth 2.0' : 'OAuth Ready'}
                  </span>
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-stone-800 text-stone-400 uppercase">
                    {qboEnvironment}
                  </span>
                </div>
              </div>

              <div className="mt-4">
                <div className="text-xl font-bold font-mono text-stone-100 group-hover:text-emerald-400 transition-colors truncate">
                  {qboConnectedCompany || 'QuickBooks Online'}
                </div>
                
                {/* Active Working Account Display & Quick Selector */}
                <div className="mt-1 flex items-center gap-1.5 text-xs text-amber-300 font-semibold truncate">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  <span className="truncate">Active Account: {qboActiveAccount}</span>
                </div>

                {qboCompanies.length > 0 && (
                  <div className="mt-2" onClick={e => e.stopPropagation()}>
                    <select
                      value={`${selectedQboRealmId}::${qboActiveAccount}`}
                      onChange={e => {
                        const [realmId, acc] = e.target.value.split('::');
                        if (realmId) handleSwitchWorkingQboCompany(realmId, acc);
                      }}
                      className="w-full px-2 py-1.5 bg-stone-950 border border-stone-700 hover:border-emerald-500 rounded text-[11px] font-semibold text-emerald-300 focus:outline-none cursor-pointer"
                      title="Choose what QuickBooks account to work on"
                    >
                      {qboCompanies.map(c => (
                        <optgroup key={c.realmId} label={`${c.companyName} (${c.environment.toUpperCase()})`}>
                          {(c.syncedAccounts && c.syncedAccounts.length > 0
                            ? c.syncedAccounts
                            : ['Operating Checking (Acct ****4120)']
                          ).map(acc => (
                            <option key={`${c.realmId}::${acc}`} value={`${c.realmId}::${acc}`}>
                              {c.companyName} • {acc}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-stone-400">
                  <span className="text-emerald-400 font-semibold">{qboSyncLogs.length} sync logs</span>
                  <span>·</span>
                  <span className="text-stone-300 font-mono text-[10px]">
                    {qboRealmId ? `Realm ${qboRealmId}` : '101d renewal'}
                  </span>
                  <span>·</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-sky-950/80 border border-sky-800/60 text-sky-300 truncate max-w-[170px]" title={`Target Chart: ${qboActiveChart}`}>
                    {qboActiveChart.includes('Schedule F') ? '🌾 Schedule F Farm' : '🏢 Schedule C Commercial'}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-stone-800/80 flex items-center justify-between text-xs text-emerald-400 font-semibold">
              <span>Manage Accounts &amp; Sync</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Card 5: Real-Time Active IP Telemetry & Devices */}
          <div 
            onClick={() => onNavigateTab('devices')}
            className="p-5 rounded-xl bg-stone-900 border border-stone-800 hover:border-emerald-500/50 transition-all cursor-pointer shadow-md group relative overflow-hidden flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Radio className="w-5 h-5 animate-pulse" />
                </div>
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                    onlineDevicesCount > 0
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                      : 'bg-stone-800 text-stone-400 border border-stone-700'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${onlineDevicesCount > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-stone-500'}`} />
                    {onlineDevicesCount} Online
                  </span>
                  {idleDevicesCount > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      {idleDevicesCount} Idle
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-4">
                <div className="text-3xl font-extrabold font-mono text-stone-100 group-hover:text-emerald-400 transition-colors flex items-baseline gap-2">
                  <span>{uniqueIpsCount}</span>
                  <span className="text-xs font-normal text-stone-400 font-sans">Unique IP Network{uniqueIpsCount === 1 ? '' : 's'}</span>
                </div>
                <div className="text-xs font-bold text-stone-200 mt-1">Live IP Address Tracker</div>
                <div className="flex items-center gap-2 text-[11px] text-stone-400 mt-1">
                  <span className="text-emerald-400 font-semibold">{onlineDevicesCount} Online</span>
                  <span>·</span>
                  <span className="text-amber-400 font-semibold">{idleDevicesCount} Idle</span>
                  <span>·</span>
                  <span className="text-stone-400 font-medium">{offlineDevicesCount} Offline</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-stone-800/80 flex items-center justify-between text-xs text-emerald-400 font-semibold">
              <span>Open Full IP Monitor</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Card 6: Desktop Runtime & Batch Launcher Package */}
          <div 
            onClick={onOpenBundleModal}
            className="p-5 rounded-xl bg-stone-900 border border-stone-800 hover:border-amber-500/50 transition-all cursor-pointer shadow-md group relative overflow-hidden flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <FolderArchive className="w-5 h-5" />
                </div>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono text-amber-300 bg-amber-500/10 border border-amber-500/20">
                  v{currentVersion} Bundle
                </span>
              </div>

              <div className="mt-4">
                <div className="text-2xl font-bold font-mono text-stone-100 group-hover:text-amber-400 transition-colors">
                  Batch .bat Ready
                </div>
                <div className="text-xs font-bold text-stone-200 mt-1">Desktop Runtime Package</div>
                <div className="flex items-center gap-2 text-[11px] text-stone-400 mt-1">
                  <span className="text-amber-400 font-semibold">receipt_processor.py</span>
                  <span>·</span>
                  <span className="text-stone-300">Auto-update enabled</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-stone-800/80 flex items-center justify-between text-xs text-amber-400 font-semibold">
              <span>Inspect Package Bundle</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </div>
      </section>

      {/* Global Real-Time Workstation (Multi-Tab Interactive Live View) */}
      <section className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden shadow-lg space-y-0">
        {/* Workstation Header & Navigation Tabs */}
        <div className="p-5 border-b border-stone-800 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-stone-900/80">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-bold text-stone-100">
                Real-Time Operations Workstation &amp; Live Data Streams
              </h3>
            </div>
            <p className="text-xs text-stone-400 mt-0.5">
              Instantly monitor and interact with live records across all subsystems without switching pages.
            </p>
          </div>

          {/* Search Input for Unified Fast Access */}
          <div className="relative w-full md:w-72">
            <Search className="w-3.5 h-3.5 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search across all live data..."
              className="w-full bg-stone-950 border border-stone-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-stone-200 placeholder-stone-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300 text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Tab Selection Bar */}
        <div className="px-5 pt-3 border-b border-stone-800 bg-stone-950/40 flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveWorkstationTab('intake')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-t-lg transition-colors cursor-pointer flex items-center gap-2 border-b-2 whitespace-nowrap ${
              activeWorkstationTab === 'intake'
                ? 'border-amber-500 text-amber-300 bg-stone-900 font-bold'
                : 'border-transparent text-stone-400 hover:text-stone-200 hover:bg-stone-900/50'
            }`}
          >
            <Inbox className="w-3.5 h-3.5 text-amber-400" />
            <span>Client Inflow Queue</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300">
              {submissions.length}
            </span>
          </button>

          <button
            onClick={() => setActiveWorkstationTab('devices')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-t-lg transition-colors cursor-pointer flex items-center gap-2 border-b-2 whitespace-nowrap ${
              activeWorkstationTab === 'devices'
                ? 'border-emerald-500 text-emerald-300 bg-stone-900 font-bold'
                : 'border-transparent text-stone-400 hover:text-stone-200 hover:bg-stone-900/50'
            }`}
          >
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span>Live IP Telemetry &amp; Sessions</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300">
              {deviceSessions.length}
            </span>
          </button>

          <button
            onClick={() => setActiveWorkstationTab('qbo')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-t-lg transition-colors cursor-pointer flex items-center gap-2 border-b-2 whitespace-nowrap ${
              activeWorkstationTab === 'qbo'
                ? 'border-emerald-500 text-emerald-300 bg-stone-900 font-bold'
                : 'border-transparent text-stone-400 hover:text-stone-200 hover:bg-stone-900/50'
            }`}
          >
            <Building2 className="w-3.5 h-3.5 text-[#2CA01C]" />
            <span>QuickBooks Sync History</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300">
              {qboSyncLogs.length}
            </span>
          </button>

          <button
            onClick={() => setActiveWorkstationTab('taxes')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-t-lg transition-colors cursor-pointer flex items-center gap-2 border-b-2 whitespace-nowrap ${
              activeWorkstationTab === 'taxes'
                ? 'border-purple-500 text-purple-300 bg-stone-900 font-bold'
                : 'border-transparent text-stone-400 hover:text-stone-200 hover:bg-stone-900/50'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-purple-400" />
            <span>W-2 &amp; 1099 Tax Ledger</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300">
              {w2s.length + f1099s.length}
            </span>
          </button>

          <button
            onClick={() => setActiveWorkstationTab('licenses')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-t-lg transition-colors cursor-pointer flex items-center gap-2 border-b-2 whitespace-nowrap ${
              activeWorkstationTab === 'licenses'
                ? 'border-sky-500 text-sky-300 bg-stone-900 font-bold'
                : 'border-transparent text-stone-400 hover:text-stone-200 hover:bg-stone-900/50'
            }`}
          >
            <Key className="w-3.5 h-3.5 text-sky-400" />
            <span>License Registry</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300">
              {licenseKeys.length}
            </span>
          </button>
        </div>

        {/* Tab 1 Content: Client Inflow Queue */}
        {activeWorkstationTab === 'intake' && (
          <div className="p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-stone-400">Filter Inflow:</span>
                <button
                  onClick={() => setIntakeFilter('ALL')}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                    intakeFilter === 'ALL' ? 'bg-amber-500 text-stone-950 font-bold' : 'bg-stone-800 text-stone-300 hover:text-white'
                  }`}
                >
                  All ({submissions.length})
                </button>
                <button
                  onClick={() => setIntakeFilter('QUEUED')}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                    intakeFilter === 'QUEUED' ? 'bg-amber-500 text-stone-950 font-bold' : 'bg-stone-800 text-stone-300 hover:text-white'
                  }`}
                >
                  Queued ({queuedSubmissionsCount})
                </button>
                <button
                  onClick={() => setIntakeFilter('PROCESSED')}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                    intakeFilter === 'PROCESSED' ? 'bg-amber-500 text-stone-950 font-bold' : 'bg-stone-800 text-stone-300 hover:text-white'
                  }`}
                >
                  Processed ({processedSubmissionsCount})
                </button>
              </div>

              <button
                onClick={() => onNavigateTab('intake')}
                className="text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <span>Open Full Intake Console</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {filteredSubmissions.length === 0 ? (
              <div className="p-8 text-center rounded-xl bg-stone-950/60 border border-stone-800 text-xs text-stone-400 space-y-2">
                <div>No submissions matching the current filter.</div>
                <p className="text-[11px] text-stone-500">
                  Clients uploading receipts or tax documents via the Client Portal will appear here automatically in real time.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-stone-800 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-950/80 text-stone-400 text-[11px] uppercase tracking-wider font-mono border-b border-stone-800">
                    <tr>
                      <th className="px-4 py-3">File / Document</th>
                      <th className="px-4 py-3">Client Information</th>
                      <th className="px-4 py-3">Category Hint</th>
                      <th className="px-4 py-3">Extracted Vendor &amp; Amount</th>
                      <th className="px-4 py-3">Submission Timestamp</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-800 text-stone-200">
                    {filteredSubmissions.slice(0, 8).map((sub) => (
                      <tr key={sub.id} className="hover:bg-stone-850/50 transition-colors">
                        <td className="px-4 py-3 font-semibold text-stone-100 flex items-center gap-2">
                          <Inbox className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="truncate max-w-[200px]" title={sub.fileName}>
                            {sub.fileName}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-stone-300">
                          <div>{sub.clientName || 'Client'}</div>
                          <div className="text-[10px] text-stone-500">{sub.clientEmail || 'client@example.com'}</div>
                        </td>
                        <td className="px-4 py-3 text-stone-400">
                          {sub.categoryHint || 'Standard Receipt'}
                        </td>
                        <td className="px-4 py-3 font-mono">
                          {sub.extractedVendor ? (
                            <div>
                              <span className="text-stone-200 font-semibold">{sub.extractedVendor}</span>
                              {sub.extractedAmount !== undefined && (
                                <span className="text-emerald-400 ml-1.5 font-bold">
                                  ${sub.extractedAmount.toFixed(2)}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-stone-500 italic">Pending OCR extraction</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-stone-400 font-mono text-[11px]">
                          {new Date(sub.uploadedAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                            sub.status === 'PROCESSED' || sub.status === 'SYNCED_QBO'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-300 border border-amber-500/20 animate-pulse'
                          }`}>
                            {sub.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => onNavigateTab('intake')}
                            className="px-2.5 py-1 rounded bg-stone-800 hover:bg-stone-700 text-amber-400 hover:text-amber-300 font-semibold text-[11px] transition-colors cursor-pointer"
                          >
                            Review &rarr;
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 2 Content: Live Connected Devices & Active IPs */}
        {activeWorkstationTab === 'devices' && (
          <div className="p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-stone-300">
                <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
                <span className="font-semibold text-stone-100">
                  {uniqueIpsCount} Unique IP Networks Tracked
                </span>
                <span className="text-stone-500">·</span>
                <span className="text-emerald-400 font-semibold">{onlineDevicesCount} Online</span>
                <span className="text-stone-500">·</span>
                <span className="text-amber-400 font-semibold">{idleDevicesCount} Idle</span>
                <span className="text-stone-500">·</span>
                <span className="text-stone-400">{offlineDevicesCount} Offline</span>
              </div>

              {/* Status Filter Buttons */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => setIpStatusFilter('ALL')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    ipStatusFilter === 'ALL'
                      ? 'bg-stone-700 text-stone-100 font-bold'
                      : 'bg-stone-800/80 text-stone-400 hover:text-stone-200'
                  }`}
                >
                  All ({uniqueIpsCount})
                </button>
                <button
                  onClick={() => setIpStatusFilter('ONLINE')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                    ipStatusFilter === 'ONLINE'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold'
                      : 'bg-stone-800/80 text-stone-400 hover:text-emerald-300'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Online ({onlineDevicesCount})</span>
                </button>
                <button
                  onClick={() => setIpStatusFilter('IDLE')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                    ipStatusFilter === 'IDLE'
                      ? 'bg-amber-950 text-amber-300 border border-amber-800 font-bold'
                      : 'bg-stone-800/80 text-stone-400 hover:text-amber-300'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span>Idle ({idleDevicesCount})</span>
                </button>
                <button
                  onClick={() => setIpStatusFilter('OFFLINE')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                    ipStatusFilter === 'OFFLINE'
                      ? 'bg-stone-800 text-stone-200 border border-stone-700 font-bold'
                      : 'bg-stone-800/80 text-stone-400 hover:text-stone-200'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-stone-500" />
                  <span>Offline ({offlineDevicesCount})</span>
                </button>

                <button
                  onClick={() => onNavigateTab('devices')}
                  className="ml-2 text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <span>Open Full Device Monitor</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {filteredSessions.length === 0 ? (
              <div className="p-8 text-center rounded-xl bg-stone-950/60 border border-stone-800 text-xs text-stone-400">
                {deviceSessions.length === 0
                  ? 'No active IP networks detected yet. Telemetry registers automatically upon client activity.'
                  : `No IP addresses matching "${ipStatusFilter}" filter.`}
              </div>
            ) : (
              <div className="overflow-x-auto border border-stone-800 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-950/80 text-stone-400 text-[11px] uppercase tracking-wider font-mono border-b border-stone-800">
                    <tr>
                      <th className="px-4 py-3">IP Address</th>
                      <th className="px-4 py-3">Network Status</th>
                      <th className="px-4 py-3">Portal Session</th>
                      <th className="px-4 py-3">Machine / Browser Info</th>
                      <th className="px-4 py-3">Heartbeats</th>
                      <th className="px-4 py-3">Last Active</th>
                      <th className="px-4 py-3 text-right">Inspect</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-800 text-stone-200">
                    {filteredSessions.map((sess) => {
                      const isOnline = sess.onlineState === 'ONLINE';
                      const isIdle = sess.onlineState === 'IDLE';
                      const isMe = sess.isCurrentDevice || (myDetectedIp && sess.ip === myDetectedIp);
                      const timeAgoStr = sess.secondsSinceLastPing !== undefined
                        ? (sess.secondsSinceLastPing < 60
                            ? `${sess.secondsSinceLastPing}s ago`
                            : sess.secondsSinceLastPing < 3600
                            ? `${Math.floor(sess.secondsSinceLastPing / 60)}m ago`
                            : `${Math.floor(sess.secondsSinceLastPing / 3600)}h ago`)
                        : 'Just now';

                      return (
                        <tr key={sess.id} className="hover:bg-stone-850/50 transition-colors">
                          <td className="px-4 py-3 font-mono font-bold text-stone-100">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full shrink-0 ${
                                isOnline ? 'bg-emerald-400 animate-ping' : isIdle ? 'bg-amber-400' : 'bg-stone-600'
                              }`} />
                              <span>{sess.ip}</span>
                              {isMe && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  You
                                </span>
                              )}
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(sess.ip);
                                  setCopiedIp(sess.ip);
                                  onToast(`Copied IP: ${sess.ip}`);
                                  setTimeout(() => setCopiedIp(null), 2000);
                                }}
                                className="p-0.5 text-stone-500 hover:text-stone-300 transition-colors cursor-pointer"
                                title="Copy IP"
                              >
                                {copiedIp === sess.ip ? (
                                  <Check className="w-3 h-3 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                            <span className="text-[10px] text-stone-500 font-sans block mt-0.5">
                              {sess.ip === '127.0.0.1' ? 'Local loopback' : 'Public IP Network'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                              isOnline
                                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                                : isIdle
                                ? 'bg-amber-950/80 text-amber-300 border border-amber-800'
                                : 'bg-stone-800 text-stone-400 border border-stone-700'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                isOnline ? 'bg-emerald-400 animate-pulse' : isIdle ? 'bg-amber-400' : 'bg-stone-500'
                              }`} />
                              <span>{sess.onlineState}</span>
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-semibold text-stone-200">{sess.portalName || sess.sessionType}</span>
                            {sess.username && (
                              <div className="text-[10px] text-amber-400 font-mono">User: {sess.username}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-stone-300">
                            <div>{sess.machineName || sess.browserInfo || 'Browser Client'}</div>
                            <div className="text-[10px] text-stone-500 font-mono">{sess.deviceCategory}</div>
                          </td>
                          <td className="px-4 py-3 font-mono text-stone-400">
                            {sess.pingCount || 1} pings
                          </td>
                          <td className="px-4 py-3 text-stone-400 font-mono text-[11px]">
                            <div className={isOnline ? 'text-emerald-300 font-semibold' : isIdle ? 'text-amber-300' : 'text-stone-400'}>
                              {timeAgoStr}
                            </div>
                            <div className="text-[10px] text-stone-500">
                              {sess.lastPing ? new Date(sess.lastPing).toLocaleTimeString() : 'Just now'}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => onNavigateTab('devices')}
                              className="px-2.5 py-1 rounded bg-stone-800 hover:bg-stone-700 text-emerald-400 hover:text-emerald-300 font-semibold text-[11px] transition-colors cursor-pointer inline-flex items-center gap-1"
                            >
                              <span>Track</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 3 Content: QuickBooks Online Command Center & Sync Ledger */}
        {activeWorkstationTab === 'qbo' && (
          <div className="p-5 space-y-5">
            {/* Control Bar: Active Working Account Selection & Status */}
            <div className="p-4 rounded-xl bg-stone-950/80 border border-stone-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-[#2CA01C]" />
                  <span className="font-bold text-sm text-stone-100">
                    QuickBooks Account Selector &amp; Synchronization Hub
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    {qboEnvironment.toUpperCase()}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-stone-400">
                  <span>Choose what account to work on:</span>
                  <span className="text-emerald-400 font-semibold">{qboConnectedCompany}</span>
                  <span>·</span>
                  <span className="text-amber-300 font-mono">Active: {qboActiveAccount}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {/* Account Switcher Dropdown */}
                {qboCompanies.length > 0 && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-stone-400 font-medium">Select Working Account:</label>
                    <select
                      value={`${selectedQboRealmId}::${qboActiveAccount}`}
                      onChange={e => {
                        const [realmId, acc] = e.target.value.split('::');
                        if (realmId) handleSwitchWorkingQboCompany(realmId, acc);
                      }}
                      className="px-3 py-1.5 bg-stone-900 border border-stone-700 hover:border-emerald-500 rounded-lg text-xs font-semibold text-emerald-300 focus:outline-none cursor-pointer"
                    >
                      {qboCompanies.map(c => (
                        <optgroup key={c.realmId} label={`${c.companyName} (${c.environment.toUpperCase()})`}>
                          {(c.syncedAccounts && c.syncedAccounts.length > 0
                            ? c.syncedAccounts
                            : ['Operating Checking (Acct ****4120)']
                          ).map(acc => (
                            <option key={`${c.realmId}::${acc}`} value={`${c.realmId}::${acc}`}>
                              {c.companyName} • {acc}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                )}

                {/* Target Chart of Accounts Switcher */}
                <div className="flex items-center gap-1 bg-stone-900 border border-stone-700 rounded-lg p-0.5">
                  <button
                    onClick={() => handleSelectTargetChartOfAccounts(selectedQboRealmId, 'Schedule F Agricultural Standard (28 Accounts)', 'FARM')}
                    className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all cursor-pointer ${
                      qboActiveChart.includes('Schedule F')
                        ? 'bg-amber-600 text-white shadow'
                        : 'text-stone-400 hover:text-stone-200'
                    }`}
                    title="Sync receipts to Schedule F Farm tax accounts"
                  >
                    🌾 Schedule F Farm
                  </button>
                  <button
                    onClick={() => handleSelectTargetChartOfAccounts(selectedQboRealmId, 'Schedule C Commercial Standard (24 Accounts)', 'COMMERCIAL')}
                    className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all cursor-pointer ${
                      qboActiveChart.includes('Schedule C')
                        ? 'bg-sky-600 text-white shadow'
                        : 'text-stone-400 hover:text-stone-200'
                    }`}
                    title="Sync receipts to Schedule C Business tax accounts"
                  >
                    🏢 Schedule C Business
                  </button>
                </div>

                <button
                  onClick={copyIntuitUri}
                  className="px-2.5 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-sky-300 border border-stone-700 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Intuit URI</span>
                </button>
                <button
                  onClick={() => onNavigateTab('qbo')}
                  className="px-3 py-1.5 rounded-lg bg-[#2CA01C] hover:bg-[#238016] text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow cursor-pointer"
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Open QBO Center</span>
                </button>
              </div>
            </div>

            {/* Connected QuickBooks Companies & Synced Accounts Overview */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-stone-300 uppercase tracking-wider flex items-center gap-2">
                  <Sliders className="w-3.5 h-3.5 text-sky-400" />
                  Connected QuickBooks Accounts &amp; Synced Pipeline
                </h4>
                <span className="text-[11px] text-stone-400">
                  {qboCompanies.length} Connected Companies • Rolling 101 Days OAuth 2.0
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {qboCompanies.map((c) => {
                  const isActive = c.realmId === selectedQboRealmId;
                  const syncedAccs = c.syncedAccounts || ['Operating Checking (Acct ****4120)', 'Farm Operating & Expense Ledger'];
                  const targetChart = c.targetChartOfAccounts || 'Schedule F Agricultural Standard (28 Accounts)';

                  return (
                    <div
                      key={c.realmId}
                      className={`p-4 rounded-xl border transition-all ${
                        isActive
                          ? 'bg-stone-900/90 border-emerald-500/60 shadow-lg shadow-emerald-950/20 ring-1 ring-emerald-500/30'
                          : 'bg-stone-950/60 border-stone-800 hover:border-stone-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-emerald-400" />
                            <span className="font-bold text-stone-100 text-xs sm:text-sm">
                              {c.companyName}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-stone-400 mt-0.5">
                            Realm ID: {c.realmId} · {c.environment.toUpperCase()}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {isActive ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                              ACTIVE WORKING
                            </span>
                          ) : (
                            <button
                              onClick={() => handleSwitchWorkingQboCompany(c.realmId)}
                              className="px-2.5 py-1 rounded bg-stone-800 hover:bg-stone-700 text-emerald-400 text-[11px] font-semibold border border-stone-700 transition-colors cursor-pointer"
                            >
                              Work on this
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Synced Accounts in this company */}
                      <div className="mt-3 pt-3 border-t border-stone-800/80 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase font-mono font-bold text-stone-400 block">
                            Synced Accounts in Pipeline ({syncedAccs.length}):
                          </span>
                          <span className="text-[10px] text-stone-500 font-mono">
                            Click to activate · ✕ to remove
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {syncedAccs.map((acc, aIdx) => {
                            const isAccActive = isActive && (qboActiveAccount === acc || (!qboActiveAccount && aIdx === 0));
                            return (
                              <div
                                key={aIdx}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono transition-all border ${
                                  isAccActive
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold'
                                    : 'bg-stone-900 hover:bg-stone-850 text-stone-300 border-stone-800'
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => handleSwitchWorkingQboCompany(c.realmId, acc)}
                                  className="flex items-center gap-1 cursor-pointer hover:text-white"
                                  title="Click to work on this account"
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full ${isAccActive ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                                  <span>{acc}</span>
                                  {isAccActive && <span className="text-[9px] text-amber-300">(Active)</span>}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleSyncedAccount(c.realmId, acc)}
                                  className="text-stone-500 hover:text-red-400 cursor-pointer ml-0.5"
                                  title="Remove account from pipeline"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            );
                          })}

                          {/* Add Synced Account to this company */}
                          {showAddAccountForRealm === c.realmId ? (
                            <div className="inline-flex items-center gap-1 bg-stone-900 p-1 rounded-lg border border-emerald-500/50">
                              <select
                                onChange={e => {
                                  if (e.target.value) handleAddSyncedAccount(c.realmId, e.target.value);
                                }}
                                className="px-1.5 py-0.5 rounded bg-stone-950 border border-stone-700 text-stone-200 text-[10px] font-mono cursor-pointer"
                                defaultValue=""
                              >
                                <option value="" disabled>Select Preset Account...</option>
                                {STANDARD_SYNC_PRESETS.filter(p => !syncedAccs.includes(p)).map((p, pIdx) => (
                                  <option key={pIdx} value={p}>{p}</option>
                                ))}
                              </select>
                              <input
                                type="text"
                                value={newAccountInput}
                                onChange={e => setNewAccountInput(e.target.value)}
                                placeholder="Or custom name..."
                                className="px-1.5 py-0.5 rounded bg-stone-950 border border-stone-700 text-stone-200 text-[10px] font-mono focus:outline-none w-36"
                              />
                              <button
                                type="button"
                                onClick={() => handleAddSyncedAccount(c.realmId, newAccountInput)}
                                className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold cursor-pointer"
                              >
                                Add
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setShowAddAccountForRealm(null);
                                  setNewAccountInput('');
                                }}
                                className="text-stone-500 hover:text-stone-300 text-xs cursor-pointer px-1"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setShowAddAccountForRealm(c.realmId)}
                              className="px-2 py-0.5 rounded bg-stone-900 hover:bg-stone-800 text-stone-400 hover:text-emerald-300 text-[10px] font-mono border border-stone-800 hover:border-stone-700 cursor-pointer flex items-center gap-1"
                            >
                              <span>+ Add Account to Sync</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Target Chart of Accounts with Direct Toggle */}
                      <div className="mt-2.5 pt-2 border-t border-stone-800/40 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                        <span className="text-stone-400">Target Chart of Accounts:</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleSelectTargetChartOfAccounts(c.realmId, 'Schedule F Agricultural Standard (28 Accounts)', 'FARM')}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all cursor-pointer ${
                              targetChart.includes('Schedule F')
                                ? 'bg-amber-600/30 text-amber-300 border border-amber-500/50'
                                : 'bg-stone-900 text-stone-400 border border-stone-800 hover:text-stone-200'
                            }`}
                          >
                            🌾 Schedule F Farm
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSelectTargetChartOfAccounts(c.realmId, 'Schedule C Commercial Standard (24 Accounts)', 'COMMERCIAL')}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all cursor-pointer ${
                              targetChart.includes('Schedule C')
                                ? 'bg-sky-600/30 text-sky-300 border border-sky-500/50'
                                : 'bg-stone-900 text-stone-400 border border-stone-800 hover:text-stone-200'
                            }`}
                          >
                            🏢 Schedule C Business
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Target Chart of Accounts Mapping & Interactive Directory with Search */}
            {(() => {
              const searchedAccounts = searchQboAccounts(qboAllAccounts, qboChartSearchQuery, qboChartCategoryFilter);
              return (
                <div className="p-4 rounded-xl bg-stone-900/70 border border-stone-800 space-y-3.5 shadow-lg">
                  {/* Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-sky-400" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-stone-200">
                            QuickBooks Chart of Accounts Directory &amp; Search
                          </span>
                          <span className="px-1.5 py-0.2 rounded font-mono text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            {qboAllAccounts.length} Populated
                          </span>
                        </div>
                        <p className="text-[11px] text-stone-400">
                          Active Target: <span className="text-amber-300 font-semibold">{qboActiveChart}</span>
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => onNavigateTab('qbo')}
                      className="text-xs text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1 cursor-pointer self-start sm:self-auto"
                    >
                      <span>Full QBO Production Center</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Real-time Account Search Bar */}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={qboChartSearchQuery}
                        onChange={e => setQboChartSearchQuery(e.target.value)}
                        placeholder="Search accounts by name, number (#1010, #6020), type, IRS line, description..."
                        className="w-full pl-9 pr-8 py-1.5 bg-stone-950 border border-stone-700 hover:border-stone-600 rounded-lg text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
                      />
                      {qboChartSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setQboChartSearchQuery('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-200 text-xs px-1 cursor-pointer"
                          title="Clear search"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {/* Category Filter Dropdown or Pills */}
                    <div className="flex items-center gap-1 shrink-0 overflow-x-auto pb-1 sm:pb-0">
                      {['ALL', 'Bank', 'Expense', 'Asset', 'Liability', 'SCHEDULE_F', 'SCHEDULE_C'].map(catKey => {
                        const isSel = qboChartCategoryFilter === catKey;
                        const label = catKey === 'ALL' ? 'All' : catKey === 'SCHEDULE_F' ? 'Sched F' : catKey === 'SCHEDULE_C' ? 'Sched C' : catKey;
                        return (
                          <button
                            key={catKey}
                            type="button"
                            onClick={() => setQboChartCategoryFilter(catKey)}
                            className={`px-2 py-1 rounded text-[10px] font-semibold transition-all cursor-pointer ${
                              isSel
                                ? 'bg-amber-500 text-stone-950 font-bold'
                                : 'bg-stone-950 text-stone-400 hover:text-stone-200 border border-stone-800'
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Search Results / Account Cards Grid */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] text-stone-400 font-mono px-1">
                      <span>Showing {searchedAccounts.length} of {qboAllAccounts.length} accounts</span>
                      {qboChartSearchQuery && (
                        <span className="text-amber-300 font-bold">Matching &quot;{qboChartSearchQuery}&quot;</span>
                      )}
                    </div>

                    {searchedAccounts.length === 0 ? (
                      <div className="p-4 text-center text-xs text-stone-400 bg-stone-950/60 rounded-lg border border-stone-800">
                        No accounts match &quot;{qboChartSearchQuery}&quot;. Try searching for another name or number.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-56 overflow-y-auto pr-1">
                        {searchedAccounts.slice(0, 32).map((acc, aIdx) => {
                          const isActiveAcc = qboActiveAccount === acc.name;
                          return (
                            <div
                              key={acc.id || aIdx}
                              className={`p-2 rounded-lg border flex flex-col justify-between gap-1 transition-all ${
                                isActiveAcc
                                  ? 'bg-amber-950/30 border-amber-500/50 text-amber-200'
                                  : 'bg-stone-950/80 border-stone-800 hover:border-stone-700 text-stone-300'
                              }`}
                            >
                              <div className="space-y-0.5">
                                <div className="flex items-center justify-between gap-1">
                                  <div className="flex items-center gap-1 truncate">
                                    {acc.accountNumber && (
                                      <span className="font-mono text-[9px] text-amber-400/90 font-bold">
                                        #{acc.accountNumber}
                                      </span>
                                    )}
                                    <span className="font-semibold text-[11px] truncate text-stone-100" title={acc.name}>
                                      {acc.name}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 text-[9px] font-mono text-stone-400">
                                  <span className="px-1 py-0.2 rounded bg-stone-900 border border-stone-800 text-stone-300">
                                    {acc.qboType}
                                  </span>
                                  {acc.line && (
                                    <span className="text-emerald-400 truncate">{acc.line}</span>
                                  )}
                                </div>
                              </div>

                              <div className="pt-1 border-t border-stone-800/60 flex items-center justify-between text-[9px]">
                                {isActiveAcc ? (
                                  <span className="text-amber-400 font-bold">Active Working</span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (selectedQboRealmId) {
                                        handleSwitchWorkingQboCompany(selectedQboRealmId, acc.name);
                                      }
                                    }}
                                    className="text-stone-400 hover:text-amber-300 font-semibold cursor-pointer"
                                  >
                                    Switch To
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(acc.name);
                                    onToast(`Copied "${acc.name}"`);
                                  }}
                                  className="text-stone-400 hover:text-stone-200 cursor-pointer"
                                  title="Copy"
                                >
                                  Copy
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* QuickBooks Synchronization Audit Log */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-stone-300">
                  <Clock className="w-4 h-4 text-purple-400" />
                  <span className="font-semibold">
                    Recent QuickBooks Synchronization Events
                  </span>
                  <span className="text-stone-400 font-mono text-[10px]">
                    ({qboSyncLogs.length} logged)
                  </span>
                </div>
                <button
                  onClick={() => onNavigateTab('qbo')}
                  className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <span>Open Audit Log</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {qboSyncLogs.length === 0 ? (
                <div className="p-8 text-center rounded-xl bg-stone-950/60 border border-stone-800 text-xs text-stone-400 space-y-2">
                  <div>No QuickBooks synchronization events logged yet.</div>
                  <p className="text-[11px] text-stone-500">
                    When batches are pushed to QuickBooks Online via the Scanner or Intake, full audit events are recorded here.
                  </p>
                  <button
                    onClick={() => onNavigateTab('qbo')}
                    className="px-3 py-1.5 rounded-lg bg-[#2CA01C] hover:bg-[#238016] text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer mt-2"
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    <span>Connect QuickBooks Company</span>
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto border border-stone-800 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-stone-950/80 text-stone-400 text-[11px] uppercase tracking-wider font-mono border-b border-stone-800">
                      <tr>
                        <th className="px-4 py-3">Timestamp</th>
                        <th className="px-4 py-3">Action Type</th>
                        <th className="px-4 py-3">Target Company &amp; Account</th>
                        <th className="px-4 py-3">Transactions &amp; Amount</th>
                        <th className="px-4 py-3">IRS Tax Category</th>
                        <th className="px-4 py-3">Execution Status</th>
                        <th className="px-4 py-3 text-right">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-800 text-stone-200">
                      {qboSyncLogs.slice(0, 8).map((log, lIdx) => (
                        <tr key={lIdx} className="hover:bg-stone-850/50 transition-colors">
                          <td className="px-4 py-3 text-stone-400 font-mono text-[11px]">
                            {new Date(log.timestamp).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 font-semibold text-stone-200">
                            {log.action}
                          </td>
                          <td className="px-4 py-3 text-stone-300 font-mono text-[11px]">
                            <div>{log.companyName || log.realmId || 'Intuit Realm'}</div>
                            {log.accountName && (
                              <div className="text-[10px] text-amber-300">{log.accountName}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono text-emerald-400 font-bold">
                            <div>{log.receiptsCount || 1} transactions</div>
                            {log.total !== undefined && (
                              <div className="text-[10px] text-stone-300">
                                ${Number(log.total).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-stone-300 font-mono text-[11px]">
                            {log.irsLine || log.schedule || 'Schedule F / C'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                              log.status === 'SUCCESS'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            }`}>
                              {log.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-stone-400 text-[11px] truncate max-w-[200px]">
                            {log.message || log.details || 'Sync completed'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 4 Content: W-2 & 1099 Tax Ledger */}
        {activeWorkstationTab === 'taxes' && (
          <div className="p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-stone-300">
                <FileSpreadsheet className="w-4 h-4 text-purple-400" />
                <span className="font-semibold">
                  Individual Taxfiling Records (Form 1040 Preparation Packet)
                </span>
                <span className="text-purple-300 font-mono">
                  · {w2s.length} W-2s &amp; {f1099s.length} 1099s
                </span>
              </div>

              <button
                onClick={() => onNavigateTab('tax_hub')}
                className="text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <span>Open Tax Hub Workstation</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {w2s.length === 0 && f1099s.length === 0 ? (
              <div className="p-8 text-center rounded-xl bg-stone-950/60 border border-stone-800 text-xs text-stone-400 space-y-2">
                <div>No W-2 or 1099 income documents registered in vault.</div>
                <p className="text-[11px] text-stone-500">
                  Clients uploading individual tax documents will have their wages, withholdings, and state obligations detected here.
                </p>
                <button
                  onClick={() => onNavigateTab('tax_hub')}
                  className="px-3 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-600 text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer mt-2"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Launch W-2 &amp; 1099 Tax Hub</span>
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto border border-stone-800 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-950/80 text-stone-400 text-[11px] uppercase tracking-wider font-mono border-b border-stone-800">
                    <tr>
                      <th className="px-4 py-3">Form</th>
                      <th className="px-4 py-3">Employee / Payee</th>
                      <th className="px-4 py-3">Employer / Payer</th>
                      <th className="px-4 py-3">Box 1 Wages / Income</th>
                      <th className="px-4 py-3">Federal Withholding</th>
                      <th className="px-4 py-3">State Tax &amp; Obligation</th>
                      <th className="px-4 py-3 text-right">Packet</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-800 text-stone-200">
                    {w2s.slice(0, 6).map((w) => (
                      <tr key={w.id} className="hover:bg-stone-850/50 transition-colors">
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-500/10 text-purple-300 border border-purple-500/20">
                            W-2
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-stone-100">{w.employeeName || 'Wage Earner'}</div>
                          <div className="text-[10px] text-stone-500 font-mono">SSN: {w.employeeSsnMasked}</div>
                        </td>
                        <td className="px-4 py-3 text-stone-300">
                          <div>{w.employerName}</div>
                          <div className="text-[10px] text-stone-500 font-mono">EIN: {w.employerEin}</div>
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-stone-100">
                          ${parseFloat(String(w.box1Wages || '0')).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 font-mono text-emerald-400 font-bold">
                          ${parseFloat(String(w.box2FederalTaxWithheld || '0')).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 font-mono">
                            <span className="font-bold text-amber-400">{w.box15State || 'FED'}</span>
                            <span className="text-stone-300">
                              ${parseFloat(String(w.box17StateTaxWithheld || '0')).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          {w.stateAssessment && (
                            <div className="text-[10px] text-stone-400 truncate max-w-[150px]">
                              {w.stateAssessment.note}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => onNavigateTab('tax_hub')}
                            className="px-2.5 py-1 rounded bg-stone-800 hover:bg-stone-700 text-purple-300 font-semibold text-[11px] transition-colors cursor-pointer"
                          >
                            View &rarr;
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 5 Content: Subscription License Registry Ledger */}
        {activeWorkstationTab === 'licenses' && (
          <div className="p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-stone-300">
                <Key className="w-4 h-4 text-sky-400" />
                <span className="font-semibold">
                  Subscriber &amp; Master Admin License Registry
                </span>
                <span className="text-sky-300 font-mono">
                  · {activeKeysCount} Active / {licenseKeys.length} Total
                </span>
              </div>

              <button
                onClick={() => onNavigateTab('licensing')}
                className="text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <span>Open Full Licensing Console</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {filteredLicenses.length === 0 ? (
              <div className="p-8 text-center rounded-xl bg-stone-950/60 border border-stone-800 text-xs text-stone-400">
                No license records matching search filter.
              </div>
            ) : (
              <div className="overflow-x-auto border border-stone-800 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-950/80 text-stone-400 text-[11px] uppercase tracking-wider font-mono border-b border-stone-800">
                    <tr>
                      <th className="px-4 py-3">License Key</th>
                      <th className="px-4 py-3">Client / Organization</th>
                      <th className="px-4 py-3">Plan Tier</th>
                      <th className="px-4 py-3">Hardware ID Lock</th>
                      <th className="px-4 py-3">Expiration Date</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Manage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-800 text-stone-200">
                    {filteredLicenses.slice(0, 8).map((k) => (
                      <tr key={k.id} className="hover:bg-stone-850/50 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-stone-100 flex items-center gap-2">
                          <Key className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>{k.key}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-stone-200">{k.clientName || 'Subscriber'}</div>
                          <div className="text-[10px] text-stone-500">{k.clientEmail || 'client@example.com'}</div>
                        </td>
                        <td className="px-4 py-3 font-mono">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            k.plan === 'ADMIN'
                              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                              : 'bg-stone-800 text-stone-300'
                          }`}>
                            {k.plan}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-stone-400 font-mono text-[11px]">
                          {k.hardwareId || 'Unbound (First Use)'}
                        </td>
                        <td className="px-4 py-3 text-stone-300 font-mono text-[11px]">
                          {k.expiresDate || 'Non-Expiring'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                            k.status === 'ACTIVE'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}>
                            {k.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => onNavigateTab('licensing')}
                            className="px-2.5 py-1 rounded bg-stone-800 hover:bg-stone-700 text-sky-400 hover:text-sky-300 font-semibold text-[11px] transition-colors cursor-pointer"
                          >
                            Inspect &rarr;
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Complete All-Sections Directory (Fast Navigation to Every Admin Tool) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-stone-100 flex items-center gap-2">
              <Layers className="w-4 h-4 text-amber-400" />
              Complete Admin Management Workstation Directory
            </h3>
            <p className="text-xs text-stone-400 mt-0.5">
              Jump directly to any of the 9 dedicated consoles in the platform.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Section 1: Parallel Receipt Engine */}
          <div className="p-5 rounded-xl bg-stone-900 border border-stone-800 flex flex-col justify-between hover:border-stone-700 transition-all shadow-sm">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Cpu className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  4 Parallel Workers
                </span>
              </div>
              <h4 className="text-sm font-bold text-stone-100">Receipt Processing &amp; Parallel Engine</h4>
              <p className="text-xs text-stone-400 leading-relaxed">
                Parallel OCR pipeline for batch deduction scanning, IRS Schedule F &amp; C categorization, ledger exports, and QBO push.
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('scanner')}
              className="mt-4 pt-3 border-t border-stone-800/80 w-full flex items-center justify-between text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
            >
              <span>Launch Engine</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Section 2: Client Intake Manager */}
          <div className="p-5 rounded-xl bg-stone-900 border border-stone-800 flex flex-col justify-between hover:border-stone-700 transition-all shadow-sm">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <Inbox className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  {queuedSubmissionsCount} Pending Review
                </span>
              </div>
              <h4 className="text-sm font-bold text-stone-100">Client Intake &amp; Multi-VM Cluster</h4>
              <p className="text-xs text-stone-400 leading-relaxed">
                Central ingest queue for client receipts, tax documents, and invoices with batch verification and node dispatch.
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('intake')}
              className="mt-4 pt-3 border-t border-stone-800/80 w-full flex items-center justify-between text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
            >
              <span>Open Intake Hub</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Section 3: W-2 & 1099 Tax Hub */}
          <div className="p-5 rounded-xl bg-stone-900 border border-stone-800 flex flex-col justify-between hover:border-stone-700 transition-all shadow-sm">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20">
                  Form 1040 Preparation
                </span>
              </div>
              <h4 className="text-sm font-bold text-stone-100">W-2 &amp; 1099 Tax Documents Hub</h4>
              <p className="text-xs text-stone-400 leading-relaxed">
                Extracts Boxes 1–20, auto-flags state tax obligations (CA, IL, NY vs TX/FL), masks SSNs, and exports Form 1040 packets.
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('tax_hub')}
              className="mt-4 pt-3 border-t border-stone-800/80 w-full flex items-center justify-between text-xs font-semibold text-purple-400 hover:text-purple-300 transition-colors cursor-pointer"
            >
              <span>Open Tax Hub</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Section 4: QuickBooks Online */}
          <div className="p-5 rounded-xl bg-stone-900 border border-stone-800 flex flex-col justify-between hover:border-stone-700 transition-all shadow-sm">
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
                Connect Intuit accounts, map expense accounts, manage 101-day rolling renewal, and audit sync history.
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('qbo')}
              className="mt-4 pt-3 border-t border-stone-800/80 w-full flex items-center justify-between text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
            >
              <span>Open QBO Center</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Section 5: Subscription Licensing */}
          <div className="p-5 rounded-xl bg-stone-900 border border-stone-800 flex flex-col justify-between hover:border-stone-700 transition-all shadow-sm">
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
                Issue client keys, generate perpetual non-expiring master admin keys, enforce hardware locks, and sync with Edge KV.
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('licensing')}
              className="mt-4 pt-3 border-t border-stone-800/80 w-full flex items-center justify-between text-xs font-semibold text-sky-400 hover:text-sky-300 transition-colors cursor-pointer"
            >
              <span>Manage Keys</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Section 6: Connected Devices */}
          <div className="p-5 rounded-xl bg-stone-900 border border-stone-800 flex flex-col justify-between hover:border-stone-700 transition-all shadow-sm">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Radio className="w-4 h-4 animate-pulse" />
                </div>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  Real-Time Presence
                </span>
              </div>
              <h4 className="text-sm font-bold text-stone-100">Live Connected Devices &amp; Active IPs</h4>
              <p className="text-xs text-stone-400 leading-relaxed">
                Real-time client IP monitoring, concurrent session tracking, ping heartbeats, and device security logs.
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('devices')}
              className="mt-4 pt-3 border-t border-stone-800/80 w-full flex items-center justify-between text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
            >
              <span>Track Devices</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Section 7: Auto-Update System */}
          <div className="p-5 rounded-xl bg-stone-900 border border-stone-800 flex flex-col justify-between hover:border-stone-700 transition-all shadow-sm">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                  <RefreshCw className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20">
                  v{currentVersion} Stable
                </span>
              </div>
              <h4 className="text-sm font-bold text-stone-100">Auto-Update System &amp; Versioning</h4>
              <p className="text-xs text-stone-400 leading-relaxed">
                In-place application updater, release manifest checks, SHA-256 binary validation, and changelog management.
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('updater')}
              className="mt-4 pt-3 border-t border-stone-800/80 w-full flex items-center justify-between text-xs font-semibold text-sky-400 hover:text-sky-300 transition-colors cursor-pointer"
            >
              <span>Check Updates</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Section 8: Architecture Guide */}
          <div className="p-5 rounded-xl bg-stone-900 border border-stone-800 flex flex-col justify-between hover:border-stone-700 transition-all shadow-sm">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Layers className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  Technical Spec
                </span>
              </div>
              <h4 className="text-sm font-bold text-stone-100">Subscription Architecture Guide</h4>
              <p className="text-xs text-stone-400 leading-relaxed">
                Detailed technical documentation of subscription gating, local encrypted vaults, and offline grace periods.
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('guide')}
              className="mt-4 pt-3 border-t border-stone-800/80 w-full flex items-center justify-between text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
            >
              <span>Read Guide</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Section 9: Integrated Python Code */}
          <div className="p-5 rounded-xl bg-stone-900 border border-stone-800 flex flex-col justify-between hover:border-stone-700 transition-all shadow-sm">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                  <FileCode2 className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20">
                  Python &amp; .bat Bundle
                </span>
              </div>
              <h4 className="text-sm font-bold text-stone-100">Integrated Python Code &amp; Runtime</h4>
              <p className="text-xs text-stone-400 leading-relaxed">
                Inspect and download standalone desktop code (`receipt_processor.py`) and Windows one-click automated batch launcher.
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('code')}
              className="mt-4 pt-3 border-t border-stone-800/80 w-full flex items-center justify-between text-xs font-semibold text-purple-400 hover:text-purple-300 transition-colors cursor-pointer"
            >
              <span>View Source</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </section>

      {/* Security, Encryption & Integrity Safeguards Audit */}
      <section className="p-6 rounded-2xl bg-stone-900 border border-stone-800 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-stone-100">Platform Security &amp; Compliance Safeguards</h3>
          </div>
          <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            All Safeguards Enforced
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-stone-950/60 border border-stone-800/80 flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
              <Check className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-stone-200">Sensitive PII &amp; FTI Masking</div>
              <p className="text-[11px] text-stone-400 mt-1 leading-relaxed">
                SSNs (`***-**-XXXX`) and EINs (`**-***XXXX`) are automatically masked across all user-facing views to protect taxpayer identity.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-stone-950/60 border border-stone-800/80 flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
              <Check className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-stone-200">AES-256 Hardware-Locked Vault</div>
              <p className="text-[11px] text-stone-400 mt-1 leading-relaxed">
                All client licenses and encrypted database snapshots are bound to unique hardware IDs (HWID) to prevent credential piracy.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-stone-950/60 border border-stone-800/80 flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
              <Check className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-stone-200">Multi-Cloud Edge Failover</div>
              <p className="text-[11px] text-stone-400 mt-1 leading-relaxed">
                Real-time failover sync between Cloudflare Edge KV and local database prevents data loss during network interruptions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Intuit OAuth & Tools Footer Toolbar */}
      <section className="p-5 rounded-xl bg-stone-900/60 border border-stone-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#2CA01C]/15 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
            <Building2 className="w-4.5 h-4.5 text-[#2CA01C]" />
          </div>
          <div>
            <div className="text-xs font-bold text-stone-200">Intuit Developer Production Redirect URI</div>
            <div className="text-[11px] text-stone-400 mt-0.5">
              Exact OAuth 2.0 callback endpoint registered in your Intuit app keys portal.
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={copyIntuitUri}
            className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-sky-300 border border-stone-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
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
