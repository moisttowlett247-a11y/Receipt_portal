import React, { useState } from 'react';
import {
  X,
  Download,
  Terminal,
  FileCode,
  FileText,
  FolderArchive,
  CheckCircle2,
  AlertCircle,
  Laptop,
  Check,
  PackageCheck,
  Server,
  Cpu,
  Layers
} from 'lucide-react';
import {
  BUNDLE_FILES,
  BundleFileItem,
  triggerFileDownload,
  downloadFullBundleZip,
} from '../bundleDownloadService';

interface DownloadBundleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onToast?: (msg: string) => void;
}

export const DownloadBundleModal: React.FC<DownloadBundleModalProps> = ({
  isOpen,
  onClose,
  onToast,
}) => {
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [downloadedItems, setDownloadedItems] = useState<Record<string, boolean>>({});

  if (!isOpen) return null;

  const handleDownloadAll = async () => {
    setDownloadingZip(true);
    setStatusMsg('Packaging files into ZIP bundle...');
    try {
      await downloadFullBundleZip((msg) => setStatusMsg(msg));
      if (onToast) onToast('Central Engine & Multi-VM Cluster package (.zip) downloaded successfully!');
      setTimeout(() => {
        setDownloadingZip(false);
        setStatusMsg(null);
      }, 1500);
    } catch {
      setStatusMsg('Download started.');
      setDownloadingZip(false);
    }
  };

  const handleDownloadSingle = (file: BundleFileItem) => {
    triggerFileDownload(file.path, file.name);
    setDownloadedItems((prev) => ({ ...prev, [file.id]: true }));
    if (onToast) onToast(`Downloaded ${file.name}`);
    setTimeout(() => {
      setDownloadedItems((prev) => ({ ...prev, [file.id]: false }));
    }, 2500);
  };

  const getIcon = (type: BundleFileItem['type']) => {
    switch (type) {
      case 'bat':
      case 'sh':
        return <Terminal className="w-4 h-4 text-emerald-400" />;
      case 'script':
        return <FileCode className="w-4 h-4 text-amber-400" />;
      case 'requirements':
      case 'config':
        return <FileText className="w-4 h-4 text-sky-400" />;
      case 'doc':
      default:
        return <FileText className="w-4 h-4 text-purple-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-stone-900 border border-stone-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-stone-800 flex items-center justify-between bg-stone-900/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Operator Engine & Multi-VM Cluster Bundle
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Ready to Deploy
                </span>
              </h3>
              <p className="text-xs text-stone-400">
                Run locally with visual GUI or scale across multiple headless Virtual Machines
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-200 hover:bg-stone-800 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* Main 1-Click Download Hero Banner */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-amber-950/40 via-stone-900 to-sky-950/30 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-white font-semibold text-sm">
                <PackageCheck className="w-4 h-4 text-amber-400" />
                Complete Operator & VM Cluster Bundle (.ZIP)
              </div>
              <p className="text-stone-300 text-[11px] leading-relaxed max-w-md">
                Contains <code className="text-amber-300">receipt_processor.py</code>,{' '}
                <code className="text-emerald-300">run_receipt_processor.bat</code>,{' '}
                <code className="text-sky-300">run_vm_worker.sh</code>,{' '}
                <code className="text-purple-300">README_VM_CLUSTER.txt</code>, and configs.
              </p>
              {statusMsg && (
                <div className="text-[11px] font-mono text-amber-400 animate-pulse pt-1">
                  ⏳ {statusMsg}
                </div>
              )}
            </div>

            <button
              onClick={handleDownloadAll}
              disabled={downloadingZip}
              className="px-4 py-2.5 rounded-xl font-bold text-xs bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap active:scale-95"
            >
              <Download className="w-4 h-4" />
              <span>{downloadingZip ? 'Packaging ZIP...' : 'Download Full ZIP Bundle'}</span>
            </button>
          </div>

          {/* Deployment Options Guide */}
          <div className="bg-stone-950/70 border border-stone-800/80 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center gap-2 text-stone-200 font-semibold text-[11px]">
              <Cpu className="w-3.5 h-3.5 text-amber-400" />
              <span>Deployment Modes (Local Workstation vs. Multi-VM):</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] text-stone-400">
              <div className="bg-stone-900/90 border border-stone-800 rounded-lg p-2.5 space-y-1">
                <span className="font-semibold text-emerald-400 flex items-center gap-1">
                  <Laptop className="w-3 h-3" />
                  Operator Workstation (GUI Mode):
                </span>
                <p>
                  Double-click <span className="font-mono text-stone-200 bg-stone-800 px-1 py-0.5 rounded">run_receipt_processor.bat</span> on Windows or run <span className="font-mono text-stone-200 bg-stone-800 px-1 py-0.5 rounded">./run_receipt_processor.sh</span>.
                  Provides the rich interactive GUI, client manager, and live activity feed.
                </p>
              </div>

              <div className="bg-stone-900/90 border border-stone-800 rounded-lg p-2.5 space-y-1">
                <span className="font-semibold text-sky-400 flex items-center gap-1">
                  <Server className="w-3 h-3" />
                  Headless VM Workers (Cloud/Server):
                </span>
                <p>
                  Run <span className="font-mono text-stone-200 bg-stone-800 px-1 py-0.5 rounded">./run_vm_worker.sh vm-01 /shared/inbox</span>.
                  Runs 24/7 without GUI or X11. Distributed atomic lockfiles prevent duplicate processing across multiple VMs.
                </p>
              </div>
            </div>
          </div>

          {/* Individual Files Manifest */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-stone-400 text-[11px] px-1 font-medium">
              <span>Included Files ({BUNDLE_FILES.length} Files):</span>
              <span>Download Individually</span>
            </div>

            <div className="divide-y divide-stone-800/80 border border-stone-800 rounded-xl overflow-hidden bg-stone-950/40">
              {BUNDLE_FILES.map((file) => {
                const isDownloaded = downloadedItems[file.id];
                return (
                  <div
                    key={file.id}
                    className="p-3 flex items-center justify-between gap-3 hover:bg-stone-800/30 transition-colors"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="p-2 rounded-lg bg-stone-900 border border-stone-800 mt-0.5">
                        {getIcon(file.type)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-stone-200 text-xs truncate">
                            {file.name}
                          </span>
                          {file.isExecutableOrBatch && (
                            <span className="text-[9px] font-semibold uppercase px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              Launcher
                            </span>
                          )}
                          <span className="text-[10px] text-stone-500 font-mono">
                            {file.sizeEstimate}
                          </span>
                        </div>
                        <p className="text-[11px] text-stone-400 truncate max-w-md pt-0.5">
                          {file.description}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDownloadSingle(file)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                        isDownloaded
                          ? 'bg-emerald-950/60 border-emerald-700 text-emerald-300'
                          : 'bg-stone-900 hover:bg-stone-800 border-stone-700 text-stone-300 hover:text-white'
                      }`}
                      title={`Download ${file.name}`}
                    >
                      {isDownloaded ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Saved</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-3.5 h-3.5 text-stone-400" />
                          <span>Download</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-stone-800 bg-stone-900/90 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] text-stone-400">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Dual Workstation GUI & Headless Multi-VM Cluster Edition</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-medium bg-stone-800 hover:bg-stone-700 text-stone-300 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
