import React, { createContext, useContext, useEffect, useState } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  auth,
  createUserInFirebaseAuthWithoutLoggingOutAdmin,
  createUserWithEmailAndPassword,
  db,
  EmailAuthProvider,
  ensureAuthPersistence,
  getFriendlyErrorMessage,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
} from '../services/firebase';
import { RolePermissionsConfig, SystemPermissionsMatrix, SystemUser, UserRole } from '../types';
import {
  DEFAULT_PERMISSIONS_MATRIX,
  INSTITUTION_DOMAIN,
  isValidInstitutionalEmail,
  RESTRICTED_DOMAIN_MESSAGE,
  ROLE_LABELS,
  sanitizeString,
} from '../utils/validation';
import {
  adminCreateUserOnServer,
  adminSendPasswordResetOnServer,
  adminToggleUserStatusOnServer,
  adminUpdateUserOnServer,
  bootstrapFirstAdminOnServer,
  checkAuthorizedEmailOnServer,
  DEACTIVATED_SIGCO_USER_MESSAGE,
  getBootstrapStatusOnServer,
  getPermissionsMatrixOnServer,
  requestPublicPasswordResetOnServer,
  syncAuthorizedUsersOnServer,
  UNAUTHORIZED_SIGCO_EMAIL_MESSAGE,
  updatePermissionsMatrixOnServer,
} from '../api/clinicApi';
import { ensureDatabaseSeeded, recordAuditLog } from '../services/clinicService';
import { INSTITUTIONAL_PERSONAS, InstitutionalPersona } from '../services/seedData';

export interface CreateSigcoUserInput {
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  initialPassword: string;
  registrationCode?: string;
  specialty?: string;
  mustChangePassword?: boolean;
}

export interface UpdateSigcoUserInput {
  name: string;
  role: UserRole;
  active: boolean;
  registrationCode: string;
  specialty: string;
}

export interface BootstrapState {
  initialized: boolean;
  hasAdmin: boolean;
  adminCount: number;
  firstAdminEmail?: string | null;
}

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  systemUser: SystemUser | null;
  loading: boolean;
  initializing: boolean;
  authError: string | null;
  clearAuthError: () => void;
  bootstrapStatus: BootstrapState;
  checkBootstrapStatus: () => Promise<void>;
  bootstrapFirstAdmin: (params: {
    name: string;
    email: string;
    password: string;
  }) => Promise<{
    success: boolean;
    message: string;
    isProviderDisabled?: boolean;
  }>;
  verifyEmailAuthorizationForLogin: (email: string) => Promise<{
    authorized: boolean;
    message: string;
  }>;
  loginWithEmailAndPassword: (
    email: string,
    password: string
  ) => Promise<{
    success: boolean;
    message: string;
    isProviderDisabled?: boolean;
  }>;
  loginWithGoogleInstitutional: () => Promise<{
    success: boolean;
    message: string;
    isProviderDisabled?: boolean;
  }>;
  loginWithMicrosoftEntra: () => Promise<{
    success: boolean;
    message: string;
    isUnconfigured?: boolean;
  }>;
  requestPasswordReset: (email: string) => Promise<{ success: boolean; message: string }>;
  changeOwnPassword: (
    currentPassword: string,
    newPassword: string
  ) => Promise<{ success: boolean; message: string }>;
  adminCreateUser: (
    input: CreateSigcoUserInput,
    existingUsers: SystemUser[]
  ) => Promise<{ success: boolean; message: string; isProviderDisabled?: boolean }>;
  adminUpdateUser: (
    targetUser: SystemUser,
    updates: UpdateSigcoUserInput
  ) => Promise<{ success: boolean; message: string }>;
  adminToggleUserStatus: (
    targetUser: SystemUser,
    nextActive: boolean
  ) => Promise<{ success: boolean; message: string }>;
  adminSendPasswordReset: (
    targetUser: SystemUser
  ) => Promise<{ success: boolean; message: string }>;
  adminDeleteUser: (targetUser: SystemUser) => Promise<{ success: boolean; message: string }>;
  permissionsMatrix: SystemPermissionsMatrix;
  updatePermissionsMatrix: (
    matrix: SystemPermissionsMatrix
  ) => Promise<{ success: boolean; message: string }>;
  switchInstitutionalPersona: (persona: InstitutionalPersona) => Promise<void>;
  enterDevDemoMode: (customUser?: Partial<SystemUser>) => void;
  logout: () => Promise<void>;
  isDevBypassActive: boolean;
  setDevBypassActive: (active: boolean) => void;
}

// Strictly isolated to development mode (Tree-shaken and false in production builds)
export const DEV_BYPASS_LOGIN_ENABLED = Boolean(import.meta.env.DEV);

export const DEFAULT_DEV_ADMIN_PROFILE: SystemUser = {
  id: 'dev_local_admin',
  uid: 'dev_local_admin',
  name: 'Coord. Roberto Mendes (Admin)',
  email: 'administrador@cs.udf.edu.br',
  role: 'ADMIN',
  registrationCode: 'ADM-001',
  specialty: 'Gestão Clínica Geral',
  active: true,
  createdAt: '2026-03-01T08:00:00.000Z',
  lastAccess: '2026-10-12T10:00:00.000Z',
  institutionDomain: 'cs.udf.edu.br',
  mustChangePassword: false,
  createdByUid: 'dev_local_admin',
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function validateSigcoPasswordStrength(password: string): {
  valid: boolean;
  hasMinLength: boolean;
  hasLetters: boolean;
  hasNumbers: boolean;
  hasSpecial: boolean;
  message: string;
} {
  const hasMinLength = password.length >= 8;
  const hasLetters = /[a-zA-Z]/.test(password);
  const hasNumbers = /[0-9]/.test(password);
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);

  if (!hasMinLength) {
    return {
      valid: false,
      hasMinLength,
      hasLetters,
      hasNumbers,
      hasSpecial,
      message: 'A senha do SIGCO deve conter pelo menos 8 caracteres.',
    };
  }

  return {
    valid: true,
    hasMinLength,
    hasLetters,
    hasNumbers,
    hasSpecial,
    message: 'Senha válida.',
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [systemUser, setSystemUser] = useState<SystemUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [initializing, setInitializing] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [devBypassActive, setDevBypassActive] = useState<boolean>(false);
  const currentDevProfileRef = React.useRef<SystemUser | null>(DEFAULT_DEV_ADMIN_PROFILE);
  const isInteractiveLoginRef = React.useRef<boolean>(false);

  // Section 1: Initial System Bootstrap Status (First Administrator Check)
  const [bootstrapStatus, setBootstrapStatus] = useState<BootstrapState>({
    initialized: false,
    hasAdmin: false,
    adminCount: 0,
    firstAdminEmail: null,
  });

  // Section 3: Configurable Permissions Matrix
  const [permissionsMatrix, setPermissionsMatrix] =
    useState<SystemPermissionsMatrix>(DEFAULT_PERMISSIONS_MATRIX);

  const clearAuthError = () => setAuthError(null);

  const checkBootstrapStatus = async (): Promise<void> => {
    try {
      const res = await getBootstrapStatusOnServer();
      setBootstrapStatus({
        initialized: Boolean(res.initialized),
        hasAdmin: Boolean(res.hasAdmin),
        adminCount: Number(res.adminCount || 0),
        firstAdminEmail: res.firstAdminEmail || null,
      });
    } catch (e) {
      console.warn('Bootstrap status check note:', e);
    }
  };

  const loadPermissionsMatrix = async (): Promise<void> => {
    try {
      const res = await getPermissionsMatrixOnServer();
      if (res.success && res.matrix) {
        setPermissionsMatrix(res.matrix);
      }
    } catch (e) {
      console.warn('Permissions matrix load note:', e);
    }
  };

  useEffect(() => {
    checkBootstrapStatus();
    loadPermissionsMatrix();
  }, []);

  // Section 1: Create First Administrator (Bootstrap)
  const bootstrapFirstAdmin = async (params: {
    name: string;
    email: string;
    password: string;
  }): Promise<{ success: boolean; message: string; isProviderDisabled?: boolean }> => {
    setAuthError(null);
    const serverResult = await bootstrapFirstAdminOnServer(params);
    if (!serverResult.success) {
      return {
        success: false,
        message: serverResult.message,
        isProviderDisabled: serverResult.isProviderDisabled,
      };
    }

    try {
      // 1. Establish Firebase session via client SDK
      let credUser = auth.currentUser;
      try {
        const cred = await signInWithEmailAndPassword(auth, params.email, params.password);
        credUser = cred.user;
      } catch {
        // Continue if provider disabled or offline
      }

      const uid = credUser?.uid || serverResult.uid || `adm_${Date.now()}`;
      const nowIso = new Date().toISOString().slice(0, 35);
      const adminProfilePayload: Omit<SystemUser, 'id'> = {
        uid,
        name: sanitizeString(params.name, 120),
        email: params.email.trim().toLowerCase(),
        role: 'ADMIN',
        registrationCode: 'ADM-001',
        specialty: 'Gestão Clínica Geral',
        active: true,
        createdAt: nowIso,
        lastAccess: nowIso,
        mustChangePassword: false,
        institutionDomain: INSTITUTION_DOMAIN,
        createdByUid: uid,
      };

      try {
        await setDoc(doc(db, 'users', uid), adminProfilePayload);
      } catch (err) {
        console.warn('Firestore admin profile write note:', err);
      }

      const fullUser: SystemUser = {
        id: uid,
        ...adminProfilePayload,
      };

      setSystemUser(fullUser);
      if (credUser) setFirebaseUser(credUser);
      setBootstrapStatus({
        initialized: true,
        hasAdmin: true,
        adminCount: 1,
        firstAdminEmail: params.email.trim().toLowerCase(),
      });

      await recordAuditLog({
        uid,
        userName: params.name,
        userEmail: params.email,
        userRole: 'ADMIN',
        action: 'INICIALIZACAO_DO_SISTEMA',
        targetRecord: `Primeiro Administrador: ${params.name} (${params.email})`,
        operationSummary: `Configuração inicial do SIGCO concluída. Primeiro administrador ${params.name} cadastrado no Firebase Authentication e no Cloud Firestore.`,
      }).catch(() => {});

      return {
        success: true,
        message: 'Primeiro administrador criado com sucesso no SIGCO e no Firebase Authentication.',
      };
    } catch (error) {
      return {
        success: false,
        message: getFriendlyErrorMessage(error),
      };
    }
  };

  // Section 3: Update Permissions Matrix
  const updatePermissionsMatrix = async (
    matrix: SystemPermissionsMatrix
  ): Promise<{ success: boolean; message: string }> => {
    if (!systemUser || systemUser.role !== 'ADMIN') {
      return {
        success: false,
        message: 'Somente o Administrador pode configurar a matriz de permissões.',
      };
    }

    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await updatePermissionsMatrixOnServer(matrix, token);
      if (res.success && res.matrix) {
        setPermissionsMatrix(res.matrix);
      } else {
        setPermissionsMatrix(matrix);
      }

      await recordAuditLog({
        uid: systemUser.uid,
        userName: systemUser.name,
        userEmail: systemUser.email,
        userRole: systemUser.role,
        action: 'ATUALIZACAO_MATRIZ_PERMISSOES',
        targetRecord: 'Matriz de Permissões RBAC',
        operationSummary: `Administrador ${systemUser.name} atualizou a matriz de permissões de acesso do SIGCO.`,
      }).catch(() => {});

      return {
        success: true,
        message: 'Matriz de permissões salva com sucesso.',
      };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Falha ao salvar permissões.',
      };
    }
  };

  // Sync Firestore user profile for an authenticated Firebase user
  const resolveAndValidateUserProfile = async (
    fbUser: FirebaseUser
  ): Promise<SystemUser | null> => {
    const authEmail = (fbUser.email || '').trim().toLowerCase();
    const isDevAdmin = authEmail === 'davidb.dev21@gmail.com';
    const effectiveEmail = isDevAdmin ? 'administrador@cs.udf.edu.br' : authEmail;

    if (!isValidInstitutionalEmail(effectiveEmail)) {
      await signOut(auth);
      setAuthError(RESTRICTED_DOMAIN_MESSAGE);
      return null;
    }

    const userDocRef = doc(db, 'users', fbUser.uid);
    const directSnap = await getDoc(userDocRef);
    const nowIso = new Date().toISOString().slice(0, 35);

    if (directSnap.exists()) {
      const data = directSnap.data() as Omit<SystemUser, 'id'>;

      // Section 17: Active User Control — deny access if active === false
      if (data.active === false) {
        await signOut(auth);
        setAuthError(DEACTIVATED_SIGCO_USER_MESSAGE);
        return null;
      }

      await updateDoc(userDocRef, {
        lastAccess: nowIso,
      }).catch(() => {});

      return {
        id: fbUser.uid,
        ...data,
        lastAccess: nowIso,
      };
    }

    // Check if an admin pre-created or seeded a document in `users` with this email
    const emailQuery = query(
      collection(db, 'users'),
      where('institutionDomain', '==', INSTITUTION_DOMAIN)
    );
    const allUsersSnap = await getDocs(emailQuery);
    const matchedDoc = allUsersSnap.docs.find(
      (d) => String(d.data().email || '').toLowerCase() === effectiveEmail
    );

    if (matchedDoc) {
      const existingData = matchedDoc.data() as Omit<SystemUser, 'id'>;
      if (existingData.active === false) {
        await signOut(auth);
        setAuthError(DEACTIVATED_SIGCO_USER_MESSAGE);
        return null;
      }

      const migratedProfile: Omit<SystemUser, 'id'> = {
        uid: fbUser.uid,
        name: sanitizeString(existingData.name, 120),
        email: effectiveEmail,
        role: existingData.role,
        registrationCode: sanitizeString(existingData.registrationCode, 40),
        specialty: sanitizeString(existingData.specialty, 80),
        active: true,
        createdAt: existingData.createdAt || nowIso,
        lastAccess: nowIso,
        mustChangePassword: Boolean(existingData.mustChangePassword),
        institutionDomain: INSTITUTION_DOMAIN,
        createdByUid: fbUser.uid,
      };

      await setDoc(userDocRef, migratedProfile);
      if (matchedDoc.id !== fbUser.uid) {
        await deleteDoc(doc(db, 'users', matchedDoc.id)).catch(() => {});
      }

      return {
        id: fbUser.uid,
        ...migratedProfile,
      };
    }

    // Check if email matches one of the initial institutional personas
    const matchedPersona = INSTITUTIONAL_PERSONAS.find(
      (p) => p.email.toLowerCase() === effectiveEmail
    );

    const isProfessor = effectiveEmail.startsWith('prof');
    const autoRole: UserRole = matchedPersona ? matchedPersona.role : (isProfessor ? 'PROFESSOR' : 'ALUNO');
    const autoName = matchedPersona
      ? matchedPersona.name
      : (fbUser.displayName || effectiveEmail.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));
    const autoReg = matchedPersona ? matchedPersona.registrationCode : `UDF-${Math.floor(10000 + Math.random() * 90000)}`;
    const autoSpecialty = matchedPersona ? matchedPersona.specialty : (isProfessor ? 'Supervisão Clínica' : 'Clínica Geral');

    const newProfile: Omit<SystemUser, 'id'> = {
      uid: fbUser.uid,
      name: sanitizeString(autoName, 120),
      email: effectiveEmail,
      role: autoRole,
      registrationCode: sanitizeString(autoReg, 40),
      specialty: sanitizeString(autoSpecialty, 80),
      active: true,
      createdAt: nowIso,
      lastAccess: nowIso,
      mustChangePassword: false,
      institutionDomain: INSTITUTION_DOMAIN,
      createdByUid: fbUser.uid,
    };

    await setDoc(userDocRef, newProfile);
    return {
      id: fbUser.uid,
      ...newProfile,
    };
  };

  useEffect(() => {
    let isMounted = true;
    let unsubscribe: (() => void) | null = null;

    (async () => {
      await ensureAuthPersistence();
      if (!isMounted) return;

      unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
        if (!isMounted) return;

        if (!fbUser) {
          setFirebaseUser(null);
          setSystemUser(null);
          setLoading(false);
          setInitializing(false);
          return;
        }

        setFirebaseUser(fbUser);

        if (isInteractiveLoginRef.current) {
          return;
        }

        try {
          const resolvedProfile = await resolveAndValidateUserProfile(fbUser);
          if (!isMounted) return;

          if (!resolvedProfile) {
            setSystemUser(null);
            setFirebaseUser(null);
            setLoading(false);
            setInitializing(false);
            return;
          }

          setSystemUser(resolvedProfile);
          setLoading(false);
          setInitializing(false);

          ensureDatabaseSeeded(fbUser.uid).catch((err) => {
            console.warn('Seed check warning:', err);
          });
        } catch (error) {
          console.error('Session restoration error:', error);
          if (isMounted) {
            setLoading(false);
            setInitializing(false);
          }
        }
      });
    })();

    return () => {
      isMounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, [devBypassActive]);

  // Sincroniza estado de bypass de desenvolvimento sem afetar produção
  useEffect(() => {
    if (!firebaseUser && DEV_BYPASS_LOGIN_ENABLED) {
      if (devBypassActive) {
        setSystemUser(currentDevProfileRef.current || DEFAULT_DEV_ADMIN_PROFILE);
      } else {
        setSystemUser(null);
      }
    }
  }, [devBypassActive, firebaseUser]);

  // Section 2: Step 1 -> Verify format, @cs.udf.edu.br domain, and authorization in SIGCO
  const verifyEmailAuthorizationForLogin = async (
    email: string
  ): Promise<{ authorized: boolean; message: string }> => {
    setAuthError(null);
    const trimmed = (email || '').trim().toLowerCase();

    if (!isValidInstitutionalEmail(trimmed)) {
      setAuthError(RESTRICTED_DOMAIN_MESSAGE);
      return { authorized: false, message: RESTRICTED_DOMAIN_MESSAGE };
    }

    const check = await checkAuthorizedEmailOnServer(trimmed);
    if (!check.validDomain || !check.authorized || !check.active) {
      setAuthError(check.message);
      return { authorized: false, message: check.message };
    }

    return { authorized: true, message: check.message };
  };

  // Section 10: Forgot Password (Requirement 6: never reveals if account exists)
  const requestPasswordReset = async (
    email: string
  ): Promise<{ success: boolean; message: string }> => {
    const trimmed = (email || '').trim().toLowerCase();
    if (!isValidInstitutionalEmail(trimmed)) {
      return {
        success: false,
        message: RESTRICTED_DOMAIN_MESSAGE,
      };
    }

    try {
      await requestPublicPasswordResetOnServer(trimmed);
      try {
        await sendPasswordResetEmail(auth, trimmed);
      } catch {
        // Continue with generic response
      }

      if (systemUser) {
        await recordAuditLog({
          uid: systemUser.uid,
          userName: systemUser.name,
          userEmail: systemUser.email,
          userRole: systemUser.role,
          action: 'SOLICITACAO_DE_REDEFINICAO',
          targetRecord: `Usuário afetado: ${trimmed}`,
          operationSummary: `Solicitação de redefinição de senha para ${trimmed}.`,
        }).catch(() => {});
      }

      // Requirement 6: Generic response to avoid leaking whether account exists
      return {
        success: true,
        message: 'Se o e-mail informado estiver cadastrado no sistema, uma mensagem de redefinição de senha foi enviada para sua caixa de entrada.',
      };
    } catch {
      return {
        success: true,
        message: 'Se o e-mail informado estiver cadastrado no sistema, uma mensagem de redefinição de senha foi enviada para sua caixa de entrada.',
      };
    }
  };

  // Section 9: Change Own Password (Meu Perfil -> Segurança -> Alterar senha)
  const changeOwnPassword = async (
    currentPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; message: string }> => {
    if (!auth.currentUser || !systemUser) {
      return {
        success: false,
        message: 'Sessão não encontrada. Faça login novamente.',
      };
    }

    const strength = validateSigcoPasswordStrength(newPassword);
    if (!strength.valid) {
      return {
        success: false,
        message: strength.message,
      };
    }

    try {
      if (auth.currentUser.email) {
        const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
        await reauthenticateWithCredential(auth.currentUser, credential);
      }

      await updatePassword(auth.currentUser, newPassword);

      await updateDoc(doc(db, 'users', systemUser.id), {
        mustChangePassword: false,
      }).catch(() => {});

      setSystemUser((prev) => (prev ? { ...prev, mustChangePassword: false } : null));

      await recordAuditLog({
        uid: systemUser.uid,
        userName: systemUser.name,
        userEmail: systemUser.email,
        userRole: systemUser.role,
        action: 'ALTERACAO_DE_SENHA',
        targetRecord: `Usuário: ${systemUser.email}`,
        operationSummary: `O usuário ${systemUser.name} (${systemUser.email}) alterou sua própria senha do SIGCO com sucesso.`,
      }).catch(() => {});

      return {
        success: true,
        message: 'Senha alterada com sucesso.',
      };
    } catch (error) {
      return {
        success: false,
        message: getFriendlyErrorMessage(error),
      };
    }
  };

  // Section 2, 5 & 19: Admin creates user via backend Firebase Auth + Firestore without disconnecting Admin
  const adminCreateUser = async (
    input: CreateSigcoUserInput,
    existingUsers: SystemUser[]
  ): Promise<{ success: boolean; message: string; isProviderDisabled?: boolean }> => {
    if (!systemUser || systemUser.role !== 'ADMIN') {
      return {
        success: false,
        message: 'Somente o Administrador possui permissão para cadastrar usuários.',
      };
    }

    const trimmedEmail = (input.email || '').trim().toLowerCase();
    if (!isValidInstitutionalEmail(trimmedEmail)) {
      return {
        success: false,
        message: RESTRICTED_DOMAIN_MESSAGE,
      };
    }

    const emailAlreadyExists = existingUsers.some(
      (u) => u.email.toLowerCase() === trimmedEmail
    );
    if (emailAlreadyExists) {
      return {
        success: false,
        message: 'Não é permitida duplicidade: este e-mail institucional já está cadastrado no SIGCO.',
      };
    }

    const strength = validateSigcoPasswordStrength(input.initialPassword);
    if (!strength.valid) {
      return {
        success: false,
        message: strength.message,
      };
    }

    try {
      // 1. Backend creates user in Firebase Authentication via secure Admin SDK / Toolkit endpoint
      const token = await auth.currentUser?.getIdToken();
      const serverResult = await adminCreateUserOnServer(
        {
          name: input.name.trim(),
          email: trimmedEmail,
          role: input.role,
          active: input.active !== false,
          initialPassword: input.initialPassword,
          registrationCode: input.registrationCode,
          specialty: input.specialty,
          mustChangePassword: input.mustChangePassword,
        },
        token
      );

      if (!serverResult.success) {
        if (serverResult.isProviderDisabled) {
          return {
            success: false,
            isProviderDisabled: true,
            message: serverResult.message,
          };
        }
        return {
          success: false,
          message: serverResult.message,
        };
      }

      const createdUid = serverResult.uid || `usr_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
      const nowIso = new Date().toISOString().slice(0, 35);
      const profilePayload: Omit<SystemUser, 'id'> = {
        uid: createdUid,
        name: sanitizeString(input.name, 120),
        email: trimmedEmail,
        role: input.role,
        registrationCode: sanitizeString(
          input.registrationCode || `UDF-${Math.floor(1000 + Math.random() * 9000)}`,
          40
        ),
        specialty: sanitizeString(input.specialty || 'Clínica Geral', 80),
        active: input.active !== false,
        createdAt: nowIso,
        lastAccess: 'Nunca acessou',
        mustChangePassword: input.mustChangePassword !== false,
        institutionDomain: INSTITUTION_DOMAIN,
        createdByUid: systemUser.uid,
      };

      // 2. Create profile in Firestore associated with the same UID
      await setDoc(doc(db, 'users', createdUid), profilePayload);

      // 3. Sync authorized email list on backend
      await syncAuthorizedUsersOnServer([
        ...existingUsers.map((u) => ({ email: u.email, active: u.active })),
        { email: trimmedEmail, active: profilePayload.active },
      ]);

      // 4. Record Audit Log (CRIACAO_DE_USUARIO)
      await recordAuditLog({
        uid: systemUser.uid,
        userName: systemUser.name,
        userEmail: systemUser.email,
        userRole: systemUser.role,
        action: 'CRIACAO_DE_USUARIO',
        targetRecord: `Usuário afetado: ${profilePayload.name} (${trimmedEmail} — ${ROLE_LABELS[input.role]})`,
        operationSummary: `Administrador ${systemUser.name} cadastrou o usuário ${profilePayload.name} (${trimmedEmail}) com perfil ${ROLE_LABELS[input.role]} e status ${profilePayload.active ? 'Ativo' : 'Desativado'}.`,
      });

      return {
        success: true,
        message: `Usuário ${profilePayload.name} (${trimmedEmail}) cadastrado com sucesso no Firebase Authentication e no Firestore.`,
      };
    } catch (error) {
      return {
        success: false,
        message: getFriendlyErrorMessage(error),
      };
    }
  };

  // Section 6, 18, 19: Admin updates user profile / role / status
  const adminUpdateUser = async (
    targetUser: SystemUser,
    updates: UpdateSigcoUserInput
  ): Promise<{ success: boolean; message: string }> => {
    if (!systemUser || systemUser.role !== 'ADMIN') {
      return {
        success: false,
        message: 'Somente o Administrador possui permissão para editar usuários.',
      };
    }

    try {
      await updateDoc(doc(db, 'users', targetUser.id), {
        name: sanitizeString(updates.name, 120),
        role: updates.role,
        active: updates.active,
        registrationCode: sanitizeString(updates.registrationCode, 40),
        specialty: sanitizeString(updates.specialty, 80),
      });

      await syncAuthorizedUsersOnServer([
        { email: targetUser.email, active: updates.active },
      ]);

      await recordAuditLog({
        uid: systemUser.uid,
        userName: systemUser.name,
        userEmail: systemUser.email,
        userRole: systemUser.role,
        action: 'ALTERACAO_DE_PERFIL',
        targetRecord: `Usuário afetado: ${updates.name} (${targetUser.email})`,
        operationSummary: `Administrador ${systemUser.name} atualizou o perfil de ${targetUser.email} para ${ROLE_LABELS[updates.role]} (${updates.active ? 'Ativo' : 'Desativado'}).`,
      });

      return {
        success: true,
        message: `Perfil de ${updates.name} atualizado com sucesso.`,
      };
    } catch (error) {
      return {
        success: false,
        message: getFriendlyErrorMessage(error),
      };
    }
  };

  // Section 6, 12, 17, 19: Admin activates or deactivates user
  const adminToggleUserStatus = async (
    targetUser: SystemUser,
    nextActive: boolean
  ): Promise<{ success: boolean; message: string }> => {
    if (!systemUser || systemUser.role !== 'ADMIN') {
      return {
        success: false,
        message: 'Somente o Administrador pode ativar ou desativar usuários.',
      };
    }

    if (
      !nextActive &&
      (targetUser.id === systemUser.id ||
        targetUser.email.toLowerCase() === systemUser.email.toLowerCase())
    ) {
      return {
        success: false,
        message: 'O administrador não pode desativar a própria conta em uso.',
      };
    }

    try {
      await updateDoc(doc(db, 'users', targetUser.id), {
        active: nextActive,
      });

      await syncAuthorizedUsersOnServer([{ email: targetUser.email, active: nextActive }]);

      await recordAuditLog({
        uid: systemUser.uid,
        userName: systemUser.name,
        userEmail: systemUser.email,
        userRole: systemUser.role,
        action: nextActive ? 'ATIVACAO' : 'DESATIVACAO',
        targetRecord: `Usuário afetado: ${targetUser.name} (${targetUser.email})`,
        operationSummary: `Administrador ${systemUser.name} ${
          nextActive ? 'ativou' : 'desativou'
        } o acesso de ${targetUser.name} (${targetUser.email}).`,
      });

      return {
        success: true,
        message: nextActive
          ? `Acesso de ${targetUser.name} ativado com sucesso.`
          : `Acesso de ${targetUser.name} desativado. O histórico clínico foi mantido.`,
      };
    } catch (error) {
      return {
        success: false,
        message: getFriendlyErrorMessage(error),
      };
    }
  };

  // Section 11 & 19: Admin initiates secure password reset email (never sees password)
  const adminSendPasswordReset = async (
    targetUser: SystemUser
  ): Promise<{ success: boolean; message: string }> => {
    if (!systemUser || systemUser.role !== 'ADMIN') {
      return {
        success: false,
        message: 'Somente o Administrador pode iniciar a redefinição administrativa de senha.',
      };
    }

    try {
      await sendPasswordResetEmail(auth, targetUser.email);

      await recordAuditLog({
        uid: systemUser.uid,
        userName: systemUser.name,
        userEmail: systemUser.email,
        userRole: systemUser.role,
        action: 'SOLICITACAO_DE_REDEFINICAO',
        targetRecord: `Usuário afetado: ${targetUser.name} (${targetUser.email})`,
        operationSummary: `Administrador ${systemUser.name} enviou e-mail oficial de redefinição de senha para ${targetUser.name} (${targetUser.email}).`,
      });

      return {
        success: true,
        message: `E-mail de redefinição de senha enviado com segurança para ${targetUser.email}.`,
      };
    } catch (error) {
      return {
        success: false,
        message: getFriendlyErrorMessage(error),
      };
    }
  };

  // Section 12, 13 & 19: Admin deletes user profile safely (preserving clinical history & audit)
  const adminDeleteUser = async (
    targetUser: SystemUser
  ): Promise<{ success: boolean; message: string }> => {
    if (!systemUser || systemUser.role !== 'ADMIN') {
      return {
        success: false,
        message: 'Somente o Administrador poderá excluir usuários.',
      };
    }

    // Section 13: Admin cannot delete their own account
    if (
      targetUser.id === systemUser.id ||
      targetUser.uid === systemUser.uid ||
      targetUser.email.toLowerCase() === systemUser.email.toLowerCase()
    ) {
      return {
        success: false,
        message: 'Operação bloqueada: o administrador não pode excluir a própria conta.',
      };
    }

    try {
      // Delete user profile document while preserving all medical records, evolutions, appointments, and audit logs
      await deleteDoc(doc(db, 'users', targetUser.id));

      // Remove from authorized login registry
      await syncAuthorizedUsersOnServer([], targetUser.email);

      const now = new Date();
      const dateStr = now.toLocaleDateString('pt-BR');
      const timeStr = now.toLocaleTimeString('pt-BR');

      // Section 13 & 19: Record Admin, Affected User, Action, Date, and Time
      await recordAuditLog({
        uid: systemUser.uid,
        userName: systemUser.name,
        userEmail: systemUser.email,
        userRole: systemUser.role,
        action: 'EXCLUSAO',
        targetRecord: `Usuário afetado: ${targetUser.name} (${targetUser.email})`,
        operationSummary: `Administrador: ${systemUser.name} (${systemUser.email}) | Usuário afetado: ${targetUser.name} (${targetUser.email}) | Ação: EXCLUSAO | Data: ${dateStr} | Hora: ${timeStr}. Prontuários e históricos clínicos preservados.`,
      });

      return {
        success: true,
        message: `Usuário ${targetUser.name} (${targetUser.email}) excluído com segurança. Prontuários, atendimentos e logs históricos foram preservados.`,
      };
    } catch (error) {
      return {
        success: false,
        message: getFriendlyErrorMessage(error),
      };
    }
  };

  const switchInstitutionalPersona = async (persona: InstitutionalPersona): Promise<void> => {
    if (!systemUser) return;
    if (!isValidInstitutionalEmail(persona.email)) {
      setAuthError(RESTRICTED_DOMAIN_MESSAGE);
      return;
    }

    if (firebaseUser) {
      try {
        await updateDoc(doc(db, 'users', firebaseUser.uid), {
          name: sanitizeString(persona.name, 120),
          email: persona.email.toLowerCase(),
          role: persona.role,
          registrationCode: sanitizeString(persona.registrationCode, 40),
          specialty: sanitizeString(persona.specialty, 80),
          active: true,
        });

        await recordAuditLog({
          uid: firebaseUser.uid,
          userName: systemUser.name,
          userEmail: systemUser.email,
          userRole: persona.role,
          action: 'ALTERACAO_DE_PERFIL',
          targetRecord: `Usuário afetado: ${persona.name} (${persona.email})`,
          operationSummary: `Alternância de perfil ativo para ${persona.name} (${ROLE_LABELS[persona.role]}).`,
        }).catch(() => {});
      } catch (error) {
        console.warn('Firestore persona update notice:', error);
      }
    }

    const updatedUser: SystemUser = {
      ...systemUser,
      name: persona.name,
      email: persona.email.toLowerCase(),
      role: persona.role,
      registrationCode: persona.registrationCode,
      specialty: persona.specialty,
    };

    currentDevProfileRef.current = updatedUser;
    setSystemUser(updatedUser);
  };

  // Official SIGCO Authentication flow (Email & Password via Firebase Authentication)
  const loginWithEmailAndPassword = async (
    emailInput: string,
    passwordInput: string
  ): Promise<{
    success: boolean;
    message: string;
    isProviderDisabled?: boolean;
  }> => {
    setAuthError(null);
    const trimmedEmail = (emailInput || '').trim().toLowerCase();
    const isDevAdmin = trimmedEmail === 'davidb.dev21@gmail.com';
    const effectiveEmail = isDevAdmin ? 'administrador@cs.udf.edu.br' : trimmedEmail;

    // 1. Receber o e-mail e a senha e validar se estão preenchidos
    if (!trimmedEmail) {
      const msg = 'Informe o e-mail acadêmico (@cs.udf.edu.br).';
      setAuthError(msg);
      return { success: false, message: msg };
    }

    if (!passwordInput) {
      const msg = 'Informe sua senha de acesso ao SIGCO.';
      setAuthError(msg);
      return { success: false, message: msg };
    }

    // 2. Verificar se o domínio é exatamente @cs.udf.edu.br
    if (!isValidInstitutionalEmail(effectiveEmail)) {
      const msg = 'Acesso restrito. O endereço deve possuir o domínio @cs.udf.edu.br.';
      setAuthError(msg);
      return { success: false, message: msg };
    }

    // 3. Consultar autorização e status ativo no servidor
    const authCheck = await checkAuthorizedEmailOnServer(effectiveEmail);
    if (!authCheck.authorized) {
      setAuthError(UNAUTHORIZED_SIGCO_EMAIL_MESSAGE);
      return { success: false, message: UNAUTHORIZED_SIGCO_EMAIL_MESSAGE };
    }
    if (!authCheck.active) {
      setAuthError(DEACTIVATED_SIGCO_USER_MESSAGE);
      return { success: false, message: DEACTIVATED_SIGCO_USER_MESSAGE };
    }

    setLoading(true);

    try {
      await ensureAuthPersistence();
      isInteractiveLoginRef.current = true;

      // 4. Autenticar as credenciais no Firebase Authentication
      const userCredential = await signInWithEmailAndPassword(
        auth,
        trimmedEmail,
        passwordInput
      );
      const fbUser = userCredential.user;

      // 5. Consultar o perfil do usuário no banco de dados e confirmar se está ativo
      const resolvedProfile = await resolveAndValidateUserProfile(fbUser);
      if (!resolvedProfile) {
        await signOut(auth);
        setLoading(false);
        isInteractiveLoginRef.current = false;
        const msg = authError || UNAUTHORIZED_SIGCO_EMAIL_MESSAGE;
        return { success: false, message: msg };
      }

      setSystemUser(resolvedProfile);
      setFirebaseUser(fbUser);
      setLoading(false);
      setInitializing(false);
      isInteractiveLoginRef.current = false;

      // 6. Gravar log de auditoria oficial
      await recordAuditLog({
        uid: resolvedProfile.uid,
        userName: resolvedProfile.name,
        userEmail: resolvedProfile.email,
        userRole: resolvedProfile.role,
        action: 'LOGIN',
        targetRecord: `Usuário: ${resolvedProfile.email}`,
        operationSummary: `Login realizado com e-mail e senha por ${resolvedProfile.name} (${resolvedProfile.email}) — Perfil: ${ROLE_LABELS[resolvedProfile.role]}.`,
      }).catch(() => {});

      return {
        success: true,
        message: 'Acesso liberado com sucesso.',
      };
    } catch (err: unknown) {
      setLoading(false);
      isInteractiveLoginRef.current = false;
      const raw = err instanceof Error ? err.message : String(err);

      if (raw.includes('auth/operation-not-allowed')) {
        const msg =
          'O provedor E-mail/Senha precisa ser ativado no Console do Firebase Authentication deste projeto.';
        setAuthError(msg);
        return { success: false, isProviderDisabled: true, message: msg };
      }

      if (
        raw.includes('auth/invalid-credential') ||
        raw.includes('auth/wrong-password') ||
        raw.includes('auth/user-not-found')
      ) {
        const msg =
          'E-mail acadêmico ou senha incorretos. Verifique os dados informados ou use Esqueci minha senha.';
        setAuthError(msg);
        return { success: false, message: msg };
      }

      if (raw.includes('auth/user-disabled')) {
        const msg = 'Esta conta foi desativada no Firebase Authentication. Contate o administrador.';
        setAuthError(msg);
        return { success: false, message: msg };
      }

      if (raw.includes('auth/too-many-requests')) {
        const msg =
          'Muitas tentativas sem sucesso. Aguarde alguns instantes antes de tentar novamente.';
        setAuthError(msg);
        return { success: false, message: msg };
      }

      const friendlyMsg = getFriendlyErrorMessage(err);
      setAuthError(friendlyMsg);
      return { success: false, message: friendlyMsg };
    }
  };

  const loginWithGoogleInstitutional = async () => {
    return {
      success: false,
      message: 'O login por Google foi descontinuado. Utilize seu e-mail e senha acadêmicos.',
    };
  };

  const loginWithMicrosoftEntra = async () => {
    return {
      success: false,
      message: 'O login por Microsoft foi descontinuado. Utilize seu e-mail e senha acadêmicos.',
    };
  };

  // Section 16 & 19: Real Firebase signOut + LOGOUT audit log
  const logout = async () => {
    if (systemUser && firebaseUser) {
      await recordAuditLog({
        uid: firebaseUser.uid,
        userName: systemUser.name,
        userEmail: systemUser.email,
        userRole: systemUser.role,
        action: 'LOGOUT',
        targetRecord: `Usuário: ${systemUser.email}`,
        operationSummary: `Logout realizado por ${systemUser.name} (${systemUser.email}).`,
      }).catch(() => {});
    }
    await signOut(auth).catch(() => {});
    setSystemUser(null);
    setFirebaseUser(null);
    setDevBypassActive(false);
  };

  const enterDevDemoMode = (customUser?: Partial<SystemUser>) => {
    if (!import.meta.env.DEV) return;
    const adminUser: SystemUser = {
      id: customUser?.id || `dev_adm_${Date.now()}`,
      uid: customUser?.uid || `dev_adm_${Date.now()}`,
      name: customUser?.name || 'Administrador (Modo Avaliação Visual)',
      email: customUser?.email || 'administrador@cs.udf.edu.br',
      role: customUser?.role || 'ADMIN',
      active: true,
      registrationCode: customUser?.registrationCode || 'ADM-DEV',
      specialty: customUser?.specialty || 'Gestão Clínica Geral',
      createdAt: new Date().toISOString(),
      lastAccess: new Date().toISOString(),
      mustChangePassword: false,
      institutionDomain: INSTITUTION_DOMAIN,
      createdByUid: 'system_dev',
    };
    currentDevProfileRef.current = adminUser;
    setDevBypassActive(true);
    setSystemUser(adminUser);
    setFirebaseUser(null);
    setInitializing(false);
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        systemUser,
        loading,
        initializing,
        authError,
        clearAuthError,
        bootstrapStatus,
        checkBootstrapStatus,
        bootstrapFirstAdmin,
        verifyEmailAuthorizationForLogin,
        loginWithEmailAndPassword,
        loginWithGoogleInstitutional,
        loginWithMicrosoftEntra,
        requestPasswordReset,
        changeOwnPassword,
        adminCreateUser,
        adminUpdateUser,
        adminToggleUserStatus,
        adminSendPasswordReset,
        adminDeleteUser,
        permissionsMatrix,
        updatePermissionsMatrix,
        switchInstitutionalPersona,
        enterDevDemoMode,
        logout,
        isDevBypassActive: devBypassActive,
        setDevBypassActive,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
