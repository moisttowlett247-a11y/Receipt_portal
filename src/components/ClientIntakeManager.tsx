import React, { useState } from 'react';
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
  Copy
} from 'lucide-react';
import JSZip from 'jszip';
import { 
  getClientSubmissions, 
  updateSubmissionStatus, 
  deleteSubmission, 
  ClientSubmission 
} from '../clientSubmissionService';
import { DesktopPackageCard } from './DesktopPackageCard';

interface ClientIntakeManagerProps {
  onOpenBundleModal: () => void;
  onToast?: (msg: string) => void;
}

export const ClientIntakeManager: React.FC<ClientIntakeManagerProps> = ({
  onOpenBundleModal,
  onToast,
}) => {
  const [submissions, setSubmissions] = useState<ClientSubmission[]>(() => getClientSubmissions());
  const [filterClient, setFilterClient] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [copiedVmCmd, setCopiedVmCmd] = useState(false);

  const refreshList = () => {
    setSubmissions(getClientSubmissions());
  };

  const clients = Array.from(new Set(submissions.map(s => s.clientName)));

  const filteredSubmissions = submissions.filter(s => {
    if (filterClient !== 'ALL' && s.clientName !== filterClient) return false;
    if (filterStatus !== 'ALL' && s.status !== filterStatus) return false;
    return true;
  });

  const queuedCount = submissions.filter(s => s.status === 'QUEUED').length;
  const syncedCount = submissions.filter(s => s.status === 'SYNCED_QBO').length;
  const totalAmount = submissions.reduce((acc, s) => acc + (s.extractedAmount || 0), 0);

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
          // Placeholder receipt text if image data isn't in memory
          const textContent = `RECEIPT INTAKE FILE\nClient: ${sub.clientName}\nFile: ${sub.fileName}\nUploaded: ${sub.uploadedAt}\nMemo: ${sub.memo || 'None'}\n`;
          clientFolder?.file(safeFileName, textContent);
        }
      }

      // Add readme and routing manifest
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
              Your clients never have to run local scripts, install Python, or configure batch files. They simply submit receipts via their 
              clean web portal or email them directly. You run the processing engine locally on your workstation or scale across multiple 
              Virtual Machines (VMs) that automatically reconcile transactions into each client's QuickBooks Online company.
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
              Your workstation or VM worker nodes read receipts from <code className="text-amber-300 font-mono">inbox/Client/</code> in parallel.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-stone-950 border border-stone-800/80 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-stone-200">
              <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center text-[10px]">3</span>
              <span>Direct QuickBooks Sync</span>
            </div>
            <p className="text-[11px] text-stone-400">
              Expenses are posted directly to each client's specific QuickBooks company using their isolated tokens.
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

        <p className="text-[11px] text-stone-400 leading-relaxed">
          <strong>Multi-VM Coordination:</strong> Multiple VM instances pointing at the same shared network directory (SMB, NFS, Dropbox, OneDrive, Google Drive) automatically coordinate using distributed atomic lockfiles (<code className="text-amber-400 font-mono">.lock.&lt;worker_id&gt;</code>) so they divide and conquer files simultaneously without duplicate processing.
        </p>
      </div>

      {/* Client Intake Submissions Table */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Inbox className="w-4 h-4 text-amber-400" />
              <span>Client Portal Submissions Intake Queue</span>
            </h3>
            <p className="text-xs text-stone-400">
              Receipts and invoices submitted by clients online ready for processing
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleExportInboxZip}
              disabled={isExportingZip || submissions.length === 0}
              className="px-3.5 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 text-stone-950 font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-2"
              title="Download all client receipts arranged into inbox/<ClientName>/ subfolders"
            >
              <FolderArchive className="w-4 h-4" />
              <span>{isExportingZip ? 'Packaging...' : 'Export to Local Inbox (.ZIP)'}</span>
            </button>

            <button
              onClick={refreshList}
              className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white rounded-xl border border-stone-700 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Filter controls */}
        <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-stone-900 border border-stone-800 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-stone-400 font-medium">Filter Client:</span>
            <select
              value={filterClient}
              onChange={(e) => setFilterClient(e.target.value)}
              className="px-2.5 py-1 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-200"
            >
              <option value="ALL">All Clients ({clients.length})</option>
              {clients.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-stone-400 font-medium">Status:</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-2.5 py-1 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-200"
            >
              <option value="ALL">All Statuses</option>
              <option value="QUEUED">Queued for Intake</option>
              <option value="PROCESSING">Processing</option>
              <option value="SYNCED_QBO">Synced to QuickBooks</option>
            </select>
          </div>

          <div className="ml-auto text-stone-500 font-mono text-[11px]">
            {filteredSubmissions.length} of {submissions.length} items
          </div>
        </div>

        {/* Table */}
        <div className="rounded-2xl bg-stone-900 border border-stone-800 overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-950 text-stone-400 text-[10px] uppercase font-mono border-b border-stone-800">
                <tr>
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
                    <td colSpan={7} className="py-8 text-center text-stone-500">
                      No client submissions found matching your filters.
                    </td>
                  </tr>
                ) : (
                  filteredSubmissions.map((sub) => (
                    <tr key={sub.id} className="hover:bg-stone-800/40 transition-colors">
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

                      <td className="py-3 px-4">
                        <div className="font-medium text-stone-200">{sub.clientName}</div>
                        <div className="text-[10px] text-stone-400">{sub.clientEmail}</div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="px-1.5 py-0.5 rounded bg-stone-800 text-amber-300 font-mono text-[10px]">
                          {sub.categoryHint || 'Auto-Detect'}
                        </span>
                        {sub.memo && (
                          <p className="text-[10px] text-stone-400 italic truncate max-w-xs pt-0.5">
                            "{sub.memo}"
                          </p>
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-emerald-400">
                        {sub.extractedAmount ? `$${sub.extractedAmount.toFixed(2)}` : 'Pending'}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        {sub.status === 'SYNCED_QBO' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3" />
                            Synced to QBO
                          </span>
                        ) : sub.status === 'PROCESSING' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/30">
                            <Clock className="w-3 h-3 animate-spin" />
                            Processing ({sub.workerNodeId || 'Worker'})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-sky-500/10 text-sky-400 border border-sky-500/30">
                            <Clock className="w-3 h-3" />
                            Queued
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-stone-400 text-[11px] font-mono whitespace-nowrap">
                        {new Date(sub.uploadedAt).toLocaleString()}
                      </td>

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
                            onClick={() => handleDelete(sub.id)}
                            className="p-1 text-stone-500 hover:text-rose-400 transition-colors cursor-pointer"
                            title="Delete receipt record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
