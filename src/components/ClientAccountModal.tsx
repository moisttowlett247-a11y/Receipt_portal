import React, { useState } from 'react';
import { 
  User, 
  Building2, 
  Key, 
  Mail, 
  Trash2, 
  ShieldAlert, 
  Check, 
  X, 
  LogOut, 
  ShieldCheck, 
  AlertTriangle,
  RefreshCw,
  Copy,
  Calendar,
  Layers,
  Sparkles
} from 'lucide-react';
import { ClientAccountSession, LicenseKeyRecord, getPlanLabel } from '../types';
import { 
  updateClientAccountProfile, 
  deleteClientAccountAndData 
} from '../clientAccountService';

interface ClientAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: ClientAccountSession;
  onSessionUpdated: (updated: ClientAccountSession) => void;
  onLogout: () => void;
  availableKeys: LicenseKeyRecord[];
  onLicenseRevoked?: (key: string) => void;
}

export const ClientAccountModal: React.FC<ClientAccountModalProps> = ({
  isOpen,
  onClose,
  session,
  onSessionUpdated,
  onLogout,
  availableKeys,
  onLicenseRevoked
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'settings' | 'danger'>('overview');

  // Edit fields
  const [displayName, setDisplayName] = useState(session.displayName || '');
  const [companyName, setCompanyName] = useState(session.companyName || '');
  const [licenseKeyInput, setLicenseKeyInput] = useState(session.licenseKey || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  // Danger zone confirmation
  const [confirmDeleteText, setConfirmDeleteText] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen) return null;

  // Find linked license record if present
  const linkedKeyRecord = session.licenseKey 
    ? availableKeys.find(k => k.key.toUpperCase() === session.licenseKey?.toUpperCase())
    : null;

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);

    const cleanKey = licenseKeyInput.trim().toUpperCase() || null;
    const res = updateClientAccountProfile(session.userId, {
      displayName,
      companyName,
      licenseKey: cleanKey
    });

    if (res.success && res.account) {
      onSessionUpdated({
        ...session,
        displayName: res.account.displayName,
        companyName: res.account.companyName,
        licenseKey: res.account.licenseKey
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
    setIsSaving(false);
  };

  const handleCopyKey = () => {
    if (session.licenseKey) {
      navigator.clipboard.writeText(session.licenseKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  const handleDeleteAccount = () => {
    if (confirmDeleteText !== 'DELETE') {
      setDeleteError('Please type DELETE in all caps to confirm permanent deletion.');
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const res = deleteClientAccountAndData(session.userId, {
        revokeLicenseKey: true,
        licenseKeysList: availableKeys,
        onLicenseRevoked
      });

      if (res.success) {
        onLogout();
        onClose();
      } else {
        setDeleteError('Failed to remove account. Please try again.');
        setIsDeleting(false);
      }
    } catch (err: any) {
      setDeleteError(err.message || 'Error deleting account.');
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-2xl bg-stone-900 border border-stone-800 rounded-2xl shadow-2xl overflow-hidden my-6">
        {/* Header */}
        <div className="p-5 border-b border-stone-800 flex items-center justify-between bg-stone-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 font-bold text-sm">
              {session.displayName.slice(0, 2).toUpperCase() || 'US'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-stone-100">{session.displayName}</h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  @{session.username}
                </span>
              </div>
              <p className="text-xs text-stone-400">
                {session.companyName ? `${session.companyName} • ` : ''}{session.email}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onLogout}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-stone-400 hover:text-stone-200 bg-stone-800 hover:bg-stone-700 transition-colors cursor-pointer flex items-center gap-1.5"
              title="Sign out of your client session"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-stone-800 bg-stone-950/30 px-6 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`py-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'overview'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <User className="w-4 h-4" />
            <span>Account Overview</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`py-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'settings'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Profile & License</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('danger')}
            className={`py-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'danger'
                ? 'border-rose-500 text-rose-400'
                : 'border-transparent text-stone-400 hover:text-rose-400'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Account Deactivation & Data Erasure</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* License Status Card */}
              <div className="p-4 rounded-xl bg-stone-950/80 border border-stone-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-stone-400 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-amber-400" />
                    <span>Connected License Key</span>
                  </span>
                  {session.licenseKey ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {linkedKeyRecord?.status || 'Active'}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-stone-800 text-stone-400 border border-stone-700">
                      No Key Linked
                    </span>
                  )}
                </div>

                {session.licenseKey ? (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-stone-900 border border-stone-800">
                    <div className="space-y-0.5">
                      <div className="font-mono text-xs font-bold text-amber-300">
                        {session.licenseKey}
                      </div>
                      <div className="text-[11px] text-stone-400">
                        Tier: <span className="text-stone-200">{linkedKeyRecord ? getPlanLabel(linkedKeyRecord.plan) : 'Standard License'}</span>
                        {linkedKeyRecord?.expiresDate && ` • Valid until: ${linkedKeyRecord.expiresDate}`}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyKey}
                      className="px-3 py-1.5 rounded-md bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs transition-colors cursor-pointer flex items-center gap-1"
                    >
                      {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs text-amber-300/90 flex items-center justify-between gap-3">
                    <span>You have not connected an active license key yet. Add your key under Profile & License.</span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('settings')}
                      className="px-2.5 py-1 text-[11px] font-semibold bg-amber-600 hover:bg-amber-500 text-white rounded cursor-pointer whitespace-nowrap"
                    >
                      Add Key
                    </button>
                  </div>
                )}
              </div>

              {/* Account Details Bento */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-stone-950/60 border border-stone-800 space-y-1">
                  <span className="text-[11px] text-stone-400">Username</span>
                  <p className="text-xs font-bold text-stone-200 font-mono">@{session.username}</p>
                </div>

                <div className="p-4 rounded-xl bg-stone-950/60 border border-stone-800 space-y-1">
                  <span className="text-[11px] text-stone-400">Verified Email</span>
                  <p className="text-xs font-bold text-stone-200">{session.email}</p>
                </div>

                <div className="p-4 rounded-xl bg-stone-950/60 border border-stone-800 space-y-1">
                  <span className="text-[11px] text-stone-400">Registered Organization</span>
                  <p className="text-xs font-bold text-stone-200">{session.companyName || 'Individual Proprietor'}</p>
                </div>

                <div className="p-4 rounded-xl bg-stone-950/60 border border-stone-800 space-y-1">
                  <span className="text-[11px] text-stone-400">Session Status</span>
                  <p className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Secure Authenticated Token</span>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PROFILE & LICENSE SETTINGS */}
          {activeTab === 'settings' && (
            <form onSubmit={handleSaveProfile} className="space-y-4">
              {saveSuccess && (
                <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-800 text-emerald-200 text-xs flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Profile updated successfully!</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-stone-300">Display / Full Name</label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3.5 py-2 bg-stone-950 border border-stone-700 focus:border-amber-500 rounded-xl text-xs text-stone-100 placeholder-stone-600 focus:outline-none transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-stone-300">Company Name</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Acme Holdings"
                  className="w-full px-3.5 py-2 bg-stone-950 border border-stone-700 focus:border-amber-500 rounded-xl text-xs text-stone-100 placeholder-stone-600 focus:outline-none transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-stone-300 flex items-center justify-between">
                  <span>Linked License Key</span>
                  <span className="text-[10px] text-stone-400 font-mono">Format: PLAN-XXXX-XXXX-YYYY</span>
                </label>
                <input
                  type="text"
                  value={licenseKeyInput}
                  onChange={(e) => setLicenseKeyInput(e.target.value.toUpperCase())}
                  placeholder="e.g. ANNUAL-1234-5678-2026"
                  className="w-full px-3.5 py-2 bg-stone-950 border border-stone-700 focus:border-amber-500 rounded-xl text-xs text-stone-100 font-mono placeholder-stone-600 focus:outline-none uppercase transition-colors"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="py-2.5 px-4 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: ACCOUNT DEACTIVATION & DATA ERASURE */}
          {activeTab === 'danger' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-stone-950 border border-stone-800 space-y-3">
                <div className="flex items-center gap-2 text-stone-200 font-semibold text-xs">
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  <span>Account Deactivation & Enterprise Data Erasure</span>
                </div>
                <p className="text-xs text-stone-400 leading-relaxed">
                  Initiating account deactivation will permanently disassociate your enterprise profile, unlink and 
                  purge registered company metadata, and immediately revoke software license authorizations in accordance 
                  with enterprise privacy standards and applicable statutory data erasure regulations (GDPR / CCPA).
                </p>
                <div className="p-2.5 rounded-lg bg-stone-900 border border-stone-800 text-[11px] text-stone-300 flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Notice: This action is permanent and cannot be reversed once finalized.</span>
                </div>
              </div>

              {deleteError && (
                <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-700 text-rose-200 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  <span>{deleteError}</span>
                </div>
              )}

              <div className="space-y-2 pt-2">
                <label className="text-xs font-medium text-stone-300">
                  To confirm account closure and license revocation, please type <strong className="text-rose-400 font-mono">DELETE</strong>:
                </label>
                <input
                  type="text"
                  value={confirmDeleteText}
                  onChange={(e) => setConfirmDeleteText(e.target.value)}
                  placeholder="DELETE"
                  className="w-full px-3.5 py-2 bg-stone-950 border border-stone-700 focus:border-rose-500 rounded-xl text-xs text-stone-100 placeholder-stone-600 focus:outline-none transition-colors font-mono"
                />
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={isDeleting || confirmDeleteText !== 'DELETE'}
                  className="py-2.5 px-4 bg-rose-700 hover:bg-rose-600 disabled:opacity-40 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center gap-2 shadow-sm"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{isDeleting ? 'Processing Deactivation...' : 'Execute Account Deactivation & Revoke License'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
