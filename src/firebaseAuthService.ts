import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut
} from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

export const SCOPES = [
  'https://www.googleapis.com/auth/drive.file'
];

const provider = new GoogleAuthProvider();
// Request Workspace scopes
SCOPES.forEach(scope => provider.addScope(scope));
provider.addScope('https://www.googleapis.com/auth/userinfo.email');
provider.addScope('https://www.googleapis.com/auth/userinfo.profile');
provider.setCustomParameters({
  prompt: 'select_account consent'
});

// Flag to indicate if we are in the middle of a sign-in flow.
let isSigningIn = false;
// Cache the access token in memory (never in localStorage).
let cachedAccessToken: string | null = null;
let cachedUser: User | { email?: string; uid?: string; displayName?: string } | null = null;

export const getDirectOAuthUrl = (): string => {
  const rootUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://ais-dev-7tlnxttq7bvcilkqujhbtm-397811974491.us-west2.run.app';
  const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
  const redirectUri = `${currentOrigin}${currentPath}`;
  
  const options = {
    client_id: firebaseConfig.oAuthClientId,
    redirect_uri: redirectUri,
    response_type: 'token',
    prompt: 'select_account consent',
    scope: `${SCOPES.join(' ')} https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile`
  };
  const qs = new URLSearchParams(options);
  return `${rootUrl}?${qs.toString()}`;
};

/**
 * Initialize auth state listener and check for OAuth tokens in URL hash.
 */
export const initAuth = (
  onAuthSuccess?: (user: any, token: string) => void,
  onAuthFailure?: () => void
) => {
  // Check for direct OAuth token in URL hash (when returning from redirect or popup)
  if (typeof window !== 'undefined' && window.location.hash) {
    try {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const hashToken = hashParams.get('access_token');
      if (hashToken) {
        cachedAccessToken = hashToken;
        // Clean URL hash without triggering full page refresh
        const cleanUrl = window.location.pathname + window.location.search;
        window.history.replaceState(null, '', cleanUrl);

        fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${encodeURIComponent(hashToken)}`)
          .then(res => res.json())
          .then(info => {
            if (info && info.email) {
              const u = { email: info.email, uid: info.user_id || 'google_user', displayName: info.email.split('@')[0] };
              cachedUser = u;
              if (onAuthSuccess) onAuthSuccess(u, hashToken);
            } else if (onAuthSuccess) {
              onAuthSuccess({ email: 'Authorized Account', uid: 'google_user' }, hashToken);
            }
          })
          .catch(() => {
            if (onAuthSuccess) onAuthSuccess({ email: 'Authorized Account', uid: 'google_user' }, hashToken);
          });
      }
    } catch (e) {
      console.warn('URL hash parse note:', e);
    }
  }

  // Check for redirect result if returning from signInWithRedirect
  getRedirectResult(auth)
    .then((result) => {
      if (result) {
        const credential = GoogleAuthProvider.credentialFromResult(result);
        if (credential?.accessToken) {
          cachedAccessToken = credential.accessToken;
          cachedUser = result.user;
          if (onAuthSuccess) onAuthSuccess(result.user, cachedAccessToken);
        }
      }
    })
    .catch((err) => {
      console.warn('getRedirectResult notice:', err);
    });

  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      cachedUser = user;
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      if (!cachedAccessToken) {
        cachedUser = null;
        if (onAuthFailure) onAuthFailure();
      }
    }
  });
};

/**
 * Triggers Google Sign-In with standard popup and robust direct OAuth window fallback
 */
export const googleSignIn = async (): Promise<{ user: any; email?: string; accessToken: string } | null> => {
  isSigningIn = true;
  try {
    try {
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.accessToken) {
        throw new Error('Failed to get access token from Firebase Auth');
      }
      cachedAccessToken = credential.accessToken;
      cachedUser = result.user;
      return {
        user: result.user,
        email: result.user.email || undefined,
        accessToken: cachedAccessToken
      };
    } catch (popupErr: any) {
      console.warn('Popup blocked or restricted in environment, opening direct OAuth window...', popupErr?.code || popupErr?.message);
      
      const directUrl = getDirectOAuthUrl();
      // Open direct Google OAuth dialog in a clean new browser tab/window
      const authWindow = window.open(directUrl, '_blank');
      
      if (!authWindow || authWindow.closed || typeof authWindow.closed === 'undefined') {
        // Fallback to top-level navigation if popup was completely blocked
        if (window.top && window.top !== window) {
          window.top.location.href = directUrl;
        } else {
          window.location.href = directUrl;
        }
      }
      return null;
    }
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const setManualAccessToken = (token: string, email?: string): { email?: string; accessToken: string } => {
  cachedAccessToken = token.trim();
  if (email) cachedUser = { email, uid: 'manual_user' };
  return { email, accessToken: cachedAccessToken };
};

export const getAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const logoutGoogle = async () => {
  try {
    await signOut(auth);
  } catch {}
  cachedAccessToken = null;
  cachedUser = null;
};
