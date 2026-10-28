/**
 * Real-Time IP Address & Device Telemetry Service
 *
 * Provides normalized, deduplicated tracking where each unique IP address
 * is tracked as a single entity with real-time ONLINE, IDLE, or OFFLINE status.
 */

import { getBackendApiUrl } from './urlUtils';
import { fetchCloudflareSessions } from './licenseSyncService';

export type IpOnlineState = 'ONLINE' | 'IDLE' | 'OFFLINE';

export interface TrackedIpSession {
  id: string;
  ip: string;
  ipVersion?: 'IPv4' | 'IPv6';
  networkScope?: string;
  onlineState: IpOnlineState;
  secondsSinceLastPing: number;
  lastPing: string;
  lastPingMs: number;
  firstSeen: string;
  pingCount: number;
  portalName: string;
  sessionType: string;
  machineName: string;
  browserInfo?: string;
  browserName?: string;
  browserVersion?: string;
  osName?: string;
  deviceCategory?: string;
  isMobile?: boolean;
  username?: string;
  displayName?: string;
  email?: string;
  companyName?: string;
  hwid?: string;
  keyMasked?: string;
  rawKey?: string;
  plan?: string;
  status?: string;
  location?: string;
  country?: string;
  countryCode?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  timezone?: string;
  asn?: string;
  asOrg?: string;
  screenResolution?: string;
  viewport?: string;
  deviceMemory?: string;
  hardwareConcurrency?: string;
  language?: string;
  connectionType?: string;
  pixelRatio?: string;
  touchSupported?: boolean;
  colorDepth?: string;
  platform?: string;
  lastActiveRoute?: string;
  riskAssessment?: 'SECURE_LOOPBACK' | 'NORMAL' | 'ELEVATED' | 'HIGH_VOLUME';
  avgPingIntervalSec?: number;
  isCurrentDevice?: boolean;
}

export interface IpTelemetrySummary {
  sessions: TrackedIpSession[];
  totalSessions: number;
  onlineCount: number;
  idleCount: number;
  offlineCount: number;
  uniqueIps: number;
  myIp: string | null;
  lastUpdated: string;
}

/**
 * Normalizes an IP address by:
 * - Stripping IPv6 mapped IPv4 prefix (::ffff:)
 * - Removing port suffixes (e.g. 192.168.1.1:54321 -> 192.168.1.1)
 * - Normalizing localhost representations (::1, localhost -> 127.0.0.1)
 * - Trimming whitespace
 */
export function normalizeIpAddress(raw: string | undefined | null): string {
  if (!raw) return '';
  let ip = String(raw).trim();

  // Strip IPv6 prefix ::ffff:
  if (ip.startsWith('::ffff:')) {
    ip = ip.replace(/^::ffff:/, '');
  }

  // Strip port from IPv4 e.g. 1.2.3.4:8080
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+$/.test(ip)) {
    ip = ip.split(':')[0];
  }

  // Handle localhost
  if (ip === '::1' || ip.toLowerCase() === 'localhost') {
    ip = '127.0.0.1';
  }

  return ip;
}

/**
 * Computes the real-time online state based on millisecond difference from now:
 * - ONLINE: pinged within last 90 seconds (90,000 ms)
 * - IDLE: pinged between 90 seconds and 10 minutes (600,000 ms)
 * - OFFLINE: no ping for over 10 minutes
 */
export function computeOnlineState(lastPingMs: number, now = Date.now()): {
  onlineState: IpOnlineState;
  secondsSinceLastPing: number;
} {
  const diffMs = Math.max(0, now - lastPingMs);
  const secondsSinceLastPing = Math.floor(diffMs / 1000);

  let onlineState: IpOnlineState = 'OFFLINE';
  if (diffMs < 90000) {
    onlineState = 'ONLINE';
  } else if (diffMs < 600000) {
    onlineState = 'IDLE';
  }

  return { onlineState, secondsSinceLastPing };
}

let cachedClientIp: string | null = null;

/**
 * Fetches the caller's public IP address using internal backend or edge services.
 */
export async function detectMyIp(): Promise<string | null> {
  if (cachedClientIp) return cachedClientIp;

  // 1. Try local/Cloud Run backend /api/presence/ip
  try {
    const backendBase = getBackendApiUrl();
    const res = await fetch(`${backendBase}/api/presence/ip`, {
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.ip) {
        cachedClientIp = normalizeIpAddress(data.ip);
        return cachedClientIp;
      }
    }
  } catch {}

  // 2. Try api.ipify.org fallback
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    if (res.ok) {
      const data = await res.json();
      if (data.ip) {
        cachedClientIp = normalizeIpAddress(data.ip);
        return cachedClientIp;
      }
    }
  } catch {}

  return null;
}

/**
 * Fetches, deduplicates, and aggregates all IP address sessions across
 * local backend and Cloudflare edge, returning exactly ONE entry per unique IP.
 */
export async function fetchUnifiedIpTelemetry(): Promise<IpTelemetrySummary> {
  const now = Date.now();
  const myIp = await detectMyIp().catch(() => null);

  // Map keyed strictly by normalized IP address
  const ipMap = new Map<string, TrackedIpSession>();

  const mergeSession = (rawSession: any, defaultSource = 'SERVER') => {
    const rawIp = rawSession.ip || rawSession.clientIp || '';
    const cleanIp = normalizeIpAddress(rawIp);
    if (!cleanIp || cleanIp === 'Pending Connection' || cleanIp === 'Detecting...') {
      return;
    }

    const lastPingMs = rawSession.lastPingMs || (rawSession.lastPing ? new Date(rawSession.lastPing).getTime() : now);
    const { onlineState, secondsSinceLastPing } = computeOnlineState(lastPingMs, now);
    const ipVersion: 'IPv4' | 'IPv6' = cleanIp.includes(':') ? 'IPv6' : 'IPv4';
    const isLoopback = cleanIp === '127.0.0.1' || cleanIp === '::1' || cleanIp === 'localhost';
    const isPrivate = isLoopback || cleanIp.startsWith('192.168.') || cleanIp.startsWith('10.') || cleanIp.startsWith('172.16.');
    const networkScope = isLoopback ? 'Loopback / Dev Host' : isPrivate ? 'Private Local Subnet' : 'Public WAN Network';
    const riskAssessment: 'SECURE_LOOPBACK' | 'NORMAL' | 'ELEVATED' | 'HIGH_VOLUME' = isLoopback ? 'SECURE_LOOPBACK' : 'NORMAL';

    const firstSeenMs = rawSession.firstSeen ? new Date(rawSession.firstSeen).getTime() : lastPingMs;
    const totalAgeSec = Math.max(1, Math.floor((lastPingMs - firstSeenMs) / 1000));
    const pCount = rawSession.pingCount || 1;
    const avgPingIntervalSec = Math.max(5, Math.round(totalAgeSec / Math.max(1, pCount)));

    const existing = ipMap.get(cleanIp);
    if (!existing) {
      ipMap.set(cleanIp, {
        id: `ip_${cleanIp.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
        ip: cleanIp,
        ipVersion,
        networkScope,
        onlineState,
        secondsSinceLastPing,
        lastPing: new Date(lastPingMs).toISOString(),
        lastPingMs,
        firstSeen: rawSession.firstSeen || new Date(lastPingMs).toISOString(),
        pingCount: pCount,
        avgPingIntervalSec,
        portalName: rawSession.portalName || (rawSession.portal === 'ADMIN' ? 'Admin Console' : 'Client Intake Portal'),
        sessionType: rawSession.sessionType || (rawSession.portal === 'ADMIN' ? 'WEB_ADMIN' : 'WEB_CLIENT'),
        machineName: rawSession.machineName || rawSession.browserInfo || 'Web Browser',
        browserInfo: rawSession.browserInfo,
        browserName: rawSession.browserName,
        browserVersion: rawSession.browserVersion,
        osName: rawSession.osName,
        deviceCategory: rawSession.deviceCategory || (rawSession.isMobile ? 'Mobile Web' : 'Browser / Web Client'),
        isMobile: Boolean(rawSession.isMobile),
        username: rawSession.username,
        displayName: rawSession.displayName,
        email: rawSession.email,
        companyName: rawSession.companyName,
        hwid: rawSession.hwid,
        keyMasked: rawSession.keyMasked,
        rawKey: rawSession.rawKey,
        plan: rawSession.plan,
        status: rawSession.status || 'ACTIVE',
        location: rawSession.location || (isLoopback ? 'Local Development Network' : 'Global IP'),
        country: rawSession.country || (isLoopback ? 'United States' : undefined),
        countryCode: rawSession.countryCode || (isLoopback ? 'US' : undefined),
        city: rawSession.city || (isLoopback ? 'Chicago / Local' : undefined),
        region: rawSession.region || (isLoopback ? 'IL' : undefined),
        postalCode: rawSession.postalCode || (isLoopback ? '60601' : undefined),
        timezone: rawSession.timezone || (isLoopback ? 'America/Chicago' : undefined),
        asn: rawSession.asn || (isLoopback ? 'AS0 Localhost' : undefined),
        asOrg: rawSession.asOrg || (isLoopback ? 'Internal Loopback Network' : undefined),
        screenResolution: rawSession.screenResolution,
        viewport: rawSession.viewport,
        deviceMemory: rawSession.deviceMemory,
        hardwareConcurrency: rawSession.hardwareConcurrency,
        language: rawSession.language,
        connectionType: rawSession.connectionType,
        pixelRatio: rawSession.pixelRatio,
        touchSupported: rawSession.touchSupported,
        colorDepth: rawSession.colorDepth,
        platform: rawSession.platform,
        lastActiveRoute: rawSession.lastActiveRoute,
        riskAssessment,
        isCurrentDevice: myIp ? cleanIp === myIp : false
      });
      return;
    }

    // Merge into existing entry for this IP address
    const isNewer = lastPingMs > (existing.lastPingMs || 0);
    const mostRecent = isNewer ? rawSession : existing;
    const newerPingMs = Math.max(existing.lastPingMs, lastPingMs);
    const updatedStatus = computeOnlineState(newerPingMs, now);

    // Combine portal information if multiple services connect from this IP
    let combinedPortal = existing.portalName;
    const incomingPortal = rawSession.portalName || (rawSession.portal === 'ADMIN' ? 'Admin Console' : 'Client Intake Portal');
    if (incomingPortal && !combinedPortal.includes(incomingPortal)) {
      if ((combinedPortal.includes('Admin') && incomingPortal.includes('Client')) ||
          (combinedPortal.includes('Client') && incomingPortal.includes('Admin'))) {
        combinedPortal = 'Admin & Client Portal';
      } else if (incomingPortal.includes('Desktop') || combinedPortal.includes('Desktop')) {
        combinedPortal = `${combinedPortal} + Desktop Engine`;
      }
    }

    const mergedPings = (existing.pingCount || 1) + (rawSession.pingCount || 1);
    const combinedFirstSeen = existing.firstSeen || rawSession.firstSeen;
    const combinedFirstMs = combinedFirstSeen ? new Date(combinedFirstSeen).getTime() : newerPingMs;
    const combinedAgeSec = Math.max(1, Math.floor((newerPingMs - combinedFirstMs) / 1000));

    ipMap.set(cleanIp, {
      ...existing,
      ipVersion,
      networkScope: existing.networkScope || networkScope,
      onlineState: updatedStatus.onlineState,
      secondsSinceLastPing: updatedStatus.secondsSinceLastPing,
      lastPing: new Date(newerPingMs).toISOString(),
      lastPingMs: newerPingMs,
      firstSeen: combinedFirstSeen,
      pingCount: mergedPings,
      avgPingIntervalSec: Math.max(5, Math.round(combinedAgeSec / Math.max(1, mergedPings))),
      portalName: combinedPortal,
      machineName: mostRecent.machineName || existing.machineName || rawSession.machineName,
      browserInfo: mostRecent.browserInfo || existing.browserInfo,
      browserName: mostRecent.browserName || existing.browserName,
      browserVersion: mostRecent.browserVersion || existing.browserVersion,
      osName: mostRecent.osName || existing.osName,
      deviceCategory: mostRecent.deviceCategory || existing.deviceCategory,
      isMobile: mostRecent.isMobile !== undefined ? mostRecent.isMobile : existing.isMobile,
      username: mostRecent.username || existing.username,
      displayName: mostRecent.displayName || existing.displayName,
      email: mostRecent.email || existing.email,
      companyName: mostRecent.companyName || existing.companyName,
      hwid: (existing.hwid && !existing.hwid.includes('GUEST')) ? existing.hwid : (rawSession.hwid || existing.hwid),
      keyMasked: (existing.keyMasked && !existing.keyMasked.includes('WEB')) ? existing.keyMasked : (rawSession.keyMasked || existing.keyMasked),
      rawKey: existing.rawKey || rawSession.rawKey,
      plan: mostRecent.plan || existing.plan,
      location: mostRecent.location || existing.location,
      country: mostRecent.country || existing.country,
      countryCode: mostRecent.countryCode || existing.countryCode,
      city: mostRecent.city || existing.city,
      region: mostRecent.region || existing.region,
      postalCode: mostRecent.postalCode || existing.postalCode,
      timezone: mostRecent.timezone || existing.timezone,
      asn: mostRecent.asn || existing.asn,
      asOrg: mostRecent.asOrg || existing.asOrg,
      screenResolution: mostRecent.screenResolution || existing.screenResolution,
      viewport: mostRecent.viewport || existing.viewport,
      deviceMemory: mostRecent.deviceMemory || existing.deviceMemory,
      hardwareConcurrency: mostRecent.hardwareConcurrency || existing.hardwareConcurrency,
      language: mostRecent.language || existing.language,
      connectionType: mostRecent.connectionType || existing.connectionType,
      pixelRatio: mostRecent.pixelRatio || existing.pixelRatio,
      touchSupported: mostRecent.touchSupported !== undefined ? mostRecent.touchSupported : existing.touchSupported,
      colorDepth: mostRecent.colorDepth || existing.colorDepth,
      platform: mostRecent.platform || existing.platform,
      lastActiveRoute: mostRecent.lastActiveRoute || existing.lastActiveRoute,
      riskAssessment: existing.riskAssessment || riskAssessment,
      isCurrentDevice: myIp ? cleanIp === myIp : false
    });
  };

  // 1. Fetch from Local/Cloud Run backend /api/licenses/sessions
  try {
    const backendBase = getBackendApiUrl();
    const res = await fetch(`${backendBase}/api/licenses/sessions?_t=${now}`, {
      headers: { 'Cache-Control': 'no-cache, no-store' }
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.sessions)) {
        for (const s of data.sessions) {
          mergeSession(s, 'SERVER');
        }
      }
    }
  } catch (err) {
    console.warn('Backend sessions fetch notice:', err);
  }

  // 2. Fetch from Cloudflare KV Edge API
  try {
    const cfSessions = await fetchCloudflareSessions().catch(() => []);
    if (Array.isArray(cfSessions)) {
      for (const s of cfSessions) {
        mergeSession(s, 'CLOUDFLARE');
      }
    }
  } catch (cfErr) {
    console.warn('Cloudflare edge sessions notice:', cfErr);
  }

  // Convert map to array
  const sessions = Array.from(ipMap.values());

  // Sort: ONLINE first (most recent pings), then IDLE, then OFFLINE
  sessions.sort((a, b) => {
    if (a.onlineState === 'ONLINE' && b.onlineState !== 'ONLINE') return -1;
    if (b.onlineState === 'ONLINE' && a.onlineState !== 'ONLINE') return 1;
    if (a.onlineState === 'IDLE' && b.onlineState === 'OFFLINE') return -1;
    if (b.onlineState === 'IDLE' && a.onlineState === 'OFFLINE') return 1;
    return (b.lastPingMs || 0) - (a.lastPingMs || 0);
  });

  const onlineCount = sessions.filter(s => s.onlineState === 'ONLINE').length;
  const idleCount = sessions.filter(s => s.onlineState === 'IDLE').length;
  const offlineCount = sessions.filter(s => s.onlineState === 'OFFLINE').length;

  return {
    sessions,
    totalSessions: sessions.length,
    onlineCount,
    idleCount,
    offlineCount,
    uniqueIps: sessions.length,
    myIp,
    lastUpdated: new Date().toISOString()
  };
}

/**
 * Prunes offline/stale IP sessions older than 10 minutes from server storage
 */
export async function pruneOfflineIps(): Promise<boolean> {
  try {
    const backendBase = getBackendApiUrl();
    const res = await fetch(`${backendBase}/api/licenses/sessions/clear`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clearAll: false })
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Clears all IP sessions from server storage
 */
export async function clearAllIpSessions(): Promise<boolean> {
  try {
    const backendBase = getBackendApiUrl();
    const res = await fetch(`${backendBase}/api/licenses/sessions/clear`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clearAll: true })
    });
    return res.ok;
  } catch {
    return false;
  }
}
