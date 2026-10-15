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
