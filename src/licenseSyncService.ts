import { LicenseKeyRecord } from './types';
import { computeSha256Hex } from './hashUtils';
import { getEffectiveStatus } from './githubSyncService';

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

/**
 * Pushes or deletes a license record directly to the website backend (/api/licenses/sync)
 * so that any local desktop receipt processor running remotely or locally receives real-time updates.
 */
export async function syncKeyToServer(
  k: LicenseKeyRecord,
  action: 'UPSERT' | 'DELETE'
): Promise<{ success: boolean; message?: string }> {
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
 * Syncs all given keys to the website server on initial dashboard mount
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
