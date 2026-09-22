export type LicenseStatus = 'ACTIVE' | 'NOT ACTIVE' | 'EXPIRED';
export type PlanTier = 'ADMIN' | 'DEMO' | 'MONTHLY' | '3MONTH' | '6MONTH' | 'ANNUAL' | 'FARM' | 'PRO';

export interface ProductInquiry {
  id: string;
  name: string;
  email: string;
  company?: string;
  receiptVolume?: string; // e.g. "50-200 / month"
  interestedPlan?: string;
  notes?: string;
  submittedAt: string;
}

export interface LicenseKeyRecord {
  id: string;
  key: string;
  clientName: string;
  clientEmail: string;
  plan: PlanTier;
  status: LicenseStatus;
  inUse: boolean;
  issuedDate: string;
  activatedDate?: string;
  expiresDate: string;
  lastUsedDate?: string;
  hardwareId?: string;
  notes?: string;
}

export function getPlanDurationDays(plan: PlanTier): number {
  switch (plan) {
    case 'ADMIN':
      return 0; // Non-expiring perpetual
    case 'DEMO':
      return 7;
    case 'MONTHLY':
    case 'FARM':
      return 30; // 1 month
    case '3MONTH':
    case 'PRO':
      return 90; // 3 months
    case '6MONTH':
      return 180; // 6 months
    case 'ANNUAL':
      return 365; // 1 year
    default:
      return 30;
  }
}

export function getPlanLabel(plan: PlanTier): string {
  switch (plan) {
    case 'ADMIN':
      return 'Admin Master (Never Expires)';
    case 'DEMO':
      return 'Demo (7 Days)';
    case 'MONTHLY':
    case 'FARM':
      return 'Monthly (1 Month)';
    case '3MONTH':
    case 'PRO':
      return '3 Month (90 Days)';
    case '6MONTH':
      return '6 Month (180 Days)';
    case 'ANNUAL':
      return 'Annual (1 Year)';
    default:
      return plan;
  }
}

export function calculateExpirationDate(startDateStr: string, plan: PlanTier): string {
  if (plan === 'ADMIN') {
    return 'Never (Lifetime / Non-Expiring)';
  }
  const d = new Date(startDateStr);
  const baseTime = isNaN(d.getTime()) ? Date.now() : d.getTime();
  const days = getPlanDurationDays(plan);
  const exp = new Date(baseTime + days * 86400000);
  return exp.toISOString().split('T')[0];
}

function getSecureRandomDigits(count: number = 4): string {
  // Use Cryptographically Secure Pseudo-Random Number Generator (CSPRNG)
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const min = Math.pow(10, count - 1);
    const max = Math.pow(10, count) - 1;
    const range = max - min + 1;
    // Rejection sampling to prevent modulo bias
    const maxAllowed = Math.floor(0xffffffff / range) * range;
    const array = new Uint32Array(1);
    do {
      window.crypto.getRandomValues(array);
    } while (array[0] >= maxAllowed);

    const val = min + (array[0] % range);
    return String(val);
  }
  // Node / Server environment fallback with node crypto if available
  if (typeof globalThis !== 'undefined' && (globalThis as any).crypto && (globalThis as any).crypto.getRandomValues) {
    const min = Math.pow(10, count - 1);
    const max = Math.pow(10, count) - 1;
    const range = max - min + 1;
    const maxAllowed = Math.floor(0xffffffff / range) * range;
    const array = new Uint32Array(1);
    do {
      (globalThis as any).crypto.getRandomValues(array);
    } while (array[0] >= maxAllowed);

    const val = min + (array[0] % range);
    return String(val);
  }
  // Standard fallback using high-resolution performance time + random
  const seed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) % 10000;
  const raw = Math.floor(1000 + ((seed * 9301 + 49297) % 233280) / 233280 * 9000);
  return String(raw).padStart(count, '0').slice(-count);
}

export function generatePlanKey(plan: PlanTier): string {
  const rand1 = getSecureRandomDigits(4);
  const rand2 = getSecureRandomDigits(4);
  const year = new Date().getFullYear();
  switch (plan) {
    case 'ADMIN':
      return `ADMIN-${rand1}-${rand2}-MASTER`;
    case 'DEMO':
      return `DEMO-${rand1}-${rand2}-${year}`;
    case 'MONTHLY':
    case 'FARM':
      return `MONTHLY-${rand1}-${rand2}-${year}`;
    case '3MONTH':
    case 'PRO':
      return `3MONTH-${rand1}-${rand2}-${year}`;
    case '6MONTH':
      return `6MONTH-${rand1}-${rand2}-${year}`;
    case 'ANNUAL':
      return `ANNUAL-${rand1}-${rand2}-${year}`;
    default:
      return `${plan}-${rand1}-${rand2}-${year}`;
  }
}

export function generateAdminKey(flavor: 'MASTER' | 'VIP' | 'DEV' = 'MASTER'): string {
  const rand1 = getSecureRandomDigits(4);
  const rand2 = getSecureRandomDigits(4);
  return `ADMIN-${flavor}-${rand1}-${rand2}`;
}

export interface ActiveDeviceSession {
  id: string;
  ip: string;
  hash: string;
  keyMasked: string;
  rawKey?: string;
  hwid: string;
  machineName: string;
  appVersion: string;
  plan: string;
  status: string;
  lastPing: string;
  lastPingMs: number;
  firstSeen: string;
  pingCount: number;
  onlineState: 'ONLINE' | 'IDLE' | 'OFFLINE';
  secondsSinceLastPing: number;
  location?: string;
  isCloudflare?: boolean;
}

