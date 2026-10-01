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

declare global {
  interface Window {
    google?: any;
  }
}

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

export const SCOPES = [
  'https://www.googleapis.com/auth/drive.file'
];

const provider = new GoogleAuthProvider();
SCOPES.forEach(scope => provider.addScope(scope));
provider.setCustomParameters({
  prompt: 'select_account'
});

// Flag to indicate if we are in the middle of a sign-in flow.
let isSigningIn = false;
// Cache the access token in memory (never in localStorage).
let cachedAccessToken: string | null = null;
let cachedUser: User | null = null;
let cachedUserEmail: string | null = null;

/**
 * Initialize auth state listener.
 */
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  // Check for redirect result if returning from signInWithRedirect
  getRedirectResult(auth)
    .then((result) => {
      if (result) {
        const credential = GoogleAuthProvider.credentialFromResult(result);
        if (credential?.accessToken) {
          cachedAccessToken = credential.accessToken;
          cachedUser = result.user;
          cachedUserEmail = result.user.email || null;
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
      if (user.email) cachedUserEmail = user.email;
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        // user is signed into Firebase but needs OAuth token for Drive
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      if (!cachedAccessToken) {
        cachedUser = null;
        cachedUserEmail = null;
        if (onAuthFailure) onAuthFailure();
      }
    }
  });
};

/**
 * Request Google Drive OAuth Token via Google Identity Services (GIS)
 * Works directly in iframe / preview containers without standard Firebase popup blocking issues.
 */
export const requestGoogleTokenViaGIS = (): Promise<{ accessToken: string; email?: string } | null> => {
  return new Promise((resolve, reject) => {
    try {
      const executeInit = () => {
        if (!window.google?.accounts?.oauth2) {
          reject(new Error('Google Identity Services library is not loaded.'));
          return;
        }

        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: firebaseConfig.oAuthClientId,
          scope: SCOPES.join(' '),
          prompt: 'select_account',
          callback: async (tokenResponse: any) => {
            if (tokenResponse?.error) {
              console.warn('GIS Token Error:', tokenResponse.error, tokenResponse.error_description);
              reject(new Error(`Google OAuth error: ${tokenResponse.error_description || tokenResponse.error}`));
              return;
            }

            if (tokenResponse?.access_token) {
              cachedAccessToken = tokenResponse.access_token;
              let email: string | undefined;
              try {
                const infoRes = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${encodeURIComponent(tokenResponse.access_token)}`);
                if (infoRes.ok) {
                  const infoData = await infoRes.json();
                  email = infoData.email;
                  if (email) cachedUserEmail = email;
                }
              } catch (e) {
                console.warn('Tokeninfo fetch note:', e);
              }
              resolve({ accessToken: tokenResponse.access_token, email });
            } else {
              resolve(null);
            }
          },
          error_callback: (err: any) => {
            console.error('GIS Error Callback:', err);
            reject(new Error(err?.message || 'Google Sign-In was closed or blocked.'));
          }
        });

        client.requestAccessToken();
      };

      if (!window.google?.accounts?.oauth2) {
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.onload = () => executeInit();
        script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
        document.head.appendChild(script);
      } else {
        executeInit();
      }
    } catch (err) {
      reject(err);
    }
  });
};

/**
 * Triggers Google Sign-In with standard Firebase Auth popup and seamless GIS fallback
 */
export const googleSignIn = async (): Promise<{ user?: User; email?: string; accessToken: string } | null> => {
  isSigningIn = true;
  try {
    // 1. Try Firebase Auth signInWithPopup
    try {
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        cachedAccessToken = credential.accessToken;
        cachedUser = result.user;
        cachedUserEmail = result.user.email || null;
        return {
          user: result.user,
          email: result.user.email || undefined,
          accessToken: cachedAccessToken
        };
      }
    } catch (popupErr: any) {
      console.warn('Firebase popup sign-in encountered an issue, trying Google Identity Services:', popupErr?.code || popupErr?.message);
    }

    // 2. Fallback to Google Identity Services Token Client
    try {
      const gisResult = await requestGoogleTokenViaGIS();
      if (gisResult?.accessToken) {
        cachedAccessToken = gisResult.accessToken;
        if (gisResult.email) cachedUserEmail = gisResult.email;
        return {
          email: gisResult.email,
          accessToken: gisResult.accessToken
        };
      }
    } catch (gisErr: any) {
      console.error('GIS sign-in error:', gisErr);
      throw gisErr;
    }

    return null;
  } catch (error: any) {
    console.error('Sign in final error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

/**
 * Validates any Google OAuth 2.0 Access Token with Google's tokeninfo API
 */
export const validateGoogleAccessToken = async (token: string): Promise<{ valid: boolean; email?: string; expiresIn?: number; error?: string }> => {
  try {
    const cleanToken = token.trim();
    if (!cleanToken) return { valid: false, error: 'Access token cannot be empty.' };

    const res = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${encodeURIComponent(cleanToken)}`);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { valid: false, error: errData.error_description || 'Invalid or expired Google Access Token.' };
    }

    const data = await res.json();
    cachedAccessToken = cleanToken;
    if (data.email) cachedUserEmail = data.email;

    return {
      valid: true,
      email: data.email,
      expiresIn: data.expires_in
    };
  } catch (err: any) {
    return { valid: false, error: err?.message || 'Failed to communicate with Google authentication servers.' };
  }
};

export const setManualAccessToken = (token: string, email?: string): { email?: string; accessToken: string } => {
  cachedAccessToken = token.trim();
  if (email) cachedUserEmail = email;
  return { email: cachedUserEmail || undefined, accessToken: cachedAccessToken };
};

export const getAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const getCachedEmail = (): string | null => {
  return cachedUserEmail || cachedUser?.email || null;
};

export const logoutGoogle = async () => {
  try {
    await signOut(auth);
  } catch {}
  cachedAccessToken = null;
  cachedUser = null;
  cachedUserEmail = null;
};
