// Real-time Web Presence & Live IP Tracking Service
// Broadcasts lightweight heartbeats from active Admin and Client Portal sessions

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

function getBrowserAndOsInfo(): { browser: string; os: string; isMobile: boolean; summary: string } {
  if (typeof navigator === 'undefined') {
    return { browser: 'Browser', os: 'OS', isMobile: false, summary: 'Web Client' };
  }

  const ua = navigator.userAgent;
  let browser = 'Chrome';
  if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('OPR/') || ua.includes('Opera')) browser = 'Opera';

  let os = 'Windows';
  if (ua.includes('Macintosh') || ua.includes('Mac OS')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  else if (ua.includes('Android')) os = 'Android';

  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const summary = `${browser} on ${os}${isMobile ? ' (Mobile)' : ''}`;

  return { browser, os, isMobile, summary };
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

let activeInterval: any = null;
let lastPayload: WebPresencePayload | null = null;

export async function sendPresenceHeartbeat(payload: WebPresencePayload): Promise<void> {
  lastPayload = payload;
  const sys = getBrowserAndOsInfo();
  const sessionId = getOrCreateWebSessionId();

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
    browserInfo: sys.summary,
    isMobile: sys.isMobile,
    deviceCategory: sys.isMobile ? 'Mobile Web' : 'Browser / Web Client',
    timestamp: new Date().toISOString()
  };

  try {
    const targetUrl = `${getBackendApiUrl()}/api/presence/heartbeat`;
    await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true
    });
  } catch (err) {
    // Fail silently without disrupting UI
  }
}

/**
 * Starts automated real-time presence heartbeat broadcasting for the active view.
 */
export function startPresenceTracker(payload: WebPresencePayload): () => void {
  // Send immediately
  sendPresenceHeartbeat(payload);

  if (activeInterval) {
    clearInterval(activeInterval);
  }

  // Ping every 15 seconds while tab is active
  activeInterval = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      sendPresenceHeartbeat(payload);
    }
  }, 15000);

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      sendPresenceHeartbeat(payload);
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
        const targetUrl = `${getBackendApiUrl()}/api/presence/heartbeat`;
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
