import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import {
  Auth,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  getAuth,
  inMemoryPersistence,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  setPersistence,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
} from 'firebase/auth';
import { doc, Firestore, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Single centralized primary Firebase initialization
const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export const FIREBASE_CONSOLE_AUTH_PROVIDERS_URL = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/providers`;

export {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
};

let persistenceConfiguredPromise: Promise<void> | null = null;

export function ensureAuthPersistence(): Promise<void> {
  if (!persistenceConfiguredPromise) {
    persistenceConfiguredPromise = setPersistence(auth, browserLocalPersistence).catch((err) => {
      console.warn('Firebase persistence fallback:', err);
    });
  }
  return persistenceConfiguredPromise;
}

ensureAuthPersistence();

// Validate connection to Firestore on boot
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

// Secondary Firebase App instance used exclusively by ADMIN to provision new users
// via createUserWithEmailAndPassword without disconnecting the active Admin session (Section 15)
const SECONDARY_ADMIN_APP_NAME = 'SigcoAdminUserProvisioningApp';

export async function createUserInFirebaseAuthWithoutLoggingOutAdmin(
  email: string,
  initialPassword: string
): Promise<string> {
  const existingSecondary = getApps().find((a) => a.name === SECONDARY_ADMIN_APP_NAME);
  const secondaryApp =
    existingSecondary || initializeApp(firebaseConfig, SECONDARY_ADMIN_APP_NAME);
  const secondaryAuth = getAuth(secondaryApp);
  await setPersistence(secondaryAuth, inMemoryPersistence);

  const userCredential = await createUserWithEmailAndPassword(
    secondaryAuth,
    email.trim().toLowerCase(),
    initialPassword
  );
  const createdUid = userCredential.user.uid;
  await signOut(secondaryAuth);
  return createdUid;
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
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: boolean | string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function getFriendlyErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (raw.includes('permission-denied') || raw.includes('Missing or insufficient permissions')) {
    if (!auth.currentUser) {
      return 'No modo de desenvolvimento sem login institucional ativo, gravações no Cloud Firestore são restritas pelas regras de segurança (firestore.rules). Para persistência permanente na nuvem, acesse com uma conta institucional autorizada.';
    }
    return 'Você não possui permissão para realizar esta ação.';
  }
  if (raw.includes('Quota exceeded')) {
    return 'Limite diário de operações do banco atingido. Tente novamente mais tarde.';
  }
  if (raw.includes('offline') || raw.includes('network')) {
    return 'Não foi possível salvar as informações. Verifique sua conexão e tente novamente.';
  }
  if (raw.includes('auth/email-already-in-use')) {
    return 'Este e-mail institucional já possui uma conta cadastrada no SIGCO.';
  }
  if (raw.includes('auth/weak-password')) {
    return 'A senha deve possuir pelo menos 8 caracteres.';
  }
  if (raw.includes('auth/wrong-password') || raw.includes('auth/invalid-credential')) {
    return 'Senha atual ou credencial inválida. Verifique os dados informados.';
  }
  if (raw.includes('auth/operation-not-allowed')) {
    return 'O provedor E-mail/Senha precisa ser ativado no Console do Firebase Authentication deste projeto.';
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.error) {
      if (
        String(parsed.error).includes('permission-denied') ||
        String(parsed.error).includes('Missing or insufficient permissions')
      ) {
        return 'Você não possui permissão para realizar esta ação.';
      }
    }
  } catch {
    // Not a JSON error message
  }
  return 'Não foi possível concluir a operação. Verifique os dados informados e tente novamente.';
}
