// Real-time Web Presence & Live IP Tracking Service
// Broadcasts lightweight heartbeats from active Admin and Client Portal sessions

import { CLOUDFLARE_WORKER_URL } from './licenseSyncService';
import { getBackendApiUrl } from './urlUtils';

export interface WebPresencePayload {
  portal: 'ADMIN' | 'CLIENT';
  userId?: string;
  username?: string;
  email?: string;
  displayName?: string;
  companyName?: string;
  plan?: string;
  licenseKey?: string;
  role?: string;
}

export interface ClientHardwareTelemetry {
  browser: string;
  browserVersion?: string;
  os: string;
  osVersion?: string;
  isMobile: boolean;
  summary: string;
  screenResolution?: string;
  viewport?: string;
  deviceMemory?: string;
  hardwareConcurrency?: string;
  language?: string;
  timezone?: string;
  connectionType?: string;
  pixelRatio?: string;
  touchSupported?: boolean;
  colorDepth?: string;
  platform?: string;
}

function getBrowserAndOsInfo(): ClientHardwareTelemetry {
  if (typeof navigator === 'undefined') {
    return { browser: 'Browser', os: 'OS', isMobile: false, summary: 'Web Client' };
  }

  const ua = navigator.userAgent;
  let browser = 'Chrome';
  let browserVersion = '';
  if (ua.includes('Firefox')) {
    browser = 'Firefox';
    const match = ua.match(/Firefox\/(\d+(\.\d+)?)/);
    if (match) browserVersion = match[1];
  } else if (ua.includes('Edg/')) {
    browser = 'Edge';
    const match = ua.match(/Edg\/(\d+(\.\d+)?)/);
    if (match) browserVersion = match[1];
  } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
    browser = 'Safari';
    const match = ua.match(/Version\/(\d+(\.\d+)?)/);
    if (match) browserVersion = match[1];
  } else if (ua.includes('OPR/') || ua.includes('Opera')) {
    browser = 'Opera';
  } else if (ua.includes('Chrome')) {
    browser = 'Chrome';
    const match = ua.match(/Chrome\/(\d+(\.\d+)?)/);
    if (match) browserVersion = match[1];
  }

  let os = 'Windows';
  if (ua.includes('Macintosh') || ua.includes('Mac OS')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  else if (ua.includes('Android')) os = 'Android';

  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const summary = `${browser} ${browserVersion} on ${os}${isMobile ? ' (Mobile)' : ''}`.trim();

  const screenRes = typeof window !== 'undefined' && window.screen ? `${window.screen.width}x${window.screen.height}` : undefined;
  const viewport = typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : undefined;
  const navAny = typeof navigator !== 'undefined' ? (navigator as any) : {};
  const deviceMem = navAny.deviceMemory ? `${navAny.deviceMemory} GB` : undefined;
  const hwConcurrency = navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} Cores` : undefined;
  const lang = navigator.language || 'en-US';
  let tz = 'UTC';
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {}
  const connType = navAny.connection?.effectiveType ? `${navAny.connection.effectiveType.toUpperCase()}` : undefined;
  const pixelRatio = typeof window !== 'undefined' && window.devicePixelRatio ? `${window.devicePixelRatio}x` : '1x';
  const touch = typeof navigator !== 'undefined' ? (navigator.maxTouchPoints > 0) : false;
  const colorDepth = typeof window !== 'undefined' && window.screen ? `${window.screen.colorDepth}-bit` : '24-bit';
  const platform = typeof navigator !== 'undefined' ? navigator.platform : undefined;

  return {
    browser,
    browserVersion,
    os,
    isMobile,
    summary,
    screenResolution: screenRes,
    viewport,
    deviceMemory: deviceMem,
    hardwareConcurrency: hwConcurrency,
    language: lang,
    timezone: tz,
    connectionType: connType,
    pixelRatio,
    touchSupported: touch,
    colorDepth,
    platform
  };
}

function getOrCreateWebSessionId(): string {
  if (typeof sessionStorage === 'undefined') {
    return 'web_sess_' + Math.random().toString(36).substring(2, 10);
  }
  let sid = sessionStorage.getItem('web_presence_sid');
  if (!sid) {
    sid = 'web_sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
    sessionStorage.setItem('web_presence_sid', sid);
  }
  return sid;
}

export function getOrCreateHardwareId(): string {
  if (typeof localStorage === 'undefined') {
    return 'HWID-WEB-SERVER';
  }
  let hwid = localStorage.getItem('receipt_portal_hwid');
  const isLegacyPlaceholder = !hwid || 
    hwid === 'WEB-CLIENT' || 
    hwid === 'WEB-HWID-CLIENT' || 
    hwid === 'WEB-ADMIN-ADMIN' || 
    hwid.startsWith('WEB-PORTAL') || 
    hwid.startsWith('WEB-GUEST');

  if (isLegacyPlaceholder) {
    const nav: any = typeof navigator !== 'undefined' ? navigator : {};
    const scr: any = typeof window !== 'undefined' ? window.screen : {};
    let tz = 'UTC';
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {}

    // Canvas fingerprint entropy
    let canvasFingerprint = '';
    try {
      if (typeof document !== 'undefined') {
        const canvas = document.createElement('canvas');
        canvas.width = 100;
        canvas.height = 30;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.textBaseline = 'top';
          ctx.font = '14px Arial';
          ctx.fillStyle = '#f60';
          ctx.fillRect(10, 5, 60, 20);
          ctx.fillStyle = '#069';
          ctx.fillText('QuickBooks-HWID', 2, 2);
          canvasFingerprint = canvas.toDataURL().slice(-50);
        }
      }
    } catch {}

    const seed = [
      nav.userAgent || 'Agent',
      scr.width || 1920,
      scr.height || 1080,
      scr.colorDepth || 24,
      scr.pixelDepth || 24,
      nav.hardwareConcurrency || 8,
      nav.deviceMemory || 8,
      nav.platform || 'Desktop',
      tz,
      canvasFingerprint
    ].join('::');

    let hash = 2166136261;
    for (let i = 0; i < seed.length; i++) {
      hash ^= seed.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const hex1 = (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');

    let hash2 = 16777619;
    for (let i = seed.length - 1; i >= 0; i--) {
      hash2 ^= seed.charCodeAt(i);
      hash2 = Math.imul(hash2, 2166136261);
    }
    const hex2 = (hash2 >>> 0).toString(16).toUpperCase().slice(0, 4).padStart(4, '0');

    hwid = `HWID-WEB-${hex1}${hex2}`;
    try {
      localStorage.setItem('receipt_portal_hwid', hwid);
    } catch {}
  }
  return hwid;
}

export async function checkWorkstationBlockStatus(): Promise<{
  blocked: boolean;
  reason?: string;
  blockedAt?: string;
  ip?: string;
  hwid?: string;
}> {
  try {
    const hwid = getOrCreateHardwareId();
    const backendBase = getBackendApiUrl();
    const res = await fetch(`${backendBase}/api/check-blocked?hwid=${encodeURIComponent(hwid)}`, {
      headers: {
        'x-hwid': hwid,
        'Cache-Control': 'no-cache'
      }
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.blocked) {
        localStorage.setItem('receipt_portal_blocked', JSON.stringify(data));
        return data;
      } else {
        localStorage.removeItem('receipt_portal_blocked');
      }
    }
  } catch {}

  try {
    const saved = localStorage.getItem('receipt_portal_blocked');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.blocked) {
        return parsed;
      }
    }
  } catch {}

  return { blocked: false };
}

let cachedIp: string | null = null;

export async function fetchPublicIp(): Promise<string | null> {
  if (cachedIp) return cachedIp;
  // 1. Try local/backend presence IP endpoint first
  try {
    const backendBase = getBackendApiUrl();
    const res = await fetch(`${backendBase}/api/presence/ip`, {
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.ip) {
        cachedIp = String(data.ip).trim();
        return cachedIp;
      }
    }
  } catch {}

  // 2. Try api.ipify.org
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    if (res.ok) {
      const data = await res.json();
      cachedIp = data.ip;
      return data.ip;
    }
  } catch (err) {
    // 3. Fallback to second service
    try {
      const res = await fetch('https://ipapi.co/json/');
      if (res.ok) {
        const data = await res.json();
        cachedIp = data.ip;
        return data.ip;
      }
    } catch {}
  }
  return null;
}

let activeInterval: any = null;
let lastPayload: WebPresencePayload | null = null;

export async function sendPresenceHeartbeat(payload: WebPresencePayload): Promise<void> {
  lastPayload = payload;
  const sys = getBrowserAndOsInfo();
  const sessionId = getOrCreateWebSessionId();
  const clientIp = await fetchPublicIp();
  const hwid = getOrCreateHardwareId();

  const body = {
    sessionId,
    portal: payload.portal,
    userId: payload.userId || (payload.portal === 'ADMIN' ? 'admin' : 'visitor'),
    username: payload.username || (payload.portal === 'ADMIN' ? 'admin' : 'visitor'),
    email: payload.email || '',
    displayName: payload.displayName || (payload.portal === 'ADMIN' ? 'Administrator' : 'Client Guest'),
    companyName: payload.companyName || '',
    plan: payload.plan || (payload.portal === 'ADMIN' ? 'System Administrator' : 'Guest / Visitor'),
    licenseKey: payload.licenseKey || '',
    ip: clientIp || '', // Pass detected IP to worker
    hwid,
    browserInfo: sys.summary,
    browserName: sys.browser,
    browserVersion: sys.browserVersion,
    osName: sys.os,
    isMobile: sys.isMobile,
    deviceCategory: sys.isMobile ? 'Mobile Web' : 'Browser / Web Client',
    screenResolution: sys.screenResolution,
    viewport: sys.viewport,
    deviceMemory: sys.deviceMemory,
    hardwareConcurrency: sys.hardwareConcurrency,
    language: sys.language,
    timezone: sys.timezone,
    connectionType: sys.connectionType,
    pixelRatio: sys.pixelRatio,
    touchSupported: sys.touchSupported,
    colorDepth: sys.colorDepth,
    platform: sys.platform,
    lastActiveRoute: typeof window !== 'undefined' ? (window.location.pathname + (window.location.search ? window.location.search : '')) : '/',
    timestamp: new Date().toISOString()
  };

  // 1. Send to Cloudflare Worker
  try {
    const targetUrl = `${CLOUDFLARE_WORKER_URL}/api/presence/heartbeat`;
    fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true
    }).catch(() => {});
  } catch {}

  // 2. Also send to local backend server
  try {
    const backendBase = getBackendApiUrl();
    fetch(`${backendBase}/api/presence/heartbeat`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-hwid': hwid
      },
      body: JSON.stringify(body),
      keepalive: true
    }).then(async (res) => {
      if (res.status === 403) {
        const data = await res.json().catch(() => null);
        if (data && data.blocked) {
          localStorage.setItem('receipt_portal_blocked', JSON.stringify(data));
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('workstation-blocked', { detail: data }));
          }
        }
      }
    }).catch(() => {});
  } catch {}
}

let lastHeartbeatTime = 0;

/**
 * Starts automated real-time presence heartbeat broadcasting for the active view.
 * Throttled to 60s (with visibility-based pause) to prevent exhausting Cloudflare daily limits.
 */
export function startPresenceTracker(payload: WebPresencePayload): () => void {
  // Send initial heartbeat only once
  const now = Date.now();
  if (now - lastHeartbeatTime >= 30000) {
    lastHeartbeatTime = now;
    sendPresenceHeartbeat(payload);
  }

  if (activeInterval) {
    clearInterval(activeInterval);
  }

  // Ping every 60 seconds (down from hyperactive 5s) while tab is active and visible
  activeInterval = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      lastHeartbeatTime = Date.now();
      sendPresenceHeartbeat(payload);
    }
  }, 60000);

  const handleVisibilityChange = () => {
    // Only send on tab refocus if at least 45 seconds have elapsed since last ping
    if (document.visibilityState === 'visible') {
      const elapsed = Date.now() - lastHeartbeatTime;
      if (elapsed >= 45000) {
        lastHeartbeatTime = Date.now();
        sendPresenceHeartbeat(payload);
      }
    }
  };

  const handleUnload = () => {
    if (lastPayload) {
      try {
        const sys = getBrowserAndOsInfo();
        const sessionId = getOrCreateWebSessionId();
        const body = JSON.stringify({
          sessionId,
          portal: lastPayload.portal,
          status: 'DISCONNECTED',
          browserInfo: sys.summary
        });
        const targetUrl = `${CLOUDFLARE_WORKER_URL}/api/presence/heartbeat`;
        if (navigator.sendBeacon) {
          navigator.sendBeacon(targetUrl, new Blob([body], { type: 'application/json' }));
        }
      } catch {}
    }
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', handleUnload);
  }

  return () => {
    if (activeInterval) clearInterval(activeInterval);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', handleUnload);
    }
  };
}
