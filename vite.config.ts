import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {defineConfig, Plugin} from 'vite';

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

        // Explicit download handler for ZIP bundle and desktop runtime package
        if (pathname === '/receipt_processor_bundle.zip' || pathname === '/api/download/bundle') {
          const zipPath = path.resolve(__dirname, 'public', 'receipt_processor_bundle.zip');
          if (fs.existsSync(zipPath)) {
            const stat = fs.statSync(zipPath);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Length', stat.size);
            res.setHeader('Content-Disposition', 'attachment; filename="receipt_processor_bundle.zip"');
            res.setHeader('Cache-Control', 'no-cache');
            const readStream = fs.createReadStream(zipPath);
            readStream.pipe(res);
            return;
          }
        }

        if (pathname === '/run_receipt_processor.bat') {
          const batPath = path.resolve(__dirname, 'public', 'run_receipt_processor.bat');
          if (fs.existsSync(batPath)) {
            const stat = fs.statSync(batPath);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/x-bat; charset=utf-8');
            res.setHeader('Content-Length', stat.size);
            res.setHeader('Content-Disposition', 'attachment; filename="run_receipt_processor.bat"');
            const readStream = fs.createReadStream(batPath);
            readStream.pipe(res);
            return;
          }
        }

        const licensesDir = path.resolve(__dirname, 'public', 'licenses');
        if (!fs.existsSync(licensesDir)) {
          fs.mkdirSync(licensesDir, { recursive: true });
        }

        // GET /api/licenses/check?key=... or ?hash=...
        if (pathname === '/api/licenses/check' && req.method === 'GET') {
          const keyParam = urlObj.searchParams.get('key')?.trim().toUpperCase() || '';
          let hashParam = urlObj.searchParams.get('hash')?.trim().toLowerCase() || '';

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
            // License file not found (Deleted or never existed)
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              exists: false,
              deleted: true,
              status: 'NOT_FOUND',
              hash: hashParam,
              message: 'License key record not found or was deleted from server'
            }));
            return;
          }
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
    plugins: [react(), tailwindcss(), aistudioMediaPlugin(), licenseSyncApiPlugin()],
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
