import React, { useState, useRef, useEffect } from 'react';
import { Lock, Unlock, ArrowLeft, AlertCircle, ShieldCheck, Check, User, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { computeCredentialsHash } from '../hashUtils';

interface AdminLoginViewProps {
  onUnlock: () => void;
  savedHash: string | null;
  onSaveCredentials: (username: string, passwordHash: string) => void;
  onGoToClientPortal: () => void;
}

export const AdminLoginView: React.FC<AdminLoginViewProps> = ({
  onUnlock,
  savedHash,
  onSaveCredentials,
  onGoToClientPortal
}) => {
  const [isResetting, setIsResetting] = useState(false);
  const isInitialSetup = !savedHash || isResetting;

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);

  const userInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    userInputRef.current?.focus();
  }, [isInitialSetup]);

  const triggerError = (msg: string) => {
    setErrorMsg(msg);
    setShake(true);
    setTimeout(() => setShake(false), 500);
    setPassword('');
    setConfirmPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanUser = username.trim().toLowerCase();
    const cleanPass = password.trim();

    if (!cleanUser) {
      triggerError('Please enter an admin username.');
      return;
    }
    if (!cleanPass) {
      triggerError('Please enter your admin password.');
      return;
    }

    setLoading(true);

    try {
      if (isInitialSetup) {
        if (cleanPass.length < 6) {
          triggerError('Password must be at least 6 characters long.');
          setLoading(false);
          return;
        }
        if (cleanPass !== confirmPassword.trim()) {
          triggerError('Passwords do not match. Please re-enter.');
          setLoading(false);
          return;
        }

        const hash = await computeCredentialsHash(cleanUser, cleanPass);
        onSaveCredentials(cleanUser, hash);
        setIsResetting(false);
        onUnlock();
        return;
      }

      // Verify credentials
      const inputHash = await computeCredentialsHash(cleanUser, cleanPass);

      // Check against savedHash or fallback default (admin / 1995)
      const defaultHash = await computeCredentialsHash('admin', '1995');

      if ((savedHash && inputHash === savedHash) || inputHash === defaultHash) {
        onUnlock();
      } else {
        triggerError('Invalid username or password. Access Denied.');
      }
    } catch {
      triggerError('Cryptographic verification failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    try {
      localStorage.removeItem('receipt_processor_admin_user');
      localStorage.removeItem('receipt_processor_admin_cred_hash');
    } catch {}
    setUsername('');
    setPassword('');
    setConfirmPassword('');
    setErrorMsg(null);
    setIsResetting(true);
  };

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col justify-between font-sans selection:bg-amber-500 selection:text-stone-950">
      {/* Header */}
      <header className="border-b border-stone-800/80 bg-stone-900/60 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-stone-100">Private Operator Console</h1>
            <p className="text-[11px] text-stone-500 font-mono">RESTRICTED ADMIN ACCESS ONLY</p>
          </div>
        </div>

        <button
          onClick={onGoToClientPortal}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-stone-400 hover:text-stone-200 bg-stone-900 hover:bg-stone-800 border border-stone-800 rounded-lg transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Exit to Public Portal</span>
        </button>
      </header>

      {/* Center login card */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div 
          className={`bg-stone-900/90 border border-stone-800 rounded-2xl max-w-md w-full p-7 shadow-2xl space-y-6 transition-all ${
            shake ? 'animate-bounce border-rose-500/80 ring-2 ring-rose-500/20' : ''
          }`}
        >
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto shadow-inner">
              {isInitialSetup ? <ShieldCheck className="w-6 h-6" /> : <Lock className="w-6 h-6" />}
            </div>
            <h2 className="text-lg font-extrabold text-stone-100 tracking-tight">
              {isInitialSetup ? 'Initialize Master Admin Account' : 'Admin Authentication Required'}
            </h2>
            <p className="text-xs text-stone-400 leading-relaxed">
              {isInitialSetup 
                ? 'Create an administrative username and strong password to secure your portal.'
                : 'Sign in with your master credentials to manage licenses, subscriptions, and sync settings.'}
            </p>
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-950/60 border border-rose-800/80 rounded-xl flex items-center gap-2 text-xs text-rose-300 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-stone-300 block mb-1.5 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-stone-400" />
                Username
              </label>
              <input
                ref={userInputRef}
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setErrorMsg(null);
                }}
                placeholder={isInitialSetup ? 'e.g. admin or your username' : 'Enter admin username'}
                className="w-full text-xs font-mono py-2.5 px-3.5 bg-stone-950 border border-stone-800 rounded-xl text-stone-100 placeholder-stone-600 focus:outline-none focus:border-amber-500 shadow-inner"
                autoFocus
              />
            </div>

            <div>
              <label className="text-xs font-medium text-stone-300 block mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-stone-400" />
                  Password
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
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrorMsg(null);
                }}
                placeholder={isInitialSetup ? 'Create strong password (min 6 chars)' : 'Enter admin password'}
                className="w-full text-xs font-mono py-2.5 px-3.5 bg-stone-950 border border-stone-800 rounded-xl text-stone-100 placeholder-stone-600 focus:outline-none focus:border-amber-500 shadow-inner"
              />
            </div>

            {isInitialSetup && (
              <div>
                <label className="text-xs font-medium text-stone-300 block mb-1.5 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  Confirm Password
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setErrorMsg(null);
                  }}
                  placeholder="Re-enter password"
                  className="w-full text-xs font-mono py-2.5 px-3.5 bg-stone-950 border border-stone-800 rounded-xl text-stone-100 placeholder-stone-600 focus:outline-none focus:border-amber-500 shadow-inner"
                />
              </div>
            )}

            <div className="pt-2 space-y-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 font-semibold text-white rounded-xl text-xs transition-all shadow-md active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
              >
                {loading ? (
                  <span>Verifying...</span>
                ) : isInitialSetup ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Save Master Account & Unlock</span>
                  </>
                ) : (
                  <>
                    <Unlock className="w-4 h-4" />
                    <span>Sign In to Admin Console</span>
                  </>
                )}
              </button>

              {isInitialSetup && isResetting && (
                <button
                  type="button"
                  onClick={() => setIsResetting(false)}
                  className="w-full py-1.5 px-3 bg-stone-900 hover:bg-stone-800 text-stone-400 hover:text-stone-200 text-xs rounded-xl border border-stone-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              )}

              {!isInitialSetup && (
                <div className="flex items-center justify-between pt-1 text-[11px] text-stone-500">
                  <span>Default fallback: <code className="text-amber-400/90 font-mono">admin</code> / <code className="text-amber-400/90 font-mono">1995</code></span>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="text-stone-400 hover:text-amber-400 flex items-center gap-1 cursor-pointer transition-colors underline"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset Account
                  </button>
                </div>
              )}
            </div>
          </form>
        </div>
      </main>

      {/* Bottom Footer */}
      <footer className="border-t border-stone-800/80 bg-stone-950 py-4 px-6 text-center text-xs text-stone-600">
        Receipt Processor Desktop • Private Administrative Portal
      </footer>
    </div>
  );
};
