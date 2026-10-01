import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

export const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
];

const provider = new GoogleAuthProvider();
// Request Workspace scopes
SCOPES.forEach(scope => provider.addScope(scope));
provider.setCustomParameters({
  prompt: 'select_account'
});

// Flag to indicate if we are in the middle of a sign-in flow.
let isSigningIn = false;
// Cache the access token in memory.
let cachedAccessToken: string | null = null;
let cachedUserEmail: string | null = null;

/**
 * Initialize auth state listener.
 */
export const initAuth = (
  onAuthSuccess?: (user: User | { email?: string; displayName?: string }, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        cachedUserEmail = user.email || cachedUserEmail;
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        if (!cachedAccessToken) {
          if (onAuthFailure) onAuthFailure();
        }
      }
    } else {
      if (cachedAccessToken && cachedUserEmail) {
        if (onAuthSuccess) {
          onAuthSuccess({ email: cachedUserEmail, displayName: cachedUserEmail.split('@')[0] }, cachedAccessToken);
        }
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        cachedUserEmail = null;
        if (onAuthFailure) onAuthFailure();
      }
    }
  });
};

declare global {
  interface Window {
    google?: any;
  }
}

/**
 * Fallback to Google Identity Services Token Client (GIS)
 * Used if Firebase Auth popup is blocked or restricted in iframe
 */
export const requestGoogleTokenViaGIS = (): Promise<{ accessToken: string; email?: string } | null> => {
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      return reject(new Error('Google Identity Services SDK is not loaded. Please verify connection.'));
    }

    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: firebaseConfig.oAuthClientId,
        scope: SCOPES.join(' '),
        prompt: 'select_account',
        callback: async (resp: any) => {
          if (resp.error) {
            console.warn('GIS Token Error:', resp);
            return reject(new Error(resp.error_description || resp.error || 'Google authorization failed'));
          }
          if (resp.access_token) {
            cachedAccessToken = resp.access_token;
            let email = '';
            try {
              const userinfo = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { Authorization: `Bearer ${resp.access_token}` }
              });
              if (userinfo.ok) {
                const data = await userinfo.json();
                email = data.email || '';
              }
            } catch {}
            cachedUserEmail = email || null;
            resolve({ accessToken: resp.access_token, email });
          } else {
            reject(new Error('No access token returned from Google'));
          }
        },
        error_callback: (err: any) => {
          console.warn('GIS Error Callback:', err);
          reject(new Error(err?.message || 'Google Sign-In was blocked or cancelled'));
        }
      });

      client.requestAccessToken({ prompt: 'select_account' });
    } catch (e: any) {
      reject(e);
    }
  });
};

/**
 * Triggers Google Sign-In with automatic popup and GIS fallback
 */
export const googleSignIn = async (): Promise<{ user?: User | { email?: string; displayName?: string }; email?: string; accessToken: string } | null> => {
  isSigningIn = true;
  try {
    // Strategy 1: If GIS is ready, trigger it synchronously inside user click event
    if (window.google?.accounts?.oauth2) {
      try {
        const gisRes = await requestGoogleTokenViaGIS();
        if (gisRes?.accessToken) {
          cachedAccessToken = gisRes.accessToken;
          cachedUserEmail = gisRes.email || null;
          return {
            user: gisRes.email ? { email: gisRes.email, displayName: gisRes.email.split('@')[0] } : undefined,
            email: gisRes.email,
            accessToken: gisRes.accessToken
          };
        }
      } catch (gisErr: any) {
        console.warn('GIS sign-in error, falling back to Firebase Auth popup:', gisErr);
        // If GIS failed due to prompt cancelled by user, let's still try Firebase popup or re-throw
        if (gisErr?.message?.includes('cancelled') || gisErr?.message?.includes('closed')) {
          throw gisErr;
        }
      }
    }

    // Strategy 2: Firebase Auth signInWithPopup
    try {
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.accessToken) {
        throw new Error('Failed to get access token from Firebase Auth');
      }
      cachedAccessToken = credential.accessToken;
      cachedUserEmail = result.user.email || null;
      return {
        user: result.user,
        email: result.user.email || undefined,
        accessToken: cachedAccessToken
      };
    } catch (firebaseErr: any) {
      console.warn('Firebase signInWithPopup failed:', firebaseErr);
      throw firebaseErr;
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
  cachedUserEmail = email || null;
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
  cachedUserEmail = null;
};
