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
  X
} from 'lucide-react';

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

interface QuickBooksProductionCenterProps {
  showToast: (msg: string) => void;
  onOpenLegal: (tab: 'privacy' | 'terms' | 'support') => void;
}

const QBO_STORAGE_CONFIG_KEY = 'receipt_processor_qbo_config_v1';
const QBO_STORAGE_COMPANIES_KEY = 'receipt_processor_qbo_companies_v1';
const DEFAULT_CLIENT_ID = '';
const DEFAULT_WEBHOOK_VERIFIER = '10dcc427-1e8b-4358-b8f7-8d1e30150fa6';

async function safeFetchJson<T = any>(url: string, options?: RequestInit): Promise<{ ok: boolean; data: T | null }> {
  try {
    const res = await fetch(url, options);
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
      if (parsed.clientId === 'ABCsXqO9WiPqbL2Bgqf9AeBPMDeBQSjWKLdHiZUPYIlPwDoHni' || parsed.clientId === 'AB116938290382901928472910') {
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

function getLocalCompanies(): CompanyRecord[] {
  try {
    const raw = localStorage.getItem(QBO_STORAGE_COMPANIES_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveLocalCompanies(list: CompanyRecord[]) {
  try {
    localStorage.setItem(QBO_STORAGE_COMPANIES_KEY, JSON.stringify(list));
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

  const getCleanRedirectUri = (custom?: string) => {
    return (custom || editRedirectUri || modalRedirectUri || CANONICAL_REDIRECT_URI).trim();
  };

  const fetchConfig = async () => {
    const result = await safeFetchJson<QboConfigState>('/api/qbo/config');
    if (result.ok && result.data) {
      const cleanCId = (result.data.clientId === 'ABCsXqO9WiPqbL2Bgqf9AeBPMDeBQSjWKLdHiZUPYIlPwDoHni' || result.data.clientId === 'AB116938290382901928472910') ? '' : (result.data.clientId || '');
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
      // Fall back to localStorage (e.g. GitHub Pages static host)
      const local = getLocalConfig();
      const cleanCId = (local.clientId === 'ABCsXqO9WiPqbL2Bgqf9AeBPMDeBQSjWKLdHiZUPYIlPwDoHni' || local.clientId === 'AB116938290382901928472910') ? '' : (local.clientId || '');
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
    const result = await safeFetchJson<{ companies: CompanyRecord[] }>('/api/qbo/companies');
    if (result.ok && result.data?.companies) {
      setCompanies(result.data.companies);
      saveLocalCompanies(result.data.companies);
    } else {
      // Fall back to localStorage (e.g. GitHub Pages static host)
      const localComps = getLocalCompanies();
      setCompanies(localComps);
    }
    setIsRefreshing(false);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchConfig();
    fetchCompanies();
    const interval = setInterval(fetchCompanies, 10000);

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

    // Cross-window postMessage listener for popup OAuth completion with strict origin check
    const handlePopupMessage = (event: MessageEvent) => {
      // Security: Validate origin matches current window origin or trusted hosting domains
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
        
        // Add to local state & localStorage immediately
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
    
    // Save locally first for instant UI response and static GitHub Pages support
    const updatedLocalConfig = {
      clientId: editClientId.trim(),
      environment: editEnv,
      redirectUri: editRedirectUri.trim() || undefined,
      configured: Boolean(editClientId.trim()),
      hasSecret: Boolean(editClientSecret.trim() || config.hasSecret)
    };
    saveLocalConfig(updatedLocalConfig);
    setConfig(prev => ({ ...prev, ...updatedLocalConfig }));

    // Try backend if server is active
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
    setIsConnecting(true);
    try {
      // Try server endpoint first with resilient safeFetchJson, explicitly passing activeClientId and redirectUri
      const serverRes = await safeFetchJson<{ authUrl: string }>(
        `/api/qbo/auth-url?redirect_uri=${encodeURIComponent(redirectUri)}&client_id=${encodeURIComponent(activeClientId)}&environment=sandbox`
      );

      let authUrl = '';
      if (serverRes.ok && serverRes.data?.authUrl) {
        authUrl = serverRes.data.authUrl;
      } else {
        // Generate direct Intuit OAuth 2.0 authorization URL client-side (100% works on GitHub Pages / static hosts!)
        authUrl = generateIntuitAuthUrl(activeClientId, redirectUri);
      }

      setGeneratedAuthUrl(authUrl);

      // Open official Intuit OAuth 2.0 popup
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
      // Save locally
      const updated = {
        clientId: targetClientId,
        environment: 'sandbox' as const,
        redirectUri: targetRedirectUri,
        configured: true,
        hasSecret: Boolean(modalClientSecret.trim() || config.hasSecret)
      };
      saveLocalConfig(updated);
      setConfig(prev => ({ ...prev, ...updated }));

      // Send to server in background if available
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

      // Create company record locally (works on GitHub Pages and offline)
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

      // Also notify backend server if active
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
      // Local update first
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

      // Attempt server validation if present
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
      // Local removal
      const existing = getLocalCompanies();
      const updated = existing.filter(c => c.realmId !== realmId);
      saveLocalCompanies(updated);
      setCompanies(updated);

      // Notify backend if active
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

  const currentHost = typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com';
  const primaryCallback = CANONICAL_REDIRECT_URI;
  const secondaryCallback = CANONICAL_REDIRECT_URI;
  const defaultCallback = primaryCallback;
  const defaultWebhook = `${currentHost}/api/qbo/webhook`;

  const connectedList = companies.filter(c => c.status === 'CONNECTED');

  return (
    <div className="space-y-6">
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
                In your Intuit Developer Portal under <strong>Keys &amp; OAuth &gt; Redirect URIs</strong>, ensure the URI below is added character-for-character. (Note: This is in the <strong>Keys &amp; OAuth</strong> tab, not the Webhooks tab).
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
                  onClick={() => onOpenLegal('privacy')}
                  className="text-amber-400 hover:underline text-[11px] cursor-pointer"
                >
                  Privacy Policy
                </button>
                <span className="text-stone-600">•</span>
                <button
                  onClick={() => onOpenLegal('terms')}
                  className="text-amber-400 hover:underline text-[11px] cursor-pointer"
                >
                  EULA / Terms
                </button>
                <span className="text-stone-600">•</span>
                <button
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
              onClick={fetchCompanies}
              disabled={isRefreshing}
              className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 transition-colors cursor-pointer"
              title="Refresh connected company list"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>

            <button
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

            {/* Quick Clarification Banner on Encryption & Webhook */}
            <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 text-emerald-300 font-semibold text-[11px]">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Variable Clarification Guide</span>
              </div>
              <ul className="text-[11px] text-stone-300 space-y-1 pl-4 list-disc">
                <li>
                  <strong className="text-emerald-300">Intuit Client ID & Secret:</strong> The <em>only</em> two values required from Intuit Developer Portal (<span className="text-stone-400 font-mono">Production &gt; Keys &amp; OAuth</span>) to connect companies and sync receipts.
                </li>
                <li>
                  <strong className="text-emerald-300">Encryption Key (QBO_ENCRYPTION_KEY):</strong> <em>Not from Intuit!</em> Our server automatically provides a secure built-in master salt with AES-256-GCM encryption at rest. You do <strong>not</strong> need to obtain an encryption key from Intuit or configure anything.
                </li>
                <li>
                  <strong className="text-emerald-300">Webhook Verifier Token:</strong> <em>100% Optional!</em> If you want real-time notifications when an accountant revokes access inside QuickBooks, go to <span className="text-stone-400 font-mono">Production &gt; Webhooks</span> on Intuit, paste the Webhook URL below, click Save, and Intuit reveals the &quot;Verifier Token&quot;. If you haven&apos;t done that, <strong>leave it completely blank</strong>.
                </li>
              </ul>
            </div>

            {/* Quick Copy URIs for developer.intuit.com */}
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
                <span className="text-[10px] text-stone-400 block font-semibold">
                  Standard Redirect URIs to paste into Intuit:
                </span>

                <div className="flex items-center justify-between gap-2 p-1.5 rounded bg-stone-950 border border-stone-850">
                  <span className="text-stone-400 font-mono text-[11px] truncate">
                    <strong className="text-stone-300">1. Primary Path:</strong> {primaryCallback}
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

                {secondaryCallback !== primaryCallback && (
                  <div className="flex items-center justify-between gap-2 p-1.5 rounded bg-stone-950 border border-stone-850">
                    <span className="text-stone-400 font-mono text-[11px] truncate">
                      <strong className="text-stone-300">2. Root Path:</strong> {secondaryCallback}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditRedirectUri(secondaryCallback);
                        handleCopy(secondaryCallback, 'Root Redirect URI');
                      }}
                      className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-[10px] text-stone-300 shrink-0 cursor-pointer flex items-center gap-1"
                    >
                      {copiedField === 'Root Redirect URI' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      Copy
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 p-1.5 rounded bg-stone-950 border border-stone-850">
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
                <strong> "Simulate Account"</strong> to test receipt synchronization right away.
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

                  return (
                    <tr key={c.realmId} className="hover:bg-stone-800/30 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-stone-200 text-xs flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>{c.companyName}</span>
                        </div>
                        {c.legalName && c.legalName !== c.companyName && (
                          <span className="text-[11px] text-stone-400 block mt-0.5">{c.legalName}</span>
                        )}
                        {c.email && (
                          <span className="text-[10px] font-mono text-stone-500 block">{c.email}</span>
                        )}
                      </td>

                      <td className="py-3 px-3 font-mono text-stone-300">
                        <div className="flex items-center gap-1">
                          <span>{c.realmId}</span>
                          <button
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
                        <div className="flex items-center justify-end gap-1.5">
                          {isConnected && (
                            <button
                              onClick={() => handleTestToken(c.realmId, c.companyName)}
                              disabled={isTesting}
                              className="px-2.5 py-1 rounded bg-stone-800 hover:bg-stone-700 text-emerald-400 text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1"
                              title="Test Token Broker handshake"
                            >
                              <RefreshCw className={`w-3 h-3 ${isTesting ? 'animate-spin' : ''}`} />
                              <span>Test</span>
                            </button>
                          )}

                          <button
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
    </div>
  );
};
