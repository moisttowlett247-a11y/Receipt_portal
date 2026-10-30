import React, { useState } from 'react';
import { ShieldAlert, Lock, AlertTriangle, RefreshCw, Mail, Terminal, ExternalLink } from 'lucide-react';

interface BlockedWorkstationViewProps {
  blockedData?: {
    ip?: string;
    hwid?: string;
    reason?: string;
    blockedAt?: string;
  };
  onRetryCheck?: () => void;
}

export const BlockedWorkstationView: React.FC<BlockedWorkstationViewProps> = ({
  blockedData,
  onRetryCheck
}) => {
  const [isChecking, setIsChecking] = useState(false);
  const [checkMessage, setCheckMessage] = useState<string | null>(null);

  const handleRefresh = async () => {
    setIsChecking(true);
    setCheckMessage(null);
    try {
      if (onRetryCheck) {
        await onRetryCheck();
      }
      setTimeout(() => {
        setIsChecking(false);
        setCheckMessage('Lockout re-verified: Workstation & IP address remain permanently blocked.');
      }, 800);
    } catch {
      setIsChecking(false);
    }
  };

  const rawIp = blockedData?.ip || 'Protected IP Network';
  const rawHwid = blockedData?.hwid || (typeof localStorage !== 'undefined' ? localStorage.getItem('receipt_portal_hwid') : null) || 'HWID-NOT-ASSIGNED';
  const reasonText = blockedData?.reason || 'Forensic Security Policy Enforcement / Administrative Workstation Ban';
  const blockedTimeStr = blockedData?.blockedAt ? new Date(blockedData.blockedAt).toLocaleString() : new Date().toLocaleString();

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col justify-between font-sans antialiased selection:bg-rose-500 selection:text-white p-6 sm:p-12 relative overflow-hidden">
      {/* Background Ambient Security Aura */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[350px] bg-rose-600/5 blur-[140px] pointer-events-none rounded-full" />

      {/* Header Bar */}
      <header className="relative z-10 flex items-center justify-between border-b border-stone-900 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-950/80 border border-rose-800/80 flex items-center justify-center text-rose-400 shadow-lg shadow-rose-950/40">
            <ShieldAlert className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <span className="text-[11px] font-mono tracking-widest uppercase font-semibold text-rose-400 block">
              IRS Pub 1075 / SOC-2 Type II Security Protocol
            </span>
            <span className="text-sm font-bold text-stone-200">
              Receipt Processor Enterprise Protection System
            </span>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-stone-400 bg-stone-900/90 border border-stone-800 px-3 py-1.5 rounded-lg">
          <Lock className="w-3.5 h-3.5 text-rose-400" />
          <span>Access Terminated</span>
        </div>
      </header>

      {/* Main Lockout Notice Banner */}
      <main className="relative z-10 max-w-2xl mx-auto w-full my-auto py-10 space-y-6">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-950/80 border border-rose-800 text-rose-300 text-xs font-mono font-bold tracking-wider uppercase mb-2">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            <span>Permanent System Lockout Enforced</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-stone-100">
            Workstation &amp; Network Access Revoked
          </h1>
          <p className="text-sm text-stone-400 max-w-lg mx-auto leading-relaxed">
            This machine hardware signature and internet protocol address have been permanently blocked by system administration across both the <strong>Client Intake Portal</strong> and the <strong>Admin Management Console</strong>.
          </p>
        </div>

        {/* Forensic Identifier Dossier Card */}
        <div className="bg-stone-900/90 border border-rose-900/50 rounded-2xl p-5 shadow-2xl backdrop-blur space-y-4">
          <div className="flex items-center justify-between border-b border-stone-800 pb-3">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-rose-400" />
              <span className="text-xs font-mono font-bold text-stone-200 uppercase tracking-wider">
                Lockout Forensic Fingerprint
              </span>
            </div>
            <span className="text-[10px] font-mono bg-rose-950 text-rose-300 border border-rose-800/80 px-2 py-0.5 rounded">
              PERMANENT HARDWARE BAN
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
            <div className="p-3 bg-stone-950/80 border border-stone-800/80 rounded-xl">
              <span className="text-stone-400 block text-[11px] mb-1">Blocked IP Address</span>
              <span className="text-stone-100 font-bold select-all">{rawIp}</span>
            </div>

            <div className="p-3 bg-stone-950/80 border border-stone-800/80 rounded-xl">
              <span className="text-stone-400 block text-[11px] mb-1">Hardware ID (HWID)</span>
              <span className="text-rose-300 font-bold select-all break-all">{rawHwid}</span>
            </div>

            <div className="p-3 bg-stone-950/80 border border-stone-800/80 rounded-xl sm:col-span-2">
              <span className="text-stone-400 block text-[11px] mb-1">Reason for Administrative Ban</span>
              <span className="text-amber-300 font-medium">{reasonText}</span>
            </div>

            <div className="p-3 bg-stone-950/80 border border-stone-800/80 rounded-xl">
              <span className="text-stone-400 block text-[11px] mb-1">Enforcement Timestamp</span>
              <span className="text-stone-300">{blockedTimeStr}</span>
            </div>

            <div className="p-3 bg-stone-950/80 border border-stone-800/80 rounded-xl">
              <span className="text-stone-400 block text-[11px] mb-1">Lockout Authority</span>
              <span className="text-stone-300">System Security Administrator</span>
            </div>
          </div>

          <p className="text-[11px] text-stone-400 leading-relaxed pt-2">
            All active desktop receipt processor sync tokens, web presence tokens, and API requests originating from this Hardware ID or IP address will be rejected immediately with HTTP 403 Forbidden.
          </p>
        </div>

        {/* Action Controls & Appeals */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <button
            onClick={handleRefresh}
            disabled={isChecking}
            className="w-full sm:w-auto px-4 py-2.5 bg-stone-900 hover:bg-stone-850 text-stone-300 hover:text-stone-100 text-xs font-semibold rounded-xl border border-stone-800 transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin text-rose-400' : 'text-stone-400'}`} />
            <span>{isChecking ? 'Verifying Lockout Status...' : 'Re-verify Ban Status'}</span>
          </button>

          <a
            href="mailto:admin@quickbooks-portal.local?subject=Workstation%20Lockout%20Appeal"
            className="w-full sm:w-auto px-4 py-2.5 bg-stone-900 hover:bg-stone-850 text-stone-300 hover:text-stone-100 text-xs font-semibold rounded-xl border border-stone-800 transition-colors flex items-center justify-center gap-2 text-center"
          >
            <Mail className="w-3.5 h-3.5 text-stone-400" />
            <span>Contact Security Administration</span>
            <ExternalLink className="w-3 h-3 text-stone-400" />
          </a>
        </div>

        {checkMessage && (
          <div className="p-3 rounded-xl bg-stone-900/80 border border-stone-800 text-xs text-rose-300 text-center font-mono animate-fadeIn">
            {checkMessage}
          </div>
        )}
      </main>

      {/* Compliance Footer */}
      <footer className="relative z-10 border-t border-stone-900 pt-5 text-center sm:flex sm:justify-between sm:text-left text-xs text-stone-400">
        <div>
          <span>Receipt Processor Enterprise • Security &amp; Compliance Enforcement</span>
        </div>
        <div className="mt-2 sm:mt-0 font-mono text-[11px]">
          Incident Identifier: SEC-BLOCKED-{rawHwid.slice(-8)}
        </div>
      </footer>
    </div>
  );
};
