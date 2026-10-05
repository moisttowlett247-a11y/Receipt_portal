// Types and state tax intelligence for individual tax filers (W-2, 1099-NEC, 1099-MISC, 1098)

export type TaxDocumentType = 'W2' | '1099_NEC' | '1099_MISC' | '1098' | 'OTHER';

export interface StateTaxAssessment {
  stateCode: string;
  stateName: string;
  hasStateIncomeTax: boolean;
  stateReturnRequired: boolean;
  stateTaxWithheld: number;
  stateWages: number;
  statusBadge: 'NO_TAX_STATE' | 'STATE_RETURN_REQUIRED' | 'NO_WITHHOLDING' | 'LOCAL_TAX_REPORTED';
  badgeColor: 'emerald' | 'amber' | 'blue' | 'purple';
  summaryMessage: string;
  filingAdvice: string;
}

export interface W2Record {
  id: string;
  clientId: string;
  clientName: string;
  clientEmail?: string;
  taxYear: number;
  employerName: string;
  employerEin: string;
  employeeName: string;
  employeeSsnMasked: string; // e.g. '***-**-5821'
  
  // Federal Boxes
  box1Wages: number; // Wages, tips, other compensation
  box2FedTaxWithheld: number; // Federal income tax withheld
  box3SocialSecurityWages: number;
  box4SocialSecurityTax: number;
  box5MedicareWages: number;
  box6MedicareTax: number;
  box7SocialSecurityTips?: number;
  box8AllocatedTips?: number;
  box10DependentCare?: number;
  box12Codes?: Array<{ code: string; amount: number; description?: string }>;
  
  // State & Local Boxes (Boxes 15 - 20)
  box15State: string; // 2-letter state code e.g. 'IL', 'CA', 'TX'
  box15StateIdNumber: string; // Employer's state ID number
  box16StateWages: number;
  box17StateTaxWithheld: number;
  box18LocalWages?: number;
  box19LocalTaxWithheld?: number;
  box20LocalityName?: string; // e.g. 'NYC', 'PHL', 'Cleveland'
  
  // Secondary State row for multi-state moves / remote work
  secondaryState?: {
    box15State: string;
    box15StateIdNumber?: string;
    box16StateWages: number;
    box17StateTaxWithheld: number;
  };

  // State Tax Assessment Analysis
  stateAssessment: StateTaxAssessment;
  
  // Metadata & Audit
  fileName?: string;
  fileUrl?: string;
  fileSize?: number;
  uploadedAt: string;
  verifiedByAdmin?: boolean;
  verifiedAt?: string;
  notes?: string;
}

export interface Form1099Record {
  id: string;
  clientId: string;
  clientName: string;
  formType: '1099_NEC' | '1099_MISC';
  taxYear: number;
  payerName: string;
  payerTin: string;
  recipientName: string;
  recipientTinMasked: string;
  
  // Amounts
  box1Amount: number; // Nonemployee compensation (1099-NEC) or Rents (1099-MISC)
  box4FedTaxWithheld: number;
  
  // State Information
  box5StateTaxWithheld: number;
  box6State: string;
  box7StateIncome: number;
  
  stateAssessment: StateTaxAssessment;
  uploadedAt: string;
  verifiedByAdmin?: boolean;
  fileName?: string;
  notes?: string;
}

// 9 US States with NO individual earned personal income tax
export const NO_INCOME_TAX_STATES: Record<string, string> = {
  AK: 'Alaska',
  FL: 'Florida',
  NV: 'Nevada',
  NH: 'New Hampshire', // Taxes interest & dividends only, no wage income tax
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  WA: 'Washington',   // Capital gains tax on high earners only, no wage income tax
  WY: 'Wyoming'
};

// All 50 US States lookup map
export const US_STATES_MAP: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'District of Columbia'
};

/**
 * Intelligent State Tax Assessment Engine
 * Determines if state tax return is required, handles zero-tax states, and flags local taxes.
 */
export function assessStateTaxStatus(
  stateCodeRaw: string,
  stateTaxWithheld: number = 0,
  stateWages: number = 0,
  localTaxWithheld: number = 0,
  localityName: string = ''
): StateTaxAssessment {
  const code = (stateCodeRaw || '').trim().toUpperCase();
  const stateName = US_STATES_MAP[code] || code || 'Unknown';
  const hasNoIncomeTax = Boolean(NO_INCOME_TAX_STATES[code]);

  // Case 1: State has NO income tax (e.g. Texas, Florida, Washington, etc.)
  if (hasNoIncomeTax) {
    return {
      stateCode: code,
      stateName,
      hasStateIncomeTax: false,
      stateReturnRequired: false,
      stateTaxWithheld: 0,
      stateWages,
      statusBadge: 'NO_TAX_STATE',
      badgeColor: 'emerald',
      summaryMessage: `${stateName} (${code}): No State Income Tax`,
      filingAdvice: `${stateName} does not levy personal state income tax on wage income. No state tax return is required for wages earned in ${code}.`
    };
  }

  // Case 2: State has income tax and tax was withheld
  if (stateTaxWithheld > 0) {
    const formattedWithheld = stateTaxWithheld.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    const localInfo = localTaxWithheld > 0 && localityName ? ` + ${localityName} Local Tax (${localTaxWithheld.toLocaleString('en-US', { style: 'currency', currency: 'USD' })})` : '';

    return {
      stateCode: code,
      stateName,
      hasStateIncomeTax: true,
      stateReturnRequired: true,
      stateTaxWithheld,
      stateWages,
      statusBadge: localTaxWithheld > 0 ? 'LOCAL_TAX_REPORTED' : 'STATE_RETURN_REQUIRED',
      badgeColor: 'amber',
      summaryMessage: `${stateName} (${code}): State Return Required • ${formattedWithheld} Withheld${localInfo}`,
      filingAdvice: `W-2 Box 17 reports ${formattedWithheld} withheld for ${stateName}. An individual state tax return (e.g. Form ${code === 'CA' ? '540' : code === 'IL' ? 'IL-1040' : code === 'NY' ? 'IT-201' : code + ' Return'}) must be filed.`
    };
  }

  // Case 3: State has income tax, but 0 was withheld (e.g. exempt, or low wages)
  if (code && !hasNoIncomeTax && stateWages > 0) {
    return {
      stateCode: code,
      stateName,
      hasStateIncomeTax: true,
      stateReturnRequired: true,
      stateTaxWithheld: 0,
      stateWages,
      statusBadge: 'NO_WITHHOLDING',
      badgeColor: 'blue',
      summaryMessage: `${stateName} (${code}): Wages Reported ($0 Withheld)`,
      filingAdvice: `${stateName} wages were reported ($${stateWages.toLocaleString()}) without withholding. A state return may be due with tax owed depending on filing status and deductions.`
    };
  }

  // Default / Unspecified
  return {
    stateCode: code || 'N/A',
    stateName: stateName || 'None',
    hasStateIncomeTax: false,
    stateReturnRequired: false,
    stateTaxWithheld: 0,
    stateWages: 0,
    statusBadge: 'NO_TAX_STATE',
    badgeColor: 'emerald',
    summaryMessage: 'No State Tax Reported',
    filingAdvice: 'No state wages or state withholdings were reported on this form.'
  };
}
