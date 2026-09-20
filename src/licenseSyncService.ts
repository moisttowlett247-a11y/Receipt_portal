import { LicenseKeyRecord } from './types';
import { computeSha256Hex } from './hashUtils';
import { getEffectiveStatus } from './githubSyncService';

export const CLOUDFLARE_WORKER_URL = 'https://receipt-license-api.moisttowlett247.workers.dev';

export interface ServerLicenseItem {
  hash: string;
  key?: string;
  clientName?: string;
  clientEmail?: string;
  plan?: string;
  status?: string;
  expires?: string;
  issued?: string;
  hwid?: string | null;
  inUse?: boolean;
  updatedAt?: string;
}

export interface CloudflareLicenseRecord {
  key: string;
  plan?: string;
  status?: string;
  expires?: string;
  user_email?: string;
  created_at?: string;
  hwid?: string | null;
  last_ip?: string | null;
  last_seen_at?: string | null;
  first_activated_machine?: string | null;
  first_activated_at?: string | null;
  last_location?: string | null;
  last_machine?: string | null;
}

/**
 * Syncs a key to the Cloudflare Worker KV database
 */
export async function syncKeyToCloudflare(
  k: LicenseKeyRecord,
  action: 'UPSERT' | 'DELETE'
): Promise<{ success: boolean; message?: string }> {
  try {
    if (action === 'DELETE') {
      const resp = await fetch(`${CLOUDFLARE_WORKER_URL}/api/admin/licenses/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: k.key, action: 'REVOKE' })
      });
      if (resp.ok) {
        return { success: true, message: `Revoked ${k.key} in Cloudflare KV` };
      }
    } else {
      const effectiveStatus = getEffectiveStatus(k);
      const resp = await fetch(`${CLOUDFLARE_WORKER_URL}/api/admin/licenses/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: k.key,
          plan: k.plan,
          status: effectiveStatus,
          expires: k.expiresDate || 'Never (Lifetime / Non-Expiring)',
          email: k.clientEmail || '',
          hwid: k.hardwareId || null
        })
      });
      if (resp.ok) {
        return { success: true, message: `Synced ${k.key} to Cloudflare KV` };
      }
    }
  } catch (err) {
    console.warn('Cloudflare KV sync warning:', err);
  }
  return { success: false, message: 'Cloudflare sync skipped or unreachable' };
}

/**
 * Unlocks the HWID on Cloudflare KV so a user can transfer to a new PC
 */
export async function unlockHwidOnCloudflare(key: string): Promise<{ success: boolean; message?: string }> {
  try {
    const resp = await fetch(`${CLOUDFLARE_WORKER_URL}/api/admin/licenses/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, action: 'UNLOCK_HWID' })
    });
    if (resp.ok) {
      const data = await resp.json();
      return { success: true, message: data.message || `HWID unlocked for ${key}` };
    }
  } catch (err) {
    console.warn('Error unlocking HWID on Cloudflare:', err);
  }
  return { success: false, message: 'Failed to unlock HWID on Cloudflare' };
}

/**
 * Revokes a key on Cloudflare KV
 */
export async function revokeLicenseOnCloudflare(key: string): Promise<{ success: boolean; message?: string }> {
  try {
    const resp = await fetch(`${CLOUDFLARE_WORKER_URL}/api/admin/licenses/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, action: 'REVOKE' })
    });
    if (resp.ok) {
      const data = await resp.json();
      return { success: true, message: data.message || `License ${key} revoked on Cloudflare` };
    }
  } catch (err) {
    console.warn('Error revoking license on Cloudflare:', err);
  }
  return { success: false, message: 'Failed to revoke license on Cloudflare' };
}

/**
 * Fetches all licenses with real-time telemetry from Cloudflare KV
 */
export async function fetchCloudflareLicenses(): Promise<CloudflareLicenseRecord[]> {
  try {
    const resp = await fetch(`${CLOUDFLARE_WORKER_URL}/api/admin/licenses`, {
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data && Array.isArray(data.licenses)) {
        return data.licenses;
      }
    }
  } catch (err) {
    console.warn('Error fetching licenses from Cloudflare:', err);
  }
  return [];
}

/**
 * Checks Cloudflare Worker health and database connection
 */
export async function fetchCloudflareHealth(): Promise<{ online: boolean; ip?: string; location?: string; hasDb?: boolean }> {
  try {
    const resp = await fetch(`${CLOUDFLARE_WORKER_URL}/api/health`, {
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (resp.ok) {
      const data = await resp.json();
      return {
        online: data.status === 'ONLINE',
        ip: data.your_ip,
        location: data.location,
        hasDb: Boolean(data.has_database)
      };
    }
  } catch (err) {
    console.warn('Cloudflare health check failed:', err);
  }
  return { online: false };
}

/**
 * Pushes or deletes a license record directly to the website backend (/api/licenses/sync)
 * and simultaneously synchronizes to Cloudflare KV.
 */
export async function syncKeyToServer(
  k: LicenseKeyRecord,
  action: 'UPSERT' | 'DELETE'
): Promise<{ success: boolean; message?: string }> {
  // 1. Sync to Cloudflare KV Edge API in parallel
  syncKeyToCloudflare(k, action).catch(err => {
    console.warn('Cloudflare background sync notice:', err);
  });

  // 2. Sync to local Express/Vite backend
  try {
    const hash = await computeSha256Hex(k.key);
    const payload = {
      action,
      key: k.key,
      hash,
      record: action === 'UPSERT' ? {
        key: k.key,
        clientName: k.clientName,
        clientEmail: k.clientEmail,
        status: getEffectiveStatus(k),
        plan: k.plan,
        expires: k.expiresDate,
        issued: k.issuedDate,
        hwid: k.hardwareId || null,
        inUse: k.inUse
      } : undefined
    };

    const resp = await fetch('/api/licenses/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (resp.ok) {
      const data = await resp.json();
      return { success: true, message: data.message };
    }
  } catch (err) {
    console.warn('Unable to sync license to server API (will retry on next status change):', err);
  }
  return { success: false, message: 'Server sync failed' };
}

/**
 * Fetches all license records currently stored on the backend server.
 */
export async function fetchAllServerLicenses(): Promise<ServerLicenseItem[]> {
  try {
    const resp = await fetch('/api/licenses/all');
    if (resp.ok) {
      const data = await resp.json();
      if (data.success && Array.isArray(data.licenses)) {
        return data.licenses;
      }
    }
  } catch (err) {
    console.warn('Unable to fetch licenses from server:', err);
  }
  return [];
}

/**
 * Syncs all given keys to the website server and Cloudflare on initial dashboard mount
 */
export async function batchSyncKeysToServer(keys: LicenseKeyRecord[]): Promise<void> {
  if (!keys || keys.length === 0) return;
  try {
    for (const k of keys) {
      await syncKeyToServer(k, 'UPSERT');
    }
  } catch (err) {
    console.warn('Batch sync notice:', err);
  }
}

