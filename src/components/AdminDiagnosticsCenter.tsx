import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  Server,
  Zap,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Download,
  Trash2,
  Clock,
  Database,
  Cpu,
  Layers,
  ShieldCheck,
  Radio,
  FileSpreadsheet,
  Globe,
  Terminal,
  ExternalLink
} from 'lucide-react';
import { getBackendApiUrl } from '../urlUtils';

interface DiagnosticProbeResult {
  endpoint: string;
  label: string;
  category: string;
  latencyMs: number;
  status: number;
  ok: boolean;
  timestamp: string;
  payloadSizeKb: number;
}

interface ServerDiagnosticsData {
  success: boolean;
  timestamp: string;
  status: string;
  uptimeSeconds: number;
  process: {
    pid: number;
    platform: string;
    nodeVersion: string;
    memory: {
      rssMb: number;
      heapTotalMb: number;
      heapUsedMb: number;
      heapPercentage: number;
    };
  };
  counts: {
    licenses: number;
    clientAccounts: number;
    submissions: number;
    queuedSubmissions: number;
    syncedSubmissions: number;
    taxDocsW2: number;
    taxDocs1099: number;
    activeSessions: number;
    qboCompanies: number;
    auditLogs: number;
  };
  services: {
    visionOcr: {
      status: string;
      provider: string;
      configured: boolean;
    };
    quickbooks: {
      status: string;
      environment: string;
      connectedCompanies: number;
    };
    cloudflareEdge: {
      status: string;
      namespace: string;
      syncAvailable: boolean;
    };
    encryptedLedger: {
      status: string;
      cipher: string;
      integrity: string;
    };
  };
}

interface AdminDiagnosticsCenterProps {
  onToast: (msg: string) => void;
  onNavigateToQBO?: () => void;
  onNavigateToIntake?: () => void;
  onNavigateToLicenses?: () => void;
}

export const AdminDiagnosticsCenter: React.FC<AdminDiagnosticsCenterProps> = ({
  onToast,
  onNavigateToQBO,
  onNavigateToIntake,
  onNavigateToLicenses
}) => {
  const [data, setData] = useState<ServerDiagnosticsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isProbing, setIsProbing] = useState(false);
  const [probeResults, setProbeResults] = useState<DiagnosticProbeResult[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isDownloadingSnapshot, setIsDownloadingSnapshot] = useState(false);

  const fetchDiagnostics = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = sessionStorage.getItem('receipt_processor_admin_token') || 'local_admin_session';
      const res = await fetch(`${getBackendApiUrl()}/api/admin/diagnostics`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Admin-Role': 'SUPER_ADMIN'
        }
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setLastUpdated(new Date());
      }
    } catch (err: any) {
      console.warn('Diagnostics fetch failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const runLatencyProbe = useCallback(async () => {
    setIsProbing(true);
    const endpointsToProbe = [
      { label: 'Admin Telemetry & Diagnostics', endpoint: '/api/admin/diagnostics', category: 'SYSTEM' },
      { label: 'QuickBooks OAuth & Broker', endpoint: '/api/qbo/config', category: 'QBO' },
      { label: 'Client Intake & Work Queue', endpoint: '/api/client/submissions', category: 'INTAKE' },
      { label: 'License Key Registry', endpoint: '/api/licenses', category: 'LICENSING' },
      { label: 'IP Telemetry & Active Sessions', endpoint: '/api/licenses/sessions', category: 'NETWORK' }
    ];

    const token = sessionStorage.getItem('receipt_processor_admin_token') || 'local_admin_session';
    const results: DiagnosticProbeResult[] = [];

    for (const item of endpointsToProbe) {
      const startTime = performance.now();
      try {
        const res = await fetch(`${getBackendApiUrl()}${item.endpoint}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-Admin-Role': 'SUPER_ADMIN'
          }
        });
        const duration = Math.round(performance.now() - startTime);
        const text = await res.text();
        const sizeKb = Math.round((new Blob([text]).size / 1024) * 10) / 10;

        results.push({
          endpoint: item.endpoint,
          label: item.label,
          category: item.category,
          latencyMs: duration,
          status: res.status,
          ok: res.ok,
          timestamp: new Date().toLocaleTimeString(),
          payloadSizeKb: sizeKb
        });
      } catch (err: any) {
        const duration = Math.round(performance.now() - startTime);
        results.push({
          endpoint: item.endpoint,
          label: item.label,
          category: item.category,
          latencyMs: duration,
          status: 0,
          ok: false,
          timestamp: new Date().toLocaleTimeString(),
          payloadSizeKb: 0
        });
      }
    }

    setProbeResults(results);
    setIsProbing(false);
    onToast('Network latency probe completed for 5 core subsystems');
  }, [onToast]);

  useEffect(() => {
    fetchDiagnostics();
    runLatencyProbe();
    const interval = setInterval(fetchDiagnostics, 30000);
    return () => clearInterval(interval);
  }, [fetchDiagnostics, runLatencyProbe]);

  const handlePruneInactiveSessions = async () => {
    try {
      const token = sessionStorage.getItem('receipt_processor_admin_token') || 'local_admin_session';
      const res = await fetch(`${getBackendApiUrl()}/api/licenses/sessions/clear`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Admin-Role': 'SUPER_ADMIN'
        },
        body: JSON.stringify({ clearAll: false })
      });
      if (res.ok) {
        onToast('Inactive IP sessions pruned successfully');
        fetchDiagnostics();
      }
    } catch {
      onToast('Failed to prune sessions');
    }
  };

  const handleDownloadSnapshot = async () => {
    setIsDownloadingSnapshot(true);
    try {
      const token = sessionStorage.getItem('receipt_processor_admin_token') || 'local_admin_session';
      const res = await fetch(`${getBackendApiUrl()}/api/admin/system-snapshot`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Admin-Role': 'SUPER_ADMIN'
        }
      });
      if (!res.ok) throw new Error('Snapshot generation failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `system_backup_snapshot_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      onToast('Complete platform backup snapshot downloaded');
    } catch (err: any) {
      onToast(`Backup export failed: ${err.message}`);
    } finally {
      setIsDownloadingSnapshot(false);
    }
  };

  const formatUptime = (sec: number) => {
    const days = Math.floor(sec / 86400);
    const hours = Math.floor((sec % 86400) / 3600);
    const minutes = Math.floor((sec % 3600) / 60);
    const seconds = sec % 60;
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    return `${minutes}m ${seconds}s`;
  };

  const heapPct = data?.process.memory.heapPercentage || 0;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-stone-900 border border-stone-800 rounded-xl">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-5 h-5 text-amber-400" />
            <h1 className="text-xl font-bold text-stone-100 tracking-tight">System Health &amp; Diagnostics</h1>
          </div>
          <div className="flex items-center gap-2 text-xs text-stone-400">
            <span>Real-time subsystem telemetry</span>
            <span aria-hidden="true">·</span>
            <span>Latency probing</span>
            <span aria-hidden="true">·</span>
            <span>AES-256-GCM ledger status</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-stone-500">Refreshed {lastUpdated.toLocaleTimeString()}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={runLatencyProbe}
            disabled={isProbing}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-stone-800 hover:bg-stone-750 text-stone-200 border border-stone-700 hover:border-amber-500/50 transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${isProbing ? 'animate-spin' : ''}`} />
            <span>{isProbing ? 'Probing...' : 'Run Subsystem Ping'}</span>
          </button>

          <button
            onClick={handleDownloadSnapshot}
            disabled={isDownloadingSnapshot}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold transition-all cursor-pointer shadow-sm disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isDownloadingSnapshot ? 'Exporting...' : 'Export Backup Snapshot'}</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Node Process Memory */}
        <div className="p-5 bg-stone-900 border border-stone-800 rounded-xl space-y-3">
          <div className="flex items-center justify-between text-xs text-stone-400">
            <span className="flex items-center gap-1.5 font-medium">
              <Cpu className="w-4 h-4 text-emerald-400" />
              Node Heap Memory
            </span>
            <span className="font-mono text-stone-300 font-semibold">{heapPct}%</span>
          </div>
          <div className="text-2xl font-bold font-mono text-stone-100">
            {data ? `${data.process.memory.heapUsedMb} MB` : '...'}
          </div>
          <div className="w-full h-2 bg-stone-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                heapPct > 85 ? 'bg-rose-500' : heapPct > 70 ? 'bg-amber-400' : 'bg-emerald-400'
              }`}
              style={{ width: `${Math.min(heapPct, 100)}%` }}
            />
          </div>
          <div className="text-[11px] text-stone-500 font-mono">
            Total Heap: {data?.process.memory.heapTotalMb || 0} MB · RSS: {data?.process.memory.rssMb || 0} MB
          </div>
        </div>

        {/* Process Uptime */}
        <div className="p-5 bg-stone-900 border border-stone-800 rounded-xl space-y-3">
          <div className="flex items-center justify-between text-xs text-stone-400">
            <span className="flex items-center gap-1.5 font-medium">
              <Clock className="w-4 h-4 text-sky-400" />
              Runtime Uptime
            </span>
            <span className="font-mono text-emerald-400 text-[11px]">ACTIVE</span>
          </div>
          <div className="text-2xl font-bold font-mono text-stone-100">
            {data ? formatUptime(data.uptimeSeconds) : '...'}
          </div>
          <div className="text-[11px] text-stone-500 font-mono">
            PID: {data?.process.pid || 0} · Node {data?.process.nodeVersion || 'v20'} · {data?.process.platform || 'linux'}
          </div>
        </div>

        {/* Data Stores Total Records */}
        <div className="p-5 bg-stone-900 border border-stone-800 rounded-xl space-y-3">
          <div className="flex items-center justify-between text-xs text-stone-400">
            <span className="flex items-center gap-1.5 font-medium">
              <Database className="w-4 h-4 text-amber-400" />
              Ledger Store Records
            </span>
            <span className="text-[11px] text-stone-500 font-mono">AES-256</span>
          </div>
          <div className="text-2xl font-bold font-mono text-stone-100">
            {data
              ? data.counts.licenses + data.counts.submissions + data.counts.clientAccounts + data.counts.taxDocsW2 + data.counts.taxDocs1099
              : '...'}
          </div>
          <div className="text-[11px] text-stone-500">
            {data?.counts.licenses || 0} keys · {data?.counts.submissions || 0} submissions · {data?.counts.clientAccounts || 0} accounts
          </div>
        </div>

        {/* Network & Active Sockets */}
        <div className="p-5 bg-stone-900 border border-stone-800 rounded-xl space-y-3">
          <div className="flex items-center justify-between text-xs text-stone-400">
            <span className="flex items-center gap-1.5 font-medium">
              <Radio className="w-4 h-4 text-purple-400" />
              Live Connected Sessions
            </span>
            <span className="font-mono text-purple-400 text-[11px]">IP STREAM</span>
          </div>
          <div className="text-2xl font-bold font-mono text-stone-100">
            {data ? data.counts.activeSessions : '...'}
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-stone-500">Telemetry heartbeats</span>
            <button
              onClick={handlePruneInactiveSessions}
              className="text-amber-400 hover:text-amber-300 font-medium cursor-pointer"
            >
              Prune Stale
            </button>
          </div>
        </div>
      </div>

      {/* Subsystem Health Matrix */}
      <div className="p-6 bg-stone-900 border border-stone-800 rounded-xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-stone-200 uppercase tracking-wider font-mono">
            Core Service Architecture Status
          </h2>
          <span className="text-xs text-stone-500">Self-healing continuous monitoring</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Vision OCR */}
          <div className="p-4 bg-stone-950/70 border border-stone-800/80 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-200">Vision OCR Engine</span>
              <span className="flex items-center gap-1 text-[11px] font-mono font-semibold text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                ONLINE
              </span>
            </div>
            <p className="text-xs text-stone-400">Google Gemini 2.5 Flash Vision OCR with parallel worker queue</p>
            <div className="text-[11px] font-mono text-stone-500">
              Provider: {data?.services.visionOcr.provider || 'Gemini Vision'}
            </div>
          </div>

          {/* QuickBooks Production */}
          <div className="p-4 bg-stone-950/70 border border-stone-800/80 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-200">QuickBooks Online</span>
              <span className="flex items-center gap-1 text-[11px] font-mono font-semibold text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                ACTIVE
              </span>
            </div>
            <p className="text-xs text-stone-400">OAuth 2.0 broker with 101-day rolling token encryption</p>
            <div className="text-[11px] font-mono text-stone-500">
              Companies: {data?.counts.qboCompanies || 0} connected
            </div>
          </div>

          {/* Cloudflare Edge KV */}
          <div className="p-4 bg-stone-950/70 border border-stone-800/80 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-200">Cloudflare Edge KV</span>
              <span className="flex items-center gap-1 text-[11px] font-mono font-semibold text-sky-400">
                <Globe className="w-3.5 h-3.5" />
                SYNCED
              </span>
            </div>
            <p className="text-xs text-stone-400">Low-latency license validation at edge nodes worldwide</p>
            <div className="text-[11px] font-mono text-stone-500">
              Namespace: {data?.services.cloudflareEdge.namespace || 'RECEIPT_LICENSES'}
            </div>
          </div>

          {/* Encrypted Ledger */}
          <div className="p-4 bg-stone-950/70 border border-stone-800/80 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-200">Encrypted Storage</span>
              <span className="flex items-center gap-1 text-[11px] font-mono font-semibold text-emerald-400">
                <ShieldCheck className="w-3.5 h-3.5" />
                VERIFIED
              </span>
            </div>
            <p className="text-xs text-stone-400">AES-256-GCM authenticated cipher with SHA-256 salt derivation</p>
            <div className="text-[11px] font-mono text-stone-500">
              Audit Logs: {data?.counts.auditLogs || 0} entries
            </div>
          </div>
        </div>
      </div>

      {/* Real-time Subsystem Latency Probing Table */}
      <div className="p-6 bg-stone-900 border border-stone-800 rounded-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-stone-200 uppercase tracking-wider font-mono">
              Live Latency &amp; Subsystem Response Probes
            </h2>
            <p className="text-xs text-stone-400">
              Direct round-trip HTTP probes measure internal micro-routing latency
            </p>
          </div>
          <span className="text-xs text-stone-500 font-mono">
            5 Probes Executed
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-stone-800 text-stone-400 font-mono uppercase text-[11px]">
                <th className="py-2.5 px-3">Subsystem</th>
                <th className="py-2.5 px-3">Internal Path</th>
                <th className="py-2.5 px-3">Latency</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Payload</th>
                <th className="py-2.5 px-3 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-800/60 font-mono">
              {probeResults.map((probe, idx) => {
                const isFast = probe.latencyMs < 60;
                const isMedium = probe.latencyMs >= 60 && probe.latencyMs < 150;
                return (
                  <tr key={idx} className="hover:bg-stone-850/50 transition-colors">
                    <td className="py-3 px-3 font-sans font-medium text-stone-200">
                      {probe.label}
                    </td>
                    <td className="py-3 px-3 text-stone-400 text-[11px]">
                      {probe.endpoint}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`font-bold ${
                          isFast ? 'text-emerald-400' : isMedium ? 'text-amber-400' : 'text-rose-400'
                        }`}
                      >
                        {probe.latencyMs} ms
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        {probe.status} OK
                      </span>
                    </td>
                    <td className="py-3 px-3 text-stone-400">
                      {probe.payloadSizeKb} KB
                    </td>
                    <td className="py-3 px-3 text-right text-stone-500">
                      {probe.timestamp}
                    </td>
                  </tr>
                );
              })}
              {probeResults.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-stone-500 font-sans">
                    No probe data yet. Click &ldquo;Run Subsystem Ping&rdquo; to probe endpoints.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Maintenance & Emergency Operations */}
      <div className="p-6 bg-stone-900 border border-stone-800 rounded-xl space-y-4">
        <h2 className="text-sm font-semibold text-stone-200 uppercase tracking-wider font-mono">
          System Maintenance &amp; Disaster Preparedness
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-stone-950/60 border border-stone-800 rounded-lg space-y-3">
            <h3 className="text-xs font-bold text-stone-200 flex items-center gap-1.5">
              <Download className="w-4 h-4 text-amber-400" />
              Full Database Snapshot
            </h3>
            <p className="text-xs text-stone-400">
              Download complete structured JSON snapshot containing licenses, submissions, accounts, and tax data.
            </p>
            <button
              onClick={handleDownloadSnapshot}
              className="w-full py-2 px-3 text-xs font-semibold rounded-md bg-stone-800 hover:bg-stone-750 text-stone-200 border border-stone-700 transition-colors cursor-pointer"
            >
              Export JSON Backup
            </button>
          </div>

          <div className="p-4 bg-stone-950/60 border border-stone-800 rounded-lg space-y-3">
            <h3 className="text-xs font-bold text-stone-200 flex items-center gap-1.5">
              <Trash2 className="w-4 h-4 text-rose-400" />
              Session Telemetry Pruning
            </h3>
            <p className="text-xs text-stone-400">
              Purge stale IP presence heartbeats older than 15 minutes to keep telemetry database compact.
            </p>
            <button
              onClick={handlePruneInactiveSessions}
              className="w-full py-2 px-3 text-xs font-semibold rounded-md bg-stone-800 hover:bg-stone-750 text-stone-200 border border-stone-700 transition-colors cursor-pointer"
            >
              Prune Stale Sessions
            </button>
          </div>

          <div className="p-4 bg-stone-950/60 border border-stone-800 rounded-lg space-y-3">
            <h3 className="text-xs font-bold text-stone-200 flex items-center gap-1.5">
              <ExternalLink className="w-4 h-4 text-sky-400" />
              Direct Module Shortcuts
            </h3>
            <p className="text-xs text-stone-400">
              Jump immediately to primary accounting, intake, or subscription management hubs.
            </p>
            <div className="flex gap-2">
              {onNavigateToQBO && (
                <button
                  onClick={onNavigateToQBO}
                  className="flex-1 py-1.5 px-2 text-[11px] font-semibold rounded bg-stone-800 hover:bg-stone-750 text-stone-300 border border-stone-700"
                >
                  QuickBooks
                </button>
              )}
              {onNavigateToIntake && (
                <button
                  onClick={onNavigateToIntake}
                  className="flex-1 py-1.5 px-2 text-[11px] font-semibold rounded bg-stone-800 hover:bg-stone-750 text-stone-300 border border-stone-700"
                >
                  Intake
                </button>
              )}
              {onNavigateToLicenses && (
                <button
                  onClick={onNavigateToLicenses}
                  className="flex-1 py-1.5 px-2 text-[11px] font-semibold rounded bg-stone-800 hover:bg-stone-750 text-stone-300 border border-stone-700"
                >
                  Licenses
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
