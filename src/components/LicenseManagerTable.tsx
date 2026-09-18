import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  Copy, 
  Check, 
  Trash2, 
  Power, 
  UserCheck, 
  UserX, 
  Download, 
  Upload,
  FileJson,
  Search, 
  Filter, 
  ShieldCheck, 
  Key, 
  Plus, 
  Sparkles,
  Calendar,
  Layers,
  Clock,
  AlertTriangle,
  Crown,
  Infinity as InfinityIcon,
  Globe,
  Settings,
  Shield,
  Mail,
  Inbox,
  UserPlus
} from 'lucide-react';
import { 
  LicenseKeyRecord, 
  LicenseStatus, 
  PlanTier, 
  generatePlanKey, 
  getPlanDurationDays, 
  getPlanLabel, 
  calculateExpirationDate 
} from '../types';
import { computeSha256Hex } from '../hashUtils';
import { 
  getStoredGitHubConfig, 
  saveStoredGitHubConfig, 
  syncSingleKeyToGitHub, 
  buildHashFileContent, 
  GitHubSyncConfig 
} from '../githubSyncService';

interface LicenseManagerTableProps {
  keys: LicenseKeyRecord[];
  onToggleStatus: (id: string) => void;
  onToggleInUse: (id: string) => void;
  onDeleteKey: (id: string) => void;
  onAddManualKey: (record: Omit<LicenseKeyRecord, 'id'>) => void;
  onImportKeys?: (keys: LicenseKeyRecord[]) => void;
  isGhModalOpen?: boolean;
  onCloseGhModal?: () => void;
}

export const LicenseManagerTable: React.FC<LicenseManagerTableProps> = ({
  keys,
  onToggleStatus,
  onToggleInUse,
  onDeleteKey,
  onAddManualKey,
  onImportKeys,
  isGhModalOpen = false,
  onCloseGhModal
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'ACTIVE' | 'EXPIRED' | 'NOT ACTIVE' | 'IN_USE' | 'AVAILABLE'>('ALL');
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showInquiriesModal, setShowInquiriesModal] = useState(false);
  const [inquiriesList, setInquiriesList] = useState<any[]>([]);
  const [isLoadingInquiries, setIsLoadingInquiries] = useState(false);
  const [deleteConfirmKey, setDeleteConfirmKey] = useState<LicenseKeyRecord | null>(null);
  const [importStatusMsg, setImportStatusMsg] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Load inquiries from backend and localStorage
  const fetchInquiries = async () => {
    setIsLoadingInquiries(true);
    let items: any[] = [];
    try {
      const res = await fetch(`/api/inquiries?_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.inquiries && Array.isArray(data.inquiries)) {
          items = data.inquiries;
        }
      }
    } catch {}

    if (items.length === 0) {
      try {
        const local = localStorage.getItem('receipt_processor_inquiries');
        if (local) items = JSON.parse(local);
      } catch {}
    }
    setInquiriesList(items);
    setIsLoadingInquiries(false);
  };

  useEffect(() => {
    fetchInquiries();
  }, []);

  // Form state for manual addition
  const [manualKey, setManualKey] = useState('');
  const [manualClient, setManualClient] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [manualPlan, setManualPlan] = useState<PlanTier>('MONTHLY');
  const [manualStatus, setManualStatus] = useState<LicenseStatus>('ACTIVE');
  const [manualInUse, setManualInUse] = useState(true);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKeyId(id);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  const isKeyExpired = (k: LicenseKeyRecord): boolean => {
    if (k.plan === 'ADMIN' || k.expiresDate?.includes('Never') || k.expiresDate?.includes('Lifetime')) return false;
    if (k.status === 'EXPIRED') return true;
    if (!k.expiresDate || k.expiresDate.startsWith('Pending')) return false;
    const expTime = new Date(k.expiresDate).getTime();
    return !isNaN(expTime) && expTime < new Date().setHours(0, 0, 0, 0);
  };

  const getDaysLeft = (expiresDateStr: string, plan?: PlanTier): number | null => {
    if (plan === 'ADMIN' || expiresDateStr?.includes('Never') || expiresDateStr?.includes('Lifetime')) return null;
    if (!expiresDateStr || expiresDateStr.startsWith('Pending')) return null;
    const expTime = new Date(expiresDateStr).getTime();
    if (isNaN(expTime)) return null;
    return Math.ceil((expTime - new Date().setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24));
  };

  const handleExportCSV = () => {
    const headers = ['Key', 'Client Name', 'Client Email', 'Plan', 'Duration Days', 'Status', 'In Use', 'Issued Date', 'Activated Date', 'Expires Date', 'Hardware ID'];
    const rows = keys.map(k => [
      k.key,
      `"${k.clientName}"`,
      k.clientEmail,
      k.plan,
      getPlanDurationDays(k.plan),
      isKeyExpired(k) ? 'EXPIRED' : k.status,
      k.inUse ? 'YES' : 'NO',
      k.issuedDate,
      k.activatedDate || 'Not Activated',
      k.expiresDate,
      k.hardwareId || 'N/A'
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `license_keys_registry_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportJSON = () => {
    const jsonStr = JSON.stringify(keys, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'license_registry.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        const importedArray = Array.isArray(parsed) ? parsed : (parsed.keys || []);
        if (!Array.isArray(importedArray) || importedArray.length === 0) {
          setImportStatusMsg('Error: Selected JSON file does not contain a valid list of license keys.');
          setTimeout(() => setImportStatusMsg(null), 4000);
          return;
        }

        if (onImportKeys) {
          onImportKeys(importedArray);
          setImportStatusMsg(`✅ Successfully imported ${importedArray.length} license key records!`);
          setTimeout(() => setImportStatusMsg(null), 3500);
        }
      } catch (err) {
        setImportStatusMsg('Failed to parse JSON file. Please check file format.');
        setTimeout(() => setImportStatusMsg(null), 4000);
      }
    };
    reader.readAsText(file);
    if (e.target) e.target.value = '';
  };

  // GitHub Settings & Sync state
  const [ghConfig, setGhConfig] = useState<GitHubSyncConfig>(getStoredGitHubConfig);
  const [internalGhModalOpen, setInternalGhModalOpen] = useState(false);
  const showGhConfigModal = isGhModalOpen || internalGhModalOpen;

  const closeGhModal = () => {
    setInternalGhModalOpen(false);
    if (onCloseGhModal) onCloseGhModal();
  };

  const [syncingKeyId, setSyncingKeyId] = useState<string | null>(null);

  const handleSaveGhConfig = (e: React.FormEvent) => {
    e.preventDefault();
    saveStoredGitHubConfig(ghConfig);
    closeGhModal();
    setImportStatusMsg('GitHub Sync Configuration saved.');
    setTimeout(() => setImportStatusMsg(null), 3000);
  };

  // Download individual hashed JSON file: /public/licenses/<hash>.json
  const handleDownloadHashFile = async (k: LicenseKeyRecord) => {
    const hash = await computeSha256Hex(k.key);
    const content = buildHashFileContent(k);
    const jsonStr = JSON.stringify(content, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${hash}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setImportStatusMsg(`Downloaded ${hash.slice(0, 10)}...json (Drop into public/licenses/ on GitHub)`);
    setTimeout(() => setImportStatusMsg(null), 4500);
  };

  // Direct sync to GitHub repository via GitHub REST API
  const handleDirectSyncToGitHub = async (k: LicenseKeyRecord) => {
    if (!ghConfig.token) {
      setInternalGhModalOpen(true);
      return;
    }
    setSyncingKeyId(k.id);
    const res = await syncSingleKeyToGitHub(k, 'UPSERT', ghConfig);
    setSyncingKeyId(null);
    setImportStatusMsg(res.success ? `✅ GitHub Synced: ${res.message}` : `❌ ${res.message}`);
    setTimeout(() => setImportStatusMsg(null), 4500);
  };

  const filteredKeys = keys.filter(k => {
    const matchesSearch = 
      k.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
      k.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      k.clientEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      k.plan.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    const expired = isKeyExpired(k);

    if (filterStatus === 'ACTIVE') return k.status === 'ACTIVE' && !expired;
    if (filterStatus === 'EXPIRED') return expired;
    if (filterStatus === 'NOT ACTIVE') return k.status === 'NOT ACTIVE';
    if (filterStatus === 'IN_USE') return k.inUse;
    if (filterStatus === 'AVAILABLE') return !k.inUse;
    return true;
  });

  const totalKeys = keys.length;
  const expiredKeysCount = keys.filter(isKeyExpired).length;
  const activeKeysCount = keys.filter(k => k.status === 'ACTIVE' && !isKeyExpired(k)).length;
  const inactiveKeysCount = keys.filter(k => k.status === 'NOT ACTIVE').length;
  const inUseKeysCount = keys.filter(k => k.inUse).length;
  const availableKeysCount = keys.filter(k => !k.inUse).length;

  const submitManualAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualKey.trim()) return;

    const today = new Date().toISOString().split('T')[0];
    const activated = manualInUse ? today : undefined;
    const expires = manualPlan === 'ADMIN'
      ? 'Never (Lifetime / Non-Expiring)'
      : (manualInUse 
        ? calculateExpirationDate(today, manualPlan) 
        : `Pending (${getPlanDurationDays(manualPlan)} days upon activation)`);

    onAddManualKey({
      key: manualKey.trim().toUpperCase(),
      clientName: manualClient.trim() || `${getPlanLabel(manualPlan)} Subscriber`,
      clientEmail: manualEmail.trim() || (manualPlan === 'ADMIN' ? 'admin@farmtax.com' : 'customer@farmtax.com'),
      plan: manualPlan,
      status: manualStatus,
      inUse: manualInUse,
      issuedDate: today,
      activatedDate: activated,
      expiresDate: expires,
      notes: manualPlan === 'ADMIN' ? 'Perpetual non-expiring Admin Master Key' : undefined
    });

    setManualKey('');
    setManualClient('');
    setManualEmail('');
    setShowAddModal(false);
  };

  return (
    <div className="space-y-4">
      {/* Stats KPI Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-3.5 bg-stone-900 border border-stone-800 rounded-xl">
          <div className="flex items-center justify-between text-xs text-stone-400 mb-1">
            <span>Total Keys</span>
            <Key className="w-3.5 h-3.5 text-stone-500" />
          </div>
          <div className="text-xl font-bold font-mono text-stone-100">{totalKeys}</div>
        </div>

        <div className="p-3.5 bg-stone-900 border border-emerald-900/40 rounded-xl">
          <div className="flex items-center justify-between text-xs text-emerald-400 mb-1">
            <span>Active & Valid</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl font-bold font-mono text-emerald-300">{activeKeysCount}</div>
        </div>

        <div className="p-3.5 bg-stone-900 border border-amber-900/40 rounded-xl">
          <div className="flex items-center justify-between text-xs text-amber-400 mb-1">
            <span>Expired Keys</span>
            <Clock className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-xl font-bold font-mono text-amber-300">{expiredKeysCount}</div>
        </div>

        <div className="p-3.5 bg-stone-900 border border-rose-900/40 rounded-xl">
          <div className="flex items-center justify-between text-xs text-rose-400 mb-1">
            <span>Revoked / Inactive</span>
            <XCircle className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="text-xl font-bold font-mono text-rose-300">{inactiveKeysCount}</div>
        </div>

        <div className="p-3.5 bg-stone-900 border border-sky-900/40 rounded-xl col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-xs text-sky-400 mb-1">
            <span>In Use by Clients</span>
            <UserCheck className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="text-xl font-bold font-mono text-sky-300">
            {inUseKeysCount} <span className="text-[11px] font-normal text-stone-400">({availableKeysCount} free)</span>
          </div>
        </div>
      </div>

      {/* Action Controls & Search */}
      <div className="p-4 bg-stone-900 border border-stone-800 rounded-xl flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Search Input */}
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-stone-500" />
            <input
              type="text"
              placeholder="Search key, client, plan..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-stone-950 border border-stone-800 rounded-md text-stone-200 placeholder:text-stone-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Filter Tabs */}
          <div className="flex flex-wrap items-center bg-stone-950 p-0.5 rounded-md border border-stone-800 text-[11px]">
            <button
              onClick={() => setFilterStatus('ALL')}
              className={`px-2 py-1 rounded cursor-pointer transition-colors ${
                filterStatus === 'ALL' ? 'bg-stone-800 text-stone-100 font-semibold' : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              All ({totalKeys})
            </button>
            <button
              onClick={() => setFilterStatus('ACTIVE')}
              className={`px-2 py-1 rounded cursor-pointer transition-colors ${
                filterStatus === 'ACTIVE' ? 'bg-emerald-900/50 text-emerald-300 font-semibold' : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              Active ({activeKeysCount})
            </button>
            <button
              onClick={() => setFilterStatus('EXPIRED')}
              className={`px-2 py-1 rounded cursor-pointer transition-colors ${
                filterStatus === 'EXPIRED' ? 'bg-amber-900/50 text-amber-300 font-semibold' : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              Expired ({expiredKeysCount})
            </button>
            <button
              onClick={() => setFilterStatus('NOT ACTIVE')}
              className={`px-2 py-1 rounded cursor-pointer transition-colors ${
                filterStatus === 'NOT ACTIVE' ? 'bg-rose-900/50 text-rose-300 font-semibold' : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              Not Active ({inactiveKeysCount})
            </button>
            <button
              onClick={() => setFilterStatus('IN_USE')}
              className={`px-2 py-1 rounded cursor-pointer transition-colors ${
                filterStatus === 'IN_USE' ? 'bg-sky-900/50 text-sky-300 font-semibold' : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              In Use ({inUseKeysCount})
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportFileChange}
            accept=".json,application/json"
            className="hidden"
          />

          <button
            onClick={() => {
              fetchInquiries();
              setShowInquiriesModal(true);
            }}
            title="View incoming client portal requests sent to moisttowlett247@gmail.com"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 rounded-md transition-colors cursor-pointer"
          >
            <Mail className="w-3.5 h-3.5 text-emerald-400" />
            <span>Access Requests</span>
            {inquiriesList.length > 0 && (
              <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[9px] bg-emerald-500 text-stone-950 font-extrabold">
                {inquiriesList.length}
              </span>
            )}
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            title="Import keys from license_registry.json"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-stone-900 hover:bg-stone-800 text-stone-300 border border-stone-800 rounded-md transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-sky-400" />
            Import JSON
          </button>

          <button
            onClick={handleExportJSON}
            title="Export license_registry.json for local desktop application"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white rounded-md shadow-sm transition-colors cursor-pointer"
          >
            <FileJson className="w-3.5 h-3.5" />
            Export license_registry.json
          </button>

          <button
            onClick={() => {
              setManualKey(generatePlanKey(manualPlan));
              setShowAddModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 rounded-md transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-amber-400" />
            Add Key
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-stone-950 hover:bg-stone-800 text-stone-300 border border-stone-800 rounded-md transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>

          <button
            onClick={() => setInternalGhModalOpen(true)}
            title="Configure GitHub Repository & Personal Access Token for direct hash sync"
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white border border-sky-400/50 rounded-md shadow-sm transition-all cursor-pointer"
          >
            <Globe className="w-3.5 h-3.5 text-white" />
            <span>GitHub Sync</span>
            {ghConfig.token && ghConfig.autoSync !== false && (
              <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[9px] bg-emerald-400 text-stone-950 font-extrabold uppercase tracking-wider ml-0.5">
                Auto
              </span>
            )}
          </button>
        </div>
      </div>

      {importStatusMsg && (
        <div className="p-3 bg-stone-900 border border-stone-700 rounded-xl text-xs text-stone-200 flex items-center justify-between shadow-md">
          <span>{importStatusMsg}</span>
          <button onClick={() => setImportStatusMsg(null)} className="text-stone-400 hover:text-stone-200 ml-4">✕</button>
        </div>
      )}

      {/* Main Keys Table */}
      <div className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-stone-950/80 border-b border-stone-800 text-stone-400 font-medium select-none">
                <th className="py-3 px-4">License Key</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">In Use?</th>
                <th className="py-3 px-4">Client / Subscriber</th>
                <th className="py-3 px-4">Plan Tier & Duration</th>
                <th className="py-3 px-4">Activated Date</th>
                <th className="py-3 px-4">Expiration Date</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-800/60">
              {filteredKeys.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-stone-500">
                    No license keys match your current filter. Generate a new key above or adjust search.
                  </td>
                </tr>
              ) : (
                filteredKeys.map((k) => {
                  const isCopied = copiedKeyId === k.id;
                  const isExpired = isKeyExpired(k);
                  const isActive = k.status === 'ACTIVE' && !isExpired;
                  const daysLeft = getDaysLeft(k.expiresDate);

                  return (
                    <tr key={k.id} className="hover:bg-stone-800/30 transition-colors">
                      {/* Key Column */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <code className="font-mono font-bold text-amber-400 bg-stone-950 px-2 py-1 rounded border border-stone-800 text-[11px] tracking-wide select-all">
                            {k.key}
                          </code>
                          <button
                            title="Copy License Key"
                            onClick={() => handleCopy(k.id, k.key)}
                            className="p-1 text-stone-400 hover:text-stone-200 bg-stone-950 rounded border border-stone-800 hover:border-stone-700 transition-colors cursor-pointer"
                          >
                            {isCopied ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Status Column */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          {isExpired ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold text-[10px] tracking-wider uppercase border bg-amber-950/60 text-amber-400 border-amber-800/60">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                              Expired
                            </span>
                          ) : isActive ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold text-[10px] tracking-wider uppercase border bg-emerald-950/60 text-emerald-400 border-emerald-800/60">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold text-[10px] tracking-wider uppercase border bg-rose-950/60 text-rose-400 border-rose-800/60">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                              Not Active
                            </span>
                          )}

                          <button
                            title={isActive ? 'Deactivate / Revoke key' : 'Mark active'}
                            onClick={() => onToggleStatus(k.id)}
                            className={`p-1 rounded text-[10px] border transition-colors cursor-pointer ${
                              isActive
                                ? 'bg-stone-950 text-stone-400 hover:text-rose-400 hover:border-rose-900 border-stone-800'
                                : 'bg-emerald-950/40 text-emerald-400 hover:bg-emerald-900/50 border-emerald-800/60'
                            }`}
                          >
                            <Power className="w-3 h-3" />
                          </button>
                        </div>
                      </td>

                      {/* In Use Column */}
                      <td className="py-3 px-4">
                        <button
                          onClick={() => onToggleInUse(k.id)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium border cursor-pointer transition-colors ${
                            k.inUse
                              ? 'bg-sky-950/40 border-sky-800/50 text-sky-300'
                              : 'bg-stone-950 border-stone-800 text-stone-400 hover:text-stone-200'
                          }`}
                          title="Click to toggle In-Use / Claimed status"
                        >
                          {k.inUse ? (
                            <>
                              <UserCheck className="w-3 h-3 text-sky-400" />
                              <span>In Use</span>
                            </>
                          ) : (
                            <>
                              <UserX className="w-3 h-3 text-stone-500" />
                              <span>Unclaimed</span>
                            </>
                          )}
                        </button>
                      </td>

                      {/* Client / Subscriber */}
                      <td className="py-3 px-4">
                        <div>
                          <span className="font-semibold text-stone-200 block text-xs">
                            {k.clientName}
                          </span>
                          <span className="text-[11px] text-stone-400 font-mono">
                            {k.clientEmail}
                          </span>
                        </div>
                      </td>

                      {/* Plan Tier & Duration */}
                      <td className="py-3 px-4">
                        {k.plan === 'ADMIN' ? (
                          <div className="flex flex-col items-start gap-1">
                            <span className="font-mono font-bold text-[11px] px-2 py-0.5 rounded bg-sky-950/80 border border-sky-800 text-sky-300 flex items-center gap-1">
                              <Crown className="w-3 h-3 text-amber-400" />
                              ADMIN
                            </span>
                            <span className="text-[10px] text-sky-400/90 font-medium">
                              Lifetime Master
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-start gap-1">
                            <span className="font-mono font-bold text-[11px] px-2 py-0.5 rounded bg-stone-950 border border-stone-800 text-amber-300">
                              {k.plan}
                            </span>
                            <span className="text-[10px] text-stone-400">
                              {getPlanDurationDays(k.plan)} Days duration
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Activated Date */}
                      <td className="py-3 px-4">
                        {k.activatedDate ? (
                          <div className="flex items-center gap-1.5 text-stone-300 text-[11px]">
                            <Calendar className="w-3 h-3 text-emerald-400" />
                            <span className="font-mono">{k.activatedDate}</span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-stone-400 bg-stone-950 px-2 py-0.5 rounded border border-stone-800/80">
                            <Clock className="w-2.5 h-2.5 text-stone-500" />
                            Pending Activation
                          </span>
                        )}
                      </td>

                      {/* Expiration Date */}
                      <td className="py-3 px-4">
                        {k.plan === 'ADMIN' || k.expiresDate?.includes('Never') ? (
                          <div className="space-y-0.5">
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-sky-950/60 border border-sky-800/60 text-sky-300 text-[11px] font-semibold">
                              <InfinityIcon className="w-3.5 h-3.5 text-sky-400" />
                              Never Expires
                            </div>
                            <span className="text-[10px] text-sky-400/80 block font-mono">Perpetual Admin</span>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 text-stone-300 text-[11px]">
                              <Calendar className="w-3 h-3 text-stone-500" />
                              <span className="font-mono">{k.expiresDate}</span>
                            </div>
                            {daysLeft !== null && (
                              <div>
                                {daysLeft < 0 ? (
                                  <span className="text-[10px] text-rose-400 font-semibold">
                                    Expired {Math.abs(daysLeft)}d ago
                                  </span>
                                ) : daysLeft === 0 ? (
                                  <span className="text-[10px] text-amber-400 font-semibold">
                                    Expires today!
                                  </span>
                                ) : daysLeft <= 7 ? (
                                  <span className="text-[10px] text-amber-300 font-semibold">
                                    {daysLeft}d remaining
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-emerald-400">
                                    {daysLeft}d remaining
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => onToggleStatus(k.id)}
                            className={`px-2 py-1 text-[10px] font-semibold rounded border cursor-pointer transition-colors ${
                              isActive
                                ? 'bg-stone-950 border-stone-800 text-stone-300 hover:border-rose-800 hover:text-rose-400'
                                : 'bg-emerald-600 hover:bg-emerald-500 text-white border-transparent'
                            }`}
                          >
                            {isActive ? 'Revoke' : 'Activate'}
                          </button>

                          <button
                            title="Download public/licenses/<hash>.json file"
                            onClick={() => handleDownloadHashFile(k)}
                            className="p-1 text-amber-400 hover:text-amber-300 bg-stone-950 hover:bg-stone-800 rounded border border-stone-800 hover:border-amber-700/60 transition-colors cursor-pointer text-[10px] font-mono flex items-center gap-1"
                          >
                            <Download className="w-3 h-3" />
                            <span className="hidden xl:inline">Hash JSON</span>
                          </button>

                          <button
                            title={ghConfig.token ? "Sync status directly to GitHub repository" : "Click to configure GitHub Token and sync"}
                            disabled={syncingKeyId === k.id}
                            onClick={() => handleDirectSyncToGitHub(k)}
                            className="p-1 text-sky-400 hover:text-sky-200 bg-sky-950/40 hover:bg-sky-900/60 rounded border border-sky-800/60 hover:border-sky-500 transition-colors cursor-pointer text-[10px] font-mono flex items-center gap-1"
                          >
                            <Globe className={`w-3 h-3 ${syncingKeyId === k.id ? 'animate-spin' : ''}`} />
                            <span>Sync GH</span>
                          </button>

                          <button
                            title="Delete License Key"
                            onClick={() => setDeleteConfirmKey(k)}
                            className="p-1.5 text-stone-400 hover:text-rose-400 hover:bg-rose-950/40 rounded border border-transparent hover:border-rose-900/60 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Notes */}
        <div className="p-3 bg-stone-950/60 border-t border-stone-800 flex flex-col sm:flex-row items-center justify-between text-[11px] text-stone-400 gap-2">
          <span>Showing {filteredKeys.length} of {totalKeys} registered keys</span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Keys auto-expire based on activation date: Demo (7d), Monthly (30d), 3 Month (90d), 6 Month (180d), Annual (365d). Admin Master keys never expire (Lifetime).
          </span>
        </div>
      </div>

      {/* Manual Add Key Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-stone-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-700 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-800">
              <h3 className="text-sm font-bold text-stone-100 flex items-center gap-2">
                <Plus className="w-4 h-4 text-amber-400" />
                Register Existing or Custom Key
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-stone-400 hover:text-stone-200 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={submitManualAdd} className="space-y-3 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-stone-300 font-medium">License Key *</label>
                  <button
                    type="button"
                    onClick={() => setManualKey(generatePlanKey(manualPlan))}
                    className="text-[10px] text-amber-400 hover:text-amber-300 underline cursor-pointer"
                  >
                    Auto-generate {manualPlan} Key
                  </button>
                </div>
                <input
                  type="text"
                  required
                  placeholder={`e.g. ${manualPlan}-8832-1920-2026`}
                  value={manualKey}
                  onChange={(e) => setManualKey(e.target.value)}
                  className="w-full font-mono px-3 py-2 bg-stone-950 border border-stone-800 rounded text-stone-200 focus:outline-none focus:border-amber-500 uppercase"
                />
              </div>

              <div>
                <label className="block text-stone-300 font-medium mb-1">Client / Business Name</label>
                <input
                  type="text"
                  placeholder="e.g. Sunny Brook Orchards LLC"
                  value={manualClient}
                  onChange={(e) => setManualClient(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded text-stone-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-stone-300 font-medium mb-1">Subscriber Email</label>
                <input
                  type="email"
                  placeholder="e.g. finance@sunnybrook.com"
                  value={manualEmail}
                  onChange={(e) => setManualEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded text-stone-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-300 font-medium mb-1">Plan Tier</label>
                  <select
                    value={manualPlan}
                    onChange={(e) => {
                      const newP = e.target.value as PlanTier;
                      setManualPlan(newP);
                      setManualKey(generatePlanKey(newP));
                    }}
                    className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded text-stone-200 focus:outline-none focus:border-amber-500"
                  >
                    <option value="ADMIN">👑 Admin Master (Never Expires / Lifetime)</option>
                    <option value="MONTHLY">Monthly (1 Month / 30d)</option>
                    <option value="3MONTH">3 Month (Quarterly / 90d)</option>
                    <option value="6MONTH">6 Month (Half Year / 180d)</option>
                    <option value="ANNUAL">Annual (1 Year / 365d)</option>
                    <option value="DEMO">Demo (Trial / 7d)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-stone-300 font-medium mb-1">Initial Status</label>
                  <select
                    value={manualStatus}
                    onChange={(e) => setManualStatus(e.target.value as LicenseStatus)}
                    className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded text-stone-200 focus:outline-none focus:border-amber-500"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="NOT ACTIVE">Not Active</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="inUseCheck"
                  checked={manualInUse}
                  onChange={(e) => setManualInUse(e.target.checked)}
                  className="rounded border-stone-800 bg-stone-950 text-amber-500 focus:ring-0 cursor-pointer"
                />
                <label htmlFor="inUseCheck" className="text-stone-300 cursor-pointer">
                  Activate immediately today (sets activation date and starts expiration clock)
                </label>
              </div>

              <div className="pt-3 border-t border-stone-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 font-semibold text-white rounded cursor-pointer"
                >
                  Save to Registry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-stone-900 border border-stone-800 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-stone-100">Delete License Key</h3>
                <p className="text-xs text-stone-400">Permanently remove this license from the registry</p>
              </div>
            </div>

            <div className="p-3 bg-stone-950 rounded-lg border border-stone-800 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-stone-400">License Key:</span>
                <span className="font-mono font-bold text-amber-300 text-[13px]">{deleteConfirmKey.key}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-stone-400">Client / Assignee:</span>
                <span className="text-stone-200 font-medium">{deleteConfirmKey.clientName}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-stone-400">Plan Tier:</span>
                <span className="text-stone-200 font-mono font-semibold">{deleteConfirmKey.plan}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-stone-400">Status:</span>
                <span className={`font-semibold ${deleteConfirmKey.status === 'ACTIVE' ? 'text-emerald-400' : 'text-stone-400'}`}>
                  {deleteConfirmKey.status}
                </span>
              </div>
            </div>

            <p className="text-xs text-rose-300/90 leading-relaxed">
              Are you sure you want to permanently delete this key? Once deleted, any client workstation or desktop app using this key will be denied access upon verification.
            </p>

            <div className="pt-3 border-t border-stone-800 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDeleteConfirmKey(null)}
                className="px-3.5 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-medium rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const idToDelete = deleteConfirmKey.id;
                  setDeleteConfirmKey(null);
                  onDeleteKey(idToDelete);
                }}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg shadow transition-colors cursor-pointer flex items-center gap-1.5 active:scale-[0.98]"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GitHub Direct Sync Settings Modal */}
      {showGhConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-stone-900 border border-stone-800 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-800">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-sky-400" />
                <h3 className="text-sm font-bold text-stone-100">GitHub Direct Sync Settings</h3>
              </div>
              <button
                onClick={closeGhModal}
                className="text-stone-400 hover:text-stone-200 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-stone-400 leading-relaxed">
              When configured, clicking <strong className="text-stone-200">Sync GH</strong> on any key or changing a key status automatically uploads or deletes its zero-knowledge SHA-256 JSON verification record directly in your repository (<code className="text-amber-300 bg-stone-950 px-1 py-0.5 rounded font-mono">public/licenses/&lt;hash&gt;.json</code>).
            </p>

            <form onSubmit={handleSaveGhConfig} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-300 font-medium mb-1">GitHub Owner / Username</label>
                  <input
                    type="text"
                    required
                    value={ghConfig.owner}
                    onChange={(e) => setGhConfig({ ...ghConfig, owner: e.target.value.trim() })}
                    placeholder="e.g. moisttowlett247-a11y"
                    className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded text-stone-200 font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-stone-300 font-medium mb-1">Repository Name</label>
                  <input
                    type="text"
                    required
                    value={ghConfig.repo}
                    onChange={(e) => setGhConfig({ ...ghConfig, repo: e.target.value.trim() })}
                    placeholder="receipt-processor-portal"
                    className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded text-stone-200 font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-stone-300 font-medium mb-1">Target Branch</label>
                <input
                  type="text"
                  required
                  value={ghConfig.branch}
                  onChange={(e) => setGhConfig({ ...ghConfig, branch: e.target.value.trim() })}
                  placeholder="main"
                  className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded text-stone-200 font-mono focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-stone-300 font-medium">
                    Personal Access Token (PAT)
                  </label>
                  <a
                    href="https://github.com/settings/tokens/new?scopes=repo&description=Receipt+Processor+Portal+Sync"
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-400 hover:text-sky-300 text-[11px] underline flex items-center gap-1"
                  >
                    Generate Token on GitHub ↗
                  </a>
                </div>
                <input
                  type="password"
                  value={ghConfig.token || ''}
                  onChange={(e) => setGhConfig({ ...ghConfig, token: e.target.value.trim() })}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded text-stone-200 font-mono focus:outline-none focus:border-sky-500"
                />
                <div className="bg-stone-950 border border-stone-800/80 rounded-lg p-2.5 space-y-1 text-[11px] text-stone-400">
                  <p className="font-medium text-stone-300">How to get your token on GitHub:</p>
                  <ol className="list-decimal list-inside space-y-0.5 text-stone-400">
                    <li>Click <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer" className="text-sky-400 underline">GitHub &gt; Settings &gt; Developer Settings &gt; Personal Access Tokens (Classic)</a></li>
                    <li>Click <strong>Generate new token (classic)</strong></li>
                    <li>Check the <strong className="text-amber-300">repo</strong> scope (Full control of private repositories)</li>
                    <li>Click <strong>Generate token</strong> at the bottom, copy the code starting with <code className="text-sky-300">ghp_</code>, and paste it above!</li>
                  </ol>
                </div>
              </div>

              <div className="pt-2 border-t border-stone-800">
                <label className="flex items-start gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={ghConfig.autoSync !== false}
                    onChange={(e) => setGhConfig({ ...ghConfig, autoSync: e.target.checked })}
                    className="mt-0.5 rounded border-stone-700 bg-stone-950 text-sky-500 focus:ring-sky-500 cursor-pointer"
                  />
                  <div className="space-y-0.5">
                    <span className="text-stone-200 font-medium">Automatic Real-Time Sync</span>
                    <p className="text-[11px] text-stone-400">
                      When enabled, any action you perform (activating, revoking, or deleting a key) will automatically update or delete the hash file on GitHub immediately.
                    </p>
                  </div>
                </label>
              </div>

              <div className="pt-3 border-t border-stone-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeGhModal}
                  className="px-3.5 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 font-semibold text-white rounded cursor-pointer"
                >
                  Save Settings
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Access Requests & Inquiries Modal */}
      {showInquiriesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-stone-900 border border-stone-800 rounded-xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-stone-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Inbox className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-stone-100">Access Requests & Software Inquiries</h3>
                  <p className="text-[11px] text-stone-400">Inquiries submitted via Client Portal to <span className="text-amber-400 font-mono">moisttowlett247@gmail.com</span></p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={fetchInquiries}
                  className="px-2.5 py-1 text-xs bg-stone-800 hover:bg-stone-700 text-stone-300 rounded border border-stone-700 flex items-center gap-1 cursor-pointer"
                >
                  <Clock className="w-3 h-3 text-sky-400" />
                  <span>Refresh</span>
                </button>
                <button
                  onClick={() => setShowInquiriesModal(false)}
                  className="text-stone-400 hover:text-stone-200 cursor-pointer p-1"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {inquiriesList.length === 0 ? (
                <div className="text-center py-10 space-y-2">
                  <Inbox className="w-8 h-8 text-stone-600 mx-auto" />
                  <p className="text-xs text-stone-400">No customer access inquiries logged yet.</p>
                  <p className="text-[11px] text-stone-500">When users submit the request form on the public portal, they will appear here with 1-click license issuance.</p>
                </div>
              ) : (
                inquiriesList.map((inq: any) => (
                  <div key={inq.id} className="p-4 bg-stone-950 border border-stone-800 rounded-xl space-y-2.5 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-stone-100 text-sm">{inq.name}</span>
                          {inq.company && (
                            <span className="px-2 py-0.5 rounded bg-stone-900 border border-stone-800 text-[10px] text-stone-300 font-medium">
                              {inq.company}
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-[10px] text-amber-300 font-semibold">
                            {inq.interestedPlan || 'Standard'}
                          </span>
                        </div>
                        <div className="text-stone-400 text-[11px] mt-0.5 flex items-center gap-2">
                          <span>{inq.email}</span>
                          <span>•</span>
                          <span>Volume: {inq.receiptVolume || 'Unspecified'}</span>
                          <span>•</span>
                          <span>{new Date(inq.submittedAt).toLocaleDateString()} {new Date(inq.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setManualClient(inq.name);
                            setManualEmail(inq.email);
                            const matchedPlan: PlanTier = 
                              inq.interestedPlan?.toUpperCase().includes('YEAR') || inq.interestedPlan?.toUpperCase().includes('ANNUAL') ? 'ANNUAL' :
                              inq.interestedPlan?.toUpperCase().includes('6') ? '6MONTH' :
                              inq.interestedPlan?.toUpperCase().includes('QUARTER') || inq.interestedPlan?.toUpperCase().includes('3') ? '3MONTH' :
                              inq.interestedPlan?.toUpperCase().includes('FARM') ? 'FARM' :
                              inq.interestedPlan?.toUpperCase().includes('PRO') ? 'PRO' :
                              inq.interestedPlan?.toUpperCase().includes('DEMO') || inq.interestedPlan?.toUpperCase().includes('TRIAL') ? 'DEMO' : 'MONTHLY';
                            setManualPlan(matchedPlan);
                            setManualKey(generatePlanKey(matchedPlan));
                            setShowInquiriesModal(false);
                            setShowAddModal(true);
                          }}
                          className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs rounded-lg flex items-center gap-1 shadow transition-colors cursor-pointer"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>Issue Key</span>
                        </button>

                        <a
                          href={`mailto:${inq.email}?subject=Your Receipt Processor Software Access&body=Hi ${encodeURIComponent(inq.name)},\n\nThank you for requesting software access for Receipt Processor Desktop!`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg border border-stone-700 transition-colors"
                          title="Reply via Email"
                        >
                          <Mail className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>

                    {inq.notes && (
                      <div className="p-2.5 bg-stone-900/80 rounded-lg border border-stone-800/80 text-[11px] text-stone-300">
                        <strong className="text-stone-400">Notes from applicant:</strong> {inq.notes}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-stone-800 flex justify-between items-center text-xs text-stone-500">
              <span>All requests are forwarded to moisttowlett247@gmail.com</span>
              <button
                type="button"
                onClick={() => setShowInquiriesModal(false)}
                className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
