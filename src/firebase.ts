import { initializeApp, getApps } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  signInAnonymously,
  signInWithCredential,
  User
} from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getStorage, ref, getDownloadURL, uploadBytes } from 'firebase/storage';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';

// Initialisation native de GoogleAuth pour Capacitor
if (Capacitor.isNativePlatform()) {
  GoogleAuth.initialize({
    clientId: '969613404131-ah3fjr02qib6tgfuvpgjak6k39kdjvjp.apps.googleusercontent.com',
  });
}

// Import the Firebase configuration
import configData from '../firebase-applet-config.json';

// Provide fallback config for dev/build stages where json is empty or missing properties
const hasValidConfig = configData && configData.apiKey && configData.projectId && configData.apiKey !== "YOUR_API_KEY";

if (hasValidConfig) {
  console.log("Firebase initialized using real configData json config.");
} else {
  console.warn("Firebase configData lacks valid credentials. Falling back to env variables or dummy keys.");
}

const firebaseConfig: any = hasValidConfig ? configData : {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "dummy_api_key",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "dummy.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "dummy",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "dummy.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "0",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:0:web:0",
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID || ""
};

if (firebaseConfig.apiKey === "dummy_api_key" || !firebaseConfig.apiKey) {
  console.error("CRITICAL CONFIGURATION ERROR: No Firebase API Key was resolved. Use `npm run android:build` to embed the correct config.");
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);

// Initialize Firestore with persistent cache
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
}, firebaseConfig.firestoreDatabaseId);

let storageInstance: any = null;
try {
  storageInstance = getStorage(app);
  console.log("Firebase Storage initialized successfully with bucket:", firebaseConfig.storageBucket);
} catch (e) {
  console.warn("Firebase Storage is not configured or failed to initialize", e);
}
export const storage = storageInstance;

export const googleProvider = new GoogleAuthProvider();

import { uploadToCloudinary } from './services/cloudinaryService';

export const uploadImage = async (file: Blob, filePath: string, onProgress?: (progress: number) => void) => {
  const useCloudinary = !!import.meta.env.VITE_CLOUDINARY_CLOUD_NAME && !!import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;
  if (useCloudinary) {
    console.log("Upload via Cloudinary...");
    return await uploadToCloudinary(file, onProgress);
  }
  
  if (!storage) {
    throw new Error("Firebase Storage n'est pas initialisé et Cloudinary n'est pas configuré.");
  }

  console.log("Upload via Firebase Storage...");
  if (onProgress) onProgress(10);
  
  const storageRef = ref(storage, filePath);
  
  // We use uploadBytes since uploadBytesResumable might not be imported or needed 
  // (or we can just skip exact progress updates for simple uploadBytes)
  await uploadBytes(storageRef, file);
  if (onProgress) onProgress(80);
  
  const url = await getDownloadURL(storageRef);
  if (onProgress) onProgress(100);
  
  return url;
};

let isSigningIn = false;

export const signInWithGoogle = async () => {
  if (isSigningIn) {
    console.log("Authentification en cours, veuillez patienter...");
    return null;
  }
  
  isSigningIn = true;
  const isNative = Capacitor.isNativePlatform();
  try {
    googleProvider.setCustomParameters({
      prompt: 'select_account'
    });

    if (isNative) {
      console.log("Environnement Natif détecté - Tentative d'authentification native Google");
      try {
        const user = await GoogleAuth.signIn();
        if (!user || !user.authentication.idToken) {
          throw new Error("Échec de l'authentification native : Pas d'idToken reçu.");
        }
        
        const credential = GoogleAuthProvider.credential(user.authentication.idToken);
        const result = await signInWithCredential(auth, credential);
        console.log("Authentification native réussie");
        return result.user;
      } catch (e: any) {
        let msg = "Erreur GoogleAuth native inconnue";
        if (e && typeof e === 'object' && e.message) {
          msg = e.message;
        } else if (typeof e === 'string') {
          msg = e;
        } else {
          msg = JSON.stringify(e);
        }
        console.error("Erreur GoogleAuth native formatée:", msg);
        throw new Error(msg);
      }
    }

    // Pour le web (preview et navigateur), on tente d'abord signInWithPopup
    try {
      const result = await signInWithPopup(auth, googleProvider);
      return result.user;
    } catch (popupError: any) {
      console.log("Résultat Popup Auth:", popupError.code);
      
      // Si le popup est bloqué par le navigateur
      if (popupError.code === 'auth/popup-blocked') {
        // En preview AI Studio, on évite le redirect automatique car il cause souvent des 403
        // On informe l'utilisateur
        window.dispatchEvent(new CustomEvent('app-notify', { 
          detail: { message: "La fenêtre de connexion a été bloquée. Veuillez autoriser les popups pour continuer.", type: 'error' } 
        }));
        return null;
      }
      
      // Si l'utilisateur a fermé le popup, on ne fait rien de spécial
      if (popupError.code === 'auth/popup-closed-by-user') {
        console.log("Popup fermé par l'utilisateur.");
        return null;
      }

      // On ne tente signInWithRedirect que si on n'est pas dans un iframe, car il échoue souvent en preview
      if (window.self === window.top) {
        console.log("Tentative de fallback redirect hors iframe...");
        try {
          await signInWithRedirect(auth, googleProvider);
        } catch (redirectErr) {
          console.error("Erreur de fallback redirect:", redirectErr);
        }
      } else {
        console.warn("Redirection bloquée par sécurité car l'application est dans un iframe (preview). Utilisez le mode popup.");
      }
      
      return null;
    }
  } catch (error: any) {
    if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
      console.log("La fenêtre d'authentification a été fermée ou annulée.");
      return null;
    } else if (error.code === 'auth/unauthorized-domain') {
      const currentDomain = window.location.hostname;
      console.warn(`ERREUR : Ce domaine (${currentDomain}) n'est pas autorisé dans votre console Firebase.`);
    } else if (isNative && error.code === 'auth/no-auth-event') {
      return null;
    } else {
      console.error("Détails de l'erreur Firebase Auth:", error);
      // On évite l'alert bloquante si possible, ou on donne plus de contexte
      const msg = `Erreur d'authentification (${error.code}) : ${error.message}. Vérifiez que Google est activé dans Firebase et que localhost est autorisé.`;
      console.error(msg);
      if (!isNative) alert(msg);
    }
    throw error;
  } finally {
    isSigningIn = false;
  }
};

let redirectResultPromise: Promise<User | null> | null = null;
let isRedirectChecking = false;

export const checkRedirectResult = async () => {
  // If we are already connected, no need to check
  if (auth.currentUser) return auth.currentUser;
  
  if (isRedirectChecking) return redirectResultPromise;
  if (redirectResultPromise) return redirectResultPromise;
  
  isRedirectChecking = true;
  redirectResultPromise = (async () => {
    try {
      // Small delay to ensure and stabilize auth state
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Double check if user signed in while waiting
      if (auth.currentUser) return auth.currentUser;
      
      const result = await getRedirectResult(auth);
      console.log("Redirect Result check finished:", result?.user?.email || "No user");
      return result?.user || null;
    } catch (error: any) {
      // Only log significant errors
      if (error.code !== 'auth/no-auth-event' && error.name !== 'AuthError') {
        console.warn("Erreur mineure Redirect Result (souvent bénigne):", error.code || error.message);
      }
      return null;
    } finally {
      isRedirectChecking = false;
      // We don't nullify redirectResultPromise here to keep it cached for components
    }
  })();
  
  return redirectResultPromise;
};

export const registerWithEmail = async (email: string, pass: string, displayName: string) => {
  const result = await createUserWithEmailAndPassword(auth, email, pass);
  await updateProfile(result.user, { displayName });
  await sendEmailVerification(result.user);
  return result.user;
};

export const loginWithEmail = async (email: string, pass: string) => {
  const result = await signInWithEmailAndPassword(auth, email, pass);
  return result.user;
};

export const loginAsGuest = async () => {
  const result = await signInAnonymously(auth);
  return result.user;
};

export const resetPassword = async (email: string) => {
  await sendPasswordResetEmail(auth, email);
};

export const logout = () => signOut(auth);

// Test connection
export function isNetworkOfflineError(error: any): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  return (
    code === 'unavailable' ||
    code === 'unreachable' ||
    message.includes('unavailable') ||
    message.includes('Could not reach') ||
    message.includes('offline') ||
    message.includes('network') ||
    message.includes('unreachable') ||
    message.includes('Connection failed') ||
    message.includes('failed to connect')
  );
}

export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (isNetworkOfflineError(error)) {
      console.warn("Firestore est en cours de fonctionnement hors-ligne.");
    } else {
      console.error("Erreur de connexion Firebase active:", error);
    }
    throw error;
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  isQuotaError: boolean;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const isQuotaError = errorMessage.includes('Quota exceeded') || errorMessage.includes('quota limit exceeded');
  const isOffline = isNetworkOfflineError(error);
  
  const errInfo: FirestoreErrorInfo = {
    error: errorMessage,
    isQuotaError,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email || undefined,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.warn('Firestore Event/Warn: ', JSON.stringify(errInfo));
  
  if (isQuotaError) {
    alert("Quota Firestore dépassé. L'application passera en mode lecture seule jusqu'à demain.");
  } else if (isOffline) {
    // Silent fail for network issues - persistence local handles this perfectly!
    console.log("Firestore en mode cache/hors-ligne de manière transparente.");
  } else if (errorMessage.includes('Missing or insufficient permissions')) {
    alert("Erreur de permissions : Vous n'avez pas l'autorisation d'effectuer cette action. Vérifiez que votre compte est approuvé.");
  } else {
    alert("Erreur de base de données : " + errorMessage);
  }
  
  throw new Error(JSON.stringify(errInfo));
}
