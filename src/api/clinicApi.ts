import { Appointment, AttendanceType, Availability, Patient, UserRole } from '../types';
import { isValidInstitutionalEmail, RESTRICTED_DOMAIN_MESSAGE } from '../utils/validation';

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
    const data = await response.json();
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
    const data = await response.json();
    return {
      validDomain: Boolean(data.validDomain),
      authorized: Boolean(data.authorized),
      active: Boolean(data.active),
      message:
        data.message ||
        (!data.authorized
          ? UNAUTHORIZED_SIGCO_EMAIL_MESSAGE
          : !data.active
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
    const data = await response.json();
    return {
      valid: Boolean(data.valid),
      email: data.email,
      domain: data.domain,
      message: data.message || (data.valid ? 'Acesso autorizado.' : RESTRICTED_DOMAIN_MESSAGE),
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
    if (response.ok) {
      return await response.json();
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
    const data = await response.json();
    return {
      valid: Boolean(data.valid),
      message: data.message,
      code: data.code,
    };
  } catch {
    // Deterministic fallback
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
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Failed to fetch bootstrap status from backend:', err);
  }
  return { initialized: true, hasAdmin: true, adminCount: 1 };
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
    const data = await res.json();
    return {
      success: res.ok && data.success,
      uid: data.uid,
      email: data.email,
      name: data.name,
      role: data.role,
      idToken: data.idToken,
      isProviderDisabled: data.isProviderDisabled,
      message: data.message || (res.ok ? 'Administrador criado com sucesso.' : 'Falha na inicialização.'),
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Falha na comunicação com o servidor.',
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
    const data = await res.json();
    return {
      success: res.ok && data.success,
      uid: data.uid,
      email: data.email,
      role: data.role,
      active: data.active,
      registrationCode: data.registrationCode,
      specialty: data.specialty,
      mustChangePassword: data.mustChangePassword,
      isProviderDisabled: data.isProviderDisabled,
      message: data.message || (res.ok ? 'Usuário cadastrado com sucesso.' : 'Falha no cadastro.'),
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Erro ao cadastrar usuário no servidor.',
    };
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
    const data = await res.json();
    return {
      success: res.ok && data.success,
      message: data.message || 'Dados atualizados no servidor.',
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Erro ao atualizar usuário.',
    };
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
    const data = await res.json();
    return {
      success: res.ok && data.success,
      message: data.message || 'Situação do usuário alterada.',
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Erro ao alterar situação.',
    };
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
    const data = await res.json();
    return {
      success: res.ok && data.success,
      message: data.message || 'E-mail de redefinição enviado.',
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Erro ao enviar e-mail de redefinição.',
    };
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
    const data = await res.json();
    return {
      success: true,
      message: data.message || 'Se o e-mail informado estiver cadastrado no sistema, uma mensagem de redefinição de senha foi enviada.',
    };
  } catch (err) {
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
    if (res.ok) {
      return await res.json();
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
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    const res = await fetch('/api/admin/permissions-matrix', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ matrix }),
    });
    const data = await res.json();
    return {
      success: res.ok && data.success,
      matrix: data.matrix,
      message: data.message || 'Matriz de permissões atualizada com sucesso.',
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Erro ao salvar matriz de permissões.',
    };
  }
}
