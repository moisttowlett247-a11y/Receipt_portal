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
          const clientIp = getClientIp(req);

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
              const clientIp = getClientIp(req);
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

        // GET /api/licenses/sessions - Retrieve all active/recent connected devices
        if (pathname === '/api/licenses/sessions' && req.method === 'GET') {
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

        // POST /api/licenses/sessions/clear - Prune offline/all sessions
        if (pathname === '/api/licenses/sessions/clear' && req.method === 'POST') {
          let bodyStr = '';
          req.on('data', chunk => { bodyStr += chunk; });
          req.on('end', () => {
            try {
              const body = JSON.parse(bodyStr || '{}');
              const clearAll = Boolean(body.clearAll);
              const sessionsObj = loadSessions();
              const now = Date.now();

              if (clearAll) {
                saveSessions({});
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, message: 'All active sessions cleared' }));
                return;
              }

              // Keep only sessions active within the last 15 minutes
              const filtered: Record<string, any> = {};
              for (const [id, s] of Object.entries(sessionsObj)) {
                const diff = now - ((s as any).lastPingMs || 0);
                if (diff < 900000) {
                  filtered[id] = s;
                }
              }
              saveSessions(filtered);

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                success: true,
                message: 'Stale offline sessions pruned',
                remaining: Object.keys(filtered).length
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
              const content = {
                status: rec?.status ? String(rec.status).toUpperCase() : 'ACTIVE',
                plan: rec?.plan || 'Standard',
                expires: rec?.expires || '',
                issued: rec?.issued || new Date().toISOString().split('T')[0],
                hwid: rec?.hwid || null,
                updatedAt: new Date().toISOString()
              };

              fs.writeFileSync(targetFile, JSON.stringify(content, null, 2), 'utf-8');

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                success: true,
                action: 'UPSERT',
                hash,
                status: content.status,
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
            const files = fs.readdirSync(licensesDir).filter(f => f.endsWith('.json') && f !== 'registry.json');
            const items = files.map(file => {
              const hash = file.replace('.json', '');
              try {
                const data = JSON.parse(fs.readFileSync(path.join(licensesDir, file), 'utf-8'));
                return { hash, ...data };
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
