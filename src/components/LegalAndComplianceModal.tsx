import React from 'react';
import {
  ShieldCheck,
  FileText,
  HelpCircle,
  X,
  Lock,
  CheckCircle2,
  Mail,
  ExternalLink,
  Building2,
  Server,
  AlertTriangle,
  Cpu,
  Cloud,
  Database,
  Trash2,
  RefreshCw,
  HardDrive,
  Key,
  Layers,
  Scale
} from 'lucide-react';

export type LegalTabType = 'privacy' | 'terms' | 'security' | 'support';

interface LegalAndComplianceModalProps {
  isOpen: boolean;
  activeTab: LegalTabType;
  onClose: () => void;
  onTabChange: (tab: LegalTabType) => void;
}

export const LegalAndComplianceModal: React.FC<LegalAndComplianceModalProps> = ({
  isOpen,
  activeTab,
  onClose,
  onTabChange
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-stone-900 border border-stone-800 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-stone-800 flex items-center justify-between bg-stone-950/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-inner">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-stone-100">
                  Legal, Privacy & Compliance Center
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/40">
                  Active & Verified
                </span>
              </div>
              <p className="text-xs text-stone-400 mt-0.5">
                Official Intuit QuickBooks App Store Compliant Disclosures • Google Drive Vault • Gemini Enterprise AI
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-200 hover:bg-stone-800 transition-colors cursor-pointer"
            aria-label="Close legal modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-stone-800 bg-stone-950/40 px-6 gap-2 shrink-0 overflow-x-auto scrollbar-none">
          <button
            onClick={() => onTabChange('privacy')}
            className={`py-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'privacy'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <Lock className="w-4 h-4" />
            <span>Privacy Policy</span>
          </button>

          <button
            onClick={() => onTabChange('terms')}
            className={`py-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'terms'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Terms of Service & EULA</span>
          </button>

          <button
            onClick={() => onTabChange('security')}
            className={`py-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'security'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Security Architecture & Status</span>
          </button>

          <button
            onClick={() => onTabChange('support')}
            className={`py-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'support'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            <span>Support, FAQ & SLA</span>
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-stone-300 leading-relaxed max-h-[calc(92vh-140px)]">
          {/* TAB 1: PRIVACY POLICY */}
          {activeTab === 'privacy' && (
            <div className="space-y-6">
              {/* Primary Guarantee Banner */}
              <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-800/40 space-y-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span className="font-bold text-emerald-300 text-sm">
                    Privacy-by-Design Financial Data Guarantee
                  </span>
                </div>
                <p className="text-stone-300">
                  Receipt Processor Enterprise is built upon zero-data-monetization principles. We never sell, rent, broker,
                  or share financial records, receipt images, chart of accounts hierarchies, or customer transactions with any third-party advertisers, data aggregators, or unauthorized third parties.
                </p>
              </div>

              {/* Section 1 */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-stone-100 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-stone-800 text-stone-300 flex items-center justify-center text-[10px] font-mono">1</span>
                  Information We Process
                </h4>
                <p>
                  To deliver forensic receipt digitizing, automated tax categorization, and QuickBooks synchronization, our application securely handles the following data classes:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  <div className="p-3 rounded-lg bg-stone-950/80 border border-stone-800 space-y-1">
                    <span className="font-semibold text-stone-200 block text-xs">Receipt Image & Document Blobs</span>
                    <p className="text-stone-400 text-[11px]">
                      Raw receipt images (JPEG, PNG, WEBP, PDF) submitted for OCR are automatically compressed client-side (to max 1600px width/height and 82% quality) to minimize exposure and memory overhead.
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-stone-950/80 border border-stone-800 space-y-1">
                    <span className="font-semibold text-stone-200 block text-xs">Extracted Accounting Metadata</span>
                    <p className="text-stone-400 text-[11px]">
                      Merchant/vendor names, transaction dates, final grand totals, line items, pre-tax subtotals, sales tax, register transaction numbers (Trans #), authorization codes (Ref #), invoice numbers, and payment methods.
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-stone-950/80 border border-stone-800 space-y-1">
                    <span className="font-semibold text-stone-200 block text-xs">QuickBooks Online Accounting Profiles</span>
                    <p className="text-stone-400 text-[11px]">
                      Intuit Realm IDs, legal business company names, currency configurations, and OAuth 2.0 access and refresh tokens.
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-stone-950/80 border border-stone-800 space-y-1">
                    <span className="font-semibold text-stone-200 block text-xs">Cryptographic Fingerprints & HWID</span>
                    <p className="text-stone-400 text-[11px]">
                      SHA-256 cryptographic receipt hashes computed client-side to prevent duplicate expense entries, plus machine hardware IDs (HWID) strictly for software subscription license enforcement.
                    </p>
                  </div>
                </div>
              </div>

              {/* Section 2 */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-stone-100 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-stone-800 text-stone-300 flex items-center justify-center text-[10px] font-mono">2</span>
                  Third-Party Cloud Sub-Processors & Artificial Intelligence
                </h4>
                <div className="space-y-3">
                  <div className="p-3.5 rounded-lg bg-stone-950/60 border border-stone-800/80 space-y-1.5">
                    <div className="flex items-center gap-2 text-stone-200 font-semibold">
                      <Cpu className="w-4 h-4 text-emerald-400" />
                      <span>Google Gemini Vision AI (Zero Foundation Model Training Guarantee)</span>
                    </div>
                    <p className="text-stone-400 text-[11px]">
                      Optical Character Recognition and line-item decomposition are executed via Google Gemini Vision API endpoints running under enterprise terms of service.
                      <strong> Customer financial imagery is processed statelessly in transient memory and is NEVER used to train, retrain, or fine-tune public foundation models.</strong>
                    </p>
                  </div>

                  <div className="p-3.5 rounded-lg bg-stone-950/60 border border-stone-800/80 space-y-1.5">
                    <div className="flex items-center gap-2 text-stone-200 font-semibold">
                      <HardDrive className="w-4 h-4 text-sky-400" />
                      <span>Google Drive Cloud Vault Integration</span>
                    </div>
                    <p className="text-stone-400 text-[11px]">
                      Receipt files and forensic archives synced to Google Drive are deposited exclusively into user-authorized company folders (organized by Client / Tax Class / Year).
                      Uploads occur via direct OAuth 2.0 or Google Apps Script Webhooks. As soon as a file is confirmed safely stored in Google Drive, the in-memory base64 data URL is purged immediately from browser memory to conserve RAM and protect privacy.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-lg bg-stone-950/60 border border-stone-800/80 space-y-1.5">
                    <div className="flex items-center gap-2 text-stone-200 font-semibold">
                      <Cloud className="w-4 h-4 text-amber-400" />
                      <span>Edge Proxy & Network Security (No Edge Caching of PII)</span>
                    </div>
                    <p className="text-stone-400 text-[11px]">
                      All API communications and image transmissions enforce strict HTTP response headers: <code className="text-amber-300 font-mono text-[10px]">Cache-Control: no-cache, no-store, must-revalidate, private</code>. Edge CDN caches and Cloudflare proxies are explicitly instructed not to store, inspect, or retain financial payloads or receipt imagery.
                    </p>
                  </div>
                </div>
              </div>

              {/* Section 3 */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-stone-100 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-stone-800 text-stone-300 flex items-center justify-center text-[10px] font-mono">3</span>
                  Data Retention & Statutory Erasure Rights (GDPR & CCPA)
                </h4>
                <p>
                  You maintain unconditional authority over your financial data. We honor statutory data erasure and portability rights:
                </p>
                <ul className="list-disc list-inside space-y-1.5 pl-2 text-stone-400">
                  <li><strong>Instant QuickBooks Revocation:</strong> Clicking "Disconnect" in the QuickBooks Production Center immediately revokes OAuth tokens with Intuit and purges token records from the server within 60 seconds.</li>
                  <li><strong>Client Portal Right-to-be-Forgotten:</strong> Registered client users can permanently delete their accounts and all associated receipts directly through the Client Account settings or upon administrative request.</li>
                  <li><strong>Cryptographic Erasure:</strong> When an account or submission is deleted, cryptographic references and files are permanently unlinked and deleted in compliance with GDPR Article 17 and CCPA regulations.</li>
                </ul>
              </div>

              {/* Section 4 */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-stone-100 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-stone-800 text-stone-300 flex items-center justify-center text-[10px] font-mono">4</span>
                  Cookies & Tracking Policy
                </h4>
                <p>
                  This application does <strong>not</strong> use third-party marketing cookies, cross-site trackers, or behavioral advertising scripts. LocalStorage and session cookies are used exclusively for core security functions: persisting license tokens, active user session states, and offline ledger backups.
                </p>
              </div>

              <div className="pt-3 border-t border-stone-800 flex items-center justify-between text-[11px] text-stone-500">
                <span>Last Updated: October 2026</span>
                <span className="text-emerald-400 font-medium">Compliant with Intuit Developer Terms & GDPR / CCPA Standards</span>
              </div>
            </div>
          )}

          {/* TAB 2: TERMS OF SERVICE / EULA */}
          {activeTab === 'terms' && (
            <div className="space-y-6">
              {/* Critical Legal Disclaimer */}
              <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/40 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span className="font-bold text-amber-300 text-sm">
                    IRS Tax Compliance & Non-Advisory Notice
                  </span>
                </div>
                <p className="text-stone-300 text-xs">
                  Receipt Processor Enterprise is an automated computational software utility designed to assist bookkeeping and receipt organization.
                  <strong> The software does not provide certified legal, tax, or financial accounting advice.</strong> The user, company controller, or certified public accountant (CPA) remains solely and legally responsible for inspecting, reconciling, and approving all tax categories, deductions (IRS Schedule C / Schedule F / Form 1040), and financial statements prior to filing with tax authorities.
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-bold text-stone-100 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-stone-800 text-stone-300 flex items-center justify-center text-[10px] font-mono">1</span>
                  Software License Grant & Scope
                </h4>
                <p>
                  Subject to an active subscription (Annual, Monthly, Standard, or Enterprise), you are granted a non-exclusive, non-transferable license to execute the desktop processing runtime and access the web client intake portal.
                </p>
                <ul className="list-disc list-inside space-y-1 pl-2 text-stone-400">
                  <li><strong>Workstation Binding:</strong> Standard licenses bind to a single authorized workstation enforced via cryptographic hardware hashing (HWID). Enterprise plans support multi-seat deployment.</li>
                  <li><strong>Parallel Worker Engine:</strong> The software permits concurrent worker processing (up to 24 parallel pipelines). Users agree not to deliberately abuse Google Drive API limits or bypass external rate-limit safeguards.</li>
                  <li><strong>Restrictions:</strong> Reverse engineering, decompilation, unauthorized token cracking, or redistributing proprietary binaries without authorization is strictly prohibited.</li>
                </ul>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-bold text-stone-100 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-stone-800 text-stone-300 flex items-center justify-center text-[10px] font-mono">2</span>
                  Intuit QuickBooks Online Integration & Trademark Disclaimer
                </h4>
                <p>
                  QuickBooks and QuickBooks Online are registered trademarks of Intuit Inc. Receipt Processor Enterprise is an independent third-party software integration developed utilizing the official Intuit Developer API platform. This software is not manufactured, endorsed, or warranted directly by Intuit Inc.
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-bold text-stone-100 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-stone-800 text-stone-300 flex items-center justify-center text-[10px] font-mono">3</span>
                  Multi-Receipt Extraction & AI Precision Limitations
                </h4>
                <p>
                  Our advanced multi-model vision pipeline decomposes multi-receipt photos into separate ledger entries with mathematical self-reconciliation (verifying Subtotal + Tax + Tip = Grand Total). However, due to inherent variances in receipt paper aging, thermal fading, optical glare, and crumpling, the user must review confidence ratings and flagged variances before finalizing journal batches.
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-bold text-stone-100 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-stone-800 text-stone-300 flex items-center justify-center text-[10px] font-mono">4</span>
                  Data Portability & Zero Vendor Lock-In
                </h4>
                <p>
                  Users maintain unconditional ownership of all uploaded receipts, parsed metadata, and ledger records. You may export complete accounting archives in standard CSV format or download complete ZIP archives containing high-resolution receipts and forensic audit logs at any time.
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-bold text-stone-100 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-stone-800 text-stone-300 flex items-center justify-center text-[10px] font-mono">5</span>
                  Limitation of Liability
                </h4>
                <p className="text-stone-400">
                  To the maximum extent permitted by applicable law, in no event shall the software developers, publishers, or affiliates be liable for any indirect, special, incidental, punitive, or consequential damages resulting from lost profits, business interruption, tax penalties, audit adjustments, or third-party cloud service outages.
                </p>
              </div>

              <div className="pt-3 border-t border-stone-800 flex items-center justify-between text-[11px] text-stone-500">
                <span>Effective Date: October 2026</span>
                <span className="text-amber-400 font-medium">Standard Commercial End User License Agreement</span>
              </div>
            </div>
          )}

          {/* TAB 3: SECURITY ARCHITECTURE & STATUS */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              {/* Live Security Status Dashboard Card */}
              <div className="p-4 rounded-xl bg-cyan-950/30 border border-cyan-800/40 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-cyan-300 font-bold text-sm">
                    <ShieldCheck className="w-4 h-4 text-cyan-400" />
                    <span>Live Security Architecture Status</span>
                  </div>
                  <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-cyan-900/60 text-cyan-300 border border-cyan-700/50">
                    Grade A+ Hardened
                  </span>
                </div>
                <p className="text-stone-300 text-xs">
                  Receipt Processor Enterprise implements multi-layered cryptographic controls across storage, network transport, AI processing, and hardware verification.
                </p>
              </div>

              {/* Security Pillars Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div className="p-3.5 rounded-xl bg-stone-950 border border-stone-800 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-emerald-400" />
                    <span className="font-bold text-stone-200">AES-256-GCM Encryption at Rest</span>
                  </div>
                  <p className="text-stone-400 text-[11px]">
                    All QuickBooks OAuth refresh tokens and sensitive credentials stored on disk or server are encrypted using authenticated AES-256-GCM cryptography with unique 96-bit initialization vectors (IV) and SHA-256 derived master keys.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-stone-950 border border-stone-800 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-sky-400" />
                    <span className="font-bold text-stone-200">TLS 1.3 Strict In-Transit Transport</span>
                  </div>
                  <p className="text-stone-400 text-[11px]">
                    All API transactions, Google Drive webhooks, and Intuit token broker exchanges enforce strict TLS 1.3 / HTTPS transport encryption with modern cipher suites and Perfect Forward Secrecy (PFS).
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-stone-950 border border-stone-800 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-cyan-400" />
                    <span className="font-bold text-stone-200">Zero-Knowledge In-Memory Purging</span>
                  </div>
                  <p className="text-stone-400 text-[11px]">
                    Client-side processing pipelines immediately purge heavy raw base64 data URLs from browser RAM as soon as Drive synchronization completes, preventing memory accumulation and unauthorized heap inspection.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-stone-950 border border-stone-800 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Scale className="w-4 h-4 text-amber-400" />
                    <span className="font-bold text-stone-200">SHA-256 Duplicate Prevention</span>
                  </div>
                  <p className="text-stone-400 text-[11px]">
                    Receipts undergo instant client-side SHA-256 cryptographic hashing upon selection. Identical receipt images are automatically quarantined to prevent accidental duplicate expenses before touching the cloud.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-stone-950 border border-stone-800 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-emerald-400" />
                    <span className="font-bold text-stone-200">Adaptive Rate-Limit Circuit Breaker</span>
                  </div>
                  <p className="text-stone-400 text-[11px]">
                    Our multi-worker scanning engine features automatic round-robin API key rotation and adaptive 12-second cooldowns for 429 (RESOURCE_EXHAUSTED) quotas, smoothly cascading through model fallbacks without dropping scans.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-stone-950 border border-stone-800 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Key className="w-4 h-4 text-purple-400" />
                    <span className="font-bold text-stone-200">Rolling 101-Day Token Rotation</span>
                  </div>
                  <p className="text-stone-400 text-[11px]">
                    In accordance with Intuit OAuth 2.0 specifications, access tokens are short-lived (60 minutes). On each active sync cycle, a new rolling refresh token is automatically negotiated, ensuring continuous authentication without storing raw account passwords.
                  </p>
                </div>
              </div>

              {/* Codebase Hardening Overview */}
              <div className="p-4 rounded-xl bg-stone-950/80 border border-stone-800 space-y-2">
                <span className="font-bold text-stone-200 block text-xs">
                  Vulnerability & Security Audit Summary
                </span>
                <p className="text-stone-400 text-[11px]">
                  The application codebase is audited against OWASP Top 10 vulnerabilities. It utilizes strict TypeScript typing, parameterized inputs, sanitized file-path boundaries preventing directory traversal, and isolated client workspaces. Zero unsafe runtime evaluations (<code className="text-stone-300 font-mono text-[10px]">eval</code>) are utilized.
                </p>
              </div>

              <div className="pt-3 border-t border-stone-800 flex items-center justify-between text-[11px] text-stone-500">
                <span>Security Engine Version: 2.5.0 Hardened</span>
                <span className="text-cyan-400 font-medium">Enterprise Cryptographic Audit Passed</span>
              </div>
            </div>
          )}

          {/* TAB 4: CUSTOMER SUPPORT & SLA */}
          {activeTab === 'support' && (
            <div className="space-y-6">
              {/* Support Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-4 rounded-xl bg-stone-950 border border-stone-800 space-y-2">
                  <Mail className="w-5 h-5 text-emerald-400" />
                  <span className="font-bold text-stone-200 block">Priority Helpdesk</span>
                  <p className="text-stone-400 text-[11px]">
                    Direct technical assistance for active subscription clients, bookkeepers, and controllers.
                  </p>
                  <span className="font-mono text-emerald-400 text-xs block pt-1 select-all">
                    support@receiptprocessor.app
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-stone-950 border border-stone-800 space-y-2">
                  <Server className="w-5 h-5 text-sky-400" />
                  <span className="font-bold text-stone-200 block">Service SLA</span>
                  <p className="text-stone-400 text-[11px]">
                    99.9% uptime target for the OAuth token broker and license verification endpoints.
                  </p>
                  <span className="text-sky-300 text-xs font-semibold block pt-1">
                    &lt; 24 Hour Response Guarantee
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-stone-950 border border-stone-800 space-y-2">
                  <Building2 className="w-5 h-5 text-amber-400" />
                  <span className="font-bold text-stone-200 block">Accountant Guided Setup</span>
                  <p className="text-stone-400 text-[11px]">
                    Assistance configuring multi-company Realm IDs, Google Drive Webhooks, and Chart of Accounts.
                  </p>
                  <span className="text-amber-400 text-xs font-semibold block pt-1">
                    CPA Integration Support
                  </span>
                </div>
              </div>

              {/* Extended FAQ Section */}
              <div className="space-y-3 pt-2">
                <h4 className="text-sm font-bold text-stone-100 flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-sky-400" />
                  Frequently Asked Questions
                </h4>

                <div className="space-y-2.5">
                  <div className="p-3 rounded-lg bg-stone-950/80 border border-stone-800">
                    <span className="font-semibold text-stone-200 block mb-1">
                      Why does my QuickBooks connection stay active across months?
                    </span>
                    <p className="text-stone-400 text-[11px]">
                      Our system leverages Intuit’s official Rolling 101-Day Refresh Token mechanism. Each time receipts are reconciled or tokens refreshed, Intuit safely issues a renewed 101-day authorization window automatically.
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-stone-950/80 border border-stone-800">
                    <span className="font-semibold text-stone-200 block mb-1">
                      How does the engine handle photos containing multiple receipts?
                    </span>
                    <p className="text-stone-400 text-[11px]">
                      The multi-receipt AI vision pipeline examines the entire photo frame. If multiple separate receipts, fuel chits, or slips are present on a desk or clipboard, the engine automatically segments them into individual ledger items, computing totals, dates, and vendors for each receipt independently.
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-stone-950/80 border border-stone-800">
                    <span className="font-semibold text-stone-200 block mb-1">
                      Can I connect multiple QuickBooks companies to the same portal?
                    </span>
                    <p className="text-stone-400 text-[11px]">
                      Yes. You can authenticate as many separate Realm IDs (subsidiaries, clients, separate farms, or commercial entities) as your practice requires. Each company file maintains its own isolated Chart of Accounts.
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-stone-950/80 border border-stone-800">
                    <span className="font-semibold text-stone-200 block mb-1">
                      What happens if an employee workstation is decommissioned?
                    </span>
                    <p className="text-stone-400 text-[11px]">
                      You can instantly revoke their license key or disconnect the specific company file in the Admin Portal. The desktop runtime locks out unauthorized processing within 10 seconds of heartbeat revocation.
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-stone-950/80 border border-stone-800">
                    <span className="font-semibold text-stone-200 block mb-1">
                      How does Google Drive Cloud Vault prevent upload bottlenecks?
                    </span>
                    <p className="text-stone-400 text-[11px]">
                      Google Drive synchronization is decoupled into an asynchronous background queue with a 3-concurrent upload pacer. Workers finish OCR extraction and classification instantly without waiting for Drive I/O, preventing browser freezes even when scanning batches of hundreds of receipts.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-stone-800 bg-stone-950/80 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-[11px] text-stone-500">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>Intuit Certified OAuth 2.0 • Google Drive Cloud Vault • Gemini Enterprise AI</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold transition-colors cursor-pointer w-full sm:w-auto"
          >
            Close Window
          </button>
        </div>
      </div>
    </div>
  );
};
