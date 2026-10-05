// Tax Document Service: Storage, Validation, Sync, and Form 1040 Reporting

import { 
  W2Record, 
  Form1099Record, 
  assessStateTaxStatus,
  NO_INCOME_TAX_STATES,
  US_STATES_MAP
} from './taxDocumentTypes';
import { getBackendApiUrl } from './urlUtils';

const W2_STORAGE_KEY = 'receipt_processor_w2_records_v1';
const FORM1099_STORAGE_KEY = 'receipt_processor_1099_records_v1';
const BROADCAST_NAME = 'tax_documents_sync_channel_v1';

// Strict PII & Federal Tax Information (FTI) Redaction Helpers
export function sanitizeSSN(ssnRaw?: string | null): string {
  if (!ssnRaw) return '***-**-****';
  const clean = String(ssnRaw).replace(/\D/g, '');
  if (clean.length >= 4) {
    return `***-**-${clean.slice(-4)}`;
  }
  return '***-**-****';
}

export function sanitizeEIN(einRaw?: string | null): string {
  if (!einRaw) return '**-*******';
  const clean = String(einRaw).replace(/\D/g, '');
  if (clean.length >= 4) {
    return `**-***${clean.slice(-4)}`;
  }
  return '**-*******';
}

// CWE-1236 Defense against CSV / Excel Spreadsheet Formula Injection
function sanitizeCSVCell(val: string | number | undefined | null): string {
  if (val === undefined || val === null) return '""';
  let str = String(val).trim();
  // Neutralize formula triggers: =, +, -, @, \t, \r
  if (/^[=+@\-\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

let taxBroadcast: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    taxBroadcast = new BroadcastChannel(BROADCAST_NAME);
  }
} catch {}

function notifyTaxChange(action: string, record?: any) {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('tax_documents_updated', { detail: { action, record } }));
  } catch {}
  try {
    if (taxBroadcast) {
      taxBroadcast.postMessage({ type: 'TAX_DOCS_UPDATED', action, record, timestamp: Date.now() });
    }
  } catch {}
}

export function subscribeToTaxDocuments(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => callback();
  window.addEventListener('tax_documents_updated', handler);
  const bcHandler = () => callback();
  if (taxBroadcast) {
    taxBroadcast.addEventListener('message', bcHandler);
  }
  return () => {
    window.removeEventListener('tax_documents_updated', handler);
    if (taxBroadcast) {
      taxBroadcast.removeEventListener('message', bcHandler);
    }
  };
}

// -------------------------------------------------------------
// W-2 Records Management
// -------------------------------------------------------------

export function getW2Records(clientId?: string): W2Record[] {
  try {
    const raw = localStorage.getItem(W2_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        if (clientId && clientId !== 'ALL') {
          return parsed.filter(w => w.clientId === clientId);
        }
        return parsed;
      }
    }
  } catch {}
  return [];
}

export function saveW2Record(w2Data: Omit<W2Record, 'id' | 'stateAssessment' | 'uploadedAt'> & { id?: string }): W2Record {
  const current = getW2Records();
  const id = w2Data.id || `w2_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  
  // Compute intelligent state assessment
  const assessment = assessStateTaxStatus(
    w2Data.box15State,
    w2Data.box17StateTaxWithheld,
    w2Data.box16StateWages,
    w2Data.box19LocalTaxWithheld,
    w2Data.box20LocalityName
  );

  const fullRecord: W2Record = {
    ...w2Data,
    employeeSsnMasked: sanitizeSSN(w2Data.employeeSsnMasked),
    employerEin: sanitizeEIN(w2Data.employerEin),
    id,
    stateAssessment: assessment,
    uploadedAt: new Date().toISOString()
  };

  const filtered = current.filter(w => w.id !== id);
  const updated = [fullRecord, ...filtered];
  
  try {
    localStorage.setItem(W2_STORAGE_KEY, JSON.stringify(updated));
  } catch {}

  notifyTaxChange('SAVE_W2', fullRecord);

  // Background sync with server
  syncTaxDocToServer({ docType: 'W2', record: fullRecord });

  return fullRecord;
}

export function deleteW2Record(id: string): void {
  const current = getW2Records();
  const updated = current.filter(w => w.id !== id);
  try {
    localStorage.setItem(W2_STORAGE_KEY, JSON.stringify(updated));
  } catch {}

  notifyTaxChange('DELETE_W2', { id });

  // Delete from server
  const baseUrl = getBackendApiUrl();
  fetch(`${baseUrl}/api/tax-docs/${id}`, { method: 'DELETE' }).catch(() => {});
}

// -------------------------------------------------------------
// 1099 Records Management
// -------------------------------------------------------------

export function get1099Records(clientId?: string): Form1099Record[] {
  try {
    const raw = localStorage.getItem(FORM1099_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        if (clientId && clientId !== 'ALL') {
          return parsed.filter(item => item.clientId === clientId);
        }
        return parsed;
      }
    }
  } catch {}
  return [];
}

export function save1099Record(data: Omit<Form1099Record, 'id' | 'stateAssessment' | 'uploadedAt'> & { id?: string }): Form1099Record {
  const current = get1099Records();
  const id = data.id || `1099_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const assessment = assessStateTaxStatus(
    data.box6State,
    data.box5StateTaxWithheld,
    data.box7StateIncome
  );

  const fullRecord: Form1099Record = {
    ...data,
    recipientTinMasked: sanitizeSSN(data.recipientTinMasked),
    payerTin: sanitizeEIN(data.payerTin),
    id,
    stateAssessment: assessment,
    uploadedAt: new Date().toISOString()
  };

  const filtered = current.filter(item => item.id !== id);
  const updated = [fullRecord, ...filtered];

  try {
    localStorage.setItem(FORM1099_STORAGE_KEY, JSON.stringify(updated));
  } catch {}

  notifyTaxChange('SAVE_1099', fullRecord);
  syncTaxDocToServer({ docType: data.formType, record: fullRecord });

  return fullRecord;
}

export function delete1099Record(id: string): void {
  const current = get1099Records();
  const updated = current.filter(item => item.id !== id);
  try {
    localStorage.setItem(FORM1099_STORAGE_KEY, JSON.stringify(updated));
  } catch {}

  notifyTaxChange('DELETE_1099', { id });
  const baseUrl = getBackendApiUrl();
  fetch(`${baseUrl}/api/tax-docs/${id}`, { method: 'DELETE' }).catch(() => {});
}

// -------------------------------------------------------------
// Server Sync Helpers
// -------------------------------------------------------------

async function syncTaxDocToServer(payload: { docType: string; record: any }) {
  try {
    const baseUrl = getBackendApiUrl();
    await fetch(`${baseUrl}/api/tax-docs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch {}
}

export async function fetchServerTaxDocs(): Promise<{ w2s: W2Record[]; form1099s: Form1099Record[] }> {
  try {
    const baseUrl = getBackendApiUrl();
    const resp = await fetch(`${baseUrl}/api/tax-docs`);
    if (resp.ok) {
      const data = await resp.json();
      if (data.success) {
        if (Array.isArray(data.w2s)) {
          localStorage.setItem(W2_STORAGE_KEY, JSON.stringify(data.w2s));
        }
        if (Array.isArray(data.form1099s)) {
          localStorage.setItem(FORM1099_STORAGE_KEY, JSON.stringify(data.form1099s));
        }
        return { w2s: data.w2s || [], form1099s: data.form1099s || [] };
      }
    }
  } catch {}
  return { w2s: getW2Records(), form1099s: get1099Records() };
}

// -------------------------------------------------------------
// Sample Seeding Helpers (For Instant UI Verification)
// -------------------------------------------------------------

export function seedSampleIllinoisW2(clientId: string = 'client_default', clientName: string = 'John Doe'): W2Record {
  return saveW2Record({
    clientId,
    clientName,
    taxYear: 2025,
    employerName: 'Midwest Logistics & Tech Corp',
    employerEin: '36-9812450',
    employeeName: clientName,
    employeeSsnMasked: '***-**-6412',
    box1Wages: 84500.00,
    box2FedTaxWithheld: 11240.00,
    box3SocialSecurityWages: 84500.00,
    box4SocialSecurityTax: 5239.00,
    box5MedicareWages: 84500.00,
    box6MedicareTax: 1225.25,
    box15State: 'IL',
    box15StateIdNumber: 'IL-092144-8',
    box16StateWages: 84500.00,
    box17StateTaxWithheld: 4182.75, // 4.95% IL Flat Rate
    fileName: 'W2_Midwest_Logistics_2025.pdf',
    notes: 'Primary wage income statement. State income tax was actively withheld.'
  });
}

export function seedSampleTexasW2(clientId: string = 'client_default', clientName: string = 'John Doe'): W2Record {
  return saveW2Record({
    clientId,
    clientName,
    taxYear: 2025,
    employerName: 'Lone Star Energy & Supply LLC',
    employerEin: '74-1290344',
    employeeName: clientName,
    employeeSsnMasked: '***-**-6412',
    box1Wages: 67200.00,
    box2FedTaxWithheld: 8420.00,
    box3SocialSecurityWages: 67200.00,
    box4SocialSecurityTax: 4166.40,
    box5MedicareWages: 67200.00,
    box6MedicareTax: 974.40,
    box15State: 'TX',
    box15StateIdNumber: 'N/A',
    box16StateWages: 67200.00,
    box17StateTaxWithheld: 0.00, // No state income tax in Texas!
    fileName: 'W2_LoneStar_Energy_2025.pdf',
    notes: 'Texas employer. Verified: No State Income Tax Return Required.'
  });
}

export function seedSample1099NEC(clientId: string = 'client_default', clientName: string = 'John Doe'): Form1099Record {
  return save1099Record({
    clientId,
    clientName,
    formType: '1099_NEC',
    taxYear: 2025,
    payerName: 'Apex Creative Media Group',
    payerTin: '47-3819201',
    recipientName: clientName,
    recipientTinMasked: '***-**-6412',
    box1Amount: 18500.00,
    box4FedTaxWithheld: 0.00,
    box6State: 'CA',
    box7StateIncome: 18500.00,
    box5StateTaxWithheld: 1295.00,
    fileName: '1099NEC_Apex_Media_2025.pdf',
    notes: 'Freelance consulting income with California backup state withholding.'
  });
}

// -------------------------------------------------------------
// Form 1040 & State Tax Export Generators
// -------------------------------------------------------------

export function exportTaxDocumentsCSV(clientId?: string): void {
  const w2s = getW2Records(clientId);
  const form1099s = get1099Records(clientId);

  if (w2s.length === 0 && form1099s.length === 0) {
    alert('No tax documents available to export.');
    return;
  }

  const rows: string[] = [];
  rows.push('Document Type,Client Name,Tax Year,Employer / Payer,EIN / TIN,Federal Wages / Gross,Fed Tax Withheld,Social Security Tax,Medicare Tax,State Code,State Name,State Wages,State Tax Withheld,State Return Required?,Filing Guidance,Notes');

  // Add W2 rows with formula injection protection
  for (const w of w2s) {
    rows.push([
      'Form W-2',
      sanitizeCSVCell(w.clientName),
      w.taxYear,
      sanitizeCSVCell(w.employerName),
      sanitizeCSVCell(w.employerEin),
      w.box1Wages.toFixed(2),
      w.box2FedTaxWithheld.toFixed(2),
      w.box4SocialSecurityTax.toFixed(2),
      w.box6MedicareTax.toFixed(2),
      sanitizeCSVCell(w.box15State || 'N/A'),
      sanitizeCSVCell(w.stateAssessment?.stateName || ''),
      w.box16StateWages.toFixed(2),
      w.box17StateTaxWithheld.toFixed(2),
      w.stateAssessment?.stateReturnRequired ? 'YES' : 'NO (Zero State Tax)',
      sanitizeCSVCell(w.stateAssessment?.summaryMessage || ''),
      sanitizeCSVCell(w.notes || '')
    ].join(','));
  }

  // Add 1099 rows with formula injection protection
  for (const f of form1099s) {
    rows.push([
      f.formType === '1099_NEC' ? 'Form 1099-NEC' : 'Form 1099-MISC',
      sanitizeCSVCell(f.clientName),
      f.taxYear,
      sanitizeCSVCell(f.payerName),
      sanitizeCSVCell(f.payerTin),
      f.box1Amount.toFixed(2),
      f.box4FedTaxWithheld.toFixed(2),
      '0.00',
      '0.00',
      sanitizeCSVCell(f.box6State || 'N/A'),
      sanitizeCSVCell(f.stateAssessment?.stateName || ''),
      f.box7StateIncome.toFixed(2),
      f.box5StateTaxWithheld.toFixed(2),
      f.stateAssessment?.stateReturnRequired ? 'YES' : 'NO (Zero State Tax)',
      sanitizeCSVCell(f.stateAssessment?.summaryMessage || ''),
      sanitizeCSVCell(f.notes || '')
    ].join(','));
  }

  const csvContent = rows.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Form1040_Individual_Tax_Summary_${new Date().getFullYear()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
