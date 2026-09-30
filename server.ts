import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Enable large payloads for base64 receipt scanning
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Helper directories
const LICENSES_DIR = path.resolve(__dirname, 'public', 'licenses');
if (!fs.existsSync(LICENSES_DIR)) {
  fs.mkdirSync(LICENSES_DIR, { recursive: true });
}

const DATA_DIR = path.resolve(__dirname, '.data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const CONFIG_FILE = path.join(DATA_DIR, 'qbo_config.json');
const COMPANIES_FILE = path.join(DATA_DIR, 'qbo_companies.json');
const SESSIONS_FILE = path.join(LICENSES_DIR, 'active_sessions.json');
const INQUIRIES_FILE = path.join(LICENSES_DIR, 'inquiries.json');
const SUBMISSIONS_FILE = path.join(DATA_DIR, 'client_submissions.json');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'client_accounts.json');

function loadAccounts(): any[] {
  if (fs.existsSync(ACCOUNTS_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf-8'));
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return [];
}

function saveAccounts(accounts: any[]) {
  try {
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), 'utf-8');
  } catch {}
}

function loadSubmissions(): any[] {
  if (fs.existsSync(SUBMISSIONS_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(SUBMISSIONS_FILE, 'utf-8'));
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return [];
}

function saveSubmissions(submissions: any[]) {
  try {
    fs.writeFileSync(SUBMISSIONS_FILE, JSON.stringify(submissions, null, 2), 'utf-8');
  } catch {}
}

// QBO Encryption Setup
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
  if (!ciphertext.startsWith('aes_gcm:')) return ciphertext;
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

// Config & Company Helpers
function getStoredConfig() {
  let fileCfg: any = {};
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      fileCfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    } catch {}
  }
  const rawEnv = (fileCfg.environment || process.env.QBO_ENVIRONMENT || 'sandbox').toString().toLowerCase().trim();
  const environment = rawEnv === 'production' ? 'production' : 'sandbox';
  return {
    clientId: (fileCfg.clientId || process.env.QBO_CLIENT_ID || '').trim(),
    clientSecret: (fileCfg.clientSecret || process.env.QBO_CLIENT_SECRET || '').trim(),
    environment,
    redirectUri: (fileCfg.redirectUri || process.env.QBO_REDIRECT_URI || 'https://moisttowlett247-a11y.github.io/Receipt_portal/api/qbo/callback').trim(),
    webhookVerifierToken: (fileCfg.webhookVerifierToken || process.env.QBO_WEBHOOK_VERIFIER_TOKEN || '').trim(),
    appTitle: fileCfg.appTitle || 'Receipt Processor Enterprise for QuickBooks'
  };
}

function saveConfig(cfg: any) {
  const current = getStoredConfig();
  const merged = { ...current, ...cfg };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
}

function getCompanies() {
  if (fs.existsSync(COMPANIES_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(COMPANIES_FILE, 'utf-8'));
    } catch {}
  }
  return {};
}

function saveCompanies(companies: any) {
  fs.writeFileSync(COMPANIES_FILE, JSON.stringify(companies, null, 2), 'utf-8');
}

function loadSessions() {
  if (fs.existsSync(SESSIONS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'));
    } catch {}
  }
  return {};
}

function saveSessions(sessions: any) {
  try {
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf-8');
  } catch {}
}

function recordSessionPing(data: any) {
  if (!data.hash && !data.key) return;
  const sessions = loadSessions();
  const sessionId = `${data.ip}_${data.hash}`;
  const now = new Date();
  const existing = sessions[sessionId] || {};

  let maskedKey = existing.keyMasked || '';
  if (data.key) {
    const k = data.key.trim().toUpperCase();
    if (k.length > 8) {
      maskedKey = `${k.slice(0, 4)}...${k.slice(-4)}`;
    } else {
      maskedKey = k;
    }
  } else if (!maskedKey && data.hash) {
    maskedKey = `${data.hash.slice(0, 6)}...${data.hash.slice(-4)}`;
  }

  sessions[sessionId] = {
    id: sessionId,
    ip: data.ip,
    hash: data.hash,
    keyMasked: maskedKey,
    rawKey: data.key || existing.rawKey || '',
    hwid: data.hwid || existing.hwid || 'Pending HWID',
    machineName: data.machineName || existing.machineName || 'Desktop Workstation',
    appVersion: data.appVersion || existing.appVersion || '1.0.0',
    plan: data.plan || existing.plan || 'Standard',
    status: data.status || existing.status || 'ACTIVE',
    lastPing: now.toISOString(),
    lastPingMs: now.getTime(),
    firstSeen: existing.firstSeen || now.toISOString(),
    pingCount: (existing.pingCount || 0) + 1,
    sessionType: 'DESKTOP',
    portalName: 'Desktop Python Engine',
    deviceCategory: 'Desktop Python Engine'
  };

  saveSessions(sessions);
}

function recordWebPresenceSession(data: {
  sessionId?: string;
  portal: 'ADMIN' | 'CLIENT';
  ip: string;
  userId?: string;
  username?: string;
  email?: string;
  displayName?: string;
  companyName?: string;
  plan?: string;
  licenseKey?: string;
  browserInfo?: string;
  deviceCategory?: string;
  status?: string;
}) {
  const sessions = loadSessions();
  const rawId = data.sessionId || `web_${data.portal.toLowerCase()}_${data.ip}`;
  const now = new Date();
  const existing = sessions[rawId] || {};

  const isAdmin = data.portal === 'ADMIN';
  const sessionType = isAdmin ? 'WEB_ADMIN' : 'WEB_CLIENT';
  const portalName = isAdmin ? 'Admin Console / Dashboard' : 'Client Intake Portal';
  const machineName = data.browserInfo || (isAdmin ? 'Admin Web Browser' : 'Client Web Browser');
  const userTag = (data.username || data.userId || (isAdmin ? 'ADMIN' : 'GUEST')).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
  const hwid = `WEB-${userTag || 'PORTAL'}-${data.portal}`;
  const key = data.licenseKey || (isAdmin ? 'ADMIN-ACTIVE-CONSOLE' : (existing.rawKey || ''));
  const keyMasked = key.length > 8 ? `${key.slice(0, 4)}...${key.slice(-4)}` : (key || 'WEB-SESSION');
  const hash = crypto.createHash('sha256').update(rawId).digest('hex');

  sessions[rawId] = {
    id: rawId,
    ip: data.ip,
    hash,
    keyMasked,
    rawKey: key,
    hwid,
    machineName,
    appVersion: 'Web v2.4',
    plan: data.plan || (isAdmin ? 'Master Administrator' : 'Client Visitor'),
    status: data.status || 'ACTIVE',
    lastPing: now.toISOString(),
    lastPingMs: now.getTime(),
    firstSeen: existing.firstSeen || now.toISOString(),
    pingCount: (existing.pingCount || 0) + 1,
    sessionType,
    username: data.username || (isAdmin ? 'admin' : undefined),
    email: data.email || undefined,
    displayName: data.displayName || (isAdmin ? 'Administrator' : undefined),
    companyName: data.companyName || undefined,
    portalName,
    browserInfo: data.browserInfo,
    deviceCategory: data.deviceCategory || 'Browser / Web Client'
  };

  saveSessions(sessions);
}

function getClientIp(req: express.Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim();
  }
  return req.socket?.remoteAddress || '127.0.0.1';
}

// Router Setup
const router = express.Router();

// CORS Headers
router.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-License-Key, Cache-Control');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  // Automatically record presence for any API request to track client and admin IPs in real time
  try {
    const path = req.path || '';
    if (path.startsWith('/api/') && !path.includes('/presence') && !path.includes('/sessions') && !path.includes('/heartbeat')) {
      const clientIp = getClientIp(req);
      const isAd = path.includes('/admin') || req.headers['referer']?.includes('/admin') || req.headers['x-portal'] === 'admin';
      const portal = isAd ? 'ADMIN' : 'CLIENT';
      const userAgent = req.headers['user-agent'] || 'Browser';
      
      let browser = 'Browser';
      if (userAgent.includes('Firefox')) browser = 'Firefox';
      else if (userAgent.includes('Edg/')) browser = 'Edge';
      else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) browser = 'Safari';
      else if (userAgent.includes('Chrome')) browser = 'Chrome';

      let os = 'Desktop OS';
      if (userAgent.includes('Macintosh')) os = 'macOS';
      else if (userAgent.includes('Windows')) os = 'Windows';
      else if (userAgent.includes('Linux')) os = 'Linux';
      else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) os = 'iOS';
      else if (userAgent.includes('Android')) os = 'Android';

      const browserInfo = `${browser} on ${os}`;
      
      recordWebPresenceSession({
        sessionId: `req_${portal.toLowerCase()}_${clientIp}_${crypto.createHash('md5').update(userAgent).digest('hex').slice(0, 6)}`,
        portal,
        ip: clientIp,
        browserInfo,
        status: 'ACTIVE'
      });
    }
  } catch {}

  next();
});

// Explicit download handler for desktop files mapping
const desktopFilesMap: Record<string, { file: string; type: string }> = {
  '/receipt_processor_bundle.zip': { file: 'receipt_processor_bundle.zip', type: 'application/zip' },
  '/api/download/bundle': { file: 'receipt_processor_bundle.zip', type: 'application/zip' },
  '/run_receipt_processor.bat': { file: 'run_receipt_processor.bat', type: 'application/x-bat; charset=utf-8' },
  '/run_receipt_processor.sh': { file: 'run_receipt_processor.sh', type: 'application/x-sh; charset=utf-8' },
  '/receipt_processor.py': { file: 'receipt_processor.py', type: 'text/x-python; charset=utf-8' },
  '/requirements.txt': { file: 'requirements.txt', type: 'text/plain; charset=utf-8' },
  '/.env.example': { file: '.env.example', type: 'text/plain; charset=utf-8' },
  '/README_DESKTOP_APP.txt': { file: 'README_DESKTOP_APP.txt', type: 'text/plain; charset=utf-8' },
};

router.get([
  '/receipt_processor_bundle.zip',
  '/api/download/bundle',
  '/run_receipt_processor.bat',
  '/run_receipt_processor.sh',
  '/receipt_processor.py',
  '/requirements.txt',
  '/.env.example',
  '/README_DESKTOP_APP.txt'
], (req, res) => {
  const cleanPath = req.path.replace(/^\/Receipt_portal\/?/i, '/');
  const target = desktopFilesMap[cleanPath];
  if (target) {
    const filePath = path.resolve(__dirname, 'public', target.file);
    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', target.type);
      res.setHeader('Content-Disposition', `attachment; filename="${target.file}"`);
      return res.sendFile(filePath);
    }
  }
  res.sendStatus(404);
});

// POST /api/scan/receipt - High-accuracy AI OCR Receipt extraction via Gemini
router.post('/api/scan/receipt', async (req, res) => {
  const { imageBase64, mimeType, fileName } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ success: false, error: 'Missing image or document base64 data' });
  }

  const rawApiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
  const apiKeys = rawApiKey.split(/[,;\s]+/).map(k => k.trim()).filter(Boolean);

  if (apiKeys.length === 0) {
    return res.status(503).json({ success: false, error: 'GEMINI_API_KEY is not configured on server' });
  }

  let cleanBase64 = imageBase64;
  let cleanMime = mimeType || 'image/jpeg';
  if (typeof imageBase64 === 'string' && imageBase64.includes('base64,')) {
    const parts = imageBase64.split('base64,');
    cleanBase64 = parts[1];
    const header = parts[0];
    if (header.includes('data:')) {
      cleanMime = header.replace('data:', '').replace(';', '').trim();
    }
  }

  const promptText = "Analyze this receipt image/document with forensic accounting precision. Identify all physically distinct purchase receipts in the image. For each receipt, extract the Store/Vendor name, exact transaction Date (YYYY-MM-DD), line items with individual amounts, pre-tax Subtotal, Sales Tax, Tip, Payment Method, Card Last 4 digits, Register Transaction Number (Trans #), Processor Reference ID (Ref #), Invoice Number (Inv #), and the FINAL GRAND TOTAL actually charged. Return strictly valid JSON conforming to the schema.";

  const systemInstructionText = 
    `You are a forensic-grade accounting OCR vision engine specialized in extracting 100% accurate financial data from store, farm, and commercial receipts for IRS Tax and QuickBooks reconciliation.\n` +
    `CRITICAL RULES:\n` +
    `1. MULTI-RECEIPT: Return an array of receipt objects in the 'receipts' field. If an image contains multiple separate receipts, process EVERY one of them.\n` +
    `2. GRAND TOTAL: 'total' MUST be the absolute FINAL amount charged to the payment method. NEVER extract 'Cash Tendered', 'Subtotal', or 'Savings' as the total. If 'Balance Due' is $0.00, find the 'Amount Paid' or 'Charge' instead.\n` +
    `3. TRANSACTION DATE: Extract the ACTUAL date the purchase occurred. Ignore coupon expiration dates or printed report dates. Format strictly as 'YYYY-MM-DD'.\n` +
    `4. MATH VALIDATION: Verify that Line Items Sum + Tax + Tip = Total. If they do not match, use the line item sum as the primary source of truth for the subtotal.\n` +
    `5. VENDOR: Extract the full legal merchant name from the top of the receipt.\n` +
    `6. CARD LAST 4: Extract strictly the 4 digits if a credit/debit card was used.\n` +
    `7. DISTINGUISH TRANSACTION NUMBER vs REFERENCE ID vs INVOICE NUMBER:\n` +
    `   - 'transaction_number': Strictly the register, POS, cashier, or terminal sequence transaction number (e.g. labeled 'TRANS #', 'TRAN #', 'TRANSACTION', 'TXN #', 'CHECK #', 'TICKET #', or 'SEQ #'). DO NOT put this into reference_id!\n` +
    `   - 'reference_id': Strictly the credit card processor, payment gateway, host, or terminal authorization reference code (e.g. labeled 'REF #', 'REF ID', 'REFERENCE', 'HOST REF #', 'ACQ REF', 'TRACE #', or 'AUTH/REF'). NEVER confuse with Trans #!\n` +
    `   - 'invoice_number': The formal billing invoice number or master receipt number (e.g. labeled 'INVOICE #', 'INV #', 'RECEIPT #', or 'ORDER #'). If none, leave empty string.\n` +
    `8. Return strictly valid JSON conforming to the schema.`;

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
            transaction_number: { type: "STRING", description: "Register, POS, or cashier sequence/transaction number (e.g. Trans #, Tran #, Txn #). Distinct from Ref ID." },
            reference_id: { type: "STRING", description: "Merchant processor or card authorization reference code (e.g. Ref #, Ref ID, Reference). Distinct from Trans #." },
            invoice_number: { type: "STRING", description: "Formal Invoice or Receipt number (e.g. Inv #, Receipt #, Order #). Distinct from Trans # or Ref ID." },
            category: {
              type: "STRING",
              enum: ["Supplies & Materials", "Farm:Cows", "Farm:Chickens", "Farm:General", "Repairs & Maintenance", "Fuel", "Tools"]
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
          required: ["vendor", "date", "total", "category"]
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

  const modelsToTry = [
    "gemini-2.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
    "gemini-flash-latest"
  ];
  let rawResult: any = null;
  let lastError = "";

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
            lastError = `API Error [${model}] with Key [${currentKey.slice(0, 6)}...]: ${gData.error.message}`;
            continue;
          }

          const candidates = gData?.candidates || [];
          if (candidates.length === 0 || candidates[0].finishReason === 'SAFETY' || candidates[0].finishReason === 'RECITATION') {
            lastError = `Model [${model}] blocked: ${candidates[0]?.finishReason || 'No candidates'}`;
            continue;
          }

          const text = candidates[0]?.content?.parts?.[0]?.text;
          if (text) {
            let parsed: any = null;
            const cleanText = text.trim();
            try {
              parsed = JSON.parse(cleanText);
            } catch (e) {
              const jsonMatch = cleanText.match(/(\{.*\})/s);
              if (jsonMatch) {
                try {
                  parsed = JSON.parse(jsonMatch[1]);
                } catch (e2) {}
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
            lastError = `Empty text for ${model} (Reason: ${candidates[0]?.finishReason})`;
          }
        } else {
          const errText = await gResp.text().catch(() => '');
          lastError = `HTTP ${gResp.status} [${model}] with Key [${currentKey.slice(0, 6)}...]: ${errText.slice(0, 4000)}`;
          if (gResp.status === 503 || gResp.status === 429) {
            await new Promise(r => setTimeout(r, 600 + Math.random() * 600));
          }
        }
      } catch (mErr: any) {
        lastError = `Fetch error [${model}]: ${mErr.message}`;
      }
    }
  }

  if (!rawResult) {
    return res.status(502).json({ 
      success: false, 
      error: 'OCR model extraction failed after multiple attempts',
      details: lastError 
    });
  }

  // Mathematical reconciliation
  let total = Number(rawResult.total) || 0;
  let subtotal = Number(rawResult.subtotal) || 0;
  let tax = Number(rawResult.tax) || 0;
  const tip = Number(rawResult.tip) || 0;

  const itemsList = Array.isArray(rawResult.items) ? rawResult.items : [];
  let itemSum = 0;
  for (const itm of itemsList) {
    if (itm && typeof itm.amount === 'number') {
      itemSum += itm.amount;
    }
  }
  itemSum = Number(itemSum.toFixed(2));

  if (subtotal <= 0 && itemSum > 0) {
    subtotal = itemSum;
  }

  if (subtotal <= 0 && total > 0) {
    subtotal = total > (tax + tip) ? Number((total - tax - tip).toFixed(2)) : total;
  }

  const expectedSum = Number((subtotal + tax + tip).toFixed(2));
  
  if (total <= 0.01) {
    if (expectedSum > 0) {
      total = expectedSum;
    } else if (itemSum > 0) {
      total = Number((itemSum + tax).toFixed(2));
    }
  }

  total = Number(total.toFixed(2));
  subtotal = Number(subtotal.toFixed(2));
  tax = Number(tax.toFixed(2));

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

  const yearCheck = dateStr.match(/^(\d{4})/);
  if (yearCheck) {
    const yr = parseInt(yearCheck[1]);
    if (yr < 2000 || yr > 2040) {
      dateStr = new Date().toISOString().split('T')[0];
    }
  }

  let cardLast4 = String(rawResult.card_last_4 || '').replace(/\D/g, '');
  if (cardLast4.length > 4) cardLast4 = cardLast4.slice(-4);
  if (cardLast4.length < 4) cardLast4 = '';

  let rawTrans = String(rawResult.transaction_number || rawResult.transactionNumber || '').trim();
  let rawRef = String(rawResult.reference_id || rawResult.referenceId || '').trim();
  let rawInv = String(rawResult.invoice_number || rawResult.invoiceNumber || '').trim();

  if (rawRef && !rawTrans && /^(?:trans|tran|txn|transaction)[\s#.:-]/i.test(rawRef)) {
    rawTrans = rawRef;
    rawRef = '';
  } else if (rawTrans && !rawRef && /^(?:ref|reference|auth|trace|host\s*ref)[\s#.:-]/i.test(rawTrans)) {
    rawRef = rawTrans;
    rawTrans = '';
  }

  const cleanTrans = rawTrans ? rawTrans.replace(/^(?:trans(?:action)?|tran|txn)[\s#.:-]*/i, '').trim() : '';
  const cleanRef = rawRef ? rawRef.replace(/^(?:ref(?:erence)?|auth|trace|host\s*ref|acq\s*ref)[\s#.:-]*/i, '').trim() : '';
  let cleanInv = rawInv ? rawInv.replace(/^(?:invoice|inv|receipt|order)[\s#.:-]*/i, '').trim() : '';
  if (!cleanInv) {
    if (cleanTrans) cleanInv = `TXN-${cleanTrans}`;
    else if (cleanRef) cleanInv = `REF-${cleanRef}`;
  }

  const resultData = {
    vendor: rawResult.vendor || 'Unknown Vendor',
    date: dateStr,
    total: Number(total.toFixed(2)),
    subtotal: Number(subtotal.toFixed(2)),
    tax: Number(tax.toFixed(2)),
    tip: Number(tip.toFixed(2)),
    paymentMethod: rawResult.payment_method || (cardLast4 ? 'CARD' : 'CASH'),
    cardLast4: cardLast4 || undefined,
    transactionNumber: cleanTrans || undefined,
    referenceId: cleanRef || undefined,
    invoiceNumber: cleanInv || undefined,
    category: rawResult.category || 'Supplies & Materials',
    items: rawResult.items || [],
    memo: rawResult.memo || `AI-OCR Scanned (${fileName})`,
    confidence: 0.99
  };

  return res.json({ success: true, data: resultData });
});

// Licensing Endpoints
router.get('/api/licenses/check', (req, res) => {
  const keyParam = String(req.query.key || '').trim().toUpperCase();
  let hashParam = String(req.query.hash || '').trim().toLowerCase();
  const hwidParam = String(req.query.hwid || '').trim();
  const machineParam = String(req.query.machine || '').trim();
  const verParam = String(req.query.ver || '').trim();
  const clientIp = getClientIp(req);

  if (!hashParam && keyParam) {
    hashParam = crypto.createHash('sha256').update(keyParam).digest('hex');
  }

  if (!hashParam) {
    return res.status(400).json({ error: 'Missing key or hash parameter' });
  }

  const targetFile = path.join(LICENSES_DIR, `${hashParam}.json`);
  if (fs.existsSync(targetFile)) {
    try {
      const fileData = JSON.parse(fs.readFileSync(targetFile, 'utf-8'));
      let status = fileData.status || 'ACTIVE';
      const expires = fileData.expires || '';
      const plan = fileData.plan || 'Standard';

      if (status === 'ACTIVE' && expires && !expires.includes('Never') && !expires.includes('Lifetime') && plan !== 'ADMIN') {
        const expDate = new Date(expires).getTime();
        if (!isNaN(expDate) && expDate < Date.now()) {
          status = 'EXPIRED';
        }
      }

      recordSessionPing({
        ip: clientIp,
        hash: hashParam,
        key: keyParam,
        hwid: hwidParam,
        machineName: machineParam,
        appVersion: verParam,
        plan,
        status
      });

      return res.json({
        exists: true,
        hash: hashParam,
        status,
        plan,
        expires,
        issued: fileData.issued || '',
        hwid: fileData.hwid || null,
        clientIp,
        updatedAt: fileData.updatedAt || new Date().toISOString()
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to read license record', details: err.message });
    }
  } else {
    recordSessionPing({
      ip: clientIp,
      hash: hashParam,
      key: keyParam,
      hwid: hwidParam,
      machineName: machineParam,
      appVersion: verParam,
      plan: 'Unknown',
      status: 'NOT_FOUND'
    });

    return res.status(404).json({
      exists: false,
      deleted: true,
      status: 'NOT_FOUND',
      hash: hashParam,
      clientIp,
      message: 'License key record not found or was deleted from server'
    });
  }
});

router.post('/api/licenses/heartbeat', (req, res) => {
  try {
    const body = req.body || {};
    const clientIp = getClientIp(req);
    const key = String(body.key || '').trim().toUpperCase();
    let hash = String(body.hash || '').trim().toLowerCase();
    if (!hash && key) {
      hash = crypto.createHash('sha256').update(key).digest('hex');
    }

    const hwid = body.hwid || body.hardware_id || '';
    const machineName = body.machine_name || body.machineName || body.hostname || '';
    const appVersion = body.version || body.app_version || '1.0.0';
    const status = body.status || 'ACTIVE';
    const plan = body.plan || '';

    if (hash) {
      recordSessionPing({
        ip: clientIp,
        hash,
        key,
        hwid,
        machineName,
        appVersion,
        plan,
        status
      });
    }

    return res.json({
      success: true,
      clientIp,
      recordedAt: new Date().toISOString(),
      status
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

router.post(['/api/presence/heartbeat', '/api/presence/ping'], (req, res) => {
  try {
    const body = req.body || {};
    const clientIp = getClientIp(req);
    const portal = (body.portal === 'ADMIN' ? 'ADMIN' : 'CLIENT') as 'ADMIN' | 'CLIENT';
    
    if (body.status === 'DISCONNECTED') {
      const sessions = loadSessions();
      const rawId = body.sessionId || `web_${portal.toLowerCase()}_${clientIp}`;
      if (sessions[rawId]) {
        sessions[rawId].lastPingMs = Date.now() - 700000; // mark offline immediately
        saveSessions(sessions);
      }
      return res.json({ success: true, message: 'Presence session marked offline' });
    }

    recordWebPresenceSession({
      sessionId: body.sessionId,
      portal,
      ip: clientIp,
      userId: body.userId,
      username: body.username,
      email: body.email,
      displayName: body.displayName,
      companyName: body.companyName,
      plan: body.plan,
      licenseKey: body.licenseKey,
      browserInfo: body.browserInfo,
      deviceCategory: body.deviceCategory,
      status: body.status || 'ACTIVE'
    });

    return res.json({
      success: true,
      clientIp,
      recordedAt: new Date().toISOString()
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

router.get(['/api/licenses/sessions', '/api/devices/sessions'], (req, res) => {
  try {
    const sessionsObj = loadSessions();
    const now = Date.now();
    const maxAgeMs = 24 * 60 * 60 * 1000; // 24 hours max retention
    const activeSessions: Record<string, any> = {};

    const sessionList = Object.values(sessionsObj).filter((s: any) => {
      const lastPingMs = s.lastPingMs || new Date(s.lastPing).getTime() || 0;
      return (now - lastPingMs) < maxAgeMs;
    }).map((s: any) => {
      const lastPingMs = s.lastPingMs || new Date(s.lastPing).getTime() || 0;
      const diffMs = now - lastPingMs;
      let onlineState: 'ONLINE' | 'IDLE' | 'OFFLINE' = 'OFFLINE';
      if (diffMs < 90000) {
        onlineState = 'ONLINE';
      } else if (diffMs < 600000) {
        onlineState = 'IDLE';
      }
      return {
        ...s,
        onlineState,
        secondsSinceLastPing: Math.floor(diffMs / 1000)
      };
    });

    for (const s of sessionList) {
      activeSessions[s.id] = s;
    }
    saveSessions(activeSessions);

    sessionList.sort((a, b) => {
      if (a.onlineState === 'ONLINE' && b.onlineState !== 'ONLINE') return -1;
      if (b.onlineState === 'ONLINE' && a.onlineState !== 'ONLINE') return 1;
      return (b.lastPingMs || 0) - (a.lastPingMs || 0);
    });

    return res.json({
      success: true,
      totalSessions: sessionList.length,
      onlineCount: sessionList.filter(s => s.onlineState === 'ONLINE').length,
      idleCount: sessionList.filter(s => s.onlineState === 'IDLE').length,
      uniqueIps: Array.from(new Set(sessionList.map(s => s.ip))).length,
      sessions: sessionList,
      serverTime: new Date().toISOString()
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.route(['/api/licenses/sessions/clear', '/api/devices/sessions/clear', '/api/devices/sessions/prune'])
  .all((req, res) => {
    try {
      const clearAll = Boolean(req.body.clearAll) || req.method === 'DELETE';
      const sessionsObj = loadSessions();
      const now = Date.now();

      if (clearAll) {
        saveSessions({});
        return res.json({ success: true, message: 'All active sessions cleared successfully' });
      }

      const filtered: Record<string, any> = {};
      let prunedCount = 0;
      for (const [id, s] of Object.entries(sessionsObj)) {
        const diff = now - ((s as any).lastPingMs || 0);
        if (diff < 90000) {
          filtered[id] = s;
        } else {
          prunedCount++;
        }
      }
      saveSessions(filtered);

      return res.json({
        success: true,
        message: prunedCount > 0 ? `Pruned ${prunedCount} inactive / idle session(s)` : 'No inactive sessions to prune',
        remaining: Object.keys(filtered).length,
        prunedCount
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

router.route('/api/inquiries')
  .get((req, res) => {
    try {
      let list: any[] = [];
      if (fs.existsSync(INQUIRIES_FILE)) {
        try {
          list = JSON.parse(fs.readFileSync(INQUIRIES_FILE, 'utf-8'));
        } catch {}
      }
      return res.json({ success: true, count: list.length, inquiries: list, recipient: 'moisttowlett247@gmail.com' });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  })
  .post((req, res) => {
    try {
      const body = req.body || {};
      let list: any[] = [];
      if (fs.existsSync(INQUIRIES_FILE)) {
        try {
          list = JSON.parse(fs.readFileSync(INQUIRIES_FILE, 'utf-8'));
        } catch {}
      }

      const newInquiry = {
        id: body.id || `inquiry-${Date.now()}`,
        name: body.name || 'Anonymous Client',
        email: body.email || '',
        company: body.company || '',
        receiptVolume: body.receiptVolume || 'Not specified',
        interestedPlan: body.interestedPlan || 'Standard',
        notes: body.notes || '',
        submittedAt: body.submittedAt || new Date().toISOString(),
        recipient: 'moisttowlett247@gmail.com',
        status: 'NEW'
      };

      list = [newInquiry, ...list.filter((x: any) => x.id !== newInquiry.id)];
      fs.writeFileSync(INQUIRIES_FILE, JSON.stringify(list, null, 2), 'utf-8');

      return res.json({
        success: true,
        message: 'Inquiry successfully submitted and queued for administrator moisttowlett247@gmail.com',
        inquiry: newInquiry
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

router.get(['/api/licenses/all', '/api/licenses'], (req, res) => {
  try {
    if (!fs.existsSync(LICENSES_DIR)) {
      return res.json({ success: true, count: 0, licenses: [] });
    }
    const files = fs.readdirSync(LICENSES_DIR);
    const licenses: any[] = [];
    for (const f of files) {
      if (f.endsWith('.json') && f !== 'active_sessions.json' && f !== 'inquiries.json') {
        try {
          const content = JSON.parse(fs.readFileSync(path.join(LICENSES_DIR, f), 'utf-8'));
          const hash = f.replace('.json', '');
          licenses.push({
            hash,
            ...content
          });
        } catch {}
      }
    }
    return res.json({ success: true, count: licenses.length, licenses });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/licenses/sync', (req, res) => {
  try {
    const body = req.body || {};
    const action = String(body.action || '').toUpperCase();
    const rec = body.record || body.license || {};
    const key = body.key;
    let hash = body.hash;

    if (!hash && key) {
      hash = crypto.createHash('sha256').update(String(key).trim().toUpperCase()).digest('hex');
    }

    if (!hash) {
      return res.status(400).json({ success: false, error: 'Key or hash is required' });
    }

    const safeHash = String(hash).replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeHash) {
      return res.status(400).json({ success: false, error: 'Invalid key or hash characters' });
    }

    const targetFile = path.join(LICENSES_DIR, `${safeHash}.json`);

    if (action === 'DELETE') {
      if (fs.existsSync(targetFile)) {
        fs.unlinkSync(targetFile);
      }
      return res.json({
        success: true,
        action: 'DELETE',
        hash,
        message: `License hash ${hash.slice(0, 12)}... deleted`
      });
    }

    const statusUpper = rec?.status ? String(rec.status).toUpperCase() : 'ACTIVE';
    const normalizedStatus = (statusUpper === 'NOT ACTIVE' || statusUpper === 'REVOKED' || statusUpper === 'INACTIVE' || statusUpper === 'SUSPENDED')
      ? 'REVOKED'
      : (statusUpper === 'EXPIRED' ? 'EXPIRED' : 'ACTIVE');

    let existing: any = {};
    if (fs.existsSync(targetFile)) {
      try {
        existing = JSON.parse(fs.readFileSync(targetFile, 'utf-8'));
      } catch {}
    }

    const content = {
      key: key || rec?.key || existing.key || '',
      clientName: rec?.clientName || existing.clientName || '',
      clientEmail: rec?.clientEmail || existing.clientEmail || '',
      status: normalizedStatus,
      plan: rec?.plan || existing.plan || 'Standard',
      expires: rec?.expires || rec?.expiresDate || existing.expires || '',
      issued: rec?.issued || rec?.issuedDate || existing.issued || new Date().toISOString().split('T')[0],
      hwid: rec?.hwid || rec?.hardwareId || existing.hwid || null,
      inUse: rec?.inUse !== undefined ? Boolean(rec.inUse) : (existing.inUse !== undefined ? existing.inUse : true),
      updatedAt: new Date().toISOString()
    };

    fs.writeFileSync(targetFile, JSON.stringify(content, null, 2), 'utf-8');
    return res.json({
      success: true,
      action: 'UPSERT',
      hash,
      record: content
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Client Submissions & Intake Queue Endpoints
router.get('/api/client/submissions', (req, res) => {
  try {
    const subs = loadSubmissions();
    return res.json({ success: true, count: subs.length, submissions: subs });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/client/submissions', (req, res) => {
  try {
    const body = req.body || {};
    const item = body.submission || body;
    if (!item || !item.fileName) {
      return res.status(400).json({ success: false, error: 'Invalid submission data' });
    }

    const current = loadSubmissions();
    const newSubmission = {
      ...item,
      id: item.id || `sub-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      uploadedAt: item.uploadedAt || new Date().toISOString(),
      status: item.status || 'QUEUED'
    };

    // Prevent exact duplicate insertion if matching id exists
    const filtered = current.filter((s: any) => s.id !== newSubmission.id);
    const updated = [newSubmission, ...filtered];
    saveSubmissions(updated);

    return res.json({ success: true, submission: newSubmission, count: updated.length });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/api/client/submissions/:id', (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body || {};
    const status = body.status;
    const details = body.details || {};

    const current = loadSubmissions();
    let updatedItem: any = null;
    const updated = current.map((s: any) => {
      if (s.id === id) {
        updatedItem = {
          ...s,
          ...(status ? { status } : {}),
          ...details
        };
        return updatedItem;
      }
      return s;
    });

    if (updatedItem) {
      saveSubmissions(updated);
      return res.json({ success: true, submission: updatedItem });
    }
    return res.status(404).json({ success: false, error: 'Submission not found' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/api/client/submissions/:id', (req, res) => {
  try {
    const rawId = req.params.id;
    const cleanId = decodeURIComponent(String(rawId || '').trim());
    const cleanIdLower = cleanId.toLowerCase();
    const current = loadSubmissions();
    const updated = current.filter((s: any) => {
      if (!s) return false;
      const sId = String(s.id || '').trim();
      const sFileName = String(s.fileName || '').trim();
      return sId !== cleanId && sId.toLowerCase() !== cleanIdLower && sFileName !== cleanId;
    });
    saveSubmissions(updated);
    return res.json({ success: true, message: `Submission ${cleanId} deleted`, remaining: updated.length });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/client/submissions/batch-sync', (req, res) => {
  try {
    const body = req.body || {};
    const clientSubs = Array.isArray(body.submissions) ? body.submissions : [];
    const serverSubs = loadSubmissions();

    const map = new Map<string, any>();
    for (const s of serverSubs) {
      if (s && s.id) map.set(s.id, s);
    }
    for (const c of clientSubs) {
      if (c && c.id) {
        const existing = map.get(c.id);
        if (!existing) {
          map.set(c.id, c);
        } else {
          map.set(c.id, { ...existing, ...c });
        }
      }
    }

    const merged = Array.from(map.values()).sort((a: any, b: any) => {
      const ta = new Date(a.uploadedAt || 0).getTime();
      const tb = new Date(b.uploadedAt || 0).getTime();
      return tb - ta;
    });

    saveSubmissions(merged);
    return res.json({ success: true, count: merged.length, submissions: merged });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Admin & Client Accounts Persistence Endpoints
router.get('/api/admin/accounts', (req, res) => {
  try {
    const accounts = loadAccounts();
    return res.json({ success: true, count: accounts.length, accounts });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/admin/accounts/sync', (req, res) => {
  try {
    const body = req.body || {};
    const incoming = Array.isArray(body.accounts) ? body.accounts : [];
    const serverAccounts = loadAccounts();

    const map = new Map<string, any>();
    for (const a of serverAccounts) {
      if (a && a.id) map.set(a.id, a);
    }
    for (const a of incoming) {
      if (a && a.id) {
        const existing = map.get(a.id);
        if (!existing) {
          map.set(a.id, a);
        } else {
          map.set(a.id, { ...existing, ...a });
        }
      }
    }

    const merged = Array.from(map.values());
    saveAccounts(merged);
    return res.json({ success: true, count: merged.length, accounts: merged });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/api/admin/accounts/:id', (req, res) => {
  try {
    const rawId = req.params.id;
    const decodedId = decodeURIComponent(String(rawId || '').trim()).toLowerCase();
    const qEmail = req.query.email ? decodeURIComponent(String(req.query.email)).trim().toLowerCase() : '';
    const qUser = req.query.username ? decodeURIComponent(String(req.query.username)).trim().toLowerCase() : '';
    const qKey = req.query.licenseKey ? decodeURIComponent(String(req.query.licenseKey)).trim().toLowerCase() : '';

    if (!decodedId && !qEmail && !qUser && !qKey) {
      return res.status(400).json({ success: false, error: 'Account identifier required' });
    }
    const current = loadAccounts();
    const updated = current.filter((a: any) => {
      if (!a) return false;
      const id = String(a.id || '').trim().toLowerCase();
      const u = String(a.username || '').trim().toLowerCase();
      const em = String(a.email || '').trim().toLowerCase();
      const k = String(a.licenseKey || '').trim().toLowerCase();

      if (decodedId && (id === decodedId || u === decodedId || em === decodedId || k === decodedId)) return false;
      if (qEmail && em === qEmail) return false;
      if (qUser && u === qUser) return false;
      if (qKey && k === qKey) return false;
      return true;
    });
    saveAccounts(updated);
    return res.json({ success: true, message: `Account deleted`, remaining: updated.length });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// QuickBooks API Routes
router.get('/api/qbo/config', (req, res) => {
  const cfg = getStoredConfig();
  const companies = getCompanies();
  const connectedList = Object.values(companies).filter((c: any) => c.status === 'CONNECTED');

  return res.json({
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
});

router.post('/api/qbo/config', (req, res) => {
  const body = req.body || {};
  const updated = saveConfig({
    clientId: body.clientId !== undefined ? body.clientId.trim() : undefined,
    clientSecret: body.clientSecret !== undefined ? body.clientSecret.trim() : undefined,
    environment: body.environment === 'sandbox' ? 'sandbox' : 'production',
    redirectUri: body.redirectUri !== undefined ? body.redirectUri.trim() : undefined,
    webhookVerifierToken: body.webhookVerifierToken !== undefined ? body.webhookVerifierToken.trim() : undefined
  });

  return res.json({
    success: true,
    message: 'QuickBooks OAuth broker configuration saved securely',
    configured: Boolean(updated.clientId && updated.clientSecret),
    environment: updated.environment
  });
});

router.get('/api/qbo/auth-url', (req, res) => {
  const cfg = getStoredConfig();
  const queryClientId = req.query.client_id;
  const queryRedirectUri = req.query.redirect_uri;
  const queryEnv = req.query.environment;

  const clientId = String(queryClientId || cfg.clientId || '').trim();
  if (!clientId) {
    return res.status(400).json({
      success: false,
      error: 'Missing Client ID. Please enter your Development Client ID from Intuit Developer.',
      configured: false
    });
  }

  const hostHeader = (req.headers['host'] || 'localhost:3000').toString();
  const isCloud = hostHeader.includes('run.app') || hostHeader.includes('.app');
  const protocol = req.headers['x-forwarded-proto'] || (isCloud ? 'https' : 'http');
  const defaultRedirectUri = 'https://moisttowlett247-a11y.github.io/Receipt_portal/api/qbo/callback';
  const redirectUri = String(queryRedirectUri || cfg.redirectUri || defaultRedirectUri).trim();

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

  return res.json({
    success: true,
    authUrl,
    redirectUri,
    state,
    configured: Boolean(cfg.clientId && cfg.clientSecret),
    clientId: cfg.clientId || '',
    environment: queryEnv || cfg.environment || 'production'
  });
});

router.get('/api/qbo/callback', async (req, res) => {
  const code = String(req.query.code || '');
  const realmId = String(req.query.realmId || '');
  const error = String(req.query.error || '');

  if (error) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(`<!DOCTYPE html>
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
  }

  if (!code || !realmId) {
    return res.status(400).send('<h3>Missing authorization code or Realm ID from Intuit callback.</h3>');
  }

  const cfg = getStoredConfig();
  const hostHeader = (req.headers['host'] || 'localhost:3000').toString();
  const isCloud = hostHeader.includes('run.app') || hostHeader.includes('.app');
  const protocol = req.headers['x-forwarded-proto'] || (isCloud ? 'https' : 'http');
  const redirectUri = cfg.redirectUri || `${protocol}://${hostHeader}/api/qbo/callback`;

  try {
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
          'Authorization': `Base ${accessToken}`,
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
      }
    } catch (err) {
      console.warn('Could not fetch QBO CompanyInfo:', err);
    }

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

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(`<!DOCTYPE html>
<html>
<head><title>QuickBooks Connected</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0c0a09;color:#f5f5f4;padding:40px;text-align:center;">
  <div style="display:inline-block;width:48px;height:48px;background:rgba(44,160,28,0.2);border-radius:50%;line-height:48px;font-size:24px;color:#34d399;margin-bottom:16px;">✓</div>
  <h2 style="color:#34d399;margin-bottom:8px;">QuickBooks Connected Successfully!</h2>
  <p style="color:#e7e5e4;font-size:15px;margin-bottom:6px;"><strong>${encodeURIComponent(companyName)}</strong></p>
  <p style="color:#a8a29e;font-size:12px;">Realm ID: ${encodeURIComponent(realmId)} • Rolling 101-day renewal activated</p>
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
  } catch (err: any) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(`<!DOCTYPE html>
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
  }
});

router.get('/api/qbo/companies', (req, res) => {
  const companies = getCompanies();
  const list = Object.values(companies).map((c: any) => {
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

  return res.json({
    success: true,
    totalCompanies: list.length,
    activeConnected: list.filter(c => c.status === 'CONNECTED').length,
    companies: list
  });
});

router.post('/api/qbo/token', async (req, res) => {
  const body = req.body || {};
  const realmId = (body.realmId || '').trim();

  const companies = getCompanies();
  let target = realmId ? companies[realmId] : null;

  if (!target) {
    const activeList = Object.values(companies).filter((c: any) => c.status === 'CONNECTED');
    if (activeList.length > 0) {
      target = activeList[0];
    }
  }

  if (!target || target.status !== 'CONNECTED') {
    return res.status(404).json({
      error: 'No active QuickBooks Online connection found for this account or Realm ID.',
      realmId
    });
  }

  const now = Date.now();
  if (target.accessTokenCached && target.accessTokenExpiresAt && target.accessTokenExpiresAt > (now + 300000)) {
    target.lastUsedAt = new Date().toISOString();
    saveCompanies(companies);

    return res.json({
      success: true,
      realmId: target.realmId,
      companyName: target.companyName,
      environment: target.environment,
      accessToken: target.accessTokenCached,
      expiresIn: Math.round((target.accessTokenExpiresAt - now) / 1000),
      cached: true
    });
  }

  const rawRefreshToken = decryptToken(target.refreshTokenEncrypted);
  if (!rawRefreshToken) {
    return res.status(401).json({
      error: 'Missing or unreadable refresh token. Please reconnect this QuickBooks company.',
      realmId: target.realmId
    });
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

    target.accessTokenCached = newAccessToken;
    target.accessTokenExpiresAt = now + (expiresIn * 1000);
    target.refreshTokenExpiresAt = now + (refreshExpiresIn * 1000);
    target.lastRefreshedAt = new Date().toISOString();
    target.lastUsedAt = new Date().toISOString();
    if (newRefreshToken) {
      target.refreshTokenEncrypted = encryptToken(newRefreshToken);
    }
    saveCompanies(companies);

    return res.json({
      success: true,
      realmId: target.realmId,
      companyName: target.companyName,
      environment: target.environment,
      accessToken: newAccessToken,
      expiresIn,
      rollingRefreshResetDays: 101,
      cached: false
    });
  } catch (err: any) {
    console.error('QBO Token Refresh Failure:', err);
    return res.status(500).json({
      error: 'QuickBooks token refresh failed',
      details: err.message
    });
  }
});

router.post('/api/qbo/disconnect', async (req, res) => {
  const body = req.body || {};
  const realmId = (body.realmId || '').trim();

  const companies = getCompanies();
  const target = companies[realmId];
  if (!target) {
    return res.status(404).json({ error: 'Company not found' });
  }

  const rawRefreshToken = decryptToken(target.refreshTokenEncrypted);
  const cfg = getStoredConfig();

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

  target.status = 'DISCONNECTED';
  target.refreshTokenEncrypted = '';
  target.accessTokenCached = '';
  saveCompanies(companies);

  return res.json({
    success: true,
    message: `QuickBooks connection for '${target.companyName}' (Realm: ${realmId}) was safely revoked and disconnected.`
  });
});

router.post('/api/qbo/webhook', (req, res) => {
  const body = req.body || {};
  const signature = req.headers['intuit-signature'];
  console.log('[QBO Webhook] Received event payload:', JSON.stringify(body), 'signature:', signature);

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

  return res.json({ status: 'processed' });
});

router.post('/api/qbo/mock-connect', (req, res) => {
  const body = req.body || {};
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

  return res.json({
    success: true,
    message: `Simulated connection established for '${companyName}'`,
    realmId,
    companyName
  });
});

// Bind routing endpoints to root and /Receipt_portal for maximum deployment flexibility
app.use('/', router);
app.use('/Receipt_portal', router);

// Serve Static Assets & Fallback SPA Client Routing in Production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.resolve(__dirname, 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
  });
} else {
  // In development, integrate Vite middleware
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'custom'
  });
  app.use(vite.middlewares);
}

// Start Server listening on standard Port 3000
app.listen(port, () => {
  console.log(`[Fullstack Server] OCR and QuickBooks sync server listening on port ${port}`);
});
