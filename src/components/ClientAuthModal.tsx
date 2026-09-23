import React, { useState } from 'react';
import { 
  User, 
  Lock, 
  Mail, 
  Building2, 
  Key, 
  ShieldCheck, 
  AlertCircle, 
  X, 
  CheckCircle2,
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { 
  registerClientAccount, 
  authenticateClientAccount, 
  isUsernameAvailable,
  findLicenseRecordByEmail
} from '../clientAccountService';
import { ClientAccountSession, LicenseKeyRecord, getPlanLabel } from '../types';

interface ClientAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (session: ClientAccountSession) => void;
  availableKeys?: LicenseKeyRecord[];
  initialMode?: 'login' | 'register';
}

export const ClientAuthModal: React.FC<ClientAuthModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  availableKeys = [],
  initialMode = 'login'
}) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);

  // Form states
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [detectedLicense, setDetectedLicense] = useState<LicenseKeyRecord | null>(null);

  // Status & Validation
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [usernameStatus, setUsernameStatus] = useState<{ checked: boolean; available: boolean; message?: string }>({
    checked: false,
    available: true
  });

  if (!isOpen) return null;

  // Automatically search for an existing license key whenever email changes
  const handleEmailChange = (val: string) => {
    setEmail(val);
    setErrorMsg(null);

    const clean = val.trim().toLowerCase();
    if (clean.includes('@') && clean.length > 4) {
      const match = findLicenseRecordByEmail(clean, availableKeys);
      if (match) {
        setDetectedLicense(match);
        if (!displayName && match.clientName) {
          setDisplayName(match.clientName);
        }
      } else {
        setDetectedLicense(null);
      }
    } else {
      setDetectedLicense(null);
    }
  };

  // Real-time username availability check on blur or typing in register mode
  const handleUsernameChange = (val: string) => {
    setUsername(val);
    setErrorMsg(null);
    if (mode === 'register' && val.trim().length >= 3) {
      const res = isUsernameAvailable(val);
      setUsernameStatus({
        checked: true,
        available: res.available,
        message: res.reason
      });
    } else {
      setUsernameStatus({ checked: false, available: true });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsLoading(true);

    try {
      if (mode === 'login') {
        const res = await authenticateClientAccount(username, password);
        if (res.success && res.session) {
          onLoginSuccess(res.session);
          onClose();
        } else {
          setErrorMsg(res.error || 'Authentication failed. Please verify credentials.');
        }
      } else {
        // Register Mode
        const check = isUsernameAvailable(username);
        if (!check.available) {
          setErrorMsg(check.reason || 'Username is not available.');
          setIsLoading(false);
          return;
        }

        const res = await registerClientAccount({
          username,
          password,
          email,
          displayName: displayName || username,
          companyName,
          licenseKey: detectedLicense ? detectedLicense.key : undefined,
          availableKeys
        });

        if (res.success && res.account) {
          const authRes = await authenticateClientAccount(username, password);
          if (authRes.success && authRes.session) {
            onLoginSuccess(authRes.session);
            onClose();
          }
        } else {
          setErrorMsg(res.error || 'Registration failed.');
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-md bg-stone-900 border border-stone-800 rounded-2xl shadow-2xl overflow-hidden my-6">
        {/* Header */}
        <div className="p-5 border-b border-stone-800 flex items-center justify-between bg-stone-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-stone-100">
                {mode === 'login' ? 'Client Portal Sign In' : 'Create Client Account'}
              </h2>
              <p className="text-[11px] text-stone-400">
                {mode === 'login' 
                  ? 'Access your license keys, receipts & company overview' 
                  : 'Register securely to manage your subscription & ledger'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex border-b border-stone-800 bg-stone-950/30">
          <button
            type="button"
            onClick={() => { setMode('login'); setErrorMsg(null); }}
            className={`flex-1 py-2.5 text-xs font-semibold text-center border-b-2 transition-colors cursor-pointer ${
              mode === 'login'
                ? 'border-amber-500 text-amber-400 bg-amber-500/5'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); setErrorMsg(null); }}
            className={`flex-1 py-2.5 text-xs font-semibold text-center border-b-2 transition-colors cursor-pointer ${
              mode === 'register'
                ? 'border-amber-500 text-amber-400 bg-amber-500/5'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            Create New Account
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-200 text-xs flex items-start gap-2 animate-fade-in">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Username */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label className="font-medium text-stone-300 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-amber-400" />
                <span>Username {mode === 'login' && 'or Email'}</span>
              </label>
              {mode === 'register' && usernameStatus.checked && (
                <span className={`text-[10px] font-mono flex items-center gap-1 ${
                  usernameStatus.available ? 'text-emerald-400' : 'text-rose-400'
                }`}>
                  {usernameStatus.available ? (
                    <>
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Available</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-3 h-3" />
                      <span>Taken or Reserved</span>
                    </>
                  )}
                </span>
              )}
            </div>
            <input
              type="text"
              required
              autoFocus
              value={username}
              onChange={(e) => handleUsernameChange(e.target.value)}
              placeholder={mode === 'login' ? 'e.g. jdoe or john@example.com' : 'e.g. acme_finance'}
              className="w-full px-3.5 py-2 bg-stone-950 border border-stone-700 focus:border-amber-500 rounded-xl text-xs text-stone-100 placeholder-stone-600 focus:outline-none transition-colors"
            />
            {mode === 'register' && usernameStatus.checked && !usernameStatus.available && (
              <p className="text-[11px] text-rose-400 mt-1">{usernameStatus.message}</p>
            )}
          </div>

          {/* Registration specific fields */}
          {mode === 'register' && (
            <>
              {/* Full / Display Name */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-stone-300">
                  Full Name / Contact Person
                </label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full px-3.5 py-2 bg-stone-950 border border-stone-700 focus:border-amber-500 rounded-xl text-xs text-stone-100 placeholder-stone-600 focus:outline-none transition-colors"
                />
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-stone-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-amber-400" />
                    <span>Email Address</span>
                  </span>
                  <span className="text-[10px] text-stone-400">Used to auto-link your license</span>
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  placeholder="e.g. accounting@company.com"
                  className="w-full px-3.5 py-2 bg-stone-950 border border-stone-700 focus:border-amber-500 rounded-xl text-xs text-stone-100 placeholder-stone-600 focus:outline-none transition-colors"
                />

                {/* Auto-detected License Notification */}
                {detectedLicense ? (
                  <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 flex items-start gap-2.5 mt-2 animate-in fade-in duration-200">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div className="text-xs space-y-0.5">
                      <p className="font-semibold text-emerald-300 flex items-center gap-1.5">
                        <span>Active License Found:</span>
                        <code className="font-mono text-[11px] text-emerald-200 bg-emerald-900/60 px-1.5 py-0.5 rounded">
                          {detectedLicense.key}
                        </code>
                      </p>
                      <p className="text-[11px] text-emerald-400/90">
                        {getPlanLabel(detectedLicense.plan)} • Automatically syncing to this new account upon creation.
                      </p>
                    </div>
                  </div>
                ) : email.includes('@') && email.trim().length > 5 ? (
                  <p className="text-[11px] text-stone-400 flex items-center gap-1 mt-1">
                    <Sparkles className="w-3 h-3 text-amber-400/80" />
                    <span>Any existing license purchased with this email will be linked automatically.</span>
                  </p>
                ) : null}
              </div>

              {/* Company Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-stone-300 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Company or Organization Name <span className="text-stone-500 font-normal">(Optional)</span></span>
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Acme Farms LLC"
                  className="w-full px-3.5 py-2 bg-stone-950 border border-stone-700 focus:border-amber-500 rounded-xl text-xs text-stone-100 placeholder-stone-600 focus:outline-none transition-colors"
                />
              </div>
            </>
          )}

          {/* Password */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-stone-300 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>Password</span>
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full px-3.5 py-2 bg-stone-950 border border-stone-700 focus:border-amber-500 rounded-xl text-xs text-stone-100 placeholder-stone-600 focus:outline-none transition-colors"
            />
            {mode === 'register' && (
              <p className="text-[10px] text-stone-500">
                Minimum 6 characters. Passwords are salted with cryptographic entropy and never stored in cleartext.
              </p>
            )}
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading || (mode === 'register' && usernameStatus.checked && !usernameStatus.available)}
              className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : mode === 'login' ? (
                <>
                  <span>Sign In to Account</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Register & Connect Account</span>
                </>
              )}
            </button>
          </div>

          {/* Security badge */}
          <div className="pt-2 text-center text-[10px] text-stone-500 flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Encrypted Session • SHA-256 Multi-Salted Credential Protection</span>
          </div>
        </form>
      </div>
    </div>
  );
};
