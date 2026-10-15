/**
 * Firestore Security Rules Test Suite — Dirty Dozen Verification
 * Verifies that all 12 adversarial payloads defined in security_spec.md return PERMISSION_DENIED.
 */

export interface SecurityTestCase {
  id: number;
  name: string;
  collection: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: {
    uid: string;
    email: string;
    email_verified: boolean;
  } | null;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: SecurityTestCase[] = [
  {
    id: 1,
    name: 'Non-Institutional Email Spoof (@gmail.com)',
    collection: 'users/user_1',
    operation: 'create',
    auth: { uid: 'user_1', email: 'attacker@gmail.com', email_verified: true },
    payload: {
      uid: 'user_1',
      name: 'Attacker',
      email: 'attacker@gmail.com',
      role: 'ADMIN',
      registrationCode: '001',
      specialty: 'Geral',
      active: true,
      institutionDomain: 'cs.udf.edu.br',
      createdByUid: 'user_1'
    },
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 2,
    name: 'Unverified Institutional Email Token',
    collection: 'patients/pat_1',
    operation: 'get',
    auth: { uid: 'user_2', email: 'aluno@cs.udf.edu.br', email_verified: false },
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 3,
    name: 'Shadow Field Injection on Patient Update',
    collection: 'patients/pat_1',
    operation: 'update',
    auth: { uid: 'user_admin', email: 'administrador@cs.udf.edu.br', email_verified: true },
    payload: {
      status: 'EM_TRATAMENTO',
      isGhostField: true
    },
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 4,
    name: 'Creator Spoofing on Patient Create',
    collection: 'patients/pat_2',
    operation: 'create',
    auth: { uid: 'user_recep', email: 'recepcao@cs.udf.edu.br', email_verified: true },
    payload: {
      createdByUid: 'some_other_uid'
    },
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 5,
    name: 'Immortal Field Mutation (createdByUid)',
    collection: 'patients/pat_1',
    operation: 'update',
    auth: { uid: 'user_recep', email: 'recepcao@cs.udf.edu.br', email_verified: true },
    payload: {
      createdByUid: 'hijacked_uid'
    },
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 6,
    name: 'Denial-of-Wallet String Overflow (>2000 chars)',
    collection: 'screenings/scr_1',
    operation: 'create',
    auth: { uid: 'user_triagem', email: 'triagem@cs.udf.edu.br', email_verified: true },
    payload: {
      initialAnamnesis: 'A'.repeat(2500)
    },
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 7,
    name: 'ID Poisoning with Special Characters',
    collection: 'patients/invalid$id!@#',
    operation: 'create',
    auth: { uid: 'user_recep', email: 'recepcao@cs.udf.edu.br', email_verified: true },
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 8,
    name: 'Invalid Status Enum on Appointment',
    collection: 'appointments/apt_1',
    operation: 'update',
    auth: { uid: 'user_aluno', email: 'aluno.lucas@cs.udf.edu.br', email_verified: true },
    payload: {
      status: 'INVALID_STATUS_ENUM'
    },
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 9,
    name: 'Cross-Tenant Query Scraping on List',
    collection: 'patients',
    operation: 'list',
    auth: { uid: 'user_ext', email: 'externo@outrodominio.com', email_verified: true },
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 10,
    name: 'Receptionist Clinical Snooping on Medical Record (RN03)',
    collection: 'medical_records/rec_1',
    operation: 'get',
    auth: { uid: 'user_recep', email: 'recepcao@cs.udf.edu.br', email_verified: true },
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 11,
    name: 'Student Cross-Patient Snooping (RN06)',
    collection: 'medical_records/rec_student_a',
    operation: 'get',
    auth: { uid: 'user_student_b', email: 'aluno.outro@cs.udf.edu.br', email_verified: true },
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 12,
    name: 'Audit Log Tampering / Deletion (RN08)',
    collection: 'audit_logs/log_1',
    operation: 'delete',
    auth: { uid: 'user_admin', email: 'administrador@cs.udf.edu.br', email_verified: true },
    expectedResult: 'PERMISSION_DENIED'
  }
];
