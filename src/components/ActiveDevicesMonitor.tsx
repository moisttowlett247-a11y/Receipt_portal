import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Radio,
  Wifi,
  WifiOff,
  Clock,
  Laptop,
  Globe,
  RefreshCw,
  Copy,
  Check,
  Search,
  Trash2,
  Ban,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Key,
  Info,
  Server,
  Activity,
  AlertTriangle,
  Play,
  Pause,
  Unlock,
  Zap,
  MapPin
} from 'lucide-react';
import { ActiveDeviceSession, LicenseKeyRecord } from '../types';
import { getStoredGitHubConfig } from '../githubSyncService';
import {
  fetchCloudflareLicenses,
  fetchCloudflareHealth,
  unlockHwidOnCloudflare,
  revokeLicenseOnCloudflare,
  CLOUDFLARE_WORKER_URL
} from '../licenseSyncService';

interface ActiveDevicesMonitorProps {
  licenseKeys: LicenseKeyRecord[];
  onRevokeKey: (key: string) => void;
  showToast?: (msg: string) => void;
}

export const ActiveDevicesMonitor: React.FC<ActiveDevicesMonitorProps> = ({
  licenseKeys,
  onRevokeKey,
  showToast
}) => {
  const [sessions, setSessions] = useState<ActiveDeviceSession[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(5); // seconds, 0 = paused
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ONLINE' | 'IDLE' | 'OFFLINE'>('ALL');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isPruning, setIsPruning] = useState<boolean>(false);
  const [isRevokingKey, setIsRevokingKey] = useState<string | null>(null);
  const [isUnlockingHwid, setIsUnlockingHwid] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState<boolean>(false);
  const [cfHealth, setCfHealth] = useState<{ online: boolean; ip?: string; location?: string; hasDb?: boolean }>({
    online: true,
    hasDb: true
  });

  // Fetch active sessions from Cloudflare KV Edge API, server, and fallback
  const fetchSessions = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    let loadedSessions: ActiveDeviceSession[] = [];
    const now = Date.now();
    const sessionMap = new Map<string, ActiveDeviceSession>();

    // 1. Fetch from Cloudflare KV Edge API (Zero-latency global IP & machine tracker)
    try {
      const [cfLicenses, health] = await Promise.all([
        fetchCloudflareLicenses(),
        fetchCloudflareHealth()
      ]);
      if (health) setCfHealth(health);

      if (Array.isArray(cfLicenses) && cfLicenses.length > 0) {
        for (const cf of cfLicenses) {
          if (!cf.key) continue;
          const lastPingMs = cf.last_seen_at ? new Date(cf.last_seen_at).getTime() : 0;
          const diffMs = lastPingMs > 0 ? Math.max(0, now - lastPingMs) : 999999999;
          const secondsSinceLastPing = Math.max(0, Math.floor(diffMs / 1000));
          let onlineState: 'ONLINE' | 'IDLE' | 'OFFLINE' = 'OFFLINE';
          if (secondsSinceLastPing < 90) {
            onlineState = 'ONLINE';
          } else if (secondsSinceLastPing < 600) {
            onlineState = 'IDLE';
          }

          const rawKey = cf.key;
          const keyMasked = rawKey.length > 8 ? `${rawKey.slice(0, 4)}...${rawKey.slice(-4)}` : rawKey;
          const machineName = cf.last_machine || cf.first_activated_machine || 'Workstation';
          const ip = cf.last_ip || 'Pending Connection';
          const id = `cf_${rawKey}`;

          sessionMap.set(rawKey, {
            id,
            ip,
            hash: '',
            keyMasked,
            rawKey,
            hwid: cf.hwid || 'Pending First Activation',
            machineName,
            appVersion: '2.4.0',
            plan: cf.plan || 'Pro',
            status: cf.status || 'ACTIVE',
            lastPing: cf.last_seen_at || cf.created_at || new Date().toISOString(),
            lastPingMs: lastPingMs || now,
            firstSeen: cf.first_activated_at || cf.created_at || new Date().toISOString(),
            pingCount: cf.last_seen_at ? 5 : 1,
            secondsSinceLastPing,
            onlineState,
            location: cf.last_location || undefined,
            isCloudflare: true
          });
        }
      }
    } catch (cfErr) {
      console.warn('Cloudflare KV edge fetch notice:', cfErr);
    }

    // 2. Try server endpoint (local sessions)
    try {
      const res = await fetch(`/api/licenses/sessions?_t=${now}`, {
        headers: { 'Cache-Control': 'no-cache, no-store' }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.sessions)) {
          for (const s of data.sessions) {
            const lastPingMs = s.lastPingMs || new Date(s.lastPing).getTime() || 0;
            const diffMs = Math.max(0, now - lastPingMs);
            const secondsSinceLastPing = Math.max(0, Math.floor(diffMs / 1000));
            let onlineState: 'ONLINE' | 'IDLE' | 'OFFLINE' = 'OFFLINE';
            if (diffMs < 90000) {
              onlineState = 'ONLINE';
            } else if (diffMs < 600000) {
              onlineState = 'IDLE';
            }

            const k = s.rawKey || s.keyMasked;
            if (sessionMap.has(k)) {
              // Merge details
              const existing = sessionMap.get(k)!;
              sessionMap.set(k, {
                ...existing,
                ip: s.ip && s.ip !== '127.0.0.1' ? s.ip : existing.ip,
                machineName: s.machineName || existing.machineName,
                hwid: s.hwid && s.hwid !== 'Pending HWID' ? s.hwid : existing.hwid,
                pingCount: Math.max(existing.pingCount, s.pingCount || 1),
                secondsSinceLastPing: Math.min(existing.secondsSinceLastPing, secondsSinceLastPing),
                onlineState: existing.onlineState === 'ONLINE' ? 'ONLINE' : onlineState
              });
            } else {
              sessionMap.set(s.id || `${s.ip}_${s.hash}`, {
                ...s,
                onlineState: s.onlineState || onlineState,
                secondsSinceLastPing
              });
            }
          }
        }
      }
    } catch (err) {
      console.warn('Local sessions endpoint unreachable:', err);
    }

    // 3. Fallback to GitHub raw if nothing found
    if (sessionMap.size === 0) {
      try {
        const ghCfg = getStoredGitHubConfig();
        const ghUrl = `https://raw.githubusercontent.com/${ghCfg.owner}/${ghCfg.repo}/${ghCfg.branch}/public/licenses/active_sessions.json?t=${now}`;
        const ghRes = await fetch(ghUrl, { cache: 'no-store' });
        if (ghRes.ok) {
          const rawDict = await ghRes.json();
          if (rawDict && typeof rawDict === 'object') {
            for (const s of Object.values(rawDict) as any[]) {
              const lastPingMs = s.lastPingMs || new Date(s.lastPing).getTime() || 0;
              const diffMs = Math.max(0, now - lastPingMs);
              const secondsSinceLastPing = Math.max(0, Math.floor(diffMs / 1000));
              let onlineState: 'ONLINE' | 'IDLE' | 'OFFLINE' = 'OFFLINE';
              if (diffMs < 90000) onlineState = 'ONLINE';
              else if (diffMs < 600000) onlineState = 'IDLE';

              sessionMap.set(s.id || `${s.ip}_${s.hash}`, {
                ...s,
                onlineState,
                secondsSinceLastPing
              });
            }
          }
        }
      } catch (ghErr) {
        console.warn('Could not fetch sessions from GitHub raw fallback:', ghErr);
      }
    }

    loadedSessions = Array.from(sessionMap.values());
    // Sort online first, then by last ping
    loadedSessions.sort((a, b) => {
      if (a.onlineState === 'ONLINE' && b.onlineState !== 'ONLINE') return -1;
      if (b.onlineState === 'ONLINE' && a.onlineState !== 'ONLINE') return 1;
      return (b.lastPingMs || 0) - (a.lastPingMs || 0);
    });

    setSessions(loadedSessions);
    setLastFetched(new Date());
    if (!silent) {
      setIsLoading(false);
      if (showToast) showToast(`Device tracker refreshed (${loadedSessions.length} total workstation(s))`);
    }
  }, [showToast]);

  // Polling effect
  useEffect(() => {
    fetchSessions(true);

    if (autoRefreshInterval <= 0) return;

    const timer = setInterval(() => {
      fetchSessions(true);
    }, autoRefreshInterval * 1000);

    return () => clearInterval(timer);
  }, [autoRefreshInterval, fetchSessions]);

  // Copy helper
  const handleCopy = (text: string, fieldId: string, label = 'Copied') => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    if (showToast) showToast(`${label} copied to clipboard!`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Prune offline or clear sessions
  const handlePruneSessions = async (clearAll = false) => {
    if (clearAll) {
      if (!window.confirm('Are you sure you want to clear all workstation session history?')) {
        return;
      }
      setSessions([]);
    }
    setIsPruning(true);
    try {
      const res = await fetch('/api/licenses/sessions/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clearAll })
      });
      if (res.ok) {
        const data = await res.json();
        if (showToast) showToast(data.message || (clearAll ? 'All sessions cleared' : 'Inactive sessions pruned'));
        await fetchSessions(true);
      }
    } catch (err: any) {
      if (showToast) showToast(`Failed to update sessions: ${err.message}`);
    } finally {
      setIsPruning(false);
    }
  };

  // Instant revoke license
  const handleInstantRevoke = async (session: ActiveDeviceSession) => {
    const keyToRevoke = session.rawKey || session.keyMasked;
    const confirmMsg = `Are you sure you want to REVOKE the license key for ${session.machineName} (${session.ip})?\n\nThe desktop application will detect this on its next 10-second check and immediately lock access.`;
    if (!window.confirm(confirmMsg)) return;

    setIsRevokingKey(session.id);
    try {
      // 1. If key is in local registry, trigger parent onRevokeKey
      if (session.rawKey) {
        onRevokeKey(session.rawKey);
        // Also revoke on Cloudflare KV database directly
        await revokeLicenseOnCloudflare(session.rawKey);
      } else {
        // Find matching key by hash
        const matched = licenseKeys.find(k => k.key.toUpperCase() === session.rawKey?.toUpperCase());
        if (matched) {
          onRevokeKey(matched.key);
          await revokeLicenseOnCloudflare(matched.key);
        }
      }

      // 2. Also send explicit server sync to revoke the file
      await fetch('/api/licenses/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'UPSERT',
          hash: session.hash,
          key: session.rawKey,
          record: {
            status: 'REVOKED',
            plan: session.plan,
            expires: new Date().toISOString()
          }
        })
      });

      if (showToast) showToast(`License revoked! Workstation ${session.ip} locked across Edge KV & Portal.`);
      await fetchSessions(true);
    } catch (err: any) {
      if (showToast) showToast(`Revoke error: ${err.message}`);
    } finally {
      setIsRevokingKey(null);
    }
  };

  // Instant unlock Hardware ID (HWID) so user can switch PCs
  const handleUnlockHwid = async (session: ActiveDeviceSession) => {
    const key = session.rawKey || session.keyMasked;
    if (!key) return;
    if (!window.confirm(`Unlock hardware ID (HWID) for ${key}?\n\nThis frees the machine lock so the customer can activate on their new PC.`)) {
      return;
    }

    setIsUnlockingHwid(session.id);
    try {
      const res = await unlockHwidOnCloudflare(key);
      if (res.success) {
        if (showToast) showToast(`✅ HWID unlocked for ${key}! Ready for new computer.`);
      } else {
        if (showToast) showToast(`⚠️ ${res.message}`);
      }
      await fetchSessions(true);
    } catch (err: any) {
      if (showToast) showToast(`Unlock error: ${err.message}`);
    } finally {
      setIsUnlockingHwid(null);
    }
  };

  // Filtered session list
  const filteredSessions = useMemo(() => {
    return sessions.filter(s => {
      // Status filter
      if (statusFilter !== 'ALL' && s.onlineState !== statusFilter) {
        return false;
      }
      // Query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesIp = s.ip.toLowerCase().includes(q);
        const matchesMachine = s.machineName.toLowerCase().includes(q);
        const matchesHwid = s.hwid.toLowerCase().includes(q);
        const matchesKey = s.keyMasked.toLowerCase().includes(q) || (s.rawKey && s.rawKey.toLowerCase().includes(q));
        const matchesPlan = s.plan.toLowerCase().includes(q);
        return matchesIp || matchesMachine || matchesHwid || matchesKey || matchesPlan;
      }
      return true;
    });
  }, [sessions, statusFilter, searchQuery]);

  // Aggregate stats
  const stats = useMemo(() => {
    const online = sessions.filter(s => s.onlineState === 'ONLINE').length;
    const idle = sessions.filter(s => s.onlineState === 'IDLE').length;
    const offline = sessions.filter(s => s.onlineState === 'OFFLINE').length;
    const uniqueIps = Array.from(new Set(sessions.map(s => s.ip))).length;
    return { online, idle, offline, total: sessions.length, uniqueIps };
  }, [sessions]);

  // Format relative time helper
  const formatTimeAgo = (seconds: number) => {
    if (seconds < 15) return 'Just now (live)';
    if (seconds < 60) return `${seconds}s ago`;
    const mins = Math.floor(seconds / 60);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ${mins % 60}m ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-stone-900/90 border border-stone-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shadow-inner">
                <Radio className="w-5 h-5 animate-pulse text-amber-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-stone-100 tracking-tight">
                    Live Active Devices & Public IP Monitor
                  </h2>
                  <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950/80 border border-emerald-800/70 text-emerald-300">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    <span>Real-Time Ingestion</span>
                  </span>
                  <a
                    href={CLOUDFLARE_WORKER_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="hidden sm:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-950/80 border border-amber-800/70 text-amber-300 hover:bg-amber-900 transition-colors"
                    title={`Connected to Cloudflare Worker KV: ${CLOUDFLARE_WORKER_URL}`}
                  >
                    <Zap className="w-3 h-3 text-amber-400" />
                    <span>Cloudflare Edge KV</span>
                  </a>
                </div>
                <p className="text-xs text-stone-400 mt-0.5">
                  Tracks actual public IP addresses, hostnames, and hardware fingerprints via Cloudflare Edge KV database.
                </p>
              </div>
            </div>
          </div>

          {/* Refresh & Controls Bar */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Auto-Refresh Frequency Picker */}
            <div className="flex items-center bg-stone-950 border border-stone-800 rounded-xl p-1 text-xs font-medium text-stone-400">
              <span className="px-2 text-[11px] text-stone-500">Auto-Refresh:</span>
              <button
                onClick={() => setAutoRefreshInterval(3)}
                className={`px-2.5 py-1 rounded-lg text-[11px] transition-colors cursor-pointer ${
                  autoRefreshInterval === 3
                    ? 'bg-amber-500 text-stone-950 font-bold'
                    : 'hover:text-stone-200'
                }`}
              >
                3s
              </button>
              <button
                onClick={() => setAutoRefreshInterval(10)}
                className={`px-2.5 py-1 rounded-lg text-[11px] transition-colors cursor-pointer ${
                  autoRefreshInterval === 10
                    ? 'bg-amber-500 text-stone-950 font-bold'
                    : 'hover:text-stone-200'
                }`}
              >
                10s
              </button>
              <button
                onClick={() => setAutoRefreshInterval(autoRefreshInterval === 0 ? 5 : 0)}
                className={`px-2.5 py-1 rounded-lg text-[11px] transition-colors cursor-pointer flex items-center gap-1 ${
                  autoRefreshInterval === 0
                    ? 'bg-rose-500/20 text-rose-300 font-bold'
                    : 'hover:text-stone-200'
                }`}
                title={autoRefreshInterval === 0 ? 'Resume Polling' : 'Pause Polling'}
              >
                {autoRefreshInterval === 0 ? (
                  <>
                    <Play className="w-3 h-3" />
                    <span>Paused</span>
                  </>
                ) : (
                  <>
                    <Pause className="w-3 h-3" />
                    <span>Pause</span>
                  </>
                )}
              </button>
            </div>

            {/* Manual Refresh Now Button */}
            <button
              onClick={() => fetchSessions()}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-2 bg-stone-800 hover:bg-stone-700 disabled:opacity-50 text-stone-200 text-xs font-semibold rounded-xl border border-stone-700 transition-colors shadow-sm cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            {/* Prune Offline Records */}
            <button
              onClick={() => handlePruneSessions(false)}
              disabled={isPruning || sessions.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 bg-stone-800/80 hover:bg-stone-700 text-stone-300 text-xs font-medium rounded-xl border border-stone-700/80 transition-colors cursor-pointer"
              title="Remove records that have been offline for over 15 minutes"
            >
              <Trash2 className="w-3.5 h-3.5 text-stone-400" />
              <span>Prune Inactive</span>
            </button>

            {/* Help / Guide Toggle */}
            <button
              onClick={() => setShowGuide(!showGuide)}
              className="flex items-center gap-1.5 px-3 py-2 bg-stone-800/60 hover:bg-stone-700 text-stone-400 hover:text-stone-200 text-xs font-medium rounded-xl border border-stone-800 transition-colors cursor-pointer"
            >
              <Info className="w-3.5 h-3.5 text-amber-400" />
              <span>How it Works</span>
            </button>
          </div>
        </div>

        {/* Aggregate KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
          <div className="bg-stone-950/70 border border-emerald-900/40 rounded-xl p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-stone-400 font-medium">Currently Online</span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-sm shadow-emerald-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-emerald-300 font-mono">
                {stats.online}
              </span>
              <span className="text-[11px] text-emerald-500/80 font-medium">
                Active &lt;90s
              </span>
            </div>
          </div>

          <div className="bg-stone-950/70 border border-amber-900/30 rounded-xl p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-stone-400 font-medium">Idle / Recent</span>
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-amber-300 font-mono">
                {stats.idle}
              </span>
              <span className="text-[11px] text-amber-500/80 font-medium">
                &lt;10 mins ago
              </span>
            </div>
          </div>

          <div className="bg-stone-950/70 border border-sky-900/30 rounded-xl p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-stone-400 font-medium">Unique Public IPs</span>
              <Globe className="w-4 h-4 text-sky-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-sky-300 font-mono">
                {stats.uniqueIps}
              </span>
              <span className="text-[11px] text-sky-500/80 font-medium">
                Distinct networks
              </span>
            </div>
          </div>

          <div className="bg-stone-950/70 border border-stone-800 rounded-xl p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-stone-400 font-medium">Total Workstations</span>
              <Laptop className="w-4 h-4 text-stone-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-stone-200 font-mono">
                {stats.total}
              </span>
              <span className="text-[11px] text-stone-500 font-medium">
                Tracked instances
              </span>
            </div>
          </div>
        </div>

        {/* Informational Expandable Banner */}
        {showGuide && (
          <div className="mt-5 p-4 bg-stone-950/90 border border-amber-500/30 rounded-xl text-xs text-stone-300 space-y-2 animate-in fade-in duration-200">
            <div className="flex items-center gap-2 font-bold text-amber-400">
              <Server className="w-4 h-4" />
              <span>How Desktop Telemetry & Public IP Detection Works</span>
            </div>
            <p className="leading-relaxed text-stone-400">
              Whenever a user launches your desktop script (<code className="text-amber-300">receipt_processor.py</code> or by clicking <code className="text-amber-300">run_receipt_processor.bat</code>), a background thread pings your portal server every 10 seconds.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
              <div className="p-2.5 bg-stone-900 border border-stone-800 rounded-lg">
                <span className="font-semibold text-stone-200 block mb-1">1. IP Logging</span>
                <span className="text-stone-400 text-[11px]">
                  The server extracts the remote client IP from incoming TCP socket headers, revealing their real internet connection.
                </span>
              </div>
              <div className="p-2.5 bg-stone-900 border border-stone-800 rounded-lg">
                <span className="font-semibold text-stone-200 block mb-1">2. Hardware Fingerprint</span>
                <span className="text-stone-400 text-[11px]">
                  Each machine generates a SHA-256 hardware ID based on CPU, motherboard, and OS node to prevent unauthorized sharing.
                </span>
              </div>
              <div className="p-2.5 bg-stone-900 border border-stone-800 rounded-lg">
                <span className="font-semibold text-stone-200 block mb-1">3. Instant Revocation</span>
                <span className="text-stone-400 text-[11px]">
                  If you spot an unauthorized IP, clicking <strong className="text-rose-400">Revoke</strong> disables the key. The desktop app locks immediately on its next ping.
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-stone-900/60 border border-stone-800/80 p-3 rounded-xl">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Search Box */}
          <div className="relative flex-1 sm:w-72">
            <Search className="w-3.5 h-3.5 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search IP, Computer, HWID, or Key..."
              className="w-full text-xs font-mono pl-9 pr-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-stone-200 placeholder-stone-600 focus:outline-none focus:border-amber-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300 text-xs p-0.5"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
              statusFilter === 'ALL'
                ? 'bg-stone-700 text-white font-semibold'
                : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800'
            }`}
          >
            All ({sessions.length})
          </button>
          <button
            onClick={() => setStatusFilter('ONLINE')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
              statusFilter === 'ONLINE'
                ? 'bg-emerald-900/80 text-emerald-200 border border-emerald-700 font-semibold'
                : 'text-stone-400 hover:text-emerald-300 hover:bg-stone-800'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Online ({stats.online})</span>
          </button>
          <button
            onClick={() => setStatusFilter('IDLE')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
              statusFilter === 'IDLE'
                ? 'bg-amber-900/80 text-amber-200 border border-amber-700 font-semibold'
                : 'text-stone-400 hover:text-amber-300 hover:bg-stone-800'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span>Idle ({stats.idle})</span>
          </button>
          <button
            onClick={() => setStatusFilter('OFFLINE')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
              statusFilter === 'OFFLINE'
                ? 'bg-stone-800 text-stone-200 border border-stone-700 font-semibold'
                : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-stone-500" />
            <span>Offline ({stats.offline})</span>
          </button>
        </div>
      </div>

      {/* Main Table / Device List */}
      <div className="bg-stone-900/90 border border-stone-800 rounded-2xl overflow-hidden shadow-xl">
        {filteredSessions.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-stone-800/80 border border-stone-700/80 flex items-center justify-center text-stone-500 mx-auto">
              <Laptop className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-bold text-stone-200">
              {sessions.length === 0 ? 'No Active Devices Connected Yet' : 'No Devices Match Your Filter'}
            </h3>
            <p className="text-xs text-stone-400 max-w-md mx-auto leading-relaxed">
              {sessions.length === 0 ? (
                <>
                  When you or a client launches <code className="text-amber-400 font-mono">receipt_processor.py</code> with an active license, their workstation IP and hostname will automatically appear here within 10 seconds.
                </>
              ) : (
                'Try clearing your search query or switching to the "All" status filter to see other connected workstations.'
              )}
            </p>
            {sessions.length === 0 && (
              <div className="pt-2">
                <button
                  onClick={() => fetchSessions()}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer inline-flex items-center gap-2 shadow-md"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Scan for Connected Workstations</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-stone-950/80 text-stone-400 border-b border-stone-800 font-mono text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-4">Live Status</th>
                  <th className="py-3 px-4">Public IP Address</th>
                  <th className="py-3 px-4">Computer & Hostname</th>
                  <th className="py-3 px-4">Hardware Fingerprint</th>
                  <th className="py-3 px-4">License Key & Plan</th>
                  <th className="py-3 px-4">Activity & Pings</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-800/60 font-sans">
                {filteredSessions.map((session) => {
                  const isOnline = session.onlineState === 'ONLINE';
                  const isIdle = session.onlineState === 'IDLE';

                  return (
                    <tr
                      key={session.id}
                      className={`hover:bg-stone-800/40 transition-colors ${
                        isOnline ? 'bg-emerald-950/10' : ''
                      }`}
                    >
                      {/* Live Status Badge */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {isOnline ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-950/90 text-emerald-300 border border-emerald-800 shadow-sm">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            <span>ONLINE</span>
                          </span>
                        ) : isIdle ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-950/80 text-amber-300 border border-amber-800/70">
                            <span className="w-2 h-2 rounded-full bg-amber-400" />
                            <span>IDLE</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-stone-800/90 text-stone-400 border border-stone-700/80">
                            <span className="w-2 h-2 rounded-full bg-stone-500" />
                            <span>OFFLINE</span>
                          </span>
                        )}
                      </td>

                      {/* Public IP Address */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-stone-100 text-xs px-2 py-0.5 rounded bg-stone-950 border border-stone-800">
                            {session.ip}
                          </span>
                          <button
                            onClick={() => handleCopy(session.ip, `ip-${session.id}`, 'IP Address')}
                            className="p-1 hover:bg-stone-800 rounded text-stone-400 hover:text-stone-200 transition-colors cursor-pointer"
                            title="Copy IP Address"
                          >
                            {copiedField === `ip-${session.id}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                        <span className="text-[10px] text-stone-500 block mt-0.5 font-mono">
                          {session.ip === '127.0.0.1' || session.ip === 'localhost'
                            ? 'Localhost / Developer loopback'
                            : 'External Public IP'}
                        </span>
                        {session.location && (
                          <span className="text-[10px] text-amber-400/90 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 text-amber-400 shrink-0" />
                            <span>{session.location}</span>
                          </span>
                        )}
                      </td>

                      {/* Workstation Hostname & OS */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Laptop className="w-4 h-4 text-stone-400 shrink-0" />
                          <div>
                            <span className="font-semibold text-stone-200 block">
                              {session.machineName || 'Desktop Workstation'}
                            </span>
                            <span className="text-[10px] text-stone-500 font-mono">
                              v{session.appVersion}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Hardware Fingerprint ID */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs text-stone-400 bg-stone-950 px-2 py-0.5 rounded border border-stone-800/80">
                            {session.hwid.slice(0, 14)}...
                          </span>
                          <button
                            onClick={() => handleCopy(session.hwid, `hwid-${session.id}`, 'Hardware Fingerprint')}
                            className="p-1 hover:bg-stone-800 rounded text-stone-500 hover:text-stone-300 transition-colors cursor-pointer"
                            title="Copy Full HWID"
                          >
                            {copiedField === `hwid-${session.id}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* License Key & Plan */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-semibold text-amber-300 text-xs">
                              {session.rawKey || session.keyMasked}
                            </span>
                            <button
                              onClick={() => handleCopy(session.rawKey || session.keyMasked, `key-${session.id}`, 'License Key')}
                              className="p-0.5 text-stone-500 hover:text-stone-300 transition-colors cursor-pointer"
                              title="Copy Key"
                            >
                              {copiedField === `key-${session.id}` ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                              {session.plan}
                            </span>
                            <span className={`text-[10px] font-mono ${
                              session.status === 'ACTIVE'
                                ? 'text-emerald-400'
                                : session.status === 'REVOKED'
                                ? 'text-rose-400'
                                : 'text-stone-400'
                            }`}>
                              [{session.status}]
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Activity & Ping Telemetry */}
                      <td className="py-3.5 px-4 whitespace-nowrap font-mono text-[11px]">
                        <div className="flex items-center gap-1.5 text-stone-300">
                          <Activity className="w-3.5 h-3.5 text-amber-400" />
                          <span className={isOnline ? 'text-emerald-300 font-bold' : 'text-stone-400'}>
                            {formatTimeAgo(session.secondsSinceLastPing)}
                          </span>
                        </div>
                        <span className="text-[10px] text-stone-500 block mt-0.5">
                          {session.pingCount} pings received
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Unlock HWID Button (if device has a bound machine) */}
                          {session.hwid && session.hwid !== 'Pending First Activation' && session.hwid !== 'Desktop-PC' && (
                            <button
                              onClick={() => handleUnlockHwid(session)}
                              disabled={isUnlockingHwid === session.id}
                              className="px-2.5 py-1 text-xs font-semibold bg-amber-950/80 hover:bg-amber-900 border border-amber-800/80 text-amber-300 rounded-lg transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
                              title="Unlock hardware lock so user can activate on a new machine"
                            >
                              <Unlock className="w-3 h-3 text-amber-400" />
                              <span>{isUnlockingHwid === session.id ? 'Unlocking...' : 'Unlock PC'}</span>
                            </button>
                          )}

                          {/* Revoke / Kick Button */}
                          <button
                            onClick={() => handleInstantRevoke(session)}
                            disabled={isRevokingKey === session.id}
                            className="px-2.5 py-1 text-xs font-semibold bg-rose-950/80 hover:bg-rose-900 border border-rose-800/80 text-rose-300 rounded-lg transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
                            title="Instantly revoke this license key across Edge KV & Portal"
                          >
                            <Ban className="w-3 h-3 text-rose-400" />
                            <span>{isRevokingKey === session.id ? 'Revoking...' : 'Revoke'}</span>
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

        {/* Footer Summary */}
        <div className="border-t border-stone-800 bg-stone-950/90 px-6 py-3 flex flex-col sm:flex-row items-center justify-between text-xs text-stone-500 gap-2">
          <div className="flex items-center gap-2">
            <span>
              Last synced: {lastFetched ? lastFetched.toLocaleTimeString() : 'Never'}
            </span>
            <span>•</span>
            <span>Heartbeat cadence: 10s per desktop instance</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => handlePruneSessions(true)}
              className="text-stone-500 hover:text-rose-400 text-xs transition-colors cursor-pointer"
            >
              Clear All Session History
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
