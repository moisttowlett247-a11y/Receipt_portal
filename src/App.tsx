import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Key, 
  RefreshCw, 
  Download, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  FileCode2, 
  Copy, 
  Terminal, 
  Layers, 
  Sparkles,
  Lock,
  Unlock,
  KeyRound,
  LogOut,
  ExternalLink,
  ChevronRight,
  Info,
  Check,
  Bell,
  Crown,
  Infinity as InfinityIcon,
  ShieldAlert,
  Clock,
  Globe
} from 'lucide-react';
import { 
  LicenseKeyRecord, 
  LicenseStatus, 
  PlanTier, 
  generatePlanKey, 
  generateAdminKey, 
  getPlanDurationDays, 
  getPlanLabel, 
  calculateExpirationDate 
} from './types';
import { LicenseManagerTable } from './components/LicenseManagerTable';
import { AdminPinModal } from './components/AdminPinModal';
import { ClientPortalView } from './components/ClientPortalView';
import { AdminLoginView } from './components/AdminLoginView';

// No hardcoded client keys or private emails committed to repository
const INITIAL_KEYS: LicenseKeyRecord[] = [];

export default function App() {
  const [activeTab, setActiveTab] = useState<'licensing' | 'updater' | 'code' | 'guide'>('licensing');
  
  // Persistent License Keys registry state
  const [licenseKeys, setLicenseKeys] = useState<LicenseKeyRecord[]>(() => {
    try {
      const savedV4 = localStorage.getItem('receipt_processor_keys_v4');
      if (savedV4) {
        return JSON.parse(savedV4);
      }
      const savedV3 = localStorage.getItem('receipt_processor_keys_v3');
      if (savedV3) {
        return JSON.parse(savedV3);
      }
    } catch {
      // ignore
    }
    return INITIAL_KEYS;
  });

  // Save changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('receipt_processor_keys_v4', JSON.stringify(licenseKeys));
    } catch {
      // ignore
    }
  }, [licenseKeys]);

  // Licensing generator state
  const [clientName, setClientName] = useState('Prairie Wind Agriculture');
  const [clientEmail, setClientEmail] = useState('billing@example.com');
  const [planType, setPlanType] = useState<PlanTier>('MONTHLY');
  const [markInUseOnGen, setMarkInUseOnGen] = useState(true);
  const [initialStatusOnGen, setInitialStatusOnGen] = useState<LicenseStatus>('ACTIVE');
  const [generatedKey, setGeneratedKey] = useState(() => generatePlanKey('MONTHLY'));
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Admin Master Key Generator state (Non-Expiring)
  const [adminName, setAdminName] = useState('Platform Owner / Lead Admin');
  const [adminEmail, setAdminEmail] = useState('admin@example.com');
  const [adminFlavor, setAdminFlavor] = useState<'MASTER' | 'VIP' | 'DEV'>('MASTER');
  const [generatedAdminKey, setGeneratedAdminKey] = useState(() => generateAdminKey('MASTER'));
  const [adminCopied, setAdminCopied] = useState(false);

  // License validator state
  const [testKeyInput, setTestKeyInput] = useState('MONTHLY-9842-8710-2026');
  const [testResult, setTestResult] = useState<{ allowed: boolean; message: string; record?: LicenseKeyRecord } | null>(null);

  // Update simulator state
  const [currentVersion, setCurrentVersion] = useState('1.0.0');
  const [latestRemoteVersion, setLatestRemoteVersion] = useState('1.1.0');
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);

  const [copied, setCopied] = useState(false);
  const [isGhModalOpen, setIsGhModalOpen] = useState(false);

  // URL Route Detection for separating Client Portal from Admin Portal
  const checkIsAdminPath = (): boolean => {
    if (typeof window === 'undefined') return false;
    const path = window.location.pathname.toLowerCase();
    const hash = window.location.hash.toLowerCase();
    const search = window.location.search.toLowerCase();
    return (
      path.endsWith('/admin') ||
      path.includes('/admin/') ||
      hash === '#admin' ||
      hash === '#/admin' ||
      search.includes('p=admin') ||
      search.includes('admin=true') ||
      search.includes('portal=admin') ||
      search.includes('view=admin')
    );
  };

  const [isAdminRoute, setIsAdminRoute] = useState<boolean>(checkIsAdminPath);

  useEffect(() => {
    const handleLocationChange = () => {
      setIsAdminRoute(checkIsAdminPath());
    };
    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  const navigateTo = (path: '/' | '/admin') => {
    if (path === '/admin') {
      window.history.pushState({}, '', '/admin');
    } else {
      window.history.pushState({}, '', '/');
    }
    setIsAdminRoute(checkIsAdminPath());
  };

  // Admin Master Credentials security gate state (Username & Salted SHA-256 Password Hash)
  const [adminUsername, setAdminUsername] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem('receipt_processor_admin_user');
      return saved ? saved.trim() : null;
    } catch {
      return null;
    }
  });

  const [adminCredHash, setAdminCredHash] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem('receipt_processor_admin_cred_hash');
      if (saved && saved.trim()) return saved.trim();
      return null;
    } catch {
      return null;
    }
  });

  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('receipt_processor_admin_auth') === 'true';
    } catch {
      return false;
    }
  });

  const [showPinModal, setShowPinModal] = useState<boolean>(false);

  const handleSaveCredentials = (username: string, hash: string) => {
    setAdminUsername(username);
    setAdminCredHash(hash);
    try {
      localStorage.setItem('receipt_processor_admin_user', username);
      localStorage.setItem('receipt_processor_admin_cred_hash', hash);
    } catch {}
    showToast(`Admin account (${username}) saved securely.`);
  };

  const handleImportKeys = (imported: LicenseKeyRecord[]) => {
    setLicenseKeys(imported);
    try {
      localStorage.setItem('receipt_processor_keys_v4', JSON.stringify(imported));
    } catch {}
    showToast(`Successfully imported ${imported.length} license key records.`);
  };

  const handleAdminUnlockSuccess = () => {
    setIsAdminUnlocked(true);
    try {
      sessionStorage.setItem('receipt_processor_admin_auth', 'true');
    } catch {}
    showToast('Admin credentials verified. Management Console Unlocked.');
  };

  const handleLockAdminPanel = () => {
    setIsAdminUnlocked(false);
    try {
      sessionStorage.removeItem('receipt_processor_admin_auth');
    } catch {}
    showToast('Admin Console locked.');
  };

  const handleUpdateCredentials = (newUsername: string, newHash: string) => {
    setAdminUsername(newUsername);
    setAdminCredHash(newHash);
    try {
      localStorage.setItem('receipt_processor_admin_user', newUsername);
      localStorage.setItem('receipt_processor_admin_cred_hash', newHash);
    } catch {}
    showToast(`Admin credentials updated for ${newUsername}!`);
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 4000);
  };

  const handleSelectPlan = (tier: PlanTier) => {
    setPlanType(tier);
    const newKey = generatePlanKey(tier);
    setGeneratedKey(newKey);
    setTestKeyInput(newKey);
    setTestResult(null);
    showToast(`Switched plan to ${tier}. Key preview updated: ${newKey}`);
  };

  const handleRerollKey = () => {
    const newKey = generatePlanKey(planType);
    setGeneratedKey(newKey);
    setTestKeyInput(newKey);
    setTestResult(null);
    showToast(`Generated new ${planType} key: ${newKey}`);
  };

  const handleSelectAdminFlavor = (flavor: 'MASTER' | 'VIP' | 'DEV') => {
    setAdminFlavor(flavor);
    const newKey = generateAdminKey(flavor);
    setGeneratedAdminKey(newKey);
    showToast(`Selected Admin Tier: ${flavor}. Key preview: ${newKey}`);
  };

  const handleRerollAdminKey = () => {
    const newKey = generateAdminKey(adminFlavor);
    setGeneratedAdminKey(newKey);
    showToast(`Rerolled Admin Key: ${newKey}`);
  };

  const handleGenerateAdminKey = () => {
    const keyToRegister = generatedAdminKey;
    const today = new Date().toISOString().split('T')[0];
    
    const newAdminRecord: LicenseKeyRecord = {
      id: `admin-key-${Date.now()}`,
      key: keyToRegister,
      clientName: adminName.trim() || `Admin (${adminFlavor})`,
      clientEmail: adminEmail.trim() || 'admin@farmtax.com',
      plan: 'ADMIN',
      status: 'ACTIVE',
      inUse: true,
      issuedDate: today,
      activatedDate: today,
      expiresDate: 'Never (Lifetime / Non-Expiring)',
      hardwareId: `HW-ADMIN-${adminFlavor}-${Math.floor(1000 + Math.random() * 9000)}`,
      notes: `Perpetual Admin Master Key (${adminFlavor}) - Never Expires`
    };

    setLicenseKeys(prev => [newAdminRecord, ...prev]);
    const nextKey = generateAdminKey(adminFlavor);
    setGeneratedAdminKey(nextKey);

    showToast(`👑 Registered Non-Expiring Admin Key: ${keyToRegister} (Never Expires)`);
  };

  const handleQuickTestKey = (keyString: string) => {
    setTestKeyInput(keyString);
    setTestResult(null);
    showToast(`Loaded ${keyString} into In-App Validator. Click 'Run Validation Test' to verify.`);
  };

  const handleGenerateKey = () => {
    const keyToRegister = generatedKey;
    const today = new Date().toISOString().split('T')[0];
    const activated = markInUseOnGen ? today : undefined;
    const expires = markInUseOnGen
      ? calculateExpirationDate(today, planType)
      : `Pending (${getPlanDurationDays(planType)} days upon activation)`;
    
    // Create new registry record
    const newRecord: LicenseKeyRecord = {
      id: `key-${Date.now()}`,
      key: keyToRegister,
      clientName: clientName.trim() || `${getPlanLabel(planType)} Subscriber`,
      clientEmail: clientEmail.trim() || 'client@farmtax.com',
      plan: planType,
      status: initialStatusOnGen,
      inUse: markInUseOnGen,
      issuedDate: today,
      activatedDate: activated,
      expiresDate: expires,
      notes: `Generated on ${new Date().toLocaleDateString()}`
    };

    setLicenseKeys(prev => [newRecord, ...prev]);
    setTestKeyInput(keyToRegister);
    setTestResult(null);

    // Prepare next fresh key for this tier
    const nextKey = generatePlanKey(planType);
    setGeneratedKey(nextKey);

    showToast(`Key ${keyToRegister} added to Admin Registry for ${newRecord.clientName} (${newRecord.plan} Plan - ${getPlanDurationDays(planType)} days duration)`);
  };

  const handleToggleStatus = (id: string) => {
    setLicenseKeys(prev => prev.map(k => {
      if (k.id === id) {
        const nextStatus: LicenseStatus = k.status === 'ACTIVE' ? 'NOT ACTIVE' : 'ACTIVE';
        showToast(`Key ${k.key} status updated to: ${nextStatus}`);
        return { ...k, status: nextStatus };
      }
      return k;
    }));
  };

  const handleToggleInUse = (id: string) => {
    setLicenseKeys(prev => prev.map(k => {
      if (k.id === id) {
        const nextInUse = !k.inUse;
        const today = new Date().toISOString().split('T')[0];
        const newActivatedDate = nextInUse ? (k.activatedDate || today) : k.activatedDate;
        const newExpiresDate = nextInUse 
          ? (k.expiresDate && !k.expiresDate.startsWith('Pending') ? k.expiresDate : calculateExpirationDate(newActivatedDate!, k.plan))
          : k.expiresDate;
        showToast(`Key ${k.key} marked as ${nextInUse ? `In Use (Activated: ${newActivatedDate}, Expires: ${newExpiresDate})` : 'Unclaimed / Available'}`);
        return { 
          ...k, 
          inUse: nextInUse,
          activatedDate: newActivatedDate,
          expiresDate: newExpiresDate
        };
      }
      return k;
    }));
  };

  const handleDeleteKey = (id: string) => {
    setLicenseKeys(prev => {
      const target = prev.find(k => k.id === id);
      if (target) {
        showToast(`Key ${target.key} removed from registry.`);
      }
      return prev.filter(k => k.id !== id);
    });
  };

  const handleAddManualKey = (record: Omit<LicenseKeyRecord, 'id'>) => {
    const newRecord: LicenseKeyRecord = {
      ...record,
      id: `manual-key-${Date.now()}`
    };
    setLicenseKeys(prev => [newRecord, ...prev]);
    showToast(`Key ${newRecord.key} registered (${newRecord.status})`);
  };

  const handleTestKey = () => {
    const clean = testKeyInput.trim().toUpperCase();
    
    // Check if key exists in authorized admin registry:
    const matchedRecord = licenseKeys.find(k => k.key.toUpperCase() === clean);

    if (!matchedRecord) {
      setTestResult({
        allowed: false,
        message: `License Not Found: "${clean}" is not in the authorized registry. Please register this key in the Admin Portal or verify your license string.`
      });
      return;
    }

    // Check if key has been revoked or toggled to NOT ACTIVE
    if (matchedRecord.status === 'NOT ACTIVE') {
      setTestResult({
        allowed: false,
        message: `Access Denied: Key is marked "NOT ACTIVE" (Revoked or Suspended) by the administrator. Processing is locked.`,
        record: matchedRecord
      });
      return;
    }

    // Check if Admin Master (Never Expires / Lifetime)
    if (matchedRecord.plan === 'ADMIN' || matchedRecord.expiresDate?.includes('Never')) {
      setTestResult({
        allowed: true,
        message: `👑 Admin Master Verified ACTIVE! User is ALLOWED. Plan: Admin Master (Non-Expiring / Lifetime License). Client: ${matchedRecord.clientName}. Validity: NEVER EXPIRES. Full scanning, OCR extraction, and export access granted.`,
        record: matchedRecord
      });
      return;
    }

    // Check if expired
    const isExpired = matchedRecord.status === 'EXPIRED' || (
      matchedRecord.expiresDate && 
      !matchedRecord.expiresDate.startsWith('Pending') && 
      new Date(matchedRecord.expiresDate).getTime() < new Date().setHours(0, 0, 0, 0)
    );

    if (isExpired) {
      setTestResult({
        allowed: false,
        message: `Access Denied: Key EXPIRED on ${matchedRecord.expiresDate}. ${getPlanLabel(matchedRecord.plan)} subscription lapsed. Scanning is locked.`,
        record: matchedRecord
      });
      return;
    }

    // If key is Active but not yet activated/in-use, activate it now!
    if (!matchedRecord.inUse || !matchedRecord.activatedDate) {
      const today = new Date().toISOString().split('T')[0];
      const calculatedExpires = calculateExpirationDate(today, matchedRecord.plan);
      
      // Update the record with activation timestamp and computed expiration
      setLicenseKeys(prev => prev.map(k => {
        if (k.id === matchedRecord.id) {
          return {
            ...k,
            inUse: true,
            activatedDate: today,
            expiresDate: calculatedExpires
          };
        }
        return k;
      }));

      setTestResult({
        allowed: true,
        message: `🎉 First-Time Activation Successful! Logged activation on ${today}. Plan: ${matchedRecord.plan} (${getPlanLabel(matchedRecord.plan)} - ${getPlanDurationDays(matchedRecord.plan)} Days). Expires on ${calculatedExpires}. User is ALLOWED.`,
        record: {
          ...matchedRecord,
          inUse: true,
          activatedDate: today,
          expiresDate: calculatedExpires
        }
      });
      showToast(`Logged activation for key ${matchedRecord.key} on ${today}! Valid until ${calculatedExpires}`);
      return;
    }

    // Already active and in use
    setTestResult({
      allowed: true,
      message: `Subscription Verified ACTIVE. User is ALLOWED. Plan: ${matchedRecord.plan} (${getPlanLabel(matchedRecord.plan)} - ${getPlanDurationDays(matchedRecord.plan)} Days). Client: ${matchedRecord.clientName} (${matchedRecord.clientEmail || 'N/A'}). Activated on: ${matchedRecord.activatedDate}. Expires: ${matchedRecord.expiresDate}. (Notice: Key is already marked IN USE. Re-activation across multiple workstations is restricted).`,
      record: matchedRecord
    });
    return;
  };

  const handleStartUpdateDownload = () => {
    setIsDownloading(true);
    setDownloadProgress(0);
    const interval = setInterval(() => {
      setDownloadProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsDownloading(false);
          setCurrentVersion(latestRemoteVersion);
          setShowUpdateModal(false);
          return 100;
        }
        return prev + 25;
      });
    }, 400);
  };

  const handleDownloadPythonScript = () => {
    const link = document.createElement('a');
    link.href = '/receipt_processor.py';
    link.download = 'receipt_processor.py';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copyPythonCode = async () => {
    try {
      const resp = await fetch('/receipt_processor.py');
      const text = await resp.text();
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      alert('File ready for download below!');
    }
  };

  // 1. Client Facing Portal (Separate URL: `/`)
  // Has zero admin login buttons, links, or triggers for clients
  if (!isAdminRoute) {
    return (
      <>
        <ClientPortalView
          onDownloadScript={handleDownloadPythonScript}
          licenseKeys={licenseKeys}
          currentVersion={currentVersion}
          onGoToAdmin={() => navigateTo('/admin')}
        />

        {/* Global Toast */}
        {toastMessage && (
          <div className="fixed bottom-6 right-6 z-50 bg-stone-900 border border-amber-500/50 text-stone-100 text-xs px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-medium">{toastMessage}</span>
            <button 
              onClick={() => setToastMessage(null)} 
              className="ml-2 text-stone-400 hover:text-stone-200 cursor-pointer p-0.5"
            >
              ✕
            </button>
          </div>
        )}
      </>
    );
  }

  // 2. Admin URL (`/admin` or `#/admin`): If not unlocked, render Dedicated Admin Login
  if (!isAdminUnlocked) {
    return (
      <>
        <AdminLoginView
          onUnlock={handleAdminUnlockSuccess}
          savedHash={adminCredHash}
          onSaveCredentials={handleSaveCredentials}
          onGoToClientPortal={() => navigateTo('/')}
        />

        {/* Global Toast */}
        {toastMessage && (
          <div className="fixed bottom-6 right-6 z-50 bg-stone-900 border border-amber-500/50 text-stone-100 text-xs px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-medium">{toastMessage}</span>
            <button 
              onClick={() => setToastMessage(null)} 
              className="ml-2 text-stone-400 hover:text-stone-200 cursor-pointer p-0.5"
            >
              ✕
            </button>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col font-sans antialiased selection:bg-amber-500 selection:text-stone-950">
      {/* Top Navigation Bar with Admin Controls */}
      <header className="border-b border-stone-800 bg-stone-900/90 backdrop-blur sticky top-0 z-30 px-6 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold tracking-tight text-stone-100">
                Receipt Processor Admin Console
              </h1>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                v{currentVersion}
              </span>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 flex items-center gap-1">
                <Crown className="w-3 h-3 text-amber-400" />
                Admin Authenticated
              </span>
            </div>
            <p className="text-xs text-stone-400">
              Subscription Management, In-Place Auto-Updates & AES-256 Multi-Client Sync
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Change Admin Account button */}
          <button
            onClick={() => setShowPinModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 rounded-md transition-colors cursor-pointer"
            title="Change Admin Login Credentials"
          >
            <KeyRound className="w-3.5 h-3.5 text-amber-400" />
            <span>Account</span>
          </button>

          <button
            onClick={() => {
              setShowUpdateModal(true);
              setUpdateDismissed(false);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 rounded-md transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-sky-400" />
            <span>Updates</span>
          </button>

          {/* GitHub Direct Cloud Sync button */}
          <button
            onClick={() => {
              setActiveTab('licensing');
              setIsGhModalOpen(true);
            }}
            className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white border border-sky-400/50 rounded-lg shadow-md transition-all cursor-pointer ring-1 ring-sky-400/40"
            title="Configure GitHub Repository & Personal Access Token for direct hash sync"
          >
            <Globe className="w-4 h-4 text-sky-200 animate-pulse" />
            <span>GitHub Sync</span>
          </button>
          
          <button
            onClick={handleDownloadPythonScript}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white rounded-md shadow-sm transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Script</span>
          </button>

          {/* View Public Portal link */}
          <button
            onClick={() => navigateTo('/')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white border border-stone-700 rounded-md transition-colors cursor-pointer"
            title="Switch to Public Client Portal"
          >
            <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
            <span>Public Portal</span>
          </button>

          {/* Lock Admin Panel button */}
          <button
            onClick={handleLockAdminPanel}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-200 rounded-md transition-all shadow-sm cursor-pointer ml-1"
            title="Lock Admin Console"
          >
            <Lock className="w-3.5 h-3.5 text-rose-400" />
            <span>Lock Console</span>
          </button>
        </div>
      </header>

      {/* Main Tab Navigation */}
      <nav className="border-b border-stone-800/80 bg-stone-900/40 px-6 flex gap-2">
        <button
          onClick={() => setActiveTab('licensing')}
          className={`px-4 py-3 text-xs font-medium flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'licensing'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-stone-400 hover:text-stone-200'
          }`}
        >
          <Key className="w-4 h-4" />
          <span>Subscription & Key Registry</span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 ml-1">
            {licenseKeys.filter(k => k.status === 'ACTIVE').length} Active / {licenseKeys.length} Total
          </span>
        </button>

        <button
          onClick={() => setActiveTab('updater')}
          className={`px-4 py-3 text-xs font-medium flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'updater'
              ? 'border-sky-500 text-sky-400'
              : 'border-transparent text-stone-400 hover:text-stone-200'
          }`}
        >
          <RefreshCw className="w-4 h-4" />
          Auto-Update System & Dismissible Modal
        </button>

        <button
          onClick={() => setActiveTab('guide')}
          className={`px-4 py-3 text-xs font-medium flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'guide'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-stone-400 hover:text-stone-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          Subscription Architecture Guide
        </button>

        <button
          onClick={() => setActiveTab('code')}
          className={`px-4 py-3 text-xs font-medium flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'code'
              ? 'border-purple-500 text-purple-400'
              : 'border-transparent text-stone-400 hover:text-stone-200'
          }`}
        >
          <FileCode2 className="w-4 h-4" />
          Integrated Python Code
        </button>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
        {/* TAB 1: LICENSING */}
        {activeTab === 'licensing' && (
          <div className="space-y-6">
            {/* Explanatory Banner */}
            <div className="p-5 rounded-xl bg-stone-900 border border-stone-800 flex flex-col md:flex-row gap-5 items-start justify-between">
              <div className="space-y-2 max-w-3xl">
                <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
                  <Lock className="w-4 h-4" />
                  How Allowed vs. Not-Allowed Users Works in Your Desktop App
                </div>
                <p className="text-xs leading-relaxed text-stone-300">
                  Because this is a paid subscription service, the desktop application contains a built-in <strong className="text-white">Subscription Gate</strong>. 
                  When an unlicensed user attempts to scan receipts, the software blocks execution, alerts them that a subscription is required, and displays the activation modal.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div className="p-2.5 rounded bg-stone-950/60 border border-stone-800 text-xs">
                    <span className="font-semibold text-emerald-400 block mb-1">1. Allowed Users</span>
                    Have an active key or valid API server response. Hardware ID matches and expiration date is in the future.
                  </div>
                  <div className="p-2.5 rounded bg-stone-950/60 border border-stone-800 text-xs">
                    <span className="font-semibold text-rose-400 block mb-1">2. Not-Allowed Users</span>
                    Unlicensed, expired, or canceled users. The app locks scanning features and preserves local data until payment.
                  </div>
                  <div className="p-2.5 rounded bg-stone-950/60 border border-stone-800 text-xs">
                    <span className="font-semibold text-sky-400 block mb-1">3. Offline Grace Period</span>
                    Stores an encrypted local license snapshot (`.license_vault.json`) so rural farmers without internet can still work.
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-stone-950 border border-stone-800 text-center w-full md:w-72 shrink-0 space-y-3">
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-stone-400 font-medium block">Registry Status</span>
                  <div className="flex items-center justify-center gap-4 mt-2">
                    <div>
                      <div className="text-base font-bold text-stone-100">{licenseKeys.length}</div>
                      <div className="text-[10px] text-stone-500">Total Keys</div>
                    </div>
                    <div>
                      <div className="text-base font-bold text-emerald-400">{licenseKeys.filter(k => k.status === 'ACTIVE').length}</div>
                      <div className="text-[10px] text-stone-500">Active</div>
                    </div>
                    <div>
                      <div className="text-base font-bold text-sky-400">{licenseKeys.filter(k => k.inUse).length}</div>
                      <div className="text-[10px] text-stone-500">In Use</div>
                    </div>
                  </div>
                </div>
                <div className="pt-2 border-t border-stone-800/80">
                  <span className="text-[11px] text-stone-400 flex items-center justify-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-emerald-400" />
                    Private Local Vault
                  </span>
                  <span className="text-[10px] text-stone-500 block mt-0.5">Keys stored locally in browser/vault</span>
                </div>
              </div>
            </div>

            {/* Dedicated Section: Generate Admin Keys That Don't Expire */}
            <div className="p-5 rounded-xl bg-gradient-to-r from-stone-900 via-stone-900 to-sky-950/40 border border-sky-900/60 shadow-lg relative overflow-hidden">
              <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-stone-800 gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 shadow-inner">
                    <Crown className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-stone-100 flex items-center gap-2">
                      Generate Admin Keys (Never Expire)
                      <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-sky-950 border border-sky-800 text-sky-300 font-semibold">
                        Perpetual Master Access
                      </span>
                    </h3>
                    <p className="text-xs text-stone-400">
                      Create non-expiring master licenses for yourself, team admins, or partner workstations with permanent unrestricted access.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-sky-950/90 border border-sky-800/80 text-sky-300 shadow-sm">
                    <InfinityIcon className="w-3.5 h-3.5 text-sky-400" />
                    Lifetime / Non-Expiring
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mt-4">
                {/* Admin Inputs */}
                <div className="lg:col-span-7 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-stone-300 block mb-1">Admin / Operator Name</label>
                      <input
                        type="text"
                        value={adminName}
                        onChange={(e) => setAdminName(e.target.value)}
                        placeholder="e.g. Lead Accountant / Platform Owner"
                        className="w-full text-xs px-3 py-2 bg-stone-950 border border-stone-800 rounded text-stone-200 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-stone-300 block mb-1">Admin Email</label>
                      <input
                        type="email"
                        value={adminEmail}
                        onChange={(e) => setAdminEmail(e.target.value)}
                        placeholder="e.g. admin@farmtax.com"
                        className="w-full text-xs px-3 py-2 bg-stone-950 border border-stone-800 rounded text-stone-200 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>

                  {/* Flavor / Role Selector */}
                  <div>
                    <label className="text-xs font-medium text-stone-300 block mb-1.5">Admin Key Role & Format</label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => handleSelectAdminFlavor('MASTER')}
                        className={`p-2.5 rounded-lg text-left border transition-all cursor-pointer ${
                          adminFlavor === 'MASTER'
                            ? 'bg-sky-950/70 border-sky-500 text-sky-200 shadow-sm'
                            : 'bg-stone-950/60 border-stone-800 text-stone-400 hover:border-stone-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs font-bold font-mono">ADMIN-MASTER</span>
                          {adminFlavor === 'MASTER' && <Check className="w-3.5 h-3.5 text-sky-400" />}
                        </div>
                        <span className="text-[10px] block text-stone-400">Primary Owner Master</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSelectAdminFlavor('VIP')}
                        className={`p-2.5 rounded-lg text-left border transition-all cursor-pointer ${
                          adminFlavor === 'VIP'
                            ? 'bg-sky-950/70 border-sky-500 text-sky-200 shadow-sm'
                            : 'bg-stone-950/60 border-stone-800 text-stone-400 hover:border-stone-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs font-bold font-mono">ADMIN-VIP</span>
                          {adminFlavor === 'VIP' && <Check className="w-3.5 h-3.5 text-sky-400" />}
                        </div>
                        <span className="text-[10px] block text-stone-400">VIP Partner Lifetime</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSelectAdminFlavor('DEV')}
                        className={`p-2.5 rounded-lg text-left border transition-all cursor-pointer ${
                          adminFlavor === 'DEV'
                            ? 'bg-sky-950/70 border-sky-500 text-sky-200 shadow-sm'
                            : 'bg-stone-950/60 border-stone-800 text-stone-400 hover:border-stone-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs font-bold font-mono">ADMIN-DEV</span>
                          {adminFlavor === 'DEV' && <Check className="w-3.5 h-3.5 text-sky-400" />}
                        </div>
                        <span className="text-[10px] block text-stone-400">Developer Station</span>
                      </button>
                    </div>
                  </div>

                  {/* Entitlements summary banner */}
                  <div className="p-2.5 rounded-lg bg-sky-950/30 border border-sky-900/40 text-[11px] text-sky-300 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="flex items-center gap-1 font-medium">
                      <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
                      Duration: <strong>Infinite (Perpetual)</strong>
                    </span>
                    <span className="flex items-center gap-1 font-medium">
                      <Clock className="w-3.5 h-3.5 text-sky-400" />
                      Expires: <strong>Never (Non-Expiring)</strong>
                    </span>
                    <span className="flex items-center gap-1 font-medium text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Instant Pre-Activation
                    </span>
                  </div>
                </div>

                {/* Key Output & Actions */}
                <div className="lg:col-span-5 flex flex-col justify-between p-4 rounded-xl bg-stone-950 border border-stone-800">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono text-stone-400 uppercase tracking-wider">Generated Non-Expiring Admin Key</span>
                      <button
                        type="button"
                        onClick={handleRerollAdminKey}
                        className="text-[11px] text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer font-medium"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Reroll Key
                      </button>
                    </div>

                    <div className="p-3 bg-stone-900 rounded-lg border border-sky-900/60 flex items-center justify-between gap-2 shadow-inner">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <Crown className="w-4 h-4 text-amber-400 shrink-0" />
                        <code className="text-xs sm:text-sm font-mono font-bold text-sky-300 tracking-wider truncate select-all">
                          {generatedAdminKey}
                        </code>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(generatedAdminKey);
                          setAdminCopied(true);
                          setTimeout(() => setAdminCopied(false), 2000);
                          showToast(`Copied ${generatedAdminKey} to clipboard`);
                        }}
                        className="p-1.5 rounded-md bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white transition-colors cursor-pointer shrink-0"
                        title="Copy Key"
                      >
                        {adminCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 mt-4 pt-3 border-t border-stone-800/80">
                    <button
                      type="button"
                      onClick={handleGenerateAdminKey}
                      className="w-full py-2.5 px-3 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer active:scale-[0.99]"
                    >
                      <Crown className="w-3.5 h-3.5 text-amber-300" />
                      Register Non-Expiring Admin Key
                    </button>

                    <button
                      type="button"
                      onClick={() => handleQuickTestKey(generatedAdminKey)}
                      className="w-full py-1.5 px-3 bg-stone-900 hover:bg-stone-800 text-stone-300 hover:text-white rounded-lg text-xs font-medium border border-stone-800 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Key className="w-3 h-3 text-amber-400" />
                      Load into Validator to Test
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Interactive Key Generator & Validator */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Creator: Key Generator */}
              <div className="p-5 rounded-xl bg-stone-900 border border-stone-800 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-stone-800">
                    <h3 className="text-sm font-semibold text-stone-200 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      Client License Generator (For You)
                    </h3>
                    <span className="text-[11px] font-mono text-stone-400">Admin Tool</span>
                  </div>

                  <p className="text-xs text-stone-400 mt-3 mb-4">
                    Use this tool when a client signs up for your subscription. Generate a unique license key tied to their farm account.
                  </p>

                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-stone-300 block mb-1">Client Business Name</label>
                      <input
                        type="text"
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                        className="w-full text-xs px-3 py-2 bg-stone-950 border border-stone-800 rounded text-stone-200 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-stone-300 block mb-1">Subscriber Email</label>
                      <input
                        type="email"
                        value={clientEmail}
                        onChange={(e) => setClientEmail(e.target.value)}
                        className="w-full text-xs px-3 py-2 bg-stone-950 border border-stone-800 rounded text-stone-200 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-medium text-stone-300">Subscription Tier & Duration</label>
                        <span className="text-[10px] text-amber-400 font-medium">Auto-calculates expiration date</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {([
                          { tier: 'MONTHLY' as const, label: 'Monthly', days: 30, code: 'MONTHLY-XXXX' },
                          { tier: '3MONTH' as const, label: '3 Month', days: 90, code: '3MONTH-XXXX' },
                          { tier: '6MONTH' as const, label: '6 Month', days: 180, code: '6MONTH-XXXX' },
                          { tier: 'ANNUAL' as const, label: 'Annual', days: 365, code: 'ANNUAL-XXXX' },
                          { tier: 'DEMO' as const, label: 'Demo Trial', days: 7, code: 'DEMO-XXXX' }
                        ]).map(({ tier, label, days, code }) => (
                          <button
                            key={tier}
                            type="button"
                            onClick={() => handleSelectPlan(tier)}
                            className={`py-2 px-2.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                              planType === tier
                                ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-sm shadow-amber-950 ring-1 ring-amber-500/40'
                                : 'bg-stone-950 border-stone-800 text-stone-400 hover:text-stone-200 hover:border-stone-700'
                            }`}
                          >
                            <span className="font-bold">{label}</span>
                            <span className="text-[10px] font-mono text-amber-400/90">{days} Days</span>
                            <span className="text-[9px] font-mono opacity-60">{code}</span>
                          </button>
                        ))}
                      </div>
                      <div className="mt-2 px-3 py-1.5 rounded bg-stone-950/70 border border-stone-800/80 flex items-center justify-between text-[11px] text-stone-400">
                        <span>Duration: <strong className="text-amber-400">{getPlanDurationDays(planType)} days</strong> upon activation</span>
                        <span>Preview Expiration: <strong className="text-stone-200">{calculateExpirationDate(new Date().toISOString().split('T')[0], planType)}</strong></span>
                      </div>
                    </div>

                    <div>
                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div>
                          <label className="text-xs font-medium text-stone-300 block mb-1">Status on Creation</label>
                          <select
                            value={initialStatusOnGen}
                            onChange={(e) => setInitialStatusOnGen(e.target.value as LicenseStatus)}
                            className="w-full text-xs px-2.5 py-1.5 bg-stone-950 border border-stone-800 rounded text-stone-200 focus:outline-none focus:border-amber-500"
                          >
                            <option value="ACTIVE">Active (Allowed)</option>
                            <option value="NOT ACTIVE">Not Active (Blocked)</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-stone-300 block mb-1">Client Usage</label>
                          <select
                            value={markInUseOnGen ? 'yes' : 'no'}
                            onChange={(e) => setMarkInUseOnGen(e.target.value === 'yes')}
                            className="w-full text-xs px-2.5 py-1.5 bg-stone-950 border border-stone-800 rounded text-stone-200 focus:outline-none focus:border-amber-500"
                          >
                            <option value="yes">In Use by Client</option>
                            <option value="no">Available / Unassigned</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-stone-800">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <div className="flex items-center gap-1.5 text-stone-300 font-medium">
                      <span>Live Key for Plan:</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        {planType} Tier
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleRerollKey}
                      className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer transition-colors"
                      title="Generate a new random code for this plan"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Reroll Code
                    </button>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-3">
                    <button
                      onClick={handleGenerateKey}
                      className="px-4 py-2 text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white rounded cursor-pointer transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Add This Key to Admin Portal
                    </button>
                    <div className="flex items-center gap-1.5">
                      <code className="text-xs font-mono font-bold text-amber-300 bg-stone-950 px-3 py-2 rounded border border-stone-800">
                        {generatedKey}
                      </code>
                      <button
                        title="Copy Key"
                        onClick={() => {
                          navigator.clipboard.writeText(generatedKey);
                          showToast(`Copied key: ${generatedKey}`);
                        }}
                        className="p-2 bg-stone-950 hover:bg-stone-800 border border-stone-800 rounded text-stone-300 hover:text-stone-100 transition-colors cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-stone-400">
                    Saves to your registry below. Status: <strong className={initialStatusOnGen === 'ACTIVE' ? 'text-emerald-400' : 'text-rose-400'}>{initialStatusOnGen}</strong> • Usage: <strong className="text-sky-300">{markInUseOnGen ? 'In Use' : 'Available'}</strong>.
                  </p>
                </div>
              </div>

              {/* Client Simulator: License Activation Test */}
              <div className="p-5 rounded-xl bg-stone-900 border border-stone-800 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-stone-800">
                    <h3 className="text-sm font-semibold text-stone-200 flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-sky-400" />
                      In-App License Validator (Client Experience)
                    </h3>
                    <span className="text-[11px] font-mono text-stone-400">GUI Simulation</span>
                  </div>

                  <p className="text-xs text-stone-400 mt-3 mb-4">
                    Test how the Python desktop application checks whether a key is Active or Not Active in your portal.
                  </p>

                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-stone-300 block mb-1">Enter License Key to Test</label>
                      <input
                        type="text"
                        value={testKeyInput}
                        onChange={(e) => setTestKeyInput(e.target.value)}
                        placeholder="e.g. FARM-9842-8710-2026, PRO-4412-1082-2026, or ANNUAL-7731-5529-2026"
                        className="w-full text-xs font-mono px-3 py-2 bg-stone-950 border border-stone-800 rounded text-stone-200 focus:outline-none focus:border-sky-500 uppercase"
                      />
                    </div>

                    {licenseKeys.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 items-center">
                        <span className="text-[11px] text-stone-500 py-0.5">Quick Test from Registry:</span>
                        {licenseKeys.slice(0, 5).map((k) => (
                          <button
                            key={k.id}
                            onClick={() => setTestKeyInput(k.key)}
                            className="text-[10px] text-stone-300 hover:text-white bg-stone-950 px-2 py-0.5 rounded border border-stone-800 hover:border-stone-700 cursor-pointer flex items-center gap-1 font-mono"
                            title={`Select key for ${k.clientName} (${k.status})`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${k.status === 'ACTIVE' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                            {k.key.length > 14 ? `${k.key.substring(0, 13)}...` : k.key}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-stone-500">
                        No keys in registry yet. Generate a key above or import your <code className="text-amber-300/80">license_registry.json</code> below.
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-stone-800 space-y-3">
                  <button
                    onClick={handleTestKey}
                    className="w-full py-2 text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white rounded cursor-pointer transition-colors"
                  >
                    Validate In-App License Status
                  </button>

                  {testResult && (
                    <div
                      className={`p-3 rounded text-xs flex items-start gap-2.5 border ${
                        testResult.allowed
                          ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                          : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
                      }`}
                    >
                      {testResult.allowed ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                      ) : (
                        <XCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                      )}
                      <div>
                        <span className="font-semibold block">
                          {testResult.allowed ? 'Access Granted (Allowed User)' : 'Access Denied (Not Allowed)'}
                        </span>
                        <p className="text-[11px] opacity-90 mt-0.5">{testResult.message}</p>
                        {testResult.record && (
                          <div className="mt-2 pt-2 border-t border-stone-800 flex items-center gap-3 text-[10px] text-stone-400">
                            <span>Portal Status: <strong className={testResult.record.status === 'ACTIVE' ? 'text-emerald-400' : 'text-rose-400'}>{testResult.record.status}</strong></span>
                            <span>Client: <strong className="text-stone-200">{testResult.record.clientName}</strong></span>
                            <span>In Use: <strong className="text-sky-300">{testResult.record.inUse ? 'YES' : 'NO'}</strong></span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* GitHub Cloud Repository Sync Banner */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-stone-900 via-sky-950/40 to-stone-900 border border-sky-800/70 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0 shadow-inner">
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-stone-100">
                      GitHub Cloud License Sync
                    </h3>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-900/80 text-sky-300 border border-sky-700/60 font-semibold">
                      Direct Repository Sync
                    </span>
                  </div>
                  <p className="text-xs text-stone-300 mt-0.5">
                    Sync active SHA-256 hashed keys directly to repository <span className="text-sky-300 font-mono font-semibold">moisttowlett247-a11y/receipt-processor-portal</span> for live desktop verification without running a backend server.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsGhModalOpen(true)}
                className="flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white rounded-xl shadow-md transition-all cursor-pointer shrink-0"
              >
                <Globe className="w-4 h-4" />
                <span>Open GitHub Sync Modal</span>
              </button>
            </div>

            {/* License Keys Registry Table */}
            <div className="pt-4 border-t border-stone-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <div>
                  <h2 className="text-sm font-bold text-stone-100 flex items-center gap-2">
                    <Key className="w-4 h-4 text-amber-400" />
                    Admin License Keys Registry (Active vs. Not Active & Client Usage)
                  </h2>
                  <p className="text-xs text-stone-400 mt-0.5">
                    Live view of all license keys in your system. Check which keys are currently in use by clients, toggle active/inactive anytime to instantly permit or cut off access.
                  </p>
                </div>
              </div>

              <LicenseManagerTable
                keys={licenseKeys}
                onToggleStatus={handleToggleStatus}
                onToggleInUse={handleToggleInUse}
                onDeleteKey={handleDeleteKey}
                onAddManualKey={handleAddManualKey}
                onImportKeys={handleImportKeys}
                isGhModalOpen={isGhModalOpen}
                onCloseGhModal={() => setIsGhModalOpen(false)}
              />
            </div>
          </div>
        )}

        {/* TAB 2: AUTO-UPDATE MANIFEST */}
        {activeTab === 'updater' && (
          <div className="space-y-6">
            <div className="p-5 rounded-xl bg-stone-900 border border-stone-800">
              <div className="flex items-center justify-between pb-3 border-b border-stone-800">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-sky-400" />
                  <h2 className="text-sm font-semibold text-stone-200">
                    Auto-Update System Overview
                  </h2>
                </div>
                <span className="text-xs font-mono text-stone-400">
                  Current App: v{currentVersion}
                </span>
              </div>

              <p className="text-xs text-stone-300 mt-3 leading-relaxed">
                As requested, we have added a dedicated <strong className="text-sky-300">"Check for Updates"</strong> button next to the version in the top GUI header.
                When clicked (or when the app launches in the background), it queries your remote <code className="text-amber-300">version.json</code> manifest. 
                If an update is available, a dismissible dialog opens with:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-4">
                <div className="p-3 bg-stone-950 rounded border border-stone-800 text-xs">
                  <span className="font-semibold text-sky-400 block mb-1">1. Download & Install</span>
                  Performs an in-place hot replacement of the script / executable and restarts.
                </div>
                <div className="p-3 bg-stone-950 rounded border border-stone-800 text-xs">
                  <span className="font-semibold text-amber-400 block mb-1">2. Remind Me Later</span>
                  Dismisses the notification window immediately without nagging during the current session.
                </div>
                <div className="p-3 bg-stone-950 rounded border border-stone-800 text-xs">
                  <span className="font-semibold text-stone-400 block mb-1">3. Skip this Version</span>
                  Remembers the skipped version tag in memory and suppresses future popups for that specific release.
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setShowUpdateModal(true);
                    setUpdateDismissed(false);
                  }}
                  className="px-4 py-2 text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white rounded transition-colors cursor-pointer"
                >
                  Simulate Triggering Update Dialog
                </button>
                <span className="text-xs text-stone-400">
                  Try clicking "Remind Me Later", "Skip this Version", or "Download & Install".
                </span>
              </div>
            </div>

            {/* Manifest Hosting Guide */}
            <div className="p-5 rounded-xl bg-stone-900 border border-stone-800">
              <h3 className="text-sm font-semibold text-stone-200 mb-2 flex items-center gap-2">
                <FileCode2 className="w-4 h-4 text-emerald-400" />
                Where to Host Your <code className="text-amber-400">version.json</code> Manifest
              </h3>
              <p className="text-xs text-stone-400 mb-3">
                You can host this file for free on GitHub Releases, Amazon S3, or any static hosting server:
              </p>

              <div className="bg-stone-950 p-4 rounded-lg border border-stone-800 font-mono text-xs text-stone-300 leading-relaxed overflow-x-auto">
{`{
  "latest_version": "1.1.0",
  "min_required_version": "1.0.0",
  "release_date": "2026-09-15",
  "download_url": "https://github.com/yourusername/receipt-processor/releases/download/v1.1.0/receipt_processor.py",
  "release_notes": "• Added automatic QuickBooks vendor matching\\n• Multi-client encrypted switching\\n• Offline license grace period caching"
}`}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: STEP-BY-STEP SUBSCRIPTION ARCHITECTURE */}
        {activeTab === 'guide' && (
          <div className="space-y-5">
            <div className="p-5 rounded-xl bg-stone-900 border border-stone-800">
              <h2 className="text-sm font-semibold text-stone-200 mb-3 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                Complete Subscription & Licensing Setup Guide
              </h2>
              <div className="space-y-4 text-xs text-stone-300 leading-relaxed">
                <div className="p-3.5 rounded bg-stone-950 border border-stone-800">
                  <h4 className="font-semibold text-amber-400 mb-1">Step 1: Subscription Plans & Activation Durations</h4>
                  <p className="text-stone-400">
                    When a client subscribes, generate an activation key matching their selected tier. Durations calculate from the date of activation:
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-2 font-mono text-[11px]">
                    <div className="p-2 rounded bg-stone-900 border border-stone-800 text-center">
                      <span className="text-amber-400 font-bold block">Demo</span>
                      <span className="text-stone-400">7 Days</span>
                    </div>
                    <div className="p-2 rounded bg-stone-900 border border-stone-800 text-center">
                      <span className="text-emerald-400 font-bold block">Monthly</span>
                      <span className="text-stone-400">30 Days</span>
                    </div>
                    <div className="p-2 rounded bg-stone-900 border border-stone-800 text-center">
                      <span className="text-sky-400 font-bold block">3 Month</span>
                      <span className="text-stone-400">90 Days</span>
                    </div>
                    <div className="p-2 rounded bg-stone-900 border border-stone-800 text-center">
                      <span className="text-purple-400 font-bold block">6 Month</span>
                      <span className="text-stone-400">180 Days</span>
                    </div>
                    <div className="p-2 rounded bg-stone-900 border border-stone-800 text-center">
                      <span className="text-amber-300 font-bold block">Annual</span>
                      <span className="text-stone-400">365 Days</span>
                    </div>
                  </div>
                  <p className="text-stone-400 mt-2 text-[11px]">
                    The Admin Portal and desktop app track both the <strong className="text-stone-200">Activated Date</strong> and the <strong className="text-stone-200">Expiration Date</strong>, counting down the days remaining until renewal.
                  </p>
                </div>

                <div className="p-3.5 rounded bg-stone-950 border border-stone-800">
                  <h4 className="font-semibold text-sky-400 mb-1">Step 2: Machine Fingerprinting (Preventing Account Sharing)</h4>
                  <p className="text-stone-400">
                    The integrated script generates a SHA-256 machine hash using processor, hostname, and OS metrics. This ensures a client cannot email their license key to 10 other farming operations.
                  </p>
                </div>

                <div className="p-3.5 rounded bg-stone-950 border border-stone-800">
                  <h4 className="font-semibold text-emerald-400 mb-1">Step 3: Missing Encryption Key Protection</h4>
                  <p className="text-stone-400">
                    If someone accidentally moves or deletes <code className="text-stone-200">.app_security.key</code>, the app halts immediately and shows the Recovery Dialog so that their encrypted client QuickBooks credentials in <code className="text-stone-200">qbo_clients.enc</code> are never lost or corrupted.
                  </p>
                </div>

                <div className="p-3.5 rounded bg-stone-950 border border-stone-800">
                  <h4 className="font-semibold text-purple-400 mb-1">Step 4: Subscription Cancellation or Expiry</h4>
                  <p className="text-stone-400">
                    If a user cancels their subscription, the status shifts to <span className="text-rose-400 font-semibold">EXPIRED</span> or <span className="text-rose-400 font-semibold">REVOKED</span>. Their historical CSV files and processed images remain intact on their computer, but new OCR scans and QuickBooks API pushes are locked.
                  </p>
                </div>

                <div className="p-3.5 rounded bg-stone-950 border border-amber-900/40">
                  <h4 className="font-semibold text-amber-400 mb-1">Step 5: Zero-Knowledge GitHub File Lifecycle (Active, Revoked, Expired, Deleted)</h4>
                  <p className="text-stone-400 mb-2">
                    To keep license keys 100% private from the public web, keys are never committed in plaintext. Instead, each key generates an irreversible SHA-256 hash filename stored at <code className="text-amber-300 bg-stone-900 px-1.5 py-0.5 rounded font-mono">public/licenses/&lt;sha256_hash&gt;.json</code>:
                  </p>
                  <ul className="text-stone-300 text-[11px] space-y-1.5 list-disc list-inside">
                    <li><strong className="text-emerald-400">ACTIVE:</strong> The hash file exists with <code className="text-stone-200">"status": "ACTIVE"</code>. The desktop app verifies this file online and grants full access.</li>
                    <li><strong className="text-rose-400">REVOKED:</strong> When you click <strong>Revoke</strong> in the table, the hash file is marked with <code className="text-stone-200">"status": "REVOKED"</code>. The desktop client reads this and immediately blocks access.</li>
                    <li><strong className="text-amber-400">EXPIRED:</strong> If a key passes its duration date, it is marked as <code className="text-stone-200">"status": "EXPIRED"</code>.</li>
                    <li><strong className="text-rose-300">DELETED:</strong> When you delete a key, its hash file is deleted from <code className="text-stone-200">public/licenses/</code>. When the desktop app fetches the file, GitHub returns <code className="text-stone-200">404 Not Found</code>, instantly revoking access.</li>
                  </ul>
                  <p className="text-stone-400 mt-2 text-[11px]">
                    Use the <strong>Hash JSON</strong> button in the table to download the hash file, or click <strong>GH Sync</strong> to push updates directly to your GitHub repository with 1-click.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: CODE VIEWER */}
        {activeTab === 'code' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-stone-900 rounded-xl border border-stone-800">
              <div>
                <h3 className="text-sm font-semibold text-stone-200">
                  Fully Integrated Python Application (receipt_processor.py)
                </h3>
                <p className="text-xs text-stone-400">
                  Includes SecureVault, Missing Key Safeguard, UpdateManager, SubscriptionLicenseManager & QBO Multi-Client Engine.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={copyPythonCode}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 rounded transition-colors cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copied ? 'Copied to Clipboard!' : 'Copy Code'}
                </button>
                <button
                  onClick={handleDownloadPythonScript}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white rounded transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download File
                </button>
              </div>
            </div>

            <div className="bg-stone-950 border border-stone-800 rounded-xl p-4 font-mono text-xs text-stone-300 max-h-[600px] overflow-y-auto leading-relaxed">
              <div className="text-stone-500 pb-3 border-b border-stone-800 mb-3 flex items-center justify-between">
                <span># File location: ./receipt_processor.py (Ready to run with python receipt_processor.py)</span>
                <span className="text-amber-400 font-semibold">1,000+ Lines • Complete & Self-Contained</span>
              </div>
              <pre className="overflow-x-auto whitespace-pre">
{`# Sample Snippet: Subscription & Update Gate in receipt_processor.py:

class SubscriptionLicenseManager:
    """Validates whether the user has an active subscription."""
    def __init__(self, filepath=".license_vault.json"):
        self.filepath = filepath
        self.hardware_id = get_machine_hardware_id()
        self.license_data = self.load_local_license()

    def is_subscription_active(self) -> bool:
        status = self.license_data.get("status", "EXPIRED").upper()
        if status != "ACTIVE":
            return False
        # Check expiration date...
        return True

class UpdateManager:
    """Semantic version checker with in-place hot updating."""
    def check_for_updates(self, timeout=4) -> dict:
        # Fetches version.json from GitHub/S3 and compares semantic tuples
        ...

# Check receipt_processor.py in the project root for the complete executable script.`}
              </pre>
            </div>
          </div>
        )}
      </main>

      {/* DISMISSIBLE UPDATE MODAL SIMULATOR */}
      {showUpdateModal && !updateDismissed && (
        <div className="fixed inset-0 bg-stone-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-700 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">🚀</span>
                <h3 className="text-base font-bold text-sky-400">
                  A New Update is Available!
                </h3>
              </div>
              <span className="text-xs font-mono bg-sky-500/10 text-sky-400 border border-sky-500/20 px-2 py-0.5 rounded">
                v{latestRemoteVersion}
              </span>
            </div>

            <p className="text-xs text-stone-300">
              Version <strong>{latestRemoteVersion}</strong> is now available for download. You are currently running version <strong>v{currentVersion}</strong>.
            </p>

            <div className="bg-stone-950 p-3.5 rounded-lg border border-stone-800 space-y-1.5">
              <span className="text-xs font-semibold text-stone-400 block">Release Highlights:</span>
              <ul className="text-xs text-stone-300 space-y-1 list-disc list-inside">
                <li>Automated multi-receipt parallel segmentation</li>
                <li>QuickBooks Online OAuth instant token refresh</li>
                <li>Subscription license hardware ID verification</li>
                <li>Performance optimizations for thermal receipts</li>
              </ul>
            </div>

            {isDownloading && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-stone-400">
                  <span>Downloading package...</span>
                  <span className="font-mono text-sky-400">{downloadProgress}%</span>
                </div>
                <div className="w-full bg-stone-800 h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-sky-500 h-full transition-all duration-300" 
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone-800">
              <button
                disabled={isDownloading}
                onClick={handleStartUpdateDownload}
                className="flex-1 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                {isDownloading ? 'Downloading Update...' : 'Download & Install Update'}
              </button>

              <button
                disabled={isDownloading}
                onClick={() => {
                  setShowUpdateModal(false);
                  setUpdateDismissed(true);
                }}
                className="px-3 py-2 text-xs font-medium bg-stone-800 hover:bg-stone-700 text-stone-300 rounded transition-colors cursor-pointer"
              >
                Remind Me Later
              </button>

              <button
                disabled={isDownloading}
                onClick={() => {
                  setShowUpdateModal(false);
                  setUpdateDismissed(true);
                }}
                className="px-2.5 py-2 text-[11px] text-stone-400 hover:text-stone-200 rounded cursor-pointer"
              >
                Skip Version
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Admin Credentials Modal (Change Username & Password) */}
      <AdminPinModal
        isOpen={showPinModal}
        onClose={() => setShowPinModal(false)}
        onSuccess={handleAdminUnlockSuccess}
        savedHash={adminCredHash}
        savedUsername={adminUsername}
        onUpdateCredentials={handleUpdateCredentials}
      />

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-stone-900 border border-amber-500/50 text-stone-100 text-xs px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-medium">{toastMessage}</span>
          <button 
            onClick={() => setToastMessage(null)} 
            className="ml-2 text-stone-400 hover:text-stone-200 cursor-pointer p-0.5"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
