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

        // Store both by KEY and by HASH for O(1) lookups
        await env.LICENSES.put("KEY:" + cleanKey, JSON.stringify(record));
        await env.LICENSES.put("HASH:" + hash, cleanKey);

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
          return jsonResponse({ success: true, message: `License ${cleanKey} deleted from Cloudflare KV.` });
        }

        record.updated_at = new Date().toISOString();
        await env.LICENSES.put("KEY:" + cleanKey, JSON.stringify(record));
        await env.LICENSES.put("HASH:" + hash, cleanKey);

        return jsonResponse({
          success: true,
          message: `Action ${action} executed successfully on ${cleanKey}.`,
          license: record
        });
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 400);
      }
    }

    // -------------------------------------------------------------------------
    // 4. Desktop Client Verification & Telemetry Endpoints
    // -------------------------------------------------------------------------

    // A. GET /api/licenses/check (Used by Desktop Python Script)
    if (pathname === "/api/licenses/check") {
      const qKey = url.searchParams.get("key")?.trim().toUpperCase();
      const qHash = url.searchParams.get("hash")?.trim().toLowerCase();
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
    if (pathname === "/api/inquiries") {
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

    return jsonResponse({ error: "Endpoint not found on Cloudflare Worker: " + pathname }, 404);
  }
};
