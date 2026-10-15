import { NavigationTab, Patient, UserRole, WaitingListStatus } from '../types';

// Verbatim patterns and limits synced with firebase-blueprint.json & firestore.rules
export const INSTITUTIONAL_EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@cs\.udf\.edu\.br$/;
export const VALID_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
export const INSTITUTION_DOMAIN = 'cs.udf.edu.br' as const;

export const RESTRICTED_DOMAIN_MESSAGE =
  'Acesso restrito. Utilize seu e-mail institucional @cs.udf.edu.br.';

export function isValidInstitutionalEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim().toLowerCase();
  return trimmed.length >= 15 && trimmed.length <= 120 && INSTITUTIONAL_EMAIL_PATTERN.test(trimmed);
}

export function sanitizeString(val: string | undefined | null, maxLength: number, fallback = ''): string {
  const clean = (val ?? fallback).trim();
  if (clean.length > maxLength) {
    return clean.slice(0, maxLength);
  }
  return clean;
}

export function sanitizeId(id: string): string {
  const cleaned = id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned.length > 0 ? cleaned : `id_${Date.now()}`;
}

// RBAC Permission Matrix per User Role (Section 2 & Section 16)
export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrador',
  RECEPCAO: 'Recepcionista',
  TRIAGEM: 'Dentista de Triagem',
  PROFESSOR: 'Professor / Supervisor',
  ALUNO: 'Aluno de Odontologia',
};

export const ROLE_ALLOWED_TABS: Record<UserRole, NavigationTab[]> = {
  ADMIN: [
    'dashboard',
    'patients',
    'waiting_list',
    'screening',
    'schedule',
    'medical_records',
    'odontogram',
    'referrals',
    'students',
    'professors',
    'clinics_specialties',
    'reports',
    'users',
    'settings',
    'audit',
    'help',
  ],
  RECEPCAO: [
    'dashboard',
    'patients',
    'waiting_list',
    'schedule',
    'settings',
    'help',
  ],
  TRIAGEM: [
    'dashboard',
    'patients',
    'waiting_list',
    'screening',
    'medical_records',
    'odontogram',
    'referrals',
    'settings',
    'help',
  ],
  PROFESSOR: [
    'dashboard',
    'patients',
    'waiting_list',
    'schedule',
    'medical_records',
    'odontogram',
    'referrals',
    'students',
    'professors',
    'clinics_specialties',
    'reports',
    'settings',
    'help',
  ],
  ALUNO: [
    'dashboard',
    'patients',
    'schedule',
    'medical_records',
    'odontogram',
    'referrals',
    'settings',
    'help',
  ],
};

export function canUserAccessTab(role: UserRole, tab: NavigationTab): boolean {
  return ROLE_ALLOWED_TABS[role]?.includes(tab) ?? false;
}

// RN03 & RN06: Student can ONLY view patients and clinical records under their responsibility
export function canUserViewPatient(userRole: UserRole, userEmail: string, patient: Patient): boolean {
  if (userRole === 'ADMIN' || userRole === 'RECEPCAO' || userRole === 'TRIAGEM' || userRole === 'PROFESSOR') {
    return true;
  }
  if (userRole === 'ALUNO') {
    return patient.assignedStudentEmail.toLowerCase() === userEmail.toLowerCase();
  }
  return false;
}

// RN03: Receptionist cannot access clinical content of medical records
export function canUserAccessClinicalRecord(userRole: UserRole, userEmail: string, patient: Patient): boolean {
  if (userRole === 'RECEPCAO') {
    return false;
  }
  if (userRole === 'ADMIN' || userRole === 'TRIAGEM' || userRole === 'PROFESSOR') {
    return true;
  }
  if (userRole === 'ALUNO') {
    return patient.assignedStudentEmail.toLowerCase() === userEmail.toLowerCase();
  }
  return false;
}

export const PATIENT_STATUS_LABELS: Record<Patient['status'], string> = {
  LISTA_ESPERA: 'Lista de espera',
  AGUARDANDO_TRIAGEM: 'Aguardando triagem',
  TRIADO: 'Triado',
  AGUARDANDO_VAGA: 'Aguardando vaga',
  EM_TRATAMENTO: 'Em tratamento',
  ENCAMINHADO: 'Encaminhado',
  CONCLUIDO: 'Concluído',
  ALTA: 'Alta clínica',
  CANCELADO: 'Desligado / Cancelado',
  EXCLUIDO: 'Excluído',
};

export const PRIORITY_LABELS: Record<Patient['priority'], string> = {
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta',
  URGENTE: 'Urgente',
};

export const WAITING_LIST_STATUS_LABELS: Record<WaitingListStatus, string> = {
  AGUARDANDO_TRIAGEM: 'Aguardando triagem',
  AGUARDANDO_VAGA: 'Aguardando vaga',
  PRESENTE: 'Presente na recepção',
  CHAMADO: 'Chamado ao box/cadeira',
  EM_ATENDIMENTO: 'Em atendimento',
  ATENDIDO: 'Atendimento concluído',
  NAO_COMPARECEU: 'Não compareceu',
  REMOVIDO: 'Removido da fila',
};

export const INITIAL_SPECIALTIES = [
  'Clínica Geral',
  'Endodontia',
  'Cirurgia',
  'Prótese',
  'Periodontia',
  'Odontopediatria',
  'Dentística',
  'Outras',
];
