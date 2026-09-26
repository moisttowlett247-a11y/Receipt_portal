import { ClientUserAccount, ClientAccountSession, LicenseKeyRecord, PlanTier, calculateExpirationDate, getPlanLabel } from './types';
import { computeClientPasswordHash, generateCryptographicSalt } from './hashUtils';
import { CLOUDFLARE_WORKER_URL } from './licenseSyncService';

const CLIENT_ACCOUNTS_STORAGE_KEY = 'receipt_processor_client_accounts_v1';
const CLIENT_CURRENT_SESSION_KEY = 'receipt_processor_client_session_v1';
const RESERVED_ADMIN_USERNAMES = [
  'admin',
  'administrator',
  'root',
  'operator',
  'master',
  'sysadmin',
  'system',
  'superadmin',
  'security',
  'moisttowlett247',
  'billing',
  'support'
];

/**
 * Finds an active or issued license key record matching the given email address.
 * Checks the provided key list, fallback localStorage keys registry, or existing records.
 */
export function findLicenseRecordByEmail(
  email: string,
  availableKeys?: LicenseKeyRecord[]
): LicenseKeyRecord | null {
  const clean = email.trim().toLowerCase();
  if (!clean || !clean.includes('@')) return null;

  // 1. Search in passed available keys
  if (availableKeys && availableKeys.length > 0) {
    const found = availableKeys.find(
      k => k.clientEmail && k.clientEmail.trim().toLowerCase() === clean && k.status !== 'EXPIRED'
    );
    if (found) return found;
  }

  // 2. Search in localStorage keys registries (v4, v3)
  try {
    const rawV4 = localStorage.getItem('receipt_processor_keys_v4') || localStorage.getItem('receipt_processor_keys_v3');
    if (rawV4) {
      const keys: LicenseKeyRecord[] = JSON.parse(rawV4);
      if (Array.isArray(keys)) {
        const found = keys.find(
          k => k.clientEmail && k.clientEmail.trim().toLowerCase() === clean && k.status !== 'EXPIRED'
        );
        if (found) return found;
      }
    }
  } catch {}

  return null;
}

/**
 * Asynchronously locates an active license by email:
 * 1. Checks local memory and localStorage
 * 2. If not found locally, queries Cloudflare Edge KV API directly
 * This ensures that when someone creates an account, their existing license key
 * is automatically pulled from their email without requiring manual input.
 */
export async function lookupLicenseByEmailAsync(
  email: string,
  availableKeys?: LicenseKeyRecord[]
): Promise<LicenseKeyRecord | null> {
  const clean = email.trim().toLowerCase();
  if (!clean || !clean.includes('@')) return null;

  // 1. Check local cache
  const local = findLicenseRecordByEmail(clean, availableKeys);
  if (local) return local;

  // 2. Check Cloudflare KV backend
  try {
    const resp = await fetch(`${CLOUDFLARE_WORKER_URL}/api/licenses/by-email?email=${encodeURIComponent(clean)}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      cache: 'no-store'
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data && data.exists && data.key) {
        return {
          id: data.key,
          key: data.key,
          plan: (data.plan as any) || 'PRO',
          status: (data.status as any) || 'ACTIVE',
          clientName: data.clientName || '',
          clientEmail: data.userEmail || clean,
          expiresDate: data.expires || 'Never (Lifetime / Non-Expiring)',
          issuedDate: new Date().toISOString(),
          inUse: true
        };
      }
    }
  } catch (err) {
    console.warn('Notice: Remote license lookup by email failed:', err);
  }

  return null;
}

/**
 * Loads all client accounts from persistent local storage.
 * In a static / Cloudflare KV setting, this provides client persistence with zero leakage of cleartext passwords.
 */
export function getStoredClientAccounts(): ClientUserAccount[] {
  try {
    const raw = localStorage.getItem(CLIENT_ACCOUNTS_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('Error reading stored client accounts:', err);
  }
  return [];
}

function saveStoredClientAccounts(accounts: ClientUserAccount[]): void {
  try {
    localStorage.setItem(CLIENT_ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
  } catch (err) {
    console.warn('Error saving client accounts:', err);
  }
}

/**
 * Validates whether a proposed username is available across both Client accounts AND reserved Admin usernames.
 */
export function isUsernameAvailable(username: string, excludeAccountId?: string): { available: boolean; reason?: string } {
  const clean = username.trim().toLowerCase();
  if (!clean || clean.length < 3) {
    return { available: false, reason: 'Username must be at least 3 characters long.' };
  }
  if (!/^[a-z0-9_.-]+$/.test(clean)) {
    return { available: false, reason: 'Username can only contain letters, numbers, hyphens, periods, and underscores.' };
  }

  // 1. Check reserved admin usernames to prevent collision with Admin Portal
  if (RESERVED_ADMIN_USERNAMES.includes(clean)) {
    return { available: false, reason: 'This username is reserved for system administrators. Please select a different username.' };
  }

  // Also check if admin master username stored locally matches
  try {
    const adminUser = localStorage.getItem('receipt_processor_admin_user');
    if (adminUser && adminUser.trim().toLowerCase() === clean) {
      return { available: false, reason: 'This username is reserved for administrative consoles.' };
    }
  } catch {}

  // 2. Check existing client user accounts
  const existingAccounts = getStoredClientAccounts();
  const collision = existingAccounts.find(acc => acc.username.toLowerCase() === clean && acc.id !== excludeAccountId);
  if (collision) {
    return { available: false, reason: 'This username is already taken. Please choose another username.' };
  }

  return { available: true };
}

/**
 * Registers a new client user account with cryptographically salted password hashing.
 * Optionally links an existing license key or populates from inquiry/company data.
 */
export async function registerClientAccount(params: {
  username: string;
  password: string;
  email: string;
  displayName: string;
  companyName?: string;
  licenseKey?: string;
  initialPlan?: string;
  initialPlanTier?: PlanTier;
  availableKeys?: LicenseKeyRecord[];
}): Promise<{ success: boolean; account?: ClientUserAccount; error?: string }> {
  const check = isUsernameAvailable(params.username);
  if (!check.available) {
    return { success: false, error: check.reason };
  }

  if (!params.password || params.password.length < 6) {
    return { success: false, error: 'Password must be at least 6 characters for adequate security.' };
  }

  const cleanEmail = params.email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { success: false, error: 'Please enter a valid email address.' };
  }

  const salt = generateCryptographicSalt(16);
  const passwordHash = await computeClientPasswordHash(params.password, salt, params.username);

  // Automatically find matching license key by email if not explicitly provided
  let cleanKey = params.licenseKey?.trim().toUpperCase();
  let resolvedCompanyName = params.companyName?.trim();
  let planTier: PlanTier | undefined = params.initialPlanTier;
  let planName: string | undefined = params.initialPlan;
  let planStatus: 'ACTIVE' | 'NONE' = 'NONE';
  let planExpiresAt: string | undefined = undefined;
  let planPurchasedAt: string | undefined = undefined;
  let receiptQuota: number = -1; // Unlimited receipts on all plans

  if (!cleanKey) {
    const matchedRecord = await lookupLicenseByEmailAsync(cleanEmail, params.availableKeys);
    if (matchedRecord) {
      cleanKey = matchedRecord.key.toUpperCase();
      planTier = matchedRecord.plan;
      planName = getPlanLabel(matchedRecord.plan);
      planStatus = matchedRecord.status === 'ACTIVE' ? 'ACTIVE' : 'NONE';
      planExpiresAt = matchedRecord.expiresDate;
      planPurchasedAt = matchedRecord.issuedDate;
      receiptQuota = -1;
      if (!resolvedCompanyName && matchedRecord.clientName) {
        resolvedCompanyName = matchedRecord.clientName;
      }
    }
  } else if (params.availableKeys) {
    const found = params.availableKeys.find(k => k.key.toUpperCase() === cleanKey);
    if (found) {
      planTier = found.plan;
      planName = getPlanLabel(found.plan);
      planStatus = found.status === 'ACTIVE' ? 'ACTIVE' : 'NONE';
      planExpiresAt = found.expiresDate;
      planPurchasedAt = found.issuedDate;
      receiptQuota = -1;
    }
  }

  // If registering with a paid plan selection
  if (params.initialPlanTier && !cleanKey) {
    planTier = params.initialPlanTier;
    planName = params.initialPlan || getPlanLabel(params.initialPlanTier);
    planStatus = 'ACTIVE';
    planPurchasedAt = new Date().toISOString();
    planExpiresAt = calculateExpirationDate(planPurchasedAt, params.initialPlanTier);
    receiptQuota = -1;
  }

  const newAccount: ClientUserAccount = {
    id: 'usr_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7),
    username: params.username.trim().toLowerCase(),
    displayName: params.displayName.trim() || params.username.trim(),
    email: cleanEmail,
    companyName: resolvedCompanyName || undefined,
    licenseKey: cleanKey || undefined,
    plan: planName,
    planTier,
    planStatus,
    planPurchasedAt,
    planExpiresAt,
    receiptQuota,
    receiptsSubmittedCount: 0,
    passwordHash,
    salt,
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString()
  };

  const accounts = getStoredClientAccounts();
  accounts.push(newAccount);
  saveStoredClientAccounts(accounts);

  // Auto-login session
  const session: ClientAccountSession = {
    userId: newAccount.id,
    username: newAccount.username,
    displayName: newAccount.displayName,
    email: newAccount.email,
    companyName: newAccount.companyName,
    licenseKey: newAccount.licenseKey,
    plan: newAccount.plan,
    planTier: newAccount.planTier,
    planStatus: newAccount.planStatus,
    planPurchasedAt: newAccount.planPurchasedAt,
    planExpiresAt: newAccount.planExpiresAt,
    receiptQuota: newAccount.receiptQuota,
    receiptsSubmittedCount: newAccount.receiptsSubmittedCount,
    token: 'tk_' + generateCryptographicSalt(24),
    loggedInAt: new Date().toISOString()
  };
  saveClientSession(session);

  return { success: true, account: newAccount };
}

/**
 * Authenticates a client with username & password against salted hash.
 * Protected by client-side lockout after 5 consecutive failures.
 */
export async function authenticateClientAccount(
  usernameOrEmail: string,
  password: string
): Promise<{ success: boolean; session?: ClientAccountSession; error?: string }> {
  // Check lockout
  try {
    const lockUntil = parseInt(sessionStorage.getItem('client_login_lockout_until') || '0', 10);
    if (lockUntil > Date.now()) {
      const remaining = Math.ceil((lockUntil - Date.now()) / 1000);
      return { success: false, error: `Too many failed attempts. Account login locked for ${remaining}s.` };
    }
  } catch {}

  const clean = usernameOrEmail.trim().toLowerCase();
  const accounts = getStoredClientAccounts();

  const account = accounts.find(
    acc => acc.username.toLowerCase() === clean || acc.email.toLowerCase() === clean
  );

  const recordFailedClientAttempt = () => {
    try {
      const fails = parseInt(sessionStorage.getItem('client_login_fails') || '0', 10) + 1;
      sessionStorage.setItem('client_login_fails', String(fails));
      if (fails >= 5) {
        sessionStorage.setItem('client_login_lockout_until', String(Date.now() + 60000));
      }
    } catch {}
  };

  const clearFailedClientAttempts = () => {
    try {
      sessionStorage.removeItem('client_login_fails');
      sessionStorage.removeItem('client_login_lockout_until');
    } catch {}
  };

  if (!account) {
    recordFailedClientAttempt();
    return { success: false, error: 'Invalid username/email or password.' };
  }

  const computed = await computeClientPasswordHash(password, account.salt, account.username);
  if (computed !== account.passwordHash) {
    recordFailedClientAttempt();
    return { success: false, error: 'Invalid username/email or password.' };
  }

  clearFailedClientAttempts();

  // Update last login
  account.lastLoginAt = new Date().toISOString();
  saveStoredClientAccounts(accounts);

  const session: ClientAccountSession = {
    userId: account.id,
    username: account.username,
    displayName: account.displayName,
    email: account.email,
    companyName: account.companyName,
    licenseKey: account.licenseKey,
    plan: account.plan,
    planTier: account.planTier,
    planStatus: account.planStatus || (account.licenseKey ? 'ACTIVE' : 'NONE'),
    planPurchasedAt: account.planPurchasedAt,
    planExpiresAt: account.planExpiresAt,
    receiptQuota: account.receiptQuota,
    receiptsSubmittedCount: account.receiptsSubmittedCount || 0,
    token: 'tk_' + generateCryptographicSalt(24),
    loggedInAt: new Date().toISOString()
  };
  saveClientSession(session);

  return { success: true, session };
}

/**
 * Retrieves the currently active client session, if any.
 */
export function getCurrentClientSession(): ClientAccountSession | null {
  try {
    const raw = sessionStorage.getItem(CLIENT_CURRENT_SESSION_KEY) || localStorage.getItem(CLIENT_CURRENT_SESSION_KEY);
    if (raw) {
      const session = JSON.parse(raw);
      // All plans have unlimited receipts
      session.receiptQuota = -1;
      return session;
    }
  } catch {}
  return null;
}

export function saveClientSession(session: ClientAccountSession): void {
  try {
    const str = JSON.stringify(session);
    sessionStorage.setItem(CLIENT_CURRENT_SESSION_KEY, str);
    localStorage.setItem(CLIENT_CURRENT_SESSION_KEY, str);
  } catch {}
}

export function clearClientSession(): void {
  try {
    sessionStorage.removeItem(CLIENT_CURRENT_SESSION_KEY);
    localStorage.removeItem(CLIENT_CURRENT_SESSION_KEY);
  } catch {}
}

/**
 * Updates an account's license key, company, or details.
 */
export function updateClientAccountProfile(
  userId: string,
  updates: {
    displayName?: string;
    companyName?: string;
    licenseKey?: string | null;
  }
): { success: boolean; account?: ClientUserAccount } {
  const accounts = getStoredClientAccounts();
  const idx = accounts.findIndex(a => a.id === userId);
  if (idx === -1) return { success: false };

  if (updates.displayName !== undefined) {
    accounts[idx].displayName = updates.displayName.trim();
  }
  if (updates.companyName !== undefined) {
    accounts[idx].companyName = updates.companyName.trim() || undefined;
  }
  if (updates.licenseKey !== undefined) {
    accounts[idx].licenseKey = updates.licenseKey ? updates.licenseKey.trim().toUpperCase() : undefined;
  }

  saveStoredClientAccounts(accounts);

  // Update current session if matching
  const current = getCurrentClientSession();
  if (current && current.userId === userId) {
    current.displayName = accounts[idx].displayName;
    current.companyName = accounts[idx].companyName;
    current.licenseKey = accounts[idx].licenseKey;
    saveClientSession(current);
  }

  return { success: true, account: accounts[idx] };
}

/**
 * Completely deactivates and permanently deletes an account, optionally revoking/deleting
 * their license key and purging their company data in accordance with privacy laws.
 */
export function deleteClientAccountAndData(
  userId: string,
  options: {
    revokeLicenseKey?: boolean;
    licenseKeysList?: LicenseKeyRecord[];
    onLicenseRevoked?: (key: string) => void;
  }
): { success: boolean; revokedKey?: string } {
  const accounts = getStoredClientAccounts();
  const account = accounts.find(a => a.id === userId);
  if (!account) return { success: false };

  let revokedKey: string | undefined = undefined;

  // Revoke or deactivate license if requested
  if (options.revokeLicenseKey && account.licenseKey) {
    revokedKey = account.licenseKey;
    if (options.onLicenseRevoked) {
      options.onLicenseRevoked(account.licenseKey);
    }
  }

  // Remove the account
  const filtered = accounts.filter(a => a.id !== userId);
  saveStoredClientAccounts(filtered);

  // Clear session
  const current = getCurrentClientSession();
  if (current && current.userId === userId) {
    clearClientSession();
  }

  return { success: true, revokedKey };
}

/**
 * Purchases and immediately activates a bookkeeping plan for a client account.
 */
export function purchaseClientPlan(
  userId: string,
  params: {
    planTier: PlanTier;
    planName: string;
    receiptQuota?: number;
  }
): { success: boolean; session?: ClientAccountSession; error?: string } {
  const accounts = getStoredClientAccounts();
  const idx = accounts.findIndex(a => a.id === userId);
  if (idx === -1) {
    return { success: false, error: 'Client account not found.' };
  }

  const purchasedAt = new Date().toISOString();
  const expiresAt = calculateExpirationDate(purchasedAt, params.planTier);
  const quota = -1; // Unlimited receipt intake across all price plans

  accounts[idx].plan = params.planName;
  accounts[idx].planTier = params.planTier;
  accounts[idx].planStatus = 'ACTIVE';
  accounts[idx].planPurchasedAt = purchasedAt;
  accounts[idx].planExpiresAt = expiresAt;
  accounts[idx].receiptQuota = quota;

  saveStoredClientAccounts(accounts);

  // Update session
  const current = getCurrentClientSession();
  let updatedSession: ClientAccountSession;
  if (current && current.userId === userId) {
    updatedSession = {
      ...current,
      plan: accounts[idx].plan,
      planTier: accounts[idx].planTier,
      planStatus: 'ACTIVE',
      planPurchasedAt: accounts[idx].planPurchasedAt,
      planExpiresAt: accounts[idx].planExpiresAt,
      receiptQuota: accounts[idx].receiptQuota
    };
    saveClientSession(updatedSession);
  } else {
    updatedSession = {
      userId: accounts[idx].id,
      username: accounts[idx].username,
      displayName: accounts[idx].displayName,
      email: accounts[idx].email,
      companyName: accounts[idx].companyName,
      licenseKey: accounts[idx].licenseKey,
      plan: accounts[idx].plan,
      planTier: accounts[idx].planTier,
      planStatus: accounts[idx].planStatus,
      planPurchasedAt: accounts[idx].planPurchasedAt,
      planExpiresAt: accounts[idx].planExpiresAt,
      receiptQuota: accounts[idx].receiptQuota,
      receiptsSubmittedCount: accounts[idx].receiptsSubmittedCount || 0,
      token: 'tk_' + generateCryptographicSalt(24),
      loggedInAt: new Date().toISOString()
    };
    saveClientSession(updatedSession);
  }

  return { success: true, session: updatedSession };
}

/**
 * Activates a client license key or voucher, unlocking an active plan on the account.
 */
export function activateClientLicenseKey(
  userId: string,
  keyStr: string,
  availableKeys?: LicenseKeyRecord[]
): { success: boolean; session?: ClientAccountSession; error?: string } {
  const cleanKey = keyStr.trim().toUpperCase();
  if (!cleanKey) {
    return { success: false, error: 'Please enter a valid license key or voucher code.' };
  }

  const accounts = getStoredClientAccounts();
  const idx = accounts.findIndex(a => a.id === userId);
  if (idx === -1) {
    return { success: false, error: 'Account not found.' };
  }

  // Find record in availableKeys or localStorage
  let matchedRecord = availableKeys?.find(k => k.key.toUpperCase() === cleanKey);
  if (!matchedRecord) {
    try {
      const raw = localStorage.getItem('receipt_processor_keys_v4') || localStorage.getItem('receipt_processor_keys_v3');
      if (raw) {
        const keys: LicenseKeyRecord[] = JSON.parse(raw);
        matchedRecord = keys.find(k => k.key.toUpperCase() === cleanKey);
      }
    } catch {}
  }

  let planTier: PlanTier = 'MONTHLY';
  let planName = 'Monthly Bookkeeping';
  let planExpires = 'Never (Lifetime / Non-Expiring)';
  let quota = -1; // Unlimited receipts across all plans

  if (cleanKey.startsWith('ADMIN-')) {
    planTier = 'ADMIN';
    planName = 'Admin Master (Never Expires)';
    planExpires = 'Never (Lifetime / Non-Expiring)';
  } else if (cleanKey.startsWith('ANNUAL-')) {
    planTier = 'ANNUAL';
    planName = 'Annual Farm & Business Package';
    planExpires = calculateExpirationDate(new Date().toISOString(), 'ANNUAL');
  } else if (cleanKey.startsWith('3MONTH-') || cleanKey.startsWith('PRO-')) {
    planTier = '3MONTH';
    planName = 'Quarterly Tax & Expense Prep';
    planExpires = calculateExpirationDate(new Date().toISOString(), '3MONTH');
  } else if (cleanKey.startsWith('6MONTH-')) {
    planTier = '6MONTH';
    planName = 'Semi-Annual Bookkeeping';
    planExpires = calculateExpirationDate(new Date().toISOString(), '6MONTH');
  } else if (cleanKey.startsWith('DEMO-')) {
    planTier = 'DEMO';
    planName = 'Trial Demo (7 Days)';
    planExpires = calculateExpirationDate(new Date().toISOString(), 'DEMO');
  } else {
    planTier = 'MONTHLY';
    planName = 'Monthly Bookkeeping';
    planExpires = calculateExpirationDate(new Date().toISOString(), 'MONTHLY');
  }

  if (matchedRecord) {
    planTier = matchedRecord.plan;
    planName = getPlanLabel(matchedRecord.plan);
    planExpires = matchedRecord.expiresDate;
  }

  accounts[idx].licenseKey = cleanKey;
  accounts[idx].plan = planName;
  accounts[idx].planTier = planTier;
  accounts[idx].planStatus = 'ACTIVE';
  accounts[idx].planPurchasedAt = new Date().toISOString();
  accounts[idx].planExpiresAt = planExpires;
  accounts[idx].receiptQuota = quota;

  saveStoredClientAccounts(accounts);

  const current = getCurrentClientSession();
  let updatedSession: ClientAccountSession;
  if (current && current.userId === userId) {
    updatedSession = {
      ...current,
      licenseKey: cleanKey,
      plan: accounts[idx].plan,
      planTier: accounts[idx].planTier,
      planStatus: 'ACTIVE',
      planPurchasedAt: accounts[idx].planPurchasedAt,
      planExpiresAt: accounts[idx].planExpiresAt,
      receiptQuota: accounts[idx].receiptQuota
    };
    saveClientSession(updatedSession);
  } else {
    updatedSession = {
      userId: accounts[idx].id,
      username: accounts[idx].username,
      displayName: accounts[idx].displayName,
      email: accounts[idx].email,
      companyName: accounts[idx].companyName,
      licenseKey: cleanKey,
      plan: accounts[idx].plan,
      planTier: accounts[idx].planTier,
      planStatus: 'ACTIVE',
      planPurchasedAt: accounts[idx].planPurchasedAt,
      planExpiresAt: accounts[idx].planExpiresAt,
      receiptQuota: accounts[idx].receiptQuota,
      receiptsSubmittedCount: accounts[idx].receiptsSubmittedCount || 0,
      token: 'tk_' + generateCryptographicSalt(24),
      loggedInAt: new Date().toISOString()
    };
    saveClientSession(updatedSession);
  }

  return { success: true, session: updatedSession };
}

/**
 * Increments submitted receipt count for quota tracking.
 */
export function recordReceiptSubmitted(userId: string, count: number = 1): void {
  const accounts = getStoredClientAccounts();
  const idx = accounts.findIndex(a => a.id === userId);
  if (idx !== -1) {
    accounts[idx].receiptsSubmittedCount = (accounts[idx].receiptsSubmittedCount || 0) + count;
    saveStoredClientAccounts(accounts);

    const current = getCurrentClientSession();
    if (current && current.userId === userId) {
      current.receiptsSubmittedCount = accounts[idx].receiptsSubmittedCount;
      saveClientSession(current);
    }
  }
}

/**
 * Operator / Accountant action: directly grant or change a client's plan.
 */
export function grantPlanByAdmin(
  userId: string,
  planTier: PlanTier,
  planName: string,
  expiresDate?: string
): { success: boolean; account?: ClientUserAccount } {
  const accounts = getStoredClientAccounts();
  const idx = accounts.findIndex(a => a.id === userId);
  if (idx === -1) return { success: false };

  const purchasedAt = new Date().toISOString();
  const exp = expiresDate || calculateExpirationDate(purchasedAt, planTier);
  const quota = -1; // Unlimited receipts across all plans

  accounts[idx].plan = planName;
  accounts[idx].planTier = planTier;
  accounts[idx].planStatus = 'ACTIVE';
  accounts[idx].planPurchasedAt = purchasedAt;
  accounts[idx].planExpiresAt = exp;
  accounts[idx].receiptQuota = quota;

  saveStoredClientAccounts(accounts);

  const current = getCurrentClientSession();
  if (current && current.userId === userId) {
    current.plan = planName;
    current.planTier = planTier;
    current.planStatus = 'ACTIVE';
    current.planPurchasedAt = purchasedAt;
    current.planExpiresAt = exp;
    current.receiptQuota = quota;
    saveClientSession(current);
  }

  return { success: true, account: accounts[idx] };
}
