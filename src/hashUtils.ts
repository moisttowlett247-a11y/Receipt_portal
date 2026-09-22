/**
 * Cryptographic helper to compute SHA-256 hash in browser
 */
export async function computeSha256Hex(text: string): Promise<string> {
  const clean = text.trim().toUpperCase();
  const encoder = new TextEncoder();
  const data = encoder.encode(clean);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Computes salted SHA-256 hash of administrative credentials
 */
export async function computeCredentialsHash(user: string, pass: string): Promise<string> {
  const cleanUser = user.trim().toLowerCase();
  const cleanPass = pass.trim();
  const encoder = new TextEncoder();
  const data = encoder.encode(`receipt_processor_admin_salt_v2_${cleanUser}_::_${cleanPass}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generates a random cryptographic salt for individual client user accounts
 */
export function generateCryptographicSalt(bytes: number = 16): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/**
 * Computes securely salted hash for Client Portal accounts
 */
export async function computeClientPasswordHash(password: string, salt: string, username: string): Promise<string> {
  const cleanPass = password.trim();
  const cleanUser = username.trim().toLowerCase();
  const encoder = new TextEncoder();
  const payload = `client_portal_account_salt_${salt}_usr_${cleanUser}__pwd_${cleanPass}`;
  const data = encoder.encode(payload);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export interface LicenseHashPayload {
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  plan: string;
  expires: string;
  issued: string;
  hwid?: string | null;
}
