import React, { useState } from 'react';
import {
  Download,
  Terminal,
  FileCode,
  FolderArchive,
  CheckCircle2,
  ChevronRight,
  PackageCheck,
  Check,
  Sparkles
} from 'lucide-react';
import {
  downloadFullBundleZip,
  triggerFileDownload,
  BUNDLE_FILES
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

  const handleDownloadZip = async () => {
    setDownloadingZip(true);
    try {
      await downloadFullBundleZip();
      if (onToast) onToast('Desktop application package (.zip) downloaded successfully!');
      setTimeout(() => setDownloadingZip(false), 1200);
    } catch {
      setDownloadingZip(false);
    }
  };

  const handleDownloadBat = () => {
    triggerFileDownload('/run_receipt_processor.bat', 'run_receipt_processor.bat');
    setDownloadedBat(true);
    if (onToast) onToast('Downloaded run_receipt_processor.bat');
    setTimeout(() => setDownloadedBat(false), 2500);
  };

  const handleDownloadPy = () => {
    triggerFileDownload('/receipt_processor.py', 'receipt_processor.py');
    setDownloadedPy(true);
    if (onToast) onToast('Downloaded receipt_processor.py');
    setTimeout(() => setDownloadedPy(false), 2500);
  };

  return (
    <div className="rounded-xl bg-gradient-to-r from-stone-900 via-stone-900 to-amber-950/20 border border-stone-800 p-5 shadow-lg">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="space-y-2 max-w-2xl">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
              <PackageCheck className="w-3 h-3" />
              DESKTOP RUNTIME PACKAGE
            </span>
            <span className="text-xs text-stone-500">•</span>
            <span className="text-xs text-stone-400 font-mono">v1.0.0 Ready</span>
          </div>

          <h3 className="text-base font-bold text-white flex items-center gap-2">
            Download Desktop Application & Launcher Files
          </h3>

          <p className="text-xs text-stone-300 leading-relaxed">
            Download the Python receipt processor script alongside all files required to run it,
            including <strong className="text-emerald-400">run_receipt_processor.bat</strong> for 1-click Windows launching,
            macOS/Linux launcher, <strong className="text-sky-400">requirements.txt</strong>, and configuration templates.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-stone-400 font-mono">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              receipt_processor.py
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              run_receipt_processor.bat
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              requirements.txt
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              .env.example
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row lg:flex-col gap-2.5 shrink-0 justify-center">
          <button
            onClick={handleDownloadZip}
            disabled={downloadingZip}
            className="px-5 py-2.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 rounded-lg shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95 whitespace-nowrap"
          >
            <FolderArchive className="w-4 h-4" />
            <span>{downloadingZip ? 'Packaging ZIP...' : 'Download Full Bundle (.ZIP)'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadBat}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                downloadedBat
                  ? 'bg-emerald-950/70 border-emerald-700 text-emerald-300'
                  : 'bg-stone-800 hover:bg-stone-700 border-stone-700 text-stone-200'
              }`}
              title="Download Windows 1-click batch launcher"
            >
              {downloadedBat ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Saved .bat</span>
                </>
              ) : (
                <>
                  <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Download .bat</span>
                </>
              )}
            </button>

            <button
              onClick={handleDownloadPy}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                downloadedPy
                  ? 'bg-emerald-950/70 border-emerald-700 text-emerald-300'
                  : 'bg-stone-800 hover:bg-stone-700 border-stone-700 text-stone-200'
              }`}
              title="Download main receipt_processor.py script"
            >
              {downloadedPy ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Saved .py</span>
                </>
              ) : (
                <>
                  <FileCode className="w-3.5 h-3.5 text-amber-400" />
                  <span>Download .py</span>
                </>
              )}
            </button>

            <button
              onClick={onOpenModal}
              className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-400 hover:text-white transition-colors cursor-pointer"
              title="View all individual files in package"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
