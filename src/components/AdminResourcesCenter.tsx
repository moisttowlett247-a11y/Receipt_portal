import React, { useState } from 'react';
import {
  BookOpen,
  FileCode2,
  FileSpreadsheet,
  Terminal,
  ShieldCheck,
  Download,
  Copy,
  Check,
  ExternalLink,
  ChevronRight,
  Layers,
  Building2,
  Cpu,
  Key,
  FolderArchive
} from 'lucide-react';

interface AdminResourcesCenterProps {
  onToast: (msg: string) => void;
}

export const AdminResourcesCenter: React.FC<AdminResourcesCenterProps> = ({ onToast }) => {
  const [activeSection, setActiveSection] = useState<'qbo' | 'tax' | 'deployment' | 'security' | 'templates'>('qbo');
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  const copyToClipboard = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCodeId(id);
    onToast('Copied to clipboard');
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  const triggerDownload = (fileName: string, content: string, mime: string = 'text/plain') => {
    const blob = new Blob([content], { type: `${mime};charset=utf-8;` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onToast(`Downloaded ${fileName}`);
  };

  const SYSTEMD_SERVICE_TEMPLATE = `[Unit]
Description=QuickBooks Parallel Receipt Vision & Sync Engine
After=network.target

[Service]
Type=simple
User=applet
WorkingDirectory=/app/applet
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=QBO_ENCRYPTION_KEY=production_aes256_master_salt
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target`;

  const MULTI_WORKER_BASH_TEMPLATE = `#!/bin/bash
# High-concurrency multi-worker batch ingest script
echo "Starting multi-worker receipt processor pool..."
WORKERS=4
for i in $(seq 1 $WORKERS); do
  python3 receipt_processor.py --daemon --worker-id=$i &
  echo "Spawned Worker $i with PID $!"
done
wait`;

  const CSV_LICENSE_TEMPLATE = `ClientName,ClientEmail,PlanTier,InitialStatus,DurationDays
Prairie Wind Agriculture,billing@prairiewind.ag,ANNUAL,ACTIVE,365
Heartland Cattle Co,office@heartlandcattle.com,MONTHLY,ACTIVE,30
Midwest Agronomy Services,admin@midwestagronomy.com,QUARTERLY,ACTIVE,90`;

  const TAX_RULES_JSON_TEMPLATE = JSON.stringify({
    taxYear: 2026,
    standardMileageRateCents: 67,
    section179ExpenseCap: 1220000,
    irsScheduleFLineMap: {
      "Bulk Farm Diesel & DEF": "Line 19 (Gasoline, fuel, and oil)",
      "Chemical Spray & Fertilizer": "Line 17 (Fertilizers and lime)",
      "Seed & Seed Cleaning": "Line 26 (Seeds and plants)",
      "Machinery Parts & Welding": "Line 25 (Repairs and maintenance)",
      "Livestock Feed & Minerals": "Line 16 (Feed purchased)",
      "Pasture Ground Cash Rent": "Line 24 (Rent or lease - other)",
      "Veterinary Medicine": "Line 32 (Other expenses - Vet)"
    }
  }, null, 2);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 bg-stone-900 border border-stone-800 rounded-xl">
        <div className="flex items-center gap-2 mb-1">
          <BookOpen className="w-5 h-5 text-amber-400" />
          <h1 className="text-xl font-bold text-stone-100 tracking-tight">Enterprise Operator Resources &amp; Guides</h1>
        </div>
        <div className="flex items-center gap-2 text-xs text-stone-400">
          <span>Technical architecture reference</span>
          <span aria-hidden="true">·</span>
          <span>IRS deduction taxonomy</span>
          <span aria-hidden="true">·</span>
          <span>QuickBooks OAuth 2.0 manual</span>
          <span aria-hidden="true">·</span>
          <span>Linux deployment runbooks</span>
        </div>
      </div>

      {/* Resource Section Switcher */}
      <div className="flex items-center gap-1.5 p-1 bg-stone-900 border border-stone-800 rounded-xl overflow-x-auto">
        {[
          { id: 'qbo', label: 'QuickBooks OAuth & Production', icon: Building2 },
          { id: 'tax', label: 'IRS Schedule F & C Taxonomy', icon: FileSpreadsheet },
          { id: 'deployment', label: 'Multi-VM Engine & Systemd', icon: Cpu },
          { id: 'security', label: 'Zero-Trust Key Rotation', icon: ShieldCheck },
          { id: 'templates', label: 'Downloadable Templates', icon: Download },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id as any)}
              className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer shrink-0 ${
                isActive
                  ? 'bg-amber-500 text-stone-950 shadow-sm font-bold'
                  : 'text-stone-300 hover:text-white hover:bg-stone-800/60'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: QUICKBOOKS OAUTH & PRODUCTION */}
      {activeSection === 'qbo' && (
        <div className="space-y-6">
          <div className="p-6 bg-stone-900 border border-stone-800 rounded-xl space-y-4">
            <h2 className="text-base font-bold text-stone-100 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-emerald-400" />
              QuickBooks Online Production Architecture &amp; Intuit Developer Setup
            </h2>
            <p className="text-xs text-stone-300 leading-relaxed">
              This platform bridges OCR-extracted financial transaction data with Intuit QuickBooks Online using the official OAuth 2.0 Accounting API. Tokens are secured with AES-256-GCM authenticated encryption and refreshed automatically without operator intervention.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-4 bg-stone-950/70 border border-stone-800 rounded-lg space-y-2">
                <h3 className="text-xs font-bold text-stone-200">1. Required OAuth Scopes</h3>
                <p className="text-xs text-stone-400">
                  Configure your Intuit Developer Application with the following single Accounting scope:
                </p>
                <div className="flex items-center justify-between p-2 rounded bg-stone-900 border border-stone-800 font-mono text-xs text-amber-300">
                  <span>com.intuit.quickbooks.accounting</span>
                  <button
                    onClick={() => copyToClipboard('scope', 'com.intuit.quickbooks.accounting')}
                    className="p-1 hover:text-white cursor-pointer"
                  >
                    {copiedCodeId === 'scope' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="p-4 bg-stone-950/70 border border-stone-800 rounded-lg space-y-2">
                <h3 className="text-xs font-bold text-stone-200">2. OAuth 2.0 Redirect URI</h3>
                <p className="text-xs text-stone-400">
                  Register this exact callback URL in your Intuit Developer App dashboard:
                </p>
                <div className="flex items-center justify-between p-2 rounded bg-stone-900 border border-stone-800 font-mono text-xs text-amber-300 truncate">
                  <span className="truncate">https://moisttowlett247-a11y.github.io/Receipt_portal/api/qbo/callback</span>
                  <button
                    onClick={() => copyToClipboard('uri', 'https://moisttowlett247-a11y.github.io/Receipt_portal/api/qbo/callback')}
                    className="p-1 hover:text-white cursor-pointer shrink-0 ml-1"
                  >
                    {copiedCodeId === 'uri' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="p-4 bg-stone-950/70 border border-stone-800 rounded-lg space-y-2">
              <h3 className="text-xs font-bold text-stone-200">3. Rolling 101-Day Token Renewal Engine</h3>
              <p className="text-xs text-stone-400 leading-relaxed">
                Intuit refresh tokens have a maximum validity window of 101 days. Each time an access token is refreshed or a receipt batch is synchronized, Intuit returns a newly minted refresh token. The server immediately captures and re-encrypts this new token with AES-256-GCM, resetting the 101-day countdown to ensure connections never expire as long as the system syncs at least once every 3 months.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: IRS SCHEDULE F & C TAXONOMY */}
      {activeSection === 'tax' && (
        <div className="space-y-6">
          <div className="p-6 bg-stone-900 border border-stone-800 rounded-xl space-y-4">
            <h2 className="text-base font-bold text-stone-100 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-purple-400" />
              IRS Schedule F (Profit or Loss From Farming) Itemized Deduction Rules
            </h2>
            <p className="text-xs text-stone-300 leading-relaxed">
              Standard line-by-line categorization for agricultural producers and small businesses according to IRS Publication 225 (Farmer&apos;s Tax Guide).
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-stone-800 bg-stone-950/40 text-stone-400 font-mono uppercase text-[11px]">
                    <th className="py-2.5 px-3">IRS Form &amp; Line</th>
                    <th className="py-2.5 px-3">Deduction Category</th>
                    <th className="py-2.5 px-3">Eligible Purchases</th>
                    <th className="py-2.5 px-3">QuickBooks Account</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-800/60 font-mono text-stone-300">
                  <tr>
                    <td className="py-2.5 px-3 font-bold text-amber-400">Sched F Line 19</td>
                    <td className="py-2.5 px-3 font-sans">Gasoline, Fuel &amp; Oil</td>
                    <td className="py-2.5 px-3 font-sans text-stone-400">Off-road red diesel, DEF fluid, tractor motor oil, grease</td>
                    <td className="py-2.5 px-3">6100 Fuel &amp; Lubricants</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-bold text-amber-400">Sched F Line 25</td>
                    <td className="py-2.5 px-3 font-sans">Repairs &amp; Maintenance</td>
                    <td className="py-2.5 px-3 font-sans text-stone-400">Hydraulic hoses, combine belts, plow sweeps, welding gas</td>
                    <td className="py-2.5 px-3">6120 Machinery Repairs</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-bold text-amber-400">Sched F Line 17</td>
                    <td className="py-2.5 px-3 font-sans">Fertilizers &amp; Lime</td>
                    <td className="py-2.5 px-3 font-sans text-stone-400">Anhydrous ammonia, potash, DAP, agricultural lime spreading</td>
                    <td className="py-2.5 px-3">6060 Fertilizer</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-bold text-amber-400">Sched F Line 11</td>
                    <td className="py-2.5 px-3 font-sans">Chemicals</td>
                    <td className="py-2.5 px-3 font-sans text-stone-400">Herbicide, fungicide, insecticide, adjuvants, crop spray</td>
                    <td className="py-2.5 px-3">6070 Crop Chemicals</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-bold text-amber-400">Sched F Line 16</td>
                    <td className="py-2.5 px-3 font-sans">Feed Purchased</td>
                    <td className="py-2.5 px-3 font-sans text-stone-400">Hay bales, distillers grain, mineral blocks, calf milk replacer</td>
                    <td className="py-2.5 px-3">6050 Livestock Feed</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-bold text-amber-400">Sched F Line 32</td>
                    <td className="py-2.5 px-3 font-sans">Other Farm Expenses</td>
                    <td className="py-2.5 px-3 font-sans text-stone-400">Soil testing, ear tags, grain drying tariffs, association dues</td>
                    <td className="py-2.5 px-3">6330 Other Farm Expenses</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: MULTI-VM ENGINE & SYSTEMD */}
      {activeSection === 'deployment' && (
        <div className="space-y-6">
          <div className="p-6 bg-stone-900 border border-stone-800 rounded-xl space-y-4">
            <h2 className="text-base font-bold text-stone-100 flex items-center gap-2">
              <Cpu className="w-5 h-5 text-sky-400" />
              Production Linux Systemd Service &amp; Multi-Worker Pool
            </h2>
            <p className="text-xs text-stone-300 leading-relaxed">
              For high-volume server deployments, run the receipt processing service under Linux `systemd` to provide automated crash recovery and continuous uptime.
            </p>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-stone-400">
                <span className="font-mono">/etc/systemd/system/receipt-processor.service</span>
                <button
                  onClick={() => copyToClipboard('systemd', SYSTEMD_SERVICE_TEMPLATE)}
                  className="flex items-center gap-1 text-amber-400 hover:text-amber-300 cursor-pointer"
                >
                  {copiedCodeId === 'systemd' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>Copy Unit File</span>
                </button>
              </div>
              <pre className="p-4 bg-stone-950 border border-stone-800 rounded-lg text-xs font-mono text-stone-300 overflow-x-auto">
                {SYSTEMD_SERVICE_TEMPLATE}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: ZERO-TRUST KEY ROTATION */}
      {activeSection === 'security' && (
        <div className="space-y-6">
          <div className="p-6 bg-stone-900 border border-stone-800 rounded-xl space-y-4">
            <h2 className="text-base font-bold text-stone-100 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              Zero-Trust Security &amp; Key Rotation Protocol
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-stone-950/70 border border-stone-800 rounded-lg space-y-2">
                <h3 className="text-xs font-bold text-stone-200">1. Instant Key Revocation</h3>
                <p className="text-xs text-stone-400">
                  Setting any license status to <code className="text-rose-400 font-bold">REVOKED</code> in the License Registry immediately updates Cloudflare Edge KV and rejects any incoming desktop client verification requests within milliseconds.
                </p>
              </div>

              <div className="p-4 bg-stone-950/70 border border-stone-800 rounded-lg space-y-2">
                <h3 className="text-xs font-bold text-stone-200">2. Hardware ID (HWID) Unbinding</h3>
                <p className="text-xs text-stone-400">
                  When a client upgrades or changes computers, clicking &ldquo;Clear HWID&rdquo; resets the cryptographic machine fingerprint, allowing the next workstation to bind cleanly without manual re-issuance.
                </p>
              </div>

              <div className="p-4 bg-stone-950/70 border border-stone-800 rounded-lg space-y-2">
                <h3 className="text-xs font-bold text-stone-200">3. AES-256 Master Key Rotation</h3>
                <p className="text-xs text-stone-400">
                  Update <code className="text-amber-300 font-mono">QBO_ENCRYPTION_KEY</code> in production environment variables to rotate the AES-256-GCM cipher seed across all QuickBooks OAuth token stores.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: DOWNLOADABLE TEMPLATES */}
      {activeSection === 'templates' && (
        <div className="space-y-6">
          <div className="p-6 bg-stone-900 border border-stone-800 rounded-xl space-y-4">
            <h2 className="text-base font-bold text-stone-100 flex items-center gap-2">
              <Download className="w-5 h-5 text-amber-400" />
              Direct Downloadable Operational Assets
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-stone-950/70 border border-stone-800 rounded-lg flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-stone-200">Bulk License Import Template (.csv)</div>
                  <div className="text-[11px] text-stone-400">Standard CSV format for bulk subscriber licensing</div>
                </div>
                <button
                  onClick={() => triggerDownload('bulk_license_import_template.csv', CSV_LICENSE_TEMPLATE, 'text/csv')}
                  className="px-3 py-1.5 text-xs font-semibold rounded bg-stone-800 hover:bg-stone-750 text-stone-200 border border-stone-700 flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5 text-amber-400" />
                  <span>Download</span>
                </button>
              </div>

              <div className="p-4 bg-stone-950/70 border border-stone-800 rounded-lg flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-stone-200">Systemd Service Unit (.service)</div>
                  <div className="text-[11px] text-stone-400">Linux background service definition for 24/7 uptime</div>
                </div>
                <button
                  onClick={() => triggerDownload('receipt-processor.service', SYSTEMD_SERVICE_TEMPLATE)}
                  className="px-3 py-1.5 text-xs font-semibold rounded bg-stone-800 hover:bg-stone-750 text-stone-200 border border-stone-700 flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5 text-sky-400" />
                  <span>Download</span>
                </button>
              </div>

              <div className="p-4 bg-stone-950/70 border border-stone-800 rounded-lg flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-stone-200">Multi-Worker Spawn Script (.sh)</div>
                  <div className="text-[11px] text-stone-400">Bash launcher to run 4 concurrent local OCR workers</div>
                </div>
                <button
                  onClick={() => triggerDownload('run_multi_worker.sh', MULTI_WORKER_BASH_TEMPLATE, 'application/x-sh')}
                  className="px-3 py-1.5 text-xs font-semibold rounded bg-stone-800 hover:bg-stone-750 text-stone-200 border border-stone-700 flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Download</span>
                </button>
              </div>

              <div className="p-4 bg-stone-950/70 border border-stone-800 rounded-lg flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-stone-200">IRS Tax Deduction Rules Schema (.json)</div>
                  <div className="text-[11px] text-stone-400">Itemized line mappings and 2026 IRS caps in JSON format</div>
                </div>
                <button
                  onClick={() => triggerDownload('tax_deduction_rules.json', TAX_RULES_JSON_TEMPLATE, 'application/json')}
                  className="px-3 py-1.5 text-xs font-semibold rounded bg-stone-800 hover:bg-stone-750 text-stone-200 border border-stone-700 flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5 text-purple-400" />
                  <span>Download</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
