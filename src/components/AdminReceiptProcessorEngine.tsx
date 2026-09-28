import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Cpu,
  Play,
  Pause,
  RotateCcw,
  Upload,
  Download,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  FileText,
  FolderArchive,
  Layers,
  Sparkles,
  Zap,
  Search,
  Filter,
  Trash2,
  Edit3,
  ExternalLink,
  ChevronDown,
  Building2,
  Clock,
  Check,
  X,
  Eye,
  Sliders,
  RefreshCw,
  Copy,
  Inbox,
  ShieldCheck,
  AlertCircle,
  User,
  Plus
} from 'lucide-react';
import {
  ProcessedReceipt,
  ParallelWorkerState,
  ReceiptInputItem,
  runParallelBatchScan,
  exportMultiSheetExcelXLSX,
  exportAuditLedgerCSV,
  exportQBOJsonBatch,
  exportAuditVaultZip,
  syncReceiptsToClientIntakeQueue,
  generateSampleFarmBatch,
  generateSampleCommercialBatch,
  generateUniqueHighVolumeBatch
} from '../adminReceiptScanningEngine';
import { getClientSubmissions, purgeDuplicateSubmissions } from '../clientSubmissionService';
import { getStoredClientAccounts } from '../clientAccountService';
import { IRS_SCHEDULE_F_LINES, IRS_SCHEDULE_C_LINES } from '../taxScheduleService';

interface AdminReceiptProcessorEngineProps {
  onToast?: (msg: string) => void;
  onNavigateToQBO?: () => void;
  onNavigateToIntake?: () => void;
}

const STORAGE_KEY = 'receipt_processor_admin_scanned_ledger_v1';

export const AdminReceiptProcessorEngine: React.FC<AdminReceiptProcessorEngineProps> = ({
  onToast,
  onNavigateToQBO,
  onNavigateToIntake
}) => {
  // Scanned receipts ledger
  const [receipts, setReceipts] = useState<ProcessedReceipt[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  // Save changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(receipts));
    } catch {}
  }, [receipts]);

  // Concurrency & Worker pool settings
  const [concurrency, setConcurrency] = useState<number>(4);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [workers, setWorkers] = useState<ParallelWorkerState[]>([]);
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [scanStartTime, setScanStartTime] = useState<number>(0);
  const [elapsedSec, setElapsedSec] = useState<number>(0);

  // File queue to process & Target Client / Submitter Profile
  const [queuedFiles, setQueuedFiles] = useState<ReceiptInputItem[]>([]);
  const [selectedClientTarget, setSelectedClientTarget] = useState<string>('Administrator (Internal Operations)');
  const [customClientInput, setCustomClientInput] = useState<string>('');
  const [isAddingCustomClient, setIsAddingCustomClient] = useState<boolean>(false);

  // Search & Filter controls
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterSchedule, setFilterSchedule] = useState<'ALL' | 'SCHEDULE_F' | 'SCHEDULE_C'>('ALL');
  const [filterDuplicate, setFilterDuplicate] = useState<'ALL' | 'DUPLICATES_ONLY' | 'UNIQUE_ONLY'>('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PROCESSED' | 'VERIFIED' | 'REJECTED'>('ALL');
  const [filterClient, setFilterClient] = useState<string>('ALL');

  // Selected item IDs for bulk operations
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modal inspection view
  const [inspectingReceipt, setInspectingReceipt] = useState<ProcessedReceipt | null>(null);
  const [isEditingReceipt, setIsEditingReceipt] = useState<boolean>(false);
  const [confirmClearLedger, setConfirmClearLedger] = useState<boolean>(false);
  const [showClientRoster, setShowClientRoster] = useState<boolean>(true);

  // Edit form state
  const [editFormData, setEditFormData] = useState<{
    vendor: string;
    clientName: string;
    submittedBy: string;
    date: string;
    total: number;
    tax: number;
    paymentMethod: string;
    cardLast4: string;
    schedule: 'SCHEDULE_F' | 'SCHEDULE_C';
    irsLineNumber: string;
    irsLineTitle: string;
    status: ProcessedReceipt['status'];
  }>({
    vendor: '',
    clientName: '',
    submittedBy: '',
    date: '',
    total: 0,
    tax: 0,
    paymentMethod: 'CASH',
    cardLast4: '',
    schedule: 'SCHEDULE_F',
    irsLineNumber: 'Line 27',
    irsLineTitle: 'Supplies purchased',
    status: 'PROCESSED'
  });

  // Timer for elapsed seconds during scanning
  useEffect(() => {
    let timer: any;
    if (isScanning) {
      timer = setInterval(() => {
        setElapsedSec(Math.round((Date.now() - scanStartTime) / 1000));
      }, 500);
    }
    return () => clearInterval(timer);
  }, [isScanning, scanStartTime]);

  // Derived Client lists - pulls real registered client accounts, admin identity, submissions, and scanned receipts
  const availableClients = useMemo(() => {
    const set = new Set<string>();
    set.add('Administrator (Internal Operations)');

    // Pull registered client accounts
    try {
      const stored = getStoredClientAccounts();
      if (Array.isArray(stored)) {
        stored.forEach(a => {
          const name = a.companyName?.trim() || a.displayName?.trim() || a.email?.trim();
          if (name) set.add(name);
        });
      }
    } catch {}

    // Pull client intake submissions
    try {
      const subs = getClientSubmissions();
      if (Array.isArray(subs)) {
        subs.forEach(s => {
          if (s.clientName?.trim()) set.add(s.clientName.trim());
        });
      }
    } catch {}

    // Pull any clients in the current receipt ledger
    for (const r of receipts) {
      if (r.clientName?.trim()) set.add(r.clientName.trim());
    }

    return Array.from(set);
  }, [receipts]);

  // Pending client intake submissions count
  const pendingIntakeCount = useMemo(() => {
    try {
      const subs = getClientSubmissions();
      return subs.filter(s => s.status === 'QUEUED').length;
    } catch {
      return 0;
    }
  }, []);

  // Filtered Receipts for table
  const filteredReceipts = useMemo(() => {
    return receipts.filter(r => {
      if (filterClient !== 'ALL' && r.clientName !== filterClient) return false;
      if (filterSchedule !== 'ALL' && r.schedule !== filterSchedule) return false;
      if (filterDuplicate === 'DUPLICATES_ONLY' && r.duplicateStatus === 'UNIQUE') return false;
      if (filterDuplicate === 'UNIQUE_ONLY' && r.duplicateStatus !== 'UNIQUE') return false;
      if (filterStatus !== 'ALL' && r.status !== filterStatus) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const vendorMatch = r.vendor.toLowerCase().includes(q);
        const memoMatch = (r.memo || '').toLowerCase().includes(q);
        const fileMatch = r.fileName.toLowerCase().includes(q);
        const catMatch = r.category.toLowerCase().includes(q);
        const lineMatch = `${r.irsLineNumber} ${r.irsLineTitle}`.toLowerCase().includes(q);
        const amtMatch = r.total.toFixed(2).includes(q);
        return vendorMatch || memoMatch || fileMatch || catMatch || lineMatch || amtMatch;
      }
      return true;
    });
  }, [receipts, filterClient, filterSchedule, filterDuplicate, filterStatus, searchQuery]);

  // Metrics (Strictly excludes all rejected duplicates from deduction totals)
  const metrics = useMemo(() => {
    const totalDeductions = receipts
      .filter(r => r.status !== 'REJECTED')
      .reduce((acc, r) => acc + r.total, 0);

    const scheduleFTotal = receipts
      .filter(r => r.schedule === 'SCHEDULE_F' && r.status !== 'REJECTED')
      .reduce((acc, r) => acc + r.total, 0);

    const scheduleCTotal = receipts
      .filter(r => r.schedule === 'SCHEDULE_C' && r.status !== 'REJECTED')
      .reduce((acc, r) => acc + r.total, 0);

    const duplicateCount = receipts.filter(r => r.duplicateStatus !== 'UNIQUE' || r.status === 'REJECTED').length;
    const verifiedCount = receipts.filter(r => r.status === 'VERIFIED').length;

    return {
      totalReceipts: receipts.length,
      totalDeductions,
      scheduleFTotal,
      scheduleCTotal,
      duplicateCount,
      verifiedCount
    };
  }, [receipts]);

  // Detailed per-client tracking: volume of uploaded, pending, and processed receipts
  const clientBreakdown = useMemo(() => {
    let subs: any[] = [];
    try {
      subs = getClientSubmissions();
    } catch {}

    const map: Record<string, {
      clientName: string;
      pendingIntake: number;
      scannedCount: number;
      verifiedCount: number;
      totalDeductions: number;
      duplicateCount: number;
    }> = {};

    availableClients.forEach(c => {
      map[c] = {
        clientName: c,
        pendingIntake: 0,
        scannedCount: 0,
        verifiedCount: 0,
        totalDeductions: 0,
        duplicateCount: 0
      };
    });

    subs.forEach(s => {
      const c = s.clientName || 'Unassigned';
      if (!map[c]) {
        map[c] = { clientName: c, pendingIntake: 0, scannedCount: 0, verifiedCount: 0, totalDeductions: 0, duplicateCount: 0 };
      }
      if (s.status === 'QUEUED') {
        map[c].pendingIntake++;
      }
    });

    receipts.forEach(r => {
      const c = r.clientName || 'Unassigned';
      if (!map[c]) {
        map[c] = { clientName: c, pendingIntake: 0, scannedCount: 0, verifiedCount: 0, totalDeductions: 0, duplicateCount: 0 };
      }
      map[c].scannedCount++;
      if (r.status === 'VERIFIED') map[c].verifiedCount++;
      if (r.duplicateStatus !== 'UNIQUE' || r.status === 'REJECTED') map[c].duplicateCount++;
      if (r.status !== 'REJECTED') {
        map[c].totalDeductions += r.total;
      }
    });

    return Object.values(map);
  }, [availableClients, receipts]);

  const handleOpenInspect = (r: ProcessedReceipt) => {
    setInspectingReceipt(r);
    setIsEditingReceipt(false);
    setEditFormData({
      vendor: r.vendor,
      clientName: r.clientName || 'Administrator (Internal Operations)',
      submittedBy: r.submittedBy || 'Administrator (moisttowlett247@gmail.com)',
      date: r.date,
      total: r.total,
      tax: r.tax,
      paymentMethod: r.paymentMethod || 'CASH',
      cardLast4: r.cardLast4 || '',
      schedule: r.schedule,
      irsLineNumber: r.irsLineNumber,
      irsLineTitle: r.irsLineTitle,
      status: r.status
    });
  };

  const handleSaveReceiptEdits = () => {
    if (!inspectingReceipt) return;
    const updated: ProcessedReceipt = {
      ...inspectingReceipt,
      vendor: editFormData.vendor.trim() || inspectingReceipt.vendor,
      clientName: editFormData.clientName.trim() || inspectingReceipt.clientName,
      submittedBy: editFormData.submittedBy.trim() || inspectingReceipt.submittedBy,
      date: editFormData.date || inspectingReceipt.date,
      total: Number(editFormData.total) || 0,
      tax: Number(editFormData.tax) || 0,
      paymentMethod: editFormData.paymentMethod.trim() || inspectingReceipt.paymentMethod,
      cardLast4: editFormData.cardLast4.trim() || undefined,
      schedule: editFormData.schedule,
      irsLineNumber: editFormData.irsLineNumber,
      irsLineTitle: editFormData.irsLineTitle,
      status: editFormData.status
    };
    setReceipts(prev => prev.map(item => item.id === updated.id ? updated : item));
    setInspectingReceipt(updated);
    setIsEditingReceipt(false);
    if (onToast) onToast(`Updated details for receipt (${updated.id.slice(0, 10)})`);
  };

  const handleScanSpecificClientQueue = (clientName: string) => {
    try {
      const subs = getClientSubmissions();
      const queued = subs.filter(s => s.status === 'QUEUED' && s.clientName === clientName);
      if (queued.length === 0) {
        if (onToast) onToast(`No pending queued receipts for ${clientName}.`);
        return;
      }

      const inputItems: ReceiptInputItem[] = queued.map(s => ({
        id: s.id,
        clientId: s.clientId,
        fileName: s.fileName,
        fileSize: s.fileSize,
        fileType: s.fileType,
        dataUrl: s.dataUrl,
        clientName: s.clientName,
        clientEmail: s.clientEmail,
        submittedBy: s.clientEmail ? `${s.clientName} (${s.clientEmail})` : s.clientName,
        submittedByRole: 'CLIENT' as const,
        uploadedAt: s.uploadedAt,
        memo: s.memo,
        categoryHint: s.categoryHint,
        vendorHint: s.extractedVendor,
        amountHint: s.extractedAmount,
        dateHint: s.extractedDate
      }));

      setSelectedClientTarget(clientName);
      setFilterClient(clientName);
      setQueuedFiles(prev => [...prev, ...inputItems]);
      if (onToast) onToast(`Queued ${queued.length} receipt(s) for ${clientName}. Ready to scan!`);
    } catch (err) {
      console.error(err);
    }
  };

  // -------------------------------------------------------------------------
  // INGESTION & BATCH DISPATCH
  // -------------------------------------------------------------------------

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files) as File[];
    const target = selectedClientTarget || 'Administrator (Internal Operations)';
    const isAdm = target.toLowerCase().includes('admin');
    const submitter = isAdm ? 'Administrator (moisttowlett247@gmail.com)' : target;
    const role = isAdm ? 'ADMIN' as const : 'CLIENT' as const;
    const now = new Date().toISOString();

    const newItems: ReceiptInputItem[] = files.map(f => ({
      file: f,
      fileName: f.name,
      fileSize: f.size,
      fileType: f.type,
      clientName: target,
      submittedBy: submitter,
      submittedByRole: role,
      uploadedAt: now
    }));
    setQueuedFiles(prev => [...prev, ...newItems]);
    if (onToast) onToast(`Added ${files.length} receipt file(s) assigned to ${target}`);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!e.dataTransfer.files) return;
    const files = Array.from(e.dataTransfer.files) as File[];
    const target = selectedClientTarget || 'Administrator (Internal Operations)';
    const isAdm = target.toLowerCase().includes('admin');
    const submitter = isAdm ? 'Administrator (moisttowlett247@gmail.com)' : target;
    const role = isAdm ? 'ADMIN' as const : 'CLIENT' as const;
    const now = new Date().toISOString();

    const newItems: ReceiptInputItem[] = files.map(f => ({
      file: f,
      fileName: f.name,
      fileSize: f.size,
      fileType: f.type,
      clientName: target,
      submittedBy: submitter,
      submittedByRole: role,
      uploadedAt: now
    }));
    setQueuedFiles(prev => [...prev, ...newItems]);
    if (onToast) onToast(`Queued ${files.length} dropped file(s) for ${target}`);
  };

  const handleLoadSampleFarmBatch = () => {
    const batch = generateSampleFarmBatch(true);
    setQueuedFiles(prev => [...prev, ...batch]);
    if (onToast) onToast(`Loaded 11 Farm & Agricultural test receipts (including duplicate test cases)`);
  };

  const handleLoadSampleCommercialBatch = () => {
    const batch = generateSampleCommercialBatch(true);
    setQueuedFiles(prev => [...prev, ...batch]);
    if (onToast) onToast(`Loaded 9 Commercial & Trade test receipts (including duplicate test cases)`);
  };

  const handleImportClientSubmissionsQueue = () => {
    try {
      const subs = getClientSubmissions();
      const queued = subs.filter(s => s.status === 'QUEUED');
      if (queued.length === 0) {
        if (onToast) onToast('No pending queued items in Client Intake.');
        return;
      }

      const inputItems: ReceiptInputItem[] = queued.map(s => ({
        id: s.id,
        clientId: s.clientId,
        fileName: s.fileName,
        fileSize: s.fileSize,
        fileType: s.fileType,
        dataUrl: s.dataUrl,
        clientName: s.clientName,
        clientEmail: s.clientEmail,
        submittedBy: s.clientEmail ? `${s.clientName} (${s.clientEmail})` : s.clientName,
        submittedByRole: 'CLIENT' as const,
        uploadedAt: s.uploadedAt,
        memo: s.memo,
        categoryHint: s.categoryHint,
        vendorHint: s.extractedVendor,
        amountHint: s.extractedAmount,
        dateHint: s.extractedDate
      }));

      setQueuedFiles(prev => [...prev, ...inputItems]);
      if (onToast) onToast(`Imported ${queued.length} queued receipt(s) from Client Intake!`);
    } catch (err) {
      console.error(err);
    }
  };

  // -------------------------------------------------------------------------
  // EXECUTE PARALLEL SCANNING
  // -------------------------------------------------------------------------

  const handleStartParallelScan = async () => {
    if (queuedFiles.length === 0) {
      if (onToast) onToast('Queue is empty. Select files or load a test batch to scan.');
      return;
    }

    setIsScanning(true);
    const startTime = Date.now();
    setScanStartTime(startTime);
    setElapsedSec(0);
    setScanProgress({ current: 0, total: queuedFiles.length });

    if (onToast) onToast(`🚀 Launching ${concurrency} parallel worker pipelines for ${queuedFiles.length} receipts...`);

    try {
      const scannedResults = await runParallelBatchScan(queuedFiles, {
        concurrency,
        defaultClientName: selectedClientTarget,
        existingLedger: receipts,
        onWorkerUpdate: updatedWorkers => {
          setWorkers(updatedWorkers);
        },
        onItemProcessed: (processed, current, total) => {
          setScanProgress({ current, total });
          setReceipts(prev => [processed, ...prev]);
        }
      });

      // Clear the queued files after successful batch
      setQueuedFiles([]);

      const totalSec = Math.max(0.1, (Date.now() - startTime) / 1000);
      const speed = (scannedResults.length / totalSec).toFixed(1);

      if (onToast) {
        onToast(`✅ Parallel batch finished! Processed ${scannedResults.length} receipts in ${totalSec.toFixed(1)}s (${speed} receipts/sec)`);
      }
    } catch (err: any) {
      console.error('Batch scanning failed:', err);
      if (onToast) onToast(`Error during parallel scan: ${err.message || String(err)}`);
    } finally {
      setIsScanning(false);
    }
  };

  // -------------------------------------------------------------------------
  // TABLE & SELECTION ACTIONS
  // -------------------------------------------------------------------------

  const handleToggleSelectAll = () => {
    if (selectedIds.size === filteredReceipts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredReceipts.map(r => r.id)));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkMarkVerified = () => {
    setReceipts(prev =>
      prev.map(r => (selectedIds.has(r.id) ? { ...r, status: 'VERIFIED' as const } : r))
    );
    setSelectedIds(new Set());
    if (onToast) onToast(`Marked ${selectedIds.size} receipt(s) as Verified.`);
  };

  const handleBulkDelete = () => {
    setReceipts(prev => prev.filter(r => !selectedIds.has(r.id)));
    setSelectedIds(new Set());
    if (onToast) onToast(`Deleted selected receipt records.`);
  };

  const handleClearAll = () => {
    if (!confirmClearLedger) {
      setConfirmClearLedger(true);
      return;
    }
    setReceipts([]);
    setSelectedIds(new Set());
    setConfirmClearLedger(false);
    if (onToast) onToast('Audit ledger cleared.');
  };

  const handlePurgeAllDuplicates = () => {
    const dupCount = receipts.filter(r => r.duplicateStatus !== 'UNIQUE' || r.status === 'REJECTED').length;
    if (dupCount === 0) {
      if (onToast) onToast('No duplicate receipts found in audit ledger.');
      return;
    }
    setReceipts(prev => prev.filter(r => r.duplicateStatus === 'UNIQUE' && r.status !== 'REJECTED'));
    setSelectedIds(new Set());

    // Also purge duplicate submissions that may have been pushed to client intake
    const clientPurged = purgeDuplicateSubmissions();
    if (onToast) onToast(`Purged ${dupCount} duplicate receipts from audit ledger (${clientPurged} duplicates cleaned from client roster records)!`);
  };

  const handleLoadDynamicUniqueBatch = (count: number = 100) => {
    const batch = generateUniqueHighVolumeBatch(count, selectedClientTarget);
    setQueuedFiles(prev => [...prev, ...batch]);
    if (onToast) onToast(`Loaded ${count} dynamically generated UNIQUE receipts for ${selectedClientTarget} (Guaranteed 0 duplicate collisions)`);
  };

  const handleToggleDuplicateStatus = (id: string) => {
    setReceipts(prev =>
      prev.map(r => {
        if (r.id === id) {
          const newStatus = r.status === 'REJECTED' ? 'PROCESSED' : 'REJECTED';
          return { ...r, status: newStatus };
        }
        return r;
      })
    );
  };

  // -------------------------------------------------------------------------
  // EXPORT HANDLERS
  // -------------------------------------------------------------------------

  const handleExportXLSX = async () => {
    if (receipts.length === 0) {
      if (onToast) onToast('No scanned receipts to export.');
      return;
    }
    try {
      await exportMultiSheetExcelXLSX(receipts, selectedClientTarget, '2026');
      if (onToast) onToast('Exported multi-sheet IRS Tax Schedules (.xlsx) workbook!');
    } catch (err) {
      console.error(err);
      if (onToast) onToast('Failed to export Excel workbook: ' + String(err));
    }
  };

  const handleExportCSV = () => {
    if (receipts.length === 0) {
      if (onToast) onToast('No receipts to export.');
      return;
    }
    exportAuditLedgerCSV(receipts, selectedClientTarget, '2026');
    if (onToast) onToast('Exported CPA Audit Ledger (.csv)!');
  };

  const handleExportQBO = () => {
    if (receipts.length === 0) {
      if (onToast) onToast('No receipts to export.');
      return;
    }
    exportQBOJsonBatch(receipts, selectedClientTarget);
    if (onToast) onToast('Exported QuickBooks Online API Journal Batch (.json)!');
  };

  const handleExportVaultZip = async () => {
    if (receipts.length === 0) {
      if (onToast) onToast('No receipts to export.');
      return;
    }
    try {
      await exportAuditVaultZip(receipts, selectedClientTarget, '2026');
      if (onToast) onToast('Downloaded complete Audit Vault package (.zip)!');
    } catch (err) {
      console.error(err);
      if (onToast) onToast('Failed to bundle ZIP: ' + String(err));
    }
  };

  const handleSyncToClientIntake = () => {
    if (receipts.length === 0) {
      if (onToast) onToast('No receipts to sync.');
      return;
    }
    // Only push valid, non-rejected transactions to avoid polluting client intake
    const valid = receipts.filter(r => r.status !== 'REJECTED');
    if (valid.length === 0) {
      if (onToast) onToast('All scanned receipts are flagged as duplicates. No new records to sync.');
      return;
    }
    syncReceiptsToClientIntakeQueue(valid);
    if (onToast) onToast(`Synced ${valid.length} valid non-duplicate transactions to Client Intake Hub!`);
    if (onNavigateToIntake) onNavigateToIntake();
  };

  return (
    <div className="space-y-6">
      {/* Central Hero Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-stone-900 via-stone-900 to-emerald-950/30 border border-stone-800 shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                INTEGRATED SCANNING ENGINE & MULTI-WORKER CLUSTER
              </span>
              <span className="text-xs text-stone-500">•</span>
              <span className="text-xs text-emerald-400 font-medium">Hardware Concurrency Accelerated</span>
            </div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              Integrated Receipt Processing & Parallel OCR Engine
            </h1>
            <p className="text-xs text-stone-300 max-w-3xl leading-relaxed">
              Run the full local scanning and receipt extraction script directly inside the admin portal. Configure 
              multiple parallel worker pipelines to process batches concurrently at blazing speeds. Features automatic 
              IRS Form 1040 Schedule C &amp; Schedule F classification, content-aware duplicate detection, and native 
              multi-sheet Excel (.xlsx) exports.
            </p>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0">
            <div className="px-3.5 py-2 rounded-xl bg-stone-950/80 border border-stone-800 text-center">
              <div className="text-[10px] text-stone-400 uppercase tracking-wider font-semibold">Total Scanned</div>
              <div className="text-base font-bold font-mono text-emerald-400">{metrics.totalReceipts}</div>
            </div>
            <div className="px-3.5 py-2 rounded-xl bg-stone-950/80 border border-stone-800 text-center">
              <div className="text-[10px] text-stone-400 uppercase tracking-wider font-semibold">Deductions Claimed</div>
              <div className="text-base font-bold font-mono text-emerald-300">${metrics.totalDeductions.toFixed(0)}</div>
            </div>
            <div className="px-3.5 py-2 rounded-xl bg-stone-950/80 border border-stone-800 text-center">
              <div className="text-[10px] text-stone-400 uppercase tracking-wider font-semibold">Schedule F (Farm)</div>
              <div className="text-base font-bold font-mono text-emerald-400">${metrics.scheduleFTotal.toFixed(0)}</div>
            </div>
            <div className="px-3.5 py-2 rounded-xl bg-stone-950/80 border border-stone-800 text-center">
              <div className="text-[10px] text-stone-400 uppercase tracking-wider font-semibold">Duplicates Caught</div>
              <div className="text-base font-bold font-mono text-amber-400">{metrics.duplicateCount}</div>
            </div>
          </div>
        </div>

        {/* Global Action Bar */}
        <div className="pt-2 border-t border-stone-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleImportClientSubmissionsQueue}
              className="px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Inbox className="w-3.5 h-3.5" />
              <span>Import Client Intake Queue</span>
              {pendingIntakeCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-stone-950 font-bold text-[10px]">
                  {pendingIntakeCount}
                </span>
              )}
            </button>

            <button
              onClick={handleLoadSampleFarmBatch}
              className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>Load Farm Batch (10)</span>
            </button>

            <button
              onClick={handleLoadSampleCommercialBatch}
              className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Building2 className="w-3.5 h-3.5 text-sky-400" />
              <span>Load Business Batch (8)</span>
            </button>

            <button
              onClick={() => handleLoadDynamicUniqueBatch(100)}
              className="px-3 py-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-200 border border-emerald-500/40 font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Generate 100 dynamic unique receipts with non-repeating invoices, vendors, and amounts (guaranteed 0 duplicates)"
            >
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              <span>+100 Unique</span>
            </button>

            <button
              onClick={() => handleLoadDynamicUniqueBatch(500)}
              className="px-3 py-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-200 border border-emerald-500/40 font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Generate 500 dynamic unique receipts with non-repeating invoices, vendors, and amounts (guaranteed 0 duplicates)"
            >
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              <span>+500 Unique</span>
            </button>

            <button
              onClick={() => handleLoadDynamicUniqueBatch(1000)}
              className="px-3 py-1.5 rounded-lg bg-teal-950/60 hover:bg-teal-900/80 text-teal-200 border border-teal-500/40 font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Generate 1,000 dynamic unique receipts with non-repeating invoices, vendors, and amounts (guaranteed 0 duplicates)"
            >
              <Zap className="w-3.5 h-3.5 text-teal-400" />
              <span>+1,000 Unique</span>
            </button>

            {receipts.length > 0 && (
              <button
                onClick={handleSyncToClientIntake}
                className="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Push to Client Hub &amp; QBO</span>
              </button>
            )}
          </div>

          {/* Export Suite Menu */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleExportXLSX}
              disabled={receipts.length === 0}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
              title="Download pure OpenXML multi-sheet workbook with formulas"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export Tax Schedules (.XLSX)</span>
            </button>

            <button
              onClick={handleExportCSV}
              disabled={receipts.length === 0}
              className="px-2.5 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 disabled:opacity-40 text-stone-200 border border-stone-700 font-medium flex items-center gap-1 transition-colors cursor-pointer"
              title="Export complete itemized ledger CSV"
            >
              <FileText className="w-3.5 h-3.5 text-stone-400" />
              <span>CSV</span>
            </button>

            <button
              onClick={handleExportQBO}
              disabled={receipts.length === 0}
              className="px-2.5 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 disabled:opacity-40 text-stone-200 border border-stone-700 font-medium flex items-center gap-1 transition-colors cursor-pointer"
              title="Export QuickBooks Online API Batch"
            >
              <Building2 className="w-3.5 h-3.5 text-amber-400" />
              <span>QBO JSON</span>
            </button>

            <button
              onClick={handleExportVaultZip}
              disabled={receipts.length === 0}
              className="px-2.5 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 disabled:opacity-40 text-stone-200 border border-stone-700 font-medium flex items-center gap-1 transition-colors cursor-pointer"
              title="Download Audit Vault ZIP"
            >
              <FolderArchive className="w-3.5 h-3.5 text-purple-400" />
              <span>Audit Vault (.ZIP)</span>
            </button>
          </div>
        </div>
      </div>

      {/* WORKER POOL CONCURRENCY & BATCH INGESTION CONTROLS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Ingestion & Control Hub */}
        <div className="lg:col-span-2 space-y-4">
          <div className="p-5 rounded-2xl bg-stone-900 border border-stone-800 shadow-lg space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                  Parallel Scanning Concurrency &amp; Ingestion
                </h2>
              </div>

              {/* Target Client Profile Selector */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-stone-400 font-medium flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Assign to Account / Client:</span>
                </span>
                
                {!isAddingCustomClient ? (
                  <div className="flex items-center gap-1.5">
                    <select
                      value={selectedClientTarget}
                      onChange={e => {
                        if (e.target.value === '__NEW_CUSTOM__') {
                          setIsAddingCustomClient(true);
                        } else {
                          setSelectedClientTarget(e.target.value);
                        }
                      }}
                      className="px-2.5 py-1 rounded-lg bg-stone-950 border border-stone-700 text-stone-200 text-xs focus:outline-none focus:border-emerald-500 font-medium"
                    >
                      {availableClients.map(c => (
                        <option key={c} value={c}>
                          {c.toLowerCase().includes('admin') ? `👑 ${c}` : `🏢 ${c}`}
                        </option>
                      ))}
                      <option value="__NEW_CUSTOM__">+ Add Custom Account / Company...</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => setIsAddingCustomClient(true)}
                      className="p-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white border border-stone-700 text-xs"
                      title="Add a new custom company or client entity"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 bg-stone-950 p-1 rounded-lg border border-emerald-500/50">
                    <input
                      type="text"
                      placeholder="Enter company / client name..."
                      value={customClientInput}
                      onChange={e => setCustomClientInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && customClientInput.trim()) {
                          setSelectedClientTarget(customClientInput.trim());
                          setIsAddingCustomClient(false);
                          setCustomClientInput('');
                        }
                      }}
                      autoFocus
                      className="px-2 py-0.5 rounded bg-stone-900 border border-stone-700 text-white text-xs w-48 focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (customClientInput.trim()) {
                          setSelectedClientTarget(customClientInput.trim());
                        }
                        setIsAddingCustomClient(false);
                        setCustomClientInput('');
                      }}
                      className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold"
                    >
                      Set
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingCustomClient(false);
                        setCustomClientInput('');
                      }}
                      className="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-400 text-[11px]"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Submitter & Attribution Status Pill */}
            <div className="px-3.5 py-1.5 rounded-lg bg-emerald-950/30 border border-emerald-500/30 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div className="flex items-center gap-2">
                <span className="text-stone-400">Target Entity:</span>
                <span className="font-bold text-emerald-300 flex items-center gap-1">
                  {selectedClientTarget.toLowerCase().includes('admin') ? '👑 ' : '🏢 '}
                  {selectedClientTarget}
                </span>
              </div>
              <div className="flex items-center gap-2 text-stone-400 font-mono">
                <span>Submitter Tag:</span>
                <span className="px-2 py-0.2 rounded bg-stone-900 border border-stone-800 text-stone-200">
                  {selectedClientTarget.toLowerCase().includes('admin')
                    ? 'Administrator (moisttowlett247@gmail.com)'
                    : `${selectedClientTarget} (Client Submission)`}
                </span>
              </div>
            </div>

            {/* Drag & Drop Upload Zone */}
            <div
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              className="p-6 rounded-xl border-2 border-dashed border-stone-700 hover:border-emerald-500/60 bg-stone-950/40 hover:bg-stone-950/80 transition-all text-center space-y-2"
            >
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
                <Upload className="w-5 h-5" />
              </div>
              <div className="text-xs font-semibold text-stone-200">
                Drag &amp; drop receipt images or PDFs here, or click to browse
              </div>
              <p className="text-[11px] text-stone-400 max-w-md mx-auto">
                Supports JPG, PNG, WEBP, and PDF receipts. Preprocessed with adaptive binarization,
                regex entity recognition, and tax rule classification.
              </p>
              <div className="pt-2">
                <label className="px-4 py-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 font-medium text-xs cursor-pointer inline-flex items-center gap-2 transition-colors">
                  <Upload className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Choose Receipt Files</span>
                  <input
                    type="file"
                    multiple
                    accept="image/*,application/pdf"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Parallel Concurrency Selector & Execution Bar */}
            <div className="p-4 rounded-xl bg-stone-950 border border-stone-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs font-bold text-stone-200 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>Parallel Worker Concurrency:</span>
                  <span className="font-mono text-emerald-400 font-extrabold text-sm">{concurrency} Worker Threads</span>
                </div>
                <div className="text-[11px] text-stone-400">
                  Runs multiple worker pipelines simultaneously to process large batches in parallel.
                </div>
                <div className="flex items-center gap-1.5 pt-1">
                  {[1, 2, 4, 8, 12].map(n => (
                    <button
                      key={n}
                      disabled={isScanning}
                      onClick={() => setConcurrency(n)}
                      className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors cursor-pointer ${
                        concurrency === n
                          ? 'bg-emerald-500 text-stone-950 font-bold'
                          : 'bg-stone-900 text-stone-400 hover:text-stone-200 border border-stone-800'
                      }`}
                    >
                      {n} {n === 1 ? 'Worker' : 'Workers'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Start Parallel Scan Action Button */}
              <div className="shrink-0 flex items-center gap-2">
                <button
                  onClick={handleStartParallelScan}
                  disabled={isScanning || queuedFiles.length === 0}
                  className={`px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all shadow-lg cursor-pointer ${
                    isScanning
                      ? 'bg-amber-600 text-white animate-pulse'
                      : queuedFiles.length === 0
                      ? 'bg-stone-800 text-stone-500 cursor-not-allowed border border-stone-700'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/50 hover:shadow-emerald-900/80'
                  }`}
                >
                  {isScanning ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Scanning Batch ({scanProgress.current}/{scanProgress.total})...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      <span>Start Parallel Scan ({queuedFiles.length} Queued)</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Live Progress Bar when Scanning */}
            {isScanning && (
              <div className="space-y-2 p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/30">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-emerald-300 font-bold flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                    Executing Concurrent Multi-Worker Pipeline...
                  </span>
                  <span className="text-stone-300">
                    {scanProgress.current} of {scanProgress.total} items completed ({elapsedSec}s elapsed)
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-stone-950 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300"
                    style={{
                      width: `${scanProgress.total ? (scanProgress.current / scanProgress.total) * 100 : 0}%`
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Col: Active Worker Lanes Card */}
        <div className="space-y-3">
          <div className="p-5 rounded-2xl bg-stone-900 border border-stone-800 shadow-lg space-y-3 h-full flex flex-col">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Active Worker Lanes ({concurrency})
                </h3>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                isScanning ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-stone-800 text-stone-400'
              }`}>
                {isScanning ? 'RUNNING PARALLEL' : 'STANDBY'}
              </span>
            </div>

            {/* Worker Lane Cards List */}
            <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[380px] pr-1">
              {Array.from({ length: concurrency }).map((_, idx) => {
                const w = workers[idx];
                const isBusy = w?.status === 'BUSY';
                const isDone = w?.status === 'COMPLETED';

                return (
                  <div
                    key={idx}
                    className={`p-3 rounded-xl border transition-all text-xs space-y-1.5 ${
                      isBusy
                        ? 'bg-emerald-950/20 border-emerald-500/40 shadow-sm'
                        : isDone
                        ? 'bg-stone-950/80 border-stone-800'
                        : 'bg-stone-950/50 border-stone-800/60 opacity-80'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${
                          isBusy ? 'bg-emerald-400 animate-ping' : isDone ? 'bg-teal-400' : 'bg-stone-600'
                        }`} />
                        <span className="font-mono font-bold text-stone-200">
                          Worker Pipeline #{idx + 1}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-stone-400">
                        {w ? `${w.processedCount} done` : '0 items'}
                      </span>
                    </div>

                    <div className="text-[11px] text-stone-400 truncate">
                      {isBusy ? (
                        <span className="text-emerald-300 font-medium">
                          {w.currentFile || 'Processing file...'}
                        </span>
                      ) : isDone ? (
                        <span className="text-teal-400">Pipeline Finished</span>
                      ) : (
                        <span className="text-stone-500">Idle / Ready for jobs</span>
                      )}
                    </div>

                    {isBusy && w?.currentStep && (
                      <div className="text-[10px] text-stone-400 flex items-center justify-between">
                        <span className="italic">{w.currentStep}</span>
                        <span className="font-mono text-emerald-400">{w.progressPercent}%</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Performance Footer */}
            <div className="pt-2 border-t border-stone-800/80 text-[11px] text-stone-400 flex items-center justify-between">
              <span>Cluster Architecture:</span>
              <span className="text-emerald-400 font-mono font-medium">Concurrent ThreadPool</span>
            </div>
          </div>
        </div>
      </div>

      {/* CLIENT ROSTER & RECEIPT VOLUME TRACKER */}
      <div className="rounded-2xl bg-stone-900 border border-stone-800 shadow-xl overflow-hidden">
        <div 
          onClick={() => setShowClientRoster(!showClientRoster)}
          className="p-4 bg-stone-950/70 border-b border-stone-800/80 flex items-center justify-between cursor-pointer hover:bg-stone-950/90 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <Building2 className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <span>Client Roster &amp; Receipt Ingestion Volume</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-stone-800 text-stone-300">
                {clientBreakdown.length} Entities
              </span>
            </h3>
          </div>
          <div className="flex items-center gap-2 text-xs text-stone-400">
            <span>{showClientRoster ? 'Collapse' : 'Expand Roster'}</span>
            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showClientRoster ? 'rotate-180' : ''}`} />
          </div>
        </div>

        {showClientRoster && (
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 bg-stone-900/60">
            {clientBreakdown.map(cb => {
              const isSelected = filterClient === cb.clientName;
              return (
                <div
                  key={cb.clientName}
                  className={`p-3.5 rounded-xl border transition-all text-xs space-y-2.5 ${
                    isSelected
                      ? 'bg-emerald-950/20 border-emerald-500/50 shadow-md'
                      : 'bg-stone-950/60 border-stone-800 hover:border-stone-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-bold text-white truncate text-sm flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                      <span className="truncate">{cb.clientName}</span>
                    </div>
                    {isSelected && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Active Filter
                      </span>
                    )}
                  </div>

                  {/* Volume Grid */}
                  <div className="grid grid-cols-4 gap-1.5 text-center font-mono">
                    <div className="p-1.5 rounded-lg bg-stone-900 border border-stone-800/80">
                      <div className="text-[10px] text-stone-400 uppercase font-sans">Pending</div>
                      <div className={`text-xs font-bold ${cb.pendingIntake > 0 ? 'text-amber-400 font-extrabold' : 'text-stone-400'}`}>
                        {cb.pendingIntake}
                      </div>
                    </div>
                    <div className="p-1.5 rounded-lg bg-stone-900 border border-stone-800/80">
                      <div className="text-[10px] text-stone-400 uppercase font-sans">Processed</div>
                      <div className="text-xs font-bold text-emerald-400">
                        {cb.scannedCount}
                      </div>
                    </div>
                    <div className="p-1.5 rounded-lg bg-stone-900 border border-stone-800/80">
                      <div className="text-[10px] text-stone-400 uppercase font-sans">Duplicates</div>
                      <div className={`text-xs font-bold ${cb.duplicateCount > 0 ? 'text-amber-400' : 'text-stone-500'}`}>
                        {cb.duplicateCount}
                      </div>
                    </div>
                    <div className="p-1.5 rounded-lg bg-stone-900 border border-stone-800/80">
                      <div className="text-[10px] text-stone-400 uppercase font-sans">Deductions</div>
                      <div className="text-xs font-bold text-teal-300">
                        ${cb.totalDeductions.toFixed(0)}
                      </div>
                    </div>
                  </div>

                  {cb.duplicateCount > 0 && (
                    <div className="px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-300/90 flex items-center gap-1.5">
                      <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                      <span>{cb.duplicateCount} duplicate(s) suppressed &amp; excluded from tax totals</span>
                    </div>
                  )}

                  {/* Quick Action Buttons */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => setFilterClient(isSelected ? 'ALL' : cb.clientName)}
                      className={`flex-1 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer text-center ${
                        isSelected
                          ? 'bg-stone-800 text-stone-200 hover:bg-stone-700'
                          : 'bg-stone-800/80 hover:bg-stone-700 text-stone-300 border border-stone-700/60'
                      }`}
                    >
                      {isSelected ? 'Show All Clients' : 'Filter Ledger'}
                    </button>

                    {cb.pendingIntake > 0 && (
                      <button
                        onClick={() => handleScanSpecificClientQueue(cb.clientName)}
                        className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1"
                        title="Load this client's queued intake receipts into scanner"
                      >
                        <Zap className="w-3 h-3 text-amber-400" />
                        <span>Scan ({cb.pendingIntake})</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* FILTER & SEARCH TOOLBAR */}
      <div className="p-4 rounded-xl bg-stone-900 border border-stone-800 shadow-md flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search vendor, amount, item, memo..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-lg bg-stone-950 border border-stone-800 text-stone-200 text-xs w-60 focus:outline-none focus:border-emerald-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Schedule Filter */}
          <select
            value={filterSchedule}
            onChange={e => setFilterSchedule(e.target.value as any)}
            className="px-2.5 py-1.5 rounded-lg bg-stone-950 border border-stone-800 text-stone-300 text-xs focus:outline-none focus:border-emerald-500"
          >
            <option value="ALL">All Tax Schedules</option>
            <option value="SCHEDULE_F">Schedule F (Farm Only)</option>
            <option value="SCHEDULE_C">Schedule C (Business Only)</option>
          </select>

          {/* Duplicate Filter */}
          <select
            value={filterDuplicate}
            onChange={e => setFilterDuplicate(e.target.value as any)}
            className="px-2.5 py-1.5 rounded-lg bg-stone-950 border border-stone-800 text-stone-300 text-xs focus:outline-none focus:border-emerald-500"
          >
            <option value="ALL">All Duplicate States</option>
            <option value="DUPLICATES_ONLY">Flagged Duplicates Only ({metrics.duplicateCount})</option>
            <option value="UNIQUE_ONLY">Unique Receipts Only</option>
          </select>

          {/* Client Filter */}
          <select
            value={filterClient}
            onChange={e => setFilterClient(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-stone-950 border border-stone-800 text-stone-300 text-xs focus:outline-none focus:border-emerald-500"
          >
            <option value="ALL">All Clients ({availableClients.length})</option>
            {availableClients.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Bulk Selection Actions */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 text-xs bg-stone-950 px-3 py-1.5 rounded-lg border border-stone-800">
            <span className="text-emerald-400 font-bold">{selectedIds.size} Selected</span>
            <button
              onClick={handleBulkMarkVerified}
              className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Check className="w-3 h-3" />
              <span>Mark Verified</span>
            </button>
            <button
              onClick={handleBulkDelete}
              className="px-2.5 py-1 rounded bg-rose-900/50 hover:bg-rose-900 text-rose-300 font-medium flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              <span>Delete</span>
            </button>
          </div>
        )}

        {receipts.length > 0 && (
          <div className="flex items-center gap-2">
            {metrics.duplicateCount > 0 && (
              <button
                onClick={handlePurgeAllDuplicates}
                className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Remove all duplicate flagged receipts from ledger and client intake records"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span>Purge {metrics.duplicateCount} Duplicates</span>
              </button>
            )}

            {confirmClearLedger ? (
              <div className="flex items-center gap-2 bg-rose-950/80 border border-rose-500/50 px-2.5 py-1 rounded-lg text-xs">
                <span className="text-rose-200 font-medium">Clear all records?</span>
                <button
                  onClick={handleClearAll}
                  className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] cursor-pointer"
                >
                  Yes, Clear
                </button>
                <button
                  onClick={() => setConfirmClearLedger(false)}
                  className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 text-[11px] cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={handleClearAll}
                className="text-stone-400 hover:text-rose-400 text-xs flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Ledger</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* AUDIT LEDGER TABLE */}
      <div className="rounded-2xl bg-stone-900 border border-stone-800 shadow-xl overflow-hidden">
        <div className="p-4 bg-stone-900/90 border-b border-stone-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Scanned Receipts Audit Ledger ({filteredReceipts.length})
            </h3>
          </div>
          <div className="text-xs text-stone-400 flex items-center gap-3">
            <span>Showing verified line-item categorizations</span>
          </div>
        </div>

        {filteredReceipts.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-stone-800 border border-stone-700 flex items-center justify-center mx-auto text-stone-400">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div className="text-sm font-semibold text-stone-300">
              No Scanned Receipts in Ledger
            </div>
            <p className="text-xs text-stone-400 max-w-md mx-auto">
              Drop receipt images above or click "Load Farm Batch (10)" to demonstrate the multi-worker parallel scanner.
            </p>
            <button
              onClick={handleLoadSampleFarmBatch}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors cursor-pointer"
            >
              Load Sample Farm Batch (10)
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-950/80 text-stone-400 font-medium uppercase tracking-wider border-b border-stone-800">
                <tr>
                  <th className="py-3 px-4 w-8">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === filteredReceipts.length && filteredReceipts.length > 0}
                      onChange={handleToggleSelectAll}
                      className="rounded border-stone-700 text-emerald-500 focus:ring-0 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Account / Submitter</th>
                  <th className="py-3 px-4">Vendor / Payee</th>
                  <th className="py-3 px-4">IRS Tax Schedule &amp; Line</th>
                  <th className="py-3 px-4 text-right">Deductible Total</th>
                  <th className="py-3 px-4">Payment</th>
                  <th className="py-3 px-4">Duplicate Check</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-800/60 font-sans">
                {filteredReceipts.map(r => {
                  const isDup = r.duplicateStatus !== 'UNIQUE';
                  const isSelected = selectedIds.has(r.id);

                  return (
                    <tr
                      key={r.id}
                      className={`hover:bg-stone-800/40 transition-colors ${
                        isSelected ? 'bg-emerald-950/20' : isDup ? 'bg-amber-950/10' : ''
                      }`}
                    >
                      <td className="py-3 px-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(r.id)}
                          className="rounded border-stone-700 text-emerald-500 focus:ring-0 cursor-pointer"
                        />
                      </td>

                      {/* Date */}
                      <td className="py-3 px-4 font-mono text-stone-300 whitespace-nowrap">
                        {r.date}
                      </td>

                      {/* Account & Submitter */}
                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-0.5">
                          <div className="font-semibold text-stone-200 whitespace-nowrap flex items-center gap-1.5">
                            {r.clientName.toLowerCase().includes('admin') ? (
                              <span className="text-amber-400 font-bold flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                                {r.clientName}
                              </span>
                            ) : (
                              <span className="text-emerald-300 font-medium flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                                {r.clientName}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-stone-400 flex items-center gap-1">
                            <span className="text-stone-500">By:</span>
                            <span className="truncate max-w-[130px] text-stone-300" title={r.submittedBy || 'Administrator'}>
                              {r.submittedBy || (r.clientEmail ? `${r.clientName} (${r.clientEmail})` : 'Administrator')}
                            </span>
                            {r.submittedByRole === 'ADMIN' && (
                              <span className="px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[9px] font-mono font-bold">
                                ADMIN
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Vendor */}
                      <td className="py-3 px-4 font-semibold text-white">
                        <div className="flex flex-col">
                          <span>{r.vendor}</span>
                          <span className="text-[10px] font-mono text-stone-500">{r.fileName}</span>
                        </div>
                      </td>

                      {/* Schedule & IRS Line */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                            r.schedule === 'SCHEDULE_F'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                          }`}>
                            {r.schedule === 'SCHEDULE_F' ? 'Sched F' : 'Sched C'}
                          </span>
                          <span className="text-stone-300 font-medium truncate max-w-[200px]" title={`${r.irsLineNumber} - ${r.irsLineTitle}`}>
                            {r.irsLineNumber}: {r.irsLineTitle}
                          </span>
                        </div>
                      </td>

                      {/* Amount */}
                      <td className="py-3 px-4 text-right font-mono font-bold text-white whitespace-nowrap">
                        ${r.total.toFixed(2)}
                        {r.tax > 0 && (
                          <span className="block text-[10px] font-normal text-stone-400">
                            (tax ${r.tax.toFixed(2)})
                          </span>
                        )}
                      </td>

                      {/* Payment */}
                      <td className="py-3 px-4 text-stone-300 whitespace-nowrap">
                        <div className="text-[11px] font-mono">
                          {r.paymentMethod} {r.cardLast4 ? `*${r.cardLast4}` : ''}
                        </div>
                      </td>

                      {/* Duplicate Status */}
                      <td className="py-3 px-4">
                        {isDup ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 inline-flex items-center gap-1 w-fit">
                              <AlertTriangle className="w-3 h-3 text-amber-400" />
                              DUPLICATE DETECTED
                            </span>
                            <span className="text-[10px] text-stone-400 max-w-[180px] truncate" title={r.duplicateReason}>
                              {r.duplicateReason}
                            </span>
                          </div>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            UNIQUE
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {r.status === 'VERIFIED' ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            VERIFIED
                          </span>
                        ) : r.status === 'REJECTED' ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            REJECTED
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-stone-800 text-stone-300">
                            PROCESSED
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenInspect(r)}
                            className="p-1.5 rounded-lg hover:bg-stone-800 text-stone-300 hover:text-white transition-colors cursor-pointer"
                            title="Inspect OCR & Line Items"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleToggleDuplicateStatus(r.id)}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              r.status === 'REJECTED'
                                ? 'bg-emerald-950/40 text-emerald-400 hover:bg-emerald-900/60'
                                : 'hover:bg-stone-800 text-stone-400 hover:text-amber-400'
                            }`}
                            title={r.status === 'REJECTED' ? 'Restore / Un-reject' : 'Reject duplicate'}
                          >
                            <AlertCircle className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => {
                              setReceipts(prev => prev.filter(x => x.id !== r.id));
                              if (onToast) onToast('Removed record.');
                            }}
                            className="p-1.5 rounded-lg hover:bg-rose-950/40 text-stone-400 hover:text-rose-400 transition-colors cursor-pointer"
                            title="Delete receipt"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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
      </div>

      {/* DETAIL INSPECTION MODAL */}
      {inspectingReceipt && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-3xl w-full p-6 space-y-5 shadow-2xl relative">
            <button
              onClick={() => setInspectingReceipt(null)}
              className="absolute top-4 right-4 p-2 text-stone-400 hover:text-white rounded-lg hover:bg-stone-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  Receipt Inspection &amp; Tax Audit Details
                </h3>
                <p className="text-xs text-stone-400 font-mono">
                  ID: {inspectingReceipt.id} • SHA-256: {inspectingReceipt.fileHash.slice(0, 16)}...
                </p>
              </div>
            </div>

            {/* LIVE EDIT MODE vs VIEW MODE */}
            {isEditingReceipt ? (
              <div className="p-4 rounded-xl bg-stone-950 border border-emerald-500/40 space-y-4">
                <div className="flex items-center justify-between border-b border-stone-800 pb-2">
                  <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 uppercase tracking-wider">
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Editing Receipt Extraction &amp; Line Mapping</span>
                  </div>
                  <span className="text-[10px] text-stone-400 font-mono">Changes apply to ledger &amp; tax exports</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-[10px] uppercase font-semibold text-stone-400 mb-1">Target Account / Client</label>
                    <input
                      type="text"
                      value={editFormData.clientName}
                      onChange={e => setEditFormData({ ...editFormData, clientName: e.target.value })}
                      placeholder="e.g. Administrator or Client Company"
                      className="w-full px-3 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-emerald-300 font-medium focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-semibold text-stone-400 mb-1">Submitted By (User / Submitter)</label>
                    <input
                      type="text"
                      value={editFormData.submittedBy}
                      onChange={e => setEditFormData({ ...editFormData, submittedBy: e.target.value })}
                      placeholder="e.g. Administrator (moisttowlett247@gmail.com)"
                      className="w-full px-3 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-white font-medium focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-semibold text-stone-400 mb-1">Vendor / Payee</label>
                    <input
                      type="text"
                      value={editFormData.vendor}
                      onChange={e => setEditFormData({ ...editFormData, vendor: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-white font-medium focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-semibold text-stone-400 mb-1">Transaction Date</label>
                    <input
                      type="date"
                      value={editFormData.date}
                      onChange={e => setEditFormData({ ...editFormData, date: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-semibold text-stone-400 mb-1">Total Amount ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editFormData.total}
                      onChange={e => setEditFormData({ ...editFormData, total: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-emerald-400 font-bold font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-semibold text-stone-400 mb-1">Tax Amount ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editFormData.tax}
                      onChange={e => setEditFormData({ ...editFormData, tax: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-stone-200 font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-semibold text-stone-400 mb-1">Payment Method</label>
                    <input
                      type="text"
                      value={editFormData.paymentMethod}
                      onChange={e => setEditFormData({ ...editFormData, paymentMethod: e.target.value })}
                      placeholder="VISA, MASTERCARD, DEBIT, CASH, CHECK"
                      className="w-full px-3 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-stone-200 font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-semibold text-stone-400 mb-1">Card Last 4 Digits</label>
                    <input
                      type="text"
                      maxLength={4}
                      value={editFormData.cardLast4}
                      onChange={e => setEditFormData({ ...editFormData, cardLast4: e.target.value.replace(/\D/g, '') })}
                      placeholder="e.g. 4821 (optional)"
                      className="w-full px-3 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-stone-200 font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-semibold text-stone-400 mb-1">IRS Tax Schedule</label>
                    <select
                      value={editFormData.schedule}
                      onChange={e => {
                        const sch = e.target.value as 'SCHEDULE_F' | 'SCHEDULE_C';
                        const firstLineKey = sch === 'SCHEDULE_F' ? 'Line 15' : 'Line 22';
                        const firstLineTitle = sch === 'SCHEDULE_F' ? IRS_SCHEDULE_F_LINES['Line 15'] : IRS_SCHEDULE_C_LINES['Line 22'];
                        setEditFormData({
                          ...editFormData,
                          schedule: sch,
                          irsLineNumber: firstLineKey,
                          irsLineTitle: firstLineTitle
                        });
                      }}
                      className="w-full px-3 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-white font-medium focus:outline-none focus:border-emerald-500"
                    >
                      <option value="SCHEDULE_F">IRS Form 1040 Schedule F (Farm Operating Deductions)</option>
                      <option value="SCHEDULE_C">IRS Form 1040 Schedule C (General Business Expenses)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-semibold text-stone-400 mb-1">IRS Form Line Item</label>
                    <select
                      value={editFormData.irsLineNumber}
                      onChange={e => {
                        const key = e.target.value;
                        const lineMap = editFormData.schedule === 'SCHEDULE_F' ? IRS_SCHEDULE_F_LINES : IRS_SCHEDULE_C_LINES;
                        setEditFormData({
                          ...editFormData,
                          irsLineNumber: key,
                          irsLineTitle: lineMap[key] || 'Expenses'
                        });
                      }}
                      className="w-full px-3 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-white font-medium focus:outline-none focus:border-emerald-500 truncate"
                    >
                      {Object.entries(editFormData.schedule === 'SCHEDULE_F' ? IRS_SCHEDULE_F_LINES : IRS_SCHEDULE_C_LINES).map(([k, title]) => (
                        <option key={k} value={k}>{k}: {title}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-semibold text-stone-400 mb-1">Verification Status</label>
                    <select
                      value={editFormData.status}
                      onChange={e => setEditFormData({ ...editFormData, status: e.target.value as any })}
                      className="w-full px-3 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-white font-medium focus:outline-none focus:border-emerald-500"
                    >
                      <option value="PROCESSED">PROCESSED (Under Review)</option>
                      <option value="VERIFIED">VERIFIED (Approved for Tax Return)</option>
                      <option value="REJECTED">REJECTED (Suppressed / Duplicate)</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-800">
                  <button
                    onClick={() => setIsEditingReceipt(false)}
                    className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 font-medium text-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveReceiptEdits}
                    className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer flex items-center gap-1.5 shadow-md"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Save Changes</span>
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Receipt Source Image / Document Preview */}
                {inspectingReceipt.dataUrl && (
                  <div className="p-3 bg-stone-950 rounded-xl border border-stone-800 space-y-2">
                    <div className="text-[10px] text-stone-400 font-semibold uppercase tracking-wider flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Source Receipt Document Preview</span>
                      </span>
                      <span className="font-mono text-stone-500">
                        {inspectingReceipt.fileName} ({Math.round(inspectingReceipt.fileSize / 1024)} KB)
                      </span>
                    </div>
                    <div className="flex items-center justify-center bg-black/60 rounded-lg p-2 max-h-56 overflow-hidden border border-stone-800/80">
                      {inspectingReceipt.dataUrl.startsWith('data:image/') || inspectingReceipt.fileType.startsWith('image/') ? (
                        <img
                          src={inspectingReceipt.dataUrl}
                          alt={inspectingReceipt.fileName}
                          className="max-h-52 max-w-full object-contain rounded"
                        />
                      ) : (
                        <div className="text-center py-5 space-y-1">
                          <FileText className="w-8 h-8 text-stone-500 mx-auto" />
                          <div className="text-xs text-stone-300 font-mono">{inspectingReceipt.fileName}</div>
                          <div className="text-[10px] text-stone-500">PDF / Binary Source Document attached to vault</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Account Attribution & Submitter Tracking Card */}
                <div className="p-3.5 rounded-xl bg-stone-950 border border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[10px] text-stone-400 uppercase font-semibold block">Assigned Account / Client</span>
                      <span className="font-bold text-white text-sm">
                        {inspectingReceipt.clientName}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <div>
                      <span className="text-[10px] text-stone-400 uppercase font-semibold block">Submitted By</span>
                      <span className="font-medium text-stone-200 flex items-center gap-1">
                        <User className="w-3 h-3 text-amber-400" />
                        {inspectingReceipt.submittedBy || (inspectingReceipt.clientEmail ? `${inspectingReceipt.clientName} (${inspectingReceipt.clientEmail})` : 'Administrator')}
                      </span>
                    </div>

                    <div className="border-l border-stone-800 pl-3">
                      <span className="text-[10px] text-stone-400 uppercase font-semibold block">Submitter Role</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold inline-block ${
                        inspectingReceipt.submittedByRole === 'ADMIN'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      }`}>
                        {inspectingReceipt.submittedByRole || (inspectingReceipt.clientName.toLowerCase().includes('admin') ? 'ADMIN' : 'CLIENT')}
                      </span>
                    </div>

                    <div className="border-l border-stone-800 pl-3">
                      <span className="text-[10px] text-stone-400 uppercase font-semibold block">Submission Timestamp</span>
                      <span className="font-mono text-stone-400 text-[11px]">
                        {new Date(inspectingReceipt.uploadedAt || inspectingReceipt.processedAt).toLocaleDateString()} {new Date(inspectingReceipt.uploadedAt || inspectingReceipt.processedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Core Metadata Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-stone-950 p-4 rounded-xl border border-stone-800">
                  <div>
                    <div className="text-stone-400 text-[10px] uppercase font-semibold">Vendor / Payee</div>
                    <div className="font-bold text-white mt-0.5">{inspectingReceipt.vendor}</div>
                  </div>
                  <div>
                    <div className="text-stone-400 text-[10px] uppercase font-semibold">Transaction Date</div>
                    <div className="font-mono text-stone-200 mt-0.5">{inspectingReceipt.date}</div>
                  </div>
                  <div>
                    <div className="text-stone-400 text-[10px] uppercase font-semibold">Total Amount</div>
                    <div className="font-mono font-bold text-emerald-400 mt-0.5">
                      ${inspectingReceipt.total.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-stone-400 text-[10px] uppercase font-semibold">Payment Tender</div>
                    <div className="font-mono text-stone-200 mt-0.5">
                      {inspectingReceipt.paymentMethod} {inspectingReceipt.cardLast4 ? `(*${inspectingReceipt.cardLast4})` : ''}
                    </div>
                  </div>
                  <div>
                    <div className="text-stone-400 text-[10px] uppercase font-semibold">Invoice / Ref #</div>
                    <div className="font-mono text-stone-200 mt-0.5">
                      {inspectingReceipt.invoiceNumber || inspectingReceipt.id.split('-')[1] || 'N/A'}
                    </div>
                  </div>
                </div>

                {/* IRS Form 1040 Tax Classification */}
                <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 space-y-2">
                  <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>IRS Tax Classification Details</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-stone-400 block text-[10px]">IRS Schedule:</span>
                      <span className="font-semibold text-white">
                        {inspectingReceipt.schedule === 'SCHEDULE_F'
                          ? 'IRS Form 1040 Schedule F (Farm)'
                          : 'IRS Form 1040 Schedule C (Business)'}
                      </span>
                    </div>
                    <div>
                      <span className="text-stone-400 block text-[10px]">Tax Line Assignment:</span>
                      <span className="font-semibold text-emerald-300">
                        {inspectingReceipt.irsLineNumber}: {inspectingReceipt.irsLineTitle}
                      </span>
                    </div>
                    <div>
                      <span className="text-stone-400 block text-[10px]">Extraction Confidence:</span>
                      <span className="font-mono text-emerald-400">
                        {(inspectingReceipt.confidence * 100).toFixed(0)}% (Verified)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Line Items Table if present */}
                {inspectingReceipt.lineItems && inspectingReceipt.lineItems.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-stone-300 uppercase tracking-wider">
                      Itemized Line Items
                    </div>
                    <div className="rounded-xl border border-stone-800 overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-stone-950 text-stone-400 font-mono text-[10px]">
                          <tr>
                            <th className="py-2 px-3">Item Description</th>
                            <th className="py-2 px-3 text-center">Qty</th>
                            <th className="py-2 px-3 text-right">Unit Price</th>
                            <th className="py-2 px-3 text-right">Line Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-800 font-sans">
                          {inspectingReceipt.lineItems.map((li, idx) => (
                            <tr key={idx} className="hover:bg-stone-800/30">
                              <td className="py-2 px-3 text-stone-200">{li.description}</td>
                              <td className="py-2 px-3 text-center font-mono text-stone-400">{li.quantity}</td>
                              <td className="py-2 px-3 text-right font-mono text-stone-400">${li.unitPrice.toFixed(2)}</td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-white">${li.total.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Duplicate Notice Banner if applicable */}
                {inspectingReceipt.duplicateStatus !== 'UNIQUE' && (
                  <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/40 text-xs space-y-1">
                    <div className="font-bold text-amber-300 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      <span>Duplicate Receipt Detection Alert</span>
                    </div>
                    <p className="text-stone-300 text-[11px] leading-relaxed">
                      {inspectingReceipt.duplicateReason}
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Modal Footer Actions */}
            <div className="pt-2 border-t border-stone-800 flex items-center justify-between text-xs">
              <span className="text-stone-400 text-[11px]">
                Processed by: <span className="font-mono text-stone-300">{inspectingReceipt.workerNodeId}</span> in {inspectingReceipt.processingDurationMs}ms
              </span>

              <div className="flex items-center gap-2">
                {!isEditingReceipt && (
                  <button
                    onClick={() => setIsEditingReceipt(true)}
                    className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1.5 border border-stone-700"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Edit Details</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    handleToggleDuplicateStatus(inspectingReceipt.id);
                    setInspectingReceipt(prev => prev ? {
                      ...prev,
                      status: prev.status === 'REJECTED' ? 'PROCESSED' : 'REJECTED'
                    } : null);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    inspectingReceipt.status === 'REJECTED'
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'bg-amber-600 hover:bg-amber-500 text-white'
                  }`}
                >
                  {inspectingReceipt.status === 'REJECTED' ? 'Mark Valid / Restore' : 'Reject Duplicate'}
                </button>
                <button
                  onClick={() => setInspectingReceipt(null)}
                  className="px-4 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 font-semibold text-xs transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
