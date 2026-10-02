/**
 * Image Storage & RAM Offload Service
 * Uses browser IndexedDB (disk-backed storage) to offload heavy image Base64 payloads
 * keeping active React memory footprint under 2MB even with 10,000+ receipts.
 */

const DB_NAME = 'ReceiptVault_ImageDiskStore';
const STORE_NAME = 'receipt_images';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

/**
 * Offload an image dataUrl to disk (IndexedDB)
 */
export async function saveImageToDisk(id: string, dataUrl: string): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(dataUrl, id);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('saveImageToDisk warning:', e);
  }
}

/**
 * Retrieve an image from disk storage on demand (when user inspects/views receipt)
 */
export async function getImageFromDisk(id: string): Promise<string | null> {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('getImageFromDisk warning:', e);
    return null;
  }
}

/**
 * Delete image from disk once fully synced to Google Drive
 */
export async function deleteImageFromDisk(id: string): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
  } catch {}
}

/**
 * Purge entire disk store
 */
export async function clearAllImagesFromDisk(): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
  } catch {}
}
