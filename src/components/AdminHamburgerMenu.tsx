import React, { useEffect, useRef } from 'react';
import { 
  X, 
  Home, 
  Cpu, 
  Inbox, 
  FileSpreadsheet, 
  Building2, 
  Radio, 
  Key, 
  RefreshCw, 
  Layers, 
  FileCode2, 
  ShieldCheck, 
  ExternalLink, 
  Lock, 
  Globe, 
  Mail, 
  KeyRound, 
  FolderArchive, 
  ChevronRight,
  Sparkles
} from 'lucide-react';

export type AdminTab = 'home' | 'scanner' | 'intake' | 'licensing' | 'devices' | 'qbo' | 'tax_hub' | 'updater' | 'code' | 'guide';

interface AdminHamburgerMenuProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: AdminTab;
  onSelectTab: (tab: AdminTab) => void;
  pendingSubmissionsCount: number;
  activeKeysCount: number;
  totalKeysCount: number;
  currentVersion: string;
  onOpenPinModal: () => void;
  onOpenUpdateModal: () => void;
  onOpenGhModal: () => void;
  onOpenInquiriesModal: () => void;
  onOpenBundleModal: () => void;
  onLockConsole: () => void;
  onGoToPublicPortal: () => void;
}

export function AdminHamburgerMenu({
  isOpen,
  onClose,
  activeTab,
  onSelectTab,
  pendingSubmissionsCount,
  activeKeysCount,
  totalKeysCount,
  currentVersion,
  onOpenPinModal,
  onOpenUpdateModal,
  onOpenGhModal,
  onOpenInquiriesModal,
  onOpenBundleModal,
  onLockConsole,
  onGoToPublicPortal
}: AdminHamburgerMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on ESC key press
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent background scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleItemClick = (tab: AdminTab) => {
    onSelectTab(tab);
    onClose();
  };

  const sectionsList: Array<{
    category: string;
    items: Array<{
      id: AdminTab;
      label: string;
      desc: string;
      icon: React.ComponentType<{ className?: string }>;
      colorClass: string;
      badge?: string;
      badgeColor?: string;
    }>;
  }> = [
    {
      category: 'Command & Overview',
      items: [
        {
          id: 'home',
          label: 'Home Overview Dashboard',
          desc: 'Executive summary, platform telemetry, KPI metrics & quick directory',
          icon: Home,
          colorClass: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
          badge: 'Default Hub',
          badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30'
        }
      ]
    },
    {
      category: 'Processing & Ingestion Engines',
      items: [
        {
          id: 'scanner',
          label: 'Receipt Processing & Parallel Engine',
          desc: 'Parallel multi-worker OCR engine, receipt deduction rules & QBO push ledger',
          icon: Cpu,
          colorClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
          badge: 'Parallel Workers',
          badgeColor: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
        },
        {
          id: 'intake',
          label: 'Client Intake & Multi-VM Cluster',
          desc: 'Incoming client submissions, multi-worker dispatch queue & encrypted vault',
          icon: Inbox,
          colorClass: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
          badge: pendingSubmissionsCount > 0 ? `${pendingSubmissionsCount} Pending` : 'Up-to-Date',
          badgeColor: pendingSubmissionsCount > 0 ? 'bg-amber-500 text-stone-950 font-bold' : 'bg-stone-800 text-stone-400 border-stone-700'
        },
        {
          id: 'tax_hub',
          label: 'W-2 & 1099 Tax Hub',
          desc: 'Form 1040 packet individual filers, Box 15–20 state tax intelligence & SSN redaction',
          icon: FileSpreadsheet,
          colorClass: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
          badge: 'Form 1040',
          badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30'
        }
      ]
    },
    {
      category: 'Accounting & Live Monitoring',
      items: [
        {
          id: 'qbo',
          label: 'QuickBooks Online Production',
          desc: 'Intuit OAuth 2.0 integration, realm companies, 101-day renewal & sync logs',
          icon: Building2,
          colorClass: 'text-emerald-400 bg-[#2CA01C]/15 border-emerald-500/20',
          badge: 'OAuth 2.0',
          badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
        },
        {
          id: 'devices',
          label: 'Live Connected Devices & Active IPs',
          desc: 'Real-time client IP network presence, ping heartbeats & active sessions',
          icon: Radio,
          colorClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
          badge: 'Live Stream',
          badgeColor: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
        }
      ]
    },
    {
      category: 'Licensing, Security & System Tools',
      items: [
        {
          id: 'licensing',
          label: 'Subscription & Key Registry',
          desc: 'Client license issuance, non-expiring master admin keys, HWID locks & Edge KV',
          icon: Key,
          colorClass: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
          badge: `${activeKeysCount} Active / ${totalKeysCount}`,
          badgeColor: 'bg-amber-500/15 text-amber-300 border-amber-500/30'
        },
        {
          id: 'updater',
          label: 'Auto-Update System & Versioning',
          desc: 'In-place application updater, release manifest checks & SHA-256 validation',
          icon: RefreshCw,
          colorClass: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
          badge: `v${currentVersion}`,
          badgeColor: 'bg-sky-500/10 text-sky-300 border-sky-500/20'
        },
        {
          id: 'guide',
          label: 'Subscription Architecture Guide',
          desc: 'Technical reference for licensing architecture, hardware hashing & offline vault',
          icon: Layers,
          colorClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
        },
        {
          id: 'code',
          label: 'Integrated Python Code & .bat',
          desc: 'Source code preview for receipt_processor.py and Windows batch launcher bundle',
          icon: FileCode2,
          colorClass: 'text-purple-400 bg-purple-500/10 border-purple-500/20'
        }
      ]
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop overlay with blur */}
      <div 
        onClick={onClose}
        className="fixed inset-0 bg-stone-950/80 backdrop-blur-sm transition-opacity"
        aria-hidden="true"
      />

      {/* Drawer Container */}
      <div 
        ref={menuRef}
        className="relative z-10 w-full max-w-md bg-stone-900 border-r border-stone-800 shadow-2xl flex flex-col h-full overflow-hidden text-stone-100"
      >
        {/* Drawer Header */}
        <div className="p-5 border-b border-stone-800 bg-stone-900/90 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-stone-100">Admin Navigation Menu</h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  v{currentVersion}
                </span>
              </div>
              <p className="text-xs text-stone-400">All 10 Admin Modules &amp; Utilities</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-stone-100 flex items-center justify-center transition-colors cursor-pointer"
            title="Close navigation menu (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Navigation Sections */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {sectionsList.map((group, gIdx) => (
            <div key={gIdx} className="space-y-2">
              <div className="text-[10px] uppercase font-bold tracking-wider text-stone-500 px-2">
                {group.category}
              </div>

              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;

                  return (
                    <button
                      key={item.id}
                      onClick={() => handleItemClick(item.id)}
                      className={`w-full text-left p-3 rounded-xl border transition-all flex items-start gap-3 group cursor-pointer ${
                        isActive
                          ? 'bg-stone-800/90 border-amber-500/50 text-white shadow-md'
                          : 'bg-stone-950/40 border-stone-850 hover:bg-stone-800/50 hover:border-stone-700 text-stone-300'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 ${item.colorClass}`}>
                        <Icon className="w-4 h-4" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-xs font-bold truncate ${isActive ? 'text-amber-400' : 'text-stone-200 group-hover:text-stone-100'}`}>
                            {item.label}
                          </span>
                          {item.badge && (
                            <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded border shrink-0 ${item.badgeColor || 'bg-stone-800 text-stone-400 border-stone-700'}`}>
                              {item.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-stone-400 line-clamp-1 mt-0.5">
                          {item.desc}
                        </p>
                      </div>

                      <ChevronRight className={`w-4 h-4 shrink-0 mt-1 transition-transform ${isActive ? 'text-amber-400 translate-x-0.5' : 'text-stone-600 group-hover:text-stone-400 group-hover:translate-x-0.5'}`} />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Quick Admin Actions & Tooling */}
          <div className="space-y-2 pt-2 border-t border-stone-800/80">
            <div className="text-[10px] uppercase font-bold tracking-wider text-stone-500 px-2">
              Quick Admin Actions &amp; Modals
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                onClick={() => {
                  onClose();
                  onOpenPinModal();
                }}
                className="p-2.5 rounded-lg bg-stone-950/60 border border-stone-800 hover:bg-stone-800 hover:border-stone-700 flex items-center gap-2 text-stone-300 hover:text-white transition-colors cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                <span className="truncate">Admin Account</span>
              </button>

              <button
                onClick={() => {
                  onClose();
                  onOpenGhModal();
                }}
                className="p-2.5 rounded-lg bg-stone-950/60 border border-stone-800 hover:bg-stone-800 hover:border-stone-700 flex items-center gap-2 text-stone-300 hover:text-white transition-colors cursor-pointer"
              >
                <Globe className="w-3.5 h-3.5 text-sky-400" />
                <span className="truncate">GitHub Sync</span>
              </button>

              <button
                onClick={() => {
                  onClose();
                  onOpenInquiriesModal();
                }}
                className="p-2.5 rounded-lg bg-stone-950/60 border border-stone-800 hover:bg-stone-800 hover:border-stone-700 flex items-center gap-2 text-stone-300 hover:text-white transition-colors cursor-pointer"
              >
                <Mail className="w-3.5 h-3.5 text-amber-400" />
                <span className="truncate">Access Requests</span>
              </button>

              <button
                onClick={() => {
                  onClose();
                  onOpenBundleModal();
                }}
                className="p-2.5 rounded-lg bg-stone-950/60 border border-stone-800 hover:bg-stone-800 hover:border-stone-700 flex items-center gap-2 text-stone-300 hover:text-white transition-colors cursor-pointer"
              >
                <FolderArchive className="w-3.5 h-3.5 text-emerald-400" />
                <span className="truncate">Download .bat</span>
              </button>
            </div>
          </div>
        </div>

        {/* Drawer Footer with Logout & Portal Switch */}
        <div className="p-4 border-t border-stone-800 bg-stone-950/80 flex items-center justify-between gap-3 shrink-0">
          <button
            onClick={() => {
              onClose();
              onGoToPublicPortal();
            }}
            className="flex-1 py-2 px-3 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white border border-stone-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
            <span>Public Portal</span>
          </button>

          <button
            onClick={() => {
              onClose();
              onLockConsole();
            }}
            className="py-2 px-3.5 rounded-lg bg-rose-950/70 hover:bg-rose-900 border border-rose-800 text-rose-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            title="Lock Admin Console session"
          >
            <Lock className="w-3.5 h-3.5 text-rose-400" />
            <span>Lock</span>
          </button>
        </div>
      </div>
    </div>
  );
}
