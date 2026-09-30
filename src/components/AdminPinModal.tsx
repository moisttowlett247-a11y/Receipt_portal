import React, { useState, useEffect } from 'react';
import { 
  Lock, 
  User, 
  KeyRound, 
  X, 
  Check, 
  AlertCircle, 
  Eye, 
  EyeOff, 
  Users, 
  ShieldCheck, 
  Trash2, 
  Building, 
  Mail, 
  Calendar, 
  Award, 
  Receipt, 
  Search, 
  Sparkles, 
  ExternalLink,
  ChevronRight,
  Copy,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import { computeCredentialsHash } from '../hashUtils';
import { updateCloudflareAdminCredentials, getAdminToken, syncKeyToServer } from '../licenseSyncService';
import { 
  getStoredClientAccounts, 
  subscribeToClientAccounts, 
  deleteClientAccount, 
  updateClientAccount, 
  grantPlanByAdmin,
  fetchAllAccountsFromServer,
  deleteAccountFromServer,
  getDeletedAccountKeys,
  recordAccountDeleted
} from '../clientAccountService';
import { ClientUserAccount, LicenseKeyRecord, PlanTier } from '../types';

interface AdminCredentialsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  savedHash: string | null;
  savedUsername: string | null;
  onUpdateCredentials: (username: string, passwordHash: string) => void;
  availableKeys?: LicenseKeyRecord[];
  onToast?: (msg: string) => void;
  onDeleteKey?: (keyId: string) => void;
  onLicenseRevoked?: (key: string) => void;
}

export const AdminPinModal: React.FC<AdminCredentialsModalProps> = ({
  isOpen,
  onClose,
  savedHash,
  savedUsername,
  onUpdateCredentials,
  availableKeys = [],
  onToast,
  onDeleteKey,
  onLicenseRevoked
}) => {
  // Navigation tabs: 'users' or 'credentials'
  const [activeTab, setActiveTab] = useState<'users' | 'credentials'>('users');

  const loadAllSystemAccounts = (): ClientUserAccount[] => {
    const map = new Map<string, ClientUserAccount>();
    const deleted = getDeletedAccountKeys();

    // 1. Client accounts
    try {
      const clients = getStoredClientAccounts();
      if (Array.isArray(clients)) {
        clients.forEach(c => {
          if (c && c.id) {
            const id = String(c.id).toLowerCase();
            const u = String(c.username || '').toLowerCase();
            const em = String(c.email || '').toLowerCase();
            const k = String(c.licenseKey || '').toLowerCase();
            if (!deleted.has(id) && !deleted.has(u) && (!em || !deleted.has(em)) && (!k || !deleted.has(k))) {
              map.set(c.id, c);
            }
          }
        });
      }
    } catch (err) {
      console.warn('Error loading client accounts into map:', err);
    }

    // 2. License keys / Subscribers
    try {
      const keysRaw = localStorage.getItem('receipt_processor_keys_v4') || (availableKeys.length ? JSON.stringify(availableKeys) : null);
      if (keysRaw && keysRaw !== 'undefined') {
        const keys = JSON.parse(keysRaw);
        if (Array.isArray(keys)) {
          keys.forEach((k: any) => {
            const kId = k.id || `key-${k.key}`;
            const kKey = String(k.key || '').trim().toLowerCase();
            if (deleted.has(String(kId).toLowerCase()) || (kKey && deleted.has(kKey))) {
              return;
            }
            if (!map.has(kId) && k.clientEmail && k.clientEmail.includes('@')) {
              map.set(kId, {
                id: kId,
                username: (k.clientName || 'subscriber').toLowerCase().replace(/[^a-z0-9]/g, ''),
                displayName: k.clientName || 'Subscriber',
                email: k.clientEmail,
                companyName: k.clientName || 'License Holder',
                passwordHash: 'licensed_user',
                salt: 'salt',
                licenseKey: k.key,
                plan: k.plan || 'Standard Plan',
                planTier: k.plan || 'MONTHLY',
                planStatus: k.status === 'ACTIVE' ? 'ACTIVE' : 'NONE',
                planPurchasedAt: k.issuedDate || new Date().toISOString(),
                planExpiresAt: k.expiresDate || '',
                receiptQuota: -1,
                receiptsSubmittedCount: 0,
                createdAt: k.issuedDate || new Date().toISOString()
              });
            }
          });
        }
      }
    } catch (err) {
      console.warn('Error loading license keys into map:', err);
    }

    // 3. Access inquiries / requests
    try {
      const inqRaw = localStorage.getItem('receipt_processor_inquiries');
      if (inqRaw && inqRaw !== 'undefined') {
        const inqs = JSON.parse(inqRaw);
        if (Array.isArray(inqs)) {
          inqs.forEach((i: any) => {
            const iId = i.id || `inq-${i.email}`;
            const iEm = String(i.email || '').trim().toLowerCase();
            if (deleted.has(String(iId).toLowerCase()) || (iEm && deleted.has(iEm))) {
              return;
            }
            if (!map.has(iId) && i.email && i.email.includes('@')) {
              map.set(iId, {
                id: iId,
                username: (i.name || 'inquiry').toLowerCase().replace(/[^a-z0-9]/g, ''),
                displayName: i.name || 'Access Requester',
                email: i.email,
                companyName: i.company || i.receiptVolume || 'Portal Inquiry',
                passwordHash: 'inquiry_user',
                salt: 'salt',
                plan: i.interestedPlan || 'Access Request',
                planStatus: 'NONE',
                receiptQuota: 0,
                receiptsSubmittedCount: 0,
                createdAt: i.submittedAt || new Date().toISOString()
              });
            }
          });
        }
      }
    } catch (err) {
      console.warn('Error loading inquiries into map:', err);
    }

    // 4. Admin Account (Authoritative - Always ensured)
    try {
      const adminUsr = (savedUsername || localStorage.getItem('receipt_processor_admin_user') || 'admin').trim();
      if (adminUsr) {
        const adminId = `admin-${adminUsr.toLowerCase()}`;
        if (!map.has(adminId)) {
          map.set(adminId, {
            id: adminId,
            username: adminUsr,
            displayName: 'Platform Admin',
            email: 'moisttowlett247@gmail.com',
            companyName: 'System Administration',
            passwordHash: 'admin_master',
            salt: 'admin_salt',
            plan: 'Master Administrator',
            planTier: 'ADMIN' as any,
            planStatus: 'ACTIVE',
            receiptQuota: -1,
            receiptsSubmittedCount: 0,
            createdAt: '2026-01-01T00:00:00.000Z'
          });
        }
      }
    } catch (err) {
      console.warn('Error adding admin account to map:', err);
    }

    const final = Array.from(map.values());
    // Fallback guarantee: if map was somehow empty, add default admin
    if (final.length === 0) {
      return [{
        id: 'admin-default',
        username: 'admin',
        displayName: 'Platform Admin',
        email: 'moisttowlett247@gmail.com',
        companyName: 'System Administration',
        passwordHash: 'admin_master',
        salt: 'admin_salt',
        plan: 'Master Administrator',
        planTier: 'ADMIN' as any,
        planStatus: 'ACTIVE',
        receiptQuota: -1,
        receiptsSubmittedCount: 0,
        createdAt: '2026-01-01T00:00:00.000Z'
      }];
    }
    return final;
  };

  // Client accounts list state
  const [accounts, setAccounts] = useState<ClientUserAccount[]>(() => loadAllSystemAccounts());
  const [searchQuery, setSearchQuery] = useState('');
  const [planFilter, setPlanFilter] = useState<string>('ALL');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    const token = localStorage.getItem('receipt_processor_admin_token') || undefined;
    try {
      await fetchAllAccountsFromServer(token);
      setAccounts(loadAllSystemAccounts());
    } finally {
      setIsRefreshing(false);
    }
    if (onToast) onToast('Account database synchronized with cloud.');
  };

  // Selected account for details pop-out
  const [selectedUser, setSelectedUser] = useState<ClientUserAccount | null>(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<ClientUserAccount | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Admin Credentials form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newUsername, setNewUsername] = useState(savedUsername || 'admin');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);

  // Subscribe to real-time client account updates and reload all
  useEffect(() => {
    if (isOpen) {
      // 1. Initial fetch from server for Admin
      const token = localStorage.getItem('receipt_processor_admin_token') || undefined;
      fetchAllAccountsFromServer(token);

      // 2. Local subscription for UI updates
      const unsubscribe = subscribeToClientAccounts(() => {
        const freshList = loadAllSystemAccounts();
        setAccounts(freshList);
      });
      return () => unsubscribe();
    }
  }, [isOpen, availableKeys, savedUsername]);

  useEffect(() => {
    if (isOpen) {
      setCurrentPassword('');
      setNewUsername(savedUsername || 'admin');
      setNewPassword('');
      setConfirmPassword('');
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [isOpen, savedUsername]);

  if (!isOpen) return null;

  const triggerError = (msg: string) => {
    setErrorMsg(msg);
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanUser = (savedUsername || 'admin').trim().toLowerCase();
    const cleanCurrentPass = currentPassword.trim();
    const cleanNewUser = newUsername.trim().toLowerCase();
    const cleanNewPass = newPassword.trim();

    if (!cleanCurrentPass) {
      triggerError('Please enter your current password.');
      return;
    }
    if (!cleanNewUser) {
      triggerError('Please enter a valid username.');
      return;
    }
    // Duplicate prevention: check client user accounts to avoid collision
    try {
      const storedClients = getStoredClientAccounts();
      if (storedClients.some(c => c.username?.toLowerCase() === cleanNewUser)) {
        triggerError(`Username "${cleanNewUser}" is already taken by a client account. Please choose a different username.`);
        return;
      }
    } catch {}

    if (cleanNewPass.length < 6) {
      triggerError('New password must be at least 6 characters.');
      return;
    }
    if (cleanNewPass !== confirmPassword.trim()) {
      triggerError('New passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      // 1. Attempt update on Cloudflare Worker KV
      const cfRes = await updateCloudflareAdminCredentials(cleanCurrentPass, cleanNewUser, cleanNewPass);
      if (cfRes.success) {
        const newHash = await computeCredentialsHash(cleanNewUser, cleanNewPass);
        onUpdateCredentials(cleanNewUser, newHash);
        setSuccessMsg(`Admin credentials updated successfully for ${cleanNewUser}!`);
        if (onToast) onToast(`Admin credentials updated for ${cleanNewUser}`);
        setTimeout(() => onClose(), 1200);
        return;
      }

      // 2. Fallback to local cryptographic check
      const currentHash = await computeCredentialsHash(cleanUser, cleanCurrentPass);
      const defaultHash = await computeCredentialsHash('admin', '1995');

      if ((savedHash && currentHash === savedHash) || currentHash === defaultHash) {
        const newHash = await computeCredentialsHash(cleanNewUser, cleanNewPass);
        onUpdateCredentials(cleanNewUser, newHash);
        setSuccessMsg(`Admin credentials updated successfully for ${cleanNewUser}!`);
        if (onToast) onToast(`Admin credentials updated for ${cleanNewUser}`);
        setTimeout(() => onClose(), 1200);
      } else {
        triggerError(cfRes.message || 'Current password is incorrect.');
      }
    } catch {
      triggerError('Error updating credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (user: ClientUserAccount) => {
    // 1. Record tombstones for all identifiers
    recordAccountDeleted(user.id);
    recordAccountDeleted(user.username);
    if (user.email) recordAccountDeleted(user.email);
    if (user.licenseKey) recordAccountDeleted(user.licenseKey);

    // 2. Delete from server and local storage
    const token = getAdminToken() || undefined;
    deleteAccountFromServer(user.id, user.email, user.username, user.licenseKey, token).catch(() => {});
    
    // 3. Delete license key if present locally and notify App state & server
    const keyStr = user.licenseKey || (user.id.startsWith('key-') ? user.id.replace('key-', '') : '');
    if (keyStr) {
      recordAccountDeleted(keyStr);
      recordAccountDeleted(`key-${keyStr}`);
      syncKeyToServer({ key: keyStr } as any, 'DELETE').catch(() => {});
      try {
        const raw = localStorage.getItem('receipt_processor_keys_v4');
        if (raw) {
          const keys = JSON.parse(raw);
          const filteredKeys = keys.filter((k: any) => 
            k.key?.toUpperCase() !== keyStr.toUpperCase() && 
            k.id !== user.id && 
            k.id !== `key-${keyStr}`
          );
          localStorage.setItem('receipt_processor_keys_v4', JSON.stringify(filteredKeys));
        }
      } catch {}
      if (onLicenseRevoked) onLicenseRevoked(keyStr);
      if (onDeleteKey) {
        onDeleteKey(keyStr);
        onDeleteKey(user.id);
      }
    }

    // 4. Delete access inquiry if present
    try {
      const rawInq = localStorage.getItem('receipt_processor_inquiries');
      if (rawInq) {
        const inqs = JSON.parse(rawInq);
        const filteredInq = inqs.filter((i: any) => i.id !== user.id && i.email !== user.email);
        localStorage.setItem('receipt_processor_inquiries', JSON.stringify(filteredInq));
      }
    } catch {}

    // Immediately update modal state without any delay or vanishing
    setAccounts(loadAllSystemAccounts());
    setConfirmDeleteUser(null);
    setSelectedUser(null);
    if (onToast) onToast(`Permanently deleted account for ${user.displayName} (@${user.username})`);
  };

  const handleGrantPlan = (user: ClientUserAccount, tier: PlanTier, planName: string) => {
    const res = grantPlanByAdmin(user.id, tier, planName);
    if (res.success && res.account) {
      setSelectedUser(res.account);
      if (onToast) onToast(`Updated plan for ${user.displayName} to ${planName}`);
    }
  };

  // Filter accounts
  const filteredAccounts = accounts.filter(acc => {
    // 0. Admin account always matches if it's the current user's admin account
    // This ensures the "zero users" doesn't happen for the admin themselves
    const isAdmin = acc.planTier === 'ADMIN';
    
    const q = searchQuery.trim().toLowerCase();
    const matchQuery = !q || 
      acc.displayName.toLowerCase().includes(q) || 
      acc.username.toLowerCase().includes(q) || 
      acc.email.toLowerCase().includes(q) || 
      (acc.companyName && acc.companyName.toLowerCase().includes(q)) ||
      (acc.licenseKey && acc.licenseKey.toLowerCase().includes(q));

    const matchPlan = isAdmin || planFilter === 'ALL' || 
      (planFilter === 'ACTIVE' && acc.planStatus === 'ACTIVE') ||
      (planFilter === 'NONE' && (!acc.planStatus || acc.planStatus === 'NONE')) ||
      (acc.planTier === planFilter);

    return matchQuery && matchPlan;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div 
        className={`bg-stone-900 border border-stone-800 rounded-3xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[90vh] overflow-hidden transition-transform ${
          shake ? 'animate-bounce border-rose-500/80' : ''
        }`}
      >
        {/* Modal Top Header */}
        <div className="p-5 pb-3 border-b border-stone-800 bg-stone-950/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-stone-100">
                  Account &amp; User Management
                </h3>
                <button
                  type="button"
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                  className={`p-1.5 rounded-lg bg-stone-900 border border-stone-800 text-stone-400 hover:text-amber-400 transition-all cursor-pointer ${isRefreshing ? 'animate-spin opacity-50' : ''}`}
                  title="Force Synchronize with Cloud Database"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  Admin Console
                </span>
              </div>
              <p className="text-xs text-stone-400">
                View registered users, inspect account details, and configure master security
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-stone-400 hover:text-stone-200 hover:bg-stone-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation Buttons */}
        <div className="px-5 pt-2 border-b border-stone-800 bg-stone-900/90 flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2.5 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'users'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <Users className="w-4 h-4 text-amber-400" />
            <span>Registered Users</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 ml-1">
              {accounts.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('credentials')}
            className={`px-4 py-2.5 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'credentials'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Admin Master Security</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* TAB 1: REGISTERED USERS */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              {/* Search & Filter Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-stone-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name, @username, email, or company..."
                    className="w-full pl-9 pr-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-xs text-stone-200 focus:outline-none focus:border-amber-500 placeholder:text-stone-600"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-2.5 text-stone-500 hover:text-stone-300"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-stone-400 font-medium">Plan:</span>
                  <select
                    value={planFilter}
                    onChange={(e) => setPlanFilter(e.target.value)}
                    className="px-2.5 py-2 bg-stone-950 border border-stone-800 rounded-xl text-xs text-stone-300 focus:outline-none focus:border-amber-500"
                  >
                    <option value="ALL">All Plans ({accounts.length})</option>
                    <option value="ACTIVE">Active Plan Subscriptions</option>
                    <option value="ANNUAL">Annual Farm Plan</option>
                    <option value="3MONTH">Quarterly (3 Month)</option>
                    <option value="MONTHLY">Monthly Plan</option>
                    <option value="DEMO">Demo Trial</option>
                    <option value="NONE">No Active Plan</option>
                  </select>
                </div>
              </div>

              {/* Users Cards / List */}
              {filteredAccounts.length === 0 ? (
                <div className="p-10 text-center rounded-2xl bg-stone-950/60 border border-stone-800/80 space-y-2">
                  <Users className="w-8 h-8 text-stone-600 mx-auto" />
                  <h4 className="text-sm font-semibold text-stone-300">No registered accounts found</h4>
                  <p className="text-xs text-stone-500 max-w-sm mx-auto">
                    {searchQuery ? 'No user accounts match your search filter.' : 'Clients who sign up or submit receipts online will automatically appear here.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1 divide-y divide-stone-800/40">
                  {filteredAccounts.map((user) => {
                    const initials = user.displayName
                      ? user.displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
                      : user.username.slice(0, 2).toUpperCase();

                    return (
                      <div
                        key={user.id}
                        onClick={() => setSelectedUser(user)}
                        className="pt-2 first:pt-0 p-3 rounded-2xl bg-stone-950/70 hover:bg-stone-800/60 border border-stone-800/80 hover:border-amber-500/40 transition-all cursor-pointer flex items-center justify-between gap-3 group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500/20 to-stone-900 border border-amber-500/30 flex items-center justify-center text-amber-300 font-bold text-xs shrink-0 shadow-sm">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-xs font-bold text-stone-100 truncate group-hover:text-amber-300 transition-colors">
                                {user.displayName || user.username}
                              </h4>
                              <span className="text-[10px] text-stone-400 font-mono">
                                @{user.username}
                              </span>
                              {user.planStatus === 'ACTIVE' ? (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                  {user.planTier || 'ACTIVE'}
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-mono text-stone-500 bg-stone-900 border border-stone-800">
                                  NO PLAN
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-stone-400 flex items-center gap-2 truncate mt-0.5">
                              <span className="truncate">{user.email}</span>
                              {user.companyName && (
                                <>
                                  <span>•</span>
                                  <span className="truncate text-stone-500">{user.companyName}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right hidden sm:block">
                            <div className="text-[11px] font-bold font-mono text-stone-300 flex items-center justify-end gap-1">
                              <Receipt className="w-3 h-3 text-amber-400" />
                              <span>{user.receiptsSubmittedCount || 0} Receipts</span>
                            </div>
                            <div className="text-[10px] text-stone-500 font-mono">
                              {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Active User'}
                            </div>
                          </div>
                          <div className="w-7 h-7 rounded-xl bg-stone-900 group-hover:bg-amber-500/20 text-stone-400 group-hover:text-amber-300 flex items-center justify-center transition-colors">
                            <ChevronRight className="w-4 h-4" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ADMIN MASTER CREDENTIALS */}
          {activeTab === 'credentials' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-stone-950/80 border border-stone-800 text-xs space-y-1">
                <div className="font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Administrative Security &amp; Salted Hash</span>
                </div>
                <p className="text-stone-400 leading-relaxed">
                  Update your master administrator password. Password hashes are generated using cryptographic salting (SHA-256) 
                  and synced with your Cloudflare KV configuration for offline &amp; online verification.
                </p>
              </div>

              {errorMsg && (
                <div className="p-3 bg-rose-950/50 border border-rose-800/80 rounded-xl flex items-center gap-2 text-xs text-rose-300">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-3 bg-emerald-950/50 border border-emerald-800/80 rounded-xl flex items-center gap-2 text-xs text-emerald-300">
                  <Check className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{successMsg}</span>
                </div>
              )}

              <form onSubmit={handleCredentialsSubmit} className="space-y-3.5 text-xs">
                <div>
                  <label className="text-stone-300 font-medium block mb-1">Current Password</label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current master password"
                    className="w-full font-mono px-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-stone-200 focus:outline-none focus:border-amber-500"
                    autoFocus
                  />
                </div>

                <div className="h-px bg-stone-800/80 my-2" />

                <div>
                  <label className="text-stone-300 font-medium block mb-1 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-stone-400" />
                    New Admin Username
                  </label>
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="e.g. admin or custom operator handle"
                    className="w-full font-mono px-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-stone-200 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-stone-300 font-medium block mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-stone-400" />
                      New Password (min 6 chars)
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-[11px] text-stone-500 hover:text-stone-300 flex items-center gap-1 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      <span>{showPassword ? 'Hide' : 'Show'}</span>
                    </button>
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new master password"
                    className="w-full font-mono px-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-stone-200 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-stone-300 font-medium block mb-1">Confirm New Password</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new master password"
                    className="w-full font-mono px-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-stone-200 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="pt-2 flex justify-between items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3.5 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-medium rounded-xl transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-xl shadow transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{loading ? 'Saving...' : 'Save Admin Credentials'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Modal Bottom Status Bar */}
        <div className="p-3.5 bg-stone-950 border-t border-stone-800 text-[11px] text-stone-500 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Multi-Client Central Database Active</span>
          </div>
          <span className="font-mono text-stone-400">
            {accounts.length} Total Users Registered
          </span>
        </div>
      </div>

      {/* POP-OUT DRAWER / MODAL: USER ACCOUNT DETAILS */}
      {selectedUser && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-150">
          <div className="bg-stone-900 border border-stone-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150">
            {/* Details Header */}
            <div className="flex items-center justify-between pb-3 border-b border-stone-800">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500/20 to-stone-950 border border-amber-500/30 flex items-center justify-center text-amber-300 font-bold text-sm shadow-md">
                  {selectedUser.displayName
                    ? selectedUser.displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
                    : selectedUser.username.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>{selectedUser.displayName || selectedUser.username}</span>
                    <span className="text-xs text-amber-400 font-mono font-normal">
                      @{selectedUser.username}
                    </span>
                  </h3>
                  <p className="text-xs text-stone-400 font-mono">
                    ID: {selectedUser.id}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="p-1.5 rounded-xl text-stone-400 hover:text-stone-200 hover:bg-stone-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* User Details Grid */}
            <div className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-stone-950 border border-stone-800/80 space-y-1">
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-stone-400 flex items-center gap-1">
                    <Mail className="w-3 h-3 text-stone-500" />
                    <span>Email Address</span>
                  </div>
                  <div className="font-medium text-stone-200 truncate">{selectedUser.email}</div>
                </div>

                <div className="p-3 rounded-xl bg-stone-950 border border-stone-800/80 space-y-1">
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-stone-400 flex items-center gap-1">
                    <Building className="w-3 h-3 text-stone-500" />
                    <span>Business / Farm Entity</span>
                  </div>
                  <div className="font-medium text-stone-200 truncate">{selectedUser.companyName || 'Not Specified'}</div>
                </div>
              </div>

              {/* Plan & Subscription Card */}
              <div className="p-4 rounded-2xl bg-stone-950 border border-amber-500/20 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-wider font-bold text-amber-400 flex items-center gap-1">
                    <Award className="w-3.5 h-3.5" />
                    <span>Active Subscription & Service Plan</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                    selectedUser.planStatus === 'ACTIVE'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-stone-800 text-stone-400'
                  }`}>
                    {selectedUser.planStatus === 'ACTIVE' ? 'ACTIVE' : 'NO PLAN'}
                  </span>
                </div>

                <div className="text-sm font-bold text-white">
                  {selectedUser.plan || 'Free Client Intake Profile'}
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] text-stone-400 pt-1 border-t border-stone-900">
                  <div>
                    <span className="text-stone-500 block">Plan Expiration:</span>
                    <span className="font-mono text-stone-200">{selectedUser.planExpiresAt || 'Never / Non-Expiring'}</span>
                  </div>
                  <div>
                    <span className="text-stone-500 block">Receipts Processed:</span>
                    <span className="font-mono text-amber-300 font-bold">{selectedUser.receiptsSubmittedCount || 0} Submissions</span>
                  </div>
                </div>

                {/* Quick Plan Override Buttons */}
                <div className="pt-2 border-t border-stone-900/80 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-stone-500 font-medium">Quick Grant:</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleGrantPlan(selectedUser, 'ANNUAL', 'Annual Farm & Business Package')}
                      className="px-2 py-1 rounded bg-stone-900 hover:bg-amber-500/20 border border-stone-800 hover:border-amber-500/40 text-[10px] text-stone-300 hover:text-amber-300 font-medium transition-colors cursor-pointer"
                    >
                      Grant Annual
                    </button>
                    <button
                      type="button"
                      onClick={() => handleGrantPlan(selectedUser, '3MONTH', 'Quarterly Tax & Expense Prep')}
                      className="px-2 py-1 rounded bg-stone-900 hover:bg-amber-500/20 border border-stone-800 hover:border-amber-500/40 text-[10px] text-stone-300 hover:text-amber-300 font-medium transition-colors cursor-pointer"
                    >
                      Grant Quarterly
                    </button>
                    <button
                      type="button"
                      onClick={() => handleGrantPlan(selectedUser, 'MONTHLY', 'Monthly Bookkeeping')}
                      className="px-2 py-1 rounded bg-stone-900 hover:bg-amber-500/20 border border-stone-800 hover:border-amber-500/40 text-[10px] text-stone-300 hover:text-amber-300 font-medium transition-colors cursor-pointer"
                    >
                      Grant Monthly
                    </button>
                  </div>
                </div>
              </div>

              {/* Linked License Key if present */}
              {selectedUser.licenseKey && (
                <div className="p-3 rounded-xl bg-stone-950 border border-stone-800/80 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[10px] text-stone-500 uppercase tracking-wider font-semibold">Linked License String</div>
                    <div className="font-mono text-xs text-amber-300 truncate">{selectedUser.licenseKey}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(selectedUser.licenseKey!);
                      setCopiedKey(true);
                      setTimeout(() => setCopiedKey(false), 2000);
                    }}
                    className="px-2.5 py-1 rounded bg-stone-900 hover:bg-stone-800 text-stone-300 text-[10px] font-medium border border-stone-800 transition-colors flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    {copiedKey ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedKey ? 'Copied' : 'Copy Key'}</span>
                  </button>
                </div>
              )}

              {/* Created Date */}
              <div className="text-[11px] text-stone-500 flex items-center gap-1.5 px-1">
                <Calendar className="w-3.5 h-3.5" />
                <span>Account Created: {selectedUser.createdAt ? new Date(selectedUser.createdAt).toLocaleString() : 'Permanent Member'}</span>
              </div>
            </div>

            {/* Bottom Actions: Delete Account & Close */}
            <div className="pt-3 border-t border-stone-800 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteUser(selectedUser)}
                className="px-3.5 py-2 bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300 hover:text-rose-100 text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span>Delete Account</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION POP-OUT: DELETE USER ACCOUNT */}
      {confirmDeleteUser && (
        <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-150">
          <div className="bg-stone-900 border border-rose-500/50 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-white">
                Delete Client Account?
              </h3>
              <p className="text-xs text-stone-400">
                Are you sure you want to permanently delete the registered account for <strong className="text-white">{confirmDeleteUser.displayName || confirmDeleteUser.username}</strong> (<code className="text-amber-300 font-mono">@{confirmDeleteUser.username}</code>)?
              </p>
            </div>

            <div className="p-3 bg-stone-950 rounded-xl border border-stone-800 text-[11px] text-stone-400 space-y-1">
              <div>• Email: <span className="text-stone-200 font-mono">{confirmDeleteUser.email}</span></div>
              <div>• Plan: <span className="text-stone-200">{confirmDeleteUser.plan || 'No Plan'}</span></div>
              <div>• Receipts Submitted: <span className="text-amber-300 font-bold">{confirmDeleteUser.receiptsSubmittedCount || 0}</span></div>
              <div className="text-rose-400/90 pt-1 font-medium">⚠️ This action will revoke client portal access and remove their saved login credentials.</div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteUser(null)}
                className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteUser(confirmDeleteUser)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Yes, Delete Account</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
