import React, { useState, useEffect, useMemo } from 'react';
import {
  Inbox,
  Server,
  Download,
  CheckCircle2,
  Clock,
  Building2,
  FileText,
  Trash2,
  ExternalLink,
  Cpu,
  Layers,
  Sparkles,
  Terminal,
  FolderArchive,
  RefreshCw,
  Mail,
  ArrowRight,
  ShieldCheck,
  Check,
  Copy,
  Sliders,
  AlertTriangle,
  Search,
  Filter,
  CheckSquare,
  Square,
  Edit2,
  X,
  UploadCloud,
  FileSpreadsheet
} from 'lucide-react';
import JSZip from 'jszip';
import { 
  getClientSubmissions, 
  updateSubmissionStatus, 
  deleteSubmission, 
  ClientSubmission,
  purgeDuplicateSubmissions,
  subscribeToClientSubmissions
} from '../clientSubmissionService';
import { DesktopPackageCard } from './DesktopPackageCard';
import { AdminRoutingAndTaxRulesModal } from './AdminRoutingAndTaxRulesModal';

interface ClientIntakeManagerProps {
  onOpenBundleModal: () => void;
  onToast?: (msg: string) => void;
  onOpenScanner?: () => void;
}

export const ClientIntakeManager: React.FC<ClientIntakeManagerProps> = ({
  onOpenBundleModal,
  onToast,
  onOpenScanner,
}) => {
  const [submissions, setSubmissions] = useState<ClientSubmission[]>(() => getClientSubmissions());
  const [filterClient, setFilterClient] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [copiedVmCmd, setCopiedVmCmd] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);

  // Multi-selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Edit Submission Modal
  const [editingSubmission, setEditingSubmission] = useState<ClientSubmission | null>(null);
  const [editCategory, setEditCategory] = useState<string>('');
  const [editMemo, setEditMemo] = useState<string>('');
  const [editAmount, setEditAmount] = useState<string>('');

  useEffect(() => {
    const unsubscribe = subscribeToClientSubmissions((updated) => {
      setSubmissions(updated);
    });
    return () => unsubscribe();
  }, []);

  const refreshList = () => {
    setSubmissions(getClientSubmissions());
    setSelectedIds(new Set());
  };

  const clients = Array.from(new Set(submissions.map(s => s.clientName)));

  // Filtered list based on client, status, and search query
  const filteredSubmissions = useMemo(() => {
    return submissions.filter(s => {
      if (filterClient !== 'ALL' && s.clientName !== filterClient) return false;
      if (filterStatus !== 'ALL' && s.status !== filterStatus) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesClient = s.clientName.toLowerCase().includes(q);
        const matchesEmail = s.clientEmail.toLowerCase().includes(q);
        const matchesFile = s.fileName.toLowerCase().includes(q);
        const matchesMemo = (s.memo || '').toLowerCase().includes(q);
        const matchesCategory = (s.categoryHint || '').toLowerCase().includes(q);
        const matchesAmount = (s.extractedAmount !== undefined && String(s.extractedAmount).includes(q));
        return matchesClient || matchesEmail || matchesFile || matchesMemo || matchesCategory || matchesAmount;
      }
      return true;
    });
  }, [submissions, filterClient, filterStatus, searchQuery]);

  const queuedCount = submissions.filter(s => s.status === 'QUEUED').length;
  const syncedCount = submissions.filter(s => s.status === 'SYNCED_QBO').length;
  const totalAmount = submissions.reduce((acc, s) => acc + (s.extractedAmount || 0), 0);

  // Checkbox helpers
  const isAllSelected = filteredSubmissions.length > 0 && filteredSubmissions.every(s => selectedIds.has(s.id));
  const isSomeSelected = selectedIds.size > 0 && !isAllSelected;

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredSubmissions.map(s => s.id)));
    }
  };

  const handleToggleSelectOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Bulk actions
  const handleBulkStatus = (status: ClientSubmission['status']) => {
    if (selectedIds.size === 0) return;
    for (const id of selectedIds) {
      updateSubmissionStatus(id, status);
    }
    refreshList();
    if (onToast) onToast(`Updated ${selectedIds.size} submission(s) to: ${status}`);
    setSelectedIds(new Set());
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    if (typeof window !== 'undefined' && !window.confirm(`Are you sure you want to delete ${selectedIds.size} selected submission(s)?`)) {
      return;
    }
    for (const id of selectedIds) {
      deleteSubmission(id);
    }
    refreshList();
    if (onToast) onToast(`Deleted ${selectedIds.size} submission(s).`);
    setSelectedIds(new Set());
  };

  const handleExportSelectedCsv = () => {
    const itemsToExport = selectedIds.size > 0
      ? submissions.filter(s => selectedIds.has(s.id))
      : filteredSubmissions;

    if (itemsToExport.length === 0) {
      if (onToast) onToast('No submissions selected to export.');
      return;
    }

    const headers = ['ID', 'Client Name', 'Client Email', 'File Name', 'Category Hint', 'Extracted Amount', 'Memo', 'Status', 'Submitted At'];
    const escapeCsv = (val: any) => {
      if (val === undefined || val === null) return '""';
      let str = String(val).trim();
      if (/^[=+@\-\t\r]/.test(str)) {
        str = `'${str}`;
      }
      return `"${str.replace(/"/g, '""')}"`;
    };
    const rows = itemsToExport.map(s => [
      escapeCsv(s.id),
      escapeCsv(s.clientName),
      escapeCsv(s.clientEmail),
      escapeCsv(s.fileName),
      escapeCsv(s.categoryHint || 'Auto-Detect'),
      escapeCsv(s.extractedAmount !== undefined ? s.extractedAmount.toFixed(2) : ''),
      escapeCsv(s.memo || ''),
      escapeCsv(s.status),
      escapeCsv(s.uploadedAt)
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Client_Intake_Export_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (onToast) onToast(`Exported ${itemsToExport.length} submission(s) to CSV!`);
  };

  // Reconcile all queued receipts to QuickBooks
  const handleReconcileAllQueued = () => {
    const queuedItems = submissions.filter(s => s.status === 'QUEUED');
    if (queuedItems.length === 0) {
      if (onToast) onToast('All submissions are already marked as synced!');
      return;
    }
    for (const sub of queuedItems) {
      updateSubmissionStatus(sub.id, 'SYNCED_QBO');
    }
    refreshList();
    if (onToast) onToast(`Reconciled and synced ${queuedItems.length} submission(s) to QuickBooks Online!`);
  };

  // 1-Click Export of all submissions into a structured inbox zip
  const handleExportInboxZip = async () => {
    setIsExportingZip(true);
    try {
      const zip = new JSZip();
      const inboxFolder = zip.folder('inbox');
      
      for (const sub of submissions) {
        const safeClient = sub.clientName.replace(/[/\\?%*:|"<>]/g, '_').trim() || 'General';
        const safeFileName = (sub.fileName || 'receipt.jpg').replace(/[/\\?%*:|"<>]/g, '_').trim();
        const clientFolder = inboxFolder?.folder(safeClient);
        
        if (sub.dataUrl && sub.dataUrl.includes(',')) {
          const base64Data = sub.dataUrl.split(',')[1];
          clientFolder?.file(safeFileName, base64Data, { base64: true });
        } else {
          const textContent = `RECEIPT INTAKE FILE\nClient: ${sub.clientName}\nFile: ${sub.fileName}\nUploaded: ${sub.uploadedAt}\nMemo: ${sub.memo || 'None'}\n`;
          clientFolder?.file(safeFileName, textContent);
        }
      }

      inboxFolder?.file('manifest.json', JSON.stringify(submissions, null, 2));

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Multi_Client_Inbox_Batch_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (onToast) onToast('Exported submissions into organized client inbox folders (.zip)!');
    } catch (err) {
      console.error(err);
      if (onToast) onToast('Export notice: ' + String(err));
    } finally {
      setIsExportingZip(false);
    }
  };

  const handleUpdateStatus = (id: string, status: ClientSubmission['status']) => {
    updateSubmissionStatus(id, status);
    refreshList();
    if (onToast) onToast(`Submission status updated to: ${status}`);
  };

  const handleDelete = (id: string) => {
    deleteSubmission(id);
    refreshList();
    if (onToast) onToast('Removed submission record.');
  };

  const handlePurgeDuplicates = () => {
    const purged = purgeDuplicateSubmissions();
    refreshList();
    if (onToast) {
      if (purged > 0) {
        onToast(`Cleaned and purged ${purged} duplicate submission(s) from client intake!`);
      } else {
        onToast('No duplicate submissions detected in client intake.');
      }
    }
  };

  // Edit single submission handler
  const handleOpenEdit = (sub: ClientSubmission) => {
    setEditingSubmission(sub);
    setEditCategory(sub.categoryHint || '');
    setEditMemo(sub.memo || '');
    setEditAmount(sub.extractedAmount !== undefined ? String(sub.extractedAmount) : '');
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSubmission) return;

    try {
      const parsedAmount = editAmount.trim() ? parseFloat(editAmount.replace(/[^0-9.]/g, '')) : undefined;
      const allSubs = getClientSubmissions();
      const updatedList = allSubs.map(s => {
        if (s.id === editingSubmission.id) {
          return {
            ...s,
            categoryHint: editCategory.trim() || undefined,
            memo: editMemo.trim() || undefined,
            extractedAmount: !isNaN(parsedAmount as number) ? parsedAmount : s.extractedAmount
          };
        }
        return s;
      });

      localStorage.setItem('client_receipt_submissions_v1', JSON.stringify(updatedList));
      setSubmissions(updatedList);
      setEditingSubmission(null);
      if (onToast) onToast(`Saved updates for receipt ${editingSubmission.fileName}!`);
    } catch (err: any) {
      if (onToast) onToast(`Failed to update receipt: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Central Architecture Explainer Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-stone-900 via-stone-900 to-amber-950/20 border border-stone-800 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                <Server className="w-3 h-3" />
                CENTRAL BOOKKEEPING & MULTI-VM ARCHITECTURE
              </span>
              <span className="text-xs text-stone-500">•</span>
              <span className="text-xs text-stone-400">Zero Technical Burden on Clients</span>
            </div>
            <h2 className="text-lg font-bold text-white">
              Central Processing Hub & Virtual Machine Cluster
            </h2>
            <p className="text-xs text-stone-300 max-w-3xl leading-relaxed">
              Your clients submit receipts directly from their browser or email them to <code className="text-amber-300">receiptcheckerv@gmail.com</code>. 
              Review the queue below, batch push transactions directly to QuickBooks Online, or launch headless VM cluster nodes.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="px-4 py-2.5 rounded-xl bg-stone-950/80 border border-stone-800 text-center">
              <div className="text-[10px] text-stone-400 uppercase tracking-wider font-semibold">Intake Queue</div>
              <div className="text-base font-bold font-mono text-amber-400">{queuedCount} Pending</div>
            </div>
            <div className="px-4 py-2.5 rounded-xl bg-stone-950/80 border border-stone-800 text-center">
              <div className="text-[10px] text-stone-400 uppercase tracking-wider font-semibold">QBO Reconciled</div>
              <div className="text-base font-bold font-mono text-emerald-400">{syncedCount} Done</div>
            </div>
            <div className="px-4 py-2.5 rounded-xl bg-stone-950/80 border border-stone-800 text-center">
              <div className="text-[10px] text-stone-400 uppercase tracking-wider font-semibold">Total Intake</div>
              <div className="text-base font-bold font-mono text-stone-200">${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
          </div>
        </div>

        {/* 3-Step Flow Diagram */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 text-xs">
          <div className="p-3 rounded-xl bg-stone-950 border border-stone-800/80 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-stone-200">
              <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center text-[10px]">1</span>
              <span>Client Submits</span>
            </div>
            <p className="text-[11px] text-stone-400">
              Client drops receipts on the web portal or emails directly to <strong className="text-amber-300">receiptcheckerv@gmail.com</strong>.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-stone-950 border border-stone-800/80 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-stone-200">
              <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center text-[10px]">2</span>
              <span>Central VM Engine Processes</span>
            </div>
            <p className="text-[11px] text-stone-400">
              Workstation or VM nodes divide <code className="text-amber-300 font-mono">inbox/Client/</code> using atomic lockfiles.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-stone-950 border border-stone-800/80 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-stone-200">
              <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center text-[10px]">3</span>
              <span>Direct QuickBooks Sync</span>
            </div>
            <p className="text-[11px] text-stone-400">
              Expenses are posted directly to each client's specific QuickBooks company using isolated OAuth tokens.
            </p>
          </div>
        </div>
      </div>

      {/* Package Card */}
      <DesktopPackageCard onOpenModal={onOpenBundleModal} onToast={onToast} />

      {/* Multi-VM Cluster Setup Quick Reference Card */}
      <div className="p-5 rounded-2xl bg-stone-900 border border-stone-800 space-y-3 text-xs shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-bold text-stone-100">
            <Cpu className="w-4 h-4 text-emerald-400" />
            <span>Launch Multi-VM Cluster Workers</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Distributed Atomic Locking
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText('python receipt_processor.py --headless --worker-id vm-node-1 --folder /shared/inbox');
              setCopiedVmCmd(true);
              setTimeout(() => setCopiedVmCmd(false), 2000);
            }}
            className="px-3 py-1 bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white rounded-lg border border-stone-700 font-mono text-[11px] transition-colors cursor-pointer flex items-center gap-1.5 self-start sm:self-auto"
          >
            {copiedVmCmd ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedVmCmd ? 'Command Copied' : 'Copy Headless VM Command'}</span>
          </button>
        </div>

        <div className="p-3 bg-stone-950 rounded-xl font-mono text-[11px] text-stone-300 border border-stone-800/80 space-y-1">
          <div className="text-stone-500"># Run on Linux / Cloud VMs (AWS, Proxmox, Azure, DigitalOcean):</div>
          <div className="text-emerald-400">./run_vm_worker.sh vm-worker-01 /shared/inbox 6</div>
          <div className="text-stone-500 pt-1"># Or run directly with Python:</div>
          <div className="text-amber-300">python receipt_processor.py --headless --worker-id vm-worker-01 --folder /shared/inbox</div>
        </div>
      </div>

      {/* Client Intake Submissions Table & Management Controls */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Inbox className="w-4 h-4 text-amber-400" />
              <span>Client Portal Submissions Intake Queue</span>
            </h3>
            <p className="text-xs text-stone-400">
              Incoming receipt and invoice files ready for automated deduction classification and QuickBooks posting
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Direct Reconcile All Queued to QBO */}
            <button
              type="button"
              onClick={handleReconcileAllQueued}
              disabled={queuedCount === 0}
              className="px-3.5 py-1.5 bg-[#2CA01C] hover:bg-[#238016] disabled:opacity-40 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
              title="Post all currently queued receipts into QuickBooks Online"
            >
              <Building2 className="w-3.5 h-3.5 text-white" />
              <span>Sync All Queued to QBO ({queuedCount})</span>
            </button>

            {onOpenScanner && (
              <button
                type="button"
                onClick={onOpenScanner}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                title="Launch the parallel worker scanning engine directly in the browser"
              >
                <Cpu className="w-3.5 h-3.5 text-emerald-200 animate-pulse" />
                <span>Launch Scanner Engine</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowRulesModal(true)}
              className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
              title="Configure email routing rules and custom CPA tax line overrides"
            >
              <Sliders className="w-3.5 h-3.5 text-amber-400" />
              <span>Routing Rules</span>
            </button>

            <button
              type="button"
              onClick={handlePurgeDuplicates}
              className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
              title="Purge duplicate receipt submissions from client records"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>Purge Duplicates</span>
            </button>

            <button
              onClick={handleExportInboxZip}
              disabled={isExportingZip || submissions.length === 0}
              className="px-3.5 py-1.5 bg-stone-800 hover:bg-stone-700 border border-stone-700 disabled:opacity-50 text-stone-200 font-semibold text-xs rounded-xl shadow-sm transition-all cursor-pointer flex items-center gap-2"
              title="Download all client receipts arranged into inbox/<ClientName>/ subfolders"
            >
              <FolderArchive className="w-4 h-4 text-amber-400" />
              <span>{isExportingZip ? 'Packaging...' : 'Export ZIP'}</span>
            </button>

            <button
              onClick={handleExportSelectedCsv}
              className="px-3.5 py-1.5 bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-200 font-semibold text-xs rounded-xl shadow-sm transition-all cursor-pointer flex items-center gap-2"
              title="Download spreadsheet report of submissions"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>Export CSV</span>
            </button>

            <button
              onClick={refreshList}
              className="p-2 bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white rounded-xl border border-stone-700 text-xs font-medium transition-colors cursor-pointer"
              title="Refresh queue"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Filter & Live Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl bg-stone-900 border border-stone-800 text-xs">
          <div className="flex flex-wrap items-center gap-2 flex-1">
            {/* Live Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search vendor, client, memo, filename, or amount..."
                className="w-full text-xs font-mono pl-8 pr-7 py-1.5 bg-stone-950 border border-stone-800 rounded-lg text-stone-200 placeholder-stone-600 focus:outline-none focus:border-amber-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300 text-xs p-0.5 cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Filter Client */}
            <div className="flex items-center gap-1.5 bg-stone-950 border border-stone-800 rounded-lg px-2 py-1">
              <span className="text-stone-500 text-[11px]">Client:</span>
              <select
                value={filterClient}
                onChange={(e) => setFilterClient(e.target.value)}
                className="bg-transparent text-xs text-stone-200 focus:outline-none cursor-pointer"
              >
                <option value="ALL" className="bg-stone-900">All Clients ({clients.length})</option>
                {clients.map(c => (
                  <option key={c} value={c} className="bg-stone-900">{c}</option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1.5 bg-stone-950 border border-stone-800 rounded-lg px-2 py-1">
              <span className="text-stone-500 text-[11px]">Status:</span>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="bg-transparent text-xs text-stone-200 focus:outline-none cursor-pointer"
              >
                <option value="ALL" className="bg-stone-900">All Statuses</option>
                <option value="QUEUED" className="bg-stone-900">Queued for Intake</option>
                <option value="PROCESSING" className="bg-stone-900">Processing</option>
                <option value="SYNCED_QBO" className="bg-stone-900">Synced to QuickBooks</option>
              </select>
            </div>
          </div>

          <div className="text-stone-500 font-mono text-[11px] self-end sm:self-center">
            {filteredSubmissions.length} of {submissions.length} receipts
          </div>
        </div>

        {/* Floating Bulk Action Bar when items selected */}
        {selectedIds.size > 0 && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/40 rounded-xl flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-150">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
              <CheckSquare className="w-4 h-4 text-amber-400" />
              <span>{selectedIds.size} submission(s) selected</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleBulkStatus('SYNCED_QBO')}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-sm flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Mark Synced ({selectedIds.size})</span>
              </button>

              <button
                type="button"
                onClick={() => handleBulkStatus('QUEUED')}
                className="px-3 py-1 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer border border-stone-700 flex items-center gap-1.5"
              >
                <Clock className="w-3.5 h-3.5 text-sky-400" />
                <span>Re-queue ({selectedIds.size})</span>
              </button>

              <button
                type="button"
                onClick={handleExportSelectedCsv}
                className="px-3 py-1 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer border border-stone-700 flex items-center gap-1.5"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                <span>Export Selected CSV</span>
              </button>

              <button
                type="button"
                onClick={handleBulkDelete}
                className="px-3 py-1 bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span>Delete Selected</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="p-1 text-stone-400 hover:text-stone-200 text-xs cursor-pointer ml-1"
                title="Deselect all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Submissions Table */}
        <div className="rounded-2xl bg-stone-900 border border-stone-800 overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-950 text-stone-400 text-[10px] uppercase font-mono border-b border-stone-800">
                <tr>
                  <th className="py-3 px-3 w-8 text-center">
                    <button
                      type="button"
                      onClick={handleToggleSelectAll}
                      className="cursor-pointer text-stone-400 hover:text-stone-200"
                      title={isAllSelected ? 'Deselect All' : 'Select All'}
                    >
                      {isAllSelected ? (
                        <CheckSquare className="w-4 h-4 text-amber-400" />
                      ) : (
                        <Square className="w-4 h-4 text-stone-600" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-4">Receipt File</th>
                  <th className="py-3 px-4">Client Entity</th>
                  <th className="py-3 px-4">Category Hint / Memo</th>
                  <th className="py-3 px-4">Extracted Total</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Submitted</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-800 text-stone-300">
                {filteredSubmissions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-stone-500">
                      No client submissions found matching your filters.
                    </td>
                  </tr>
                ) : (
                  filteredSubmissions.map((sub) => {
                    const isSelected = selectedIds.has(sub.id);
                    return (
                      <tr 
                        key={sub.id} 
                        className={`hover:bg-stone-800/40 transition-colors ${isSelected ? 'bg-amber-500/5' : ''}`}
                      >
                        {/* Row Selection Checkbox */}
                        <td className="py-3 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleSelectOne(sub.id)}
                            className="cursor-pointer text-stone-400 hover:text-stone-200"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-amber-400" />
                            ) : (
                              <Square className="w-4 h-4 text-stone-600" />
                            )}
                          </button>
                        </td>

                        {/* File Thumbnail & Name */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            {sub.dataUrl ? (
                              <img
                                src={sub.dataUrl}
                                alt="Thumbnail"
                                className="w-8 h-8 rounded-lg object-cover border border-stone-700 shrink-0"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-stone-800 border border-stone-700 flex items-center justify-center text-stone-400 shrink-0">
                                <FileText className="w-4 h-4" />
                              </div>
                            )}
                            <div className="min-w-0 max-w-xs">
                              <p className="font-semibold text-stone-200 truncate">{sub.fileName}</p>
                              <p className="text-[10px] text-stone-500 font-mono">{(sub.fileSize / 1024).toFixed(1)} KB</p>
                            </div>
                          </div>
                        </td>

                        {/* Client Entity */}
                        <td className="py-3 px-4">
                          <div className="font-medium text-stone-200">{sub.clientName}</div>
                          <div className="text-[10px] text-stone-400">{sub.clientEmail}</div>
                        </td>

                        {/* Category & Memo */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 rounded bg-stone-800 text-amber-300 font-mono text-[10px]">
                              {sub.categoryHint || 'Auto-Detect'}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(sub)}
                              className="text-stone-500 hover:text-stone-300 p-0.5 cursor-pointer"
                              title="Edit Category or Memo"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </div>
                          {sub.memo && (
                            <p className="text-[10px] text-stone-400 italic truncate max-w-xs pt-0.5">
                              "{sub.memo}"
                            </p>
                          )}
                        </td>

                        {/* Amount */}
                        <td className="py-3 px-4 font-mono font-bold text-emerald-400">
                          {sub.extractedAmount !== undefined ? `$${sub.extractedAmount.toFixed(2)}` : 'Pending'}
                        </td>

                        {/* Status */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          {sub.status === 'SYNCED_QBO' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                              <CheckCircle2 className="w-3 h-3" />
                              Synced to QBO
                            </span>
                          ) : sub.status === 'PROCESSING' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/30">
                              <Clock className="w-3 h-3 animate-spin" />
                              Processing
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-sky-500/10 text-sky-400 border border-sky-500/30">
                              <Clock className="w-3 h-3" />
                              Queued
                            </span>
                          )}
                        </td>

                        {/* Timestamp */}
                        <td className="py-3 px-4 text-stone-400 text-[11px] font-mono whitespace-nowrap">
                          {new Date(sub.uploadedAt).toLocaleString()}
                        </td>

                        {/* Row Actions */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {sub.status !== 'SYNCED_QBO' ? (
                              <button
                                type="button"
                                onClick={() => handleUpdateStatus(sub.id, 'SYNCED_QBO')}
                                className="px-2 py-1 bg-emerald-950 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 rounded text-[10px] font-medium transition-colors cursor-pointer"
                                title="Mark as Synced to QuickBooks"
                              >
                                Mark Synced
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleUpdateStatus(sub.id, 'QUEUED')}
                                className="px-2 py-1 bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-400 rounded text-[10px] font-medium transition-colors cursor-pointer"
                                title="Re-queue receipt"
                              >
                                Re-queue
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleOpenEdit(sub)}
                              className="p-1 text-stone-500 hover:text-stone-200 transition-colors cursor-pointer"
                              title="Edit receipt details"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDelete(sub.id)}
                              className="p-1 text-stone-500 hover:text-rose-400 transition-colors cursor-pointer"
                              title="Delete receipt record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Edit Submission Modal */}
      {editingSubmission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-stone-900 border border-stone-700 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <div className="flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Edit Receipt Classification</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingSubmission(null)}
                className="text-stone-400 hover:text-stone-200 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-stone-400 mb-1 font-medium">Receipt File</label>
                <p className="font-mono text-stone-200 bg-stone-950 p-2 rounded-lg border border-stone-800 truncate">
                  {editingSubmission.fileName}
                </p>
              </div>

              <div>
                <label className="block text-stone-400 mb-1 font-medium">Client Entity</label>
                <p className="text-stone-200 bg-stone-950 p-2 rounded-lg border border-stone-800">
                  {editingSubmission.clientName} ({editingSubmission.clientEmail})
                </p>
              </div>

              <div>
                <label className="block text-stone-400 mb-1 font-medium">Tax Deduction Category Hint</label>
                <input
                  type="text"
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  placeholder="e.g., Gas, Fuel, and Oil, Seed, Repairs & Maintenance"
                  className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2 text-stone-200 focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-stone-400 mb-1 font-medium">Extracted Amount ($)</label>
                <input
                  type="text"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  placeholder="e.g., 420.75"
                  className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2 text-stone-200 focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-stone-400 mb-1 font-medium">Memo / Notes</label>
                <textarea
                  value={editMemo}
                  onChange={(e) => setEditMemo(e.target.value)}
                  placeholder="Add notes for QuickBooks ledger reconciliation..."
                  rows={2}
                  className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2 text-stone-200 focus:outline-none focus:border-amber-500 font-sans"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-800">
                <button
                  type="button"
                  onClick={() => setEditingSubmission(null)}
                  className="px-3 py-1.5 text-xs text-stone-400 hover:text-stone-200 bg-stone-800 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold text-stone-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors cursor-pointer shadow-sm"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Email Routing & Tax Overrides Modal */}
      <AdminRoutingAndTaxRulesModal
        isOpen={showRulesModal}
        onClose={() => setShowRulesModal(false)}
        onToast={onToast}
      />
    </div>
  );
};
