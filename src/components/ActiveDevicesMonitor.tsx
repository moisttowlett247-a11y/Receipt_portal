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
  MapPin,
  Eye,
  Download,
  Cpu,
  Monitor,
  Smartphone,
  HardDrive,
  Filter,
  X,
  ExternalLink
} from 'lucide-react';
import { ActiveDeviceSession, LicenseKeyRecord, AdminRole } from '../types';
import { getBackendApiUrl } from '../urlUtils';
import {
  fetchCloudflareLicenses,
  fetchCloudflareSessions,
  fetchCloudflareHealth,
  unlockHwidOnCloudflare,
  revokeLicenseOnCloudflare,
  pruneCloudflareSessions,
  CLOUDFLARE_WORKER_URL
} from '../licenseSyncService';
import { sendPresenceHeartbeat } from '../webPresenceService';
import {
  fetchUnifiedIpTelemetry,
  pruneOfflineIps,
  clearAllIpSessions,
  TrackedIpSession
} from '../ipTrackerService';

interface ActiveDevicesMonitorProps {
  licenseKeys: LicenseKeyRecord[];
  onRevokeKey: (key: string) => void;
  showToast?: (msg: string) => void;
  adminRole?: AdminRole;
}

export const ActiveDevicesMonitor: React.FC<ActiveDevicesMonitorProps> = ({
  licenseKeys,
  onRevokeKey,
  showToast,
  adminRole = 'SUPER_ADMIN'
}) => {
  const isSuperAdmin = adminRole === 'SUPER_ADMIN';
  const [sessions, setSessions] = useState<ActiveDeviceSession[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(30); // 30s cadence
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ONLINE' | 'IDLE' | 'OFFLINE'>('ALL');
  const [scopeFilter, setScopeFilter] = useState<'ALL' | 'PUBLIC' | 'LOOPBACK' | 'PRIVATE'>('ALL');
  const [portalFilter, setPortalFilter] = useState<string>('ALL');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isPruning, setIsPruning] = useState<boolean>(false);
  const [isRevokingKey, setIsRevokingKey] = useState<string | null>(null);
  const [isUnlockingHwid, setIsUnlockingHwid] = useState<string | null>(null);
  const [isRunningProbe, setIsRunningProbe] = useState<boolean>(false);
  const [showGuide, setShowGuide] = useState<boolean>(false);
  const [selectedSession, setSelectedSession] = useState<ActiveDeviceSession | null>(null);
  const [cfHealth, setCfHealth] = useState<{ online: boolean; ip?: string; location?: string; hasDb?: boolean }>({
    online: true,
    hasDb: true
  });
  const [cfError, setCfError] = useState<string | null>(null);

  // Fetch unified active sessions from Edge KV and backend
  const fetchSessions = useCallback(async (silent = false) => {
    if (!silent) {
      setIsLoading(true);
      setCfError(null);
    }

    try {
      fetchCloudflareHealth().then(health => {
        if (health) setCfHealth(health as any);
        if (!health.online && !silent) {
          setCfError('Cloudflare Edge API unreachable. Telemetry falling back to primary server.');
        }
      }).catch(() => {});

      const telemetry = await fetchUnifiedIpTelemetry();
      setSessions(telemetry.sessions as any);
      setLastFetched(new Date());

      // If a session is currently selected in the inspector, keep it up to date
      setSelectedSession(prev => {
        if (!prev) return null;
        const updated = telemetry.sessions.find(s => (s.id && s.id === prev.id) || (s.ip === prev.ip && s.machineName === prev.machineName) || s.ip === prev.ip);
        return (updated as any) || prev;
      });

      if (!silent) {
        setIsLoading(false);
        if (showToast) {
          showToast(`IP Tracker: ${telemetry.onlineCount} Online, ${telemetry.idleCount} Idle, ${telemetry.offlineCount} Offline (${telemetry.uniqueIps} unique network(s))`);
        }
      }
    } catch (err: any) {
      console.warn('IP telemetry fetch error:', err);
      if (!silent) {
        setIsLoading(false);
        setCfError(err.message || 'Error updating IP telemetry');
      }
    }
  }, [showToast]);

  // Polling effect
  useEffect(() => {
    fetchSessions(true);

    if (autoRefreshInterval <= 0) return;

    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) {
        return;
      }
      fetchSessions(true);
    }, autoRefreshInterval * 1000);

    return () => clearInterval(timer);
  }, [autoRefreshInterval, fetchSessions]);

  // Copy helper
  const handleCopy = (text: string, fieldId: string, label = 'Copied') => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    if (showToast) showToast(`${label} copied to clipboard!`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const safeConfirm = (msg: string): boolean => {
    try {
      return typeof window !== 'undefined' && typeof window.confirm === 'function' ? window.confirm(msg) : true;
    } catch {
      return true;
    }
  };

  // Prune offline or clear sessions
  const handlePruneSessions = async (clearAll = false) => {
    if (clearAll) {
      if (!safeConfirm('Are you sure you want to clear all IP telemetry records?')) {
        return;
      }
      setSessions([]);
      setSelectedSession(null);
    }
    setIsPruning(true);
    try {
      if (clearAll) {
        await clearAllIpSessions();
        pruneCloudflareSessions(true).catch(() => {});
      } else {
        await pruneOfflineIps();
        pruneCloudflareSessions(false).catch(() => {});
      }
      if (showToast) {
        showToast(clearAll ? 'All IP session history cleared' : 'Inactive offline IP records pruned');
      }
      await fetchSessions(true);
    } catch (err: any) {
      if (showToast) showToast(`Failed to update sessions: ${err.message}`);
    } finally {
      setIsPruning(false);
    }
  };

  // Instant revoke license
  const handleInstantRevoke = async (session: ActiveDeviceSession) => {
    const keyToRevoke = session.rawKey || session.keyMasked;
    const confirmMsg = `Are you sure you want to REVOKE the license key for ${session.machineName} (${session.ip})?\n\nThe application will detect this on its next check and immediately lock access.`;
    if (!safeConfirm(confirmMsg)) return;

    setIsRevokingKey(session.id);
    try {
      if (session.rawKey) {
        onRevokeKey(session.rawKey);
        await revokeLicenseOnCloudflare(session.rawKey);
      } else {
        const matched = licenseKeys.find(k => k.key.toUpperCase() === session.rawKey?.toUpperCase());
        if (matched) {
          onRevokeKey(matched.key);
          await revokeLicenseOnCloudflare(matched.key);
        }
      }

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

      if (showToast) showToast(`License revoked! IP ${session.ip} locked across Edge KV & Portal.`);
      await fetchSessions(true);
    } catch (err: any) {
      if (showToast) showToast(`Revoke error: ${err.message}`);
    } finally {
      setIsRevokingKey(null);
    }
  };

  // Instant unlock Hardware ID
  const handleUnlockHwid = async (session: ActiveDeviceSession) => {
    const key = session.rawKey || session.keyMasked;
    if (!key) return;
    if (!safeConfirm(`Unlock hardware ID (HWID) for ${key}?\n\nThis frees the machine lock so the customer can activate on their new PC.`)) {
      return;
    }

    setIsUnlockingHwid(session.id);
    try {
      const res = await unlockHwidOnCloudflare(key);
      if (res.success) {
        if (showToast) showToast(`HWID unlocked for ${key}! Ready for new computer.`);
      } else {
        if (showToast) showToast(`${res.message}`);
      }
      await fetchSessions(true);
    } catch (err: any) {
      if (showToast) showToast(`Unlock error: ${err.message}`);
    } finally {
      setIsUnlockingHwid(null);
    }
  };

  // Manual probe pulse
  const handleRunProbe = async () => {
    setIsRunningProbe(true);
    try {
      await sendPresenceHeartbeat({
        portal: 'ADMIN',
        userId: 'admin_telemetry_probe',
        username: 'admin',
        displayName: 'Manual IP Telemetry Pulse',
        plan: 'Master Administrator',
        role: 'SUPER_ADMIN'
      });
      if (showToast) showToast('Live IP heartbeat probe transmitted. Refreshing telemetry...');
      setTimeout(() => fetchSessions(true), 1200);
    } catch (err) {
      if (showToast) showToast('Failed to transmit probe pulse.');
    } finally {
      setIsRunningProbe(false);
    }
  };

  // Export full JSON dossier
  const handleExportJson = () => {
    try {
      const exportData = {
        exportedAt: new Date().toISOString(),
        totalSessions: sessions.length,
        systemHealth: cfHealth,
        sessions: sessions.map(s => ({
          ...s,
          inspectedAt: new Date().toISOString()
        }))
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ip_telemetry_forensics_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (showToast) showToast('Full IP Telemetry JSON dossier exported!');
    } catch (err: any) {
      if (showToast) showToast(`Export failed: ${err.message}`);
    }
  };

  // Export full CSV report
  const handleExportCsv = () => {
    try {
      const headers = [
        'IP Address',
        'IP Version',
        'Status',
        'Network Scope',
        'Elapsed (Sec)',
        'Lifetime Pings',
        'Avg Ping Cadence (Sec)',
        'Location',
        'City',
        'Region',
        'Country',
        'Postal Code',
        'Timezone',
        'ASN',
        'AS Organization',
        'Computer Machine',
        'OS Name',
        'Browser Name',
        'Browser Version',
        'Screen Resolution',
        'Viewport',
        'RAM Memory',
        'CPU Cores',
        'Touch Enabled',
        'Pixel Ratio',
        'Color Depth',
        'Active Route',
        'Portal Name',
        'Username',
        'Display Name',
        'Email',
        'License Key',
        'HWID',
        'Plan',
        'Risk Rating',
        'First Seen',
        'Last Ping'
      ];

      const escapeCsv = (val: any) => {
        if (val === undefined || val === null) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      };

      const rows = sessions.map(s => [
        escapeCsv(s.ip),
        escapeCsv(s.ipVersion || (s.ip.includes(':') ? 'IPv6' : 'IPv4')),
        escapeCsv(s.onlineState),
        escapeCsv(s.networkScope || 'Public WAN Network'),
        escapeCsv(s.secondsSinceLastPing),
        escapeCsv(s.pingCount),
        escapeCsv(s.avgPingIntervalSec || 10),
        escapeCsv(s.location || ''),
        escapeCsv(s.city || ''),
        escapeCsv(s.region || ''),
        escapeCsv(s.country || ''),
        escapeCsv(s.postalCode || ''),
        escapeCsv(s.timezone || ''),
        escapeCsv(s.asn || ''),
        escapeCsv(s.asOrg || ''),
        escapeCsv(s.machineName),
        escapeCsv(s.osName || ''),
        escapeCsv(s.browserName || ''),
        escapeCsv(s.browserVersion || ''),
        escapeCsv(s.screenResolution || ''),
        escapeCsv(s.viewport || ''),
        escapeCsv(s.deviceMemory || ''),
        escapeCsv(s.hardwareConcurrency || ''),
        escapeCsv(s.touchSupported ? 'Yes' : 'No'),
        escapeCsv(s.pixelRatio || '1x'),
        escapeCsv(s.colorDepth || ''),
        escapeCsv(s.lastActiveRoute || '/'),
        escapeCsv(s.portalName || ''),
        escapeCsv(s.username || ''),
        escapeCsv(s.displayName || ''),
        escapeCsv(s.email || ''),
        escapeCsv(s.rawKey || s.keyMasked || ''),
        escapeCsv(s.hwid),
        escapeCsv(s.plan || ''),
        escapeCsv(s.riskAssessment || 'NORMAL'),
        escapeCsv(s.firstSeen),
        escapeCsv(s.lastPing)
      ]);

      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ip_telemetry_report_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (showToast) showToast('IP Telemetry CSV report exported!');
    } catch (err: any) {
      if (showToast) showToast(`CSV Export failed: ${err.message}`);
    }
  };

  // Filtered session list
  const filteredSessions = useMemo(() => {
    return sessions.filter(s => {
      if (statusFilter !== 'ALL' && s.onlineState !== statusFilter) {
        return false;
      }
      if (scopeFilter !== 'ALL') {
        const scope = (s.networkScope || '').toLowerCase();
        if (scopeFilter === 'PUBLIC' && !scope.includes('public')) return false;
        if (scopeFilter === 'LOOPBACK' && !scope.includes('loopback')) return false;
        if (scopeFilter === 'PRIVATE' && !scope.includes('private')) return false;
      }
      if (portalFilter !== 'ALL') {
        const portal = (s.portalName || '').toLowerCase();
        if (!portal.includes(portalFilter.toLowerCase())) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesIp = s.ip.toLowerCase().includes(q);
        const matchesMachine = (s.machineName || '').toLowerCase().includes(q);
        const matchesHwid = (s.hwid || '').toLowerCase().includes(q);
        const matchesKey = (s.keyMasked || '').toLowerCase().includes(q) || (s.rawKey && s.rawKey.toLowerCase().includes(q));
        const matchesPlan = (s.plan || '').toLowerCase().includes(q);
        const matchesLocation = (s.location || '').toLowerCase().includes(q) || (s.country || '').toLowerCase().includes(q) || (s.city || '').toLowerCase().includes(q);
        const matchesAsn = (s.asn || '').toLowerCase().includes(q) || (s.asOrg || '').toLowerCase().includes(q);
        const matchesUser = (s.username || '').toLowerCase().includes(q) || (s.displayName || '').toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q);
        const matchesRoute = (s.lastActiveRoute || '').toLowerCase().includes(q);
        return (
          matchesIp ||
          matchesMachine ||
          matchesHwid ||
          matchesKey ||
          matchesPlan ||
          matchesLocation ||
          matchesAsn ||
          matchesUser ||
          matchesRoute
        );
      }
      return true;
    });
  }, [sessions, statusFilter, scopeFilter, portalFilter, searchQuery]);

  // Aggregate stats
  const stats = useMemo(() => {
    const online = sessions.filter(s => s.onlineState === 'ONLINE').length;
    const idle = sessions.filter(s => s.onlineState === 'IDLE').length;
    const offline = sessions.filter(s => s.onlineState === 'OFFLINE').length;
    const uniqueIps = Array.from(new Set(sessions.map(s => s.ip))).length;
    const ipv4Count = sessions.filter(s => !s.ip.includes(':')).length;
    const ipv6Count = sessions.filter(s => s.ip.includes(':')).length;
    const publicCount = sessions.filter(s => (s.networkScope || '').includes('Public')).length;
    const loopbackCount = sessions.filter(s => (s.networkScope || '').includes('Loopback') || (s.networkScope || '').includes('Private')).length;
    const avgCadence = sessions.length > 0
      ? Math.round(sessions.reduce((acc, s) => acc + (s.avgPingIntervalSec || 10), 0) / sessions.length)
      : 10;
    const elevatedRiskCount = sessions.filter(s => s.riskAssessment === 'ELEVATED' || s.riskAssessment === 'HIGH_VOLUME').length;

    return {
      online,
      idle,
      offline,
      total: sessions.length,
      uniqueIps,
      ipv4Count,
      ipv6Count,
      publicCount,
      loopbackCount,
      avgCadence,
      elevatedRiskCount
    };
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

  // Format timezone local clock
  const formatTzTime = (timezone?: string) => {
    if (!timezone) return 'UTC';
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short'
      }).format(new Date());
    } catch {
      return timezone;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-stone-900/90 border border-stone-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shadow-inner">
                <Radio className="w-5 h-5 animate-pulse text-amber-400" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-bold text-stone-100 tracking-tight">
                    Live IP Tracker & Telemetry Intelligence Center
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
                <p className="text-xs text-stone-400 mt-1">
                  Exhaustive telemetry monitor recording canonical public IPs, hardware fingerprints, display geometry, ASN routing, and portal activity.
                </p>
              </div>
            </div>
          </div>

          {/* Refresh & Controls Bar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Auto-Refresh Frequency Picker */}
            <div className="flex items-center bg-stone-950 border border-stone-800 rounded-xl p-1 text-xs font-medium text-stone-400">
              <span className="px-2 text-[11px] text-stone-500">Cadence:</span>
              <button
                onClick={() => setAutoRefreshInterval(15)}
                className={`px-2.5 py-1 rounded-lg text-[11px] transition-colors cursor-pointer ${
                  autoRefreshInterval === 15
                    ? 'bg-amber-500 text-stone-950 font-bold'
                    : 'hover:text-stone-200'
                }`}
              >
                15s
              </button>
              <button
                onClick={() => setAutoRefreshInterval(30)}
                className={`px-2.5 py-1 rounded-lg text-[11px] transition-colors cursor-pointer ${
                  autoRefreshInterval === 30
                    ? 'bg-amber-500 text-stone-950 font-bold'
                    : 'hover:text-stone-200'
                }`}
              >
                30s
              </button>
              <button
                onClick={() => setAutoRefreshInterval(60)}
                className={`px-2.5 py-1 rounded-lg text-[11px] transition-colors cursor-pointer ${
                  autoRefreshInterval === 60
                    ? 'bg-amber-500 text-stone-950 font-bold'
                    : 'hover:text-stone-200'
                }`}
              >
                60s
              </button>
              <button
                onClick={() => setAutoRefreshInterval(autoRefreshInterval === 0 ? 30 : 0)}
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

            {/* Manual Sync Button */}
            <button
              onClick={() => fetchSessions()}
              disabled={isLoading}
              className="px-3 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold rounded-xl border border-stone-700/80 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
              title="Pull latest IP telemetry snapshot from Cloudflare and backend"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-amber-400' : ''}`} />
              <span>{isLoading ? 'Syncing...' : 'Sync Now'}</span>
            </button>

            {/* Manual IP Probe Pulse */}
            <button
              onClick={handleRunProbe}
              disabled={isRunningProbe}
              className="px-3 py-2 bg-amber-600 hover:bg-amber-500 text-stone-950 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
              title="Transmit instant telemetry pulse from this browser"
            >
              <Zap className={`w-3.5 h-3.5 ${isRunningProbe ? 'animate-bounce' : ''}`} />
              <span>{isRunningProbe ? 'Transmitting...' : 'Send IP Pulse'}</span>
            </button>

            {/* Export JSON Button */}
            <button
              onClick={handleExportJson}
              className="px-3 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium rounded-xl border border-stone-700 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="Download full forensic JSON dossier of all tracked IP sessions"
            >
              <Download className="w-3.5 h-3.5 text-stone-400" />
              <span>Dossier (JSON)</span>
            </button>

            {/* Export CSV Button */}
            <button
              onClick={handleExportCsv}
              className="px-3 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium rounded-xl border border-stone-700 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="Download spreadsheet report (CSV) of all connected devices and IP addresses"
            >
              <Download className="w-3.5 h-3.5 text-stone-400" />
              <span>Report (CSV)</span>
            </button>

            {/* Info Guide Toggle */}
            <button
              onClick={() => setShowGuide(!showGuide)}
              className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                showGuide
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                  : 'bg-stone-950 border-stone-800 text-stone-400 hover:text-stone-200'
              }`}
              title="Toggle Architecture & Telemetry Guide"
            >
              <Info className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Telemetry KPI Overview Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6 pt-6 border-t border-stone-800/80">
          {/* 1. Online Count */}
          <div className="bg-stone-950/70 border border-emerald-900/30 rounded-xl p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-stone-400 font-medium">Live Online</span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-emerald-400 font-mono">
                {stats.online}
              </span>
              <span className="text-[11px] text-emerald-500/80 font-medium">
                Active now
              </span>
            </div>
          </div>

          {/* 2. Idle Count */}
          <div className="bg-stone-950/70 border border-amber-900/30 rounded-xl p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-stone-400 font-medium">Idle Devices</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-amber-400 font-mono">
                {stats.idle}
              </span>
              <span className="text-[11px] text-amber-500/80 font-medium">
                &lt;10m quiet
              </span>
            </div>
          </div>

          {/* 3. Unique IPs & Protocol */}
          <div className="bg-stone-950/70 border border-sky-900/30 rounded-xl p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-stone-400 font-medium">Unique IPs</span>
              <Globe className="w-4 h-4 text-sky-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-sky-300 font-mono">
                {stats.uniqueIps}
              </span>
              <span className="text-[11px] text-sky-500/80 font-medium">
                {stats.ipv4Count} IPv4 • {stats.ipv6Count} IPv6
              </span>
            </div>
          </div>

          {/* 4. Network Scope Breakdown */}
          <div className="bg-stone-950/70 border border-stone-800 rounded-xl p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-stone-400 font-medium">Network Scope</span>
              <Activity className="w-4 h-4 text-stone-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-stone-200 font-mono">
                {stats.publicCount}
              </span>
              <span className="text-[11px] text-stone-400 font-medium">
                WAN ({stats.loopbackCount} Local/Dev)
              </span>
            </div>
          </div>

          {/* 5. Ingestion Frequency */}
          <div className="bg-stone-950/70 border border-stone-800 rounded-xl p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-stone-400 font-medium">Avg Heartbeat</span>
              <Server className="w-4 h-4 text-stone-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-amber-300 font-mono">
                ~{stats.avgCadence}s
              </span>
              <span className="text-[11px] text-stone-500 font-medium">
                Sync cycle
              </span>
            </div>
          </div>

          {/* 6. Security & Anomaly Rating */}
          <div className="bg-stone-950/70 border border-stone-800 rounded-xl p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-stone-400 font-medium">Risk Status</span>
              {stats.elevatedRiskCount > 0 ? (
                <ShieldAlert className="w-4 h-4 text-rose-400" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              )}
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className={`text-2xl font-extrabold font-mono ${stats.elevatedRiskCount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {stats.elevatedRiskCount > 0 ? stats.elevatedRiskCount : '0'}
              </span>
              <span className="text-[11px] text-stone-400 font-medium">
                {stats.elevatedRiskCount > 0 ? 'Elevated alert(s)' : '100% Verified'}
              </span>
            </div>
          </div>
        </div>

        {/* Informational Expandable Banner */}
        {showGuide && (
          <div className="mt-5 p-4 bg-stone-950/90 border border-amber-500/30 rounded-xl text-xs text-stone-300 space-y-3 animate-in fade-in duration-200">
            <div className="flex items-center gap-2 font-bold text-amber-400">
              <Server className="w-4 h-4" />
              <span>Full-Stack IP Tracking & Device Fingerprinting Architecture</span>
            </div>
            <p className="leading-relaxed text-stone-400">
              The telemetry ingestion pipeline merges Edge socket headers from Cloudflare KV with direct backend TCP socket metadata, extracting hardware, network, and environmental variables with zero client-side degradation.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-1">
              <div className="p-3 bg-stone-900 border border-stone-800 rounded-lg">
                <span className="font-semibold text-stone-200 block mb-1">1. Network & Routing</span>
                <span className="text-stone-400 text-[11px]">
                  Extracts canonical IPv4/IPv6 addresses, Autonomous System Numbers (ASN), ISP organization, and private subnet classifications.
                </span>
              </div>
              <div className="p-3 bg-stone-900 border border-stone-800 rounded-lg">
                <span className="font-semibold text-stone-200 block mb-1">2. Hardware Fingerprint</span>
                <span className="text-stone-400 text-[11px]">
                  Records physical screen resolution, CSS viewport, device memory (RAM), CPU core count, touch capabilities, and GPU pixel ratios.
                </span>
              </div>
              <div className="p-3 bg-stone-900 border border-stone-800 rounded-lg">
                <span className="font-semibold text-stone-200 block mb-1">3. Geolocation & Time</span>
                <span className="text-stone-400 text-[11px]">
                  Resolves country, state/region, city, postal code, and IANA timezone with live local clock calculations for remote operators.
                </span>
              </div>
              <div className="p-3 bg-stone-900 border border-stone-800 rounded-lg">
                <span className="font-semibold text-stone-200 block mb-1">4. Forensic Dossier</span>
                <span className="text-stone-400 text-[11px]">
                  Clicking any entry opens a comprehensive forensic inspection dossier with 1-click JSON/CSV exports and remote revocation tools.
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-stone-900/60 border border-stone-800/80 p-3 rounded-xl">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[260px]">
            <Search className="w-3.5 h-3.5 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search IP, ASN, City, Country, OS, HWID, Key, or Route..."
              className="w-full text-xs font-mono pl-9 pr-8 py-2 bg-stone-950 border border-stone-800 rounded-lg text-stone-200 placeholder-stone-600 focus:outline-none focus:border-amber-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300 text-xs p-0.5 cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Scope Filter Dropdown */}
          <div className="flex items-center gap-1.5 text-xs text-stone-400 bg-stone-950 border border-stone-800 rounded-lg px-2.5 py-1.5">
            <Filter className="w-3.5 h-3.5 text-stone-500" />
            <select
              value={scopeFilter}
              onChange={(e) => setScopeFilter(e.target.value as any)}
              className="bg-transparent text-stone-200 text-xs focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-stone-900 text-stone-200">All Network Scopes</option>
              <option value="PUBLIC" className="bg-stone-900 text-stone-200">Public WAN Only</option>
              <option value="LOOPBACK" className="bg-stone-900 text-stone-200">Loopback / Dev Host</option>
              <option value="PRIVATE" className="bg-stone-900 text-stone-200">Private Subnets</option>
            </select>
          </div>

          {/* Portal Filter Dropdown */}
          <div className="flex items-center gap-1.5 text-xs text-stone-400 bg-stone-950 border border-stone-800 rounded-lg px-2.5 py-1.5">
            <Laptop className="w-3.5 h-3.5 text-stone-500" />
            <select
              value={portalFilter}
              onChange={(e) => setPortalFilter(e.target.value)}
              className="bg-transparent text-stone-200 text-xs focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-stone-900 text-stone-200">All Portals</option>
              <option value="Admin" className="bg-stone-900 text-stone-200">Admin Console</option>
              <option value="Client" className="bg-stone-900 text-stone-200">Client Intake Portal</option>
              <option value="Desktop" className="bg-stone-900 text-stone-200">Desktop Engine</option>
            </select>
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 justify-end">
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
                  Telemetry streams in automatically when users or administrators connect to the portal or launch the desktop receipt processor.
                </>
              ) : (
                'Try adjusting your search query or reset status and network scope filters to view other connected instances.'
              )}
            </p>
            <div className="pt-2 flex items-center justify-center gap-2">
              <button
                onClick={() => fetchSessions()}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-stone-950 text-xs font-semibold rounded-xl transition-all cursor-pointer inline-flex items-center gap-2 shadow-md"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Scan for Telemetry</span>
              </button>
              <button
                onClick={handleRunProbe}
                className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium rounded-xl border border-stone-700 transition-all cursor-pointer inline-flex items-center gap-2"
              >
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Send Local Heartbeat</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-stone-950/80 text-stone-400 border-b border-stone-800 font-mono text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-4">Status & Cadence</th>
                  <th className="py-3 px-4">IP Address & Network</th>
                  <th className="py-3 px-4">Location & Timezone</th>
                  <th className="py-3 px-4">Hardware & Environment</th>
                  <th className="py-3 px-4">Active Portal & Route</th>
                  <th className="py-3 px-4">License & Risk</th>
                  <th className="py-3 px-4 text-right">Forensic Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-800/60 font-sans">
                {filteredSessions.map((session) => {
                  const isOnline = session.onlineState === 'ONLINE';
                  const isIdle = session.onlineState === 'IDLE';
                  const ipVer = session.ipVersion || (session.ip.includes(':') ? 'IPv6' : 'IPv4');
                  const isLoopback = (session.networkScope || '').includes('Loopback');
                  const isPrivate = (session.networkScope || '').includes('Private');

                  return (
                    <tr
                      key={session.id}
                      onClick={() => setSelectedSession(session)}
                      className={`hover:bg-stone-800/40 transition-colors cursor-pointer ${
                        isOnline ? 'bg-emerald-950/10' : ''
                      }`}
                    >
                      {/* Live Status & Ping Cadence */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
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
                        </div>
                        <div className="mt-1 font-mono text-[10px] text-stone-400 flex items-center gap-2">
                          <span className={isOnline ? 'text-emerald-400 font-semibold' : isIdle ? 'text-amber-400' : 'text-stone-500'}>
                            {formatTimeAgo(session.secondsSinceLastPing)}
                          </span>
                          <span>•</span>
                          <span>{session.pingCount} pings (~{session.avgPingIntervalSec || 10}s)</span>
                        </div>
                      </td>

                      {/* IP Address & Network Scope */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-stone-100 text-xs px-2 py-0.5 rounded bg-stone-950 border border-stone-800">
                            {session.ip}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-stone-800/80 text-stone-300 border border-stone-700">
                            {ipVer}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopy(session.ip, `ip-${session.id}`, 'IP Address');
                            }}
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
                        <div className="mt-1 flex items-center gap-1.5 text-[11px]">
                          <span className={`font-mono text-[10px] ${
                            isLoopback ? 'text-emerald-400 font-semibold' : isPrivate ? 'text-sky-400 font-semibold' : 'text-amber-400 font-semibold'
                          }`}>
                            {session.networkScope || 'Public WAN Network'}
                          </span>
                          {session.asn && (
                            <>
                              <span className="text-stone-600">•</span>
                              <span className="text-[10px] text-stone-400 font-mono truncate max-w-[140px]" title={session.asOrg || session.asn}>
                                {session.asn} {session.asOrg ? `(${session.asOrg})` : ''}
                              </span>
                            </>
                          )}
                        </div>
                      </td>

                      {/* Location & Timezone */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-stone-200 font-medium">
                          <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>
                            {session.city ? `${session.city}, ` : ''}{session.region ? `${session.region}, ` : ''}{session.country || 'Local Dev'}
                          </span>
                          {session.countryCode && (
                            <span className="text-[10px] font-mono text-stone-400 bg-stone-950 px-1 py-0.2 rounded border border-stone-800">
                              {session.countryCode}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 font-mono text-[10px] text-stone-400 flex items-center gap-2">
                          <Clock className="w-3 h-3 text-stone-500" />
                          <span>{session.timezone || 'UTC'}</span>
                          <span>•</span>
                          <span className="text-stone-300">{formatTzTime(session.timezone)}</span>
                        </div>
                      </td>

                      {/* Hardware & Environment */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {session.isMobile ? (
                            <Smartphone className="w-4 h-4 text-sky-400 shrink-0" />
                          ) : (
                            <Monitor className="w-4 h-4 text-stone-400 shrink-0" />
                          )}
                          <div>
                            <span className="font-semibold text-stone-200 block">
                              {session.osName || 'Desktop Workstation'} • {session.browserName || 'Browser'}
                            </span>
                            <div className="text-[10px] text-stone-400 font-mono flex items-center gap-1.5 mt-0.5">
                              {session.screenResolution && (
                                <span>{session.screenResolution}</span>
                              )}
                              {session.hardwareConcurrency && (
                                <>
                                  <span>•</span>
                                  <span>{session.hardwareConcurrency}</span>
                                </>
                              )}
                              {session.deviceMemory && (
                                <>
                                  <span>•</span>
                                  <span>{session.deviceMemory}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Active Portal & Route */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div>
                          <span className="font-semibold text-stone-200 block">
                            {session.portalName || 'Admin Console'}
                          </span>
                          <div className="mt-1 flex items-center gap-1.5 text-[10px] font-mono">
                            <span className="text-amber-400/90 font-medium">Route:</span>
                            <span className="px-1.5 py-0.2 rounded bg-stone-950 text-stone-300 border border-stone-800 truncate max-w-[120px]" title={session.lastActiveRoute || '/'}>
                              {session.lastActiveRoute || '/'}
                            </span>
                            {session.username && (
                              <>
                                <span className="text-stone-600">•</span>
                                <span className="text-stone-400">@{session.username}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* License & Risk */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-semibold text-amber-300 text-xs">
                              {session.rawKey || session.keyMasked || 'NO-KEY'}
                            </span>
                            {session.rawKey && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopy(session.rawKey || '', `key-${session.id}`, 'License Key');
                                }}
                                className="p-0.5 text-stone-500 hover:text-stone-300 transition-colors cursor-pointer"
                                title="Copy Key"
                              >
                                {copiedField === `key-${session.id}` ? (
                                  <Check className="w-3 h-3 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-semibold ${
                              session.riskAssessment === 'SECURE_LOOPBACK'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : session.riskAssessment === 'ELEVATED' || session.riskAssessment === 'HIGH_VOLUME'
                                ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                : 'bg-stone-950 text-stone-300 border border-stone-800'
                            }`}>
                              {session.riskAssessment === 'SECURE_LOOPBACK' ? 'SECURE HOST' : (session.riskAssessment || 'NORMAL')}
                            </span>
                            <span className="text-[10px] text-stone-400 font-medium">
                              {session.plan || 'Standard'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Forensic Actions */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          {/* Inspect Dossier Button */}
                          <button
                            onClick={() => setSelectedSession(session)}
                            className="px-2.5 py-1 text-xs font-semibold bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 rounded-lg transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
                            title="Open Full Forensic Telemetry Dossier for this IP"
                          >
                            <Eye className="w-3.5 h-3.5 text-amber-400" />
                            <span>Dossier</span>
                          </button>

                          {/* Unlock HWID Button (if machine bound) */}
                          {session.hwid && !session.hwid.includes('GUEST') && session.hwid !== 'Desktop-PC' && (
                            <button
                              onClick={() => handleUnlockHwid(session)}
                              disabled={isUnlockingHwid === session.id}
                              className="px-2.5 py-1 text-xs font-semibold bg-amber-950/80 hover:bg-amber-900 border border-amber-800/80 text-amber-300 rounded-lg transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
                              title="Unlock hardware lock so user can activate on a new machine"
                            >
                              <Unlock className="w-3 h-3 text-amber-400" />
                              <span>{isUnlockingHwid === session.id ? 'Unlocking...' : 'Unlock'}</span>
                            </button>
                          )}

                          {/* Revoke / Kick Button */}
                          <button
                            onClick={() => handleInstantRevoke(session)}
                            disabled={isRevokingKey === session.id}
                            className="px-2 py-1 text-xs font-semibold bg-rose-950/80 hover:bg-rose-900 border border-rose-800/80 text-rose-300 rounded-lg transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
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
            <span>Heartbeat cadence: 10s-30s ingestion window</span>
            <span>•</span>
            <span>{sessions.length} recorded IP entities</span>
          </div>
          {isSuperAdmin && (
            <div className="flex items-center gap-4">
              <button
                onClick={() => handlePruneSessions(false)}
                disabled={isPruning}
                className="text-stone-400 hover:text-amber-300 text-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                Prune Offline Records
              </button>
              <button
                onClick={() => handlePruneSessions(true)}
                disabled={isPruning}
                className="text-stone-500 hover:text-rose-400 text-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                Clear All Session History
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Forensic IP Inspection Dossier Modal */}
      {selectedSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-stone-900 border border-stone-700 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
            {/* Modal Header */}
            <div className="p-6 border-b border-stone-800 bg-stone-950/80 flex items-start justify-between gap-4 sticky top-0 z-20 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-mono text-lg font-bold text-stone-100">
                      {selectedSession.ip}
                    </span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-stone-800 text-stone-300 border border-stone-700">
                      {selectedSession.ipVersion || (selectedSession.ip.includes(':') ? 'IPv6' : 'IPv4')}
                    </span>
                    {selectedSession.onlineState === 'ONLINE' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span>LIVE ONLINE</span>
                      </span>
                    ) : selectedSession.onlineState === 'IDLE' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-950 text-amber-300 border border-amber-800">
                        <span className="w-2 h-2 rounded-full bg-amber-400" />
                        <span>IDLE</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-stone-800 text-stone-400 border border-stone-700">
                        <span className="w-2 h-2 rounded-full bg-stone-500" />
                        <span>OFFLINE</span>
                      </span>
                    )}
                    <span className="text-xs px-2 py-0.5 rounded bg-stone-950 border border-stone-800 text-amber-400 font-mono">
                      {selectedSession.networkScope || 'Public WAN Network'}
                    </span>
                  </div>
                  <p className="text-xs text-stone-400 mt-1 font-mono">
                    Session Identifier: {selectedSession.id}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCopy(selectedSession.ip, 'modal-ip', 'IP Address')}
                  className="px-3 py-1.5 text-xs font-medium bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg border border-stone-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                  title="Copy IP Address"
                >
                  {copiedField === 'modal-ip' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>Copy IP</span>
                </button>
                <button
                  onClick={() => setSelectedSession(null)}
                  className="p-1.5 text-stone-400 hover:text-stone-100 hover:bg-stone-800 rounded-lg transition-colors cursor-pointer"
                  title="Close Inspector"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body - 4 Forensic Intelligence Sections */}
            <div className="p-6 space-y-6">
              {/* Section 1: Network, Protocol & Routing Intelligence */}
              <div className="bg-stone-950/60 border border-stone-800 rounded-xl p-4">
                <div className="flex items-center gap-2 font-bold text-amber-400 text-xs uppercase tracking-wider mb-3">
                  <Globe className="w-4 h-4" />
                  <span>1. Network & Autonomous System (ASN) Routing</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs font-mono">
                  <div className="p-3 bg-stone-900/80 border border-stone-800/80 rounded-lg">
                    <span className="text-stone-500 block text-[11px] mb-1">Canonical IP Address</span>
                    <span className="text-stone-100 font-bold">{selectedSession.ip}</span>
                  </div>
                  <div className="p-3 bg-stone-900/80 border border-stone-800/80 rounded-lg">
                    <span className="text-stone-500 block text-[11px] mb-1">IP Protocol Version</span>
                    <span className="text-amber-400 font-bold">{selectedSession.ipVersion || (selectedSession.ip.includes(':') ? 'IPv6' : 'IPv4')}</span>
                  </div>
                  <div className="p-3 bg-stone-900/80 border border-stone-800/80 rounded-lg">
                    <span className="text-stone-500 block text-[11px] mb-1">Network Classification</span>
                    <span className="text-emerald-400 font-bold">{selectedSession.networkScope || 'Public WAN Network'}</span>
                  </div>
                  <div className="p-3 bg-stone-900/80 border border-stone-800/80 rounded-lg">
                    <span className="text-stone-500 block text-[11px] mb-1">Autonomous System (ASN)</span>
                    <span className="text-stone-200">{selectedSession.asn || 'AS0 Localhost / Default'}</span>
                  </div>
                  <div className="p-3 bg-stone-900/80 border border-stone-800/80 rounded-lg">
                    <span className="text-stone-500 block text-[11px] mb-1">AS Organization / ISP</span>
                    <span className="text-stone-200">{selectedSession.asOrg || 'Internal Loopback Network'}</span>
                  </div>
                  <div className="p-3 bg-stone-900/80 border border-stone-800/80 rounded-lg">
                    <span className="text-stone-500 block text-[11px] mb-1">Connection Protocol / Speed</span>
                    <span className="text-stone-200">{selectedSession.connectionType || 'Broadband LAN / Ethernet'}</span>
                  </div>
                </div>
              </div>

              {/* Section 2: Geolocation & Local Time Intelligence */}
              <div className="bg-stone-950/60 border border-stone-800 rounded-xl p-4">
                <div className="flex items-center gap-2 font-bold text-amber-400 text-xs uppercase tracking-wider mb-3">
                  <MapPin className="w-4 h-4" />
                  <span>2. Geolocation Intelligence & Remote Clock</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
                  <div className="p-3 bg-stone-900/80 border border-stone-800/80 rounded-lg">
                    <span className="text-stone-500 block text-[11px] mb-1">Country / Territory</span>
                    <span className="text-stone-100 font-bold">
                      {selectedSession.country || 'United States'} {selectedSession.countryCode ? `(${selectedSession.countryCode})` : ''}
                    </span>
                  </div>
                  <div className="p-3 bg-stone-900/80 border border-stone-800/80 rounded-lg">
                    <span className="text-stone-500 block text-[11px] mb-1">State / Region</span>
                    <span className="text-stone-200 font-bold">{selectedSession.region || 'Illinois / Local'}</span>
                  </div>
                  <div className="p-3 bg-stone-900/80 border border-stone-800/80 rounded-lg">
                    <span className="text-stone-500 block text-[11px] mb-1">City / Municipality</span>
                    <span className="text-stone-200 font-bold">{selectedSession.city || 'Chicago / Dev Host'}</span>
                  </div>
                  <div className="p-3 bg-stone-900/80 border border-stone-800/80 rounded-lg">
                    <span className="text-stone-500 block text-[11px] mb-1">Postal Code</span>
                    <span className="text-stone-200">{selectedSession.postalCode || '60601'}</span>
                  </div>
                  <div className="p-3 bg-stone-900/80 border border-stone-800/80 rounded-lg sm:col-span-2">
                    <span className="text-stone-500 block text-[11px] mb-1">Timezone & Local Remote Clock</span>
                    <div className="flex items-center justify-between">
                      <span className="text-amber-400 font-bold">{selectedSession.timezone || 'UTC'}</span>
                      <span className="text-stone-300 font-bold">{formatTzTime(selectedSession.timezone)}</span>
                    </div>
                  </div>
                  <div className="p-3 bg-stone-900/80 border border-stone-800/80 rounded-lg sm:col-span-2">
                    <span className="text-stone-500 block text-[11px] mb-1">Resolved Location String</span>
                    <span className="text-stone-300 truncate block">{selectedSession.location || 'Local Development Network'}</span>
                  </div>
                </div>
              </div>

              {/* Section 3: Hardware, Display & Runtime Fingerprint */}
              <div className="bg-stone-950/60 border border-stone-800 rounded-xl p-4">
                <div className="flex items-center gap-2 font-bold text-amber-400 text-xs uppercase tracking-wider mb-3">
                  <Cpu className="w-4 h-4" />
                  <span>3. Client Hardware, Display & Runtime Fingerprint</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
                  <div className="p-3 bg-stone-900/80 border border-stone-800/80 rounded-lg">
                    <span className="text-stone-500 block text-[11px] mb-1">Operating System</span>
                    <span className="text-stone-100 font-bold">{selectedSession.osName || 'Unknown OS'}</span>
                  </div>
                  <div className="p-3 bg-stone-900/80 border border-stone-800/80 rounded-lg">
                    <span className="text-stone-500 block text-[11px] mb-1">Browser & Engine</span>
                    <span className="text-stone-100 font-bold">
                      {selectedSession.browserName || 'Browser'} {selectedSession.browserVersion ? `v${selectedSession.browserVersion}` : ''}
                    </span>
                  </div>
                  <div className="p-3 bg-stone-900/80 border border-stone-800/80 rounded-lg">
                    <span className="text-stone-500 block text-[11px] mb-1">Physical Resolution</span>
                    <span className="text-amber-400 font-bold">{selectedSession.screenResolution || '1920x1080'}</span>
                  </div>
                  <div className="p-3 bg-stone-900/80 border border-stone-800/80 rounded-lg">
                    <span className="text-stone-500 block text-[11px] mb-1">CSS Viewport Size</span>
                    <span className="text-amber-400 font-bold">{selectedSession.viewport || '1440x900'}</span>
                  </div>
                  <div className="p-3 bg-stone-900/80 border border-stone-800/80 rounded-lg">
                    <span className="text-stone-500 block text-[11px] mb-1">System Memory (RAM)</span>
                    <span className="text-stone-200">{selectedSession.deviceMemory || '8 GB (High Cap)'}</span>
                  </div>
                  <div className="p-3 bg-stone-900/80 border border-stone-800/80 rounded-lg">
                    <span className="text-stone-500 block text-[11px] mb-1">CPU Logical Cores</span>
                    <span className="text-stone-200">{selectedSession.hardwareConcurrency || '8 Cores'}</span>
                  </div>
                  <div className="p-3 bg-stone-900/80 border border-stone-800/80 rounded-lg">
                    <span className="text-stone-500 block text-[11px] mb-1">Pixel Ratio (Retina)</span>
                    <span className="text-stone-200">{selectedSession.pixelRatio || '1x Standard'}</span>
                  </div>
                  <div className="p-3 bg-stone-900/80 border border-stone-800/80 rounded-lg">
                    <span className="text-stone-500 block text-[11px] mb-1">Touch Input Support</span>
                    <span className="text-stone-200">
                      {selectedSession.touchSupported ? 'Touch Enabled' : 'Mouse / Pointer Only'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Section 4: Session Behavior, Portals & Security Assessment */}
              <div className="bg-stone-950/60 border border-stone-800 rounded-xl p-4">
                <div className="flex items-center gap-2 font-bold text-amber-400 text-xs uppercase tracking-wider mb-3">
                  <Activity className="w-4 h-4" />
                  <span>4. Session Behavior, Portals & Security Posture</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs font-mono">
                  <div className="p-3 bg-stone-900/80 border border-stone-800/80 rounded-lg">
                    <span className="text-stone-500 block text-[11px] mb-1">Connected Portal</span>
                    <span className="text-stone-100 font-bold">{selectedSession.portalName || 'Admin Console'}</span>
                  </div>
                  <div className="p-3 bg-stone-900/80 border border-stone-800/80 rounded-lg">
                    <span className="text-stone-500 block text-[11px] mb-1">Active Page Route</span>
                    <span className="text-amber-400 font-bold">{selectedSession.lastActiveRoute || '/'}</span>
                  </div>
                  <div className="p-3 bg-stone-900/80 border border-stone-800/80 rounded-lg">
                    <span className="text-stone-500 block text-[11px] mb-1">Risk Assessment Rating</span>
                    <span className={`font-bold ${
                      selectedSession.riskAssessment === 'SECURE_LOOPBACK'
                        ? 'text-emerald-400'
                        : selectedSession.riskAssessment === 'ELEVATED'
                        ? 'text-rose-400'
                        : 'text-stone-200'
                    }`}>
                      {selectedSession.riskAssessment === 'SECURE_LOOPBACK'
                        ? 'SECURE LOOPBACK (Zero outside threat)'
                        : (selectedSession.riskAssessment || 'NORMAL (Standard telemetry pattern)')}
                    </span>
                  </div>
                  <div className="p-3 bg-stone-900/80 border border-stone-800/80 rounded-lg">
                    <span className="text-stone-500 block text-[11px] mb-1">Lifetime Pings / Cadence</span>
                    <span className="text-stone-200">{selectedSession.pingCount} pings (~{selectedSession.avgPingIntervalSec || 10}s interval)</span>
                  </div>
                  <div className="p-3 bg-stone-900/80 border border-stone-800/80 rounded-lg">
                    <span className="text-stone-500 block text-[11px] mb-1">First Seen Timestamp</span>
                    <span className="text-stone-200">{new Date(selectedSession.firstSeen).toLocaleString()}</span>
                  </div>
                  <div className="p-3 bg-stone-900/80 border border-stone-800/80 rounded-lg">
                    <span className="text-stone-500 block text-[11px] mb-1">Last Telemetry Ping</span>
                    <span className="text-stone-200">{new Date(selectedSession.lastPingMs).toLocaleString()}</span>
                  </div>
                  <div className="p-3 bg-stone-900/80 border border-stone-800/80 rounded-lg sm:col-span-2">
                    <span className="text-stone-500 block text-[11px] mb-1">Hardware ID Fingerprint (HWID)</span>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-stone-300 truncate">{selectedSession.hwid}</span>
                      <button
                        onClick={() => handleCopy(selectedSession.hwid, 'modal-hwid', 'HWID')}
                        className="text-stone-400 hover:text-stone-200 p-1"
                        title="Copy HWID"
                      >
                        {copiedField === 'modal-hwid' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="p-3 bg-stone-900/80 border border-stone-800/80 rounded-lg">
                    <span className="text-stone-500 block text-[11px] mb-1">License Key</span>
                    <span className="text-amber-300 font-bold">{selectedSession.rawKey || selectedSession.keyMasked || 'NO-KEY'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer Controls */}
            <div className="p-4 border-t border-stone-800 bg-stone-950/80 flex flex-wrap items-center justify-between gap-3 sticky bottom-0 z-20 backdrop-blur-md">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(selectedSession, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `ip_${selectedSession.ip.replace(/[^a-zA-Z0-9]/g, '_')}_dossier.json`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    if (showToast) showToast(`Dossier for ${selectedSession.ip} exported!`);
                  }}
                  className="px-3 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium rounded-xl border border-stone-700 transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Download className="w-3.5 h-3.5 text-stone-400" />
                  <span>Download Session JSON</span>
                </button>
                <button
                  onClick={() => handleCopy(JSON.stringify(selectedSession, null, 2), 'modal-raw-json', 'Raw JSON')}
                  className="px-3 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium rounded-xl border border-stone-700 transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  {copiedField === 'modal-raw-json' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-stone-400" />}
                  <span>Copy Raw JSON</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                {selectedSession.hwid && !selectedSession.hwid.includes('GUEST') && selectedSession.hwid !== 'Desktop-PC' && (
                  <button
                    onClick={() => handleUnlockHwid(selectedSession)}
                    className="px-3 py-2 bg-amber-950/80 hover:bg-amber-900 border border-amber-800 text-amber-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Unlock className="w-3.5 h-3.5 text-amber-400" />
                    <span>Unlock PC Hardware</span>
                  </button>
                )}
                <button
                  onClick={() => setSelectedSession(null)}
                  className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  Close Dossier
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
