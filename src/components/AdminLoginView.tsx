import React, { useState, useRef, useEffect } from 'react';
import { Lock, ArrowLeft, AlertCircle, ShieldCheck, User, Eye, EyeOff, Zap } from 'lucide-react';
import { loginToCloudflareAdmin, CLOUDFLARE_WORKER_URL } from '../licenseSyncService';
import { computeCredentialsHash } from '../hashUtils';

interface AdminLoginViewProps {
  onUnlock: () => void;
  savedHash: string | null;
  onSaveCredentials?: (username: string, passwordHash: string) => void;
  onGoToClientPortal: () => void;
}

export const AdminLoginView: React.FC<AdminLoginViewProps> = ({
  onUnlock,
  savedHash,
  onGoToClientPortal
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lockoutSecondsRemaining, setLockoutSecondsRemaining] = useState<number>(0);

  const userInputRef = useRef<HTMLInputElement>(null);

  // Check stored failed attempts and lockout expiration
  useEffect(() => {
    try {
      const lockUntil = parseInt(sessionStorage.getItem('receipt_admin_lockout_until') || '0', 10);
      const now = Date.now();
      if (lockUntil > now) {
        setLockoutSecondsRemaining(Math.ceil((lockUntil - now) / 1000));
      }
    } catch {}
  }, []);

  // Lockout countdown timer
  useEffect(() => {
    if (lockoutSecondsRemaining <= 0) return;
    const interval = setInterval(() => {
      setLockoutSecondsRemaining(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          try {
            sessionStorage.removeItem('receipt_admin_lockout_until');
            sessionStorage.removeItem('receipt_admin_fail_count');
          } catch {}
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutSecondsRemaining]);

  useEffect(() => {
    userInputRef.current?.focus();
  }, []);

  const recordFailedAttempt = () => {
    try {
      const currentFails = parseInt(sessionStorage.getItem('receipt_admin_fail_count') || '0', 10) + 1;
      sessionStorage.setItem('receipt_admin_fail_count', String(currentFails));
      if (currentFails >= 5) {
        // Lockout for 60 seconds after 5 failed attempts
        const lockUntil = Date.now() + 60000;
        sessionStorage.setItem('receipt_admin_lockout_until', String(lockUntil));
        setLockoutSecondsRemaining(60);
      }
    } catch {}
  };

  const clearFailedAttempts = () => {
    try {
      sessionStorage.removeItem('receipt_admin_fail_count');
      sessionStorage.removeItem('receipt_admin_lockout_until');
    } catch {}
  };

  const triggerError = (msg: string) => {
    recordFailedAttempt();
    setErrorMsg(msg);
    setShake(true);
    setTimeout(() => setShake(false), 500);
    setPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutSecondsRemaining > 0) {
      setErrorMsg(`Too many failed login attempts. Temporarily locked for security. Please wait ${lockoutSecondsRemaining}s.`);
      return;
    }
    setErrorMsg(null);

    const cleanUser = username.trim();
    const cleanPass = password.trim();

    if (!cleanUser) {
      triggerError('Please enter your administrator username.');
      return;
    }
    if (!cleanPass) {
      triggerError('Please enter your administrator password.');
      return;
    }

    setLoading(true);

    try {
      // 1. Primary: Authenticate securely against Cloudflare Worker API
      const cfRes = await loginToCloudflareAdmin(cleanUser, cleanPass);
      if (cfRes.success) {
        clearFailedAttempts();
        onUnlock();
        return;
      }

      // 2. Offline fallback: Check saved credential hash if Cloudflare was unreachable
      if (savedHash) {
        const inputHash = await computeCredentialsHash(cleanUser.toLowerCase(), cleanPass);
        if (inputHash === savedHash) {
          clearFailedAttempts();
          onUnlock();
          return;
        }
      }

      triggerError(cfRes.error || 'Invalid administrator credentials. Access Denied.');
    } catch {
      triggerError('Authentication verification failed. Access Denied.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col justify-between font-sans selection:bg-amber-500 selection:text-stone-950">
      {/* Top Header */}
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
              <Lock className="w-6 h-6" />
            </div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-medium mx-auto">
              <Zap className="w-3 h-3 text-amber-400" />
              <span>Cloudflare Edge Auth Protected</span>
            </div>
            <h2 className="text-lg font-extrabold text-stone-100 tracking-tight">
              Admin Authentication Required
            </h2>
            <p className="text-xs text-stone-400 leading-relaxed">
              Sign in with your master credentials to configure licenses, device monitoring, and platform operations.
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
                placeholder="Enter admin username"
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
                placeholder="Enter admin password"
                className="w-full text-xs font-mono py-2.5 px-3.5 bg-stone-950 border border-stone-800 rounded-xl text-stone-100 placeholder-stone-600 focus:outline-none focus:border-amber-500 shadow-inner"
              />
            </div>

            <div className="pt-2 space-y-2">
              <button
                type="submit"
                disabled={loading || lockoutSecondsRemaining > 0}
                className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 font-semibold text-white rounded-xl text-xs transition-all shadow-md active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
              >
                {loading ? (
                  <span>Authenticating...</span>
                ) : lockoutSecondsRemaining > 0 ? (
                  <span>Temporarily Locked ({lockoutSecondsRemaining}s)</span>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Authenticate &amp; Unlock</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Footer security note */}
          <div className="pt-2 border-t border-stone-800/80 text-center">
            <p className="text-[11px] text-stone-500 leading-normal">
              Access is protected by Cloudflare Edge verification and rate-limited. Unauthorized access attempts are monitored and recorded.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-800/60 bg-stone-900/40 px-6 py-3 text-center text-xs text-stone-500">
        Receipt Processor Enterprise Platform • Secured by Cloudflare Worker API
      </footer>
    </div>
  );
};
