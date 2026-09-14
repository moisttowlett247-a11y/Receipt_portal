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

export interface LicenseHashPayload {
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  plan: string;
  expires: string;
  issued: string;
  hwid?: string | null;
}
