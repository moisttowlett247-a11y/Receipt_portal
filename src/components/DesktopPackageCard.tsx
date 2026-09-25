import React, { useState } from 'react';
import {
  Download,
  Terminal,
  FileCode,
  FolderArchive,
  CheckCircle2,
  ChevronRight,
  Server,
  Layers,
  Cpu,
  Check
} from 'lucide-react';
import {
  downloadFullBundleZip,
  triggerFileDownload
} from '../bundleDownloadService';

interface DesktopPackageCardProps {
  onOpenModal: () => void;
  onToast?: (msg: string) => void;
}

export const DesktopPackageCard: React.FC<DesktopPackageCardProps> = ({
  onOpenModal,
  onToast,
}) => {
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [downloadedBat, setDownloadedBat] = useState(false);
  const [downloadedPy, setDownloadedPy] = useState(false);
  const [downloadedVmSh, setDownloadedVmSh] = useState(false);

  const handleDownloadZip = async () => {
    setDownloadingZip(true);
    try {
      await downloadFullBundleZip();
      if (onToast) onToast('Central Engine & Multi-VM Cluster package (.zip) downloaded successfully!');
      setTimeout(() => setDownloadingZip(false), 1200);
    } catch {
      setDownloadingZip(false);
    }
  };

  const handleDownloadBat = () => {
    triggerFileDownload('/run_receipt_processor.bat', 'run_receipt_processor.bat');
    setDownloadedBat(true);
    if (onToast) onToast('Downloaded run_receipt_processor.bat (Operator Workstation GUI)');
    setTimeout(() => setDownloadedBat(false), 2500);
  };

  const handleDownloadPy = () => {
    triggerFileDownload('/receipt_processor.py', 'receipt_processor.py');
    setDownloadedPy(true);
    if (onToast) onToast('Downloaded receipt_processor.py (Dual GUI + Headless VM Engine)');
    setTimeout(() => setDownloadedPy(false), 2500);
  };

  const handleDownloadVmSh = () => {
    triggerFileDownload('/run_vm_worker.sh', 'run_vm_worker.sh');
    setDownloadedVmSh(true);
    if (onToast) onToast('Downloaded run_vm_worker.sh (Headless Linux VM Launcher)');
    setTimeout(() => setDownloadedVmSh(false), 2500);
  };

  return (
    <div className="rounded-2xl bg-gradient-to-r from-stone-900 via-stone-900 to-amber-950/20 border border-stone-800 p-5 shadow-xl">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="space-y-2 max-w-2xl">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
              <Server className="w-3 h-3" />
              CENTRAL OPERATOR & VM CLUSTER ENGINE
            </span>
            <span className="text-xs text-stone-500">•</span>
            <span className="text-xs text-stone-400 font-mono">v1.0.0 Dual-Mode</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
              <Cpu className="w-3 h-3" />
              Multi-VM Concurrency Ready
            </span>
          </div>

          <h3 className="text-base font-bold text-white flex items-center gap-2">
            Download Central Engine & Virtual Machine Worker Bundle
          </h3>

          <p className="text-xs text-stone-300 leading-relaxed">
            Run the processing engine locally on your main workstation with the <strong className="text-amber-400">visual GUI</strong>, or scale across <strong className="text-emerald-400">multiple headless Virtual Machines (VM nodes)</strong> pointing to a shared directory. 
            Clients submit documents via the web portal or email while you manage all processing centrally.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-stone-400 font-mono">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              receipt_processor.py (Dual GUI + Headless)
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              run_receipt_processor.bat (Workstation GUI)
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              run_vm_worker.sh (Linux/Cloud VM Node)
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              run_vm_worker.bat (Windows VM Node)
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              README_VM_CLUSTER.txt
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row lg:flex-col gap-2.5 shrink-0 justify-center">
          <button
            onClick={handleDownloadZip}
            disabled={downloadingZip}
            className="px-5 py-2.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95 whitespace-nowrap"
          >
            <FolderArchive className="w-4 h-4" />
            <span>{downloadingZip ? 'Packaging ZIP...' : 'Download Full Operator & VM Bundle (.ZIP)'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadBat}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                downloadedBat
                  ? 'bg-emerald-950/70 border-emerald-700 text-emerald-300'
                  : 'bg-stone-800 hover:bg-stone-700 border-stone-700 text-stone-200'
              }`}
              title="Download Windows 1-click workstation GUI launcher"
            >
              {downloadedBat ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Saved .bat</span>
                </>
              ) : (
                <>
                  <Terminal className="w-3.5 h-3.5 text-amber-400" />
                  <span>Workstation .bat</span>
                </>
              )}
            </button>

            <button
              onClick={handleDownloadVmSh}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                downloadedVmSh
                  ? 'bg-emerald-950/70 border-emerald-700 text-emerald-300'
                  : 'bg-stone-800 hover:bg-stone-700 border-stone-700 text-stone-200'
              }`}
              title="Download headless Linux/Cloud VM worker launcher"
            >
              {downloadedVmSh ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Saved VM .sh</span>
                </>
              ) : (
                <>
                  <Server className="w-3.5 h-3.5 text-emerald-400" />
                  <span>VM Worker .sh</span>
                </>
              )}
            </button>

            <button
              onClick={onOpenModal}
              className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-400 hover:text-white transition-colors cursor-pointer"
              title="View all individual files and VM scripts in package"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
