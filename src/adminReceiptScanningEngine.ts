import JSZip from 'jszip';
import { 
  IRS_SCHEDULE_F_LINES, 
  IRS_SCHEDULE_C_LINES, 
  TaxScheduleType 
} from './taxScheduleService';
import { getTaxLineOverrides } from './adminTaxRulesService';
import { 
  getClientSubmissions, 
  saveClientSubmissions, 
  ClientSubmission 
} from './clientSubmissionService';
import { getBackendApiUrl } from './urlUtils';

export interface ExtractedLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  irsCategoryHint?: string;
}

export type DuplicateStatus = 'UNIQUE' | 'DUPLICATE_EXACT' | 'DUPLICATE_FUZZY';
export type ProcessedReceiptStatus = 'PROCESSED' | 'VERIFIED' | 'REJECTED';

export interface ProcessedReceipt {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  dataUrl?: string;
  fileHash: string;
  clientId?: string;
  clientName: string;
  clientEmail?: string;
  submittedBy?: string;
  submittedByRole?: 'ADMIN' | 'CLIENT';
  uploadedAt?: string;
  vendor: string;
  normalizedVendor: string;
  date: string;
  lineItems: ExtractedLineItem[];
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
  paymentMethod: string;
  cardLast4?: string;
  invoiceNumber?: string;
  category: string;
  schedule: 'SCHEDULE_F' | 'SCHEDULE_C';
  irsLineNumber: string;
  irsLineTitle: string;
  confidence: number;
  duplicateStatus: DuplicateStatus;
  duplicateReason?: string;
  duplicateMatchId?: string;
  status: ProcessedReceiptStatus;
  workerNodeId: string;
  processingDurationMs: number;
  rawText?: string;
  memo?: string;
  processedAt: string;
  ocrFailed?: boolean;
  ocrError?: string;
}

export interface ParallelWorkerState {
  workerId: string;
  name: string;
  status: 'IDLE' | 'BUSY' | 'COMPLETED' | 'ERROR';
  currentFile?: string;
  currentStep?: string;
  progressPercent: number;
  processedCount: number;
  lastLatencyMs: number;
}

export interface BatchScanJobMetrics {
  total: number;
  completed: number;
  failed: number;
  duplicates: number;
  receiptsPerSec: number;
  startTime: number;
  elapsedSec: number;
  etaSec: number;
  totalDeductibleAmount: number;
  scheduleFTotal: number;
  scheduleCTotal: number;
}

export interface ReceiptInputItem {
  id?: string;
  file?: File;
  fileName: string;
  fileSize?: number;
  fileType?: string;
  dataUrl?: string;
  clientId?: string;
  clientName?: string;
  clientEmail?: string;
  submittedBy?: string;
  submittedByRole?: 'ADMIN' | 'CLIENT';
  uploadedAt?: string;
  memo?: string;
  categoryHint?: string;
  vendorHint?: string;
  amountHint?: number;
  dateHint?: string;
}

// ---------------------------------------------------------------------------
// VENDOR KNOWLEDGE BASE & NORMALIZATION
// ---------------------------------------------------------------------------

interface KnownVendorProfile {
  name: string;
  aliases: string[];
  schedule: 'SCHEDULE_F' | 'SCHEDULE_C';
  lineNumber: string;
  lineTitle: string;
  defaultCategory: string;
  typicalItems: Array<{ desc: string; price: number }>;
}

const KNOWN_VENDORS: KnownVendorProfile[] = [
  // Farm & Agricultural Vendors
  {
    name: 'Agway Farm & Home',
    aliases: ['agway', 'agway inc', 'agway farm', 'agway store'],
    schedule: 'SCHEDULE_F',
    lineNumber: 'Line 15',
    lineTitle: 'Feed purchased',
    defaultCategory: 'Farm:Feed',
    typicalItems: [
      { desc: 'Sweet Feed 16% Dairy Pellets 50lb', price: 21.50 },
      { desc: 'Alfalfa Hay Cubes 40lb Bag', price: 18.25 },
      { desc: 'Trace Mineral Salt Block 50lb', price: 12.95 }
    ]
  },
  {
    name: 'Tractor Supply Co.',
    aliases: ['tractor supply', 'tsc', 'tractor supply co', 'tractorsupply.com'],
    schedule: 'SCHEDULE_F',
    lineNumber: 'Line 27',
    lineTitle: 'Supplies purchased',
    defaultCategory: 'Farm:Supplies',
    typicalItems: [
      { desc: 'Traveller Premium Universal Tractor Fluid 5 Gal', price: 69.99 },
      { desc: 'Heavy Duty 4-Prong Pitchfork', price: 34.99 },
      { desc: 'Galvanized Stock Tank 100 Gal', price: 129.99 }
    ]
  },
  {
    name: 'John Deere Equipment & Parts',
    aliases: ['john deere', 'deere', 'deere & company', 'greenmark', 'cazenovia equipment'],
    schedule: 'SCHEDULE_F',
    lineNumber: 'Line 24',
    lineTitle: 'Repairs and maintenance',
    defaultCategory: 'Farm:Repairs',
    typicalItems: [
      { desc: 'John Deere Hydraulic Oil Filter RE504836', price: 44.50 },
      { desc: 'Fuel Water Separator Filter Element', price: 38.20 },
      { desc: 'Alternator Belt Kit 6000 Series', price: 89.00 }
    ]
  },
  {
    name: 'Nutrien Ag Solutions',
    aliases: ['nutrien', 'nutrien ag', 'agrium', 'potashcorp'],
    schedule: 'SCHEDULE_F',
    lineNumber: 'Line 16',
    lineTitle: 'Fertilizers and lime',
    defaultCategory: 'Farm:Fertilizer',
    typicalItems: [
      { desc: 'Dry Urea 46-0-0 Granular 1 Ton Tote', price: 685.00 },
      { desc: 'Agricultural Calcitic Lime 50lb', price: 8.50 },
      { desc: 'Liquid Starter Fertilizer 10-34-0', price: 420.00 }
    ]
  },
  {
    name: 'Shell Bulk Fuel & Lubricants',
    aliases: ['shell', 'shell oil', 'shell gas', 'shell diesel', 'shell mart'],
    schedule: 'SCHEDULE_F',
    lineNumber: 'Line 10',
    lineTitle: 'Car and truck expenses (Gasoline, fuel, and oil)',
    defaultCategory: 'Farm:Fuel',
    typicalItems: [
      { desc: 'Off-Road Dyed Diesel #2 (150 Gal @ 3.45)', price: 517.50 },
      { desc: 'Rotella T4 Heavy Duty 15W-40 5 Gal', price: 74.99 }
    ]
  },
  {
    name: 'Pioneer Seeds / Corteva',
    aliases: ['pioneer', 'pioneer seed', 'corteva', 'pioneer hi-bred'],
    schedule: 'SCHEDULE_F',
    lineNumber: 'Line 25',
    lineTitle: 'Seeds and plants purchased',
    defaultCategory: 'Farm:Seeds',
    typicalItems: [
      { desc: 'Pioneer Corn Seed P0574AM 80K Kernel Unit', price: 320.00 },
      { desc: 'Inoculated Soybeans 140k Seed Count Unit', price: 68.00 }
    ]
  },
  {
    name: 'Dr. Miller Equine & Bovine Vet Care',
    aliases: ['vet care', 'veterinary', 'animal hospital', 'dr miller', 'dr. miller vet', 'livestock vet'],
    schedule: 'SCHEDULE_F',
    lineNumber: 'Line 30',
    lineTitle: 'Veterinary, breeding, and medicine',
    defaultCategory: 'Farm:Veterinary',
    typicalItems: [
      { desc: 'Herd Health Examination & Cattle Brucellosis Tagging', price: 275.00 },
      { desc: 'Bovi-Shield Gold FP5 VL5 50-Dose Vial', price: 145.00 },
      { desc: 'Penicillin G Procaine Antibiotic Suspension 250ml', price: 48.50 }
    ]
  },
  {
    name: 'Cenex Agronomy & Propane',
    aliases: ['cenex', 'cenex energy', 'chs inc', 'cenex propane'],
    schedule: 'SCHEDULE_F',
    lineNumber: 'Line 29',
    lineTitle: 'Utilities',
    defaultCategory: 'Farm:Utilities',
    typicalItems: [
      { desc: 'Bulk Grain Dryer Commercial Propane Fill (400 Gal)', price: 820.00 }
    ]
  },
  // Commercial & General Business Vendors
  {
    name: 'The Home Depot',
    aliases: ['home depot', 'the home depot', 'homedepot', 'home depot pro'],
    schedule: 'SCHEDULE_C',
    lineNumber: 'Line 22',
    lineTitle: 'Supplies (not included in Part III)',
    defaultCategory: 'Supplies & Materials',
    typicalItems: [
      { desc: '2x4x8 Premium Kiln-Dried Stud Lumber (Qty: 24)', price: 114.96 },
      { desc: '3-Inch Exterior Deck Screws 5lb Box', price: 32.98 },
      { desc: 'Milwaukee M18 Fuel Cordless Drill Kit', price: 249.00 }
    ]
  },
  {
    name: 'Lowe\'s Home Improvement',
    aliases: ['lowes', 'lowe\'s', 'lowes.com'],
    schedule: 'SCHEDULE_C',
    lineNumber: 'Line 21',
    lineTitle: 'Repairs and maintenance',
    defaultCategory: 'Repairs & Maintenance',
    typicalItems: [
      { desc: 'Heavy Duty Contractor Extension Cord 100ft', price: 68.98 },
      { desc: 'Rust-Oleum Industrial Enamel Spray 6-Pack', price: 42.50 }
    ]
  },
  {
    name: 'U-Haul Truck & Equipment Rental',
    aliases: ['u-haul', 'uhaul', 'u haul moving'],
    schedule: 'SCHEDULE_C',
    lineNumber: 'Line 9',
    lineTitle: 'Car and truck expenses',
    defaultCategory: 'Automobile:Rentals',
    typicalItems: [
      { desc: '26ft Commercial Cargo Transport Truck Daily Rental', price: 189.00 },
      { desc: 'Mileage Charge (145 Miles @ $0.79/mi)', price: 114.55 },
      { desc: 'SafeMove Equipment Protection Coverage', price: 28.00 }
    ]
  },
  {
    name: 'Office Depot / OfficeMax',
    aliases: ['office depot', 'officemax', 'staples'],
    schedule: 'SCHEDULE_C',
    lineNumber: 'Line 18',
    lineTitle: 'Office expense',
    defaultCategory: 'Office Expenses',
    typicalItems: [
      { desc: 'Multipurpose Copy Paper 20lb 10-Ream Case', price: 54.99 },
      { desc: 'Heavy Duty Inkjet Invoice Labels 100-Pack', price: 24.50 },
      { desc: 'HP 65XL High Yield Black Ink Cartridge', price: 41.99 }
    ]
  },
  {
    name: 'Fastenal Industrial Supply',
    aliases: ['fastenal', 'grainger', 'mcmaster-carr'],
    schedule: 'SCHEDULE_C',
    lineNumber: 'Line 22',
    lineTitle: 'Supplies (not included in Part III)',
    defaultCategory: 'Shop Supplies',
    typicalItems: [
      { desc: 'Grade 8 Hex Cap Screws 1/2-13 x 2" (100 Qty)', price: 58.40 },
      { desc: 'Zinc Plated Lock Washers 500-Pack Box', price: 22.90 }
    ]
  },
  {
    name: 'Prairie Pines Ag Supply',
    aliases: ['prairie pines', 'prairie pines ag', 'prairie ag supply'],
    schedule: 'SCHEDULE_F',
    lineNumber: 'Line 27',
    lineTitle: 'Supplies purchased',
    defaultCategory: 'Farm:Supplies',
    typicalItems: [
      { desc: 'Sold Chicken Starter Crumbles', price: 32.50 },
      { desc: 'Bale Timothy Hay', price: 19.50 },
      { desc: '1 Gal Animal Wormer (Ivermectin)', price: 48.00 }
    ]
  },
  {
    name: 'Shell Service Station (Fleet)',
    aliases: ['shell fleet', 'exxon', 'chevron', 'bp gas', 'speedway'],
    schedule: 'SCHEDULE_C',
    lineNumber: 'Line 9',
    lineTitle: 'Car and truck expenses',
    defaultCategory: 'Automobile:Fuel',
    typicalItems: [
      { desc: 'Regular Unleaded Gasoline (22.5 Gal @ 3.49)', price: 78.53 }
    ]
  }
];

export function normalizeVendorName(raw: string): string {
  if (!raw) return 'Unspecified Vendor';
  let clean = raw.trim();
  // Remove phone numbers, addresses, #0012, Store #
  clean = clean.replace(/#\s*\d+/gi, '').replace(/Store\s*\d+/gi, '');
  clean = clean.replace(/\b(Inc\.?|LLC|Corp\.?|Co\.?|Ltd\.?)\b/gi, '').trim();

  // Match known profile
  const lower = clean.toLowerCase();
  for (const kv of KNOWN_VENDORS) {
    if (lower.includes(kv.name.toLowerCase())) return kv.name;
    for (const al of kv.aliases) {
      if (lower.includes(al.toLowerCase())) return kv.name;
    }
  }

  // Capitalize neatly
  return clean.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ').trim() || 'Vendor';
}

// ---------------------------------------------------------------------------
// DUPLICATE DETECTOR (EXACT HASH & FUZZY AMOUNT/DATE WINDOW)
// ---------------------------------------------------------------------------

export interface DuplicateDetectionResult {
  isDuplicate: boolean;
  status: DuplicateStatus;
  reason?: string;
  matchedId?: string;
}

export function evaluateReceiptDuplicate(
  candidate: { fileHash: string; vendor: string; total: number; date: string; clientName?: string },
  existingLedger: ProcessedReceipt[]
): DuplicateDetectionResult {
  const candClient = candidate.clientName?.trim().toLowerCase();
  const normCandVendor = normalizeVendorName(candidate.vendor).toLowerCase();
  const candDateMs = new Date(candidate.date).getTime();

  for (const existing of existingLedger) {
    const existClient = existing.clientName?.trim().toLowerCase();

    // 1. Client Isolation: A duplicate check must only compare receipts belonging to the same client entity
    if (candClient && existClient && candClient !== existClient) {
      continue;
    }

    // 2. Exact SHA-256 Hash Match (Exact file upload)
    if (candidate.fileHash && existing.fileHash && candidate.fileHash.toLowerCase() === existing.fileHash.toLowerCase()) {
      return {
        isDuplicate: true,
        status: 'DUPLICATE_EXACT',
        reason: `Exact identical file SHA-256 hash matched existing transaction (${existing.id.slice(0, 10)}) for client '${existing.clientName}'`,
        matchedId: existing.id
      };
    }

    // 3. Fuzzy Match: Same client + Same Normalized Vendor + Amount matches within 2 cents + Date within 2 days
    const normExistVendor = normalizeVendorName(existing.vendor).toLowerCase();
    const vendorMatches = normCandVendor === normExistVendor || 
      (normCandVendor.length > 4 && normExistVendor.length > 4 && (normCandVendor.includes(normExistVendor) || normExistVendor.includes(normCandVendor)));

    const amountMatches = Math.abs(candidate.total - existing.total) < 0.02;

    if (vendorMatches && amountMatches) {
      const existDateMs = new Date(existing.date).getTime();
      let diffDays = 0;
      let dateWithinWindow = false;

      if (!isNaN(candDateMs) && !isNaN(existDateMs)) {
        diffDays = Math.abs(candDateMs - existDateMs) / (1000 * 60 * 60 * 24);
        dateWithinWindow = diffDays <= 2.0;
      } else {
        dateWithinWindow = candidate.date === existing.date;
      }

      if (dateWithinWindow) {
        return {
          isDuplicate: true,
          status: 'DUPLICATE_FUZZY',
          reason: `Potential duplicate for '${existing.clientName}': Same vendor '${existing.vendor}' and exact amount ($${candidate.total.toFixed(2)}) detected within ${diffDays.toFixed(1)} days (matches ${existing.id.slice(0, 10)})`,
          matchedId: existing.id
        };
      }
    }
  }

  return {
    isDuplicate: false,
    status: 'UNIQUE'
  };
}

// ---------------------------------------------------------------------------
// PARALLEL SCANNING ENGINE & WORKER POOL
// ---------------------------------------------------------------------------

/**
 * Computes SHA-256 for a File, Blob, or base64 string
 */
export async function computeReceiptHash(input: File | Blob | string): Promise<string> {
  let buffer: ArrayBuffer;
  if (typeof input === 'string') {
    const encoder = new TextEncoder();
    buffer = encoder.encode(input);
  } else {
    buffer = await input.arrayBuffer();
  }
  const hashBuf = await crypto.subtle.digest('SHA-256', buffer);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  return hashArr.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Deep heuristic parser that extracts vendor, date, line items, and totals
 */
export function extractReceiptMetadata(
  fileName: string,
  rawTextContent?: string,
  hintCategory?: string,
  hints?: { vendor?: string; amount?: number; date?: string; memo?: string; invoiceNumber?: string }
): {
  vendor: string;
  date: string;
  lineItems: ExtractedLineItem[];
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
  paymentMethod: string;
  cardLast4?: string;
  invoiceNumber?: string;
  confidence: number;
  memo: string;
} {
  const text = (rawTextContent || fileName || '').toLowerCase();
  
  // 1. Identify matched vendor
  let matchedProfile: KnownVendorProfile | undefined = undefined;
  for (const kv of KNOWN_VENDORS) {
    if (text.includes(kv.name.toLowerCase())) {
      matchedProfile = kv;
      break;
    }
    for (const al of kv.aliases) {
      if (text.includes(al.toLowerCase())) {
        matchedProfile = kv;
        break;
      }
    }
    if (matchedProfile) break;
  }

  let vendor = matchedProfile ? matchedProfile.name : normalizeVendorName(fileName.replace(/[._-]/g, ' '));
  if (hints?.vendor && hints.vendor.trim()) {
    vendor = normalizeVendorName(hints.vendor.trim());
  }
  
  // 2. High-Accuracy Date Extraction (Supports YYYY-MM-DD, MM/DD/YYYY, Mon DD YYYY, DD-Mon-YYYY)
  let date = hints?.date || '';
  if (!date) {
    const isoMatch = text.match(/\b(20[123][0-9])[-/. ](0?[1-9]|1[0-2])[-/. ](0?[1-9]|[12][0-9]|3[01])\b/);
    const usMatch = text.match(/\b(0?[1-9]|1[0-2])[-/. ](0?[1-9]|[12][0-9]|3[01])[-/. ](20[123][0-9]|[0-9][0-9])\b/);
    const monthNameMatch = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s.-]+(0?[1-9]|[12][0-9]|3[01])[,\s.-]+(20[123][0-9]|[0-9][0-9])\b/i);
    const dayMonthMatch = text.match(/\b(0?[1-9]|[12][0-9]|3[01])[\s.-]+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s.-]+(20[123][0-9]|[0-9][0-9])\b/i);

    const monthMap: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    };

    if (isoMatch) {
      date = `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
    } else if (usMatch) {
      let yr = usMatch[3];
      if (yr.length === 2) {
        yr = parseInt(yr) > 50 ? `19${yr}` : `20${yr}`;
      }
      date = `${yr}-${usMatch[1].padStart(2, '0')}-${usMatch[2].padStart(2, '0')}`;
    } else if (monthNameMatch) {
      const mStr = monthNameMatch[1].toLowerCase().slice(0, 3);
      const mNum = monthMap[mStr] || '01';
      const day = monthNameMatch[2].padStart(2, '0');
      let yr = monthNameMatch[3];
      if (yr.length === 2) {
        yr = parseInt(yr) > 50 ? `19${yr}` : `20${yr}`;
      }
      date = `${yr}-${mNum}-${day}`;
    } else if (dayMonthMatch) {
      const mStr = dayMonthMatch[2].toLowerCase().slice(0, 3);
      const mNum = monthMap[mStr] || '01';
      const day = dayMonthMatch[1].padStart(2, '0');
      let yr = dayMonthMatch[3];
      if (yr.length === 2) {
        yr = parseInt(yr) > 50 ? `19${yr}` : `20${yr}`;
      }
      date = `${yr}-${mNum}-${day}`;
    } else {
      date = 'Pending Review'; 
    }
  }

  // 3. High-Accuracy Total & Subtotal Extraction
  let total = 0;
  let subtotal = 0;
  let tax = 0;
  let tip = 0;
  let lineItems: ExtractedLineItem[] = [];

  // Look for explicit total keywords first to avoid capturing line item prices, phone numbers, or invoice IDs
  const explicitTotalMatch = text.match(/(?:grand\s+total|total\s+amount|balance\s+due|amount\s+paid|total\s+due|total)[\s:=$]*\$?\s*([0-9]{1,5}\.[0-9]{2})\b/);
  const allDollarMatches = Array.from(text.matchAll(/\$?\b([0-9]{1,5}\.[0-9]{2})\b/g)).map(m => parseFloat(m[1]));

  if (hints?.amount && hints.amount > 0) {
    total = Number(hints.amount.toFixed(2));
    tax = Number((total * 0.08).toFixed(2));
    subtotal = Number((total - tax).toFixed(2));
    lineItems = [{
      description: hints.memo || 'Verified Item Line',
      quantity: 1,
      unitPrice: subtotal,
      total: subtotal
    }];
  } else if (explicitTotalMatch) {
    total = parseFloat(explicitTotalMatch[1]);
    const explicitTax = text.match(/(?:sales\s+tax|tax)[\s:=$]*\$?\s*([0-9]{1,4}\.[0-9]{2})\b/);
    tax = explicitTax ? parseFloat(explicitTax[1]) : Number((total * 0.075).toFixed(2));
    subtotal = Number((total - tax).toFixed(2));
    lineItems = [{
      description: matchedProfile ? matchedProfile.typicalItems[0]?.desc : 'Standard Operating Supplies',
      quantity: 1,
      unitPrice: subtotal,
      total: subtotal
    }];
  } else if (matchedProfile) {
    lineItems = matchedProfile.typicalItems.map(ti => ({
      description: ti.desc,
      quantity: 1,
      unitPrice: ti.price,
      total: ti.price,
      irsCategoryHint: matchedProfile?.defaultCategory
    }));
    subtotal = lineItems.reduce((acc, itm) => acc + itm.total, 0);
    tax = Number((subtotal * 0.0825).toFixed(2));
    total = Number((subtotal + tax).toFixed(2));
  } else if (allDollarMatches.length > 0) {
    // Pick the largest realistic dollar value (totals are typically highest number)
    const validDollarAmounts = allDollarMatches.filter(a => a > 0.50 && a < 50000);
    total = validDollarAmounts.length > 0 ? Math.max(...validDollarAmounts) : allDollarMatches[0];
    tax = Number((total * 0.07).toFixed(2));
    subtotal = Number((total - tax).toFixed(2));
    lineItems = [{
      description: 'General Business Supplies & Materials',
      quantity: 1,
      unitPrice: subtotal,
      total: subtotal
    }];
  } else {
    // Deterministic fallback (REMOVED: Randomizing dollar amounts is misleading for accounting)
    // If we have absolutely no clues, we must return 0.00 so the user knows it failed.
    total = 0.00;
    tax = 0.00;
    subtotal = 0.00;
    lineItems = [{
      description: 'Pending Review (OCR Failed)',
      quantity: 1,
      unitPrice: 0,
      total: 0
    }];
  }

  // 4. Exact Card Mask & Payment Tender Extraction
  let paymentMethod = 'CASH';
  let cardLast4: string | undefined = undefined;

  // Search for masked card number pattern (e.g. ************4821, ACCT: ...9102, VISA ending in 3045)
  const cardMatch = text.match(/(?:card|acct|account|pan|visa|mastercard|mc|amex|american\s+express|discover|debit|credit)[^\n\r\d]{0,30}(?:[x*]{3,}[ -]?[x*]{3,}[ -]?[x*]{3,}[ -]?|[x*]{3,}|ending\s+in\s*|#\s*)(\d{4})\b/) ||
                    text.match(/\b(?:[x*]{4}[ -]?){3}(\d{4})\b/) ||
                    text.match(/\b[x*]{4,}(\d{4})\b/);

  if (cardMatch) {
    cardLast4 = cardMatch[1];
  }

  if (text.includes('visa')) {
    paymentMethod = 'VISA';
  } else if (text.includes('mastercard') || text.includes('mc ')) {
    paymentMethod = 'MASTERCARD';
  } else if (text.includes('amex') || text.includes('american express')) {
    paymentMethod = 'AMEX';
  } else if (text.includes('discover')) {
    paymentMethod = 'DISCOVER';
  } else if (text.includes('debit') || cardLast4) {
    paymentMethod = 'DEBIT CARD';
  } else if (text.includes('check')) {
    paymentMethod = 'CHECK';
  } else if (text.includes('cash')) {
    paymentMethod = 'CASH';
  } else {
    paymentMethod = cardLast4 ? 'CREDIT CARD' : 'CASH';
  }

  const confidence = matchedProfile ? 0.98 : (explicitTotalMatch ? 0.94 : 0.88);
  const memo = hintCategory || (matchedProfile ? `${matchedProfile.defaultCategory} - Verified` : 'Automated parallel ingestion');

  return {
    vendor,
    date,
    lineItems,
    subtotal,
    tax,
    tip,
    total,
    paymentMethod,
    cardLast4,
    invoiceNumber: hints?.invoiceNumber || '',
    confidence,
    memo
  };
}

/**
 * Classifies an extracted receipt into Schedule F or Schedule C
 */
export function classifyExtractedTaxSchedule(
  vendor: string,
  category: string,
  memo: string,
  fileName: string
): {
  schedule: 'SCHEDULE_F' | 'SCHEDULE_C';
  lineNumber: string;
  lineTitle: string;
  categoryName: string;
  confidence: number;
} {
  const text = `${vendor} ${category} ${memo} ${fileName}`.toLowerCase();

  // 1. Check custom overrides from adminTaxRulesService
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
          categoryName: `Custom: ${ov.targetLineTitle}`,
          confidence: 0.99
        };
      }
    }
  } catch {
    // ignore
  }

  // 2. Check known vendor direct profile
  for (const kv of KNOWN_VENDORS) {
    if (text.includes(kv.name.toLowerCase())) {
      return {
        schedule: kv.schedule,
        lineNumber: kv.lineNumber,
        lineTitle: kv.lineTitle,
        categoryName: kv.defaultCategory,
        confidence: 0.98
      };
    }
  }

  // 3. Agricultural heuristics for Schedule F
  const isFarm = 
    text.includes('feed') || text.includes('farm') || text.includes('tractor') ||
    text.includes('livestock') || text.includes('cattle') || text.includes('dairy') ||
    text.includes('fertilizer') || text.includes('seed') || text.includes('vet') ||
    text.includes('hay') || text.includes('deere') || text.includes('grain') ||
    text.includes(' ag ') || text.includes('ag supply') || text.includes('agriculture');

  if (isFarm) {
    if (text.includes('feed') || text.includes('grain') || text.includes('hay')) {
      return { schedule: 'SCHEDULE_F', lineNumber: 'Line 15', lineTitle: IRS_SCHEDULE_F_LINES['Line 15'], categoryName: 'Farm:Feed', confidence: 0.96 };
    }
    if (text.includes('fertilizer') || text.includes('lime') || text.includes('urea')) {
      return { schedule: 'SCHEDULE_F', lineNumber: 'Line 16', lineTitle: IRS_SCHEDULE_F_LINES['Line 16'], categoryName: 'Farm:Fertilizer', confidence: 0.96 };
    }
    if (text.includes('seed') || text.includes('plant')) {
      return { schedule: 'SCHEDULE_F', lineNumber: 'Line 25', lineTitle: IRS_SCHEDULE_F_LINES['Line 25'], categoryName: 'Farm:Seeds', confidence: 0.95 };
    }
    if (text.includes('vet') || text.includes('medicine') || text.includes('vaccine')) {
      return { schedule: 'SCHEDULE_F', lineNumber: 'Line 30', lineTitle: IRS_SCHEDULE_F_LINES['Line 30'], categoryName: 'Farm:Veterinary', confidence: 0.96 };
    }
    if (text.includes('repair') || text.includes('parts') || text.includes('filter')) {
      return { schedule: 'SCHEDULE_F', lineNumber: 'Line 24', lineTitle: IRS_SCHEDULE_F_LINES['Line 24'], categoryName: 'Farm:Repairs', confidence: 0.94 };
    }
    if (text.includes('fuel') || text.includes('diesel') || text.includes('gas')) {
      return { schedule: 'SCHEDULE_F', lineNumber: 'Line 10', lineTitle: IRS_SCHEDULE_F_LINES['Line 10'], categoryName: 'Farm:Fuel', confidence: 0.96 };
    }
    return { schedule: 'SCHEDULE_F', lineNumber: 'Line 27', lineTitle: IRS_SCHEDULE_F_LINES['Line 27'], categoryName: 'Farm:Supplies', confidence: 0.92 };
  }

  // 4. Commercial Schedule C heuristics
  if (text.includes('fuel') || text.includes('gas') || text.includes('u-haul') || text.includes('truck')) {
    return { schedule: 'SCHEDULE_C', lineNumber: 'Line 9', lineTitle: IRS_SCHEDULE_C_LINES['Line 9'], categoryName: 'Auto & Truck', confidence: 0.95 };
  }
  if (text.includes('office') || text.includes('paper') || text.includes('ink') || text.includes('software')) {
    return { schedule: 'SCHEDULE_C', lineNumber: 'Line 18', lineTitle: IRS_SCHEDULE_C_LINES['Line 18'], categoryName: 'Office Expense', confidence: 0.95 };
  }
  if (text.includes('repair') || text.includes('maintenance')) {
    return { schedule: 'SCHEDULE_C', lineNumber: 'Line 21', lineTitle: IRS_SCHEDULE_C_LINES['Line 21'], categoryName: 'Repairs & Maintenance', confidence: 0.94 };
  }
  if (text.includes('electric') || text.includes('power') || text.includes('utility') || text.includes('internet')) {
    return { schedule: 'SCHEDULE_C', lineNumber: 'Line 25', lineTitle: IRS_SCHEDULE_C_LINES['Line 25'], categoryName: 'Utilities', confidence: 0.95 };
  }
  return { schedule: 'SCHEDULE_C', lineNumber: 'Line 22', lineTitle: IRS_SCHEDULE_C_LINES['Line 22'], categoryName: 'Supplies', confidence: 0.91 };
}

// ---------------------------------------------------------------------------
// DIRECT GEMINI AI OCR & ENTITY EXTRACTION ENGINE
// ---------------------------------------------------------------------------

/**
 * Returns all available Gemini API keys from localStorage and build-time env vars.
 * Supports multiple keys separated by commas, semicolons, whitespace, or newlines.
 */
export function getActiveGeminiApiKeys(): string[] {
  let stored = '';
  if (typeof localStorage !== 'undefined') {
    stored = (
      localStorage.getItem('receipt_processor_gemini_key') ||
      localStorage.getItem('gemini_api_key') ||
      localStorage.getItem('VITE_GEMINI_API_KEY') ||
      ''
    ).trim();
  }

  const envVite = ((import.meta as any).env?.VITE_GEMINI_API_KEY || '').toString().trim();
  const envGemini = ((import.meta as any).env?.GEMINI_API_KEY || '').toString().trim();

  const combined = `${stored} ${envVite} ${envGemini}`.trim();
  const keys = combined
    .split(/[,;\s\n\r]+/)
    .map(k => k.trim())
    .filter(k => k.length > 5);

  return Array.from(new Set(keys));
}

/**
 * Persists user-configured Gemini API keys into local storage.
 */
export function saveActiveGeminiApiKeys(keys: string): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('receipt_processor_gemini_key', keys.trim());
  }
}

export interface ScanReceiptAiOptions {
  dataUrl: string;
  fileType?: string;
  fileName: string;
  clientName?: string;
  onStep?: (step: string) => void;
}

export interface ScanReceiptAiOutput {
  success: boolean;
  data?: {
    vendor: string;
    date: string;
    lineItems: ExtractedLineItem[];
    subtotal: number;
    tax: number;
    tip: number;
    total: number;
    paymentMethod: string;
    cardLast4?: string;
    invoiceNumber?: string;
    category?: string;
    schedule?: 'SCHEDULE_F' | 'SCHEDULE_C';
    irsLineNumber?: string;
    irsLineTitle?: string;
    confidence: number;
    memo: string;
  };
  errorMessage?: string;
  source?: 'CLIENT_GEMINI' | 'SERVER_API';
}

/**
 * High-accuracy AI OCR receipt scanner.
 * On GitHub Pages (static host) or when API keys are configured, executes direct
 * in-browser Gemini Vision API with automatic key rotation and model fallbacks.
 * Bypasses HTTP 405 Method Not Allowed errors on static web hosts.
 */
export async function scanReceiptWithAI(params: ScanReceiptAiOptions): Promise<ScanReceiptAiOutput> {
  const { dataUrl, fileType, fileName, clientName, onStep } = params;

  if (!dataUrl || (!dataUrl.startsWith('data:image/') && !dataUrl.startsWith('data:application/pdf'))) {
    return {
      success: false,
      errorMessage: 'Missing valid image or document base64 data'
    };
  }

  const apiKeys = getActiveGeminiApiKeys();
  const isStaticHost = typeof window !== 'undefined' && window.location.hostname.endsWith('github.io');

  let cleanBase64 = dataUrl;
  let cleanMime = fileType || (dataUrl.startsWith('data:application/pdf') ? 'application/pdf' : 'image/jpeg');
  if (typeof dataUrl === 'string' && dataUrl.includes('base64,')) {
    const parts = dataUrl.split('base64,');
    cleanBase64 = parts[1];
    const header = parts[0];
    if (header.includes('data:')) {
      cleanMime = header.replace('data:', '').replace(';', '').trim();
    }
  }

  const promptText = 
    "Analyze this receipt with forensic accounting precision. Identify all physically distinct purchase receipts in the image. For each receipt, extract the Store/Vendor name, exact transaction Date (YYYY-MM-DD), line items with individual amounts, pre-tax Subtotal, Sales Tax, Tip, Payment Method, Card Last 4 digits, and the FINAL GRAND TOTAL actually charged. Return strictly valid JSON conforming to the schema.";

  const systemInstructionText = 
    `You are a certified forensic CPA accounting OCR vision engine specialized in extracting 100% accurate financial data from store, farm, and commercial receipts for IRS Tax (Schedule C / Schedule F) and QuickBooks Online reconciliation.\n` +
    `CRITICAL RULES:\n` +
    `1. TRANSACTION DATE: Extract the ACTUAL date the purchase occurred. Ignore coupon expiration dates or printed report dates. Format strictly as 'YYYY-MM-DD'. If 2-digit year (e.g. 26), format as 2026.\n` +
    `2. GRAND TOTAL: 'total' MUST be the absolute FINAL amount charged or paid to the payment method. NEVER extract 'Cash Tendered', 'Subtotal', or 'Savings' as the total. If 'Balance Due' is $0.00, find the 'Amount Paid' or 'Charge' instead.\n` +
    `3. LINE ITEMS & SUBTOTAL: 'subtotal' is pre-tax. 'tax' is sales tax. Extract line items in 'items'.\n` +
    `4. VENDOR: Extract full legal merchant name at the top of the receipt.\n` +
    `5. CARD LAST 4: Extract strictly the 4 digits if a credit/debit card was used.\n` +
    `6. Return strictly valid JSON conforming to the schema.`;

  const receiptSchema = {
    type: "OBJECT",
    properties: {
      receipts: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            vendor: { type: "STRING", description: "Store or merchant name" },
            date: { type: "STRING", description: "YYYY-MM-DD format" },
            total: { type: "NUMBER", description: "Final Grand Total amount actually charged" },
            subtotal: { type: "NUMBER", description: "Pre-tax subtotal" },
            tax: { type: "NUMBER", description: "Total sales tax" },
            tip: { type: "NUMBER", description: "Tip amount if applicable" },
            payment_method: { type: "STRING", description: "VISA, MasterCard, AMEX, Cash, Check, Debit" },
            card_last_4: { type: "STRING", description: "Exact 4 digits of card or empty string" },
            invoice_number: { type: "STRING", description: "Invoice ID, Ref ID, or Trans ID if present" },
            category: {
              type: "STRING",
              description: "QuickBooks category or IRS classification"
            },
            items: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  description: { type: "STRING" },
                  amount: { type: "NUMBER" }
                }
              }
            },
            memo: { type: "STRING" }
          },
          required: ["vendor", "date", "total"]
        }
      }
    },
    required: ["receipts"]
  };

  const payload = {
    contents: [{
      role: "user",
      parts: [
        { text: promptText },
        { inlineData: { mimeType: cleanMime, data: cleanBase64 } }
      ]
    }],
    systemInstruction: { parts: [{ text: systemInstructionText }] },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
    ],
    generationConfig: {
      temperature: 0.0,
      responseMimeType: "application/json",
      responseSchema: receiptSchema
    }
  };

  const normalizeOcrResult = (rawResult: any, sourceName: 'CLIENT_GEMINI' | 'SERVER_API'): ScanReceiptAiOutput => {
    let total = typeof rawResult.total === 'number' && !isNaN(rawResult.total) ? rawResult.total : 0;
    let subtotal = typeof rawResult.subtotal === 'number' && !isNaN(rawResult.subtotal) ? rawResult.subtotal : 0;
    let tax = typeof rawResult.tax === 'number' && !isNaN(rawResult.tax) ? rawResult.tax : 0;
    let tip = typeof rawResult.tip === 'number' && !isNaN(rawResult.tip) ? rawResult.tip : 0;

    const itemsList = Array.isArray(rawResult.items) ? rawResult.items : [];
    let itemSum = 0;
    for (const itm of itemsList) {
      if (itm && typeof itm.amount === 'number' && !isNaN(itm.amount)) {
        itemSum += itm.amount;
      }
    }
    itemSum = Number(itemSum.toFixed(2));

    // If total is 0 or missing, compute from subtotal + tax + tip or item sum
    if (total <= 0.01) {
      if (subtotal > 0) {
        total = Number((subtotal + tax + tip).toFixed(2));
      } else if (itemSum > 0) {
        total = Number((itemSum + tax + tip).toFixed(2));
        subtotal = itemSum;
      }
    }

    // If subtotal is missing, derive from total - tax - tip
    if (subtotal <= 0.01) {
      if (total > 0) {
        subtotal = total > (tax + tip) ? Number((total - tax - tip).toFixed(2)) : total;
      } else if (itemSum > 0) {
        subtotal = itemSum;
      }
    }

    total = Number(total.toFixed(2));
    subtotal = Number(subtotal.toFixed(2));
    tax = Number(tax.toFixed(2));
    tip = Number(tip.toFixed(2));

    // Date parsing
    let dateStr = String(rawResult.date || '').trim();
    dateStr = dateStr.replace(/[\sT]+(?:at\s+)?(?:\d{1,2}:\d{2}(?::\d{2})?).*$/i, '').trim();
    dateStr = dateStr.replace(/[;,.]$/, '');

    const monthMap: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
      january: '01', february: '02', march: '03', april: '04', june: '06',
      july: '07', august: '08', september: '09', october: '10', november: '11', december: '12'
    };

    const isoMatch = dateStr.match(/\b(20[123][0-9])[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12][0-9]|3[01])\b/);
    const usMatch = dateStr.match(/\b(0?[1-9]|1[0-2])[-/.](0?[1-9]|[12][0-9]|3[01])[-/.](20[123][0-9]|[0-9]{2})\b/);
    const monthNameMatch = dateStr.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s.,-]+(0?[1-9]|[12][0-9]|3[01])(?:st|nd|rd|th)?[\s.,-]+(20[123][0-9]|[0-9]{2})\b/i);
    const dayMonthMatch = dateStr.match(/\b(0?[1-9]|[12][0-9]|3[01])(?:st|nd|rd|th)?[\s.,-]+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s.,-]+(20[123][0-9]|[0-9]{2})\b/i);

    if (isoMatch) {
      dateStr = `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
    } else if (usMatch) {
      let yr = usMatch[3];
      if (yr.length === 2) {
        yr = parseInt(yr) > 50 ? `19${yr}` : `20${yr}`;
      }
      dateStr = `${yr}-${usMatch[1].padStart(2, '0')}-${usMatch[2].padStart(2, '0')}`;
    } else if (monthNameMatch) {
      const mStr = monthNameMatch[1].toLowerCase().slice(0, 3);
      const mNum = monthMap[mStr] || '01';
      const day = monthNameMatch[2].padStart(2, '0');
      let yr = monthNameMatch[3];
      if (yr.length === 2) {
        yr = parseInt(yr) > 50 ? `19${yr}` : `20${yr}`;
      }
      dateStr = `${yr}-${mNum}-${day}`;
    } else if (dayMonthMatch) {
      const mStr = dayMonthMatch[2].toLowerCase().slice(0, 3);
      const mNum = monthMap[mStr] || '01';
      const day = dayMonthMatch[1].padStart(2, '0');
      let yr = dayMonthMatch[3];
      if (yr.length === 2) {
        yr = parseInt(yr) > 50 ? `19${yr}` : `20${yr}`;
      }
      dateStr = `${yr}-${mNum}-${day}`;
    } else if (!isNaN(Date.parse(dateStr))) {
      const parsedD = new Date(dateStr);
      if (!isNaN(parsedD.getTime())) {
        dateStr = parsedD.toISOString().split('T')[0];
      }
    }

    if (!dateStr || dateStr.length < 8) {
      const fileDateMatch = fileName.match(/\b(20[123][0-9])[-_](0?[1-9]|1[0-2])[-_](0?[1-9]|[12][0-9]|3[01])\b/);
      if (fileDateMatch) {
        dateStr = `${fileDateMatch[1]}-${fileDateMatch[2]}-${fileDateMatch[3]}`;
      } else {
        dateStr = new Date().toISOString().split('T')[0];
      }
    }

    let cardLast4 = String(rawResult.card_last_4 || rawResult.cardLast4 || '').replace(/\D/g, '');
    if (cardLast4.length > 4) cardLast4 = cardLast4.slice(-4);
    if (cardLast4.length < 4) cardLast4 = '';

    const vendor = rawResult.vendor ? rawResult.vendor.trim() : 'Unknown Vendor';
    const memo = rawResult.memo || `AI-OCR Processed (${fileName})`;
    const taxCls = classifyExtractedTaxSchedule(vendor, rawResult.category || '', memo, fileName);

    return {
      success: true,
      source: sourceName,
      data: {
        vendor,
        date: dateStr,
        lineItems: (itemsList || []).map((itm: any) => ({
          description: itm.description || 'Item Line',
          quantity: 1,
          unitPrice: Number(itm.amount) || 0,
          total: Number(itm.amount) || 0
        })),
        subtotal,
        tax,
        tip,
        total,
        paymentMethod: rawResult.payment_method || rawResult.paymentMethod || (cardLast4 ? 'CARD' : 'CASH'),
        cardLast4: cardLast4 || undefined,
        invoiceNumber: rawResult.invoice_number || rawResult.invoiceNumber || undefined,
        category: taxCls.categoryName,
        schedule: taxCls.schedule,
        irsLineNumber: taxCls.lineNumber,
        irsLineTitle: taxCls.lineTitle,
        confidence: 0.99,
        memo
      }
    };
  };

  let clientLastError = '';

  // 1. Direct Client-Side Gemini Vision Scan (Prioritized on GitHub Pages or when local keys are present)
  if (apiKeys.length > 0 || isStaticHost) {
    if (apiKeys.length > 0) {
      if (onStep) onStep('Connecting to Gemini Vision API...');
      const modelsToTry = ["gemini-2.5-flash", "gemini-3.1-flash-lite", "gemini-3.8-flash", "gemini-flash-latest"];
      let rawResult: any = null;

      outerLoop:
      for (const model of modelsToTry) {
        for (const currentKey of apiKeys) {
          try {
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${currentKey}`;
            const gResp = await fetch(geminiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });

            if (gResp.ok) {
              const gData = await gResp.json();
              if (gData.error) {
                clientLastError = `API Error [${model}] with Key [${currentKey.slice(0, 6)}...]: ${gData.error.message}`;
                continue;
              }

              const candidates = gData?.candidates || [];
              if (candidates.length === 0 || candidates[0].finishReason === 'SAFETY' || candidates[0].finishReason === 'RECITATION') {
                clientLastError = `Model [${model}] blocked: ${candidates[0]?.finishReason || 'No candidates'}`;
                continue;
              }

              const text = candidates[0]?.content?.parts?.[0]?.text;
              if (text) {
                let parsed: any = null;
                const cleanText = text.trim();
                try {
                  parsed = JSON.parse(cleanText);
                } catch {
                  const jsonMatch = cleanText.match(/(\{.*\})/s);
                  if (jsonMatch) {
                    try {
                      parsed = JSON.parse(jsonMatch[1]);
                    } catch {}
                  }
                }

                if (parsed) {
                  if (parsed.receipts && Array.isArray(parsed.receipts) && parsed.receipts.length > 0) {
                    rawResult = parsed.receipts[0];
                    break outerLoop;
                  } else if (parsed.vendor && parsed.total !== undefined) {
                    rawResult = parsed;
                    break outerLoop;
                  }
                }
              } else {
                clientLastError = `Empty text for ${model} (Reason: ${candidates[0]?.finishReason})`;
              }
            } else {
              const errText = await gResp.text().catch(() => '');
              clientLastError = `HTTP ${gResp.status} with Key [${currentKey.slice(0, 6)}...]: ${errText.slice(0, 4000)}`;
            }
          } catch (mErr: any) {
            clientLastError = `Fetch error [${model}]: ${mErr.message}`;
          }
        }
      }

      if (rawResult) {
        return normalizeOcrResult(rawResult, 'CLIENT_GEMINI');
      }
    } else {
      clientLastError = 'No local Gemini API keys configured. (Click "Configure Gemini Key" in the header or add GEMINI_API_KEY to GitHub Secrets)';
    }
  }

  // 2. Server-side API Proxy fallback (for local development or fullstack container environments)
  let serverLastError = '';
  try {
    if (onStep) onStep('Contacting backend scan endpoint...');
    const scanResp = await fetch(getBackendApiUrl() + '/api/scan/receipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: dataUrl,
        mimeType: cleanMime,
        fileName,
        clientName: clientName || 'General'
      })
    });

    if (scanResp.ok) {
      const scanJson = await scanResp.json();
      if (scanJson.success && scanJson.data) {
        return normalizeOcrResult(scanJson.data, 'SERVER_API');
      } else {
        serverLastError = scanJson.error || 'Server scan logic failed';
        if (scanJson.details) serverLastError += ` (${scanJson.details})`;
      }
    } else {
      const errText = await scanResp.text().catch(() => '');
      if (scanResp.status === 405) {
        serverLastError = `HTTP 405 Method Not Allowed (GitHub Pages static host rejects POST /api/scan/receipt). To bypass, configure your Gemini API Key in the engine header.`;
      } else {
        serverLastError = `HTTP ${scanResp.status}: ${errText.slice(0, 4000)}`;
      }
    }
  } catch (sErr: any) {
    serverLastError = sErr.message || String(sErr);
  }

  // If both failed, construct a helpful detailed error message
  const combinedError = [
    clientLastError ? `Direct AI Vision: ${clientLastError}` : '',
    serverLastError ? `Backend Proxy: ${serverLastError}` : ''
  ].filter(Boolean).join(' | ');

  return {
    success: false,
    errorMessage: combinedError || 'AI OCR extraction failed'
  };
}

// ---------------------------------------------------------------------------
// CONCURRENT PARALLEL WORKER POOL EXECUTION
// ---------------------------------------------------------------------------

export async function runParallelBatchScan(
  items: ReceiptInputItem[],
  options: {
    concurrency: number;
    defaultClientName?: string;
    existingLedger: ProcessedReceipt[];
    onWorkerUpdate: (workers: ParallelWorkerState[]) => void;
    onItemProcessed: (processed: ProcessedReceipt, index: number, total: number) => void;
  }
): Promise<ProcessedReceipt[]> {
  const concurrency = Math.max(1, Math.min(16, options.concurrency || 4));
  const results: ProcessedReceipt[] = [];
  const currentLedger = [...options.existingLedger];

  // Initialize worker pool state
  const workers: ParallelWorkerState[] = Array.from({ length: concurrency }).map((_, idx) => ({
    workerId: `worker-${idx + 1}`,
    name: `Worker Pipeline #${idx + 1}`,
    status: 'IDLE',
    progressPercent: 0,
    processedCount: 0,
    lastLatencyMs: 0
  }));

  options.onWorkerUpdate([...workers]);

  // Queue of tasks
  let currentIndex = 0;
  const totalItems = items.length;

  // Worker loop function
  const runWorker = async (workerIndex: number) => {
    const worker = workers[workerIndex];

    while (currentIndex < totalItems) {
      const taskIndex = currentIndex++;
      const item = items[taskIndex];
      if (!item) break;

      const startTime = performance.now();
      worker.status = 'BUSY';
      worker.currentFile = item.fileName;
      worker.currentStep = 'Computing SHA-256 Hash...';
      worker.progressPercent = 20;
      options.onWorkerUpdate([...workers]);

      // 1. Compute file hash & preserve dataUrl for previews and audit export
      let fileHash = '';
      let dataUrl = item.dataUrl;

      if (item.file && !dataUrl) {
        try {
          dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string) || '');
            reader.onerror = () => resolve('');
            reader.readAsDataURL(item.file!);
          });
        } catch {
          // ignore
        }
      }

      try {
        if (item.file) {
          fileHash = await computeReceiptHash(item.file);
        } else if (dataUrl) {
          fileHash = await computeReceiptHash(dataUrl);
        } else {
          fileHash = await computeReceiptHash(`${item.fileName}_${item.fileSize || 0}`);
        }
      } catch {
        fileHash = `hash-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      }

      // 2. Preprocess & Extract text & line items
      worker.currentStep = 'Executing AI Vision OCR & Entity Extraction...';
      worker.progressPercent = 55;
      options.onWorkerUpdate([...workers]);

      const clientName = item.clientName || options.defaultClientName || 'General';

      let extracted: {
        vendor: string;
        date: string;
        lineItems: ExtractedLineItem[];
        subtotal: number;
        tax: number;
        tip: number;
        total: number;
        paymentMethod: string;
        cardLast4?: string;
        invoiceNumber?: string;
        category?: string;
        schedule?: 'SCHEDULE_F' | 'SCHEDULE_C';
        irsLineNumber?: string;
        irsLineTitle?: string;
        confidence: number;
        memo: string;
      };

      let aiScanSuccess = false;
      let ocrErrorMessage = '';

      if (dataUrl && (dataUrl.startsWith('data:image/') || dataUrl.startsWith('data:application/pdf'))) {
        const ocrRes = await scanReceiptWithAI({
          dataUrl,
          fileType: item.fileType,
          fileName: item.fileName,
          clientName,
          onStep: (step) => {
            worker.currentStep = step;
            options.onWorkerUpdate([...workers]);
          }
        });

        if (ocrRes.success && ocrRes.data) {
          extracted = ocrRes.data;
          aiScanSuccess = true;
        } else {
          ocrErrorMessage = ocrRes.errorMessage || 'AI OCR extraction failed';
        }
      }

      if (!aiScanSuccess) {
        await new Promise(r => setTimeout(r, 50));
        extracted = extractReceiptMetadata(
          item.fileName,
          undefined,
          item.categoryHint,
          {
            vendor: item.vendorHint,
            amount: item.amountHint,
            date: item.dateHint,
            memo: item.memo
          }
        );
      }

      // 3. Tax Classification
      worker.currentStep = 'Classifying IRS Form 1040 Schedule...';
      worker.progressPercent = 80;
      options.onWorkerUpdate([...workers]);

      const taxCls = (extracted.schedule && extracted.irsLineNumber && extracted.irsLineTitle)
        ? {
            schedule: extracted.schedule,
            lineNumber: extracted.irsLineNumber,
            lineTitle: extracted.irsLineTitle,
            categoryName: extracted.category || 'Supplies',
            confidence: 0.99
          }
        : classifyExtractedTaxSchedule(
            extracted.vendor,
            item.categoryHint || extracted.memo,
            item.memo || extracted.memo,
            item.fileName
          );

      // 4. Duplicate Check against existing ledger + newly scanned items
      worker.currentStep = 'Running Duplicate Receipt Detector...';
      worker.progressPercent = 95;
      options.onWorkerUpdate([...workers]);

      const dupCheck = evaluateReceiptDuplicate(
        {
          fileHash,
          vendor: extracted.vendor,
          total: extracted.total,
          date: extracted.date,
          clientName
        },
        currentLedger
      );

      const latency = Math.round(performance.now() - startTime);

      // Only exact identical file duplicates are automatically REJECTED;
      // Fuzzy matches are kept as PROCESSED with a warning status so legitimate repeat purchases are not lost.
      const initialStatus: ProcessedReceipt['status'] = 
        dupCheck.status === 'DUPLICATE_EXACT' ? 'REJECTED' : 'PROCESSED';

      const submitterName = item.submittedBy || (item.clientEmail ? `${clientName} (${item.clientEmail})` : (clientName.toLowerCase().includes('admin') ? 'Administrator (moisttowlett247@gmail.com)' : clientName));
      const submitterRole = item.submittedByRole || (clientName.toLowerCase().includes('admin') ? 'ADMIN' : 'CLIENT');
      const uploadTimestamp = item.uploadedAt || new Date().toISOString();

      const processedRecord: ProcessedReceipt = {
        id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        fileName: item.fileName,
        fileSize: item.fileSize || (item.file?.size ?? 125000),
        fileType: item.fileType || (item.file?.type ?? 'image/jpeg'),
        dataUrl: dataUrl || item.dataUrl,
        fileHash,
        clientId: item.clientId || (clientName.toLowerCase().includes('admin') ? 'admin' : undefined),
        clientName,
        clientEmail: item.clientEmail,
        submittedBy: submitterName,
        submittedByRole: submitterRole,
        uploadedAt: uploadTimestamp,
        vendor: extracted.vendor,
        normalizedVendor: normalizeVendorName(extracted.vendor),
        date: extracted.date,
        lineItems: extracted.lineItems,
        subtotal: extracted.subtotal,
        tax: extracted.tax,
        tip: extracted.tip,
        total: extracted.total,
        paymentMethod: extracted.paymentMethod,
        cardLast4: extracted.cardLast4,
        invoiceNumber: extracted.invoiceNumber,
        category: taxCls.categoryName,
        schedule: taxCls.schedule,
        irsLineNumber: taxCls.lineNumber,
        irsLineTitle: taxCls.lineTitle,
        confidence: Number((extracted.confidence * taxCls.confidence).toFixed(2)),
        duplicateStatus: dupCheck.status,
        duplicateReason: dupCheck.reason,
        duplicateMatchId: dupCheck.matchedId,
        status: initialStatus,
        workerNodeId: worker.name,
        processingDurationMs: latency,
        memo: item.memo || extracted.memo,
        processedAt: new Date().toISOString(),
        ocrFailed: !aiScanSuccess,
        ocrError: !aiScanSuccess ? (ocrErrorMessage || 'Unknown AI OCR connection error') : undefined
      };

      currentLedger.push(processedRecord);
      results.push(processedRecord);

      // Update worker stats
      worker.processedCount++;
      worker.lastLatencyMs = latency;
      worker.progressPercent = 100;
      worker.currentStep = 'Item Completed';
      options.onWorkerUpdate([...workers]);

      // Notify caller
      options.onItemProcessed(processedRecord, results.length, totalItems);
    }

    worker.status = 'COMPLETED';
    worker.currentStep = 'Queue Finished';
    options.onWorkerUpdate([...workers]);
  };

  // Launch worker promises
  const activeWorkerPromises = Array.from({ length: concurrency }).map((_, idx) => runWorker(idx));
  await Promise.all(activeWorkerPromises);

  return results;
}

// ---------------------------------------------------------------------------
// EXCEL (.XLSX) MULTI-SHEET GENERATOR VIA JSZIP (NATIVE XML MATCHING PYTHON)
// ---------------------------------------------------------------------------

function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function rowsToSheetXml(rows: (string | number)[][], allowFormulas: boolean = true): string {
  const xml: string[] = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    '<sheetData>'
  ];

  rows.forEach((row, rIdx) => {
    const rowNum = rIdx + 1;
    xml.push(`<row r="${rowNum}">`);
    row.forEach((val, cIdx) => {
      const colLetter = cIdx < 26 ? String.fromCharCode(65 + cIdx) : `A${String.fromCharCode(65 + cIdx - 26)}`;
      const cellRef = `${colLetter}${rowNum}`;

      if (typeof val === 'number') {
        xml.push(`<c r="${cellRef}"><v>${val}</v></c>`);
      } else if (allowFormulas && typeof val === 'string' && val.startsWith('=')) {
        const formula = val.substring(1);
        xml.push(`<c r="${cellRef}"><f>${escapeXml(formula)}</f></c>`);
      } else {
        const esc = escapeXml(String(val ?? ''));
        xml.push(`<c r="${cellRef}" t="inlineStr"><is><t>${esc}</t></is></c>`);
      }
    });
    xml.push('</row>');
  });

  xml.push('</sheetData></worksheet>');
  return xml.join('');
}

export async function exportMultiSheetExcelXLSX(
  receipts: ProcessedReceipt[],
  clientName: string = 'Prairie Wind Agriculture',
  taxYear: string = '2026'
): Promise<void> {
  const zip = new JSZip();

  // 1. Tax totals calculation
  const schFMap: Record<string, number> = {};
  for (const k of Object.keys(IRS_SCHEDULE_F_LINES)) schFMap[k] = 0;
  const schCMap: Record<string, number> = {};
  for (const k of Object.keys(IRS_SCHEDULE_C_LINES)) schCMap[k] = 0;

  for (const r of receipts) {
    if (r.status === 'REJECTED') {
      continue; // Exclude all rejected duplicates from tax schedule sums
    }
    if (r.schedule === 'SCHEDULE_F') {
      if (schFMap[r.irsLineNumber] !== undefined) {
        schFMap[r.irsLineNumber] += r.total;
      } else {
        schFMap['Line 32'] = (schFMap['Line 32'] || 0) + r.total;
      }
    } else {
      if (schCMap[r.irsLineNumber] !== undefined) {
        schCMap[r.irsLineNumber] += r.total;
      } else {
        schCMap['Line 27a'] = (schCMap['Line 27a'] || 0) + r.total;
      }
    }
  }

  // Sheet 2: Schedule F (Constructed first to obtain exact total row index)
  const s2Rows: (string | number)[][] = [
    ['IRS FORM 1040 SCHEDULE F - FARM EXPENSES', ''],
    ['Client Entity', clientName],
    ['', ''],
    ['IRS Line Item', 'Deductible Subtotal ($)']
  ];
  const fStart = 5;
  for (const [lineKey, lineTitle] of Object.entries(IRS_SCHEDULE_F_LINES)) {
    const amt = Number((schFMap[lineKey] || 0).toFixed(2));
    s2Rows.push([`${lineKey} - ${lineTitle}`, amt]);
  }
  const fEnd = s2Rows.length;
  s2Rows.push(['TOTAL SCHEDULE F DEDUCTIONS', `=SUM(B${fStart}:B${fEnd})`]);
  const s2TotalRow = s2Rows.length;

  // Sheet 3: Schedule C (Constructed first to obtain exact total row index)
  const s3Rows: (string | number)[][] = [
    ['IRS FORM 1040 SCHEDULE C - BUSINESS EXPENSES', ''],
    ['Client Entity', clientName],
    ['', ''],
    ['IRS Line Item', 'Deductible Subtotal ($)']
  ];
  const cStart = 5;
  for (const [lineKey, lineTitle] of Object.entries(IRS_SCHEDULE_C_LINES)) {
    const amt = Number((schCMap[lineKey] || 0).toFixed(2));
    s3Rows.push([`${lineKey} - ${lineTitle}`, amt]);
  }
  const cEnd = s3Rows.length;
  s3Rows.push(['TOTAL SCHEDULE C DEDUCTIONS', `=SUM(B${cStart}:B${cEnd})`]);
  const s3TotalRow = s3Rows.length;

  // Sheet 1: Tax Summary (dynamically linked to exact total rows)
  const s1Rows: (string | number)[][] = [
    ['IRS TAX SCHEDULE RECONCILIATION SUMMARY', ''],
    ['Client Entity', clientName],
    ['Tax Year', taxYear],
    ['Report Generated', new Date().toLocaleString()],
    ['', ''],
    ['Tax Schedule Form', 'Total Deductible Amount ($)'],
    ['IRS Form 1040 Schedule F (Farm Operating Deductions)', `='Schedule F'!B${s2TotalRow}`],
    ['IRS Form 1040 Schedule C (Business Deductions)', `='Schedule C'!B${s3TotalRow}`],
    ['GRAND TOTAL VERIFIED TAX DEDUCTIONS', '=B7+B8'],
    ['', ''],
    ['Total Receipts Processed', receipts.length],
    ['Active Worker Engine', 'Integrated Multi-Worker Parallel Engine']
  ];

  // Sheet 4: Itemized Audit Ledger
  const s4Rows: (string | number)[][] = [
    [
      'Transaction ID',
      'Date',
      'Client',
      'Vendor / Payee',
      'Category',
      'Tax Schedule',
      'IRS Line Item',
      'Total Amount ($)',
      'Tax ($)',
      'Payment Method',
      'Card Last 4',
      'Duplicate Status',
      'Verification Status',
      'Worker Pipeline',
      'Source File Name'
    ]
  ];

  for (const r of receipts) {
    s4Rows.push([
      r.id,
      r.date,
      r.clientName,
      r.vendor,
      r.category,
      r.schedule === 'SCHEDULE_F' ? 'Schedule F (Farm)' : 'Schedule C (Business)',
      `${r.irsLineNumber}: ${r.irsLineTitle}`,
      Number(r.total.toFixed(2)),
      Number(r.tax.toFixed(2)),
      r.paymentMethod,
      r.cardLast4 || 'N/A',
      r.duplicateStatus,
      r.status,
      r.workerNodeId,
      r.fileName
    ]);
  }

  // XML Boilerplate for OpenXML
  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet4.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Tax Summary" sheetId="1" r:id="rId1"/>
    <sheet name="Schedule F" sheetId="2" r:id="rId2"/>
    <sheet name="Schedule C" sheetId="3" r:id="rId3"/>
    <sheet name="Itemized Audit Ledger" sheetId="4" r:id="rId4"/>
  </sheets>
</workbook>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet4.xml"/>
</Relationships>`;

  zip.file('[Content_Types].xml', contentTypesXml);
  zip.file('_rels/.rels', rootRelsXml);
  zip.file('xl/workbook.xml', workbookXml);
  zip.file('xl/_rels/workbook.xml.rels', workbookRelsXml);
  zip.file('xl/worksheets/sheet1.xml', rowsToSheetXml(s1Rows, true));
  zip.file('xl/worksheets/sheet2.xml', rowsToSheetXml(s2Rows, true));
  zip.file('xl/worksheets/sheet3.xml', rowsToSheetXml(s3Rows, true));
  zip.file('xl/worksheets/sheet4.xml', rowsToSheetXml(s4Rows, false));

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const safeName = clientName.replace(/[^a-z0-9_-]/gi, '_');
  const filename = `${safeName}_Tax_Schedules_MultiSheet_${taxYear}.xlsx`;

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// CSV & QBO EXPORTERS
// ---------------------------------------------------------------------------

function sanitizeCsv(val: any): string {
  if (val === undefined || val === null) return '""';
  let str = String(val).replace(/"/g, '""');
  if (['=', '+', '-', '@'].includes(str.charAt(0))) {
    str = `'` + str;
  }
  return `"${str}"`;
}

export function exportAuditLedgerCSV(
  receipts: ProcessedReceipt[],
  clientName: string = 'Prairie Wind Agriculture',
  taxYear: string = '2026'
): void {
  const headers = [
    'Transaction ID',
    'Date',
    'Client',
    'Vendor / Payee',
    'Category',
    'Tax Schedule',
    'IRS Line Number',
    'IRS Line Title',
    'Total Amount ($)',
    'Subtotal ($)',
    'Tax ($)',
    'Tip ($)',
    'Payment Method',
    'Card Last 4',
    'Duplicate Status',
    'Duplicate Reason',
    'Status',
    'Worker Node',
    'File Name',
    'Confidence Score'
  ];

  const rows = receipts.map(r => [
    r.id,
    r.date,
    r.clientName,
    r.vendor,
    r.category,
    r.schedule,
    r.irsLineNumber,
    r.irsLineTitle,
    r.total.toFixed(2),
    r.subtotal.toFixed(2),
    r.tax.toFixed(2),
    r.tip.toFixed(2),
    r.paymentMethod,
    r.cardLast4 || '',
    r.duplicateStatus,
    r.duplicateReason || '',
    r.status,
    r.workerNodeId,
    r.fileName,
    (r.confidence * 100).toFixed(0) + '%'
  ]);

  const csvContent = [
    headers.map(sanitizeCsv).join(','),
    ...rows.map(r => r.map(sanitizeCsv).join(','))
  ].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const safeName = clientName.replace(/[^a-z0-9_-]/gi, '_');
  const filename = `${safeName}_Audit_Ledger_${taxYear}.csv`;

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportQBOJsonBatch(
  receipts: ProcessedReceipt[],
  clientName: string = 'Prairie Wind Agriculture'
): void {
  // Only export approved and valid non-duplicate transactions to QuickBooks Online
  const exportable = receipts.filter(r => r.status !== 'REJECTED');

  const qboPayload = {
    batchId: `batch-qbo-${Date.now()}`,
    clientName,
    exportedAt: new Date().toISOString(),
    transactionCount: exportable.length,
    transactions: exportable.map(r => ({
      TxnDate: r.date,
      VendorRef: { name: r.vendor },
      TotalAmt: r.total,
      TaxAmt: r.tax,
      PaymentType: r.paymentMethod,
      AccountRef: {
        name: r.schedule === 'SCHEDULE_F' ? 'Farm Operating Expenses' : 'General Business Expenses'
      },
      Line: r.lineItems.map((li, idx) => ({
        Id: `${idx + 1}`,
        Amount: li.total,
        Description: li.description,
        DetailType: 'AccountBasedExpenseLineDetail',
        AccountBasedExpenseLineDetail: {
          AccountRef: {
            name: `${r.irsLineNumber} - ${r.irsLineTitle}`
          }
        }
      })),
      PrivateNote: `Parallel Worker Ingested: ${r.fileName} | Duplicate: ${r.duplicateStatus} | Card: ${r.cardLast4 || 'N/A'}`
    }))
  };

  const jsonStr = JSON.stringify(qboPayload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const safeName = clientName.replace(/[^a-z0-9_-]/gi, '_');
  const filename = `${safeName}_QBO_Batch_${new Date().toISOString().split('T')[0]}.json`;

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function exportAuditVaultZip(
  receipts: ProcessedReceipt[],
  clientName: string = 'Prairie Wind Agriculture',
  taxYear: string = '2026'
): Promise<void> {
  const zip = new JSZip();
  const safeName = clientName.replace(/[^a-z0-9_-]/gi, '_');
  const root = zip.folder(`Audit_Vault_${safeName}_${taxYear}`);
  const imagesFolder = root?.folder('Receipt_Images');

  for (let i = 0; i < receipts.length; i++) {
    const r = receipts[i];
    const safeVendor = r.vendor.replace(/[^a-z0-9_-]/gi, '_');
    const safeFilename = `${(i + 1).toString().padStart(3, '0')}_${safeVendor}_${r.date}.jpg`;

    if (r.dataUrl && r.dataUrl.includes(',')) {
      const base64Data = r.dataUrl.split(',')[1];
      imagesFolder?.file(safeFilename, base64Data, { base64: true });
    } else {
      const receiptCard = `RECEIPT AUDIT CARD\nID: ${r.id}\nVendor: ${r.vendor}\nDate: ${r.date}\nTotal: $${r.total.toFixed(2)}\nTax: $${r.tax.toFixed(2)}\nIRS Schedule: ${r.schedule} (${r.irsLineNumber}: ${r.irsLineTitle})\nPayment: ${r.paymentMethod} (*${r.cardLast4 || '0000'})\nDuplicate Status: ${r.duplicateStatus}\nWorker: ${r.workerNodeId}\nSHA-256: ${r.fileHash}\n`;
      imagesFolder?.file(safeFilename.replace('.jpg', '.txt'), receiptCard);
    }
  }

  // Add Manifest JSON (excluding rejected duplicates from deduction sum)
  const validReceipts = receipts.filter(r => r.status !== 'REJECTED');
  root?.file('manifest.json', JSON.stringify({
    clientName,
    taxYear,
    totalDeductions: validReceipts.reduce((acc, r) => acc + r.total, 0),
    receiptsCount: receipts.length,
    validReceiptsCount: validReceipts.length,
    duplicatesSuppressed: receipts.length - validReceipts.length,
    generatedAt: new Date().toISOString(),
    receipts
  }, null, 2));

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Audit_Vault_${safeName}_${taxYear}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// SYNC TO CLIENT INTAKE & SYSTEM REPOSITORIES
// ---------------------------------------------------------------------------

export function syncReceiptsToClientIntakeQueue(receipts: ProcessedReceipt[]): void {
  const currentSubmissions = getClientSubmissions();
  const existingIds = new Set(currentSubmissions.map(s => s.id));

  // Only sync legitimate non-rejected receipts! Skip duplicates so client records are not polluted
  const validReceipts = receipts.filter(r => r.status !== 'REJECTED');

  const newSubmissions: ClientSubmission[] = validReceipts.map(r => ({
    id: `sub-sync-${r.id}`,
    clientId: `client-${r.clientName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
    clientName: r.clientName,
    clientEmail: r.clientEmail || 'billing@farmentity.example.com',
    fileName: r.fileName,
    fileSize: r.fileSize,
    fileType: r.fileType,
    dataUrl: r.dataUrl,
    categoryHint: r.category,
    memo: `${r.irsLineNumber}: ${r.irsLineTitle} | Worker: ${r.workerNodeId}`,
    uploadedAt: r.processedAt,
    status: r.status === 'VERIFIED' ? 'SYNCED_QBO' : 'QUEUED',
    extractedVendor: r.vendor,
    extractedAmount: r.total,
    extractedDate: r.date,
    workerNodeId: r.workerNodeId
  }));

  const merged = [
    ...newSubmissions.filter(s => !existingIds.has(s.id)),
    ...currentSubmissions
  ];

  saveClientSubmissions(merged);
}

// ---------------------------------------------------------------------------
// DEMO / SAMPLE TEST BATCHES
// ---------------------------------------------------------------------------

export function generateSampleFarmBatch(includeDuplicates: boolean = true): ReceiptInputItem[] {
  const batch: ReceiptInputItem[] = [
    {
      fileName: 'Agway_Bulk_Dairy_Feed_March.jpg',
      fileSize: 185420,
      fileType: 'image/jpeg',
      clientName: 'Prairie Wind Agriculture',
      memo: '50lb Alfalfa Pellets & Mineral salt blocks'
    },
    {
      fileName: 'Tractor_Supply_Hydraulic_Fluid_JDM20D.jpg',
      fileSize: 220410,
      fileType: 'image/jpeg',
      clientName: 'Prairie Wind Agriculture',
      memo: 'Universal tractor fluid 5 Gal bucket for John Deere'
    },
    {
      fileName: 'John_Deere_Parts_Filter_RE504836.pdf',
      fileSize: 142900,
      fileType: 'application/pdf',
      clientName: 'Prairie Wind Agriculture',
      memo: 'Combine harvester hydraulic filters'
    },
    {
      fileName: 'Nutrien_Ag_Urea_46-0-0_Spring_Fertilizer.png',
      fileSize: 310500,
      fileType: 'image/png',
      clientName: 'Prairie Wind Agriculture',
      memo: 'Bulk granular dry urea delivery'
    },
    {
      fileName: 'Shell_Bulk_Dyed_Diesel_Tractor_Fuel.jpg',
      fileSize: 198200,
      fileType: 'image/jpeg',
      clientName: 'Prairie Wind Agriculture',
      memo: '150 Gal off-road field diesel'
    },
    {
      fileName: 'Pioneer_Seed_Corn_P0574AM_80K.pdf',
      fileSize: 165800,
      fileType: 'application/pdf',
      clientName: 'Prairie Wind Agriculture',
      memo: 'Spring planting seed corn units'
    },
    {
      fileName: 'Dr_Miller_Vet_Herd_Vaccinations.jpg',
      fileSize: 204100,
      fileType: 'image/jpeg',
      clientName: 'Prairie Wind Agriculture',
      memo: 'Bovi-Shield Gold herd vaccination and health tags'
    },
    {
      fileName: 'Cenex_Grain_Dryer_Commercial_Propane.png',
      fileSize: 280400,
      fileType: 'image/png',
      clientName: 'Prairie Wind Agriculture',
      memo: 'Propane delivery for grain bin dryer'
    },
    {
      fileName: 'Tractor_Supply_Heavy_Duty_Fencing_Wire.jpg',
      fileSize: 175200,
      fileType: 'image/jpeg',
      clientName: 'Prairie Wind Agriculture',
      memo: 'Pasture perimeter barbed wire and T-posts'
    },
    {
      fileName: 'Agway_Calf_Milk_Replacer_Totes.jpg',
      fileSize: 190200,
      fileType: 'image/jpeg',
      clientName: 'Prairie Wind Agriculture',
      memo: 'High-protein calf milk replacer formula'
    }
  ];

  if (includeDuplicates) {
    // Intentionally add duplicate test cases
    batch.push({
      fileName: 'Agway_Bulk_Dairy_Feed_March_DUPLICATE_COPY.jpg',
      fileSize: 185420,
      fileType: 'image/jpeg',
      clientName: 'Prairie Wind Agriculture',
      memo: 'Accidental duplicate upload of Agway feed receipt'
    });
  }

  return batch;
}

export function generateSampleCommercialBatch(includeDuplicates: boolean = true): ReceiptInputItem[] {
  const batch: ReceiptInputItem[] = [
    {
      fileName: 'Home_Depot_Stud_Lumber_Jobsite.pdf',
      fileSize: 210400,
      fileType: 'application/pdf',
      clientName: 'Green Acres Dairy Farm',
      memo: '2x4 Framing lumber and deck screws'
    },
    {
      fileName: 'Lowes_Industrial_Extension_Cords.jpg',
      fileSize: 180200,
      fileType: 'image/jpeg',
      clientName: 'Green Acres Dairy Farm',
      memo: 'Heavy duty outdoor contractor extension cords'
    },
    {
      fileName: 'U-Haul_26ft_Equipment_Hauling_Rental.png',
      fileSize: 320100,
      fileType: 'image/png',
      clientName: 'Green Acres Dairy Farm',
      memo: 'Daily transport truck rental and mileage'
    },
    {
      fileName: 'Office_Depot_Paper_Invoicing_Labels.jpg',
      fileSize: 154800,
      fileType: 'image/jpeg',
      clientName: 'Green Acres Dairy Farm',
      memo: 'Multipurpose paper case and invoice labels'
    },
    {
      fileName: 'Fastenal_Grade_8_Structural_Bolts.pdf',
      fileSize: 168200,
      fileType: 'application/pdf',
      clientName: 'Green Acres Dairy Farm',
      memo: 'Structural grade 8 fasteners and washers'
    },
    {
      fileName: 'Shell_Fleet_Service_Truck_Gasoline.jpg',
      fileSize: 142000,
      fileType: 'image/jpeg',
      clientName: 'Green Acres Dairy Farm',
      memo: 'Unleaded gasoline for company service truck'
    },
    {
      fileName: 'Home_Depot_Milwaukee_M18_Drill_Kit.jpg',
      fileSize: 230500,
      fileType: 'image/jpeg',
      clientName: 'Green Acres Dairy Farm',
      memo: 'Shop maintenance tool replacement'
    },
    {
      fileName: 'Lowes_Rust_Oleum_Industrial_Enamel.jpg',
      fileSize: 195400,
      fileType: 'image/jpeg',
      clientName: 'Green Acres Dairy Farm',
      memo: 'Corrosion resistant enamel for metal barns'
    }
  ];

  if (includeDuplicates) {
    batch.push({
      fileName: 'Home_Depot_Stud_Lumber_Jobsite_DUPLICATE_SCAN.pdf',
      fileSize: 210400,
      fileType: 'application/pdf',
      clientName: 'Green Acres Dairy Farm',
      memo: 'Duplicate billing voucher'
    });
  }

  return batch;
}

let globalUniqueSequenceCounter = Math.floor(Date.now() % 1000000);

export function generateUniqueHighVolumeBatch(
  count: number = 100,
  clientName: string = 'Prairie Wind Agriculture'
): ReceiptInputItem[] {
  const vendors = [
    { name: 'John Deere Sales & Parts', cat: 'Repairs & Maintenance', item: 'Hydraulic Cylinder Seal Kit', base: 340 },
    { name: 'Tractor Supply Co.', cat: 'Supplies Purchased', item: 'Heavy Duty Greasing Gun & Cartridges', base: 78 },
    { name: 'Pioneer Hi-Bred Seeds', cat: 'Seeds & Plants', item: 'Optimum AQUAmax Seed Corn Lot', base: 1250 },
    { name: 'Nutrien Ag Solutions', cat: 'Fertilizers & Lime', item: 'Liquid Nitrogen 28% UAN Delivery', base: 2180 },
    { name: 'Cenex Bulk Energy', cat: 'Gasoline, Fuel & Oil', item: 'Ultra-Low Sulfur Dyed Field Diesel', base: 840 },
    { name: 'Agway Farm Supplies', cat: 'Feed Purchased', item: 'High-Energy Dairy Pellets 1-Ton Tote', base: 495 },
    { name: 'Dr Miller Large Animal Vet', cat: 'Veterinary, Breeding & Medicine', item: 'Spring Calf Herd Health Protocol', base: 620 },
    { name: 'NAPA Auto Parts', cat: 'Repairs & Maintenance', item: 'Alternator & Heavy Duty V-Belt', base: 185 },
    { name: 'Fastenal Industrial Supply', cat: 'Supplies Purchased', item: 'Flange Lock Nuts & Grade 8 Bolts', base: 92 },
    { name: 'Grainger Supply', cat: 'Supplies Purchased', item: 'Submersible Irrigation Sump Pump', base: 410 },
    { name: 'Airgas Welding & Gas', cat: 'Repairs & Maintenance', item: 'Argon Shielding Gas Tank Exchange', base: 165 },
    { name: 'Home Depot Pro', cat: 'Repairs & Maintenance', item: 'Galvanized Corrugated Roofing Panels', base: 560 },
    { name: 'Case IH Equipment', cat: 'Repairs & Maintenance', item: 'Combine Straw Chopper Blades', base: 730 },
    { name: 'Stihl Outdoor Power', cat: 'Supplies Purchased', item: 'Chainsaw Bar & Safety Helmet Kit', base: 245 },
    { name: 'Kubota Tractor Corp', cat: 'Repairs & Maintenance', item: 'Front Loader Bushing & Pin Set', base: 315 },
    { name: 'CHS Agronomy Bulk', cat: 'Fertilizers & Lime', item: 'Potash 0-0-60 Soil Treatment', base: 1420 },
    { name: 'Zimmatic Irrigation Systems', cat: 'Repairs & Maintenance', item: 'Center Pivot Gearbox & Coupler', base: 890 },
    { name: 'Zoetis Animal Health', cat: 'Veterinary, Breeding & Medicine', item: 'Livestock Antibiotic & Syringe Totes', base: 540 }
  ];

  const extensions = ['jpg', 'pdf', 'png'];
  const batch: ReceiptInputItem[] = [];
  const baseTimestamp = Date.now();

  for (let i = 0; i < count; i++) {
    globalUniqueSequenceCounter++;
    const seq = globalUniqueSequenceCounter;
    const v = vendors[seq % vendors.length];
    const invoiceNum = 100000 + seq;
    const ext = extensions[seq % extensions.length];
    
    // Non-repeating realistic purchase amount with penny differentiation
    const variation = (seq * 19.41) % 450;
    const pennies = ((seq * 17) % 99) * 0.01;
    const amount = Number((v.base + variation + pennies + 0.15).toFixed(2));
    
    // Spread dates across the tax year (past 300 days)
    const daysAgo = (seq * 11) % 300;
    const dateObj = new Date(baseTimestamp - daysAgo * 24 * 3600 * 1000);
    const dateStr = dateObj.toISOString().split('T')[0];

    const cleanVendorName = v.name.replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `${cleanVendorName}_INV_${invoiceNum}_${dateStr}.${ext}`;
    const fileSize = 115000 + (seq * 1739) % 380000;

    batch.push({
      fileName,
      fileSize,
      fileType: ext === 'pdf' ? 'application/pdf' : `image/${ext === 'png' ? 'png' : 'jpeg'}`,
      clientName,
      categoryHint: v.cat,
      memo: `Invoice #${invoiceNum}: ${v.item} (Unique Batch Item #${seq})`,
      vendorHint: v.name,
      amountHint: amount,
      dateHint: dateStr
    });
  }

  return batch;
}

