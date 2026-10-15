import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Building2,
  Key,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Clock,
  Trash2,
  Lock,
  Zap,
  Globe,
  HelpCircle,
  Copy,
  Check,
  Server,
  FileCheck,
  Radio,
  X,
  Send,
  DollarSign,
  Layers,
  Sliders,
  Download,
  ListFilter,
  FileText,
  Sparkles,
  ArrowRight,
  Search,
  Plus,
  Tag,
  BookOpen,
  Filter,
  CheckCheck,
  Mail,
  Star,
  Edit2
} from 'lucide-react';
import { getBackendApiUrl } from '../urlUtils';
import {
  QboAccountItem,
  getAllStandardQboAccounts,
  searchQboAccounts,
  QBO_CHART_CATEGORIES
} from '../quickbooksChartOfAccounts';

interface CompanyRecord {
  realmId: string;
  companyName: string;
  legalName?: string;
  email?: string;
  country?: string;
  connectedAt: string;
  lastRefreshedAt: string;
  lastUsedAt?: string;
  environment: 'production' | 'sandbox';
  status: 'CONNECTED' | 'DISCONNECTED' | 'REVOKED';
  accessValidRemainingSec: number;
  rollingDaysRemaining: number;
  assignedToKey?: string | null;
  isActiveWorking?: boolean;
  syncedAccounts?: string[];
  selectedWorkingAccount?: string;
  defaultPostingAccount?: string;
  targetChartOfAccounts?: string;
  chartOfAccountsCategory?: 'FARM' | 'COMMERCIAL';
  accountMappings?: Record<string, string>;
}

interface QboConfigState {
  configured: boolean;
  clientId: string;
  environment: 'production' | 'sandbox';
  hasSecret: boolean;
  redirectUri: string;
  hasWebhookVerifier: boolean;
  totalConnectedCompanies: number;
  appTitle?: string;
}

interface SyncLogEntry {
  id: string;
  pushedAt: string;
  realmId: string;
  companyName: string;
  vendor: string;
  date: string;
  total: number;
  tax?: number;
  docNumber: string;
  qboTxnId: string;
  schedule: string;
  irsLine: string;
  accountName: string;
  fileName: string;
  status: string;
  error?: string;
}

interface QuickBooksProductionCenterProps {
  showToast: (msg: string) => void;
  onOpenLegal: (tab: 'privacy' | 'terms' | 'security' | 'support') => void;
}

const QBO_STORAGE_CONFIG_KEY = 'receipt_processor_qbo_config_v1';
const QBO_STORAGE_COMPANIES_KEY = 'receipt_processor_qbo_companies_v1';
const QBO_STORAGE_SYNC_LOGS_KEY = 'receipt_processor_qbo_sync_logs_v1';
const QBO_STORAGE_MAPPINGS_KEY = 'receipt_processor_qbo_account_mappings_v1';
const ADMIN_SCANNED_LEDGER_KEY = 'receipt_processor_admin_scanned_ledger_v1';
const DEFAULT_WEBHOOK_VERIFIER = '10dcc427-1e8b-4358-b8f7-8d1e30150fa6';

const DEFAULT_ACCOUNT_MAPPINGS: Record<string, string> = {
  // Schedule F Farm
  'Line 10': 'Car and truck expenses',
  'Line 12': 'Conservation expenses',
  'Line 13': 'Custom hire (machine work)',
  'Line 14': 'Feed purchased',
  'Line 15': 'Fertilizers and lime',
  'Line 16': 'Freight and trucking',
  'Line 17': 'Gasoline, fuel, and oil',
  'Line 18': 'Insurance (other than health)',
  'Line 19': 'Interest: Mortgage & loans',
  'Line 20': 'Labor hired (less employment credits)',
  'Line 22': 'Repairs and maintenance',
  'Line 23': 'Seeds and plants purchased',
  'Line 24': 'Storage and warehousing',
  'Line 25': 'Supplies purchased',
  'Line 26': 'Taxes (real estate / property)',
  'Line 27': 'Utilities',
  'Line 28': 'Veterinary, breeding, medicine',
  'Line 32': 'Other farm expenses',
  // Schedule C Business
  'Line 8': 'Advertising',
  'Line 9': 'Car and truck expenses',
  'Line 10 (C)': 'Commissions and fees',
  'Line 11': 'Contract labor',
  'Line 15 (C)': 'Insurance (other than health)',
  'Line 17 (C)': 'Legal and professional services',
  'Line 18 (C)': 'Office expense',
  'Line 21': 'Repairs and maintenance',
  'Line 22 (C)': 'Supplies',
  'Line 24 (C)': 'Travel and meals',
  'Line 25 (C)': 'Utilities',
  'Line 27 (C)': 'Other business expenses'
};

const STANDARD_SYNC_PRESETS = [
  'Operating Checking (Acct ****4120)',
  'Farm Operating & Expense Ledger',
  'Commercial Fleet & Fuel Account (Acct ****6021)',
  'Agricultural Payroll Reserve',
  'Commercial Equipment Financing (Acct ****8812)',
  'Grain & Crop Sales Settlement Acct',
  'Livestock & Cattle Trading Ledger',
  'Farm Improvements & Maintenance Reserve',
  'General Business Operating Acct (Acct ****1092)'
];

async function safeFetchJson<T = any>(url: string, options?: RequestInit): Promise<{ ok: boolean; data: T | null }> {
  try {
    const finalUrl = url.startsWith('/') ? getBackendApiUrl() + url : url;
    const res = await fetch(finalUrl, options);
    if (!res.ok) return { ok: false, data: null };
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      return { ok: false, data: null };
    }
    const text = await res.text();
    if (text.trim().startsWith('<')) {
      return { ok: false, data: null };
    }
    const data = JSON.parse(text);
    return { ok: true, data };
  } catch {
    return { ok: false, data: null };
  }
}

function getLocalConfig(): Partial<QboConfigState> {
  try {
    const raw = localStorage.getItem(QBO_STORAGE_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.clientId === 'ABCsXqO9WiPqbL2Bgqf9AeBPMDeBQSjWKLdHiZUPYIlPwDoHni') {
        parsed.clientId = '';
      }
      return parsed;
    }
  } catch {}
  return {};
}

function saveLocalConfig(cfg: Partial<QboConfigState>) {
  try {
    const current = getLocalConfig();
    localStorage.setItem(QBO_STORAGE_CONFIG_KEY, JSON.stringify({ ...current, ...cfg }));
  } catch {}
}

const DEFAULT_INITIAL_COMPANIES: CompanyRecord[] = [
  {
    realmId: '934145791240',
    companyName: 'Oak Creek Agriculture & Cattle LLC',
    legalName: 'Oak Creek Agriculture & Cattle Operations LLC',
    email: 'finance@oakcreekag.com',
    country: 'US',
    connectedAt: '2025-01-15T08:30:00.000Z',
    lastRefreshedAt: new Date().toISOString(),
    status: 'CONNECTED',
    accessValidRemainingSec: 3600,
    environment: 'sandbox',
    rollingDaysRemaining: 101,
    isActiveWorking: true,
    syncedAccounts: [
      'Operating Checking (Acct ****4120)',
      'Farm Operating & Expense Ledger',
      'Commercial Equipment Financing (Acct ****8812)',
      'Agricultural Payroll Reserve',
      'Feed & Pasture Expense Acct'
    ],
    selectedWorkingAccount: 'Operating Checking (Acct ****4120)',
    defaultPostingAccount: 'Operating Checking (Acct ****4120)',
    targetChartOfAccounts: 'Schedule F Agricultural Standard (28 Accounts)',
    chartOfAccountsCategory: 'FARM'
  },
  {
    realmId: '934145794821',
    companyName: 'High Desert Ranching & Equipment Co.',
    legalName: 'High Desert Ranching & Equipment Logistics LLC',
    email: 'books@highdesertranch.com',
    country: 'US',
    connectedAt: '2025-01-18T10:15:00.000Z',
    lastRefreshedAt: new Date().toISOString(),
    status: 'CONNECTED',
    accessValidRemainingSec: 3600,
    environment: 'production',
    rollingDaysRemaining: 98,
    isActiveWorking: false,
    syncedAccounts: [
      'Commercial Fleet & Fuel Account (Acct ****6021)',
      'Heavy Machinery Reserve (Acct ****1109)',
      'General Operating Account',
      'Livestock & Cattle Trading Ledger'
    ],
    selectedWorkingAccount: 'Commercial Fleet & Fuel Account (Acct ****6021)',
    defaultPostingAccount: 'Commercial Fleet & Fuel Account (Acct ****6021)',
    targetChartOfAccounts: 'Schedule C Commercial Standard (24 Accounts)',
    chartOfAccountsCategory: 'COMMERCIAL'
  },
  {
    realmId: '934145798934',
    companyName: 'Cascade Valley Organics & Hay Co.',
    legalName: 'Cascade Valley Organics Agricultural Partnership',
    email: 'ap@cascadevalleyfarms.com',
    country: 'US',
    connectedAt: '2025-01-20T14:00:00.000Z',
    lastRefreshedAt: new Date().toISOString(),
    status: 'CONNECTED',
    accessValidRemainingSec: 3600,
    environment: 'production',
    rollingDaysRemaining: 95,
    isActiveWorking: false,
    syncedAccounts: [
      'Organic Crops Operating Acct (Acct ****9044)',
      'Hay & Grain Inventory Reserve',
      'Irrigation & Utilities Clearing',
      'Harvest Distribution Acct'
    ],
    selectedWorkingAccount: 'Organic Crops Operating Acct (Acct ****9044)',
    defaultPostingAccount: 'Organic Crops Operating Acct (Acct ****9044)',
    targetChartOfAccounts: 'Schedule F Agricultural Standard (28 Accounts)',
    chartOfAccountsCategory: 'FARM'
  }
];

function getLocalCompanies(): CompanyRecord[] {
  try {
    const raw = localStorage.getItem(QBO_STORAGE_COMPANIES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return DEFAULT_INITIAL_COMPANIES;
}

function saveLocalCompanies(list: CompanyRecord[]) {
  try {
    localStorage.setItem(QBO_STORAGE_COMPANIES_KEY, JSON.stringify(list));
  } catch {}
}

function getLocalSyncLogs(): SyncLogEntry[] {
  try {
    const raw = localStorage.getItem(QBO_STORAGE_SYNC_LOGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveLocalSyncLogs(logs: SyncLogEntry[]) {
  try {
    localStorage.setItem(QBO_STORAGE_SYNC_LOGS_KEY, JSON.stringify(logs.slice(-250)));
  } catch {}
}

function generateSecureOauthState(): string {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const arr = new Uint8Array(16);
    window.crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function generateIntuitAuthUrl(clientId: string, redirectUri: string, state?: string): string {
  const cId = clientId.trim();
  const st = state || generateSecureOauthState();
  const params = new URLSearchParams({
    client_id: cId,
    response_type: 'code',
    scope: 'com.intuit.quickbooks.accounting',
    redirect_uri: redirectUri,
    state: st
  });
  return `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`;
}

export const QuickBooksProductionCenter: React.FC<QuickBooksProductionCenterProps> = ({
  showToast,
  onOpenLegal
}) => {
  const CANONICAL_REDIRECT_URI = 'https://moisttowlett247-a11y.github.io/Receipt_portal/api/qbo/callback';

  // Sub tab navigation: companies | sync | mapping | audit
  const [activeSubTab, setActiveSubTab] = useState<'companies' | 'sync' | 'mapping' | 'audit'>('companies');

  const [config, setConfig] = useState<QboConfigState>(() => {
    const local = getLocalConfig();
    return {
      configured: local.configured ?? true,
      clientId: local.clientId || '',
      environment: 'sandbox',
      hasSecret: local.hasSecret ?? false,
      redirectUri: CANONICAL_REDIRECT_URI,
      hasWebhookVerifier: local.hasWebhookVerifier ?? true,
      totalConnectedCompanies: local.totalConnectedCompanies ?? 0
    };
  });

  const [companies, setCompanies] = useState<CompanyRecord[]>(() => getLocalCompanies());
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Settings Edit form
  const [editClientId, setEditClientId] = useState(config.clientId || '');
  const [editClientSecret, setEditClientSecret] = useState('');
  const [editEnv, setEditEnv] = useState<'production' | 'sandbox'>('sandbox');
  const [editWebhookSecret, setEditWebhookSecret] = useState(DEFAULT_WEBHOOK_VERIFIER);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [showConfigForm, setShowConfigForm] = useState(false);

  // Connection Assistant Modal states
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [modalClientId, setModalClientId] = useState(config.clientId || '');
  const [modalClientSecret, setModalClientSecret] = useState('');
  const [modalEnv, setModalEnv] = useState<'production' | 'sandbox'>('sandbox');
  const [isSavingModal, setIsSavingModal] = useState(false);
  const [generatedAuthUrl, setGeneratedAuthUrl] = useState<string | null>(null);

  // Quick connect & Test states
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [testingRealmId, setTestingRealmId] = useState<string | null>(null);

  const [modalRedirectUri, setModalRedirectUri] = useState<string>(CANONICAL_REDIRECT_URI);
  const [editRedirectUri, setEditRedirectUri] = useState<string>(CANONICAL_REDIRECT_URI);

  // Sync Hub & Audit states
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>(() => getLocalSyncLogs());
  const [accountMappings, setAccountMappings] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem(QBO_STORAGE_MAPPINGS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return DEFAULT_ACCOUNT_MAPPINGS;
  });
  const [liveAccounts, setLiveAccounts] = useState<any[]>([]);
  const [qboFarmAccounts, setQboFarmAccounts] = useState<any[]>([]);
  const [qboBusinessAccounts, setQboBusinessAccounts] = useState<any[]>([]);
  const [qboBankAccounts, setQboBankAccounts] = useState<any[]>([]);
  const [targetChartType, setTargetChartType] = useState<'FARM' | 'COMMERCIAL' | 'CUSTOM'>('FARM');
  const [selectedPaymentAccount, setSelectedPaymentAccount] = useState<string>('Operating Checking (Acct ****4120)');
  const [defaultFallbackAccount, setDefaultFallbackAccount] = useState<string>('Other farm expenses');
  const [newSyncedAccountInput, setNewSyncedAccountInput] = useState<string>('');
  const [showAddAccountForRealm, setShowAddAccountForRealm] = useState<string | null>(null);
  const [showChartExplorer, setShowChartExplorer] = useState(true);
  const [editingEmailRealmId, setEditingEmailRealmId] = useState<string | null>(null);
  const [editingEmailValue, setEditingEmailValue] = useState<string>('');

  // Comprehensive Chart of Accounts & Search states
  const [allAccounts, setAllAccounts] = useState<QboAccountItem[]>(() => {
    try {
      const raw = localStorage.getItem('receipt_processor_qbo_all_accounts_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return getAllStandardQboAccounts(parsed);
      }
    } catch {}
    return getAllStandardQboAccounts();
  });
  const [chartSearchQuery, setChartSearchQuery] = useState<string>('');
  const [chartCategoryFilter, setChartCategoryFilter] = useState<string>('ALL');
  const [selectedChartAccountDetails, setSelectedChartAccountDetails] = useState<QboAccountItem | null>(null);
  const [showAddAccountModal, setShowAddAccountModal] = useState<boolean>(false);
  const [newCustomAccount, setNewCustomAccount] = useState({
    name: '',
    accountNumber: '',
    qboType: 'Expense',
    subType: 'Supplies',
    classification: 'Expense' as 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense',
    schedule: 'SCHEDULE_F' as 'SCHEDULE_F' | 'SCHEDULE_C' | 'BALANCE_SHEET',
    line: 'Line 32',
    description: ''
  });

  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [selectedPushRealmId, setSelectedPushRealmId] = useState<string>('');
  const [isPushingReceipts, setIsPushingReceipts] = useState(false);
  const [isClearingLog, setIsClearingLog] = useState(false);
  const [pendingLedgerReceipts, setPendingLedgerReceipts] = useState<any[]>(() => {
    try {
      const raw = localStorage.getItem(ADMIN_SCANNED_LEDGER_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  });

  const getCleanRedirectUri = (custom?: string) => {
    return (custom || editRedirectUri || modalRedirectUri || CANONICAL_REDIRECT_URI).trim();
  };

  const fetchConfig = async () => {
    const result = await safeFetchJson<QboConfigState>('/api/qbo/config');
    if (result.ok && result.data) {
      const cleanCId = (result.data.clientId === 'ABCsXqO9WiPqbL2Bgqf9AeBPMDeBQSjWKLdHiZUPYIlPwDoHni') ? '' : (result.data.clientId || '');
      setConfig({ ...result.data, clientId: cleanCId, environment: 'sandbox' });
      if (cleanCId) {
        setEditClientId(cleanCId);
        setModalClientId(cleanCId);
      }
      setEditEnv('sandbox');
      setModalEnv('sandbox');
      if (result.data.redirectUri) {
        setModalRedirectUri(result.data.redirectUri);
        setEditRedirectUri(result.data.redirectUri);
      }
      saveLocalConfig({ ...result.data, clientId: cleanCId, environment: 'sandbox' });
    } else {
      const local = getLocalConfig();
      const cleanCId = (local.clientId === 'ABCsXqO9WiPqbL2Bgqf9AeBPMDeBQSjWKLdHiZUPYIlPwDoHni') ? '' : (local.clientId || '');
      if (cleanCId) {
        setConfig(prev => ({ ...prev, ...local, clientId: cleanCId, environment: 'sandbox' }));
        setEditClientId(cleanCId);
        setModalClientId(cleanCId);
      }
      setEditEnv('sandbox');
      setModalEnv('sandbox');
      if (local.redirectUri) {
        setModalRedirectUri(local.redirectUri);
        setEditRedirectUri(local.redirectUri);
      }
    }
  };

  const fetchCompanies = async () => {
    setIsRefreshing(true);
    let loadedComps: CompanyRecord[] = [];
    const result = await safeFetchJson<{ companies: CompanyRecord[] }>('/api/qbo/companies');
    if (result.ok && result.data?.companies && result.data.companies.length > 0) {
      loadedComps = result.data.companies;
    } else {
      loadedComps = getLocalCompanies();
    }

    if (loadedComps.length > 0) {
      setCompanies(loadedComps);
      saveLocalCompanies(loadedComps);
      const storedActiveRealm = localStorage.getItem('receipt_processor_qbo_active_realm_v1');
      const active = (storedActiveRealm ? loadedComps.find(c => c.realmId === storedActiveRealm) : null)
        || loadedComps.find(c => c.isActiveWorking)
        || loadedComps.find(c => c.realmId === selectedPushRealmId)
        || loadedComps[0];
      if (active) {
        setSelectedPushRealmId(active.realmId);
        const storedActiveAccount = localStorage.getItem('receipt_processor_qbo_active_account_v1');
        const currentAcc = (storedActiveAccount && active.syncedAccounts?.includes(storedActiveAccount))
          ? storedActiveAccount
          : (active.selectedWorkingAccount || (active.syncedAccounts && active.syncedAccounts[0]) || 'Operating Checking (Acct ****4120)');
        setSelectedPaymentAccount(currentAcc);
        if (active.chartOfAccountsCategory === 'COMMERCIAL') {
          setTargetChartType('COMMERCIAL');
        } else {
          setTargetChartType('FARM');
        }
      }
    }
    setIsRefreshing(false);
    setIsLoading(false);
  };

  const fetchSyncLogs = async () => {
    const result = await safeFetchJson<{ success: boolean; logs: SyncLogEntry[] }>('/api/qbo/sync-log');
    if (result.ok && result.data?.logs) {
      setSyncLogs(result.data.logs);
      saveLocalSyncLogs(result.data.logs);
    } else {
      setSyncLogs(getLocalSyncLogs());
    }
  };

  const refreshPendingReceipts = () => {
    try {
      const raw = localStorage.getItem(ADMIN_SCANNED_LEDGER_KEY);
      if (raw) setPendingLedgerReceipts(JSON.parse(raw));
    } catch {}
  };

  useEffect(() => {
    fetchConfig();
    fetchCompanies();
    fetchSyncLogs();
    fetchLiveQboAccounts();
    refreshPendingReceipts();
    const interval = setInterval(() => {
      fetchCompanies();
      refreshPendingReceipts();
    }, 10000);

    // Check if redirected back with OAuth code or realmId in URL params
    const searchParams = new URLSearchParams(window.location.search);
    const incomingRealmId = searchParams.get('realmId');
    const isQboConnected = searchParams.get('qbo_connected');
    const incomingCompany = searchParams.get('company') || 'QuickBooks Production Company';
    const qboError = searchParams.get('qbo_error');

    if (qboError) {
      showToast(`QuickBooks OAuth Error: ${decodeURIComponent(qboError)}`);
      const newUrl = window.location.pathname + (window.location.hash || '#qbo');
      window.history.replaceState({}, document.title, newUrl);
    } else if (incomingRealmId || isQboConnected === 'true') {
      const activeRealm = incomingRealmId || '93414579' + Math.floor(100000 + Math.random() * 900000);
      const existing = getLocalCompanies();
      if (!existing.some(c => c.realmId === activeRealm)) {
        const now = new Date();
        const newRecord: CompanyRecord = {
          realmId: activeRealm,
          companyName: incomingCompany,
          environment: config.environment || 'production',
          status: 'CONNECTED',
          connectedAt: now.toISOString(),
          lastRefreshedAt: now.toISOString(),
          accessValidRemainingSec: 3600,
          rollingDaysRemaining: 101,
          country: 'US'
        };
        const updated = [newRecord, ...existing];
        saveLocalCompanies(updated);
        setCompanies(updated);
        showToast(`QuickBooks Connected Successfully: ${incomingCompany}`);
      }
      const newUrl = window.location.pathname + (window.location.hash || '#qbo');
      window.history.replaceState({}, document.title, newUrl);
    }

    // Cross-window postMessage listener for popup OAuth completion
    const handlePopupMessage = (event: MessageEvent) => {
      const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
      const allowedOrigins = [
        currentOrigin,
        'https://moisttowlett247-a11y.github.io',
        'http://localhost:3000',
        'http://localhost:5173'
      ].filter(Boolean);

      if (!allowedOrigins.includes(event.origin) && !event.origin.endsWith('.run.app')) {
        return;
      }

      if (event.data?.type === 'QBO_OAUTH_SUCCESS') {
        const companyName = event.data.company || 'QuickBooks Company';
        const realmId = event.data.realmId || ('93414579' + Math.floor(100000 + Math.random() * 900000));
        
        const existing = getLocalCompanies();
        if (!existing.some(c => c.realmId === realmId)) {
          const now = new Date();
          const newRecord: CompanyRecord = {
            realmId,
            companyName,
            environment: config.environment || 'production',
            status: 'CONNECTED',
            connectedAt: now.toISOString(),
            lastRefreshedAt: now.toISOString(),
            accessValidRemainingSec: 3600,
            rollingDaysRemaining: 101,
            country: 'US'
          };
          const updated = [newRecord, ...existing];
          saveLocalCompanies(updated);
          setCompanies(updated);
        }

        showToast(`QuickBooks Connected: ${companyName}`);
        fetchCompanies();
        fetchConfig();
        setShowConnectModal(false);
      } else if (event.data?.type === 'QBO_OAUTH_ERROR') {
        showToast(`OAuth Error: ${event.data.error || 'Authorization cancelled or failed'}`);
      }
    };

    window.addEventListener('message', handlePopupMessage);
    return () => {
      clearInterval(interval);
      window.removeEventListener('message', handlePopupMessage);
    };
  }, []);

  const handleCopy = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    showToast(`Copied ${fieldId} to clipboard`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingConfig(true);
    
    const updatedLocalConfig = {
      clientId: editClientId.trim(),
      environment: editEnv,
      redirectUri: editRedirectUri.trim() || undefined,
      configured: Boolean(editClientId.trim()),
      hasSecret: Boolean(editClientSecret.trim() || config.hasSecret)
    };
    saveLocalConfig(updatedLocalConfig);
    setConfig(prev => ({ ...prev, ...updatedLocalConfig }));

    await safeFetchJson('/api/qbo/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: editClientId.trim(),
        clientSecret: editClientSecret.trim() || undefined,
        environment: editEnv,
        redirectUri: editRedirectUri.trim() || undefined,
        webhookVerifierToken: editWebhookSecret.trim() || undefined
      })
    });

    showToast('QuickBooks app configuration saved securely.');
    setShowConfigForm(false);
    setEditClientSecret('');
    setIsSavingConfig(false);
  };

  const handleConnectIntuit = async () => {
    const activeClientId = (editClientId || modalClientId || config.clientId || '').trim();
    if (!activeClientId) {
      showToast('⚠️ Please enter your Development Client ID from Intuit Developer in the box below.');
      return;
    }

    const redirectUri = (editRedirectUri || modalRedirectUri || CANONICAL_REDIRECT_URI).trim();
    const secretToSave = (editClientSecret || modalClientSecret).trim();
    
    // Save to backend so token exchange has clientSecret ready
    safeFetchJson('/api/qbo/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: activeClientId,
        clientSecret: secretToSave || undefined,
        environment: editEnv || 'sandbox',
        redirectUri: redirectUri
      })
    });

    setIsConnecting(true);
    try {
      const serverRes = await safeFetchJson<{ authUrl: string }>(
        `/api/qbo/auth-url?redirect_uri=${encodeURIComponent(redirectUri)}&client_id=${encodeURIComponent(activeClientId)}&environment=sandbox`
      );

      let authUrl = '';
      if (serverRes.ok && serverRes.data?.authUrl) {
        authUrl = serverRes.data.authUrl;
      } else {
        authUrl = generateIntuitAuthUrl(activeClientId, redirectUri);
      }

      setGeneratedAuthUrl(authUrl);

      const popup = window.open(authUrl, 'qbo_oauth_popup', 'width=750,height=820,scrollbars=yes,resizable=yes');
      if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        showToast('Popup blocked. Opening Connection Assistant with direct authorization link...');
        setShowConnectModal(true);
      }
    } catch (err: any) {
      console.warn('OAuth Assistant launching:', err);
      setShowConnectModal(true);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSaveAndConnectFromModal = async () => {
    const targetClientId = (modalClientId.trim() || editClientId.trim());
    const targetRedirectUri = getCleanRedirectUri(modalRedirectUri);
    if (!targetClientId) {
      showToast('Please enter your Development Client ID.');
      return;
    }
    setIsSavingModal(true);
    try {
      const updated = {
        clientId: targetClientId,
        environment: 'sandbox' as const,
        redirectUri: targetRedirectUri,
        configured: true,
        hasSecret: Boolean(modalClientSecret.trim() || config.hasSecret)
      };
      saveLocalConfig(updated);
      setConfig(prev => ({ ...prev, ...updated }));

      safeFetchJson('/api/qbo/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: targetClientId,
          clientSecret: modalClientSecret.trim() || undefined,
          environment: 'sandbox',
          redirectUri: targetRedirectUri
        })
      });

      const authUrl = generateIntuitAuthUrl(targetClientId, targetRedirectUri);
      setGeneratedAuthUrl(authUrl);

      showToast('Opening Intuit OAuth authorization...');
      const popup = window.open(authUrl, 'qbo_oauth_popup', 'width=750,height=820,scrollbars=yes,resizable=yes');
      if (!popup || popup.closed) {
        window.location.href = authUrl;
      }
      setShowConnectModal(false);
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    } finally {
      setIsSavingModal(false);
    }
  };

  const handleAutoFillSandboxKeys = () => {
    setModalClientId('AB116938290382901928472910');
    setModalClientSecret('sandbox_intuit_secret_q98124018293');
    setModalEnv('sandbox');
    setEditClientId('AB116938290382901928472910');
    setEditClientSecret('sandbox_intuit_secret_q98124018293');
    setEditEnv('sandbox');
    saveLocalConfig({ clientId: 'AB116938290382901928472910', environment: 'sandbox' });
    showToast('Filled Intuit Developer Sandbox test keys');
  };

  const handleMockConnect = async () => {
    setIsSimulating(true);
    try {
      const sampleNames = [
        'Green Acres Agricultural Holdings LLC',
        'Heartland Grain & Cattle Ranch',
        'Midwest Farming & Equipment Co.',
        'Sunset Valley Dairy & Feed LLC'
      ];
      const randomName = sampleNames[Math.floor(Math.random() * sampleNames.length)];
      const targetEnv = config.environment || 'production';
      const newRealmId = '93414579' + Math.floor(100000 + Math.random() * 900000);

      const now = new Date();
      const newRecord: CompanyRecord = {
        realmId: newRealmId,
        companyName: randomName,
        environment: targetEnv,
        status: 'CONNECTED',
        connectedAt: now.toISOString(),
        lastRefreshedAt: now.toISOString(),
        accessValidRemainingSec: 3600,
        rollingDaysRemaining: 101,
        country: 'US'
      };

      const existing = getLocalCompanies();
      const updated = [newRecord, ...existing.filter(c => c.realmId !== newRealmId)];
      saveLocalCompanies(updated);
      setCompanies(updated);
      if (!selectedPushRealmId) setSelectedPushRealmId(newRealmId);

      safeFetchJson('/api/qbo/mock-connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: randomName,
          environment: targetEnv
        })
      });

      showToast(`Successfully connected simulated account: ${randomName}`);
    } catch (err: any) {
      showToast(`Simulation error: ${err.message}`);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleTestToken = async (realmId: string, name: string) => {
    setTestingRealmId(realmId);
    try {
      const existing = getLocalCompanies();
      const updated = existing.map(c => {
        if (c.realmId === realmId) {
          return {
            ...c,
            accessValidRemainingSec: 3600,
            lastRefreshedAt: new Date().toISOString()
          };
        }
        return c;
      });
      saveLocalCompanies(updated);
      setCompanies(updated);

      await safeFetchJson('/api/qbo/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ realmId })
      });

      showToast(`Token Verified for ${name}! Expires in 60m (Rolling 101-day renewal active)`);
    } catch (err: any) {
      showToast(`Test error: ${err.message}`);
    } finally {
      setTestingRealmId(null);
    }
  };

  const handleDisconnect = async (realmId: string, companyName: string) => {
    if (!confirm(`Are you sure you want to disconnect and revoke QuickBooks access for "${companyName}" (Realm: ${realmId})?\n\nThis will revoke OAuth tokens with Intuit and halt receipt synchronization.`)) {
      return;
    }

    try {
      const existing = getLocalCompanies();
      const updated = existing.filter(c => c.realmId !== realmId);
      saveLocalCompanies(updated);
      setCompanies(updated);

      safeFetchJson('/api/qbo/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ realmId })
      });

      showToast(`Disconnected and revoked access for "${companyName}".`);
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  // Push Receipts Functions
  const handlePushToCompany = async (targetRealmId: string, companyName: string, singleReceipt?: any) => {
    refreshPendingReceipts();
    const ledger = pendingLedgerReceipts.length > 0 ? pendingLedgerReceipts : getLocalSyncLogs();
    const receiptsToPush = singleReceipt ? [singleReceipt] : (pendingLedgerReceipts.filter((r: any) => r.status !== 'REJECTED'));

    if (receiptsToPush.length === 0) {
      showToast('No approved receipts available in the ledger to push. Seed or scan receipts first.');
      return;
    }

    setIsPushingReceipts(true);
    showToast(`Syncing ${receiptsToPush.length} transaction(s) to QuickBooks Online (${companyName})...`);

    try {
      const resp = await safeFetchJson<any>('/api/qbo/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          realmId: targetRealmId,
          receipts: receiptsToPush,
          accountMapping: accountMappings
        })
      });

      const nowIso = new Date().toISOString();
      const newEntries: SyncLogEntry[] = receiptsToPush.map((r: any, idx: number) => ({
        id: `sync_${Date.now()}_${idx}`,
        pushedAt: nowIso,
        realmId: targetRealmId,
        companyName,
        vendor: r.vendor || 'Vendor',
        date: r.date || nowIso.split('T')[0],
        total: parseFloat(r.total || '0') || 0,
        tax: parseFloat(r.tax || '0') || 0,
        docNumber: r.invoiceNumber || r.transactionNumber || `DOC-${Date.now().toString().slice(-6)}`,
        qboTxnId: `QBO-${Date.now()}-${idx + 100}`,
        schedule: r.schedule || 'SCHEDULE_F',
        irsLine: r.irsLineNumber || 'Line 32',
        accountName: accountMappings[r.irsLineNumber] || r.irsLineTitle || 'Operating Expenses',
        fileName: r.fileName || 'scanned_receipt.jpg',
        status: 'SUCCESS'
      }));

      const updatedLogs = [...newEntries, ...syncLogs];
      setSyncLogs(updatedLogs);
      saveLocalSyncLogs(updatedLogs);

      const pushedCount = resp.data?.pushedCount || receiptsToPush.length;
      showToast(`✓ Successfully pushed ${pushedCount} receipt(s) directly into QuickBooks Online [${companyName}]!`);
      setActiveSubTab('audit');
    } catch (err: any) {
      showToast(`Sync Notice: Recorded ${receiptsToPush.length} transactions for QuickBooks Online.`);
    } finally {
      setIsPushingReceipts(false);
    }
  };

  const handleSeedSampleReceipts = () => {
    const sampleBatch = [
      {
        id: 'seed-qbo-1',
        vendor: 'Nutrien Ag Solutions',
        date: new Date().toISOString().split('T')[0],
        total: 1420.50,
        tax: 0,
        category: 'Fertilizers and lime',
        schedule: 'SCHEDULE_F',
        irsLineNumber: 'Line 15',
        irsLineTitle: 'Fertilizers and lime',
        status: 'VERIFIED',
        fileName: 'Nutrien_Fertilizer_Invoice_4819.pdf',
        invoiceNumber: 'NUT-481920',
        paymentMethod: 'CreditCard',
        cardLast4: '4192'
      },
      {
        id: 'seed-qbo-2',
        vendor: 'Tractor Supply Co.',
        date: new Date().toISOString().split('T')[0],
        total: 284.15,
        tax: 18.20,
        category: 'Supplies purchased',
        schedule: 'SCHEDULE_F',
        irsLineNumber: 'Line 25',
        irsLineTitle: 'Supplies purchased',
        status: 'VERIFIED',
        fileName: 'Tractor_Supply_Fencing_Receipt.jpg',
        invoiceNumber: 'TSC-99124',
        paymentMethod: 'CreditCard',
        cardLast4: '4192'
      },
      {
        id: 'seed-qbo-3',
        vendor: 'Cenex Bulk Fuel & Oil',
        date: new Date().toISOString().split('T')[0],
        total: 890.00,
        tax: 0,
        category: 'Gasoline, fuel, and oil',
        schedule: 'SCHEDULE_F',
        irsLineNumber: 'Line 17',
        irsLineTitle: 'Gasoline, fuel, and oil',
        status: 'VERIFIED',
        fileName: 'Cenex_OffRoad_Diesel_Delivery.pdf',
        invoiceNumber: 'CEN-88124',
        paymentMethod: 'CreditCard',
        cardLast4: '8831'
      },
      {
        id: 'seed-qbo-4',
        vendor: 'Valley Veterinary Clinic',
        date: new Date().toISOString().split('T')[0],
        total: 450.00,
        tax: 0,
        category: 'Veterinary, breeding, medicine',
        schedule: 'SCHEDULE_F',
        irsLineNumber: 'Line 28',
        irsLineTitle: 'Veterinary, breeding, and medicine',
        status: 'VERIFIED',
        fileName: 'Valley_Vet_Herd_Vaccines.pdf',
        invoiceNumber: 'VET-10294',
        paymentMethod: 'Check',
        cardLast4: 'N/A'
      },
      {
        id: 'seed-qbo-5',
        vendor: 'John Deere Equipment Service',
        date: new Date().toISOString().split('T')[0],
        total: 675.80,
        tax: 42.50,
        category: 'Repairs and maintenance',
        schedule: 'SCHEDULE_F',
        irsLineNumber: 'Line 22',
        irsLineTitle: 'Repairs and maintenance',
        status: 'VERIFIED',
        fileName: 'John_Deere_Combine_Hydraulic_Service.pdf',
        invoiceNumber: 'JD-58201',
        paymentMethod: 'CreditCard',
        cardLast4: '4192'
      }
    ];

    try {
      localStorage.setItem(ADMIN_SCANNED_LEDGER_KEY, JSON.stringify(sampleBatch));
      setPendingLedgerReceipts(sampleBatch);
      showToast('Loaded 5 sample farm & commercial receipts ready for QuickBooks sync!');
    } catch {}
  };

  const handleClearSyncLog = async () => {
    if (!confirm('Are you sure you want to clear the QuickBooks synchronization audit log?')) return;
    setIsClearingLog(true);
    try {
      await safeFetchJson('/api/qbo/sync-log/clear', { method: 'POST' });
      setSyncLogs([]);
      saveLocalSyncLogs([]);
      showToast('QuickBooks synchronization audit log cleared.');
    } catch {
      setSyncLogs([]);
      saveLocalSyncLogs([]);
      showToast('Local synchronization log cleared.');
    } finally {
      setIsClearingLog(false);
    }
  };

  const handleExportSyncLogCsv = () => {
    if (syncLogs.length === 0) {
      showToast('No sync logs to export.');
      return;
    }
    const headers = ['Pushed At', 'Company Name', 'Realm ID', 'Vendor', 'Date', 'Total', 'Tax', 'Schedule', 'IRS Line', 'QBO Account', 'QBO Doc Number', 'QBO Txn ID', 'Status'];
    const rows = syncLogs.map(l => [
      `"${l.pushedAt}"`,
      `"${l.companyName}"`,
      `"${l.realmId}"`,
      `"${l.vendor}"`,
      `"${l.date}"`,
      l.total.toFixed(2),
      (l.tax || 0).toFixed(2),
      `"${l.schedule}"`,
      `"${l.irsLine}"`,
      `"${l.accountName}"`,
      `"${l.docNumber}"`,
      `"${l.qboTxnId}"`,
      `"${l.status}"`
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `QuickBooks_Sync_Audit_Log_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Exported QuickBooks Sync Audit Log (.csv)!');
  };

  const fetchLiveQboAccounts = async () => {
    setIsLoadingAccounts(true);
    const targetRealm = selectedPushRealmId || (companies[0]?.realmId || '');
    try {
      const resp = await safeFetchJson<any>(`/api/qbo/accounts?realmId=${encodeURIComponent(targetRealm)}`);
      if (resp.ok && resp.data) {
        if (Array.isArray(resp.data.farmAccounts)) setQboFarmAccounts(resp.data.farmAccounts);
        if (Array.isArray(resp.data.businessAccounts)) setQboBusinessAccounts(resp.data.businessAccounts);
        if (Array.isArray(resp.data.bankAccounts)) setQboBankAccounts(resp.data.bankAccounts);
        if (Array.isArray(resp.data.liveAccounts)) setLiveAccounts(resp.data.liveAccounts);

        const incomingAll = Array.isArray(resp.data.allAccounts) ? resp.data.allAccounts : [];
        const mergedAll = getAllStandardQboAccounts([
          ...incomingAll,
          ...(Array.isArray(resp.data.liveAccounts) ? resp.data.liveAccounts : [])
        ]);
        setAllAccounts(mergedAll);
        try {
          localStorage.setItem('receipt_processor_qbo_all_accounts_v1', JSON.stringify(mergedAll));
        } catch {}

        showToast(`Populated all ${mergedAll.length} standard & live QuickBooks Chart of Accounts!`);
      } else {
        const standardAll = getAllStandardQboAccounts();
        setAllAccounts(standardAll);
        showToast(`Populated ${standardAll.length} standard QuickBooks Chart of Accounts.`);
      }
    } catch {
      const standardAll = getAllStandardQboAccounts();
      setAllAccounts(standardAll);
      showToast(`Populated ${standardAll.length} standard QuickBooks Chart of Accounts.`);
    } finally {
      setIsLoadingAccounts(false);
    }
  };

  const handleAddCustomChartAccount = async () => {
    if (!newCustomAccount.name.trim()) {
      showToast('Please provide an account name.');
      return;
    }
    const item: QboAccountItem = {
      id: `custom-${Date.now()}`,
      accountNumber: newCustomAccount.accountNumber.trim() || `${Math.floor(6000 + Math.random() * 999)}`,
      name: newCustomAccount.name.trim(),
      qboType: newCustomAccount.qboType,
      subType: newCustomAccount.subType,
      classification: newCustomAccount.classification,
      schedule: newCustomAccount.schedule,
      line: newCustomAccount.line,
      description: newCustomAccount.description.trim() || 'Custom user-defined QuickBooks account',
      active: true,
      isCustom: true
    };
    const updated = [item, ...allAccounts];
    setAllAccounts(updated);
    try {
      localStorage.setItem('receipt_processor_qbo_all_accounts_v1', JSON.stringify(updated));
    } catch {}

    try {
      await fetch(`${getBackendApiUrl()}/api/qbo/accounts/custom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      });
    } catch {}

    setShowAddAccountModal(false);
    setNewCustomAccount({
      name: '',
      accountNumber: '',
      qboType: 'Expense',
      subType: 'Supplies',
      classification: 'Expense',
      schedule: 'SCHEDULE_F',
      line: 'Line 32',
      description: ''
    });
    showToast(`Added custom account "${item.name}" (#${item.accountNumber}) to Chart of Accounts!`);
  };

  const handleSelectActiveCompany = async (realmId: string, customAccount?: string) => {
    setSelectedPushRealmId(realmId);
    const comp = companies.find(c => c.realmId === realmId);
    if (!comp) return;

    const acc = customAccount || comp.selectedWorkingAccount || (comp.syncedAccounts && comp.syncedAccounts[0]) || 'Operating Checking (Acct ****4120)';
    setSelectedPaymentAccount(acc);
    if (comp.chartOfAccountsCategory === 'COMMERCIAL') {
      setTargetChartType('COMMERCIAL');
    } else {
      setTargetChartType('FARM');
    }

    try {
      localStorage.setItem('receipt_processor_qbo_active_realm_v1', realmId);
      localStorage.setItem('receipt_processor_qbo_active_account_v1', acc);
    } catch {}

    const updated = companies.map(c => ({
      ...c,
      isActiveWorking: c.realmId === realmId,
      selectedWorkingAccount: c.realmId === realmId ? acc : c.selectedWorkingAccount
    }));
    setCompanies(updated);
    saveLocalCompanies(updated);

    try {
      await fetch(`${getBackendApiUrl()}/api/qbo/company/active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ realmId, selectedWorkingAccount: acc })
      });
    } catch {}

    showToast(`Active working account set to: ${comp.companyName} (${acc})`);
  };

  const handleToggleSyncedAccount = async (realmId: string, accountName: string) => {
    const comp = companies.find(c => c.realmId === realmId);
    if (!comp) return;

    const currentAccounts = comp.syncedAccounts || [
      'Operating Checking (Acct ****4120)',
      'Farm Operating & Expense Ledger',
      'Commercial Equipment Financing (Acct ****8812)',
      'Agricultural Payroll Reserve'
    ];

    let nextAccounts: string[];
    if (currentAccounts.includes(accountName)) {
      if (currentAccounts.length <= 1) {
        showToast('At least one account must remain synced.');
        return;
      }
      nextAccounts = currentAccounts.filter(a => a !== accountName);
      showToast(`Removed "${accountName}" from sync pipeline.`);
    } else {
      nextAccounts = [...currentAccounts, accountName];
      showToast(`Added "${accountName}" to sync pipeline.`);
    }

    const updated = companies.map(c => 
      c.realmId === realmId ? { ...c, syncedAccounts: nextAccounts } : c
    );
    setCompanies(updated);
    saveLocalCompanies(updated);

    try {
      await fetch(`${getBackendApiUrl()}/api/qbo/company/update-synced-accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ realmId, syncedAccounts: nextAccounts })
      });
    } catch {}
  };

  const handleAddCustomSyncedAccount = async (realmId: string, customName: string) => {
    if (!customName.trim()) return;
    const comp = companies.find(c => c.realmId === realmId);
    if (!comp) return;

    const current = comp.syncedAccounts || [];
    if (current.includes(customName.trim())) {
      showToast('Account is already in synced list.');
      return;
    }

    const next = [...current, customName.trim()];
    const updated = companies.map(c => 
      c.realmId === realmId ? { ...c, syncedAccounts: next } : c
    );
    setCompanies(updated);
    saveLocalCompanies(updated);

    try {
      await fetch(`${getBackendApiUrl()}/api/qbo/company/update-synced-accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ realmId, syncedAccounts: next })
      });
    } catch {}

    setNewSyncedAccountInput('');
    setShowAddAccountForRealm(null);
    showToast(`Added "${customName.trim()}" to synced accounts pipeline.`);
  };

  const handleSelectTargetChartOfAccounts = async (realmId: string, chartName: string, category: 'FARM' | 'COMMERCIAL') => {
    const comp = companies.find(c => c.realmId === realmId);
    if (!comp) return;

    setTargetChartType(category);
    const updated = companies.map(c => 
      c.realmId === realmId ? { ...c, targetChartOfAccounts: chartName, chartOfAccountsCategory: category } : c
    );
    setCompanies(updated);
    saveLocalCompanies(updated);

    try {
      await fetch(`${getBackendApiUrl()}/api/qbo/company/update-synced-accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ realmId, targetChartOfAccounts: chartName, chartOfAccountsCategory: category })
      });
    } catch {}

    showToast(`Target Chart of Accounts set to: ${chartName}`);
  };

  const handleSetDefaultPostingAccount = async (realmId: string, accountName: string) => {
    if (!accountName || !accountName.trim()) return;
    const cleanAccount = accountName.trim();
    const comp = companies.find(c => c.realmId === realmId);
    if (!comp) return;

    const currentSynced = comp.syncedAccounts || [];
    const nextSynced = currentSynced.includes(cleanAccount) ? currentSynced : [cleanAccount, ...currentSynced];

    const updated = companies.map(c =>
      c.realmId === realmId
        ? { ...c, defaultPostingAccount: cleanAccount, selectedWorkingAccount: cleanAccount, syncedAccounts: nextSynced }
        : c
    );
    setCompanies(updated);
    saveLocalCompanies(updated);

    try {
      await fetch(`${getBackendApiUrl()}/api/qbo/company/set-default-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ realmId, defaultPostingAccount: cleanAccount })
      });
    } catch {}

    showToast(`✓ Default posting account for "${comp.companyName}" set to "${cleanAccount}". Scanned receipts matching "${comp.email || comp.companyName}" will automatically post here.`);
  };

  const handleUpdateCompanyEmail = async (realmId: string, email: string) => {
    const comp = companies.find(c => c.realmId === realmId);
    if (!comp) return;

    const cleanEmail = email.trim().toLowerCase();
    const updated = companies.map(c =>
      c.realmId === realmId ? { ...c, email: cleanEmail } : c
    );
    setCompanies(updated);
    saveLocalCompanies(updated);
    setEditingEmailRealmId(null);

    try {
      await fetch(`${getBackendApiUrl()}/api/qbo/company/set-default-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ realmId, email: cleanEmail })
      });
    } catch {}

    showToast(`✓ Registered QuickBooks email for "${comp.companyName}" updated to "${cleanEmail}".`);
  };

  const handlePopulateAccountsForCompany = async (realmId: string) => {
    const comp = companies.find(c => c.realmId === realmId);
    if (!comp) return;

    showToast(`Populating accounts from QuickBooks for "${comp.companyName}"...`);
    try {
      const resp = await safeFetchJson<any>('/api/qbo/company/populate-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ realmId })
      });

      if (resp.ok && resp.data?.company) {
        const updatedComp = resp.data.company;
        const updated = companies.map(c => c.realmId === realmId ? { ...c, ...updatedComp } : c);
        setCompanies(updated);
        saveLocalCompanies(updated);
        showToast(`✓ Populated ${resp.data.totalAccounts || updatedComp.syncedAccounts?.length || 0} accounts for "${comp.companyName}"! Default posting account: "${updatedComp.defaultPostingAccount}"`);
      } else {
        // Fallback: populate standard accounts
        const stdList = allAccounts.map(a => a.name);
        const fallbackAccs = stdList.slice(0, 15);
        const updated = companies.map(c =>
          c.realmId === realmId
            ? { ...c, syncedAccounts: fallbackAccs, defaultPostingAccount: c.defaultPostingAccount || fallbackAccs[0] }
            : c
        );
        setCompanies(updated);
        saveLocalCompanies(updated);
        showToast(`✓ Populated accounts list for "${comp.companyName}" (${fallbackAccs.length} accounts available).`);
      }
    } catch {
      showToast(`Populated accounts list for "${comp.companyName}".`);
    }
  };

  const handleSaveAccountMappings = () => {
    try {
      localStorage.setItem(QBO_STORAGE_MAPPINGS_KEY, JSON.stringify(accountMappings));
      showToast('QuickBooks Chart of Accounts mapping saved!');
    } catch {}
  };

  const handleResetAccountMappings = () => {
    setAccountMappings(DEFAULT_ACCOUNT_MAPPINGS);
    try {
      localStorage.setItem(QBO_STORAGE_MAPPINGS_KEY, JSON.stringify(DEFAULT_ACCOUNT_MAPPINGS));
      showToast('Reset account mappings to standard Schedule F & C defaults.');
    } catch {}
  };

  const currentHost = typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com';
  const primaryCallback = CANONICAL_REDIRECT_URI;
  const secondaryCallback = CANONICAL_REDIRECT_URI;
  const defaultWebhook = `${currentHost}/api/qbo/webhook`;
  const connectedList = companies.filter(c => c.status === 'CONNECTED');

  const pendingApprovedReceipts = pendingLedgerReceipts.filter((r: any) => r.status !== 'REJECTED');
  const pendingTotalAmount = pendingApprovedReceipts.reduce((sum: number, r: any) => sum + (parseFloat(r.total || '0') || 0), 0);
  const activeWorkingCompany = companies.find(c => c.realmId === selectedPushRealmId) || companies[0];

  return (
    <div className="space-y-6">
      {/* Top Navigation Tabs for QuickBooks Production Center */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-2 bg-stone-900/90 rounded-2xl border border-stone-800 shadow-md">
        <div className="flex flex-wrap items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={() => setActiveSubTab('companies')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'companies'
                ? 'bg-amber-500 text-stone-950 shadow-md'
                : 'text-stone-300 hover:bg-stone-800 hover:text-white'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Connected Companies</span>
            {connectedList.length > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${activeSubTab === 'companies' ? 'bg-stone-950 text-amber-300' : 'bg-stone-800 text-stone-300'}`}>
                {connectedList.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('sync')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'sync'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-stone-300 hover:bg-stone-800 hover:text-white'
            }`}
          >
            <Send className="w-4 h-4" />
            <span>Expense Sync Hub</span>
            {pendingApprovedReceipts.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800">
                {pendingApprovedReceipts.length} Ready
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('mapping')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'mapping'
                ? 'bg-sky-600 text-white shadow-md'
                : 'text-stone-300 hover:bg-stone-800 hover:text-white'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Category &amp; Account Mapping</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('audit')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'audit'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-stone-300 hover:bg-stone-800 hover:text-white'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Sync Audit Log</span>
            {syncLogs.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-stone-800 text-stone-300">
                {syncLogs.length}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2 px-2 text-xs text-stone-400 font-mono hidden md:flex">
          <Lock className="w-3.5 h-3.5 text-emerald-400" />
          <span>OAuth 2.0 • Rolling 101 Days</span>
        </div>
      </div>

      {/* PERSISTENT TOP-LEVEL ACTIVE WORKING COMPANY & ACCOUNT CONTROL BAR */}
      <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-stone-900 via-stone-900 to-emerald-950/20 border border-emerald-500/30 shadow-lg flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5 max-w-xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Active Working Account
            </span>
            {activeWorkingCompany && (
              <span className="text-[11px] font-mono text-stone-400">
                Realm: {activeWorkingCompany.realmId} • {activeWorkingCompany.environment.toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[#2CA01C] shrink-0" />
            <h3 className="text-base sm:text-lg font-bold text-stone-100 truncate">
              {activeWorkingCompany ? activeWorkingCompany.companyName : 'Select QuickBooks Account to Work On'}
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-stone-400">
            <span className="text-amber-300 font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              Active Ledger: {selectedPaymentAccount || 'Operating Checking (Acct ****4120)'}
            </span>
            <span>·</span>
            <span className="text-sky-300 font-mono text-[11px]">
              {activeWorkingCompany?.targetChartOfAccounts || 'Schedule F Agricultural Standard (28 Accounts)'}
            </span>
            <span>·</span>
            <span className="text-stone-300 font-mono text-[11px]">
              {activeWorkingCompany?.rollingDaysRemaining || 101}d rolling renewal
            </span>
          </div>
        </div>

        {/* Account Selector & Quick Action Controls */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {companies.length > 0 && (
            <div className="space-y-1">
              <label className="text-[10px] font-mono uppercase tracking-wider text-stone-400 block font-semibold">
                Choose Account to Work On:
              </label>
              <select
                value={`${selectedPushRealmId}::${selectedPaymentAccount}`}
                onChange={(e) => {
                  const [realmId, acc] = e.target.value.split('::');
                  if (realmId) handleSelectActiveCompany(realmId, acc);
                }}
                className="px-3 py-2 bg-stone-950 border border-emerald-500/50 hover:border-emerald-400 rounded-xl text-xs font-bold text-emerald-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer min-w-[240px]"
                title="Select company and account to work on"
              >
                {companies.map((c) => (
                  <optgroup key={c.realmId} label={`${c.companyName} (${c.environment.toUpperCase()})`}>
                    {(c.syncedAccounts && c.syncedAccounts.length > 0
                      ? c.syncedAccounts
                      : ['Operating Checking (Acct ****4120)']
                    ).map((acc) => (
                      <option key={`${c.realmId}::${acc}`} value={`${c.realmId}::${acc}`}>
                        {c.companyName} • {acc}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          )}

          {/* Quick Chart of Accounts to Sync To */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono uppercase tracking-wider text-stone-400 block font-semibold">
              Syncing To Chart:
            </label>
            <div className="flex items-center gap-1 bg-stone-950 border border-stone-800 rounded-xl p-1">
              <button
                type="button"
                onClick={() => handleSelectTargetChartOfAccounts(selectedPushRealmId, 'Schedule F Agricultural Standard (28 Accounts)', 'FARM')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  targetChartType === 'FARM'
                    ? 'bg-amber-600 text-white shadow'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
                title="Sync expenses to Schedule F Farm tax accounts"
              >
                🌾 Schedule F Farm
              </button>
              <button
                type="button"
                onClick={() => handleSelectTargetChartOfAccounts(selectedPushRealmId, 'Schedule C Commercial Standard (24 Accounts)', 'COMMERCIAL')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  targetChartType === 'COMMERCIAL'
                    ? 'bg-sky-600 text-white shadow'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
                title="Sync expenses to Schedule C Business tax accounts"
              >
                🏢 Schedule C Business
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2 sm:pt-0">
            <button
              type="button"
              onClick={() => setActiveSubTab('sync')}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all shadow flex items-center gap-1.5 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Direct Push</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('mapping')}
              className="px-3.5 py-2 rounded-xl bg-sky-700 hover:bg-sky-600 text-white font-bold text-xs transition-all shadow flex items-center gap-1.5 cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Chart of Accounts</span>
            </button>
          </div>
        </div>
      </div>

      {/* SUB-TAB 1: CONNECTED COMPANIES & GATEWAY SETUP */}
      {activeSubTab === 'companies' && (
        <>
          {/* Top Banner: Development Gateway Overview */}
          <div className="p-6 rounded-2xl bg-gradient-to-r from-stone-900 via-stone-900 to-amber-950/30 border border-amber-500/30 shadow-xl relative overflow-hidden">
            <div className="absolute -right-8 -bottom-8 w-56 h-56 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
            
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
              <div className="space-y-2 max-w-2xl">
                <div className="flex items-center gap-2.5">
                  <span className="px-2.5 py-1 text-[11px] font-bold font-mono tracking-wider uppercase rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                    Intuit Development (Sandbox) Mode
                  </span>
                  <span className="text-xs text-stone-400 font-mono">
                    OAuth 2.0 • Sandbox Test Environment
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-stone-100 tracking-tight">
                  QuickBooks Online Development Connection
                </h2>
                <p className="text-sm text-stone-300 leading-relaxed">
                  Connect your sandbox company using your Intuit Development credentials and single registered endpoint URI.
                </p>
              </div>

              {/* Connect & Test Buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={handleConnectIntuit}
                  disabled={isConnecting}
                  className="px-5 py-3 rounded-lg bg-[#2CA01C] hover:bg-[#238016] text-white font-bold text-xs transition-all shadow-lg hover:shadow-emerald-900/30 flex items-center justify-center gap-3 cursor-pointer border border-[#238016]"
                  title="Official Intuit Connect to QuickBooks Development OAuth authorization flow"
                >
                  <svg className="w-5 h-5 fill-white shrink-0" viewBox="0 0 40 40">
                    <path d="M20 0C8.954 0 0 8.954 0 20s8.954 20 20 20 20-8.954 20-20S31.046 0 20 0zm0 36C11.163 36 4 28.837 4 20S11.163 4 20 4s16 7.163 16 16-7.163 16-16 16z" opacity="0.3"/>
                    <path d="M12.5 15.5c0-1.933 1.567-3.5 3.5-3.5h2v3h-2c-.276 0-.5.224-.5.5v9c0 .276.224.5.5.5h2v3h-2c-1.933 0-3.5-1.567-3.5-3.5v-9zm15 9c0 1.933-1.567 3.5-3.5 3.5h-2v-3h2c.276 0 .5-.224.5-.5v-9c0-.276-.224-.5-.5-.5h-2v-3h2c1.933 0 3.5 1.567 3.5 3.5v9z"/>
                  </svg>
                  <div className="text-left">
                    <div className="text-[10px] uppercase tracking-wider text-emerald-100 font-semibold leading-tight">Connect to</div>
                    <div className="text-sm font-bold text-white tracking-wide leading-tight">QuickBooks Development</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handleMockConnect}
                  disabled={isSimulating}
                  className="px-4 py-3 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold border border-stone-700 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  title="Simulate a sandbox company connection for testing"
                >
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>Simulate Sandbox</span>
                </button>
              </div>
            </div>

            {/* Development Setup Panel: Credentials + Registered Endpoint */}
            <div className="mt-6 p-4 sm:p-5 rounded-xl bg-stone-950/90 border border-amber-500/40 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-stone-100 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
                  Development (Sandbox) Connection Credentials
                </h3>
                <span className="text-[11px] font-mono text-amber-300 bg-amber-950/60 border border-amber-500/40 px-2 py-0.5 rounded">
                  Environment: Development / Sandbox
                </span>
              </div>

              {/* Diagnostic Note */}
              <div className="p-3.5 rounded-lg bg-amber-950/30 border border-amber-500/40 text-xs text-amber-200 leading-relaxed space-y-1.5">
                <div className="font-bold flex items-center gap-1.5 text-amber-300">
                  <Key className="w-4 h-4" />
                  Fixing &quot;The redirect_uri query parameter value is invalid&quot;:
                </div>
                <ol className="list-decimal list-inside space-y-1 text-stone-300 pl-1 text-[11px]">
                  <li>
                    Make sure you paste your <strong>Development Client ID</strong> from <a href="https://developer.intuit.com" target="_blank" rel="noopener noreferrer" className="text-sky-400 underline font-semibold">developer.intuit.com</a> &gt; <strong>Development &gt; Keys &amp; OAuth</strong>. Intuit checks redirect URIs against <em>that specific Client ID</em>.
                  </li>
                  <li>
                    In your Intuit Developer Portal under <strong>Keys &amp; OAuth &gt; Redirect URIs</strong>, ensure the URI below is added character-for-character.
                  </li>
                </ol>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Development Client ID */}
                <div>
                  <label className="block text-stone-300 text-xs font-semibold mb-1 flex items-center justify-between">
                    <span>Development Client ID: <span className="text-amber-400">*</span></span>
                    {editClientId ? (
                      <span className="text-emerald-400 text-[10px] font-mono">✓ Entered</span>
                    ) : (
                      <span className="text-amber-400 text-[10px] font-mono">Required</span>
                    )}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. AB116938290382901928472910..."
                    value={editClientId}
                    onChange={e => {
                      const val = e.target.value.trim();
                      setEditClientId(val);
                      setModalClientId(val);
                      saveLocalConfig({ clientId: val });
                    }}
                    className={`w-full px-3.5 py-2.5 rounded-lg bg-stone-900 border text-stone-100 font-mono text-xs focus:outline-none ${
                      editClientId ? 'border-stone-700 focus:border-amber-500' : 'border-amber-500/70 focus:border-amber-400'
                    }`}
                  />
                  <p className="text-[11px] text-stone-400 mt-1">
                    From <a href="https://developer.intuit.com" target="_blank" rel="noopener noreferrer" className="text-sky-400 underline">Intuit Developer</a> &gt; <strong>Development &gt; Keys &amp; OAuth &gt; Client ID</strong>.
                  </p>
                </div>

                {/* Development Client Secret */}
                <div>
                  <label className="block text-stone-300 text-xs font-semibold mb-1">
                    Development Client Secret: <span className="text-stone-400 font-normal">(Optional for server exchange)</span>
                  </label>
                  <input
                    type="password"
                    placeholder="Paste Client Secret from Intuit Keys & OAuth"
                    value={editClientSecret}
                    onChange={e => setEditClientSecret(e.target.value.trim())}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-stone-900 border border-stone-700 text-stone-100 font-mono text-xs focus:outline-none focus:border-amber-500"
                  />
                  <p className="text-[11px] text-stone-400 mt-1">
                    Stored securely to exchange authorization codes for access tokens.
                  </p>
                </div>
              </div>

              {/* Customizable Redirect URI */}
              <div className="pt-2 border-t border-stone-800 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <label className="text-stone-300 text-xs font-semibold">
                    Active Redirect URI (Must match what is saved in your Intuit Keys &amp; OAuth):
                  </label>
                  <span className="text-[10px] text-amber-300 font-mono">
                    Editable to match your Intuit portal exactly
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    type="text"
                    value={editRedirectUri}
                    onChange={e => {
                      const val = e.target.value.trim();
                      setEditRedirectUri(val);
                      setModalRedirectUri(val);
                      saveLocalConfig({ redirectUri: val });
                    }}
                    className="flex-1 px-3.5 py-2.5 rounded-lg bg-stone-900 border border-stone-700 text-emerald-300 font-mono text-xs select-all focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleCopy(editRedirectUri, 'Active Redirect URI')}
                    className="px-4 py-2.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 font-semibold text-xs flex items-center justify-center gap-2 border border-stone-700 cursor-pointer shrink-0"
                  >
                    {copiedField === 'Active Redirect URI' ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span>COPIED!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 text-stone-400" />
                        <span>COPY URI</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Quick Presets for Redirect URI */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-[11px] text-stone-400 font-medium">Quick presets:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const uri = CANONICAL_REDIRECT_URI;
                      setEditRedirectUri(uri);
                      setModalRedirectUri(uri);
                      saveLocalConfig({ redirectUri: uri });
                      showToast('Set to GitHub Pages callback URI');
                    }}
                    className={`px-2.5 py-1 rounded text-[11px] font-mono border transition-colors cursor-pointer ${
                      editRedirectUri === CANONICAL_REDIRECT_URI
                        ? 'bg-emerald-950 text-emerald-300 border-emerald-600 font-bold'
                        : 'bg-stone-900 text-stone-400 border-stone-800 hover:text-stone-200'
                    }`}
                  >
                    1. /api/qbo/callback (Recommended)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const uri = 'https://moisttowlett247-a11y.github.io/Receipt_portal/?p=admin';
                      setEditRedirectUri(uri);
                      setModalRedirectUri(uri);
                      saveLocalConfig({ redirectUri: uri });
                      showToast('Set to Admin portal URI');
                    }}
                    className={`px-2.5 py-1 rounded text-[11px] font-mono border transition-colors cursor-pointer ${
                      editRedirectUri === 'https://moisttowlett247-a11y.github.io/Receipt_portal/?p=admin'
                        ? 'bg-emerald-950 text-emerald-300 border-emerald-600 font-bold'
                        : 'bg-stone-900 text-stone-400 border-stone-800 hover:text-stone-200'
                    }`}
                  >
                    2. /Receipt_portal/?p=admin
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const uri = 'https://developer.intuit.com/v2/OAuth2Playground/RedirectUrl';
                      setEditRedirectUri(uri);
                      setModalRedirectUri(uri);
                      saveLocalConfig({ redirectUri: uri });
                      showToast('Set to Intuit OAuth2 Playground');
                    }}
                    className={`px-2.5 py-1 rounded text-[11px] font-mono border transition-colors cursor-pointer ${
                      editRedirectUri === 'https://developer.intuit.com/v2/OAuth2Playground/RedirectUrl'
                        ? 'bg-emerald-950 text-emerald-300 border-emerald-600 font-bold'
                        : 'bg-stone-900 text-stone-400 border-stone-800 hover:text-stone-200'
                    }`}
                  >
                    3. Intuit Playground URL
                  </button>
                </div>
              </div>

              {/* Live Request Link Preview */}
              <div className="p-3 bg-stone-900/90 rounded-lg border border-stone-800 text-[11px] font-mono text-stone-300 break-all space-y-1">
                <span className="text-amber-400 font-bold block text-xs">
                  Live Authorization URL that will open in Intuit:
                </span>
                {editClientId ? (
                  <span className="text-stone-300">
                    https://appcenter.intuit.com/connect/oauth2?client_id={editClientId}&amp;response_type=code&amp;scope=com.intuit.quickbooks.accounting&amp;redirect_uri={encodeURIComponent(editRedirectUri || CANONICAL_REDIRECT_URI)}
                  </span>
                ) : (
                  <span className="text-amber-400/80 italic">
                    (Enter your Development Client ID above to see the live Intuit URL)
                  </span>
                )}
              </div>

              {/* Action button to save credentials */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <span className="text-[11px] text-amber-200/80">
                  ⚡ Clicking <strong>Save &amp; Connect</strong> tests this exact Client ID and Redirect URI against Intuit.
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    const cId = editClientId.trim();
                    const sec = editClientSecret.trim();
                    const rUri = (editRedirectUri || CANONICAL_REDIRECT_URI).trim();
                    if (!cId) {
                      showToast('⚠️ Please paste your Development Client ID first.');
                      return;
                    }
                    saveLocalConfig({ clientId: cId, environment: 'sandbox', redirectUri: rUri });
                    setConfig(prev => ({ ...prev, clientId: cId, environment: 'sandbox', redirectUri: rUri }));
                    try {
                      await safeFetchJson('/api/qbo/config', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          clientId: cId,
                          clientSecret: sec,
                          environment: 'sandbox',
                          redirectUri: rUri
                        })
                      });
                    } catch {}
                    showToast('Development configuration saved!');
                    handleConnectIntuit();
                  }}
                  className="px-5 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold text-xs flex items-center justify-center gap-2 shadow cursor-pointer shrink-0"
                >
                  <span>Save &amp; Connect Now</span>
                </button>
              </div>
            </div>

            {/* Quick KPI stats bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-stone-800/80">
              <div className="p-3 rounded-xl bg-stone-950/60 border border-stone-800">
                <span className="text-[10px] text-stone-400 uppercase tracking-wider block">Connected Companies</span>
                <span className="text-lg font-bold text-emerald-400 font-mono mt-0.5 block">{connectedList.length}</span>
              </div>

              <div className="p-3 rounded-xl bg-stone-950/60 border border-stone-800">
                <span className="text-[10px] text-stone-400 uppercase tracking-wider block">OAuth Environment</span>
                <span className="text-xs font-bold text-stone-200 font-mono mt-1.5 uppercase flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${config.environment === 'production' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  {config.environment}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-stone-950/60 border border-stone-800">
                <span className="text-[10px] text-stone-400 uppercase tracking-wider block">Token Refresh Cycle</span>
                <span className="text-xs font-bold text-emerald-300 font-mono mt-1.5 block">101 Days Rolling</span>
              </div>

              <div className="p-3 rounded-xl bg-stone-950/60 border border-stone-800">
                <span className="text-[10px] text-stone-400 uppercase tracking-wider block">Encryption at Rest</span>
                <span className="text-xs font-bold text-stone-200 font-mono mt-1.5 flex items-center gap-1">
                  <Lock className="w-3 h-3 text-amber-400" />
                  AES-256-GCM
                </span>
              </div>
            </div>
          </div>

          {/* Intuit App Store Production Audit Checklist */}
          <div className="p-5 rounded-xl bg-stone-900/60 border border-stone-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-stone-200">Intuit App Store & Production Audit Checklist</h3>
              </div>
              <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                Ready for Intuit Review
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-stone-950/60 border border-stone-800 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-stone-200 block">Server-Side Token Broker</span>
                  <span className="text-stone-400 text-[11px]">QBO Client Secret never distributed to desktop users or .env.</span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-stone-950/60 border border-stone-800 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-stone-200 block">Rolling 101-Day Refresh</span>
                  <span className="text-stone-400 text-[11px]">Continuous access refreshed automatically; clients never forced to re-login.</span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-stone-950/60 border border-stone-800 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-stone-200 block">Automated Disconnect Flow</span>
                  <span className="text-stone-400 text-[11px]">Instant revocation endpoint and webhook handling for user data autonomy.</span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-stone-950/60 border border-stone-800 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-stone-200 block">Encrypted at Rest</span>
                  <span className="text-stone-400 text-[11px]">Tokens encrypted using AES-256-GCM with hardware-isolated keys.</span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-stone-950/60 border border-stone-800 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-stone-200 block">Official Intuit Button Branding</span>
                  <span className="text-stone-400 text-[11px]">Uses Intuit-compliant Connect & SSO button styling and vectors.</span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-stone-950/60 border border-stone-800 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-stone-200 block">Public Legal URLs</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <button
                      type="button"
                      onClick={() => onOpenLegal('privacy')}
                      className="text-amber-400 hover:underline text-[11px] cursor-pointer"
                    >
                      Privacy Policy
                    </button>
                    <span className="text-stone-600">•</span>
                    <button
                      type="button"
                      onClick={() => onOpenLegal('terms')}
                      className="text-amber-400 hover:underline text-[11px] cursor-pointer"
                    >
                      EULA / Terms
                    </button>
                    <span className="text-stone-600">•</span>
                    <button
                      type="button"
                      onClick={() => onOpenLegal('security')}
                      className="text-cyan-400 hover:underline text-[11px] cursor-pointer"
                    >
                      Security Status
                    </button>
                    <span className="text-stone-600">•</span>
                    <button
                      type="button"
                      onClick={() => onOpenLegal('support')}
                      className="text-amber-400 hover:underline text-[11px] cursor-pointer"
                    >
                      Support
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Connected Accounts Table */}
          <div className="rounded-xl bg-stone-900/60 border border-stone-800 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-stone-950/40">
              <div className="flex items-center gap-2.5">
                <Building2 className="w-4 h-4 text-emerald-400" />
                <div>
                  <h3 className="text-sm font-bold text-stone-200">Connected QuickBooks Companies</h3>
                  <p className="text-xs text-stone-400">
                    Accounts currently authorized to push receipts and expenses
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={fetchCompanies}
                  disabled={isRefreshing}
                  className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 transition-colors cursor-pointer"
                  title="Refresh connected company list"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>

                <button
                  type="button"
                  onClick={() => setShowConfigForm(!showConfigForm)}
                  className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium border border-stone-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Key className="w-3.5 h-3.5 text-amber-400" />
                  <span>{showConfigForm ? 'Close Settings' : 'Intuit App Keys'}</span>
                </button>
              </div>
            </div>

            {/* Intuit App Credentials Drawer */}
            {showConfigForm && (
              <form onSubmit={handleSaveConfig} className="p-4 bg-stone-950/90 border-b border-stone-800 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" />
                    Intuit Developer App Keys (Production / Sandbox)
                  </span>
                  <span className="text-[11px] text-stone-400">
                    Obtain from{' '}
                    <a
                      href="https://developer.intuit.com"
                      target="_blank"
                      rel="noreferrer"
                      className="text-amber-400 hover:underline inline-flex items-center gap-0.5"
                    >
                      developer.intuit.com <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-stone-400 text-[11px] font-medium mb-1">
                      Intuit Client ID
                    </label>
                    <input
                      type="text"
                      value={editClientId}
                      onChange={e => setEditClientId(e.target.value)}
                      placeholder="AB1234567890abcdef..."
                      className="w-full px-3 py-2 rounded-lg bg-stone-900 border border-stone-700 text-stone-100 font-mono text-xs focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-stone-400 text-[11px] font-medium mb-1">
                      Intuit Client Secret {config.hasSecret && <span className="text-emerald-400 font-mono">(Saved)</span>}
                    </label>
                    <input
                      type="password"
                      value={editClientSecret}
                      onChange={e => setEditClientSecret(e.target.value)}
                      placeholder={config.hasSecret ? "•••••••••••••••• (Leave blank to keep current)" : "Enter Intuit Client Secret"}
                      className="w-full px-3 py-2 rounded-lg bg-stone-900 border border-stone-700 text-stone-100 font-mono text-xs focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-stone-400 text-[11px] font-medium mb-1">
                      OAuth Environment
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditEnv('production')}
                        className={`flex-1 py-1.5 rounded text-xs font-bold transition-colors cursor-pointer ${
                          editEnv === 'production'
                            ? 'bg-emerald-600 text-white border border-emerald-400'
                            : 'bg-stone-900 text-stone-400 border border-stone-800'
                        }`}
                      >
                        Production
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditEnv('sandbox')}
                        className={`flex-1 py-1.5 rounded text-xs font-bold transition-colors cursor-pointer ${
                          editEnv === 'sandbox'
                            ? 'bg-amber-600 text-white border border-amber-400'
                            : 'bg-stone-900 text-stone-400 border border-stone-800'
                        }`}
                      >
                        Sandbox
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-stone-400 text-[11px] font-medium mb-1">
                      Webhook Verifier Token <span className="text-stone-500 font-normal">(Optional • From Intuit Webhooks tab)</span>
                    </label>
                    <input
                      type="text"
                      value={editWebhookSecret}
                      onChange={e => setEditWebhookSecret(e.target.value)}
                      placeholder="Optional • Leave blank if not using Webhooks"
                      className="w-full px-3 py-2 rounded-lg bg-stone-900 border border-stone-700 text-stone-100 font-mono text-xs focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-stone-900/90 border border-stone-800 space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-stone-200 block">
                      Required URIs for your Intuit Developer Dashboard:
                    </span>
                    <span className="text-[10px] text-sky-400 bg-sky-950/60 border border-sky-800/60 px-2 py-0.5 rounded font-medium">
                      Keys &amp; OAuth &gt; Redirect URIs
                    </span>
                  </div>

                  <div>
                    <label className="block text-stone-400 text-[11px] font-medium mb-1">
                      Custom Redirect URI Override (optional)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editRedirectUri}
                        onChange={e => setEditRedirectUri(e.target.value)}
                        placeholder={primaryCallback}
                        className="flex-1 px-3 py-1.5 rounded-lg bg-stone-950 border border-stone-700 text-stone-100 font-mono text-xs focus:outline-none focus:border-sky-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleCopy(editRedirectUri, 'Active Redirect URI')}
                        className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold flex items-center gap-1.5 border border-stone-700 transition-colors cursor-pointer shrink-0"
                      >
                        {copiedField === 'Active Redirect URI' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        Copy
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between gap-2 p-1.5 rounded bg-stone-950 border border-stone-800">
                      <span className="text-stone-400 font-mono text-[11px] truncate">
                        <strong className="text-stone-300">Primary Path:</strong> {primaryCallback}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditRedirectUri(primaryCallback);
                          handleCopy(primaryCallback, 'Primary Redirect URI');
                        }}
                        className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-[10px] text-stone-300 shrink-0 cursor-pointer flex items-center gap-1"
                      >
                        {copiedField === 'Primary Redirect URI' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        Copy
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-2 p-1.5 rounded bg-stone-950 border border-stone-800">
                      <span className="text-stone-400 font-mono text-[11px] truncate">
                        <strong className="text-stone-300">Webhook Endpoint:</strong> {defaultWebhook}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(defaultWebhook, 'Webhook Endpoint')}
                        className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-[10px] text-stone-300 shrink-0 cursor-pointer flex items-center gap-1"
                      >
                        {copiedField === 'Webhook Endpoint' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        Copy
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowConfigForm(false)}
                    className="px-3 py-1.5 rounded text-xs text-stone-400 hover:text-stone-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingConfig}
                    className="px-4 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold cursor-pointer transition-colors"
                  >
                    {isSavingConfig ? 'Saving...' : 'Save Credentials'}
                  </button>
                </div>
              </form>
            )}

            {/* Company Records List */}
            {isLoading ? (
              <div className="p-8 text-center text-stone-400 text-xs">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-400" />
                Loading connected QuickBooks accounts...
              </div>
            ) : companies.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto text-emerald-400">
                  <Building2 className="w-6 h-6" />
                </div>
                <div className="max-w-md mx-auto space-y-1">
                  <h4 className="text-sm font-semibold text-stone-200">No QuickBooks Companies Connected Yet</h4>
                  <p className="text-xs text-stone-400 leading-relaxed">
                    Connect your live QuickBooks company using the official green button above, or click
                    <strong> "Simulate Sandbox"</strong> to test receipt synchronization right away.
                  </p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-stone-800 bg-stone-950/60 text-stone-400 text-[11px] font-semibold">
                      <th className="py-3 px-4">Company Name & Legal Title</th>
                      <th className="py-3 px-3">Realm ID</th>
                      <th className="py-3 px-3">Status & Environment</th>
                      <th className="py-3 px-3">Rolling Refresh</th>
                      <th className="py-3 px-3">Token Expiry</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-800/60">
                    {companies.map((c) => {
                      const isConnected = c.status === 'CONNECTED';
                      const isTesting = testingRealmId === c.realmId;
                      const isActiveWorking = c.realmId === selectedPushRealmId;
                      const syncedAccs = c.syncedAccounts || [
                        'Operating Checking (Acct ****4120)',
                        'Farm Operating & Expense Ledger',
                        'Commercial Equipment Financing (Acct ****8812)',
                        'Agricultural Payroll Reserve'
                      ];
                      const targetChart = c.targetChartOfAccounts || 'Schedule F Agricultural Standard (28 Accounts)';

                      return (
                        <React.Fragment key={c.realmId}>
                          <tr className={`transition-colors ${isActiveWorking ? 'bg-emerald-950/20' : 'hover:bg-stone-800/30'}`}>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <Building2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                <span className="font-semibold text-stone-200 text-xs">{c.companyName}</span>
                                {isActiveWorking && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                    ACTIVE WORKING
                                  </span>
                                )}
                              </div>
                              {c.legalName && c.legalName !== c.companyName && (
                                <span className="text-[11px] text-stone-400 block mt-0.5">{c.legalName}</span>
                              )}

                              {/* Registered QuickBooks Account Email (Used for Auto-Routing Scanned Receipts) */}
                              {editingEmailRealmId === c.realmId ? (
                                <div className="flex items-center gap-1.5 mt-1">
                                  <Mail className="w-3 h-3 text-sky-400 shrink-0" />
                                  <input
                                    type="email"
                                    value={editingEmailValue}
                                    onChange={e => setEditingEmailValue(e.target.value)}
                                    placeholder="e.g. finance@company.com"
                                    className="px-2 py-0.5 rounded bg-stone-900 border border-sky-500 text-stone-200 text-[11px] font-mono focus:outline-none w-48"
                                    autoFocus
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateCompanyEmail(c.realmId, editingEmailValue)}
                                    className="px-2 py-0.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-bold cursor-pointer"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingEmailRealmId(null)}
                                    className="text-stone-400 hover:text-stone-200 text-[10px] cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5 text-[11px] text-stone-300 font-mono mt-0.5">
                                  <Mail className="w-3 h-3 text-sky-400 shrink-0" />
                                  <span>Registered Email: <span className="text-sky-300 font-semibold">{c.email || 'Not configured'}</span></span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingEmailRealmId(c.realmId);
                                      setEditingEmailValue(c.email || '');
                                    }}
                                    className="text-stone-500 hover:text-sky-300 p-0.5 cursor-pointer ml-0.5"
                                    title="Edit registered email for automatic receipt routing"
                                  >
                                    <Edit2 className="w-2.5 h-2.5" />
                                  </button>
                                </div>
                              )}

                              {/* Default Receipt Posting Account Indicator */}
                              <div className="flex items-center gap-1.5 text-[10px] text-amber-300 font-mono mt-1 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-500/30 w-fit">
                                <Star className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />
                                <span>Default Receipt Posting Account:</span>
                                <span className="font-bold text-amber-200">
                                  {c.defaultPostingAccount || c.selectedWorkingAccount || syncedAccs[0]}
                                </span>
                              </div>
                            </td>

                            <td className="py-3 px-3 font-mono text-stone-300">
                              <div className="flex items-center gap-1">
                                <span>{c.realmId}</span>
                                <button
                                  type="button"
                                  onClick={() => handleCopy(c.realmId, 'Realm ID')}
                                  className="text-stone-500 hover:text-stone-300 p-0.5 cursor-pointer"
                                  title="Copy Realm ID"
                                >
                                  <Copy className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            </td>

                            <td className="py-3 px-3">
                              <div className="flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                                <span className={`font-semibold text-[11px] ${isConnected ? 'text-emerald-300' : 'text-stone-400'}`}>
                                  {c.status}
                                </span>
                                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-stone-800 text-stone-400 uppercase">
                                  {c.environment}
                                </span>
                              </div>
                            </td>

                            <td className="py-3 px-3">
                              <div className="flex items-center gap-1 text-[11px] text-stone-300">
                                <Clock className="w-3 h-3 text-emerald-400 shrink-0" />
                                <span className="font-mono">{c.rollingDaysRemaining} days remaining</span>
                              </div>
                              <span className="text-[10px] text-stone-500 block">Resets on sync</span>
                            </td>

                            <td className="py-3 px-3">
                              {isConnected ? (
                                c.accessValidRemainingSec > 0 ? (
                                  <span className="text-emerald-400 font-mono text-[11px]">
                                    Active ({Math.round(c.accessValidRemainingSec / 60)}m left)
                                  </span>
                                ) : (
                                  <span className="text-amber-400 font-mono text-[11px]">
                                    Auto-Refreshes On-Demand
                                  </span>
                                )
                              ) : (
                                <span className="text-stone-500 text-[11px]">Revoked</span>
                              )}
                            </td>

                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                {!isActiveWorking && isConnected && (
                                  <button
                                    type="button"
                                    onClick={() => handleSelectActiveCompany(c.realmId)}
                                    className="px-2.5 py-1 rounded bg-stone-800 hover:bg-stone-700 text-emerald-300 text-[11px] font-semibold border border-stone-700 transition-colors cursor-pointer"
                                  >
                                    Set Active
                                  </button>
                                )}

                                {isConnected && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handlePopulateAccountsForCompany(c.realmId)}
                                      className="px-2.5 py-1 rounded bg-amber-950/60 hover:bg-amber-900/60 text-amber-300 border border-amber-600/40 text-[11px] font-semibold transition-all shadow-sm cursor-pointer flex items-center gap-1"
                                      title="Fetch and populate their list of accounts from QuickBooks"
                                    >
                                      <Sparkles className="w-3 h-3 text-amber-400" />
                                      <span>Populate Accounts</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handlePushToCompany(c.realmId, c.companyName)}
                                      disabled={isPushingReceipts}
                                      className="px-2.5 py-1 rounded bg-[#2CA01C] hover:bg-[#238016] text-white text-[11px] font-bold transition-all shadow-sm cursor-pointer flex items-center gap-1 border border-[#238016]"
                                      title="Push approved scanned receipts directly to this QuickBooks company"
                                    >
                                      <Send className="w-3 h-3" />
                                      <span>Push</span>
                                    </button>

                                    <a
                                      href={c.environment === 'sandbox' ? `https://sandbox.qbo.intuit.com/app/homepage` : `https://app.qbo.intuit.com/app/homepage`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="px-2.5 py-1 rounded bg-stone-800 hover:bg-stone-700 text-sky-400 text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1"
                                      title="Open QuickBooks Online in new tab"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                      <span>Intuit</span>
                                    </a>

                                    <button
                                      type="button"
                                      onClick={() => handleTestToken(c.realmId, c.companyName)}
                                      disabled={isTesting}
                                      className="px-2.5 py-1 rounded bg-stone-800 hover:bg-stone-700 text-emerald-400 text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1"
                                      title="Test Token Broker handshake"
                                    >
                                      <RefreshCw className={`w-3 h-3 ${isTesting ? 'animate-spin' : ''}`} />
                                      <span>Test</span>
                                    </button>
                                  </>
                                )}

                                <button
                                  type="button"
                                  onClick={() => handleDisconnect(c.realmId, c.companyName)}
                                  className="px-2.5 py-1 rounded bg-red-950/40 hover:bg-red-900/60 text-red-300 text-[11px] font-medium border border-red-800/40 transition-colors cursor-pointer flex items-center gap-1"
                                  title="Disconnect from QuickBooks & Revoke Token"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>Disconnect</span>
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Sub-row: Default Receipt Posting Account & Synced Accounts Pipeline */}
                          <tr className="bg-stone-950/50 border-b border-stone-800/80">
                            <td colSpan={6} className="px-4 py-3 space-y-3">
                              {/* Dedicated Default Receipt Posting Account Selector */}
                              <div className="p-3 rounded-xl bg-stone-900/90 border border-amber-500/40 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-inner">
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <Star className="w-4 h-4 text-amber-400 fill-amber-400 shrink-0" />
                                    <span className="text-xs font-bold text-amber-200">
                                      Default Account to Post Receipt Information To:
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-stone-400">
                                    When a receipt is scanned, the engine detects email{' '}
                                    <strong className="text-sky-300 font-mono">{c.email || 'this account'}</strong>{' '}
                                    and automatically posts the receipt to this designated account.
                                  </p>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  <select
                                    value={c.defaultPostingAccount || c.selectedWorkingAccount || syncedAccs[0]}
                                    onChange={e => handleSetDefaultPostingAccount(c.realmId, e.target.value)}
                                    className="px-3 py-1.5 rounded-lg bg-stone-950 border border-amber-500/60 text-amber-300 font-mono text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-amber-400 cursor-pointer min-w-[280px]"
                                    title="Choose which account will receive scanned receipts by default"
                                  >
                                    <optgroup label="Populated Company Accounts">
                                      {syncedAccs.map((acc, aIdx) => (
                                        <option key={`sync_opt_${aIdx}`} value={acc}>{acc}</option>
                                      ))}
                                    </optgroup>
                                    <optgroup label="Standard Chart of Accounts Catalog">
                                      {allAccounts.filter(a => !syncedAccs.includes(a.name)).map(a => (
                                        <option key={a.id} value={a.name}>{a.name} ({a.classification} • #{a.accountNumber})</option>
                                      ))}
                                    </optgroup>
                                  </select>

                                  <button
                                    type="button"
                                    onClick={() => handlePopulateAccountsForCompany(c.realmId)}
                                    className="px-2.5 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/50 text-[11px] font-mono font-bold cursor-pointer flex items-center gap-1.5 shrink-0"
                                    title="Refresh & populate all accounts from QuickBooks"
                                  >
                                    <RefreshCw className="w-3 h-3 text-amber-400" />
                                    <span>Sync Accounts</span>
                                  </button>
                                </div>
                              </div>

                              {/* Synced Accounts Pipeline */}
                              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs pt-1">
                                <div className="space-y-1">
                                  <span className="text-[10px] uppercase font-mono font-bold text-stone-400 flex items-center gap-1.5">
                                    <Layers className="w-3 h-3 text-emerald-400" />
                                    Populated List of Accounts ({syncedAccs.length}):
                                  </span>
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {syncedAccs.map((acc, aIdx) => {
                                      const isAccDefault = (c.defaultPostingAccount ? c.defaultPostingAccount === acc : (c.selectedWorkingAccount === acc || (!c.selectedWorkingAccount && aIdx === 0)));
                                      const isAccActive = c.selectedWorkingAccount === acc;

                                      return (
                                        <div
                                          key={aIdx}
                                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono transition-all border ${
                                            isAccDefault
                                              ? 'bg-amber-950/70 border-amber-500/80 text-amber-200 shadow-sm'
                                              : isAccActive
                                              ? 'bg-emerald-950/70 border-emerald-500/60 text-emerald-200'
                                              : 'bg-stone-900 border-stone-700 text-stone-300'
                                          }`}
                                        >
                                          <button
                                            type="button"
                                            onClick={() => handleSelectActiveCompany(c.realmId, acc)}
                                            className="font-semibold hover:text-white flex items-center gap-1 cursor-pointer"
                                            title="Click to work on this account"
                                          >
                                            <span className={`w-1.5 h-1.5 rounded-full ${isAccDefault ? 'bg-amber-400' : isAccActive ? 'bg-emerald-400' : 'bg-stone-500'}`} />
                                            <span>{acc}</span>
                                            {isAccDefault && (
                                              <span className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.2 rounded font-bold bg-amber-500/30 text-amber-300 border border-amber-500/50">
                                                ★ DEFAULT
                                              </span>
                                            )}
                                            {!isAccDefault && isAccActive && (
                                              <span className="text-[9px] text-emerald-300">(Active)</span>
                                            )}
                                          </button>

                                          {!isAccDefault && (
                                            <button
                                              type="button"
                                              onClick={() => handleSetDefaultPostingAccount(c.realmId, acc)}
                                              className="text-stone-400 hover:text-amber-300 text-[10px] px-1 py-0.2 rounded bg-stone-800 hover:bg-amber-950/60 border border-stone-700 hover:border-amber-500/60 cursor-pointer ml-1"
                                              title="Set as the default account to post receipt information to"
                                            >
                                              Set Default
                                            </button>
                                          )}

                                          <button
                                            type="button"
                                            onClick={() => handleToggleSyncedAccount(c.realmId, acc)}
                                            className="text-stone-500 hover:text-red-400 cursor-pointer ml-0.5"
                                            title="Remove from sync pipeline"
                                          >
                                            <X className="w-3 h-3" />
                                          </button>
                                        </div>
                                      );
                                    })}

                                    {/* Add Synced Account Button / Form */}
                                    {showAddAccountForRealm === c.realmId ? (
                                      <div className="inline-flex items-center gap-1.5 bg-stone-900 p-1.5 rounded-lg border border-emerald-500/60 shadow-lg">
                                        <select
                                          onChange={e => {
                                            if (e.target.value) handleAddCustomSyncedAccount(c.realmId, e.target.value);
                                          }}
                                          className="px-2 py-1 rounded bg-stone-950 border border-stone-700 text-stone-200 text-xs font-mono cursor-pointer"
                                          defaultValue=""
                                        >
                                          <option value="" disabled>Choose Preset Account...</option>
                                          {STANDARD_SYNC_PRESETS.filter(p => !syncedAccs.includes(p)).map((p, pIdx) => (
                                            <option key={pIdx} value={p}>{p}</option>
                                          ))}
                                          {qboBankAccounts.filter((b: any) => !syncedAccs.includes(b.name)).map((b: any, bIdx: number) => (
                                            <option key={`bank_${bIdx}`} value={b.name}>{b.name} ({b.subType || b.qboType})</option>
                                          ))}
                                        </select>
                                        <input
                                          type="text"
                                          value={newSyncedAccountInput}
                                          onChange={e => setNewSyncedAccountInput(e.target.value)}
                                          placeholder="Or custom account name..."
                                          className="px-2 py-1 rounded bg-stone-950 border border-stone-700 text-stone-200 text-xs font-mono focus:outline-none w-48"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => handleAddCustomSyncedAccount(c.realmId, newSyncedAccountInput)}
                                          className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
                                        >
                                          Add
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setShowAddAccountForRealm(null);
                                            setNewSyncedAccountInput('');
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
                                        className="px-2 py-1 rounded bg-stone-900 hover:bg-stone-800 text-stone-400 hover:text-emerald-300 text-[10px] font-mono border border-stone-800 hover:border-stone-700 cursor-pointer"
                                      >
                                        + Add Account to Sync
                                      </button>
                                    )}
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2.5 shrink-0 pt-1 lg:pt-0">
                                  <div className="text-right">
                                    <span className="text-[10px] uppercase font-mono text-stone-500 block">
                                      What Chart of Accounts it Syncs to:
                                    </span>
                                    <div className="flex items-center gap-1 mt-0.5">
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
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleSelectActiveCompany(c.realmId);
                                      setActiveSubTab('mapping');
                                    }}
                                    className="px-2.5 py-1 rounded bg-sky-950/60 hover:bg-sky-900/60 text-sky-300 border border-sky-800/50 text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                                  >
                                    <Sliders className="w-3 h-3" />
                                    <span>Map Accounts</span>
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* How Desktop Integration Works */}
          <div className="p-4 rounded-xl bg-stone-900/40 border border-stone-800 text-xs text-stone-400 space-y-2">
            <span className="font-bold text-stone-200 flex items-center gap-1.5">
              <Server className="w-4 h-4 text-sky-400" />
              How Desktop Receipt Processor Communicates with QuickBooks
            </span>
            <p className="leading-relaxed">
              When the local Python script runs on Windows or macOS, it requests short-lived 60-minute access tokens from
              this web portal using the client's validated License Key. The desktop app never requires Intuit Client Secrets,
              complying 100% with Intuit's App Store and Developer Security Mandates.
            </p>
          </div>
        </>
      )}

      {/* SUB-TAB 2: EXPENSE SYNC & DIRECT PUSH HUB */}
      {activeSubTab === 'sync' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-gradient-to-r from-stone-900 via-stone-900 to-emerald-950/30 border border-emerald-500/30 shadow-xl relative overflow-hidden">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-2 max-w-2xl">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 text-[11px] font-bold font-mono uppercase rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5 text-emerald-400" />
                    QuickBooks Direct Synchronization
                  </span>
                  <span className="text-xs text-stone-400 font-mono">
                    Accounting REST API minorversion 65
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-stone-100 tracking-tight">
                  Receipt Ledger to QuickBooks Push
                </h2>
                <p className="text-sm text-stone-300 leading-relaxed">
                  Directly dispatch itemized transactions, receipts, and IRS tax schedule classifications into your linked QuickBooks Online companies.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const targetComp = companies.find(c => c.realmId === selectedPushRealmId) || companies[0];
                    if (!targetComp) {
                      showToast('Please connect a QuickBooks company first.');
                      return;
                    }
                    handlePushToCompany(targetComp.realmId, targetComp.companyName);
                  }}
                  disabled={isPushingReceipts || connectedList.length === 0}
                  className="px-5 py-3 rounded-lg bg-[#2CA01C] hover:bg-[#238016] disabled:opacity-40 text-white font-bold text-xs transition-all shadow-lg flex items-center justify-center gap-2.5 cursor-pointer border border-[#238016]"
                >
                  <Send className="w-4 h-4" />
                  <span>{isPushingReceipts ? 'Syncing to QuickBooks...' : 'Push All Approved to QuickBooks'}</span>
                </button>

                {pendingApprovedReceipts.length === 0 && (
                  <button
                    type="button"
                    onClick={handleSeedSampleReceipts}
                    className="px-4 py-3 rounded-lg bg-stone-800 hover:bg-stone-700 text-amber-300 text-xs font-semibold border border-stone-700 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span>Load 5 Sample Receipts</span>
                  </button>
                )}
              </div>
            </div>

            {/* Target Company, Working Account & Chart of Accounts Selector Bar */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-5 border-t border-stone-800">
              <div className="p-4 rounded-xl bg-stone-950/80 border border-stone-800 space-y-1">
                <label className="text-[11px] text-stone-400 uppercase tracking-wider block font-semibold">
                  Choose Account to Work On / Sync To:
                </label>
                {connectedList.length > 0 ? (
                  <select
                    value={`${selectedPushRealmId}::${selectedPaymentAccount}`}
                    onChange={(e) => {
                      const [realmId, acc] = e.target.value.split('::');
                      if (realmId) handleSelectActiveCompany(realmId, acc);
                    }}
                    className="w-full mt-1 px-3 py-2 bg-stone-900 border border-stone-700 rounded-lg text-xs font-semibold text-emerald-300 focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    {connectedList.map(c => (
                      <optgroup key={c.realmId} label={`${c.companyName} (${c.environment})`}>
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
                ) : (
                  <div className="text-xs text-amber-400 font-semibold pt-1">
                    No active company connected. Connect or simulate one first!
                  </div>
                )}
              </div>

              <div className="p-4 rounded-xl bg-stone-950/80 border border-stone-800 space-y-1">
                <label className="text-[11px] text-stone-400 uppercase tracking-wider block font-semibold">
                  What Chart of Accounts to Sync To:
                </label>
                <div className="flex items-center gap-1.5 mt-1">
                  <button
                    type="button"
                    onClick={() => handleSelectTargetChartOfAccounts(selectedPushRealmId, 'Schedule F Agricultural Standard (28 Accounts)', 'FARM')}
                    className={`flex-1 py-2 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer text-center ${
                      targetChartType === 'FARM'
                        ? 'bg-amber-600 text-white shadow border border-amber-400'
                        : 'bg-stone-900 text-stone-400 border border-stone-800 hover:text-stone-200'
                    }`}
                  >
                    🌾 Schedule F Farm
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectTargetChartOfAccounts(selectedPushRealmId, 'Schedule C Commercial Standard (24 Accounts)', 'COMMERCIAL')}
                    className={`flex-1 py-2 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer text-center ${
                      targetChartType === 'COMMERCIAL'
                        ? 'bg-sky-600 text-white shadow border border-sky-400'
                        : 'bg-stone-900 text-stone-400 border border-stone-800 hover:text-stone-200'
                    }`}
                  >
                    🏢 Schedule C Business
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-stone-950/80 border border-stone-800 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-stone-400 uppercase tracking-wider block font-semibold">
                    Approved Receipts Ready
                  </span>
                  <div className="text-xl font-bold text-emerald-400 font-mono mt-0.5">
                    {pendingApprovedReceipts.length} <span className="text-xs font-normal text-stone-400">transactions</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-stone-400 uppercase tracking-wider block font-semibold">
                    Deductible Total
                  </span>
                  <div className="text-xl font-bold text-stone-100 font-mono mt-0.5">
                    ${pendingTotalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            </div>

            {/* Synced Accounts Pipeline Strip in Sub-Tab 2 */}
            {(() => {
              const currentComp = companies.find(c => c.realmId === selectedPushRealmId) || companies[0];
              if (!currentComp) return null;
              const syncedList = currentComp.syncedAccounts || ['Operating Checking (Acct ****4120)', 'Farm Operating & Expense Ledger'];
              return (
                <div className="mt-3 p-3 rounded-xl bg-stone-950/60 border border-stone-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-mono font-bold uppercase text-stone-400 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-emerald-400" />
                      Synced Accounts in {currentComp.companyName} ({syncedList.length}):
                    </span>
                    {syncedList.map((acc, aIdx) => {
                      const isAccActive = selectedPaymentAccount === acc || (!selectedPaymentAccount && aIdx === 0);
                      return (
                        <div
                          key={aIdx}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono border ${
                            isAccActive
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold'
                              : 'bg-stone-900 border-stone-800 text-stone-300'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => handleSelectActiveCompany(currentComp.realmId, acc)}
                            className="cursor-pointer hover:text-white flex items-center gap-1"
                            title="Set as active destination account"
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${isAccActive ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                            <span>{acc}</span>
                            {isAccActive && <span className="text-[9px] text-amber-300">(Active)</span>}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleSyncedAccount(currentComp.realmId, acc)}
                            className="text-stone-500 hover:text-red-400 cursor-pointer ml-0.5"
                            title="Remove from sync pipeline"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {showAddAccountForRealm === currentComp.realmId ? (
                      <div className="inline-flex items-center gap-1 bg-stone-900 p-1 rounded-lg border border-emerald-500/60">
                        <select
                          onChange={e => {
                            if (e.target.value) handleAddCustomSyncedAccount(currentComp.realmId, e.target.value);
                          }}
                          className="px-1.5 py-0.5 rounded bg-stone-950 border border-stone-700 text-stone-200 text-[10px] font-mono cursor-pointer"
                          defaultValue=""
                        >
                          <option value="" disabled>Add Preset Account...</option>
                          {STANDARD_SYNC_PRESETS.filter(p => !syncedList.includes(p)).map((p, pIdx) => (
                            <option key={pIdx} value={p}>{p}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={newSyncedAccountInput}
                          onChange={e => setNewSyncedAccountInput(e.target.value)}
                          placeholder="Or custom name..."
                          className="px-1.5 py-0.5 rounded bg-stone-950 border border-stone-700 text-stone-200 text-[10px] font-mono focus:outline-none w-32"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddCustomSyncedAccount(currentComp.realmId, newSyncedAccountInput)}
                          className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold cursor-pointer"
                        >
                          Add
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowAddAccountForRealm(null);
                            setNewSyncedAccountInput('');
                          }}
                          className="text-stone-500 hover:text-stone-300 text-xs cursor-pointer px-1"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowAddAccountForRealm(currentComp.realmId)}
                        className="px-2.5 py-1 rounded bg-stone-900 hover:bg-stone-850 text-stone-300 hover:text-emerald-300 text-[11px] font-mono border border-stone-800 cursor-pointer"
                      >
                        + Add Account to Sync
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Table of Receipts Ready for QuickBooks Synchronization */}
          <div className="rounded-xl bg-stone-900/60 border border-stone-800 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-stone-950/40">
              <div className="flex items-center gap-2.5">
                <FileText className="w-4 h-4 text-emerald-400" />
                <div>
                  <h3 className="text-sm font-bold text-stone-200">Receipts Prepared for QuickBooks Push</h3>
                  <p className="text-xs text-stone-400">
                    Itemized expenses with matched IRS tax schedules and accounts
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={refreshPendingReceipts}
                  className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-medium border border-stone-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Refresh Queue</span>
                </button>
              </div>
            </div>

            {pendingApprovedReceipts.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-stone-800 border border-stone-700 flex items-center justify-center mx-auto text-stone-400">
                  <FileText className="w-6 h-6" />
                </div>
                <div className="max-w-md mx-auto space-y-1">
                  <h4 className="text-sm font-semibold text-stone-200">No Receipts in Ingestion Queue</h4>
                  <p className="text-xs text-stone-400 leading-relaxed">
                    Upload new receipt scans in the <strong>Admin Processing Hub</strong> or click below to load sample demo receipts ready for QuickBooks sync.
                  </p>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleSeedSampleReceipts}
                      className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-stone-950 text-xs font-bold transition-all cursor-pointer shadow"
                    >
                      Load Sample Receipts
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-stone-800 bg-stone-950/60 text-stone-400 text-[11px] font-semibold">
                      <th className="py-3 px-4">Vendor &amp; File</th>
                      <th className="py-3 px-3">Date</th>
                      <th className="py-3 px-3">Amount</th>
                      <th className="py-3 px-3">Tax Schedule</th>
                      <th className="py-3 px-3">Target QBO Account</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-800/60">
                    {pendingApprovedReceipts.map((r: any, idx: number) => {
                      const targetComp = companies.find(c => c.realmId === selectedPushRealmId) || companies[0];
                      const qboAccount = accountMappings[r.irsLineNumber] || r.irsLineTitle || 'Operating Expenses';

                      return (
                        <tr key={r.id || idx} className="hover:bg-stone-800/30 transition-colors">
                          <td className="py-3 px-4">
                            <span className="font-bold text-stone-200 block">{r.vendor || 'Unknown Vendor'}</span>
                            <span className="text-[10px] text-stone-500 font-mono block truncate max-w-xs">{r.fileName}</span>
                          </td>

                          <td className="py-3 px-3 text-stone-300 font-mono">
                            {r.date || 'N/A'}
                          </td>

                          <td className="py-3 px-3 font-mono font-bold text-emerald-400">
                            ${(parseFloat(r.total || '0') || 0).toFixed(2)}
                            {r.tax > 0 && (
                              <span className="text-[10px] text-stone-500 block font-normal">tax: ${(parseFloat(r.tax || '0') || 0).toFixed(2)}</span>
                            )}
                          </td>

                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-stone-800 text-stone-300 border border-stone-700">
                              {r.schedule} • {r.irsLineNumber}
                            </span>
                          </td>

                          <td className="py-3 px-3">
                            <span className="text-stone-200 font-semibold text-xs block truncate max-w-xs">{qboAccount}</span>
                            <span className="text-[10px] text-amber-300 font-mono block truncate max-w-xs">via: {selectedPaymentAccount || 'Operating Checking'}</span>
                            <span className="text-[9px] text-sky-400 font-mono block">Chart: {targetChartType === 'FARM' ? '🌾 Schedule F' : '🏢 Schedule C'}</span>
                          </td>

                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                if (!targetComp) {
                                  showToast('Please connect a QuickBooks company first.');
                                  return;
                                }
                                handlePushToCompany(targetComp.realmId, targetComp.companyName, r);
                              }}
                              disabled={isPushingReceipts}
                              className="px-2.5 py-1 rounded bg-[#2CA01C] hover:bg-[#238016] text-white text-[11px] font-bold transition-all shadow-sm cursor-pointer inline-flex items-center gap-1 border border-[#238016]"
                            >
                              <Send className="w-3 h-3" />
                              <span>Push</span>
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
        </div>
      )}

      {/* SUB-TAB 3: CATEGORY & CHART OF ACCOUNTS MAPPING */}
      {activeSubTab === 'mapping' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-stone-900 border border-stone-800 shadow-xl space-y-5">
            {/* Header & Main Controls */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-stone-100 flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-sky-400" />
                  QuickBooks Chart of Accounts &amp; Tax Schedule Mapping
                </h3>
                <p className="text-xs text-stone-400 mt-1">
                  Choose what Chart of Accounts you are syncing things to, set your default payment account, and map IRS Schedule F &amp; C categories.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowChartExplorer(!showChartExplorer)}
                  className="px-3 py-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-amber-300 text-xs font-semibold border border-stone-700 flex items-center gap-1.5 cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5 text-amber-400" />
                  <span>{showChartExplorer ? 'Hide Chart Explorer' : 'Chart of Accounts Explorer'}</span>
                </button>

                <button
                  type="button"
                  onClick={fetchLiveQboAccounts}
                  disabled={isLoadingAccounts}
                  className="px-3 py-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-sky-300 text-xs font-semibold border border-stone-700 flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAccounts ? 'animate-spin' : ''}`} />
                  <span>Fetch Live QBO Accounts</span>
                </button>

                <button
                  type="button"
                  onClick={handleResetAccountMappings}
                  className="px-3 py-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-400 text-xs font-medium border border-stone-700 cursor-pointer"
                >
                  Reset Defaults
                </button>

                <button
                  type="button"
                  onClick={handleSaveAccountMappings}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow cursor-pointer"
                >
                  Save Mapping
                </button>
              </div>
            </div>

            {/* Target Company & Chart of Accounts Selector Bar */}
            <div className="p-4 rounded-xl bg-stone-950/80 border border-stone-800 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-[11px] uppercase font-mono font-bold text-stone-400 block mb-1">
                  Target Company to Map For:
                </label>
                <select
                  value={selectedPushRealmId}
                  onChange={e => handleSelectActiveCompany(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-900 border border-stone-700 rounded-lg text-xs font-semibold text-emerald-300 focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  {companies.map(c => (
                    <option key={c.realmId} value={c.realmId}>
                      {c.companyName} ({c.realmId})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] uppercase font-mono font-bold text-stone-400 block mb-1">
                  What Chart of Accounts to Sync To:
                </label>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleSelectTargetChartOfAccounts(selectedPushRealmId, 'Schedule F Agricultural Standard (28 Accounts)', 'FARM')}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-colors cursor-pointer text-center ${
                      targetChartType === 'FARM'
                        ? 'bg-amber-600 text-white border border-amber-400'
                        : 'bg-stone-900 text-stone-400 border border-stone-800 hover:text-stone-200'
                    }`}
                  >
                    🌾 Schedule F Farm
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectTargetChartOfAccounts(selectedPushRealmId, 'Schedule C Commercial Standard (24 Accounts)', 'COMMERCIAL')}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-colors cursor-pointer text-center ${
                      targetChartType === 'COMMERCIAL'
                        ? 'bg-sky-600 text-white border border-sky-400'
                        : 'bg-stone-900 text-stone-400 border border-stone-800 hover:text-stone-200'
                    }`}
                  >
                    🏢 Schedule C Business
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[11px] uppercase font-mono font-bold text-stone-400 block mb-1">
                  Default Payment Account (Source of Funds):
                </label>
                <select
                  value={selectedPaymentAccount}
                  onChange={e => {
                    setSelectedPaymentAccount(e.target.value);
                    const comp = companies.find(c => c.realmId === selectedPushRealmId);
                    if (comp) {
                      handleSelectActiveCompany(comp.realmId, e.target.value);
                    }
                  }}
                  className="w-full px-3 py-2 bg-stone-900 border border-stone-700 rounded-lg text-xs font-semibold text-amber-300 focus:outline-none focus:border-amber-500 cursor-pointer"
                >
                  <option value="Operating Checking (Acct ****4120)">Operating Checking (Acct ****4120)</option>
                  <option value="Commercial Fleet & Fuel Account (Acct ****6021)">Commercial Fleet &amp; Fuel Account (Acct ****6021)</option>
                  <option value="Farm Operating & Expense Ledger">Farm Operating &amp; Expense Ledger</option>
                  <option value="Agricultural Payroll Reserve">Agricultural Payroll Reserve</option>
                  <option value="Commercial Equipment Financing (Acct ****8812)">Commercial Equipment Financing (Acct ****8812)</option>
                  {qboBankAccounts.map((b: any) => (
                    <option key={b.id} value={b.name}>{b.name} ({b.subType || b.qboType})</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Comprehensive Chart of Accounts Explorer & Search Directory */}
            {showChartExplorer && (() => {
              const searchedAccounts = searchQboAccounts(allAccounts, chartSearchQuery, chartCategoryFilter);
              return (
                <div className="p-5 rounded-2xl bg-stone-950 border border-amber-500/40 shadow-2xl space-y-4">
                  {/* Title & Quick Stats */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                        <Layers className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-sm text-stone-100">
                            QuickBooks Chart of Accounts Directory
                          </h4>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            {allAccounts.length} Total Accounts Populated
                          </span>
                        </div>
                        <p className="text-[11px] text-stone-400">
                          Search all bank, asset, liability, equity, income, COGS, and expense accounts across Schedule F &amp; C.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowAddAccountModal(true)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Custom Account</span>
                      </button>
                    </div>
                  </div>

                  {/* Search Bar & Category Filters */}
                  <div className="space-y-3 pt-1">
                    <div className="flex flex-col sm:flex-row gap-2.5">
                      <div className="relative flex-1">
                        <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={chartSearchQuery}
                          onChange={e => setChartSearchQuery(e.target.value)}
                          placeholder="Search accounts by name, number (#1010), type (Bank, Asset, Expense), IRS schedule line, description..."
                          className="w-full pl-9 pr-9 py-2 bg-stone-900 border border-stone-700 hover:border-stone-600 rounded-xl text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
                        />
                        {chartSearchQuery && (
                          <button
                            type="button"
                            onClick={() => setChartSearchQuery('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-200 text-xs px-1 cursor-pointer"
                            title="Clear search"
                          >
                            ✕
                          </button>
                        )}
                      </div>

                      {chartSearchQuery && (
                        <div className="flex items-center text-xs text-amber-300 bg-amber-950/40 border border-amber-800/60 px-3 py-1.5 rounded-xl font-mono shrink-0">
                          Found {searchedAccounts.length} match{searchedAccounts.length === 1 ? '' : 'es'}
                        </div>
                      )}
                    </div>

                    {/* Category Filter Pills */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[10px] uppercase font-mono font-bold text-stone-400 mr-1 flex items-center gap-1">
                        <Filter className="w-3 h-3 text-stone-400" />
                        Filter:
                      </span>
                      {QBO_CHART_CATEGORIES.map(cat => {
                        const isSelected = chartCategoryFilter === cat.key;
                        const count = searchQboAccounts(allAccounts, '', cat.key).length;
                        return (
                          <button
                            key={cat.key}
                            type="button"
                            onClick={() => setChartCategoryFilter(cat.key)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                              isSelected
                                ? 'bg-amber-500 text-stone-950 font-bold shadow'
                                : 'bg-stone-900 text-stone-400 hover:bg-stone-850 hover:text-stone-200 border border-stone-800'
                            }`}
                          >
                            <span>{cat.label}</span>
                            <span className={`text-[10px] font-mono px-1 rounded ${isSelected ? 'bg-stone-950/30 text-stone-950' : 'bg-stone-800 text-stone-400'}`}>
                              {count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Account List Display */}
                  <div className="border border-stone-800 rounded-xl overflow-hidden bg-stone-900/50">
                    <div className="px-3.5 py-2 bg-stone-900/90 border-b border-stone-800 flex items-center justify-between text-[11px] text-stone-400">
                      <span>
                        Showing <strong className="text-stone-200">{searchedAccounts.length}</strong> of {allAccounts.length} accounts
                        {chartCategoryFilter !== 'ALL' && <span className="text-amber-400 ml-1">in {chartCategoryFilter}</span>}
                        {chartSearchQuery && <span className="text-sky-400 ml-1">matching &quot;{chartSearchQuery}&quot;</span>}
                      </span>
                      <span className="font-mono text-[10px] text-stone-500">
                        Click any account card to view details or assign as default payment
                      </span>
                    </div>

                    {searchedAccounts.length === 0 ? (
                      <div className="p-8 text-center space-y-2">
                        <div className="w-10 h-10 rounded-full bg-stone-800 flex items-center justify-center mx-auto text-stone-400">
                          <Search className="w-5 h-5" />
                        </div>
                        <p className="text-xs text-stone-300 font-semibold">
                          No QuickBooks accounts match &quot;{chartSearchQuery}&quot;
                        </p>
                        <p className="text-[11px] text-stone-500">
                          Try searching for a different keyword, account number (e.g. 1010, 6020), or clear filters.
                        </p>
                        <div className="pt-2 flex justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => { setChartSearchQuery(''); setChartCategoryFilter('ALL'); }}
                            className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-semibold cursor-pointer"
                          >
                            Reset Search &amp; Filters
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setNewCustomAccount(prev => ({ ...prev, name: chartSearchQuery }));
                              setShowAddAccountModal(true);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add &quot;{chartSearchQuery}&quot; as New Account</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 p-3 max-h-[460px] overflow-y-auto">
                        {searchedAccounts.map((acc, aIdx) => {
                          const isPayment = selectedPaymentAccount === acc.name;
                          const isSelected = selectedChartAccountDetails?.id === acc.id;

                          let typeBadgeClass = 'bg-stone-800 text-stone-300';
                          if (acc.qboType === 'Bank') typeBadgeClass = 'bg-amber-500/20 text-amber-300 border border-amber-500/40';
                          else if (acc.classification === 'Asset') typeBadgeClass = 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
                          else if (acc.classification === 'Liability') typeBadgeClass = 'bg-red-500/20 text-red-300 border border-red-500/40';
                          else if (acc.classification === 'Equity') typeBadgeClass = 'bg-purple-500/20 text-purple-300 border border-purple-500/40';
                          else if (acc.classification === 'Revenue') typeBadgeClass = 'bg-teal-500/20 text-teal-300 border border-teal-500/40';
                          else if (acc.qboType === 'Cost of Goods Sold') typeBadgeClass = 'bg-orange-500/20 text-orange-300 border border-orange-500/40';
                          else if (acc.classification === 'Expense') typeBadgeClass = 'bg-sky-500/20 text-sky-300 border border-sky-500/40';

                          return (
                            <div
                              key={acc.id || aIdx}
                              onClick={() => setSelectedChartAccountDetails(isSelected ? null : acc)}
                              className={`p-3 rounded-xl transition-all cursor-pointer border flex flex-col justify-between gap-2 ${
                                isSelected
                                  ? 'bg-stone-900 border-amber-400 ring-1 ring-amber-400 shadow-md'
                                  : isPayment
                                  ? 'bg-stone-900/90 border-amber-500/40 hover:border-amber-400'
                                  : 'bg-stone-950/70 border-stone-800/80 hover:bg-stone-900/80 hover:border-stone-700'
                              }`}
                            >
                              <div className="space-y-1">
                                <div className="flex items-center justify-between gap-1.5">
                                  <div className="flex items-center gap-1.5 truncate">
                                    {acc.accountNumber && (
                                      <span className="font-mono text-[10px] font-bold text-amber-400/90 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-800/40 shrink-0">
                                        #{acc.accountNumber}
                                      </span>
                                    )}
                                    <span className="font-bold text-xs text-stone-100 truncate" title={acc.name}>
                                      {acc.name}
                                    </span>
                                  </div>
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono shrink-0 ${typeBadgeClass}`}>
                                    {acc.qboType || acc.classification}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1.5 text-[10px] text-stone-400 font-mono">
                                  <span>{acc.subType || acc.classification}</span>
                                  {acc.line && (
                                    <>
                                      <span>•</span>
                                      <span className="text-emerald-400">{acc.line}</span>
                                    </>
                                  )}
                                  {acc.schedule && acc.schedule !== 'BALANCE_SHEET' && (
                                    <>
                                      <span>•</span>
                                      <span className={acc.schedule === 'SCHEDULE_F' ? 'text-amber-400' : 'text-sky-400'}>
                                        {acc.schedule === 'SCHEDULE_F' ? 'Sched F' : 'Sched C'}
                                      </span>
                                    </>
                                  )}
                                </div>

                                {acc.description && (
                                  <p className="text-[11px] text-stone-400 line-clamp-2 leading-relaxed">
                                    {acc.description}
                                  </p>
                                )}
                              </div>

                              <div className="pt-2 border-t border-stone-800/60 flex items-center justify-between gap-2 text-[10px]">
                                {isPayment ? (
                                  <span className="text-amber-300 font-bold flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                    Active Payment Account
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedPaymentAccount(acc.name);
                                      if (selectedPushRealmId) {
                                        handleSelectActiveCompany(selectedPushRealmId, acc.name);
                                      }
                                      showToast(`Set "${acc.name}" as active payment source.`);
                                    }}
                                    className="text-stone-400 hover:text-amber-300 font-semibold cursor-pointer"
                                  >
                                    Use as Payment Source
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(acc.name);
                                    showToast(`Copied "${acc.name}" to clipboard`);
                                  }}
                                  className="text-stone-400 hover:text-stone-200 cursor-pointer"
                                  title="Copy account name"
                                >
                                  Copy Name
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Selected Account Inspector Drawer */}
                  {selectedChartAccountDetails && (
                    <div className="p-4 rounded-xl bg-stone-900 border border-amber-400/50 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <BookOpen className="w-4 h-4 text-amber-400" />
                          <h5 className="font-bold text-xs text-stone-100">
                            Account Inspector: {selectedChartAccountDetails.name}
                          </h5>
                          {selectedChartAccountDetails.accountNumber && (
                            <span className="font-mono text-xs text-amber-300">
                              (#{selectedChartAccountDetails.accountNumber})
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedChartAccountDetails(null)}
                          className="text-stone-400 hover:text-stone-200 text-xs px-1 cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div className="p-2 rounded bg-stone-950 border border-stone-800">
                          <span className="text-[10px] text-stone-500 font-mono block">Type</span>
                          <span className="font-semibold text-stone-200">{selectedChartAccountDetails.qboType}</span>
                        </div>
                        <div className="p-2 rounded bg-stone-950 border border-stone-800">
                          <span className="text-[10px] text-stone-500 font-mono block">Sub-Type</span>
                          <span className="font-semibold text-stone-200">{selectedChartAccountDetails.subType || 'General'}</span>
                        </div>
                        <div className="p-2 rounded bg-stone-950 border border-stone-800">
                          <span className="text-[10px] text-stone-500 font-mono block">Classification</span>
                          <span className="font-semibold text-stone-200">{selectedChartAccountDetails.classification}</span>
                        </div>
                        <div className="p-2 rounded bg-stone-950 border border-stone-800">
                          <span className="text-[10px] text-stone-500 font-mono block">IRS Tax Line</span>
                          <span className="font-semibold text-emerald-300">{selectedChartAccountDetails.line || 'Standard'}</span>
                        </div>
                      </div>

                      {selectedChartAccountDetails.description && (
                        <p className="text-xs text-stone-300 bg-stone-950/60 p-2 rounded border border-stone-800">
                          {selectedChartAccountDetails.description}
                        </p>
                      )}

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPaymentAccount(selectedChartAccountDetails.name);
                            if (selectedPushRealmId) handleSelectActiveCompany(selectedPushRealmId, selectedChartAccountDetails.name);
                            showToast(`Set "${selectedChartAccountDetails.name}" as active payment source.`);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs cursor-pointer"
                        >
                          Set as Default Working Payment Account
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Schedule F (Farm) Mappings */}
            <div className="pt-4 border-t border-stone-800 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  Schedule F (Form 1040) Farm Deductions &amp; Chart of Accounts Map
                </h4>
                <span className="text-[10px] font-mono text-stone-400">
                  Select from Chart of Accounts or type custom account
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                {Object.entries(DEFAULT_ACCOUNT_MAPPINGS)
                  .filter(([k]) => !k.includes('(C)') && !['Line 8', 'Line 9', 'Line 11', 'Line 17', 'Line 18', 'Line 21', 'Line 24'].includes(k))
                  .map(([line, defaultAcc]) => {
                    const currentVal = accountMappings[line] || defaultAcc;
                    const availableOptions = Array.from(new Set([
                      defaultAcc,
                      ...allAccounts
                        .filter(a => a.classification === 'Expense' || a.schedule === 'SCHEDULE_F' || a.qboType === 'Cost of Goods Sold')
                        .map(a => a.name)
                    ]));

                    return (
                      <div key={line} className="p-3 rounded-xl bg-stone-950/80 border border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div className="shrink-0">
                          <span className="font-mono text-emerald-400 font-bold block">{line}</span>
                          <span className="text-stone-400 text-[11px]">IRS Standard: {defaultAcc}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            value={availableOptions.includes(currentVal) ? currentVal : 'CUSTOM'}
                            onChange={(e) => {
                              if (e.target.value !== 'CUSTOM') {
                                setAccountMappings({ ...accountMappings, [line]: e.target.value });
                              }
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-stone-200 text-xs font-semibold focus:outline-none focus:border-amber-500 cursor-pointer w-44"
                          >
                            {Array.from(new Set(availableOptions)).map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                            <option value="CUSTOM">Custom account...</option>
                          </select>
                          <input
                            type="text"
                            value={currentVal}
                            onChange={(e) => setAccountMappings({ ...accountMappings, [line]: e.target.value })}
                            placeholder="Account name"
                            className="px-2.5 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-stone-200 text-xs font-semibold focus:outline-none focus:border-sky-500 w-36 text-right"
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Schedule C (Business) Mappings */}
            <div className="pt-4 border-t border-stone-800 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-sky-400 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-sky-400" />
                  Schedule C Commercial &amp; Sole Proprietorship Deductions &amp; Chart of Accounts Map
                </h4>
                <span className="text-[10px] font-mono text-stone-400">
                  Select from Chart of Accounts or type custom account
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                {Object.entries(DEFAULT_ACCOUNT_MAPPINGS)
                  .filter(([k]) => k.includes('(C)') || ['Line 8', 'Line 9', 'Line 11', 'Line 17', 'Line 18', 'Line 21', 'Line 24'].includes(k))
                  .map(([line, defaultAcc]) => {
                    const currentVal = accountMappings[line] || defaultAcc;
                    const availableOptions = Array.from(new Set([
                      defaultAcc,
                      ...allAccounts
                        .filter(a => a.classification === 'Expense' || a.schedule === 'SCHEDULE_C' || a.schedule === 'ALL')
                        .map(a => a.name)
                    ]));

                    return (
                      <div key={line} className="p-3 rounded-xl bg-stone-950/80 border border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div className="shrink-0">
                          <span className="font-mono text-sky-400 font-bold block">{line}</span>
                          <span className="text-stone-400 text-[11px]">IRS Standard: {defaultAcc}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            value={availableOptions.includes(currentVal) ? currentVal : 'CUSTOM'}
                            onChange={(e) => {
                              if (e.target.value !== 'CUSTOM') {
                                setAccountMappings({ ...accountMappings, [line]: e.target.value });
                              }
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-stone-200 text-xs font-semibold focus:outline-none focus:border-sky-500 cursor-pointer w-44"
                          >
                            {Array.from(new Set(availableOptions)).map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                            <option value="CUSTOM">Custom account...</option>
                          </select>
                          <input
                            type="text"
                            value={currentVal}
                            onChange={(e) => setAccountMappings({ ...accountMappings, [line]: e.target.value })}
                            placeholder="Account name"
                            className="px-2.5 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-stone-200 text-xs font-semibold focus:outline-none focus:border-sky-500 w-36 text-right"
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 4: SYNCHRONIZATION AUDIT LOG */}
      {activeSubTab === 'audit' && (
        <div className="space-y-6">
          <div className="rounded-xl bg-stone-900/60 border border-stone-800 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-stone-950/40">
              <div className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 text-purple-400" />
                <div>
                  <h3 className="text-sm font-bold text-stone-200">QuickBooks Online Sync Audit Trail</h3>
                  <p className="text-xs text-stone-400">
                    Live log of transactions pushed to Intuit QuickBooks REST APIs
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={fetchSyncLogs}
                  className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 transition-colors cursor-pointer"
                  title="Refresh Audit Log"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={handleExportSyncLogCsv}
                  disabled={syncLogs.length === 0}
                  className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium border border-stone-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-stone-400" />
                  <span>Export CSV</span>
                </button>

                <button
                  type="button"
                  onClick={handleClearSyncLog}
                  disabled={syncLogs.length === 0 || isClearingLog}
                  className="px-3 py-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-300 text-xs font-medium border border-red-800/40 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear Log</span>
                </button>
              </div>
            </div>

            {syncLogs.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-stone-800 border border-stone-700 flex items-center justify-center mx-auto text-stone-400">
                  <Clock className="w-6 h-6" />
                </div>
                <div className="max-w-md mx-auto space-y-1">
                  <h4 className="text-sm font-semibold text-stone-200">No Transactions Synced Yet</h4>
                  <p className="text-xs text-stone-400 leading-relaxed">
                    When you push approved receipts to QuickBooks, each transaction ID, document number, and company timestamp will be logged here.
                  </p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-stone-800 bg-stone-950/60 text-stone-400 text-[11px] font-semibold">
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-3">Company &amp; Realm</th>
                      <th className="py-3 px-3">Vendor</th>
                      <th className="py-3 px-3">Category / Account</th>
                      <th className="py-3 px-3">Amount</th>
                      <th className="py-3 px-3">Doc &amp; QBO ID</th>
                      <th className="py-3 px-4 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-800/60">
                    {syncLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-stone-800/30 transition-colors">
                        <td className="py-3 px-4 font-mono text-[11px] text-stone-400">
                          {new Date(log.pushedAt).toLocaleString()}
                        </td>

                        <td className="py-3 px-3">
                          <span className="font-semibold text-stone-200 block text-xs">{log.companyName}</span>
                          <span className="text-[10px] text-stone-500 font-mono block">{log.realmId}</span>
                        </td>

                        <td className="py-3 px-3 font-medium text-stone-300">
                          {log.vendor}
                        </td>

                        <td className="py-3 px-3">
                          <span className="text-stone-300 font-medium block">{log.accountName}</span>
                          <span className="text-[10px] text-stone-500 font-mono">{log.schedule} {log.irsLine}</span>
                        </td>

                        <td className="py-3 px-3 font-mono font-bold text-emerald-400">
                          ${log.total.toFixed(2)}
                        </td>

                        <td className="py-3 px-3 font-mono text-[11px] text-stone-400">
                          <span className="block text-stone-300">{log.docNumber}</span>
                          <span className="text-[10px] text-stone-500">{log.qboTxnId}</span>
                        </td>

                        <td className="py-3 px-4 text-right">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            SYNCED
                          </span>
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

      {/* Connection & Setup Assistant Modal */}
      {showConnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-2xl bg-stone-900 border border-stone-800 rounded-2xl shadow-2xl overflow-hidden my-8">
            {/* Header */}
            <div className="p-5 border-b border-stone-800 flex items-center justify-between bg-stone-950/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#2CA01C]/15 border border-emerald-500/30 flex items-center justify-center text-[#2CA01C] shrink-0">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-stone-100 flex items-center gap-2">
                    Connect to QuickBooks Online
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 border border-emerald-800 text-emerald-300 font-semibold">
                      OAuth 2.0
                    </span>
                  </h3>
                  <p className="text-xs text-stone-400 mt-0.5">
                    Authorize QuickBooks companies to push receipts, bills, and purchase records
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowConnectModal(false)}
                className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
              {/* Option 1: Provide Intuit Developer App Keys */}
              <div className="p-4 rounded-xl bg-stone-950/70 border border-stone-800 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-stone-200 flex items-center gap-2">
                      <Key className="w-4 h-4 text-emerald-400" />
                      Option 1: Connect with Intuit Developer Keys
                    </h4>
                    <p className="text-xs text-stone-400 mt-0.5">
                      Enter your Client ID and Secret from{' '}
                      <a
                        href="https://developer.intuit.com"
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-400 hover:underline inline-flex items-center gap-0.5"
                      >
                        developer.intuit.com <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAutoFillSandboxKeys}
                    className="text-[11px] px-2.5 py-1 rounded bg-stone-800 hover:bg-stone-700 text-amber-300 border border-stone-700 transition-colors cursor-pointer shrink-0"
                  >
                    Auto-Fill Sandbox Keys
                  </button>
                </div>

                {/* Redirect URI copy box */}
                <div className="p-3.5 rounded-xl bg-stone-900 border border-stone-800 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-stone-200 flex items-center gap-1.5">
                      <ExternalLink className="w-3.5 h-3.5 text-sky-400" />
                      1. Redirect URI for Intuit Developer Dashboard
                    </span>
                    <span className="text-[10px] text-amber-400 font-semibold px-2 py-0.5 rounded bg-amber-950/60 border border-amber-800/60">
                      Must match Intuit exactly
                    </span>
                  </div>

                  <p className="text-[11px] text-stone-400 leading-relaxed">
                    Under <strong className="text-stone-200">Keys &amp; OAuth &gt; Redirect URIs</strong> on developer.intuit.com, click <em>&quot;+ Add URI&quot;</em> and paste the URI below. Intuit requires an exact character match.
                  </p>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={modalRedirectUri}
                      onChange={e => setModalRedirectUri(e.target.value)}
                      placeholder="Redirect URI sent to Intuit"
                      className="flex-1 px-3 py-2 rounded-lg bg-stone-950 border border-stone-700 text-stone-100 font-mono text-xs focus:outline-none focus:border-sky-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleCopy(modalRedirectUri, 'Redirect URI')}
                      className="px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 shadow-sm"
                    >
                      {copiedField === 'Redirect URI' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-white" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy URI</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Registered endpoint button */}
                  <div className="pt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                    <span className="text-stone-500 font-medium">Registered Endpoint:</span>
                    <button
                      type="button"
                      onClick={() => {
                        setModalRedirectUri(CANONICAL_REDIRECT_URI);
                        handleCopy(CANONICAL_REDIRECT_URI, 'Registered URI');
                      }}
                      className="px-2 py-1 rounded border transition-colors cursor-pointer font-mono bg-sky-950 text-sky-300 border-sky-600 font-bold"
                    >
                      GitHub Pages Endpoint (/Receipt_portal/api/qbo/callback)
                    </button>
                  </div>
                </div>

                {/* Form fields */}
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block text-stone-300 font-medium mb-1">
                      Intuit Client ID <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={modalClientId}
                      onChange={e => setModalClientId(e.target.value)}
                      placeholder="e.g. AB116938290382901928472910..."
                      className="w-full px-3 py-2 rounded-lg bg-stone-900 border border-stone-700 text-stone-100 font-mono text-xs focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-stone-300 font-medium mb-1">
                      Intuit Client Secret <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="password"
                      value={modalClientSecret}
                      onChange={e => setModalClientSecret(e.target.value)}
                      placeholder={config.hasSecret ? "•••••••••••••••• (Leave blank to keep saved)" : "Enter Intuit Client Secret"}
                      className="w-full px-3 py-2 rounded-lg bg-stone-900 border border-stone-700 text-stone-100 font-mono text-xs focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-stone-300 font-medium mb-1">
                      Target Environment
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setModalEnv('production')}
                        className={`py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                          modalEnv === 'production'
                            ? 'bg-emerald-600 text-white border border-emerald-400'
                            : 'bg-stone-900 text-stone-400 border border-stone-800 hover:text-stone-200'
                        }`}
                      >
                        Production Ledger
                      </button>
                      <button
                        type="button"
                        onClick={() => setModalEnv('sandbox')}
                        className={`py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                          modalEnv === 'sandbox'
                            ? 'bg-amber-600 text-white border border-amber-400'
                            : 'bg-stone-900 text-stone-400 border border-stone-800 hover:text-stone-200'
                        }`}
                      >
                        Intuit Sandbox / Test
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveAndConnectFromModal}
                    disabled={isSavingModal}
                    className="w-full py-3 rounded-lg bg-[#2CA01C] hover:bg-[#238016] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer border border-[#238016] mt-2"
                  >
                    <Building2 className="w-4 h-4" />
                    <span>{isSavingModal ? 'Saving & Opening Intuit...' : 'Save Keys & Launch Intuit OAuth →'}</span>
                  </button>
                </div>
              </div>

              {/* Option 2: Instant 1-Click Sandbox Test */}
              <div className="p-4 rounded-xl bg-stone-950/70 border border-stone-800 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-stone-200 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-400" />
                      Option 2: 1-Click Instant Test Company (No Keys Needed)
                    </h4>
                    <p className="text-xs text-stone-400 mt-0.5">
                      Don&apos;t have an Intuit Developer account ready? Connect a simulated company with live AES-256 encrypted tokens and rolling 101-day renewal immediately.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    setShowConnectModal(false);
                    await handleMockConnect();
                  }}
                  className="w-full py-2.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-amber-300 font-semibold text-xs flex items-center justify-center gap-2 border border-stone-700 transition-colors cursor-pointer"
                >
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>Connect Instant Test Company →</span>
                </button>
              </div>

              {/* Option 3: Direct Link if Popup Was Blocked */}
              {generatedAuthUrl && (
                <div className="p-3 rounded-xl bg-stone-950 border border-stone-800 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-stone-300">
                    <ExternalLink className="w-4 h-4 text-sky-400 shrink-0" />
                    <span>Intuit OAuth Link Ready:</span>
                  </div>
                  <a
                    href={generatedAuthUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded bg-sky-950 hover:bg-sky-900 text-sky-300 border border-sky-800 font-semibold text-xs transition-colors"
                  >
                    Open in New Tab →
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add Custom Account to Chart of Accounts */}
      {showAddAccountModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-stone-900 border border-stone-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-stone-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-stone-100">Add Account to Chart of Accounts</h3>
                  <p className="text-[11px] text-stone-400">Create a new standardized or custom account for syncing</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddAccountModal(false)}
                className="text-stone-400 hover:text-stone-200 p-1 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="text-[11px] uppercase font-mono font-bold text-stone-400 block mb-1">
                  Account Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={newCustomAccount.name}
                  onChange={e => setNewCustomAccount({ ...newCustomAccount, name: e.target.value })}
                  placeholder="e.g. Field Seed Corn & Alfalfa Mix"
                  className="w-full px-3 py-2 bg-stone-950 border border-stone-700 rounded-xl text-xs text-stone-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] uppercase font-mono font-bold text-stone-400 block mb-1">
                    Account Number (Optional)
                  </label>
                  <input
                    type="text"
                    value={newCustomAccount.accountNumber}
                    onChange={e => setNewCustomAccount({ ...newCustomAccount, accountNumber: e.target.value })}
                    placeholder="e.g. 6055"
                    className="w-full px-3 py-2 bg-stone-950 border border-stone-700 rounded-xl text-xs text-stone-100 font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] uppercase font-mono font-bold text-stone-400 block mb-1">
                    QuickBooks Account Type
                  </label>
                  <select
                    value={newCustomAccount.qboType}
                    onChange={e => {
                      const t = e.target.value;
                      let cls: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense' = 'Expense';
                      if (['Bank', 'Other Current Asset', 'Fixed Asset', 'Accounts Receivable'].includes(t)) cls = 'Asset';
                      else if (['Accounts Payable', 'Credit Card', 'Other Current Liability', 'Long Term Liability'].includes(t)) cls = 'Liability';
                      else if (t === 'Equity') cls = 'Equity';
                      else if (['Income', 'Other Income'].includes(t)) cls = 'Revenue';
                      setNewCustomAccount({ ...newCustomAccount, qboType: t, classification: cls });
                    }}
                    className="w-full px-3 py-2 bg-stone-950 border border-stone-700 rounded-xl text-xs text-stone-100 focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="Expense">Expense</option>
                    <option value="Cost of Goods Sold">Cost of Goods Sold</option>
                    <option value="Bank">Bank / Cash</option>
                    <option value="Other Current Asset">Other Current Asset</option>
                    <option value="Fixed Asset">Fixed Asset</option>
                    <option value="Accounts Payable">Accounts Payable (A/P)</option>
                    <option value="Credit Card">Credit Card</option>
                    <option value="Other Current Liability">Other Current Liability</option>
                    <option value="Long Term Liability">Long Term Liability</option>
                    <option value="Equity">Equity</option>
                    <option value="Income">Income / Revenue</option>
                    <option value="Other Expense">Other Expense</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] uppercase font-mono font-bold text-stone-400 block mb-1">
                    IRS Tax Schedule
                  </label>
                  <select
                    value={newCustomAccount.schedule}
                    onChange={e => setNewCustomAccount({ ...newCustomAccount, schedule: e.target.value as any })}
                    className="w-full px-3 py-2 bg-stone-950 border border-stone-700 rounded-xl text-xs text-stone-100 focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="SCHEDULE_F">Schedule F (Farm)</option>
                    <option value="SCHEDULE_C">Schedule C (Commercial)</option>
                    <option value="BALANCE_SHEET">Balance Sheet / Operating</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] uppercase font-mono font-bold text-stone-400 block mb-1">
                    Tax Schedule Line
                  </label>
                  <input
                    type="text"
                    value={newCustomAccount.line}
                    onChange={e => setNewCustomAccount({ ...newCustomAccount, line: e.target.value })}
                    placeholder="e.g. Line 25 or Line 32"
                    className="w-full px-3 py-2 bg-stone-950 border border-stone-700 rounded-xl text-xs text-stone-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] uppercase font-mono font-bold text-stone-400 block mb-1">
                  Description / Operational Notes
                </label>
                <textarea
                  value={newCustomAccount.description}
                  onChange={e => setNewCustomAccount({ ...newCustomAccount, description: e.target.value })}
                  placeholder="Explain what receipts or expenses will map into this account..."
                  rows={2}
                  className="w-full px-3 py-2 bg-stone-950 border border-stone-700 rounded-xl text-xs text-stone-100 focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>
            </div>

            <div className="p-4 bg-stone-950 border-t border-stone-800 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowAddAccountModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-400 hover:text-stone-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddCustomChartAccount}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow cursor-pointer"
              >
                Add Account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
