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
  AlertTriangle
} from 'lucide-react';

interface LegalAndComplianceModalProps {
  isOpen: boolean;
  activeTab: 'privacy' | 'terms' | 'support';
  onClose: () => void;
  onTabChange: (tab: 'privacy' | 'terms' | 'support') => void;
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
      <div className="bg-stone-900 border border-stone-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-stone-800 flex items-center justify-between bg-stone-950/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-stone-100">
                Legal & Compliance Center
              </h3>
              <p className="text-xs text-stone-400">
                Official Intuit QuickBooks App Store Compliant Disclosures
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-200 hover:bg-stone-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-stone-800 bg-stone-950/30 px-6 gap-2 shrink-0">
          <button
            onClick={() => onTabChange('privacy')}
            className={`py-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
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
            className={`py-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'terms'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Terms of Service & EULA</span>
          </button>

          <button
            onClick={() => onTabChange('support')}
            className={`py-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'support'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            <span>Customer Support & SLA</span>
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-stone-300 leading-relaxed">
          {/* TAB 1: PRIVACY POLICY */}
          {activeTab === 'privacy' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-800/40 space-y-2">
                <span className="font-bold text-emerald-300 text-sm block">
                  Intuit QuickBooks Data Protection Guarantee
                </span>
                <p className="text-stone-300">
                  Receipt Processor Enterprise is engineered with privacy-by-design principles. We do not sell, rent, monetize,
                  or share financial transaction details, chart of account hierarchies, or customer receipt data with any third-party advertisers or brokers.
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-bold text-stone-100">1. Information We Collect</h4>
                <p>
                  When you authenticate through QuickBooks Online and execute automated receipt processing, our application processes:
                </p>
                <ul className="list-disc list-inside space-y-1 pl-2 text-stone-400">
                  <li><strong>QuickBooks Company Profile:</strong> Realm ID, legal business entity name, country, and base currency.</li>
                  <li><strong>Receipt OCR Attributes:</strong> Transaction date, vendor/payee name, total amount, sales tax, line items, and account category classifications.</li>
                  <li><strong>Authentication Credentials:</strong> OAuth 2.0 refresh and access tokens issued directly by Intuit.</li>
                  <li><strong>Device Telemetry:</strong> Machine hostname, hardware hash (HWID), and public IP address for license verification and subscription compliance.</li>
                </ul>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-bold text-stone-100">2. Encryption & Data Security</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-stone-950 border border-stone-800 space-y-1">
                    <span className="font-bold text-stone-200 block flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-amber-400" />
                      Encryption At Rest (AES-256-GCM)
                    </span>
                    <p className="text-stone-400 text-[11px]">
                      All Intuit OAuth 2.0 refresh tokens are encrypted on our secure server using authenticated AES-256-GCM cryptography with unique initialization vectors.
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-stone-950 border border-stone-800 space-y-1">
                    <span className="font-bold text-stone-200 block flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      In-Transit Transport Security (TLS 1.3)
                    </span>
                    <p className="text-stone-400 text-[11px]">
                      All API communications with Intuit and the desktop processor enforce strict HTTPS / TLS 1.3 transport security.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-bold text-stone-100">3. Data Retention & User Disconnect Rights</h4>
                <p>
                  Users maintain absolute control over their accounting data. When you disconnect our app from within QuickBooks Online
                  or click "Disconnect" in the Admin Center, our server immediately revokes all Intuit tokens and purges stored authentication records within 60 seconds.
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-bold text-stone-100">4. Third-Party AI Sub-Processors</h4>
                <p>
                  Receipt image digitization and optical character recognition utilize Google Gemini AI models running under enterprise terms.
                  Customer financial images submitted for processing are processed transiently and are not used to train generalized foundation models.
                </p>
              </div>

              <div className="pt-3 border-t border-stone-800 text-[11px] text-stone-500">
                Last Updated: September 2026 • Compliant with Intuit Developer Terms of Service & GDPR / CCPA standards.
              </div>
            </div>
          )}

          {/* TAB 2: TERMS OF SERVICE / EULA */}
          {activeTab === 'terms' && (
            <div className="space-y-6">
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-stone-100">1. Acceptance of Terms</h4>
                <p>
                  By accessing the Receipt Processor Enterprise portal or executing the desktop processing runtime, you agree to be bound
                  by these End User License Terms. If you are entering into this agreement on behalf of a company, you represent that you have
                  the authority to bind that entity.
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-bold text-stone-100">2. Software License Grant</h4>
                <p>
                  We grant you a non-exclusive, non-transferable license to install and execute the desktop receipt processor on authorized
                  workstations corresponding to your subscription tier (Annual, Monthly, or Enterprise).
                </p>
                <ul className="list-disc list-inside space-y-1 pl-2 text-stone-400">
                  <li>Single workstation binding per active subscription license key.</li>
                  <li>No reverse engineering, decompilation, or unauthorized sub-licensing.</li>
                  <li>License verification is enforced via cryptographic hardware ID and heartbeat pings.</li>
                </ul>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-bold text-stone-100">3. Intuit QuickBooks Disclaimer</h4>
                <p>
                  QuickBooks and QuickBooks Online are registered trademarks of Intuit Inc. Receipt Processor Enterprise is an independent
                  software solution integrated via the official Intuit Developer API and is not directly manufactured or warranted by Intuit Inc.
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-bold text-stone-100">4. Accounting Responsibility & Accuracy</h4>
                <p>
                  While our OCR algorithms achieve industry-leading extraction precision, the user’s accounting team or controller remains
                  solely responsible for auditing, confirming, and reconciling tax categories, expense accounts, and bank reconciliations before filing tax returns.
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-bold text-stone-100">5. Limitation of Liability</h4>
                <p>
                  In no event shall the software authors be liable for any indirect, incidental, punitive, or consequential damages resulting
                  from accounting discrepancies, network timeouts, or third-party API service interruptions.
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: CUSTOMER SUPPORT & SLA */}
          {activeTab === 'support' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-4 rounded-xl bg-stone-950 border border-stone-800 space-y-2">
                  <Mail className="w-5 h-5 text-emerald-400" />
                  <span className="font-bold text-stone-200 block">Priority Helpdesk</span>
                  <p className="text-stone-400 text-[11px]">
                    24/7 technical assistance for subscription clients and accountants.
                  </p>
                  <span className="font-mono text-emerald-400 text-xs block pt-1">
                    support@receiptprocessor.app
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-stone-950 border border-stone-800 space-y-2">
                  <Server className="w-5 h-5 text-sky-400" />
                  <span className="font-bold text-stone-200 block">Service SLA</span>
                  <p className="text-stone-400 text-[11px]">
                    99.9% uptime target for the OAuth token broker and license API.
                  </p>
                  <span className="text-sky-300 text-xs font-semibold block pt-1">
                    &lt; 24 Hour Response Guarantee
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-stone-950 border border-stone-800 space-y-2">
                  <Building2 className="w-5 h-5 text-amber-400" />
                  <span className="font-bold text-stone-200 block">Intuit Integration</span>
                  <p className="text-stone-400 text-[11px]">
                    Direct assistance configuring multi-company Realm IDs and chart of accounts.
                  </p>
                  <span className="text-amber-400 text-xs font-semibold block pt-1">
                    Accountant Guided Setup
                  </span>
                </div>
              </div>

              {/* FAQ Section */}
              <div className="space-y-3 pt-2">
                <h4 className="text-sm font-bold text-stone-100">Frequently Asked Questions</h4>

                <div className="space-y-2">
                  <div className="p-3 rounded-lg bg-stone-950/80 border border-stone-800">
                    <span className="font-semibold text-stone-200 block mb-1">
                      Why does my QuickBooks connection remain active for months?
                    </span>
                    <p className="text-stone-400 text-[11px]">
                      Our system utilizes Intuit’s Rolling 101-Day Refresh Token mechanism. Every time a batch of receipts is uploaded,
                      a fresh refresh token is securely issued and saved, renewing your 101-day authorization window automatically.
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-stone-950/80 border border-stone-800">
                    <span className="font-semibold text-stone-200 block mb-1">
                      What happens if an employee workstation is decommissioned?
                    </span>
                    <p className="text-stone-400 text-[11px]">
                      You can instantly revoke their license key or disconnect the specific company file in the Admin Portal.
                      The desktop application will be locked out within 10 seconds.
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-stone-950/80 border border-stone-800">
                    <span className="font-semibold text-stone-200 block mb-1">
                      Can I connect multiple QuickBooks companies to the same portal?
                    </span>
                    <p className="text-stone-400 text-[11px]">
                      Yes. You can authenticate as many separate Realm IDs (subsidiaries, clients, or separate farm entities)
                      as your organization requires.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-stone-800 bg-stone-950/80 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-stone-500">
            Intuit Certified OAuth 2.0 Protocol • Version 1.1.0 Production Ready
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold transition-colors cursor-pointer"
          >
            Close Window
          </button>
        </div>
      </div>
    </div>
  );
};
