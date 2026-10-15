import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../services/firebase';
import {
  Anamnesis,
  Appointment,
  AttendanceRecord,
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
  WaitingListEntry,
} from '../types';
import { useAuth } from '../auth/AuthContext';
import { canUserViewPatient, INSTITUTION_DOMAIN } from '../utils/validation';
import { syncAuthorizedUsersOnServer } from '../api/clinicApi';
import { buildSeedData } from '../services/seedData';

interface ClinicDataContextValue {
  patients: Patient[];
  visiblePatients: Patient[];
  waitingList: WaitingListEntry[];
  screenings: Screening[];
  appointments: Appointment[];
  availabilities: Availability[];
  medicalRecords: MedicalRecord[];
  anamnesisList: Anamnesis[];
  evolutions: ClinicalEvolution[];
  procedures: Procedure[];
  odontograms: Odontogram[];
  referrals: Referral[];
  attendanceRecords: AttendanceRecord[];
  specialties: Specialty[];
  clinics: Clinic[];
  students: StudentProfile[];
  professors: ProfessorProfile[];
  notifications: NotificationItem[];
  auditLogs: AuditLog[];
  users: SystemUser[];
  dataLoading: boolean;
  updateWaitingListLocal: (id: string, updates: Partial<WaitingListEntry>) => void;
  removeWaitingListLocal: (id: string) => void;
  addWaitingListLocal: (entry: WaitingListEntry) => void;
}

const ClinicDataContext = createContext<ClinicDataContextValue | undefined>(undefined);

export const ClinicDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { systemUser, firebaseUser } = useAuth();

  const [patients, setPatients] = useState<Patient[]>([]);
  const [waitingList, setWaitingList] = useState<WaitingListEntry[]>([]);
  const [screenings, setScreenings] = useState<Screening[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [availabilities, setAvailabilities] = useState<Availability[]>([]);
  const [medicalRecords, setMedicalRecords] = useState<MedicalRecord[]>([]);
  const [anamnesisList, setAnamnesisList] = useState<Anamnesis[]>([]);
  const [evolutions, setEvolutions] = useState<ClinicalEvolution[]>([]);
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [odontograms, setOdontograms] = useState<Odontogram[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [professors, setProfessors] = useState<ProfessorProfile[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [dataLoading, setDataLoading] = useState<boolean>(true);

  const updateWaitingListLocal = React.useCallback(
    (id: string, updates: Partial<WaitingListEntry>) => {
      setWaitingList((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
      );
    },
    []
  );

  const removeWaitingListLocal = React.useCallback((id: string) => {
    setWaitingList((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const addWaitingListLocal = React.useCallback((entry: WaitingListEntry) => {
    setWaitingList((prev) => [...prev, entry]);
  }, []);

  useEffect(() => {
    if (!firebaseUser) {
      if (systemUser) {
        // No modo de desenvolvimento direto sem login: carrega dados de demonstração locais
        // para permitir revisar e testar imediatamente todas as telas e funcionalidades.
        const seed = buildSeedData(systemUser.uid);
        setPatients(seed.patients);
        setWaitingList(seed.waitingList);
        setScreenings(seed.screenings);
        setAppointments(seed.appointments);
        setAvailabilities(seed.availabilities);
        setMedicalRecords(seed.medicalRecords);
        setAnamnesisList(seed.anamnesisList);
        setEvolutions(seed.evolutions);
        setProcedures(seed.procedures);
        setOdontograms(seed.odontograms);
        setReferrals(seed.referrals);
        setAttendanceRecords(seed.attendanceRecords);
        setSpecialties(seed.specialties);
        setClinics(seed.clinics);
        setStudents(seed.students);
        setProfessors(seed.professors);
        setNotifications(seed.notifications);
        setAuditLogs(seed.auditLogs);
        setUsers(seed.seedUsers);
      }
      setDataLoading(false);
      return;
    }

    if (!systemUser) {
      setDataLoading(false);
      return;
    }

    setDataLoading(true);
    const unsubs: (() => void)[] = [];

    function subscribeCollection<T>(
      colName: string,
      setter: React.Dispatch<React.SetStateAction<T[]>>,
      onReady?: () => void
    ) {
      const q = query(collection(db, colName), where('institutionDomain', '==', INSTITUTION_DOMAIN));
      const unsub = onSnapshot(
        q,
        (snapshot) => {
          const items = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as T[];
          setter(items);
          if (onReady) onReady();
        },
        (error) => {
          try {
            handleFirestoreError(error, OperationType.LIST, colName);
          } catch {
            // Handled and logged
          }
        }
      );
      unsubs.push(unsub);
    }

    subscribeCollection<Patient>('patients', setPatients, () => setDataLoading(false));
    subscribeCollection<WaitingListEntry>('waiting_list', setWaitingList);
    subscribeCollection<Screening>('screenings', setScreenings);
    subscribeCollection<Appointment>('appointments', setAppointments);
    subscribeCollection<Availability>('availability', setAvailabilities);
    subscribeCollection<MedicalRecord>('medical_records', setMedicalRecords);
    subscribeCollection<Anamnesis>('anamnesis', setAnamnesisList);
    subscribeCollection<ClinicalEvolution>('clinical_evolution', setEvolutions);
    subscribeCollection<Procedure>('procedures', setProcedures);
    subscribeCollection<Odontogram>('odontograms', setOdontograms);
    subscribeCollection<Referral>('referrals', setReferrals);
    subscribeCollection<AttendanceRecord>('attendance', setAttendanceRecords);
    subscribeCollection<Specialty>('specialties', setSpecialties);
    subscribeCollection<Clinic>('clinics', setClinics);
    subscribeCollection<StudentProfile>('students', setStudents);
    subscribeCollection<ProfessorProfile>('professors', setProfessors);
    subscribeCollection<NotificationItem>('notifications', setNotifications);
    subscribeCollection<AuditLog>('audit_logs', setAuditLogs);
    subscribeCollection<SystemUser>('users', setUsers);

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [firebaseUser, systemUser?.uid]);

  useEffect(() => {
    if (users.length > 0) {
      syncAuthorizedUsersOnServer(
        users.map((u) => ({ email: u.email, active: u.active !== false }))
      );
    }
  }, [users]);

  // Enforce RBAC visibility rules (RN03, RN06, RN07):
  // - ALUNO only sees patients assigned to them
  // - RECEPCAO never receives medical_records, anamnesis, clinical_evolution, or odontograms
  const visiblePatients = React.useMemo(() => {
    if (!systemUser) return [];
    return patients
      .filter((p) => p.status !== 'EXCLUIDO')
      .filter((p) => canUserViewPatient(systemUser.role, systemUser.email, p));
  }, [patients, systemUser]);

  const filteredMedicalRecords = React.useMemo(() => {
    if (!systemUser || systemUser.role === 'RECEPCAO') return [];
    if (systemUser.role === 'ALUNO') {
      return medicalRecords.filter(
        (r) => r.responsibleStudentEmail.toLowerCase() === systemUser.email.toLowerCase()
      );
    }
    return medicalRecords;
  }, [medicalRecords, systemUser]);

  const filteredAnamnesis = React.useMemo(() => {
    if (!systemUser || systemUser.role === 'RECEPCAO') return [];
    if (systemUser.role === 'ALUNO') {
      const allowedPatientIds = new Set(visiblePatients.map((p) => p.id));
      return anamnesisList.filter((a) => allowedPatientIds.has(a.patientId));
    }
    return anamnesisList;
  }, [anamnesisList, visiblePatients, systemUser]);

  const filteredEvolutions = React.useMemo(() => {
    if (!systemUser || systemUser.role === 'RECEPCAO') return [];
    if (systemUser.role === 'ALUNO') {
      return evolutions.filter(
        (e) =>
          e.studentEmail.toLowerCase() === systemUser.email.toLowerCase() ||
          visiblePatients.some((p) => p.id === e.patientId)
      );
    }
    return evolutions;
  }, [evolutions, visiblePatients, systemUser]);

  const filteredOdontograms = React.useMemo(() => {
    if (!systemUser || systemUser.role === 'RECEPCAO') return [];
    if (systemUser.role === 'ALUNO') {
      const allowedPatientIds = new Set(visiblePatients.map((p) => p.id));
      return odontograms.filter((o) => allowedPatientIds.has(o.patientId));
    }
    return odontograms;
  }, [odontograms, visiblePatients, systemUser]);

  // Synthesize users list from active profiles + students + professors + reception/triage/admin
  const synthesizedUsers = React.useMemo<SystemUser[]>(() => {
    const base: SystemUser[] = [
      {
        id: 'usr_admin',
        uid: 'usr_admin',
        name: 'Coord. Roberto Mendes',
        email: 'administrador@cs.udf.edu.br',
        role: 'ADMIN',
        registrationCode: 'ADM-001',
        specialty: 'Gestão Clínica Geral',
        active: true,
        institutionDomain: 'cs.udf.edu.br',
        createdByUid: systemUser?.uid || 'system',
      },
      {
        id: 'usr_rec1',
        uid: 'usr_rec1',
        name: 'Camila Andrade',
        email: 'recepcao@cs.udf.edu.br',
        role: 'RECEPCAO',
        registrationCode: 'REC-102',
        specialty: 'Atendimento e Recepção',
        active: true,
        institutionDomain: 'cs.udf.edu.br',
        createdByUid: systemUser?.uid || 'system',
      },
      {
        id: 'usr_rec2',
        uid: 'usr_rec2',
        name: 'Fernanda Atendimento',
        email: 'recepcao.fernanda@cs.udf.edu.br',
        role: 'RECEPCAO',
        registrationCode: 'REC-105',
        specialty: 'Atendimento e Recepção',
        active: true,
        institutionDomain: 'cs.udf.edu.br',
        createdByUid: systemUser?.uid || 'system',
      },
      {
        id: 'usr_tri1',
        uid: 'usr_tri1',
        name: 'Dra. Patrícia Lima',
        email: 'triagem@cs.udf.edu.br',
        role: 'TRIAGEM',
        registrationCode: 'CRO-DF-9410',
        specialty: 'Triagem e Diagnóstico',
        active: true,
        institutionDomain: 'cs.udf.edu.br',
        createdByUid: systemUser?.uid || 'system',
      },
    ];

    const profUsers: SystemUser[] = professors.map((p) => ({
      id: p.id,
      uid: p.id,
      name: p.name,
      email: p.email,
      role: 'PROFESSOR',
      registrationCode: p.cro,
      specialty: p.specialty,
      active: p.active,
      institutionDomain: 'cs.udf.edu.br',
      createdByUid: p.createdByUid,
    }));

    const stuUsers: SystemUser[] = students.map((s) => ({
      id: s.id,
      uid: s.id,
      name: s.name,
      email: s.email,
      role: 'ALUNO',
      registrationCode: `MAT-${s.enrollmentNumber}`,
      specialty: s.specialtyClinic,
      active: s.active,
      institutionDomain: 'cs.udf.edu.br',
      createdByUid: s.createdByUid,
    }));

    return [...base, ...profUsers, ...stuUsers];
  }, [professors, students, systemUser?.uid]);

  return (
    <ClinicDataContext.Provider
      value={{
        patients,
        visiblePatients,
        waitingList,
        screenings,
        appointments,
        availabilities,
        medicalRecords: filteredMedicalRecords,
        anamnesisList: filteredAnamnesis,
        evolutions: filteredEvolutions,
        procedures,
        odontograms: filteredOdontograms,
        referrals,
        attendanceRecords,
        specialties,
        clinics,
        students,
        professors,
        notifications,
        auditLogs,
        users: users.length > 0 ? users : synthesizedUsers,
        dataLoading,
        updateWaitingListLocal,
        removeWaitingListLocal,
        addWaitingListLocal,
      }}
    >
      {children}
    </ClinicDataContext.Provider>
  );
};

export function useClinicData(): ClinicDataContextValue {
  const ctx = useContext(ClinicDataContext);
  if (!ctx) {
    throw new Error('useClinicData must be used within a ClinicDataProvider');
  }
  return ctx;
}
