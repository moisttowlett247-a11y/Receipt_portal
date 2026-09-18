import JSZip from 'jszip';
import {
  RECEIPT_PROCESSOR_PY,
  RUN_RECEIPT_PROCESSOR_BAT,
  RUN_RECEIPT_PROCESSOR_SH,
  REQUIREMENTS_TXT,
  ENV_EXAMPLE,
  README_DESKTOP_APP_TXT,
} from './embeddedDesktopFiles';

export interface BundleFileItem {
  id: string;
  name: string;
  path: string;
  type: 'script' | 'bat' | 'sh' | 'requirements' | 'config' | 'doc';
  description: string;
  recommendedFor: string;
  sizeEstimate: string;
  isExecutableOrBatch?: boolean;
  mimeType: string;
}

export const EMBEDDED_FILES: Record<string, { content: string; name: string; mimeType: string }> = {
  bat: {
    name: 'run_receipt_processor.bat',
    content: RUN_RECEIPT_PROCESSOR_BAT,
    mimeType: 'application/x-bat;charset=utf-8',
  },
  py: {
    name: 'receipt_processor.py',
    content: RECEIPT_PROCESSOR_PY,
    mimeType: 'text/x-python;charset=utf-8',
  },
  sh: {
    name: 'run_receipt_processor.sh',
    content: RUN_RECEIPT_PROCESSOR_SH,
    mimeType: 'application/x-sh;charset=utf-8',
  },
  req: {
    name: 'requirements.txt',
    content: REQUIREMENTS_TXT,
    mimeType: 'text/plain;charset=utf-8',
  },
  env: {
    name: '.env.example',
    content: ENV_EXAMPLE,
    mimeType: 'text/plain;charset=utf-8',
  },
  doc: {
    name: 'README_DESKTOP_APP.txt',
    content: README_DESKTOP_APP_TXT,
    mimeType: 'text/plain;charset=utf-8',
  },
};

export const BUNDLE_FILES: BundleFileItem[] = [
  {
    id: 'bat',
    name: 'run_receipt_processor.bat',
    path: '/run_receipt_processor.bat',
    type: 'bat',
    description: '1-Click Windows launcher. Automatically checks Python PATH, installs dependencies, and boots GUI.',
    recommendedFor: 'Windows 10 / 11 Users',
    sizeEstimate: '~2.3 KB',
    isExecutableOrBatch: true,
    mimeType: 'application/x-bat;charset=utf-8',
  },
  {
    id: 'py',
    name: 'receipt_processor.py',
    path: '/receipt_processor.py',
    type: 'script',
    description: 'Core desktop application with Tkinter GUI, Gemini OCR, QuickBooks Online sync, and live license checker.',
    recommendedFor: 'All Operating Systems (Windows, macOS, Linux)',
    sizeEstimate: '~142 KB',
    mimeType: 'text/x-python;charset=utf-8',
  },
  {
    id: 'sh',
    name: 'run_receipt_processor.sh',
    path: '/run_receipt_processor.sh',
    type: 'sh',
    description: '1-Click Shell launcher for macOS and Linux. Configures environment and launches Python desktop app.',
    recommendedFor: 'macOS & Ubuntu / Linux Users',
    sizeEstimate: '~1.1 KB',
    isExecutableOrBatch: true,
    mimeType: 'application/x-sh;charset=utf-8',
  },
  {
    id: 'req',
    name: 'requirements.txt',
    path: '/requirements.txt',
    type: 'requirements',
    description: 'Python package manifest (Pillow for image processing, requests, python-dotenv, cryptography).',
    recommendedFor: 'pip install -r requirements.txt',
    sizeEstimate: '~140 B',
    mimeType: 'text/plain;charset=utf-8',
  },
  {
    id: 'env',
    name: '.env.example',
    path: '/.env.example',
    type: 'config',
    description: 'Environment template for Gemini OCR API key and optional email IMAP credentials.',
    recommendedFor: 'Configuration Template',
    sizeEstimate: '~650 B',
    mimeType: 'text/plain;charset=utf-8',
  },
  {
    id: 'doc',
    name: 'README_DESKTOP_APP.txt',
    path: '/README_DESKTOP_APP.txt',
    type: 'doc',
    description: 'Setup instructions, system requirements, troubleshooting tips, and license activation walkthrough.',
    recommendedFor: 'Quickstart & Documentation',
    sizeEstimate: '~1.8 KB',
    mimeType: 'text/plain;charset=utf-8',
  }
];

/**
 * Returns raw Python script content directly from memory
 */
export function getReceiptProcessorPyCode(): string {
  return EMBEDDED_FILES.py.content;
}

/**
 * Robust asset URL resolver that works on root domains, subpaths (like GitHub Pages /Receipt_portal/),
 * and local development setups.
 */
export function resolveAssetUrl(filePath: string): string {
  const clean = filePath.replace(/^\/+/, '');
  if (typeof window !== 'undefined') {
    const pathname = window.location.pathname;
    const match = pathname.match(/^\/([^/]+)/);
    if (match && match[1] && !match[1].includes('.') && match[1].toLowerCase() === 'receipt_portal') {
      return `/${match[1]}/${clean}`;
    }
  }
  const base = (typeof import.meta !== 'undefined' && (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL) || './';
  const cleanBase = base.endsWith('/') ? base : `${base}/`;
  return `${cleanBase}${clean}`;
}

/**
 * Helper to trigger file download in browser
 */
function triggerBlobDownload(href: string, filename: string): void {
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  link.setAttribute('download', filename);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    if (document.body.contains(link)) {
      document.body.removeChild(link);
    }
  }, 300);
}

/**
 * Triggers a guaranteed browser file download.
 * If the filename or path matches any embedded desktop bundle file,
 * it creates a local Blob immediately so the download NEVER fails,
 * even if the user is offline, on GitHub Pages with subpaths, or if static routes 404.
 */
export function triggerFileDownload(urlOrPath: string, filename: string): void {
  // 1. Check if we have embedded content for this file
  const matchedKey = Object.keys(EMBEDDED_FILES).find(k => {
    const item = EMBEDDED_FILES[k];
    return item.name.toLowerCase() === filename.toLowerCase() ||
           urlOrPath.toLowerCase().endsWith(item.name.toLowerCase());
  });

  if (matchedKey) {
    const item = EMBEDDED_FILES[matchedKey];
    const blob = new Blob([item.content], { type: item.mimeType });
    const blobUrl = URL.createObjectURL(blob);
    triggerBlobDownload(blobUrl, item.name);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    return;
  }

  // 2. If it's already a blob: or data: URL, trigger directly
  if (urlOrPath.startsWith('blob:') || urlOrPath.startsWith('data:')) {
    triggerBlobDownload(urlOrPath, filename);
    return;
  }

  // 3. Fallback: resolve relative path
  const resolved = resolveAssetUrl(urlOrPath);
  triggerBlobDownload(resolved, filename);
}

/**
 * Downloads the full runtime package as a zip archive containing all 6 desktop application files.
 * Generates the archive in memory via JSZip with guaranteed non-empty contents,
 * ensuring all launchers, scripts, configs, and documentation are included.
 */
export async function downloadFullBundleZip(
  onProgress?: (status: string) => void
): Promise<void> {
  onProgress?.('Preparing desktop application package...');

  try {
    onProgress?.('Packaging files into complete ZIP bundle...');
    const zip = new JSZip();

    // Add all 6 files directly from embedded verified source code
    zip.file('receipt_processor.py', EMBEDDED_FILES.py.content);
    zip.file('run_receipt_processor.bat', EMBEDDED_FILES.bat.content);
    zip.file('run_receipt_processor.sh', EMBEDDED_FILES.sh.content);
    zip.file('requirements.txt', EMBEDDED_FILES.req.content);
    zip.file('.env.example', EMBEDDED_FILES.env.content);
    zip.file('README_DESKTOP_APP.txt', EMBEDDED_FILES.doc.content);

    onProgress?.('Compressing ZIP archive (6 complete files)...');
    const contentBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    });

    onProgress?.('Starting download...');
    const blobUrl = URL.createObjectURL(contentBlob);
    triggerBlobDownload(blobUrl, 'receipt_processor_bundle.zip');
    setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
    onProgress?.('Download complete!');
  } catch (err) {
    console.error('Failed to generate bundle ZIP via JSZip:', err);
    // Fallback: try downloading the prebuilt static zip
    const staticUrl = resolveAssetUrl('receipt_processor_bundle.zip');
    triggerBlobDownload(staticUrl, 'receipt_processor_bundle.zip');
    throw err;
  }
}

