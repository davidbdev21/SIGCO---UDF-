import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  deleteDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  Anamnesis,
  Appointment,
  AttendanceRecord,
  AttendanceType,
  AuditLog,
  Availability,
  Clinic,
  ClinicalEvolution,
  MedicalRecord,
  NotificationItem,
  Odontogram,
  Patient,
  Procedure,
  ProfessorProfile,
  Referral,
  Screening,
  Specialty,
  StudentProfile,
  SystemUser,
  UserRole,
  WaitingListEntry,
} from '../types';
import { INSTITUTION_DOMAIN, sanitizeId, sanitizeString } from '../utils/validation';
import { buildSeedData } from './seedData';
import { evaluateAttendanceRuleOnServer, validateScheduleOnServer } from '../api/clinicApi';

// Helper to write an immutable audit log entry (RN08)
export async function recordAuditLog(params: {
  uid: string;
  userName: string;
  userEmail: string;
  userRole: UserRole;
  action: string;
  targetRecord: string;
  operationSummary: string;
}): Promise<void> {
  const logId = sanitizeId(`log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  const path = `audit_logs/${logId}`;
  const payload: Omit<AuditLog, 'id'> = {
    userName: sanitizeString(params.userName, 120, 'Usuário Institucional'),
    userEmail: sanitizeString(params.userEmail, 120, 'usuario@cs.udf.edu.br'),
    userRole: params.userRole,
    action: sanitizeString(params.action, 120, 'OPERACAO_SISTEMA'),
    targetRecord: sanitizeString(params.targetRecord, 200, 'Registro Geral'),
    operationSummary: sanitizeString(params.operationSummary, 500, 'Operação registrada na auditoria.'),
    timestampIso: new Date().toISOString().slice(0, 35),
    institutionDomain: INSTITUTION_DOMAIN,
    createdByUid: params.uid,
  };
  try {
    await setDoc(doc(db, 'audit_logs', logId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

let activeSeedPromise: Promise<boolean> | null = null;

// Seed database if empty for first-time initialization
export async function ensureDatabaseSeeded(uid: string): Promise<boolean> {
  if (activeSeedPromise) {
    return activeSeedPromise;
  }

  activeSeedPromise = (async () => {
    const path = 'patients';
    try {
      const seed = buildSeedData(uid);
      const usersSnap = await getDocs(
        query(collection(db, 'users'), where('institutionDomain', '==', INSTITUTION_DOMAIN))
      );
      if (usersSnap.size < 3) {
        const usersBatch = writeBatch(db);
        for (const u of seed.seedUsers) {
          const existingEmail = usersSnap.docs.some(
            (d) => String(d.data().email || '').toLowerCase() === u.email.toLowerCase()
          );
          if (!existingEmail) {
            const { id, ...data } = u;
            usersBatch.set(doc(db, 'users', id), data);
          }
        }
        await usersBatch.commit();
      }

      const q = query(collection(db, 'patients'), where('institutionDomain', '==', INSTITUTION_DOMAIN));
      const snap = await getDocs(q);
      if (!snap.empty) {
        return false;
      }

      const batch = writeBatch(db);

      for (const item of seed.specialties) {
        const { id, ...data } = item;
        batch.set(doc(db, 'specialties', id), data);
      }
      for (const item of seed.clinics) {
        const { id, ...data } = item;
        batch.set(doc(db, 'clinics', id), data);
      }
      for (const item of seed.professors) {
        const { id, ...data } = item;
        batch.set(doc(db, 'professors', id), data);
      }
      for (const item of seed.students) {
        const { id, ...data } = item;
        batch.set(doc(db, 'students', id), data);
      }
      for (const item of seed.patients) {
        const { id, ...data } = item;
        batch.set(doc(db, 'patients', id), data);
      }
      for (const item of seed.waitingList) {
        const { id, ...data } = item;
        batch.set(doc(db, 'waiting_list', id), data);
      }
      for (const item of seed.screenings) {
        const { id, ...data } = item;
        batch.set(doc(db, 'screenings', id), data);
      }
      for (const item of seed.availabilities) {
        const { id, ...data } = item;
        batch.set(doc(db, 'availability', id), data);
      }
      for (const item of seed.appointments) {
        const { id, ...data } = item;
        batch.set(doc(db, 'appointments', id), data);
      }
      for (const item of seed.medicalRecords) {
        const { id, ...data } = item;
        batch.set(doc(db, 'medical_records', id), data);
      }
      for (const item of seed.anamnesisList) {
        const { id, ...data } = item;
        batch.set(doc(db, 'anamnesis', id), data);
      }
      for (const item of seed.evolutions) {
        const { id, ...data } = item;
        batch.set(doc(db, 'clinical_evolution', id), data);
      }
      for (const item of seed.procedures) {
        const { id, ...data } = item;
        batch.set(doc(db, 'procedures', id), data);
      }
      for (const item of seed.odontograms) {
        const { id, ...data } = item;
        batch.set(doc(db, 'odontograms', id), data);
      }
      for (const item of seed.referrals) {
        const { id, ...data } = item;
        batch.set(doc(db, 'referrals', id), data);
      }
      for (const item of seed.attendanceRecords) {
        const { id, ...data } = item;
        batch.set(doc(db, 'attendance', id), data);
      }
      for (const item of seed.notifications) {
        const { id, ...data } = item;
        batch.set(doc(db, 'notifications', id), data);
      }

      const existingAuditSnap = await getDoc(doc(db, 'audit_logs', 'log_01'));
      if (!existingAuditSnap.exists()) {
        for (const item of seed.auditLogs) {
          const { id, ...data } = item;
          batch.set(doc(db, 'audit_logs', id), data);
        }
      }

      await batch.commit();
      return true;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    } finally {
      activeSeedPromise = null;
    }
  })();

  return activeSeedPromise;
}

// Create or update patient
export async function savePatientRecord(
  patientData: Omit<Patient, 'id' | 'institutionDomain' | 'createdByUid'>,
  currentUser: SystemUser,
  existingId?: string,
  addToWaitingList = false
): Promise<string> {
  const id = existingId ? sanitizeId(existingId) : sanitizeId(`pat_${Date.now()}`);
  const path = `patients/${id}`;

  const cleanPayload: Omit<Patient, 'id'> = {
    name: sanitizeString(patientData.name, 120, 'Paciente Sem Nome'),
    cpf: sanitizeString(patientData.cpf, 18, '000.000.000-00'),
    birthDate: sanitizeString(patientData.birthDate, 20, '1990-01-01'),
    gender: sanitizeString(patientData.gender, 30, 'Não informado'),
    phone: sanitizeString(patientData.phone, 30, '(61) 99999-0000'),
    whatsapp: sanitizeString(patientData.whatsapp || patientData.phone, 30, '(61) 99999-0000'),
    email: sanitizeString(patientData.email, 120, 'paciente@exemplo.com'),
    address: sanitizeString(patientData.address, 250, 'Brasília - DF'),
    registrationDate: sanitizeString(patientData.registrationDate, 30, new Date().toISOString().slice(0, 10)),
    adminNotes: sanitizeString(patientData.adminNotes, 1000, ''),
    status: patientData.status,
    specialtyNeeded: sanitizeString(patientData.specialtyNeeded, 80, 'Clínica Geral'),
    priority: patientData.priority,
    unjustifiedAbsences: Number(patientData.unjustifiedAbsences || 0),
    triaged: Boolean(patientData.triaged),
    assignedStudentEmail: sanitizeString(patientData.assignedStudentEmail, 120, ''),
    assignedProfessorEmail: sanitizeString(patientData.assignedProfessorEmail, 120, ''),
    institutionDomain: INSTITUTION_DOMAIN,
    createdByUid: currentUser.uid,
  };

  try {
    if (existingId) {
      await updateDoc(doc(db, 'patients', id), {
        name: cleanPayload.name,
        cpf: cleanPayload.cpf,
        birthDate: cleanPayload.birthDate,
        gender: cleanPayload.gender,
        phone: cleanPayload.phone,
        whatsapp: cleanPayload.whatsapp,
        email: cleanPayload.email,
        address: cleanPayload.address,
        adminNotes: cleanPayload.adminNotes,
        status: cleanPayload.status,
        specialtyNeeded: cleanPayload.specialtyNeeded,
        priority: cleanPayload.priority,
        unjustifiedAbsences: cleanPayload.unjustifiedAbsences,
        triaged: cleanPayload.triaged,
        assignedStudentEmail: cleanPayload.assignedStudentEmail,
        assignedProfessorEmail: cleanPayload.assignedProfessorEmail,
      });
    } else {
      await setDoc(doc(db, 'patients', id), cleanPayload);
      if (addToWaitingList) {
        const waitId = sanitizeId(`wait_${Date.now()}`);
        const waitEntry: Omit<WaitingListEntry, 'id'> = {
          patientId: id,
          patientName: cleanPayload.name,
          position: Math.floor(Math.random() * 20) + 5,
          entryDate: cleanPayload.registrationDate,
          specialty: cleanPayload.specialtyNeeded,
          priority: cleanPayload.priority,
          status: 'AGUARDANDO_TRIAGEM',
          notes: cleanPayload.adminNotes || 'Aguardando triagem odontológica inicial.',
          responsibleName: 'Setor de Triagem',
          institutionDomain: INSTITUTION_DOMAIN,
          createdByUid: currentUser.uid,
        };
        await setDoc(doc(db, 'waiting_list', waitId), waitEntry);
      }
    }

    await recordAuditLog({
      uid: currentUser.uid,
      userName: currentUser.name,
      userEmail: currentUser.email,
      userRole: currentUser.role,
      action: existingId ? 'EDICAO_PACIENTE' : 'CADASTRO_PACIENTE',
      targetRecord: `Paciente: ${cleanPayload.name}`,
      operationSummary: `${currentUser.role} ${currentUser.name} ${existingId ? 'atualizou os dados cadastrais' : 'cadastrou novo paciente'} (${cleanPayload.name}).`,
    });

    return id;
  } catch (error) {
    handleFirestoreError(error, existingId ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

// Perform Screening (RN02: Unlocks patient for treatment)
export async function registerScreeningAndForward(
  params: {
    patient: Patient;
    initialAnamnesis: string;
    dentalNeeds: string;
    specialty: string;
    priority: Patient['priority'];
    notes: string;
    assignedStudentEmail: string;
    assignedProfessorEmail: string;
    waitingEntryId?: string;
  },
  currentUser: SystemUser
): Promise<void> {
  const screeningId = sanitizeId(`scr_${Date.now()}`);
  const path = `screenings/${screeningId}`;
  const today = new Date().toISOString().slice(0, 10);

  const screeningPayload: Omit<Screening, 'id'> = {
    patientId: params.patient.id,
    patientName: sanitizeString(params.patient.name, 120),
    dentistName: sanitizeString(currentUser.name, 120),
    dentistEmail: sanitizeString(currentUser.email, 120),
    screeningDate: today,
    initialAnamnesis: sanitizeString(params.initialAnamnesis, 2000, 'Anamnese registrada na triagem.'),
    dentalNeeds: sanitizeString(params.dentalNeeds, 2000, 'Avaliação clínica geral.'),
    specialty: sanitizeString(params.specialty, 80, 'Clínica Geral'),
    priority: params.priority,
    notes: sanitizeString(params.notes, 1000, ''),
    status: 'ENCAMINHADO',
    institutionDomain: INSTITUTION_DOMAIN,
    createdByUid: currentUser.uid,
  };

  try {
    await setDoc(doc(db, 'screenings', screeningId), screeningPayload);

    // Update patient status to TRIADO / AGUARDANDO_VAGA and mark triaged = true (RN02)
    await updateDoc(doc(db, 'patients', params.patient.id), {
      status: params.assignedStudentEmail ? 'EM_TRATAMENTO' : 'AGUARDANDO_VAGA',
      specialtyNeeded: sanitizeString(params.specialty, 80, 'Clínica Geral'),
      priority: params.priority,
      triaged: true,
      assignedStudentEmail: sanitizeString(params.assignedStudentEmail, 120, ''),
      assignedProfessorEmail: sanitizeString(params.assignedProfessorEmail, 120, ''),
    });

    if (params.waitingEntryId) {
      await updateDoc(doc(db, 'waiting_list', params.waitingEntryId), {
        specialty: sanitizeString(params.specialty, 80, 'Clínica Geral'),
        priority: params.priority,
        status: params.assignedStudentEmail ? 'EM_ATENDIMENTO' : 'AGUARDANDO_VAGA',
        notes: sanitizeString(`Triado em ${today}: ${params.dentalNeeds}`, 1000),
      });
    }

    // Create notification
    const notifId = sanitizeId(`notif_${Date.now()}`);
    const notifPayload: Omit<NotificationItem, 'id'> = {
      recipientName: sanitizeString(params.patient.name, 120),
      recipientContact: sanitizeString(params.patient.whatsapp || params.patient.phone, 120),
      type: 'AVISO_TRIAGEM',
      channel: 'WHATSAPP_FILA',
      message: sanitizeString(
        `SIGCO UDF: Triagem concluída com sucesso. Você foi encaminhado(a) para a especialidade de ${params.specialty} (Prioridade: ${params.priority}).`,
        1000
      ),
      status: 'ENVIADA',
      date: today,
      institutionDomain: INSTITUTION_DOMAIN,
      createdByUid: currentUser.uid,
    };
    await setDoc(doc(db, 'notifications', notifId), notifPayload);

    await recordAuditLog({
      uid: currentUser.uid,
      userName: currentUser.name,
      userEmail: currentUser.email,
      userRole: currentUser.role,
      action: 'TRIAGEM_CONCLUIDA_RN02',
      targetRecord: `Paciente: ${params.patient.name}`,
      operationSummary: `Dentista ${currentUser.name} realizou a triagem de ${params.patient.name} e encaminhou para ${params.specialty} (${params.priority}).`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// Schedule Appointment enforcing RN02 (Triage), RN04 (Availability Slots), and RN05 (No Time Conflict)
export async function scheduleClinicalAppointment(
  params: {
    patient: Patient;
    availability: Availability;
    studentName: string;
    studentEmail: string;
    date: string;
    startTime: string;
    endTime: string;
    notes: string;
    existingAppointments: Appointment[];
  },
  currentUser: SystemUser
): Promise<void> {
  // Backend validation for RN02, RN04, RN05
  const check = await validateScheduleOnServer({
    patient: params.patient,
    availability: params.availability,
    date: params.date,
    startTime: params.startTime,
    endTime: params.endTime,
    studentEmail: params.studentEmail,
    existingAppointments: params.existingAppointments,
  });

  if (!check.valid) {
    throw new Error(check.message);
  }

  const aptId = sanitizeId(`apt_${Date.now()}`);
  const path = `appointments/${aptId}`;

  const payload: Omit<Appointment, 'id'> = {
    patientId: params.patient.id,
    patientName: sanitizeString(params.patient.name, 120),
    studentName: sanitizeString(params.studentName, 120),
    studentEmail: sanitizeString(params.studentEmail, 120),
    professorName: sanitizeString(params.availability.professorName, 120),
    professorEmail: sanitizeString(params.availability.professorEmail, 120),
    clinicName: sanitizeString(params.availability.clinicName, 100),
    specialty: sanitizeString(params.availability.specialty, 80),
    date: sanitizeString(params.date, 20),
    startTime: sanitizeString(params.startTime, 10),
    endTime: sanitizeString(params.endTime, 10),
    availabilityId: params.availability.id,
    status: 'AGENDADA',
    notes: sanitizeString(params.notes, 1000, 'Consulta clínica agendada.'),
    institutionDomain: INSTITUTION_DOMAIN,
    createdByUid: currentUser.uid,
  };

  try {
    await setDoc(doc(db, 'appointments', aptId), payload);

    // Increment usedSlots in availability (RN04)
    const nextUsed = Math.min(params.availability.totalSlots, params.availability.usedSlots + 1);
    await updateDoc(doc(db, 'availability', params.availability.id), {
      usedSlots: nextUsed,
    });

    // Update patient status & assignment
    await updateDoc(doc(db, 'patients', params.patient.id), {
      status: 'EM_TRATAMENTO',
      assignedStudentEmail: sanitizeString(params.studentEmail, 120),
      assignedProfessorEmail: sanitizeString(params.availability.professorEmail, 120),
    });

    // Queue confirmation notification
    const notifId = sanitizeId(`notif_${Date.now()}`);
    await setDoc(doc(db, 'notifications', notifId), {
      recipientName: sanitizeString(params.patient.name, 120),
      recipientContact: sanitizeString(params.patient.whatsapp || params.patient.phone, 120),
      type: 'CONFIRMACAO',
      channel: 'WHATSAPP_FILA',
      message: sanitizeString(
        `SIGCO UDF: Consulta agendada para ${params.date} às ${params.startTime} na ${params.availability.clinicName} (${params.availability.specialty}).`,
        1000
      ),
      status: 'PENDENTE',
      date: new Date().toISOString().slice(0, 10),
      institutionDomain: INSTITUTION_DOMAIN,
      createdByUid: currentUser.uid,
    });

    await recordAuditLog({
      uid: currentUser.uid,
      userName: currentUser.name,
      userEmail: currentUser.email,
      userRole: currentUser.role,
      action: 'AGENDAMENTO_CONSULTA',
      targetRecord: `Paciente: ${params.patient.name} (${params.date} ${params.startTime})`,
      operationSummary: `${currentUser.role} ${currentUser.name} agendou consulta para ${params.patient.name} com ${params.studentName} em ${params.date} às ${params.startTime}.`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// Register Attendance or Absence — Enforces Mandatory Backend Rule RN01 (2 Unjustified Absences)
export async function registerAttendanceAndEnforceRN01(
  params: {
    appointment: Appointment;
    patient: Patient;
    availability?: Availability;
    attendanceType: AttendanceType;
    justification: string;
  },
  currentUser: SystemUser
): Promise<{ triggeredProgramRemoval: boolean; alertMessage: string | null }> {
  // 1. Evaluate RN01 on Backend Server
  const evaluation = await evaluateAttendanceRuleOnServer({
    patientId: params.patient.id,
    patientName: params.patient.name,
    currentStatus: params.patient.status,
    currentUnjustifiedAbsences: params.patient.unjustifiedAbsences,
    attendanceType: params.attendanceType,
    currentUsedSlots: params.availability?.usedSlots ?? 1,
    recordedByEmail: currentUser.email,
    recordedByName: currentUser.name,
    recordedByRole: currentUser.role,
  });

  const attId = sanitizeId(`att_${Date.now()}`);
  const path = `attendance/${attId}`;
  const today = new Date().toISOString().slice(0, 10);

  const attendancePayload: Omit<AttendanceRecord, 'id'> = {
    appointmentId: params.appointment.id,
    patientId: params.patient.id,
    patientName: sanitizeString(params.patient.name, 120),
    date: today,
    type: params.attendanceType,
    justification: sanitizeString(
      params.justification ||
        (evaluation.triggeredProgramRemoval
          ? '2ª falta não justificada acumulada — RN01 aplicada automaticamente.'
          : 'Registro de frequência realizado.'),
      500
    ),
    triggeredProgramRemoval: evaluation.triggeredProgramRemoval,
    recordedByEmail: sanitizeString(currentUser.email, 120),
    institutionDomain: INSTITUTION_DOMAIN,
    createdByUid: currentUser.uid,
  };

  try {
    // 2. Persist Attendance Record
    await setDoc(doc(db, 'attendance', attId), attendancePayload);

    // 3. Update Appointment Status
    await updateDoc(doc(db, 'appointments', params.appointment.id), {
      status: evaluation.newAppointmentStatus,
      notes: sanitizeString(
        evaluation.triggeredProgramRemoval
          ? `${params.appointment.notes} | [RN01: Paciente desligado por 2ª falta não justificada]`
          : params.appointment.notes,
        1000
      ),
    });

    // 4. Update Patient Absences & Status (if RN01 triggered -> status becomes CANCELADO)
    await updateDoc(doc(db, 'patients', params.patient.id), {
      unjustifiedAbsences: evaluation.newUnjustifiedAbsences,
      status: evaluation.newPatientStatus,
      adminNotes: sanitizeString(
        evaluation.triggeredProgramRemoval
          ? `${params.patient.adminNotes} | [RN01 em ${today}: Retirado automaticamente do programa por acumular 2 faltas não justificadas. Vaga liberada.]`
          : params.patient.adminNotes,
        1000
      ),
    });

    // 5. Release clinic availability slot if RN01 triggered or appointment cancelled
    if (evaluation.releasedSlot && params.availability) {
      await updateDoc(doc(db, 'availability', params.availability.id), {
        usedSlots: evaluation.newUsedSlots,
      });
    }

    // 6. Alert Responsible Professional via Notification if RN01 triggered
    if (evaluation.triggeredProgramRemoval) {
      const notifId = sanitizeId(`notif_${Date.now()}`);
      await setDoc(doc(db, 'notifications', notifId), {
        recipientName: sanitizeString(params.appointment.professorName || 'Supervisor Clínico', 120),
        recipientContact: sanitizeString(params.appointment.professorEmail || currentUser.email, 120),
        type: 'ALERTA_FALTAS',
        channel: 'SISTEMA',
        message: sanitizeString(
          evaluation.alertMessage ||
            `RN01: Paciente ${params.patient.name} atingiu 2 faltas não justificadas, foi retirado do programa e a vaga foi liberada.`,
          1000
        ),
        status: 'PENDENTE',
        date: today,
        institutionDomain: INSTITUTION_DOMAIN,
        createdByUid: currentUser.uid,
      });
    }

    // 7. Record Immutable Audit Log (RN08)
    await recordAuditLog({
      uid: currentUser.uid,
      userName: currentUser.name,
      userEmail: currentUser.email,
      userRole: currentUser.role,
      action: evaluation.triggeredProgramRemoval ? 'REGRA_RN01_DESLIGAMENTO_AUTOMATICO' : `FREQUENCIA_${params.attendanceType}`,
      targetRecord: `Paciente: ${params.patient.name}`,
      operationSummary: evaluation.auditSummary,
    });

    return {
      triggeredProgramRemoval: evaluation.triggeredProgramRemoval,
      alertMessage: evaluation.alertMessage,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function removeWaitingListEntry(entryId: string, currentUser: SystemUser): Promise<void> {
  const path = `waiting_list/${entryId}`;
  try {
    await deleteDoc(doc(db, 'waiting_list', entryId));
    await recordAuditLog({
      uid: currentUser.uid,
      userName: currentUser.name,
      userEmail: currentUser.email,
      userRole: currentUser.role,
      action: 'REMOCAO_LISTA_ESPERA',
      targetRecord: `Fila ID: ${entryId}`,
      operationSummary: `${currentUser.role} ${currentUser.name} removeu registro da lista de espera.`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
