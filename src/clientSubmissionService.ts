// Client Receipt Submission & Central Queue Service
// Provides real-time synchronization between the Client Portal and the Admin Portal Queue.
// Stores submissions in localStorage and syncs with backend server & Cloudflare KV.

import { getBackendApiUrl } from './urlUtils';

export interface ClientSubmission {
  id: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  dataUrl?: string; // Base64 or object URL preview
  categoryHint?: string;
  memo?: string;
  uploadedAt: string;
  status: 'QUEUED' | 'PROCESSING' | 'SYNCED_QBO' | 'ARCHIVED';
  extractedVendor?: string;
  extractedAmount?: number;
  extractedDate?: string;
  workerNodeId?: string;
  qboDocNumber?: string;
  qboSyncedAt?: string;
}

const STORAGE_KEY = 'receipt_processor_client_submissions_v1';
const DELETED_SUBMISSIONS_KEY = 'receipt_processor_deleted_submissions_v1';
const BROADCAST_CHANNEL_NAME = 'receipt_portal_submissions_broadcast';

const INITIAL_DEMO_SUBMISSIONS: ClientSubmission[] = [];

export function getDeletedSubmissionIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_SUBMISSIONS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return new Set(arr.map(String).filter(Boolean));
      }
    }
  } catch {}
  return new Set();
}

export function recordSubmissionDeleted(id: string): void {
  const cleanId = String(id || '').trim();
  if (!cleanId) return;
  const current = getDeletedSubmissionIds();
  current.add(cleanId);
  try {
    localStorage.setItem(DELETED_SUBMISSIONS_KEY, JSON.stringify(Array.from(current)));
  } catch {}
}

// Broadcast channel for multi-tab/window real-time sync
let broadcastChannel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
  }
} catch {}

function notifySubmissionsChanged(submissions: ClientSubmission[], meta?: { action: string; item?: any; items?: any[] }) {
  if (typeof window === 'undefined') return;

  // 1. Dispatch custom DOM event
  try {
    const event = new CustomEvent('client_submissions_updated', {
      detail: { submissions, ...meta }
    });
    window.dispatchEvent(event);
  } catch {}

  // 2. Dispatch broadcast message across tabs
  try {
    if (broadcastChannel) {
      broadcastChannel.postMessage({
        type: 'SUBMISSIONS_UPDATED',
        submissions,
        meta,
        timestamp: Date.now()
      });
    }
  } catch {}
}

export function getClientSubmissions(): ClientSubmission[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const deleted = getDeletedSubmissionIds();
        return parsed.filter(s => s && s.id && !deleted.has(s.id));
      }
    }
  } catch (err) {
    console.warn('Failed to load submissions from localStorage:', err);
  }
  return INITIAL_DEMO_SUBMISSIONS;
}

export function saveClientSubmissions(submissions: ClientSubmission[], skipBroadcast = false): void {
  try {
    const deleted = getDeletedSubmissionIds();
    const clean = submissions.filter(s => s && s.id && !deleted.has(s.id));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    if (!skipBroadcast) {
      notifySubmissionsChanged(clean, { action: 'SAVE' });
    }
  } catch (err) {
    console.warn('Failed to save submissions to localStorage:', err);
  }
}

export function addClientSubmission(item: Omit<ClientSubmission, 'id' | 'uploadedAt' | 'status'>): ClientSubmission {
  const submissions = getClientSubmissions();
  const newSubmission: ClientSubmission = {
    ...item,
    id: `sub-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    uploadedAt: new Date().toISOString(),
    status: 'QUEUED'
  };
  const updated = [newSubmission, ...submissions];
  saveClientSubmissions(updated);
  notifySubmissionsChanged(updated, { action: 'ADD', item: newSubmission });

  // Async sync to server
  syncSubmissionToServer(newSubmission).catch(() => {});

  return newSubmission;
}

export function addClientSubmissionsBatch(items: Array<Omit<ClientSubmission, 'id' | 'uploadedAt' | 'status'>>): ClientSubmission[] {
  if (!items || items.length === 0) return [];
  const submissions = getClientSubmissions();
  const now = new Date().toISOString();
  const newItems: ClientSubmission[] = items.map((item, idx) => ({
    ...item,
    id: `sub-${Date.now()}-${idx}-${Math.floor(Math.random() * 10000)}`,
    uploadedAt: now,
    status: 'QUEUED'
  }));

  const updated = [...newItems, ...submissions];
  saveClientSubmissions(updated, true);
  notifySubmissionsChanged(updated, { action: 'BATCH_ADD', items: newItems });

  // Sync batch to server in background
  batchSyncSubmissionsToServer(updated).catch(() => {});

  return newItems;
}

export function updateSubmissionStatus(
  id: string, 
  status: ClientSubmission['status'], 
  details?: Partial<ClientSubmission>
): void {
  const submissions = getClientSubmissions();
  let updatedItem: ClientSubmission | null = null;
  let targetId = id;

  const updated = submissions.map(sub => {
    const isIdMatch = sub.id === id || (id.startsWith('sub-') && sub.id.endsWith(id.replace('sub-', '')));
    const isFileMatch = details?.fileName && sub.fileName === details.fileName && (!details.clientName || sub.clientName === details.clientName);

    if (isIdMatch || isFileMatch) {
      targetId = sub.id;
      updatedItem = {
        ...sub,
        status,
        ...details
      };
      return updatedItem;
    }
    return sub;
  });

  saveClientSubmissions(updated);
  if (updatedItem) {
    notifySubmissionsChanged(updated, { action: 'UPDATE', item: updatedItem });
    updateSubmissionOnServer(targetId, status, details).catch(() => {});
    batchSyncSubmissionsToServer(updated).catch(() => {});
  }
}

export function deleteSubmission(id: string): void {
  const cleanId = String(id || '').trim();
  if (!cleanId) return;
  recordSubmissionDeleted(cleanId);
  const submissions = getClientSubmissions();
  const updated = submissions.filter(sub => sub.id !== cleanId && sub.fileName !== cleanId);
  saveClientSubmissions(updated, true);
  notifySubmissionsChanged(updated, { action: 'DELETE', item: { id: cleanId } });

  deleteSubmissionOnServer(cleanId).catch(() => {});
}

export function purgeDuplicateSubmissions(): number {
  const submissions = getClientSubmissions();
  const seenExact = new Set<string>();
  const seenFuzzy = new Set<string>();
  const unique: ClientSubmission[] = [];
  let purgedCount = 0;

  for (const s of submissions) {
    const exactKey = `${s.clientName}__${s.fileName}__${s.fileSize}`;
    const fuzzyKey = `${s.clientName}__${s.extractedVendor || ''}__${s.extractedAmount || 0}__${s.extractedDate || ''}`;

    if (seenExact.has(exactKey) || (s.extractedAmount && seenFuzzy.has(fuzzyKey))) {
      purgedCount++;
      continue;
    }

    seenExact.add(exactKey);
    if (s.extractedAmount) seenFuzzy.add(fuzzyKey);
    unique.push(s);
  }

  saveClientSubmissions(unique);
  notifySubmissionsChanged(unique, { action: 'PURGE', item: { purgedCount } });

  // Batch sync the purged state to server
  batchSyncSubmissionsToServer(unique).catch(() => {});

  return purgedCount;
}

// ---------------------------------------------------------------------------
// Real-time Subscription Listener Hook
// ---------------------------------------------------------------------------

export function subscribeToClientSubmissions(callback: (submissions: ClientSubmission[]) => void): () => void {
  const handleLocalUpdate = (e: any) => {
    if (e?.detail?.submissions) {
      callback(e.detail.submissions);
    } else {
      callback(getClientSubmissions());
    }
  };

  const handleStorageEvent = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        if (Array.isArray(parsed)) {
          callback(parsed);
        }
      } catch {}
    }
  };

  const handleBroadcastMessage = (e: MessageEvent) => {
    if (e.data && e.data.type === 'SUBMISSIONS_UPDATED' && Array.isArray(e.data.submissions)) {
      // Save locally to keep localStorage in sync without looping notifications
      saveClientSubmissions(e.data.submissions, true);
      callback(e.data.submissions);
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('client_submissions_updated', handleLocalUpdate);
    window.addEventListener('storage', handleStorageEvent);
    if (broadcastChannel) {
      broadcastChannel.addEventListener('message', handleBroadcastMessage);
    }
  }

  // Initial call with current local state
  callback(getClientSubmissions());

  // Perform background server sync immediately and periodically (every 4 seconds)
  syncClientSubmissionsWithBackend().then(res => {
    if (res) callback(res);
  }).catch(() => {});

  const intervalId = setInterval(() => {
    // Avoid burning network requests when tab is hidden
    if (typeof document !== 'undefined' && document.hidden) return;
    syncClientSubmissionsWithBackend().then(res => {
      if (res) callback(res);
    }).catch(() => {});
  }, 30000);

  return () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('client_submissions_updated', handleLocalUpdate);
      window.removeEventListener('storage', handleStorageEvent);
      if (broadcastChannel) {
        broadcastChannel.removeEventListener('message', handleBroadcastMessage);
      }
    }
    clearInterval(intervalId);
  };
}

// ---------------------------------------------------------------------------
// Server Backend Synchronization
// ---------------------------------------------------------------------------

function getSubmissionEndpoints(path: string = ''): string[] {
  const base = getBackendApiUrl();
  const fullPath = `/api/client/submissions${path}`;
  if (base) {
    return [`${base}${fullPath}`, fullPath];
  }
  return [fullPath];
}

export async function fetchServerSubmissions(): Promise<ClientSubmission[] | null> {
  const endpoints = getSubmissionEndpoints();

  for (const url of endpoints) {
    try {
      const resp = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(2000)
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.success && Array.isArray(data.submissions)) {
          return data.submissions;
        }
      }
    } catch {}
  }
  return null;
}

export async function syncClientSubmissionsWithBackend(): Promise<ClientSubmission[] | null> {
  try {
    const serverSubs = await fetchServerSubmissions();
    if (!serverSubs) {
      return null;
    }

    const localSubs = getClientSubmissions();
    const deletedIds = getDeletedSubmissionIds();
    const map = new Map<string, ClientSubmission>();

    // Index server subs (strictly ignoring any deleted locally)
    for (const s of serverSubs) {
      if (s && s.id && !deletedIds.has(s.id) && (!s.fileName || !deletedIds.has(s.fileName))) {
        map.set(s.id, s);
      }
    }

    // Merge local subs
    let needsPushToServer = false;
    for (const loc of localSubs) {
      if (!loc || !loc.id || deletedIds.has(loc.id) || (loc.fileName && deletedIds.has(loc.fileName))) continue;
      const existing = map.get(loc.id);
      if (!existing) {
        map.set(loc.id, loc);
        needsPushToServer = true;
      } else {
        // If local has advanced status (SYNCED_QBO, PROCESSING) or recent OCR, keep local
        if (loc.status === 'SYNCED_QBO' || loc.status === 'PROCESSING') {
          map.set(loc.id, { ...existing, ...loc });
        } else {
          map.set(loc.id, { ...loc, ...existing });
        }
      }
    }

    const merged = Array.from(map.values()).sort((a, b) => {
      const ta = new Date(a.uploadedAt || 0).getTime();
      const tb = new Date(b.uploadedAt || 0).getTime();
      return tb - ta;
    });

    const currentJson = JSON.stringify(localSubs);
    const mergedJson = JSON.stringify(merged);
    if (currentJson !== mergedJson) {
      saveClientSubmissions(merged, false);
      if (needsPushToServer && merged.length > 0) {
        batchSyncSubmissionsToServer(merged).catch(() => {});
      }
      return merged;
    }
  } catch (err) {
    console.warn('Submission sync error:', err);
  }
  return null;
}

async function syncSubmissionToServer(item: ClientSubmission): Promise<boolean> {
  const endpoints = getSubmissionEndpoints();

  for (const url of endpoints) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission: item }),
        signal: AbortSignal.timeout(3000)
      });
      if (resp.ok) return true;
    } catch {}
  }
  return false;
}

async function updateSubmissionOnServer(id: string, status: string, details?: any): Promise<boolean> {
  const endpoints = getSubmissionEndpoints(`/${encodeURIComponent(id)}`);

  for (const url of endpoints) {
    try {
      const resp = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, details }),
        signal: AbortSignal.timeout(2000)
      });
      if (resp.ok) return true;
    } catch {}
  }
  return false;
}

async function deleteSubmissionOnServer(id: string): Promise<boolean> {
  const endpoints = getSubmissionEndpoints(`/${encodeURIComponent(id)}`);

  for (const url of endpoints) {
    try {
      const resp = await fetch(url, {
        method: 'DELETE',
        signal: AbortSignal.timeout(1500)
      });
      if (resp.ok) return true;
    } catch {}
  }
  return false;
}

async function batchSyncSubmissionsToServer(submissions: ClientSubmission[]): Promise<boolean> {
  const endpoints = getSubmissionEndpoints('/batch-sync');

  for (const url of endpoints) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissions }),
        signal: AbortSignal.timeout(3000)
      });
      if (resp.ok) return true;
    } catch {}
  }
  return false;
}
