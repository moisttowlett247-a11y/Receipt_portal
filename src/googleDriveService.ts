/**
 * Google Drive API Service
 * Handles cloud storage for receipt images and forensic metadata
 */

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API_BASE = 'https://www.googleapis.com/upload/drive/v3';

/**
 * Searches for a folder by name and parent.
 * Returns the folder ID if found.
 */
export async function findFolder(accessToken: string, name: string, parentId?: string): Promise<string | null> {
  let query = `name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  }

  const resp = await fetch(`${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.warn('Drive Search Error:', err);
    return null;
  }

  const data = await resp.json();
  return data.files && data.files.length > 0 ? data.files[0].id : null;
}

/**
 * Creates a folder in Google Drive.
 */
export async function createFolder(accessToken: string, name: string, parentId?: string): Promise<string | null> {
  const metadata = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
    parents: parentId ? [parentId] : []
  };

  const resp = await fetch(`${DRIVE_API_BASE}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(metadata)
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.warn('Drive Create Error:', err);
    return null;
  }

  const data = await resp.json();
  return data.id;
}

/**
 * Ensures a specific folder path exists and returns the leaf folder ID.
 * Path format: ['Receipt Portal', '2026', 'Client Name']
 */
export async function ensureFolderPath(accessToken: string, pathSegments: string[]): Promise<string | null> {
  let currentParentId: string | undefined = undefined;

  for (const segment of pathSegments) {
    const foundId = await findFolder(accessToken, segment, currentParentId);
    if (foundId) {
      currentParentId = foundId;
    } else {
      const newId = await createFolder(accessToken, segment, currentParentId);
      if (!newId) return null;
      currentParentId = newId;
    }
  }

  return currentParentId || null;
}

/**
 * Uploads a receipt image to a specific Drive folder.
 */
export async function uploadReceiptToDrive(
  accessToken: string,
  folderId: string,
  fileName: string,
  dataUrl: string
): Promise<{ id: string; webViewLink: string } | null> {
  // Extract base64 and mime
  const parts = dataUrl.split('base64,');
  if (parts.length !== 2) return null;
  const mimeType = parts[0].replace('data:', '').replace(';', '');
  const base64Data = parts[1];

  // Convert base64 to Blob
  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: mimeType });

  // Multipart upload (Metadata + Content)
  const metadata = {
    name: fileName,
    parents: [folderId]
  };

  const formData = new FormData();
  formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  formData.append('file', blob);

  const resp = await fetch(`${UPLOAD_API_BASE}/files?uploadType=multipart&fields=id,webViewLink`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.warn('Drive Upload Error:', err);
    return null;
  }

  return await resp.json();
}

/**
 * Updates a file with forensic metadata as a description
 */
export async function updateFileMetadata(
  accessToken: string,
  fileId: string,
  description: string
): Promise<boolean> {
  const resp = await fetch(`${DRIVE_API_BASE}/files/${fileId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ description })
  });
  return resp.ok;
}
