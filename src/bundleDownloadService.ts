import JSZip from 'jszip';

export interface BundleFileItem {
  id: string;
  name: string;
  path: string;
  type: 'script' | 'bat' | 'sh' | 'requirements' | 'config' | 'doc';
  description: string;
  recommendedFor: string;
  sizeEstimate: string;
  isExecutableOrBatch?: boolean;
}

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
  },
  {
    id: 'py',
    name: 'receipt_processor.py',
    path: '/receipt_processor.py',
    type: 'script',
    description: 'Core desktop application with Tkinter GUI, Gemini OCR, QuickBooks Online sync, and live license checker.',
    recommendedFor: 'All Operating Systems (Windows, macOS, Linux)',
    sizeEstimate: '~137 KB',
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
  },
  {
    id: 'req',
    name: 'requirements.txt',
    path: '/requirements.txt',
    type: 'requirements',
    description: 'Python package manifest (Pillow for image processing, requests, python-dotenv, cryptography).',
    recommendedFor: 'pip install -r requirements.txt',
    sizeEstimate: '~140 B',
  },
  {
    id: 'env',
    name: '.env.example',
    path: '/.env.example',
    type: 'config',
    description: 'Environment template for Gemini OCR API key and optional email IMAP credentials.',
    recommendedFor: 'Configuration Template',
    sizeEstimate: '~560 B',
  },
  {
    id: 'doc',
    name: 'README_DESKTOP_APP.txt',
    path: '/README_DESKTOP_APP.txt',
    type: 'doc',
    description: 'Setup instructions, system requirements, troubleshooting tips, and license activation walkthrough.',
    recommendedFor: 'Quickstart & Documentation',
    sizeEstimate: '~1.8 KB',
  }
];

/**
 * Triggers a direct browser file download for a static URL.
 */
export function triggerFileDownload(url: string, filename: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Downloads the full runtime package as a zip archive containing all scripts,
 * launchers, requirement manifests, and configs.
 */
export async function downloadFullBundleZip(
  onProgress?: (status: string) => void
): Promise<void> {
  onProgress?.('Preparing package bundle...');

  try {
    // 1. Try downloading prebuilt static bundle first
    const prebuiltResp = await fetch('/receipt_processor_bundle.zip', { method: 'HEAD' });
    if (prebuiltResp.ok) {
      onProgress?.('Downloading prebuilt ZIP archive...');
      triggerFileDownload('/receipt_processor_bundle.zip', 'receipt_processor_bundle.zip');
      onProgress?.('Download complete!');
      return;
    }
  } catch {
    // Fall back to client-side JSZip packaging
  }

  // 2. Client-side JSZip packaging fallback
  try {
    onProgress?.('Packaging files into ZIP...');
    const zip = new JSZip();

    for (const file of BUNDLE_FILES) {
      onProgress?.(`Adding ${file.name}...`);
      try {
        const resp = await fetch(file.path);
        if (resp.ok) {
          const content = await resp.text();
          zip.file(file.name, content);
        }
      } catch (err) {
        console.warn(`Could not fetch ${file.name}:`, err);
      }
    }

    onProgress?.('Compressing ZIP archive...');
    const contentBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    });

    const blobUrl = URL.createObjectURL(contentBlob);
    triggerFileDownload(blobUrl, 'receipt_processor_bundle.zip');
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    onProgress?.('Download complete!');
  } catch (err) {
    console.error('Failed to create bundle ZIP:', err);
    // Ultimate fallback: download bat and py directly
    triggerFileDownload('/run_receipt_processor.bat', 'run_receipt_processor.bat');
    setTimeout(() => {
      triggerFileDownload('/receipt_processor.py', 'receipt_processor.py');
    }, 500);
    throw err;
  }
}
