/**
 * Google Drive API & Webhook Service
 * Handles cloud storage for receipt images, RAM offloading, and forensic metadata.
 * Supports both Google OAuth 2.0 REST API and direct Google Apps Script Webhooks.
 */

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API_BASE = 'https://www.googleapis.com/upload/drive/v3';
const WEBHOOK_STORAGE_KEY = 'receipt_processor_google_drive_webhook_url';
export const DEFAULT_DRIVE_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbw3cCABOZOkBZiljSzOWD2eBKhpu_3Y47EalOpdmGMqKqMNk4donj-heQqdcwcNEijsEg/exec';

export function getStoredDriveWebhookUrl(): string {
  try {
    const custom = localStorage.getItem(WEBHOOK_STORAGE_KEY);
    if (custom && custom.trim()) return custom.trim();
    return DEFAULT_DRIVE_WEBHOOK_URL;
  } catch {
    return DEFAULT_DRIVE_WEBHOOK_URL;
  }
}

export function saveDriveWebhookUrl(url: string): void {
  try {
    if (url.trim()) {
      localStorage.setItem(WEBHOOK_STORAGE_KEY, url.trim());
    } else {
      localStorage.removeItem(WEBHOOK_STORAGE_KEY);
    }
  } catch {}
}

export async function testWebhookConnection(webhookUrl: string): Promise<{ ok: boolean; message?: string; error?: string }> {
  try {
    const resp = await fetch(webhookUrl);
    const text = await resp.text().catch(() => '');
    if (text.includes('You need access') || text.includes('accounts.google.com') || text.includes('ServiceLogin')) {
      return {
        ok: false,
        error: 'Google Permission Needed: In your Apps Script deployment, click Deploy ➔ Manage deployments ➔ Edit (pencil icon), and set "Who has access" to "Anyone".'
      };
    }

    if (resp.ok) {
      try {
        const json = JSON.parse(text);
        if (json.status === 'ok' || json.status === 'success') {
          return { ok: true, message: 'Google Apps Script Webhook is active and connected to Receiptcheckerv@gmail.com!' };
        }
      } catch {}
      return { ok: true, message: 'Google Apps Script Webhook is active and reachable!' };
    }
    return { ok: false, error: `Webhook returned HTTP status ${resp.status}` };
  } catch (e: any) {
    return { ok: false, error: e.message || String(e) };
  }
}

/**
 * Tests if the given access token is valid and active
 */
export async function testDriveConnection(accessToken: string): Promise<{ ok: boolean; email?: string; error?: string }> {
  try {
    const resp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!resp.ok) {
      const err = await resp.text().catch(() => '');
      return { ok: false, error: `Google OAuth error (${resp.status}): ${err}` };
    }
    const data = await resp.json();
    return { ok: true, email: data.email };
  } catch (err: any) {
    return { ok: false, error: err.message || String(err) };
  }
}

/**
 * Searches for a folder by name and parent.
 * Returns the folder ID if found.
 */
export async function findFolder(accessToken: string, name: string, parentId?: string): Promise<string | null> {
  try {
    const safeName = name.replace(/'/g, "\\'");
    let query = `name = '${safeName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    if (parentId) {
      query += ` and '${parentId}' in parents`;
    }

    const resp = await fetch(`${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=files(id,name)&spaces=drive`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!resp.ok) {
      const err = await resp.text().catch(() => '');
      console.warn(`Drive Search Error (${resp.status}):`, err);
      return null;
    }

    const data = await resp.json();
    return data.files && data.files.length > 0 ? data.files[0].id : null;
  } catch (e) {
    console.warn('Drive findFolder exception:', e);
    return null;
  }
}

/**
 * Creates a folder in Google Drive.
 */
export async function createFolder(accessToken: string, name: string, parentId?: string): Promise<string | null> {
  try {
    const metadata: Record<string, any> = {
      name,
      mimeType: 'application/vnd.google-apps.folder'
    };
    if (parentId) {
      metadata.parents = [parentId];
    }

    const resp = await fetch(`${DRIVE_API_BASE}/files?fields=id,name`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(metadata)
    });

    if (!resp.ok) {
      const err = await resp.text().catch(() => '');
      console.warn(`Drive Create Folder Error (${resp.status}):`, err);
      return null;
    }

    const data = await resp.json();
    return data.id || null;
  } catch (e) {
    console.warn('Drive createFolder exception:', e);
    return null;
  }
}

/**
 * Ensures a specific folder path exists and returns the leaf folder ID.
 * Path format: ['Receipt Vault', '2026', 'Client Name']
 */
export async function ensureFolderPath(accessToken: string, pathSegments: string[]): Promise<string | null> {
  let currentParentId: string | undefined = undefined;

  for (const segment of pathSegments) {
    const cleanSegment = (segment || 'General').trim();
    const foundId = await findFolder(accessToken, cleanSegment, currentParentId);
    if (foundId) {
      currentParentId = foundId;
    } else {
      const newId = await createFolder(accessToken, cleanSegment, currentParentId);
      if (!newId) return null;
      currentParentId = newId;
    }
  }

  return currentParentId || null;
}

/**
 * Uploads a receipt image via Google Apps Script Webhook (Zero OAuth configuration)
 */
export async function uploadReceiptViaWebhook(
  webhookUrl: string,
  fileName: string,
  dataUrl: string,
  metadata: { vendor?: string; total?: number; date?: string; schedule?: string; clientName?: string }
): Promise<{ id: string; webViewLink: string } | null> {
  try {
    let cleanBase64 = dataUrl;
    let mimeType = 'image/jpeg';
    if (dataUrl.includes('base64,')) {
      const parts = dataUrl.split('base64,');
      cleanBase64 = parts[1];
      const header = parts[0];
      if (header.includes('data:')) {
        mimeType = header.replace('data:', '').replace(';', '').trim();
      }
    }

    const year = metadata.date ? metadata.date.split('-')[0] : new Date().getFullYear().toString();
    const payload = {
      action: 'upload_receipt',
      fileName,
      mimeType,
      base64: cleanBase64,
      folderPath: ['Receipt Vault', year, metadata.clientName || 'General'],
      vendor: metadata.vendor,
      total: metadata.total,
      date: metadata.date,
      schedule: metadata.schedule
    };

    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    });

    const text = await resp.text().catch(() => '');
    if (text.includes('You need access') || text.includes('accounts.google.com') || text.includes('ServiceLogin')) {
      console.warn('Webhook access denied: In your Apps Script deployment, change "Who has access" to "Anyone".');
      return null;
    }

    if (resp.ok) {
      try {
        const data = JSON.parse(text);
        if (data.status === 'error') {
          console.warn('Google Apps Script error:', data.message);
          return null;
        }
        return {
          id: data.id || `webhook_drive_${Date.now()}`,
          webViewLink: data.url || data.webViewLink || 'https://drive.google.com'
        };
      } catch {
        return {
          id: `webhook_drive_${Date.now()}`,
          webViewLink: 'https://drive.google.com'
        };
      }
    }
    return null;
  } catch (err) {
    console.warn('uploadReceiptViaWebhook exception:', err);
    return null;
  }
}

/**
 * Uploads a receipt image to a specific Drive folder via REST API.
 */
export async function uploadReceiptToDrive(
  accessToken: string,
  folderId: string,
  fileName: string,
  dataUrl: string
): Promise<{ id: string; webViewLink: string } | null> {
  try {
    let cleanBase64 = dataUrl;
    let mimeType = 'image/jpeg';
    if (dataUrl.includes('base64,')) {
      const parts = dataUrl.split('base64,');
      cleanBase64 = parts[1];
      const header = parts[0];
      if (header.includes('data:')) {
        mimeType = header.replace('data:', '').replace(';', '').trim();
      }
    }

    const metadata: Record<string, any> = {
      name: fileName,
      mimeType
    };
    if (folderId) {
      metadata.parents = [folderId];
    }

    // Convert base64 to binary byte array
    const sanitizedBase64 = cleanBase64.replace(/\s/g, '');
    const byteCharacters = atob(sanitizedBase64);
    const byteNumbers = new Uint8Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }

    // Try Multipart/Related upload
    const boundary = '-------314159265358979323846';
    const preHeader = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
    const postHeader = `\r\n--${boundary}--`;

    const multipartBlob = new Blob([preHeader, byteNumbers, postHeader], {
      type: `multipart/related; boundary=${boundary}`
    });

    const resp = await fetch(`${UPLOAD_API_BASE}/files?uploadType=multipart&fields=id,webViewLink`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: multipartBlob
    });

    if (resp.ok) {
      const data = await resp.json();
      return {
        id: data.id,
        webViewLink: data.webViewLink || `https://drive.google.com/file/d/${data.id}/view`
      };
    }

    // Fallback Method: 2-step upload
    const createResp = await fetch(`${DRIVE_API_BASE}/files?fields=id,webViewLink`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(metadata)
    });

    if (!createResp.ok) {
      return null;
    }

    const createdData = await createResp.json();
    const fileId = createdData.id;

    const blob = new Blob([byteNumbers], { type: mimeType });

    const mediaResp = await fetch(`${UPLOAD_API_BASE}/files/${fileId}?uploadType=media&fields=id,webViewLink`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': mimeType
      },
      body: blob
    });

    if (mediaResp.ok) {
      const mediaData = await mediaResp.json();
      return {
        id: mediaData.id || fileId,
        webViewLink: mediaData.webViewLink || createdData.webViewLink || `https://drive.google.com/file/d/${fileId}/view`
      };
    }

    return {
      id: fileId,
      webViewLink: createdData.webViewLink || `https://drive.google.com/file/d/${fileId}/view`
    };
  } catch (err) {
    console.error('Drive upload exception:', err);
    return null;
  }
}

/**
 * Updates a file with forensic metadata as a description
 */
export async function updateFileMetadata(
  accessToken: string,
  fileId: string,
  description: string
): Promise<boolean> {
  try {
    const resp = await fetch(`${DRIVE_API_BASE}/files/${fileId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ description })
    });
    return resp.ok;
  } catch {
    return false;
  }
}
