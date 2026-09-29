// Client Receipt Submission & Central Queue Service
// Provides real-time synchronization between the Client Portal and the Admin Portal Queue.
// Stores submissions in localStorage and syncs with backend server & Cloudflare KV.

import { getBackendApiUrl, getEffectiveCloudflareApiUrl } from './urlUtils';

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
}

const STORAGE_KEY = 'receipt_processor_client_submissions_v1';
const BROADCAST_CHANNEL_NAME = 'receipt_portal_submissions_broadcast';

const INITIAL_DEMO_SUBMISSIONS: ClientSubmission[] = [
  {
    id: 'sub-101',
    clientId: 'client-prairie-wind',
    clientName: 'Prairie Wind Agriculture',
    clientEmail: 'billing@prairiewind.example.com',
    fileName: 'Tractor_Supply_Hydraulic_Fluid.pdf',
    fileSize: 142850,
    fileType: 'application/pdf',
    categoryHint: 'Supplies & Materials',
    memo: 'Emergency hydraulic oil for John Deere tractor',
    uploadedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    status: 'SYNCED_QBO',
    extractedVendor: 'Tractor Supply Co.',
    extractedAmount: 249.95,
    extractedDate: new Date().toISOString().split('T')[0],
    workerNodeId: 'vm-worker-1'
  },
  {
    id: 'sub-102',
    clientId: 'client-green-acres',
    clientName: 'Green Acres Dairy Farm',
    clientEmail: 'finance@greenacresdairy.example.com',
    fileName: 'Agway_Feed_Order_March.jpg',
    fileSize: 284100,
    fileType: 'image/jpeg',
    categoryHint: 'Farm:Feed',
    memo: 'Bulk dairy cow feed shipment',
    uploadedAt: new Date(Date.now() - 3600000 * 12).toISOString(),
    status: 'SYNCED_QBO',
    extractedVendor: 'Agway Farm & Home',
    extractedAmount: 1480.00,
    extractedDate: new Date().toISOString().split('T')[0],
    workerNodeId: 'vm-worker-2'
  },
  {
    id: 'sub-103',
    clientId: 'client-prairie-wind',
    clientName: 'Prairie Wind Agriculture',
    clientEmail: 'billing@prairiewind.example.com',
    fileName: 'Shell_Diesel_Bulk_Fill.png',
    fileSize: 198400,
    fileType: 'image/png',
    categoryHint: 'Automobile:Fuel',
    memo: 'Field tractor off-road diesel fill',
    uploadedAt: new Date(Date.now() - 3600000 * 1).toISOString(),
    status: 'QUEUED',
    extractedVendor: 'Shell Oil Co.',
    extractedAmount: 432.50,
    extractedDate: new Date().toISOString().split('T')[0]
  }
];

// Broadcast channel for multi-tab/window real-time sync
let broadcastChannel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
  }
} catch {}

function notifySubmissionsChanged(submissions: ClientSubmission[], meta?: { action: string; item?: any }) {
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
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Failed to load submissions from localStorage:', err);
  }
  return INITIAL_DEMO_SUBMISSIONS;
}

export function saveClientSubmissions(submissions: ClientSubmission[], skipBroadcast = false): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(submissions));
    if (!skipBroadcast) {
      notifySubmissionsChanged(submissions, { action: 'SAVE' });
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

export function updateSubmissionStatus(
  id: string, 
  status: ClientSubmission['status'], 
  details?: Partial<ClientSubmission>
): void {
  const submissions = getClientSubmissions();
  let updatedItem: ClientSubmission | null = null;
  const updated = submissions.map(sub => {
    if (sub.id === id) {
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
    updateSubmissionOnServer(id, status, details).catch(() => {});
  }
}

export function deleteSubmission(id: string): void {
  const submissions = getClientSubmissions();
  const updated = submissions.filter(sub => sub.id !== id);
  saveClientSubmissions(updated);
  notifySubmissionsChanged(updated, { action: 'DELETE', item: { id } });

  deleteSubmissionOnServer(id).catch(() => {});
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
    syncClientSubmissionsWithBackend().then(res => {
      if (res) callback(res);
    }).catch(() => {});
  }, 4000);

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
// Server / Cloudflare KV Backend Synchronization
// ---------------------------------------------------------------------------

export async function fetchServerSubmissions(): Promise<ClientSubmission[]> {
  const endpoints = [
    getBackendApiUrl() + '/api/client/submissions',
    getEffectiveCloudflareApiUrl() + '/api/client/submissions',
    '/api/client/submissions'
  ];

  for (const url of endpoints) {
    try {
      const resp = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(4000)
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.success && Array.isArray(data.submissions)) {
          return data.submissions;
        }
      }
    } catch {}
  }
  return [];
}

export async function syncClientSubmissionsWithBackend(): Promise<ClientSubmission[] | null> {
  try {
    const serverSubs = await fetchServerSubmissions();
    if (!serverSubs || serverSubs.length === 0) {
      return null;
    }

    const localSubs = getClientSubmissions();
    const map = new Map<string, ClientSubmission>();

    // Index server subs
    for (const s of serverSubs) {
      if (s && s.id) map.set(s.id, s);
    }

    // Merge local subs (if local has new or un-synced items)
    let needsPushToServer = false;
    for (const loc of localSubs) {
      if (!loc || !loc.id) continue;
      const existing = map.get(loc.id);
      if (!existing) {
        map.set(loc.id, loc);
        needsPushToServer = true;
      } else {
        // If local status is newer or updated, keep the local version
        if (loc.status !== existing.status || loc.extractedVendor !== existing.extractedVendor) {
          map.set(loc.id, { ...existing, ...loc });
        }
      }
    }

    const merged = Array.from(map.values()).sort((a, b) => {
      const ta = new Date(a.uploadedAt || 0).getTime();
      const tb = new Date(b.uploadedAt || 0).getTime();
      return tb - ta;
    });

    // Check if changed compared to current localStorage
    const currentJson = JSON.stringify(localSubs);
    const mergedJson = JSON.stringify(merged);
    if (currentJson !== mergedJson) {
      saveClientSubmissions(merged, false);
      if (needsPushToServer) {
        batchSyncSubmissionsToServer(merged).catch(() => {});
      }
      return merged;
    }
  } catch {}
  return null;
}

async function syncSubmissionToServer(item: ClientSubmission): Promise<boolean> {
  const endpoints = [
    getBackendApiUrl() + '/api/client/submissions',
    getEffectiveCloudflareApiUrl() + '/api/client/submissions',
    '/api/client/submissions'
  ];

  for (const url of endpoints) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission: item }),
        signal: AbortSignal.timeout(5000)
      });
      if (resp.ok) return true;
    } catch {}
  }
  return false;
}

async function updateSubmissionOnServer(id: string, status: string, details?: any): Promise<boolean> {
  const endpoints = [
    `${getBackendApiUrl()}/api/client/submissions/${encodeURIComponent(id)}`,
    `${getEffectiveCloudflareApiUrl()}/api/client/submissions/${encodeURIComponent(id)}`,
    `/api/client/submissions/${encodeURIComponent(id)}`
  ];

  for (const url of endpoints) {
    try {
      const resp = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, details }),
        signal: AbortSignal.timeout(4000)
      });
      if (resp.ok) return true;
    } catch {}
  }
  return false;
}

async function deleteSubmissionOnServer(id: string): Promise<boolean> {
  const endpoints = [
    `${getBackendApiUrl()}/api/client/submissions/${encodeURIComponent(id)}`,
    `${getEffectiveCloudflareApiUrl()}/api/client/submissions/${encodeURIComponent(id)}`,
    `/api/client/submissions/${encodeURIComponent(id)}`
  ];

  for (const url of endpoints) {
    try {
      const resp = await fetch(url, {
        method: 'DELETE',
        signal: AbortSignal.timeout(4000)
      });
      if (resp.ok) return true;
    } catch {}
  }
  return false;
}

async function batchSyncSubmissionsToServer(submissions: ClientSubmission[]): Promise<boolean> {
  const endpoints = [
    getBackendApiUrl() + '/api/client/submissions/batch-sync',
    getEffectiveCloudflareApiUrl() + '/api/client/submissions/batch-sync',
    '/api/client/submissions/batch-sync'
  ];

  for (const url of endpoints) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissions }),
        signal: AbortSignal.timeout(6000)
      });
      if (resp.ok) return true;
    } catch {}
  }
  return false;
}
