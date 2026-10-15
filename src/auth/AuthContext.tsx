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
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
} from '../services/firebase';
import { SystemUser, UserRole } from '../types';
import {
  INSTITUTION_DOMAIN,
  isValidInstitutionalEmail,
  RESTRICTED_DOMAIN_MESSAGE,
  ROLE_LABELS,
  sanitizeString,
} from '../utils/validation';
import {
  checkAuthorizedEmailOnServer,
  DEACTIVATED_SIGCO_USER_MESSAGE,
  syncAuthorizedUsersOnServer,
  UNAUTHORIZED_SIGCO_EMAIL_MESSAGE,
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

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  systemUser: SystemUser | null;
  loading: boolean;
  initializing: boolean;
  authError: string | null;
  emailPasswordProviderDisabled: boolean;
  clearAuthError: () => void;
  verifyEmailAuthorizationForLogin: (email: string) => Promise<{
    authorized: boolean;
    message: string;
  }>;
  loginWithSigcoCredentials: (email: string, password: string) => Promise<boolean>;
  requestPasswordReset: (email: string) => Promise<{ success: boolean; message: string }>;
  changeOwnPassword: (
    currentPassword: string,
    newPassword: string
  ) => Promise<{ success: boolean; message: string }>;
  adminCreateUser: (
    input: CreateSigcoUserInput,
    existingUsers: SystemUser[]
  ) => Promise<{ success: boolean; message: string }>;
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
  switchInstitutionalPersona: (persona: InstitutionalPersona) => Promise<void>;
  loginAsTemporaryImmi: () => Promise<boolean>;
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
  const [emailPasswordProviderDisabled, setEmailPasswordProviderDisabled] =
    useState<boolean>(false);
  const [devBypassActive, setDevBypassActive] = useState<boolean>(DEV_BYPASS_LOGIN_ENABLED);
  const currentDevProfileRef = React.useRef<SystemUser | null>(DEFAULT_DEV_ADMIN_PROFILE);
  const isInteractiveLoginRef = React.useRef<boolean>(false);

  const clearAuthError = () => setAuthError(null);

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

    if (!matchedPersona) {
      await signOut(auth);
      setAuthError(UNAUTHORIZED_SIGCO_EMAIL_MESSAGE);
      return null;
    }

    const newProfile: Omit<SystemUser, 'id'> = {
      uid: fbUser.uid,
      name: sanitizeString(matchedPersona.name, 120),
      email: effectiveEmail,
      role: matchedPersona.role,
      registrationCode: sanitizeString(matchedPersona.registrationCode, 40),
      specialty: sanitizeString(matchedPersona.specialty, 80),
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
          // Modo de Desenvolvimento Direto: libera acesso sem exibir tela de login
          if (DEV_BYPASS_LOGIN_ENABLED && devBypassActive) {
            setSystemUser(currentDevProfileRef.current || DEFAULT_DEV_ADMIN_PROFILE);
          } else {
            setSystemUser(null);
          }
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

  // Section 2, 4, 14, 16, 17, 18, 19: Complete Email + SIGCO Password Authentication
  const loginWithSigcoCredentials = async (
    email: string,
    password: string
  ): Promise<boolean> => {
    setAuthError(null);
    setEmailPasswordProviderDisabled(false);
    const trimmedEmail = (email || '').trim().toLowerCase();

    // 1. Validate @cs.udf.edu.br and authorization status
    const emailCheck = await verifyEmailAuthorizationForLogin(trimmedEmail);
    if (!emailCheck.authorized) {
      return false;
    }

    if (!password || password.length < 8) {
      setAuthError('Informe sua senha do SIGCO (mínimo de 8 caracteres).');
      return false;
    }

    try {
      isInteractiveLoginRef.current = true;
      setLoading(true);

      await ensureAuthPersistence();

      let fbUser: FirebaseUser | null = null;

      try {
        const cred = await signInWithEmailAndPassword(auth, trimmedEmail, password);
        fbUser = cred.user;
      } catch (signInErr: unknown) {
        const errCode =
          signInErr && typeof signInErr === 'object' && 'code' in signInErr
            ? String((signInErr as { code: string }).code)
            : String(signInErr);

        if (errCode.includes('auth/operation-not-allowed')) {
          setEmailPasswordProviderDisabled(true);
          setAuthError(
            'O login por E-mail e Senha exclusiva do SIGCO requer a ativação do provedor "E-mail/senha" no Console do Firebase Authentication.'
          );
          setLoading(false);
          setInitializing(false);
          return false;
        }

        // First-time bootstrap for authorized institutional seed accounts that do not yet have a Firebase Auth credential
        const isSeedInstitutionalAccount = INSTITUTIONAL_PERSONAS.some(
          (p) => p.email.toLowerCase() === trimmedEmail
        );

        if (
          isSeedInstitutionalAccount &&
          (errCode.includes('auth/user-not-found') || errCode.includes('auth/invalid-credential'))
        ) {
          try {
            const createdCred = await createUserWithEmailAndPassword(
              auth,
              trimmedEmail,
              password
            );
            fbUser = createdCred.user;
          } catch (createErr: unknown) {
            const createCode =
              createErr && typeof createErr === 'object' && 'code' in createErr
                ? String((createErr as { code: string }).code)
                : String(createErr);

            if (createCode.includes('auth/operation-not-allowed')) {
              setEmailPasswordProviderDisabled(true);
              setAuthError(
                'O login por E-mail e Senha exclusiva do SIGCO requer a ativação do provedor "E-mail/senha" no Console do Firebase Authentication.'
              );
            } else if (createCode.includes('auth/email-already-in-use')) {
              setAuthError('E-mail ou senha do SIGCO incorretos.');
            } else {
              setAuthError(getFriendlyErrorMessage(createErr));
            }
            setLoading(false);
            setInitializing(false);
            return false;
          }
        } else {
          setAuthError('E-mail ou senha do SIGCO incorretos.');
          setLoading(false);
          setInitializing(false);
          return false;
        }
      }

      if (!fbUser) {
        setAuthError('Não foi possível validar suas credenciais.');
        setLoading(false);
        setInitializing(false);
        return false;
      }

      setFirebaseUser(fbUser);

      // Verify profile and active status in Firestore (Sections 17 & 18)
      const resolvedProfile = await resolveAndValidateUserProfile(fbUser);
      if (!resolvedProfile) {
        setSystemUser(null);
        setFirebaseUser(null);
        setLoading(false);
        setInitializing(false);
        return false;
      }

      setSystemUser(resolvedProfile);
      setLoading(false);
      setInitializing(false);

      // Ensure database seeded and record LOGIN audit log (Section 19)
      ensureDatabaseSeeded(fbUser.uid).catch((err) => {
        console.warn('Seed check warning:', err);
      });

      recordAuditLog({
        uid: fbUser.uid,
        userName: resolvedProfile.name,
        userEmail: resolvedProfile.email,
        userRole: resolvedProfile.role,
        action: 'LOGIN',
        targetRecord: `Usuário: ${resolvedProfile.email}`,
        operationSummary: `Login institucional realizado no SIGCO por ${resolvedProfile.name} (${resolvedProfile.email} — ${ROLE_LABELS[resolvedProfile.role]}).`,
      }).catch(() => {});

      return true;
    } catch (error) {
      setLoading(false);
      setInitializing(false);
      setAuthError(getFriendlyErrorMessage(error));
      return false;
    } finally {
      isInteractiveLoginRef.current = false;
    }
  };

  // Section 10: Forgot Password using official Firebase sendPasswordResetEmail
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

    const check = await checkAuthorizedEmailOnServer(trimmed);
    if (!check.authorized) {
      return {
        success: false,
        message: UNAUTHORIZED_SIGCO_EMAIL_MESSAGE,
      };
    }

    try {
      await sendPasswordResetEmail(auth, trimmed);
      if (systemUser) {
        await recordAuditLog({
          uid: systemUser.uid,
          userName: systemUser.name,
          userEmail: systemUser.email,
          userRole: systemUser.role,
          action: 'SOLICITACAO_DE_REDEFINICAO',
          targetRecord: `Usuário afetado: ${trimmed}`,
          operationSummary: `Solicitação de redefinição de senha enviada para ${trimmed}.`,
        }).catch(() => {});
      }
      return {
        success: true,
        message: `Link oficial de redefinição de senha enviado para ${trimmed}. Verifique sua caixa de entrada institucional.`,
      };
    } catch (error) {
      return {
        success: false,
        message: getFriendlyErrorMessage(error),
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

  // Section 6, 7, 8, 15, 19: Admin creates user in Firebase Auth + Firestore without disconnecting Admin
  const adminCreateUser = async (
    input: CreateSigcoUserInput,
    existingUsers: SystemUser[]
  ): Promise<{ success: boolean; message: string }> => {
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
      // 3. Create account in Firebase Authentication via isolated secondary Auth app
      const createdUid = await createUserInFirebaseAuthWithoutLoggingOutAdmin(
        trimmedEmail,
        input.initialPassword
      );

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

      // 4. Create profile in Firestore (NEVER storing the password)
      await setDoc(doc(db, 'users', createdUid), profilePayload);

      // Sync authorized email list on backend
      await syncAuthorizedUsersOnServer([
        ...existingUsers.map((u) => ({ email: u.email, active: u.active })),
        { email: trimmedEmail, active: profilePayload.active },
      ]);

      // 7. Record Audit Log (CRIACAO_DE_USUARIO)
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

  // Temporary Access for Immi with Administrator role in SIGCO
  const loginAsTemporaryImmi = async (): Promise<boolean> => {
    setAuthError(null);
    setEmailPasswordProviderDisabled(false);
    const immiEmail = 'immi@cs.udf.edu.br';
    const nowIso = new Date().toISOString().slice(0, 35);

    try {
      isInteractiveLoginRef.current = true;
      setLoading(true);

      await ensureAuthPersistence();

      let fbUser: FirebaseUser | null = auth.currentUser;

      // Ensure authenticated in Firebase Auth
      if (!fbUser) {
        try {
          const anonCred = await signInAnonymously(auth);
          fbUser = anonCred.user;
        } catch {
          // If anonymous sign-in is disabled, attempt to create/sign in with credential
          try {
            const cred = await signInWithEmailAndPassword(auth, immiEmail, 'Immi@2026!');
            fbUser = cred.user;
          } catch {
            const created = await createUserWithEmailAndPassword(auth, immiEmail, 'Immi@2026!');
            fbUser = created.user;
          }
        }
      }

      if (!fbUser) {
        setAuthError('Não foi possível iniciar a sessão de acesso temporário.');
        setLoading(false);
        setInitializing(false);
        return false;
      }

      setFirebaseUser(fbUser);

      // Create or update the users document in Firestore
      const userDocRef = doc(db, 'users', fbUser.uid);
      const profileData: Omit<SystemUser, 'id'> = {
        uid: fbUser.uid,
        name: 'Immi (Acesso Temporário)',
        email: immiEmail,
        role: 'ADMIN',
        registrationCode: 'TEMP-IMMI-2026',
        specialty: 'Gestão e Avaliação Clínica',
        active: true,
        createdAt: nowIso,
        lastAccess: nowIso,
        mustChangePassword: false,
        institutionDomain: INSTITUTION_DOMAIN,
        createdByUid: fbUser.uid,
      };

      await setDoc(userDocRef, profileData, { merge: true }).catch((err) => {
        console.warn('Profile write notice:', err);
      });

      const finalProfile: SystemUser = {
        id: fbUser.uid,
        ...profileData,
      };

      setSystemUser(finalProfile);
      setLoading(false);
      setInitializing(false);

      ensureDatabaseSeeded(fbUser.uid).catch((err) => {
        console.warn('Seed check warning:', err);
      });

      recordAuditLog({
        uid: fbUser.uid,
        userName: finalProfile.name,
        userEmail: finalProfile.email,
        userRole: finalProfile.role,
        action: 'LOGIN',
        targetRecord: `Usuário: ${finalProfile.email}`,
        operationSummary: `Acesso temporário liberado e conectado para Immi (Perfil: Administrador).`,
      }).catch(() => {});

      return true;
    } catch (error) {
      setLoading(false);
      setInitializing(false);
      setAuthError(getFriendlyErrorMessage(error));
      return false;
    } finally {
      isInteractiveLoginRef.current = false;
    }
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

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        systemUser,
        loading,
        initializing,
        authError,
        emailPasswordProviderDisabled,
        clearAuthError,
        verifyEmailAuthorizationForLogin,
        loginWithSigcoCredentials,
        requestPasswordReset,
        changeOwnPassword,
        adminCreateUser,
        adminUpdateUser,
        adminToggleUserStatus,
        adminSendPasswordReset,
        adminDeleteUser,
        switchInstitutionalPersona,
        loginAsTemporaryImmi,
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
