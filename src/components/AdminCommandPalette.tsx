import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
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
  Lock,
  Download,
  Mail,
  ExternalLink,
  Sparkles,
  Command,
  ArrowRight,
  CheckCircle2,
  Trash2,
  Copy,
  Check,
  Activity,
  ShieldAlert,
  BookOpen
} from 'lucide-react';
import { AdminTab } from './AdminHamburgerMenu';
import { LicenseKeyRecord } from '../types';

interface CommandItem {
  id: string;
  title: string;
  category: 'Navigation' | 'Quick Actions' | 'Export' | 'Licenses';
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
  badge?: string;
  shortcut?: string;
  action: () => void;
}

interface AdminCommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: AdminTab;
  onNavigateTab: (tab: AdminTab) => void;
  licenseKeys: LicenseKeyRecord[];
  pendingSubmissionsCount: number;
  onOpenBundleModal: () => void;
  onOpenInquiriesModal: () => void;
  onOpenUpdateModal: () => void;
  onOpenPinModal: () => void;
  onLockConsole: () => void;
  onToast: (msg: string) => void;
}

export const AdminCommandPalette: React.FC<AdminCommandPaletteProps> = ({
  isOpen,
  onClose,
  activeTab,
  onNavigateTab,
  licenseKeys,
  pendingSubmissionsCount,
  onOpenBundleModal,
  onOpenInquiriesModal,
  onOpenUpdateModal,
  onOpenPinModal,
  onLockConsole,
  onToast
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Global keyboard shortcuts (Ctrl+K, Cmd+K, /)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else {
          // Trigger open via parent
          const event = new CustomEvent('open_admin_command_palette');
          window.dispatchEvent(event);
        }
      }
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Build command items
  const commands: CommandItem[] = useMemo(() => {
    const list: CommandItem[] = [
      // Navigation
      {
        id: 'nav-home',
        title: 'Platform Overview Dashboard',
        category: 'Navigation',
        icon: Home,
        description: 'System telemetry, KPI cards, and accounting command center',
        shortcut: 'Alt+1',
        action: () => {
          onNavigateTab('home');
          onClose();
        }
      },
      {
        id: 'nav-scanner',
        title: 'Receipt Processor & Parallel Engine',
        category: 'Navigation',
        icon: Cpu,
        description: 'Batch vision scanning, IRS deduction classification, and QBO push',
        shortcut: 'Alt+2',
        action: () => {
          onNavigateTab('scanner');
          onClose();
        }
      },
      {
        id: 'nav-intake',
        title: 'Client Intake Queue & Submissions',
        category: 'Navigation',
        icon: Inbox,
        description: 'Manage incoming receipts from registered client accounts',
        badge: pendingSubmissionsCount > 0 ? `${pendingSubmissionsCount} Pending` : undefined,
        shortcut: 'Alt+3',
        action: () => {
          onNavigateTab('intake');
          onClose();
        }
      },
      {
        id: 'nav-qbo',
        title: 'QuickBooks Online Production Center',
        category: 'Navigation',
        icon: Building2,
        description: 'Live OAuth connection broker, Chart of Accounts, and sync audit logs',
        shortcut: 'Alt+4',
        action: () => {
          onNavigateTab('qbo');
          onClose();
        }
      },
      {
        id: 'nav-tax',
        title: 'W-2 & 1099 Income Tax Hub',
        category: 'Navigation',
        icon: FileSpreadsheet,
        description: 'State and Federal non-business tax documents and earnings vault',
        shortcut: 'Alt+5',
        action: () => {
          onNavigateTab('tax_hub');
          onClose();
        }
      },
      {
        id: 'nav-licensing',
        title: 'Subscription & License Key Registry',
        category: 'Navigation',
        icon: Key,
        description: 'Generate, manage, lock, and revoke client license keys and accounts',
        badge: `${licenseKeys.length} Keys`,
        shortcut: 'Alt+6',
        action: () => {
          onNavigateTab('licensing');
          onClose();
        }
      },
      {
        id: 'nav-devices',
        title: 'Live Connected Devices & IP Telemetry',
        category: 'Navigation',
        icon: Radio,
        description: 'Real-time client heartbeats, online/idle presence, and safe session pruning',
        shortcut: 'Alt+7',
        action: () => {
          onNavigateTab('devices');
          onClose();
        }
      },
      {
        id: 'nav-updater',
        title: 'Auto-Update System & Release Logs',
        category: 'Navigation',
        icon: RefreshCw,
        description: 'Manage versioning, cloud manifest synchronization, and patch downloads',
        action: () => {
          onNavigateTab('updater');
          onClose();
        }
      },
      {
        id: 'nav-code',
        title: 'Integrated Python Worker Script',
        category: 'Navigation',
        icon: FileCode2,
        description: 'View and copy client-isolated desktop background automation script',
        action: () => {
          onNavigateTab('code');
          onClose();
        }
      },
      {
        id: 'nav-guide',
        title: 'Subscription Architecture Guide',
        category: 'Navigation',
        icon: Layers,
        description: 'Cloudflare KV edge sync, AES-256 vault, and licensing design',
        action: () => {
          onNavigateTab('guide');
          onClose();
        }
      },
      {
        id: 'nav-diagnostics',
        title: 'System Health & Latency Diagnostics',
        category: 'Navigation',
        icon: Activity,
        description: 'Real-time telemetry, memory heap usage, continuous subsystem probing & snapshots',
        shortcut: 'Alt+8',
        action: () => {
          onNavigateTab('diagnostics');
          onClose();
        }
      },
      {
        id: 'nav-audit',
        title: 'Security & Activity Audit Log',
        category: 'Navigation',
        icon: ShieldAlert,
        description: 'Forensic operator action log, security events, severity filter & CSV/JSON export',
        shortcut: 'Alt+9',
        action: () => {
          onNavigateTab('audit_logs');
          onClose();
        }
      },
      {
        id: 'nav-resources',
        title: 'Enterprise Operator Resource Hub',
        category: 'Navigation',
        icon: BookOpen,
        description: 'QuickBooks OAuth guide, IRS Schedule F tax taxonomy & Linux systemd runbooks',
        shortcut: 'Alt+0',
        action: () => {
          onNavigateTab('resources');
          onClose();
        }
      },

      // Quick Actions
      {
        id: 'act-bundle',
        title: 'Download Desktop Engine Package (.ZIP)',
        category: 'Quick Actions',
        icon: Download,
        description: 'Complete Python standalone bundle with Windows batch and shell launchers',
        action: () => {
          onClose();
          onOpenBundleModal();
        }
      },
      {
        id: 'act-inquiries',
        title: 'Open Inquiries & Leads Inbox',
        category: 'Quick Actions',
        icon: Mail,
        description: 'Review prospect inquiries and enterprise client onboarding requests',
        action: () => {
          onClose();
          onOpenInquiriesModal();
        }
      },
      {
        id: 'act-updates',
        title: 'Check for System Updates',
        category: 'Quick Actions',
        icon: RefreshCw,
        description: 'Verify cloud update manifests and inspect release notes',
        action: () => {
          onClose();
          onOpenUpdateModal();
        }
      },
      {
        id: 'act-account',
        title: 'Admin Credentials & PIN Settings',
        category: 'Quick Actions',
        icon: Key,
        description: 'Update administrator master PIN, security phrase, or session tokens',
        action: () => {
          onClose();
          onOpenPinModal();
        }
      },
      {
        id: 'act-lock',
        title: 'Lock Administrator Console',
        category: 'Quick Actions',
        icon: Lock,
        description: 'Immediately lock the session and require master authentication',
        action: () => {
          onClose();
          onLockConsole();
        }
      }
    ];

    // License key items for rapid search
    licenseKeys.forEach(k => {
      list.push({
        id: `key-${k.id}`,
        title: `${k.key} — ${k.clientName || 'Unassigned Key'}`,
        category: 'Licenses',
        icon: Key,
        description: `Plan: ${k.plan || 'Standard'} • Status: ${k.status} • Exp: ${k.expires || 'Never'}`,
        badge: k.status,
        action: () => {
          navigator.clipboard.writeText(k.key);
          setCopiedKey(k.key);
          onToast(`Copied license key ${k.key} to clipboard!`);
          setTimeout(() => setCopiedKey(null), 2000);
          onNavigateTab('licensing');
          onClose();
        }
      });
    });

    return list;
  }, [licenseKeys, pendingSubmissionsCount, onNavigateTab, onClose, onOpenBundleModal, onOpenInquiriesModal, onOpenUpdateModal, onOpenPinModal, onLockConsole, onToast]);

  // Filter commands by query
  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(item => 
      item.title.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      (item.description && item.description.toLowerCase().includes(q)) ||
      (item.badge && item.badge.toLowerCase().includes(q))
    );
  }, [commands, query]);

  // Keyboard navigation within list
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % Math.max(1, filteredCommands.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % Math.max(1, filteredCommands.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].action();
      }
    }
  };

  // Scroll active item into view
  useEffect(() => {
    const activeEl = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div 
        className="w-full max-w-2xl bg-stone-900 border border-stone-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] border-amber-500/30"
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="p-3.5 border-b border-stone-800 flex items-center gap-3 bg-stone-950/90">
          <Search className="w-5 h-5 text-amber-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Type a module name, quick action, or license key... (Esc to close)"
            className="flex-1 bg-transparent text-sm text-stone-100 placeholder-stone-500 focus:outline-none"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="p-1 text-stone-500 hover:text-stone-300 rounded cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-stone-800 text-stone-400 border border-stone-700">
              ESC
            </span>
          )}
        </div>

        {/* Results List */}
        <div ref={listRef} className="overflow-y-auto p-2 space-y-1 flex-1">
          {filteredCommands.length === 0 ? (
            <div className="p-8 text-center text-xs text-stone-500 space-y-2">
              <Search className="w-8 h-8 text-stone-700 mx-auto" />
              <p className="font-semibold text-stone-400">No matching modules, actions, or keys</p>
              <p>Try searching for "QBO", "Scanner", "Intake", "Excel", or a client name.</p>
            </div>
          ) : (
            filteredCommands.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  data-index={idx}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`p-2.5 rounded-xl flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-amber-500/15 border border-amber-500/30 text-stone-100'
                      : 'hover:bg-stone-800/60 text-stone-300 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      isSelected
                        ? 'bg-amber-500 text-stone-950 font-bold'
                        : 'bg-stone-800 text-stone-300'
                    }`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-stone-100 flex items-center gap-2 truncate">
                        <span>{item.title}</span>
                        {item.badge && (
                          <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-semibold ${
                            item.badge.includes('Pending')
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : item.badge === 'ACTIVE'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-stone-800 text-stone-400'
                          }`}>
                            {item.badge}
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-[11px] text-stone-400 truncate mt-0.5">
                          {item.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-mono text-stone-500 uppercase tracking-wider">
                      {item.category}
                    </span>
                    {item.shortcut && (
                      <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-stone-800 text-stone-400 border border-stone-700 hidden sm:inline">
                        {item.shortcut}
                      </span>
                    )}
                    <ArrowRight className={`w-3.5 h-3.5 transition-transform ${isSelected ? 'text-amber-400 translate-x-0.5' : 'text-stone-600'}`} />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts helper */}
        <div className="p-2.5 px-4 bg-stone-950 border-t border-stone-800 flex items-center justify-between text-[11px] text-stone-400">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-stone-850 border border-stone-700 font-mono text-[10px]">↑</kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-stone-850 border border-stone-700 font-mono text-[10px]">↓</kbd>
              <span>navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-stone-850 border border-stone-700 font-mono text-[10px]">↵</kbd>
              <span>select</span>
            </span>
          </div>
          <span className="text-[10px] text-stone-500 font-mono">
            {filteredCommands.length} command{filteredCommands.length === 1 ? '' : 's'} available
          </span>
        </div>
      </div>
    </div>
  );
};
