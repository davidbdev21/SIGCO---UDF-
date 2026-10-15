export type UserRole = 'ADMIN' | 'RECEPCAO' | 'TRIAGEM' | 'PROFESSOR' | 'ALUNO';

export type PriorityLevel = 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE';

export type PatientStatus =
  | 'LISTA_ESPERA'
  | 'AGUARDANDO_TRIAGEM'
  | 'TRIADO'
  | 'AGUARDANDO_VAGA'
  | 'EM_TRATAMENTO'
  | 'ENCAMINHADO'
  | 'CONCLUIDO'
  | 'ALTA'
  | 'CANCELADO'
  | 'EXCLUIDO';

export type WaitingListStatus =
  | 'AGUARDANDO_TRIAGEM'
  | 'AGUARDANDO_VAGA'
  | 'EM_ATENDIMENTO'
  | 'ATENDIDO'
  | 'REMOVIDO';

export type AppointmentStatus =
  | 'AGENDADA'
  | 'CONFIRMADA'
  | 'EM_ATENDIMENTO'
  | 'ATENDIDA'
  | 'FALTOU'
  | 'CANCELADA'
  | 'REMARCADA';

export type AttendanceType =
  | 'PRESENCA'
  | 'FALTA_JUSTIFICADA'
  | 'FALTA_NAO_JUSTIFICADA'
  | 'CANCELAMENTO'
  | 'REMARCACAO';

export type ReferralStatus =
  | 'PENDENTE'
  | 'ACEITO'
  | 'EM_ATENDIMENTO'
  | 'CONCLUIDO'
  | 'CANCELADO';

export type ToothCondition =
  | 'HIGIDO'
  | 'CARIE'
  | 'RESTAURACAO'
  | 'AUSENTE'
  | 'EM_TRATAMENTO'
  | 'NECESSIDADE_PROCEDIMENTO';

export interface SystemUser {
  id: string;
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  registrationCode: string;
  specialty: string;
  active: boolean;
  createdAt?: string;
  lastAccess?: string;
  mustChangePassword?: boolean;
  institutionDomain: 'cs.udf.edu.br';
  createdByUid: string;
}

export interface Patient {
  id: string;
  name: string;
  cpf: string;
  birthDate: string;
  gender: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  registrationDate: string;
  adminNotes: string;
  status: PatientStatus;
  specialtyNeeded: string;
  priority: PriorityLevel;
  unjustifiedAbsences: number;
  triaged: boolean;
  assignedStudentEmail: string;
  assignedProfessorEmail: string;
  institutionDomain: 'cs.udf.edu.br';
  createdByUid: string;
}

export interface WaitingListEntry {
  id: string;
  patientId: string;
  patientName: string;
  position: number;
  entryDate: string;
  specialty: string;
  priority: PriorityLevel;
  status: WaitingListStatus;
  notes: string;
  responsibleName: string;
  institutionDomain: 'cs.udf.edu.br';
  createdByUid: string;
}

export interface Screening {
  id: string;
  patientId: string;
  patientName: string;
  dentistName: string;
  dentistEmail: string;
  screeningDate: string;
  initialAnamnesis: string;
  dentalNeeds: string;
  specialty: string;
  priority: PriorityLevel;
  notes: string;
  status: 'REALIZADA' | 'ENCAMINHADO' | 'REAVALIACAO';
  institutionDomain: 'cs.udf.edu.br';
  createdByUid: string;
}

export interface Appointment {
  id: string;
  patientId: string;
  patientName: string;
  studentName: string;
  studentEmail: string;
  professorName: string;
  professorEmail: string;
  clinicName: string;
  specialty: string;
  date: string;
  startTime: string;
  endTime: string;
  availabilityId: string;
  status: AppointmentStatus;
  notes: string;
  institutionDomain: 'cs.udf.edu.br';
  createdByUid: string;
}

export interface Availability {
  id: string;
  professorName: string;
  professorEmail: string;
  clinicName: string;
  specialty: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  totalSlots: number;
  usedSlots: number;
  authorizedStudentsInfo: string;
  status: 'ATIVA' | 'ENCERRADA';
  institutionDomain: 'cs.udf.edu.br';
  createdByUid: string;
}

export interface MedicalRecord {
  id: string;
  patientId: string;
  patientName: string;
  responsibleStudentEmail: string;
  supervisorProfessorEmail: string;
  diagnosis: string;
  evaluationNotes: string;
  clinicalNeeds: string;
  treatmentPlanProcedure: string;
  treatmentPlanSpecialty: string;
  treatmentPlanPriority: PriorityLevel;
  treatmentPlanForecast: string;
  validatedByProfessor: boolean;
  status: 'ATIVO' | 'EM_REVISAO' | 'CONCLUIDO' | 'ARQUIVADO';
  institutionDomain: 'cs.udf.edu.br';
  createdByUid: string;
}

export interface Anamnesis {
  id: string;
  patientId: string;
  patientName: string;
  chiefComplaint: string;
  medicalHistory: string;
  relevantInfo: string;
  observations: string;
  recordedByEmail: string;
  institutionDomain: 'cs.udf.edu.br';
  createdByUid: string;
}

export interface ClinicalEvolution {
  id: string;
  patientId: string;
  patientName: string;
  date: string;
  studentName: string;
  studentEmail: string;
  professorName: string;
  professorEmail: string;
  procedureName: string;
  evolutionText: string;
  observations: string;
  status: 'PENDENTE_VALIDACAO' | 'VALIDADO' | 'REVISAO_SOLICITADA';
  institutionDomain: 'cs.udf.edu.br';
  createdByUid: string;
}

export interface Procedure {
  id: string;
  code: string;
  name: string;
  specialty: string;
  description: string;
  estimatedDurationMinutes: number;
  status: 'ATIVO' | 'INATIVO';
  institutionDomain: 'cs.udf.edu.br';
  createdByUid: string;
}

export interface Odontogram {
  id: string;
  patientId: string;
  patientName: string;
  toothNumber: number;
  condition: ToothCondition;
  surface: string;
  notes: string;
  updatedByEmail: string;
  institutionDomain: 'cs.udf.edu.br';
  createdByUid: string;
}

export interface Referral {
  id: string;
  patientId: string;
  patientName: string;
  originSpecialty: string;
  destinationSpecialty: string;
  responsibleProfessional: string;
  responsibleEmail: string;
  reason: string;
  date: string;
  priority: PriorityLevel;
  notes: string;
  status: ReferralStatus;
  institutionDomain: 'cs.udf.edu.br';
  createdByUid: string;
}

export interface AttendanceRecord {
  id: string;
  appointmentId: string;
  patientId: string;
  patientName: string;
  date: string;
  type: AttendanceType;
  justification: string;
  triggeredProgramRemoval: boolean;
  recordedByEmail: string;
  institutionDomain: 'cs.udf.edu.br';
  createdByUid: string;
}

export interface Specialty {
  id: string;
  name: string;
  code: string;
  description: string;
  active: boolean;
  institutionDomain: 'cs.udf.edu.br';
  createdByUid: string;
}

export interface Clinic {
  id: string;
  name: string;
  specialty: string;
  location: string;
  capacity: number;
  active: boolean;
  institutionDomain: 'cs.udf.edu.br';
  createdByUid: string;
}

export interface StudentProfile {
  id: string;
  name: string;
  email: string;
  enrollmentNumber: string;
  semester: string;
  specialtyClinic: string;
  supervisorEmail: string;
  active: boolean;
  institutionDomain: 'cs.udf.edu.br';
  createdByUid: string;
}

export interface ProfessorProfile {
  id: string;
  name: string;
  email: string;
  cro: string;
  specialty: string;
  clinicName: string;
  active: boolean;
  institutionDomain: 'cs.udf.edu.br';
  createdByUid: string;
}

export interface NotificationItem {
  id: string;
  recipientName: string;
  recipientContact: string;
  type: 'CONFIRMACAO' | 'LEMBRETE' | 'ALTERACAO_HORARIO' | 'CANCELAMENTO' | 'ENCAMINHAMENTO' | 'AVISO_TRIAGEM' | 'ALERTA_FALTAS';
  channel: 'SISTEMA' | 'WHATSAPP_FILA' | 'EMAIL';
  message: string;
  status: 'PENDENTE' | 'ENVIADA' | 'LIDA';
  date: string;
  institutionDomain: 'cs.udf.edu.br';
  createdByUid: string;
}

export interface AuditLog {
  id: string;
  userName: string;
  userEmail: string;
  userRole: UserRole;
  action: string;
  targetRecord: string;
  operationSummary: string;
  timestampIso: string;
  institutionDomain: 'cs.udf.edu.br';
  createdByUid: string;
}

export type NavigationTab =
  | 'dashboard'
  | 'patients'
  | 'waiting_list'
  | 'screening'
  | 'schedule'
  | 'medical_records'
  | 'odontogram'
  | 'referrals'
  | 'students'
  | 'professors'
  | 'clinics_specialties'
  | 'reports'
  | 'users'
  | 'settings'
  | 'audit'
  | 'help';

