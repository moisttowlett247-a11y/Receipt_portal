// IRS Schedule C and Schedule F Automated Tax Deduction Service
// Generates official line-item deduction summaries and itemized audit ledgers for non-QuickBooks clients.

import JSZip from 'jszip';
import { ClientSubmission } from './clientSubmissionService';
import { MileageTrip } from './clientTaxFeaturesService';
import { getTaxLineOverrides } from './adminTaxRulesService';

export type TaxScheduleType = 'ALL' | 'SCHEDULE_C' | 'SCHEDULE_F';

export interface TaxLineItemMapping {
  schedule: 'SCHEDULE_C' | 'SCHEDULE_F';
  lineNumber: string;
  lineTitle: string;
  irsForm: string;
  description: string;
}

export interface TaxClassification {
  schedule: 'SCHEDULE_C' | 'SCHEDULE_F';
  lineNumber: string;
  lineTitle: string;
  irsForm: string;
  categoryName: string;
  confidence: number;
}

export interface TaxScheduleCategorySummary {
  schedule: 'SCHEDULE_C' | 'SCHEDULE_F';
  lineNumber: string;
  lineTitle: string;
  irsForm: string;
  total: number;
  count: number;
  receipts: ClientSubmission[];
}

export interface TaxScheduleSummary {
  scheduleFilter: TaxScheduleType;
  taxYear: string;
  totalDeductions: number;
  totalReceiptCount: number;
  scheduleCTotal: number;
  scheduleFTotal: number;
  categories: TaxScheduleCategorySummary[];
  itemizedReceipts: Array<{
    submission: ClientSubmission;
    classification: TaxClassification;
  }>;
}

// Official IRS Form 1040 Schedule C Part II Expenses Lines
export const IRS_SCHEDULE_C_LINES: Record<string, string> = {
  'Line 8': 'Advertising',
  'Line 9': 'Car and truck expenses',
  'Line 11': 'Contract labor',
  'Line 14': 'Employee benefit programs',
  'Line 15': 'Insurance (other than health)',
  'Line 16b': 'Interest (other)',
  'Line 17': 'Legal and professional services',
  'Line 18': 'Office expense',
  'Line 20b': 'Rent or lease (other business property)',
  'Line 21': 'Repairs and maintenance',
  'Line 22': 'Supplies (not included in Part III)',
  'Line 23': 'Taxes and licenses',
  'Line 24a': 'Travel',
  'Line 24b': 'Deductible meals (50%)',
  'Line 25': 'Utilities',
  'Line 27a': 'Other expenses'
};

// Official IRS Form 1040 Schedule F Part II Farm Expenses Lines
export const IRS_SCHEDULE_F_LINES: Record<string, string> = {
  'Line 10': 'Car and truck expenses (Gasoline, fuel, and oil)',
  'Line 11': 'Chemicals',
  'Line 12': 'Conservation expenses',
  'Line 13': 'Custom hire (machine work)',
  'Line 15': 'Feed purchased',
  'Line 16': 'Fertilizers and lime',
  'Line 17': 'Freight and trucking',
  'Line 19': 'Insurance (other than health)',
  'Line 20b': 'Interest (other)',
  'Line 21': 'Labor hired (less employment credits)',
  'Line 23': 'Rent or lease (machinery, equipment, land)',
  'Line 24': 'Repairs and maintenance',
  'Line 25': 'Seeds and plants purchased',
  'Line 26': 'Storage and warehousing',
  'Line 27': 'Supplies purchased',
  'Line 28': 'Taxes',
  'Line 29': 'Utilities',
  'Line 30': 'Veterinary, breeding, and medicine',
  'Line 32': 'Other expenses'
};

/**
 * Intelligent categorization of receipts into IRS Schedule C or Schedule F line items.
 */
export function classifyReceiptTaxSchedule(sub: ClientSubmission): TaxClassification {
  const text = `${sub.categoryHint || ''} ${sub.extractedVendor || ''} ${sub.memo || ''} ${sub.fileName || ''}`.toLowerCase();

  // 0. CHECK ADMIN GLOBAL TAX OVERRIDES FIRST
  try {
    const overrides = getTaxLineOverrides().filter(o => o.enabled);
    for (const ov of overrides) {
      const matchVendor = !ov.vendorPattern || text.includes(ov.vendorPattern.toLowerCase());
      const matchKey = !ov.lineKeyword || text.includes(ov.lineKeyword.toLowerCase());
      if (matchVendor && matchKey) {
        return {
          schedule: ov.targetSchedule,
          lineNumber: ov.targetLineNumber,
          lineTitle: ov.targetLineTitle,
          irsForm: ov.targetSchedule === 'SCHEDULE_F' ? 'IRS Form 1040 (Schedule F - Farm)' : 'IRS Form 1040 (Schedule C - Business)',
          categoryName: `Custom: ${ov.targetLineTitle}`,
          confidence: 0.99
        };
      }
    }
  } catch {
    // fallback to standard heuristics
  }

  // 1. FARM SPECIFIC (Schedule F - Form 1040)
  // Check for agricultural indicators
  const isFarmRelated = 
    text.includes('farm') || 
    text.includes('feed') || 
    text.includes('livestock') || 
    text.includes('cow') || 
    text.includes('cattle') || 
    text.includes('chicken') || 
    text.includes('agway') || 
    text.includes('co-op') || 
    text.includes('tractor') || 
    text.includes('john deere') || 
    text.includes('fertilizer') || 
    text.includes('vet') || 
    text.includes('hay') || 
    text.includes('grain') ||
    text.includes('mineral block') ||
    text.includes('fencing');

  if (isFarmRelated) {
    // Feed purchased
    if (text.includes('feed') || text.includes('pellet') || text.includes('scratch') || text.includes('hay') || text.includes('grain') || text.includes('mineral block') || text.includes('starter')) {
      return {
        schedule: 'SCHEDULE_F',
        lineNumber: 'Line 15',
        lineTitle: IRS_SCHEDULE_F_LINES['Line 15'],
        irsForm: 'IRS Form 1040 (Schedule F - Farm)',
        categoryName: 'Farm: Feed Purchased',
        confidence: 0.98
      };
    }

    // Veterinary, medicine & breeding
    if (text.includes('vet') || text.includes('medicine') || text.includes('antibiotic') || text.includes('vaccine') || text.includes('breeding')) {
      return {
        schedule: 'SCHEDULE_F',
        lineNumber: 'Line 30',
        lineTitle: IRS_SCHEDULE_F_LINES['Line 30'],
        irsForm: 'IRS Form 1040 (Schedule F - Farm)',
        categoryName: 'Farm: Veterinary & Medicine',
        confidence: 0.96
      };
    }

    // Fertilizers and lime
    if (text.includes('fertilizer') || text.includes('lime') || text.includes('nutrients') || text.includes('soil')) {
      return {
        schedule: 'SCHEDULE_F',
        lineNumber: 'Line 16',
        lineTitle: IRS_SCHEDULE_F_LINES['Line 16'],
        irsForm: 'IRS Form 1040 (Schedule F - Farm)',
        categoryName: 'Farm: Fertilizers & Lime',
        confidence: 0.95
      };
    }

    // Farm Fuel & Gasoline
    if (text.includes('fuel') || text.includes('diesel') || text.includes('gasoline') || text.includes('propane') || text.includes('shell') || text.includes('exxon') || text.includes('chevron')) {
      return {
        schedule: 'SCHEDULE_F',
        lineNumber: 'Line 10',
        lineTitle: IRS_SCHEDULE_F_LINES['Line 10'],
        irsForm: 'IRS Form 1040 (Schedule F - Farm)',
        categoryName: 'Farm: Fuel, Diesel & Oil',
        confidence: 0.97
      };
    }

    // Farm Machinery Repairs & Maintenance
    if (text.includes('repair') || text.includes('hydraulic') || text.includes('filter') || text.includes('motor oil') || text.includes('belt') || text.includes('part') || text.includes('tractor supply')) {
      return {
        schedule: 'SCHEDULE_F',
        lineNumber: 'Line 24',
        lineTitle: IRS_SCHEDULE_F_LINES['Line 24'],
        irsForm: 'IRS Form 1040 (Schedule F - Farm)',
        categoryName: 'Farm: Repairs & Maintenance',
        confidence: 0.94
      };
    }

    // Seeds and plants
    if (text.includes('seed') || text.includes('seedling') || text.includes('bulbs') || text.includes('crop')) {
      return {
        schedule: 'SCHEDULE_F',
        lineNumber: 'Line 25',
        lineTitle: IRS_SCHEDULE_F_LINES['Line 25'],
        irsForm: 'IRS Form 1040 (Schedule F - Farm)',
        categoryName: 'Farm: Seeds & Plants',
        confidence: 0.93
      };
    }

    // General Farm Supplies
    return {
      schedule: 'SCHEDULE_F',
      lineNumber: 'Line 27',
      lineTitle: IRS_SCHEDULE_F_LINES['Line 27'],
      irsForm: 'IRS Form 1040 (Schedule F - Farm)',
      categoryName: 'Farm: Operating Supplies',
      confidence: 0.90
    };
  }

  // 2. GENERAL BUSINESS / SOLE PROPRIETOR (Schedule C - Form 1040)
  // Car and Truck (Fuel, Maintenance, Tolls)
  if (text.includes('fuel') || text.includes('gasoline') || text.includes('diesel') || text.includes('shell') || text.includes('chevron') || text.includes('exxon') || text.includes('speedway') || text.includes('mileage') || text.includes('parking') || text.includes('toll')) {
    return {
      schedule: 'SCHEDULE_C',
      lineNumber: 'Line 9',
      lineTitle: IRS_SCHEDULE_C_LINES['Line 9'],
      irsForm: 'IRS Form 1040 (Schedule C - Business)',
      categoryName: 'Car & Truck Expenses',
      confidence: 0.96
    };
  }

  // Meals & Entertainment
  if (text.includes('meal') || text.includes('lunch') || text.includes('dinner') || text.includes('restaurant') || text.includes('cafe') || text.includes('starbucks') || text.includes('food') || text.includes('dining')) {
    return {
      schedule: 'SCHEDULE_C',
      lineNumber: 'Line 24b',
      lineTitle: IRS_SCHEDULE_C_LINES['Line 24b'],
      irsForm: 'IRS Form 1040 (Schedule C - Business)',
      categoryName: 'Deductible Business Meals (50%)',
      confidence: 0.92
    };
  }

  // Office Expense & Software
  if (text.includes('office') || text.includes('software') || text.includes('adobe') || text.includes('microsoft') || text.includes('google') || text.includes('paper') || text.includes('staples') || text.includes('subscription') || text.includes('domain') || text.includes('hosting')) {
    return {
      schedule: 'SCHEDULE_C',
      lineNumber: 'Line 18',
      lineTitle: IRS_SCHEDULE_C_LINES['Line 18'],
      irsForm: 'IRS Form 1040 (Schedule C - Business)',
      categoryName: 'Office & Software Expenses',
      confidence: 0.94
    };
  }

  // Repairs & Maintenance
  if (text.includes('repair') || text.includes('maintenance') || text.includes('oil change') || text.includes('plumb') || text.includes('hvac')) {
    return {
      schedule: 'SCHEDULE_C',
      lineNumber: 'Line 21',
      lineTitle: IRS_SCHEDULE_C_LINES['Line 21'],
      irsForm: 'IRS Form 1040 (Schedule C - Business)',
      categoryName: 'Repairs & Maintenance',
      confidence: 0.93
    };
  }

  // Utilities & Communications
  if (text.includes('utilit') || text.includes('electric') || text.includes('water') || text.includes('verizon') || text.includes('at&t') || text.includes('internet') || text.includes('phone') || text.includes('cell')) {
    return {
      schedule: 'SCHEDULE_C',
      lineNumber: 'Line 25',
      lineTitle: IRS_SCHEDULE_C_LINES['Line 25'],
      irsForm: 'IRS Form 1040 (Schedule C - Business)',
      categoryName: 'Utilities & Cell Communications',
      confidence: 0.95
    };
  }

  // Legal and professional
  if (text.includes('legal') || text.includes('attorney') || text.includes('lawyer') || text.includes('cpa') || text.includes('accounting') || text.includes('bookkeep')) {
    return {
      schedule: 'SCHEDULE_C',
      lineNumber: 'Line 17',
      lineTitle: IRS_SCHEDULE_C_LINES['Line 17'],
      irsForm: 'IRS Form 1040 (Schedule C - Business)',
      categoryName: 'Legal & Professional Services',
      confidence: 0.95
    };
  }

  // Advertising & Marketing
  if (text.includes('advertis') || text.includes('marketing') || text.includes('facebook ad') || text.includes('google ads') || text.includes('print') || text.includes('flyer')) {
    return {
      schedule: 'SCHEDULE_C',
      lineNumber: 'Line 8',
      lineTitle: IRS_SCHEDULE_C_LINES['Line 8'],
      irsForm: 'IRS Form 1040 (Schedule C - Business)',
      categoryName: 'Advertising & Marketing',
      confidence: 0.94
    };
  }

  // Default to Supplies & Materials
  return {
    schedule: 'SCHEDULE_C',
    lineNumber: 'Line 22',
    lineTitle: IRS_SCHEDULE_C_LINES['Line 22'],
    irsForm: 'IRS Form 1040 (Schedule C - Business)',
    categoryName: 'Supplies & Operational Materials',
    confidence: 0.88
  };
}

/**
 * Summarize submissions into structured IRS line-item buckets.
 */
export function generateTaxScheduleSummary(
  submissions: ClientSubmission[],
  scheduleFilter: TaxScheduleType = 'ALL',
  taxYearFilter: string = 'ALL'
): TaxScheduleSummary {
  const filtered = submissions.filter(sub => {
    // Only processed/synced or queued items with extracted or estimated amounts
    if (taxYearFilter !== 'ALL') {
      const dateStr = sub.extractedDate || sub.uploadedAt;
      const yr = new Date(dateStr).getFullYear().toString();
      if (yr !== taxYearFilter) return false;
    }
    return true;
  });

  const categoriesMap = new Map<string, TaxScheduleCategorySummary>();
  let totalDeductions = 0;
  let scheduleCTotal = 0;
  let scheduleFTotal = 0;

  const itemizedReceipts: Array<{
    submission: ClientSubmission;
    classification: TaxClassification;
  }> = [];

  for (const sub of filtered) {
    const classification = classifyReceiptTaxSchedule(sub);
    
    // Apply schedule filter
    if (scheduleFilter !== 'ALL' && classification.schedule !== scheduleFilter) {
      continue;
    }

    const amt = sub.extractedAmount || 0;
    totalDeductions += amt;
    if (classification.schedule === 'SCHEDULE_C') {
      scheduleCTotal += amt;
    } else {
      scheduleFTotal += amt;
    }

    itemizedReceipts.push({
      submission: sub,
      classification
    });

    const key = `${classification.schedule}-${classification.lineNumber}`;
    if (!categoriesMap.has(key)) {
      categoriesMap.set(key, {
        schedule: classification.schedule,
        lineNumber: classification.lineNumber,
        lineTitle: classification.lineTitle,
        irsForm: classification.irsForm,
        total: 0,
        count: 0,
        receipts: []
      });
    }

    const bucket = categoriesMap.get(key)!;
    bucket.total += amt;
    bucket.count += 1;
    bucket.receipts.push(sub);
  }

  // Sort categories by schedule and line number
  const categories = Array.from(categoriesMap.values()).sort((a, b) => {
    if (a.schedule !== b.schedule) {
      return a.schedule === 'SCHEDULE_F' ? -1 : 1;
    }
    // Extract line numbers
    const numA = parseInt(a.lineNumber.replace(/[^0-9]/g, '')) || 0;
    const numB = parseInt(b.lineNumber.replace(/[^0-9]/g, '')) || 0;
    return numA - numB;
  });

  return {
    scheduleFilter,
    taxYear: taxYearFilter,
    totalDeductions,
    totalReceiptCount: itemizedReceipts.length,
    scheduleCTotal,
    scheduleFTotal,
    categories,
    itemizedReceipts
  };
}

/**
 * Sanitizes field values for CSV export to protect against formula injection.
 */
function sanitizeCsvValue(val: string | number | undefined | null): string {
  if (val === undefined || val === null) return '""';
  let str = String(val).replace(/"/g, '""');
  // Strip formula prefixes if any
  if (['=', '+', '-', '@'].includes(str.charAt(0))) {
    str = `'` + str;
  }
  return `"${str}"`;
}

/**
 * Export official Tax Schedule CSV for client download.
 */
export function exportTaxScheduleCSV(
  submissions: ClientSubmission[],
  scheduleFilter: TaxScheduleType = 'ALL',
  taxYearFilter: string = '2026',
  clientName: string = 'Business Client'
): void {
  const summary = generateTaxScheduleSummary(submissions, scheduleFilter, taxYearFilter);
  
  const headers = [
    'Tax Year',
    'IRS Schedule',
    'IRS Line Number',
    'IRS Category Title',
    'Receipt Date',
    'Vendor / Payee',
    'Memo / Business Purpose',
    'Receipt File Name',
    'Deductible Amount ($)',
    'Status',
    'Audit Reference ID'
  ];

  const rows: string[][] = [];

  for (const item of summary.itemizedReceipts) {
    const sub = item.submission;
    const cls = item.classification;
    const date = sub.extractedDate || sub.uploadedAt.split('T')[0];
    const yr = new Date(date).getFullYear().toString();

    rows.push([
      yr,
      cls.schedule === 'SCHEDULE_F' ? 'Schedule F (Form 1040)' : 'Schedule C (Form 1040)',
      cls.lineNumber,
      cls.lineTitle,
      date,
      sub.extractedVendor || 'Unspecified Vendor',
      sub.memo || 'Business Operating Expense',
      sub.fileName,
      (sub.extractedAmount || 0).toFixed(2),
      sub.status === 'SYNCED_QBO' ? 'Reconciled & Synced' : 'Intake Queue Verified',
      sub.id
    ]);
  }

  // Prepend line-item totals summary block
  const summaryBlock: string[][] = [
    ['--- IRS TAX DEDUCTION SUMMARY REPORT ---', '', '', '', '', '', '', '', '', '', ''],
    ['Client Entity:', clientName, '', '', '', '', '', '', '', '', ''],
    ['Tax Year:', taxYearFilter, '', '', '', '', '', '', '', '', ''],
    ['Total Deductions Claimed:', `$${summary.totalDeductions.toFixed(2)}`, '', '', '', '', '', '', '', '', ''],
    ['Schedule F Total (Farm):', `$${summary.scheduleFTotal.toFixed(2)}`, '', '', '', '', '', '', '', '', ''],
    ['Schedule C Total (Business):', `$${summary.scheduleCTotal.toFixed(2)}`, '', '', '', '', '', '', '', '', ''],
    ['Total Verified Receipts:', `${summary.totalReceiptCount}`, '', '', '', '', '', '', '', '', ''],
    ['Generated Date:', new Date().toLocaleDateString(), '', '', '', '', '', '', '', '', ''],
    ['Prepared By:', 'Receipt Processor Managed Bookkeeping Engine', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', ''],
    ['--- IRS LINE-ITEM SUB-TOTALS ---', '', '', '', '', '', '', '', '', '', ''],
    ['IRS Schedule', 'IRS Line', 'IRS Category Title', 'Subtotal ($)', 'Receipt Count', '', '', '', '', '', '']
  ];

  for (const cat of summary.categories) {
    summaryBlock.push([
      cat.schedule === 'SCHEDULE_F' ? 'Schedule F' : 'Schedule C',
      cat.lineNumber,
      cat.lineTitle,
      `$${cat.total.toFixed(2)}`,
      `${cat.count}`,
      '', '', '', '', '', ''
    ]);
  }

  summaryBlock.push(['', '', '', '', '', '', '', '', '', '', '']);
  summaryBlock.push(['--- ITEMIZED AUDIT RECEIPT RECORDS ---', '', '', '', '', '', '', '', '', '', '']);

  const csvLines: string[] = [
    ...summaryBlock.map(r => r.map(sanitizeCsvValue).join(',')),
    headers.map(sanitizeCsvValue).join(','),
    ...rows.map(r => r.map(sanitizeCsvValue).join(','))
  ];

  const csvContent = csvLines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const safeClient = clientName.replace(/[^a-z0-9_-]/gi, '_');
  const filename = `${safeClient}_IRS_Tax_Schedule_${scheduleFilter}_${taxYearFilter}.csv`;

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export machine-readable CPA Audit JSON package.
 */
export function exportTaxScheduleJSON(
  summary: TaxScheduleSummary,
  clientInfo: { name: string; email: string; company?: string; licenseKey?: string }
): void {
  const exportPayload = {
    metadata: {
      generatedAt: new Date().toISOString(),
      generator: 'Receipt Processor Tax Engine v1.0',
      clientName: clientInfo.name,
      clientEmail: clientInfo.email,
      company: clientInfo.company || 'Direct Client Account',
      licenseVerified: Boolean(clientInfo.licenseKey),
      licenseKeyMasked: clientInfo.licenseKey ? `${clientInfo.licenseKey.slice(0, 8)}...` : 'ACTIVE_SUBSCRIPTION',
      taxYear: summary.taxYear,
      scheduleFilter: summary.scheduleFilter
    },
    executiveSummary: {
      totalDeductionsUsd: summary.totalDeductions,
      totalReceiptCount: summary.totalReceiptCount,
      scheduleFTotalUsd: summary.scheduleFTotal,
      scheduleCTotalUsd: summary.scheduleCTotal
    },
    irsLineItemSummary: summary.categories.map(c => ({
      schedule: c.schedule,
      lineNumber: c.lineNumber,
      lineTitle: c.lineTitle,
      irsForm: c.irsForm,
      totalAmountUsd: c.total,
      receiptCount: c.count
    })),
    itemizedReceiptLedger: summary.itemizedReceipts.map(i => ({
      receiptId: i.submission.id,
      fileName: i.submission.fileName,
      vendor: i.submission.extractedVendor || 'Unspecified',
      date: i.submission.extractedDate || i.submission.uploadedAt.split('T')[0],
      amountUsd: i.submission.extractedAmount || 0,
      irsSchedule: i.classification.schedule,
      irsLineNumber: i.classification.lineNumber,
      irsLineTitle: i.classification.lineTitle,
      businessMemo: i.submission.memo || '',
      reconciliationStatus: i.submission.status
    }))
  };

  const safeClient = clientInfo.name.replace(/[^a-z0-9_-]/gi, '_');
  const filename = `${safeClient}_CPA_Audit_Package_${summary.taxYear}.json`;
  const jsonStr = JSON.stringify(exportPayload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * IRS Audit-Proof "Receipt Photo & Evidence Vault" ZIP Exporter
 * Bundles high-resolution scanned receipt images, HTML contact sheet, and CSV schedule.
 */
export async function exportAuditVaultZip(
  summary: TaxScheduleSummary,
  clientInfo: { name: string; email: string; company?: string; licenseKey?: string },
  mileageTrips: MileageTrip[] = []
): Promise<void> {
  const zip = new JSZip();
  const root = zip.folder(`IRS_Audit_Vault_${summary.taxYear}_${clientInfo.name.replace(/[^a-z0-9_-]/gi, '_')}`);
  const receiptsFolder = root?.folder('Receipt_Images');

  let manifestHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>IRS Form 1040 Audit Package - ${clientInfo.name}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 30px; color: #1c1917; }
    h1 { color: #065f46; font-size: 22px; margin-bottom: 4px; }
    .meta-box { background: #f5f5f4; border: 1px solid #e7e5e4; padding: 14px; border-radius: 8px; margin: 20px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
    th { background: #e7e5e4; padding: 8px 10px; text-align: left; font-weight: 600; }
    td { padding: 8px 10px; border-bottom: 1px solid #e7e5e4; }
    .sch-f { color: #047857; font-weight: 600; }
    .sch-c { color: #0284c7; font-weight: 600; }
    .amt { font-family: monospace; font-weight: bold; text-align: right; }
    .img-preview { max-width: 140px; max-height: 140px; border-radius: 4px; border: 1px solid #d6d3d1; }
  </style>
</head>
<body>
  <h1>IRS Tax Deduction Evidence & Audit Trail</h1>
  <p>Certified Digital Receipt Archive for IRS Form 1040 Schedule C & Schedule F</p>
  
  <div class="meta-box">
    <div><strong>Taxpayer Entity:</strong> ${clientInfo.name} (${clientInfo.company || 'Direct Entity'})</div>
    <div><strong>Contact Email:</strong> ${clientInfo.email}</div>
    <div><strong>Tax Year:</strong> ${summary.taxYear}</div>
    <div><strong>Total Verified Deductions:</strong> $${summary.totalDeductions.toFixed(2)}</div>
    <div><strong>Schedule F Subtotal:</strong> $${summary.scheduleFTotal.toFixed(2)} | <strong>Schedule C Subtotal:</strong> $${summary.scheduleCTotal.toFixed(2)}</div>
    <div><strong>Generated Date:</strong> ${new Date().toLocaleString()}</div>
  </div>

  <h2>Itemized Receipt Records & Image References</h2>
  <table>
    <thead>
      <tr>
        <th>Audit ID</th>
        <th>Date</th>
        <th>Vendor / Payee</th>
        <th>IRS Schedule & Line</th>
        <th>Memo / Purpose</th>
        <th>Archived File</th>
        <th style="text-align:right">Deductible Amount</th>
      </tr>
    </thead>
    <tbody>`;

  let index = 1;
  for (const item of summary.itemizedReceipts) {
    const sub = item.submission;
    const cls = item.classification;
    const date = sub.extractedDate || sub.uploadedAt.split('T')[0];
    const safeRef = `Receipt_${index.toString().padStart(3, '0')}_${(sub.extractedVendor || 'Vendor').replace(/[^a-z0-9]/gi, '_')}.jpg`;

    if (sub.dataUrl && sub.dataUrl.includes(',')) {
      const b64 = sub.dataUrl.split(',')[1];
      receiptsFolder?.file(safeRef, b64, { base64: true });
    } else {
      receiptsFolder?.file(safeRef.replace('.jpg', '.txt'), `RECEIPT REFERENCE RECORD\nVendor: ${sub.extractedVendor}\nDate: ${date}\nAmount: $${sub.extractedAmount}\nMemo: ${sub.memo || 'None'}`);
    }

    manifestHtml += `
      <tr>
        <td style="font-family:monospace;font-size:11px;">#${index.toString().padStart(3, '0')}</td>
        <td>${date}</td>
        <td><strong>${sub.extractedVendor || 'Store Receipt'}</strong></td>
        <td><span class="${cls.schedule === 'SCHEDULE_F' ? 'sch-f' : 'sch-c'}">${cls.schedule === 'SCHEDULE_F' ? 'Sched F' : 'Sched C'} ${cls.lineNumber}</span> (${cls.lineTitle})</td>
        <td><em>${sub.memo || 'Business purchase'}</em></td>
        <td><a href="Receipt_Images/${safeRef}">${safeRef}</a></td>
        <td class="amt">$${(sub.extractedAmount || 0).toFixed(2)}</td>
      </tr>`;
    index++;
  }

  // Mileage section in audit manifest
  if (mileageTrips.length > 0) {
    manifestHtml += `
    </tbody>
  </table>

  <h2>Vehicle Mileage Deduction Log (IRS Form 1040)</h2>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Purpose / Destination</th>
        <th>Vehicle</th>
        <th>IRS Schedule</th>
        <th>Miles</th>
        <th>IRS Rate</th>
        <th style="text-align:right">Deduction</th>
      </tr>
    </thead>
    <tbody>`;

    for (const trip of mileageTrips) {
      manifestHtml += `
        <tr>
          <td>${trip.date}</td>
          <td><strong>${trip.purpose}</strong></td>
          <td>${trip.vehicleDescription || 'Business Vehicle'}</td>
          <td><span class="${trip.schedule === 'SCHEDULE_F' ? 'sch-f' : 'sch-c'}">${trip.schedule === 'SCHEDULE_F' ? 'Sched F Line 10' : 'Sched C Line 9'}</span></td>
          <td>${trip.miles} mi</td>
          <td>$${trip.ratePerMile.toFixed(2)}/mi</td>
          <td class="amt">$${trip.calculatedDeduction.toFixed(2)}</td>
        </tr>`;
    }
  }

  manifestHtml += `
    </tbody>
  </table>
  <div style="margin-top:30px; font-size:11px; color:#78716c; border-top:1px solid #d6d3d1; padding-top:12px;">
    Digital Audit Package compiled via Receipt Processor Managed Bookkeeping System. Retain with permanent tax records.
  </div>
</body>
</html>`;

  root?.file('AUDIT_INDEX_CONTACT_SHEET.html', manifestHtml);

  // Generate ZIP
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `IRS_Audit_Vault_${summary.taxYear}_${clientInfo.name.replace(/[^a-z0-9_-]/gi, '_')}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
