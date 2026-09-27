// Client Mileage, Sales Tax Certificates, and Estimated Quarterly Tax Service
// Provides IRS Standard Mileage Tracking (Schedule C Line 9 & Schedule F Line 10),
// Tax Exemption Certificates (Farm & Wholesale Resale), and Quarterly Estimated Tax Calculations.

export interface MileageTrip {
  id: string;
  clientId: string;
  date: string;
  purpose: string;
  schedule: 'SCHEDULE_C' | 'SCHEDULE_F';
  startOdometer?: number;
  endOdometer?: number;
  miles: number;
  ratePerMile: number; // e.g., 0.67 for 2026 standard mileage
  calculatedDeduction: number;
  vehicleDescription?: string;
  notes?: string;
  createdAt: string;
}

export interface TaxExemptionCertificate {
  id: string;
  clientId: string;
  title: string;
  exemptionType: 'AGRICULTURAL_FARM' | 'WHOLESALE_RESALE' | 'NON_PROFIT' | 'GOVERNMENT';
  state: string;
  certificateNumber: string;
  issuedToName: string;
  expirationDate: string; // YYYY-MM-DD
  documentDataUrl?: string; // image/pdf scan
  notes?: string;
  verified: boolean;
  createdAt: string;
}

export interface QuarterlyEstimate {
  taxYear: string;
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  dueDate: string;
  isPastDue: boolean;
  isUpcoming: boolean;
  daysRemaining: number;
  projectedNetIncome: number;
  totalDeductionsShielded: number;
  estimatedTaxSaved: number;
  recommendedPayment: number;
}

const MILEAGE_STORAGE_KEY = 'receipt_processor_mileage_trips_v1';
const EXEMPTION_STORAGE_KEY = 'receipt_processor_exemption_certs_v1';

// 2026 IRS standard business & agricultural mileage rate
export const IRS_2026_MILEAGE_RATE = 0.67;

const INITIAL_DEMO_MILEAGE: MileageTrip[] = [
  {
    id: 'trip-101',
    clientId: 'client-prairie-wind',
    date: new Date(Date.now() - 86400000 * 3).toISOString().split('T')[0],
    purpose: 'Round-trip to regional feed mill for 4 bulk cattle mineral totes',
    schedule: 'SCHEDULE_F',
    startOdometer: 14210,
    endOdometer: 14285,
    miles: 75,
    ratePerMile: IRS_2026_MILEAGE_RATE,
    calculatedDeduction: 75 * IRS_2026_MILEAGE_RATE,
    vehicleDescription: '2023 Ford F-350 SuperDuty',
    notes: 'Hauling flatbed trailer for livestock feed delivery',
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString()
  },
  {
    id: 'trip-102',
    clientId: 'client-prairie-wind',
    date: new Date(Date.now() - 86400000 * 7).toISOString().split('T')[0],
    purpose: 'Emergency tractor replacement hydraulic hoses run to John Deere dealer',
    schedule: 'SCHEDULE_F',
    startOdometer: 14020,
    endOdometer: 14062,
    miles: 42,
    ratePerMile: IRS_2026_MILEAGE_RATE,
    calculatedDeduction: 42 * IRS_2026_MILEAGE_RATE,
    vehicleDescription: '2023 Ford F-350 SuperDuty',
    notes: 'Parts pickup during spring tillage',
    createdAt: new Date(Date.now() - 86400000 * 7).toISOString()
  },
  {
    id: 'trip-103',
    clientId: 'client-prairie-wind',
    date: new Date(Date.now() - 86400000 * 12).toISOString().split('T')[0],
    purpose: 'Client consultation meeting with commercial agricultural loan officer',
    schedule: 'SCHEDULE_C',
    startOdometer: 13850,
    endOdometer: 13910,
    miles: 60,
    ratePerMile: IRS_2026_MILEAGE_RATE,
    calculatedDeduction: 60 * IRS_2026_MILEAGE_RATE,
    vehicleDescription: 'Chevy Silverado 2500HD',
    notes: 'Operating line of credit annual renewal',
    createdAt: new Date(Date.now() - 86400000 * 12).toISOString()
  }
];

const INITIAL_DEMO_EXEMPTIONS: TaxExemptionCertificate[] = [
  {
    id: 'cert-101',
    clientId: 'client-prairie-wind',
    title: 'State Department of Revenue Agricultural Production Exemption',
    exemptionType: 'AGRICULTURAL_FARM',
    state: 'IA',
    certificateNumber: 'AG-EX-8849201-B',
    issuedToName: 'Prairie Wind Agriculture LLC',
    expirationDate: '2027-12-31',
    notes: 'Presents at Tractor Supply, Co-Op, and machinery dealers for 100% sales tax exemption on feed, seeds, fertilizer, and tractor parts.',
    verified: true,
    createdAt: new Date(Date.now() - 86400000 * 30).toISOString()
  },
  {
    id: 'cert-102',
    clientId: 'client-prairie-wind',
    title: 'Wholesale Resale Certificate (Commercial Grains & Livestock)',
    exemptionType: 'WHOLESALE_RESALE',
    state: 'IA',
    certificateNumber: 'RESALE-559281-W',
    issuedToName: 'Prairie Wind Agriculture LLC',
    expirationDate: '2026-11-30',
    notes: 'Applicable for raw commodity grain distribution and auction yard transactions.',
    verified: true,
    createdAt: new Date(Date.now() - 86400000 * 60).toISOString()
  }
];

export function getMileageTrips(clientId?: string): MileageTrip[] {
  try {
    const raw = localStorage.getItem(MILEAGE_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(MILEAGE_STORAGE_KEY, JSON.stringify(INITIAL_DEMO_MILEAGE));
      return clientId ? INITIAL_DEMO_MILEAGE.filter(t => t.clientId === clientId) : INITIAL_DEMO_MILEAGE;
    }
    const trips: MileageTrip[] = JSON.parse(raw);
    return clientId ? trips.filter(t => t.clientId === clientId) : trips;
  } catch {
    return INITIAL_DEMO_MILEAGE;
  }
}

export function saveMileageTrip(trip: Omit<MileageTrip, 'id' | 'createdAt' | 'calculatedDeduction'>): MileageTrip {
  const allTrips = getMileageTrips();
  const calculatedDeduction = Number((trip.miles * (trip.ratePerMile || IRS_2026_MILEAGE_RATE)).toFixed(2));
  const newTrip: MileageTrip = {
    ...trip,
    id: `trip-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    ratePerMile: trip.ratePerMile || IRS_2026_MILEAGE_RATE,
    calculatedDeduction,
    createdAt: new Date().toISOString()
  };
  const updated = [newTrip, ...allTrips];
  localStorage.setItem(MILEAGE_STORAGE_KEY, JSON.stringify(updated));
  return newTrip;
}

export function deleteMileageTrip(id: string): void {
  const allTrips = getMileageTrips();
  const updated = allTrips.filter(t => t.id !== id);
  localStorage.setItem(MILEAGE_STORAGE_KEY, JSON.stringify(updated));
}

export function getExemptionCertificates(clientId?: string): TaxExemptionCertificate[] {
  try {
    const raw = localStorage.getItem(EXEMPTION_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(EXEMPTION_STORAGE_KEY, JSON.stringify(INITIAL_DEMO_EXEMPTIONS));
      return clientId ? INITIAL_DEMO_EXEMPTIONS.filter(c => c.clientId === clientId) : INITIAL_DEMO_EXEMPTIONS;
    }
    const certs: TaxExemptionCertificate[] = JSON.parse(raw);
    return clientId ? certs.filter(c => c.clientId === clientId) : certs;
  } catch {
    return INITIAL_DEMO_EXEMPTIONS;
  }
}

export function saveExemptionCertificate(cert: Omit<TaxExemptionCertificate, 'id' | 'createdAt'>): TaxExemptionCertificate {
  const allCerts = getExemptionCertificates();
  const newCert: TaxExemptionCertificate = {
    ...cert,
    id: `cert-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    createdAt: new Date().toISOString()
  };
  const updated = [newCert, ...allCerts];
  localStorage.setItem(EXEMPTION_STORAGE_KEY, JSON.stringify(updated));
  return newCert;
}

export function deleteExemptionCertificate(id: string): void {
  const allCerts = getExemptionCertificates();
  const updated = allCerts.filter(c => c.id !== id);
  localStorage.setItem(EXEMPTION_STORAGE_KEY, JSON.stringify(updated));
}

/**
 * Calculates estimated quarterly tax projections and deadlines (IRS Form 1040-ES)
 */
export function calculateQuarterlyEstimates(totalDeductionsUsd: number, taxYear: string = '2026'): {
  deadlines: QuarterlyEstimate[];
  totalDeductionsShielded: number;
  totalTaxSavingsEstimate: number; // Based on ~25% combined self-employment + federal marginal tax
  effectiveTaxRate: number;
} {
  const now = new Date();
  const currentYear = now.getFullYear();
  const yearNum = parseInt(taxYear, 10) || currentYear;

  // IRS 1040-ES Deadlines: Q1 (April 15), Q2 (June 15), Q3 (Sept 15), Q4 (Jan 15 of following yr)
  const quarterDates = [
    { q: 'Q1' as const, dateStr: `${yearNum}-04-15T23:59:59` },
    { q: 'Q2' as const, dateStr: `${yearNum}-06-15T23:59:59` },
    { q: 'Q3' as const, dateStr: `${yearNum}-09-15T23:59:59` },
    { q: 'Q4' as const, dateStr: `${yearNum + 1}-01-15T23:59:59` }
  ];

  // Self-employment (15.3%) + ~10-12% baseline bracket = ~25% total shield
  const estimatedTaxSavings = totalDeductionsUsd * 0.25;

  const deadlines: QuarterlyEstimate[] = quarterDates.map(({ q, dateStr }) => {
    const targetDate = new Date(dateStr);
    const diffMs = targetDate.getTime() - now.getTime();
    const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    const isPastDue = daysRemaining < 0;
    const isUpcoming = daysRemaining >= 0 && daysRemaining <= 90;

    return {
      taxYear,
      quarter: q,
      dueDate: targetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      isPastDue,
      isUpcoming,
      daysRemaining,
      projectedNetIncome: 0,
      totalDeductionsShielded: totalDeductionsUsd / 4,
      estimatedTaxSaved: estimatedTaxSavings / 4,
      recommendedPayment: Math.max(0, 500)
    };
  });

  return {
    deadlines,
    totalDeductionsShielded: totalDeductionsUsd,
    totalTaxSavingsEstimate: estimatedTaxSavings,
    effectiveTaxRate: 0.25
  };
}
