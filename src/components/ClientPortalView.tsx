import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Key, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  ChevronRight, 
  Mail, 
  Copy, 
  Check,
  Sparkles,
  Tag,
  Send,
  X,
  Shield,
  FileSpreadsheet,
  User,
  Building,
  Layers,
  MessageSquare,
  Zap
} from 'lucide-react';
import { LicenseKeyRecord, ProductInquiry, getPlanDurationDays, getPlanLabel } from '../types';
import { computeSha256Hex } from '../hashUtils';
import { CLOUDFLARE_WORKER_URL } from '../licenseSyncService';

interface ClientPortalViewProps {
  licenseKeys: LicenseKeyRecord[];
  currentVersion: string;
  onInquirySubmitted?: (inquiry: ProductInquiry) => void;
  onOpenLegal?: (tab: 'privacy' | 'terms' | 'support') => void;
}

export const ClientPortalView: React.FC<ClientPortalViewProps> = ({
  licenseKeys,
  currentVersion,
  onInquirySubmitted,
  onOpenLegal
}) => {
  const [clientKeyInput, setClientKeyInput] = useState('');
  const [checkResult, setCheckResult] = useState<{
    valid: boolean;
    plan?: string;
    expiresDate?: string;
    status?: string;
    message: string;
  } | null>(null);
  
  // Early Access / Product Interest Form State
  const [inquiryName, setInquiryName] = useState('');
  const [inquiryEmail, setInquiryEmail] = useState('');
  const [inquiryCompany, setInquiryCompany] = useState('');
  const [inquiryVolume, setInquiryVolume] = useState('50 - 200 receipts / month');
  const [inquiryPlan, setInquiryPlan] = useState('6-Month Semi-Annual ($59)');
  const [inquiryNotes, setInquiryNotes] = useState('');
  const [isSubmittingInquiry, setIsSubmittingInquiry] = useState(false);
  const [inquirySubmittedSuccess, setInquirySubmittedSuccess] = useState(false);
  const [inquiryError, setInquiryError] = useState<string | null>(null);

  // Pricing & Order Request Modal state
  const [selectedPlanForOrder, setSelectedPlanForOrder] = useState<{
    id: string;
    name: string;
    price: string;
    originalPrice?: string;
    period: string;
    durationDays: number;
    savingsBadge?: string;
  } | null>(null);

  const [orderName, setOrderName] = useState('');
  const [orderEmail, setOrderEmail] = useState('');
  const [orderNote, setOrderNote] = useState('');
  const [copiedOrderDetails, setCopiedOrderDetails] = useState(false);

  const handleOpenOrderModal = (plan: {
    id: string;
    name: string;
    price: string;
    originalPrice?: string;
    period: string;
    durationDays: number;
    savingsBadge?: string;
  }) => {
    setSelectedPlanForOrder(plan);
    setCopiedOrderDetails(false);
  };

  const handleInquirySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setInquiryError(null);

    const cleanName = inquiryName.trim();
    const cleanEmail = inquiryEmail.trim();

    if (!cleanName) {
      setInquiryError('Please provide your name.');
      return;
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setInquiryError('Please provide a valid contact email address.');
      return;
    }

    setIsSubmittingInquiry(true);

    const newInquiry: ProductInquiry = {
      id: `inquiry-${Date.now()}`,
      name: cleanName,
      email: cleanEmail,
      company: inquiryCompany.trim() || undefined,
      receiptVolume: inquiryVolume,
      interestedPlan: inquiryPlan,
      notes: inquiryNotes.trim() || undefined,
      submittedAt: new Date().toISOString()
    };

    // 1. Save locally to localStorage
    try {
      const existingRaw = localStorage.getItem('receipt_processor_inquiries');
      const existing: ProductInquiry[] = existingRaw ? JSON.parse(existingRaw) : [];
      localStorage.setItem('receipt_processor_inquiries', JSON.stringify([newInquiry, ...existing]));
    } catch {}

    // 2. Dispatch to backend API /api/inquiries
    fetch('/api/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newInquiry)
    }).catch(err => {
      console.warn('Local Inquiry API dispatch notice:', err);
    });

    // 3. Simultaneously dispatch to Cloudflare KV Edge API
    fetch(`${CLOUDFLARE_WORKER_URL}/api/inquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newInquiry)
    }).catch(cfErr => {
      console.warn('Cloudflare Inquiry dispatch notice:', cfErr);
    });

    if (onInquirySubmitted) {
      onInquirySubmitted(newInquiry);
    }

    setTimeout(() => {
      setIsSubmittingInquiry(false);
      setInquirySubmittedSuccess(true);
    }, 400);
  };

  const getInquiryMailtoUrl = () => {
    const subject = encodeURIComponent(`Software Access Request: ${inquiryPlan} - ${inquiryName}`);
    const body = encodeURIComponent(
      `Hello moisttowlett247@gmail.com,\n\n` +
      `I would like to request software access and license onboarding for Receipt Processor Desktop.\n\n` +
      `Applicant Details:\n` +
      `- Full Name: ${inquiryName}\n` +
      `- Contact Email: ${inquiryEmail}\n` +
      `- Business / Farm: ${inquiryCompany || 'Individual'}\n` +
      `- Monthly Volume: ${inquiryVolume}\n` +
      `- Interested Plan: ${inquiryPlan}\n` +
      (inquiryNotes ? `- Additional Notes: ${inquiryNotes}\n\n` : '\n') +
      `Please review my inquiry and provide instructions to get started.\n\nThank you,\n${inquiryName}`
    );
    return `mailto:moisttowlett247@gmail.com?subject=${subject}&body=${body}`;
  };

  const getInquiryGmailWebUrl = () => {
    const subject = encodeURIComponent(`Software Access Request: ${inquiryPlan} - ${inquiryName}`);
    const body = encodeURIComponent(
      `Hello moisttowlett247@gmail.com,\n\n` +
      `I would like to request software access and license onboarding for Receipt Processor Desktop.\n\n` +
      `Applicant Details:\n` +
      `- Full Name: ${inquiryName}\n` +
      `- Contact Email: ${inquiryEmail}\n` +
      `- Business / Farm: ${inquiryCompany || 'Individual'}\n` +
      `- Monthly Volume: ${inquiryVolume}\n` +
      `- Interested Plan: ${inquiryPlan}\n` +
      (inquiryNotes ? `- Additional Notes: ${inquiryNotes}\n\n` : '\n') +
      `Please review my inquiry and provide instructions to get started.\n\nThank you,\n${inquiryName}`
    );
    return `https://mail.google.com/mail/?view=cm&fs=1&to=moisttowlett247@gmail.com&su=${subject}&body=${body}`;
  };

  const handleCopyInquirySummary = () => {
    const text = 
      `Software Access Request for moisttowlett247@gmail.com\n\n` +
      `- Name: ${inquiryName}\n` +
      `- Email: ${inquiryEmail}\n` +
      `- Company/Farm: ${inquiryCompany || 'Individual'}\n` +
      `- Receipt Volume: ${inquiryVolume}\n` +
      `- Requested Plan: ${inquiryPlan}\n` +
      (inquiryNotes ? `- Notes: ${inquiryNotes}\n` : '') +
      `- Submitted: ${new Date().toLocaleString()}\n`;
    navigator.clipboard.writeText(text);
    setCopiedOrderDetails(true);
    setTimeout(() => setCopiedOrderDetails(false), 2500);
  };

  const getOrderMailtoUrl = () => {
    if (!selectedPlanForOrder) return '';
    const subject = encodeURIComponent(`License Key Request: ${selectedPlanForOrder.name} (${selectedPlanForOrder.price})`);
    const body = encodeURIComponent(
      `Hello moisttowlett247@gmail.com,\n\nI would like to purchase an activation key for Receipt Processor Desktop.\n\n` +
      `Selected Plan: ${selectedPlanForOrder.name}\n` +
      `Price: ${selectedPlanForOrder.price} (${selectedPlanForOrder.period})\n` +
      `Name: ${orderName || 'Not specified'}\n` +
      `Email: ${orderEmail || 'Not specified'}\n` +
      (orderNote ? `Notes: ${orderNote}\n\n` : '\n') +
      `Please provide instructions to complete payment and receive my license key.\n\nThank you!`
    );
    const contactEmail = 'moisttowlett247@gmail.com';
    return `mailto:${contactEmail}?subject=${subject}&body=${body}`;
  };

  const getOrderGmailWebUrl = () => {
    if (!selectedPlanForOrder) return '';
    const subject = encodeURIComponent(`License Key Request: ${selectedPlanForOrder.name} (${selectedPlanForOrder.price})`);
    const body = encodeURIComponent(
      `Hello moisttowlett247@gmail.com,\n\nI would like to purchase an activation key for Receipt Processor Desktop.\n\n` +
      `Selected Plan: ${selectedPlanForOrder.name}\n` +
      `Price: ${selectedPlanForOrder.price} (${selectedPlanForOrder.period})\n` +
      `Name: ${orderName || 'Not specified'}\n` +
      `Email: ${orderEmail || 'Not specified'}\n` +
      (orderNote ? `Notes: ${orderNote}\n\n` : '\n') +
      `Please provide instructions to complete payment and receive my license key.\n\nThank you!`
    );
    return `https://mail.google.com/mail/?view=cm&fs=1&to=moisttowlett247@gmail.com&su=${subject}&body=${body}`;
  };

  const handleCopyOrderSummary = () => {
    if (!selectedPlanForOrder) return;
    const contactEmail = 'moisttowlett247@gmail.com';
    const text = 
      `Subject: License Key Request - ${selectedPlanForOrder.name} (${selectedPlanForOrder.price})\n\n` +
      `Hi,\n\nI want to request a license key for Receipt Processor Desktop:\n` +
      `- Plan: ${selectedPlanForOrder.name} (${selectedPlanForOrder.period})\n` +
      `- Price: ${selectedPlanForOrder.price}\n` +
      `- My Name: ${orderName || '[Your Name]'}\n` +
      `- My Email: ${orderEmail || '[Your Email]'}\n` +
      (orderNote ? `- Notes: ${orderNote}\n` : '') +
      `\nPlease send instructions to ${contactEmail}.`;
    navigator.clipboard.writeText(text);
    setCopiedOrderDetails(true);
    setTimeout(() => setCopiedOrderDetails(false), 2500);
  };

  const handleVerifyClientKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = clientKeyInput.trim().toUpperCase();
    if (!cleanKey) {
      setCheckResult({
        valid: false,
        message: 'Please enter a valid license key.'
      });
      return;
    }

    // 1. Try Zero-Knowledge SHA-256 hash lookup in public/licenses/<hash>.json
    try {
      const hash = await computeSha256Hex(cleanKey);
      const resp = await fetch(`/licenses/${hash}.json`, { cache: 'no-store' });
      if (resp.ok) {
        const data = await resp.json();
        if (data.status === 'REVOKED') {
          setCheckResult({
            valid: false,
            status: 'Revoked / Inactive',
            message: 'Access Denied: This license key has been revoked or deactivated by the administrator.'
          });
          return;
        }
        if (data.status === 'EXPIRED') {
          setCheckResult({
            valid: false,
            status: 'Expired',
            message: `This license expired on ${data.expires || 'the expiration date'}. Please renew your subscription.`
          });
          return;
        }

        // Active status
        const isNonExpiring = data.plan === 'ADMIN' || data.expires?.includes('Never') || data.expires?.includes('Lifetime');
        setCheckResult({
          valid: true,
          plan: data.plan === 'ADMIN' ? 'Perpetual Master Access' : getPlanLabel(data.plan as any),
          expiresDate: isNonExpiring ? 'Never (Lifetime License)' : (data.expires || 'Active'),
          status: 'Active (Verified on Server)',
          message: isNonExpiring
            ? 'Lifetime perpetual master license is active. Full desktop scanning, OCR extraction, and tax report export authorized.'
            : `Active subscription verified. Valid through ${data.expires}. Ready for desktop activation.`
        });
        return;
      }
    } catch {
      // Fall back to in-memory/localStorage keys check
    }

    // 2. Search for match in active registry (local fallback / simulator)
    const matched = licenseKeys.find(k => k.key.toUpperCase() === cleanKey);

    if (matched) {
      if (matched.status === 'NOT ACTIVE') {
        setCheckResult({
          valid: false,
          status: 'Revoked / Inactive',
          message: 'Access Denied: This license key has been deactivated or revoked by the administrator.'
        });
        return;
      }

      if (matched.status === 'EXPIRED') {
        setCheckResult({
          valid: false,
          status: 'Expired',
          message: `This license expired on ${matched.expiresDate}. Please renew your subscription to continue scanning.`
        });
        return;
      }

      const isNonExpiring = matched.plan === 'ADMIN' || matched.expiresDate?.includes('Never');
      setCheckResult({
        valid: true,
        plan: matched.plan === 'ADMIN' ? 'Perpetual Master Access' : getPlanLabel(matched.plan),
        expiresDate: isNonExpiring ? 'Never (Lifetime License)' : matched.expiresDate,
        status: matched.inUse ? 'Active (Assigned to Workstation)' : 'Active (Available for Activation)',
        message: isNonExpiring
          ? 'Lifetime perpetual master license is active. Full desktop scanning, OCR extraction, and tax report export authorized.'
          : `Active subscription verified. Valid through ${matched.expiresDate}. ${matched.inUse ? 'Already activated on registered workstation.' : 'Ready for first-time desktop activation.'}`
      });
      return;
    }

    setCheckResult({
      valid: false,
      status: 'Invalid / Unregistered',
      message: 'Unrecognized License Key: Key does not exist or has been deleted from the authorized repository.'
    });
  };

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col font-sans selection:bg-amber-500 selection:text-stone-950">
      {/* Top Client Navbar */}
      <header className="border-b border-stone-800 bg-stone-900/90 backdrop-blur sticky top-0 z-30 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-semibold tracking-tight text-stone-100">
                Receipt Processor
              </h1>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                Official Portal v{currentVersion}
              </span>
            </div>
            <p className="text-xs text-stone-400 hidden sm:block">
              Automated Receipt OCR, Expense Categorization & Tax Preparation Ledger
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-2.5">
          <a
            href="#request-access"
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white rounded-lg shadow-sm transition-colors cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Request Access</span>
          </a>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div className="text-center max-w-2xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium">
            <ShieldCheck className="w-3.5 h-3.5" />
            Official Desktop Client Portal
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-stone-100">
            Automated Receipt OCR & Tax Prep Application
          </h2>
          <p className="text-xs sm:text-sm text-stone-400 leading-relaxed">
            Eliminate hours of manual data entry. Our workstation software scans receipts, categorizes deductible business expenses, and produces clean Excel ledgers.
          </p>
        </div>

        {/* Two-Column Grid: Product Interest Form & Verify License */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6" id="request-access">
          {/* Card 1: Product Inquiry / Request Access Form */}
          <div className="p-6 rounded-2xl bg-stone-900/90 border border-stone-800 flex flex-col justify-between space-y-5 shadow-lg">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-stone-100">Request Software Access</h3>
                  <p className="text-xs text-stone-400">Join our exclusive desktop release list</p>
                </div>
              </div>

              <p className="text-xs text-stone-300 leading-relaxed">
                We are actively onboarding small businesses, accountants, and independent contractors. Fill out this brief form to request your personalized workstation build and license key.
              </p>

              {inquirySubmittedSuccess ? (
                <div className="p-5 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-xs text-emerald-200 space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-center gap-2 font-bold text-sm text-emerald-400">
                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                    <span>Inquiry Sent & Dispatched!</span>
                  </div>
                  <p className="leading-relaxed text-stone-300">
                    Thank you, <strong className="text-stone-100">{inquiryName}</strong>! Your software access request for the <strong className="text-amber-400">{inquiryPlan}</strong> has been logged in the system and routed directly to administrator <strong className="text-stone-100">moisttowlett247@gmail.com</strong>.
                  </p>
                  
                  <div className="p-3 bg-stone-900/90 rounded-lg border border-stone-800 space-y-2">
                    <div className="text-[11px] text-stone-400 flex items-center justify-between">
                      <span>Recipient:</span>
                      <strong className="text-amber-400 font-mono">moisttowlett247@gmail.com</strong>
                    </div>
                    <div className="text-[11px] text-stone-400 flex items-center justify-between">
                      <span>Applicant:</span>
                      <span className="text-stone-200">{inquiryName} ({inquiryEmail})</span>
                    </div>
                  </div>

                  <div className="space-y-2 pt-1">
                    <a
                      href={getInquiryGmailWebUrl()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2.5 px-3 bg-red-600 hover:bg-red-500 text-white font-semibold text-xs rounded-xl shadow transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>Send Direct via Web Gmail (Pre-filled)</span>
                    </a>

                    <button
                      type="button"
                      onClick={() => {
                        window.location.href = getInquiryMailtoUrl();
                      }}
                      className="w-full py-2.5 px-3 bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs rounded-xl shadow transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Open in Desktop Email App</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleCopyInquirySummary}
                      className="w-full py-2 px-3 bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white text-xs font-medium rounded-xl border border-stone-700 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {copiedOrderDetails ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Inquiry Copied to Clipboard!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Inquiry Summary</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="pt-2 border-t border-emerald-900/40 flex items-center justify-between">
                    <span className="text-[11px] text-stone-400">We respond promptly to all incoming inquiries.</span>
                    <button
                      type="button"
                      onClick={() => {
                        setInquirySubmittedSuccess(false);
                        setInquiryName('');
                        setInquiryEmail('');
                        setInquiryCompany('');
                        setInquiryNotes('');
                      }}
                      className="text-amber-400 hover:text-amber-300 underline font-medium cursor-pointer text-xs"
                    >
                      Submit another inquiry
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleInquirySubmit} className="space-y-3 text-xs">
                  {inquiryError && (
                    <div className="p-2.5 bg-rose-950/50 border border-rose-800/60 rounded-lg text-rose-300 flex items-center gap-2">
                      <XCircle className="w-4 h-4 shrink-0 text-rose-400" />
                      <span>{inquiryError}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-stone-300 font-medium block mb-1">
                        Full Name <span className="text-amber-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={inquiryName}
                        onChange={(e) => setInquiryName(e.target.value)}
                        placeholder="e.g. Sarah Jenkins"
                        required
                        className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-stone-100 placeholder-stone-600 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div>
                      <label className="text-stone-300 font-medium block mb-1">
                        Email Address <span className="text-amber-400">*</span>
                      </label>
                      <input
                        type="email"
                        value={inquiryEmail}
                        onChange={(e) => setInquiryEmail(e.target.value)}
                        placeholder="name@business.com"
                        required
                        className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-stone-100 placeholder-stone-600 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-stone-300 font-medium block mb-1">
                        Business / Company (Optional)
                      </label>
                      <input
                        type="text"
                        value={inquiryCompany}
                        onChange={(e) => setInquiryCompany(e.target.value)}
                        placeholder="e.g. Jenkins Farm & Co"
                        className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-stone-100 placeholder-stone-600 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div>
                      <label className="text-stone-300 font-medium block mb-1">
                        Expected Monthly Receipts
                      </label>
                      <select
                        value={inquiryVolume}
                        onChange={(e) => setInquiryVolume(e.target.value)}
                        className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-stone-200 focus:outline-none focus:border-amber-500"
                      >
                        <option value="Under 50 receipts / month">Under 50 receipts / mo</option>
                        <option value="50 - 200 receipts / month">50 - 200 receipts / mo</option>
                        <option value="200 - 500 receipts / month">200 - 500 receipts / mo</option>
                        <option value="500+ receipts / month">500+ receipts / mo</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-stone-300 font-medium block mb-1">
                      Target Subscription Plan
                    </label>
                    <select
                      value={inquiryPlan}
                      onChange={(e) => setInquiryPlan(e.target.value)}
                      className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-stone-200 focus:outline-none focus:border-amber-500"
                    >
                      <option value="Monthly Plan ($15/mo)">Monthly Plan — $15 / month</option>
                      <option value="3-Month Quarterly ($39)">3-Month Quarterly — $39 / 3 mos</option>
                      <option value="6-Month Semi-Annual ($59) - Recommended">6-Month Semi-Annual — $59 / 6 mos (Popular)</option>
                      <option value="Full Year Annual ($89) - Best Deal">Full Year Annual — $89 / year (Best Deal)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-stone-300 font-medium block mb-1">
                      Notes or Specific Requirements (Optional)
                    </label>
                    <textarea
                      rows={2}
                      value={inquiryNotes}
                      onChange={(e) => setInquiryNotes(e.target.value)}
                      placeholder="e.g. Needed for Schedule F farm deductions or QuickBooks sync..."
                      className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-stone-100 placeholder-stone-600 focus:outline-none focus:border-amber-500 resize-none"
                    />
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isSubmittingInquiry}
                      className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 font-semibold text-white rounded-xl text-xs transition-all shadow-md active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Send className="w-4 h-4" />
                      <span>{isSubmittingInquiry ? 'Submitting...' : 'Submit Interest & Request Build'}</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>

          {/* Card 2: Client License Key Verification */}
          <div className="p-6 rounded-2xl bg-stone-900/90 border border-stone-800 flex flex-col justify-between space-y-5 shadow-lg">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-stone-100">Verify License Key Status</h3>
                  <p className="text-xs text-stone-400">Check subscription validity & expiration</p>
                </div>
              </div>

              <p className="text-xs text-stone-300 leading-relaxed">
                Already have an assigned license key? Enter it below to check its real-time activation status, expiration date, and verified plan privileges.
              </p>

              <form onSubmit={handleVerifyClientKey} className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-stone-300 block mb-1">
                    Enter Your License Key
                  </label>
                  <input
                    type="text"
                    value={clientKeyInput}
                    onChange={(e) => setClientKeyInput(e.target.value)}
                    placeholder="e.g. 6MONTH-9842-8710-2026 or ANNUAL-..."
                    className="w-full text-xs font-mono px-3 py-2.5 bg-stone-950 border border-stone-800 rounded-xl text-stone-100 placeholder-stone-600 focus:outline-none focus:border-sky-500 uppercase tracking-wider"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2 px-4 bg-stone-800 hover:bg-stone-700 text-stone-200 hover:text-white rounded-xl text-xs font-medium border border-stone-700 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
                  Check License Status
                </button>
              </form>

              {checkResult && (
                <div className={`p-3.5 rounded-xl border text-xs space-y-1.5 ${
                  checkResult.valid 
                    ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-200' 
                    : 'bg-rose-950/40 border-rose-800/60 text-rose-200'
                }`}>
                  <div className="flex items-center gap-2 font-semibold text-sm">
                    {checkResult.valid ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <span>{checkResult.status || (checkResult.valid ? 'License Active' : 'Invalid License')}</span>
                  </div>

                  {checkResult.plan && (
                    <div className="text-[11px] text-stone-300">
                      <strong>Plan:</strong> {checkResult.plan}
                    </div>
                  )}

                  {checkResult.expiresDate && (
                    <div className="text-[11px] text-stone-300">
                      <strong>Expiration:</strong> {checkResult.expiresDate}
                    </div>
                  )}

                  <p className="text-[11px] text-stone-400 pt-0.5 leading-relaxed">
                    {checkResult.message}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Pricing & Subscription Plans */}
        <div className="space-y-6">
          <div className="text-center max-w-xl mx-auto space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
              <Tag className="w-3.5 h-3.5" />
              Simple, Honest Independent Pricing
            </div>
            <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-100">
              Choose Your Subscription Plan
            </h3>
            <p className="text-xs text-stone-400">
              Affordable offline-first OCR & spreadsheet generator. Save big with multi-month discounts!
            </p>
          </div>

          {/* 4-Tier Pricing Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* 1. Monthly Plan */}
            <div className="rounded-2xl bg-stone-900/90 border border-stone-800 p-5 flex flex-col justify-between space-y-4 hover:border-stone-700 transition-all shadow-md">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-stone-400">Monthly</span>
                  <span className="text-[11px] px-2 py-0.5 rounded bg-stone-800 text-stone-300 font-medium">30 Days</span>
                </div>

                <div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold text-stone-100">$15</span>
                    <span className="text-xs text-stone-400">/ month</span>
                  </div>
                  <p className="text-[11px] text-stone-500 mt-0.5">Billed monthly • Cancel anytime</p>
                </div>

                <div className="h-px bg-stone-800/80 my-2" />

                <ul className="space-y-2 text-xs text-stone-300">
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span>Local OCR image & PDF scanning</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span>Excel & CSV expense export</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span>Unlimited receipt processing</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span>Pay-as-you-go flexibility</span>
                  </li>
                </ul>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => handleOpenOrderModal({
                    id: 'MONTHLY',
                    name: 'Monthly Plan',
                    price: '$15',
                    period: '30 Days',
                    durationDays: 30
                  })}
                  className="w-full py-2.5 px-3 bg-stone-800 hover:bg-stone-700 text-stone-200 hover:text-white text-xs font-semibold rounded-xl border border-stone-700 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span>Select Monthly</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* 2. 3-Month Plan (Quarterly) */}
            <div className="rounded-2xl bg-stone-900/90 border border-stone-800 p-5 flex flex-col justify-between space-y-4 hover:border-stone-700 transition-all shadow-md">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-stone-400">Quarterly</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-semibold">
                    Save 13%
                  </span>
                </div>

                <div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold text-stone-100">$39</span>
                    <span className="text-xs text-stone-400">/ 3 months</span>
                  </div>
                  <p className="text-[11px] text-amber-400/90 font-mono mt-0.5">~$13.00 / month ($6 savings)</p>
                </div>

                <div className="h-px bg-stone-800/80 my-2" />

                <ul className="space-y-2 text-xs text-stone-300">
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span>Everything in Monthly Plan</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span>Full 90 days continuous access</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span>Great for quarterly estimated tax prep</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span>Full software updates included</span>
                  </li>
                </ul>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => handleOpenOrderModal({
                    id: '3MONTH',
                    name: '3-Month Quarterly Plan',
                    price: '$39',
                    originalPrice: '$45',
                    period: '90 Days',
                    durationDays: 90,
                    savingsBadge: 'Save 13%'
                  })}
                  className="w-full py-2.5 px-3 bg-stone-800 hover:bg-stone-700 text-stone-200 hover:text-white text-xs font-semibold rounded-xl border border-stone-700 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span>Select 3-Month</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* 3. 6-Month Plan (Semi-Annual) - POPULAR OFFER */}
            <div className="rounded-2xl bg-stone-900 border-2 border-amber-500/60 p-5 flex flex-col justify-between space-y-4 shadow-xl relative scale-[1.02]">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-gradient-to-r from-amber-600 to-amber-500 text-stone-950 text-[10px] font-extrabold uppercase rounded-full shadow-md tracking-wider flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Popular Offer • Save 35%
              </div>

              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-amber-400">6 Months</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">
                    180 Days
                  </span>
                </div>

                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-extrabold text-stone-100">$59</span>
                    <span className="text-xs text-stone-500 line-through">$90</span>
                    <span className="text-xs text-stone-400">/ 6 mos</span>
                  </div>
                  <p className="text-[11px] text-amber-400 font-mono mt-0.5 font-semibold">
                    ~$9.83 / month (Under $10/mo!)
                  </p>
                </div>

                <div className="h-px bg-stone-800/80 my-2" />

                <ul className="space-y-2 text-xs text-stone-300">
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span>Everything in Quarterly Plan</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span>Save $31 compared to monthly billing</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span>Mid-year tax review & receipt ledger</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span>Priority email support & feature updates</span>
                  </li>
                </ul>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => handleOpenOrderModal({
                    id: '6MONTH',
                    name: '6-Month Plan (Semi-Annual)',
                    price: '$59',
                    originalPrice: '$90',
                    period: '180 Days',
                    durationDays: 180,
                    savingsBadge: 'Save 35%'
                  })}
                  className="w-full py-2.5 px-3 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl shadow-md transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Choose 6-Month Plan</span>
                </button>
              </div>
            </div>

            {/* 4. Full Year Plan (Annual) - BEST VALUE / 50%+ OFF */}
            <div className="rounded-2xl bg-stone-900 border-2 border-emerald-500/60 p-5 flex flex-col justify-between space-y-4 shadow-xl relative scale-[1.02]">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-emerald-500 text-stone-950 text-[10px] font-extrabold uppercase rounded-full shadow-md tracking-wider flex items-center gap-1">
                <Tag className="w-3 h-3" />
                Best Value • Over 50% Off
              </div>

              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-400">Full Year</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                    365 Days
                  </span>
                </div>

                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-extrabold text-stone-100">$89</span>
                    <span className="text-xs text-stone-500 line-through">$180</span>
                    <span className="text-xs text-stone-400">/ year</span>
                  </div>
                  <p className="text-[11px] text-emerald-400 font-mono mt-0.5 font-semibold">
                    ~$7.42 / month (Save $91 total!)
                  </p>
                </div>

                <div className="h-px bg-stone-800/80 my-2" />

                <ul className="space-y-2 text-xs text-stone-300">
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>Complete 365-day fiscal year coverage</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>Lowest cost per month ($7.42/mo)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>All annual and year-end tax exports</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>Continuous in-place updates included</span>
                  </li>
                </ul>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => handleOpenOrderModal({
                    id: 'ANNUAL',
                    name: 'Full Year Plan (Annual)',
                    price: '$89',
                    originalPrice: '$180',
                    period: '365 Days',
                    durationDays: 365,
                    savingsBadge: 'Over 50% Off'
                  })}
                  className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-md transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Tag className="w-3.5 h-3.5" />
                  <span>Choose Full Year (Best Deal)</span>
                </button>
              </div>
            </div>
          </div>

          {/* Transparent Independent Developer & Tax Advisory Disclosure */}
          <div className="p-5 rounded-2xl bg-stone-900/60 border border-stone-800/90 flex flex-col md:flex-row gap-4 items-start shadow-sm">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div className="space-y-1.5 text-xs">
              <h4 className="font-bold text-stone-200 flex items-center gap-2">
                <span>Independent Developer & Tax Advisory Disclosure</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-stone-800 text-stone-400">Transparency Notice</span>
              </h4>
              <p className="text-stone-400 leading-relaxed">
                I am an independent software developer and coding enthusiast who built this desktop application to eliminate the painful, tedious chore of manual receipt entry and spreadsheet transcription. <strong className="text-stone-300">I am not a certified public accountant (CPA), licensed tax attorney, or financial advisor.</strong>
              </p>
              <p className="text-stone-400 leading-relaxed">
                The pricing above directly reflects this independent status: providing an accessible, high-efficiency software utility at a fraction of enterprise software prices. This application serves strictly as an automated OCR, organization, and extraction assistant. Users should always verify their categorized expenses and consult a qualified, licensed tax professional for official tax filing and legal advice.
              </p>
            </div>
          </div>
        </div>

        {/* Order / License Request Modal */}
        {selectedPlanForOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
            <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5">
              <div className="flex items-center justify-between border-b border-stone-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    <Key className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-stone-100">Request License Key</h3>
                    <p className="text-xs text-stone-400">Directly from the developer</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPlanForOrder(null)}
                  className="p-1 rounded-lg text-stone-400 hover:text-stone-200 hover:bg-stone-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Selected Plan Summary */}
              <div className="p-3.5 bg-stone-950 rounded-xl border border-stone-800 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-stone-200 block">{selectedPlanForOrder.name}</span>
                  <span className="text-[11px] text-stone-400">{selectedPlanForOrder.period} activation duration</span>
                </div>
                <div className="text-right">
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-extrabold text-amber-400">{selectedPlanForOrder.price}</span>
                    {selectedPlanForOrder.originalPrice && (
                      <span className="text-xs text-stone-500 line-through">{selectedPlanForOrder.originalPrice}</span>
                    )}
                  </div>
                  {selectedPlanForOrder.savingsBadge && (
                    <span className="text-[10px] font-semibold text-emerald-400">
                      {selectedPlanForOrder.savingsBadge}
                    </span>
                  )}
                </div>
              </div>

              {/* Contact Form Details */}
              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-stone-300 font-medium block mb-1">Your Name</label>
                  <input
                    type="text"
                    value={orderName}
                    onChange={(e) => setOrderName(e.target.value)}
                    placeholder="e.g. John Miller"
                    className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-stone-100 placeholder-stone-600 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-stone-300 font-medium block mb-1">Your Email (for license delivery)</label>
                  <input
                    type="email"
                    value={orderEmail}
                    onChange={(e) => setOrderEmail(e.target.value)}
                    placeholder="e.g. name@example.com"
                    className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-stone-100 placeholder-stone-600 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-stone-300 font-medium block mb-1">Optional Message / Questions</label>
                  <textarea
                    rows={2}
                    value={orderNote}
                    onChange={(e) => setOrderNote(e.target.value)}
                    placeholder="Any specific questions or preferred payment methods..."
                    className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-stone-100 placeholder-stone-600 focus:outline-none focus:border-amber-500 resize-none"
                  />
                </div>
              </div>

              {/* Actions: Send Email or Copy Details */}
              <div className="pt-2 space-y-2">
                <a
                  href={getOrderGmailWebUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-500 text-white font-semibold text-xs rounded-xl shadow transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Mail className="w-4 h-4" />
                  <span>Send via Web Gmail (Pre-filled to moisttowlett247@gmail.com)</span>
                </a>

                <button
                  type="button"
                  onClick={() => {
                    window.location.href = getOrderMailtoUrl();
                  }}
                  className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs rounded-xl shadow transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>Open in Desktop Email App</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyOrderSummary}
                  className="w-full py-2 px-4 bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white text-xs font-medium rounded-xl border border-stone-700 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {copiedOrderDetails ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-400">Order Details Copied to Clipboard!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copy Request Details to Clipboard</span>
                    </>
                  )}
                </button>
              </div>

              <p className="text-[11px] text-stone-500 text-center leading-relaxed">
                Keys are issued and emailed promptly upon order confirmation and review.
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-800/80 bg-stone-950 py-5 px-6 text-center text-xs text-stone-500 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>QuickBooks Online Certified OAuth 2.0 • TLS 1.3 Transport Security</span>
        </div>

        <div className="flex items-center gap-3 text-stone-400 text-[11px]">
          <button
            type="button"
            onClick={() => {
              if (onOpenLegal) onOpenLegal('privacy');
              else window.location.hash = 'privacy';
            }}
            className="hover:text-emerald-400 hover:underline cursor-pointer bg-transparent border-0 p-0 text-[11px]"
          >
            Privacy Policy
          </button>
          <span>•</span>
          <button
            type="button"
            onClick={() => {
              if (onOpenLegal) onOpenLegal('terms');
              else window.location.hash = 'terms';
            }}
            className="hover:text-amber-400 hover:underline cursor-pointer bg-transparent border-0 p-0 text-[11px]"
          >
            Terms & EULA
          </button>
          <span>•</span>
          <button
            type="button"
            onClick={() => {
              if (onOpenLegal) onOpenLegal('support');
              else window.location.hash = 'support';
            }}
            className="hover:text-sky-400 hover:underline cursor-pointer bg-transparent border-0 p-0 text-[11px]"
          >
            Support & SLA
          </button>
        </div>

        <div className="flex items-center gap-4">
          <span>License Support: <strong className="text-stone-400">moisttowlett247@gmail.com</strong></span>
        </div>
      </footer>
    </div>
  );
};
