import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, onAuthStateChanged, User, signOut } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

export const SCOPES = [
  'https://www.googleapis.com/auth/drive.file'
];

const provider = new GoogleAuthProvider();
// Request Workspace scopes
SCOPES.forEach(scope => provider.addScope(scope));
provider.setCustomParameters({
  prompt: 'select_account consent'
});

// Flag to indicate if we are in the middle of a sign-in flow.
let isSigningIn = false;
// Cache the access token in memory.
let cachedAccessToken: string | null = null;
let cachedUser: User | null = null;

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
      cachedAccessToken = null;
      cachedUser = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

/**
 * Triggers Google Sign-In with standard Firebase Auth popup and redirect fallback
 */
export const googleSignIn = async (): Promise<{ user: User; email?: string; accessToken: string } | null> => {
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
      if (popupErr?.code === 'auth/popup-blocked') {
        console.log('Popup blocked, falling back to signInWithRedirect...');
        await signInWithRedirect(auth, provider);
        return null;
      }
      throw popupErr;
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
  return { email, accessToken: cachedAccessToken };
};

export const getAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const getDirectOAuthUrl = (): string => {
  const rootUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
  const options = {
    redirect_uri: `https://${firebaseConfig.authDomain}/__/auth/handler`,
    client_id: firebaseConfig.oAuthClientId,
    response_type: 'token',
    prompt: 'select_account consent',
    scope: SCOPES.join(' ')
  };
  const qs = new URLSearchParams(options);
  return `${rootUrl}?${qs.toString()}`;
};

export const logoutGoogle = async () => {
  try {
    await signOut(auth);
  } catch {}
  cachedAccessToken = null;
  cachedUser = null;
};
