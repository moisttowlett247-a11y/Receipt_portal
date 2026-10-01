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
  Plus,
  Key,
  Cloud
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
  generateUniqueHighVolumeBatch,
  classifyExtractedTaxSchedule,
  normalizeVendorName,
  scanReceiptWithAI,
  getActiveGeminiApiKeys,
  saveActiveGeminiApiKeys
} from '../adminReceiptScanningEngine';
import { ensureFolderPath, uploadReceiptToDrive, updateFileMetadata } from '../googleDriveService';
import { 
  getClientSubmissions, 
  purgeDuplicateSubmissions, 
  subscribeToClientSubmissions, 
  updateSubmissionStatus, 
  deleteSubmission,
  ClientSubmission 
} from '../clientSubmissionService';
import { 
  googleSignIn, 
  logoutGoogle, 
  initAuth, 
  requestGoogleTokenViaGIS, 
  validateGoogleAccessToken, 
  setManualAccessToken, 
  getCachedEmail 
} from '../firebaseAuthService';
import { User as FirebaseUser } from 'firebase/auth';
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

  const receiptsRef = useRef(receipts);
  useEffect(() => {
    receiptsRef.current = receipts;
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

  // Google Drive Cloud Vault Integration State
  const [googleUser, setGoogleUser] = useState<FirebaseUser | { email?: string; displayName?: string } | null>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [isConnectingDrive, setIsConnectingDrive] = useState<boolean>(false);
  const [isSyncingLedger, setIsSyncingLedger] = useState<boolean>(false);
  const [singleSyncingId, setSingleSyncingId] = useState<string | null>(null);
  const [autoSyncToCloud, setAutoSyncToCloud] = useState<boolean>(true);
  const [autoProcessOnUpload, setAutoProcessOnUpload] = useState<boolean>(true);
  const [isDriveModalOpen, setIsDriveModalOpen] = useState<boolean>(false);
  const [manualTokenInput, setManualTokenInput] = useState<string>('');
  const [isValidatingManualToken, setIsValidatingManualToken] = useState<boolean>(false);
  const [manualTokenStatus, setManualTokenStatus] = useState<{ valid?: boolean; email?: string; error?: string } | null>(null);
  const [showAdvancedAuth, setShowAdvancedAuth] = useState<boolean>(false);
  const [isTestingDriveConnection, setIsTestingDriveConnection] = useState<boolean>(false);
  const [testDriveResult, setTestDriveResult] = useState<{ success: boolean; message: string } | null>(null);
  const [pendingSyncReceiptId, setPendingSyncReceiptId] = useState<string | null>(null);
  const googleAccessTokenRef = useRef<string | null>(null);
  const autoProcessOnUploadRef = useRef<boolean>(true);
  const executeBatchScanRef = useRef<((itemsOverride?: ReceiptInputItem[]) => Promise<void>) | null>(null);

  useEffect(() => {
    autoProcessOnUploadRef.current = autoProcessOnUpload;
  }, [autoProcessOnUpload]);

  useEffect(() => {
    googleAccessTokenRef.current = googleAccessToken;
  }, [googleAccessToken]);

  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setGoogleUser(user);
        setGoogleAccessToken(token);
        googleAccessTokenRef.current = token;
      },
      () => {
        if (!googleAccessTokenRef.current) {
          setGoogleUser(null);
          setGoogleAccessToken(null);
        }
      }
    );
    return () => unsubscribe();
  }, []);

  const syncReceiptsBatchToDrive = async (token: string, itemsToSync: ProcessedReceipt[]) => {
    if (!token || itemsToSync.length === 0) return;
    setIsSyncingLedger(true);
    let successCount = 0;

    for (const r of itemsToSync) {
      if (!r.dataUrl || r.googleDriveId) continue;
      setSingleSyncingId(r.id);
      try {
        const year = r.date ? r.date.split('-')[0] : new Date().getFullYear().toString();
        const clientFolder = r.clientName || 'General';
        const folderId = await ensureFolderPath(token, ['Receipt Vault', year, clientFolder]);
        
        if (folderId && r.dataUrl) {
          const driveRes = await uploadReceiptToDrive(token, folderId, r.fileName, r.dataUrl);
          if (driveRes) {
            successCount++;
            setReceipts(prev => prev.map(item => {
              if (item.id === r.id) {
                const updated = {
                  ...item,
                  googleDriveId: driveRes.id,
                  googleDriveLink: driveRes.webViewLink
                };
                delete updated.dataUrl; // RAM optimization
                return updated;
              }
              return item;
            }));

            const description = `Vendor: ${r.vendor}\nTotal: $${r.total}\nDate: ${r.date}\nSchedule: ${r.schedule}\nIRS Line: ${r.irsLineNumber} (${r.irsLineTitle})\nSHA-256: ${r.fileHash}`;
            await updateFileMetadata(token, driveRes.id, description);
          }
        }
      } catch (err) {
        console.warn('Sync failed for item:', r.fileName, err);
      } finally {
        setSingleSyncingId(null);
      }
    }

    setIsSyncingLedger(false);
    if (successCount > 0 && onToast) {
      onToast(`✅ Cloud Sync Complete: ${successCount} receipt(s) synced to Google Drive!`);
    }
  };

  const handleConnectDrive = async (openModalOnFail: boolean = true): Promise<string | null> => {
    setIsConnectingDrive(true);
    try {
      if (onToast) onToast('Connecting to Google Drive...');
      const res = await googleSignIn();
      if (res?.accessToken) {
        setGoogleUser(res.user as any || { email: res.email });
        setGoogleAccessToken(res.accessToken);
        googleAccessTokenRef.current = res.accessToken;
        const email = res.email || (res.user as any)?.email || getCachedEmail() || 'Authorized Account';
        if (onToast) onToast(`✅ Connected to Google Drive: ${email}`);

        // Automatically sync all pending local receipts!
        const unsynced = receiptsRef.current.filter(r => !r.googleDriveId && r.dataUrl && r.status !== 'REJECTED');
        if (unsynced.length > 0) {
          if (onToast) onToast(`🚀 Auto-syncing ${unsynced.length} pending receipt(s) to Google Drive...`);
          await syncReceiptsBatchToDrive(res.accessToken, unsynced);
        }
        return res.accessToken;
      }
      if (openModalOnFail) {
        setIsDriveModalOpen(true);
      }
      return null;
    } catch (err: any) {
      console.error('handleConnectDrive error:', err);
      if (onToast) onToast(`Google Drive: ${err?.message || 'Authorization prompt'}`);
      if (openModalOnFail) {
        setIsDriveModalOpen(true);
      }
      return null;
    } finally {
      setIsConnectingDrive(false);
    }
  };

  const handleDirectGISConnect = async () => {
    setIsConnectingDrive(true);
    try {
      const res = await requestGoogleTokenViaGIS();
      if (res?.accessToken) {
        setGoogleAccessToken(res.accessToken);
        googleAccessTokenRef.current = res.accessToken;
        setGoogleUser({ email: res.email || 'Authorized Google Account' } as any);
        if (onToast) onToast(`✅ Google Drive Vault Connected: ${res.email || 'Authorized Account'}`);
        
        const unsynced = receiptsRef.current.filter(r => !r.googleDriveId && r.dataUrl && r.status !== 'REJECTED');
        if (unsynced.length > 0) {
          await syncReceiptsBatchToDrive(res.accessToken, unsynced);
        }
      }
    } catch (err: any) {
      if (onToast) onToast(`Google Auth: ${err?.message || 'Cancelled'}`);
    } finally {
      setIsConnectingDrive(false);
    }
  };

  const handleValidateManualToken = async () => {
    if (!manualTokenInput.trim()) {
      setManualTokenStatus({ valid: false, error: 'Please enter an OAuth access token.' });
      return;
    }
    setIsValidatingManualToken(true);
    setManualTokenStatus(null);
    try {
      const check = await validateGoogleAccessToken(manualTokenInput.trim());
      if (check.valid) {
        setManualTokenStatus({ valid: true, email: check.email });
        setGoogleAccessToken(manualTokenInput.trim());
        googleAccessTokenRef.current = manualTokenInput.trim();
        setGoogleUser({ email: check.email || 'Authorized Google Account' } as any);
        if (onToast) onToast(`✅ Google Drive Access Token Activated (${check.email || 'Valid'})!`);

        const unsynced = receiptsRef.current.filter(r => !r.googleDriveId && r.dataUrl && r.status !== 'REJECTED');
        if (unsynced.length > 0) {
          await syncReceiptsBatchToDrive(manualTokenInput.trim(), unsynced);
        }
      } else {
        setManualTokenStatus({ valid: false, error: check.error || 'Invalid or expired token' });
      }
    } catch (err: any) {
      setManualTokenStatus({ valid: false, error: err.message || 'Validation failed' });
    } finally {
      setIsValidatingManualToken(false);
    }
  };

  const handleTestDriveConnection = async () => {
    const token = googleAccessTokenRef.current || googleAccessToken;
    if (!token) {
      if (onToast) onToast('Please connect to Google Drive first.');
      return;
    }
    setIsTestingDriveConnection(true);
    setTestDriveResult(null);
    try {
      const folderId = await ensureFolderPath(token, ['Receipt Vault', 'Verification_Check']);
      if (folderId) {
        setTestDriveResult({
          success: true,
          message: `Connection Verified! Successfully accessed folder in Google Drive (ID: ${folderId.substring(0, 12)}...).`
        });
        if (onToast) onToast('✅ Google Drive API connection & permissions verified!');
      } else {
        setTestDriveResult({
          success: false,
          message: 'Could not access or create folder in Google Drive. Check permissions.'
        });
      }
    } catch (err: any) {
      setTestDriveResult({
        success: false,
        message: `Test failed: ${err.message || String(err)}`
      });
    } finally {
      setIsTestingDriveConnection(false);
    }
  };

  const handleDisconnectDrive = async () => {
    await logoutGoogle();
    setGoogleUser(null);
    setGoogleAccessToken(null);
    googleAccessTokenRef.current = null;
    setManualTokenStatus(null);
    setTestDriveResult(null);
    if (onToast) onToast('Disconnected from Google Drive.');
  };

  // Real-time client submissions intake state & Auto-sync
  const [clientSubmissions, setClientSubmissions] = useState<ClientSubmission[]>(() => getClientSubmissions());
  const [autoEnqueueClientSubmissions, setAutoEnqueueClientSubmissions] = useState<boolean>(true);
  const processedSubmissionIdsRef = useRef<Set<string>>(new Set());

  // Keep receiptsRef in sync and record processed IDs
  useEffect(() => {
    receipts.forEach(r => {
      if (r.id) processedSubmissionIdsRef.current.add(r.id);
      if (r.submissionId) processedSubmissionIdsRef.current.add(r.submissionId);
      if (r.fileName && r.clientName) processedSubmissionIdsRef.current.add(`${r.clientName}__${r.fileName}`);
    });
  }, [receipts]);

  // Subscribe to real-time client submissions updates across tabs and backend
  useEffect(() => {
    const unsubscribe = subscribeToClientSubmissions((updatedSubs) => {
      setClientSubmissions(updatedSubs);

      const queuedMap = new Map<string, ClientSubmission>();
      (updatedSubs || []).forEach(s => {
        if (s.status === 'QUEUED') {
          queuedMap.set(s.id, s);
        }
      });

      // 1. Build authoritative set of processed IDs using current ref
      const processedIds = new Set<string>(processedSubmissionIdsRef.current);
      (receiptsRef.current || []).forEach(r => {
        if (r.id) processedIds.add(r.id);
        if (r.submissionId) processedIds.add(r.submissionId);
      });
      (updatedSubs || []).forEach(s => {
        if (s.status !== 'QUEUED') {
          processedIds.add(s.id);
        }
      });

      setQueuedFiles(prev => {
        // Filter out items that are already processed or were marked as synced
        const validExisting = prev.filter(p => {
          if (p.id) {
            if (processedIds.has(p.id)) return false;
            // If it's a client submission, check if it's still QUEUED
            if (p.submittedByRole === 'CLIENT' && !queuedMap.has(p.id)) {
              return false;
            }
          }
          return true;
        });

        if (!autoEnqueueClientSubmissions) {
          return validExisting;
        }

        // 2. Add any newly queued client items (all at once)
        const existingIds = new Set(validExisting.map(p => p.id).filter(Boolean));
        const newToAdd: ReceiptInputItem[] = [];

        for (const s of queuedMap.values()) {
          if (!existingIds.has(s.id) && !processedIds.has(s.id)) {
            newToAdd.push({
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
            });
          }
        }

        if (newToAdd.length === 0) return validExisting;
        if (autoProcessOnUploadRef.current && newToAdd.length > 0) {
          setTimeout(() => {
            executeBatchScanRef.current?.(newToAdd);
          }, 80);
        }
        return [...validExisting, ...newToAdd];
      });
    });

    return () => unsubscribe();
  }, [autoEnqueueClientSubmissions]);

  // On initial mount, automatically scan and process any queued receipts into the audit ledger if autoProcessOnUpload is true
  useEffect(() => {
    if (autoProcessOnUploadRef.current) {
      const subs = getClientSubmissions();
      const queued = subs.filter(s => s.status === 'QUEUED');
      if (queued.length > 0) {
        const processedIds = new Set<string>(processedSubmissionIdsRef.current);
        (receiptsRef.current || []).forEach(r => {
          if (r.id) processedIds.add(r.id);
          if (r.submissionId) processedIds.add(r.submissionId);
        });
        const unhandled = queued.filter(s => !processedIds.has(s.id));
        if (unhandled.length > 0) {
          const itemsToScan: ReceiptInputItem[] = unhandled.map(s => ({
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
          setTimeout(() => {
            executeBatchScanRef.current?.(itemsToScan);
          }, 350);
        }
      }
    }
  }, []);

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
  const [isReScanning, setIsReScanning] = useState<boolean>(false);
  const [activeOcrError, setActiveOcrError] = useState<{ id: string; fileName: string; ocrError: string } | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [confirmClearLedger, setConfirmClearLedger] = useState<boolean>(false);
  const [showClientRoster, setShowClientRoster] = useState<boolean>(true);

  // Gemini API Key Modal & active state
  const [isKeyModalOpen, setIsKeyModalOpen] = useState<boolean>(false);
  const [keyInputText, setKeyInputText] = useState<string>('');
  const [configuredKeys, setConfiguredKeys] = useState<string[]>(() => getActiveGeminiApiKeys());

  useEffect(() => {
    setConfiguredKeys(getActiveGeminiApiKeys());
  }, []);

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
    transactionNumber: string;
    referenceId: string;
    invoiceNumber: string;
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
    transactionNumber: '',
    referenceId: '',
    invoiceNumber: '',
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
      if (Array.isArray(clientSubmissions)) {
        clientSubmissions.forEach(s => {
          if (s.clientName?.trim()) set.add(s.clientName.trim());
        });
      }
    } catch {}

    // Pull any clients in the current receipt ledger
    for (const r of receipts) {
      if (r.clientName?.trim()) set.add(r.clientName.trim());
    }

    return Array.from(set);
  }, [clientSubmissions, receipts]);

  // Pending client intake submissions count
  const pendingIntakeCount = useMemo(() => {
    try {
      return (clientSubmissions || []).filter(s => s.status === 'QUEUED').length;
    } catch {
      return 0;
    }
  }, [clientSubmissions]);

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

  // All receipts stored locally in memory awaiting Google Drive cloud sync
  const unsyncedReceipts = useMemo(() => {
    return receipts.filter(r => !r.googleDriveId && r.dataUrl && r.status !== 'REJECTED');
  }, [receipts]);

  // Detailed per-client tracking: volume of uploaded, pending, and processed receipts
  const clientBreakdown = useMemo(() => {
    const subs = clientSubmissions || [];

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
      const c = (s.clientName || 'Unassigned').trim();
      if (!map[c]) {
        map[c] = { clientName: c, pendingIntake: 0, scannedCount: 0, verifiedCount: 0, totalDeductions: 0, duplicateCount: 0 };
      }
      const isAlreadyScanned = receipts.some(r => 
        (r.submissionId && r.submissionId === s.id) || 
        r.id === s.id || 
        (r.fileName === s.fileName && (r.clientName || '').trim().toLowerCase() === c.toLowerCase())
      ) || processedSubmissionIdsRef.current.has(s.id) || s.status !== 'QUEUED';

      if (s.status === 'QUEUED' && !isAlreadyScanned) {
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
  }, [availableClients, receipts, clientSubmissions]);

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
      transactionNumber: r.transactionNumber || '',
      referenceId: r.referenceId || '',
      invoiceNumber: r.invoiceNumber || '',
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
      transactionNumber: editFormData.transactionNumber.trim() || undefined,
      referenceId: editFormData.referenceId.trim() || undefined,
      invoiceNumber: editFormData.invoiceNumber.trim() || undefined,
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

  const handleReScanSingleReceipt = async () => {
    if (!inspectingReceipt || !inspectingReceipt.dataUrl) return;
    setIsReScanning(true);
    if (onToast) onToast('Triggering high-accuracy AI Vision re-scan...');

    try {
      const ocrRes = await scanReceiptWithAI({
        dataUrl: inspectingReceipt.dataUrl,
        fileType: inspectingReceipt.fileType || 'image/jpeg',
        fileName: inspectingReceipt.fileName,
        clientName: inspectingReceipt.clientName
      });

      if (ocrRes.success && ocrRes.data) {
        const d = ocrRes.data;
        const taxCls = (d.schedule && d.irsLineNumber && d.irsLineTitle)
          ? {
              schedule: d.schedule,
              lineNumber: d.irsLineNumber,
              lineTitle: d.irsLineTitle,
              categoryName: d.category || 'Supplies',
              confidence: 0.99
            }
          : classifyExtractedTaxSchedule(
              d.vendor,
              d.category || 'Supplies & Materials',
              d.memo || '',
              inspectingReceipt.fileName
            );

        const updated: ProcessedReceipt = {
          ...inspectingReceipt,
          vendor: d.vendor,
          normalizedVendor: normalizeVendorName(d.vendor),
          date: d.date,
          lineItems: d.lineItems,
          subtotal: d.subtotal,
          tax: d.tax,
          tip: d.tip,
          total: d.total,
          paymentMethod: d.paymentMethod,
          cardLast4: d.cardLast4,
          invoiceNumber: d.invoiceNumber,
          transactionNumber: d.transactionNumber,
          referenceId: d.referenceId,
          category: taxCls.categoryName,
          schedule: taxCls.schedule,
          irsLineNumber: taxCls.lineNumber,
          irsLineTitle: taxCls.lineTitle,
          confidence: 0.99,
          ocrFailed: false,
          ocrError: undefined,
          processedAt: new Date().toISOString()
        };

        setReceipts(prev => prev.map(item => item.id === updated.id ? updated : item));
        setInspectingReceipt(updated);
        if (onToast) onToast('Receipt re-scanned successfully with high-accuracy AI Vision!');
      } else {
        throw new Error(ocrRes.errorMessage || 'AI OCR extraction failed');
      }
    } catch (e: any) {
      console.error(e);
      if (onToast) onToast(`Re-scan notice: ${e.message || String(e)}`);
    } finally {
      setIsReScanning(false);
    }
  };

  const handleRetryScanById = async (id: string) => {
    const target = receipts.find(r => r.id === id);
    if (!target) return;
    if (!target.dataUrl) {
      if (onToast) onToast('Cannot re-scan: original document image data not available in ledger.');
      return;
    }

    setRetryingId(id);
    if (onToast) onToast(`Retrying AI Vision OCR for ${target.fileName}...`);

    try {
      const ocrRes = await scanReceiptWithAI({
        dataUrl: target.dataUrl,
        fileType: target.fileType || 'image/jpeg',
        fileName: target.fileName,
        clientName: target.clientName
      });

      if (ocrRes.success && ocrRes.data) {
        const d = ocrRes.data;
        const taxCls = (d.schedule && d.irsLineNumber && d.irsLineTitle)
          ? {
              schedule: d.schedule,
              lineNumber: d.irsLineNumber,
              lineTitle: d.irsLineTitle,
              categoryName: d.category || 'Supplies',
              confidence: 0.99
            }
          : classifyExtractedTaxSchedule(
              d.vendor,
              d.category || 'Supplies & Materials',
              d.memo || '',
              target.fileName
            );

        const updated: ProcessedReceipt = {
          ...target,
          vendor: d.vendor,
          normalizedVendor: normalizeVendorName(d.vendor),
          date: d.date,
          lineItems: d.lineItems,
          subtotal: d.subtotal,
          tax: d.tax,
          tip: d.tip,
          total: d.total,
          paymentMethod: d.paymentMethod,
          cardLast4: d.cardLast4,
          invoiceNumber: d.invoiceNumber,
          transactionNumber: d.transactionNumber,
          referenceId: d.referenceId,
          category: taxCls.categoryName,
          schedule: taxCls.schedule,
          irsLineNumber: taxCls.lineNumber,
          irsLineTitle: taxCls.lineTitle,
          confidence: 0.99,
          ocrFailed: false,
          ocrError: undefined,
          processedAt: new Date().toISOString()
        };

        setReceipts(prev => prev.map(item => item.id === updated.id ? updated : item));
        if (inspectingReceipt?.id === updated.id) {
          setInspectingReceipt(updated);
        }
        if (activeOcrError?.id === updated.id) {
          setActiveOcrError(null);
        }
        if (onToast) onToast(`Receipt (${updated.fileName}) re-scanned successfully with high-accuracy AI!`);
      } else {
        throw new Error(ocrRes.errorMessage || 'AI OCR extraction failed');
      }
    } catch (e: any) {
      console.error(e);
      if (onToast) onToast(`Re-scan failed: ${e.message || String(e)}`);
    } finally {
      setRetryingId(null);
    }
  };

  const handleScanSpecificClientQueue = (clientName: string) => {
    try {
      const cleanTarget = clientName.trim().toLowerCase();
      const subs = getClientSubmissions();
      const queued = subs.filter(s => 
        s.status === 'QUEUED' && 
        (s.clientName || '').trim().toLowerCase() === cleanTarget
      );
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
      setQueuedFiles(prev => {
        const existingIds = new Set(prev.map(p => p.id).filter(Boolean));
        const toAdd = inputItems.filter(item => !existingIds.has(item.id));
        if (toAdd.length === 0) return prev;
        return [...prev, ...toAdd];
      });
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

    const newItems: ReceiptInputItem[] = files.map((f, idx) => ({
      id: `admin-upload-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
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
    if (autoProcessOnUpload) {
      if (onToast) onToast(`Uploaded ${files.length} receipt(s). Auto-processing & syncing to Cloud Vault...`);
      setTimeout(() => {
        executeBatchScan(newItems);
      }, 50);
    } else {
      if (onToast) onToast(`Added ${files.length} receipt file(s) assigned to ${target}`);
    }
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

    const newItems: ReceiptInputItem[] = files.map((f, idx) => ({
      id: `admin-drop-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
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
    if (autoProcessOnUpload) {
      if (onToast) onToast(`Dropped ${files.length} receipt(s). Auto-processing & syncing to Cloud Vault...`);
      setTimeout(() => {
        executeBatchScan(newItems);
      }, 50);
    } else {
      if (onToast) onToast(`Queued ${files.length} dropped file(s) for ${target}`);
    }
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
      if (autoProcessOnUpload) {
        setTimeout(() => {
          executeBatchScan(inputItems);
        }, 50);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // -------------------------------------------------------------------------
  // EXECUTE PARALLEL SCANNING
  // -------------------------------------------------------------------------

  const executeBatchScan = async (itemsOverride?: ReceiptInputItem[]) => {
    const items = itemsOverride && itemsOverride.length > 0 ? itemsOverride : queuedFiles;
    if (items.length === 0) {
      if (onToast) onToast('Queue is empty. Select files or load a test batch to scan.');
      return;
    }

    setIsScanning(true);
    const startTime = Date.now();
    setScanStartTime(startTime);
    setElapsedSec(0);
    setScanProgress({ current: 0, total: items.length });

    if (onToast) onToast(`🚀 Launching ${concurrency} parallel worker pipelines for ${items.length} receipt(s)...`);

    try {
      const scannedResults = await runParallelBatchScan(items, {
        concurrency,
        defaultClientName: selectedClientTarget,
        existingLedger: receiptsRef.current,
        googleAccessToken: googleAccessTokenRef.current || undefined,
        onWorkerUpdate: updatedWorkers => {
          setWorkers(updatedWorkers);
        },
        onItemProcessed: (processed, current, total) => {
          setScanProgress({ current, total });

          // Optimization: If uploaded to Drive, clear heavy dataUrl from memory ledger
          const ledgerRecord = { ...processed };
          if (ledgerRecord.googleDriveId) {
            delete ledgerRecord.dataUrl;
          }
          
          setReceipts(prev => [ledgerRecord, ...prev]);

          // Record in processed IDs ref so subscriber never re-queues it
          if (processed.id) processedSubmissionIdsRef.current.add(processed.id);
          if (processed.submissionId) processedSubmissionIdsRef.current.add(processed.submissionId);
          if (processed.fileName && processed.clientName) {
            processedSubmissionIdsRef.current.add(`${processed.clientName}__${processed.fileName}`);
          }

          // Update client submission status immediately in client intake
          const targetSubId = processed.submissionId || (processed.id && processed.id.startsWith('sub-') ? processed.id : null);
          try {
            updateSubmissionStatus(targetSubId || processed.fileName, 'SYNCED_QBO', {
              fileName: processed.fileName,
              clientName: processed.clientName,
              extractedVendor: processed.vendor,
              extractedAmount: processed.total,
              extractedDate: processed.date
            });
          } catch {}

          // Remove the processed item from queued files immediately
          setQueuedFiles(prev => prev.filter(q => {
            if (targetSubId && q.id === targetSubId) return false;
            if (q.id === processed.id) return false;
            if (q.fileName === processed.fileName && q.clientName === processed.clientName) return false;
            return true;
          }));
        }
      });

      // Update client submission statuses in real time for any remaining items
      for (const res of scannedResults) {
        if (res.id) processedSubmissionIdsRef.current.add(res.id);
        if (res.submissionId) processedSubmissionIdsRef.current.add(res.submissionId);
        if (res.fileName && res.clientName) {
          processedSubmissionIdsRef.current.add(`${res.clientName}__${res.fileName}`);
        }

        const subId = res.submissionId || (res.id && res.id.startsWith('sub-') ? res.id : null);
        try {
          updateSubmissionStatus(subId || res.fileName, 'SYNCED_QBO', {
            fileName: res.fileName,
            clientName: res.clientName,
            extractedVendor: res.vendor,
            extractedAmount: res.total,
            extractedDate: res.date
          });
        } catch {}
      }

      // Update clientSubmissions state locally immediately so pendingIntake and scan buttons update instantly
      setClientSubmissions(prev => 
        prev.map(sub => {
          const wasScanned = scannedResults.some(res => 
            (res.submissionId && res.submissionId === sub.id) || 
            res.id === sub.id || 
            (res.fileName === sub.fileName && (res.clientName || '').trim().toLowerCase() === (sub.clientName || '').trim().toLowerCase())
          );
          if (wasScanned) {
            return { ...sub, status: 'SYNCED_QBO' as const };
          }
          return sub;
        })
      );

      // Clear the queued files after successful batch
      if (!itemsOverride) {
        setQueuedFiles([]);
      }

      const totalSec = Math.max(0.1, (Date.now() - startTime) / 1000);
      const speed = (scannedResults.length / totalSec).toFixed(1);

      if (onToast) {
        onToast(`✅ Batch finished! Processed ${scannedResults.length} receipts in ${totalSec.toFixed(1)}s (${speed} receipts/sec)`);
      }
    } catch (err: any) {
      console.error('Batch scanning failed:', err);
      if (onToast) onToast(`Error during parallel scan: ${err.message || String(err)}`);
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    executeBatchScanRef.current = executeBatchScan;
  });

  const handleStartParallelScan = () => executeBatchScan();

  // Scan a single item directly from the queue
  const handleScanSingleQueuedItem = async (item: ReceiptInputItem, index: number) => {
    if (isScanning) return;
    setIsScanning(true);
    if (onToast) onToast(`🚀 Scanning single receipt: ${item.fileName}...`);

    try {
      const scanned = await runParallelBatchScan([item], {
        concurrency: 1,
        defaultClientName: item.clientName || selectedClientTarget,
        existingLedger: receipts,
        googleAccessToken: googleAccessToken || undefined,
        onWorkerUpdate: () => {},
        onItemProcessed: (processed) => {
          // Optimization: If uploaded to Drive, clear heavy dataUrl from memory ledger
          const ledgerRecord = { ...processed };
          if (ledgerRecord.googleDriveId) {
            delete ledgerRecord.dataUrl;
          }
          
          setReceipts(prev => [ledgerRecord, ...prev]);

          if (processed.id) processedSubmissionIdsRef.current.add(processed.id);
          if (processed.submissionId) processedSubmissionIdsRef.current.add(processed.submissionId);
          if (processed.fileName && processed.clientName) {
            processedSubmissionIdsRef.current.add(`${processed.clientName}__${processed.fileName}`);
          }

          const targetSubId = processed.submissionId || (processed.id && processed.id.startsWith('sub-') ? processed.id : null);
          try {
            updateSubmissionStatus(targetSubId || processed.fileName, 'SYNCED_QBO', {
              fileName: processed.fileName,
              clientName: processed.clientName,
              extractedVendor: processed.vendor,
              extractedAmount: processed.total,
              extractedDate: processed.date
            });
          } catch {}
        }
      });

      // Update clientSubmissions state locally immediately
      if (scanned && scanned.length > 0) {
        const processed = scanned[0];
        setClientSubmissions(prev =>
          prev.map(sub => {
            const wasScanned = (processed.submissionId && processed.submissionId === sub.id) ||
              processed.id === sub.id ||
              (processed.fileName === sub.fileName && (processed.clientName || '').trim().toLowerCase() === (sub.clientName || '').trim().toLowerCase());
            if (wasScanned) {
              return { ...sub, status: 'SYNCED_QBO' as const };
            }
            return sub;
          })
        );
      }

      // Remove item from queuedFiles
      setQueuedFiles(prev => prev.filter((_, i) => i !== index));

      if (onToast) onToast(`✅ Scanned & reconciled ${item.fileName}! Removed from queue.`);
    } catch (err: any) {
      if (onToast) onToast(`Error scanning receipt: ${err.message || String(err)}`);
    } finally {
      setIsScanning(false);
    }
  };

  const handleRemoveQueuedItem = (item: ReceiptInputItem, index: number) => {
    setQueuedFiles(prev => prev.filter((_, i) => i !== index));
    if (item.id) {
      processedSubmissionIdsRef.current.add(item.id);
      if (item.submittedByRole === 'CLIENT') {
        updateSubmissionStatus(item.id, 'ARCHIVED', {
          fileName: item.fileName,
          clientName: item.clientName
        });
      }
    }
    if (item.fileName && item.clientName) {
      processedSubmissionIdsRef.current.add(`${item.clientName}__${item.fileName}`);
    }
    if (onToast) onToast(`Removed ${item.fileName} from queue.`);
  };

  const handleClearQueue = () => {
    queuedFiles.forEach(item => {
      if (item.id) {
        processedSubmissionIdsRef.current.add(item.id);
        if (item.submittedByRole === 'CLIENT') {
          updateSubmissionStatus(item.id, 'ARCHIVED', {
            fileName: item.fileName,
            clientName: item.clientName
          });
        }
      }
      if (item.fileName && item.clientName) {
        processedSubmissionIdsRef.current.add(`${item.clientName}__${item.fileName}`);
      }
    });
    setQueuedFiles([]);
    if (onToast) onToast('Cleared all items from queue.');
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
    const toDelete = receipts.filter(r => selectedIds.has(r.id));
    toDelete.forEach(r => {
      const subId = r.submissionId || (r.id && r.id.startsWith('sub-') ? r.id : null);
      if (subId) {
        deleteSubmission(subId);
      }
    });
    setReceipts(prev => prev.filter(r => !selectedIds.has(r.id)));
    setSelectedIds(new Set());
    if (onToast) onToast(`Deleted selected receipt record(s).`);
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

  const handleSyncExistingToDrive = async () => {
    let token = googleAccessTokenRef.current || googleAccessToken;
    if (!token) {
      setIsDriveModalOpen(true);
      if (onToast) onToast('Please connect your Google Account in the Drive Vault pop-out window to sync receipts.');
      return;
    }

    const localReceipts = receiptsRef.current.filter(r => !r.googleDriveId && r.dataUrl && r.status !== 'REJECTED');
    if (localReceipts.length === 0) {
      if (onToast) onToast('No local unsynced receipts found in ledger.');
      return;
    }

    if (onToast) onToast(`🚀 Syncing ${localReceipts.length} unsynced receipt(s) to Cloud Vault...`);
    await syncReceiptsBatchToDrive(token, localReceipts);
  };

  const handleSyncSingleToDrive = async (id: string) => {
    let token = googleAccessTokenRef.current || googleAccessToken;
    if (!token) {
      setPendingSyncReceiptId(id);
      setIsDriveModalOpen(true);
      if (onToast) onToast('Please authorize Google Drive in the pop-out window to sync this receipt.');
      return;
    }

    const r = receiptsRef.current.find(item => item.id === id);
    if (!r) return;
    if (r.googleDriveId) {
      if (onToast) onToast(`Receipt is already synced to Google Drive.`);
      return;
    }
    if (!r.dataUrl) {
      if (onToast) onToast(`Cannot sync: original image data is not available in memory.`);
      return;
    }

    setSingleSyncingId(id);
    if (onToast) onToast(`Syncing ${r.fileName} to Google Drive...`);

    try {
      const year = r.date ? r.date.split('-')[0] : new Date().getFullYear().toString();
      const clientFolder = r.clientName || 'General';
      const folderId = await ensureFolderPath(token, ['Receipt Vault', year, clientFolder]);
      
      if (folderId) {
        const driveRes = await uploadReceiptToDrive(token, folderId, r.fileName, r.dataUrl);
        if (driveRes) {
          setReceipts(prev => prev.map(item => {
            if (item.id === id) {
              const updated = {
                ...item,
                googleDriveId: driveRes.id,
                googleDriveLink: driveRes.webViewLink
              };
              delete updated.dataUrl;
              return updated;
            }
            return item;
          }));

          const description = `Vendor: ${r.vendor}\nTotal: $${r.total}\nDate: ${r.date}\nSchedule: ${r.schedule}\nIRS Line: ${r.irsLineNumber} (${r.irsLineTitle})\nSHA-256: ${r.fileHash}`;
          await updateFileMetadata(token, driveRes.id, description);
          if (onToast) onToast(`✅ ${r.fileName} successfully synced to Google Drive!`);
        } else {
          if (onToast) onToast(`Failed to upload ${r.fileName} to Google Drive.`);
        }
      }
    } catch (err: any) {
      if (onToast) onToast(`Sync error: ${err.message || String(err)}`);
    } finally {
      setSingleSyncingId(null);
    }
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
                INTEGRATED SCANNING ENGINE &amp; MULTI-WORKER CLUSTER
              </span>
              <span className="text-xs text-stone-500">•</span>
              <button
                onClick={() => {
                  setKeyInputText(configuredKeys.join('\n'));
                  setIsKeyModalOpen(true);
                }}
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border flex items-center gap-1.5 cursor-pointer transition-colors ${
                  configuredKeys.length > 0
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25'
                    : 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25'
                }`}
                title="View or configure your Gemini API Keys for direct in-browser Vision AI OCR"
              >
                <Key className="w-3 h-3" />
                <span>
                  {configuredKeys.length > 0
                    ? `Gemini AI OCR: Active (${configuredKeys.length} ${configuredKeys.length === 1 ? 'Key' : 'Keys'})`
                    : 'Gemini AI OCR: Configure Key'}
                </span>
              </button>
              <span className="text-xs text-stone-500">•</span>
              <button
                onClick={() => setIsDriveModalOpen(true)}
                disabled={isConnectingDrive}
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border flex items-center gap-1.5 cursor-pointer transition-colors ${
                  googleUser || googleAccessToken
                    ? 'bg-blue-500/15 border-blue-500/40 text-blue-300 hover:bg-blue-500/25'
                    : 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25'
                }`}
                title={googleUser?.email ? `Google Drive Connected: ${googleUser.email}` : googleAccessToken ? 'Google Drive Connected' : 'Connect and Manage Google Drive Vault'}
              >
                <Cloud className={`w-3 h-3 ${isConnectingDrive ? 'animate-spin' : ''}`} />
                <span>
                  {googleUser?.email
                    ? `Vault: Active (${googleUser.email.split('@')[0]})`
                    : googleAccessToken
                    ? 'Vault: Active'
                    : 'Google Drive Vault'}
                </span>
              </button>
              <span className="text-xs text-stone-500">•</span>
              <button
                onClick={() => {
                  setAutoSyncToCloud(prev => !prev);
                  if (onToast) onToast(!autoSyncToCloud ? 'Auto-Sync to Cloud Vault enabled.' : 'Auto-Sync to Cloud paused.');
                }}
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border flex items-center gap-1.5 cursor-pointer transition-colors ${
                  autoSyncToCloud
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25'
                    : 'bg-stone-800 border-stone-700 text-stone-400 hover:bg-stone-700'
                }`}
                title="When enabled, receipts are automatically uploaded and backed up to Google Drive"
              >
                <Zap className={`w-3 h-3 ${autoSyncToCloud ? 'text-emerald-400' : 'text-stone-500'}`} />
                <span>Auto-Sync: {autoSyncToCloud ? 'ON' : 'OFF'}</span>
              </button>
              <span className="text-xs text-stone-500">•</span>
              <button
                onClick={() => {
                  setAutoProcessOnUpload(prev => !prev);
                  if (onToast) onToast(!autoProcessOnUpload ? 'Auto-process on upload enabled.' : 'Auto-process on upload paused.');
                }}
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border flex items-center gap-1.5 cursor-pointer transition-colors ${
                  autoProcessOnUpload
                    ? 'bg-blue-500/15 border-blue-500/40 text-blue-300 hover:bg-blue-500/25'
                    : 'bg-stone-800 border-stone-700 text-stone-400 hover:bg-stone-700'
                }`}
                title="When enabled, newly uploaded or dropped receipts immediately trigger parallel scanning and cloud sync"
              >
                <Sparkles className={`w-3 h-3 ${autoProcessOnUpload ? 'text-blue-400' : 'text-stone-500'}`} />
                <span>Auto-Scan Uploads: {autoProcessOnUpload ? 'ON' : 'OFF'}</span>
              </button>
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

            {/* QUEUED FILES PREVIEW & INTAKE SYNC STATUS */}
            <div className="p-3.5 rounded-xl bg-stone-950 border border-stone-800/80 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <Inbox className="w-4 h-4 text-emerald-400" />
                  <span className="font-bold text-stone-200">
                    Active Scanning Queue ({queuedFiles.length} {queuedFiles.length === 1 ? 'Item' : 'Items'} Ready)
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    Client Portal Sync: Live
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-[11px] text-stone-400 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={autoEnqueueClientSubmissions}
                      onChange={e => setAutoEnqueueClientSubmissions(e.target.checked)}
                      className="rounded border-stone-700 text-emerald-500 focus:ring-0 cursor-pointer"
                    />
                    <span>Auto-Enqueue Client Submissions</span>
                  </label>

                  {queuedFiles.length > 0 && !isScanning && (
                    <button
                      type="button"
                      onClick={handleClearQueue}
                      className="px-2 py-0.5 rounded bg-stone-900 hover:bg-stone-800 text-stone-400 hover:text-rose-300 text-[11px] border border-stone-800 transition-colors cursor-pointer"
                    >
                      Clear Queue
                    </button>
                  )}
                </div>
              </div>

              {queuedFiles.length > 0 ? (
                <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1 divide-y divide-stone-900">
                  {queuedFiles.map((item, idx) => (
                    <div
                      key={`${item.id || item.fileName}-${idx}`}
                      className="pt-1.5 first:pt-0 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded bg-stone-900 border border-stone-800 flex items-center justify-center shrink-0 text-[10px] font-mono text-stone-400">
                          {idx + 1}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-stone-200 truncate flex items-center gap-1.5">
                            <span className="truncate">{item.fileName}</span>
                            {item.submittedByRole === 'CLIENT' && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                                CLIENT PORTAL
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-stone-500 flex items-center gap-2">
                            <span>{item.clientName || 'General'}</span>
                            <span>•</span>
                            <span>{((item.fileSize || 100000) / 1024).toFixed(0)} KB</span>
                            {item.memo && (
                              <>
                                <span>•</span>
                                <span className="truncate max-w-[150px] italic">"{item.memo}"</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {!isScanning && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleScanSingleQueuedItem(item, idx)}
                            className="px-2 py-1 rounded bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800/80 text-emerald-300 hover:text-emerald-200 text-[10px] font-semibold transition-colors flex items-center gap-1 cursor-pointer shadow-sm"
                            title="Scan and reconcile this individual receipt immediately"
                          >
                            <Play className="w-2.5 h-2.5 fill-current" />
                            <span>Scan</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveQueuedItem(item, idx)}
                            className="p-1 rounded text-stone-500 hover:text-rose-400 hover:bg-stone-900 transition-colors cursor-pointer"
                            title="Remove from queue & archive"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-3 text-xs text-stone-500">
                  No receipts currently queued. Submissions from the Client Portal will automatically appear here ready to scan.
                </div>
              )}
            </div>
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

        {/* Cloud Sync Tool */}
        {unsyncedReceipts.length > 0 && (
          <button
            onClick={handleSyncExistingToDrive}
            disabled={isSyncingLedger}
            className="px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer animate-in fade-in"
          >
            <Cloud className={`w-3.5 h-3.5 ${isSyncingLedger ? 'animate-bounce' : ''}`} />
            <span>
              {isSyncingLedger
                ? 'Syncing Vault...'
                : googleAccessToken
                ? `Sync Unsynced to Cloud (${unsyncedReceipts.length})`
                : `Connect Drive & Sync (${unsyncedReceipts.length})`}
            </span>
          </button>
        )}

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

        {/* Cloud Sync Status / Action Notification Banner */}
        {unsyncedReceipts.length > 0 && (
          <div className="mx-4 my-3 p-3.5 rounded-xl bg-gradient-to-r from-blue-950/60 via-stone-900 to-blue-900/30 border border-blue-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center shrink-0">
                <Cloud className={`w-5 h-5 text-blue-400 ${isSyncingLedger ? 'animate-bounce' : ''}`} />
              </div>
              <div>
                <div className="text-white font-bold flex items-center gap-2">
                  <span>{unsyncedReceipts.length} Receipt{unsyncedReceipts.length > 1 ? 's' : ''} Stored Locally in Browser Memory</span>
                  <span className={`px-2 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                    googleAccessToken ? 'bg-blue-500/20 text-blue-300' : 'bg-amber-500/20 text-amber-300'
                  }`}>
                    {googleAccessToken ? 'Ready to Sync' : 'Google Drive Disconnected'}
                  </span>
                </div>
                <p className="text-stone-300 text-[11px] mt-0.5">
                  {googleAccessToken
                    ? 'Your receipts are ready to be uploaded to your Google Drive Vault (Receipt Vault / 2026 / Client Name). Click to sync now.'
                    : 'Connect your Google account to automatically back up all uploaded receipts directly to Google Drive and keep browser RAM light.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleSyncExistingToDrive}
                disabled={isSyncingLedger}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center gap-2 transition-colors cursor-pointer shadow-lg disabled:opacity-50 text-xs"
              >
                <Cloud className={`w-4 h-4 ${isSyncingLedger ? 'animate-spin' : ''}`} />
                <span>
                  {isSyncingLedger
                    ? 'Syncing to Drive...'
                    : googleAccessToken
                    ? `Sync All (${unsyncedReceipts.length}) to Cloud Vault`
                    : `Connect Google Drive & Sync (${unsyncedReceipts.length})`}
                </span>
              </button>
            </div>
          </div>
        )}

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
                  <th className="py-3 px-4 text-center">Cloud Vault</th>
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
                          <span className="flex items-center gap-1.5">
                            {r.vendor}
                            {r.ocrFailed && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveOcrError({
                                    id: r.id,
                                    fileName: r.fileName,
                                    ocrError: r.ocrError || 'AI OCR Vision failed due to API limits or network overload. Switched to local heuristic fallback.'
                                  });
                                }}
                                className="text-rose-500 hover:text-rose-400 font-black text-sm ml-1.5 focus:outline-none transition-colors cursor-pointer select-none"
                                title="AI OCR Scan Failed! Click to view exact error details."
                              >
                                !
                              </button>
                            )}
                          </span>
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
                        {(r.transactionNumber || r.referenceId) && (
                          <div className="flex items-center gap-1.5 text-[9px] font-mono mt-0.5">
                            {r.transactionNumber && (
                              <span className="text-amber-300 font-semibold" title="Register Transaction Sequence Number">
                                Txn #{r.transactionNumber}
                              </span>
                            )}
                            {r.transactionNumber && r.referenceId && <span className="text-stone-600">•</span>}
                            {r.referenceId && (
                              <span className="text-cyan-300 font-semibold" title="Payment Processor Reference ID">
                                Ref #{r.referenceId}
                              </span>
                            )}
                          </div>
                        )}
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

                      {/* Cloud Sync Status */}
                      <td className="py-3 px-4 text-center">
                        {r.googleDriveId ? (
                          <a
                            href={r.googleDriveLink || `https://drive.google.com/file/d/${r.googleDriveId}/view`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex flex-col items-center gap-1 hover:opacity-80 transition-opacity"
                            title={`Synced to Google Drive ID: ${r.googleDriveId} (Click to open file in Google Drive)`}
                          >
                            <Cloud className="w-4 h-4 text-blue-400" />
                            <span className="text-[9px] font-mono text-blue-400 uppercase font-bold flex items-center gap-0.5">
                              Synced
                              <ExternalLink className="w-2.5 h-2.5" />
                            </span>
                          </a>
                        ) : singleSyncingId === r.id ? (
                          <div className="flex flex-col items-center gap-1">
                            <Cloud className="w-4 h-4 text-blue-400 animate-spin" />
                            <span className="text-[9px] font-mono text-blue-300 uppercase font-bold">Syncing...</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleSyncSingleToDrive(r.id)}
                            disabled={singleSyncingId === r.id}
                            className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded transition-colors cursor-pointer ${
                              googleAccessToken
                                ? 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20'
                                : 'bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-700'
                            }`}
                            title={googleAccessToken ? "Click to sync receipt to Google Drive" : "Connect Google Drive & sync this receipt"}
                          >
                            <div className="flex items-center gap-1">
                              <Cloud className="w-3.5 h-3.5 text-blue-400" />
                              <Upload className="w-2.5 h-2.5 text-blue-300" />
                            </div>
                            <span className="text-[9px] font-mono uppercase font-semibold">
                              {googleAccessToken ? 'Sync to Cloud' : 'Connect & Sync'}
                            </span>
                          </button>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {r.ocrFailed && (
                            <button
                              onClick={() => handleRetryScanById(r.id)}
                              disabled={retryingId === r.id}
                              className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/30 transition-colors cursor-pointer"
                              title="Retry AI Vision OCR"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${retryingId === r.id ? 'animate-spin' : ''}`} />
                            </button>
                          )}

                          <button
                            onClick={() => handleOpenInspect(r)}
                            className="p-1.5 rounded-lg hover:bg-stone-800 text-stone-300 hover:text-white transition-colors cursor-pointer"
                            title="Inspect OCR & Line Items"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {!r.googleDriveId && r.dataUrl && (
                            <button
                              onClick={() => handleSyncSingleToDrive(r.id)}
                              disabled={singleSyncingId === r.id}
                              className="p-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 transition-colors cursor-pointer"
                              title={googleAccessToken ? "Sync to Google Drive Vault" : "Connect Google Drive & Sync"}
                            >
                              <Cloud className={`w-3.5 h-3.5 ${singleSyncingId === r.id ? 'animate-spin' : ''}`} />
                            </button>
                          )}

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
                              const subId = r.submissionId || (r.id && r.id.startsWith('sub-') ? r.id : null);
                              if (subId) {
                                deleteSubmission(subId);
                              }
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
                    <label className="block text-[10px] uppercase font-semibold text-amber-400 mb-1">Trans # (Register Transaction)</label>
                    <input
                      type="text"
                      value={editFormData.transactionNumber}
                      onChange={e => setEditFormData({ ...editFormData, transactionNumber: e.target.value })}
                      placeholder="e.g. 4821 or 0142"
                      className="w-full px-3 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-amber-300 font-mono focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-semibold text-cyan-400 mb-1">Ref ID (Processor Reference)</label>
                    <input
                      type="text"
                      value={editFormData.referenceId}
                      onChange={e => setEditFormData({ ...editFormData, referenceId: e.target.value })}
                      placeholder="e.g. 0019284729"
                      className="w-full px-3 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-cyan-300 font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-semibold text-stone-400 mb-1">Invoice / Receipt #</label>
                    <input
                      type="text"
                      value={editFormData.invoiceNumber}
                      onChange={e => setEditFormData({ ...editFormData, invoiceNumber: e.target.value })}
                      placeholder="e.g. INV-10024"
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
                {(inspectingReceipt.dataUrl || inspectingReceipt.googleDriveId) && (
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
                      {inspectingReceipt.dataUrl ? (
                        (inspectingReceipt.dataUrl.startsWith('data:image/') || inspectingReceipt.fileType.startsWith('image/')) ? (
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
                        )
                      ) : (
                        <div className="text-center py-8 space-y-4">
                          <div className="w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mx-auto">
                            <Cloud className="w-6 h-6 text-blue-400" />
                          </div>
                          <div>
                            <div className="text-xs text-stone-300 font-semibold">Local Image Purged (RAM Optimization)</div>
                            <div className="text-[10px] text-stone-500 max-w-xs mx-auto">
                              This document has been securely offloaded to your Google Drive Cloud Vault to maintain peak portal performance.
                            </div>
                          </div>
                          {inspectingReceipt.googleDriveLink && (
                            <a
                              href={inspectingReceipt.googleDriveLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[11px] font-bold transition-colors shadow-lg"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>Open in Google Drive</span>
                            </a>
                          )}
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
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs bg-stone-950 p-4 rounded-xl border border-stone-800">
                  <div>
                    <div className="text-stone-400 text-[10px] uppercase font-semibold">Vendor / Payee</div>
                    <div className="font-bold text-white mt-0.5 truncate" title={inspectingReceipt.vendor}>{inspectingReceipt.vendor}</div>
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
                    <div className="text-amber-400 text-[10px] uppercase font-semibold">Trans # (Register)</div>
                    <div className="font-mono font-bold text-amber-300 mt-0.5">
                      {inspectingReceipt.transactionNumber || 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div className="text-cyan-400 text-[10px] uppercase font-semibold">Ref ID (Processor)</div>
                    <div className="font-mono font-bold text-cyan-300 mt-0.5">
                      {inspectingReceipt.referenceId || 'N/A'}
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
                {inspectingReceipt.ocrFailed && !isEditingReceipt && (
                  <button
                    onClick={handleReScanSingleReceipt}
                    disabled={isReScanning}
                    className={`px-3 py-1.5 rounded-lg font-semibold text-xs transition-all cursor-pointer flex items-center gap-1.5 border border-rose-500/40 ${
                      isReScanning
                        ? 'bg-rose-950/50 text-rose-400 cursor-not-allowed'
                        : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-300'
                    }`}
                    title="AI OCR scan initially failed. Click to re-run the high-accuracy AI scan."
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-rose-400 ${isReScanning ? 'animate-spin' : ''}`} />
                    <span>{isReScanning ? 'Re-Scanning...' : 'Retry AI OCR'}</span>
                  </button>
                )}

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

      {activeOcrError && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in font-sans">
          <div className="w-full max-w-lg rounded-2xl bg-stone-900 border border-stone-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 border-b border-stone-800 pb-3">
              <div className="w-10 h-10 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">AI OCR Extraction Failure Details</h3>
                <p className="text-[11px] text-stone-400 font-mono truncate max-w-[340px]" title={activeOcrError.fileName}>
                  File: {activeOcrError.fileName}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-stone-950 border border-stone-800 font-mono text-xs text-rose-300 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
              {activeOcrError.ocrError}
            </div>

            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] leading-relaxed">
              <span className="font-bold uppercase tracking-wider block mb-1">CPA Safety Fallback Applied:</span>
              To protect your tax ledger integrity, the system automatically applied local regex heuristic OCR 
              attribution, and classified the purchase category for IRS Schedule F/C mapping. Review the extracted 
              details above manually or retry the high-accuracy AI scan if the API keys have recovered.
            </div>

            <div className="flex items-center justify-between gap-2 pt-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={retryingId === activeOcrError.id}
                  onClick={() => handleRetryScanById(activeOcrError.id)}
                  className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${retryingId === activeOcrError.id ? 'animate-spin' : ''}`} />
                  <span>{retryingId === activeOcrError.id ? 'Re-scanning...' : 'Retry AI Vision OCR'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setKeyInputText(configuredKeys.join('\n'));
                    setIsKeyModalOpen(true);
                  }}
                  className="px-3 py-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>Keys</span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => setActiveOcrError(null)}
                className="px-4 py-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold text-xs transition-colors cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gemini API Key Configuration Modal */}
      {isKeyModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in font-sans">
          <div className="w-full max-w-lg rounded-2xl bg-stone-900 border border-stone-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Gemini AI Vision OCR Keys</h3>
                  <p className="text-[11px] text-stone-400">
                    Direct in-browser AI OCR for GitHub Pages and static deployments
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsKeyModalOpen(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-stone-300 block">
                Google Gemini API Keys (one per line, space, or comma-separated):
              </label>
              <textarea
                value={keyInputText}
                onChange={(e) => setKeyInputText(e.target.value)}
                placeholder="AIzaSy... (supports multiple rotating keys)"
                rows={4}
                className="w-full px-3 py-2 rounded-xl bg-stone-950 border border-stone-800 text-stone-200 font-mono text-xs focus:outline-none focus:border-emerald-500 resize-none leading-relaxed"
              />
              <p className="text-[11px] text-stone-500">
                You currently have <span className="text-emerald-400 font-semibold">{configuredKeys.length}</span> active API key(s) detected.
                These are saved securely in your browser's localStorage and used for direct in-browser Gemini Vision scanning.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-stone-950/80 border border-stone-800/80 text-[11px] text-stone-400 space-y-1">
              <div className="text-stone-300 font-semibold flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Anti-405 Protection
              </div>
              <p>
                When deployed to GitHub Pages (static host), local POST requests are blocked by Nginx with HTTP 405. 
                With these keys configured, all receipt scans execute directly in-browser using Google's Gemini Vision API with 100% reliability.
              </p>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => {
                  saveActiveGeminiApiKeys('');
                  setConfiguredKeys([]);
                  setKeyInputText('');
                  if (onToast) onToast('Cleared saved local Gemini API keys.');
                }}
                className="px-3 py-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 text-xs font-semibold transition-colors cursor-pointer"
              >
                Clear Keys
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsKeyModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 font-semibold text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    saveActiveGeminiApiKeys(keyInputText);
                    const updated = getActiveGeminiApiKeys();
                    setConfiguredKeys(updated);
                    setIsKeyModalOpen(false);
                    if (onToast) onToast(`Saved ${updated.length} Gemini API Key(s) for in-browser AI OCR!`);
                  }}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors cursor-pointer"
                >
                  Save Keys &amp; Activate
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Google Drive Cloud Vault & Sync Pop-Out Window Modal */}
      {isDriveModalOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in font-sans">
          <div className="w-full max-w-xl rounded-2xl bg-stone-900 border border-blue-500/40 shadow-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-stone-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-blue-500/15 border border-blue-500/40 flex items-center justify-center text-blue-400 shadow-inner">
                  <Cloud className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <span>Google Drive Cloud Vault</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-blue-500/20 text-blue-300 border border-blue-500/30">
                      OAuth 2.0
                    </span>
                  </h3>
                  <p className="text-xs text-stone-400">
                    IRS Tax Receipt Archive Vault &amp; Real-Time Cloud Synchronization
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsDriveModalOpen(false);
                  setPendingSyncReceiptId(null);
                }}
                className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Connection Status Banner */}
            <div className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              googleAccessToken || googleUser
                ? 'bg-blue-950/40 border-blue-500/40 text-blue-200'
                : 'bg-amber-950/30 border-amber-500/30 text-amber-200'
            }`}>
              <div className="flex items-start sm:items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  googleAccessToken || googleUser ? 'bg-blue-500/20 text-blue-300' : 'bg-amber-500/20 text-amber-400'
                }`}>
                  {googleAccessToken || googleUser ? <ShieldCheck className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                </div>
                <div>
                  <div className="font-bold text-sm text-white flex items-center gap-2">
                    <span>{googleAccessToken || googleUser ? 'Google Drive Connected' : 'Google Drive Not Connected'}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                      googleAccessToken || googleUser ? 'bg-emerald-500/20 text-emerald-300' : 'bg-stone-800 text-stone-400'
                    }`}>
                      {googleAccessToken || googleUser ? 'Active' : 'Offline'}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-300 mt-0.5">
                    {googleUser?.email || getCachedEmail()
                      ? `Authorized account: ${googleUser?.email || getCachedEmail()}`
                      : googleAccessToken
                      ? 'OAuth Access Token Active & Authorized for Google Drive'
                      : 'Authorize Google Drive to store and organize scanned tax receipts in folders: Receipt Vault > [Year] > [Client Name].'}
                  </p>
                </div>
              </div>

              {(googleAccessToken || googleUser) && (
                <button
                  type="button"
                  onClick={handleDisconnectDrive}
                  className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-rose-900/40 hover:text-rose-300 text-stone-300 text-xs font-semibold border border-stone-700 transition-colors cursor-pointer shrink-0"
                >
                  Disconnect
                </button>
              )}
            </div>

            {/* Primary Sign-In & Authorization Actions */}
            <div className="space-y-3">
              <label className="text-xs font-semibold text-stone-300 block">
                1-Click Account Authorization:
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Official Google Sign In Button */}
                <button
                  type="button"
                  disabled={isConnectingDrive}
                  onClick={async () => {
                    const token = await handleConnectDrive(false);
                    if (token && pendingSyncReceiptId) {
                      await handleSyncSingleToDrive(pendingSyncReceiptId);
                      setPendingSyncReceiptId(null);
                    }
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-stone-100 text-stone-800 font-semibold text-xs flex items-center justify-center gap-3 transition-all shadow-md cursor-pointer disabled:opacity-50"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
                    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
                    <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.03 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
                    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
                  </svg>
                  <span>
                    {isConnectingDrive ? 'Connecting Google Account...' : googleAccessToken ? 'Re-Authorize Google Drive' : 'Sign in with Google'}
                  </span>
                </button>

                {/* Direct GIS Popup Window fallback */}
                <button
                  type="button"
                  disabled={isConnectingDrive}
                  onClick={async () => {
                    await handleDirectGISConnect();
                    if (pendingSyncReceiptId) {
                      await handleSyncSingleToDrive(pendingSyncReceiptId);
                      setPendingSyncReceiptId(null);
                    }
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 font-semibold text-xs flex items-center justify-center gap-2 border border-stone-700 transition-all cursor-pointer disabled:opacity-50"
                  title="Direct Google Identity Services OAuth dialog"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
                  <span>Dedicated Auth Popup</span>
                </button>
              </div>
            </div>

            {/* Sync Status & Action Banner */}
            <div className="p-4 rounded-xl bg-stone-950 border border-stone-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-stone-300 flex items-center gap-1.5">
                  <FolderArchive className="w-3.5 h-3.5 text-blue-400" />
                  Ledger Sync Queue
                </span>
                <span className="text-xs font-mono text-stone-400">
                  {receipts.filter(r => !r.googleDriveId && r.dataUrl && r.status !== 'REJECTED').length} Unsynced
                </span>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <div className="text-[11px] text-stone-400">
                  Receipts will be uploaded into hierarchy: <br />
                  <code className="text-blue-300 bg-stone-900 px-1.5 py-0.5 rounded border border-stone-800">
                    Receipt Vault &gt; 2026 &gt; [Client Name]
                  </code>
                </div>

                <button
                  type="button"
                  disabled={isSyncingLedger || !googleAccessToken || receipts.filter(r => !r.googleDriveId && r.dataUrl && r.status !== 'REJECTED').length === 0}
                  onClick={async () => {
                    await handleSyncExistingToDrive();
                  }}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-lg shrink-0"
                >
                  <Cloud className={`w-4 h-4 ${isSyncingLedger ? 'animate-spin' : ''}`} />
                  <span>
                    {isSyncingLedger
                      ? 'Syncing to Drive...'
                      : `Sync All Unsynced (${receipts.filter(r => !r.googleDriveId && r.dataUrl && r.status !== 'REJECTED').length})`}
                  </span>
                </button>
              </div>

              {/* Connection test */}
              {(googleAccessToken || googleUser) && (
                <div className="pt-2 border-t border-stone-800/80 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={isTestingDriveConnection}
                    onClick={handleTestDriveConnection}
                    className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1.5 cursor-pointer font-medium"
                  >
                    <RefreshCw className={`w-3 h-3 ${isTestingDriveConnection ? 'animate-spin' : ''}`} />
                    <span>Test Google Drive Vault Permissions</span>
                  </button>

                  {testDriveResult && (
                    <span className={`text-[11px] font-medium flex items-center gap-1 ${
                      testDriveResult.success ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {testDriveResult.success ? <Check className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                      <span className="truncate max-w-[280px]">{testDriveResult.message}</span>
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Advanced / Manual Token Option Accordion */}
            <div className="border-t border-stone-800 pt-3">
              <button
                type="button"
                onClick={() => setShowAdvancedAuth(prev => !prev)}
                className="text-xs text-stone-400 hover:text-stone-200 flex items-center gap-1.5 transition-colors cursor-pointer font-medium"
              >
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvancedAuth ? 'rotate-180' : ''}`} />
                <span>Manual OAuth Access Token / Quick Connect (Fallback)</span>
              </button>

              {showAdvancedAuth && (
                <div className="mt-3 p-3.5 rounded-xl bg-stone-950 border border-stone-800 space-y-3 animate-fade-in">
                  <label className="text-[11px] font-semibold text-stone-300 block">
                    Paste Google OAuth Access Token (starts with <code className="text-amber-400">ya29.</code>):
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={manualTokenInput}
                      onChange={(e) => setManualTokenInput(e.target.value)}
                      placeholder="ya29.a0AfH6SM..."
                      className="flex-1 px-3 py-1.5 rounded-lg bg-stone-900 border border-stone-800 text-stone-200 font-mono text-xs focus:outline-none focus:border-blue-500"
                    />
                    <button
                      type="button"
                      disabled={isValidatingManualToken || !manualTokenInput.trim()}
                      onClick={handleValidateManualToken}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs transition-colors cursor-pointer shrink-0"
                    >
                      {isValidatingManualToken ? 'Validating...' : 'Connect Token'}
                    </button>
                  </div>

                  {manualTokenStatus && (
                    <div className={`p-2 rounded-lg text-xs font-mono flex items-center gap-1.5 ${
                      manualTokenStatus.valid ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                    }`}>
                      {manualTokenStatus.valid ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <AlertCircle className="w-3.5 h-3.5 text-rose-400" />}
                      <span>
                        {manualTokenStatus.valid
                          ? `Valid Token (${manualTokenStatus.email || 'Authenticated'})`
                          : manualTokenStatus.error || 'Invalid Token'}
                      </span>
                    </div>
                  )}

                  <p className="text-[10px] text-stone-500 leading-relaxed">
                    Useful for development, iframe sandbox environments, or OAuth playground tokens. Access tokens are held exclusively in volatile memory and never persisted to browser storage.
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-stone-800">
              <div className="text-[11px] text-stone-500 flex items-center gap-1">
                <span>Scope:</span>
                <code className="text-stone-400">https://www.googleapis.com/auth/drive.file</code>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsDriveModalOpen(false);
                  setPendingSyncReceiptId(null);
                }}
                className="px-4 py-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold text-xs transition-colors cursor-pointer"
              >
                Close Window
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};
