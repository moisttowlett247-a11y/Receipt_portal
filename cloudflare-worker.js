/**
 * Cloudflare Worker for Receipt Processor License API, Telemetry, and Active Device Tracking
 * Deployed to: https://receipt-license-api.moisttowlett247.workers.dev
 *
 * KV Namespace Binding:
 *   Variable Name: LICENSES
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, Cache-Control",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

// SHA-256 helper
async function sha256Hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Constant-time string comparison to prevent timing attacks
function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

// Extract client IP with multi-source fallback
function getClientIp(request, fallbackParam) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    fallbackParam ||
    "127.0.0.1"
  );
}

// Location string helper
function getClientLocation(request) {
  const city = request.cf?.city || "";
  const region = request.cf?.region || "";
  const country = request.cf?.country || "US";
  if (city && region) return `${city}, ${region}, ${country}`;
  if (city) return `${city}, ${country}`;
  return country;
}

// Check admin bearer token
async function verifyAdminAuth(request, env) {
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;

  const validToken = await env.LICENSES.get("SYS:ADMIN_SESSION_TOKEN");
  if (validToken && constantTimeEqual(token, validToken)) {
    return true;
  }
  return false;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (!env.LICENSES) {
      return jsonResponse({
        error: "Missing KV Namespace binding 'LICENSES'. In Cloudflare Worker Settings -> KV Namespace Bindings, bind LICENSES.",
        has_database: false
      }, 500);
    }

    // -------------------------------------------------------------------------
    // 1. Health & Status
    // -------------------------------------------------------------------------
    if (pathname === "/api/health") {
      const clientIp = getClientIp(request);
      return jsonResponse({
        status: "ONLINE",
        version: "2.4.0",
        service: "Receipt Processor Edge License & Telemetry API",
        has_database: Boolean(env.LICENSES),
        your_ip: clientIp,
        location: getClientLocation(request),
        timestamp: new Date().toISOString()
      });
    }

    // Web Presence / Browser Heartbeat Tracking
    if (pathname === "/api/presence/heartbeat" && request.method === "POST") {
      try {
        const clientIp = getClientIp(request);
        const location = getClientLocation(request);
        const body = await request.json().catch(() => ({}));
        const sessionId = body.sessionId || `web_${(body.portal || 'client').toLowerCase()}_${clientIp}`;
        const now = Date.now();
        const kvSessionId = `SESSION:WEB_${sessionId}`;

        const sessionRecord = {
          id: kvSessionId,
          ip: clientIp,
          hash: body.sessionId || sessionId,
          keyMasked: body.licenseKey ? (body.licenseKey.length > 8 ? body.licenseKey.slice(0, 4) + '...' + body.licenseKey.slice(-4) : body.licenseKey) : 'WEB-PORTAL',
          rawKey: body.licenseKey || '',
          hwid: `WEB-${body.portal || 'PORTAL'}`,
          machineName: body.browserInfo || 'Browser Web Client',
          appVersion: 'Web v2.4',
          plan: body.plan || (body.portal === 'ADMIN' ? 'Master Administrator' : 'Client Visitor'),
          status: body.status || 'ACTIVE',
          lastPing: new Date().toISOString(),
          lastPingMs: now,
          firstSeen: new Date().toISOString(),
          pingCount: 1,
          sessionType: body.portal === 'ADMIN' ? 'WEB_ADMIN' : 'WEB_CLIENT',
          portalName: body.portal === 'ADMIN' ? 'Admin Console' : 'Client Intake Portal',
          username: body.username || '',
          email: body.email || '',
          displayName: body.displayName || '',
          companyName: body.companyName || '',
          location
        };

        await env.LICENSES.put(kvSessionId, JSON.stringify(sessionRecord), { expirationTtl: 86400 });
        return jsonResponse({ success: true, clientIp, location });
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 400);
      }
    }

    // -------------------------------------------------------------------------
    // 2. Admin Authentication
    // -------------------------------------------------------------------------
    if (pathname === "/api/admin/login" && request.method === "POST") {
      try {
        const clientIp = getClientIp(request);
        const rateLimitKey = `SYS:RATE_LIMIT:LOGIN:${clientIp}`;
        const attemptsRaw = await env.LICENSES.get(rateLimitKey);
        const failedAttempts = attemptsRaw ? parseInt(attemptsRaw, 10) : 0;

        if (failedAttempts >= 10) {
          return jsonResponse({
            success: false,
            error: "Too many failed login attempts. Access temporarily locked for 15 minutes to protect security."
          }, 429);
        }

        const body = await request.json();
        const inputUser = String(body.username || "admin").trim();
        const inputPass = String(body.password || body.passphrase || "").trim();

        if (!inputPass) {
          return jsonResponse({ success: false, error: "Password is required." }, 400);
        }

        let storedUser = await env.LICENSES.get("SYS:ADMIN_USER");
        let storedHash = await env.LICENSES.get("SYS:ADMIN_PASS_HASH");

        // Seed initial admin credentials if none exist
        if (!storedUser || !storedHash) {
          storedUser = "admin";
          storedHash = await sha256Hex("moisttowlett247");
          await env.LICENSES.put("SYS:ADMIN_USER", storedUser);
          await env.LICENSES.put("SYS:ADMIN_PASS_HASH", storedHash);
        }

        const inputHash = await sha256Hex(inputPass);
        const userMatches = constantTimeEqual(inputUser.toLowerCase(), storedUser.toLowerCase());
        const passMatches = constantTimeEqual(inputHash, storedHash);

        if (userMatches && passMatches) {
          // Clear any failed attempts on success
          if (failedAttempts > 0) {
            await env.LICENSES.delete(rateLimitKey);
          }

          // Generate new cryptographically secure session token
          const sessionToken = "cf_sec_" + crypto.randomUUID().replace(/-/g, "");
          // Save session token with 7 days expiration (604800 seconds)
          await env.LICENSES.put("SYS:ADMIN_SESSION_TOKEN", sessionToken, { expirationTtl: 604800 });

          return jsonResponse({
            success: true,
            token: sessionToken,
            username: storedUser,
            message: "Authentication successful."
          });
        }

        // Record failed attempt with 15-minute window (900 seconds)
        await env.LICENSES.put(rateLimitKey, String(failedAttempts + 1), { expirationTtl: 900 });

        return jsonResponse({ success: false, error: "Invalid username or password. Access Denied." }, 401);
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 400);
      }
    }

    if (pathname === "/api/admin/change-credentials" && request.method === "POST") {
      const isAuth = await verifyAdminAuth(request, env);
      if (!isAuth) {
        return jsonResponse({ success: false, error: "Unauthorized. Admin token required." }, 401);
      }

      try {
        const body = await request.json();
        const curPass = String(body.currentPassword || "").trim();
        const newUser = String(body.newUsername || "").trim();
        const newPass = String(body.newPassword || "").trim();

        if (!newUser || !newPass) {
          return jsonResponse({ success: false, error: "New username and password cannot be empty." }, 400);
        }

        const storedHash = await env.LICENSES.get("SYS:ADMIN_PASS_HASH");
        const curHash = await sha256Hex(curPass);

        if (storedHash && !constantTimeEqual(curHash, storedHash)) {
          return jsonResponse({ success: false, error: "Current password does not match." }, 403);
        }

        const newHash = await sha256Hex(newPass);
        await env.LICENSES.put("SYS:ADMIN_USER", newUser);
        await env.LICENSES.put("SYS:ADMIN_PASS_HASH", newHash);

        const newSessionToken = "cf_sec_" + crypto.randomUUID().replace(/-/g, "");
        await env.LICENSES.put("SYS:ADMIN_SESSION_TOKEN", newSessionToken, { expirationTtl: 604800 });

        return jsonResponse({
          success: true,
          token: newSessionToken,
          message: "Credentials successfully updated on Cloudflare."
        });
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 400);
      }
    }

    if (pathname === "/api/admin/logout" && request.method === "POST") {
      const isAuth = await verifyAdminAuth(request, env);
      if (isAuth) {
        await env.LICENSES.delete("SYS:ADMIN_SESSION_TOKEN");
      }
      return jsonResponse({
        success: true,
        message: "Administrator session revoked and logged out."
      });
    }

    // -------------------------------------------------------------------------
    // 3. Admin License Management
    // -------------------------------------------------------------------------
    if (pathname === "/api/admin/licenses" && request.method === "GET") {
      const isAuth = await verifyAdminAuth(request, env);
      if (!isAuth) {
        return jsonResponse({ success: false, error: "Unauthorized. Admin session required." }, 401);
      }

      const listResult = await env.LICENSES.list({ prefix: "KEY:" });
      const licenses = [];

      for (const keyObj of listResult.keys) {
        const val = await env.LICENSES.get(keyObj.name);
        if (val) {
          try {
            licenses.push(JSON.parse(val));
          } catch {}
        }
      }

      // Sort newest created / last seen first
      licenses.sort((a, b) => {
        const tA = new Date(a.last_seen_at || a.created_at || 0).getTime();
        const tB = new Date(b.last_seen_at || b.created_at || 0).getTime();
        return tB - tA;
      });

      return jsonResponse({
        success: true,
        count: licenses.length,
        licenses
      });
    }

    if (pathname === "/api/admin/licenses/create" && request.method === "POST") {
      const isAuth = await verifyAdminAuth(request, env);
      if (!isAuth) {
        return jsonResponse({ success: false, error: "Unauthorized. Admin session required." }, 401);
      }

      try {
        const body = await request.json();
        const cleanKey = String(body.key || "").trim().toUpperCase();
        if (!cleanKey) {
          return jsonResponse({ success: false, error: "License key string is required." }, 400);
        }

        const existingRaw = await env.LICENSES.get("KEY:" + cleanKey);
        let existing = existingRaw ? JSON.parse(existingRaw) : {};

        const statusUpper = String(body.status || existing.status || "ACTIVE").toUpperCase();
        const effectiveStatus = (statusUpper === "NOT ACTIVE" || statusUpper === "REVOKED" || statusUpper === "INACTIVE" || statusUpper === "SUSPENDED")
          ? "REVOKED"
          : (statusUpper === "EXPIRED" ? "EXPIRED" : "ACTIVE");

        const hash = await sha256Hex(cleanKey);

        const record = {
          key: cleanKey,
          hash: hash,
          plan: body.plan || existing.plan || "Standard",
          status: effectiveStatus,
          expires: body.expires || existing.expires || "Never (Lifetime / Non-Expiring)",
          user_email: body.email || body.user_email || existing.user_email || "",
          hwid: body.hwid !== undefined ? body.hwid : (existing.hwid || null),
          created_at: existing.created_at || new Date().toISOString(),
          last_seen_at: existing.last_seen_at || null,
          last_ip: existing.last_ip || null,
          last_location: existing.last_location || null,
          last_machine: existing.last_machine || null,
          first_activated_at: existing.first_activated_at || null,
          first_activated_machine: existing.first_activated_machine || null
        };

        // Store by KEY and by HASH for O(1) lookups
        await env.LICENSES.put("KEY:" + cleanKey, JSON.stringify(record));
        await env.LICENSES.put("HASH:" + hash, cleanKey);

        // Store by EMAIL for automatic account linkage
        const cleanUserEmail = String(record.user_email || "").trim().toLowerCase();
        if (cleanUserEmail && cleanUserEmail.includes("@")) {
          // If previously had a different email, clean up old index
          const prevEmail = String(existing.user_email || "").trim().toLowerCase();
          if (prevEmail && prevEmail !== cleanUserEmail) {
            await env.LICENSES.delete("EMAIL:" + prevEmail);
          }
          await env.LICENSES.put("EMAIL:" + cleanUserEmail, cleanKey);
        }

        return jsonResponse({
          success: true,
          message: `License ${cleanKey} saved (${effectiveStatus})`,
          license: record
        });
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 400);
      }
    }

    if (pathname === "/api/admin/licenses/action" && request.method === "POST") {
      const isAuth = await verifyAdminAuth(request, env);
      if (!isAuth) {
        return jsonResponse({ success: false, error: "Unauthorized. Admin session required." }, 401);
      }

      try {
        const body = await request.json();
        const cleanKey = String(body.key || "").trim().toUpperCase();
        const action = String(body.action || "").toUpperCase();

        if (!cleanKey) {
          return jsonResponse({ success: false, error: "License key is required." }, 400);
        }

        const raw = await env.LICENSES.get("KEY:" + cleanKey);
        if (!raw) {
          return jsonResponse({ success: false, error: "License key not found." }, 404);
        }

        const record = JSON.parse(raw);
        const hash = record.hash || (await sha256Hex(cleanKey));

        if (action === "REVOKE") {
          record.status = "REVOKED";
        } else if (action === "ACTIVATE") {
          record.status = "ACTIVE";
        } else if (action === "UNLOCK_HWID") {
          record.hwid = null;
          record.first_activated_machine = null;
        } else if (action === "DELETE") {
          await env.LICENSES.delete("KEY:" + cleanKey);
          await env.LICENSES.delete("HASH:" + hash);
          if (record.user_email) {
            await env.LICENSES.delete("EMAIL:" + String(record.user_email).trim().toLowerCase());
          }
          return jsonResponse({ success: true, message: `License ${cleanKey} deleted from Cloudflare KV.` });
        }

        record.updated_at = new Date().toISOString();
        await env.LICENSES.put("KEY:" + cleanKey, JSON.stringify(record));
        await env.LICENSES.put("HASH:" + hash, cleanKey);
        if (record.user_email) {
          await env.LICENSES.put("EMAIL:" + String(record.user_email).trim().toLowerCase(), cleanKey);
        }

        return jsonResponse({
          success: true,
          message: `Action ${action} executed successfully on ${cleanKey}.`,
          license: record
        });
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 400);
      }
    }

    // Lookup license key by associated email (used for automatic account linkage)
    if (pathname === "/api/licenses/by-email" && request.method === "GET") {
      const qEmail = (url.searchParams.get("email") || "").trim().toLowerCase();
      if (!qEmail || !qEmail.includes("@")) {
        return jsonResponse({ exists: false, error: "Valid email parameter required" }, 400);
      }

      const cleanKey = await env.LICENSES.get("EMAIL:" + qEmail);
      if (!cleanKey) {
        return jsonResponse({ exists: false, message: "No license associated with this email address." }, 404);
      }

      const raw = await env.LICENSES.get("KEY:" + cleanKey);
      if (!raw) {
        return jsonResponse({ exists: false, message: "License record not found." }, 404);
      }

      const record = JSON.parse(raw);
      return jsonResponse({
        exists: true,
        key: record.key,
        plan: record.plan,
        status: record.status,
        expires: record.expires,
        clientName: record.client_name || record.clientName || "",
        userEmail: record.user_email || record.userEmail || qEmail
      });
    }

    // -------------------------------------------------------------------------
    // 4. Desktop Client Verification & Telemetry Endpoints
    // -------------------------------------------------------------------------

    // A. GET /api/licenses/check (Used by Desktop Python Script)
    if (pathname === "/api/licenses/check") {
      const qKey = url.searchParams.get("key")?.trim().toUpperCase();
      const qHash = url.searchParams.get("hash")?.trim().toLowerCase();
      const qEmail = url.searchParams.get("email")?.trim().toLowerCase();
      const qHwid = url.searchParams.get("hwid")?.trim();
      const qMachine = url.searchParams.get("machine")?.trim();
      const qIp = url.searchParams.get("ip")?.trim();
      const clientIp = getClientIp(request, qIp);
      const location = getClientLocation(request);

      let record = null;
      let cleanKey = qKey;

      if (cleanKey) {
        const raw = await env.LICENSES.get("KEY:" + cleanKey);
        if (raw) record = JSON.parse(raw);
      }

      if (!record && qHash) {
        const mappedKey = await env.LICENSES.get("HASH:" + qHash);
        if (mappedKey) {
          cleanKey = mappedKey;
          const raw = await env.LICENSES.get("KEY:" + mappedKey);
          if (raw) record = JSON.parse(raw);
        }
      }

      if (!record && qEmail) {
        const mappedKey = await env.LICENSES.get("EMAIL:" + qEmail);
        if (mappedKey) {
          cleanKey = mappedKey;
          const raw = await env.LICENSES.get("KEY:" + mappedKey);
          if (raw) record = JSON.parse(raw);
        }
      }

      if (!record) {
        return jsonResponse({
          exists: false,
          valid: false,
          status: "NOT_FOUND",
          message: "License key not found in system."
        }, 404);
      }

      // Check HWID binding
      if (qHwid && record.hwid && record.hwid !== qHwid) {
        // HWID mismatch
        return jsonResponse({
          exists: true,
          valid: false,
          status: "HWID_MISMATCH",
          message: `License is locked to machine: ${record.first_activated_machine || record.hwid}. Contact moisttowlett247@gmail.com for HWID reset.`
        }, 403);
      }

      // If key had no HWID bound yet and is active, bind to this workstation now
      if (qHwid && !record.hwid && record.status === "ACTIVE") {
        record.hwid = qHwid;
        record.first_activated_machine = qMachine || "Unknown PC";
        record.first_activated_at = new Date().toISOString();
      }

      // Record telemetry
      record.last_ip = clientIp;
      record.last_location = location;
      record.last_machine = qMachine || record.last_machine || "Unknown Workstation";
      record.last_seen_at = new Date().toISOString();

      await env.LICENSES.put("KEY:" + record.key, JSON.stringify(record));
      if (record.hash) {
        await env.LICENSES.put("HASH:" + record.hash, record.key);
      }

      // Record active session for 24h
      const sessionId = `SESSION:${clientIp}_${record.key}`;
      await env.LICENSES.put(sessionId, JSON.stringify({
        id: sessionId,
        ip: clientIp,
        rawKey: record.key,
        keyMasked: record.key.slice(0, 4) + "..." + record.key.slice(-4),
        hwid: record.hwid,
        machineName: record.last_machine,
        plan: record.plan,
        status: record.status,
        lastPing: record.last_seen_at,
        lastPingMs: Date.now(),
        location: location
      }), { expirationTtl: 86400 });

      const isValid = record.status === "ACTIVE";

      return jsonResponse({
        exists: true,
        valid: isValid,
        status: record.status,
        plan: record.plan,
        expires: record.expires,
        hwid: record.hwid,
        clientIp: clientIp,
        location: location,
        message: isValid ? "License is active and valid." : `License is ${record.status}.`
      });
    }

    // B. GET /api/verify & POST /api/verify
    if (pathname === "/api/verify") {
      let key = url.searchParams.get("key");
      let hwid = url.searchParams.get("hwid");
      let machine = url.searchParams.get("machine");
      let fallbackIp = url.searchParams.get("ip");

      if (request.method === "POST") {
        try {
          const body = await request.json();
          key = body.key || key;
          hwid = body.hwid || hwid;
          machine = body.machine || machine;
          fallbackIp = body.ip || fallbackIp;
        } catch {}
      }

      const cleanKey = String(key || "").trim().toUpperCase();
      if (!cleanKey) {
        return jsonResponse({ valid: false, message: "License key parameter 'key' is required." }, 400);
      }

      const raw = await env.LICENSES.get("KEY:" + cleanKey);
      if (!raw) {
        return jsonResponse({ valid: false, status: "NOT_FOUND", message: "License key not found in system." }, 404);
      }

      const record = JSON.parse(raw);
      const clientIp = getClientIp(request, fallbackIp);
      const location = getClientLocation(request);

      if (hwid && record.hwid && record.hwid !== hwid) {
        return jsonResponse({
          valid: false,
          status: "HWID_MISMATCH",
          message: `License is locked to a different workstation. Contact administrator.`
        }, 403);
      }

      if (hwid && !record.hwid && record.status === "ACTIVE") {
        record.hwid = hwid;
        record.first_activated_machine = machine || "Desktop Client";
        record.first_activated_at = new Date().toISOString();
      }

      record.last_ip = clientIp;
      record.last_location = location;
      record.last_machine = machine || record.last_machine || "Desktop Client";
      record.last_seen_at = new Date().toISOString();

      await env.LICENSES.put("KEY:" + cleanKey, JSON.stringify(record));

      return jsonResponse({
        valid: record.status === "ACTIVE",
        status: record.status,
        plan: record.plan,
        expires: record.expires,
        hwid: record.hwid,
        clientIp: clientIp,
        location: location,
        message: record.status === "ACTIVE" ? "License validated successfully." : `License status is ${record.status}.`
      });
    }

    // C. POST /api/licenses/heartbeat
    if (pathname === "/api/licenses/heartbeat" && request.method === "POST") {
      try {
        const body = await request.json();
        const cleanKey = String(body.key || "").trim().toUpperCase();
        const qHash = String(body.hash || "").trim().toLowerCase();
        const qHwid = String(body.hwid || "").trim();
        const qMachine = String(body.machine || body.machine_name || "").trim();
        const clientIp = getClientIp(request, body.ip);
        const location = getClientLocation(request);

        let record = null;
        if (cleanKey) {
          const raw = await env.LICENSES.get("KEY:" + cleanKey);
          if (raw) record = JSON.parse(raw);
        }
        if (!record && qHash) {
          const mappedKey = await env.LICENSES.get("HASH:" + qHash);
          if (mappedKey) {
            const raw = await env.LICENSES.get("KEY:" + mappedKey);
            if (raw) record = JSON.parse(raw);
          }
        }

        if (record) {
          record.last_ip = clientIp;
          record.last_location = location;
          record.last_machine = qMachine || record.last_machine;
          record.last_seen_at = new Date().toISOString();
          await env.LICENSES.put("KEY:" + record.key, JSON.stringify(record));

          const sessionId = `SESSION:${clientIp}_${record.key}`;
          await env.LICENSES.put(sessionId, JSON.stringify({
            id: sessionId,
            ip: clientIp,
            rawKey: record.key,
            keyMasked: record.key.slice(0, 4) + "..." + record.key.slice(-4),
            hwid: record.hwid || qHwid,
            machineName: record.last_machine,
            plan: record.plan,
            status: record.status,
            lastPing: record.last_seen_at,
            lastPingMs: Date.now(),
            location: location
          }), { expirationTtl: 86400 });

          return jsonResponse({
            success: true,
            status: record.status,
            clientIp: clientIp,
            recordedAt: record.last_seen_at
          });
        }

        return jsonResponse({ success: false, error: "Key not found for heartbeat" }, 404);
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 400);
      }
    }

    // D. Static compatibility: /licenses/:hash.json
    const licenseJsonMatch = pathname.match(/^\/licenses\/([a-f0-9]{64})\.json$/i);
    if (licenseJsonMatch && request.method === "GET") {
      const hash = licenseJsonMatch[1].toLowerCase();
      const mappedKey = await env.LICENSES.get("HASH:" + hash);
      if (mappedKey) {
        const raw = await env.LICENSES.get("KEY:" + mappedKey);
        if (raw) {
          const record = JSON.parse(raw);
          const clientIp = getClientIp(request);
          const location = getClientLocation(request);

          record.last_ip = clientIp;
          record.last_location = location;
          record.last_seen_at = new Date().toISOString();
          await env.LICENSES.put("KEY:" + mappedKey, JSON.stringify(record));

          return jsonResponse({
            key: record.key,
            plan: record.plan,
            status: record.status,
            expires: record.expires,
            hwid: record.hwid,
            updatedAt: record.last_seen_at
          });
        }
      }

      return jsonResponse({ status: "NOT_FOUND", message: "License hash not found." }, 404);
    }

    // -------------------------------------------------------------------------
    // 5. Inquiries & Software Access Requests
    // -------------------------------------------------------------------------
    if (pathname === "/api/inquiries" || pathname.startsWith("/api/inquiries/")) {
      // DELETE an inquiry by ID or via body
      if (request.method === "DELETE") {
        const isAuth = await verifyAdminAuth(request, env);
        if (!isAuth) {
          return jsonResponse({ success: false, error: "Unauthorized. Admin session required to delete inquiries." }, 401);
        }

        try {
          let inquiryId = "";
          if (pathname.startsWith("/api/inquiries/")) {
            inquiryId = pathname.replace("/api/inquiries/", "").trim();
          } else {
            const body = await request.json().catch(() => ({}));
            inquiryId = String(body.id || "").trim();
          }

          if (!inquiryId) {
            return jsonResponse({ success: false, error: "Inquiry ID is required for deletion." }, 400);
          }

          // Delete inquiry object
          await env.LICENSES.delete("INQUIRY:" + inquiryId);

          // Remove from SYS:INQUIRIES_LIST
          const listRaw = await env.LICENSES.get("SYS:INQUIRIES_LIST");
          if (listRaw) {
            try {
              let idList = JSON.parse(listRaw);
              idList = idList.filter(id => id !== inquiryId);
              await env.LICENSES.put("SYS:INQUIRIES_LIST", JSON.stringify(idList));
            } catch {}
          }

          return jsonResponse({
            success: true,
            message: `Inquiry ${inquiryId} successfully deleted.`
          });
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 400);
        }
      }

      if (request.method === "POST") {
        try {
          const clientIp = getClientIp(request);
          const rateLimitKey = `SYS:RATE_LIMIT:INQUIRY:${clientIp}`;
          const attemptsRaw = await env.LICENSES.get(rateLimitKey);
          const submissions = attemptsRaw ? parseInt(attemptsRaw, 10) : 0;

          if (submissions >= 15) {
            return jsonResponse({
              success: false,
              error: "Too many inquiry requests from this network. Please wait an hour before submitting again."
            }, 429);
          }

          const body = await request.json();
          const cleanName = String(body.name || "Anonymous Client").trim().slice(0, 100);
          const cleanEmail = String(body.email || "").trim().slice(0, 150);
          const cleanCompany = String(body.company || "").trim().slice(0, 120);
          const cleanVolume = String(body.receiptVolume || "Not specified").trim().slice(0, 80);
          const cleanPlan = String(body.interestedPlan || "Standard").trim().slice(0, 80);
          const cleanNotes = String(body.notes || "").trim().slice(0, 2000);

          if (!cleanEmail && !cleanName) {
            return jsonResponse({ success: false, error: "Name and email are required." }, 400);
          }

          // Generate server-controlled cryptographic random inquiry ID
          const inquiryId = `inq_${Date.now()}_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
          const newInquiry = {
            id: inquiryId,
            name: cleanName,
            email: cleanEmail,
            company: cleanCompany,
            receiptVolume: cleanVolume,
            interestedPlan: cleanPlan,
            notes: cleanNotes,
            submittedAt: new Date().toISOString(),
            status: "NEW",
            ip: clientIp,
            location: getClientLocation(request)
          };

          // Save individual inquiry
          await env.LICENSES.put("INQUIRY:" + inquiryId, JSON.stringify(newInquiry));

          // Also maintain list of inquiry IDs (last 100)
          const listRaw = await env.LICENSES.get("SYS:INQUIRIES_LIST");
          let idList = listRaw ? JSON.parse(listRaw) : [];
          idList = [inquiryId, ...idList.filter(id => id !== inquiryId)].slice(0, 100);
          await env.LICENSES.put("SYS:INQUIRIES_LIST", JSON.stringify(idList));

          // Increment rate limit counter (1 hour TTL)
          await env.LICENSES.put(rateLimitKey, String(submissions + 1), { expirationTtl: 3600 });

          return jsonResponse({
            success: true,
            message: "Inquiry saved in Cloudflare KV edge database.",
            inquiry: newInquiry
          });
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 400);
        }
      }

      if (request.method === "GET") {
        const isAuth = await verifyAdminAuth(request, env);
        if (!isAuth) {
          return jsonResponse({ success: false, error: "Unauthorized. Admin session required." }, 401);
        }

        const listRaw = await env.LICENSES.get("SYS:INQUIRIES_LIST");
        const idList = listRaw ? JSON.parse(listRaw) : [];
        const inquiries = [];

        for (const id of idList) {
          const raw = await env.LICENSES.get("INQUIRY:" + id);
          if (raw) {
            try {
              inquiries.push(JSON.parse(raw));
            } catch {}
          }
        }

        return jsonResponse({
          success: true,
          count: inquiries.length,
          inquiries
        });
      }
    }

    // -------------------------------------------------------------------------
    // 6. Active Device Sessions (IP Monitor)
    // -------------------------------------------------------------------------
    if ((pathname === "/api/devices/sessions" || pathname === "/api/licenses/sessions" || pathname === "/api/admin/devices" || pathname === "/api/devices") && request.method === "GET") {
      const isAuth = await verifyAdminAuth(request, env);
      if (!isAuth) {
        return jsonResponse({ success: false, error: "Unauthorized. Admin session required." }, 401);
      }

      const listResult = await env.LICENSES.list({ prefix: "SESSION:" });
      const sessions = [];
      const now = Date.now();

      for (const keyObj of listResult.keys) {
        const val = await env.LICENSES.get(keyObj.name);
        if (val) {
          try {
            const s = JSON.parse(val);
            const diffMs = Math.max(0, now - (s.lastPingMs || 0));
            s.onlineState = diffMs < 90000 ? "ONLINE" : (diffMs < 600000 ? "IDLE" : "OFFLINE");
            s.secondsSinceLastPing = Math.floor(diffMs / 1000);
            sessions.push(s);
          } catch {}
        }
      }

      sessions.sort((a, b) => (b.lastPingMs || 0) - (a.lastPingMs || 0));

      return jsonResponse({
        success: true,
        totalSessions: sessions.length,
        onlineCount: sessions.filter(s => s.onlineState === "ONLINE").length,
        sessions
      });
    }

    if ((pathname === "/api/devices/sessions/clear" || pathname === "/api/licenses/sessions/clear" || pathname === "/api/devices/sessions/prune") && (request.method === "POST" || request.method === "DELETE")) {
      const isAuth = await verifyAdminAuth(request, env);
      if (!isAuth) {
        return jsonResponse({ success: false, error: "Unauthorized. Admin session required." }, 401);
      }

      try {
        const body = await request.json().catch(() => ({}));
        const clearAll = Boolean(body.clearAll) || request.method === "DELETE";
        const listResult = await env.LICENSES.list({ prefix: "SESSION:" });
        const now = Date.now();
        let prunedCount = 0;

        for (const keyObj of listResult.keys) {
          if (clearAll) {
            await env.LICENSES.delete(keyObj.name);
            prunedCount++;
          } else {
            const val = await env.LICENSES.get(keyObj.name);
            if (val) {
              try {
                const s = JSON.parse(val);
                const diffMs = Math.max(0, now - (s.lastPingMs || 0));
                if (diffMs >= 90000) {
                  await env.LICENSES.delete(keyObj.name);
                  prunedCount++;
                }
              } catch {
                await env.LICENSES.delete(keyObj.name);
                prunedCount++;
              }
            }
          }
        }

        return jsonResponse({
          success: true,
          message: clearAll ? "All Cloudflare KV active sessions cleared." : `Pruned ${prunedCount} inactive session(s) from Cloudflare KV.`,
          prunedCount
        });
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 400);
      }
    }

    // -------------------------------------------------------------------------
    // 7. Routing Rules & Global Tax Overrides Backup
    // -------------------------------------------------------------------------
    if (pathname === "/api/admin/routing-rules") {
      if (request.method === "GET") {
        const raw = await env.LICENSES.get("SYS:ROUTING_RULES");
        const rules = raw ? JSON.parse(raw) : [];
        return jsonResponse({ success: true, count: rules.length, rules });
      }
      if (request.method === "POST") {
        const isAuth = await verifyAdminAuth(request, env);
        if (!isAuth) {
          return jsonResponse({ success: false, error: "Unauthorized. Admin session required." }, 401);
        }
        try {
          const body = await request.json();
          const rules = Array.isArray(body.rules) ? body.rules : (Array.isArray(body) ? body : []);
          await env.LICENSES.put("SYS:ROUTING_RULES", JSON.stringify(rules));
          return jsonResponse({ success: true, message: `Saved ${rules.length} routing rules to Cloudflare KV.`, rules });
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 400);
        }
      }
    }

    if (pathname === "/api/admin/tax-rules") {
      if (request.method === "GET") {
        const raw = await env.LICENSES.get("SYS:TAX_OVERRIDES");
        const overrides = raw ? JSON.parse(raw) : [];
        return jsonResponse({ success: true, count: overrides.length, overrides });
      }
      if (request.method === "POST") {
        const isAuth = await verifyAdminAuth(request, env);
        if (!isAuth) {
          return jsonResponse({ success: false, error: "Unauthorized. Admin session required." }, 401);
        }
        try {
          const body = await request.json();
          const overrides = Array.isArray(body.overrides) ? body.overrides : (Array.isArray(body) ? body : []);
          await env.LICENSES.put("SYS:TAX_OVERRIDES", JSON.stringify(overrides));
          return jsonResponse({ success: true, message: `Saved ${overrides.length} tax overrides to Cloudflare KV.`, overrides });
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 400);
        }
      }
    }

    // -------------------------------------------------------------------------
    // 7.2. Client Account Management (Centralized Database)
    // -------------------------------------------------------------------------
    if (pathname === "/api/admin/accounts" && request.method === "GET") {
      const isAuth = await verifyAdminAuth(request, env);
      if (!isAuth) {
        return jsonResponse({ success: false, error: "Unauthorized. Admin session required." }, 401);
      }
      const raw = await env.LICENSES.get("SYS:CLIENT_ACCOUNTS");
      const accounts = raw ? JSON.parse(raw) : [];
      return jsonResponse({ success: true, count: accounts.length, accounts });
    }

    if (pathname === "/api/admin/accounts/sync" && request.method === "POST") {
      // Both admin and clients can sync, but for security, usually you'd want per-user storage.
      // However, given the current app structure, we'll sync to a central list.
      try {
        const body = await request.json();
        const clientAccounts = Array.isArray(body.accounts) ? body.accounts : [];
        const raw = await env.LICENSES.get("SYS:CLIENT_ACCOUNTS");
        const serverAccounts = raw ? JSON.parse(raw) : [];
        
        const map = new Map();
        for (const a of serverAccounts) {
          if (a && a.id) map.set(a.id, a);
        }
        for (const c of clientAccounts) {
          if (c && c.id) {
            const existing = map.get(c.id);
            if (!existing) {
              map.set(c.id, c);
            } else {
              // Merge, taking newer status or just merging fields
              map.set(c.id, { ...existing, ...c });
            }
          }
        }
        
        const merged = Array.from(map.values()).sort((a, b) => {
          const ta = new Date(a.createdAt || 0).getTime();
          const tb = new Date(b.createdAt || 0).getTime();
          return tb - ta;
        });
        
        await env.LICENSES.put("SYS:CLIENT_ACCOUNTS", JSON.stringify(merged));
        return jsonResponse({ success: true, count: merged.length, accounts: merged });
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 400);
      }
    }

    if (pathname.startsWith("/api/admin/accounts/") && request.method === "DELETE") {
      const isAuth = await verifyAdminAuth(request, env);
      if (!isAuth) {
        return jsonResponse({ success: false, error: "Unauthorized. Admin session required." }, 401);
      }
      try {
        const accountId = decodeURIComponent(pathname.replace("/api/admin/accounts/", ""));
        const raw = await env.LICENSES.get("SYS:CLIENT_ACCOUNTS");
        const accounts = raw ? JSON.parse(raw) : [];
        const updated = accounts.filter(a => a.id !== accountId && a.username !== accountId && a.email !== accountId);
        await env.LICENSES.put("SYS:CLIENT_ACCOUNTS", JSON.stringify(updated));
        return jsonResponse({ success: true, message: `Account ${accountId} deleted from server.` });
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 400);
      }
    }

    // -------------------------------------------------------------------------
    // 7.5. Client Submissions & Intake Queue Synchronizer
    // -------------------------------------------------------------------------
    if (pathname === "/api/client/submissions") {
      if (request.method === "GET") {
        const raw = await env.LICENSES.get("SYS:CLIENT_SUBMISSIONS");
        const subs = raw ? JSON.parse(raw) : [];
        return jsonResponse({ success: true, count: subs.length, submissions: subs });
      }
      if (request.method === "POST") {
        try {
          const body = await request.json();
          const item = body.submission || body;
          if (!item || !item.fileName) {
            return jsonResponse({ success: false, error: "Invalid submission data" }, 400);
          }
          const raw = await env.LICENSES.get("SYS:CLIENT_SUBMISSIONS");
          const subs = raw ? JSON.parse(raw) : [];
          const newSub = {
            ...item,
            id: item.id || ("sub-" + Date.now() + "-" + Math.floor(Math.random() * 10000)),
            uploadedAt: item.uploadedAt || new Date().toISOString(),
            status: item.status || "QUEUED"
          };
          const filtered = subs.filter(s => s.id !== newSub.id);
          const updated = [newSub, ...filtered];
          await env.LICENSES.put("SYS:CLIENT_SUBMISSIONS", JSON.stringify(updated));
          return jsonResponse({ success: true, submission: newSub, count: updated.length });
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 400);
        }
      }
    }

    if (pathname.startsWith("/api/client/submissions/")) {
      const subId = decodeURIComponent(pathname.replace("/api/client/submissions/", ""));
      if (subId === "batch-sync" && request.method === "POST") {
        try {
          const body = await request.json();
          const clientSubs = Array.isArray(body.submissions) ? body.submissions : [];
          const raw = await env.LICENSES.get("SYS:CLIENT_SUBMISSIONS");
          const serverSubs = raw ? JSON.parse(raw) : [];
          const map = new Map();
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
          const merged = Array.from(map.values()).sort((a, b) => {
            const ta = new Date(a.uploadedAt || 0).getTime();
            const tb = new Date(b.uploadedAt || 0).getTime();
            return tb - ta;
          });
          await env.LICENSES.put("SYS:CLIENT_SUBMISSIONS", JSON.stringify(merged));
          return jsonResponse({ success: true, count: merged.length, submissions: merged });
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 400);
        }
      }

      if (request.method === "PUT") {
        try {
          const body = await request.json();
          const raw = await env.LICENSES.get("SYS:CLIENT_SUBMISSIONS");
          const subs = raw ? JSON.parse(raw) : [];
          let updatedItem = null;
          const updated = subs.map(s => {
            if (s.id === subId) {
              updatedItem = { ...s, ...(body.status ? { status: body.status } : {}), ...(body.details || {}) };
              return updatedItem;
            }
            return s;
          });
          if (updatedItem) {
            await env.LICENSES.put("SYS:CLIENT_SUBMISSIONS", JSON.stringify(updated));
            return jsonResponse({ success: true, submission: updatedItem });
          }
          return jsonResponse({ success: false, error: "Submission not found" }, 404);
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 400);
        }
      }

      if (request.method === "DELETE") {
        try {
          const raw = await env.LICENSES.get("SYS:CLIENT_SUBMISSIONS");
          const subs = raw ? JSON.parse(raw) : [];
          const updated = subs.filter(s => s.id !== subId);
          await env.LICENSES.put("SYS:CLIENT_SUBMISSIONS", JSON.stringify(updated));
          return jsonResponse({ success: true, message: `Submission ${subId} deleted` });
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 400);
        }
      }
    }

    // -------------------------------------------------------------------------
    // 8. Gemini AI Receipt OCR Proxy (/api/scan/receipt)
    // -------------------------------------------------------------------------
    if (pathname === "/api/scan/receipt" && (request.method === "POST" || request.method === "OPTIONS")) {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }

      try {
        const body = await request.json();
        const imageBase64 = body.imageBase64 || body.dataUrl || "";
        const clientApiKey = request.headers.get("x-gemini-key") || (env && env.GEMINI_API_KEY) || "";

        let cleanBase64 = imageBase64;
        let cleanMime = body.mimeType || "image/jpeg";
        if (cleanBase64.includes("base64,")) {
          const parts = cleanBase64.split("base64,");
          cleanBase64 = parts[1];
          if (parts[0].includes("data:")) {
            cleanMime = parts[0].replace("data:", "").replace(";", "").trim();
          }
        }

        if (!cleanBase64) {
          return jsonResponse({ success: false, error: "Missing image base64 data" }, 400);
        }

        const promptText = 
          "Analyze this receipt with forensic accounting precision. Identify all physically distinct purchase receipts in the image. For each receipt, extract the Store/Vendor name, exact transaction Date (YYYY-MM-DD), line items with individual amounts, pre-tax Subtotal, Sales Tax, Tip, Payment Method, Card Last 4 digits, Register Transaction Number (Trans #), Processor Reference ID (Ref #), Invoice Number (Inv #), and the FINAL GRAND TOTAL actually charged. Return strictly valid JSON conforming to the schema.";

        const systemInstructionText = 
          "You are a certified forensic CPA accounting OCR vision engine specialized in extracting 100% accurate financial data from store, farm, and commercial receipts for IRS Tax (Schedule C / Schedule F) and QuickBooks Online reconciliation.\n" +
          "CRITICAL RULES:\n" +
          "1. TRANSACTION DATE: Extract the ACTUAL date the purchase occurred. Format strictly as 'YYYY-MM-DD'. If 2-digit year (e.g. 26), format as 2026.\n" +
          "2. GRAND TOTAL: 'total' MUST be the absolute FINAL amount charged or paid to the payment method. NEVER extract 'Cash Tendered', 'Subtotal', or 'Savings' as the total.\n" +
          "3. LINE ITEMS & SUBTOTAL: 'subtotal' is pre-tax. 'tax' is sales tax. Extract line items in 'items'.\n" +
          "4. VENDOR: Extract full legal merchant name at the top of the receipt.\n" +
          "5. CARD LAST 4: Extract strictly the 4 digits if a credit/debit card was used.\n" +
          "6. DISTINGUISH TRANSACTION NUMBER vs REFERENCE ID vs INVOICE NUMBER:\n" +
          "   - 'transaction_number': Strictly the register, POS, cashier, or terminal sequence transaction number (e.g. labeled 'TRANS #', 'TRAN #', 'TRANSACTION', 'TXN #', 'CHECK #', 'TICKET #', or 'SEQ #'). DO NOT put this into reference_id!\n" +
          "   - 'reference_id': Strictly the credit card processor, payment gateway, host, or terminal authorization reference code (e.g. labeled 'REF #', 'REF ID', 'REFERENCE', 'HOST REF #', 'ACQ REF', 'TRACE #', or 'AUTH/REF'). NEVER confuse with Trans #!\n" +
          "   - 'invoice_number': The formal billing invoice number or master receipt number (e.g. labeled 'INVOICE #', 'INV #', 'RECEIPT #', or 'ORDER #'). If none, leave empty string.\n" +
          "7. Return strictly valid JSON conforming to the schema.";

        const receiptSchema = {
          type: "OBJECT",
          properties: {
            receipts: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  vendor: { type: "STRING" },
                  date: { type: "STRING" },
                  total: { type: "NUMBER" },
                  subtotal: { type: "NUMBER" },
                  tax: { type: "NUMBER" },
                  tip: { type: "NUMBER" },
                  payment_method: { type: "STRING" },
                  card_last_4: { type: "STRING" },
                  transaction_number: { type: "STRING", description: "Register, POS, or cashier sequence/transaction number (e.g. Trans #, Tran #, Txn #). Distinct from Ref ID." },
                  reference_id: { type: "STRING", description: "Merchant processor or card authorization reference code (e.g. Ref #, Ref ID, Reference). Distinct from Trans #." },
                  invoice_number: { type: "STRING", description: "Formal Invoice or Receipt number (e.g. Inv #, Receipt #, Order #). Distinct from Trans # or Ref ID." },
                  category: { type: "STRING" },
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
                required: ["vendor", "date", "total"]
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

        let rawResult = null;
        let lastError = "";

        if (!clientApiKey) {
          return jsonResponse({ success: false, error: "No Gemini API key provided. Include x-gemini-key header or configure in worker environment." }, 401);
        }

        for (const model of modelsToTry) {
          try {
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${clientApiKey}`;
            const gResp = await fetch(geminiUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload)
            });

            if (gResp.ok) {
              const gData = await gResp.json();
              if (gData.error) {
                lastError = `[${model}] ${gData.error.message}`;
                continue;
              }
              const text = gData?.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) {
                let parsed = null;
                try {
                  parsed = JSON.parse(text.trim());
                } catch {
                  const m = text.match(/(\{.*\})/s);
                  if (m) {
                    try { parsed = JSON.parse(m[1]); } catch {}
                  }
                }
                if (parsed) {
                  if (parsed.receipts && Array.isArray(parsed.receipts) && parsed.receipts.length > 0) {
                    rawResult = parsed.receipts[0];
                    break;
                  } else if (parsed.vendor && parsed.total !== undefined) {
                    rawResult = parsed;
                    break;
                  }
                }
              }
            } else {
              const errText = await gResp.text().catch(() => "");
              lastError = `HTTP ${gResp.status} [${model}]: ${errText.slice(0, 500)}`;
            }
          } catch (e) {
            lastError = `Fetch error [${model}]: ${e.message}`;
          }
        }

        if (rawResult) {
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

          rawResult.transaction_number = rawTrans ? rawTrans.replace(/^(?:trans(?:action)?|tran|txn)[\s#.:-]*/i, '').trim() : undefined;
          rawResult.reference_id = rawRef ? rawRef.replace(/^(?:ref(?:erence)?|auth|trace|host\s*ref|acq\s*ref)[\s#.:-]*/i, '').trim() : undefined;
          rawResult.invoice_number = rawInv ? rawInv.replace(/^(?:invoice|inv|receipt|order)[\s#.:-]*/i, '').trim() : (rawResult.transaction_number ? `TXN-${rawResult.transaction_number}` : (rawResult.reference_id ? `REF-${rawResult.reference_id}` : undefined));

          return jsonResponse({ success: true, data: rawResult });
        } else {
          return jsonResponse({ success: false, error: lastError || "Failed to parse receipt with AI vision" }, 502);
        }
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 500);
      }
    }

    return jsonResponse({ error: "Endpoint not found on Cloudflare Worker: " + pathname }, 404);
  }
};
