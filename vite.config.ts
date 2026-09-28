import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {defineConfig, Plugin} from 'vite';
import {quickbooksApiPlugin} from './vite-qbo-plugin';

function licenseSyncApiPlugin(): Plugin {
  return {
    name: 'vite-plugin-license-sync-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const urlObj = new URL(req.url || '', 'http://localhost');
        const pathname = urlObj.pathname;

        // Set permissive CORS and no-cache on all license queries
        if (pathname.startsWith('/api/licenses') || pathname.startsWith('/licenses/')) {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control');
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

          if (req.method === 'OPTIONS') {
            res.statusCode = 204;
            res.end();
            return;
          }
        }

        // Explicit download handler for ZIP bundle and all desktop runtime package files
        const normalizedPath = pathname.replace(/^\/Receipt_portal\/?/i, '/');
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

        const targetDesktopFile = desktopFilesMap[normalizedPath];
        if (targetDesktopFile) {
          const filePath = path.resolve(__dirname, 'public', targetDesktopFile.file);
          if (fs.existsSync(filePath)) {
            const stat = fs.statSync(filePath);
            res.statusCode = 200;
            res.setHeader('Content-Type', targetDesktopFile.type);
            res.setHeader('Content-Length', stat.size);
            res.setHeader('Content-Disposition', `attachment; filename="${targetDesktopFile.file}"`);
            res.setHeader('Cache-Control', 'no-cache');
            const readStream = fs.createReadStream(filePath);
            readStream.pipe(res);
            return;
          }
        }

        const licensesDir = path.resolve(__dirname, 'public', 'licenses');
        if (!fs.existsSync(licensesDir)) {
          fs.mkdirSync(licensesDir, { recursive: true });
        }

        const sessionsFilePath = path.join(licensesDir, 'active_sessions.json');

        function getClientIp(r: any): string {
          const forwarded = r.headers['x-forwarded-for'];
          if (typeof forwarded === 'string' && forwarded.trim()) {
            const first = forwarded.split(',')[0].trim();
            if (first) return first;
          }
          const realIp = r.headers['x-real-ip'];
          if (typeof realIp === 'string' && realIp.trim()) {
            return realIp.trim();
          }
          const sockAddr = r.socket?.remoteAddress || r.connection?.remoteAddress || '';
          if (sockAddr) {
            const clean = sockAddr.replace(/^.*:/, '');
            return clean === '1' ? '127.0.0.1' : (clean || '127.0.0.1');
          }
          return '127.0.0.1';
        }

        function loadSessions(): Record<string, any> {
          if (fs.existsSync(sessionsFilePath)) {
            try {
              return JSON.parse(fs.readFileSync(sessionsFilePath, 'utf-8'));
            } catch {}
          }
          return {};
        }

        function saveSessions(sessions: Record<string, any>) {
          try {
            fs.writeFileSync(sessionsFilePath, JSON.stringify(sessions, null, 2), 'utf-8');
          } catch {}
        }

        function recordSessionPing(data: {
          ip: string;
          hash: string;
          key?: string;
          hwid?: string;
          machineName?: string;
          appVersion?: string;
          plan?: string;
          status?: string;
        }) {
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
            pingCount: (existing.pingCount || 0) + 1
          };

          saveSessions(sessions);
        }

        // GET /api/licenses/check?key=... or ?hash=...
        if (pathname === '/api/licenses/check' && req.method === 'GET') {
          const keyParam = urlObj.searchParams.get('key')?.trim().toUpperCase() || '';
          let hashParam = urlObj.searchParams.get('hash')?.trim().toLowerCase() || '';
          const hwidParam = urlObj.searchParams.get('hwid')?.trim() || '';
          const machineParam = urlObj.searchParams.get('machine')?.trim() || '';
          const verParam = urlObj.searchParams.get('ver')?.trim() || '';
          const rawClientIp = getClientIp(req);
          const ipParam = urlObj.searchParams.get('ip')?.trim() || '';
          const clientIp = (ipParam && ipParam !== '127.0.0.1' && ipParam !== 'localhost') ? ipParam : rawClientIp;

          if (!hashParam && keyParam) {
            hashParam = crypto.createHash('sha256').update(keyParam).digest('hex');
          }

          if (!hashParam) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Missing key or hash parameter' }));
            return;
          }

          const targetFile = path.join(licensesDir, `${hashParam}.json`);
          if (fs.existsSync(targetFile)) {
            try {
              const fileData = JSON.parse(fs.readFileSync(targetFile, 'utf-8'));
              let status = fileData.status || 'ACTIVE';
              const expires = fileData.expires || '';
              const plan = fileData.plan || 'Standard';

              // If key has expired date and is not perpetual
              if (status === 'ACTIVE' && expires && !expires.includes('Never') && !expires.includes('Lifetime') && plan !== 'ADMIN') {
                const expDate = new Date(expires).getTime();
                if (!isNaN(expDate) && expDate < Date.now()) {
                  status = 'EXPIRED';
                }
              }

              // Record session ping
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

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                exists: true,
                hash: hashParam,
                status,
                plan,
                expires,
                issued: fileData.issued || '',
                hwid: fileData.hwid || null,
                clientIp,
                updatedAt: fileData.updatedAt || new Date().toISOString()
              }));
              return;
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Failed to read license record', details: err.message }));
              return;
            }
          } else {
            // Record failed check attempt too
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

            // License file not found (Deleted or never existed)
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              exists: false,
              deleted: true,
              status: 'NOT_FOUND',
              hash: hashParam,
              clientIp,
              message: 'License key record not found or was deleted from server'
            }));
            return;
          }
        }

        // POST /api/licenses/heartbeat - Direct heartbeat ping from desktop app
        if (pathname === '/api/licenses/heartbeat' && req.method === 'POST') {
          let bodyStr = '';
          req.on('data', chunk => {
            bodyStr += chunk;
          });
          req.on('end', () => {
            try {
              const body = JSON.parse(bodyStr || '{}');
              const rawClientIp = getClientIp(req);
              const bodyIp = (body.ip || '').trim();
              const clientIp = (bodyIp && bodyIp !== '127.0.0.1' && bodyIp !== 'localhost') ? bodyIp : rawClientIp;
              const key = (body.key || '').trim().toUpperCase();
              let hash = (body.hash || '').trim().toLowerCase();
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

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                success: true,
                clientIp,
                recordedAt: new Date().toISOString(),
                status
              }));
            } catch (err: any) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
          });
          return;
        }

        // GET /api/licenses/sessions or /api/devices/sessions - Retrieve all active/recent connected devices
        if ((pathname === '/api/licenses/sessions' || pathname === '/api/devices/sessions') && req.method === 'GET') {
          try {
            const sessionsObj = loadSessions();
            const now = Date.now();
            const sessionList = Object.values(sessionsObj).map((s: any) => {
              const lastPingMs = s.lastPingMs || new Date(s.lastPing).getTime() || 0;
              const diffMs = now - lastPingMs;
              let onlineState: 'ONLINE' | 'IDLE' | 'OFFLINE' = 'OFFLINE';
              if (diffMs < 90000) { // < 90 seconds
                onlineState = 'ONLINE';
              } else if (diffMs < 600000) { // < 10 minutes
                onlineState = 'IDLE';
              }
              return {
                ...s,
                onlineState,
                secondsSinceLastPing: Math.floor(diffMs / 1000)
              };
            });

            // Sort with ONLINE first, then by lastPing descending
            sessionList.sort((a, b) => {
              if (a.onlineState === 'ONLINE' && b.onlineState !== 'ONLINE') return -1;
              if (b.onlineState === 'ONLINE' && a.onlineState !== 'ONLINE') return 1;
              return (b.lastPingMs || 0) - (a.lastPingMs || 0);
            });

            const onlineCount = sessionList.filter(s => s.onlineState === 'ONLINE').length;
            const idleCount = sessionList.filter(s => s.onlineState === 'IDLE').length;
            const uniqueIps = Array.from(new Set(sessionList.map(s => s.ip))).length;

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              success: true,
              totalSessions: sessionList.length,
              onlineCount,
              idleCount,
              uniqueIps,
              sessions: sessionList,
              serverTime: new Date().toISOString()
            }));
            return;
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: err.message }));
            return;
          }
        }

        // POST /api/licenses/sessions/clear or /api/devices/sessions/clear - Prune offline/all sessions
        if ((pathname === '/api/licenses/sessions/clear' || pathname === '/api/devices/sessions/clear' || pathname === '/api/devices/sessions/prune') && (req.method === 'POST' || req.method === 'DELETE')) {
          let bodyStr = '';
          req.on('data', chunk => { bodyStr += chunk; });
          req.on('end', () => {
            try {
              const body = JSON.parse(bodyStr || '{}');
              const clearAll = Boolean(body.clearAll) || req.method === 'DELETE';
              const sessionsObj = loadSessions();
              const now = Date.now();

              if (clearAll) {
                saveSessions({});
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, message: 'All active sessions cleared successfully' }));
                return;
              }

              // Prune Inactive: Keep ONLY actively connected devices pinging within the last 90 seconds
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

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                success: true,
                message: prunedCount > 0 
                  ? `Pruned ${prunedCount} inactive / idle session(s)` 
                  : 'No inactive sessions to prune; all active devices retained',
                remaining: Object.keys(filtered).length,
                prunedCount
              }));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
          });
          return;
        }

        // GET /api/inquiries - List all submitted access requests & customer inquiries
        if (pathname === '/api/inquiries' && req.method === 'GET') {
          try {
            const inquiriesFile = path.join(licensesDir, 'inquiries.json');
            let list: any[] = [];
            if (fs.existsSync(inquiriesFile)) {
              try {
                list = JSON.parse(fs.readFileSync(inquiriesFile, 'utf-8'));
              } catch {}
            }
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, count: list.length, inquiries: list, recipient: 'moisttowlett247@gmail.com' }));
            return;
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: err.message }));
            return;
          }
        }

        // POST /api/inquiries - Submit access request & inquiry for moisttowlett247@gmail.com
        if (pathname === '/api/inquiries' && req.method === 'POST') {
          let bodyStr = '';
          req.on('data', chunk => { bodyStr += chunk; });
          req.on('end', () => {
            try {
              const body = JSON.parse(bodyStr || '{}');
              const inquiriesFile = path.join(licensesDir, 'inquiries.json');
              let list: any[] = [];
              if (fs.existsSync(inquiriesFile)) {
                try {
                  list = JSON.parse(fs.readFileSync(inquiriesFile, 'utf-8'));
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
              fs.writeFileSync(inquiriesFile, JSON.stringify(list, null, 2), 'utf-8');

              console.log(`[INQUIRY FOR moisttowlett247@gmail.com] From: ${newInquiry.name} <${newInquiry.email}> | Plan: ${newInquiry.interestedPlan} | Notes: ${newInquiry.notes}`);

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                success: true,
                message: 'Inquiry successfully submitted and queued for administrator moisttowlett247@gmail.com',
                inquiry: newInquiry
              }));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
          });
          return;
        }

        // POST /api/licenses/sync - Upsert or Delete license record
        if (pathname === '/api/licenses/sync' && req.method === 'POST') {
          let bodyStr = '';
          req.on('data', chunk => {
            bodyStr += chunk;
          });
          req.on('end', () => {
            try {
              const body = JSON.parse(bodyStr || '{}');
              const action = String(body.action || '').toUpperCase();
              const rec = body.record || body.license || {};
              const key = body.key;
              let hash = body.hash;

              if (!hash && key) {
                hash = crypto.createHash('sha256').update(String(key).trim().toUpperCase()).digest('hex');
              }

              if (!hash) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: false, error: 'Key or hash is required' }));
                return;
              }

              const targetFile = path.join(licensesDir, `${hash}.json`);

              if (action === 'DELETE') {
                if (fs.existsSync(targetFile)) {
                  fs.unlinkSync(targetFile);
                }
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                  success: true,
                  action: 'DELETE',
                  hash,
                  message: `License hash ${hash.slice(0, 12)}... deleted`
                }));
                return;
              }

              // UPSERT
              const statusUpper = rec?.status ? String(rec.status).toUpperCase() : 'ACTIVE';
              const normalizedStatus = (statusUpper === 'NOT ACTIVE' || statusUpper === 'REVOKED' || statusUpper === 'INACTIVE' || statusUpper === 'SUSPENDED')
                ? 'REVOKED'
                : (statusUpper === 'EXPIRED' ? 'EXPIRED' : 'ACTIVE');

              // Read existing record if present to merge metadata
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

              // Also update active session status if present
              try {
                const sessionsObj = loadSessions();
                let sessionsChanged = false;
                for (const s of Object.values(sessionsObj) as any[]) {
                  if (s.hash === hash) {
                    s.status = normalizedStatus;
                    if (content.key && !s.rawKey) s.rawKey = content.key;
                    sessionsChanged = true;
                  }
                }
                if (sessionsChanged) {
                  saveSessions(sessionsObj);
                }
              } catch {}

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                success: true,
                action: 'UPSERT',
                hash,
                status: content.status,
                record: content,
                message: `License hash ${hash.slice(0, 12)}... saved (${content.status})`
              }));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
          });
          return;
        }

        // GET /api/licenses/all - List all active server records
        if (pathname === '/api/licenses/all' && req.method === 'GET') {
          try {
            const files = fs.readdirSync(licensesDir).filter(f => 
              f.endsWith('.json') && 
              f !== 'registry.json' && 
              f !== 'active_sessions.json' && 
              f !== 'inquiries.json'
            );
            const sessionsObj = loadSessions();
            const sessionValues = Object.values(sessionsObj) as any[];

            const items = files.map(file => {
              const hash = file.replace('.json', '');
              try {
                const data = JSON.parse(fs.readFileSync(path.join(licensesDir, file), 'utf-8'));
                // Find matching session if raw key or client name is missing
                const matchSession = sessionValues.find(s => s.hash === hash);
                return { 
                  hash, 
                  key: data.key || matchSession?.rawKey || '',
                  clientName: data.clientName || (matchSession ? `Device ${matchSession.machineName || matchSession.ip}` : ''),
                  clientEmail: data.clientEmail || '',
                  plan: data.plan || matchSession?.plan || 'Standard',
                  status: data.status || 'ACTIVE',
                  expires: data.expires || '',
                  issued: data.issued || '',
                  hwid: data.hwid || matchSession?.hwid || null,
                  inUse: data.inUse !== undefined ? data.inUse : true,
                  updatedAt: data.updatedAt || ''
                };
              } catch {
                return { hash, status: 'UNKNOWN' };
              }
            });
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, count: items.length, licenses: items }));
            return;
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: err.message }));
            return;
          }
        }

        // POST /api/scan/receipt - High-accuracy AI OCR Receipt extraction via Gemini
        if (pathname === '/api/scan/receipt' && req.method === 'POST') {
          let bodyStr = '';
          req.on('data', chunk => { bodyStr += chunk; });
          req.on('end', async () => {
            try {
              const body = JSON.parse(bodyStr || '{}');
              const imageBase64 = body.imageBase64 || body.image || body.dataUrl || '';
              const mimeType = body.mimeType || (imageBase64.startsWith('data:application/pdf') ? 'application/pdf' : 'image/jpeg');
              const fileName = body.fileName || 'receipt.jpg';
              const clientName = body.clientName || 'General';

              const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';

              if (!apiKey) {
                res.statusCode = 503;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: false, error: 'GEMINI_API_KEY is not configured on server' }));
                return;
              }

              // Extract raw base64 data without data: prefix
              let cleanBase64 = imageBase64;
              if (cleanBase64.includes('base64,')) {
                cleanBase64 = cleanBase64.split('base64,')[1];
              }

              if (!cleanBase64) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: false, error: 'Missing image or document base64 data' }));
                return;
              }

              const promptText = "Analyze this receipt image/document with forensic accounting precision. Identify all physically distinct purchase receipts in the image. For each receipt, extract the Store/Vendor name, exact transaction Date (YYYY-MM-DD), line items with individual amounts, pre-tax Subtotal, Sales Tax, Tip, Payment Method, Card Last 4 digits, and the FINAL GRAND TOTAL actually charged. Return a list of all detected receipts in the 'receipts' field.";

              const systemInstructionText = 
                `You are a forensic-grade accounting OCR vision engine specialized in extracting 100% accurate financial data from store, farm, and commercial receipts.\n` +
                `CRITICAL RULES:\n` +
                `1. MULTI-RECEIPT: Return an array of receipt objects in the 'receipts' field. If an image contains multiple physically separate receipts (e.g. side-by-side), process each one as a distinct entry in the array.\n` +
                `2. TOTAL AMOUNT: 'total' MUST be the FINAL GRAND TOTAL actually charged. NEVER extract 'Cash Tendered', 'Amount Tendered', 'Change Due', or 'Loyalty Savings' as the total.\n` +
                `3. DATE: Extract the printed transaction date. If multiple dates appear (like coupon expiration dates), use the one closest to the transaction ID or vendor header. Format strictly as 'YYYY-MM-DD'.\n` +
                `4. MATH VALIDATION: You must cross-reference line items, subtotal, and tax. Subtotal + Tax + Tip should = Total. If the printed Total is a 'Balance Due' of $0.00 because it was paid, find the 'Payment Amount' instead.\n` +
                `5. Return strictly valid JSON conforming to the schema.`;

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
                    { inlineData: { mimeType, data: cleanBase64 } }
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

              const modelsToTry = ["gemini-flash-latest", "gemini-3.1-pro-preview", "gemini-3.1-flash-lite", "gemini-3.8-flash"];
              let rawResult: any = null;
              let lastError = "";

              for (const model of modelsToTry) {
                try {
                  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
                  const gResp = await fetch(geminiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                  });

                  if (gResp.ok) {
                    const gData = await gResp.json();
                    
                    if (gData.error) {
                      lastError = `API Error: ${gData.error.message}`;
                      continue;
                    }

                    const candidates = gData?.candidates || [];
                    if (candidates.length === 0) {
                      lastError = "No candidates returned (Safety or blocking)";
                      continue;
                    }

                    const text = candidates[0]?.content?.parts?.[0]?.text;
                    if (text) {
                      let parsed: any;
                      try {
                        parsed = JSON.parse(text.trim());
                      } catch (e) {
                        // Fallback: try to find JSON block in text
                        const jsonMatch = text.match(/(\{.*\})/s);
                        if (jsonMatch) {
                          try {
                            parsed = JSON.parse(jsonMatch[1]);
                          } catch (e2) {}
                        }
                      }

                      if (parsed && parsed.receipts && Array.isArray(parsed.receipts) && parsed.receipts.length > 0) {
                        rawResult = parsed.receipts[0];
                        break;
                      } else if (parsed && parsed.vendor) {
                        rawResult = parsed;
                        break;
                      }
                    } else {
                      lastError = `Empty text for ${model} (Reason: ${candidates[0]?.finishReason})`;
                    }
                  } else {
                    const errText = await gResp.text();
                    lastError = `HTTP ${gResp.status}: ${errText.slice(0, 100)}`;
                  }
                } catch (mErr: any) {
                  lastError = `Fetch error: ${mErr.message}`;
                }
              }

              if (!rawResult) {
                res.statusCode = 502;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ 
                  success: false, 
                  error: 'OCR model extraction failed after multiple attempts',
                  details: lastError 
                }));
                return;
              }

              // Mathematical reconciliation
              let total = Number(rawResult.total) || 0;
              let subtotal = Number(rawResult.subtotal) || 0;
              let tax = Number(rawResult.tax) || 0;
              const tip = Number(rawResult.tip) || 0;

              // Compute sum of line items if provided
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

              // If subtotal is still 0, try to derive from total/tax
              if (subtotal <= 0 && total > 0) {
                subtotal = total > (tax + tip) ? Number((total - tax - tip).toFixed(2)) : total;
              }

              const expectedSum = Number((subtotal + tax + tip).toFixed(2));
              
              // If total is 0 or seems to be 'Balance Due' after payment
              if (total <= 0.01) {
                if (expectedSum > 0) {
                  total = expectedSum;
                } else if (itemSum > 0) {
                  total = Number((itemSum + tax).toFixed(2));
                }
              } else if (subtotal > 0 && expectedSum > 0) {
                // If model picked an outlier like 'Cash Tendered' or 'Change Due'
                // We check if the total is wildly different from (Subtotal + Tax)
                // A common case is paying $100 for a $20 receipt.
                const diffRatio = total / expectedSum;
                if (diffRatio > 1.5 || diffRatio < 0.5) {
                  // If the discrepancy is huge, trust the sum of parts over the single 'total' field
                  if (expectedSum > 0.01) {
                    total = expectedSum;
                  }
                }
              }

              // Final rounding
              total = Number(total.toFixed(2));
              subtotal = Number(subtotal.toFixed(2));
              tax = Number(tax.toFixed(2));

              // Robust date normalization
              let dateStr = String(rawResult.date || '').trim();
              
              // If date is empty or invalid, try to find it in the rawResult if it was returned in another field
              if (!dateStr || dateStr.toLowerCase().includes('unknown')) {
                 // No-op, use today's date as absolute fallback later
              }

              // Strip trailing timestamps and junk
              dateStr = dateStr.replace(/[\sT]+(?:at\s+)?(?:\d{1,2}:\d{2}(?::\d{2})?).*$/i, '').trim();
              dateStr = dateStr.replace(/[;,.]$/, '');

              const monthMap: Record<string, string> = {
                jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
                jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
                january: '01', february: '02', march: '03', april: '04', june: '06',
                july: '07', august: '08', september: '09', october: '10', november: '11', december: '12'
              };

              const isoMatch = dateStr.match(/\b(20[123][0-9])[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12][0-9]|3[01])\b/);
              const usMatch = dateStr.match(/\b(0?[1-9]|1[0-2])[-/.](0?[1-9]|[12][0-9]|3[01])[-/.](20[123][0-9]|[0-9][0-9])\b/);
              const monthNameMatch = dateStr.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s.,-]+(0?[1-9]|[12][0-9]|3[01])(?:st|nd|rd|th)?[\s.,-]+(20[123][0-9]|[0-9][0-9])\b/i);
              const dayMonthMatch = dateStr.match(/\b(0?[1-9]|[12][0-9]|3[01])(?:st|nd|rd|th)?[\s.,-]+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s.,-]+(20[123][0-9]|[0-9][0-9])\b/i);

              if (isoMatch) {
                dateStr = `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
              } else if (usMatch) {
                let yr = usMatch[3];
                if (yr.length === 2) {
                  const numYr = parseInt(yr);
                  yr = numYr > 50 ? `19${yr}` : `20${yr}`;
                }
                dateStr = `${yr}-${usMatch[1].padStart(2, '0')}-${usMatch[2].padStart(2, '0')}`;
              } else if (monthNameMatch) {
                const mStr = monthNameMatch[1].toLowerCase();
                const mNum = monthMap[mStr] || '01';
                const day = monthNameMatch[2].padStart(2, '0');
                let yr = monthNameMatch[3];
                if (yr.length === 2) {
                  const numYr = parseInt(yr);
                  yr = numYr > 50 ? `19${yr}` : `20${yr}`;
                }
                dateStr = `${yr}-${mNum}-${day}`;
              } else if (dayMonthMatch) {
                const mStr = dayMonthMatch[2].toLowerCase();
                const mNum = monthMap[mStr] || '01';
                const day = dayMonthMatch[1].padStart(2, '0');
                let yr = dayMonthMatch[3];
                if (yr.length === 2) {
                  const numYr = parseInt(yr);
                  yr = numYr > 50 ? `19${yr}` : `20${yr}`;
                }
                dateStr = `${yr}-${mNum}-${day}`;
              } else {
                // If it doesn't match standard patterns, check if it's already YYYY-MM-DD but with different separators
                const fallbackMatch = dateStr.match(/\b(\d{4})[-/. ](\d{1,2})[-/. ](\d{1,2})\b/);
                if (fallbackMatch) {
                   dateStr = `${fallbackMatch[1]}-${fallbackMatch[2].padStart(2, '0')}-${fallbackMatch[3].padStart(2, '0')}`;
                } else if (!dateStr || dateStr.length < 6) {
                   dateStr = new Date().toISOString().split('T')[0];
                }
              }

              // Final sanity check on year
              const yearCheck = dateStr.match(/^(\d{4})/);
              if (yearCheck) {
                const yr = parseInt(yearCheck[1]);
                if (yr < 2000 || yr > 2040) {
                  dateStr = new Date().toISOString().split('T')[0];
                }
              }

              // Card sanitization
              let cardLast4 = String(rawResult.card_last_4 || '').replace(/\D/g, '');
              if (cardLast4.length > 4) cardLast4 = cardLast4.slice(-4);
              if (cardLast4.length < 4) cardLast4 = '';

              const resultData = {
                vendor: rawResult.vendor || 'Unknown Vendor',
                date: dateStr,
                total: Number(total.toFixed(2)),
                subtotal: Number(subtotal.toFixed(2)),
                tax: Number(tax.toFixed(2)),
                tip: Number(tip.toFixed(2)),
                paymentMethod: rawResult.payment_method || (cardLast4 ? 'CARD' : 'CASH'),
                cardLast4: cardLast4 || undefined,
                category: rawResult.category || 'Supplies & Materials',
                items: rawResult.items || [],
                memo: rawResult.memo || `AI-OCR Scanned (${fileName})`,
                confidence: 0.99
              };

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, data: resultData }));
              return;
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: err.message }));
              return;
            }
          });
          return;
        }

        next();
      });
    }
  };
}

// LINT.IfChange(aistudio_media_plugin)
function aistudioMediaPlugin(): Plugin {
  return {
    name: 'vite-plugin-aistudio-media',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.startsWith('/assets/aistudio/')) {
          const rawPath = req.url.split('?')[0].split('#')[0];
          try {
            const decodedPath = decodeURIComponent(rawPath);
            const relativePath = decodedPath.replace(/^\//, '');
            const aistudioDir = path.resolve(
              __dirname,
              'public',
              'assets',
              'aistudio',
            );
            const filePath = path.resolve(__dirname, 'public', relativePath);
            if (
              filePath.startsWith(aistudioDir + path.sep) &&
              fs.existsSync(filePath) &&
              fs.statSync(filePath).isFile()
            ) {
              const ext = path.extname(filePath).toLowerCase();
              const mimeMap: Record<string, string> = {
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.gif': 'image/gif',
                '.webp': 'image/webp',
                '.svg': 'image/svg+xml',
                '.bmp': 'image/bmp',
                '.ico': 'image/x-icon',
                '.mp4': 'video/mp4',
                '.webm': 'video/webm',
                '.ogv': 'video/ogg',
                '.mp3': 'audio/mpeg',
                '.wav': 'audio/wav',
                '.ogg': 'audio/ogg',
                '.pdf': 'application/pdf',
              };
              res.setHeader(
                'Content-Type',
                mimeMap[ext] || 'application/octet-stream',
              );
              res.setHeader('Cache-Control', 'no-cache');
              fs.createReadStream(filePath).pipe(res);
              return;
            }
          } catch {
            // Fall through if URI decoding or file access fails
          }
        }
        next();
      });
    },
  };
}
// LINT.ThenChange(//depot/google3/java/com/google/alkali/boq/makersuite/applet_dev_service/templates/initializers/react_theme/vite.config.ts:aistudio_media_plugin)

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss(), aistudioMediaPlugin(), licenseSyncApiPlugin(), quickbooksApiPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
