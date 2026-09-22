import { ClientUserAccount, ClientAccountSession, LicenseKeyRecord } from './types';
import { computeClientPasswordHash, generateCryptographicSalt } from './hashUtils';

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

  const cleanKey = params.licenseKey?.trim().toUpperCase();

  const newAccount: ClientUserAccount = {
    id: 'usr_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7),
    username: params.username.trim().toLowerCase(),
    displayName: params.displayName.trim() || params.username.trim(),
    email: cleanEmail,
    companyName: params.companyName?.trim() || undefined,
    licenseKey: cleanKey || undefined,
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
      return JSON.parse(raw);
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
