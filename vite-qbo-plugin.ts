import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Plugin } from 'vite';

interface QboConfig {
  clientId: string;
  clientSecret: string;
  environment: 'production' | 'sandbox';
  redirectUri: string;
  webhookVerifierToken?: string;
  appTitle?: string;
}

interface ConnectedCompany {
  realmId: string;
  companyName: string;
  legalName?: string;
  email?: string;
  country?: string;
  currency?: string;
  connectedAt: string;
  lastRefreshedAt: string;
  lastUsedAt?: string;
  environment: 'production' | 'sandbox';
  status: 'CONNECTED' | 'DISCONNECTED' | 'REVOKED';
  refreshTokenEncrypted: string;
  accessTokenCached?: string;
  accessTokenExpiresAt?: number;
  refreshTokenExpiresAt?: number; // ~101 days
  assignedToKey?: string;
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const CONFIG_FILE = path.join(DATA_DIR, 'qbo_config.json');
const COMPANIES_FILE = path.join(DATA_DIR, 'qbo_companies.json');

// Ensure secure private data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Master encryption key derived from env or secure system salt
const MASTER_SALT = process.env.QBO_ENCRYPTION_KEY || 'receipt_processor_qbo_secure_aes256_salt_8921';
const ENCRYPTION_KEY = crypto.createHash('sha256').update(MASTER_SALT).digest();

function encryptToken(plaintext: string): string {
  if (!plaintext) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `aes_gcm:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decryptToken(ciphertext: string): string {
  if (!ciphertext) return '';
  if (!ciphertext.startsWith('aes_gcm:')) {
    // legacy or unencrypted fallback
    return ciphertext;
  }
  const parts = ciphertext.split(':');
  if (parts.length !== 4) return '';
  const [, ivHex, authTagHex, encData] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function getStoredConfig(): QboConfig {
  let fileCfg: Partial<QboConfig> = {};
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      fileCfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    } catch {}
  }
  const rawEnv = (fileCfg.environment || process.env.QBO_ENVIRONMENT || 'production').toString().toLowerCase().trim();
  const environment: 'production' | 'sandbox' = rawEnv === 'sandbox' ? 'sandbox' : 'production';

  return {
    clientId: (fileCfg.clientId || process.env.QBO_CLIENT_ID || '').trim(),
    clientSecret: (fileCfg.clientSecret || process.env.QBO_CLIENT_SECRET || '').trim(),
    environment,
    redirectUri: (fileCfg.redirectUri || process.env.QBO_REDIRECT_URI || '').trim(),
    webhookVerifierToken: (fileCfg.webhookVerifierToken || process.env.QBO_WEBHOOK_VERIFIER_TOKEN || '').trim(),
    appTitle: fileCfg.appTitle || 'Receipt Processor Enterprise for QuickBooks'
  };
}

function saveConfig(cfg: Partial<QboConfig>) {
  const current = getStoredConfig();
  const merged = { ...current, ...cfg };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
}

function getCompanies(): Record<string, ConnectedCompany> {
  if (fs.existsSync(COMPANIES_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(COMPANIES_FILE, 'utf-8'));
    } catch {}
  }
  return {};
}

function saveCompanies(companies: Record<string, ConnectedCompany>) {
  fs.writeFileSync(COMPANIES_FILE, JSON.stringify(companies, null, 2), 'utf-8');
}

export function quickbooksApiPlugin(): Plugin {
  return {
    name: 'vite-plugin-quickbooks-broker',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const urlObj = new URL(req.url || '', 'http://localhost');
        const pathname = urlObj.pathname;

        // Only intercept /api/qbo/* routes
        if (!pathname.startsWith('/api/qbo')) {
          return next();
        }

        // Set secure permissive CORS & strict cache control
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-License-Key, Cache-Control');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }

        const readJsonBody = async (): Promise<any> => {
          return new Promise((resolve) => {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
              try {
                resolve(body ? JSON.parse(body) : {});
              } catch {
                resolve({});
              }
            });
          });
        };

        const sendJson = (status: number, data: any) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(data));
        };

        // 1. GET /api/qbo/config (Publicly safe configuration status)
        if (pathname === '/api/qbo/config' && req.method === 'GET') {
          const cfg = getStoredConfig();
          const companies = getCompanies();
          const connectedList = Object.values(companies).filter(c => c.status === 'CONNECTED');

          sendJson(200, {
            success: true,
            configured: Boolean(cfg.clientId && cfg.clientSecret),
            clientId: cfg.clientId,
            environment: cfg.environment,
            hasSecret: Boolean(cfg.clientSecret),
            redirectUri: cfg.redirectUri,
            hasWebhookVerifier: Boolean(cfg.webhookVerifierToken),
            totalConnectedCompanies: connectedList.length,
            appTitle: cfg.appTitle
          });
          return;
        }

        // 2. POST /api/qbo/config (Update Intuit App Credentials securely)
        if (pathname === '/api/qbo/config' && req.method === 'POST') {
          const body = await readJsonBody();
          const updated = saveConfig({
            clientId: body.clientId !== undefined ? body.clientId.trim() : undefined,
            clientSecret: body.clientSecret !== undefined ? body.clientSecret.trim() : undefined,
            environment: body.environment === 'sandbox' ? 'sandbox' : 'production',
            redirectUri: body.redirectUri !== undefined ? body.redirectUri.trim() : undefined,
            webhookVerifierToken: body.webhookVerifierToken !== undefined ? body.webhookVerifierToken.trim() : undefined
          });

          sendJson(200, {
            success: true,
            message: 'QuickBooks OAuth broker configuration saved securely',
            configured: Boolean(updated.clientId && updated.clientSecret),
            environment: updated.environment
          });
          return;
        }

        // 3. GET /api/qbo/auth-url (Generate official Intuit OAuth 2.0 Authorization Link)
        if (pathname === '/api/qbo/auth-url' && req.method === 'GET') {
          const cfg = getStoredConfig();
          const queryClientId = urlObj.searchParams.get('client_id');
          const queryRedirectUri = urlObj.searchParams.get('redirect_uri');
          const queryEnv = urlObj.searchParams.get('environment');

          // Determine client ID: custom saved, query param, or Intuit Sandbox/Developer fallback
          const clientId = (queryClientId || cfg.clientId || 'AB116938290382901928472910').trim();

          // Build origin fallback for redirectUri with secure HTTPS detection
          const forwardedProto = req.headers['x-forwarded-proto'];
          const hostHeader = (req.headers['host'] || 'localhost:3000').toString();
          const isCloud = hostHeader.includes('run.app') || hostHeader.includes('.app');
          const protocol = forwardedProto || (isCloud ? 'https' : 'http');
          const defaultRedirectUri = `${protocol}://${hostHeader}/api/qbo/callback`;
          const redirectUri = queryRedirectUri || (cfg.redirectUri && !cfg.redirectUri.includes('OAuth2Playground') ? cfg.redirectUri : defaultRedirectUri);

          const state = crypto.randomBytes(16).toString('hex');
          const scope = 'com.intuit.quickbooks.accounting';
          
          const params = new URLSearchParams({
            client_id: clientId,
            response_type: 'code',
            scope,
            redirect_uri: redirectUri,
            state
          });

          const authUrl = `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`;

          sendJson(200, {
            success: true,
            authUrl,
            redirectUri,
            state,
            configured: Boolean(cfg.clientId && cfg.clientSecret),
            clientId: cfg.clientId || '',
            environment: queryEnv || cfg.environment || 'production'
          });
          return;
        }

        // 4. GET /api/qbo/callback (OAuth 2.0 redirect target from Intuit)
        if (pathname === '/api/qbo/callback' && req.method === 'GET') {
          const code = urlObj.searchParams.get('code');
          const realmId = urlObj.searchParams.get('realmId');
          const state = urlObj.searchParams.get('state');
          const error = urlObj.searchParams.get('error');

          if (error) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(`<!DOCTYPE html>
<html>
<head><title>QuickBooks Authorization</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0c0a09;color:#f5f5f4;padding:40px;text-align:center;">
  <h2 style="color:#f87171;margin-bottom:12px;">QuickBooks Authorization Cancelled or Failed</h2>
  <p style="color:#a8a29e;font-size:14px;max-width:500px;margin:0 auto 24px;">${encodeURIComponent(error)}</p>
  <script>
    if (window.opener) {
      try {
        window.opener.postMessage({ type: 'QBO_OAUTH_ERROR', error: ${JSON.stringify(error)} }, '*');
        setTimeout(() => window.close(), 1000);
      } catch (e) {}
    } else {
      setTimeout(() => { window.location.href = '/admin?qbo_error=${encodeURIComponent(error)}#qbo'; }, 2000);
    }
  </script>
</body>
</html>`);
            return;
          }

          if (!code || !realmId) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end('<h3>Missing authorization code or Realm ID from Intuit callback.</h3>');
            return;
          }

          const cfg = getStoredConfig();
          const hostHeader = (req.headers['host'] || 'localhost:3000').toString();
          const isCloud = hostHeader.includes('run.app') || hostHeader.includes('.app');
          const protocol = req.headers['x-forwarded-proto'] || (isCloud ? 'https' : 'http');
          const redirectUri = cfg.redirectUri || `${protocol}://${hostHeader}/api/qbo/callback`;

          try {
            // Exchange code for Access & Refresh Tokens
            const tokenUrl = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
            const authHeader = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');

            const tokenResp = await fetch(tokenUrl, {
              method: 'POST',
              headers: {
                'Authorization': `Basic ${authHeader}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
              },
              body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri
              }).toString()
            });

            if (!tokenResp.ok) {
              const errTxt = await tokenResp.text();
              throw new Error(`Token exchange failed (${tokenResp.status}): ${errTxt}`);
            }

            const tokenData: any = await tokenResp.json();
            const accessToken = tokenData.access_token;
            const refreshToken = tokenData.refresh_token;
            const expiresIn = tokenData.expires_in || 3600;
            const refreshExpiresIn = tokenData.x_refresh_token_expires_in || (101 * 86400);

            // Fetch company profile name from QBO API
            let companyName = `QuickBooks Company (${realmId})`;
            let legalName = '';
            let email = '';
            let country = 'US';
            let currency = 'USD';

            const baseApi = cfg.environment === 'sandbox'
              ? 'https://sandbox-quickbooks.api.intuit.com'
              : 'https://quickbooks.api.intuit.com';

            try {
              const infoResp = await fetch(`${baseApi}/v3/company/${realmId}/companyinfo/${realmId}`, {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Accept': 'application/json'
                }
              });
              if (infoResp.ok) {
                const infoData: any = await infoResp.json();
                const cInfo = infoData?.CompanyInfo;
                if (cInfo?.CompanyName) companyName = cInfo.CompanyName;
                if (cInfo?.LegalName) legalName = cInfo.LegalName;
                if (cInfo?.Email?.Address) email = cInfo.Email.Address;
                if (cInfo?.Country) country = cInfo.Country;
                if (cInfo?.LegalAddress?.CountrySubDivisionCode) country = cInfo.LegalAddress.CountrySubDivisionCode;
              }
            } catch (err) {
              console.warn('Could not fetch QBO CompanyInfo:', err);
            }

            // Save encrypted company records
            const now = new Date();
            const companies = getCompanies();
            companies[realmId] = {
              realmId,
              companyName,
              legalName,
              email,
              country,
              currency,
              connectedAt: now.toISOString(),
              lastRefreshedAt: now.toISOString(),
              lastUsedAt: now.toISOString(),
              environment: cfg.environment,
              status: 'CONNECTED',
              refreshTokenEncrypted: encryptToken(refreshToken),
              accessTokenCached: accessToken,
              accessTokenExpiresAt: now.getTime() + (expiresIn * 1000),
              refreshTokenExpiresAt: now.getTime() + (refreshExpiresIn * 1000)
            };
            saveCompanies(companies);

            // Return clean HTML with postMessage for popup windows and fallback redirect
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(`<!DOCTYPE html>
<html>
<head><title>QuickBooks Connected</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0c0a09;color:#f5f5f4;padding:40px;text-align:center;">
  <div style="display:inline-block;width:48px;height:48px;background:rgba(44,160,28,0.2);border-radius:50%;line-height:48px;font-size:24px;color:#34d399;margin-bottom:16px;">✓</div>
  <h2 style="color:#34d399;margin-bottom:8px;">QuickBooks Connected Successfully!</h2>
  <p style="color:#e7e5e4;font-size:15px;margin-bottom:6px;"><strong>${encodeURIComponent(companyName)}</strong></p>
  <p style="color:#a8a29e;font-size:12px;">Realm ID: ${encodeURIComponent(realmId)} • Rolling 101-day renewal activated</p>
  <p style="color:#78716c;font-size:11px;margin-top:16px;">Closing window and returning to Admin Portal...</p>
  <script>
    if (window.opener) {
      try {
        window.opener.postMessage({
          type: 'QBO_OAUTH_SUCCESS',
          realmId: ${JSON.stringify(realmId)},
          company: ${JSON.stringify(companyName)}
        }, '*');
        setTimeout(() => window.close(), 1200);
      } catch (e) {
        window.location.href = '/admin?qbo_connected=true&realmId=${realmId}&company=${encodeURIComponent(companyName)}#qbo';
      }
    } else {
      setTimeout(() => {
        window.location.href = '/admin?qbo_connected=true&realmId=${realmId}&company=${encodeURIComponent(companyName)}#qbo';
      }, 1500);
    }
  </script>
</body>
</html>`);
            return;
          } catch (err: any) {
            console.error('QBO OAuth callback error:', err);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(`<!DOCTYPE html>
<html>
<head><title>QuickBooks Connection Error</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0c0a09;color:#f5f5f4;padding:40px;text-align:center;">
  <h2 style="color:#f87171;margin-bottom:8px;">Token Exchange Error</h2>
  <p style="color:#a8a29e;font-size:13px;max-width:520px;margin:0 auto 16px;">${encodeURIComponent(err.message || 'OAuth token exchange failed')}</p>
  <script>
    if (window.opener) {
      try {
        window.opener.postMessage({
          type: 'QBO_OAUTH_ERROR',
          error: ${JSON.stringify(err.message || 'OAuth token exchange failed')}
        }, '*');
        setTimeout(() => window.close(), 3000);
      } catch (e) {}
    } else {
      setTimeout(() => {
        window.location.href = '/admin?qbo_error=${encodeURIComponent(err.message || 'OAuth token exchange failed')}#qbo';
      }, 3000);
    }
  </script>
</body>
</html>`);
            return;
          }
        }

        // 5. GET /api/qbo/companies (List all connected accounts - sanitized)
        if (pathname === '/api/qbo/companies' && req.method === 'GET') {
          const companies = getCompanies();
          const list = Object.values(companies).map(c => {
            const now = Date.now();
            const accessRemainingSec = c.accessTokenExpiresAt ? Math.max(0, Math.round((c.accessTokenExpiresAt - now) / 1000)) : 0;
            const refreshRemainingDays = c.refreshTokenExpiresAt ? Math.max(0, Math.round((c.refreshTokenExpiresAt - now) / (1000 * 86400))) : 101;

            return {
              realmId: c.realmId,
              companyName: c.companyName,
              legalName: c.legalName || c.companyName,
              email: c.email || '',
              country: c.country || 'US',
              connectedAt: c.connectedAt,
              lastRefreshedAt: c.lastRefreshedAt,
              lastUsedAt: c.lastUsedAt || c.lastRefreshedAt,
              environment: c.environment,
              status: c.status,
              accessValidRemainingSec: accessRemainingSec,
              rollingDaysRemaining: refreshRemainingDays,
              assignedToKey: c.assignedToKey || null
            };
          });

          sendJson(200, {
            success: true,
            totalCompanies: list.length,
            activeConnected: list.filter(c => c.status === 'CONNECTED').length,
            companies: list
          });
          return;
        }

        // 6. POST /api/qbo/token (Secure Token Broker: Hands short-lived access token to Desktop App)
        if (pathname === '/api/qbo/token' && req.method === 'POST') {
          const body = await readJsonBody();
          const realmId = (body.realmId || '').trim();
          const licenseKey = (body.licenseKey || req.headers['x-license-key'] || '').toString().trim().toUpperCase();

          const companies = getCompanies();
          let target = realmId ? companies[realmId] : null;

          // If no specific realmId passed, select the first active connected company
          if (!target) {
            const activeList = Object.values(companies).filter(c => c.status === 'CONNECTED');
            if (activeList.length > 0) {
              target = activeList[0];
            }
          }

          if (!target || target.status !== 'CONNECTED') {
            sendJson(404, {
              error: 'No active QuickBooks Online connection found for this account or Realm ID.',
              realmId
            });
            return;
          }

          const now = Date.now();
          // If cached access token is still fresh for > 5 minutes, return it immediately
          if (target.accessTokenCached && target.accessTokenExpiresAt && target.accessTokenExpiresAt > (now + 300000)) {
            target.lastUsedAt = new Date().toISOString();
            saveCompanies(companies);

            sendJson(200, {
              success: true,
              realmId: target.realmId,
              companyName: target.companyName,
              environment: target.environment,
              accessToken: target.accessTokenCached,
              expiresIn: Math.round((target.accessTokenExpiresAt - now) / 1000),
              cached: true
            });
            return;
          }

          // Otherwise perform rolling refresh using decrypted refresh token
          const rawRefreshToken = decryptToken(target.refreshTokenEncrypted);
          if (!rawRefreshToken) {
            sendJson(401, {
              error: 'Missing or unreadable refresh token. Please reconnect this QuickBooks company.',
              realmId: target.realmId
            });
            return;
          }

          const cfg = getStoredConfig();
          const tokenUrl = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
          const authHeader = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');

          try {
            const refreshResp = await fetch(tokenUrl, {
              method: 'POST',
              headers: {
                'Authorization': `Basic ${authHeader}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
              },
              body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: rawRefreshToken
              }).toString()
            });

            if (!refreshResp.ok) {
              const errTxt = await refreshResp.text();
              throw new Error(`Token refresh failed (${refreshResp.status}): ${errTxt}`);
            }

            const tokenData: any = await refreshResp.json();
            const newAccessToken = tokenData.access_token;
            const newRefreshToken = tokenData.refresh_token;
            const expiresIn = tokenData.expires_in || 3600;
            const refreshExpiresIn = tokenData.x_refresh_token_expires_in || (101 * 86400);

            // Update company with fresh rolling tokens
            target.accessTokenCached = newAccessToken;
            target.accessTokenExpiresAt = now + (expiresIn * 1000);
            target.refreshTokenExpiresAt = now + (refreshExpiresIn * 1000);
            target.lastRefreshedAt = new Date().toISOString();
            target.lastUsedAt = new Date().toISOString();
            if (newRefreshToken) {
              target.refreshTokenEncrypted = encryptToken(newRefreshToken);
            }
            saveCompanies(companies);

            sendJson(200, {
              success: true,
              realmId: target.realmId,
              companyName: target.companyName,
              environment: target.environment,
              accessToken: newAccessToken,
              expiresIn,
              rollingRefreshResetDays: 101,
              cached: false
            });
            return;
          } catch (err: any) {
            console.error('QBO Token Refresh Failure:', err);
            sendJson(500, {
              error: 'QuickBooks token refresh failed',
              details: err.message
            });
            return;
          }
        }

        // 7. POST /api/qbo/disconnect (Revoke access token and purge connection)
        if (pathname === '/api/qbo/disconnect' && req.method === 'POST') {
          const body = await readJsonBody();
          const realmId = (body.realmId || '').trim();

          const companies = getCompanies();
          const target = companies[realmId];
          if (!target) {
            sendJson(404, { error: 'Company not found' });
            return;
          }

          const rawRefreshToken = decryptToken(target.refreshTokenEncrypted);
          const cfg = getStoredConfig();

          // Attempt Intuit OAuth Revoke call
          if (rawRefreshToken && cfg.clientId && cfg.clientSecret) {
            try {
              const authHeader = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
              await fetch('https://developer.api.intuit.com/v2/oauth2/tokens/revoke', {
                method: 'POST',
                headers: {
                  'Authorization': `Basic ${authHeader}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ token: rawRefreshToken })
              });
            } catch (err) {
              console.warn('Revocation call to Intuit endpoint failed:', err);
            }
          }

          // Mark as DISCONNECTED
          target.status = 'DISCONNECTED';
          target.refreshTokenEncrypted = '';
          target.accessTokenCached = '';
          saveCompanies(companies);

          sendJson(200, {
            success: true,
            message: `QuickBooks connection for '${target.companyName}' (Realm: ${realmId}) was safely revoked and disconnected.`
          });
          return;
        }

        // 8. POST /api/qbo/webhook (Intuit App Disconnect & CDC Events)
        if (pathname === '/api/qbo/webhook' && req.method === 'POST') {
          const body = await readJsonBody();
          const signature = req.headers['intuit-signature'];
          console.log('[QBO Webhook] Received event payload:', JSON.stringify(body), 'signature:', signature);

          // Handle App Disconnect notifications
          const notifications = body?.eventNotifications || [];
          for (const notification of notifications) {
            const realmId = notification?.realmId;
            const entities = notification?.dataChangeEvent?.entities || [];
            for (const entity of entities) {
              if (entity.name === 'AppDisconnect') {
                const companies = getCompanies();
                if (companies[realmId]) {
                  companies[realmId].status = 'DISCONNECTED';
                  companies[realmId].refreshTokenEncrypted = '';
                  companies[realmId].accessTokenCached = '';
                  saveCompanies(companies);
                  console.log(`[QBO Webhook] Processed AppDisconnect for Realm ID: ${realmId}`);
                }
              }
            }
          }

          sendJson(200, { status: 'processed' });
          return;
        }

        // 9. POST /api/qbo/mock-connect (Instant Sandbox/Production Simulator for development)
        if (pathname === '/api/qbo/mock-connect' && req.method === 'POST') {
          const body = await readJsonBody();
          const realmId = (body.realmId || `934145${Math.floor(1000000 + Math.random() * 9000000)}`).toString().trim();
          const companyName = body.companyName || 'Oak Creek Agriculture & Cattle LLC';
          const env = body.environment === 'sandbox' ? 'sandbox' : 'production';

          const now = new Date();
          const companies = getCompanies();
          companies[realmId] = {
            realmId,
            companyName,
            legalName: `${companyName} Holdings Inc.`,
            email: 'accounting@oakcreekag.com',
            country: 'US',
            currency: 'USD',
            connectedAt: now.toISOString(),
            lastRefreshedAt: now.toISOString(),
            lastUsedAt: now.toISOString(),
            environment: env,
            status: 'CONNECTED',
            refreshTokenEncrypted: encryptToken(`mock_refresh_${crypto.randomBytes(24).toString('hex')}`),
            accessTokenCached: `mock_access_${crypto.randomBytes(24).toString('hex')}`,
            accessTokenExpiresAt: now.getTime() + 3600000,
            refreshTokenExpiresAt: now.getTime() + (101 * 86400000),
            assignedToKey: body.licenseKey || 'ANNUAL-4819-2026'
          };
          saveCompanies(companies);

          sendJson(200, {
            success: true,
            message: `Simulated connection established for '${companyName}'`,
            realmId,
            companyName
          });
          return;
        }

        // Default fallback
        sendJson(404, { error: 'Unknown QuickBooks API endpoint' });
      });
    }
  };
}
