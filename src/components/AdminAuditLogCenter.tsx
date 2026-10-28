import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShieldAlert,
  Search,
  Filter,
  Download,
  Trash2,
  PlusCircle,
  FileText,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Info,
  CheckCircle2,
  RefreshCw,
  X,
  User,
  Activity
} from 'lucide-react';
import { getBackendApiUrl } from '../urlUtils';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: string;
  category: 'AUTH' | 'LICENSING' | 'QBO' | 'INTAKE' | 'TELEMETRY' | 'SYSTEM' | string;
  actor: string;
  severity: 'INFO' | 'WARNING' | 'SECURITY' | 'CRITICAL' | string;
  details: string;
  ip: string;
}

interface AdminAuditLogCenterProps {
  onToast: (msg: string) => void;
}

export const AdminAuditLogCenter: React.FC<AdminAuditLogCenterProps> = ({ onToast }) => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [showAddModal, setShowAddModal] = useState(false);

  // New log form state
  const [newAction, setNewAction] = useState('OPERATOR_NOTE');
  const [newCategory, setNewCategory] = useState<'AUTH' | 'LICENSING' | 'QBO' | 'INTAKE' | 'TELEMETRY' | 'SYSTEM'>('SYSTEM');
  const [newSeverity, setNewSeverity] = useState<'INFO' | 'WARNING' | 'SECURITY' | 'CRITICAL'>('INFO');
  const [newDetails, setNewDetails] = useState('');
  const [newActor, setNewActor] = useState('Master Administrator');

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = sessionStorage.getItem('receipt_processor_admin_token') || 'local_admin_session';
      const res = await fetch(`${getBackendApiUrl()}/api/admin/audit-logs`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Admin-Role': 'SUPER_ADMIN'
        }
      });
      if (res.ok) {
        const json = await res.json();
        setLogs(json.logs || []);
      }
    } catch (err: any) {
      console.warn('Audit logs fetch failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      if (selectedCategory !== 'ALL' && log.category !== selectedCategory) return false;
      if (selectedSeverity !== 'ALL' && log.severity !== selectedSeverity) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        log.action.toLowerCase().includes(q) ||
        log.actor.toLowerCase().includes(q) ||
        log.details.toLowerCase().includes(q) ||
        log.ip.toLowerCase().includes(q)
      );
    });
  }, [logs, selectedCategory, selectedSeverity, searchQuery]);

  const handleRecordEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDetails.trim()) {
      onToast('Please enter log details or description');
      return;
    }

    try {
      const token = sessionStorage.getItem('receipt_processor_admin_token') || 'local_admin_session';
      const res = await fetch(`${getBackendApiUrl()}/api/admin/audit-logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Admin-Role': 'SUPER_ADMIN'
        },
        body: JSON.stringify({
          action: newAction.trim(),
          category: newCategory,
          severity: newSeverity,
          actor: newActor.trim(),
          details: newDetails.trim()
        })
      });
      if (res.ok) {
        onToast('Audit log entry recorded successfully');
        setShowAddModal(false);
        setNewDetails('');
        fetchLogs();
      }
    } catch {
      onToast('Failed to record audit log entry');
    }
  };

  const handleClearLogs = async () => {
    if (!window.confirm('Are you sure you want to purge all administrative audit logs? This cannot be undone.')) {
      return;
    }

    try {
      const token = sessionStorage.getItem('receipt_processor_admin_token') || 'local_admin_session';
      const res = await fetch(`${getBackendApiUrl()}/api/admin/audit-logs`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Admin-Role': 'SUPER_ADMIN'
        }
      });
      if (res.ok) {
        onToast('Audit logs cleared');
        setLogs([]);
      }
    } catch {
      onToast('Failed to clear audit logs');
    }
  };

  const exportCSV = () => {
    if (logs.length === 0) {
      onToast('No audit logs to export');
      return;
    }

    const headers = ['Timestamp', 'Action', 'Category', 'Severity', 'Actor', 'IP', 'Details'];
    const rows = logs.map(l => [
      `"${l.timestamp}"`,
      `"${l.action.replace(/"/g, '""')}"`,
      `"${l.category}"`,
      `"${l.severity}"`,
      `"${l.actor.replace(/"/g, '""')}"`,
      `"${l.ip}"`,
      `"${l.details.replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit_logs_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onToast('Exported audit logs as CSV');
  };

  const exportJSON = () => {
    if (logs.length === 0) {
      onToast('No audit logs to export');
      return;
    }
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit_logs_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onToast('Exported audit logs as JSON');
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-stone-900 border border-stone-800 rounded-xl">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
            <h1 className="text-xl font-bold text-stone-100 tracking-tight">Security &amp; Operational Audit Log</h1>
          </div>
          <div className="flex items-center gap-2 text-xs text-stone-400">
            <span>Immutable operator activity trail</span>
            <span aria-hidden="true">·</span>
            <span>Security forensics</span>
            <span aria-hidden="true">·</span>
            <span>Compliance documentation</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-stone-500">{logs.length} Total Events</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-stone-800 hover:bg-stone-750 text-stone-200 border border-stone-700 hover:border-amber-500/50 transition-all cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5 text-amber-400" />
            <span>Record Note</span>
          </button>

          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-stone-800 hover:bg-stone-750 text-stone-200 border border-stone-700 transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-sky-400" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={exportJSON}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-stone-800 hover:bg-stone-750 text-stone-200 border border-stone-700 transition-all cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5 text-purple-400" />
            <span>Export JSON</span>
          </button>

          <button
            onClick={fetchLogs}
            disabled={isLoading}
            className="p-2 rounded-lg bg-stone-800 hover:bg-stone-750 text-stone-400 hover:text-stone-200 border border-stone-700 transition-all cursor-pointer"
            title="Refresh logs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          {logs.length > 0 && (
            <button
              onClick={handleClearLogs}
              className="p-2 rounded-lg bg-stone-800 hover:bg-rose-950 text-stone-400 hover:text-rose-300 border border-stone-700 hover:border-rose-800 transition-all cursor-pointer"
              title="Clear all logs"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 bg-stone-900 border border-stone-800 rounded-xl">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by action, actor, details, or IP..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-stone-950 border border-stone-800 rounded-lg pl-9 pr-3 py-2 text-xs text-stone-200 placeholder-stone-500 focus:outline-none focus:border-amber-500/50"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto">
          {/* Category Filter */}
          <div className="flex items-center gap-1 p-1 bg-stone-950 rounded-lg border border-stone-800 shrink-0">
            {['ALL', 'SYSTEM', 'AUTH', 'LICENSING', 'QBO', 'INTAKE'].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-amber-500 text-stone-950 font-bold'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Severity Filter */}
          <div className="flex items-center gap-1 p-1 bg-stone-950 rounded-lg border border-stone-800 shrink-0">
            {['ALL', 'INFO', 'WARNING', 'SECURITY', 'CRITICAL'].map((sev) => (
              <button
                key={sev}
                onClick={() => setSelectedSeverity(sev)}
                className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
                  selectedSeverity === sev
                    ? sev === 'CRITICAL'
                      ? 'bg-rose-500 text-white font-bold'
                      : sev === 'WARNING'
                      ? 'bg-amber-500 text-stone-950 font-bold'
                      : 'bg-stone-800 text-stone-200 font-bold'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                {sev}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-stone-800 bg-stone-950/40 text-stone-400 font-mono uppercase text-[11px]">
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Severity</th>
                <th className="py-3 px-4">Actor</th>
                <th className="py-3 px-4">Origin IP</th>
                <th className="py-3 px-4">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-800/60 font-mono">
              {filteredLogs.map((log) => {
                const dateObj = new Date(log.timestamp);
                const isWarning = log.severity === 'WARNING';
                const isCritical = log.severity === 'CRITICAL' || log.severity === 'SECURITY';
                return (
                  <tr key={log.id} className="hover:bg-stone-850/50 transition-colors">
                    <td className="py-3 px-4 text-stone-400 whitespace-nowrap text-[11px]">
                      {dateObj.toLocaleDateString()} {dateObj.toLocaleTimeString()}
                    </td>
                    <td className="py-3 px-4 text-stone-200 font-semibold">
                      {log.action}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-[11px] text-stone-400">
                        {log.category}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`font-semibold text-[11px] ${
                          isCritical
                            ? 'text-rose-400'
                            : isWarning
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        {log.severity}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-stone-300 font-sans font-medium">
                      {log.actor}
                    </td>
                    <td className="py-3 px-4 text-stone-400 text-[11px]">
                      {log.ip}
                    </td>
                    <td className="py-3 px-4 text-stone-300 font-sans max-w-md truncate">
                      {log.details}
                    </td>
                  </tr>
                );
              })}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-stone-500 font-sans">
                    {searchQuery || selectedCategory !== 'ALL' || selectedSeverity !== 'ALL'
                      ? 'No audit log entries match the active filters.'
                      : 'No audit logs recorded yet. All administrative actions and sync operations will automatically log here.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Operational Note Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-stone-900 border border-stone-800 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-stone-800">
              <h3 className="text-base font-bold text-stone-100 flex items-center gap-2">
                <PlusCircle className="w-4 h-4 text-amber-400" />
                Record Operational Audit Entry
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-stone-400 hover:text-stone-200 cursor-pointer p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRecordEntry} className="space-y-4 text-xs">
              <div>
                <label className="block text-stone-400 mb-1 font-medium">Action Identifier</label>
                <input
                  type="text"
                  value={newAction}
                  onChange={(e) => setNewAction(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-500"
                  placeholder="e.g., RECONCILIATION_SHIFT_COMPLETE, KEY_ROTATION_REVIEW"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-400 mb-1 font-medium">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e: any) => setNewCategory(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-800 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-500"
                  >
                    <option value="SYSTEM">SYSTEM</option>
                    <option value="AUTH">AUTH</option>
                    <option value="LICENSING">LICENSING</option>
                    <option value="QBO">QBO</option>
                    <option value="INTAKE">INTAKE</option>
                    <option value="TELEMETRY">TELEMETRY</option>
                  </select>
                </div>

                <div>
                  <label className="block text-stone-400 mb-1 font-medium">Severity</label>
                  <select
                    value={newSeverity}
                    onChange={(e: any) => setNewSeverity(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-800 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-500"
                  >
                    <option value="INFO">INFO</option>
                    <option value="WARNING">WARNING</option>
                    <option value="SECURITY">SECURITY</option>
                    <option value="CRITICAL">CRITICAL</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-stone-400 mb-1 font-medium">Operator / Actor</label>
                <input
                  type="text"
                  value={newActor}
                  onChange={(e) => setNewActor(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-500"
                  placeholder="Administrator Name or ID"
                  required
                />
              </div>

              <div>
                <label className="block text-stone-400 mb-1 font-medium">Operational Details &amp; Notes</label>
                <textarea
                  value={newDetails}
                  onChange={(e) => setNewDetails(e.target.value)}
                  rows={4}
                  className="w-full bg-stone-950 border border-stone-800 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-500 resize-none"
                  placeholder="Describe the operational change, manual audit action, or compliance check..."
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-2 rounded-lg bg-stone-800 hover:bg-stone-750 text-stone-300 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold cursor-pointer"
                >
                  Save Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
