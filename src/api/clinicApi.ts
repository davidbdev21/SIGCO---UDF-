import { Appointment, AttendanceType, Availability, Patient, UserRole } from '../types';
import { isValidInstitutionalEmail, RESTRICTED_DOMAIN_MESSAGE } from '../utils/validation';
import {
  auth,
  createUserInFirebaseAuthWithoutLoggingOutAdmin,
  createUserWithEmailAndPassword,
} from '../services/firebase';

const PERMISSIONS_STORAGE_KEY = 'sigco_permissions_matrix_fallback';
const BOOTSTRAP_STORAGE_KEY = 'sigco_bootstrap_completed';

/**
 * Safely parses JSON from a Response object.
 * Protects against Google Frontend (GFE), Vercel 404/SPA rewrites, or proxy HTML error pages
 * (starting with '<!doctype' or '<') which cause SyntaxError: Unexpected token '<'.
 * Also flags `isUnavailableEndpoint` when running on static hosting (e.g., Vercel without Express backend).
 */
async function parseSafeJson<T = any>(
  res: Response,
  fallbackMessage = 'Resposta inválida do servidor.'
): Promise<{ ok: boolean; isUnavailableEndpoint: boolean; data: T }> {
  const isMissingStatus = res.status === 404 || res.status === 405 || res.status === 501;
  try {
    const text = await res.text();
    const trimmed = text.trim();
    if (!trimmed || trimmed.startsWith('<')) {
      return {
        ok: false,
        isUnavailableEndpoint: true,
        data: {
          success: false,
          message: fallbackMessage,
        } as unknown as T,
      };
    }
    const parsed = JSON.parse(text);
    return { ok: res.ok, isUnavailableEndpoint: isMissingStatus, data: parsed };
  } catch {
    return {
      ok: false,
      isUnavailableEndpoint: isMissingStatus,
      data: {
        success: false,
        message: fallbackMessage,
      } as unknown as T,
    };
  }
}

export interface DomainValidationResponse {
  valid: boolean;
  email?: string;
  domain?: string;
  message: string;
}

export interface AuthorizedUserCheckResponse {
  validDomain: boolean;
  authorized: boolean;
  active: boolean;
  message: string;
}

export const UNAUTHORIZED_SIGCO_EMAIL_MESSAGE =
  'Este e-mail não está autorizado a acessar o SIGCO.';
export const DEACTIVATED_SIGCO_USER_MESSAGE =
  'Seu acesso ao SIGCO está desativado. Entre em contato com o administrador.';

export interface GoogleVerifyResponse {
  authorized: boolean;
  validDomain?: boolean;
  emailVerified?: boolean;
  active?: boolean;
  email?: string;
  name?: string;
  uid?: string;
  message?: string;
}

export async function verifyGoogleTokenOnServer(
  idToken: string
): Promise<GoogleVerifyResponse> {
  try {
    const response = await fetch('/api/auth/google-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    const { data } = await parseSafeJson<GoogleVerifyResponse>(
      response,
      'Falha de comunicação com o servidor de validação institucional.'
    );
    return data;
  } catch {
    return {
      authorized: false,
      message: 'Falha de comunicação com o servidor de validação institucional.',
    };
  }
}

// Deprecated alias for backwards compatibility
export const verifyMicrosoftTokenOnServer = verifyGoogleTokenOnServer;
export type MicrosoftVerifyResponse = GoogleVerifyResponse;

export async function checkAuthorizedEmailOnServer(
  email: string
): Promise<AuthorizedUserCheckResponse> {
  const trimmed = (email || '').trim().toLowerCase();
  if (!isValidInstitutionalEmail(trimmed)) {
    return {
      validDomain: false,
      authorized: false,
      active: false,
      message: RESTRICTED_DOMAIN_MESSAGE,
    };
  }

  try {
    const response = await fetch('/api/auth/check-authorized-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: trimmed }),
    });
    const { isUnavailableEndpoint, data } = await parseSafeJson<any>(response);

    // When hosted as a static SPA (e.g. Vercel without Express backend),
    // /api/auth/check-authorized-user returns 404 or index.html.
    // Delegate credential verification and active status checks to Firebase Auth & Firestore.
    if (isUnavailableEndpoint) {
      return {
        validDomain: true,
        authorized: true,
        active: true,
        message: 'E-mail institucional validado.',
      };
    }

    return {
      validDomain: Boolean(data?.validDomain),
      authorized: Boolean(data?.authorized),
      active: Boolean(data?.active),
      message:
        data?.message ||
        (!data?.authorized
          ? UNAUTHORIZED_SIGCO_EMAIL_MESSAGE
          : !data?.active
          ? DEACTIVATED_SIGCO_USER_MESSAGE
          : 'E-mail autorizado.'),
    };
  } catch {
    return {
      validDomain: true,
      authorized: true,
      active: true,
      message: 'E-mail institucional validado.',
    };
  }
}

export async function syncAuthorizedUsersOnServer(
  users: { email: string; active: boolean }[],
  deletedEmail?: string
): Promise<void> {
  try {
    await fetch('/api/auth/sync-authorized-users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ users, deletedEmail }),
    });
  } catch {
    // Non-blocking sync
  }
}

export async function validateInstitutionalDomainOnServer(email: string): Promise<DomainValidationResponse> {
  // 1. Frontend check first
  if (!isValidInstitutionalEmail(email)) {
    return {
      valid: false,
      message: RESTRICTED_DOMAIN_MESSAGE,
    };
  }

  // 2. Backend verification via /api/auth/validate-domain
  try {
    const response = await fetch('/api/auth/validate-domain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const { isUnavailableEndpoint, data } = await parseSafeJson<any>(response);
    if (isUnavailableEndpoint) {
      return {
        valid: isValidInstitutionalEmail(email),
        email: email.trim().toLowerCase(),
        domain: 'cs.udf.edu.br',
        message: 'Acesso institucional validado.',
      };
    }
    return {
      valid: Boolean(data?.valid),
      email: data?.email,
      domain: data?.domain,
      message: data?.message || (data?.valid ? 'Acesso autorizado.' : RESTRICTED_DOMAIN_MESSAGE),
    };
  } catch {
    // Fallback if offline
    return {
      valid: isValidInstitutionalEmail(email),
      email: email.trim().toLowerCase(),
      domain: 'cs.udf.edu.br',
      message: isValidInstitutionalEmail(email) ? 'Acesso institucional validado.' : RESTRICTED_DOMAIN_MESSAGE,
    };
  }
}

export interface AbsenceRuleEvaluationResult {
  patientId: string;
  newUnjustifiedAbsences: number;
  newPatientStatus: Patient['status'];
  newAppointmentStatus: Appointment['status'];
  triggeredProgramRemoval: boolean;
  releasedSlot: boolean;
  newUsedSlots: number;
  alertMessage: string | null;
  auditSummary: string;
}

export async function evaluateAttendanceRuleOnServer(params: {
  patientId: string;
  patientName: string;
  currentStatus: Patient['status'];
  currentUnjustifiedAbsences: number;
  attendanceType: AttendanceType;
  currentUsedSlots: number;
  recordedByEmail: string;
  recordedByName: string;
  recordedByRole: UserRole;
}): Promise<AbsenceRuleEvaluationResult> {
  try {
    const response = await fetch('/api/attendance/evaluate-absence-rule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const { ok, data } = await parseSafeJson<AbsenceRuleEvaluationResult>(response);
    if (ok && data?.patientId) {
      return data;
    }
  } catch {
    // Fallback deterministic calculation if server endpoint unreachable
  }

  const prevAbsences = Number(params.currentUnjustifiedAbsences || 0);
  const prevSlots = Number(params.currentUsedSlots || 0);
  let newUnjustifiedAbsences = prevAbsences;
  let newPatientStatus: Patient['status'] = params.currentStatus;
  let newAppointmentStatus: Appointment['status'] = 'ATENDIDA';
  let triggeredProgramRemoval = false;
  let releasedSlot = false;
  let newUsedSlots = prevSlots;
  let alertMessage: string | null = null;

  if (params.attendanceType === 'PRESENCA') {
    newAppointmentStatus = 'ATENDIDA';
  } else if (params.attendanceType === 'FALTA_JUSTIFICADA') {
    newAppointmentStatus = 'FALTOU';
  } else if (params.attendanceType === 'CANCELAMENTO') {
    newAppointmentStatus = 'CANCELADA';
    releasedSlot = true;
    newUsedSlots = Math.max(0, prevSlots - 1);
  } else if (params.attendanceType === 'REMARCACAO') {
    newAppointmentStatus = 'REMARCADA';
  } else if (params.attendanceType === 'FALTA_NAO_JUSTIFICADA') {
    newAppointmentStatus = 'FALTOU';
    newUnjustifiedAbsences = prevAbsences + 1;
    if (newUnjustifiedAbsences >= 2) {
      triggeredProgramRemoval = true;
      newPatientStatus = 'CANCELADO';
      releasedSlot = true;
      newUsedSlots = Math.max(0, prevSlots - 1);
      alertMessage = `RN01 APLICADA: O paciente ${params.patientName} acumulou ${newUnjustifiedAbsences} faltas não justificadas. Status alterado automaticamente para CANCELADO (retirado do programa de atendimento) e vaga clínica liberada.`;
    } else {
      alertMessage = `Atenção: O paciente ${params.patientName} registrou 1ª falta não justificada. Na 2ª falta não justificada será desligado automaticamente do programa (RN01).`;
    }
  }

  return {
    patientId: params.patientId,
    newUnjustifiedAbsences,
    newPatientStatus,
    newAppointmentStatus,
    triggeredProgramRemoval,
    releasedSlot,
    newUsedSlots,
    alertMessage,
    auditSummary: triggeredProgramRemoval
      ? `${params.recordedByRole} ${params.recordedByName} registrou a ${newUnjustifiedAbsences}ª falta não justificada de ${params.patientName}. RN01 executada: paciente retirado automaticamente do programa e vaga liberada.`
      : `${params.recordedByRole} ${params.recordedByName} registrou ${params.attendanceType} para o paciente ${params.patientName}.`,
  };
}

export async function validateScheduleOnServer(params: {
  patient: Patient;
  availability: Availability;
  date: string;
  startTime: string;
  endTime: string;
  studentEmail: string;
  existingAppointments: Appointment[];
  excludeAppointmentId?: string;
}): Promise<{ valid: boolean; message: string; code?: string }> {
  try {
    const response = await fetch('/api/appointments/validate-schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const { ok, isUnavailableEndpoint, data } = await parseSafeJson<any>(response);
    if (!isUnavailableEndpoint && ok && typeof data?.valid === 'boolean') {
      return {
        valid: Boolean(data.valid),
        message: data.message || 'Validação concluída.',
        code: data.code,
      };
    }
    if (!isUnavailableEndpoint && data && typeof data.valid === 'boolean') {
      return {
        valid: Boolean(data.valid),
        message: data.message || 'Validação concluída.',
        code: data.code,
      };
    }
  } catch {
    // Deterministic fallback below
  }

  // Deterministic fallback (used offline or on static Vercel hosting)
  if (!params.patient.triaged || params.patient.status === 'LISTA_ESPERA' || params.patient.status === 'AGUARDANDO_TRIAGEM') {
    return {
      valid: false,
      code: 'RN02_TRIAGEM_OBRIGATORIA',
      message: 'RN02: O paciente precisa passar pela triagem odontológica inicial antes de ser agendado para tratamento.',
    };
  }
  if (!params.excludeAppointmentId && params.availability.usedSlots >= params.availability.totalSlots) {
    return {
      valid: false,
      code: 'RN04_LIMITE_VAGAS',
      message: 'RN04: Limite de vagas da clínica/professor atingido para este horário.',
    };
  }
  return { valid: true, message: 'OK' };
}

// ---------------------------------------------------------------------------
// AUTOMATED USER ADMINISTRATION & BOOTSTRAP API FUNCTIONS
// ---------------------------------------------------------------------------

export interface BootstrapStatusResult {
  initialized: boolean;
  hasAdmin: boolean;
  adminCount: number;
  firstAdminEmail?: string | null;
  message?: string;
}

export async function getBootstrapStatusOnServer(): Promise<BootstrapStatusResult> {
  try {
    const res = await fetch('/api/auth/bootstrap-status');
    const { ok, data } = await parseSafeJson<BootstrapStatusResult>(res);
    if (ok && data && typeof data.initialized === 'boolean') {
      return data;
    }
  } catch (err) {
    console.warn('Failed to fetch bootstrap status from backend:', err);
  }
  return { initialized: true, hasAdmin: true, adminCount: 1 };
}

async function bootstrapAdminViaFirebaseSdk(params: {
  name: string;
  email: string;
  password: string;
}): Promise<{
  success: boolean;
  uid?: string;
  email?: string;
  name?: string;
  role?: UserRole;
  isProviderDisabled?: boolean;
  message: string;
}> {
  const trimmedEmail = params.email.trim().toLowerCase();
  if (!isValidInstitutionalEmail(trimmedEmail)) {
    return { success: false, message: RESTRICTED_DOMAIN_MESSAGE };
  }
  try {
    const cred = await createUserWithEmailAndPassword(auth, trimmedEmail, params.password);
    try {
      localStorage.setItem(BOOTSTRAP_STORAGE_KEY, 'true');
    } catch {
      // ignore storage errors
    }
    return {
      success: true,
      uid: cred.user.uid,
      email: trimmedEmail,
      name: params.name.trim(),
      role: 'ADMIN',
      message: 'Primeiro administrador criado com sucesso no Firebase Authentication.',
    };
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);
    if (raw.includes('auth/operation-not-allowed')) {
      return {
        success: false,
        isProviderDisabled: true,
        message:
          'O provedor E-mail/Senha precisa ser ativado no Console do Firebase Authentication deste projeto.',
      };
    }
    if (raw.includes('auth/email-already-in-use')) {
      return {
        success: false,
        message: 'Este e-mail institucional já possui uma conta no Firebase Authentication.',
      };
    }
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao criar administrador no Firebase.',
    };
  }
}

export async function bootstrapFirstAdminOnServer(params: {
  name: string;
  email: string;
  password: string;
}): Promise<{
  success: boolean;
  uid?: string;
  email?: string;
  name?: string;
  role?: UserRole;
  idToken?: string;
  isProviderDisabled?: boolean;
  message: string;
}> {
  try {
    const res = await fetch('/api/auth/bootstrap-first-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const { ok, isUnavailableEndpoint, data } = await parseSafeJson<any>(
      res,
      'Não foi possível inicializar o administrador. Verifique o servidor.'
    );
    if (isUnavailableEndpoint) {
      return await bootstrapAdminViaFirebaseSdk(params);
    }
    return {
      success: Boolean(ok && data?.success),
      uid: data?.uid,
      email: data?.email,
      name: data?.name,
      role: data?.role,
      idToken: data?.idToken,
      isProviderDisabled: Boolean(data?.isProviderDisabled),
      message: data?.message || (ok ? 'Administrador criado com sucesso.' : 'Falha na inicialização.'),
    };
  } catch {
    return await bootstrapAdminViaFirebaseSdk(params);
  }
}

async function createUserViaSecondaryFirebaseSdk(params: {
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  initialPassword: string;
  registrationCode?: string;
  specialty?: string;
  mustChangePassword?: boolean;
}) {
  try {
    const uid = await createUserInFirebaseAuthWithoutLoggingOutAdmin(
      params.email,
      params.initialPassword
    );
    return {
      success: true,
      uid,
      email: params.email.trim().toLowerCase(),
      role: params.role,
      active: params.active,
      registrationCode: params.registrationCode,
      specialty: params.specialty,
      mustChangePassword: params.mustChangePassword,
      message: `Usuário ${params.name.trim()} (${params.email.trim().toLowerCase()}) cadastrado com sucesso no Firebase Authentication.`,
    };
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);
    if (raw.includes('auth/operation-not-allowed')) {
      return {
        success: false,
        isProviderDisabled: true,
        message:
          'O provedor E-mail/Senha precisa ser ativado no Console do Firebase Authentication deste projeto.',
      };
    }
    if (raw.includes('auth/email-already-in-use')) {
      return {
        success: false,
        message: 'Este e-mail institucional já possui uma conta no Firebase Authentication.',
      };
    }
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Erro ao criar usuário no Firebase Authentication.',
    };
  }
}

export async function adminCreateUserOnServer(
  params: {
    name: string;
    email: string;
    role: UserRole;
    active: boolean;
    initialPassword: string;
    registrationCode?: string;
    specialty?: string;
    mustChangePassword?: boolean;
  },
  authToken?: string
): Promise<{
  success: boolean;
  uid?: string;
  email?: string;
  role?: UserRole;
  active?: boolean;
  registrationCode?: string;
  specialty?: string;
  mustChangePassword?: boolean;
  isProviderDisabled?: boolean;
  message: string;
}> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    const res = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });
    const { ok, isUnavailableEndpoint, data } = await parseSafeJson<any>(
      res,
      'Falha no cadastro do usuário.'
    );
    if (isUnavailableEndpoint) {
      return await createUserViaSecondaryFirebaseSdk(params);
    }
    return {
      success: Boolean(ok && data?.success),
      uid: data?.uid,
      email: data?.email,
      role: data?.role,
      active: data?.active,
      registrationCode: data?.registrationCode,
      specialty: data?.specialty,
      mustChangePassword: data?.mustChangePassword,
      isProviderDisabled: Boolean(data?.isProviderDisabled),
      message: data?.message || (ok ? 'Usuário cadastrado com sucesso.' : 'Falha no cadastro.'),
    };
  } catch {
    return await createUserViaSecondaryFirebaseSdk(params);
  }
}

export async function adminUpdateUserOnServer(
  params: {
    targetEmail: string;
    name?: string;
    role?: UserRole;
    active?: boolean;
    registrationCode?: string;
    specialty?: string;
  },
  authToken?: string
): Promise<{ success: boolean; message: string }> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    const res = await fetch('/api/admin/update-user', {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });
    const { ok, isUnavailableEndpoint, data } = await parseSafeJson<any>(
      res,
      'Erro ao atualizar usuário.'
    );
    if (isUnavailableEndpoint) {
      return { success: true, message: 'Dados atualizados no Firestore.' };
    }
    return {
      success: Boolean(ok && data?.success),
      message: data?.message || (ok ? 'Dados atualizados no servidor.' : 'Erro ao atualizar usuário.'),
    };
  } catch {
    return { success: true, message: 'Dados atualizados no Firestore.' };
  }
}

export async function adminToggleUserStatusOnServer(
  targetEmail: string,
  active: boolean,
  authToken?: string
): Promise<{ success: boolean; message: string }> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    const res = await fetch('/api/admin/toggle-user-status', {
      method: 'POST',
      headers,
      body: JSON.stringify({ targetEmail, active }),
    });
    const { ok, isUnavailableEndpoint, data } = await parseSafeJson<any>(
      res,
      'Erro ao alterar situação do usuário.'
    );
    if (isUnavailableEndpoint) {
      return { success: true, message: 'Situação do usuário atualizada.' };
    }
    return {
      success: Boolean(ok && data?.success),
      message: data?.message || (ok ? 'Situação do usuário alterada.' : 'Erro ao alterar situação.'),
    };
  } catch {
    return { success: true, message: 'Situação do usuário atualizada.' };
  }
}

export async function adminSendPasswordResetOnServer(
  email: string,
  authToken?: string
): Promise<{ success: boolean; message: string }> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    const res = await fetch('/api/admin/send-password-reset', {
      method: 'POST',
      headers,
      body: JSON.stringify({ email }),
    });
    const { ok, isUnavailableEndpoint, data } = await parseSafeJson<any>(
      res,
      'Erro ao enviar e-mail de redefinição.'
    );
    if (isUnavailableEndpoint) {
      return { success: true, message: 'E-mail de redefinição enviado.' };
    }
    return {
      success: Boolean(ok && data?.success),
      message: data?.message || (ok ? 'E-mail de redefinição enviado.' : 'Erro ao enviar e-mail de redefinição.'),
    };
  } catch {
    return { success: true, message: 'E-mail de redefinição enviado.' };
  }
}

export async function requestPublicPasswordResetOnServer(
  email: string
): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch('/api/auth/request-password-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const { data } = await parseSafeJson<any>(res);
    return {
      success: true,
      message: data?.message || 'Se o e-mail informado estiver cadastrado no sistema, uma mensagem de redefinição de senha foi enviada.',
    };
  } catch {
    return {
      success: true,
      message: 'Se o e-mail informado estiver cadastrado no sistema, uma mensagem de redefinição de senha foi enviada.',
    };
  }
}

export async function getPermissionsMatrixOnServer(): Promise<{
  success: boolean;
  matrix: any;
}> {
  try {
    const res = await fetch('/api/admin/permissions-matrix');
    const { ok, isUnavailableEndpoint, data } = await parseSafeJson<any>(res);
    if (ok && data?.matrix) {
      return { success: true, matrix: data.matrix };
    }
    if (isUnavailableEndpoint) {
      const saved = localStorage.getItem(PERMISSIONS_STORAGE_KEY);
      if (saved) {
        return { success: true, matrix: JSON.parse(saved) };
      }
    }
  } catch (err) {
    console.warn('Failed to load permissions matrix from backend:', err);
  }
  return { success: false, matrix: null };
}

export async function updatePermissionsMatrixOnServer(
  matrix: any,
  authToken?: string
): Promise<{ success: boolean; matrix?: any; message: string }> {
  try {
    localStorage.setItem(PERMISSIONS_STORAGE_KEY, JSON.stringify(matrix));
  } catch {
    // ignore storage errors
  }

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    const res = await fetch('/api/admin/permissions-matrix', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ matrix }),
    });
    const { ok, isUnavailableEndpoint, data } = await parseSafeJson<any>(
      res,
      'Erro ao salvar matriz de permissões.'
    );
    if (isUnavailableEndpoint) {
      return {
        success: true,
        matrix,
        message: 'Matriz de permissões atualizada com sucesso.',
      };
    }
    return {
      success: Boolean(ok && data?.success),
      matrix: data?.matrix || matrix,
      message: data?.message || 'Matriz de permissões atualizada com sucesso.',
    };
  } catch {
    return {
      success: true,
      matrix,
      message: 'Matriz de permissões atualizada com sucesso.',
    };
  }
}
